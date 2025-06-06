import type { gmail_v1 } from "googleapis";
import { google } from "googleapis";
import fs from "node:fs/promises";
import TurndownService from "turndown";
import { b } from "../baml_client";
import { checkWithHuman } from "./checkWithHuman";
import { contactHuman, getDraftFeedback } from "./contactHuman";

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

const turndownService = new TurndownService();

export async function handleOneEmail(emailInfo: gmail_v1.Schema$Message) {
	const email = await gmail.users.messages.get({
		userId: "me",
		id: emailInfo.id!,
	});

	const headers = email.data.payload?.headers;
	const subject = headers?.find((h) => h.name === "Subject")?.value;
	const from = headers?.find((h) => h.name === "From")?.value;
	const date = headers?.find((h) => h.name === "Date")?.value;

	const body = {
		text: "",
		html: "",
	};
	if (!email.data.payload) return;
	for (const part of email.data.payload.parts || []) {
		if (part.mimeType === "multipart/alternative") {
			for (const p of part?.parts || []) {
				if (p.mimeType === "text/plain" && p.body?.data) {
					body.text = Buffer.from(p.body.data, "base64").toString();
					//d text/plain part", body.text);
				} else if (p.mimeType === "text/html" && p.body?.data) {
					body.html = Buffer.from(p.body.data, "base64").toString();
					//					console.log("found text/html part", body.html);
				}
			}
		} else {
			//	console.log("found UNUSABLE part", part.mimeType);
		}
	}

	const [text, html] = await Promise.all([
		b.HtmlToMarkdown(body.html),
		b.HtmlToMarkdown(body.html),
	]);
	body.text = text.markdown;
	body.html = html.markdown;

	const envelope = `
	Subject: ${subject}
	From: ${from}
	Date: ${date}
	`;

	// Combine snippet and body for spam analysis
	//console.log("fullEmailContent", envelope, body.html, body.text);
	const isSpam = await b.IsSpam(envelope, body.html, body.text, state.rules);

	console.log(`email is spam: ${isSpam.is_spam} because 

        reasons: ${isSpam.spam_rules_matched.join(", ")}
        
        qualities: ${isSpam.spammy_qualities.join(", ")}
        `);

	// Decide if the email is spam
	if (isSpam.is_spam) {
		console.log("unclear on if email is spam or not, asking for clarification");
		const { updatedRuleset, approved } = await checkWithHuman({
			from: from ?? "Unknown Sender",
			subject: subject ?? "Unknown Subject",
			body: body.html.length > body.text.length ? body.html : body.text,
			proposedClassification: isSpam,
			existingRuleset: state.rules,
		});

		state.rules = updatedRuleset ?? state.rules;

		if (isSpam.is_spam && approved) {
			// TODO push to spam
			console.log("pushing to spam");
			await labelEmail(emailInfo.id!, "SPAM");
			return;
		}

		// Otherwise continue to classification
		console.log("continuing to classification");
	}

	const classification = await b.Classify(
		subject ?? "Unknown Subject",
		from ?? "Unknown Sender",
		body.html,
		state.rules,
	);
	console.log("classification", classification);
	switch (classification.classification) {
		case "read_today":
			console.log("labeling as read_today");
			await labelEmail(emailInfo.id!, "@read_today");
			break;
		case "read_later":
			console.log("labeling as read_later");
			await labelEmail(emailInfo.id!, "@read_later");
			break;
		case "notify_immediately":
			// TODO draft the proposed action, and then ask the user to approve it
			await contactHuman(classification.message);
			break;
		case "draft_reply":
			console.log("drafting reply");
			// TODO forward the email to the use
			await getDraftFeedback({
				from: from ?? "Unknown Sender",
				subject: subject ?? "Unknown Subject",
				summary: classification.summary,
				body: classification.body,
				classification: "draft_reply",
			});
			break;
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
