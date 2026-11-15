# AgroSmart

Single-page agricultural decision-support prototype for parcels in Andahuaylas (Apurimac, Peru). AgroSmart combines user-provided local inputs (parcel, soil, crops, priorities, current rotation) with NASA climate data to compute, rank, and explain crop-rotation options.

## What the app does

- Collects parcel location, local soil attributes, selected crops, farmer priorities, and an optional current rotation.
- Requests climate data from NASA POWER for the selected coordinates and normalizes monthly series/summaries.
- Probes a second NASA source (GPM IMERG regional precipitation context) as best-effort, labeled context; in browsers this is often unavailable (CORS/Earthdata access) and the app reports that explicitly instead of fabricating data.
- Generates candidate crop rotations (3+ suggestions; includes the current rotation when valid) from the selected crops.
- Computes per-criterion and weighted scores from climate, crop requirements, soil modifiers, and farmer priorities (not fixed demo scores).
- Derives per-rotation evidence/risk notes and plain-language summaries from the evaluated data.
- Persists farmer inputs in browser `localStorage` (versioned state) and supports an explicit reset.
- Produces a technical PDF report that renders the computed comparison (scores, derived evidence/risks, summaries) and states data sources/resolution/fallback status.

## Architecture and modules

Front-end vanilla JavaScript (ES modules), HTML, CSS, and JSON data files.

```text
.
├── index.html
├── css/                        # Tokens, layout, components, responsive styles
├── data/
│   ├── crops.json              # Crop catalog (requirements/metadata)
│   ├── demo-scenarios.json     # Labeled offline/demo fallback data only
│   └── soil-examples.json      # Default parcel/soil example values
├── js/
│   ├── main.js                 # Bootstrap, comparison flow, subscriptions
│   ├── config.js               # Constants and API configuration
│   ├── state.js                # Central application state
│   ├── state-persistence.js    # Versioned localStorage persistence
│   ├── api/
│   │   ├── nasa-power.js       # NASA POWER fetch, normalization, demo fallback
│   │   └── regional-context.js # GPM IMERG regional context probe/check (best-effort)
│   ├── agriculture/
│   │   ├── rotation-model.js   # Shared rotation model/type helpers
│   │   ├── scoring-engine.js   # Computed per-criterion scoring
│   │   ├── rotation-engine.js  # Priority-weight aggregation and ranking
│   │   ├── rotation-generator.js # Candidate rotation generation (3+)
│   │   ├── rotation-insights.js  # Derived evidence/risk notes
│   │   ├── rotation-summary.js   # Plain-language per-rotation summary
│   │   ├── crop-catalog.js
│   │   └── soil-manager.js
│   ├── alerts/alert-manager.js
│   ├── charts/climate-charts.js
│   ├── map/map-controller.js
│   ├── reports/pdf-report.js   # PDF rendering of computed comparison
│   └── ui/
│       ├── dashboard.js
│       ├── forms.js
│       └── notifications.js
└── odd/                        # Planning/task docs
```

## Data sources and behavior

### NASA POWER (primary climate source)
- Provider: [NASA POWER](https://power.larc.nasa.gov/) monthly point API (`community=AG`).
- Parameters used: `T2M` (°C), `PRECTOTCORR` (mm/day, aggregated to monthly/annual mm), `WS10M` (m/s), `ALLSKY_SFC_SW_DWN` (MJ/m²/day, converted to kWh/m²/day).
- Resolution/caveat: ~50 km regional estimate, not a local weather station and not field-truth measurements.
- Press **Consultar Clima** to request live values for the selected coordinates. On request failure, the app keeps working with explicitly labeled demo fallback data.

### Second NASA source: GPM IMERG regional context (best-effort)
- Target: NASA GES DISC GPM IMERG V07 monthly precipitation as regional context/coverage check (~10 km product resolution, referenced at the parcel point).
- Behavior: the app performs a best-effort probe/fetch. In a browser-only context this commonly cannot return full granule data due to CORS/Earthdata authentication; the app degrades gracefully and labels the context as unavailable or referential without inventing values.
- The UI and PDF report this source and its status/resolution separately from NASA POWER.

### Local inputs and persistence
- Parcel, soil, selected crops, priorities, and current rotation are user-entered/local inputs (soil examples from `data/soil-examples.json` are defaults/examples, not NASA products).
- Inputs are persisted locally in the browser (`localStorage`) and reloaded on start; an explicit reset clears persisted state.

### Computed scoring and comparison (not static demo scores)
- Rotation scores are computed by the scoring/rotation engines from available climate data, crop requirements, soil modifiers, and the five farmer-priority weights; changing these inputs changes the ranking deterministically.
- Candidate rotations are generated from selected crops to provide 3+ comparable options (and include the current rotation when provided/valid).
- Evidence/risk notes and plain-language summaries are derived from the evaluated climate/soil/sequence/scores (not static demo text in the normal comparison flow).

### Demo/offline fallback
- `data/demo-scenarios.json` is labeled demo/fallback data only. It is used to keep the app usable when live climate data is unavailable or not yet loaded; the UI/PDF label demo/fallback status explicitly.
- The normal comparison flow does not use the demo file's static rotation scores/content as its scoring source.

## Running locally

ES modules and JSON loading require an HTTP server. Opening `index.html` directly with `file://` will not work correctly.

```bash
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

## Verification

```bash
node --test
node --check js/reports/pdf-report.js js/main.js
```

## Limitations

- Climate inputs are regional estimates (NASA POWER ~50 km; GPM context ~10 km) and should support, not replace, local field knowledge and agronomic advice.
- Scoring is a simplified agronomic model; results are indicative and depend on the quality of local inputs.
- Full GPM/SMAP data access may require authenticated/server-side access; the browser build reports such sources as labeled regional context/checks rather than guaranteed field-level measurements.
