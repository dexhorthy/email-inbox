class SpamResult {
    spammy_qualities string[]
    spam_rules_matched string[]
    is_spam bool
    high_confidence bool
}

function IsSpam(envelope: string, html_content: string, text_content: string, extra_rules: string) -> SpamResult {
    client "openai/gpt-4o"
    prompt #"
    is the email spam?

    follow these rules:

    {{ extra_rules }}


    {{ _.role('user') }}

    <envelope>
    {{ envelope }}
    </envelope>
    <html_content>
    {{ html_content }}
    </html_content>
    <text_content>
    {{ text_content }}
    </text_content>

    {{ctx.output_format}}
    "#

}