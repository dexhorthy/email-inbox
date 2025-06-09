import fs from "node:fs/promises"
import path from "node:path"

export interface EmailClassification {
  timestamp: string
  run_id: string
  result:
    | "spam"
    | "read_today"
    | "read_later"
    | "notify_immediately"
    | "draft_reply"
    | "try_unsubscribe"
  is_spam: boolean
  rules_version: string
  model_version: string
}

export interface EmailRecord {
  message_id: string
  subject?: string
  from?: string
  markdown?: string
  first_seen: string
  classifications: EmailClassification[]
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

export class SimpleDatasetManager {
  private datasetsDir: string
  private currentRunId: string

  constructor() {
    this.datasetsDir = path.join(process.cwd(), "datasets")
    this.currentRunId = ""
  }

  async startNewRun(): Promise<string> {
    await fs.mkdir(this.datasetsDir, { recursive: true })
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const runId = `run-${timestamp}`
    this.currentRunId = runId
    return runId
  }

  async saveEmailClassification(
    messageId: string,
    subject: string | undefined,
    from: string | undefined,
    isSpam: boolean,
    finalClassification: string,
    markdown?: string,
  ): Promise<void> {
    const filePath = path.join(this.datasetsDir, `${messageId}.json`)

    const classification: EmailClassification = {
      timestamp: new Date().toISOString(),
      run_id: this.currentRunId,
      result: finalClassification as any,
      is_spam: isSpam,
      rules_version: getCurrentRulesVersion(),
      model_version: getModelVersion(),
    }

    try {
      // Load existing record
      const existingData = await fs.readFile(filePath, "utf8")
      const record: EmailRecord = JSON.parse(existingData)
      record.classifications.push(classification)
      await fs.writeFile(filePath, JSON.stringify(record, null, 2))
    } catch {
      // Create new record
      const record: EmailRecord = {
        message_id: messageId,
        subject,
        from,
        markdown,
        first_seen: classification.timestamp,
        classifications: [classification],
      }
      await fs.writeFile(filePath, JSON.stringify(record, null, 2))
    }
  }

  async getEmailRecord(messageId: string): Promise<EmailRecord | null> {
    const filePath = path.join(this.datasetsDir, `${messageId}.json`)
    try {
      const data = await fs.readFile(filePath, "utf8")
      return JSON.parse(data)
    } catch {
      return null
    }
  }

  async getAllEmails(): Promise<EmailRecord[]> {
    try {
      const files = await fs.readdir(this.datasetsDir)
      const jsonFiles = files.filter(
        (f) => f.endsWith(".json") && f !== "index.json",
      )

      const records: EmailRecord[] = []
      for (const file of jsonFiles) {
        const data = await fs.readFile(
          path.join(this.datasetsDir, file),
          "utf8",
        )
        records.push(JSON.parse(data))
      }
      return records
    } catch {
      return []
    }
  }

  async findDrift(): Promise<EmailRecord[]> {
    const emails = await this.getAllEmails()
    return emails.filter((email) => {
      const results = email.classifications.map((c) => c.result)
      const uniqueResults = new Set(results)
      return uniqueResults.size > 1 // More than one unique result = drift
    })
  }
}
