# CLI Usage Guide

This document describes how to use the email inbox CLI for processing and classifying emails.

## Installation

```bash
bun install
```

## Global Options

All commands support these global options:

- `-r, --rules-file <path>` - Path to custom rules file (default: `src/rules.txt`)
- `-h, --help` - Display help information
- `-V, --version` - Display version number

You can also set the rules file via environment variable:
```bash
export EMAIL_RULES_FILE=/path/to/custom-rules.txt
```

The rules file you set will be read AND UPDATED by the CLI as it runs. Ensure you version or backup your rules file regularly.

## Commands

### `process` - Production Email Processing

Process emails from Gmail inbox with human approval for classifications.

```bash
bun run src/cli.ts process [options]
```

**Options:**
- `-n, --num-records <number>` - Number of emails to process (default: 10)

**Example:**
```bash
# Process 5 emails with human approval
bun run src/cli.ts process -n 5

# Use custom rules file
bun run src/cli.ts process --rules-file my-work-rules.txt -n 3
```

### `test-one` - Single Email Testing

Process a single email without human approval (test mode). Useful for coding agents.

```bash
bun run src/cli.ts test-one [options]
```

**Options:**
- `-m, --message-id <id>` - Specific Gmail message ID to process

**Examples:**
```bash
# Process most recent email in test mode
bun run src/cli.ts test-one

# Process specific email by ID
bun run src/cli.ts test-one -m 1975130b1515bde2

# Use custom rules for testing
bun run src/cli.ts test-one --rules-file personal-rules.txt
```

### `test-many` - Batch Email Testing

Process multiple emails without human approval (test mode). Useful for coding agents.

```bash
bun run src/cli.ts test-many [options]
```

**Options:**
- `-n, --num-records <number>` - Number of emails to process (default: 10)

**Examples:**
```bash
# Test with 10 emails (default)
bun run src/cli.ts test-many

# Test with 20 emails
bun run src/cli.ts test-many -n 20

# Test with custom rules
bun run src/cli.ts test-many --rules-file strict-rules.txt -n 5
```

### `dump` - Email Data Export

Dump email payloads to test data files for analysis.

```bash
bun run src/cli.ts dump [options]
```

**Options:**
- `-n, --num-records <number>` - Number of emails to dump (default: 10)

**Example:**
```bash
# Dump 15 emails to test data files
bun run src/cli.ts dump -n 15
```

## Rules Files

Rules files contain instructions for spam detection and email classification. They use natural language format:

```
Mark as spam all emails that:
- are from marketing lists or newsletters I didn't explicitly subscribe to
- are cold sales/recruitment emails 
- have excessive promotional language like "amazing deal", "limited time"
- are from crypto/NFT/investment schemes

do NOT mark as spam emails that:
- are from GitHub, Gmail, or other services I use
- contain authentication codes or security alerts
- are from friends, family, or work colleagues
- are from Y Combinator, Bookface, or startup-related content I'm interested in
```

### Custom Rules Examples

**Work Rules (`work-rules.txt`):**
```
Mark as spam all emails that:
- are from recruiters or job boards
- are marketing emails from vendors
- contain phrases like "buy now", "special offer"

do NOT mark as spam emails that:
- are from team members or work tools
- contain calendar invites or meeting requests
- are from company vendors we work with
```

**Personal Rules (`personal-rules.txt`):**
```
Mark as spam all emails that:
- are from unknown senders trying to sell something
- are newsletters I don't remember subscribing to
- mention cryptocurrency or "get rich quick" schemes

do NOT mark as spam emails that:
- are from family and friends
- are shipping/delivery notifications
- are from services I actively use
```

## Environment Variables

- `EMAIL_RULES_FILE` - Default rules file path
- `AGENTOPS_API_KEY` - AgentOps API key for monitoring (optional)

## Output and Datasets

All processed emails are saved to the `datasets/` directory with:
- Email metadata (subject, from, message ID)
- Classification results and timestamps
- Resolved markdown content
- Spam detection results

Each email creates a JSON file named `{message-id}.json` containing:
```json
{
  "message_id": "1975130b1515bde2",
  "subject": "GitHub Actions workflow failed",
  "from": "notifications@github.com",
  "markdown": "Your workflow failed...",
  "first_seen": "2025-06-08T21:10:55.825Z",
  "classifications": [
    {
      "timestamp": "2025-06-08T21:10:55.825Z",
      "run_id": "run-2025-06-08T21-10-48-884Z",
      "result": "read_today",
      "is_spam": false,
      "rules_version": "2025-06-07T21:56:17.263Z",
      "model_version": "gpt-4o-2024"
    }
  ]
}
```

## Drift Detection

The system automatically tracks classification changes over time. If the same email gets different classifications across runs, this indicates model drift and helps evaluate classification consistency.

## Error Handling

- Invalid message IDs will be skipped with error messages
- Missing rules files will be created with default content
- Network errors are logged and processing continues with remaining emails
- Gmail API rate limits are handled automatically