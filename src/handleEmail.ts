import fs from "node:fs/promises"
import type { gmail_v1 } from "googleapis"
import { google } from "googleapis"
import TurndownService from "turndown"
import { b } from "../baml_client"
import { checkWithHuman } from "./checkWithHuman"
import { contactHuman, getDraftFeedback } from "./contactHuman"
import {
  DatasetManager,
  type EmailDataPoint,
  generateContentHash,
  getCurrentRulesVersion,
  getModelVersion,
} from "./datasets"

export async function loadRules(): Promise<string> {
  try {
    return await fs.readFile("src/rules.txt", "utf-8")
  } catch (error) {
    // If file doesn't exist, return default rules
    return `Mark as spam all emails that:
- are a cold outreach email
- are a sales/marketing email e.g. for an e-commerce site. 

do NOT mark as spam emails that:
- pertain to event notifications
- contain an authentication/authorization code e.g. for 2FA
- contain a "magic link" to sign in or similar.`
  }
}

export async function saveRules(rules: string): Promise<void> {
  await fs.writeFile("src/rules.txt", rules, "utf-8")
}

// Initialize rules
let rules = await loadRules()

const tokenContent = await fs.readFile("gmail_token.json", "utf-8")
const credentials = JSON.parse(tokenContent)

// Create OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  credentials.client_id,
  credentials.client_secret,
  credentials.redirect_uri,
)

// Set credentials
oauth2Client.setCredentials({
  access_token: credentials.access_token,
  refresh_token: credentials.refresh_token,
})

// Create Gmail API client
const gmail = google.gmail({ version: "v1", auth: oauth2Client })

const turndownService = new TurndownService()
const datasetManager = new DatasetManager()

export async function handleOneEmail(emailInfo: gmail_v1.Schema$Message) {
  const email = await gmail.users.messages.get({
    userId: "me",
    id: emailInfo.id!,
  })
  console.log("got email", email.data.payload?.parts?.[0] || "no parts")

  const headers = email.data.payload?.headers
  const subject = headers?.find((h) => h.name === "Subject")?.value
  const from = headers?.find((h) => h.name === "From")?.value
  const date = headers?.find((h) => h.name === "Date")?.value

  // Initialize email data point for dataset
  const emailData: EmailDataPoint = {
    id: emailInfo.id!,
    timestamp: new Date().toISOString(),
    content_hash: generateContentHash(subject || "", from || "", ""),
    processing_context: {
      rules_version: getCurrentRulesVersion(),
      model_version: getModelVersion(),
      processing_timestamp: new Date().toISOString(),
    },
    envelope: {
      subject: subject || undefined,
      from: from || undefined,
      date: date || undefined,
      messageId: emailInfo.id!,
    },
    content: {
      text: "",
      html: "",
      markdown: "",
    },
    spam_analysis: {
      is_spam: false,
      high_confidence: false,
      spam_rules_matched: [],
      spammy_qualities: [],
    },
    final_classification: {
      category: "read_later",
    },
    labels_applied: [],
  }

  const body = {
    text: "",
    html: "",
  }
  if (!email.data.payload) return
  for (const part of email.data.payload.parts || []) {
    if (part.body) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        body.text = Buffer.from(part.body.data, "base64").toString()
      } else if (part.mimeType === "text/html" && part.body?.data) {
        body.html = Buffer.from(part.body.data, "base64").toString()
      }
    }
    if (part.mimeType === "multipart/alternative") {
      for (const p of part?.parts || []) {
        if (p.mimeType === "text/plain" && p.body?.data) {
          body.text = Buffer.from(p.body.data, "base64").toString()
        } else if (p.mimeType === "text/html" && p.body?.data) {
          body.html = Buffer.from(p.body.data, "base64").toString()
        }
      }
    }
  }

  const [text, html] = await Promise.all([
    b.HtmlToMarkdown(body.text),
    b.HtmlToMarkdown(body.html),
  ])
  body.text = text.markdown
  body.html = html.markdown

  // Update dataset with content
  emailData.content = {
    text: body.text,
    html: body.html,
    markdown: body.html.length > body.text.length ? body.html : body.text,
  }

  // Update content hash with actual body content
  emailData.content_hash = generateContentHash(
    subject || "",
    from || "",
    body.html.length > body.text.length ? body.html : body.text,
  )

  console.log("body", body)

  const envelope = `
	Subject: ${subject}
	From: ${from}
	Date: ${date}
	`

  const isSpam = await b.IsSpam(envelope, body.html, body.text, rules)

  // Update dataset with spam analysis
  emailData.spam_analysis = {
    is_spam: isSpam.is_spam,
    high_confidence: isSpam.high_confidence,
    spam_rules_matched: isSpam.spam_rules_matched,
    spammy_qualities: isSpam.spammy_qualities,
  }

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

  // Decide if the email is spam
  console.log("🤔 Verifying classification with human...")
  const { updatedRuleset, approved } = await checkWithHuman({
    from: from ?? "Unknown Sender",
    subject: subject ?? "Unknown Subject",
    body: body.html.length > body.text.length ? body.html : body.text,
    proposedClassification: isSpam,
    existingRuleset: rules,
  })

  // Update dataset with human interaction
  emailData.human_interaction = {
    timestamp: new Date().toISOString(),
    approved,
    updated_ruleset: updatedRuleset,
  }

  if (updatedRuleset) {
    // Update rules file directly
    await fs.writeFile("src/rules.txt", updatedRuleset, "utf-8")
    rules = updatedRuleset
  }

  if (isSpam.is_spam && approved) {
    console.log("🚫 Moving to spam folder...")
    await labelEmail(emailInfo.id!, "SPAM")
    emailData.final_classification = {
      category: "spam",
    }
    emailData.labels_applied = ["SPAM"]
    await datasetManager.saveEmailData(emailData)
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

  console.log("\n📌 Classification Result")
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  switch (classification.classification.classification) {
    case "read_today":
      console.log("📌 Labeling as: Read Today")
      await labelEmail(emailInfo.id!, "@read_today")
      emailData.labels_applied = ["@read_today"]
      break
    case "read_later":
      console.log("📌 Labeling as: Read Later")
      await labelEmail(emailInfo.id!, "@read_later")
      emailData.labels_applied = ["@read_later"]
      break
    case "notify_immediately":
      console.log("🔔 Important: Requires immediate attention")
      await contactHuman(classification.classification.message)
      break
    case "draft_reply":
      console.log("✍️ Drafting reply...")
      await getDraftFeedback({
        from: from ?? "Unknown Sender",
        subject: subject ?? "Unknown Subject",
        summary: classification.classification.summary,
        body: classification.classification.body,
      })
      break
  }

  // Update final classification
  if (classification.classification.classification === "draft_reply") {
    emailData.final_classification = {
      category: classification.classification.classification,
      summary: classification.classification.summary,
    }
  } else if (
    classification.classification.classification === "notify_immediately"
  ) {
    emailData.final_classification = {
      category: classification.classification.classification,
      message: classification.classification.message,
    }
  } else {
    emailData.final_classification = {
      category: classification.classification.classification,
    }
  }

  // Save email data to dataset
  await datasetManager.saveEmailData(emailData)

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
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
