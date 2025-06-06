class ClassifierResult {
    classification "read_today" | "read_later" @description(
        #"The classification of the email. 
        Mark an email as 'read_today' if it is a high priority email that should be read immediately. 
        Mark an email as 'read_later' if it is a low priority email that can be read later, but isn't spam. 
        "#
    )
    confidence float
}

class NotifyHumanImmediatelyClassifierResult {
    classification "notify_immediately" @description("Mark an email as 'notify_immediately' if the email should be shown to the user immediately. Examples include but are not limited to a 2-factor authentication code, a security alert, or a 'magic link' for signing in which should be forwarded to a user immediately")
    message string @description("The important details from the email that should be show to the user immediately")
}

class DraftReplyClassifierResult {
    classification "draft_reply" @description("Mark an email as 'draft_reply' if the email is ready to be replied, and you have enough information to draft a reply - e.g. sending a calendar link. Only do this is the rules explicitly state that you should reply to these types of emails.")
    body string @description("The body of your draft")
    summary string @description("A summary of the email that you are drafting a reply for. Include any important details & action items. Make sure to tell the user what you are proposing")

}

function Classify(subject: string, from: string, body: string, ruleset: string) -> ClassifierResult | NotifyHumanImmediatelyClassifierResult | DraftReplyClassifierResult{
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