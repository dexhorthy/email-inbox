# E2E Gmail Parsing Tests Setup

This document explains how to set up and run the E2E tests for email parsing functionality.

## 🚨 Prerequisites Required

**Before running E2E tests, you MUST complete these setup steps:**

### Step 1: Gmail API Credentials



You need gmail_token.json in project root with Gmail API credentials.

You can generate this file by getting GMAIL app credentials gmaiL_creds.json and running

```bash
uv run hack/gmail_token.py
```


### Step 2: Generate Test Email IDs (Run This Once)
```bash
# Fetch 5 real Gmail message IDs for testing
bun run src/hack/fetch-test-emails.ts
```

This creates: src/test/data/test-message-ids.json
Contains real Gmail message IDs for E2E testing

Expected output:
```
🔍 Fetching last 5 Gmail message IDs for E2E testing...
📧 Fetching messages from Gmail...
📋 Found 5 messages
  📨 abc123: "Subject Line" from sender@example.com
✅ Stored 5 message IDs to src/test/data/test-message-ids.json
🎯 Test data ready for E2E tests!
```

## 🧪 Running E2E Tests

### Basic Test Run
```bash
# Run all E2E email parsing tests (requires setup above)
bun test ./src/test/test-e2e-email-parsing.ts
```

### Extended Timeout (Recommended)
```bash
# ⚠️ WARNING: BAML HtmlToMarkdown is SLOW for large emails (10-15s per email)
# Use extended timeout for full pipeline tests:
bun test ./src/test/test-e2e-email-parsing.ts --timeout=30000
```

### Run Specific Test Groups
```bash
# Test just Gmail API connection
bun test ./src/test/test-e2e-email-parsing.ts -t "Gmail API Connection"

# Test just body parsing (fast, no BAML calls)
bun test ./src/test/test-e2e-email-parsing.ts -t "Body Parsing"

# Test just the slow markdown conversion
bun test ./src/test/test-e2e-email-parsing.ts -t "Full Email Parsing Pipeline"
```

## 📊 What the E2E Tests Validate

### Gmail API Integration
- ✅ OAuth authentication with Gmail
- ✅ Fetching emails by specific message IDs
- ✅ Handling invalid message IDs gracefully

### Email Content Parsing
- ✅ Header extraction (Subject, From, Date, Message-ID)
- ✅ Body parsing from multipart MIME emails
- ✅ Text and HTML content extraction
- ✅ Nested multipart handling (multipart/alternative, multipart/mixed)

### BAML Integration
- ✅ HTML to markdown conversion via BAML
- ✅ Handling large HTML content (11KB+ emails)
- ✅ Error handling for BAML API timeouts

### End-to-End Pipeline
- ✅ Complete email parsing workflow
- ✅ Content quality validation
- ✅ Error handling at each step
- ✅ Performance with real Gmail data

## ⚠️ Known Issues & Performance Notes

### BAML HtmlToMarkdown Performance
- **Small emails (<3KB)**: ~500ms conversion time
- **Large emails (11KB+)**: 10-15 seconds conversion time
- **Root cause**: Complex HTML with CSS styling takes longer to process

### Test Timeouts
- **Default timeout**: 5 seconds (too short for large emails)
- **Recommended timeout**: 30 seconds for full pipeline tests
- **Fast tests**: Body parsing, headers (no BAML calls) run in <2 seconds

### Test Data Refresh
- Test email IDs are fetched once and stored in `src/test/data/test-message-ids.json`
- Re-run `bun run src/hack/fetch-test-emails.ts` to get fresh email IDs
- Tests use real Gmail data, so content may vary over time

## 🔧 Troubleshooting

### "gmail_token.json not found"
- Ask team lead for Gmail API credentials file
- Place in project root directory

### "No messages found in Gmail"
- Check Gmail account has emails
- Verify OAuth tokens have read access

### "Test timeout after 5000ms"
- Use `--timeout=30000` flag for BAML-heavy tests
- Or use VS Code debug config "Debug with Timeout Extended"

### "BAML API errors"
- Check internet connection
- Verify BAML API keys are configured
- Large HTML emails may hit API limits

## 📁 File Structure

```
src/
├── hack/
│   └── fetch-test-emails.ts          # One-off script to fetch Gmail IDs
├── test/
│   ├── data/
│   │   └── test-message-ids.json     # Generated test data
│   └── test-e2e-email-parsing.ts     # E2E test suite
├── emailParser.ts                    # Reusable email parsing functions
└── handleEmail.ts                    # Main email processing logic

.vscode/
├── launch.json                       # Debug configurations
├── settings.json                     # Project settings
└── tasks.json                        # Quick tasks for VS Code
```