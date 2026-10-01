# Scanning Scoreboard (`/wall/scoreboard`)

An **ops monitoring board** for the scanning → chunking → extraction pipeline. It answers,
per section: *how far has each answer paper progressed, and which papers have issues?*

> **It is strictly read-only.** Every call is a GET (batches, batch-students, review queue,
> onboarding roster). It never writes — deploying it cannot change pipeline data.

---

## Layout at a glance

- **Separate stage panels** laid out left→right as an accordion: **Scanning & Uploading**,
  **Answer Chunking**, **Answer Extraction**. One is expanded; the rest collapse to vertical
  bars (each shows its `X/Y` rollup). Click a bar to open it (the previous one collapses).
- Inside the open stage, **one row per section** (e.g. `12 A`): a tile, stage-scoped metric
  chips, and a grid of **cells — one per answer paper**, coloured by that paper's status
  *within this stage*.
- Click a section row → its **student list drops down inline** underneath. Each student row
  shows its status and, if any, its **issue text inline**; clicking a row expands a detail
  panel. (This replaced an earlier right-hand drawer.)
- **Top bar** hosts the **scope filter** (a macOS-Finder-columns breadcrumb) so it can become
  the site-wide nav later. A **Issues** button opens a right-hand roll-up of all issues.

---

## Data flow (all reads)

```
beaver-api / aggregatedData            beaver (this feature)
─────────────────────────────          ─────────────────────────────
GET /api/batches ......................  listBatches()          ─┐
GET /api/:batch/students ..............  computeBucket() ────────┤→ buildSections()
GET /api/student-lookup/list ..........  (onboarding roster)  ───┤     → SectionBoard[]
GET /api/review/queue .................  loadBatchReview() ──────┘        (Cell[])
```

- `page.tsx` fetches the batch list, then resolves each batch a few at a time
  (`CONCURRENCY = 6`) so the board fills progressively.
- `buildSections()` groups papers into sections and produces one `Cell` per paper.

---

## The two axes it combines

The board fuses **two orthogonal questions** that used to be separate views:

| Axis | Question | Source | Trustworthy today? |
|---|---|---|---|
| **Roster** (Faiza's) | Is every rostered student's paper here, and only theirs? → `arrived / missing / misplaced` | onboarding roster ∩ uploaded | **No** — needs identity linkage (see Limitations) |
| **Pipeline** | Of the papers we have, how far is each? | `batch_students.status` | Yes |

`computeBucket` (in `lib.ts`) owns the roster axis; `phases.ts` owns the pipeline axis.

---

## Stage-scoped statuses — the core idea

A paper has ONE global pipeline position (`batch_students.status`:
`uploaded → preprocessing → preprocessed → bbox_detecting → bbox_detected → ocr_* →
extracting_* → completed`). Each **stage panel re-projects** that onto *its own* vocabulary
via `projectStage(cell, stage)` in `phases.ts`:

- **in** the stage → the paper's real sub-status (e.g. "Uploading pages", pulsing)
- **past** the stage → **Cleared** (green)
- **before** the stage → **Not yet** (grey)
- **missing** → only meaningful on the Scanning axis

So a paper "fills in" Scanning → Chunking → Extraction as it advances; each panel is a later
milestone, not a repeat. Metric chips (`stageMetrics`) and the legend (`STAGE_LEGEND`) are
scoped the same way.

---

## Issues (warnings / blockers)

All issues come from **one function**, `classifyError()` in `phases.ts`, reading per-paper
signals. Two severities: **blocking** (red) and **soft/warning** (orange).

| Severity | Fires when | Signal |
|---|---|---|
| blocking | `error_message` present | `batch_students.error_message` |
| blocking | `status === "failed"` | `batch_students.status` |
| blocking | no progress > `STUCK_HOURS` (3h) & not terminal | derived from `updated_at` |
| soft | `status === "partial"` | pages failed to upload |
| soft | `misplaced` | not on this section's roster |

Issues are **stage-scoped** (a chunking failure won't show in the Scanning panel) and surface
three ways:
1. an exclamation badge on the board cell,
2. **inline issue text on the student row** (no click needed),
3. the **row's expandable detail** panel (status, issue, last-progress time, review, placement).

⚠️ **Known-weak sources (being replaced).** The pipeline (River/Temporal) *freezes* on hard
failure — it rarely writes `error_message` and never writes `status="failed"`. So in practice
the load-bearing blocker is the **flat-3h stuck heuristic**. Making issue *sources* accurate
is separate work (pulling status directly from Temporal); this board is the surface that
displays them. The row-detail panel carries **subtle placeholders** for what's still coming
(reconciliation detail, ops-edit/review history, re-run actions).

---

## Scope filter (`ScopeNav.tsx`)

Finder-columns breadcrumb over `School → Grade·Year → Subject·Exam → Section`. Interaction:
- **hover / arrows = explore** — reveals the next column + highlights, but does **not** touch
  the board (committed selection stays fixed, shown with a check).
- **click / Enter = commit + close** — applies the scope to the board and dismisses the panel.

The committed scope drives which sections show, the rollup text, and the Issues roll-up's
grouping (`granularityOf` = the deepest unselected level).

---

## Mock / dev mode

`?mock=1` renders a synthetic feed (`mock.ts`) covering every status/issue/roster case — no
backend needed. `?open=1` pre-expands the first row. **Both are gated behind
`NODE_ENV !== "production"`**, so they are inert in a production build.

---

## File map

| File | Role |
|---|---|
| `page.tsx` | fetch + state + layout (panels, drawer, scope, issues) |
| `phases.ts` | pipeline vocabulary, `projectStage`, `classifyError`, stage defs/legend/rollup |
| `scanboard.ts` | `buildSections`, the `Scope` model + filtering, granularity helpers |
| `lib.ts` | `computeBucket` — roster reconciliation (arrived/missing/misplaced) |
| `StagePanel.tsx` | one collapsible stage panel |
| `SectionRow.tsx` | a section row (tile + chips + cells) |
| `cells.tsx` | the per-paper cell grid |
| `StudentDrawer.tsx` | the inline student list + per-row expandable detail |
| `ErrorDrawer.tsx` | the right-hand "Issues" roll-up |
| `ScopeNav.tsx` | the top-bar scope filter |
| `StageLegend.tsx` | per-stage legend |
| `mock.ts` | dev-only synthetic feed |

---

## Limitations / dependencies

1. **Roster axis (missing/misplaced) is untrustworthy until identity linkage lands.** Uploaded
   papers often lack a stable key to the roster, so fuzzy name/roll matching under-reconciles;
   the board suppresses the flags per section when *nothing* reconciles (`rosterUnlinked`).
2. **Issue sources depend on the Temporal-status work** to distinguish a *stuck* paper from a
   *dead* one (see the ⚠️ note above).
3. **Read fan-out:** one GET per batch for students + review, plus a cached roster GET per
   school. Fine at current scale; worth batching if a school grows very large. (Load only —
   not a data-safety concern.)
