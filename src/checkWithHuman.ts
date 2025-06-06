import type { SpamResult } from "@/baml_client";
import { humanlayer } from "@humanlayer/sdk";
import { updateRules } from "./updateRules";

type CheckWithHumanInput = {
	from: string;
	subject: string;
	body: string;
	proposedClassification: SpamResult;
	existingRuleset: string;
};

type CheckWithHumanOutput = {
	updatedRuleset?: string | undefined;
	approved: boolean;
};

/**
 * returns the updated ruleset if the human rejects the proposed classification,
 * else undefined if approved
 */
export const checkWithHuman = async (
	input: CheckWithHumanInput,
): Promise<CheckWithHumanOutput> => {
	const hl = humanlayer();
	const response = await hl.fetchHumanApproval({
		spec: {
			fn: "validate_spam_classification",
			kwargs: {
				from: input.from,
				subject: input.subject,
				body: input.body,
				classification: input.proposedClassification.is_spam
					? "spam"
					: "not spam",
				spamRulesMatched: input.proposedClassification.spam_rules_matched,
				spammyQualities: input.proposedClassification.spammy_qualities,
			},
			channel: {
				slack: {
					channel_or_user_id: "",
					experimental_slack_blocks: true,
				},
			},
		},
	});

	if (response.approved) {
		return {
			approved: true,
		};
	} else {
		const updatedRuleset = await updateRules(
			input.body,
			input.proposedClassification,
			response.comment!,
			input.existingRuleset,
		);
		return {
			updatedRuleset,
			approved: false,
		};
	}
};

if (require.main === module) {
	const input: CheckWithHumanInput = {
		from: "test@test.com",
		subject: "check out these dope memes",
		body: "check out these dope memes",
		proposedClassification: {
			is_spam: true,
			spam_rules_matched: ["memes are only good sometimes"],
			spammy_qualities: ["memes"],
			high_confidence: false,
		},
		existingRuleset: `- memes are only good sometimes
         - emails with unsubscribe links are always spam
         `,
	};
	await checkWithHuman(input);
}
