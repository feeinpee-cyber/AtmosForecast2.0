import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Activity, ArrowDown, ArrowUp, Check, ChevronDown, ChevronLeft, ChevronRight,
  Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Compass, Droplets, Eye,
  Gauge, LocateFixed, Map as MapIcon, MapPin, MoonStar, Search, Settings2,
  Sunrise, Sunset, Thermometer, Wind, X, Sun, Waves, Clock3, Trash2, RefreshCw,
} from 'lucide-react';
import WeatherBackground from './components/WeatherBackground';
import {
  aqiLabel, compassDirection, fetchWeather, formatDay, formatHour, makeSummary,
  searchPlaces, weatherIconName, weatherLabel, weatherTone,
} from './lib/weather';
import type { DailyPoint, Place, WeatherBundle } from './lib/weather';

const RadarMap = lazy(() => import('./components/RadarMap'));

const DEFAULT_PLACE: Place = {
  id: 'riyadh-default', name: 'Riyadh', admin1: 'Riyadh Region', country: 'Saudi Arabia', countryCode: 'SA',
  latitude: 24.7136, longitude: 46.6753, timezone: 'Asia/Riyadh',
};

type ModalMode = 'search' | 'locations' | 'settings' | null;
type MapLayer = 'radar' | 'temperature' | 'wind' | 'air';
type RadarFrame = { time: number; path: string };
type DetailKey = 'feels' | 'uv' | 'wind' | 'humidity' | 'visibility' | 'pressure' | 'precipitation' | 'sun' | 'air';

const WEATHER_ICONS: Record<string, typeof Sun> = {
  sun: Sun, 'moon-star': MoonStar, cloud: Cloud, 'cloud-sun': CloudSun, 'cloud-rain': CloudRain,
  'cloud-snow': CloudSnow, 'cloud-lightning': CloudLightning, 'cloud-fog': CloudFog,
};

function WeatherSymbol({ code, isDay = true, size = 24 }: { code: number; isDay?: boolean; size?: number }) {
  const Icon = WEATHER_ICONS[weatherIconName(code, isDay)] ?? CloudSun;
  return <Icon size={size} strokeWidth={1.55} />;
}

function readStored<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage may be unavailable in private browsing. */ }
}

function temp(value: number, fahrenheit: boolean): number {
  return fahrenheit ? (value * 9) / 5 + 32 : value;
}

function tempLabel(value: number, fahrenheit: boolean): string {
  return `${Math.round(temp(value, fahrenheit))}°`;
}

function clockLabel(value: string): string {
  if (!value) return '—';
  const time = value.split('T')[1]?.slice(0, 5);
  if (!time) return '—';
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

function currentTimeLabel(value?: string): string {
  if (!value) return 'Updated moments ago';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Latest conditions' : `Local time · ${clockLabel(value)}`;
}

function solarPosition(currentTime: string, sunrise: string, sunset: string) {
  const minutes = (value: string) => {
    const time = value.split('T')[1] ?? '12:00';
    const [hours, mins] = time.split(':').map(Number);
    return (hours || 0) * 60 + (mins || 0);
  };
  const start = minutes(sunrise);
  const end = minutes(sunset);
  const progress = end > start ? Math.max(0, Math.min(1, (minutes(currentTime) - start) / (end - start))) : .5;
  const t = progress;
  const u = 1 - t;
  const x = u ** 3 * 22 + 3 * u ** 2 * t * 78 + 3 * u * t ** 2 * 242 + t ** 3 * 298;
  const y = u ** 3 * 92 + 3 * u ** 2 * t * -9 + 3 * u * t ** 2 * -9 + t ** 3 * 92;
  return { x, y, progress };
}

function getAqiTone(value?: number): string {
  if (value == null) return 'neutral';
  if (value <= 50) return 'good';
  if (value <= 100) return 'moderate';
  if (value <= 150) return 'sensitive';
  return 'poor';
}

function Sparkline({ values, color = 'currentColor', fill = false }: { values: number[]; color?: string; fill?: boolean }) {
  if (values.length < 2) return <div className="sparkline-empty">Not enough data</div>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 300},${58 - ((value - min) / range) * 44}`).join(' ');
  return (
    <svg className="sparkline" viewBox="0 0 300 68" preserveAspectRatio="none" role="img" aria-label="Forecast trend">
      {fill && <polygon points={`0,68 ${points} 300,68`} className="sparkline-fill" />}
      <polyline points={points} fill="none" stroke={color} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="300" cy={58 - ((values[values.length - 1] - min) / range) * 44} r="3.6" fill={color} />
    </svg>
  );
}

function DetailCard({ icon: Icon, label, value, hint, onClick, children, className = '' }: {
  icon: typeof Sun; label: string; value: string; hint: string; onClick: () => void; children?: ReactNode; className?: string;
}) {
  return (
    <button className={`detail-card glass-panel ${className}`} onClick={onClick} type="button">
      <span className="detail-label"><Icon size={15} strokeWidth={1.8} />{label}</span>
      <strong className="detail-value">{value}</strong>
      <span className="detail-hint">{hint}</span>
      {children}
      <span className="detail-open">Details <ChevronRight size={13} /></span>
    </button>
  );
}

function DetailModal({ detail, weather, fahrenheit, selectedDay, selectedDayIndex, onClose }: {
  detail: DetailKey; weather: WeatherBundle; fahrenheit: boolean; selectedDay?: DailyPoint; selectedDayIndex?: number; onClose: () => void;
}) {
  const { current, hourly, daily } = weather;
  const titles: Record<DetailKey, string> = {
    feels: 'Feels like', uv: 'UV index', wind: 'Wind', humidity: 'Humidity', visibility: 'Visibility',
    pressure: 'Air pressure', precipitation: 'Precipitation', sun: 'Sun & daylight', air: 'Air quality',
  };
  const descriptions: Record<DetailKey, string> = {
    feels: 'Apparent temperature estimates how warm or cold it feels to the body, accounting for humidity and wind.',
    uv: 'The ultraviolet index estimates the strength of sunburn-producing UV radiation at the surface.',
    wind: 'Wind direction describes where the wind is coming from. Gusts are short bursts above the sustained wind speed.',
    humidity: 'Relative humidity is the amount of moisture in the air compared with the maximum it can hold at this temperature.',
    visibility: 'Visibility is the horizontal distance at which objects can be clearly seen in the atmosphere.',
    pressure: 'Sea-level pressure is useful for understanding larger weather patterns. A changing trend can signal a weather shift.',
    precipitation: 'Probability describes the chance of measurable precipitation. The amount is shown separately in millimetres.',
    sun: 'Sunrise, sunset and daylight duration are calculated for this location and local date.',
    air: 'Air quality is a model-based estimate from atmospheric composition forecasts, not a roadside monitoring-station reading.',
  };
  const chartValues = detail === 'feels' ? hourly.slice(0, 12).map((hour) => temp(hour.apparent, fahrenheit))
    : detail === 'wind' ? hourly.slice(0, 12).map((hour) => hour.windSpeed)
      : detail === 'humidity' ? hourly.slice(0, 12).map((hour) => hour.humidity)
        : detail === 'uv' ? hourly.slice(0, 12).map((hour) => hour.uv)
          : detail === 'precipitation' ? hourly.slice(0, 12).map((hour) => hour.precipitationProbability)
            : hourly.slice(0, 12).map((hour) => hour.temperature);
  const unit = detail === 'wind' ? 'km/h' : detail === 'humidity' ? '%' : detail === 'uv' ? 'index' : detail === 'precipitation' ? '% chance' : '°';
  const mainValue = selectedDay ? `${tempLabel(selectedDay.high, fahrenheit)} / ${tempLabel(selectedDay.low, fahrenheit)}` : detail === 'feels' ? tempLabel(current.apparent, fahrenheit)
    : detail === 'uv' ? (hourly[0]?.uv ?? '—').toString()
      : detail === 'wind' ? `${Math.round(current.windSpeed)} km/h`
        : detail === 'humidity' ? `${current.humidity}%`
          : detail === 'visibility' ? `${(hourly[0]?.visibility ?? 0) >= 1000 ? ((hourly[0]?.visibility ?? 0) / 1000).toFixed(1) + ' km' : (hourly[0]?.visibility ?? 0) + ' m'}`
            : detail === 'pressure' ? `${Math.round(current.pressure)} hPa`
              : detail === 'precipitation' ? `${hourly[0]?.precipitationProbability ?? 0}%`
                : detail === 'sun' ? `${daily[0] ? Math.max(0, Math.round((new Date(daily[0].sunset).getTime() - new Date(daily[0].sunrise).getTime()) / 60000)) : '—'} min daylight`
                  : `${weather.air?.usAqi ?? '—'} AQI`;
  const showChart = !selectedDay && ['feels', 'uv', 'wind', 'humidity', 'precipitation'].includes(detail);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="detail-modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <div className="modal-topline"><span className="eyebrow">WEATHER DETAIL</span><button className="icon-button" onClick={onClose} aria-label="Close details"><X size={18} /></button></div>
        <h2 id="detail-title">{selectedDay ? `${formatDay(selectedDay.date, selectedDayIndex ?? 0)} forecast` : titles[detail]}</h2>
        <div className="detail-modal-value">{mainValue}</div>
        <p>{selectedDay ? `${weatherLabel(selectedDay.weatherCode)} expected, with a ${selectedDay.precipitationProbability}% chance of precipitation and ${selectedDay.precipitation.toFixed(1)} mm forecast. Maximum wind around ${Math.round(selectedDay.windMax)} km/h.` : descriptions[detail]}</p>
        {selectedDay && <div className="pollutant-grid daily-detail-grid"><div><span>PRECIPITATION CHANCE</span><strong>{selectedDay.precipitationProbability}%</strong></div><div><span>UV MAX</span><strong>{selectedDay.uvMax.toFixed(1)}</strong></div><div><span>WIND MAX</span><strong>{Math.round(selectedDay.windMax)} km/h</strong></div></div>}
        {detail === 'wind' && !selectedDay && <div className="wind-detail-visual"><div className="wind-compass large"><span>N</span><span>E</span><span>S</span><span>W</span><div className="compass-needle" style={{ transform: `translate(-50%, -50%) rotate(${current.windDirection}deg)` }}><i /></div></div><div><strong>{compassDirection(current.windDirection)} · {Math.round(current.windSpeed)} km/h</strong><small>Gusts up to {Math.round(current.windGusts)} km/h</small></div></div>}
        {detail === 'sun' && !selectedDay && daily[0] && <div className="sun-times-expanded"><div><Sunrise size={17} /><span>Sunrise</span><strong>{clockLabel(daily[0].sunrise)}</strong></div><div><Sunset size={17} /><span>Sunset</span><strong>{clockLabel(daily[0].sunset)}</strong></div></div>}
        {detail === 'air' && !selectedDay && <div className="pollutant-grid"><div><span>PM2.5</span><strong>{weather.air?.pm25 == null ? '—' : `${weather.air.pm25.toFixed(1)} µg/m³`}</strong></div><div><span>PM10</span><strong>{weather.air?.pm10 == null ? '—' : `${weather.air.pm10.toFixed(1)} µg/m³`}</strong></div><div><span>Ozone</span><strong>{weather.air?.ozone == null ? '—' : `${weather.air.ozone.toFixed(1)} µg/m³`}</strong></div></div>}
        {showChart && <div className="detail-chart-wrap"><div className="detail-chart-head"><span>NEXT 12 HOURS</span><span>{unit}</span></div><Sparkline values={chartValues} fill /><div className="detail-chart-labels"><span>Now</span><span>+6h</span><span>+12h</span></div></div>}
        {detail === 'uv' && !selectedDay && <div className="uv-scale"><div className="uv-scale-bar"><i style={{ left: `${Math.min(100, (Number(mainValue) / 11) * 100)}%` }} /></div><div><span>Low</span><span>Moderate</span><span>High</span><span>Very high</span><span>Extreme</span></div></div>}
      </section>
    </div>
  );
}

function App() {
  const [place, setPlace] = useState<Place>(() => readStored('atmos-current-place', DEFAULT_PLACE));
  const [savedPlaces, setSavedPlaces] = useState<Place[]>(() => readStored('atmos-saved-places', [DEFAULT_PLACE]));
  const [weather, setWeather] = useState<WeatherBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<ModalMode>(null);
  const [view, setView] = useState<'weather' | 'map'>('weather');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [fahrenheit, setFahrenheit] = useState(() => readStored('atmos-fahrenheit', false));
  const [detail, setDetail] = useState<DetailKey | null>(null);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null);
  const [mapLayer, setMapLayer] = useState<MapLayer>('radar');
  const [radarFrames, setRadarFrames] = useState<RadarFrame[]>([]);
  const [radarFrameIndex, setRadarFrameIndex] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    writeStored('atmos-current-place', place);
    writeStored('atmos-saved-places', savedPlaces);
  }, [place, savedPlaces]);

  useEffect(() => { writeStored('atmos-fahrenheit', fahrenheit); }, [fahrenheit]);

  useEffect(() => {
    const controller = new AbortController();
    const cacheKey = `atmos-weather-${place.id}`;
    const cached = readStored<WeatherBundle | null>(cacheKey, null);
    if (cached && cached.place.id === place.id) setWeather(cached);
    else setWeather(null);
    setLoading(!cached);
    setRefreshing(Boolean(cached));
    setError('');
    fetchWeather(place, controller.signal)
      .then((bundle) => {
        if (controller.signal.aborted) return;
        setWeather(bundle);
        setLoading(false);
        setRefreshing(false);
        setError('');
        writeStored(cacheKey, bundle);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setLoading(false);
        setRefreshing(false);
        setError(cached ? `Refresh failed. Showing cached conditions, which may be outdated. ${reason instanceof Error ? reason.message : ''}` : (reason instanceof Error ? reason.message : 'Unable to load weather right now.'));
      });
    return () => controller.abort();
  }, [place, refreshKey]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => {
      setRefreshKey((key) => key + 1);
    }, 15 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [autoRefresh]);

  useEffect(() => {
    if (modal !== 'search') return;
    const trimmed = query.trim();
    if (trimmed.length < 2) { setSearchResults([]); setSearchError(''); setSearching(false); return; }
    const controller = new AbortController();
    setSearching(true);
    setSearchError('');
    const timer = window.setTimeout(() => {
      searchPlaces(trimmed, controller.signal)
        .then((results) => setSearchResults(results))
        .catch((reason: unknown) => {
          if (controller.signal.aborted) return;
          setSearchError(reason instanceof Error ? 'Search is temporarily unavailable.' : 'No results found.');
        })
        .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 320);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, modal]);

  useEffect(() => {
    if (!modal && !detail) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { setModal(null); setDetail(null); } };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modal, detail]);

  const tone = weather ? weatherTone(weather.current.weatherCode, weather.current.isDay) : 'clear';
  const today = weather?.daily[0];
  const current = weather?.current;
  const summary = useMemo(() => weather ? makeSummary(weather) : '', [weather]);

  function selectPlace(next: Place) {
    const existing = savedPlaces.find((item) => item.id === next.id || (Math.abs(item.latitude - next.latitude) < 0.02 && Math.abs(item.longitude - next.longitude) < 0.02));
    const selected = existing ?? next;
    setPlace(selected);
    setSavedPlaces((places) => existing ? places : [...places, next]);
    setModal(null);
    setQuery('');
    setView('weather');
  }

  function locateMe() {
    if (!navigator.geolocation) { setError('Location is not supported by this browser.'); return; }
    setError('');
    navigator.geolocation.getCurrentPosition((position) => {
      const devicePlace: Place = {
        id: `device-${position.coords.latitude.toFixed(3)}-${position.coords.longitude.toFixed(3)}`,
        name: 'My location', country: 'Device location', latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      selectPlace(devicePlace);
    }, () => setError('Location permission was denied. You can search for a city instead.'), { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  }

  function removePlace(id: string) {
    if (id === place.id) return;
    setSavedPlaces((items) => items.filter((item) => item.id !== id));
  }

  const displayedHourly = weather?.hourly ?? [];
  const allTemps = weather?.daily.flatMap((day) => [day.low, day.high]) ?? [];
  const minTemp = allTemps.length ? Math.min(...allTemps) : 0;
  const maxTemp = allTemps.length ? Math.max(...allTemps) : 1;
  const tempRange = Math.max(1, maxTemp - minTemp);

  return (
    <div className={`app-shell tone-${tone} ${weather?.current.isDay ? 'is-day' : 'is-night'}`}>
      <WeatherBackground tone={tone} isDay={weather?.current.isDay ?? true} />
      <header className="topbar">
        <button className="brand-lockup" onClick={() => setView('weather')} aria-label="Weather home">
          <span className="brand-mark"><span /></span><span>Weather</span>
        </button>
        <div className="topbar-center">
          <span className="topbar-caption">WEATHER</span>
          <button className="location-trigger" onClick={() => setModal('locations')}>
            <MapPin size={15} />{place.name}<ChevronDown size={14} />
          </button>
        </div>
        <div className="topbar-actions">
          <button className={`icon-button ${view === 'map' ? 'active' : ''}`} onClick={() => setView(view === 'map' ? 'weather' : 'map')} aria-label={view === 'map' ? 'Return to weather' : 'Open weather map'} title="Weather map"><MapIcon size={18} /></button>
          <button className="icon-button" onClick={() => setModal('search')} aria-label="Search locations" title="Search locations"><Search size={18} /></button>
          <button className="icon-button" onClick={() => setModal('settings')} aria-label="Settings" title="Settings"><Settings2 size={18} /></button>
        </div>
      </header>

      {view === 'weather' ? (
        <main className="main-content">
          <section className="hero-section">
            <div className="hero-copy">
              <div className="hero-kicker"><span className="live-dot" />CURRENT CONDITIONS <span className="kicker-divider">·</span> {currentTimeLabel(current?.time)}</div>
              <h1>{place.name}<span className="hero-comma">,</span></h1>
              <div className="hero-condition">{current ? weatherLabel(current.weatherCode) : 'Reading the sky…'}</div>
              <div className="hero-temperature-row">
                <div className="hero-temperature">{current ? tempLabel(current.temperature, fahrenheit) : '—°'}</div>
                <div className="hero-temperature-meta">
                  <div className="hero-condition-icon">{current && <WeatherSymbol code={current.weatherCode} isDay={current.isDay} size={42} />}</div>
                  <span>Feels like {current ? tempLabel(current.apparent, fahrenheit) : '—°'}</span>
                </div>
              </div>
              <div className="hero-high-low"><span><ArrowUp size={14} /> {today ? tempLabel(today.high, fahrenheit) : '—°'}</span><span><ArrowDown size={14} /> {today ? tempLabel(today.low, fahrenheit) : '—°'}</span><span className="hero-separator" /> <span>{weather?.place.admin1 ?? weather?.place.country ?? 'Local forecast'}</span></div>
              <p className="hero-summary">{loading && !weather ? 'Finding the latest conditions for this location.' : summary}</p>
              <div className="hero-actions-row">
                <button className="pill-button" onClick={() => setModal('search')}><Search size={15} /> Change location</button>
                <button className="quiet-button" onClick={locateMe}><LocateFixed size={15} /> Use my location</button>
              </div>
            </div>
            <div className="hero-orbit" aria-hidden="true">
              <div className="orbit-ring orbit-ring-one" /><div className="orbit-ring orbit-ring-two" />
              <div className="hero-orbit-glow" />
              <span className="orbit-label orbit-label-top">ATMOSPHERIC CONDITIONS</span>
              <span className="orbit-label orbit-label-bottom">{current ? `${current.cloudCover}% CLOUD COVER` : 'OBSERVING THE SKY'}</span>
            </div>
          </section>

          {error && <div className="status-banner"><span>{error}</span><button onClick={() => setRefreshKey((key) => key + 1)}>Try again</button></div>}
          {refreshing && weather && <div className="refresh-note"><RefreshCw size={12} className="spin-subtle" /> Updating forecast data</div>}

          <div className="content-grid">
            <div className="primary-column">
              <section className="section-block">
                <div className="section-heading"><div><span className="eyebrow">THE NEXT 24 HOURS</span><h2>Hourly outlook</h2></div><span className="section-side-note">Swipe to explore <ChevronRight size={13} /></span></div>
                <div className="hourly-panel glass-panel">
                  <div className="hourly-strip">
                    {displayedHourly.map((hour, index) => (
                      <div className={`hour-item ${index === 0 ? 'hour-current' : ''}`} key={hour.time}>
                        <span className="hour-time">{formatHour(hour.time, current?.time)}</span>
                        <span className="hour-icon"><WeatherSymbol code={hour.weatherCode} isDay={index < 12 ? current?.isDay ?? true : true} size={20} /></span>
                        <strong>{tempLabel(hour.temperature, fahrenheit)}</strong>
                        <span className={`hour-precip ${hour.precipitationProbability >= 30 ? 'has-precip' : ''}`}>{hour.precipitationProbability > 0 ? `${Math.round(hour.precipitationProbability)}%` : '—'}</span>
                        <div className="hour-spark" style={{ height: `${16 + Math.max(0, Math.min(34, hour.temperature - minTemp + 13))}px` }} />
                      </div>
                    ))}
                    {displayedHourly.length === 0 && <div className="empty-inline">Hourly forecast is unavailable right now.</div>}
                  </div>
                  <div className="hourly-legend"><span><i className="legend-dot" /> Temperature</span><span><i className="legend-rain" /> Precipitation chance</span><span>Local time</span></div>
                </div>
              </section>

              <section className="section-block">
                <div className="section-heading"><div><span className="eyebrow">A LITTLE FURTHER OUT</span><h2>10-day forecast</h2></div><span className="section-side-note">High / low</span></div>
                <div className="daily-panel glass-panel">
                  {weather?.daily.map((day, index) => {
                    const left = ((day.low - minTemp) / tempRange) * 100;
                    const width = Math.max(4, ((day.high - day.low) / tempRange) * 100);
                    return (
                      <button className={`daily-row ${index === 0 ? 'today-row' : ''}`} key={day.date} onClick={() => { setSelectedDayIndex(index); setDetail('precipitation'); }} type="button">
                        <span className="daily-day">{formatDay(day.date, index)}</span>
                        <span className="daily-condition"><WeatherSymbol code={day.weatherCode} size={19} /><small>{day.precipitationProbability > 20 ? `${day.precipitationProbability}%` : ''}</small></span>
                        <span className="daily-low">{tempLabel(day.low, fahrenheit)}</span>
                        <span className="daily-range"><i style={{ left: `${left}%`, width: `${width}%` }} /></span>
                        <strong className="daily-high">{tempLabel(day.high, fahrenheit)}</strong>
                        <ChevronRight size={14} className="daily-chevron" />
                      </button>
                    );
                  }) ?? <div className="empty-inline">The 10-day forecast will appear here.</div>}
                </div>
              </section>
            </div>

            <aside className="secondary-column">
              <section className="section-block detail-section">
                <div className="section-heading"><div><span className="eyebrow">THE ATMOSPHERE</span><h2>Weather details</h2></div><button className="text-action" onClick={() => setModal('settings')}>Units <ChevronRight size={13} /></button></div>
                {weather ? (
                  <div className="detail-grid">
                    <DetailCard icon={Thermometer} label="Feels like" value={tempLabel(current!.apparent, fahrenheit)} hint={current!.apparent > current!.temperature ? 'Warmer than the air' : current!.apparent < current!.temperature ? 'Cooler than the air' : 'Same as actual'} onClick={() => setDetail('feels')} />
                    <DetailCard icon={Sun} label="UV index" value={displayedHourly[0]?.uv.toFixed(1) ?? '—'} hint={displayedHourly[0]?.uv == null ? 'Unavailable' : displayedHourly[0].uv < 3 ? 'Low exposure' : displayedHourly[0].uv < 6 ? 'Moderate exposure' : 'High exposure'} onClick={() => setDetail('uv')}>
                      <div className="mini-uv"><i style={{ width: `${Math.min(100, ((displayedHourly[0]?.uv ?? 0) / 11) * 100)}%` }} /></div>
                    </DetailCard>
                    <DetailCard icon={Wind} label="Wind" value={`${Math.round(current!.windSpeed)} km/h`} hint={`${compassDirection(current!.windDirection)} · gusts ${Math.round(current!.windGusts)}`} onClick={() => setDetail('wind')}>
                      <div className="mini-compass"><Compass size={34} /><i style={{ transform: `rotate(${current!.windDirection}deg)` }} /></div>
                    </DetailCard>
                    <DetailCard icon={Droplets} label="Humidity" value={`${current!.humidity}%`} hint={`Dew point ${tempLabel(displayedHourly[0]?.dewpoint ?? current!.apparent, fahrenheit)}`} onClick={() => setDetail('humidity')}>
                      <div className="mini-humidity"><i style={{ width: `${current!.humidity}%` }} /></div>
                    </DetailCard>
                    <DetailCard icon={Eye} label="Visibility" value={displayedHourly[0]?.visibility != null ? `${(displayedHourly[0].visibility / 1000).toFixed(1)} km` : '—'} hint="Horizontal clarity" onClick={() => setDetail('visibility')} />
                    <DetailCard icon={Gauge} label="Pressure" value={`${Math.round(current!.pressure)} hPa`} hint="Sea-level pressure" onClick={() => setDetail('pressure')}>
                      <div className="pressure-trend"><Sparkline values={displayedHourly.slice(0, 8).map((hour) => hour.pressure)} /></div>
                    </DetailCard>
                    <DetailCard icon={Waves} label="Precipitation" value={`${displayedHourly[0]?.precipitationProbability ?? 0}%`} hint={`${(current!.precipitation ?? 0).toFixed(1)} mm currently`} onClick={() => setDetail('precipitation')} />
                    {weather.air?.usAqi != null && <DetailCard icon={Activity} label="Air quality" value={`${weather.air.usAqi} AQI`} hint={aqiLabel(weather.air.usAqi)} className={`aqi-${getAqiTone(weather.air.usAqi)}`} onClick={() => setDetail('air')}><div className="aqi-dotline"><i /></div></DetailCard>}
                  </div>
                ) : (
                  <div className="detail-skeleton-grid">{Array.from({ length: 6 }, (_, index) => <div className="skeleton-card glass-panel" key={index} />)}</div>
                )}
              </section>
              <section className="section-block sun-section">
                <div className="section-heading"><div><span className="eyebrow">DAYLIGHT</span><h2>Sunrise & sunset</h2></div><Sunrise size={17} className="muted-icon" /></div>
                <div className="sun-panel glass-panel" onClick={() => setDetail('sun')} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter') setDetail('sun'); }}>
                  {today ? <>
                    <div className="sun-arc-wrap"><svg viewBox="0 0 320 112" className="sun-arc" role="img" aria-label="Daylight arc"><path d="M 22 92 C 78 -9 242 -9 298 92" className="sun-arc-track" pathLength="100" /><path d="M 22 92 C 78 -9 242 -9 298 92" className="sun-arc-progress" pathLength="100" style={{ strokeDasharray: `${(today && current ? solarPosition(current.time, today.sunrise, today.sunset).progress : .5) * 100} 100` }} /><circle cx={today && current ? solarPosition(current.time, today.sunrise, today.sunset).x : 160} cy={today && current ? solarPosition(current.time, today.sunrise, today.sunset).y : 18} r="8" className="sun-arc-orb" /></svg></div>
                    <div className="sun-times"><div><span><Sunrise size={14} /> Sunrise</span><strong>{clockLabel(today.sunrise)}</strong></div><div><span><Sunset size={14} /> Sunset</span><strong>{clockLabel(today.sunset)}</strong></div></div>
                  </> : <div className="empty-inline">Solar times are unavailable.</div>}
                  <div className="daylight-foot"><span>DAYLIGHT</span><strong>{today ? `${Math.max(0, ((new Date(today.sunset).getTime() - new Date(today.sunrise).getTime()) / 3600000)).toFixed(1)} hours` : '—'}</strong></div>
                </div>
              </section>
            </aside>
          </div>
          <footer className="app-footer"><span>Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open‑Meteo</a> · Air quality is modelled</span><span className="developer-credit">Developed by <a href="https://github.com/feeinpee-cyber" target="_blank" rel="noreferrer">يزيد الغامدي</a></span></footer>
        </main>
      ) : (
        <main className="map-page">
          <div className="map-page-heading"><div><span className="eyebrow">WEATHER MAP</span><h1>Weather map</h1><p>Look around the region and explore recent radar observations.</p></div><button className="pill-button" onClick={() => setView('weather')}><ChevronLeft size={15} /> Back to forecast</button></div>
          <div className="map-workspace glass-panel">
            <div className="map-toolbar">
              <div className="map-layer-switcher" role="tablist" aria-label="Map layer">
                {([['radar', 'Radar'], ['temperature', 'Temperature'], ['wind', 'Wind'], ['air', 'Air quality']] as [MapLayer, string][]).map(([key, label]) => <button key={key} className={mapLayer === key ? 'selected' : ''} onClick={() => setMapLayer(key)} role="tab" aria-selected={mapLayer === key}>{label}</button>)}
              </div>
              <button className="map-location-button" onClick={locateMe}><LocateFixed size={15} /> My location</button>
            </div>
            <Suspense fallback={<div className="map-loading">Preparing the map…</div>}><RadarMap place={place} weather={weather} layer={mapLayer} frameIndex={radarFrameIndex} onFrames={setRadarFrames} onFrameIndex={setRadarFrameIndex} /></Suspense>
          </div>
          <div className="map-disclaimer"><span><Clock3 size={14} />{mapLayer === 'radar' ? `Radar shows recent observations from the previous two hours. ${radarFrames.length} frames available; no future radar is provided.` : 'Weather values are point forecasts for the selected city, not a spatial heatmap.'}</span><span>OpenStreetMap · RainViewer · Open‑Meteo</span></div>
        </main>
      )}

      {modal && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}>
        <section className={`app-modal glass-panel ${modal === 'search' ? 'search-modal' : ''}`} role="dialog" aria-modal="true" aria-labelledby="app-modal-title">
          <div className="modal-topline"><span className="eyebrow">WEATHER / {modal.toUpperCase()}</span><button className="icon-button" onClick={() => setModal(null)} aria-label="Close"><X size={18} /></button></div>
          {modal === 'search' && <>
            <h2 id="app-modal-title">Find a place</h2><p className="modal-description">Search for a city, region or country to see its weather.</p>
            <label className="search-input-wrap"><Search size={18} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try Tokyo, London, Riyadh…" /><kbd>ESC</kbd></label>
            <button className="locate-row" onClick={locateMe}><span className="locate-icon"><LocateFixed size={17} /></span><span><strong>Use my current location</strong><small>Requires browser location permission</small></span><ChevronRight size={16} /></button>
            <div className="results-heading">{query.trim().length >= 2 ? 'SEARCH RESULTS' : 'SUGGESTED LOCATION'}</div>
            <div className="search-results">
              {searching && <div className="search-state"><RefreshCw size={15} className="spin-subtle" /> Searching locations…</div>}
              {searchError && <div className="search-state">{searchError}</div>}
              {!searching && query.trim().length < 2 && <button className="place-result" onClick={() => selectPlace(DEFAULT_PLACE)}><span className="result-weather-icon"><Sun size={18} /></span><span><strong>Riyadh</strong><small>Riyadh Region, Saudi Arabia</small></span><span className="result-coordinate">24.71° N</span></button>}
              {!searching && searchResults.map((result) => <button className="place-result" key={result.id} onClick={() => selectPlace(result)}><span className="result-weather-icon"><MapPin size={17} /></span><span><strong>{result.name}</strong><small>{[result.admin1, result.country].filter(Boolean).join(', ')}</small></span><span className="result-coordinate">{result.latitude.toFixed(1)}°</span></button>)}
              {!searching && query.trim().length >= 2 && searchResults.length === 0 && !searchError && <div className="search-state">No matching places found.</div>}
            </div>
          </>}
          {modal === 'locations' && <>
            <h2 id="app-modal-title">Your places</h2><p className="modal-description">Keep the places you care about close by.</p>
            <button className="add-place-button" onClick={() => { setModal('search'); setQuery(''); }}><span><Search size={16} /> Add a place</span><ChevronRight size={16} /></button>
            <div className="saved-place-list">{savedPlaces.map((saved) => <div className={`saved-place-row ${saved.id === place.id ? 'is-selected' : ''}`} key={saved.id}><button className="saved-place-main" onClick={() => selectPlace(saved)}><span className="saved-place-mark"><MapPin size={16} /></span><span><strong>{saved.name}</strong><small>{[saved.admin1, saved.country].filter(Boolean).join(', ')}</small></span>{saved.id === place.id && <Check size={16} className="selected-check" />}</button>{saved.id !== place.id && <button className="remove-place" onClick={() => removePlace(saved.id)} aria-label={`Remove ${saved.name}`}><Trash2 size={15} /></button>}</div>)}</div>
          </>}
          {modal === 'settings' && <>
            <h2 id="app-modal-title">Preferences</h2><p className="modal-description">Make the forecast feel right to you.</p>
            <div className="setting-row"><span><strong>Temperature</strong><small>Choose how temperatures are displayed</small></span><div className="segmented-setting"><button className={!fahrenheit ? 'active' : ''} onClick={() => setFahrenheit(false)}>°C</button><button className={fahrenheit ? 'active' : ''} onClick={() => setFahrenheit(true)}>°F</button></div></div>
            <div className="setting-row"><span><strong>Automatic updates</strong><small>Refresh weather every 15 minutes</small></span><button className={`toggle ${autoRefresh ? 'on' : ''}`} onClick={() => setAutoRefresh((value) => !value)} aria-pressed={autoRefresh}><i /></button></div>
            <div className="settings-source"><span>DATA & SOURCES</span><p>Forecast and geocoding by <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open‑Meteo</a>. Air-quality values are model estimates. Historical radar by <a href="https://www.rainviewer.com/" target="_blank" rel="noreferrer">RainViewer</a>.</p></div>
          </>}
        </section>
      </div>}

      {detail && weather && <DetailModal detail={detail} weather={weather} fahrenheit={fahrenheit} selectedDay={selectedDayIndex == null ? undefined : weather.daily[selectedDayIndex]} selectedDayIndex={selectedDayIndex ?? undefined} onClose={() => { setDetail(null); setSelectedDayIndex(null); }} />}
    </div>
  );
}

export default App;
