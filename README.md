# Email Inbox AI Classifier

## Quick Start

### 1. Setup Gmail Credentials

Add your Gmail API credentials:
```bash
# Add your Gmail OAuth2 credentials
cp path/to/your/gmail_creds.json hack/gmail_creds.json
```

Perform an OAuth flow to create `gmail_token.json` for accessing your Gmail account.

```bash
cd hack && uv run gmail_client.py
# put it in the root directory for TS to access
cp gmail_token.json ../gmail_token.json
```

### 2. Install Dependencies

```bash
bun install
```

### 3. Process Your First Email

```bash
# Test with most recent email (no human approval)
bun run src/cli.ts test-one

# Process with human approval
bun run src/cli.ts process -n 1
```

## Custom Rules

Create custom classification rules for different contexts:

```bash
# Use work-specific rules
bun run src/cli.ts test-one --rules-file work-rules.txt

# Set default rules via environment variable
export EMAIL_RULES_FILE=personal-rules.txt
bun run src/cli.ts test-many -n 5
```

Example rules file:
```
Mark as spam all emails that:
- are from marketing lists or newsletters I didn't subscribe to
- are cold sales/recruitment emails 
- contain excessive promotional language

do NOT mark as spam emails that:
- are from GitHub, Gmail, or other services I use
- contain authentication codes or security alerts
- are from work colleagues or startup-related content
```

## Output

The system creates detailed JSON records for each processed email in the `datasets/` directory:

```json
{
  "message_id": "1975130b1515bde2",
  "subject": "GitHub Actions workflow failed",
  "from": "notifications@github.com", 
  "markdown": "Your workflow failed...",
  "classifications": [
    {
      "timestamp": "2025-06-08T21:10:55.825Z",
      "result": "read_today",
      "is_spam": false
    }
  ]
}
```

## Architecture

The system uses:
- **BAML** for AI prompt engineering and type-safe model interactions
- **Gmail API** for email access and labeling
- **Dependency injection** for testable, configurable processing
- **TypeScript** for type safety and better developer experience

## Development

```bash
# Run linting and type checking
bun run fix

# Generate BAML client code
bun run baml:generate

# Run tests
bun run test
```

## Commands Overview

- `test-one` - Process single email without approval (testing)
- `test-many` - Process multiple emails without approval (testing) 
- `process` - Process emails with human approval (production)
- `dump` - Export email data for analysis

See [CLI Usage Guide](cli.md) for complete documentation and examples.