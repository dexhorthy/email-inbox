class RulesUpdate {
    old_string string @description("the string in the existing ruleset to replace")
    new_string string @description("the new string to replace the old string with")
}

function UpdateRulesFromSpamResult(
    initial_email: string,
    proposed_classification: SpamResult,
    human_feedback: string,
    existing_ruleset: string,
) -> RulesUpdate {
    prompt #"

        you manage a set of plaintext rules for spam classification.

        read the email and proposed classification, and output an edit
        object that describes how to update the existing ruleset so
        that this misclassification does not happen again.

        The rules will be given to a classifier agent in the future.


        Match the new rules to the style of the existing ruleset.

        {{ _.role('user') }}
        This email was classified as spam by the existing ruleset, but there is human feedback
        that explains why it was not spam.

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

test UpdateRulesForMemes {
    functions [UpdateRulesFromSpamResult]
    args {
        initial_email #"
        check out these dope memes
        "#
        proposed_classification {
            is_spam true
            spam_rules_matched ["test"]
            spammy_qualities []
            high_confidence false
        }
        human_feedback #"
        memes are always good
        "#
        existing_ruleset #"
        - emails with unsubscribe links are always spam
        - memes are only good sometimes
        "#
    }
    @@assert(old_string, {{"memes are only good sometimes" in this.old_string}})
    @@assert(new_string, {{ this.new_string != this.old_string}})
}
