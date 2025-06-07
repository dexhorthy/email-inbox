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

test DetectsObviousSpam {
    functions [IsSpam]
    args {
        envelope "Subject: URGENT: Claim your prize NOW!\nFrom: scammer@fake.com"
        html_content "<html><body>You won $1M! Click here to claim your prize now!</body></html>"
        text_content "You won $1M! Click here to claim your prize now!"
        extra_rules #"
- emails with unsubscribe links are always spam
- promotional emails offering prizes are spam
- cold outreach emails are spam
        "#
    }
    @@assert(is_spam, {{this.is_spam == true}})
}

test Handles2FACorrectly {
    functions [IsSpam]
    args {
        envelope "Subject: Your verification code\nFrom: noreply@github.com"
        html_content "<html><body>Your GitHub verification code is: 123456</body></html>"
        text_content "Your GitHub verification code is: 123456"
        extra_rules #"
- emails containing verification codes are not spam
- 2FA messages should be allowed through
- authentication codes are legitimate
        "#
    }
    @@assert(not_spam, {{this.is_spam == false}})
    @@assert(high_confidence, {{this.high_confidence == true}})
}

test HandlesNewsletterCorrectly {
    functions [IsSpam]
    args {
        envelope "Subject: Weekly Tech Newsletter\nFrom: newsletter@techcompany.com"
        html_content "<html><body>Here's this week's top tech news...</body></html>"
        text_content "Here's this week's top tech news..."
        extra_rules #"
- newsletters from known companies are not spam
- cold outreach emails are spam
- marketing emails are spam
        "#
    }
    @@assert(not_spam, {{this.is_spam == false}})
}

test HandlesPhishingEmail {
    functions [IsSpam]
    args {
        envelope "Subject: Urgent: Your account will be suspended\nFrom: fake-support@gmail.co"
        html_content "<html><body>Click here to verify your account or it will be suspended!</body></html>"
        text_content "Click here to verify your account or it will be suspended!"
        extra_rules #"
- emails requesting urgent action on account security are often phishing
- suspicious sender domains are spam
- requests to click links for account verification are spam
        "#
    }
    @@assert(is_spam, {{this.is_spam == true}})
}

test HandlesMagicLink {
    functions [IsSpam]
    args {
        envelope "Subject: Sign in to your account\nFrom: noreply@notion.so"
        html_content "<html><body>Click here to sign in to your Notion account: https://notion.so/login?token=abc123</body></html>"
        text_content "Click here to sign in to your Notion account: https://notion.so/login?token=abc123"
        extra_rules #"
- magic links for signing in are not spam
- authentication emails are legitimate
- emails from known services like Notion are not spam
        "#
    }
    @@assert(not_spam, {{this.is_spam == false}})
    @@assert(high_confidence, {{this.high_confidence == true}})
}