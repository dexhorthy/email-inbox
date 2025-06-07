// cli.ts lets you invoke the agent loop from the command line

import fs from "node:fs/promises";
import path from "node:path";
import { agentops } from "agentops";
import { Command } from "commander";
import dotenv from "dotenv";
import type { gmail_v1 } from "googleapis";
import { google } from "googleapis";
import { DatasetManager } from "./datasets";
import { handleOneEmail } from "./handleEmail";

// Load environment variables from .env file
dotenv.config();

interface EmailMessage {
	id: string;
	subject: string;
	from: string;
	date: string;
	snippet: string;
	body: {
		plain?: string;
		html?: string;
	};
}

interface GmailHeader {
	name: string;
	value: string;
}

function getEmailBody(parts: gmail_v1.Schema$MessagePart[] | undefined): {
	plain?: string;
	html?: string;
} {
	if (!parts) return {};

	const body: { plain?: string; html?: string } = {};

	for (const part of parts) {
		if (part.mimeType === "text/plain" && part.body?.data) {
			body.plain = Buffer.from(part.body.data, "base64").toString("utf-8");
		} else if (part.mimeType === "text/html" && part.body?.data) {
			body.html = Buffer.from(part.body.data, "base64").toString("utf-8");
		}

		// Recursively check nested parts
		if (part.parts) {
			const nestedBody = getEmailBody(part.parts);
			if (nestedBody.plain) body.plain = nestedBody.plain;
			if (nestedBody.html) body.html = nestedBody.html;
		}
	}

	return body;
}

export async function cliDumpEmails(numRecords = 5) {
	try {
		// Start a new dataset run
		const datasetManager = new DatasetManager();
		const runId = await datasetManager.startNewRun();
		console.log(`🗂️ Started dataset collection run: ${runId}`);

		// Read the token file
		const tokenPath = path.join(process.cwd(), "gmail_token.json");
		const tokenContent = await fs.readFile(tokenPath, "utf-8");
		const credentials = JSON.parse(tokenContent);

		// Create OAuth2 client
		const oauth2Client = new google.auth.OAuth2(
			credentials.client_id,
			credentials.client_secret,
			credentials.redirect_uri,
		);

		// Set credentials
		oauth2Client.setCredentials({
			access_token: credentials.access_token,
			refresh_token: credentials.refresh_token,
		});

		// Create Gmail API client
		const gmail = google.gmail({ version: "v1", auth: oauth2Client });

		// Get emails with specified limit
		const response = await gmail.users.messages.list({
			userId: "me",
			maxResults: numRecords,
		});

		const messages = response.data.messages || [];

		// Fetch full details for each message
		const emailDetails = await Promise.all(
			messages.map(async (message: gmail_v1.Schema$Message) => {
				const email = await gmail.users.messages.get({
					userId: "me",
					id: message.id!,
					format: "full", // Get the full message including body
				});

				const headers = email.data.payload?.headers as
					| GmailHeader[]
					| undefined;
				const subject =
					headers?.find((h) => h.name === "Subject")?.value || "No Subject";
				const from =
					headers?.find((h) => h.name === "From")?.value || "Unknown Sender";
				const date =
					headers?.find((h) => h.name === "Date")?.value || "Unknown Date";

				// Get the email body
				const body = getEmailBody(email.data.payload?.parts);

				return {
					id: message.id!,
					subject,
					from,
					date,
					snippet: email.data.snippet,
					body,
				} as EmailMessage;
			}),
		);

		// Print the emails
		console.log("\n📧 Processing Emails\n");
		for (const [index, email] of emailDetails.entries()) {
			console.log(`\n📬 Email ${index + 1}/${emailDetails.length}`);
			console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
			console.log(`📝 Subject: ${email.subject}`);
			console.log(`👤 From: ${email.from}`);
			console.log(`🕒 Date: ${email.date}`);
			console.log(`📋 Preview: ${email.snippet}`);
			console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

			try {
				await handleOneEmail(email);
			} catch (error) {
				console.error(`❌ Error handling email ${email.id}:`, error);
			}
		}
	} catch (error) {
		console.error("Error fetching emails:", error);
		throw error;
	}
}

async function labelLastEmailAsActions() {
	try {
		// Read the token file
		const tokenPath = path.join(process.cwd(), "gmail_token.json");
		const tokenContent = await fs.readFile(tokenPath, "utf-8");
		const credentials = JSON.parse(tokenContent);

		// Create OAuth2 client
		const oauth2Client = new google.auth.OAuth2(
			credentials.client_id,
			credentials.client_secret,
			credentials.redirect_uri,
		);

		// Set credentials
		oauth2Client.setCredentials({
			access_token: credentials.access_token,
			refresh_token: credentials.refresh_token,
		});

		// Create Gmail API client
		const gmail = google.gmail({ version: "v1", auth: oauth2Client });

		// Get the most recent email
		const response = await gmail.users.messages.list({
			userId: "me",
			maxResults: 1,
			q: "in:inbox", // Only search in inbox
		});

		const messages = response.data.messages;
		if (!messages || messages.length === 0) {
			console.log("No emails found in inbox");
			return;
		}

		const messageId = messages[0].id!;

		console.log("handling messages!");
		for (const message of messages) {
			await handleOneEmail(message);
		}
		console.log("done handling messages");
	} catch (error) {
		console.error("Error labeling email:", error);
		throw error;
	}
}

if (require.main === module) {
	const program = new Command();

	program
		.name("email-inbox")
		.description("CLI to process and classify emails")
		.version("1.0.0");

	program
		.command("process")
		.description("Process emails from Gmail inbox")
		.option("-n, --num-records <number>", "Number of emails to process", "5")
		.action(async (options) => {
			await agentops.init();
			try {
				const numRecords = Number.parseInt(options.numRecords, 10);
				if (Number.isNaN(numRecords) || numRecords < 1) {
					console.error("❌ Number of records must be a positive integer");
					process.exit(1);
				}
				await cliDumpEmails(numRecords);
			} catch (error) {
				console.error("Error:", error);
				process.exit(1);
			}
		});

	program.parse();
}
