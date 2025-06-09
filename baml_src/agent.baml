class ClarificationRequest {
  intent "request_more_information" @description("you can request more information from me")
  message string
}

class DoneForNow {
  intent "done_for_now"

  message string @description(#"
    message to send to the user about the work that was done. 
  "#)
}

type HumanTools = ClarificationRequest | DoneForNow

function DetermineNextStep(
    thread: string,
    ruleset: string
) -> Classification | HumanTools {
    client "openai/gpt-4o"

    prompt #"
        {{ _.role("system") }}

        You are a helpful assistant that can help with tasks.

        Your ruleset is:

        <ruleset>
        {{ ruleset }}
        </ruleset>

        {{ _.role("user") }}

        You are working on the following thread:

        {{ thread }}

        What should the next step be?

        dont forget to follow the rules:

        <ruleset>
        {{ ruleset }}
        </ruleset>

        {{ ctx.output_format }}

        Always think about what to do next first, like:

        - ...
        - ...
        - ...

        {...} // schema

    "#
}

test NextStep {
  functions [DetermineNextStep]

  args {
    thread #"
      <initial_email>
      </initial_email>


    "#
    ruleset #"
    "#
  }
}