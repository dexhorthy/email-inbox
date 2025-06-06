# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Run the CLI agent**: `npx tsx src/index.ts [message]`
- **Start the HTTP server**: `npx tsx src/server.ts` (runs on port 8000)
- **Build the project**: `npm run build`
- **Generate BAML client code**: `npx baml-cli generate`
- **Run BAML tests**: `npx baml-cli test`
- **Initialize Gmail OAuth flow**: `npx tsx src/cli.ts` (when run directly)

## Architecture Overview

This is an agentic assistant built around the "12-Factor Agents" principles, integrating email processing with AI-powered workflows that require human approval for certain operations.

### Core Components

**BAML Integration**: The project uses BAML (Boundary ML) for structured AI prompting and type-safe LLM interactions. The BAML files in `baml_src/` define the agent's capabilities and tool schemas. The generated client code is in `baml_client/`.

**Agent Loop Architecture**: The system implements a classic agentic loop pattern:
- `agentLoop()` in `src/agent.ts` runs the core decision-making loop
- `DetermineNextStep()` BAML function decides what action to take next
- Tool execution happens either automatically (simple math) or with human approval (division, clarification)

**Human-in-the-Loop**: Uses HumanLayer SDK for asynchronous human approval workflows via email. Operations like `divide` and `request_more_information` pause execution until human response.

**Thread Management**: Conversations are persisted as `Thread` objects containing an array of `Event` objects. The `FileSystemThreadStore` provides simple file-based persistence in `.threads/` directory.

### Key Files

- `src/agent.ts`: Core agent loop, thread serialization, and tool execution
- `src/cli.ts`: Command-line interface with Gmail integration for email processing
- `src/server.ts`: Express HTTP server with webhook endpoints for HumanLayer integration
- `baml_src/agent.baml`: BAML definitions for agent prompts, tools, and test cases
- `baml_src/tool_calculator.baml`: Calculator tool definitions (add, subtract, multiply, divide)

### Gmail Integration

The CLI includes sophisticated Gmail OAuth2 flow and email processing capabilities:
- Handles gmail creds in `gmail_creds.json`
- Handles OAuth token management with `gmail_token.json`
- Can list, label, and process emails programmatically
- Integrates with the agent workflow for email-driven automation

## Configuration

- **AI Model**: Configured in BAML files (default: `openai/gpt-4o`)
- **HumanLayer**: Requires `HUMANLAYER_RUN_ID` environment variable
- **Gmail**: Requires OAuth credentials in `gmail_creds.json` and generated tokens in `gmail_token.json`
- **Logging**: Set `BAML_LOG=debug` for detailed BAML execution logs

## Testing

BAML tests are defined in `baml_src/agent.baml` and include assertions for various agent behaviors. Tests cover basic math operations, clarification requests, and multi-step calculations.
