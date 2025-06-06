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
}

interface GmailHeader {
	name: string;
	value: string;
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

				return {
					id: message.id!,
					subject,
					from,
					date,
					snippet: email.data.snippet,
				} as EmailMessage;
			}),
		);

		// Print the emails
		console.log("\nLast 50 Emails:\n");
		emailDetails.forEach((email: EmailMessage, index: number) => {
			console.log(`[${index + 1}] Subject: ${email.subject}`);
			console.log(`    From: ${email.from}`);
			console.log(`    Date: ${email.date}`);
			console.log(`    Preview: ${email.snippet}\n`);
		});
	} catch (error) {
		console.error("Error fetching emails:", error);
		throw error;
	}
}

export async function cliOuterLoop(message: string) {
	// Create a new thread with the user's message as the initial event
	const thread = new Thread([{ type: "user_input", data: message }]);
	const threadId = await threadStore.create(thread);

	// Run the agent loop with the thread

	// loop until ctrl+c
	// optional, you could exit on done_for_now and print the final result
	// while (lastEvent.data.intent !== "done_for_now") {
	while (true) {
		const newThread = await agentLoop(thread);
		await threadStore.update(threadId, newThread);
		const lastEvent = newThread.lastEvent();

		// everything on CLI
		const responseEvent = await askHumanCLI(lastEvent);
		newThread.events.push(responseEvent);
		// if (lastEvent.data.intent === "request_approval_from_manager") {
		//     const responseEvent = await askManager(lastEvent);
		//     thread.events.push(responseEvent);
		// } else {
		//     const responseEvent = await askHumanCLI(lastEvent);
		//     thread.events.push(responseEvent);
		// }
		await threadStore.update(threadId, newThread);
	}
}

export async function cli() {
	// Get command line arguments, skipping the first two (node and script name)
	const args = process.argv.slice(2);

	const message = args.length === 0 ? "hello!" : args.join(" ");

	await cliOuterLoop(message);
}

// async function askManager(lastEvent: Event): Promise<Event> {
//     const hl = humanlayer({
//         contactChannel: {
//              email: {
//                 address: process.env.HUMANLAYER_EMAIL_ADDRESS || "manager@example.com"
//             }
//         }
//     })
//     const resp = await hl.fetchHumanResponse({
//         spec: {
//             msg: lastEvent.data.message
//         }
//      })
//      return {
//         type: "manager_response",
//         data: resp
//      }
// }

async function askHumanCLI(lastEvent: Event): Promise<Event> {
	switch (lastEvent.data.intent) {
		case "divide":
			const response = await approveCLI(
				`agent wants to run ${chalk.green(JSON.stringify(lastEvent.data))}\nPress Enter to approve, or type feedback to cancel:`,
			);
			if (response.approved) {
				const thread = new Thread([lastEvent]);
				const result = await handleNextStep(lastEvent.data, thread);
				return result.events[result.events.length - 1];
			} else {
				return {
					type: "tool_response",
					data: `user denied operation ${lastEvent.data.intent} with feedback: ${response.comment}`,
				};
			}
		case "request_more_information":
		case "request_approval_from_manager":
		case "done_for_now":
			const message = await messageCLI(lastEvent.data.message);
			return {
				type: "tool_response",
				data: message,
			};
		default:
			throw new Error(`unknown tool in outer loop: ${lastEvent.data.intent}`);
	}
}

type Approval =
	| {
			approved: true;
	  }
	| {
			approved: false;
			comment: string;
	  };
async function messageCLI(message: string): Promise<string> {
	const readline = require("readline").createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise((resolve) => {
		readline.question(`${message}\n> `, (answer: string) => {
			readline.close();
			resolve(answer);
		});
	});
}

async function approveCLI(message: string): Promise<Approval> {
	const readline = require("readline").createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise((resolve) => {
		readline.question(`${message}\n> `, (answer: string) => {
			readline.close();
			// If the answer is empty (just pressed enter), treat it as approval
			if (answer.trim() === "") {
				resolve({ approved: true });
			} else {
				// Any non-empty response is treated as rejection with feedback
				resolve({ approved: false, comment: answer });
			}
		});
	});
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
