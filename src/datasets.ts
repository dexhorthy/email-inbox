import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import type { gmail_v1 } from "googleapis"

export interface ProcessingContext {
  rules_version: string
  model_version: string
  processing_timestamp: string
}

export interface EmailDataPoint {
  id: string
  timestamp: string
  content_hash: string
  processing_context: ProcessingContext
  envelope: {
    subject?: string
    from?: string
    date?: string
    messageId: string
  }
  content: {
    text: string
    html: string
    markdown: string
  }
  spam_analysis: {
    is_spam: boolean
    high_confidence: boolean
    spam_rules_matched: string[]
    spammy_qualities: string[]
  }
  human_interaction?: {
    timestamp: string
    approved: boolean
    feedback?: string
    updated_ruleset?: string
  }
  final_classification: {
    category:
      | "spam"
      | "read_today"
      | "read_later"
      | "notify_immediately"
      | "draft_reply"
    summary?: string
    message?: string
  }
  labels_applied: string[]
}

export interface RunMetadata {
  run_id: string
  timestamp: string
  processing_context: ProcessingContext
  email_count: number
  classification_summary: {
    spam: number
    read_today: number
    read_later: number
    notify_immediately: number
    draft_reply: number
  }
}

export interface EmailProcessingRun {
  id: string
  email_id: string
  email_hash: string
  timestamp: string
  run_id: string
  spam_analysis: any
  human_interaction?: any
  final_classification: any
  labels_applied: string[]
  rules_version: string
  model_version: string
}

export interface GlobalIndex {
  total_runs: number
  total_emails: number
  latest_run_id: string
  runs: string[]
}

export function generateContentHash(
  subject: string,
  from: string,
  body: string,
): string {
  const content = `${subject || ""}|${from || ""}|${body || ""}`
  return crypto
    .createHash("sha256")
    .update(content)
    .digest("hex")
    .substring(0, 16)
}

export function getCurrentRulesVersion(): string {
  try {
    const rulesPath = path.join(process.cwd(), "src", "rules.txt")
    const stats = require("node:fs").statSync(rulesPath)
    return stats.mtime.toISOString()
  } catch {
    return new Date().toISOString()
  }
}

export function getModelVersion(): string {
  return "gpt-4o-2024"
}

export class DatasetManager {
  private datasetsDir: string
  private currentRunDir: string
  private currentRunId: string

  constructor() {
    this.datasetsDir = path.join(process.cwd(), "datasets")
    this.currentRunDir = ""
    this.currentRunId = ""
  }

  async startNewRun(): Promise<string> {
    await fs.mkdir(this.datasetsDir, { recursive: true })
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const runId = `run-${timestamp}`
    this.currentRunId = runId
    this.currentRunDir = path.join(this.datasetsDir, "runs", runId)
    await fs.mkdir(this.currentRunDir, { recursive: true })
    await fs.mkdir(path.join(this.currentRunDir, "emails"), {
      recursive: true,
    })

    const metadata: RunMetadata = {
      run_id: runId,
      timestamp: new Date().toISOString(),
      processing_context: {
        rules_version: getCurrentRulesVersion(),
        model_version: getModelVersion(),
        processing_timestamp: new Date().toISOString(),
      },
      email_count: 0,
      classification_summary: {
        spam: 0,
        read_today: 0,
        read_later: 0,
        notify_immediately: 0,
        draft_reply: 0,
      },
    }

    await fs.writeFile(
      path.join(this.currentRunDir, "meta.json"),
      JSON.stringify(metadata, null, 2),
    )

    await fs.mkdir(path.join(this.datasetsDir, "emails", "by-hash"), {
      recursive: true,
    })
    await fs.mkdir(path.join(this.datasetsDir, "emails", "by-message-id"), {
      recursive: true,
    })

    return runId
  }

  async saveEmailData(emailData: EmailDataPoint): Promise<void> {
    if (!this.currentRunDir) {
      throw new Error("No run started. Call startNewRun() first.")
    }

    const filename = `${emailData.id}.json`
    const filepath = path.join(this.currentRunDir, "emails", filename)
    await fs.writeFile(filepath, JSON.stringify(emailData, null, 2))

    await this.createEmailIndex(emailData)
    await this.updateGlobalIndex()
  }

  async loadEmailData(
    runId: string,
    emailId: string,
  ): Promise<EmailDataPoint | null> {
    const filepath = path.join(
      this.datasetsDir,
      "runs",
      runId,
      "emails",
      `${emailId}.json`,
    )
    try {
      const data = await fs.readFile(filepath, "utf8")
      return JSON.parse(data)
    } catch {
      return null
    }
  }

  async listRuns(): Promise<string[]> {
    try {
      const runsDir = path.join(this.datasetsDir, "runs")
      const entries = await fs.readdir(runsDir, {
        withFileTypes: true,
      })
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
    } catch {
      return []
    }
  }

  async getRunSummary(
    runId: string,
  ): Promise<{ total: number; spam: number; notSpam: number }> {
    const runDir = path.join(this.datasetsDir, "runs", runId, "emails")
    try {
      const files = await fs.readdir(runDir)
      const jsonFiles = files.filter((f) => f.endsWith(".json"))

      let spam = 0
      let notSpam = 0

      for (const file of jsonFiles) {
        const data = await this.loadEmailData(runId, file.replace(".json", ""))
        if (data) {
          if (data.final_classification.category === "spam") {
            spam++
          } else {
            notSpam++
          }
        }
      }

      return { total: jsonFiles.length, spam, notSpam }
    } catch {
      return { total: 0, spam: 0, notSpam: 0 }
    }
  }

  async createEmailIndex(emailData: EmailDataPoint): Promise<void> {
    const hashIndexPath = path.join(
      this.datasetsDir,
      "emails",
      "by-hash",
      `${emailData.content_hash}.json`,
    )
    const messageIdIndexPath = path.join(
      this.datasetsDir,
      "emails",
      "by-message-id",
      `${emailData.envelope.messageId}.json`,
    )

    const runEntry = {
      run_id: this.currentRunId,
      email_id: emailData.id,
      timestamp: emailData.timestamp,
      rules_version: emailData.processing_context.rules_version,
      model_version: emailData.processing_context.model_version,
    }

    try {
      const existingHash = await fs.readFile(hashIndexPath, "utf8")
      const hashData = JSON.parse(existingHash)
      hashData.runs.push(runEntry)
      await fs.writeFile(hashIndexPath, JSON.stringify(hashData, null, 2))
    } catch {
      const newHashData = {
        content_hash: emailData.content_hash,
        first_seen: emailData.timestamp,
        runs: [runEntry],
      }
      await fs.writeFile(hashIndexPath, JSON.stringify(newHashData, null, 2))
    }

    try {
      const existingMessage = await fs.readFile(messageIdIndexPath, "utf8")
      const messageData = JSON.parse(existingMessage)
      messageData.runs.push(runEntry)
      await fs.writeFile(
        messageIdIndexPath,
        JSON.stringify(messageData, null, 2),
      )
    } catch {
      const newMessageData = {
        message_id: emailData.envelope.messageId,
        first_seen: emailData.timestamp,
        runs: [runEntry],
      }
      await fs.writeFile(
        messageIdIndexPath,
        JSON.stringify(newMessageData, null, 2),
      )
    }
  }

  async updateGlobalIndex(): Promise<void> {
    const indexPath = path.join(this.datasetsDir, "index.json")
    const runs = await this.listRuns()

    let totalEmails = 0
    for (const runId of runs) {
      const summary = await this.getRunSummary(runId)
      totalEmails += summary.total
    }

    const globalIndex: GlobalIndex = {
      total_runs: runs.length,
      total_emails: totalEmails,
      latest_run_id: runs[runs.length - 1] || "",
      runs,
    }

    await fs.writeFile(indexPath, JSON.stringify(globalIndex, null, 2))
  }

  async findEmailsByHash(contentHash: string): Promise<EmailProcessingRun[]> {
    const hashIndexPath = path.join(
      this.datasetsDir,
      "emails",
      "by-hash",
      `${contentHash}.json`,
    )
    try {
      const data = await fs.readFile(hashIndexPath, "utf8")
      const hashData = JSON.parse(data)
      return hashData.runs.map((run: any) => ({
        ...run,
        email_hash: contentHash,
      }))
    } catch {
      return []
    }
  }

  async getEmailHistory(emailId: string): Promise<EmailProcessingRun[]> {
    const messageIdIndexPath = path.join(
      this.datasetsDir,
      "emails",
      "by-message-id",
      `${emailId}.json`,
    )
    try {
      const data = await fs.readFile(messageIdIndexPath, "utf8")
      const messageData = JSON.parse(data)
      return messageData.runs.map((run: any) => ({
        ...run,
        email_hash: messageData.content_hash || "",
      }))
    } catch {
      return []
    }
  }

  async createRunSummary(): Promise<void> {
    if (!this.currentRunDir) return

    const emailsDir = path.join(this.currentRunDir, "emails")
    const files = await fs.readdir(emailsDir)
    const jsonFiles = files.filter((f) => f.endsWith(".json"))

    const summary = {
      total_emails: jsonFiles.length,
      processed_at: new Date().toISOString(),
      run_id: this.currentRunId,
    }

    await fs.writeFile(
      path.join(this.currentRunDir, "summary.json"),
      JSON.stringify(summary, null, 2),
    )
  }
}
