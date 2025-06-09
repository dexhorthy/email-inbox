// cli.ts lets you invoke the agent loop from the command line

import fs from "node:fs/promises"
import path from "node:path"
import { agentops } from "agentops"
import { Command } from "commander"
import dotenv from "dotenv"
import type { gmail_v1 } from "googleapis"
import { SimpleDatasetManager } from "./datasets-simple"
import {
  createGmailClient,
  extractHeaders,
  parseEmailBody,
} from "./emailParser"
import {
  type EmailFetcher,
  EmailProcessor,
  FileRulesManager,
  LastEmailFetcher,
  MessageIdEmailFetcher,
  NoOpDatasetWriter,
  NoOpGmailLabeler,
  NoOpHumanApprover,
  RealDatasetWriter,
  RealGmailLabeler,
  RealHumanApprover,
  type RulesManager,
  getRulesFilePath,
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

export async function cliDumpEmailsToFiles(numRecords = 10) {
  try {
    const gmail = await createGmailClient()

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

      const headers = extractHeaders(email.data.payload!)
      const subject = headers.subject || "No Subject"
      const from = headers.from || "Unknown Sender"

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
    const datasetManager = new SimpleDatasetManager()
    const runId = await datasetManager.startNewRun()
    console.log(`🗂️ Started dataset collection run: ${runId}`)

    const gmail = await createGmailClient()

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

        const headers = extractHeaders(email.data.payload!)
        const subject = headers.subject || "No Subject"
        const from = headers.from || "Unknown Sender"
        const date = headers.date || "Unknown Date"

        // Get the email body
        const body = parseEmailBody(email.data.payload!)

        return {
          id: message.id!,
          subject,
          from,
          date,
          snippet: email.data.snippet,
          body: {
            plain: body.text,
            html: body.html,
          },
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

if (require.main === module) {
  const program = new Command()

  program
    .name("email-inbox")
    .description("CLI to process and classify emails")
    .version("1.0.0")
    .option(
      "-r, --rules-file <path>",
      "Path to rules file (can also use EMAIL_RULES_FILE env var)",
      getRulesFilePath(),
    )

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
    .action(async (options, command) => {
      if (process.env.AGENTOPS_API_KEY) {
        await agentops.init()
      }

      try {
        const gmail = await createGmailClient()

        const datasetManager = new SimpleDatasetManager()

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

        const rulesManager = new FileRulesManager(
          command.parent?.opts().rulesFile ||
            process.env.EMAIL_RULES_FILE ||
            "src/rules.txt",
        )
        const processor = new EmailProcessor(
          rulesManager,
          gmail,
          datasetManager,
        )

        const gmailLabeler = new NoOpGmailLabeler()
        const humanApprover = new NoOpHumanApprover()
        const datasetWriter = new RealDatasetWriter(datasetManager)

        await processor.processEmailWithDependencies(
          emailFetcher,
          gmailLabeler,
          humanApprover,
          datasetWriter,
        )
        console.log("✅ Email processing complete")
      } catch (error) {
        console.error("Error:", error)
        process.exit(1)
      }
    })

  program
    .command("test-many")
    .description("Process multiple emails without human approval")
    .option("-n, --num-records <number>", "Number of emails to process", "10")
    .action(async (options, command) => {
      if (process.env.AGENTOPS_API_KEY) {
        await agentops.init()
      }

      try {
        const numRecords = Number.parseInt(options.numRecords, 10)
        if (Number.isNaN(numRecords) || numRecords < 1) {
          console.error("❌ Number of records must be a positive integer")
          process.exit(1)
        }

        console.log(
          `🤖 Processing ${numRecords} emails without human approval...\n`,
        )

        const gmail = await createGmailClient()
        const datasetManager = new SimpleDatasetManager()
        const runId = await datasetManager.startNewRun()
        console.log(`🗂️ Started dataset collection run: ${runId}`)

        // Get emails with specified limit
        const response = await gmail.users.messages.list({
          userId: "me",
          maxResults: numRecords,
        })

        const messages = response.data.messages || []
        console.log(`📧 Found ${messages.length} emails to process\n`)

        const rulesManager = new FileRulesManager(
          command.parent?.opts().rulesFile ||
            process.env.EMAIL_RULES_FILE ||
            "src/rules.txt",
        )
        const processor = new EmailProcessor(
          rulesManager,
          gmail,
          datasetManager,
        )

        const gmailLabeler = new NoOpGmailLabeler()
        const humanApprover = new NoOpHumanApprover()
        const datasetWriter = new RealDatasetWriter(datasetManager)

        // Process each email
        for (const [index, message] of messages.entries()) {
          console.log(
            `\n📬 Processing Email ${index + 1}/${messages.length} (ID: ${message.id})`,
          )
          console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

          try {
            const emailFetcher = new MessageIdEmailFetcher(gmail, message.id!)

            await processor.processEmailWithDependencies(
              emailFetcher,
              gmailLabeler,
              humanApprover,
              datasetWriter,
            )
          } catch (error) {
            console.error(`❌ Error processing email ${message.id}:`, error)
          }
        }

        console.log(`\n✅ Processed ${messages.length} emails successfully`)
      } catch (error) {
        console.error("Error:", error)
        process.exit(1)
      }
    })

  program.parse()
}
