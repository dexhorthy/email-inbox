import type { gmail_v1 } from "googleapis";
import { google } from "googleapis";
import fs from "node:fs/promises";
import { b } from "../baml_client";

export const state = {
	// rules that will be updated by the agent via user
	rules: `
Mark as spam all emails that:
- are a cold outreach email
- are a sales/marketing email e.g. for an e-commerce site. 

do NOT mark as spam emails that:
- pertain to event notifications
- contain an authentication/authorization code e.g. for 2FA
- contain a "magic link" to sign in or similar.

`,
};
const tokenContent = await fs.readFile("gmail_token.json", "utf-8");
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

export async function handleOneEmail(email: gmail_v1.Schema$Message) {
	const headers = email.payload?.headers;
	const subject = headers?.find((h) => h.name === "Subject")?.value;
	const from = headers?.find((h) => h.name === "From")?.value;
	const date = headers?.find((h) => h.name === "Date")?.value;

	// Extract email body
	let body = "";
	if (email.payload?.body?.data) {
		body = Buffer.from(email.payload.body.data, "base64").toString();
	} else if (email.payload?.parts) {
		// Handle multipart messages
		for (const part of email.payload.parts) {
			if (part.mimeType === "text/plain" && part.body?.data) {
				body = Buffer.from(part.body.data, "base64").toString();
				break;
			}
		}
	}

	// Combine snippet and body for spam analysis
	const fullEmailContent = `${email.snippet || ""}\n\n${body}`;
	const isSpam = await b.IsSpam(fullEmailContent, state.rules);

	console.log(`email with snippet ${email.snippet} is spam: ${isSpam.is_spam} because 

        reasons: ${isSpam.spam_rules_matched.join(", ")}
        
        qualities: ${isSpam.spammy_qualities.join(", ")}
        `);

	if (isSpam.is_spam && isSpam.high_confidence) {
		console.log("Labeling email as SPAM");
		await labelEmail(email.id!, "SPAM");
	} else if (!isSpam.is_spam && isSpam.high_confidence) {
		console.log(
			"High confidence that email is not spam; proceeding to classification",
		);
		// TODO
	} else {
		console.log("unclear on if email is spam or not, asking for clarification");
		// TODO
	}
}

export async function labelEmail(
	messageId: string,
	labelName: "SPAM" | string,
) {
	let labelId: string;

	const systemLabels = ["SPAM"];
	if (systemLabels.includes(labelName)) {
		// Add the label to the message
		return await gmail.users.messages.modify({
			userId: "me",
			id: messageId,
			requestBody: {
				addLabelIds: [labelName],
			},
		});
	}
	try {
		const labelResponse = await gmail.users.labels.create({
			userId: "me",
			requestBody: {
				name: labelName,
				labelListVisibility: "labelShow",
				messageListVisibility: "show",
			},
		});
		labelId = labelResponse.data.id!;
	} catch (error: any) {
		if (error.code === 409) {
			// Label already exists
			// Get the existing label
			const labelsResponse = await gmail.users.labels.list({ userId: "me" });
			const existingLabel = labelsResponse.data.labels?.find(
				(l) => l.name === labelName,
			);
			if (!existingLabel) {
				throw new Error(`Failed to find ${labelName} label`);
			}
			labelId = existingLabel.id!;
		} else {
			throw error;
		}
	}

	// Add the label to the message
	await gmail.users.messages.modify({
		userId: "me",
		id: messageId,
		requestBody: {
			addLabelIds: [labelId],
		},
	});

	console.log("Successfully labeled the most recent email with @actions");
}
