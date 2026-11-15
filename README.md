# AgroSmart

Single-page agricultural decision-support prototype for parcels in Andahuaylas (Apurimac, Peru). AgroSmart combines user-provided local inputs (parcel, soil, crops, priorities, current rotation) with NASA climate data to compute, rank, and explain crop-rotation options.

- **Live demo:** [https://dayvis-0.github.io/AgroSmart/](https://dayvis-0.github.io/AgroSmart/)

## What the app does

- Collects parcel location (district/community, coordinates, and parcel altitude when available), local soil attributes, selected crops, farmer priorities, and an optional current rotation.
- Estimates parcel altitude (msnm) from coordinates via the Open-Meteo Elevation API (best-effort) and shows crop suitability in Step 4 by altitude and zone/district using provisional crop ranges.
- Requests climate data from NASA POWER for the selected coordinates and normalizes monthly series/summaries.
- Probes a second NASA source (GPM IMERG regional precipitation context) as best-effort, labeled context; in browsers this is often unavailable (CORS/Earthdata access) and the app reports that explicitly instead of fabricating data.
- Generates candidate crop rotations (3+ suggestions; includes the current rotation when valid) from the selected crops.
- Computes per-criterion and weighted scores from climate, crop requirements, soil modifiers, and farmer priorities (not fixed demo scores).
- Derives per-rotation evidence/risk notes and plain-language summaries from the evaluated data.
- Persists farmer inputs (including parcel elevation when known) in browser `localStorage` (versioned state) and supports an explicit reset.
- Produces a technical PDF report that renders the computed comparison (scores, derived evidence/risks, summaries) and states data sources/resolution/fallback status.

## Architecture and modules

Front-end vanilla JavaScript (ES modules), HTML, CSS, and JSON data files.

```text
.
├── index.html
├── css/                        # Tokens, layout, components, responsive styles
├── data/
│   ├── crops.json              # Crop catalog (requirements, altitude/zone suitability metadata)
│   ├── demo-scenarios.json     # Labeled offline/demo fallback data only
│   └── soil-examples.json      # Default parcel/soil example values
├── js/
│   ├── main.js                 # Bootstrap, comparison flow, elevation/suitability wiring, subscriptions
│   ├── config.js               # Constants and API configuration
│   ├── state.js                # Central application state
│   ├── state-persistence.js    # Versioned localStorage persistence
│   ├── api/
│   │   ├── nasa-power.js       # NASA POWER fetch, normalization, demo fallback
│   │   ├── regional-context.js # GPM IMERG regional context probe/check (best-effort)
│   │   └── elevation.js        # Open-Meteo elevation lookup (best-effort, cached)
│   ├── agriculture/
│   │   ├── rotation-model.js   # Shared rotation model/type helpers
│   │   ├── scoring-engine.js   # Computed per-criterion scoring
│   │   ├── rotation-engine.js  # Priority-weight aggregation and ranking
│   │   ├── rotation-generator.js # Candidate rotation generation (3+)
│   │   ├── rotation-insights.js  # Derived evidence/risk notes
│   │   ├── rotation-summary.js   # Plain-language per-rotation summary
│   │   ├── crop-suitability.js # Crop suitability by altitude and zone/district
│   │   ├── crop-catalog.js     # Crop selection UI and suitability rendering
│   │   └── soil-manager.js
│   ├── alerts/alert-manager.js
│   ├── charts/climate-charts.js
│   ├── map/map-controller.js
│   ├── reports/pdf-report.js   # PDF rendering of computed comparison
│   └── ui/
│       ├── dashboard.js
│       ├── forms.js
│       └── notifications.js
├── tests/                      # Node built-in test runner (`node --test`)
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

### Parcel elevation and crop suitability (best-effort)
- Provider: [Open-Meteo Elevation API](https://open-meteo.com/en/docs/elevation-api), queried from parcel coordinates to estimate altitude (msnm).
- Behavior: fetched on load/when the parcel location changes (best-effort, cached). On failure or unavailable data, the app keeps crops selectable and shows a neutral "altitude unavailable" state without blocking the flow.
- Step 4 classifies crops as recommended/possible/not recommended by altitude and zone/district using provisional ranges and zone metadata defined in `data/crops.json`.

### Local inputs and persistence
- Parcel (including elevation when known), soil, selected crops, priorities, and current rotation are user-entered/local inputs or locally derived estimates (soil examples from `data/soil-examples.json` and crop altitude/zone ranges in `data/crops.json` are defaults/provisional references, not NASA products).
- Inputs are persisted locally in the browser (`localStorage`, versioned state) and reloaded on start; an explicit reset clears persisted state.

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
- Parcel altitude is an external estimate (Open-Meteo) and crop suitability by altitude/zone uses provisional ranges/metadata for Andahuaylas; it should be validated with local agronomic criteria.
- Scoring is a simplified agronomic model; results are indicative and depend on the quality of local inputs.
- Full GPM/SMAP data access may require authenticated/server-side access; the browser build reports such sources as labeled regional context/checks rather than guaranteed field-level measurements.
