# Drift Detection: Dead Simple

## The One Thing We Track

**Question**: Did the model change its mind about the same email?

**Data**: Store every run, group emails by content hash, compare classifications.

**Alert**: When same email gets different results across runs.

That's it.

## Simpler Structure

**Current (over-engineered):**
```
datasets/
├── runs/run-{timestamp}/
│   ├── meta.json           # 🗑️ complex metadata
│   └── emails/{id}.json    # 🗑️ full email data
├── emails/by-hash/         # 🗑️ cross-references  
└── index.json             # 🗑️ global index
```

**Simplified:**
```
datasets/
└── {content-hash}.json    # One file per unique email
```

Each file contains:
```json
{
  "hash": "abc123",
  "subject": "Your 2FA code", 
  "from": "security@example.com",
  "classifications": [
    {"timestamp": "2025-06-07", "result": "notify_immediately"},
    {"timestamp": "2025-06-08", "result": "read_later"}  // ⚠️ DRIFT!
  ]
}
```

**Drift detection**: Look for arrays with different `result` values.

## Benefits
- ✅ No complex directory structure  
- ✅ No redundant metadata
- ✅ Drift detection in one file scan
- ✅ Easy to implement dashboard