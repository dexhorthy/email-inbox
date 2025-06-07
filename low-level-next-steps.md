# Low-Level Next Steps

## Phase 1: Enhanced Dataset Layout & BAML Tests

• Add `content_hash` field to `EmailDataPoint` interface in `src/datasets.ts`
• Add `processing_context` field with `rules_version`, `model_version`, `processing_timestamp` 
• Create `generateContentHash()` function using crypto to hash subject + from + body
• Add `getCurrentRulesVersion()` function to track rules file changes
• Add `getModelVersion()` function to extract from BAML client context
• Update `DatasetManager.startNewRun()` to create `runs/{runId}/` structure instead of flat
• Create `runs/{runId}/meta.json` with run metadata and context
• Create `runs/{runId}/emails/` subdirectory for email files
• Update `DatasetManager.saveEmailData()` to save in `runs/{runId}/emails/{emailId}.json`
• Add `createRunSummary()` method to generate `runs/{runId}/summary.json`
• Add `updateGlobalIndex()` method to maintain `datasets/index.json`
• Add `createEmailIndex()` method to maintain `emails/by-hash/{hash}.json`
• Add `updateEmailIndex()` method to append runs to existing email indices
• Create `emails/by-hash/` and `emails/by-message-id/` directories
• Test enhanced layout with existing CLI: `bun run src/cli.ts process --num-records 1`

## BAML Unit Tests

• Add `test DetectsObviousSpam` to `baml_src/isSpam.baml` with clear spam content
• Add `test Handles2FACorrectly` to `baml_src/isSpam.baml` with verification code content  
• Add `test HandlesNewsletterCorrectly` to `baml_src/isSpam.baml` with newsletter content
• Add `test ClassifiesUrgent2FA` to `baml_src/classifier.baml` with 2FA scenario
• Add `test ClassifiesNewsletterAsReadLater` to `baml_src/classifier.baml` with newsletter
• Add `test ClassifiesDraftReply` to `baml_src/classifier.baml` with meeting request
• Add `test ClassifiesNotifyImmediately` to `baml_src/classifier.baml` with security alert
• Add `test UpdatesRulesCorrectly` to `baml_src/updateRules.baml` with rule update scenario
• Run `bun run baml:test` to verify all tests pass
• Add `test HandlesPhishingEmail` to `baml_src/isSpam.baml` with phishing content
• Add `test HandlesMagicLink` to `baml_src/isSpam.baml` with auth link content

## Dataset Manager Enhanced Methods

• Add `findEmailsByHash(contentHash: string): Promise<EmailProcessingRun[]>` method
• Add `getEmailHistory(emailId: string): Promise<EmailProcessingRun[]>` method  
• Add `compareEmailRuns(runId1: string, runId2: string, emailId: string)` method
• Add `listEmailsWithMultipleRuns(): Promise<string[]>` method
• Add `getRunMetadata(runId: string): Promise<RunMetadata>` method
• Add `updateRunMetadata(runId: string, metadata: RunMetadata)` method
• Add `getGlobalIndex(): Promise<GlobalIndex>` method
• Add `updateGlobalIndex(runId: string, emailCount: number)` method
• Test all new methods with sample data

## Basic Evaluation Runner

• Create `evals/runner.ts` with main evaluation engine
• Add `runEvaluations()` function to execute BAML tests + integration tests
• Add `generateEvalReport()` function to create test results summary
• Add `checkSystemGuards()` function with deterministic validations
• Create `evals/guards.ts` with validation rules for 2FA detection, consistency checks
• Create `evals/metrics.ts` with categorical accuracy enums and calculation functions
• Add `bun run eval` script to `package.json` that runs `evals/runner.ts`
• Test evaluation runner with existing dataset files

## Phase 2: Integration Tests & Dashboard

## TypeScript Integration Tests

• Create `tests/integration/` directory
• Add `spam-human-rule-update.test.ts` for spam → human feedback → rule update flow
• Add `email-processing-pipeline.test.ts` for full email processing with dataset capture
• Add `dataset-indexing.test.ts` for cross-run email indexing functionality
• Add `rule-versioning.test.ts` for rules version tracking across runs
• Use existing `DatasetManager` and mock human interactions for tests
• Run integration tests with `bun test tests/integration/`

## Next.js Dashboard Setup

• Run `npx create-next-app@latest dashboard --typescript --tailwind --app`
• Move dashboard into project: `mv dashboard/* dashboard/` or create in root
• Add dashboard dependencies: `cd dashboard && npm install recharts lucide-react`
• Create `dashboard/lib/api.ts` with functions to read datasets directory
• Create `dashboard/types/index.ts` with TypeScript interfaces for data structures
• Create `dashboard/components/MetricsGrid.tsx` component for summary stats
• Create `dashboard/components/RunsList.tsx` component for runs tab
• Create `dashboard/components/EmailInputs.tsx` component for email inputs tab
• Create `dashboard/components/EmailHistory.tsx` component for same-email history

## Dashboard API Routes

• Create `dashboard/app/api/datasets/index/route.ts` to serve global index
• Create `dashboard/app/api/datasets/runs/[runId]/route.ts` to serve run details
• Create `dashboard/app/api/datasets/emails/by-hash/[hash]/route.ts` for email history
• Create `dashboard/app/api/datasets/emails/multiple-runs/route.ts` for multi-run emails
• Test API routes return correct JSON data from datasets directory

## Dashboard Pages

• Create `dashboard/app/page.tsx` main page with tabs for runs and email inputs
• Create `dashboard/app/runs/[runId]/page.tsx` for run detail drill-down
• Create `dashboard/app/emails/[hash]/page.tsx` for email processing history
• Add run comparison dropdowns in email inputs tab with default to latest/second-latest
• Add side-by-side comparison view for same email across different runs
• Test dashboard with existing dataset files
• Add loading states and error handling for all API calls

## Phase 3: Production Integration

• Add deterministic guards to production email processing pipeline in `src/handleEmail.ts`
• Create `captureGoldenCase()` function to automatically promote interesting cases
• Add golden dataset management with `datasets/golden/` storage
• Implement regression detection alerts for accuracy drops
• Add evaluation review workflow for model/prompt updates
• Create CI integration to block PRs if BAML tests fail
• Add weekly golden dataset review and expansion process
• Create A/B testing framework for prompt changes
• Add adversarial case generation for edge case testing