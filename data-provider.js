/* Optional geodata/routing boundary. The simulation remains offline by default. */
(function () {
  const region = {
    id: 'schleswig-holstein-nord',
    name: 'Schleswig-Holstein · Leitstellenbereich Nord',
    center: { lat: 54.32, lon: 10.12 },
    places: {
      Kiel: { lat: 54.3233, lon: 10.1228 },
      Rendsburg: { lat: 54.3064, lon: 9.6638 },
      Eckernförde: { lat: 54.4681, lon: 9.8370 },
      Neumünster: { lat: 54.0723, lon: 9.9812 },
      Plön: { lat: 54.1622, lon: 10.4233 },
      Preetz: { lat: 54.2354, lon: 10.2779 },
      Laboe: { lat: 54.4024, lon: 10.2269 },
      Gettorf: { lat: 54.3990, lon: 9.9831 },
      Kronshagen: { lat: 54.3357, lon: 10.0943 },
      Suchsdorf: { lat: 54.3533, lon: 10.0838 }
    }
  };
  const stations = [
    { id: 'fw-kiel-nord', name: 'Feuerwache Kiel-Nord', shortName: 'Nordwache', type: 'fire', place: 'Kiel', lat: 54.3533, lon: 10.0838 },
    { id: 'fw-rendsburg', name: 'Feuerwache Rendsburg', shortName: 'Westwache', type: 'fire', place: 'Rendsburg', lat: 54.3064, lon: 9.6638 },
    { id: 'fw-eckernfoerde', name: 'Feuerwache Eckernförde', shortName: 'Ostwache', type: 'fire', place: 'Eckernförde', lat: 54.4681, lon: 9.8370 },
    { id: 'rd-kiel', name: 'Rettungswache Kiel', shortName: 'Nordwache', type: 'med', place: 'Kiel', lat: 54.3233, lon: 10.1228 },
    { id: 'rd-preetz', name: 'Rettungswache Preetz', shortName: 'Südwache', type: 'med', place: 'Preetz', lat: 54.2354, lon: 10.2779 },
    { id: 'rd-kiel-klinikum', name: 'NEF UKSH Kiel', shortName: 'Klinikum', type: 'med', place: 'Kiel', lat: 54.3417, lon: 10.1222 },
    { id: 'pol-kiel-altstadt', name: 'Polizeirevier Kiel-Mitte', shortName: 'Altstadt', type: 'police', place: 'Kiel', lat: 54.3215, lon: 10.1390 },
    { id: 'pol-kiel-ost', name: 'Polizeirevier Kiel-Ost', shortName: 'Ostpark', type: 'police', place: 'Kiel', lat: 54.3150, lon: 10.1770 },
    { id: 'pol-rendsburg', name: 'Polizeirevier Rendsburg', shortName: 'Westend', type: 'police', place: 'Rendsburg', lat: 54.3064, lon: 9.6638 },
    { id: 'thw-rendsburg', name: 'THW Ortsverband Rendsburg', shortName: 'Industrie', type: 'rescue', place: 'Rendsburg', lat: 54.2920, lon: 9.6860 },
    { id: 'thw-kiel', name: 'THW Ortsverband Kiel', shortName: 'Flughafen', type: 'rescue', place: 'Kiel', lat: 54.3790, lon: 10.1450 }
  ];
  const hospitals = [
    { id: 'uksh-kiel', name: 'Universitätsklinikum Schleswig-Holstein · Campus Kiel', place: 'Kiel', lat: 54.3417, lon: 10.1222, capabilities: ['trauma', 'stroke', 'cardiac'] },
    { id: 'imland-rendsburg', name: 'imland Klinik Rendsburg', place: 'Rendsburg', lat: 54.3007, lon: 9.6671, capabilities: ['trauma', 'cardiac'] },
    { id: 'klinik-preetz', name: 'Klinik Preetz', place: 'Preetz', lat: 54.2354, lon: 10.2779, capabilities: ['trauma'] }
  ];
  let external = null;
  let routing = { mode: 'offline', endpoint: '' };
  const toRad = value => value * Math.PI / 180;
  function distanceKm(a, b) {
    const lat = toRad(b.lat - a.lat), lon = toRad(b.lon - a.lon);
    const h = Math.sin(lat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(lon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
  function coordinates(place) { return region.places[place] || region.center; }
  function route(from, to, trafficFactor = 1) {
    const km = distanceKm(from, to);
    return { distanceKm: Math.round(km * 10) / 10, etaMinutes: Math.max(2, Math.round((km / 0.72) * trafficFactor)), source: routing.mode };
  }
  async function routeAsync(from, to, trafficFactor = 1) {
    const fallback = route(from, to, trafficFactor);
    if (routing.mode !== 'external') return fallback;
    try {
      const url = `${routing.endpoint.replace(/\/$/, '')}?from=${encodeURIComponent(`${from.lat},${from.lon}`)}&to=${encodeURIComponent(`${to.lat},${to.lon}`)}`;
      const response = await fetch(url, { credentials: 'omit' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      const first = result.routes?.[0];
      if (!first) throw new Error('Keine Route');
      return { distanceKm: Math.round((first.distance / 1000) * 10) / 10, etaMinutes: Math.max(1, Math.ceil(first.duration / 60)), source: 'external' };
    } catch (_) {
      return { ...fallback, source: 'offline-fallback' };
    }
  }
  async function loadGeoJSON(url) {
    if (!url) return { loaded: false, reason: 'Keine optionale GeoJSON-Quelle konfiguriert.' };
    try {
      const response = await fetch(url, { credentials: 'omit' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      external = await response.json();
      return { loaded: true, featureCount: Array.isArray(external.features) ? external.features.length : 0 };
    } catch (error) {
      external = null;
      return { loaded: false, reason: `Offline-Fallback (${error.message})` };
    }
  }
  window.LeitstelleDataProvider = {
    region, stations, hospitals,
    get source() { return external ? 'Konfiguriertes GeoJSON' : 'Offline-Saatdaten (OSM-kompatibel)' },
    get routingSource() { return routing.mode === 'offline' ? 'Offline-Luftlinie · ETA-Schätzung' : `Externes Routing · ${routing.endpoint}`; },
    coordinates, distanceKm, route, routeAsync,
    station(id) { return stations.find(item => item.id === id); },
    hospital(id) { return hospitals.find(item => item.id === id); },
    nearestAvailable(units, type, target) {
      return units.filter(unit => unit.type === type && unit.status === 'Bereit')
        .map(unit => ({ unit, route: route(this.station(unit.stationId) || region.center, target) }))
        .sort((a, b) => a.route.distanceKm - b.route.distanceKm);
    },
    configureRouting(endpoint) {
      routing = endpoint ? { mode: 'external', endpoint } : { mode: 'offline', endpoint: '' };
    },
    loadGeoJSON
  };
}());
