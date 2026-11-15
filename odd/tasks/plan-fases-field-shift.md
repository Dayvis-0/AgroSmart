# Plan por fases — Alineación con "Field Shift: Adapting Farms with NASA Data"

## Objective
Convert AgroSmart from a UI prototype with static demo scores into a real decision-support tool that combines NASA Earth observations with local soil, crop characteristics, and farmer priorities to compute and compare crop rotations.

## Problem
Today the app captures soil, crops, and priorities, and calls NASA POWER, but rotation scores are hardcoded in `data/demo-scenarios.json`. The NASA climate does not drive the ranking, the soil does not affect the score, the default crop selection enables only one rotation, and there is no "current rotation" input. The PDF also claims a GIBS integration that does not exist.

## Scope
- In scope: scoring model derived from NASA + local data, current-rotation input, guaranteed 3+ rotation comparison, derived evidence/risks, report accuracy, a second NASA source, persistence.
- Out of scope: backend/service, multi-user accounts, real-time satellite download pipelines, broad visual redesign.

## Constraints
- Front-end vanilla JS (ES modules) + JSON; keep the current architecture.
- NASA POWER is the primary source (no key, works in browser). A second source (GPM and/or SMAP) is added as regional context with explicit resolution labels.
- Local soil/crop data is user-entered or from `data/soil-examples.json`; it is not a NASA product and must be labeled as such.
- The ~400 authored changed lines per task is an advisory planning heuristic, not a hard cap or split trigger.

## Phases

### Phase 0 — Foundations: data model and current rotation
Goal: make the app operate on an explicit, computable data model instead of static demo values.
- [x] P0-T1. Define a normalized internal model for a rotation (ordered crop sequence + computed per-criteria scores) and a `Rotation` type shared by engine, UI, and report.
- [x] P0-T2. Add a "current rotation" input (select the sequence the farmer actually uses) and treat it as one of the compared scenarios.
- [x] P0-T3. Add lightweight persistence (localStorage) for soil, parcel, priorities, and current rotation; load on start, clear on explicit reset.
- [x] P0-T4. Keep `data/demo-scenarios.json` only as a labeled fallback/demo, never as the scoring source.

Acceptance: the app has a single source of truth for rotations; current rotation is captured and persisted.

Phase 0 progress:
- Added `js/agriculture/rotation-model.js` (`createRotation`, `normalizeRotation`, `buildCurrentRotation`, `sequenceToText`, `CURRENT_ROTATION_ID`) as the shared model; engine, dashboard, and PDF consume it.
- Added `js/state-persistence.js` (versioned `agrosmart:state:v1`) wired into `js/state.js`; reset control added in `index.html`.
- Current rotation input added in `index.html` Paso 4 and `js/ui/forms.js`; included in ranking via `js/main.js`.
- `data/demo-scenarios.json` marked `demo: true` with `origin: "demo"` on every rotation.
- Evidence: `node --test` 20 pass / 0 fail; `node --check` clean on touched files; `python3 -m json.tool` valid; readback confirmed persistence round-trip and current rotation in ranked output.

### Phase 1 — NASA-driven scoring engine
Goal: scores are computed from NASA climate + crop + soil + priorities, not hardcoded.
- [x] P1-T1. Implement per-crop suitability from climate: water demand vs monthly `PRECTOTCORR`, temperature window vs `T2M`, and heat/frost risk from the series.
- [x] P1-T2. Apply soil modifiers (texture, pH, organic matter, drainage, water) to each crop/rotation score.
- [x] P1-T3. Keep the five farmer-priority weights as the aggregation function; document the formula and its assumptions.
- [x] P1-T4. Replace static scores in `demo-scenarios.json` usage with computed scores; keep demo only for offline fallback.
- [x] P1-T5. Add a second NASA source (GPM rainfall and/or SMAP soil moisture) as labeled regional context and coverage check, resampled/aggregated to the farm point.

Acceptance: changing climate data, soil, crops, or priorities changes the ranking deterministically; a unit test asserts the formula.

Phase 1 progress:
- Added `js/agriculture/scoring-engine.js` (pure deterministic scoring, documented formula/assumptions) and `js/api/regional-context.js` (best-effort GPM IMERG probe, explicit labeled unavailable fallback).
- Wired computed scoring in `js/main.js`; extended `data/crops.json` with agronomic attrs; regional context surfaced in state/UI.
- Evidence: `node --test` 24 pass (incl. scoring-engine RED→GREEN); checks green; deterministic readback showed climate/soil changes alter scores/ranking. Commit `4e78796`.

### Phase 2 — Rotation generation and three-way comparison
Goal: always compare at least three rotations, including the current one, with evidence and risks.
- [x] P2-T1. Generate candidate rotations from the selected crops (valid sequences) instead of a fixed A/B/C list.
- [x] P2-T2. Guarantee at least three candidates plus the current rotation; rank them by the computed score.
- [x] P2-T3. Show per-rotation evidence: which climate/soil factors drove the score (plain-language explanation).
- [x] P2-T4. Show per-rotation risks derived from data (water deficit, heat stress, erosion/monoculture, frost) instead of static text.
- [x] P2-T5. Handle the default crop selection so it still yields 3+ valid rotations.

Acceptance: any selection produces 3+ comparable rotations with derived evidence and risks, including the current rotation.

Phase 2 progress:
- Added `js/agriculture/rotation-generator.js` and `js/agriculture/rotation-insights.js`; `js/main.js` generates candidates from selected crops, computes/derives `notas`, and guarantees 3+ including current; demo rotations kept fallback-only.
- Evidence: `node --test` 30 pass (incl. generator RED→GREEN); default selection yields 6 candidates with data-derived notes. Commit `0400dda`.

### Phase 3 — Farmer-centered presentation
Goal: make the comparison interpretable for farmers with limited technical background.
- [x] P3-T1. Plain-language summary per rotation (what it improves, what it costs, main risk).
- [x] P3-T2. Explicit source/resolution labels (NASA POWER ~50 km, second source resolution, local vs satellite).
- [x] P3-T3. Reminder that the tool supports, not replaces, local expertise.
- [x] P3-T4. Keep the existing guided step flow; add a comparison view that is readable on mobile.

Acceptance: a farmer can read the top recommendation and its reason without technical jargon.

Phase 3 progress:
- Added `js/agriculture/rotation-summary.js` (mejora/cuesta/riesgo), wired into comparison/UI; explicit local vs satellite/regional source labels and reminders; mobile-readable comparison styles.
- Evidence: `node --test` 32 pass (summary RED→GREEN); readback shows plain-language summary and source labels. Commit `fe55956`.

### Phase 4 — Report accuracy and completeness
Goal: the PDF and README reflect what the code actually does.
- [x] P4-T1. Make the PDF render computed scores, evidence, and risks (not static demo values).
- [x] P4-T2. Correct the "NASA POWER & GIBS" claim in `js/reports/pdf-report.js` to match real integrations.
- [x] P4-T3. Update `README.md` with the real data model, sources, resolution caveats, and fallback behavior.

Acceptance: every claim in the PDF/README is backed by code.

Phase 4 progress:
- `js/reports/pdf-report.js` renders computed scores, derived notas, summaries and accurate source/context labels; GIBS claim removed. `README.md` rewritten to reflect real architecture, computed scoring/generation, sources, persistence, caveats, and fallback.
- Evidence: `node --test` 32 pass; checks green; no "GIBS" in PDF/README; no static 82/74/56 engine claim. Commit `0cc0d8b`.

### Phase 5 — Verification and delivery
Goal: prove the tool works and is safe to submit.
- [x] P5-T1. Unit tests for the scoring formula, rotation generation, and current-rotation handling.
- [x] P5-T2. Structural/manual checks with `python3 -m http.server` and a real NASA POWER fetch for Andahuaylas.
- [x] P5-T3. Offline fallback check (demo data path) and error states.
- [x] P5-T4. Native review under the user-owned RDD switch, per work-unit commit. (Assessed; immutable receipt review unavailable in this runtime — see evidence.)
- [x] P5-T5. Update this document with evidence and the final verified outcome.

Acceptance: tests pass, live + fallback paths work, and the verified outcome is recorded.

Phase 5 evidence (2026-11-15):
- **P5-T1:** `node --test` → **32 pass / 0 fail** (`parcel-polygon`, `rotation-engine`, `rotation-generator`, `rotation-model`, `rotation-summary`, `scoring-engine`). Coverage includes scoring formula determinism and climate/soil/priority effects, rotation generation (default 3+, deterministic/few-crop variants), and current-rotation handling (model/build/ranking, generator compatibility).
- **P5-T2:** `node --check` on all `js/**/*.js` → `all-js-check-ok`; `python3 -m json.tool` on `data/crops.json`, `data/demo-scenarios.json`, `data/soil-examples.json` → `json-ok`. Live NASA POWER fetch (Andahuaylas `-13.6539,-73.3875`, monthly point AG, 2023–2025) → **HTTP 200**, `hasParams true`, `T2M_keys 39`.
- **P5-T3:** Demo/offline fallback (mocked local `data/demo-scenarios.json`) → `fetchDemoClimate` returns `source=demo`, labeled provider `Datos de demostración`, series present. Error state: forced NASA POWER 503 → `fetchClimate` throws (`NASA POWER respondió 503…`), matching the UI fallback/error path.
- **P5-T4 (RDD, user-owned):** `gentle-ai review mode status` reports **on (default)**. `gentle-ai review assess --cwd . --agent opencode --base-ref 0cc0d8b --committed-only --json` → `risk: high`, `review_due: true`, reason `unassessable` ("the active runtime is not eligible for immutable receipt review; supported immutable review runtimes: claude-code, codex"). No receipt/acknowledgement was produced in this runtime; native review was not executed (runtime ineligible) and RDD was not disabled.
- **Commits:** `7b10940` (P0), `691c5cf` (UI neutral ES), `4e78796` (P1), `0400dda` (P2), `fe55956` (P3), `0cc0d8b` (P4). Phase 5 changes not committed.

## Final verified outcome
- **Verified:** automated tests pass (32/32), structural JS/JSON checks pass, live NASA POWER query for Andahuaylas succeeds, and demo fallback/error behavior is correct and labeled. The tool computes rotation scores from NASA POWER climate + local soil/crops/priorities, generates 3+ candidates including current rotation with derived evidence/risks/summaries, labels sources/resolution and local-vs-satellite data, persists inputs, and reports accurate integrations (NASA POWER + best-effort/labeled GPM regional context; no GIBS claim).
- **Pending / limitations:** RDD immutable receipt review could not be completed in this `opencode` runtime (unassessable/unsupported); a supported runtime is required for acknowledged receipt-driven review. Browser/manual visual pass (`python3 -m http.server 8000`) remains recommended for full UX confirmation. GPM/SMAP regional context is best-effort and often unavailable in-browser (CORS/Earthdata), shown as explicitly labeled context.

## Verification (cross-phase)
- `node --check` on all JS modules.
- `python3 -m json.tool` on data JSON.
- Unit tests for scoring, rotation generation, summaries, model/persistence, and geometry.
- Live NASA POWER fetch (Andahuaylas) and demo fallback/error checks.
- Readback of PDF/README claims against code.

## Risks
- NASA POWER is ~50 km resolution: labeled as regional context, not field truth.
- Second source (GPM/SMAP) may need Earthdata login/CORS-free access; kept optional and clearly labeled (often unavailable).
- Scoring is a simplified agronomic model: assumptions and uncertainty documented.
- RDD receipt review requires a supported runtime for immutable acknowledgement.

## Next step
Phase 5 complete (uncommitted). Commit Phase 5 (including this plan update) when ready, and run native RDD review in a supported runtime if an acknowledged receipt is required.
