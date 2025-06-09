import fs from "node:fs/promises"
import type { gmail_v1 } from "googleapis"
import { google } from "googleapis"
import { b } from "../baml_client"
import { checkWithHuman } from "./checkWithHuman"
import { contactHuman, getDraftFeedback } from "./contactHuman"
import { SimpleDatasetManager } from "./datasets-simple"
import {
  convertToMarkdown,
  createGmailClient,
  parseEmailBody,
} from "./emailParser"

// Interfaces for dependency injection
export interface EmailFetcher {
  fetchEmail(): Promise<gmail_v1.Schema$Message>
}

export interface RulesManager {
  loadRules(): Promise<string>
  saveRules(rules: string): Promise<void>
}

export interface GmailLabeler {
  labelEmail(messageId: string, labelName: "SPAM" | string): Promise<void>
}

export interface HumanApprover {
  checkWithHuman(params: {
    from: string
    subject: string
    body: string
    proposedClassification: any
    existingRuleset: string
  }): Promise<{ updatedRuleset?: string; approved: boolean }>
}

export interface DatasetWriter {
  startNewRun(): Promise<string>
  saveEmailClassification(
    messageId: string,
    subject: string | undefined,
    from: string | undefined,
    isSpam: boolean,
    finalClassification: string,
    markdown?: string,
  ): Promise<void>
}

// Implementations
export class MessageIdEmailFetcher implements EmailFetcher {
  constructor(
    private gmail: gmail_v1.Gmail,
    private messageId: string,
  ) {}

  async fetchEmail(): Promise<gmail_v1.Schema$Message> {
    const email = await this.gmail.users.messages.get({
      userId: "me",
      id: this.messageId,
    })
    return { id: this.messageId, ...email.data }
  }
}

export class LastEmailFetcher implements EmailFetcher {
  constructor(
    private gmail: gmail_v1.Gmail,
    private count = 1,
  ) {}

  async fetchEmail(): Promise<gmail_v1.Schema$Message> {
    const response = await this.gmail.users.messages.list({
      userId: "me",
      maxResults: this.count,
    })
    const messages = response.data.messages || []
    if (messages.length === 0) {
      throw new Error("No emails found")
    }
    return messages[0]
  }
}

export class RealGmailLabeler implements GmailLabeler {
  constructor(private gmail: gmail_v1.Gmail) {}

  async labelEmail(
    messageId: string,
    labelName: "SPAM" | string,
  ): Promise<void> {
    await labelEmail(messageId, labelName)
  }
}

export class NoOpGmailLabeler implements GmailLabeler {
  async labelEmail(
    messageId: string,
    labelName: "SPAM" | string,
  ): Promise<void> {
    // No-op for testing
  }
}

export class RealHumanApprover implements HumanApprover {
  async checkWithHuman(params: {
    from: string
    subject: string
    body: string
    proposedClassification: any
    existingRuleset: string
  }) {
    return await checkWithHuman(params)
  }
}

export class NoOpHumanApprover implements HumanApprover {
  async checkWithHuman(_params: any) {
    return { approved: true }
  }
}

export class NoOpDatasetWriter implements DatasetWriter {
  async startNewRun(): Promise<string> {
    return "test-run"
  }

  async saveEmailClassification(
    _messageId: string,
    _subject: string | undefined,
    _from: string | undefined,
    _isSpam: boolean,
    _finalClassification: string,
    _markdown?: string,
  ): Promise<void> {
    // No-op for testing
  }
}

export class FileRulesManager implements RulesManager {
  constructor(private rulesFilePath: string) {}

  async loadRules(): Promise<string> {
    try {
      return await fs.readFile(this.rulesFilePath, "utf-8")
    } catch (error) {
      // If file doesn't exist, return default rules
      const defaultRules = `Mark as spam all emails that:
- are a cold outreach email
- are a sales/marketing email e.g. for an e-commerce site. 

do NOT mark as spam emails that:
- pertain to event notifications
- contain an authentication/authorization code e.g. for 2FA
- contain a "magic link" to sign in or similar.`

      // Create the file with default rules if it doesn't exist
      await this.saveRules(defaultRules)
      return defaultRules
    }
  }

  async saveRules(rules: string): Promise<void> {
    await fs.writeFile(this.rulesFilePath, rules, "utf-8")
  }
}

export class RealDatasetWriter implements DatasetWriter {
  constructor(private datasetManager: SimpleDatasetManager) {}

  async startNewRun(): Promise<string> {
    return await this.datasetManager.startNewRun()
  }

  async saveEmailClassification(
    messageId: string,
    subject: string | undefined,
    from: string | undefined,
    isSpam: boolean,
    finalClassification: string,
    markdown?: string,
  ): Promise<void> {
    await this.datasetManager.saveEmailClassification(
      messageId,
      subject,
      from,
      isSpam,
      finalClassification,
      markdown,
    )
  }
}

export function getRulesFilePath(): string {
  // Check environment variable first, then fall back to default
  return process.env.EMAIL_RULES_FILE || "src/rules.txt"
}

export async function loadRules(): Promise<string> {
  const rulesManager = new FileRulesManager(getRulesFilePath())
  return await rulesManager.loadRules()
}

export async function saveRules(rules: string): Promise<void> {
  const rulesManager = new FileRulesManager(getRulesFilePath())
  await rulesManager.saveRules(rules)
}

export class EmailProcessor {
  constructor(
    private rulesManager: RulesManager,
    private gmail: gmail_v1.Gmail,
    private datasetManager: SimpleDatasetManager,
  ) {}

  async processEmailWithDependencies(
    emailFetcher: EmailFetcher,
    gmailLabeler: GmailLabeler,
    humanApprover: HumanApprover,
    datasetWriter: DatasetWriter,
  ) {
    return await handleEmailWithDependencies(
      emailFetcher,
      gmailLabeler,
      humanApprover,
      datasetWriter,
      this.gmail,
      this.rulesManager,
    )
  }

  async processOneEmailWithoutApproval(emailInfo: gmail_v1.Schema$Message) {
    const emailFetcher = new MessageIdEmailFetcher(this.gmail, emailInfo.id!)
    const gmailLabeler = new NoOpGmailLabeler()
    const humanApprover = new NoOpHumanApprover()
    const datasetWriter = new RealDatasetWriter(this.datasetManager)

    console.log("🤖 Auto-classifying without human approval...")

    await this.processEmailWithDependencies(
      emailFetcher,
      gmailLabeler,
      humanApprover,
      datasetWriter,
    )
  }

  async processOneEmail(emailInfo: gmail_v1.Schema$Message) {
    const emailFetcher = new MessageIdEmailFetcher(this.gmail, emailInfo.id!)
    const gmailLabeler = new RealGmailLabeler(this.gmail)
    const humanApprover = new RealHumanApprover()
    const datasetWriter = new RealDatasetWriter(this.datasetManager)

    console.log("🤔 Verifying classification with human...")

    await this.processEmailWithDependencies(
      emailFetcher,
      gmailLabeler,
      humanApprover,
      datasetWriter,
    )
  }
}

// Initialize rules
const rules = await loadRules()

const gmail = await createGmailClient()

const datasetManager = new SimpleDatasetManager()

export async function handleEmailWithDependencies(
  emailFetcher: EmailFetcher,
  gmailLabeler: GmailLabeler,
  humanApprover: HumanApprover,
  datasetWriter: DatasetWriter,
  gmail: gmail_v1.Gmail,
  rulesManager: RulesManager,
) {
  // Start a new dataset run
  const runId = await datasetWriter.startNewRun()
  console.log(`🗂️ Started dataset collection run: ${runId}`)

  // Fetch the email using the provided fetcher
  const emailInfo = await emailFetcher.fetchEmail()

  const email = await gmail.users.messages.get({
    userId: "me",
    id: emailInfo.id!,
  })
  console.log("got email", email.data.payload?.parts?.[0] || "no parts")

  const headers = email.data.payload?.headers
  const subject = headers?.find((h) => h.name === "Subject")?.value
  const from = headers?.find((h) => h.name === "From")?.value
  const date = headers?.find((h) => h.name === "Date")?.value

  // Track final classification for dataset
  let finalClassification = "read_later"

  if (!email.data.payload) return

  // Use the tested email parser
  const body = parseEmailBody(email.data.payload)

  const markdownContent = await convertToMarkdown(body.text, body.html)
  body.text = markdownContent.text
  body.html = markdownContent.html

  console.log("body", body)

  const envelope = `
		Subject: ${subject}
		From: ${from}
		Date: ${date}
		`

  // Load rules using the injected rules manager
  const rules = await rulesManager.loadRules()
  const isSpam = await b.IsSpam(envelope, body.html, body.text, rules)

  console.log("\n🔍 Spam Analysis")
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  console.log(`Status: ${isSpam.is_spam ? "🚫 Spam" : "✅ Not Spam"}`)
  if (isSpam.spam_rules_matched.length > 0) {
    console.log("\n📋 Matched Rules:")
    isSpam.spam_rules_matched.forEach((rule) => console.log(`  • ${rule}`))
  }
  if (isSpam.spammy_qualities.length > 0) {
    console.log("\n⚠️ Spammy Qualities:")
    isSpam.spammy_qualities.forEach((quality) => console.log(`  • ${quality}`))
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")

  // Check with human (or no-op for testing)
  const { updatedRuleset, approved } = await humanApprover.checkWithHuman({
    from: from ?? "Unknown Sender",
    subject: subject ?? "Unknown Subject",
    body: body.html.length > body.text.length ? body.html : body.text,
    proposedClassification: isSpam,
    existingRuleset: rules,
  })

  // Handle rule updates
  if (updatedRuleset) {
    // Update rules using the injected rules manager
    await rulesManager.saveRules(updatedRuleset)
  }

  if (isSpam.is_spam && approved) {
    const isTestMode = humanApprover instanceof NoOpHumanApprover
    if (isTestMode) {
      console.log("🚫 Final Decision: SPAM")
    } else {
      console.log("🚫 Moving to spam folder...")
    }
    await gmailLabeler.labelEmail(emailInfo.id!, "SPAM")
    finalClassification = "spam"

    // Save to dataset
    await datasetWriter.saveEmailClassification(
      emailInfo.id!,
      subject || undefined,
      from || undefined,
      isSpam.is_spam,
      finalClassification,
      markdownContent.text,
    )
    return
  }

  // Otherwise continue to classification
  console.log("\n📋 Classifying email...")

  const classification = await b.Classify(
    subject ?? "Unknown Subject",
    from ?? "Unknown Sender",
    body.html,
    rules,
  )

  const isTestMode = humanApprover instanceof NoOpHumanApprover

  console.log("\n📌 Classification Result")
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  switch (classification.classification.classification) {
    case "read_today":
      if (isTestMode) {
        console.log("📌 Final Decision: READ TODAY")
      } else {
        console.log("📌 Labeling as: Read Today")
      }
      await gmailLabeler.labelEmail(emailInfo.id!, "@read_today")
      finalClassification = "read_today"
      break
    case "read_later":
      if (isTestMode) {
        console.log("📌 Final Decision: READ LATER")
      } else {
        console.log("📌 Labeling as: Read Later")
      }
      await gmailLabeler.labelEmail(emailInfo.id!, "@read_later")
      finalClassification = "read_later"
      break
    case "notify_immediately":
      if (isTestMode) {
        console.log("🔔 Final Decision: NOTIFY IMMEDIATELY")
        console.log(`   Message: ${classification.classification.message}`)
      } else {
        console.log("🔔 Important: Requires immediate attention")
        await contactHuman(classification.classification.message)
      }
      finalClassification = "notify_immediately"
      break
    case "draft_reply":
      if (isTestMode) {
        console.log("✍️ Final Decision: DRAFT REPLY")
        console.log(`   Summary: ${classification.classification.summary}`)
      } else {
        console.log("✍️ Drafting reply...")
        await getDraftFeedback({
          from: from ?? "Unknown Sender",
          subject: subject ?? "Unknown Subject",
          summary: classification.classification.summary,
          body: classification.classification.body,
        })
      }
      finalClassification = "draft_reply"
      break
  }

  // Save to dataset
  await datasetWriter.saveEmailClassification(
    emailInfo.id!,
    subject || undefined,
    from || undefined,
    isSpam.is_spam,
    finalClassification,
    markdownContent.text,
  )

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
}

export async function handleOneEmailWithoutApproval(
  emailInfo: gmail_v1.Schema$Message,
  rulesManager?: RulesManager,
) {
  const emailFetcher = new MessageIdEmailFetcher(gmail, emailInfo.id!)
  const gmailLabeler = new NoOpGmailLabeler()
  const humanApprover = new NoOpHumanApprover()
  const datasetWriter = new RealDatasetWriter(datasetManager)
  const rules = rulesManager || new FileRulesManager(getRulesFilePath())

  console.log("🤖 Auto-classifying without human approval...")

  await handleEmailWithDependencies(
    emailFetcher,
    gmailLabeler,
    humanApprover,
    datasetWriter,
    gmail,
    rules,
  )
}

export async function handleOneEmail(
  emailInfo: gmail_v1.Schema$Message,
  rulesManager?: RulesManager,
) {
  const emailFetcher = new MessageIdEmailFetcher(gmail, emailInfo.id!)
  const gmailLabeler = new RealGmailLabeler(gmail)
  const humanApprover = new RealHumanApprover()
  const datasetWriter = new RealDatasetWriter(datasetManager)
  const rules = rulesManager || new FileRulesManager(getRulesFilePath())

  console.log("🤔 Verifying classification with human...")

  await handleEmailWithDependencies(
    emailFetcher,
    gmailLabeler,
    humanApprover,
    datasetWriter,
    gmail,
    rules,
  )
}

export async function labelEmail(
  messageId: string,
  labelName: "SPAM" | string,
) {
  let labelId: string

  const systemLabels = ["SPAM"]
  if (systemLabels.includes(labelName)) {
    // Add the label to the message
    return await gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: {
        addLabelIds: [labelName],
      },
    })
  }
  try {
    const labelResponse = await gmail.users.labels.create({
      userId: "me",
      requestBody: {
        name: labelName,
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      },
    })
    labelId = labelResponse.data.id!
  } catch (error: any) {
    if (error.code === 409) {
      // Label already exists
      // Get the existing label
      const labelsResponse = await gmail.users.labels.list({ userId: "me" })
      const existingLabel = labelsResponse.data.labels?.find(
        (l) => l.name === labelName,
      )
      if (!existingLabel) {
        throw new Error(`Failed to find ${labelName} label`)
      }
      labelId = existingLabel.id!
    } else {
      throw error
    }
  }

  // Add the label to the message
  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: {
      addLabelIds: [labelId],
    },
  })

  console.log(`Successfully labeled the most recent email with ${labelName}`)
}
