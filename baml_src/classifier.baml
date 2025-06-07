class ReadToday {
    classification "read_today" @description("Mark an email as 'read_today' if it is a high priority email that should be read immediately.")
}

class ReadLater {
    classification "read_later" @description("Mark an email as 'read_later' if it is a low priority email that can be read later, but isn't spam.")
}

class NotifyHumanImmediately {
    classification "notify_immediately" @description("Mark an email as 'notify_immediately' if the email should be shown to the user immediately. Examples include but are not limited to a 2-factor authentication code, a security alert, or a 'magic link' for signing in which should be forwarded to a user immediately")
    message string @description("The important details from the email that should be show to the user immediately")
}

// draft reply - will require human approval
class DraftReply {
    classification "draft_reply" @description("Mark an email as 'draft_reply' if the email is ready to be replied, and you have enough information to draft a reply - e.g. sending a calendar link. Only do this is the rules explicitly state that you should reply to these types of emails.")
    body string @description("The body of your draft")
    summary string @description("A summary of the email that you are drafting a reply for. Include any important details & action items. Make sure to tell the user what you are proposing")
}

// try unsubscribe - will require human approval
class TryUnsubscribe {
    classification "try_unsubscribe" @description("Mark an email as 'try_unsubscribe' if the email is a try to unsubscribe from a newsletter or mailing list. Only do this if the rules explicitly state that you should unsubscribe from these types of emails.")
    unsubscribe_url string? @description("The url of the unsubscribe page")
    unsubscribe_text string? @description("The text of the unsubscribe link")
    unsubscribe_button_text string? @description("The text of the unsubscribe button")
    unsubscribe_button_url string? @description("The url of the unsubscribe button")
}

class ClassificationExecuteCode {
    classification "execute_code" @description("choose this if you need to execute custom code to process the email")
    instructions string @description(#"
        detailed markdown instructions for the coding agent to execute, 
        including all context from the email, rules being triggered, examples, and any other relevant information

        the coding agent will have access to various env vars and secrets and can integrate with external services 
        like google calendar, resend, etc
    "#)
}


class Classification {
    relevant_rules string[] @description("exact verbatims of one or more rules that were used to classify the email")
    classification ReadToday | ReadLater | NotifyHumanImmediately | DraftReply | TryUnsubscribe | ClassificationExecuteCode
}


function Classify(subject: string, from: string, body: string, ruleset: string) -> Classification {
    client "openai/gpt-4o"
    prompt #"
    classify the following email body as spam or not spam

    use the following rules to classify the email:

    <ruleset>
    {{ ruleset }}
    </ruleset>

    for code execution, you have access to the following env vars:

    <available_env_vars>
    {{ available_env_vars | join("\n") }}
    </available_env_vars>

    {{ _.role('user') }}

    Here's the email:

    <subject>
    {{ subject }}
    </subject>  
    <from>
    {{ from }}
    </from>
    <body>
    {{ body }}
    </body>

    use the following rules to classify the email:

    <ruleset>
    {{ ruleset }}
    </ruleset>

    {{ctx.output_format}}
    "#
}

test ClassifiesUrgent2FA {
    functions [Classify]
    args {
        subject "Your verification code"
        from "noreply@github.com"
        body "Your GitHub verification code is: 123456. This code will expire in 10 minutes."
        ruleset #"
- Authentication codes should be shown immediately
- Newsletters are low priority
- Meeting requests should be replied to automatically with calendar link cal.com/1234567890
- You should draft replies for meeting requests
- Security alerts should be shown immediately
- You should show the user the message immediately
- Work-related emails with deadlines are high priority
        "#
    }
    @@assert(classification, {{this.classification.classification == "notify_immediately"}})
    @@assert(has_code, {{"123456" in this.classification.message}})
}

test ClassifiesNewsletterAsReadLater {
    functions [Classify]
    args {
        subject "Weekly Tech Newsletter"
        from "newsletter@techcompany.com"
        body "Here's this week's top tech news and insights from our team..."
        ruleset #"
            - Authentication codes should be shown immediately
            - Newsletters are low priority
            - Meeting requests should be replied to automatically with calendar link cal.com/1234567890
            - You should draft replies for meeting requests
            - Security alerts should be shown immediately
            - You should show the user the message immediately
            - Work-related emails with deadlines are high priority
        "#
    }
    @@assert(classification, {{this.classification.classification == "read_later"}})
}

test ClassifiesDraftReply {
    functions [Classify]
    args {
        subject "Meeting request for project discussion"
        from "colleague@company.com"
        body "Hi, would you like to schedule a meeting to discuss the new project? I'm available Tuesday or Wednesday afternoon."
        ruleset #"
            - Authentication codes should be shown immediately
            - Newsletters are low priority
            - Meeting requests should be replied to automatically with calendar link cal.com/1234567890
            - You should draft replies for meeting requests
            - Security alerts should be shown immediately
            - You should show the user the message immediately
            - Work-related emails with deadlines are high priority
        "#
    }
    @@assert(classification, {{this.classification.classification == "draft_reply"}})
    @@assert(has_cal_link, {{"cal.com/1234567890" in this.classification.body}})
}

test ClassifiesNotifyImmediately {
    functions [Classify]
    args {
        subject "Security alert: New login detected"
        from "security@company.com"
        body "We detected a new login to your account from an unrecognized device. If this wasn't you, please secure your account immediately."
        ruleset #"
            - Authentication codes should be shown immediately
            - Newsletters are low priority
            - Meeting requests should be replied to automatically with calendar link cal.com/1234567890
            - You should draft replies for meeting requests
            - Security alerts should be shown immediately
            - You should show the user the message immediately
            - Work-related emails with deadlines are high priority
        "#
    }
    @@assert(classification, {{this.classification.classification == "notify_immediately"}})
}

test ClassifiesReadToday {
    functions [Classify]
    args {
        subject "Project deadline reminder"
        from "manager@company.com"
        body "Just a reminder that the project deliverables are due tomorrow. Please let me know if you need any help."
        ruleset #"
            - Authentication codes should be shown immediately
            - Newsletters are low priority
            - Meeting requests should be replied to automatically with calendar link cal.com/1234567890
            - You should draft replies for meeting requests
            - Security alerts should be shown immediately
            - You should show the user the message immediately
            - Work-related emails with deadlines are high priority  
        "#
    }
    @@assert(classification, {{this.classification.classification == "read_today"}})
}

test ClassifiesMakeCalEvent {
    functions [Classify]
    args {
        subject "Re: Meeting request for project discussion"
        from "colleague@company.com"
        body #"Great, I'm good to go for thursday at 2pm.

        From: John Doe <john.doe@company.com>
        To: Colleague <colleague@company.com>
        Subject: Meeting request for project discussion

        Are we still on to discuss the launch for next monday?

        I think we have lunch scheduled thursday at 2pm, but 
        we could use that time to discuss the launch instead if you wanna order
        in and grab a whiteboard.

        "#
        ruleset #"
            - Authentication codes should be shown immediately
            - Newsletters are low priority
            - Meeting requests should be replied to automatically with calendar link cal.com/1234567890
            - if a meeting is CONFIRMED, you should make/modify a calendar event rather than sending the calendar link 
            - You should draft replies for meeting requests
            - Security alerts should be shown immediately
            - You should show the user the message immediately
            - Work-related emails with deadlines are high priority  
        "#
    }
}