class MarkdownResult {
    markdown string
}

function HtmlToMarkdown(html: string) -> MarkdownResult {
    client "openai/gpt-4o"
    prompt #"
    convert the following html to markdown

    {{ _.role('user') }}
    HTML STARTS HERE =============
    {{ html }}
    HTML ENDS HERE =============
    {{ctx.output_format}}

    "#
}   