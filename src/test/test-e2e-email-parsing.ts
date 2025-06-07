import { beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import type { gmail_v1 } from "googleapis"
import {
  type EmailParsingError,
  type ParsedEmail,
  convertToMarkdown,
  createGmailClient,
  extractHeaders,
  parseEmailBody,
  parseEmailById,
} from "../emailParser"

interface TestData {
  timestamp: string
  messageIds: string[]
  messages: Array<{
    id: string
    subject: string
    from: string
    date: string
  }>
}

describe("Email Parsing E2E Tests", () => {
  let gmail: gmail_v1.Gmail
  let testData: TestData

  beforeAll(async () => {
    // Load test data
    const testDataPath = path.join(
      process.cwd(),
      "src",
      "test",
      "data",
      "test-message-ids.json",
    )
    const testDataContent = await fs.readFile(testDataPath, "utf-8")
    testData = JSON.parse(testDataContent)

    // Create Gmail client
    gmail = await createGmailClient()

    console.log(
      `🧪 Running E2E tests with ${testData.messageIds.length} real Gmail messages`,
    )
    console.log(`📅 Test data fetched at: ${testData.timestamp}`)
  })

  describe("Gmail API Connection", () => {
    test("should successfully connect to Gmail API", async () => {
      expect(gmail).toBeDefined()

      // Test basic API call
      const profile = await gmail.users.getProfile({ userId: "me" })
      expect(profile.data.emailAddress).toBeDefined()
      console.log(`✅ Connected to Gmail for: ${profile.data.emailAddress}`)
    })
  })

  describe("Email Fetching by ID", () => {
    test("should fetch all test emails by ID", async () => {
      for (const messageId of testData.messageIds) {
        const email = await gmail.users.messages.get({
          userId: "me",
          id: messageId,
        })

        expect(email.data).toBeDefined()
        expect(email.data.id).toBe(messageId)
        expect(email.data.payload).toBeDefined()

        console.log(
          `📧 Fetched email ${messageId}: ${email.data.payload?.headers?.find((h) => h.name === "Subject")?.value}`,
        )
      }
    })

    test("should handle invalid message ID gracefully", async () => {
      const invalidMessageId = "invalid_message_id_12345"

      try {
        await gmail.users.messages.get({
          userId: "me",
          id: invalidMessageId,
        })
        expect(false).toBe(true) // Should not reach here
      } catch (error: any) {
        expect(error.code).toBe(400) // Gmail API returns 400 for invalid message IDs
        console.log(`✅ Correctly handled invalid message ID: ${error.message}`)
      }
    })
  })

  describe("Header Extraction", () => {
    test("should extract headers from all test emails", async () => {
      for (const expectedMessage of testData.messages) {
        const email = await gmail.users.messages.get({
          userId: "me",
          id: expectedMessage.id,
        })

        const headers = extractHeaders(email.data.payload!)

        expect(headers.subject).toBeDefined()
        expect(headers.from).toBeDefined()
        expect(headers.date).toBeDefined()

        // Verify against expected data
        expect(headers.subject).toBe(expectedMessage.subject)
        expect(headers.from).toBe(expectedMessage.from)

        console.log(`📝 Headers for ${expectedMessage.id}:`)
        console.log(`   Subject: ${headers.subject}`)
        console.log(`   From: ${headers.from}`)
        console.log(`   Date: ${headers.date}`)
      }
    })

    test("should handle missing headers gracefully", async () => {
      // Create a mock payload with missing headers
      const mockPayload = { headers: [] }
      const headers = extractHeaders(mockPayload)

      expect(headers.subject).toBeUndefined()
      expect(headers.from).toBeUndefined()
      expect(headers.date).toBeUndefined()
      expect(headers.messageId).toBeUndefined()
    })
  })

  describe("Body Parsing", () => {
    test.each(testData.messageIds)("should parse body content for message %s", async (messageId: string) => {
      const email = await gmail.users.messages.get({
        userId: "me",
        id: messageId,
      })

      const body = parseEmailBody(email.data.payload!)

      // At least one of text or html should be present
      expect(body.text.length > 0 || body.html.length > 0).toBe(true)

      console.log(`📄 Body for ${messageId}:`)
      console.log(`   Text length: ${body.text.length} chars`)
      console.log(`   HTML length: ${body.html.length} chars`)

      if (body.text.length > 0) {
        console.log(`   Text preview: ${body.text.substring(0, 100)}...`)
      }
      if (body.html.length > 0) {
        console.log(`   HTML preview: ${body.html.substring(0, 100)}...`)
      }
    })

    test("should handle emails with no body content", async () => {
      // Test with empty payload
      const mockPayload = { parts: [] }
      const body = parseEmailBody(mockPayload)

      expect(body.text).toBe("")
      expect(body.html).toBe("")
    })

    test("should parse multipart emails correctly", async () => {
      // Find an email that likely has multipart content
      for (const messageId of testData.messageIds) {
        const email = await gmail.users.messages.get({
          userId: "me",
          id: messageId,
        })

        const payload = email.data.payload!

        if (payload.mimeType?.startsWith("multipart/")) {
          const body = parseEmailBody(payload)

          console.log(`🔄 Multipart email ${messageId}:`)
          console.log(`   MIME type: ${payload.mimeType}`)
          console.log(`   Parts count: ${payload.parts?.length || 0}`)
          console.log(`   Text extracted: ${body.text.length} chars`)
          console.log(`   HTML extracted: ${body.html.length} chars`)

          // Should extract content from multipart
          expect(body.text.length > 0 || body.html.length > 0).toBe(true)
        }
      }
    })
  })

  describe("Markdown Conversion", () => {
    test("should convert text and HTML to markdown", async () => {
      const testText = "Hello world!\nThis is a test."
      const testHtml = "<h1>Hello</h1><p>This is a <strong>test</strong>.</p>"

      const result = await convertToMarkdown(testText, testHtml)

      expect(result.text).toBeDefined()
      expect(result.html).toBeDefined()
      expect(typeof result.text).toBe("string")
      expect(typeof result.html).toBe("string")

      console.log(`📝 Markdown conversion test:`)
      console.log(`   Text input: ${testText}`)
      console.log(`   Text output: ${result.text}`)
      console.log(`   HTML input: ${testHtml}`)
      console.log(`   HTML output: ${result.html}`)
    })

    test("should handle empty content in markdown conversion", async () => {
      const result = await convertToMarkdown("", "")

      expect(result.text).toBeDefined()
      expect(result.html).toBeDefined()
    })
  })

  describe("Full Email Parsing Pipeline", () => {
    test("should parse all test emails end-to-end", async () => {
      const results: Array<ParsedEmail | EmailParsingError> = []

      for (const messageId of testData.messageIds) {
        console.log(`🔄 Parsing email ${messageId}...`)
        const result = await parseEmailById(gmail, messageId)
        results.push(result)

        if ("error" in result) {
          console.error(
            `❌ Failed to parse ${messageId}: ${result.error} (step: ${result.step})`,
          )
          expect(false).toBe(true) // Fail the test if any email fails to parse
        } else {
          console.log(`✅ Successfully parsed ${messageId}`)
          console.log(`   Subject: ${result.envelope.subject}`)
          console.log(`   From: ${result.envelope.from}`)
          console.log(`   Text: ${result.content.text.length} chars`)
          console.log(`   HTML: ${result.content.html.length} chars`)
          console.log(`   Markdown: ${result.content.markdown.length} chars`)

          // Validate structure
          expect(result.id).toBe(messageId)
          expect(result.envelope).toBeDefined()
          expect(result.content).toBeDefined()
          expect(result.content.text).toBeDefined()
          expect(result.content.html).toBeDefined()
          expect(result.content.markdown).toBeDefined()

          // At least some content should be present
          expect(
            result.content.text.length > 0 || result.content.html.length > 0,
          ).toBe(true)
        }
      }

      console.log(`🎯 Successfully parsed ${results.length} emails`)
    }, 180000)

    test("should handle parsing errors gracefully", async () => {
      const invalidMessageId = "invalid_id_for_testing"
      const result = await parseEmailById(gmail, invalidMessageId)

      expect("error" in result).toBe(true)
      if ("error" in result) {
        expect(result.messageId).toBe(invalidMessageId)
        expect(result.step).toBe("fetch")
        expect(result.error).toBeDefined()
        console.log(`✅ Correctly handled parsing error: ${result.error}`)
      }
    })
  })

  describe("Content Quality Validation", () => {
    test("should extract meaningful content from emails", async () => {
      for (const messageId of testData.messageIds) {
        const result = await parseEmailById(gmail, messageId)

        if ("error" in result) continue

        // Check that we got meaningful content
        const totalContentLength =
          result.content.text.length + result.content.html.length
        expect(totalContentLength).toBeGreaterThan(10) // Should have some actual content

        // Markdown should be the best version
        expect(result.content.markdown.length).toBeGreaterThan(0)

        // Subject should not be empty for real emails
        expect(result.envelope.subject).toBeDefined()
        expect(result.envelope.subject!.length).toBeGreaterThan(0)

        console.log(`📊 Content quality for ${messageId}:`)
        console.log(`   Total content: ${totalContentLength} chars`)
        console.log(
          `   Subject length: ${result.envelope.subject!.length} chars`,
        )
        console.log(
          `   Best content choice: ${result.content.markdown === result.content.html ? "HTML" : "Text"}`,
        )
      }
    }, 180000)
  })
})
