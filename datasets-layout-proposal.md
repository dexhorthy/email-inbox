# Enhanced Dataset Layout for Dashboard

## Current Issues
❌ No way to find same email across different runs  
❌ No run metadata for dashboard summaries  
❌ No email content hashing for deduplication  
❌ Missing context (rules version, model version)  

## Proposed Structure

```
datasets/
├── runs/
│   ├── run-2025-06-07T04-25-03-170Z/
│   │   ├── meta.json              # Run metadata
│   │   ├── emails/                # Email processing results
│   │   │   ├── 19abcd123.json     # Gmail message ID
│   │   │   └── 19abcd456.json
│   │   └── summary.json           # Run summary stats
│   └── run-2025-06-07T05-30-15-298Z/
│       ├── meta.json
│       ├── emails/
│       └── summary.json
├── emails/                        # Cross-run email index
│   ├── by-hash/
│   │   ├── sha256-abc123.json     # All runs for this email content
│   │   └── sha256-def456.json
│   └── by-message-id/
│       ├── 19abcd123.json         # All runs for this Gmail message
│       └── 19abcd456.json
└── index.json                     # Global index for fast queries
```

## Enhanced Data Structures

### Run Metadata (`runs/{runId}/meta.json`)
```json
{
  "run_id": "run-2025-06-07T04-25-03-170Z",
  "timestamp": "2025-06-07T04:25:03.170Z",
  "purpose": "production" | "testing" | "golden_dataset",
  "context": {
    "rules_version": "sha256-rules-abc123",
    "model_version": "gpt-4o-2024-08-06",
    "cli_args": "--num-records 1",
    "git_commit": "dc0b47e"
  },
  "stats": {
    "emails_processed": 1,
    "duration_ms": 45000,
    "errors": 0
  }
}
```

### Enhanced Email Data Point
```json
{
  "id": "19abcd123",
  "content_hash": "sha256-abc123def456",
  "run_id": "run-2025-06-07T04-25-03-170Z",
  "timestamp": "2025-06-07T04:25:15.123Z",
  
  "envelope": {
    "subject": "The Meme Party",
    "from": "meme-mail@mail.beehiiv.com",
    "date": "Sat, 07 Jun 2025 02:46:44 +0000 (UTC)",
    "messageId": "19abcd123"
  },
  
  "content": {
    "text": "Sup Memelords...",
    "html": "<html>...</html>",
    "markdown": "Sup Memelords..."
  },
  
  "processing_context": {
    "rules_version": "sha256-rules-abc123",
    "model_version": "gpt-4o-2024-08-06", 
    "processing_timestamp": "2025-06-07T04:25:15.123Z"
  },
  
  "spam_analysis": {
    "is_spam": false,
    "high_confidence": true,
    "spam_rules_matched": [],
    "spammy_qualities": []
  },
  
  "human_interaction": {
    "timestamp": "2025-06-07T04:25:20.456Z",
    "approved": true,
    "feedback": null,
    "updated_ruleset": null
  },
  
  "final_classification": {
    "category": "read_later",
    "high_confidence": true,
    "summary": "Meme newsletter content",
    "message": null
  },
  
  "labels_applied": ["@read_later"]
}
```

### Email Cross-Run Index (`emails/by-hash/{hash}.json`)
```json
{
  "content_hash": "sha256-abc123def456",
  "first_seen": "2025-06-07T04:25:15.123Z",
  "last_seen": "2025-06-07T05:30:20.789Z",
  "email_summary": {
    "subject": "The Meme Party",
    "from": "meme-mail@mail.beehiiv.com"
  },
  "runs": [
    {
      "run_id": "run-2025-06-07T04-25-03-170Z",
      "message_id": "19abcd123",
      "timestamp": "2025-06-07T04:25:15.123Z",
      "classification": "read_later",
      "was_spam": false
    },
    {
      "run_id": "run-2025-06-07T05-30-15-298Z", 
      "message_id": "19abcd123",
      "timestamp": "2025-06-07T05:30:20.789Z",
      "classification": "read_today",  // Different classification!
      "was_spam": false
    }
  ]
}
```

### Global Index (`index.json`)
```json
{
  "last_updated": "2025-06-07T05:30:25.000Z",
  "runs": [
    {
      "run_id": "run-2025-06-07T04-25-03-170Z",
      "timestamp": "2025-06-07T04:25:03.170Z",
      "email_count": 1,
      "purpose": "testing"
    },
    {
      "run_id": "run-2025-06-07T05-30-15-298Z",
      "timestamp": "2025-06-07T05:30:15.298Z", 
      "email_count": 5,
      "purpose": "production"
    }
  ],
  "unique_emails": 4,
  "total_processings": 6,
  "emails_with_multiple_runs": ["sha256-abc123def456"]
}
```

## Dashboard Query Patterns

### 1. Runs Tab - List all runs
```typescript
// Fast query using index.json
const runs = await fetch('/api/datasets/index').then(r => r.json());
```

### 2. Run Detail - Drill down into specific run
```typescript
// Load run metadata and all emails
const runDetail = await fetch(`/api/datasets/runs/${runId}`).then(r => r.json());
```

### 3. Email Inputs Tab - Find emails with multiple runs
```typescript
// Get emails processed multiple times
const multiRunEmails = await fetch('/api/datasets/emails/multiple-runs').then(r => r.json());

// Get all runs for specific email
const emailHistory = await fetch(`/api/datasets/emails/by-hash/${contentHash}`).then(r => r.json());
```

### 4. Email Comparison - Compare two runs of same email
```typescript
// Load specific processing results for comparison
const [run1Data, run2Data] = await Promise.all([
  fetch(`/api/datasets/runs/${run1}/emails/${emailId}`).then(r => r.json()),
  fetch(`/api/datasets/runs/${run2}/emails/${emailId}`).then(r => r.json())
]);
```

## Implementation Changes Needed

1. **Add content hashing** to `EmailDataPoint`
2. **Create cross-run indexing** when saving emails  
3. **Add run metadata** tracking
4. **Update DatasetManager** with new methods:
   - `createEmailIndex()`
   - `findEmailsByHash()`
   - `getEmailHistory()`
   - `compareEmailRuns()`

This layout enables efficient dashboard queries while maintaining the existing simple file-per-email structure.