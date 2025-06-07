# Low-Level Next Steps

## Immediate Priority: Dataset Development & Playground

• Create datasets directory structure: `mkdir -p datasets/{runs,golden,emails/by-hash}`
• Update `datasets.ts` to save CLI processing results to `datasets/runs/run-{timestamp}/`
• Add content hashing (SHA256 of subject+from+body) to EmailDataPoint for deduplication
• Update CLI to automatically save every processing run with metadata
• Create simple `index.json` file tracking all runs for dashboard queries
• Add run metadata: timestamp, rules version, model version, CLI args, email count
• Test CLI saves results: run `bun run dev-test-one` → check `datasets/runs/` populated

## Basic Testing Setup

• Create golden dataset examples in `datasets/golden/` with hand-picked cases
• Add simple guards using BAML @assert for critical failures (2FA misclassification)
• Run `bun run baml:test` to verify basic unit tests pass
• Create evaluation runner script: `bun run eval` to run tests against golden dataset

## Simple Dashboard

• Create Next.js dashboard app in `dashboard/` directory  
• Add pages: runs list, run detail, email comparison
• Build API routes to serve data from `datasets/` directory
• Add basic UI to browse processing results and spot-check model outputs
• Enable playground-style vibe-checking of classification decisions
• Add simple metrics: spam detection rate, classification distribution

## Content Hashing & Deduplication

• Implement SHA256 hashing of email content (subject + from + body)
• Create cross-run indexing in `datasets/emails/by-hash/` 
• Track when same email gets processed multiple times with different results
• Add dashboard view to compare different runs of same email content
• Enable detection of classification drift over time

## Validation & Guards

• Add basic BAML @assert guards for critical misclassifications
• Create deterministic validation rules (2FA codes must be notify_immediately)
• Add consistency checks (spam analysis must match final classification)
• Log validation failures for analysis
• Skip complex confidence-based guards initially - focus on categorical validation

## Testing Coverage

• Add BAML tests for edge cases: newsletters, 2FA, obvious spam, borderline cases
• Create integration tests for multi-step workflows (spam → human → rule update)
• Add regression tests from any real failures encountered
• Expand golden dataset with interesting examples from production runs
• Add CI integration to block PRs if BAML tests fail

## Dashboard Features

• Runs tab: list all processing runs with summary stats
• Run detail: drill down into specific run, browse all emails processed
• Email comparison: side-by-side view of same email processed at different times
• Search/filter by classification, spam status, confidence levels
• Export functionality for analysis
• Basic metrics and trends visualization