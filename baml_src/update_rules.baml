class RulesUpdate {
    old_string string
    new_string string
}

function UpdateRulesFromSpamResult(
    initial_email: string,
    proposed_classification: SpamResult,
    human_feedback: string,
    existing_ruleset: string
) -> RulesUpdate {
    prompt #"

        you manage a set of plaintext rules for spam classification.

        read the email and proposed classification

        {{ _.role('user') }}

        <initial_email>
        {{ initial_email }}
        </initial_email>

        <proposed_classification>
        {{ proposed_classification }}
        </proposed_classification>

        <human_feedback>
        {{ human_feedback }}
        </human_feedback>

        <existing_ruleset>
        {{ existing_ruleset }}
        </existing_ruleset>

        {{ ctx.output_format }}

    "#
    client "openai/gpt-4o"
}