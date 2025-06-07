import { type SpamResult, b } from "@/baml_client";
import { loadRules, saveRules } from "./handleEmail";

export const updateRules = async (
	email: string,
	proposedClassification: SpamResult,
	humanFeedback: string,
	existingRuleset: string,
): Promise<string> => {
	let attempt = 1;
	while (attempt < 3) {
		const rulesUpdate = await b.UpdateRulesFromSpamResult(
			email,
			proposedClassification,
			humanFeedback,
			existingRuleset,
		);

		const rules = existingRuleset;

		if (rulesUpdate.old_string && rules.includes(rulesUpdate.old_string)) {
			return rules.replace(rulesUpdate.old_string, rulesUpdate.new_string);
		}
		console.log(
			`Rule ${rulesUpdate.old_string} not found in ruleset, trying again`,
		);
		attempt++;
	}

	throw new Error("Failed to update rules after 3 attempts");
};

if (require.main === module) {
	// test for update rules
	console.log("existing ruleset:");
	console.log(await loadRules());
	const result = await updateRules(
		"check out these dope memes",
		{
			is_spam: true,
			spam_rules_matched: ["memes are only good sometimes"],
			spammy_qualities: ["memes"],
			high_confidence: false,
		},
		"memes are always good",
		`- memes are only good sometimes
         - emails with unsubscribe links are always spam
         `,
	);
	console.log("updated ruleset:");

	await saveRules(result);
}
