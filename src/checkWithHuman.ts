import type { SpamResult } from "@/baml_client"
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
  updatedRuleset?: string | undefined
  approved: boolean
}

/**
 * returns the updated ruleset if the human rejects the proposed classification,
 * else undefined if approved
 */
export const checkWithHuman = async (
  input: CheckWithHumanInput,
): Promise<CheckWithHumanOutput> => {
  const hl = humanlayer()
  let call = await hl.createHumanContact({
    spec: {
      msg: `
📧 Email Review Request
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
From: ${input.from}
Subject: "${input.subject}"

Preview:
> ${input.body.slice(0, 100)}...

Classification: ${input.proposedClassification.is_spam ? "🚫 Spam" : "✅ Not Spam"}
${input.proposedClassification.spam_rules_matched.length > 0 ? "\nMatched Rules:" : ""}
${input.proposedClassification.spam_rules_matched.map((rule) => `• ${rule}`).join("\n")}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please review this classification.
            `,
      response_options: [
        {
          name: "spam",
        },
        {
          name: "not spam",
        },
      ],
      channel: {
        slack: {
          channel_or_user_id: "",
          experimental_slack_blocks: true,
        },
      },
    },
  })

  while (!call.status?.response) {
    await new Promise((resolve) => setTimeout(resolve, 3000))
    call = await hl.getHumanContact(call.call_id)
  }

  if (
    (input.proposedClassification.is_spam &&
      call.status.response_option_name === "spam") ||
    (!input.proposedClassification.is_spam &&
      call.status.response_option_name === "not spam")
  ) {
    return {
      approved: true,
    }
  }
  const updatedRuleset = await updateRules(
    input.body,
    input.proposedClassification,
    call.status.response!,
    input.existingRuleset,
  )
  return {
    updatedRuleset,
    approved: false,
  }
}

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
  }
  await checkWithHuman(input)
}
