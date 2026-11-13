export type Place = {
  id: string;
  name: string;
  admin1?: string;
  country: string;
  countryCode?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
};

export type HourlyPoint = {
  time: string;
  temperature: number;
  apparent: number;
  dewpoint: number;
  pressure: number;
  precipitationProbability: number;
  precipitation: number;
  weatherCode: number;
  windSpeed: number;
  humidity: number;
  uv: number;
  visibility: number;
};

export type DailyPoint = {
  date: string;
  weatherCode: number;
  high: number;
  low: number;
  precipitationProbability: number;
  precipitation: number;
  sunrise: string;
  sunset: string;
  uvMax: number;
  windMax: number;
};

export type WeatherBundle = {
  place: Place;
  timezone: string;
  fetchedAt: number;
  current: {
    time: string;
    temperature: number;
    apparent: number;
    humidity: number;
    isDay: boolean;
    precipitation: number;
    rain: number;
    snowfall: number;
    weatherCode: number;
    cloudCover: number;
    pressure: number;
    windSpeed: number;
    windDirection: number;
    windGusts: number;
  };
  hourly: HourlyPoint[];
  daily: DailyPoint[];
  air?: { usAqi?: number; europeanAqi?: number; pm25?: number; pm10?: number; ozone?: number };
};

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Weather service returned ${response.status}`);
  return response.json() as Promise<T>;
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const url = new URL(GEOCODE_URL);
  url.search = new URLSearchParams({ name: query, count: '8', language: 'en', format: 'json' }).toString();
  const data = await getJson<{ results?: Array<Record<string, unknown>> }>(url.toString(), signal);
  return (data.results ?? []).map((item) => ({
    id: String(item.id ?? `${item.latitude}-${item.longitude}`),
    name: String(item.name ?? 'Unknown location'),
    admin1: typeof item.admin1 === 'string' ? item.admin1 : undefined,
    country: String(item.country ?? ''),
    countryCode: typeof item.country_code === 'string' ? item.country_code : undefined,
    latitude: Number(item.latitude),
    longitude: Number(item.longitude),
    timezone: typeof item.timezone === 'string' ? item.timezone : undefined,
  }));
}

type ForecastResponse = {
  timezone: string;
  current: Record<string, number | string>;
  hourly: Record<string, Array<number | string | null>>;
  daily: Record<string, Array<number | string | null>>;
};

type AirResponse = { current?: Record<string, number | string | null> };

function n(value: number | string | null | undefined, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function fetchWeather(place: Place, signal?: AbortSignal): Promise<WeatherBundle> {
  const params = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    timezone: 'auto',
    forecast_days: '10',
    temperature_unit: 'celsius',
    wind_speed_unit: 'kmh',
    precipitation_unit: 'mm',
    current: [
      'temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'is_day',
      'precipitation', 'rain', 'snowfall', 'weather_code', 'cloud_cover', 'pressure_msl',
      'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m',
    ].join(','),
    hourly: [
      'temperature_2m', 'apparent_temperature', 'dew_point_2m', 'pressure_msl', 'precipitation_probability', 'precipitation',
      'weather_code', 'wind_speed_10m', 'relative_humidity_2m', 'uv_index', 'visibility',
    ].join(','),
    daily: [
      'weather_code', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_probability_max',
      'precipitation_sum', 'sunrise', 'sunset', 'uv_index_max', 'wind_speed_10m_max',
    ].join(','),
  });
  const forecastUrl = `${FORECAST_URL}?${params}`;
  const airParams = new URLSearchParams({
    latitude: String(place.latitude), longitude: String(place.longitude), timezone: 'auto',
    current: 'us_aqi,european_aqi,pm2_5,pm10,ozone', forecast_days: '1',
  });
  const [forecast, air] = await Promise.all([
    getJson<ForecastResponse>(forecastUrl, signal),
    getJson<AirResponse>(`${AIR_URL}?${airParams}`, signal).catch(() => undefined),
  ]);

  const times = forecast.hourly.time ?? [];
  const currentTime = String(forecast.current.time ?? times[0] ?? '');
  let start = times.findIndex((time) => String(time) >= currentTime);
  if (start < 0) start = 0;
  const hourly: HourlyPoint[] = times.slice(start, start + 24).map((time, offset) => {
    const index = start + offset;
    const value = (key: string) => forecast.hourly[key]?.[index];
    return {
      time: String(time),
      temperature: n(value('temperature_2m')),
      apparent: n(value('apparent_temperature')),
      dewpoint: n(value('dew_point_2m')),
      pressure: n(value('pressure_msl')),
      precipitationProbability: n(value('precipitation_probability')),
      precipitation: n(value('precipitation')),
      weatherCode: n(value('weather_code')),
      windSpeed: n(value('wind_speed_10m')),
      humidity: n(value('relative_humidity_2m')),
      uv: n(value('uv_index')),
      visibility: n(value('visibility')),
    };
  });

  const dayCount = forecast.daily.time?.length ?? 0;
  const daily: DailyPoint[] = Array.from({ length: dayCount }, (_, index) => {
    const value = (key: string) => forecast.daily[key]?.[index];
    return {
      date: String(value('time') ?? ''),
      weatherCode: n(value('weather_code')),
      high: n(value('temperature_2m_max')),
      low: n(value('temperature_2m_min')),
      precipitationProbability: n(value('precipitation_probability_max')),
      precipitation: n(value('precipitation_sum')),
      sunrise: String(value('sunrise') ?? ''),
      sunset: String(value('sunset') ?? ''),
      uvMax: n(value('uv_index_max')),
      windMax: n(value('wind_speed_10m_max')),
    };
  });

  const c = forecast.current;
  const a = air?.current;
  return {
    place,
    timezone: forecast.timezone || place.timezone || 'auto',
    fetchedAt: Date.now(),
    current: {
      time: String(c.time ?? currentTime),
      temperature: n(c.temperature_2m), apparent: n(c.apparent_temperature),
      humidity: n(c.relative_humidity_2m), isDay: n(c.is_day) === 1,
      precipitation: n(c.precipitation), rain: n(c.rain), snowfall: n(c.snowfall),
      weatherCode: n(c.weather_code), cloudCover: n(c.cloud_cover), pressure: n(c.pressure_msl),
      windSpeed: n(c.wind_speed_10m), windDirection: n(c.wind_direction_10m), windGusts: n(c.wind_gusts_10m),
    },
    hourly, daily,
    air: a ? {
      usAqi: a.us_aqi == null ? undefined : n(a.us_aqi),
      europeanAqi: a.european_aqi == null ? undefined : n(a.european_aqi),
      pm25: a.pm2_5 == null ? undefined : n(a.pm2_5),
      pm10: a.pm10 == null ? undefined : n(a.pm10),
      ozone: a.ozone == null ? undefined : n(a.ozone),
    } : undefined,
  };
}

export function weatherLabel(code: number): string {
  if (code === 0) return 'Clear sky';
  if (code === 1) return 'Mainly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if (code >= 61 && code <= 67) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Rain showers';
  if (code === 85 || code === 86) return 'Snow showers';
  if (code >= 95) return 'Thunderstorms';
  return 'Conditions unavailable';
}

export function weatherTone(code: number, isDay: boolean): string {
  if (code >= 95) return 'storm';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code === 45 || code === 48) return 'fog';
  if (code === 3) return 'overcast';
  if (!isDay) return 'night';
  if (code === 2) return 'partly';
  return 'clear';
}

export function weatherIconName(code: number, isDay = true): string {
  if (code >= 95) return 'cloud-lightning';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'cloud-snow';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'cloud-rain';
  if (code === 45 || code === 48) return 'cloud-fog';
  if (code === 3) return 'cloud';
  if (code === 2) return 'cloud-sun';
  if (!isDay) return 'moon-star';
  return 'sun';
}

export function makeSummary(weather: WeatherBundle): string {
  const { current, hourly, daily } = weather;
  const upcomingRain = hourly.find((hour, index) => index > 0 && hour.precipitationProbability >= 45);
  const nextChange = hourly.find((hour, index) => index > 1 && hour.weatherCode !== current.weatherCode);
  if (current.weatherCode >= 95) return `Thunderstorms are in the area. Stay alert for changing conditions.`;
  if (current.weatherCode >= 51 && current.weatherCode <= 82) {
    return current.precipitation > 0
      ? `Precipitation is currently being reported. Expect around ${current.precipitation.toFixed(1)} mm in the current interval.`
      : 'Showers are possible. Keep an eye on the next few hours as conditions develop.';
  }
  if (upcomingRain) {
    return `A ${upcomingRain.precipitationProbability}% chance of precipitation is expected around ${formatClock(upcomingRain.time)}. The rest of the day may change.`;
  }
  if (nextChange) return `Conditions may shift to ${weatherLabel(nextChange.weatherCode).toLowerCase()} around ${formatClock(nextChange.time)}.`;
  if (daily[0]) return `A high of ${Math.round(daily[0].high)}° and a low of ${Math.round(daily[0].low)}° are expected today, with ${daily[0].precipitationProbability}% precipitation probability.`;
  return 'Forecast details are updating. Check back shortly for the latest outlook.';
}

export function formatClock(dateTime: string): string {
  const date = new Date(`${dateTime}:00Z`);
  return Number.isNaN(date.getTime()) ? 'later' : new Intl.DateTimeFormat('en', { hour: 'numeric', timeZone: 'UTC' }).format(date);
}

export function formatHour(dateTime: string, currentTime?: string): string {
  if (dateTime === currentTime) return 'Now';
  const date = new Date(`${dateTime}:00Z`);
  return Number.isNaN(date.getTime()) ? '--' : new Intl.DateTimeFormat('en', { hour: 'numeric', timeZone: 'UTC' }).format(date);
}

export function formatDay(dateTime: string, index: number): string {
  if (index === 0) return 'Today';
  const date = new Date(`${dateTime}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? '--' : new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' }).format(date);
}

export function compassDirection(degrees: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return directions[Math.round(degrees / 22.5) % 16];
}

export function aqiLabel(value?: number): string {
  if (value == null) return 'Unavailable';
  if (value <= 50) return 'Good';
  if (value <= 100) return 'Moderate';
  if (value <= 150) return 'Sensitive groups';
  if (value <= 200) return 'Unhealthy';
  if (value <= 300) return 'Very unhealthy';
  return 'Hazardous';
}
