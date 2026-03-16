/**
 * Weather module for HomepageMD.
 *
 * Uses Open-Meteo (https://open-meteo.com) — free, no API key required.
 * Geocodes a location string to lat/lon, fetches forecast data,
 * and derives "upcoming changes" alerts.
 */

// ---------------------------------------------------------------------------
// Cache — simple in-memory with TTL
// ---------------------------------------------------------------------------

const geocodeCache = new Map();
const forecastCache = new Map();
const FORECAST_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Clear the forecast cache (geocode cache is kept since locations don't change).
 */
export function clearWeatherCache() {
  forecastCache.clear();
}

// ---------------------------------------------------------------------------
// WMO Weather Codes → human-readable descriptions and icon names
// https://www.noaa.gov/weather/codes
// ---------------------------------------------------------------------------

const WMO_DESCRIPTIONS = {
  0: { text: 'Clear sky', icon: 'clear' },
  1: { text: 'Mainly clear', icon: 'clear' },
  2: { text: 'Partly cloudy', icon: 'partly-cloudy' },
  3: { text: 'Overcast', icon: 'cloudy' },
  45: { text: 'Fog', icon: 'fog' },
  48: { text: 'Depositing rime fog', icon: 'fog' },
  51: { text: 'Light drizzle', icon: 'drizzle' },
  53: { text: 'Moderate drizzle', icon: 'drizzle' },
  55: { text: 'Dense drizzle', icon: 'drizzle' },
  56: { text: 'Light freezing drizzle', icon: 'freezing' },
  57: { text: 'Dense freezing drizzle', icon: 'freezing' },
  61: { text: 'Slight rain', icon: 'rain' },
  63: { text: 'Moderate rain', icon: 'rain' },
  65: { text: 'Heavy rain', icon: 'rain' },
  66: { text: 'Light freezing rain', icon: 'freezing' },
  67: { text: 'Heavy freezing rain', icon: 'freezing' },
  71: { text: 'Slight snow', icon: 'snow' },
  73: { text: 'Moderate snow', icon: 'snow' },
  75: { text: 'Heavy snow', icon: 'snow' },
  77: { text: 'Snow grains', icon: 'snow' },
  80: { text: 'Slight rain showers', icon: 'rain' },
  81: { text: 'Moderate rain showers', icon: 'rain' },
  82: { text: 'Violent rain showers', icon: 'rain' },
  85: { text: 'Slight snow showers', icon: 'snow' },
  86: { text: 'Heavy snow showers', icon: 'snow' },
  95: { text: 'Thunderstorm', icon: 'thunderstorm' },
  96: { text: 'Thunderstorm with slight hail', icon: 'thunderstorm' },
  99: { text: 'Thunderstorm with heavy hail', icon: 'thunderstorm' },
};

function describeWeatherCode(code) {
  return WMO_DESCRIPTIONS[code] || { text: 'Unknown', icon: 'cloudy' };
}

// ---------------------------------------------------------------------------
// Geocoding — resolve location string to lat/lon
// ---------------------------------------------------------------------------

async function geocode(locationStr) {
  const cached = geocodeCache.get(locationStr);
  if (cached) return cached;

  // Open-Meteo geocoding works best with just the city name
  // Strip comma-separated qualifiers (state, country) and try the full string first
  const queries = [locationStr];
  if (locationStr.includes(',')) {
    queries.push(locationStr.split(',')[0].trim());
  }

  for (const query of queries) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;

    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) continue;

      const data = await res.json();
      if (!data.results || data.results.length === 0) continue;

      const result = {
        latitude: data.results[0].latitude,
        longitude: data.results[0].longitude,
        name: data.results[0].name,
        admin1: data.results[0].admin1 || null,
        country: data.results[0].country || null,
        timezone: data.results[0].timezone || 'auto',
      };

      geocodeCache.set(locationStr, result);
      return result;
    } catch {
      clearTimeout(timeout);
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Forecast — fetch current + hourly + daily data
// ---------------------------------------------------------------------------

/**
 * Fetch weather data for a location string.
 *
 * @param {string} locationStr - User-provided location (city name, zip, etc.)
 * @param {string} locale - Browser locale for unit selection (e.g., 'en-US')
 * @returns {Promise<object|null>} Weather data or null
 */
export async function fetchWeather(locationStr, locale) {
  if (!locationStr) return null;

  // Check forecast cache
  const cacheKey = `${locationStr}|${locale || ''}`;
  const cached = forecastCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < FORECAST_TTL) {
    return cached.data;
  }

  const geo = await geocode(locationStr);
  if (!geo) return null;

  // Determine units from locale
  const useImperial = isImperialLocale(locale);
  const tempUnit = useImperial ? 'fahrenheit' : 'celsius';
  const windUnit = useImperial ? 'mph' : 'kmh';

  const params = new URLSearchParams({
    latitude: geo.latitude,
    longitude: geo.longitude,
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m',
    hourly: 'temperature_2m,weather_code,precipitation_probability',
    daily: 'temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,sunrise,sunset',
    temperature_unit: tempUnit,
    wind_speed_unit: windUnit,
    timezone: geo.timezone,
    forecast_days: '2',
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const raw = await res.json();

    // Fetch air quality and NWS alerts in parallel (best-effort)
    const [aqi, nwsAlerts] = await Promise.all([
      fetchAirQuality(geo, useImperial),
      fetchNwsAlerts(geo),
    ]);

    const result = processWeatherData(raw, geo, useImperial, aqi, nwsAlerts);

    forecastCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Process raw API data into our output shape
// ---------------------------------------------------------------------------

function processWeatherData(raw, geo, useImperial, aqi, nwsAlerts) {
  const current = raw.current;
  const hourly = raw.hourly;
  const daily = raw.daily;
  const unitSymbol = useImperial ? '°F' : '°C';
  const windUnitLabel = useImperial ? 'mph' : 'km/h';

  const currentCondition = describeWeatherCode(current.weather_code);

  // Build hourly forecast for the next 24 hours
  const now = new Date(current.time);
  const nowHour = now.getHours();
  const hourlyForecast = [];
  for (let i = 0; i < hourly.time.length && hourlyForecast.length < 24; i++) {
    const hourTime = new Date(hourly.time[i]);
    if (hourTime >= now) {
      hourlyForecast.push({
        time: hourly.time[i],
        hour: hourTime.getHours(),
        temp: Math.round(hourly.temperature_2m[i]),
        weatherCode: hourly.weather_code[i],
        precipProbability: hourly.precipitation_probability[i],
      });
    }
  }

  // Derive upcoming changes / alerts
  const alerts = deriveAlerts(current, hourlyForecast, daily, unitSymbol, aqi);

  return {
    location: {
      name: geo.name,
      region: geo.admin1,
      latitude: geo.latitude,
      longitude: geo.longitude,
    },
    units: { temp: unitSymbol, wind: windUnitLabel },
    current: {
      temp: Math.round(current.temperature_2m),
      feelsLike: Math.round(current.apparent_temperature),
      condition: currentCondition.text,
      icon: currentCondition.icon,
      wind: Math.round(current.wind_speed_10m),
      gusts: Math.round(current.wind_gusts_10m),
    },
    today: {
      high: Math.round(daily.temperature_2m_max[0]),
      low: Math.round(daily.temperature_2m_min[0]),
      condition: describeWeatherCode(daily.weather_code[0]).text,
      precipChance: daily.precipitation_probability_max[0],
      sunrise: formatTime(daily.sunrise?.[0]),
      sunset: formatTime(daily.sunset?.[0]),
    },
    tomorrow: {
      high: Math.round(daily.temperature_2m_max[1]),
      low: Math.round(daily.temperature_2m_min[1]),
      condition: describeWeatherCode(daily.weather_code[1]).text,
      precipChance: daily.precipitation_probability_max[1],
    },
    moon: getMoonData(now),
    alerts,
    nwsAlerts: nwsAlerts || [],
    aqi,
  };
}

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

function formatTime(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${m} ${period}`;
}

// ---------------------------------------------------------------------------
// Moon phase calculation (astronomical approximation)
// ---------------------------------------------------------------------------

const MOON_PHASES = [
  { name: 'New Moon', emoji: '\uD83C\uDF11' },
  { name: 'Waxing Crescent', emoji: '\uD83C\uDF12' },
  { name: 'First Quarter', emoji: '\uD83C\uDF13' },
  { name: 'Waxing Gibbous', emoji: '\uD83C\uDF14' },
  { name: 'Full Moon', emoji: '\uD83C\uDF15' },
  { name: 'Waning Gibbous', emoji: '\uD83C\uDF16' },
  { name: 'Last Quarter', emoji: '\uD83C\uDF17' },
  { name: 'Waning Crescent', emoji: '\uD83C\uDF18' },
];

/**
 * Calculate moon phase for a given date.
 * Uses a simplified algorithm based on known new moon reference date.
 */
function getMoonData(date) {
  const SYNODIC_MONTH = 29.53058770576;
  // Known new moon: January 6, 2000 18:14 UTC
  const REFERENCE_NEW_MOON = new Date('2000-01-06T18:14:00Z');

  const daysSinceRef = (date - REFERENCE_NEW_MOON) / (1000 * 60 * 60 * 24);
  const cycleProgress = ((daysSinceRef % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH;
  const phaseIndex = Math.floor((cycleProgress / SYNODIC_MONTH) * 8) % 8;
  const illumination = Math.round((1 - Math.cos(2 * Math.PI * cycleProgress / SYNODIC_MONTH)) / 2 * 100);

  // Days until next full moon (phase index 4)
  const daysIntoFullCycle = cycleProgress;
  const fullMoonDay = SYNODIC_MONTH / 2; // ~14.77 days into cycle
  let daysToFull = fullMoonDay - daysIntoFullCycle;
  if (daysToFull < 0) daysToFull += SYNODIC_MONTH;
  const nextFullMoon = new Date(date.getTime() + daysToFull * 24 * 60 * 60 * 1000);

  // Format the full moon date nicely
  const fullMoonFormatted = nextFullMoon.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });

  // Full moon name based on month
  const fullMoonName = getFullMoonName(nextFullMoon.getMonth());

  return {
    phase: MOON_PHASES[phaseIndex].name,
    emoji: MOON_PHASES[phaseIndex].emoji,
    illumination,
    nextFullMoon: fullMoonFormatted,
    fullMoonName,
    daysToFullMoon: Math.round(daysToFull),
  };
}

/**
 * Traditional full moon names by month (Northern Hemisphere).
 */
function getFullMoonName(month) {
  const names = [
    'Wolf Moon',        // January
    'Snow Moon',        // February
    'Worm Moon',        // March
    'Pink Moon',        // April
    'Flower Moon',      // May
    'Strawberry Moon',  // June
    'Buck Moon',        // July
    'Sturgeon Moon',    // August
    'Harvest Moon',     // September
    'Hunter\u2019s Moon', // October
    'Beaver Moon',      // November
    'Cold Moon',        // December
  ];
  return names[month] || 'Full Moon';
}

// ---------------------------------------------------------------------------
// Air Quality Index
// ---------------------------------------------------------------------------

const AQI_LEVELS = [
  { max: 50, label: 'Good', concern: null },
  { max: 100, label: 'Moderate', concern: 'Sensitive groups may be affected' },
  { max: 150, label: 'Unhealthy for sensitive groups', concern: 'Limit prolonged outdoor exertion' },
  { max: 200, label: 'Unhealthy', concern: 'Everyone may begin to experience health effects' },
  { max: 300, label: 'Very unhealthy', concern: 'Health alert: everyone may experience serious effects' },
  { max: Infinity, label: 'Hazardous', concern: 'Emergency conditions' },
];

function describeAqi(value) {
  for (const level of AQI_LEVELS) {
    if (value <= level.max) return level;
  }
  return AQI_LEVELS[AQI_LEVELS.length - 1];
}

async function fetchAirQuality(geo, useImperial) {
  const aqiType = useImperial ? 'us_aqi' : 'european_aqi';
  const params = new URLSearchParams({
    latitude: geo.latitude,
    longitude: geo.longitude,
    current: `${aqiType},pm2_5`,
    hourly: aqiType,
    timezone: geo.timezone,
    forecast_days: '2',
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${params}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const data = await res.json();
    const value = data.current?.[aqiType];
    if (value == null) return null;

    const level = describeAqi(value);

    // Find the peak AQI in the next 24 hours for forecast alerts
    let peakValue = value;
    let peakHoursAway = 0;
    const hourlyAqi = data.hourly?.[aqiType] || [];
    const hourlyTimes = data.hourly?.time || [];
    const now = new Date(data.current.time);
    for (let i = 0; i < hourlyTimes.length && i < 48; i++) {
      const t = new Date(hourlyTimes[i]);
      if (t > now && hourlyAqi[i] > peakValue) {
        peakValue = hourlyAqi[i];
        peakHoursAway = Math.round((t - now) / 3600000);
      }
    }

    const peak = peakValue > value ? {
      value: Math.round(peakValue),
      label: describeAqi(peakValue).label,
      hoursAway: peakHoursAway,
    } : null;

    return {
      value: Math.round(value),
      label: level.label,
      concern: level.concern,
      pm25: data.current?.pm2_5 != null ? Math.round(data.current.pm2_5 * 10) / 10 : null,
      peak,
    };
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Derive "upcoming changes" alerts from forecast data
// ---------------------------------------------------------------------------

function deriveAlerts(current, hourlyForecast, daily, unitSymbol, aqi) {
  const alerts = [];
  const currentCode = current.weather_code;
  const isPrecipNow = currentCode >= 51;

  // 1. Precipitation starting or stopping within 12 hours
  for (let i = 0; i < Math.min(hourlyForecast.length, 12); i++) {
    const hour = hourlyForecast[i];
    const isPrecipHour = hour.weatherCode >= 51;

    if (!isPrecipNow && isPrecipHour) {
      const condition = describeWeatherCode(hour.weatherCode);
      const hoursAway = i + 1;
      alerts.push({
        type: 'precip-start',
        text: `${condition.text} expected in ${hoursAway === 1 ? '1 hour' : `${hoursAway} hours`}`,
      });
      break;
    }
    if (isPrecipNow && !isPrecipHour && i > 0) {
      alerts.push({
        type: 'precip-end',
        text: `Precipitation clearing in about ${i === 1 ? '1 hour' : `${i} hours`}`,
      });
      break;
    }
  }

  // 2. Big temperature swing (>10°F / >6°C) between now and tomorrow
  const tempDiffUnit = unitSymbol === '°F' ? 10 : 6;
  const tomorrowHigh = Math.round(daily.temperature_2m_max[1]);
  const todayTemp = Math.round(current.temperature_2m);
  const tempDiff = tomorrowHigh - todayTemp;
  if (Math.abs(tempDiff) >= tempDiffUnit) {
    const direction = tempDiff > 0 ? 'warmer' : 'colder';
    alerts.push({
      type: 'temp-swing',
      text: `${Math.abs(tempDiff)}${unitSymbol} ${direction} tomorrow`,
    });
  }

  // 3. Snow or ice conditions upcoming
  for (let i = 0; i < Math.min(hourlyForecast.length, 24); i++) {
    const code = hourlyForecast[i].weatherCode;
    if (code >= 71 && code <= 77 || code >= 85 && code <= 86) {
      const hoursAway = i + 1;
      if (!isPrecipNow || currentCode < 71) {
        alerts.push({
          type: 'snow',
          text: `Snow expected in ${hoursAway === 1 ? '1 hour' : `${hoursAway} hours`}`,
        });
      }
      break;
    }
    if (code === 56 || code === 57 || code === 66 || code === 67) {
      alerts.push({
        type: 'freezing',
        text: 'Freezing precipitation expected',
      });
      break;
    }
  }

  // 4. Strong wind gusts
  if (current.wind_gusts_10m > 40) {
    alerts.push({
      type: 'wind',
      text: `Wind gusts up to ${Math.round(current.wind_gusts_10m)} ${unitSymbol === '°F' ? 'mph' : 'km/h'}`,
    });
  }

  // 5. Thunderstorm upcoming
  for (let i = 0; i < Math.min(hourlyForecast.length, 12); i++) {
    const code = hourlyForecast[i].weatherCode;
    if (code >= 95) {
      const hoursAway = i + 1;
      alerts.push({
        type: 'thunderstorm',
        text: `Thunderstorm expected in ${hoursAway === 1 ? '1 hour' : `${hoursAway} hours`}`,
      });
      break;
    }
  }

  // 6. Air quality worsening — peak AQI >100 in next 48 hours
  if (aqi?.peak && aqi.peak.value > 100 && aqi.peak.value > aqi.value) {
    alerts.push({
      type: 'aqi',
      text: `Air quality worsening to ${aqi.peak.label} (AQI ${aqi.peak.value}) in ~${aqi.peak.hoursAway} hours`,
    });
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// NWS Severe Weather Alerts (api.weather.gov — US only, free, no key)
// ---------------------------------------------------------------------------

const NWS_SEVERITY_ORDER = { extreme: 0, severe: 1, moderate: 2, minor: 3, unknown: 4 };

async function fetchNwsAlerts(geo) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const url = `https://api.weather.gov/alerts/active?point=${geo.latitude},${geo.longitude}&status=actual`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'HomepageMD Weather Widget', Accept: 'application/geo+json' },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const data = await res.json();
    const features = data.features || [];
    if (features.length === 0) return null;

    return features.map((f) => {
      const p = f.properties;
      return {
        event: p.event || 'Weather Alert',
        severity: (p.severity || 'unknown').toLowerCase(),
        headline: p.headline || p.event || 'Weather alert in effect',
        description: p.description?.substring(0, 300) || '',
        url: p.web || null,
        expires: p.expires || null,
      };
    }).sort((a, b) => (NWS_SEVERITY_ORDER[a.severity] ?? 4) - (NWS_SEVERITY_ORDER[b.severity] ?? 4));
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Locale → unit detection
// ---------------------------------------------------------------------------

function isImperialLocale(locale) {
  if (!locale) return false;
  // US, Liberia, and Myanmar use Fahrenheit
  const region = locale.split('-').pop()?.toUpperCase();
  return ['US', 'LR', 'MM'].includes(region);
}
