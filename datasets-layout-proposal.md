# Dataset Structure for Development

## Goal: Start Building Our Dataset 

**Priority**: Create directory structure → start collecting examples → build playground for vibe-checking

## Simple Structure to Start

```
datasets/
├── runs/                  # Each CLI run gets a timestamped folder
│   └── run-{timestamp}/
│       ├── meta.json      # Run context (rules version, model version, etc)
│       └── emails/        # One JSON file per email processed
│           └── {message-id}.json
├── golden/                # Hand-picked examples for testing
│   ├── spam-examples/
│   ├── 2fa-examples/  
│   └── edge-cases/
└── index.json            # Simple list of all runs for dashboard
```

**Key Features:**
- Each CLI run saves processing results automatically
- Simple file-per-email structure (easy to browse)
- Content hashing for finding duplicate emails across runs
- Minimal structure to start, can evolve

## Data Structure

### Run Metadata (`meta.json`)
```json
{
  "run_id": "run-2025-06-07T04-25-03-170Z",
  "timestamp": "2025-06-07T04:25:03.170Z",
  "context": {
    "rules_version": "sha256-abc123",
    "model_version": "gpt-4o-2024-08-06",
    "cli_args": "--num-records 5"
  },
  "stats": {
    "emails_processed": 5,
    "duration_ms": 45000
  }
}
```

### Email Processing Result (`emails/{message-id}.json`)
```json
{
  "id": "19abcd123",
  "content_hash": "sha256-abc123def456",
  "run_id": "run-2025-06-07T04-25-03-170Z",
  "timestamp": "2025-06-07T04:25:15.123Z",
  
  "envelope": {
    "subject": "The Meme Party",
    "from": "meme-mail@mail.beehiiv.com",
    "messageId": "19abcd123"
  },
  
  "content": {
    "text": "Sup Memelords...",
    "html": "<html>...</html>"
  },
  
  "spam_analysis": {
    "is_spam": false,
    "high_confidence": true,
    "spam_rules_matched": []
  },
  
  "final_classification": {
    "category": "read_later",
    "summary": "Meme newsletter content"
  },
  
  "human_interaction": {
    "approved": true,
    "feedback": null
  }
}
```

## Implementation Plan

**Step 1**: Update `datasets.ts` to create this structure when CLI runs
**Step 2**: Add content hashing to detect duplicate emails across runs  
**Step 3**: Build simple Next.js dashboard to browse results
**Step 4**: Add golden dataset collection for testing