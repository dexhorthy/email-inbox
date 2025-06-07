function HtmlToMarkdown(html: string) -> string {
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