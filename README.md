# AgroSmart

Single-page agricultural decision-support prototype for parcels in Andahuaylas (Apurimac, Peru). The application combines parcel and soil inputs, demo rotation scoring, and climate data that can be loaded live from the NASA POWER API.

## Project structure

```text
Proyecto/AgroSmart/
├── index.html                 # Markup and module entry point
├── css/
│   ├── styles.css             # Design tokens, base styles, keyframes
│   ├── layout.css             # Top bar, grid, columns, footer
│   ├── components.css         # Cards, forms, map, chart, rotations, alerts
│   └── responsive.css         # Responsive breakpoints
├── data/
│   ├── crops.json             # Crop catalog metadata
│   ├── demo-scenarios.json    # Demo climate series, rotations and alerts
│   └── soil-examples.json     # Default parcel and soil values
├── js/
│   ├── main.js                # Bootstrap and state subscriptions
│   ├── config.js              # Constants and API configuration
│   ├── state.js               # Central application state
│   ├── api/nasa-power.js      # NASA POWER fetch, normalization and demo fallback
│   ├── map/map-controller.js  # Leaflet map and geolocation
│   ├── charts/climate-charts.js
│   ├── agriculture/
│   │   ├── soil-manager.js
│   │   ├── crop-catalog.js
│   │   └── rotation-engine.js # Pure weighted scoring
│   ├── alerts/alert-manager.js
│   └── ui/
│       ├── dashboard.js
│       ├── forms.js
│       └── notifications.js
└── tests/
    └── rotation-engine.test.js
```

## Run locally

ES modules and JSON loading require an HTTP server. Opening `index.html` directly with `file://` will not work correctly.

```bash
cd Proyecto/AgroSmart
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

## Climate data

Press **Consultar Clima** to request real values from [NASA POWER](https://power.larc.nasa.gov/) (monthly point API, `community=AG`) for the selected coordinates.

- Parameters: `T2M` (°C), `PRECTOTCORR` (mm/day, aggregated to monthly/annual mm), `WS10M` (m/s), `ALLSKY_SFC_SW_DWN` (MJ/m²/day, converted to kWh/m²/day).
- The UI shows source, period and a ~50 km resolution warning. NASA POWER is not a local weather station.
- On request failure, the app keeps working with explicitly labeled demo data as fallback.
- Water-deficit alerts are computed from the loaded monthly precipitation series when possible.

## Rotation engine

Rotation scores are weighted averages of the five criteria priorities (1–5). For the default priorities `[4, 3, 5, 3, 4]` the demo rotations score **82 (A)**, **74 (B)** and **56 (C)**. Results are indicative and based on simplified agronomic rules.

## Tests

```bash
cd Proyecto/AgroSmart
node --test tests/rotation-engine.test.js
```

## Notes and limitations

- Map tiles are loaded from MapTiler (client key embedded in `js/config.js`).
- NASA GIBS layers, Web Speech, persistence and full agronomic validation are out of scope for this prototype version.
- Do not treat scores or climate estimates as a substitute for field measurements or professional agronomic advice.
