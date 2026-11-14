# Modularize AgroSmart into the structure defined by fin.docx

## Objective

Split the single-file prototype (`index.html`, 1353 lines: ~620 CSS, ~280 HTML, ~450 JS) into the
module structure required by `fin.docx` §8, and replace the simulated climate values with a real
NASA POWER API integration.

## Why

`fin.docx` mandates: separate UI / data access / calculations (§3.2), a concrete folder tree (§8),
no single oversized JavaScript file, data in JSON, and a README (Phase 4). The current file also
fakes the NASA POWER response with `setTimeout` + hardcoded numbers, which §1.2 forbids.

## Scope

- In: file structure, ES modules, JSON data, real NASA POWER fetch, error and demo-fallback states,
  computed water-deficit alert, README.
- Out: NASA GIBS layers, Web Speech API, persistence, connecting the crop catalog to the engine.

## Constraints

- UI copy stays Spanish (existing app language). Identifiers, comments, README and commits in English.
- No behavior change beyond the explicitly authorized NASA POWER integration.
- All inline `onclick` handlers removed; no globals leaking from modules.
- ES modules require a local HTTP server; documented in README and in a console notice.

## Verified API facts (probed 2026-11-14)

- `GET https://power.larc.nasa.gov/api/temporal/daily/point`
- Query: `parameters`, `community=AG`, `latitude`, `longitude`, `start=YYYYMMDD`, `end=YYYYMMDD`, `format=JSON`
- Shape: `properties.parameter.<PARAM>.<YYYYMMDD>` -> number; `header.fill_value = -999`
- Units: T2M `C`, WS10M `m/s`, PRECTOTCORR `mm/day`, ALLSKY_SFC_SW_DWN `MJ/m^2/day` (divide by 3.6 for kWh)
- CORS: `access-control-allow-origin: *` when `Origin` is sent. No API key.
- 24 months of the 4 parameters: ~48 KB, ~0.8 s.

## Tasks

- [ ] T1 Commit the pre-existing geolocation feature (uncommitted user work) as its own unit.
- [ ] T2 Scaffold `css/`, `data/`, `js/` tree and `config.js` / `state.js`.
- [ ] T3 Split the stylesheet into `styles.css`, `layout.css`, `components.css`, `responsive.css`;
      verify the selector set is identical to the original.
- [ ] T4 Extract demo data to `data/*.json` (crops, demo scenarios, soil examples).
- [ ] T5 Extract the inline script into ES modules under `js/`; remove every inline handler.
- [ ] T6 Implement `api/nasa-power.js` with normalization, caching, monthly aggregation, and error
      states; wire it to the climate cards and the chart.
- [ ] T7 Compute the seasonal water-deficit alert from the loaded series.
- [ ] T8 README with structure, run instructions, data sources and limitations.
- [ ] T9 Static verification: imports resolve, ids referenced by JS exist, rotation engine returns
      82/75/55 with weights [4,3,5,3,4], headless Chrome renders results.

## Acceptance

- `python3 -m http.server` serves an interface identical to the pre-refactor one (default weights).
- `grep -c onclick index.html` returns 0.
- `index.html` under 300 lines; no `.js` file over 150 lines.
- Real values appear in the climate cards and chart; on failure the UI shows an error state and an
  explicitly labelled demo fallback, never a silent simulation.

## Progress

Engram mirror pending: the memory MCP is not available in this session. Local file is authoritative
until it can be synced.

## Route log

- T1-T9: delegated writer (write trigger: 15+ non-trivial files), then parent static verification.
