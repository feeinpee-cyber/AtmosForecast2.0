import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:4173';
const SAMPLE_MS = Number(process.env.FRAME_SAMPLE_MS ?? 5000);
const browser = await chromium.launch({
  headless: true,
  args: ['--disable-dev-shm-usage', '--no-sandbox'],
});

function isoHour(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}T${String(date.getUTCHours()).padStart(2, '0')}:00`;
}

function fixture() {
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  const hours = Array.from({ length: 72 }, (_, index) => {
    const time = new Date(now.getTime() + index * 60 * 60 * 1000);
    return {
      time: isoHour(time),
      temperature_2m: 27 - Math.round(Math.sin(index / 8) * 4),
      apparent_temperature: 29 - Math.round(Math.sin(index / 8) * 4),
      dew_point_2m: 17,
      pressure_msl: 1008 + Math.round(Math.sin(index / 7) * 2),
      precipitation_probability: index < 4 ? 70 : 20,
      precipitation: index < 4 ? 0.8 : 0,
      weather_code: index < 4 ? 61 : 3,
      wind_speed_10m: 14,
      relative_humidity_2m: 62,
      uv_index: Math.max(0, 6 - Math.floor(index / 3)),
      visibility: 16000,
    };
  });
  const daily = Array.from({ length: 10 }, (_, index) => {
    const date = new Date(now.getTime() + index * 24 * 60 * 60 * 1000);
    const dateText = isoHour(date).slice(0, 10);
    return {
      time: dateText,
      weather_code: index < 2 ? 61 : 2,
      temperature_2m_max: 31 - (index % 4),
      temperature_2m_min: 20 - (index % 3),
      precipitation_probability_max: index < 2 ? 65 : 15,
      precipitation_sum: index < 2 ? 2.4 : 0,
      sunrise: `${dateText}T05:45`,
      sunset: `${dateText}T17:35`,
      uv_index_max: 7,
      wind_speed_10m_max: 24,
    };
  });
  return {
    timezone: 'Asia/Riyadh',
    current: {
      time: hours[0].time,
      temperature_2m: 27,
      relative_humidity_2m: 62,
      apparent_temperature: 29,
      is_day: 1,
      precipitation: 0.4,
      rain: 0.4,
      snowfall: 0,
      weather_code: 61,
      cloud_cover: 75,
      pressure_msl: 1008,
      wind_speed_10m: 14,
      wind_direction_10m: 225,
      wind_gusts_10m: 22,
    },
    hourly: Object.fromEntries(['time', 'temperature_2m', 'apparent_temperature', 'dew_point_2m', 'pressure_msl', 'precipitation_probability', 'precipitation', 'weather_code', 'wind_speed_10m', 'relative_humidity_2m', 'uv_index', 'visibility'].map((key) => [key, hours.map((hour) => hour[key])])),
    daily: Object.fromEntries(['time', 'weather_code', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_probability_max', 'precipitation_sum', 'sunrise', 'sunset', 'uv_index_max', 'wind_speed_10m_max'].map((key) => [key, daily.map((day) => day[key])])),
  };
}

async function installFixtures(page) {
  const data = fixture();
  await page.route('**/v1/forecast?**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) }));
  await page.route('**/v1/air-quality?**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ current: { us_aqi: 34, european_aqi: 18, pm2_5: 7.2, pm10: 12.1, ozone: 62 } }),
  }));
  // The map is checked for successful lazy-loading without relying on third-party tile uptime.
  await page.route('**/tile.openstreetmap.org/**', (route) => route.abort());
  await page.route('**/weather-maps.json', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ host: 'https://tilecache.rainviewer.com', radar: { past: [] } }),
  }));
}

async function measureViewport(label, viewport, mobile = false) {
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await installFixtures(page);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.locator('.hourly-panel').waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(700);

  const metrics = await page.evaluate(async (sampleMs) => {
    const intervals = [];
    const longTasks = [];
    let observer;
    if ('PerformanceObserver' in window) {
      try {
        observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) longTasks.push(Math.round(entry.duration * 10) / 10);
        });
        observer.observe({ type: 'longtask', buffered: true });
      } catch { /* Long-task timing is not available in every browser build. */ }
    }
    const start = performance.now();
    let previous = start;
    await new Promise((resolve) => {
      function frame(now) {
        intervals.push(now - previous);
        previous = now;
        if (now - start >= sampleMs) resolve();
        else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
    observer?.disconnect();
    const elapsedMs = performance.now() - start;
    const sorted = [...intervals].sort((a, b) => a - b);
    const percentile = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
    const avgFps = intervals.length / (elapsedMs / 1000);
    return {
      frames: intervals.length,
      elapsedMs: Math.round(elapsedMs),
      averageFps: Math.round(avgFps * 10) / 10,
      medianFrameMs: Math.round(percentile(0.5) * 10) / 10,
      p95FrameMs: Math.round(percentile(0.95) * 10) / 10,
      framesOver25ms: intervals.filter((value) => value > 25).length,
      framesOver50ms: intervals.filter((value) => value > 50).length,
      longTasksOver50ms: longTasks.length,
      longestLongTaskMs: Math.max(0, ...longTasks),
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      documentWidth: document.documentElement.scrollWidth,
    };
  }, SAMPLE_MS);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('heading', { name: 'Preferences' }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Weather map' }).click();
  await page.locator('.leaflet-map').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByRole('button', { name: 'Back to forecast' }).click();
  await page.locator('.hourly-panel').waitFor({ state: 'visible' });

  const result = { device: label, ...metrics, horizontalOverflow: overflow, pageErrors };
  await context.close();
  if (pageErrors.length) throw new Error(`${label}: browser runtime errors: ${pageErrors.join(' | ')}`);
  if (overflow) throw new Error(`${label}: page has horizontal overflow (${metrics.documentWidth}px wide).`);
  // CI runners are virtualized; this catches severe stutter without pretending to emulate a phone GPU.
  if (metrics.averageFps < 35 || metrics.p95FrameMs > 50) {
    throw new Error(`${label}: frame pacing below CI acceptance threshold (${metrics.averageFps} FPS average, ${metrics.p95FrameMs} ms p95).`);
  }
  return result;
}

try {
  const results = [];
  results.push(await measureViewport('desktop Chromium', { width: 1440, height: 1000 }));
  results.push(await measureViewport('mobile Chromium', { width: 390, height: 844 }, true));
  const report = {
    generatedAt: new Date().toISOString(),
    browser: 'Chromium (Playwright headless)',
    measurement: 'requestAnimationFrame interval sampling with weather effects enabled; 5 seconds per viewport',
    note: 'CI frame pacing is a reproducible regression check, not a native-device GPU benchmark or an iPhone comparison.',
    results,
  };
  await writeFile('browser-performance-results.json', `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
