#!/usr/bin/env bun
/**
 * Debug script to investigate email parsing issues
 */

import fs from "node:fs/promises"
import path from "node:path"
import {
  convertToMarkdown,
  createGmailClient,
  parseEmailBody,
} from "../emailParser"

async function debugEmailParsing() {
  console.log("🔍 Debugging email parsing...")

  // Load test data
  const testDataPath = path.join(
    process.cwd(),
    "src",
    "test",
    "data",
    "test-message-ids.json",
  )
  const testDataContent = await fs.readFile(testDataPath, "utf-8")
  const testData = JSON.parse(testDataContent)

  const gmail = await createGmailClient()

  // Debug the first email that has HTML content
  const messageId = testData.messageIds[0] // 197483b8a28abd8f

  console.log(`\n📧 Debugging email: ${messageId}`)

  // Fetch full email
  const email = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
  })

  const payload = email.data.payload!

  console.log("\n📋 Email Structure:")
  console.log(`   MIME Type: ${payload.mimeType}`)
  console.log(`   Has Parts: ${payload.parts ? payload.parts.length : 0}`)
  console.log(`   Has Body Data: ${payload.body?.data ? "YES" : "NO"}`)
  console.log(`   Body Size: ${payload.body?.size || 0} bytes`)

  if (payload.parts) {
    console.log("\n🔍 Parts Analysis:")
    payload.parts.forEach((part, i) => {
      console.log(`   Part ${i}:`)
      console.log(`     MIME Type: ${part.mimeType}`)
      console.log(`     Has Body Data: ${part.body?.data ? "YES" : "NO"}`)
      console.log(`     Body Size: ${part.body?.size || 0} bytes`)
      console.log(`     Has Sub-Parts: ${part.parts ? part.parts.length : 0}`)

      if (part.parts) {
        part.parts.forEach((subPart, j) => {
          console.log(`       Sub-Part ${j}:`)
          console.log(`         MIME Type: ${subPart.mimeType}`)
          console.log(
            `         Has Body Data: ${subPart.body?.data ? "YES" : "NO"}`,
          )
          console.log(`         Body Size: ${subPart.body?.size || 0} bytes`)
        })
      }
    })
  }

  console.log("\n🔧 Testing parseEmailBody function:")
  const body = parseEmailBody(payload)
  console.log(`   Text length: ${body.text.length} chars`)
  console.log(`   HTML length: ${body.html.length} chars`)

  if (body.text.length > 0) {
    console.log(`   Text preview: ${body.text.substring(0, 200)}...`)
  }
  if (body.html.length > 0) {
    console.log(`   HTML preview: ${body.html.substring(0, 200)}...`)
  }

  console.log("\n🧪 Testing BAML conversion with actual content:")
  if (body.html.length > 0) {
    console.log(`   Sending ${body.html.length} chars of HTML to BAML...`)
    try {
      const result = await convertToMarkdown("", body.html)
      console.log(`   BAML returned: ${result.html.length} chars of markdown`)
      if (result.html.length > 0) {
        console.log(`   Markdown preview: ${result.html.substring(0, 200)}...`)
      }
    } catch (error) {
      console.error(`   BAML error: ${error}`)
    }
  } else {
    console.log("   No HTML content to send to BAML")
  }
}

// Run the debug
debugEmailParsing().catch(console.error)
