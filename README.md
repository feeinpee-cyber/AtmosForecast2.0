# AtmosForecast 2.0

AtmosForecast 2.0 carries forward the existing Atmos Weather app and its data engine, interactions, search, saved locations, unit preferences, detail panels and radar map. This version changes the presentation layer to an iOS Weather-inspired layout rather than rebuilding the app from scratch.

## Features carried over
- Live current conditions, 24-hour outlook and 10-day forecast from Open-Meteo
- Global city search, saved locations and optional browser geolocation
- Celsius/Fahrenheit preferences and automatic refresh
- Weather-responsive animated atmosphere with reduced-motion support
- UV, feels-like temperature, wind, humidity, visibility, pressure, precipitation, daylight and modelled air quality
- Lazy-loaded OpenStreetMap and historical RainViewer radar observations
- Responsive desktop, tablet and mobile layout

## Run locally
```bash
npm install
npm run dev
```

## Build and test
```bash
npm run build
npm run preview
npm run test:browser
```

GitHub Actions runs the strict TypeScript/Vite production build and Playwright checks at desktop (1440×1000) and mobile (390×844) viewport sizes. The browser test samples requestAnimationFrame pacing with weather effects active, checks for runtime errors and horizontal overflow, and exercises the settings and lazy map views. CI frame pacing is a regression measurement on a virtualized runner, not a native-device GPU benchmark.

## Cloudflare Pages
- Branch: `main`
- Build command: `npm run build`
- Output directory: `dist`

## Data sources
Forecast, geocoding and modelled air-quality estimates use [Open-Meteo](https://open-meteo.com/). The map uses [OpenStreetMap](https://www.openstreetmap.org/copyright) and historical radar observations from [RainViewer](https://www.rainviewer.com/). Air-quality values are model estimates rather than guaranteed local monitoring-station readings. Review provider terms before commercial use.

## Credit
Developed by [يزيد الغامدي](https://github.com/feeinpee-cyber).
