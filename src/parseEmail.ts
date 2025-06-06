import { gmail_v1 } from "googleapis";
import {b } from "../baml_client"

const state = {
    // rules that will be updated by the agent via user
    rules: `
- drop all emails with an unsubscribe link

`
}

async function parseOneEmail(email: gmail_v1.Schema$Message) {
    const headers = email.payload?.headers;
    const subject = headers?.find(h => h.name === 'Subject')?.value;
    const from = headers?.find(h => h.name === 'From')?.value;
    const date = headers?.find(h => h.name === 'Date')?.value;

    // Extract email body
    let body = '';
    if (email.payload?.body?.data) {
        body = Buffer.from(email.payload.body.data, 'base64').toString();
    } else if (email.payload?.parts) {
        // Handle multipart messages
        for (const part of email.payload.parts) {
            if (part.mimeType === 'text/plain' && part.body?.data) {
                body = Buffer.from(part.body.data, 'base64').toString();
                break;
            }
        }
    }

    const isSpam = await b.IsSpam(email.snippet || '', state.rules, body);
}