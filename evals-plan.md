# Email Inbox Evaluation Plan

> **Purpose**  
> Define structured evaluation strategy for the email processing system, following evals.md best practices.  
> Focus on categorical metrics, testing pyramid, and continuous dataset expansion.

---

## 1 · Current System Analysis

Our email processing pipeline has these key stages:
```
Email → IsSpam → CheckWithHuman → Classify → LabelEmail → Dataset
```

**Key Decision Points:**
- **Spam Detection**: `is_spam: bool`, `high_confidence: bool`, `spam_rules_matched: string[]`
- **Classification**: `"read_today" | "read_later" | "notify_immediately" | "draft_reply"`
- **Human Interaction**: Approval/rejection with feedback and rule updates

**Current Data Structure**: ✅ Already follows evals.md principles
- Categorical enums instead of confidence scores
- Structured JSON outputs via BAML
- Granular intermediate step logging

---

## 2 · Testing Pyramid Strategy

### 2.1 Unit Tests (Many)
**Target**: Individual BAML functions using built-in BAML tests

BAML provides native unit testing within `.baml` files. Add tests directly to each function:

```baml
// In isSpam.baml
test DetectsObviousSpam {
  functions [IsSpam]
  args {
    envelope "Subject: URGENT: Claim your prize NOW!"
    html_content "<html>You won $1M! Click here!</html>"
    text_content "You won $1M! Click here!"
    extra_rules #"
      - emails with unsubscribe links are always spam
      - promotional emails offering prizes are spam
    "#
  }
  @@assert(is_spam, {{this.is_spam == true}})
  @@assert(has_rules_matched, {{this.spam_rules_matched.length > 0}})
}

test Handles2FACorrectly {
  functions [IsSpam]
  args {
    envelope "Subject: Your verification code"
    html_content "Your GitHub verification code is: 123456"
    text_content "Your GitHub verification code is: 123456"
    extra_rules #"
      - emails containing verification codes are not spam
      - 2FA messages should be allowed through
    "#
  }
  @@assert(not_spam, {{this.is_spam == false}})
  @@assert(high_confidence, {{this.high_confidence == true}})
}
```

```baml
// In classifier.baml  
test ClassifiesUrgent2FA {
  functions [Classify]
  args {
    subject "Your verification code"
    from "noreply@github.com"
    body "Your GitHub verification code is: 123456"
    ruleset "Authentication codes should be shown immediately"
  }
  @@assert(classification, {{this.classification == "notify_immediately"}})
  @@assert(has_message, {{this.message != null}})
}

test ClassifiesNewsletterAsReadLater {
  functions [Classify]
  args {
    subject "Weekly Tech Newsletter"
    from "newsletter@techcompany.com"
    body "Here's this week's top tech news..."
    ruleset "Newsletters are low priority"
  }
  @@assert(classification, {{this.classification == "read_later"}})
  @@assert(confidence, {{this.confidence > 0.5}})
}
```

**Run with**: `bun run baml:test`

### 2.2 Integration Tests (Some)
**Target**: 2-3 step workflows

```typescript
test('Spam → Human → Rule Update flow', async () => {
  // 1. Email classified as spam
  const spamResult = await b.IsSpam(envelope, html, text, rules);
  
  // 2. Human rejects spam classification
  const humanResult = await checkWithHuman({
    proposedClassification: spamResult,
    // Mock human saying "this is not spam"
  });
  
  // 3. Rules should be updated
  assert(humanResult.updatedRuleset !== null);
  assert(humanResult.approved === false);
});
```

### 2.3 End-to-End Tests (Few)
**Target**: Full email processing pipeline

```typescript
test('Complete email processing with dataset capture', async () => {
  const datasetManager = new DatasetManager();
  const runId = await datasetManager.startNewRun();
  
  // Process test email
  await handleOneEmail(SAMPLE_EMAIL);
  
  // Verify dataset capture
  const emailData = await datasetManager.loadEmailData(runId, SAMPLE_EMAIL.id);
  assert(emailData !== null);
  assert(emailData.spam_analysis.is_spam !== undefined);
  assert(emailData.final_classification.category !== undefined);
});
```

---

## 3 · Golden Dataset Strategy

### 3.1 Data Sources
1. **Production Logs**: Real emails processed (anonymized)
2. **Synthetic Cases**: Edge cases and adversarial examples
3. **Regression Cases**: Every bug becomes a test case
4. **Human Feedback**: Corrections from checkWithHuman

### 3.2 Dataset Structure
Following the enhanced layout in `datasets-layout-proposal.md`:

```typescript
interface GoldenEmail {
  id: string;
  content_hash: string;  // For deduplication across runs
  source: 'production' | 'synthetic' | 'regression';
  
  // Input (matches EmailDataPoint structure)
  envelope: EmailEnvelope;
  content: EmailContent;
  rules_version: string;
  
  // Expected outputs  
  expected_spam_analysis: SpamResult;
  expected_classification: ClassificationResult;
  expected_human_interaction?: HumanInteraction;
  
  // Metadata
  created_at: string;
  tags: string[]; // ['2fa', 'marketing', 'phishing', etc.]
  description: string;
}
```

### 3.3 Expansion Process
```typescript
// When processing emails, capture golden cases
async function captureGoldenCase(
  emailData: EmailDataPoint,
  wasCorrect: boolean,
  correctedOutput?: any
) {
  if (!wasCorrect || isInterestingEdgeCase(emailData)) {
    await goldenDataset.add({
      ...emailData,
      expected_output: correctedOutput || emailData,
      source: wasCorrect ? 'edge_case' : 'regression'
    });
  }
}
```

---

## 4 · Drift Detection & Visualization

### 4.1 Next.js Evaluation Dashboard
Following evals.md principle: "Even a simple Next.js page that lists changed tests accelerates review"

```typescript
// pages/index.tsx - Main dashboard
export default function EvalDashboard() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Email Processing Evaluations</h1>
      
      {/* Real-time metrics */}
      <MetricsGrid />
      
      {/* Production drift detection */}
      <DriftAnalysis />
      
      {/* Test results over time */}
      <TestHistory />
      
      {/* Side-by-side comparisons */}
      <OutputComparison />
    </div>
  );
}
```

### 4.2 Same-Email Processing History
**View multiple processing runs of the same email over time**

```typescript
interface EmailProcessingRun {
  id: string;
  email_id: string;  // Gmail message ID
  email_hash: string; // Hash of subject + from + body for deduplication
  timestamp: string;
  run_id: string;    // Dataset run ID
  
  // Processing results for this run
  spam_analysis: SpamResult;
  human_interaction?: HumanInteraction;
  final_classification: ClassificationResult;
  labels_applied: string[];
  
  // Context at time of processing
  rules_version: string;
  model_version: string;
}

// Get all processing attempts for same email
function getEmailHistory(emailId: string): EmailProcessingRun[] {
  return datasets
    .filter(run => run.email_id === emailId || run.email_hash === getEmailHash(emailId))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}
```

### 4.3 Dashboard Features

**📊 Metrics View**
- Spam detection accuracy over time
- Classification distribution trends  
- Human override rates by category
- Processing latency trends

**🔍 Same-Email Analysis**
- Multiple processing runs of identical emails
- Classification consistency over time
- Rule changes impact on same content
- Model version comparison for same inputs

**📋 Test Results**
- BAML test pass/fail history
- Integration test trends
- Golden dataset expansion tracking
- Regression test coverage

**⚖️ Side-by-Side Comparisons**
- Before/after prompt changes
- Model version A/B testing
- Human correction analysis
- Edge case progression

---

## 5 · Evaluation Metrics

### 4.1 Categorical Quality Metrics
Following evals.md principle: **avoid confidence scores, use enums**

```typescript
enum SpamAccuracy {
  CORRECT_SPAM = 'correct_spam',
  CORRECT_NOT_SPAM = 'correct_not_spam', 
  FALSE_POSITIVE = 'false_positive',  // Marked spam, actually not
  FALSE_NEGATIVE = 'false_negative'   // Missed spam
}

enum ClassificationAccuracy {
  CORRECT = 'correct',
  WRONG_URGENCY = 'wrong_urgency',     // read_today vs read_later
  MISSED_NOTIFICATION = 'missed_notification', // Should be notify_immediately
  WRONG_DRAFT = 'wrong_draft'          // Shouldn't/should draft reply
}
```

### 4.2 System-Level Guards
```typescript
// Deterministic validation rules
function validateEmailProcessing(result: EmailDataPoint): string[] {
  const errors: string[] = [];
  
  // Consistency checks
  if (result.final_classification.category === 'spam' && 
      !result.spam_analysis.is_spam) {
    errors.push('INCONSISTENT: Final spam but spam_analysis false');
  }
  
  // Critical safety checks  
  if (result.content.text.includes('verification code') &&
      result.final_classification.category !== 'notify_immediately') {
    errors.push('CRITICAL: Missed 2FA code');
  }
  
  return errors;
}
```

---

## 5 · Implementation Roadmap

### Phase 1: Foundation (Week 1)
- [ ] Add BAML unit tests to existing `.baml` files (isSpam.baml, classifier.baml, etc.)
- [ ] Implement enhanced dataset layout with content hashing and cross-run indexing
- [ ] Set up golden dataset storage in `datasets/golden/`
- [ ] Add basic evaluation runner: `bun run eval`
- [ ] Create 10-20 hand-crafted BAML test cases covering major scenarios
- [ ] Ensure `bun run baml:test` covers all critical paths

### Phase 2: Integration (Week 2)  
- [ ] Add integration tests for multi-step workflows
- [ ] Update DatasetManager with enhanced layout methods (createEmailIndex, getEmailHistory, etc.)
- [ ] Create Next.js evaluation dashboard with runs and email-inputs tabs
- [ ] Implement same-email processing history visualization
- [ ] Add CI integration: block PRs if evals fail

### Phase 3: Production (Week 3)
- [ ] Capture production cases → golden dataset
- [ ] Implement evaluation guards in production pipeline  
- [ ] Add regression detection: alert on accuracy drops
- [ ] Create eval review workflow for model updates

### Phase 4: Continuous Improvement (Ongoing)
- [ ] Weekly golden dataset review and expansion
- [ ] Quarterly model performance analysis
- [ ] A/B testing framework for prompt changes
- [ ] Adversarial case generation

---

## 6 · File Structure

Following the enhanced dataset layout from `datasets-layout-proposal.md`:

```
├── baml_src/
│   ├── isSpam.baml      # Contains native BAML unit tests
│   ├── classifier.baml  # Contains native BAML unit tests  
│   ├── updateRules.baml # Contains native BAML unit tests
│   └── ...              # Other BAML functions with tests
├── datasets/
│   ├── runs/            # Production email processing runs
│   │   ├── run-{timestamp}/
│   │   │   ├── meta.json     # Run metadata & context
│   │   │   ├── emails/       # Email processing results  
│   │   │   └── summary.json  # Run summary stats
│   ├── emails/          # Cross-run email indexing
│   │   ├── by-hash/     # Email content hash → runs
│   │   └── by-message-id/ # Gmail message ID → runs
│   ├── golden/          # Golden test cases for evaluation
│   ├── index.json       # Global index for fast queries
│   └── synthetic/       # Generated edge cases
├── tests/
│   ├── integration/     # TypeScript multi-step workflow tests
│   ├── e2e/            # Full pipeline tests
│   └── fixtures/        # Test data
├── evals/
│   ├── runner.ts        # Main evaluation engine
│   ├── metrics.ts       # Accuracy calculation
│   ├── guards.ts        # Deterministic validation
│   └── dashboard/       # Next.js dashboard app
└── dashboard/           # Next.js evaluation dashboard
    ├── pages/
    ├── components/
    └── api/
```

---

## 7 · Success Criteria

**Week 1**: 95%+ unit test coverage of BAML functions  
**Week 2**: Catch 100% of regressions with integration tests  
**Week 3**: Zero critical misclassifications (2FA, security alerts) in production  
**Ongoing**: <5% accuracy degradation tolerance before human review required

This plan transforms the existing dataset collection into a comprehensive evaluation system following evals.md principles: categorical metrics, testing pyramid, continuous expansion, and deterministic guards.