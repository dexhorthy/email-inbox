# Email Inbox Evaluation Plan

> **Focus**: Dead simple drift detection - store every run, visualize changes over time

---

## 🎯 Core Evaluation Strategy: Drift Detection

**The One Thing**: Track how model outputs change from run to run on the same emails.

### What We Have (✅ Working)
- ✅ `datasets/runs/` - Every CLI run saves results with timestamps
- ✅ Content hashing - Same emails get same hash across runs  
- ✅ BAML unit tests - 13 tests covering edge cases
- ✅ Real email processing with metadata

### What We Need
- Simple dashboard to compare runs on same emails
- Visual diff of classification changes over time
- Alerts when critical emails (2FA, security) get misclassified

---

## 📊 Drift Detection Dashboard

**Single Page App**: Show how the same email gets classified differently across runs

```
Run A (yesterday): email-hash-123 → "read_later"
Run B (today):     email-hash-123 → "spam" 
                   ⚠️  DRIFT DETECTED
```

**Key Views**:
1. **Run List**: All processing runs with summary stats
2. **Email Comparison**: Same email, different runs, side-by-side
3. **Drift Alerts**: When classifications change on same content

---

## 🚀 Next Steps (Keep It Simple)

1. **Build Minimal Dashboard** 
   - Read from `datasets/runs/` and `datasets/emails/by-hash/`
   - Show run-to-run diffs for same email content
   - Flag when 2FA/security emails get reclassified

2. **Add Simple Alerts**
   - Email → Spam (potential false positive)
   - 2FA → Read Later (critical miss)

3. **Manual Review Process**
   - Flag suspicious drifts for human review
   - Update rules based on review

**That's it.** No complex confidence scoring, no ML evaluation metrics. Just: "did the model change its mind, and should we care?"