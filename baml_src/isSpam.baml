class SpamResult {
    spammy_qualities string[]
    spam_rules_matched string[]
    is_spam bool
}

function IsSpam(email: string, extra_rules: string) -> SpamResult {
    client "openai/gpt-4o"
    prompt #"
    is the email spam?

    follow these rules:

    {{ extra_rules }}


    {{ _.role('user') }}

    {{ email }}

    {{ ctx.output_format }}
    "#
}