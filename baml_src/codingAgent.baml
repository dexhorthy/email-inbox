
class Package {
    name string
    version string
}

class ExecuteCode {
    intent "execute_code" @description("choose this if you need to execute custom code to process the email")
    code string @description("The typescript code to execute")
    packages Package[] @description("a list of npm packages and versions to install")
    env_vars string[] @description("a list of environment variables to set")
}

class EnvVar {
    name string
    description string
}

class RequestNewEnvVar {
    intent "request_new_env_var" @description("choose this if you need to request a new environment variable from the user for code execution")
    env_var EnvVar 
}


type CodingTools = ExecuteCode | RequestNewEnvVar

function CodingAgentDetermineNextStep(
    thread: string,
    ruleset: string,
    available_env_vars: EnvVar[],
) -> CodingTools  | HumanTools {
    client "anthropic/claude-sonnet-4-20250514"

    prompt #"
        {{ _.role("system") }}

        You are a helpful coding agent that can execute code to process an email.

        Your code MUST be written in typescript and follow this format:

        <example_code>
        import { someModule } from "someModule";

        export default () => {
            // your code here
            return output;
        }

        Or for async functions:

        import { someModule } from "someModule";

        export default async () => {
            // your code here
            return output;
        }
        </example_code>

        Your ruleset is:

        <ruleset>
        {{ ruleset }}
        </ruleset>


        You are working on the following thread:

        {{ thread }}

        What should the next step be?

        dont forget to follow the rules:

        <ruleset>
        {{ ruleset }}
        </ruleset>

        you have the following env vars available to you:

        <available_env_vars>
        {{ available_env_vars | join("\n") }}
        </available_env_vars>

        you have the following tools available to you:

        {{ ctx.output_format }}

        Always think about what to do next first, like:

        - ...
        - ...
        - ...

        {...} // schema

    "#
}

test CodingAgentDetermineNextStep {
    functions [CodingAgentDetermineNextStep]

    args {
        thread #"
            <initial_email>
            subject: "Re: Meeting request for project discussion"
            from: "colleague@company.com"
            body: "Great, I'm good to go for thursday at 2pm.

            From: John Doe <john.doe@company.com>
            To: Colleague <colleague@company.com>
            Subject: Meeting request for project discussion

            Are we still on to discuss the launch for next monday?

            I think we have lunch scheduled thursday at 2pm, but 
            we could use that time to discuss the launch instead if you wanna order
            in and grab a whiteboard.
            </initial_email>


            <execute_code_instructions>
            "Create a calendar event for a meeting scheduled on Thursday at 
            2pm to discuss the project launch. Include details such as the topic of 
            discussion which is the launch scheduled for next Monday, and 
            note that there will be a whiteboard session. 
            </execute_code_instructions>
        "#
        ruleset #"
            - if a meeting is requested, you should make a calendar event
        "#
        available_env_vars [
            {
                name "GOOGLE_CALENDAR_TOKENS_JSON_BASE64_ENCODED",
                description "The base64 encoded json string of the google calendar tokens"
            }
        ]
    }
}
