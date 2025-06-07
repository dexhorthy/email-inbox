// cli.ts lets you invoke the agent loop from the command line

import fs from "node:fs/promises"
import path from "node:path"
import { agentops } from "agentops"
import { Command } from "commander"
import dotenv from "dotenv"
import type { gmail_v1 } from "googleapis"
import { google } from "googleapis"
import { DatasetManager } from "./datasets"
import {
  type EmailFetcher,
  LastEmailFetcher,
  MessageIdEmailFetcher,
  NoOpGmailLabeler,
  NoOpHumanApprover,
  RealDatasetWriter,
  RealGmailLabeler,
  RealHumanApprover,
  handleEmailWithDependencies,
  handleOneEmail,
  handleOneEmailWithoutApproval,
} from "./handleEmail"

// Load environment variables from .env file
dotenv.config()

interface EmailMessage {
  id: string
  subject: string
  from: string
  date: string
  snippet: string
  body: {
    plain?: string
    html?: string
  }
}

interface GmailHeader {
  name: string
  value: string
}

function getEmailBody(parts: gmail_v1.Schema$MessagePart[] | undefined): {
  plain?: string
  html?: string
} {
  if (!parts) return {}

  const body: { plain?: string; html?: string } = {}

  for (const part of parts) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      body.plain = Buffer.from(part.body.data, "base64").toString("utf-8")
    } else if (part.mimeType === "text/html" && part.body?.data) {
      body.html = Buffer.from(part.body.data, "base64").toString("utf-8")
    }

    // Recursively check nested parts
    if (part.parts) {
      const nestedBody = getEmailBody(part.parts)
      if (nestedBody.plain) body.plain = nestedBody.plain
      if (nestedBody.html) body.html = nestedBody.html
    }
  }

  return body
}

export async function cliDumpEmailsToFiles(numRecords = 10) {
  try {
    // Read the token file
    const tokenPath = path.join(process.cwd(), "gmail_token.json")
    const tokenContent = await fs.readFile(tokenPath, "utf-8")
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

    // Get emails with specified limit
    const response = await gmail.users.messages.list({
      userId: "me",
      maxResults: numRecords,
    })

    const messages = response.data.messages || []
    console.log(
      `📧 Fetching ${messages.length} emails and saving to test/data/`,
    )

    // Fetch full details for each message and save to files
    for (const [index, message] of messages.entries()) {
      console.log(`\n📬 Processing Email ${index + 1}/${messages.length}`)

      const email = await gmail.users.messages.get({
        userId: "me",
        id: message.id!,
        format: "full", // Get the full message including body
      })

      const headers = email.data.payload?.headers as GmailHeader[] | undefined
      const subject =
        headers?.find((h) => h.name === "Subject")?.value || "No Subject"
      const from =
        headers?.find((h) => h.name === "From")?.value || "Unknown Sender"

      console.log(`📝 Subject: ${subject}`)
      console.log(`👤 From: ${from}`)
      console.log(`🆔 ID: ${message.id}`)

      // Save the full payload to a file
      const filename = `src/test/data/email-${message.id}.json`
      await fs.writeFile(
        filename,
        JSON.stringify(email.data.payload, null, 2),
        "utf-8",
      )
      console.log(`💾 Saved to ${filename}`)
    }

    console.log(
      `\n✅ Successfully dumped ${messages.length} emails to src/test/data/`,
    )
  } catch (error) {
    console.error("Error fetching emails:", error)
    throw error
  }
}

export async function cliDumpEmails(numRecords = 5) {
  try {
    // Start a new dataset run
    const datasetManager = new DatasetManager()
    const runId = await datasetManager.startNewRun()
    console.log(`🗂️ Started dataset collection run: ${runId}`)

    // Read the token file
    const tokenPath = path.join(process.cwd(), "gmail_token.json")
    const tokenContent = await fs.readFile(tokenPath, "utf-8")
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

    // Get emails with specified limit
    const response = await gmail.users.messages.list({
      userId: "me",
      maxResults: numRecords,
    })

    const messages = response.data.messages || []

    // Fetch full details for each message
    const emailDetails = await Promise.all(
      messages.map(async (message: gmail_v1.Schema$Message) => {
        const email = await gmail.users.messages.get({
          userId: "me",
          id: message.id!,
          format: "full", // Get the full message including body
        })

        const headers = email.data.payload?.headers as GmailHeader[] | undefined
        const subject =
          headers?.find((h) => h.name === "Subject")?.value || "No Subject"
        const from =
          headers?.find((h) => h.name === "From")?.value || "Unknown Sender"
        const date =
          headers?.find((h) => h.name === "Date")?.value || "Unknown Date"

        // Get the email body
        const body = getEmailBody(email.data.payload?.parts)

        return {
          id: message.id!,
          subject,
          from,
          date,
          snippet: email.data.snippet,
          body,
        } as EmailMessage
      }),
    )

    // Print the emails
    console.log("\n📧 Processing Emails\n")
    for (const [index, email] of emailDetails.entries()) {
      console.log(`\n📬 Email ${index + 1}/${emailDetails.length}`)
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
      console.log(`📝 Subject: ${email.subject}`)
      console.log(`👤 From: ${email.from}`)
      console.log(`🕒 Date: ${email.date}`)
      console.log(`📋 Preview: ${email.snippet}`)
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")

      try {
        await handleOneEmail(email)
      } catch (error) {
        console.error(`❌ Error handling email ${email.id}:`, error)
      }
    }
  } catch (error) {
    console.error("Error fetching emails:", error)
    throw error
  }
}

async function labelLastEmailAsActions() {
  try {
    // Read the token file
    const tokenPath = path.join(process.cwd(), "gmail_token.json")
    const tokenContent = await fs.readFile(tokenPath, "utf-8")
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

    // Get the most recent email
    const response = await gmail.users.messages.list({
      userId: "me",
      maxResults: 1,
      q: "in:inbox", // Only search in inbox
    })

    const messages = response.data.messages
    if (!messages || messages.length === 0) {
      console.log("No emails found in inbox")
      return
    }

    const messageId = messages[0].id!

    console.log("handling messages!")
    for (const message of messages) {
      await handleOneEmail(message)
    }
    console.log("done handling messages")
  } catch (error) {
    console.error("Error labeling email:", error)
    throw error
  }
}

if (require.main === module) {
  const program = new Command()

  program
    .name("email-inbox")
    .description("CLI to process and classify emails")
    .version("1.0.0")

  program
    .command("process")
    .description("Process emails from Gmail inbox")
    .option("-n, --num-records <number>", "Number of emails to process", "5")
    .action(async (options) => {
      if (process.env.AGENTOPS_API_KEY) {
        await agentops.init()
      }

      try {
        const numRecords = Number.parseInt(options.numRecords, 10)
        if (Number.isNaN(numRecords) || numRecords < 1) {
          console.error("❌ Number of records must be a positive integer")
          process.exit(1)
        }
        await cliDumpEmails(numRecords)
      } catch (error) {
        console.error("Error:", error)
        process.exit(1)
      }
    })

  program
    .command("dump")
    .description("Dump email payloads to test data files")
    .option("-n, --num-records <number>", "Number of emails to dump", "10")
    .action(async (options) => {
      try {
        const numRecords = Number.parseInt(options.numRecords, 10)
        if (Number.isNaN(numRecords) || numRecords < 1) {
          console.error("❌ Number of records must be a positive integer")
          process.exit(1)
        }
        await cliDumpEmailsToFiles(numRecords)
      } catch (error) {
        console.error("Error:", error)
        process.exit(1)
      }
    })

  program
    .command("test-one")
    .description("Parse and classify a single email without human approval")
    .option("-m, --message-id <id>", "Specific Gmail message ID to process")
    .action(async (options) => {
      if (process.env.AGENTOPS_API_KEY) {
        await agentops.init()
      }

      try {
        // Read the token file
        const tokenPath = path.join(process.cwd(), "gmail_token.json")
        const tokenContent = await fs.readFile(tokenPath, "utf-8")
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

        const datasetManager = new DatasetManager()

        let emailFetcher: EmailFetcher
        if (options.messageId) {
          // Process specific message ID
          console.log(`🎯 Processing email ID: ${options.messageId}\n`)
          emailFetcher = new MessageIdEmailFetcher(gmail, options.messageId)
        } else {
          // Get the most recent email
          console.log(
            "🤖 Processing most recent email without human approval...\n",
          )
          emailFetcher = new LastEmailFetcher(gmail, 1)
        }

        const gmailLabeler = new NoOpGmailLabeler()
        const humanApprover = new NoOpHumanApprover()
        const datasetWriter = new RealDatasetWriter(datasetManager)

        await handleEmailWithDependencies(
          emailFetcher,
          gmailLabeler,
          humanApprover,
          datasetWriter,
          gmail,
        )
        console.log("✅ Email processing complete")
      } catch (error) {
        console.error("Error:", error)
        process.exit(1)
      }
    })

  program.parse()
}
