// cli.ts lets you invoke the agent loop from the command line

import chalk from "chalk";
import dotenv from "dotenv";
import fs from "fs/promises";
import type { gmail_v1 } from "googleapis";
import { google } from "googleapis";
import path from "path";
import { type Event, Thread, agentLoop, handleNextStep } from "../src/agent";
import { handleOneEmail } from "./handleEmail";
import { FileSystemThreadStore } from "./state";

// Load environment variables from .env file
dotenv.config();

const threadStore = new FileSystemThreadStore();

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

function getEmailBody(parts: gmail_v1.Schema$MessagePart[] | undefined): { plain?: string; html?: string } {
	if (!parts) return {};

	const body: { plain?: string; html?: string } = {};

	for (const part of parts) {
		if (part.mimeType === 'text/plain' && part.body?.data) {
			body.plain = Buffer.from(part.body.data, 'base64').toString('utf-8');
		} else if (part.mimeType === 'text/html' && part.body?.data) {
			body.html = Buffer.from(part.body.data, 'base64').toString('utf-8');
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

export async function cliDumpEmails() {
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

		// Get the last 50 emails
		const response = await gmail.users.messages.list({
			userId: "me",
			maxResults: 50,
		});

		const messages = response.data.messages || [];

		// Fetch full details for each message
		const emailDetails = await Promise.all(
			messages.map(async (message: gmail_v1.Schema$Message) => {
				const email = await gmail.users.messages.get({
					userId: "me",
					id: message.id!,
					format: 'full'  // Get the full message including body
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
					body
				} as EmailMessage;
			}),
		);

		// Print the emails
		console.log("\nLast 50 Emails:\n");
		emailDetails.forEach((email: EmailMessage, index: number) => {
			console.log(`[${index + 1}] Subject: ${email.subject}`);
			console.log(`    From: ${email.from}`);
			console.log(`    Date: ${email.date}`);
			console.log(`    Preview: ${email.snippet}`);
			if (email.body.plain) {
				console.log(`    Body (plain): ${email.body.plain.substring(0, 100)}...`);
			}
			if (email.body.html) {
				console.log(`    Body (HTML): ${email.body.html.substring(0, 100)}...`);
			}
			console.log();
		});
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
	(async () => {
		try {
			await cliDumpEmails();
			await labelLastEmailAsActions();
		} catch (error) {
			console.error("Error:", error);
			process.exit(1);
		}
	})();
}
