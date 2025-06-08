# evals.md — Structuring Evals in LLM Projects

source: https://www.youtube.com/watch?v=-N6MajRfqYw

> **Purpose**  
> A concise architecture note for Claude / Codex agents joining a new project.  
> It explains *why* evals matter, *when* to add them, and *how* to keep them lean, fast, and actionable.

---

## 1 · Why Evals?

* Anchor model work in reality – surface regressions early.  
* Turn "I think it's better" into **measurable** improvement.  
* Enable CI/CD-style development loops (change → run evals → merge if pass).  

---

## 2 · When to Introduce Evals

| Stage | What to do | Goal |
|-------|------------|------|
| **Idea → Prototype** | *Vibe‑check* in a playground. Manually inspect ~10 diverse cases. | Build mental model of "good vs bad". |
| **Prototype → First users** | Ship! Log prod inputs/outputs + user complaints. | Gather real failure modes. |
| **First users → Growing team** | Turn logged cases into a **golden set** (exact expected outputs). Add a few automated tests. | Catch obvious regressions. |
| **Mature product** | Expand test pyramid (unit ≫ integration ≫ e2e). Automate runtime guards / self‑corrections. | Sustain quality while shipping fast. |

---

## 3 · Start Simple, Add Complexity Later

### 3.1 Vibe-Check First
*Manual inspection beats premature automation.*
- Run your system on ~10 diverse cases
- Manually review outputs, build intuition for "good vs bad"
- Look for obvious patterns and failure modes

### 3.2 Log Everything
*Store inputs/outputs from every run.*
- Capture real usage data automatically  
- User complaints become your test cases
- No need to structure it yet - just save it

### 3.3 Diff & Visualize  
*Simple dashboards beat complex metrics.*
Generate side‑by‑side diffs of old vs new outputs.  
Even a basic Next.js page that shows "what changed" accelerates review.

### 3.4 Prefer Categorical Metrics  
*Avoid 1‑10 "confidence scores".*  
Use simple enums that directly flag issues:

```python
class Result(str, Enum):
    SPAM = "spam"
    READ_TODAY = "read_today" 
    READ_LATER = "read_later"
```

### 3.5 Emit Structured Outputs  
Design prompts to return JSON (or BAML models).  
Simple assertions become possible:

```python
classification = classify_email(subject, body)
assert classification.result in Result
assert classification.result != "spam" if "2FA" in subject
```

---

## 4 · Advanced Techniques (Optional)

### 4.1 Golden Dataset  
*When you have time for proper test infrastructure:*
1. Turn logged cases into exact expected outputs
2. Re‑run golden set on every PR
3. Expand when bugs appear

### 4.2 Testing Pyramid  
```
many ►   Unit tests        (individual functions)  
some  ►  Integration tests (2–3 steps together)  
few   ►  End‑to‑end tests  (full user flow)  
```

### 4.3 Deterministic Guards (Optional)
*For critical validations:*
```python
# 2FA emails must be urgent
if "verification code" in email.subject.lower():
    assert classification.result == "notify_immediately"
```

### 4.4 Probe Intermediate Steps  
Test each component in isolation when debugging complex pipelines.

---

## 5 · Mini Example — Email Classification Eval

```python
from dataclasses import dataclass
from enum import Enum

class Classification(str, Enum):
    SPAM = "spam"
    READ_TODAY = "read_today"
    READ_LATER = "read_later"
    NOTIFY_IMMEDIATELY = "notify_immediately"

@dataclass
class EmailResult:
    classification: Classification
    is_spam: bool
    confidence: str

def test_email_classification():
    result = classify_email("Your verification code: 123456", "security@bank.com")
    assert result.classification == Classification.NOTIFY_IMMEDIATELY
    assert result.is_spam == False
    assert "2FA" in result.reasoning or "verification" in result.reasoning
```

Add this test to your CI; failures block the merge.

---

## 6 · Conclusion

*Start tiny, ship, then tighten.*  
Evals are living assets—versioned with code, expanded with every real‑world edge case.  
Follow the checklist above to keep them **fast, focused, and future‑proof**.