import {
  type ClarificationRequest,
  type DoneForNow,
  type EnvVar,
  type ExecuteCode,
  type RequestNewEnvVar,
  b,
} from "@/baml_client"
import chalk from "chalk"
import { highlight } from "cli-highlight"
import { FreestyleSandboxes } from "freestyle-sandboxes"
import { loadRules } from "./handleEmail"

export function extractImports(code: string): string[] {
  const importRegex = /import\s+.*?\s+from\s+["']([^"']+)["']/g
  const imports: string[] = []
  let match: RegExpExecArray | null = importRegex.exec(code)

  while (match !== null) {
    const importPath = match[1]
    // Skip relative imports (starting with . or /)
    if (!importPath.startsWith(".") && !importPath.startsWith("/")) {
      // Extract package name (handle scoped packages like @scope/package)
      const packageName = importPath.startsWith("@")
        ? importPath.split("/").slice(0, 2).join("/")
        : importPath.split("/")[0]
      imports.push(packageName)
    }
    match = importRegex.exec(code)
  }

  return [...new Set(imports)] // Remove duplicates
}

export function validateImports(
  code: string,
  allowedPackages: { name: string; version: string }[],
): { valid: boolean; errors: string[] } {
  const extractedImports = extractImports(code)
  const allowedPackageNames = new Set(allowedPackages.map((pkg) => pkg.name))
  const errors: string[] = []

  for (const importName of extractedImports) {
    if (!allowedPackageNames.has(importName)) {
      errors.push(
        `Import '${importName}' is not in the packages list. Add it to packages or remove the import.`,
      )
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

function formatCurrentDateTime(): string {
  return new Date()
    .toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
      weekday: "long",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    })
    .replace(/(\d+)\/(\d+)\/(\d+)/, "$3-$1-$2")
}

type Event = {
  type: string
  data: any
}

function stringifySimple(event: Event) {
  // Convert event to YAML-like string format
  const lines = []
  for (const [key, value] of Object.entries(event.data)) {
    if (key !== "intent") {
      if (typeof value === "string") {
        lines.push(`  ${key}: ${value}`)
      } else {
        lines.push(`  ${key}: ${JSON.stringify(value)}`)
      }
    }
  }
  return lines.join("\n")
}

class Thread {
  events: Event[]
  constructor(events: Event[]) {
    this.events = events
  }

  addEvent(event: Event) {
    this.events.push(event)
  }

  getLastEvent() {
    return this.events[this.events.length - 1]
  }

  serializeForLLM() {
    return this.events.map(this.serializeOneEvent).join("\n")
  }

  serializeOneEvent(event: Event) {
    const tagName = event.data.intent || event.type
    return `<${tagName}>
    ${stringifySimple(event)}
    </${tagName}>`
  }
}

type EnvVarValue = EnvVar & { value: string }

class EnvVarStore {
  envVars: { [key: string]: EnvVarValue }
  constructor(envVars: EnvVarValue[]) {
    this.envVars = envVars.reduce(
      (acc, envVar) => {
        acc[envVar.name] = envVar
        return acc
      },
      {} as { [key: string]: EnvVarValue },
    )
  }

  getEnvVar(name: string): string | undefined {
    return this.envVars[name]?.value
  }

  getEnvVarsForLLM(): EnvVar[] {
    return Object.values(this.envVars).map((envVar) => ({
      name: envVar.name,
      description: envVar.description,
    }))
  }
}

class CodeExecutor {
  envVars: EnvVarStore
  freestyleApi: FreestyleSandboxes

  constructor(envVars: EnvVarStore) {
    this.envVars = envVars
    this.freestyleApi = new FreestyleSandboxes({
      apiKey: process.env.FREESTYLE_API_KEY!,
    })
  }

  async executeCode(nextStep: ExecuteCode): Promise<string> {
    try {
      const envVarsObj = nextStep.env_vars.reduce(
        (acc, name) => {
          const value = this.envVars.getEnvVar(name)
          if (value) {
            acc[name] = value
          }
          return acc
        },
        {} as Record<string, string>,
      )

      const nodeModules = nextStep.packages.reduce(
        (acc, pkg) => {
          acc[pkg.name] = pkg.version
          return acc
        },
        {} as Record<string, string>,
      )

      const result = await this.freestyleApi.executeScript(nextStep.code, {
        envVars: envVarsObj,
        nodeModules:
          Object.keys(nodeModules).length > 0 ? nodeModules : undefined,
      })

      return JSON.stringify(result, null, 2)
    } catch (error) {
      return `Error executing code: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

type Approval = {
  approved: boolean
  comment?: string
}

async function approveCLI(message: string): Promise<Approval> {
  const readline = require("node:readline").createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    readline.question(`${message}\n> `, (answer: string) => {
      readline.close()
      // If the answer is empty (just pressed enter), treat it as approval
      if (answer.trim() === "") {
        resolve({ approved: true })
      } else {
        // Any non-empty response is treated as rejection with feedback
        resolve({ approved: false, comment: answer })
      }
    })
  })
}

function printCodeWithSyntaxHighlighting(code: ExecuteCode) {
  // Print packages and env vars if present
  if ("packages" in code) {
    console.log("\n📦 Packages:")
    code.packages.forEach(({ name, version }) => {
      console.log(
        chalk.blue(`  ${name}`) + chalk.gray("@") + chalk.green(version),
      )
    })
  }
  // print env vars
  if ("env_vars" in code) {
    console.log("\n🔐 Environment Variables:")
    code.env_vars.forEach((envVar: string) => {
      console.log(chalk.cyan(`  ${envVar}`))
    })
  }

  // Use cli-highlight for robust syntax highlighting
  console.log(
    highlight(code.code, { language: "javascript", ignoreIllegals: true }),
  )
}

async function handleNextStep(
  nextStep: ExecuteCode,
  codeExecutor: CodeExecutor,
  thread: Thread,
): Promise<Thread> {
  switch (nextStep.intent) {
    case "execute_code": {
      // Validate imports before execution
      const validation = validateImports(nextStep.code, nextStep.packages)
      if (!validation.valid) {
        console.log(chalk.red("❌ Import validation failed:"))
        validation.errors.forEach((error) =>
          console.log(chalk.red(`  • ${error}`)),
        )

        // Add validation error to thread to give LLM feedback
        const errorMessage = `Import validation failed:\n${validation.errors.join("\n")}`
        thread.addEvent({
          type: "validation_error",
          data: {
            intent: "validation_error",
            error: errorMessage,
            suggested_fix:
              "Please add the missing packages to the packages array or remove the unused imports from your code.",
          },
        })
        return thread
      }

      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
      console.log(chalk.blue(nextStep.thought))
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
      printCodeWithSyntaxHighlighting(nextStep)
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
      const approval = await approveCLI(
        "ENTER to accept, anything else to reject",
      )
      const result = await codeExecutor.executeCode(nextStep)
      thread.addEvent({
        type: "execution_result",
        data: {
          intent: "execution_result",
          result: result,
        },
      })
      console.log("execution_result", result)
      return thread
    }
  }
}

type CodingTools = ExecuteCode | RequestNewEnvVar
type HumanTools = DoneForNow | ClarificationRequest

async function agentLoop(
  thread: Thread,
  rules: string,
  envVars: EnvVarStore,
  codeExecutor: CodeExecutor,
): Promise<Thread> {
  while (true) {
    const nextStep: CodingTools | HumanTools =
      await b.CodingAgentDetermineNextStep(
        thread.serializeForLLM(),
        rules,
        envVars.getEnvVarsForLLM(),
        formatCurrentDateTime(),
      )
    console.log("nextStep", nextStep)

    thread.addEvent({
      type: "agent_response",
      data: nextStep,
    })

    switch (nextStep.intent) {
      case "request_more_information":
      case "done_for_now":
      case "request_new_env_var":
        // todo - contact human for env var
        return thread
      case "execute_code":
        thread = await handleNextStep(nextStep, codeExecutor, thread)
    }
  }
}

if (require.main === module) {
  const fakeEnvVars = new EnvVarStore([
    {
      name: "GOOGLE_CALENDAR_TOKENS_JSON_BASE64_ENCODED",
      description:
        "The base64 encoded json string of the google calendar tokens",
      value: Buffer.from(
        require("node:fs").readFileSync("gmail_token.json", "utf-8"),
      ).toString("base64"),
    },
  ])
  const codeExecutor = new CodeExecutor(fakeEnvVars)

  let thread = new Thread([
    {
      type: "initial_email",
      data: {
        subject: "Re: Meeting request for project discussion",
        from: "colleague@company.com",
        body: "Great, I'm good to go for thursday at 2pm.",
      },
    },
    {
      type: "classifier_response",
      data: {
        classification: "execute_code",
        instructions: `A meeting is confirmed for Thursday at 2pm, 
      as indicated in the email. Add this event to the calendar and notify both 
      parties about the updated schedule. No need to send a calendar link since 
      the meeting details have been agreed upon. Include details from the email, 
      such as the discussion for the launch next Monday.`,
      },
    },
  ])
  const rules = await loadRules()
  thread = await agentLoop(thread, rules, fakeEnvVars, codeExecutor)
  console.log(thread.serializeForLLM())
}
