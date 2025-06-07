#!/usr/bin/env bun
/**
 * One-off script to fetch the last 5 Gmail message IDs for E2E testing
 * This script will store the message IDs to disk for use in tests
 */

import fs from "node:fs/promises"
import path from "node:path"
import { google } from "googleapis"

async function fetchTestEmails() {
  console.log("🔍 Fetching last 5 Gmail message IDs for E2E testing...")

  try {
    // Read Gmail credentials
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

        const headers = email.data.payload?.headers || []
        const subject =
          headers.find((h) => h.name === "Subject")?.value || "No Subject"
        const from =
          headers.find((h) => h.name === "From")?.value || "Unknown Sender"
        const date =
          headers.find((h) => h.name === "Date")?.value || "Unknown Date"

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
