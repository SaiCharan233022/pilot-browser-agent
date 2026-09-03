async function resolveLocation(query) {
  const clean = query.trim();

  // 1. Open-Meteo Geocoding
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(clean)}&count=1`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      const r = data.results[0];
      return { latitude: r.latitude, longitude: r.longitude, name: r.name, country: r.country };
    }
  } catch {}

  // 2. Photon OpenStreetMap Geocoding (high accuracy fallback)
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(clean)}&limit=1`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await res.json();
    if (data.features && data.features.length > 0) {
      const f = data.features[0];
      const [lon, lat] = f.geometry.coordinates;
      return { latitude: lat, longitude: lon, name: f.properties.name || clean, country: f.properties.country || '' };
    }
  } catch {}

  return null;
}

async function testCities() {
  const cities = ['New York', 'Sydney', 'Cairo', 'Berlin', 'Dubai', 'Singapore', 'Mumbai', 'Chicago'];
  for (const c of cities) {
    const loc = await resolveLocation(c);
    if (!loc) {
      console.log(c, 'FAILED');
      continue;
    }
    const wUrl = `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,weather_code&timezone=auto`;
    const wRes = await fetch(wUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const w = await wRes.json();
    console.log(`✅ ${loc.name}, ${loc.country}: ${w.current.temperature_2m}°C`);
  }
}

testCities();
