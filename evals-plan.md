# Email Inbox Evaluation Plan

> **Focus**: Start dataset development with playground vibe-checking → structured evaluation pipeline

---

## 🎯 IMMEDIATE PRIORITY: Dataset Development

**The goal**: Create `datasets/` directory structure and start collecting email processing examples for evaluation.

### Step 1: Create Dataset Structure
```bash
mkdir -p datasets/{runs,emails/by-hash,emails/by-message-id,golden,synthetic}
touch datasets/index.json
```

### Step 2: Start Collecting Examples  
- Run CLI to process emails → capture to `datasets/runs/`
- Focus on interesting cases: spam/not-spam, urgent/not-urgent
- Build playground for vibe-checking model outputs

---

### Basic Testing Approach
1. **BAML Unit Tests**: Add tests directly in `.baml` files for individual functions
2. **Golden Dataset**: Save interesting examples for regression testing  
3. **Playground Dashboard**: Simple Next.js page to browse results

---

## 📊 What We Need Right Now

### Dataset Collection
- Start running CLI → save outputs to `datasets/runs/`
- Capture interesting cases: clear spam, borderline cases, 2FA codes
- Build up examples for model evaluation

### Basic Validation
- Add simple BAML tests for obvious cases (spam detection, 2FA classification)
- Create guards for critical misses (2FA → notify_immediately)

---

## 🚀 Implementation Steps

**Phase 1: Get Datasets Working**
- Create `datasets/` directory structure  
- Update CLI to save processing results
- Add content hashing for deduplication
- Build basic dashboard to browse results

**Phase 2: Add Testing**
- Write BAML unit tests for obvious cases
- Create golden dataset from interesting examples
- Add evaluation runner

**Phase 3: Iterate**
- Expand test coverage based on real failures
- Add drift detection
- Build comparison tools

---

## 📁 Simplified File Structure

```
datasets/
├── runs/           # CLI processing results
├── golden/         # Hand-curated test cases  
└── index.json     # Fast query index

baml_src/           # Add tests here
├── isSpam.baml     # + unit tests
└── classifier.baml # + unit tests
```