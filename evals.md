# evals.md — Structuring Evals in LLM Projects

source: https://www.youtube.com/watch?v=-N6MajRfqYw

> **Purpose**  
> A concise architecture note for Claude / Codex agents joining a new project.  
> It explains *why* evals matter, *when* to add them, and *how* to keep them lean, fast, and actionable.

---

## 1 · Why Evals?

* Anchor model work in reality – surface regressions early.  
* Turn “I think it’s better” into **measurable** improvement.  
* Enable CI/CD-style development loops (change → run evals → merge if pass).  

---

## 2 · When to Introduce Evals

| Stage | What to do | Goal |
|-------|------------|------|
| **Idea → Prototype** | *Vibe‑check* in a playground. Manually inspect ~10 diverse cases. | Build mental model of “good vs bad”. |
| **Prototype → First users** | Ship! Log prod inputs/outputs + user complaints. | Gather real failure modes. |
| **First users → Growing team** | Turn logged cases into a **golden set** (exact expected outputs). Add a few automated tests. | Catch obvious regressions. |
| **Mature product** | Expand test pyramid (unit ≫ integration ≫ e2e). Automate runtime guards / self‑corrections. | Sustain quality while shipping fast. |

---

## 3 · Best‑Practice Checklist

### 3.1 Prefer Categorical Metrics  
*Avoid 1‑10 “confidence scores”.*  
Use enums / tags that directly flag issues, e.g.:

```python
class Pacing(str, Enum):
    SLOW   = "slow"
    MEDIUM = "medium"
    FAST   = "fast"
```

### 3.2 Follow the Testing Pyramid  

```
many ►   Unit tests        (functions, prompts, tools)  
some  ►  Integration tests (2–3 steps wired together)  
few   ►  End‑to‑end tests  (full user flow)  
```

### 3.3 Emit Structured Outputs  

Design prompts to return JSON (or BAML / Pydantic models).  
Granular assertions become trivial:

```python
plan = gen_lesson_plan(topic="Intro to AI")
assert plan.estimated_cost < 5
assert plan.pacing in Pacing
```

### 3.4 Probe Intermediate Steps  

Expose or mock sub‑steps:

```text
User → intent_classifier → products_lookup → answer_generator
```

Test each box in isolation **but also** record its output during e2e tests.

### 3.5 Continuously Expand the Golden Dataset  

1. Log input output pairs during general execution.
2. When a bug appears, add that case (with correct output) to your golden set.  
3. Re‑run golden set on every PR.

### 3.6 Diff & Visualize  

Generate side‑by‑side diffs of old vs new outputs.  
Even a simple Next.js page that lists changed tests accelerates review.

### 3.7 Add Deterministic Guards  

Use plain code to validate numeric relations:

```python
assert row.qty * row.price == pytest.approx(row.market_value, rel=1e-3)
```

If a guard fails, auto‑flag or route to a “fix‑up” LLM.

---

## 4 · Mini Example — Lesson‑Plan Eval

```python
from dataclasses import dataclass
from enum import Enum

class Pacing(str, Enum):
    SLOW   = "slow"
    MEDIUM = "medium"
    FAST   = "fast"

@dataclass
class LessonPlan:
    title: str
    pacing: Pacing
    estimated_cost: float
    objectives: list[str]
    bias_flags: list[str]

def test_lesson_plan():
    plan = gen_lesson_plan("Fractions for 3rd grade")
    assert plan.pacing != Pacing.FAST
    assert plan.estimated_cost <= 5.0
    assert plan.bias_flags == []
    assert len(plan.objectives) >= 3
```

Add this test to your CI; failures block the merge.

---

## 5 · Conclusion

*Start tiny, ship, then tighten.*  
Evals are living assets—versioned with code, expanded with every real‑world edge case.  
Follow the checklist above to keep them **fast, focused, and future‑proof**.
