import { SpamResult } from "@/baml_client"
import { humanlayer } from "@humanlayer/sdk"
import { updateRules } from "./updateRules"

type CheckWithHumanInput = {
    from: string
    subject: string
    body: string
    proposedClassification: SpamResult
    existingRuleset: string
}

type CheckWithHumanOutput = {
    updatedRuleset?: string|undefined
    approved: boolean
}

/**
 * returns the updated ruleset if the human rejects the proposed classification, 
 * else undefined if approved
 */
export const checkWithHuman = async (input: CheckWithHumanInput): Promise<CheckWithHumanOutput> => {
    const hl = humanlayer()
    const response = await hl.fetchHumanApproval({
        spec: {
            fn: "validate_spam_classification",
            kwargs: {
                from: input.from,
                subject: input.subject,
                body: input.body,
                classification: input.proposedClassification.is_spam ? "spam" : "not spam",
                spamRulesMatched: input.proposedClassification.spam_rules_matched,
                spammyQualities: input.proposedClassification.spammy_qualities,
            },
        },
    })

    if (response.approved) {
        return {
            approved: true,
        }
    } else {
        const updatedRuleset = await updateRules(input.from, input.subject, input.body, input.proposedClassification, input.existingRuleset)
        return {
            updatedRuleset,
            approved: false,
        }
    }
}