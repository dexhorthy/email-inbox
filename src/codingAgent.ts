import { b, DoneForNow, EnvVar, ExecuteCode, ClarificationRequest, RequestNewEnvVar } from "@/baml_client"
import { loadRules } from "./handleEmail"

type Event = {
  type: string
  data: any
}

function  stringifySimple(event: Event) {
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
  return lines.join('\n')
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
    return `<${event.data.intent}>
    ${stringifySimple(event)}
    </${event.data.intent}>`
  }

}

type EnvVarValue = EnvVar & {value : string}

class EnvVarStore {
  envVars: { [key: string]: EnvVarValue }
  constructor(envVars: EnvVarValue[]) {
    this.envVars = envVars.reduce((acc, envVar) => {
      acc[envVar.name] = envVar
      return acc
    }, {} as { [key: string]: EnvVarValue })
  }

  getEnvVar(name: string): string | undefined {
    return this.envVars[name]?.value
  }

  getEnvVarsForLLM(): EnvVar[] {
    return Object.values(this.envVars).map(envVar => ({
      name: envVar.name,
      description: envVar.description,
    }))
  }
}

class CodeExecutor {
  envVars: EnvVarStore
  constructor(envVars: EnvVarStore) {
    this.envVars = envVars
  }

  async executeCode(nextStep: ExecuteCode): Promise<string> {
    const envVars = nextStep.env_vars.map(name => this.envVars.getEnvVar(name))
    //
    return ""
  }
}

  // assemble env vars from availableEnvVars

async function handleNextStep(nextStep: ExecuteCode, codeExecutor: CodeExecutor, thread: Thread): Promise<Thread> {
  switch (nextStep.intent) {
    case "execute_code":
      const result = await codeExecutor.executeCode(nextStep)
      thread.addEvent({
        type: "execution_result",
        data: result,
      })
      return thread
  }
}

type CodingTools = ExecuteCode | RequestNewEnvVar
type HumanTools = DoneForNow | ClarificationRequest

async function agentLoop(thread: Thread, rules: string, envVars: EnvVarStore, codeExecutor: CodeExecutor): Promise<Thread> {
  while (true) {
    const nextStep: CodingTools | HumanTools = await b.CodingAgentDetermineNextStep(
      thread.serializeForLLM(),
      rules,
      envVars.getEnvVarsForLLM(),
    )

    thread.addEvent({
      type: "agent_response",
      data: nextStep,
    })

    switch (nextStep.intent) {
      case "request_more_information":
      case "done_for_now":
      case "request_new_env_var":
        // todo - contact human for env var
        return thread;
      case "execute_code":
        const result = await handleNextStep(nextStep, codeExecutor, thread)
        return thread;
    }
  }
}

if (require.main === module) {
  const fakeEnvVars = new EnvVarStore([{
    name: "GOOGLE_CALENDAR_TOKENS_JSON_BASE64_ENCODED",
    description: "The base64 encoded json string of the google calendar tokens",
    value: "fake",
  }])
  const codeExecutor = new CodeExecutor(fakeEnvVars)

  const thread = new Thread([{
    type: "initial_email",
    data: {
      subject: "Re: Meeting request for project discussion",
      from: "colleague@company.com",
      body: "Great, I'm good to go for thursday at 2pm.",
    },
  }, {
    type: "classifier_response",
    data: {
      classification: "execute_code",
      instructions: `A meeting is confirmed for Thursday at 2pm, 
      as indicated in the email. Add this event to the calendar and notify both 
      parties about the updated schedule. No need to send a calendar link since 
      the meeting details have been agreed upon. Include details from the email, 
      such as the discussion for the launch next Monday.`,
    },
  }])
  const rules = await loadRules()
  const nextStep = await agentLoop(thread, rules, fakeEnvVars, codeExecutor)
  console.log(nextStep)
}
