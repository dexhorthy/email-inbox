import fs from "node:fs/promises";
import path from "node:path";
import type { gmail_v1 } from "googleapis";

export interface EmailDataPoint {
	id: string;
	timestamp: string;
	envelope: {
		subject?: string;
		from?: string;
		date?: string;
		messageId: string;
	};
	content: {
		text: string;
		html: string;
		markdown: string;
	};
	spam_analysis: {
		is_spam: boolean;
		high_confidence: boolean;
		spam_rules_matched: string[];
		spammy_qualities: string[];
	};
	human_interaction?: {
		timestamp: string;
		approved: boolean;
		feedback?: string;
		updated_ruleset?: string;
	};
	final_classification: {
		category:
			| "spam"
			| "read_today"
			| "read_later"
			| "notify_immediately"
			| "draft_reply";
		high_confidence?: boolean;
		summary?: string;
		message?: string;
	};
	labels_applied: string[];
}

export class DatasetManager {
	private datasetsDir: string;
	private currentRunDir: string;

	constructor() {
		this.datasetsDir = path.join(process.cwd(), "datasets");
		this.currentRunDir = "";
	}

	async startNewRun(): Promise<string> {
		await fs.mkdir(this.datasetsDir, { recursive: true });
		const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
		const runId = `run-${timestamp}`;
		this.currentRunDir = path.join(this.datasetsDir, runId);
		await fs.mkdir(this.currentRunDir, { recursive: true });
		return runId;
	}

	async saveEmailData(emailData: EmailDataPoint): Promise<void> {
		if (!this.currentRunDir) {
			throw new Error("No run started. Call startNewRun() first.");
		}

		const filename = `${emailData.id}.json`;
		const filepath = path.join(this.currentRunDir, filename);
		await fs.writeFile(filepath, JSON.stringify(emailData, null, 2));
	}

	async loadEmailData(
		runId: string,
		emailId: string,
	): Promise<EmailDataPoint | null> {
		const filepath = path.join(this.datasetsDir, runId, `${emailId}.json`);
		try {
			const data = await fs.readFile(filepath, "utf8");
			return JSON.parse(data);
		} catch {
			return null;
		}
	}

	async listRuns(): Promise<string[]> {
		try {
			const entries = await fs.readdir(this.datasetsDir, {
				withFileTypes: true,
			});
			return entries
				.filter((entry) => entry.isDirectory())
				.map((entry) => entry.name)
				.sort();
		} catch {
			return [];
		}
	}

	async getRunSummary(
		runId: string,
	): Promise<{ total: number; spam: number; notSpam: number }> {
		const runDir = path.join(this.datasetsDir, runId);
		try {
			const files = await fs.readdir(runDir);
			const jsonFiles = files.filter((f) => f.endsWith(".json"));

			let spam = 0;
			let notSpam = 0;

			for (const file of jsonFiles) {
				const data = await this.loadEmailData(runId, file.replace(".json", ""));
				if (data) {
					if (data.final_classification.category === "spam") {
						spam++;
					} else {
						notSpam++;
					}
				}
			}

			return { total: jsonFiles.length, spam, notSpam };
		} catch {
			return { total: 0, spam: 0, notSpam: 0 };
		}
	}
}
