import { expect, test } from "bun:test"
import fs from "node:fs"
import type { gmail_v1 } from "googleapis"
import { parseEmailBody } from "../emailParser"

test("parseEmailBody should handle actual multipart/report payload", () => {
  // Load the actual payload from the debug file
  const actualPayload: gmail_v1.Schema$MessagePart = JSON.parse(
    fs.readFileSync("src/test/data/debug-payload.json", "utf-8"),
  )

  console.log("Testing parseEmailBody with ACTUAL failing payload...")
  console.log("Top level mimeType:", actualPayload.mimeType)
  console.log("Parts count:", actualPayload.parts?.length)

  const result = parseEmailBody(actualPayload)

  console.log("Result:", result)
  console.log("Text length:", result.text.length)
  console.log("HTML length:", result.html.length)

  // The payload should extract content successfully
  expect(result.text.length).toBeGreaterThan(0)
  expect(result.html.length).toBeGreaterThan(0)

  // Should contain expected content
  expect(result.text).toContain("Address not found")
  expect(result.html).toContain("Address not found")

  console.log("✅ Text parsed successfully!")
  console.log("Text content:", result.text.substring(0, 100))
  console.log("✅ HTML parsed successfully!")
  console.log("HTML content:", result.html.substring(0, 100))
})
