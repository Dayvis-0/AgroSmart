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
- [ ] P1-T1. Implement per-crop suitability from climate: water demand vs monthly `PRECTOTCORR`, temperature window vs `T2M`, and heat/frost risk from the series.
- [ ] P1-T2. Apply soil modifiers (texture, pH, organic matter, drainage, water) to each crop/rotation score.
- [ ] P1-T3. Keep the five farmer-priority weights as the aggregation function; document the formula and its assumptions.
- [ ] P1-T4. Replace static scores in `demo-scenarios.json` usage with computed scores; keep demo only for offline fallback.
- [ ] P1-T5. Add a second NASA source (GPM rainfall and/or SMAP soil moisture) as labeled regional context and coverage check, resampled/aggregated to the farm point.

Acceptance: changing climate data, soil, crops, or priorities changes the ranking deterministically; a unit test asserts the formula.

### Phase 2 — Rotation generation and three-way comparison
Goal: always compare at least three rotations, including the current one, with evidence and risks.
- [ ] P2-T1. Generate candidate rotations from the selected crops (valid sequences) instead of a fixed A/B/C list.
- [ ] P2-T2. Guarantee at least three candidates plus the current rotation; rank them by the computed score.
- [ ] P2-T3. Show per-rotation evidence: which climate/soil factors drove the score (plain-language explanation).
- [ ] P2-T4. Show per-rotation risks derived from data (water deficit, heat stress, erosion/monoculture, frost) instead of static text.
- [ ] P2-T5. Handle the default crop selection so it still yields 3+ valid rotations.

Acceptance: any selection produces 3+ comparable rotations with derived evidence and risks, including the current rotation.

### Phase 3 — Farmer-centered presentation
Goal: make the comparison interpretable for farmers with limited technical background.
- [ ] P3-T1. Plain-language summary per rotation (what it improves, what it costs, main risk).
- [ ] P3-T2. Explicit source/resolution labels (NASA POWER ~50 km, second source resolution, local vs satellite).
- [ ] P3-T3. Reminder that the tool supports, not replaces, local expertise.
- [ ] P3-T4. Keep the existing guided step flow; add a comparison view that is readable on mobile.

Acceptance: a farmer can read the top recommendation and its reason without technical jargon.

### Phase 4 — Report accuracy and completeness
Goal: the PDF and README reflect what the code actually does.
- [ ] P4-T1. Make the PDF render computed scores, evidence, and risks (not static demo values).
- [ ] P4-T2. Correct the "NASA POWER & GIBS" claim in `js/reports/pdf-report.js` to match real integrations.
- [ ] P4-T3. Update `README.md` with the real data model, sources, resolution caveats, and fallback behavior.

Acceptance: every claim in the PDF/README is backed by code.

### Phase 5 — Verification and delivery
Goal: prove the tool works and is safe to submit.
- [ ] P5-T1. Unit tests for the scoring formula, rotation generation, and current-rotation handling.
- [ ] P5-T2. Structural/manual checks with `python3 -m http.server` and a real NASA POWER fetch for Andahuaylas.
- [ ] P5-T3. Offline fallback check (demo data path) and error states.
- [ ] P5-T4. Native review under the user-owned RDD switch, per work-unit commit.
- [ ] P5-T5. Update this document with evidence and the final verified outcome.

Acceptance: tests pass, live + fallback paths work, and the verified outcome is recorded.

## Verification (cross-phase)
- `node --check` on all touched JS modules.
- `python3 -m json.tool` on touched JSON.
- Unit tests for scoring and rotation generation.
- Manual browser run for live NASA POWER and fallback.
- Readback of PDF/README claims against code.

## Risks
- NASA POWER is ~50 km resolution: label it as regional context, not field truth.
- Second source (SMAP/GPM) may need Earthdata login; keep it optional and clearly labeled.
- Scoring is a simplified agronomic model: document assumptions and uncertainty.
- Scope growth: keep phases small; do not add backend or broad redesign.

## Next step
Start Phase 0 (data model + current rotation). No source write before this plan is reviewed.
