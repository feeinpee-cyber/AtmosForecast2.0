import { readFileSync, writeFileSync } from 'node:fs';

const appPath = new URL('../src/App.tsx', import.meta.url);
const mainPath = new URL('../src/main.tsx', import.meta.url);
const htmlPath = new URL('../index.html', import.meta.url);

let app = readFileSync(appPath, 'utf8');
const footerStart = app.indexOf('<footer className="app-footer">');
const footerEnd = footerStart < 0 ? -1 : app.indexOf('</footer>', footerStart);
const footer = '<footer className="app-footer"><span>Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open‑Meteo</a> · Air quality is modelled</span><span className="developer-credit">Developed by <a href="https://github.com/feeinpee-cyber" target="_blank" rel="noreferrer">يزيد الغامدي</a></span></footer>';

if (footerStart >= 0 && footerEnd >= 0) {
  app = app.slice(0, footerStart) + footer + app.slice(footerEnd + '</footer>'.length);
} else if (!app.includes('className="developer-credit"')) {
  throw new Error('Could not locate the existing app footer to add the developer credit.');
}
app = app.replace('THE WEATHER, IN ITS ELEMENT', 'WEATHER');
app = app.replace('className="kicker-divider">/</span>', 'className="kicker-divider">·</span>');
writeFileSync(appPath, app);

let main = readFileSync(mainPath, 'utf8');
if (!main.includes("import './apple-weather.css';")) {
  main = main.replace("import './styles.css';", "import './styles.css';\nimport './apple-weather.css';");
}
writeFileSync(mainPath, main);

let html = readFileSync(htmlPath, 'utf8');
html = html.replace('<title>Atmos — Weather, in its element</title>', '<title>AtmosForecast 2.0 — Weather</title>');
html = html.replace('Atmos — an atmospheric, thoughtfully designed weather experience.', 'A beautiful, detailed weather forecast with live conditions, hourly outlook and a 10-day forecast.');
writeFileSync(htmlPath, html);

console.log('Applied the AtmosForecast 2.0 Weather-inspired presentation and developer credit');
