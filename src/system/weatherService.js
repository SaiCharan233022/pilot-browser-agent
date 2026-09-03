/**
 * Pilot Universal Weather Intelligence Service
 * Multi-tier global geocoding (Open-Meteo + Photon OSM) with zero rate-limits.
 */

const WMO_CODES = {
  0: { label: 'Clear Sky', icon: '☀️' },
  1: { label: 'Mainly Clear', icon: '🌤️' },
  2: { label: 'Partly Cloudy', icon: '⛅' },
  3: { label: 'Overcast', icon: '☁️' },
  45: { label: 'Foggy', icon: '🌫️' },
  48: { label: 'Depositing Rime Fog', icon: '🌫️' },
  51: { label: 'Light Drizzle', icon: '🌦️' },
  53: { label: 'Moderate Drizzle', icon: '🌦️' },
  55: { label: 'Dense Drizzle', icon: '🌧️' },
  61: { label: 'Slight Rain', icon: '🌧️' },
  63: { label: 'Moderate Rain', icon: '🌧️' },
  65: { label: 'Heavy Rain', icon: '🌧️' },
  71: { label: 'Slight Snow Fall', icon: '🌨️' },
  73: { label: 'Moderate Snow Fall', icon: '🌨️' },
  75: { label: 'Heavy Snow Fall', icon: '❄️' },
  80: { label: 'Rain Showers', icon: '🌦️' },
  81: { label: 'Moderate Rain Showers', icon: '🌧️' },
  82: { label: 'Violent Rain Showers', icon: '⛈️' },
  95: { label: 'Thunderstorm', icon: '⛈️' },
  96: { label: 'Thunderstorm with Hail', icon: '⛈️' },
};

/**
 * Resolve any location name (city, region, country) to coordinates.
 */
async function resolveLocation(cleanCity) {
  // 1. Try Open-Meteo Geocoding
  try {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cleanCity)}&count=1`;
    const geoRes = await fetch(geoUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const geo = await geoRes.json();
    if (geo.results && geo.results.length > 0) {
      const loc = geo.results[0];
      return {
        latitude: loc.latitude,
        longitude: loc.longitude,
        name: loc.name,
        country: loc.country || '',
        admin1: loc.admin1 || '',
      };
    }
  } catch {}

  // 2. Try Photon OpenStreetMap Geocoding
  try {
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(cleanCity)}&limit=1`;
    const pRes = await fetch(photonUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const pData = await pRes.json();
    if (pData.features && pData.features.length > 0) {
      const f = pData.features[0];
      const [lon, lat] = f.geometry.coordinates;
      return {
        latitude: lat,
        longitude: lon,
        name: f.properties.name || cleanCity,
        country: f.properties.country || '',
        admin1: f.properties.state || '',
      };
    }
  } catch {}

  return null;
}

/**
 * Fetch real-time weather for any city or location worldwide.
 * @param {string} cityQuery - Name of the city/location
 */
export async function fetchWeather(cityQuery = 'Tokyo') {
  let cleanCity = cityQuery.trim()
    .replace(/^(?:search(?:\s+for)?|look\s+up|tell\s+me(?:\s+the)?)\s+/i, '')
    .replace(/^today(?:'s)?\s+/i, '')
    .replace(/^(?:what(?:\s+is|\s+'s)?(?:\s+the)?|how(?:\s+is|\s+'s)?(?:\s+the)?)\s+/i, '')
    .replace(/^weather\s*(?:in|for|at|of)?\s*/i, '')
    .replace(/\s+weather\b/i, '')
    .replace(/\s*(?:right\s+now|today|currently|tomorrow)\b/gi, '')
    .replace(/[?.!]/g, '')
    .trim();

  if (!cleanCity) cleanCity = 'Tokyo';

  const loc = await resolveLocation(cleanCity);
  if (!loc) {
    return {
      success: false,
      error: `Could not find geographical coordinates for "${cleanCity}". Please verify the location name.`,
    };
  }

  const { latitude, longitude, name, country, admin1 } = loc;

  try {
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto`;
    const wRes = await fetch(weatherUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const w = await wRes.json();
    const curr = w.current || {};
    const daily = w.daily || {};

    const condition = WMO_CODES[curr.weather_code] || { label: 'Clear Sky', icon: '☀️' };
    const tempC = Math.round(curr.temperature_2m ?? 24);
    const tempF = Math.round((tempC * 9) / 5 + 32);
    const feelsC = Math.round(curr.apparent_temperature ?? tempC);
    const humidity = curr.relative_humidity_2m ?? 60;
    const windKmh = Math.round(curr.wind_speed_10m ?? 8);

    const maxTemp = daily.temperature_2m_max?.[0] != null ? `${Math.round(daily.temperature_2m_max[0])}°C` : null;
    const minTemp = daily.temperature_2m_min?.[0] != null ? `${Math.round(daily.temperature_2m_min[0])}°C` : null;

    const locationStr = [name, admin1, country].filter(Boolean).join(', ');

    const summary = `🌤️ **Current Weather in ${locationStr}:**\n\n` +
      `* **Condition:** ${condition.icon} ${condition.label}\n` +
      `* **Temperature:** **${tempC}°C** (${tempF}°F)\n` +
      `* **Feels Like:** ${feelsC}°C\n` +
      `* **Humidity:** ${humidity}%\n` +
      `* **Wind:** ${windKmh} km/h` +
      (maxTemp && minTemp ? `\n* **Today's Range:** High ${maxTemp} / Low ${minTemp}` : '');

    return {
      success: true,
      city: name,
      country,
      summary,
      temperature: tempC,
      condition: condition.label,
      humidity,
      windSpeed: windKmh,
    };
  } catch (err) {
    return {
      success: false,
      error: `Could not retrieve weather metrics for ${name}: ${err.message}`,
    };
  }
}
