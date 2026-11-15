# Flujo y textos para agricultor

## Objective
Make the UI easier to understand and follow for farmers in Andahuaylas by improving flow guidance and plain-language copy, without a broad visual redesign.

## Scope
- In scope: step-by-step flow cues, plain-language labels/help text, climate/result guidance, farmer-mode copy clarity, jargon reduction/reframing in UI text.
- Out of scope: visual redesign/theme changes, new features/APIs, backend/data-model changes, non-essential refactors.

## Tasks
- [x] T1. Create task tracking document.
- [x] T2. Restructure main UI into clearer guided steps/sections (location/soil -> climate -> crops/priorities -> results) with concise instructions.
- [x] T3. Simplify and clarify copy for farmer audience (plain Spanish, explain key terms/actions, reduce NASA/technical jargon in visible labels where possible).
- [x] T4. Improve climate and comparison status/result guidance messages so next actions and meaning are clear.
- [x] T5. Run focused verification (syntax/checks/readback) and update task status with evidence.

## Progress
- T1: Created `odd/tasks/flujo-textos-agricultor.md` (Engram mirror pending/unavailable in this runtime).
- T2: Added guided step headers/sections in `index.html` (Paso 1 ubicación, Paso 2 suelo/agua, Paso 3 mapa y clima, Paso 4 cultivos/prioridades, Paso 5 recomendaciones) with short instructions.
- T3: Simplified farmer-facing copy in `index.html` (plain labels, coordinate hints, simpler soil/water wording, clearer priorities scale, reduced visible technical branding/jargon in topbar/disclaimer/cards).
- T4: Updated dynamic messages in `js/ui/dashboard.js`, `js/main.js`, and `js/ui/forms.js` (clearer climate states, fallback/error guidance, plain comparison guidance, friendlier location popups/errors).

## Verification
- `node --check js/main.js` ✅
- `node --check js/ui/dashboard.js` ✅
- `node --check js/ui/forms.js` ✅ (fixed an accidental duplicated `async` introduced during edit, then rechecked)
- `python3 -m json.tool data/demo-scenarios.json > /dev/null` ✅
- Manual readback of edited UI copy/flow in `index.html`, `js/ui/dashboard.js`, `js/main.js`, `js/ui/forms.js`.

## Next step
- Review in browser with a local HTTP server (`python3 -m http.server 8000`) to validate the full flow visually with real interaction.