import { expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import type { gmail_v1 } from "googleapis"
import { parseEmailBody } from "../emailParser"

// Get all email JSON files from test/data directory
const testDataDir = "src/test/data"
const emailFiles = fs
  .readdirSync(testDataDir)
  .filter((file) => file.startsWith("email-") && file.endsWith(".json"))
  .sort()

console.log(`Found ${emailFiles.length} email files to test:`)
emailFiles.forEach((file) => console.log(`  - ${file}`))

test("parseEmailBody should handle all dumped email payloads", () => {
  const results: Array<{
    filename: string
    messageId: string
    mimeType: string
    textLength: number
    htmlLength: number
    success: boolean
    error?: string
  }> = []

  for (const filename of emailFiles) {
    const messageId = filename.replace("email-", "").replace(".json", "")
    console.log(`\n📧 Testing ${filename} (ID: ${messageId})`)

    try {
      // Load the email payload
      const filePath = path.join(testDataDir, filename)
      const emailPayload: gmail_v1.Schema$MessagePart = JSON.parse(
        fs.readFileSync(filePath, "utf-8"),
      )

      console.log(`   MIME Type: ${emailPayload.mimeType}`)
      console.log(`   Parts: ${emailPayload.parts?.length || 0}`)

      // Parse the email body
      const result = parseEmailBody(emailPayload)

      console.log(`   Text length: ${result.text.length}`)
      console.log(`   HTML length: ${result.html.length}`)

      if (result.text.length > 0) {
        console.log(
          `   ✅ Text extracted: "${result.text.substring(0, 50)}..."`,
        )
      } else {
        console.log("   ⚠️  No text content extracted")
      }

      if (result.html.length > 0) {
        console.log(
          `   ✅ HTML extracted: "${result.html.substring(0, 50)}..."`,
        )
      } else {
        console.log("   ⚠️  No HTML content extracted")
      }

      results.push({
        filename,
        messageId,
        mimeType: emailPayload.mimeType || "unknown",
        textLength: result.text.length,
        htmlLength: result.html.length,
        success: true,
      })
    } catch (error) {
      console.log(`   ❌ Error parsing: ${error}`)
      results.push({
        filename,
        messageId,
        mimeType: "error",
        textLength: 0,
        htmlLength: 0,
        success: false,
        error: String(error),
      })
    }
  }

  // Print summary
  console.log("\n📊 PARSING RESULTS SUMMARY")
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

  const successful = results.filter((r) => r.success)
  const withText = results.filter((r) => r.textLength > 0)
  const withHtml = results.filter((r) => r.htmlLength > 0)
  const withBoth = results.filter((r) => r.textLength > 0 && r.htmlLength > 0)
  const withNeither = results.filter(
    (r) => r.textLength === 0 && r.htmlLength === 0,
  )

  console.log(`Total emails: ${results.length}`)
  console.log(`Successfully parsed: ${successful.length}`)
  console.log(`With text content: ${withText.length}`)
  console.log(`With HTML content: ${withHtml.length}`)
  console.log(`With both text & HTML: ${withBoth.length}`)
  console.log(`With no content: ${withNeither.length}`)

  // Print MIME type breakdown
  const mimeTypes = new Map<string, number>()
  results.forEach((r) => {
    const count = mimeTypes.get(r.mimeType) || 0
    mimeTypes.set(r.mimeType, count + 1)
  })

  console.log("\nMIME Type breakdown:")
  Array.from(mimeTypes.entries())
    .sort()
    .forEach(([mimeType, count]) => {
      console.log(`  ${mimeType}: ${count}`)
    })

  // Print emails with no content for investigation
  if (withNeither.length > 0) {
    console.log("\n⚠️  Emails with no extracted content:")
    withNeither.forEach((r) => {
      console.log(`  - ${r.filename} (${r.mimeType})`)
    })
  }

  // Assertions - at least 70% should have some content
  const contentExtractionRate =
    (withText.length + withHtml.length - withBoth.length) / results.length
  console.log(
    `\nContent extraction rate: ${(contentExtractionRate * 100).toFixed(1)}%`,
  )

  expect(successful.length).toBe(results.length) // All should parse without errors
  expect(contentExtractionRate).toBeGreaterThan(0.7) // At least 70% should have content
})
