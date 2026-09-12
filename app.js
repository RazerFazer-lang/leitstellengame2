/* Leitstelle Nord - self contained browser simulation. */
const DATA = window.LeitstelleDataProvider;
const DISTRICTS = {
  Kiel:[50,43], Rendsburg:[16,48], Eckernförde:[73,18], Neumünster:[27,83], Plön:[72,72],
  Preetz:[64,82], Laboe:[78,33], Gettorf:[61,27], Kronshagen:[45,47], Suchsdorf:[43,35]
};
const TYPES = {
  fire:{label:'Feuerwehr', color:'fire', words:['Gebäudebrand','Rauchentwicklung','Kfz-Brand']},
  med:{label:'Rettungsdienst', color:'med', words:['Herzstillstand','Sturzverletzung','Atemnot']},
  police:{label:'Polizei', color:'police', words:['Verkehrsunfall','Gewalttat','Einbruch']},
  rescue:{label:'Technische Hilfe', color:'rescue', words:['Eingeklemmte Person','Sturmschaden','Gefahrgutlage']}
};
const FLEET = [
  ['F-11','fire','HLF 20','Nordwache','Brandbekämpfung, Atemschutz','fw-kiel-nord'],['F-21','fire','DLK 23','Westwache','Drehleiter, Höhenrettung','fw-rendsburg'],['F-31','fire','LF 20','Ostwache','Brandbekämpfung','fw-eckernfoerde'],
  ['R-11','med','RTW','Nordwache','Notfallmedizin, Transport','rd-kiel'],['R-12','med','RTW','Südwache','Notfallmedizin, Transport','rd-preetz'],['R-21','med','NEF','Klinikum','Notarzt, Reanimation','rd-kiel-klinikum'],
  ['P-11','police','Streifenwagen','Altstadt','Verkehr, Fahndung','pol-kiel-altstadt'],['P-12','police','Streifenwagen','Ostpark','Verkehr, Fahndung','pol-kiel-ost'],['P-21','police','Einsatzwagen','Westend','Einsatzleitung, Gewaltlage','pol-rendsburg'],
  ['T-11','rescue','RW','Industrie','Technische Rettung, Verkehrsunfall','thw-rendsburg'],['T-21','rescue','GW-Technik','Flughafen','Gefahrgut, Umwelt','thw-kiel']
];
const WEATHER = [
  {name:'Klar', traffic:'frei', factor:1, icon:'☀'}, {name:'Bewölkt', traffic:'normal', factor:1.1, icon:'☁'},
  {name:'Regen', traffic:'zäh', factor:1.35, icon:'☂'}, {name:'Nebel', traffic:'zäh', factor:1.5, icon:'◌'},
  {name:'Schneefall', traffic:'kritisch', factor:1.7, icon:'❄'}
];
const KEY = 'leitstelle-nord-save-v3';
const SCHEMA_VERSION = 4;
const EVENTS = Object.freeze({ CALL_RECEIVED:'call.received', TRIAGED:'incident.triaged', DISPATCHED:'units.dispatched', STATUS:'incident.status', AUTOSAVE:'state.autosave', ERROR:'system.error' });
const eventBus = (() => {
  const listeners = new Map();
  return { on(type, handler) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(handler); return () => listeners.get(type)?.delete(handler); },
    emit(type, payload) { listeners.get(type)?.forEach(handler => { try { handler(payload); } catch (_) {} }); } };
})();
const emptyState = () => ({
  schemaVersion:SCHEMA_VERSION, minute:360, score:0, closed:0, calls:0, answered:0, answerSeconds:0, selected:null, filter:'all', started:false,
  weather:0, incidents:[], logs:[], events:[], shiftStartedAt:null, units:FLEET.map(([call,type,model,base,capability,stationId])=>({call,type,model,base,capability,stationId,status:'Bereit',incidentId:null,eta:0}))
});
let state = emptyState();
let sound = true;
let toastTimer;
let simulationStarted = false;
let tickTimer;
let leafletMap = null;
let leafletLayers = null;
let tileErrors = 0;
let tileFallbackTimer = null;
let mapUsesFallback = false;
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const clock = () => `${String(Math.floor(state.minute / 60) % 24).padStart(2,'0')}:${String(state.minute % 60).padStart(2,'0')}`;
['call.received','incident.triaged','units.dispatched','incident.status'].forEach(type => eventBus.on(type, payload => {
  state.events.push({type, minute:state.minute, incidentId:payload?.incident?.id || payload?.id || null});
  state.events=state.events.slice(-100);
}));
const typeName = type => TYPES[type]?.label || type;
const priorityName = value => value === 1 ? 'P1 · Lebensgefahr' : value === 2 ? 'P2 · Dringend' : 'P3 · Normal';
const stateName = value => ({new:'Neu · Triage', triage:'Triage abgeschlossen', dispatched:'Dispo bestätigt', enroute:'Anfahrt', scene:'Vor Ort', transport:'Transport', returning:'Rückfahrt', closed:'Abgeschlossen'}[value] || value);
const log = text => { state.logs.unshift({time:clock(),text}); state.logs=state.logs.slice(0,24); };
const save = () => { try { state.schemaVersion=SCHEMA_VERSION; state.savedAt=new Date().toISOString(); localStorage.setItem(KEY, JSON.stringify(state)); eventBus.emit(EVENTS.AUTOSAVE, state.savedAt); } catch (error) { eventBus.emit(EVENTS.ERROR, error); notify('Autospeichern nicht möglich – Browser-Speicher prüfen.'); } };
const notify = text => { const node=$('toast'); node.textContent=text; node.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>node.classList.remove('show'),3200); };
function tone(frequency=640) {
  if (!sound) return;
  const C=window.AudioContext||window.webkitAudioContext; if (!C) return;
  const ctx=new C(), osc=ctx.createOscillator(), gain=ctx.createGain();
  osc.frequency.value=frequency; osc.type='sine'; gain.gain.value=.035; gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.22);
  osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime+.22);
}
function makeIncident(overrides={}) {
  const type=overrides.type || Object.keys(TYPES)[Math.floor(Math.random()*4)];
  const district=overrides.district || Object.keys(DISTRICTS)[Math.floor(Math.random()*10)];
  const priority=Number(overrides.priority || (Math.random()<.25?1:Math.random()<.65?2:3));
  const label=overrides.label || TYPES[type].words[Math.floor(Math.random()*TYPES[type].words.length)];
  return {id:`E-${Date.now().toString(36)}-${Math.random().toString(16).slice(2,6)}`,type,label,priority,district,
    location:overrides.location || `${district}, ${['Hauptstraße','Bahnhofstraße','Ring','Parkweg'][Math.floor(Math.random()*4)]}`, caller:overrides.caller || 'Unbekannt',
    details:overrides.details || 'Lage wird durch Anrufende weiter erkundet.',status:'new',created:state.minute,
    age:0, eta:0, units:[], followUp:false, escalated:false, persons:Number(overrides.persons||1),
    hazard:overrides.hazard||'none', lastUpdate:state.minute,
    coordinates: overrides.coordinates || DATA.coordinates(district), receivedAt: overrides.receivedAt || clock(),
    channel: overrides.channel || 'phone', callback: overrides.callback || 'Nicht übermittelt', locationAccuracy: overrides.locationAccuracy || 'Ortsteil bestätigt',
    hospitalId: overrides.hospitalId || null, hospitalCapability: overrides.hospitalCapability || (type === 'med' ? (priority === 1 ? 'cardiac' : 'trauma') : null),
    agencies: overrides.agencies || recommendationsFor(type, priority, overrides.persons, overrides.hazard), failure: null};
}
function recommendationsFor(type, priority, persons=1, hazard='none') {
  const needed = type==='med'?['med']:type==='fire'?['fire']:type==='police'?['police']:['rescue'];
  if (priority===1 || Number(persons)>1) needed.push('med');
  if (hazard==='hazard') needed.push('fire');
  if (hazard==='weapon') needed.push('police');
  return [...new Set(needed)];
}
function seed() {
  state.incidents=[makeIncident({type:'med',priority:1,district:'Kiel',label:'Herzstillstand',location:'UKSH Campus Kiel, Notaufnahme',details:'Reanimation läuft, Ersthelfer vor Ort.',persons:1}),makeIncident({type:'fire',priority:2,district:'Rendsburg',label:'Rauchentwicklung',details:'Dichter Rauch aus Lagerhalle, keine Personen bestätigt.',hazard:'hazard'}),makeIncident({type:'police',priority:3,district:'Kiel',label:'Verkehrsunfall',details:'Zwei Fahrzeuge, Blechschaden, Verkehr stockt.',persons:2})];
  state.calls=state.incidents.length; state.selected=state.incidents[0].id; state.logs=[]; log('Schicht übernommen. Drei Lagen warten auf Erstbewertung.'); save();
}
function recommendations(incident) {
  return incident.agencies?.length ? incident.agencies : recommendationsFor(incident.type, incident.priority, incident.persons, incident.hazard);
}
function available(type) { return state.units.filter(unit=>unit.type===type && unit.status==='Bereit'); }
function renderQueue() {
  const list=$('incidentList');
  let items=state.incidents.filter(i=>i.status!=='closed');
  if(state.filter==='priority') items.sort((a,b)=>a.priority-b.priority||b.age-a.age);
  else if(state.filter==='mine') items=items.filter(i=>i.units.length);
  else items.sort((a,b)=>a.priority-b.priority||b.age-a.age);
  $('queueCounter').textContent=state.incidents.filter(i=>i.status!=='closed').length;
  list.innerHTML=items.length ? items.map(i=>`<article class="incident ${i.id===state.selected?'active':''}" data-id="${i.id}" data-priority="${i.priority}">
    <div class="incident-top"><div class="incident-title"><i class="type-dot ${TYPES[i.type].color}"></i>${esc(i.label)}</div><span class="priority p${i.priority}">P${i.priority}</span></div>
    <div class="incident-meta">${esc(i.id)} · ${esc(i.district)} · ${i.age} min</div><p class="incident-summary">${esc(i.details)}</p><span class="state">${stateName(i.status)}${i.units.length?` · ${i.units.length} Einh.`:''}</span></article>`).join('') :
    '<div class="detail-empty"><div><strong>Keine offenen Einsätze</strong><br><span>Die Lage ist ruhig. Neue Notrufe erscheinen automatisch.</span></div></div>';
  list.querySelectorAll('[data-id]').forEach(node=>node.addEventListener('click',()=>{state.selected=node.dataset.id;render();}));
}
function renderDetails() {
  const i=state.incidents.find(item=>item.id===state.selected) || state.incidents.find(item=>item.status!=='closed');
  if(!i){ $('incidentDetails').innerHTML='<div class="detail-empty"><div><strong>Bereit für den nächsten Notruf</strong><br><span>Wähle einen Einsatz aus der Queue.</span></div></div>'; return; }
  state.selected=i.id;
  const rec=recommendations(i), assigned=i.units.map(id=>state.units.find(u=>u.call===id)).filter(Boolean);
  const candidates=state.units.filter(u=>u.status==='Bereit'||i.units.includes(u.call));
  const actionDisabled=i.status==='closed'||i.status==='returning'||i.status==='transport';
  $('incidentDetails').innerHTML=`<section class="detail-card">
    <div class="detail-header"><div><p class="eyebrow">${esc(i.id)} · ${priorityName(i.priority)}</p><h2>${esc(i.label)}</h2><span class="state">${stateName(i.status)}</span></div><i class="type-dot ${TYPES[i.type].color}"></i></div>
    <div class="detail-facts"><div class="fact"><span>Ort</span><strong>${esc(i.location)}</strong></div><div class="fact"><span>Anrufer/in · Rückruf</span><strong>${esc(i.caller)} · ${esc(i.callback)}</strong></div><div class="fact"><span>Ortsteil · Eingang</span><strong>${esc(i.district)} · ${esc(i.receivedAt || clockFor(i.created))}</strong></div><div class="fact"><span>Betroffene · Einheiten</span><strong>${i.persons} · ${assigned.length||'—'}</strong></div><div class="fact"><span>Annahmeweg · Genauigkeit</span><strong>${i.channel==='phone'?'Telefon 112':i.channel==='app'?'Notruf-App':'Funk'} · ${esc(i.locationAccuracy)}</strong></div><div class="fact"><span>Routing / ETA</span><strong>${assigned.length ? `${assigned.map(u=>u.route?.distanceKm ? `${u.route.distanceKm} km` : '—').join(', ')} · ${i.eta || '—'} min` : 'Noch nicht disponiert'}</strong></div></div>
    <p class="detail-description">${esc(i.details)}</p>
    ${i.type==='med' ? `<label class="hospital-picker"><span class="eyebrow">Zielklinik · ${esc(i.hospitalCapability || 'trauma')}</span><select class="hospital-select"><option value="">Automatisch nach Eignung</option>${DATA.suitableHospitals(i).map(item=>`<option value="${esc(item.hospital.id)}" ${i.hospitalId===item.hospital.id?'selected':''}>${esc(item.hospital.name)} · ${item.route.etaMinutes} min · ${item.hospital.beds} Betten</option>`).join('')}</select></label>` : ''}
    <div class="recommendation"><strong>Vorschlag Leitstelle</strong><br>${rec.map(typeName).join(' + ')}${i.priority===1?' · Sonderrechte anfordern':''}${i.hazard!=='none'?` · ${i.hazard==='weapon'?'Polizeischutz':'Gefahrgut beachten'}`:''}</div>
    ${i.status==='new'?'<div class="triage-box"><strong>Erstbewertung ausstehend</strong><br><span>Angaben prüfen, Rückruf sichern und Lagebild bestätigen.</span></div>':''}
    <div class="unit-picker"><p class="eyebrow">Manuelle Disposition · freie Einheiten</p>${candidates.length?candidates.map(u=>`<label class="unit-option"><input type="checkbox" value="${u.call}" ${i.units.includes(u.call)?'checked':''}><span><strong>${u.call}</strong> · ${u.model}</span><small>${u.base}</small></label>`).join(''):'<span class="incident-meta">Keine passenden Einheiten frei.</span>'}</div>
    ${i.status==='new'?'<button class="primary triage-action">Lage bewerten & disponierbar machen</button>':''}
    <button class="primary dispatch-action" ${actionDisabled||i.status==='new'?'disabled':''}>${i.units.length?'Disposition aktualisieren':'Einheiten alarmieren'} <kbd>1–4</kbd></button>
    <div class="detail-actions"><button class="ghost follow-up" ${actionDisabled?'disabled':''}>＋ Rückfrage / Folgeeinsatz</button><button class="ghost escalate danger" ${i.escalated||actionDisabled?'disabled':''}>⚠ Eskalieren</button></div>
  </section>`;
  $('incidentDetails').querySelector('.dispatch-action')?.addEventListener('click',()=>dispatch(i));
  $('incidentDetails').querySelector('.hospital-select')?.addEventListener('change',event=>{i.hospitalId=event.currentTarget.value||null;save();render();});
  $('incidentDetails').querySelector('.triage-action')?.addEventListener('click',()=>triage(i));
  $('incidentDetails').querySelector('.follow-up')?.addEventListener('click',()=>followUp(i));
  $('incidentDetails').querySelector('.escalate')?.addEventListener('click',()=>escalate(i));
}
function triage(i){
  i.status='triage'; i.lastUpdate=state.minute; state.answered++; state.answerSeconds+=Math.max(0,i.age*60);
  log(`${i.id}: Erstbewertung abgeschlossen · ${priorityName(i.priority)} · ${i.persons} Betroffene.`);
  eventBus.emit(EVENTS.TRIAGED, i); notify(`${i.id} ist disponierbar.`); tone(740); save(); render();
}
async function dispatch(incident) {
  if(incident.status==='new'){notify('Erstbewertung zuerst abschließen.');return;}
  let selected=[...document.querySelectorAll('.unit-option input:checked')].map(input=>input.value);
  if(!selected.length){
    recommendations(incident).forEach(type=>{const nearest=DATA.nearestAvailable(state.units,type,incident.coordinates)[0];if(nearest)selected.push(nearest.unit.call);});
    if(!selected.length){notify('Keine passende Einheit verfügbar.'); return;}
    notify('Nächstgelegene verfügbare Fachkomponenten vorgeschlagen.');
  }
  incident.units.forEach(call=>{if(!selected.includes(call)){const unit=state.units.find(u=>u.call===call);if(unit){unit.status='Bereit';unit.incidentId=null;}}});
  const missing=recommendations(incident).filter(type=>!selected.some(call=>state.units.find(u=>u.call===call)?.type===type));
  try {
    for(const call of selected){const unit=state.units.find(u=>u.call===call);if(unit&& (unit.status==='Bereit'||incident.units.includes(call))){const route=await DATA.routeAsync(DATA.station(unit.stationId)||DATA.region.center,incident.coordinates,WEATHER[state.weather].factor,{hour:Math.floor(state.minute/60)%24,weather:WEATHER[state.weather].name});unit.status='Anfahrt';unit.incidentId=incident.id;unit.eta=route.etaMinutes;unit.route=route;}}
  } catch (error) {
    incident.failure='Routing fehlgeschlagen – lokale ETA verwendet';
    eventBus.emit(EVENTS.ERROR,error);
    log(`${incident.id}: ${incident.failure}.`);
  }
  incident.units=selected; incident.status='enroute'; incident.eta=Math.max(...selected.map(call=>state.units.find(u=>u.call===call)?.eta||4));
  incident.lastUpdate=state.minute; state.score+=missing.length?-4:(incident.priority===1?18:10); eventBus.emit(EVENTS.DISPATCHED,{incident,selected,missing}); log(`${selected.join(', ')} für ${incident.id} alarmiert · Anfahrt nach ${incident.district}.${missing.length?' Fehlende Fachkomponente: '+missing.map(typeName).join(', '):''}`); notify(missing.length?'Disposition mit Lücke bestätigt.':'Disposition bestätigt.'); tone(820); save(); render();
}
function followUp(i){i.followUp=true;i.lastUpdate=state.minute;i.details+=' Rückmeldung angefordert.';log(`Rückfrage bei ${i.id} gestellt. Lage wird aktualisiert.`);notify('Rückfrage an Einsatzstelle gesendet.');save();render();}
function escalate(i){i.escalated=true;i.priority=1;log(`${i.id} hochgestuft: Einsatzleitung und Sonderbedarf informiert.`);notify('Einsatz auf P1 eskaliert.');tone(980);save();render();}
function clockFor(minute){return `${String(Math.floor(minute/60)%24).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;}
function renderResources(){
  const groups=Object.keys(TYPES);
  $('resourceGrid').innerHTML=groups.map(type=>{const all=state.units.filter(u=>u.type===type),free=all.filter(u=>u.status==='Bereit').length;
    return `<div class="resource-card"><div class="resource-card-top"><strong><i class="type-dot ${TYPES[type].color}"></i> ${typeName(type)}</strong><span class="availability ${free<all.length?'busy':''}">${free}/${all.length} frei</span></div><div class="unit-list">${all.map(u=>`<span class="unit-chip" title="${esc(u.model)} · ${esc(u.base)} · ${esc(u.capability)}">${u.call} · ${u.status}</span>`).join('')}</div></div>`;}).join('');
  $('freeCount').textContent=state.units.filter(u=>u.status==='Bereit').length;
}
function renderLog(){$('radioLog').innerHTML=state.logs.map(entry=>`<li><time>${entry.time}</time>${esc(entry.text)}</li>`).join('');$('logCount').textContent=state.logs.length;}
function mapMarker(className, label) {
  return L.divIcon({className:'dispatch-marker-wrap', html:`<span class="dispatch-marker ${className}">${esc(label)}</span>`, iconSize:[26,26], iconAnchor:[13,13]});
}
function useMapFallback(reason) {
  mapUsesFallback = true;
  if (leafletMap) {
    leafletMap.remove();
    leafletMap = null;
    leafletLayers = null;
  }
  renderMapFallback();
  $('dataStatus').innerHTML = '<i></i> OFFLINE-KARTE';
  $('mapSource').textContent = `Kartengrundlage: Offline-Saatdaten · ${reason || 'Leaflet/Kacheln nicht verfügbar'} · Routing: lokale ETA-Schätzung`;
}
function initLeafletMap() {
  if (leafletMap || mapUsesFallback) return;
  if (!window.L || !window.L.map) {
    useMapFallback('Leaflet nicht geladen');
    return;
  }
  try {
    leafletMap = L.map('map', {zoomControl:true, attributionControl:true}).setView([DATA.region.center.lat, DATA.region.center.lon], 10);
    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>'
    }).addTo(leafletMap);
    leafletLayers = {tiles, incidents:L.layerGroup().addTo(leafletMap), units:L.layerGroup().addTo(leafletMap), places:L.layerGroup().addTo(leafletMap), routes:L.layerGroup().addTo(leafletMap)};
    tiles.on('tileload', () => {
      tileErrors = 0;
      $('dataStatus').innerHTML = '<i></i> OSM-KARTE';
      $('mapSource').textContent = `Kartengrundlage: OpenStreetMap · Routing: ${DATA.routingSource} · © OpenStreetMap contributors`;
    });
    tiles.on('tileerror', () => {
      tileErrors++;
      if (tileErrors >= 3 && !tileFallbackTimer) {
        tileFallbackTimer = setTimeout(() => { tileFallbackTimer = null; if (tileErrors >= 3) useMapFallback('OSM-Kacheln nicht erreichbar'); }, 1800);
      }
    });
    leafletMap.on('load', () => leafletMap.invalidateSize());
  } catch (_) {
    useMapFallback('Leaflet konnte nicht initialisiert werden');
  }
}
function renderMapFallback() {
  const names=Object.keys(DISTRICTS);
  const mapPoint = name => DISTRICTS[name] || DISTRICTS.Kiel;
  const districts=names.map(name=>{const [x,y]=DISTRICTS[name];return `<g><rect class="district ${state.incidents.some(i=>i.district===name&&i.id===state.selected)?'active':''}" data-district="${name}" x="${x-8}" y="${y-8}" width="16" height="16" rx="4"/><text class="district-label" x="${x+12}" y="${y+4}">${name}</text></g>`;}).join('');
  const stationPins=DATA.stations.map(station=>{const place=station.place, [x,y]=DISTRICTS[place]||[50,50];return `<circle class="station-pin ${station.type}" cx="${x}" cy="${y}" r="2.5"><title>${esc(station.name)} · ${esc(station.shortName)}</title></circle>`;}).join('');
  const hospitalPins=DATA.hospitals.map(hospital=>{const [x,y]=DISTRICTS[hospital.place]||[50,50];return `<rect class="hospital-pin" x="${x-2}" y="${y-2}" width="4" height="4"><title>${esc(hospital.name)}</title></rect>`;}).join('');
  const pins=state.incidents.filter(i=>i.status!=='closed').map(i=>{const [x,y]=mapPoint(i.district);return `<g class="map-pin" data-id="${i.id}"><circle cx="${x}" cy="${y}" r="6" fill="${i.type==='fire'?'#fb856b':i.type==='med'?'#53d4df':i.type==='police'?'#729eff':'#ad9cff'}"/><text x="${x-4}" y="${y+4}" fill="#061018" font-size="8" font-weight="800">${i.priority}</text></g>`;}).join('');
  const unitPins=state.units.filter(u=>u.status!=='Bereit').map(u=>{const i=state.incidents.find(item=>item.id===u.incidentId);if(!i)return '';const [x,y]=mapPoint(i.district);const offset=(u.call.charCodeAt(2)%5)-2;return `<circle class="unit-pin" cx="${x+offset}" cy="${y+offset}" r="3"/>`;}).join('');
  $('map').innerHTML=`<svg viewBox="0 0 100 100" role="img" aria-label="Offline-Regionalkarte Schleswig-Holstein"><path d="M0 52 Q20 39 35 51 T70 42 T100 50 M5 77 Q30 60 52 70 T100 63" fill="none" class="map-grid"/><path d="M12 0v100M35 0v100M58 0v100M81 0v100M0 25h100M0 50h100M0 75h100" class="map-grid"/>${districts}${stationPins}${hospitalPins}${pins}${unitPins}</svg>`;
  $('map').querySelectorAll('[data-id]').forEach(n=>n.addEventListener('click',()=>{state.selected=n.dataset.id;render();}));
  $('map').querySelectorAll('[data-district]').forEach(n=>n.addEventListener('click',()=>{const i=state.incidents.find(item=>item.district===n.dataset.district&&item.status!=='closed');if(i){state.selected=i.id;render();}}));
}
  function renderLeafletMap() {
    if (!leafletMap || !leafletLayers) return;
    leafletLayers.incidents.clearLayers(); leafletLayers.units.clearLayers(); leafletLayers.places.clearLayers(); leafletLayers.routes.clearLayers();
    DATA.stations.forEach(station => L.marker([station.lat, station.lon], {icon:mapMarker(`station-${station.type}`, '●'), title:station.name})
      .bindTooltip(`${esc(station.name)} · ${esc(station.shortName)}`).addTo(leafletLayers.places));
    DATA.hospitals.forEach(hospital => L.marker([hospital.lat, hospital.lon], {icon:mapMarker('hospital', '✚'), title:hospital.name})
      .bindTooltip(esc(hospital.name)).addTo(leafletLayers.places));
    state.incidents.filter(i=>i.status!=='closed').forEach(i => {
      const selected = i.id === state.selected;
      const marker = L.marker([i.coordinates.lat, i.coordinates.lon], {icon:mapMarker(`incident-${i.type}${selected?' selected':''}`, i.priority), title:i.label})
        .bindPopup(`<strong>${esc(i.label)}</strong><br>${esc(i.location)}<br>${priorityName(i.priority)} · ${stateName(i.status)}`);
      marker.on('click', () => { state.selected=i.id; render(); });
      marker.addTo(leafletLayers.incidents);
    });
    state.units.filter(u=>u.status!=='Bereit').forEach(u => {
      const incident=state.incidents.find(i=>i.id===u.incidentId), station=DATA.station(u.stationId);
      if (!incident || !station) return;
      L.marker([incident.coordinates.lat, incident.coordinates.lon], {icon:mapMarker(`unit-${u.type}`, '◆'), title:u.call})
        .bindTooltip(`${esc(u.call)} · ${esc(u.status)}`).addTo(leafletLayers.units);
      L.polyline([[station.lat,station.lon],[incident.coordinates.lat,incident.coordinates.lon]], {color:'#53d4df',weight:3,dashArray:'7 8',opacity:.8})
        .bindTooltip(`${esc(u.call)} · ${u.route?.distanceKm ?? '—'} km · ETA ${u.eta || '—'} min`).addTo(leafletLayers.routes);
    });
  }
  function renderMap() {
    initLeafletMap();
    if (mapUsesFallback) { renderMapFallback(); return; }
    renderLeafletMap();
  }
function render(){
  $('clock').textContent=clock(); const hour=Math.floor(state.minute/60)%24;
  $('shift').textContent=`${hour<14?'Frühdienst':hour<22?'Spätdienst':'Nachtdienst'} · ${Math.floor((state.minute-360)/60)}:${String((state.minute-360)%60).padStart(2,'0')}`;
  const weather=WEATHER[state.weather];$('conditions').textContent=`${weather.icon} ${weather.name} · Verkehr ${weather.traffic}`;$('score').textContent=state.score;
  const open=state.incidents.filter(i=>i.status!=='closed').length;$('openCount').textContent=open;$('closedCount').textContent=state.closed;$('responseRate').textContent=`${state.calls?Math.round(state.answered/state.calls*100):100}%`;
  const avg=state.answered?Math.round(state.answerSeconds/state.answered):0;$('answerTime').textContent=`${Math.floor(avg/60)}:${String(avg%60).padStart(2,'0')}`;
  renderQueue();renderDetails();renderResources();renderLog();renderMap();$('soundToggle').textContent=sound?'Ton an':'Ton aus';
}
function tick(){
  state.minute++; if(state.minute%37===0) newAutoCall();
  if(state.minute%90===0){state.weather=(state.weather+1)%WEATHER.length;log(`Wetterlage: ${WEATHER[state.weather].name}. Verkehrslage ${WEATHER[state.weather].traffic}.`);}
  state.incidents.forEach(i=>{if(i.status==='closed')return;i.age++;
    if(!i.units.length && i.age>8 && !i.escalated){i.escalated=true;i.priority=Math.max(1,i.priority-1);state.score=Math.max(0,state.score-6);log(`${i.id}: Keine Einheit verfügbar, Priorität angehoben.`);tone(980);}
    if(i.status==='enroute'){i.eta--;i.units.forEach(call=>{const u=state.units.find(x=>x.call===call);if(u)u.eta=i.eta;});if(i.eta<=0){i.status='scene';i.eta=4;eventBus.emit(EVENTS.STATUS,{incident:i,status:i.status});log(`${i.id}: ${i.units.join(', ')} vor Ort, erste Lagemeldung folgt.`);}}
    else if(i.status==='scene'){i.eta--;if(i.eta<=0){if(i.type==='med'&&i.priority<3){i.status='transport';i.eta=5;log(`${i.id}: Patient wird in geeignete Klinik transportiert.`);}else{i.status='returning';i.eta=3;log(`${i.id}: Lage unter Kontrolle, Einheiten rücken ab.`);}}}
    else if(i.status==='transport'){i.eta--;if(i.eta<=0){i.status='returning';i.eta=3;if(i.hospitalId){const hospital=DATA.hospital(i.hospitalId);if(hospital)hospital.beds=Math.max(0,hospital.beds-1);}eventBus.emit(EVENTS.STATUS,{incident:i,status:i.status});log(`${i.id}: Übergabe${i.hospitalId?' in '+(DATA.hospital(i.hospitalId)?.name||'Klinikum'):''} erfolgt.`);}}
    else if(i.status==='returning'){i.eta--;if(i.eta<=0){i.status='closed';state.closed++;state.score+=i.priority===1?35:20;i.units.forEach(call=>{const u=state.units.find(x=>x.call===call);if(u){u.status='Bereit';u.incidentId=null;u.eta=0;}});log(`${i.id}: Einsatz abgeschlossen. Einheiten wieder bereit.`);}}
  }); save();render();
}
function newAutoCall(){if(state.incidents.filter(i=>i.status!=='closed').length>=8)return;const i=makeIncident();state.incidents.push(i);state.selected=i.id;state.calls++;eventBus.emit(EVENTS.CALL_RECEIVED,i);log(`Neuer Notruf: ${i.label} in ${i.district} · ${priorityName(i.priority)}.`);notify(`Neuer Notruf ${i.id}: ${i.label}`);tone(880);save();render();}
function openCallDialog(){const dialog=$('callDialog');if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');}
function hasSavedState(){
  try { const value=JSON.parse(localStorage.getItem(KEY)||localStorage.getItem('leitstelle-nord-save-v2')||'null'); return Boolean(value && value.started===true && Array.isArray(value.units) && Array.isArray(value.incidents)); } catch (_) { return false; }
}
function resetShift(){state=emptyState();seed();render();}
function showMenu(){
  simulationStarted=false; $('mainMenu').classList.remove('hidden');
  const hasSave=hasSavedState(); $('continueShift').disabled=!hasSave;
  $('continueShift').textContent=hasSave?'Schicht fortsetzen':'Keine gespeicherte Schicht';
  $('saveSummary').textContent=hasSave?'Ein lokaler Spielstand ist verfügbar.':'Starte eine neue Schicht – dein Fortschritt wird automatisch gespeichert.';
  if(tickTimer){clearInterval(tickTimer);tickTimer=null;}
}
function startSimulation(useSave){
  if(!useSave)resetShift();
  state.started=true;
  save();
  simulationStarted=true; $('mainMenu').classList.add('hidden');
  if(!tickTimer)tickTimer=setInterval(tick,1000);
  if(leafletMap) setTimeout(()=>leafletMap.invalidateSize(),0);
  render();
}
function migrate(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const migrated={...emptyState(),...raw, schemaVersion:SCHEMA_VERSION};
  migrated.events=Array.isArray(raw.events)?raw.events:[];
  migrated.incidents=(Array.isArray(raw.incidents)?raw.incidents:[]).map(i=>({...i,agencies:Array.isArray(i.agencies)?i.agencies:recommendationsFor(i.type,i.priority,i.persons,i.hazard),failure:i.failure||null,hospitalId:i.hospitalId||null}));
  return migrated;
}
function openCommandPalette() {
  const dialog=$('commandDialog'), commands=[
    ['Notruf erfassen','N',openCallDialog],['Funkverkehr fokussieren','R',()=>{$('radioLog').scrollIntoView({behavior:'smooth'});dialog.close();}],
    ['Ausgewählten Einsatz anzeigen','Enter',()=>{renderDetails();dialog.close();}],['Hilfe öffnen','?',()=>{$('helpDialog').showModal();dialog.close();}]
  ];
  const draw=()=>{const query=$('commandSearch').value.toLowerCase();$('commandList').innerHTML=commands.filter(item=>item[0].toLowerCase().includes(query)).map((item,index)=>`<button class="command-item" data-command="${index}"><span>${esc(item[0])}</span><small>${esc(item[1])}</small></button>`).join('');$('commandList').querySelectorAll('[data-command]').forEach(button=>button.addEventListener('click',()=>commands[Number(button.dataset.command)][2]()));};
  $('commandSearch').value=''; draw(); $('commandSearch').oninput=draw; dialog.showModal(); setTimeout(()=>$('commandSearch').focus(),0);
}
function setup(){
  try{const stored=JSON.parse(localStorage.getItem(KEY)||localStorage.getItem('leitstelle-nord-save-v2')||'null');const migrated=migrate(stored);if(migrated)state=migrated;}catch(_){state=emptyState();notify('Spielstand beschädigt – mit sicherem Ausgangszustand gestartet.');}
  if(typeof state.started!=='boolean')state.started=Boolean(state.score||state.closed||state.answered||state.minute>360||state.incidents.some(i=>i&&i.status&&i.status!=='new'));
  state.units=Array.isArray(state.units)?state.units.map((unit,index)=>({...unit,call:unit.call||FLEET[index]?.[0]||`U-${index+1}`,type:unit.type||FLEET[index]?.[1]||'rescue',status:unit.status||'Bereit',incidentId:unit.incidentId||null,eta:Number.isFinite(unit.eta)?unit.eta:0,capability:unit.capability||FLEET[index]?.[4]||'Standard',stationId:unit.stationId||FLEET[index]?.[5]||null})):emptyState().units;
  state.incidents=Array.isArray(state.incidents)?state.incidents.filter(i=>i&&typeof i==='object'&&TYPES[i.type]):[];
  state.minute=Number.isFinite(state.minute)?Math.max(360,state.minute):360;
  state.weather=Number.isInteger(state.weather)&&state.weather>=0&&state.weather<WEATHER.length?state.weather:0;
  ['score','closed','calls','answered','answerSeconds'].forEach(key=>{if(!Number.isFinite(state[key]))state[key]=0;});
  state.incidents.forEach(i=>{if(!i.status)i.status='new';if(i.persons==null)i.persons=1;if(!i.hazard)i.hazard='none';if(!Array.isArray(i.units))i.units=[];if(!Number.isFinite(i.age))i.age=0;if(!Number.isFinite(i.priority)||i.priority<1||i.priority>3)i.priority=2;if(!i.coordinates||!Number.isFinite(i.coordinates.lat)||!Number.isFinite(i.coordinates.lon))i.coordinates=DATA.coordinates(i.district);if(!i.receivedAt)i.receivedAt=clockFor(i.created||state.minute);if(!i.channel)i.channel='phone';if(!i.callback)i.callback='Nicht übermittelt';if(!i.locationAccuracy)i.locationAccuracy='Ortsteil bestätigt';if(!Array.isArray(i.agencies))i.agencies=recommendations(i);});
  if(!state.incidents.length)seed();
  $('districtSelect').innerHTML=Object.keys(DISTRICTS).map(name=>`<option>${name}</option>`).join('');
  document.querySelectorAll('.filter').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.filter').forEach(b=>b.classList.remove('active'));btn.classList.add('active');state.filter=btn.dataset.filter;render();}));
  $('newCall').addEventListener('click',openCallDialog);$('radioButton').addEventListener('click',()=>{$('radioLog').focus();notify('Funkverkehr fokussiert.');});
  $('soundToggle').addEventListener('click',()=>{sound=!sound;render();});$('newShift').addEventListener('click',()=>{if(confirm('Aktuelle Schicht wirklich zurücksetzen?')){startSimulation(false);notify('Neue Schicht gestartet.');}});
  $('commandButton').addEventListener('click',openCommandPalette);
  $('startShift').addEventListener('click',()=>startSimulation(false));$('continueShift').addEventListener('click',()=>{if(hasSavedState())startSimulation(true);});
  $('helpButton').addEventListener('click',()=>$('helpDialog').showModal());$('settingsButton').addEventListener('click',()=>{$('menuSoundToggle').checked=sound;$('settingsDialog').showModal();});
  $('menuSoundToggle').addEventListener('change',event=>{sound=event.currentTarget.checked;render();});document.querySelectorAll('[data-close-dialog]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
  $('callForm').addEventListener('submit',event=>{event.preventDefault();const data=new FormData(event.currentTarget),i=makeIncident({type:data.get('type'),priority:data.get('priority'),location:data.get('location'),district:data.get('district'),caller:data.get('caller')||'Unbekannt',callback:data.get('callback')||'Nicht übermittelt',channel:data.get('channel'),details:data.get('details')||'Keine weiteren Angaben.',persons:data.get('persons'),hazard:data.get('hazard')});state.incidents.push(i);state.selected=i.id;state.calls++;eventBus.emit(EVENTS.CALL_RECEIVED,i);log(`Notruf aufgenommen: ${i.id} · ${i.label} in ${i.district} · ${i.channel==='phone'?'112':'digitaler Eingang'}.`);event.currentTarget.closest('dialog').close();notify(`Einsatz ${i.id} angelegt · Erstbewertung erforderlich.`);tone(880);save();render();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());return;}if(event.ctrlKey&&event.key.toLowerCase()==='k'){event.preventDefault();openCommandPalette();return;}if(event.target.matches('input,textarea,select'))return;if(event.key.toLowerCase()==='n')openCallDialog();if(event.key.toLowerCase()==='r'){$('radioLog').scrollIntoView({behavior:'smooth'});notify('Funkverkehr geöffnet.');}if(['1','2','3','4'].includes(event.key)){const i=state.incidents.find(x=>x.id===state.selected);if(i){const type=['fire','med','police','rescue'][Number(event.key)-1];const unit=available(type)[0];if(unit){state.selected=i.id;renderDetails();const checkbox=document.querySelector(`.unit-option input[value="${unit.call}"]`);if(checkbox){checkbox.checked=true;document.querySelector('.dispatch-action').click();}}}}});
  $('regionName').textContent=DATA.region.name;
  $('mapSource').textContent=`Kartengrundlage: ${DATA.source} · Routing: ${DATA.routingSource} · © OpenStreetMap contributors`;
  render();showMenu();
}
setup();
