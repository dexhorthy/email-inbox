#!/usr/bin/env bun
/**
 * One-off script to fetch the last 5 Gmail message IDs for E2E testing
 * This script will store the message IDs to disk for use in tests
 */

import fs from "node:fs/promises"
import path from "node:path"
import { createGmailClient, extractHeaders } from "../emailParser"

async function fetchTestEmails() {
  console.log("🔍 Fetching last 5 Gmail message IDs for E2E testing...")

  try {
    const gmail = await createGmailClient()

    // Fetch the last 5 messages
    console.log("📧 Fetching messages from Gmail...")
    const messagesResponse = await gmail.users.messages.list({
      userId: "me",
      maxResults: 5,
    })

    const messages = messagesResponse.data.messages || []

    if (messages.length === 0) {
      console.log("❌ No messages found in Gmail")
      return
    }

    console.log(`📋 Found ${messages.length} messages`)

    // Extract message IDs
    const messageIds = messages.map((msg) => msg.id!).filter(Boolean)

    // Fetch basic info for each message for logging
    const messageInfo = []
    for (const messageId of messageIds) {
      try {
        const email = await gmail.users.messages.get({
          userId: "me",
          id: messageId,
          format: "metadata",
          metadataHeaders: ["Subject", "From", "Date"],
        })

        const headers = extractHeaders(email.data.payload!)
        const subject = headers.subject || "No Subject"
        const from = headers.from || "Unknown Sender"
        const date = headers.date || "Unknown Date"

        messageInfo.push({
          id: messageId,
          subject,
          from,
          date,
        })

        console.log(`  📨 ${messageId}: "${subject}" from ${from}`)
      } catch (error) {
        console.warn(`⚠️  Failed to fetch metadata for ${messageId}:`, error)
        messageInfo.push({
          id: messageId,
          subject: "Failed to fetch",
          from: "Unknown",
          date: "Unknown",
        })
      }
    }

    // Create test data directory
    const testDataDir = path.join(process.cwd(), "src", "test", "data")
    await fs.mkdir(testDataDir, { recursive: true })

    // Store message IDs and metadata
    const testData = {
      timestamp: new Date().toISOString(),
      messageIds,
      messages: messageInfo,
    }

    const testDataPath = path.join(testDataDir, "test-message-ids.json")
    await fs.writeFile(testDataPath, JSON.stringify(testData, null, 2))

    console.log(`✅ Stored ${messageIds.length} message IDs to ${testDataPath}`)
    console.log("🎯 Test data ready for E2E tests!")
  } catch (error) {
    console.error("❌ Failed to fetch test emails:", error)
    process.exit(1)
  }
}

// Run the script
fetchTestEmails()
