import { b, SpamResult } from "@/baml_client";
import { state } from "./parseEmail";

export const updateRules = async (
    email: string,
    proposedClassification: SpamResult,
    humanFeedback: string,
    existingRuleset: string
) => {
    let attempt = 1
    while (attempt < 3) {
        const rulesUpdate = await b.UpdateRulesFromSpamResult(email, proposedClassification, humanFeedback, existingRuleset)

        const rules = state.rules

        if (rulesUpdate.old_string && rules.includes(rulesUpdate.old_string)) {
            state.rules = rules.replace(rulesUpdate.old_string, rulesUpdate.new_string)
            break
        } else {
            console.log(`Rule ${rulesUpdate.old_string} not found in ruleset, trying again`)
            attempt++
        }
    }

    throw new Error(`Failed to update rules after 3 attempts`)

}

if (require.main === module) {
    const result = await updateRules(
        "check out these dope memes",
        { is_spam: true, spam_rules_matched: ["test"], spammy_qualities: [], high_confidence: false },
        "memes are always good",
        `- memes are only good sometimes
         - emails with unsubscribe links are always spam
         `,
    )
    console.log(result)
}