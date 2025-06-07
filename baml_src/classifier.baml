class ReadToday {
    relevant_rules string @description("The rules that were used to classify the email")
    classification "read_today" @description("Mark an email as 'read_today' if it is a high priority email that should be read immediately.")
}

class ReadLater {
    relevant_rules string @description("The rules that were used to classify the email")
    classification "read_later" @description("Mark an email as 'read_later' if it is a low priority email that can be read later, but isn't spam.")
}

class NotifyHumanImmediately {
    relevant_rules string @description("The rules that were used to classify the email")
    classification "notify_immediately" @description("Mark an email as 'notify_immediately' if the email should be shown to the user immediately. Examples include but are not limited to a 2-factor authentication code, a security alert, or a 'magic link' for signing in which should be forwarded to a user immediately")
    message string @description("The important details from the email that should be show to the user immediately")
}

// draft reply - will require human approval
class DraftReply {
    relevant_rules string @description("The rules that were used to classify the email")
    classification "draft_reply" @description("Mark an email as 'draft_reply' if the email is ready to be replied, and you have enough information to draft a reply - e.g. sending a calendar link. Only do this is the rules explicitly state that you should reply to these types of emails.")
    body string @description("The body of your draft")
    summary string @description("A summary of the email that you are drafting a reply for. Include any important details & action items. Make sure to tell the user what you are proposing")
}

// try unsubscribe - will require human approval
class TryUnsubscribe {
    relevant_rules string @description("The rules that state these types of emails should be unsubscribed from")
    classification "try_unsubscribe" @description("Mark an email as 'try_unsubscribe' if the email is a try to unsubscribe from a newsletter or mailing list. Only do this if the rules explicitly state that you should unsubscribe from these types of emails.")
    unsubscribe_url string? @description("The url of the unsubscribe page")
    unsubscribe_text string? @description("The text of the unsubscribe link")
    unsubscribe_button_text string? @description("The text of the unsubscribe button")
    unsubscribe_button_url string? @description("The url of the unsubscribe button")
}

type ClassifierResult = ReadToday | ReadLater | NotifyHumanImmediately | DraftReply | TryUnsubscribe

function Classify(subject: string, from: string, body: string, ruleset: string) -> ClassifierResult {
    client "openai/gpt-4o"
    prompt #"
    classify the following email body as spam or not spam

    {{ _.role('user') }}

    <subject>
    {{ subject }}
    </subject>  
    <from>
    {{ from }}
    </from>
    <body>
    {{ body }}
    </body>

    {{ctx.output_format}}
    "#
}

test ClassifiesUrgent2FA {
    functions [Classify]
    args {
        subject "Your verification code"
        from "noreply@github.com"
        body "Your GitHub verification code is: 123456. This code will expire in 10 minutes."
        ruleset "Authentication codes should be shown immediately"
    }
    @@assert(classification, {{this.classification == "notify_immediately"}})
    @@assert(has_message, {{this.message | length > 0}})
}

test ClassifiesNewsletterAsReadLater {
    functions [Classify]
    args {
        subject "Weekly Tech Newsletter"
        from "newsletter@techcompany.com"
        body "Here's this week's top tech news and insights from our team..."
        ruleset "Newsletters are low priority"
    }
    @@assert(classification, {{this.classification == "read_later"}})
}

test ClassifiesDraftReply {
    functions [Classify]
    args {
        subject "Meeting request for project discussion"
        from "colleague@company.com"
        body "Hi, would you like to schedule a meeting to discuss the new project? I'm available Tuesday or Wednesday afternoon."
        ruleset "Meeting requests should be replied to automatically with calendar link. You should draft replies for meeting requests."
    }
    @@assert(classification, {{this.classification == "read_today" or this.classification == "draft_reply"}})
}

test ClassifiesNotifyImmediately {
    functions [Classify]
    args {
        subject "Security alert: New login detected"
        from "security@company.com"
        body "We detected a new login to your account from an unrecognized device. If this wasn't you, please secure your account immediately."
        ruleset "Security alerts should be shown immediately"
    }
    @@assert(classification, {{this.classification == "notify_immediately"}})
    @@assert(has_message, {{this.message | length > 0}})
}

test ClassifiesReadToday {
    functions [Classify]
    args {
        subject "Project deadline reminder"
        from "manager@company.com"
        body "Just a reminder that the project deliverables are due tomorrow. Please let me know if you need any help."
        ruleset "Work-related emails with deadlines are high priority"
    }
    @@assert(classification, {{this.classification == "read_today"}})
}