import fs from "node:fs/promises"
import type { gmail_v1 } from "googleapis"
import { google } from "googleapis"
import { b } from "../baml_client"

export interface ParsedEmail {
  id: string
  envelope: {
    subject?: string
    from?: string
    date?: string
    messageId: string
  }
  content: {
    text: string
    html: string
    markdown: string
  }
  rawPayload?: gmail_v1.Schema$MessagePart
}

export interface EmailParsingError {
  messageId: string
  error: string
  step: "fetch" | "parse_headers" | "parse_body" | "convert_markdown"
}

/**
 * Create Gmail API client from credentials
 */
export async function createGmailClient(): Promise<gmail_v1.Gmail> {
  const tokenContent = await fs.readFile("gmail_token.json", "utf-8")
  const credentials = JSON.parse(tokenContent)

  const oauth2Client = new google.auth.OAuth2(
    credentials.client_id,
    credentials.client_secret,
    credentials.redirect_uri,
  )

  oauth2Client.setCredentials({
    access_token: credentials.access_token,
    refresh_token: credentials.refresh_token,
  })

  return google.gmail({ version: "v1", auth: oauth2Client })
}

/**
 * Extract headers from Gmail message
 */
export function extractHeaders(payload: gmail_v1.Schema$MessagePart) {
  const headers = payload.headers || []
  return {
    subject: headers.find((h) => h.name === "Subject")?.value,
    from: headers.find((h) => h.name === "From")?.value,
    date: headers.find((h) => h.name === "Date")?.value,
    messageId: headers.find((h) => h.name === "Message-ID")?.value,
  }
}

/**
 * Parse email body parts recursively
 */
export function parseEmailBody(payload: gmail_v1.Schema$MessagePart): {
  text: string
  html: string
} {
  const body = { text: "", html: "" }

  if (!payload) return body

  // Handle direct body data
  if (payload.body?.data) {
    if (payload.mimeType === "text/plain") {
      body.text = Buffer.from(payload.body.data, "base64").toString()
    } else if (payload.mimeType === "text/html") {
      body.html = Buffer.from(payload.body.data, "base64").toString()
    }
  }

  // Handle multipart messages
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.body?.data) {
        if (part.mimeType === "text/plain") {
          body.text = Buffer.from(part.body.data, "base64").toString()
        } else if (part.mimeType === "text/html") {
          body.html = Buffer.from(part.body.data, "base64").toString()
        }
      }

      // Handle nested multipart (like multipart/alternative)
      if (
        part.mimeType === "multipart/alternative" ||
        part.mimeType === "multipart/mixed"
      ) {
        const nestedBody = parseEmailBody(part)
        if (nestedBody.text && !body.text) body.text = nestedBody.text
        if (nestedBody.html && !body.html) body.html = nestedBody.html
      }
    }
  }

  return body
}

/**
 * Convert HTML to markdown using BAML
 */
export async function convertToMarkdown(text: string, html: string) {
  const calls: Promise<{ markdown: string }>[] = []
  const results = { text: "", html: "" }

  // Only call BAML if we have content to convert
  if (text.trim().length > 0) {
    calls.push(b.HtmlToMarkdown(text))
  } else {
    calls.push(Promise.resolve({ markdown: "" }))
  }

  if (html.trim().length > 0) {
    calls.push(b.HtmlToMarkdown(html))
  } else {
    calls.push(Promise.resolve({ markdown: "" }))
  }

  const [textMarkdown, htmlMarkdown] = await Promise.all(calls)

  return {
    text: textMarkdown.markdown,
    html: htmlMarkdown.markdown,
  }
}

/**
 * Parse a single email by ID with comprehensive error handling
 */
export async function parseEmailById(
  gmail: gmail_v1.Gmail,
  messageId: string,
): Promise<ParsedEmail | EmailParsingError> {
  try {
    // Fetch the email
    const email = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
    })

    if (!email.data.payload) {
      return {
        messageId,
        error: "No payload found in email",
        step: "fetch",
      }
    }

    const payload = email.data.payload

    // Extract headers
    let envelope: ParsedEmail["envelope"]
    try {
      const headers = extractHeaders(payload)
      envelope = {
        subject: headers.subject,
        from: headers.from,
        date: headers.date,
        messageId: messageId, // Use Gmail message ID
      }
    } catch (error) {
      return {
        messageId,
        error: `Failed to parse headers: ${error}`,
        step: "parse_headers",
      }
    }

    // Parse body
    let body: { text: string; html: string }
    try {
      body = parseEmailBody(payload)
    } catch (error) {
      return {
        messageId,
        error: `Failed to parse body: ${error}`,
        step: "parse_body",
      }
    }

    // Convert to markdown
    let markdownContent: { text: string; html: string }
    try {
      markdownContent = await convertToMarkdown(body.text, body.html)
    } catch (error) {
      return {
        messageId,
        error: `Failed to convert to markdown: ${error}`,
        step: "convert_markdown",
      }
    }

    return {
      id: messageId,
      envelope,
      content: {
        text: markdownContent.text,
        html: markdownContent.html,
        markdown:
          markdownContent.html.length > markdownContent.text.length
            ? markdownContent.html
            : markdownContent.text,
      },
      rawPayload: payload,
    }
  } catch (error) {
    return {
      messageId,
      error: `Failed to fetch email: ${error}`,
      step: "fetch",
    }
  }
}
