let rawData = null;
let baseDate = new Date();
let weekOffset = 0;

let chartStepsInstance = null;
let chartBpmSleepInstance = null;
let chartBodyBatteryStressInstance = null;
let chartHrvRhrInstance = null;

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  
  document.getElementById(tabId).classList.remove('hidden');
  const activeBtn = document.getElementById('btn-' + tabId.replace('tab-', ''));
  if(activeBtn) activeBtn.classList.add('active');
}

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
}

function formatDateShort(dateObj) {
  const monthNames = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giug", "Lug", "Ago", "Sett", "Ott", "Nov", "Dic"];
  return dateObj.getDate() + " " + monthNames[dateObj.getMonth()];
}

function formatDateYMD(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizeDateStr(dateInput) {
  if (!dateInput) return '';
  return String(dateInput).split('T')[0].split(' ')[0];
}

function getVal(obj, keys, defaultVal = null) {
  if (!obj) return defaultVal;
  for (let k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') {
      return obj[k];
    }
  }
  return defaultVal;
}

function formatOreMinuti(ore) {
  const n = Number(ore);
  if (!isFinite(n) || n <= 0) return '0h 0m';
  const totMin = Math.round(n * 60);
  return Math.floor(totMin / 60) + 'h ' + String(totMin % 60).padStart(2, '0') + 'm';
}

function renderNextEvent() {
  const ev = rawData && rawData.next_event;
  const el = document.getElementById('nextEventLabel');
  if (!ev || !ev.title || !el) return;
  let testo = 'Prossimo evento: ' + ev.title;
  if (ev.date) {
    const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
    const giorni = Math.round((new Date(ev.date + 'T00:00:00') - oggi) / 86400000);
    if (giorni === 0) testo += ' \u2022 Oggi!';
    else if (giorni === 1) testo += ' \u2022 Domani';
    else if (giorni > 1) testo += ' \u2022 Tra ' + giorni + ' giorni';
  }
  if (ev.goal) testo += ' \u2022 Obiettivo ' + ev.goal;
  el.innerText = testo;
}

// ==== RECORD & PB ====
const RIEGEL = 1.06;
const DIST_GARA = { '5k': 5, '10k': 10, 'mezza': 21.0975, 'maratona': 42.195 };
const TITOLO_COLORE = { 'neon-orange-bright': 'text-orange-400', 'neon-cyan-bright': 'text-cyan-400', 'neon-amber': 'text-amber-400', 'neon-azure': 'text-sky-400', 'neon-coral': 'text-orange-500', 'neon-emerald': 'text-emerald-400', 'neon-purple': 'text-purple-400' };
const NEON_CLASSI = ['neon-orange-bright', 'neon-cyan-bright', 'neon-amber', 'neon-azure', 'neon-coral', 'neon-emerald', 'neon-purple'];

function esc(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function dataAttivita(a) {
  return new Date(String(a.date || '').replace(' ', 'T'));
}

function fmtData(d) {
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtTempo(sec) {
  if (!isFinite(sec) || sec <= 0) return '--';
  const t = Math.round(sec);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
  return h > 0 ? h + ':' + mm + ':' + ss : m + ':' + ss;
}

function fmtPasso(secKm) {
  if (!isFinite(secKm) || secKm <= 0) return '--';
  const t = Math.round(secKm);
  return Math.floor(t / 60) + "'" + String(t % 60).padStart(2, '0') + '"/km';
}

function fmtDeltaTempo(sec) {
  const t = Math.round(Math.abs(sec));
  const segno = sec > 0 ? '+' : sec < 0 ? '-' : '';
  return segno + (t === 0 ? '0:00' : fmtTempo(t));
}

function fmtDeltaPasso(secKm) {
  const t = Math.round(Math.abs(secKm));
  const segno = secKm > 0 ? '+' : secKm < 0 ? '-' : '';
  return segno + t + ' s/km';
}

function soloCorse(acts) {
  return acts.filter(a => String(a.type || '').toLowerCase().includes('run') && Number(a.distance_km) > 0);
}

// Miglior tempo su una distanza D: 1) miglior tratto registrato dall'orologio dentro una corsa (split),
// 2) corse intere di lunghezza simile (tempo riportato alla distanza esatta).
function migliorTempo(runs, chiaveSplit, D, since) {
  let best = null;
  runs.forEach(a => {
    const quando = dataAttivita(a);
    if (since && quando < since) return;
    if (chiaveSplit) {
      const v = Number(a[chiaveSplit]);
      if (v > 0 && (!best || v < best.tempo)) best = { tempo: v, act: a, tipo: 'split', quando };
    }
    const d = Number(a.distance_km), t = Number(a.duration_min) * 60;
    if (D >= 5 && d >= D * 0.985 && d <= D * 1.08 && t > 0) {
      const tempo = t * (D / d);
      if (!best || tempo < best.tempo) best = { tempo, act: a, tipo: 'corsa', dist: d, quando };
    }
  });
  return best;
}

function lunediDi(d) {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  x.setHours(0, 0, 0, 0);
  return x;
}

function cartaRecord(neon, c) {
  return '<div class="glass-card ' + neon + ' p-5">' +
    '<div class="flex justify-between items-start mb-2">' +
    '<span class="text-xs font-extrabold uppercase tracking-wider ' + (TITOLO_COLORE[neon] || 'text-slate-300') + '">' + esc(c.titolo) + '</span>' +
    '<span class="text-xl">' + c.icona + '</span></div>' +
    '<div class="text-3xl font-black text-white">' + esc(c.valore) + '</div>' +
    '<p class="text-xs text-slate-400 mt-1">' + esc(c.sub) + '</p></div>';
}

// Peso della previsione dell'orologio nella stima mista (0.2 = 20%). La previsione Garmin cambia ogni giorno ed è ottimistica.
const PESO_GARMIN = 0.2;

// Tra il tempo calcolato dai dati e il record scritto a mano (copiato dall'orologio) scelgo il più affidabile,
// e ritrovo la data dalla corsa in cui è stato fatto.
function sceltaRecord(calcolato, manuale, dataManuale) {
  if (!(manuale > 0)) return calcolato;
  const dataMan = dataManuale ? new Date(dataManuale + 'T00:00:00') : null;
  const man = { tempo: manuale, tipo: 'manuale', quando: dataMan };
  if (!calcolato) return man;
  const tolleranza = calcolato.tipo === 'split' ? 0.005 : 0.01;
  if (calcolato.tempo < manuale * (1 - tolleranza)) return calcolato;       // nuovo record trovato nelle corse
  if (calcolato.tempo <= manuale * 1.015) man.quando = dataMan || calcolato.quando;  // stessa prestazione: prendo la data
  return man;
}

// La MIA stima: parte dalle migliori prestazioni reali (record dell'orologio + corse degli ultimi 4 mesi)
// e le porta alle altre distanze con la formula di Riegel.
function calcolaPrevisioni(runs) {
  const since = new Date(Date.now() - 120 * 86400000);
  const records = rawData.personal_records || {};
  const chiavi = { 5: '5k', 10: '10k', 21.0975: 'mezza' };
  const sforzi = [{ D: 5, split: 'fastest_5km_s' }, { D: 10 }, { D: 15 }, { D: 21.0975 }]
    .map(x => {
      const b = migliorTempo(runs, x.split, x.D, since);
      const man = Number(records[chiavi[x.D]]);
      const candidati = [b ? b.tempo : null, man > 0 ? man : null].filter(v => v !== null);
      return candidati.length ? { D: x.D, tempo: Math.min.apply(null, candidati) } : null;
    })
    .filter(Boolean);
  if (!sforzi.length) return null;
  const out = {};
  Object.keys(DIST_GARA).forEach(k => {
    const D = DIST_GARA[k];
    let s = sforzi[0];
    sforzi.forEach(x => { if (Math.abs(Math.log(x.D / D)) < Math.abs(Math.log(s.D / D))) s = x; });
    out[k] = s.tempo * Math.pow(D / s.D, RIEGEL);
  });
  out._sforzi = sforzi;
  return out;
}

// Stima finale: la mia stima con un po' di peso alla previsione dell'orologio.
function stimaMista(mia, garmin) {
  const out = {};
  Object.keys(DIST_GARA).forEach(k => {
    const a = mia ? Number(mia[k]) : 0, g = garmin ? Number(garmin[k]) : 0;
    out[k] = a > 0 && g > 0 ? (1 - PESO_GARMIN) * a + PESO_GARMIN * g : (a > 0 ? a : (g > 0 ? g : 0));
  });
  return out;
}

function tempoStimatoPer(pred, D) {
  if (!pred) return null;
  let m = null;
  Object.keys(DIST_GARA).forEach(k => {
    const t = Number(pred[k]);
    if (!(t > 0)) return;
    const dist = DIST_GARA[k];
    if (!m || Math.abs(Math.log(dist / D)) < Math.abs(Math.log(m.D / D))) m = { D: dist, t };
  });
  if (!m) return null;
  return Math.abs(m.D - D) / D < 0.02 ? m.t : m.t * Math.pow(D / m.D, RIEGEL);
}

function renderRecords() {
  const griglia = document.getElementById('recordGrid');
  if (!griglia || !rawData) return;
  const runs = soloCorse(rawData.activities || []);
  const carte = [];

  const defs = [
    { titolo: '1 km', icona: '⚡', D: 1, split: 'fastest_1km_s', chiave: '1k' },
    { titolo: '5 km', icona: '🏃', D: 5, split: 'fastest_5km_s', chiave: '5k' },
    { titolo: '10 km', icona: '🔥', D: 10, chiave: '10k' },
    { titolo: 'Mezza maratona', icona: '🏅', D: 21.0975, chiave: 'mezza' },
    { titolo: 'Maratona', icona: '🏆', D: 42.195, chiave: 'maratona' }
  ];
  defs.forEach(def => {
    const man = def.chiave && rawData.personal_records ? Number(rawData.personal_records[def.chiave]) : 0;
    const dMan = rawData.personal_records && rawData.personal_records.dates ? rawData.personal_records.dates[def.chiave] : null;
    const b = sceltaRecord(migliorTempo(runs, def.split, def.D, null), man, dMan);
    if (!b) { carte.push({ titolo: def.titolo, icona: def.icona, valore: '--', sub: 'Nessun dato ancora' }); return; }
    let sub = (b.quando ? fmtData(b.quando) + ' • ' : '') + fmtPasso(b.tempo / def.D);
    if (b.tipo === 'manuale') sub += b.quando ? ' • record dell\'orologio Garmin' : ' • record dell\'orologio Garmin (data non trovata)';
    else if (b.tipo === 'split') sub += ' • miglior tratto registrato dall\'orologio';
    else if (Math.abs(b.dist - def.D) > 0.05) sub += ' • stimato da una corsa di ' + b.dist.toFixed(2).replace('.', ',') + ' km';
    carte.push({ titolo: def.titolo, icona: def.icona, valore: fmtTempo(b.tempo), sub });
  });

  // Corsa più lunga
  let lunga = null;
  runs.forEach(a => { if (!lunga || Number(a.distance_km) > Number(lunga.distance_km)) lunga = a; });
  carte.push(lunga
    ? { titolo: 'Corsa più lunga', icona: '🛣️', valore: Number(lunga.distance_km).toFixed(2).replace('.', ',') + ' km',
        sub: fmtData(dataAttivita(lunga)) + ' • ' + fmtTempo(Number(lunga.duration_min) * 60) + ' • ' + fmtPasso(Number(lunga.duration_min) * 60 / Number(lunga.distance_km)) }
    : { titolo: 'Corsa più lunga', icona: '🛣️', valore: '--', sub: 'Nessun dato ancora' });

  // Giorno con più passi
  let maxPassi = null;
  getHealthArray().forEach(g => {
    const p = Number(getVal(g, ['steps'], 0));
    if (p > 0 && (!maxPassi || p > maxPassi.passi)) maxPassi = { passi: p, data: g.date };
  });
  carte.push(maxPassi
    ? { titolo: 'Più passi in un giorno', icona: '👟', valore: maxPassi.passi.toLocaleString('it-IT'), sub: fmtData(new Date(String(maxPassi.data) + 'T00:00:00')) }
    : { titolo: 'Più passi in un giorno', icona: '👟', valore: '--', sub: 'Nessun dato ancora' });

  // Settimana con più km di corsa
  const settimane = {};
  runs.forEach(a => {
    const d = dataAttivita(a);
    if (isNaN(d)) return;
    const lun = lunediDi(d);
    const k = lun.getTime();
    settimane[k] = settimane[k] || { lun, km: 0, n: 0 };
    settimane[k].km += Number(a.distance_km);
    settimane[k].n += 1;
  });
  let miglioreSett = null;
  Object.keys(settimane).forEach(k => { if (!miglioreSett || settimane[k].km > miglioreSett.km) miglioreSett = settimane[k]; });
  if (miglioreSett) {
    const dom = new Date(miglioreSett.lun.getTime() + 6 * 86400000);
    carte.push({ titolo: 'Settimana con più km', icona: '📅', valore: miglioreSett.km.toFixed(1).replace('.', ',') + ' km',
      sub: fmtData(miglioreSett.lun) + ' – ' + fmtData(dom) + ' • ' + miglioreSett.n + (miglioreSett.n === 1 ? ' corsa' : ' corse') });
  } else {
    carte.push({ titolo: 'Settimana con più km', icona: '📅', valore: '--', sub: 'Nessun dato ancora' });
  }

  // Giorni di fila con almeno un'attività (qualsiasi disciplina)
  const giorniAttivi = {};
  (rawData.activities || []).forEach(a => {
    if (!(Number(a.duration_min) > 0)) return;
    const d = dataAttivita(a);
    if (isNaN(d)) return;
    giorniAttivi[Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000] = true;
  });
  let striscia = null, inizioS = null, precedente = null, lunghezza = 0;
  Object.keys(giorniAttivi).map(Number).sort((a, b) => a - b).forEach(g => {
    if (precedente !== null && g === precedente + 1) { lunghezza += 1; } else { inizioS = g; lunghezza = 1; }
    if (!striscia || lunghezza > striscia.n) striscia = { n: lunghezza, da: inizioS, a: g };
    precedente = g;
  });
  const giornoData = g => fmtData(new Date(g * 86400000 + 12 * 3600000));
  carte.push(striscia
    ? { titolo: 'Giorni di fila in movimento', icona: '🔗', valore: striscia.n + (striscia.n === 1 ? ' giorno' : ' giorni'),
        sub: striscia.n > 1 ? giornoData(striscia.da) + ' – ' + giornoData(striscia.a) + ' • qualsiasi disciplina' : giornoData(striscia.da) }
    : { titolo: 'Giorni di fila in movimento', icona: '🔗', valore: '--', sub: 'Nessun dato ancora' });

  griglia.innerHTML = carte.map((c, i) => cartaRecord(NEON_CLASSI[i % NEON_CLASSI.length], c)).join('');
  const nota = document.getElementById('recordNote');
  if (nota) nota.innerText = 'Record di 5 km, 10 km e mezza: quelli segnati dall\'orologio (scritti in fetch_data.py), a meno che le tue corse ne battano uno. 1 km: miglior tratto registrato dall\'orologio (da settembre). Le altre distanze: stimate dalle corse complete di lunghezza simile.';

  renderPrevisioni(runs);
}

function renderPrevisioni(runs) {
  const grid = document.getElementById('predGrid');
  const blocco = document.getElementById('nextRaceBlock');
  if (!grid || !blocco) return;
  const garmin = rawData.race_predictions && rawData.race_predictions.fonte ? rawData.race_predictions : null;
  const mia = calcolaPrevisioni(runs);
  const pred = (mia || garmin) ? stimaMista(mia, garmin) : null;
  const pesoG = Math.round(PESO_GARMIN * 100);
  const fonteTesto = !pred ? 'Servono almeno alcune corse recenti o dei record per calcolare le stime.'
    : (mia && garmin) ? 'Stima mista: ' + (100 - pesoG) + '% dalle tue prestazioni reali (record e corse degli ultimi 4 mesi, formula di Riegel) e ' + pesoG + '% dalla previsione dell\'orologio, che cambia ogni giorno. Valgono per la forma di oggi, non per il giorno della gara.'
    : mia ? 'Stima calcolata dalle tue prestazioni reali (record e corse degli ultimi 4 mesi, formula di Riegel).'
    : 'Solo previsione dell\'orologio.';
  document.getElementById('predSource').innerText = fonteTesto;

  const nomi = { '5k': ['5 km', '🏃'], '10k': ['10 km', '🔥'], 'mezza': ['Mezza maratona', '🏅'], 'maratona': ['Maratona', '🏆'] };
  grid.innerHTML = Object.keys(DIST_GARA).map((k, i) => {
    const t = pred ? Number(pred[k]) : 0;
    return cartaRecord(NEON_CLASSI[(i + 1) % NEON_CLASSI.length], {
      titolo: nomi[k][0], icona: nomi[k][1],
      valore: t > 0 ? fmtTempo(t) : '--',
      sub: t > 0 ? fmtPasso(t / DIST_GARA[k]) + (garmin && Number(garmin[k]) > 0 ? ' • Garmin ' + fmtTempo(Number(garmin[k])) : '') : 'Nessuna stima'
    });
  }).join('');

  statoGara = null;
  const ev = rawData.next_event;
  if (!ev || !ev.title) {
    blocco.innerHTML = '<div class="glass-card p-6 text-sm text-slate-400">Nessuna gara impostata: aggiungila in fetch_data.py (EVENTO_MANUALE).</div>';
    return;
  }
  const D = Number(ev.distance_km), goal = Number(ev.goal_time_s);
  let giorniTxt = '';
  let giorniNum = null;
  if (ev.date) {
    const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
    const g = Math.round((new Date(ev.date + 'T00:00:00') - oggi) / 86400000);
    if (isFinite(g)) giorniNum = g;
    if (isFinite(g)) giorniTxt = g > 1 ? 'Tra ' + g + ' giorni' : g === 1 ? 'Domani' : g === 0 ? 'Oggi!' : '';
  }
  const dataTxt = ev.date ? fmtData(new Date(ev.date + 'T00:00:00')) : '';
  const testata = (extra) => '<div class="flex flex-wrap items-start justify-between gap-3 mb-4"><div><p class="text-xs font-extrabold uppercase tracking-wider text-orange-400">Prossima gara</p>' +
    '<h3 class="text-xl font-black text-white">' + esc(ev.title) + '</h3>' +
    '<p class="text-xs text-slate-400 mt-0.5">' + esc([dataTxt, giorniTxt].filter(Boolean).join(' • ')) + '</p></div>' + (extra || '') + '</div>';
  const intestazione = testata('');
  let selettore = '';

  if (!(D > 0) || !(goal > 0)) {
    blocco.innerHTML = '<div class="glass-card neon-orange-bright p-6">' + intestazione +
      '<p class="text-sm text-slate-400">Per il confronto servono distanza e tempo obiettivo: impostali in fetch_data.py (EVENTO_DISTANZA_KM ed EVENTO_TEMPO_OBIETTIVO).</p></div>';
    return;
  }
  const stimato = tempoStimatoPer(pred, D);
  const passoGoal = goal / D;
  let forbice = '';
  if (mia && mia._sforzi) {
    const etichette = { 5: 'dai tuoi 5 km', 10: 'dai tuoi 10 km', 15: 'dai tuoi 15 km', 21.0975: 'dalla tua mezza' };
    const proiezioni = mia._sforzi.filter(x => x.D >= D / 4 && x.D <= D * 1.5)
      .map(x => ({ t: x.tempo * Math.pow(D / x.D, RIEGEL), nome: etichette[x.D] || (x.D + ' km') }))
      .sort((a, b) => a.t - b.t);
    if (proiezioni.length >= 2) {
      const lo = proiezioni[0], hi = proiezioni[proiezioni.length - 1];
      forbice = '<p class="text-xs text-slate-400 mt-3">Forbice dalle tue prestazioni reali: <span class="text-white font-bold">' + fmtTempo(lo.t) + '</span> (' + lo.nome + ') – <span class="text-white font-bold">' + fmtTempo(hi.t) + '</span> (' + hi.nome + '). Più la distanza di partenza è vicina a quella della gara, più la proiezione è affidabile.</p>';
    }
  }
  const riga = (etichetta, tempo, passo) =>
    '<div><p class="text-xs text-slate-400">' + etichetta + '</p>' +
    '<p class="text-2xl font-black text-white">' + tempo + '</p><p class="text-xs text-slate-400">' + passo + '</p></div>';
  let confronto = '<p class="text-sm text-slate-400">Non ci sono ancora abbastanza dati per stimare il tempo su questa distanza.</p>';
  if (stimato) {
    const dT = stimato - goal, dP = stimato / D - passoGoal;
    const colore = dT > 0 ? 'text-orange-400' : 'text-emerald-400';
    const verdetto = dT > 0 ? 'Da recuperare' : 'In vantaggio';
    const big = (titolo, valore) =>
      '<div class="rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-center">' +
      '<p class="text-xs font-bold uppercase tracking-wider text-slate-400">' + titolo + '</p>' +
      '<p class="text-3xl font-black ' + colore + ' mt-1">' + valore + '</p>' +
      '<p class="text-xs ' + colore + ' mt-1">' + verdetto + '</p></div>';
    confronto = '<div class="grid grid-cols-2 gap-4 mb-4">' + big('Delta tempo', fmtDeltaTempo(dT)) + big('Delta passo', fmtDeltaPasso(dP)) + '</div>';
    if (giorniNum !== null && giorniNum > 0) {
      statoGara = { E: stimato, goal, D, giorni: giorniNum, titolo: ev.title };
      const scenari = elencoScenari();
      const scSel = scenari.find(x => x.chiave === scenarioScelto) || scenari[1];
      const stop = intervalloStop(giorniNum);
      const ris = scenari.map(x => ({ x, r: probObiettivo(stimato, giorniNum, x, stop, goal) }));
      const sel = ris.find(o => o.x.chiave === scSel.chiave);
      const g3 = giudizioProb(sel.r.prob);
      selettore = '<div class="flex flex-col items-start sm:items-end gap-1"><p class="text-xs text-slate-500">Ipotesi di progresso</p>' +
        '<div class="flex flex-wrap gap-1 bg-slate-900/90 p-1 rounded-xl border border-white/10">' +
        scenari.map(x => '<button onclick="scegliScenario(\'' + x.chiave + '\')" class="whitespace-nowrap px-3 py-1.5 text-xs rounded-lg transition ' +
          (x.chiave === scSel.chiave ? 'bg-gradient-to-r from-orange-500 to-amber-400 text-slate-950 font-extrabold' : 'font-bold text-slate-400 hover:text-white') + '">' + esc(x.nome) + '</button>').join('') + '</div></div>';
      const altri = ris.filter(o => o !== sel).map(o => esc(o.x.nome) + ' ' + fmtProb(o.r.prob)).join(' • ');
      confronto += '<div class="rounded-2xl border border-white/10 bg-slate-900/60 p-4 mb-4">' +
        '<p class="text-xs font-bold uppercase tracking-wider text-slate-400">Realizzabilità dell\'obiettivo • scenario ' + esc(scSel.nome.toLowerCase()) + '</p>' +
        '<div class="flex items-end flex-wrap gap-x-4 mt-1"><p class="text-4xl font-black ' + g3[1] + '">' + fmtProb(sel.r.prob) + '</p><p class="text-sm font-bold pb-1 ' + g3[1] + '">' + g3[0] + '</p></div>' +
        '<div class="h-2 rounded-full bg-white/10 mt-2 overflow-hidden"><div class="h-2 rounded-full" style="width:' + Math.max(2, Math.min(100, sel.r.prob * 100)) + '%;background:' + g3[2] + '"></div></div>' +
        '<p class="text-xs text-slate-400 mt-2">Tempo previsto in gara: <span class="text-white font-bold">' + fmtTempo(sel.r.tempo) + '</span> (±' + fmtTempo(sel.r.sigma) + ') • Altri scenari: ' + altri + '</p>' +
        '<p class="text-xs text-slate-500 mt-1">Ipotesi: progresso di ' + (scSel.rate >= 0 ? '' : '-') + fmtRate(Math.abs(scSel.rate)) + ' al mese' + (scSel.nota ? ' (' + esc(scSel.nota) + ')' : '') + ', ' + esc(testoStop(stop)) + '. ' + (scSel.avviso ? esc(scSel.avviso) + ' ' : '') + 'Stima indicativa, non una promessa: lo stop si imposta nella pagina Comparazione.</p></div>';
    }
    const tG = garmin ? tempoStimatoPer(garmin, D) : null;
    if (tG) confronto += '<p class="text-xs text-slate-400">Con la sola previsione dell\'orologio (' + fmtTempo(tG) + '): delta tempo ' + fmtDeltaTempo(tG - goal) + ', delta passo ' + fmtDeltaPasso(tG / D - passoGoal) + '.</p>';
  }
  blocco.innerHTML = '<div class="glass-card neon-orange-bright p-6">' + testata(selettore) +
    '<div class="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-5">' +
    riga('Distanza', (D === 21.0975 ? '21,1' : String(D).replace('.', ',')) + ' km', D === 21.0975 ? 'mezza maratona' : '') +
    riga('Obiettivo', fmtTempo(goal), fmtPasso(passoGoal)) +
    riga('Tempo stimato', stimato ? fmtTempo(stimato) : '--', stimato ? fmtPasso(stimato / D) : '') +
    '</div>' + confronto + forbice + '</div>';
}
// ==== FINE RECORD & PB ====

// ==== ORE PER DISCIPLINA ====
let chartWeeklyHoursInstance = null;
const TIPI_DISCIPLINA = {
  running: 'Corsa', trail_running: 'Corsa', treadmill_running: 'Corsa', track_running: 'Corsa',
  strength_training: 'Forza', tennis_v2: 'Tennis', tennis: 'Tennis',
  cycling: 'Bici', indoor_cycling: 'Bici', road_biking: 'Bici', mountain_biking: 'Bici', virtual_ride: 'Bici',
  walking: 'Camminata', hiking: 'Escursione',
  lap_swimming: 'Nuoto', open_water_swimming: 'Nuoto', swimming: 'Nuoto',
  yoga: 'Yoga', pilates: 'Pilates', elliptical: 'Ellittica', indoor_cardio: 'Cardio', cardio: 'Cardio', hiit: 'HIIT', rowing: 'Canottaggio', other: 'Altro'
};
const COLORI_DISCIPLINA = { 'Corsa': '#ff6b00', 'Forza': '#a855f7', 'Tennis': '#00f0ff', 'Bici': '#10b981', 'Camminata': '#ff9d00', 'Nuoto': '#00a6ff', 'Escursione': '#84cc16', 'Yoga': '#ec4899' };
const COLORI_EXTRA = ['#f43f5e', '#eab308', '#14b8a6', '#8b5cf6', '#94a3b8', '#fb923c'];

function disciplinaDi(a) {
  const t = String(a.type || 'other').toLowerCase();
  return TIPI_DISCIPLINA[t] || (t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, ' '));
}

function renderWeeklyHours(selMonday) {
  const canvas = document.getElementById('chartWeeklyHours');
  const tab = document.getElementById('hoursTable');
  if (!canvas || !tab || !rawData) return;
  const acts = (rawData.activities || []).filter(a => Number(a.duration_min) > 0);

  const lunedi = [];
  for (let i = 7; i >= 0; i--) {
    const m = new Date(selMonday.getTime());
    m.setDate(m.getDate() - i * 7);
    m.setHours(0, 0, 0, 0);
    lunedi.push(m);
  }
  const inizio = lunedi[0].getTime();
  const fine = lunedi[7].getTime() + 7 * 86400000;
  const perSettimana = lunedi.map(() => ({}));   // { disciplina: minuti }
  acts.forEach(a => {
    const d = dataAttivita(a);
    if (isNaN(d)) return;
    const t = d.getTime();
    if (t < inizio || t >= fine) return;
    const i = Math.min(7, Math.floor((t - inizio) / (7 * 86400000)));
    const nome = disciplinaDi(a);
    perSettimana[i][nome] = (perSettimana[i][nome] || 0) + Number(a.duration_min);
  });

  // discipline presenti, ordinate per minuti totali
  const totaliDisc = {};
  perSettimana.forEach(w => Object.keys(w).forEach(k => { totaliDisc[k] = (totaliDisc[k] || 0) + w[k]; }));
  const discipline = Object.keys(totaliDisc).sort((a, b) => totaliDisc[b] - totaliDisc[a]);
  let extra = 0;
  const colori = {};
  discipline.forEach(n => { colori[n] = COLORI_DISCIPLINA[n] || COLORI_EXTRA[extra++ % COLORI_EXTRA.length]; });

  if (chartWeeklyHoursInstance) chartWeeklyHoursInstance.destroy();
  chartWeeklyHoursInstance = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: lunedi.map(m => formatDateShort(m)),
      datasets: discipline.map(n => ({
        label: n,
        data: perSettimana.map(w => Math.round(((w[n] || 0) / 60) * 100) / 100),
        backgroundColor: colori[n],
        borderRadius: 4,
        stack: 'ore'
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#94a3b8' } },
        tooltip: {
          callbacks: {
            label: (ctx) => ctx.dataset.label + ': ' + formatOreMinuti(ctx.parsed.y),
            footer: (items) => 'Totale: ' + formatOreMinuti(items.reduce((s, i) => s + i.parsed.y, 0))
          }
        }
      },
      scales: {
        x: { stacked: true, ticks: { color: '#64748b' }, grid: { display: false } },
        y: { stacked: true, ticks: { color: '#64748b', callback: (v) => v + 'h' }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });

  // tabella della settimana selezionata
  const corrente = perSettimana[7], precedente = perSettimana[6];
  const sommaMin = w => Object.keys(w).reduce((s, k) => s + w[k], 0);
  const totCorr = sommaMin(corrente), totPrec = sommaMin(precedente);
  const diffMin = totCorr - totPrec;
  const diffTxt = (diffMin >= 0 ? '+' : '-') + formatOreMinuti(Math.abs(diffMin) / 60);
  document.getElementById('hoursWeekTotal').innerText = 'Totale: ' + formatOreMinuti(totCorr / 60) + ' • ' + diffTxt + ' vs sett. precedente';

  const righe = Object.keys(corrente).sort((a, b) => corrente[b] - corrente[a]);
  if (!righe.length) {
    tab.innerHTML = '<p class="text-sm text-slate-400">Nessuna attività registrata in questa settimana.</p>';
    return;
  }
  const sessioni = {};
  acts.forEach(a => {
    const d = dataAttivita(a);
    if (isNaN(d)) return;
    const t = d.getTime();
    if (t >= lunedi[7].getTime() && t < lunedi[7].getTime() + 7 * 86400000) {
      const n = disciplinaDi(a);
      sessioni[n] = (sessioni[n] || 0) + 1;
    }
  });
  tab.innerHTML = '<table class="w-full text-xs"><thead><tr class="text-slate-500 uppercase tracking-wider text-left">' +
    '<th class="pb-2 font-bold">Disciplina</th><th class="pb-2 font-bold text-right">Sessioni</th><th class="pb-2 font-bold text-right">Ore</th><th class="pb-2 font-bold text-right">%</th></tr></thead><tbody>' +
    righe.map(n => '<tr class="border-t border-white/5"><td class="py-2 text-white font-semibold"><span class="inline-block w-2.5 h-2.5 rounded-full mr-2" style="background:' + colori[n] + '"></span>' + esc(n) + '</td>' +
      '<td class="py-2 text-right text-slate-300">' + (sessioni[n] || 0) + '</td>' +
      '<td class="py-2 text-right text-slate-300">' + formatOreMinuti(corrente[n] / 60) + '</td>' +
      '<td class="py-2 text-right text-slate-300">' + Math.round((corrente[n] / totCorr) * 100) + '%</td></tr>').join('') +
    '<tr class="border-t border-white/20"><td class="py-2 text-white font-extrabold">Totale</td><td class="py-2 text-right text-white font-bold">' +
    Object.keys(sessioni).reduce((s, k) => s + sessioni[k], 0) + '</td><td class="py-2 text-right text-white font-bold">' + formatOreMinuti(totCorr / 60) + '</td><td class="py-2 text-right text-white font-bold">100%</td></tr></tbody></table>';
}
// ==== FINE ORE PER DISCIPLINA ====

// ==== COMPARAZIONE E PREVISIONE ====
const SCENARI_FISSI = [
  { chiave: 'prudente', nome: 'Prudente', rate: 0.008, colore: '#38bdf8' },
  { chiave: 'realistico', nome: 'Realistico', rate: 0.015, colore: '#ff9d00' },
  { chiave: 'ottimistico', nome: 'Ottimistico', rate: 0.025, colore: '#10b981' }
];
const DETRAIN_SETT = 0.003;   // quanto si perde (in tempo) per ogni settimana di stop
const SIGMA_GARA = 0.025;     // variabilità relativa il giorno della gara (2,5%)
const SIGMA_RATE = 0.007;     // incertezza sul progresso mensile
const CAP_TENDENZA = 0.03;    // massimo progresso mensile che concedo allo scenario "Tua tendenza"
let scenarioScelto = 'realistico';
let stopDa = null;            // inizio dello stop (Date) oppure null
let stopA = null;             // fine dello stop (Date) oppure null
let statoGara = null;
let comparazioneInizializzata = false;
let periodiCorrenti = [];
let elencoAttCmp = [];
let chartEfficienzaInstance = null;
let chartPrevisioneInstance = null;
let cacheTrend = { raw: null, val: null };

function caricaIpotesi() {
  try {
    const j = JSON.parse(localStorage.getItem('ipotesiGara') || '{}');
    if (j.scenario) scenarioScelto = j.scenario;
    if (j.da) stopDa = new Date(j.da + 'T00:00:00');
    if (j.a) stopA = new Date(j.a + 'T00:00:00');
  } catch (e) { /* nessun salvataggio disponibile */ }
}
function salvaIpotesi() {
  try {
    localStorage.setItem('ipotesiGara', JSON.stringify({ scenario: scenarioScelto, da: stopDa ? isoLocale(stopDa) : null, a: stopA ? isoLocale(stopA) : null }));
  } catch (e) { /* ignoro */ }
}

function normCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

// ---- corse tranquille e lavori di qualità, con la loro efficienza (metri per battito) ----
const RE_QUALITA = /ripet|interv|fartlek|soglia|threshold|tempo run|passo gara|\bgara\b|race|veloc|progressiv|pista/i;

function corseIdonee() {
  return soloCorse(rawData.activities || []).filter(a => Number(a.distance_km) >= 4 && Number(a.avg_hr) >= 110 && Number(a.duration_min) > 0 && !isNaN(dataAttivita(a)));
}

// Se ci sono abbastanza corse registrate dal Garmin uso solo quelle: i battiti di due orologi diversi non sono confrontabili
function sceltaBase(lista, minGarmin) {
  const g = lista.filter(a => a.fonte !== 'storico');
  return g.length >= minGarmin ? { base: g, soloGarmin: true } : { base: lista, soloGarmin: false };
}

function eQualita(a, p75) {
  if (RE_QUALITA.test(String(a.name || ''))) return true;
  const z = Array.isArray(a.hr_zones_sec) ? a.hr_zones_sec.map(v => Number(v) || 0) : null;
  const tot = z ? z.reduce((s, v) => s + v, 0) : 0;
  if (tot > 0) return (z[3] + z[4]) / tot >= 0.25;     // almeno un quarto del tempo nelle zone 4-5
  return Number(a.avg_hr) >= p75;                       // senza zone: FC media tra le più alte
}

function puntoEf(a) {
  const d = dataAttivita(a);
  return { t: d.getTime(), ef: (Number(a.distance_km) * 1000 / Number(a.duration_min)) / Number(a.avg_hr), data: d, a };
}

// Retta di regressione nel tempo e progresso mensile che ne deriva (a parità di battiti: tempo = 1/velocità)
function regressione(punti) {
  const n = punti.length;
  const mx = punti.reduce((s, p) => s + p.t, 0) / n, my = punti.reduce((s, p) => s + p.ef, 0) / n;
  const num = punti.reduce((s, p) => s + (p.t - mx) * (p.ef - my), 0), den = punti.reduce((s, p) => s + (p.t - mx) * (p.t - mx), 0);
  const pend = den > 0 ? num / den : 0;
  const mese = 30.44 * 86400000;
  const gMens = (pend * mese) / my;
  const grezzo = gMens / (1 + gMens);
  const res = punti.reduce((s, p) => s + Math.pow(p.ef - (my + pend * (p.t - mx)), 2), 0);
  const se = n > 2 && den > 0 ? Math.sqrt(res / (n - 2) / den) : null;
  const sigmaRate = se !== null ? Math.max(SIGMA_RATE, (se * mese) / my) : SIGMA_RATE * 2;
  return {
    punti, n, mx, my, pend, gMens, grezzo, sigmaRate,
    rate: Math.max(-0.02, Math.min(CAP_TENDENZA, grezzo)),
    limitata: grezzo > CAP_TENDENZA,
    spanGiorni: (punti[n - 1].t - punti[0].t) / 86400000,
    trend: punti.map(p => my + pend * (p.t - mx))
  };
}

function calcolaTendenze() {
  if (cacheTrend.raw === rawData) return cacheTrend;
  const out = { raw: rawData, facile: null, qualita: null };
  const eleg = corseIdonee();
  if (eleg.length >= 4) {
    const sb = sceltaBase(eleg, 6);
    const hrs = sb.base.map(a => Number(a.avg_hr)).sort((x, y) => x - y);
    const soglia = hrs[Math.min(hrs.length - 1, Math.floor(hrs.length * 0.6))];
    const p75 = hrs[Math.min(hrs.length - 1, Math.floor(hrs.length * 0.75))];
    // etichette scritte nel nome (easy/lento, ripetute, soglia...): se bastano, le preferisco ai battiti
    const conNome = a => { const r = riconosciTipo(a, null, null); return (r.fonte === 'nome' || r.fonte === 'orologio') ? r.tipo : null; };
    const sbEt = sceltaBase(eleg.filter(a => conNome(a) === 'facile'), 8);
    let facili = sb.base.filter(a => Number(a.avg_hr) <= soglia), etichettateF = false, soloGarminF = sb.soloGarmin;
    if (sbEt.soloGarmin && sbEt.base.length >= 8) { facili = sbEt.base; etichettateF = true; soloGarminF = true; }
    const setFacili = new Set(facili);
    if (facili.length >= 3) {
      const pt = facili.map(puntoEf).sort((x, y) => x.t - y.t);
      out.facile = Object.assign(regressione(pt), { soloGarmin: soloGarminF, etichettate: etichettateF });
    }
    const TIPI_Q = ['ripetute', 'fartlek', 'soglia', 'ritmogara', 'progressivo'];
    const sqEt = sceltaBase(eleg.filter(a => TIPI_Q.indexOf(conNome(a)) >= 0), 5);
    let baseQ, etichettateQ = false, soloGarminQ;
    if (sqEt.soloGarmin && sqEt.base.length >= 5) { baseQ = sqEt.base; etichettateQ = true; soloGarminQ = true; }
    else { const sq = sceltaBase(eleg.filter(a => !setFacili.has(a) && eQualita(a, p75)), 5); baseQ = sq.base; soloGarminQ = sq.soloGarmin; }
    if (baseQ.length >= 3) {
      const pt = baseQ.map(puntoEf).sort((x, y) => x.t - y.t);
      const q = Object.assign(regressione(pt), { soloGarmin: soloGarminQ, etichettate: etichettateQ });
      // miglior km di ogni lavoro (dove l'orologio lo registra): velocità in m/s e sua tendenza
      const km = pt.filter(p => Number(p.a.fastest_1km_s) > 0).map(p => ({ t: p.t, ef: 1000 / Number(p.a.fastest_1km_s), tempo: Number(p.a.fastest_1km_s), data: p.data }));
      q.km = km;
      q.kmTrend = km.length >= 4 ? regressione(km) : null;
      out.qualita = q;
    }
  }
  cacheTrend = out;
  return out;
}
function calcolaTrendEfficienza() { return calcolaTendenze().facile; }
function calcolaTrendQualita() { return calcolaTendenze().qualita; }

// Scenario "Tua tendenza": unisce la tendenza delle corse tranquille e quella dei lavori di qualità,
// pesando di più la più affidabile (peso = 1 / incertezza^2).
function tendenzaCombinata() {
  const f = calcolaTrendEfficienza(), q = calcolaTrendQualita();
  const okF = f && f.soloGarmin && f.n >= 8 && f.spanGiorni >= 28;
  const okQ = q && q.soloGarmin && q.n >= 5 && q.spanGiorni >= 28;
  if (!okF && !okQ) return null;
  const parti = [];
  if (okF) parti.push(f);
  if (okQ) parti.push(q);
  let sw = 0, sr = 0;
  parti.forEach(p => { const w = 1 / (p.sigmaRate * p.sigmaRate); sw += w; sr += w * p.grezzo; });
  const grezzo = sr / sw;
  const sigmaRate = Math.max(SIGMA_RATE, Math.sqrt(1 / sw));
  return {
    grezzo, sigmaRate, rate: Math.max(-0.02, Math.min(CAP_TENDENZA, grezzo)), limitata: grezzo > CAP_TENDENZA,
    nota: [okF ? f.n + ' corse tranquille' : '', okQ ? q.n + ' lavori di qualità' : ''].filter(Boolean).join(' + ')
  };
}

function elencoScenari() {
  const out = SCENARI_FISSI.slice();
  const t = tendenzaCombinata();
  if (t) {
    const bassa = t.sigmaRate > 0.02;
    out.push({
      chiave: 'tendenza', nome: 'Tua tendenza', rate: t.rate, sigmaRate: t.sigmaRate, colore: '#00f0ff',
      nota: 'da ' + t.nota + (t.limitata ? ', limitata al ' + fmtRate(CAP_TENDENZA) + ' al mese' : '') + (bassa ? ', affidabilità bassa' : ''),
      avviso: bassa ? 'Questa tendenza si basa su pochi dati molto variabili: la percentuale è poco affidabile.' : ''
    });
  }
  return out;
}

function indiceGiorno(d, oggi) { return Math.round((d.getTime() - oggi.getTime()) / 86400000); }

// Intervallo di stop in giorni da oggi (0 = oggi). Se manca la fine, lo stop dura fino alla gara.
function intervalloStop(giorni) {
  if (!stopDa && !stopA) return null;
  const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
  let s = stopDa ? indiceGiorno(stopDa, oggi) : 0;
  let e = stopA ? indiceGiorno(stopA, oggi) : giorni - 1;
  if (e < s) { const t = s; s = e; e = t; }
  s = Math.max(0, s); e = Math.min(giorni - 1, e);
  return e >= s ? { s, e, n: e - s + 1 } : null;
}

function testoStop(stop) {
  if (!stop) return 'nessuno stop';
  const oggi = new Date();
  const d0 = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() + stop.s);
  const d1 = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() + stop.e);
  return 'stop dal ' + formatDateShort(d0) + ' al ' + formatDateShort(d1) + ' (' + stop.n + (stop.n === 1 ? ' giorno' : ' giorni') + ')';
}

// Giorno per giorno: in stop si perde un po' di forma, altrimenti si progredisce al ritmo dello scenario.
// (Qui, in futuro, si potrà usare un ritmo diverso per ogni settimana in base alla scheda di allenamento.)
function simulaGiorni(E, rate, giorni, stop) {
  const serie = [E];
  const prog = Math.pow(1 - rate, 1 / 30.44);
  let t = E;
  for (let d = 0; d < giorni; d++) {
    t = (stop && d >= stop.s && d <= stop.e) ? t * (1 + DETRAIN_SETT / 7) : t * prog;
    serie.push(t);
  }
  return serie;
}

function probObiettivo(E, giorni, sc, stop, goal) {
  const serie = simulaGiorni(E, sc.rate, Math.max(0, giorni), stop);
  const tempo = serie[serie.length - 1];
  const mesiProgresso = Math.max(0, giorni - (stop ? stop.n : 0)) / 30.44;
  const sr = sc.sigmaRate || SIGMA_RATE;
  const sigma = tempo * Math.sqrt(SIGMA_GARA * SIGMA_GARA + Math.pow(sr * mesiProgresso, 2));
  return { tempo, sigma, prob: normCdf((goal - tempo) / sigma), serie };
}

function scegliScenario(chiave) {
  scenarioScelto = chiave;
  salvaIpotesi();
  renderRecords();
  renderPrevisioneFutura();
}

function fmtProb(p) {
  const x = p * 100;
  return x < 0.5 ? '<1%' : x > 99.5 ? '>99%' : Math.round(x) + '%';
}

function giudizioProb(p) {
  if (p >= 0.75) return ['Molto probabile', 'text-emerald-400', '#10b981'];
  if (p >= 0.5) return ['Probabile', 'text-lime-400', '#84cc16'];
  if (p >= 0.25) return ['Possibile ma incerto', 'text-amber-400', '#ff9d00'];
  if (p >= 0.1) return ['Difficile', 'text-orange-400', '#ff6b00'];
  return ['Molto difficile', 'text-red-400', '#ef4444'];
}

function fmtRate(r) { return (r * 100).toFixed(1).replace('.', ',') + '%'; }
function fmtNum(v, dec) { return Number(v).toFixed(dec).replace('.', ','); }
function isoLocale(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// ---------- confronto periodi ----------
function elencoPeriodi(tipo) {
  const out = [];
  const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
  if (tipo === 'mese') {
    const mesi = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
    for (let i = 0; i < 9; i++) {
      const da = new Date(oggi.getFullYear(), oggi.getMonth() - i, 1);
      const a = new Date(oggi.getFullYear(), oggi.getMonth() - i + 1, 1);
      out.push({ da, a, label: (i === 0 ? 'Questo mese: ' : '') + mesi[da.getMonth()] + ' ' + da.getFullYear() });
    }
  } else {
    const lun = lunediDi(oggi);
    for (let i = 0; i < 16; i++) {
      const da = new Date(lun.getTime()); da.setDate(da.getDate() - 7 * i);
      const a = new Date(da.getTime()); a.setDate(a.getDate() + 7);
      const ultimo = new Date(a.getTime() - 86400000);
      out.push({ da, a, label: (i === 0 ? 'Questa settimana: ' : '') + formatDateShort(da) + ' – ' + formatDateShort(ultimo) });
    }
  }
  return out;
}

function metrichePeriodo(p) {
  const t0 = p.da.getTime(), t1 = p.a.getTime();
  const acts = (rawData.activities || []).filter(a => {
    const d = dataAttivita(a);
    return !isNaN(d) && d.getTime() >= t0 && d.getTime() < t1 && Number(a.duration_min) > 0;
  });
  const runs = soloCorse(acts);
  const km = runs.reduce((s, a) => s + Number(a.distance_km), 0);
  const minCorsa = runs.reduce((s, a) => s + Number(a.duration_min), 0);
  const conFc = runs.filter(a => Number(a.avg_hr) > 0);
  const minFc = conFc.reduce((s, a) => s + Number(a.duration_min), 0);
  const giorni = getHealthArray().filter(g => g.date >= isoLocale(p.da) && g.date < isoLocale(p.a));
  const media = chiavi => {
    const v = giorni.map(g => Number(getVal(g, chiavi))).filter(x => x > 0);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };
  return {
    km: runs.length ? km : null,
    minuti: acts.reduce((s, a) => s + Number(a.duration_min), 0),
    sessioni: acts.length,
    passo: km > 0 ? minCorsa * 60 / km : null,
    fc: minFc > 0 ? conFc.reduce((s, a) => s + Number(a.avg_hr) * Number(a.duration_min), 0) / minFc : null,
    lungo: runs.length ? Math.max.apply(null, runs.map(a => Number(a.distance_km))) : null,
    sonno: media(['sleep_hours']),
    hrv: media(['hrv']),
    fcRiposo: media(['resting_hr']),
    passi: media(['steps'])
  };
}

const COL_BENE = 'text-emerald-400', COL_MALE = 'text-orange-400', COL_NEUTRO = 'text-slate-300';

function tabellaConfronto(righe, A, B, etA, etB) {
  const celle = righe.map(r => {
    const va = r.val(A), vb = r.val(B);
    const vuoto = v => v === null || v === undefined || v === '' || (typeof v === 'number' && !isFinite(v));
    if (vuoto(va) && vuoto(vb)) return '';
    let delta = '', classe = COL_NEUTRO;
    if (!r.testo && !vuoto(va) && !vuoto(vb)) {
      const diff = va - vb;
      const piccolo = Math.abs(diff) < 1e-9;
      delta = piccolo ? '=' : (diff > 0 ? '+' : '-') + r.d(Math.abs(diff));
      if (!piccolo && r.mig) classe = ((diff > 0) === (r.mig === 'alto')) ? COL_BENE : COL_MALE;
    }
    return '<tr class="border-t border-white/5"><td class="py-2 pr-3 text-slate-400">' + esc(r.nome) + '</td>' +
      '<td class="py-2 px-2 text-right text-white font-semibold">' + (vuoto(va) ? '--' : esc(r.testo ? va : r.fmt(va))) + '</td>' +
      '<td class="py-2 px-2 text-right text-white font-semibold">' + (vuoto(vb) ? '--' : esc(r.testo ? vb : r.fmt(vb))) + '</td>' +
      '<td class="py-2 pl-2 text-right font-bold ' + classe + '">' + esc(delta) + '</td></tr>';
  }).join('');
  return '<table class="w-full text-xs min-w-[420px]"><thead><tr class="text-slate-500 uppercase tracking-wider text-left">' +
    '<th class="pb-2 font-bold">Misura</th><th class="pb-2 font-bold text-right">' + esc(etA) + '</th><th class="pb-2 font-bold text-right">' + esc(etB) + '</th><th class="pb-2 font-bold text-right">Differenza</th></tr></thead><tbody>' + celle + '</tbody></table>';
}

const RIGHE_PERIODO = [
  { nome: 'Km di corsa', val: m => m.km, fmt: v => fmtNum(v, 1) + ' km', d: x => fmtNum(x, 1) + ' km', mig: 'alto' },
  { nome: 'Ore di attività (tutte)', val: m => m.minuti > 0 ? m.minuti / 60 : null, fmt: v => formatOreMinuti(v), d: x => formatOreMinuti(x), mig: 'alto' },
  { nome: 'Sessioni', val: m => m.sessioni, fmt: v => String(v), d: x => String(Math.round(x)), mig: 'alto' },
  { nome: 'Passo medio di corsa', val: m => m.passo, fmt: v => fmtPasso(v), d: x => Math.round(x) + ' s/km', mig: 'basso' },
  { nome: 'FC media nelle corse', val: m => m.fc, fmt: v => Math.round(v) + ' bpm', d: x => Math.round(x) + ' bpm', mig: null },
  { nome: 'Corsa più lunga', val: m => m.lungo, fmt: v => fmtNum(v, 1) + ' km', d: x => fmtNum(x, 1) + ' km', mig: 'alto' },
  { nome: 'Sonno medio', val: m => m.sonno, fmt: v => formatOreMinuti(v), d: x => formatOreMinuti(x), mig: 'alto' },
  { nome: 'HRV medio', val: m => m.hrv, fmt: v => Math.round(v) + ' ms', d: x => Math.round(x) + ' ms', mig: 'alto' },
  { nome: 'FC a riposo', val: m => m.fcRiposo, fmt: v => Math.round(v) + ' bpm', d: x => Math.round(x) + ' bpm', mig: 'basso' },
  { nome: 'Passi al giorno', val: m => m.passi, fmt: v => Math.round(v).toLocaleString('it-IT'), d: x => Math.round(x).toLocaleString('it-IT'), mig: 'alto' }
];

function riempiSelect(el, items, indiceSel) {
  el.innerHTML = items.map((x, i) => '<option value="' + i + '"' + (i === indiceSel ? ' selected' : '') + '>' + esc(x.label) + '</option>').join('');
  el.value = String(indiceSel);
}

function renderConfrontoPeriodi() {
  const iA = Number(document.getElementById('cmpA').value) || 0;
  const iB = Number(document.getElementById('cmpB').value) || 0;
  const pA = periodiCorrenti[iA], pB = periodiCorrenti[iB];
  const box = document.getElementById('cmpPeriodiTabella');
  if (!pA || !pB) { box.innerHTML = ''; return; }
  const etichetta = p => p.label.replace('Questa settimana: ', 'Questa sett. ').replace('Questo mese: ', '');
  box.innerHTML = tabellaConfronto(RIGHE_PERIODO, metrichePeriodo(pA), metrichePeriodo(pB), etichetta(pA), etichetta(pB));
}

// ---------- confronto allenamenti ----------
const RIGHE_ATTIVITA = [
  { nome: 'Disciplina', testo: true, val: a => disciplinaDi(a) },
  { nome: 'Data', testo: true, val: a => fmtData(dataAttivita(a)) },
  { nome: 'Distanza', val: a => Number(a.distance_km) > 0 ? Number(a.distance_km) : null, fmt: v => fmtNum(v, 2) + ' km', d: x => fmtNum(x, 2) + ' km', mig: null },
  { nome: 'Durata', val: a => Number(a.duration_min) > 0 ? Number(a.duration_min) * 60 : null, fmt: v => fmtTempo(v), d: x => fmtTempo(x), mig: null },
  { nome: 'Passo', val: a => Number(a.distance_km) > 0 && Number(a.duration_min) > 0 ? Number(a.duration_min) * 60 / Number(a.distance_km) : null, fmt: v => fmtPasso(v), d: x => Math.round(x) + ' s/km', mig: 'basso' },
  { nome: 'FC media', val: a => Number(a.avg_hr) > 0 ? Number(a.avg_hr) : null, fmt: v => Math.round(v) + ' bpm', d: x => Math.round(x) + ' bpm', mig: null },
  { nome: 'FC massima', val: a => Number(a.max_hr) > 0 ? Number(a.max_hr) : null, fmt: v => Math.round(v) + ' bpm', d: x => Math.round(x) + ' bpm', mig: null },
  { nome: 'Cadenza', val: a => Number(a.avg_cadence) > 0 ? Number(a.avg_cadence) : null, fmt: v => Math.round(v) + ' spm', d: x => Math.round(x) + ' spm', mig: null },
  { nome: 'Dislivello', val: a => Number(a.elevation_gain_m) > 0 ? Number(a.elevation_gain_m) : null, fmt: v => Math.round(v) + ' m', d: x => Math.round(x) + ' m', mig: null },
  { nome: 'Calorie', val: a => Number(a.calories) > 0 ? Number(a.calories) : null, fmt: v => Math.round(v) + ' kcal', d: x => Math.round(x) + ' kcal', mig: null },
  { nome: 'Effetto allenante', val: a => Number(a.aerobic_te) > 0 ? Number(a.aerobic_te) : null, fmt: v => fmtNum(v, 1), d: x => fmtNum(x, 1), mig: null }
];
const COLORI_ZONE = ['#64748b', '#38bdf8', '#10b981', '#ff9d00', '#ef4444'];

function barraZone(a, nome) {
  const z = Array.isArray(a.hr_zones_sec) ? a.hr_zones_sec.map(v => Number(v) || 0) : [];
  const tot = z.reduce((s, v) => s + v, 0);
  if (!(tot > 0)) return '<div class="text-xs text-slate-500 mb-3">' + esc(nome) + ': zone di frequenza non disponibili</div>';
  return '<div class="mb-3"><p class="text-xs text-slate-400 mb-1">' + esc(nome) + '</p><div class="flex h-4 rounded-full overflow-hidden">' +
    z.map((v, i) => '<div title="Z' + (i + 1) + ': ' + Math.round(v / tot * 100) + '%" style="width:' + (v / tot * 100) + '%;background:' + COLORI_ZONE[i] + '"></div>').join('') + '</div>' +
    '<p class="text-xs text-slate-500 mt-1">' + z.map((v, i) => 'Z' + (i + 1) + ' ' + Math.round(v / tot * 100) + '%').join(' • ') + '</p></div>';
}

function renderConfrontoAttivita() {
  const iA = Number(document.getElementById('cmpActA').value) || 0;
  const iB = Number(document.getElementById('cmpActB').value) || 0;
  const a = elencoAttCmp[iA], b = elencoAttCmp[iB];
  const box = document.getElementById('cmpAttivitaTabella');
  if (!a || !b) { box.innerHTML = '<p class="text-sm text-slate-400">Servono almeno due attività.</p>'; return; }
  box.innerHTML = tabellaConfronto(RIGHE_ATTIVITA, a, b, 'Allenamento A', 'Allenamento B') +
    '<div class="mt-4"><p class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Tempo nelle zone di frequenza cardiaca</p>' + barraZone(a, 'A') + barraZone(b, 'B') + '</div>';
}

// ---------- efficienza ----------
function renderEfficienza() {
  const canvas = document.getElementById('chartEfficienza');
  const sommario = document.getElementById('effSommario');
  if (chartEfficienzaInstance) { chartEfficienzaInstance.destroy(); chartEfficienzaInstance = null; }
  const t = calcolaTrendEfficienza();
  if (!t) { sommario.innerText = 'Servono almeno 4 corse da 4 km o più con la frequenza cardiaca, di cui 3 tranquille, per vedere l\'andamento.'; return; }
  const punti = t.punti, n = t.n;
  const ora = Date.now(), g = 86400000;
  const rec = punti.filter(p => ora - p.t <= 30 * g), prec = punti.filter(p => ora - p.t > 30 * g && ora - p.t <= 90 * g);
  const mediaEf = a => a.reduce((s, p) => s + p.ef, 0) / a.length;
  let confr = '';
  if (rec.length && prec.length) {
    const v = (mediaEf(rec) / mediaEf(prec) - 1) * 100;
    confr = ' Ultimi 30 giorni rispetto ai 60 precedenti: ' + (v >= 0 ? '+' : '') + v.toFixed(1).replace('.', ',') + '%.';
  }
  sommario.innerText = 'Metri percorsi per ogni battito (più alto = più efficiente) nel 60% delle tue corse da 4 km o più con FC più bassa, per confrontare sforzi simili. ' + n + ' corse.' + confr +
    ' La tendenza è circa ' + (t.gMens >= 0 ? '+' : '') + (t.gMens * 100).toFixed(1).replace('.', ',') + '% al mese' +
    (t.soloGarmin && t.n >= 8 && t.spanGiorni >= 28
      ? ' e alimenta lo scenario "Tua tendenza" della previsione, insieme a quella dei lavori di qualità qui sotto' + (t.limitata ? ' (progresso limitato al ' + fmtRate(CAP_TENDENZA) + ' al mese: una tendenza breve non si può estrapolare per mesi)' : '')
      : '. Per ora non entra nella previsione: servono almeno 8 corse tranquille registrate dal Garmin su 4 settimane') + '. ' +
    (t.soloGarmin ? 'Uso solo corse registrate dal Garmin, per non mescolare due orologi. ' : 'Attenzione: i punti includono corse di due orologi diversi, i battiti potrebbero non essere confrontabili. ') +
    (t.etichettate ? 'Uso le corse che hai chiamato "easy/lento/facile" nel nome. ' : 'Le corse tranquille le scelgo dai battiti: se le chiami "easy" o "lento" nel nome sono più precisa. ') + 'Caldo, freddo, stanchezza e dislivello spostano i punti: la tendenza è indicativa.';
  chartEfficienzaInstance = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: punti.map(p => formatDateShort(p.data)),
      datasets: [
        { label: 'Efficienza (m per battito)', data: punti.map(p => Math.round(p.ef * 1000) / 1000), borderColor: '#10b981', backgroundColor: '#10b981', pointRadius: 4, borderWidth: 2, tension: 0.2 },
        { label: 'Tendenza', data: t.trend.map(v => Math.round(v * 1000) / 1000), borderColor: '#ff9d00', borderDash: [6, 6], pointRadius: 0, borderWidth: 2 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#94a3b8' } }, tooltip: { callbacks: { label: (ctx) => ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(2).replace('.', ',') } } },
      scales: { x: { ticks: { color: '#64748b' }, grid: { display: false } }, y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } } }
    }
  });
}

// ---------- lavori di qualità (soglia, ripetute, ritmo gara) ----------
let chartQualitaInstance = null;
function renderQualita() {
  const canvas = document.getElementById('chartQualita');
  const sommario = document.getElementById('qualSommario');
  if (!canvas || !sommario) return;
  if (chartQualitaInstance) { chartQualitaInstance.destroy(); chartQualitaInstance = null; }
  const q = calcolaTrendQualita();
  if (!q) { sommario.innerText = 'Servono almeno 3 lavori di qualità da 4 km o più (ripetute, soglia, ritmo gara…) con la frequenza cardiaca per vedere l\'andamento. Li riconosco dal nome (ripetute, soglia, fartlek, passo gara, pista…) o dal tempo nelle zone cardiache alte.'; return; }
  const pct = v => (v >= 0 ? '+' : '') + (v * 100).toFixed(1).replace('.', ',') + '%';
  let km = '';
  if (q.kmTrend) km = ' Il miglior chilometro dei tuoi lavori va a circa ' + pct(q.kmTrend.gMens) + ' di velocità al mese (solo informativo: non entra nella previsione).';
  sommario.innerText = q.n + ' lavori di qualità (riconosciuti dal nome o dal tempo nelle zone 4-5). Efficienza media del lavoro in metri per battito: tendenza circa ' + pct(q.gMens) + ' al mese. ' +
    (q.soloGarmin && q.n >= 5 && q.spanGiorni >= 28 ? 'Alimenta lo scenario "Tua tendenza", combinata con quella delle corse tranquille e pesando di più la più affidabile' + (q.limitata ? ' (limitata al ' + fmtRate(CAP_TENDENZA) + ' al mese)' : '') + '.'
      : !q.soloGarmin ? 'Non entra nella previsione perché mescola due orologi (servono almeno 5 lavori registrati dal Garmin).'
      : 'Per ora sono pochi o troppo ravvicinati per entrare nella previsione (servono almeno 5 lavori su 4 settimane).') + km +
    (q.soloGarmin ? ' Uso solo sedute registrate dal Garmin.' : ' Attenzione: i punti includono due orologi diversi.') + (q.etichettate ? ' Uso i lavori che hai chiamato ripetute/soglia/fartlek ecc. nel nome.' : ' Se chiami i lavori "ripetute", "soglia", "fartlek"… nel nome li riconosco meglio.') + ' Nelle ripetute la media include i recuperi: guarda la tendenza, non il singolo punto.';
  const datasets = [
    { label: 'Efficienza nei lavori (m per battito)', data: q.punti.map(p => Math.round(p.ef * 1000) / 1000), borderColor: '#ff6b00', backgroundColor: '#ff6b00', pointRadius: 5, borderWidth: 0, showLine: false, yAxisID: 'y' },
    { label: 'Tendenza', data: q.trend.map(v => Math.round(v * 1000) / 1000), borderColor: '#ff9d00', borderDash: [6, 6], pointRadius: 0, borderWidth: 2, yAxisID: 'y' }
  ];
  const conKm = q.punti.map(p => Number(p.a.fastest_1km_s) > 0 ? Number(p.a.fastest_1km_s) : null);
  const haKm = conKm.some(v => v !== null);
  if (haKm) datasets.push({ label: 'Miglior km (passo)', data: conKm, borderColor: '#00f0ff', backgroundColor: '#00f0ff', pointStyle: 'rectRot', pointRadius: 5, borderWidth: 0, showLine: false, yAxisID: 'y1' });
  const scales = {
    x: { ticks: { color: '#64748b' }, grid: { display: false } },
    y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' }, title: { display: true, text: 'm per battito', color: '#64748b' } }
  };
  if (haKm) scales.y1 = { position: 'right', reverse: true, ticks: { color: '#00f0ff', callback: (v) => fmtPasso(v) }, grid: { drawOnChartArea: false } };
  chartQualitaInstance = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels: q.punti.map(p => formatDateShort(p.data) + ' • ' + (String(p.a.name || '').slice(0, 18))), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#94a3b8' } },
        tooltip: { callbacks: { label: (ctx) => ctx.dataset.yAxisID === 'y1' ? ctx.dataset.label + ': ' + fmtPasso(ctx.parsed.y) : ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(2).replace('.', ',') } }
      },
      scales
    }
  });
}

// ---------- previsione verso la gara ----------
const bandaStop = {
  id: 'bandaStop',
  beforeDatasetsDraw(chart, args, opts) {
    try {
      if (!opts || opts.da === undefined || opts.da === null) return;
      const x = chart.scales.x, area = chart.chartArea, ctx = chart.ctx;
      const x0 = x.getPixelForValue(opts.da), x1 = x.getPixelForValue(opts.a);
      ctx.save();
      ctx.fillStyle = 'rgba(239,68,68,0.14)';
      ctx.fillRect(x0, area.top, Math.max(2, x1 - x0), area.bottom - area.top);
      ctx.restore();
    } catch (e) { /* se qualcosa va storto il grafico resta senza banda */ }
  }
};

function renderPrevisioneFutura() {
  const sommario = document.getElementById('prevSommario');
  const tab = document.getElementById('prevTabella');
  const info = document.getElementById('prevStopInfo');
  const canvas = document.getElementById('chartPrevisione');
  const daEl = document.getElementById('cmpStopDa'), aEl = document.getElementById('cmpStopA');
  if (chartPrevisioneInstance) { chartPrevisioneInstance.destroy(); chartPrevisioneInstance = null; }
  tab.innerHTML = '';
  daEl.value = stopDa ? isoLocale(stopDa) : '';
  aEl.value = stopA ? isoLocale(stopA) : '';
  if (!statoGara) { info.innerText = ''; sommario.innerText = 'Serve una gara impostata (con distanza e tempo obiettivo) e abbastanza corse per stimare la forma di oggi.'; return; }
  const { E, goal, D, giorni, titolo } = statoGara;
  const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
  const dataGara = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() + giorni);
  daEl.min = aEl.min = isoLocale(oggi);
  daEl.max = aEl.max = isoLocale(dataGara);
  if (!(giorni > 0)) { info.innerText = ''; sommario.innerText = 'La gara è già arrivata: la previsione ha senso solo per il futuro.'; return; }

  const stop = intervalloStop(giorni);
  info.innerText = stop
    ? 'Ipotesi: ' + testoStop(stop) + '. Durante lo stop non c\'è progresso e si perde un po\' di forma (circa 0,3% a settimana).'
    : 'Nessuno stop: se prevedi di fermarti, scegli le date qui sopra (se indichi solo "dal", lo stop dura fino alla gara).';
  sommario.innerText = 'Partendo dalla stima di oggi su ' + (D === 21.0975 ? 'mezza maratona' : D + ' km') + ' (' + fmtTempo(E) + '), giorno per giorno fino a ' + titolo + ' (' + giorni + ' giorni): ecco i tempi che potresti ottenere in base al ritmo di progresso. La linea più spessa è lo scenario scelto nella card della gara.';

  const scenari = elencoScenari();
  const risultati = scenari.map(sc => ({ sc, r: probObiettivo(E, giorni, sc, stop, goal) }));
  const labels = [];
  for (let d = 0; d <= giorni; d++) labels.push(d === 0 ? 'Oggi' : formatDateShort(new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() + d)));
  const datasets = risultati.map(o => ({
    label: o.sc.nome + ' (' + fmtRate(o.sc.rate) + '/mese)',
    data: o.r.serie.map(v => Math.round(v)),
    borderColor: o.sc.colore, backgroundColor: o.sc.colore,
    borderWidth: o.sc.chiave === scenarioScelto ? 3.5 : 1.5, pointRadius: 0, tension: 0
  }));
  datasets.push({ label: 'Obiettivo ' + fmtTempo(goal), data: labels.map(() => goal), borderColor: '#ef4444', borderDash: [6, 6], pointRadius: 0, borderWidth: 2 });
  chartPrevisioneInstance = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels, datasets },
    plugins: [bandaStop],
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#94a3b8' } },
        bandaStop: stop ? { da: stop.s, a: stop.e + 1 } : null,
        tooltip: { callbacks: { label: (ctx) => ctx.dataset.label + ': ' + fmtTempo(ctx.parsed.y) } }
      },
      scales: {
        x: { ticks: { color: '#64748b', maxTicksLimit: 8, autoSkip: true }, grid: { display: false } },
        y: { title: { display: true, text: 'Tempo (più in basso = più veloce)', color: '#64748b' }, ticks: { color: '#64748b', callback: (v) => fmtTempo(v) }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
  tab.innerHTML = '<table class="w-full text-xs min-w-[460px]"><thead><tr class="text-slate-500 uppercase tracking-wider text-left"><th class="pb-2 font-bold">Scenario</th><th class="pb-2 font-bold text-right">Progresso</th><th class="pb-2 font-bold text-right">Tempo in gara</th><th class="pb-2 font-bold text-right">Passo</th><th class="pb-2 font-bold text-right">Probabilità di ≤ ' + fmtTempo(goal) + '</th></tr></thead><tbody>' +
    risultati.map(o => {
      const g3 = giudizioProb(o.r.prob);
      return '<tr class="border-t border-white/5' + (o.sc.chiave === scenarioScelto ? ' bg-white/5' : '') + '"><td class="py-2 text-white font-semibold"><span class="inline-block w-2.5 h-2.5 rounded-full mr-2" style="background:' + o.sc.colore + '"></span>' + esc(o.sc.nome) + (o.sc.nota ? ' <span class="text-slate-500 font-normal">' + esc(o.sc.nota) + '</span>' : '') + '</td>' +
        '<td class="py-2 text-right text-slate-300">' + (o.sc.rate >= 0 ? '' : '-') + fmtRate(Math.abs(o.sc.rate)) + '/mese</td>' +
        '<td class="py-2 text-right text-white font-bold">' + fmtTempo(o.r.tempo) + ' <span class="text-slate-500 font-normal">±' + fmtTempo(o.r.sigma) + '</span></td>' +
        '<td class="py-2 text-right text-slate-300">' + fmtPasso(o.r.tempo / D) + '</td>' +
        '<td class="py-2 text-right font-bold ' + g3[1] + '">' + fmtProb(o.r.prob) + ' <span class="font-normal">' + g3[0] + '</span></td></tr>';
    }).join('') + '</tbody></table>';
}

function initComparazione() {
  const tipo = document.getElementById('cmpTipo');
  const ripopolaPeriodi = () => {
    periodiCorrenti = elencoPeriodi(tipo.value);
    riempiSelect(document.getElementById('cmpA'), periodiCorrenti, 0);
    riempiSelect(document.getElementById('cmpB'), periodiCorrenti, 1);
  };
  ripopolaPeriodi();
  tipo.addEventListener('change', () => { ripopolaPeriodi(); renderConfrontoPeriodi(); });
  document.getElementById('cmpA').addEventListener('change', renderConfrontoPeriodi);
  document.getElementById('cmpB').addEventListener('change', renderConfrontoPeriodi);

  elencoAttCmp = (rawData.activities || []).filter(a => Number(a.duration_min) > 0 && !isNaN(dataAttivita(a)))
    .sort((x, y) => dataAttivita(y) - dataAttivita(x)).slice(0, 60);
  const eti = a => fmtData(dataAttivita(a)) + ' • ' + disciplinaDi(a) + (Number(a.distance_km) > 0 ? ' ' + fmtNum(a.distance_km, 1) + ' km' : '') + (a.name ? ' • ' + a.name : '');
  const voci = elencoAttCmp.map(a => ({ label: eti(a) }));
  riempiSelect(document.getElementById('cmpActA'), voci, 0);
  // B di default: l'ultimo allenamento della stessa disciplina di A (confronto più sensato)
  let idxB = Math.min(1, Math.max(0, voci.length - 1));
  if (elencoAttCmp.length > 1) {
    const disc0 = disciplinaDi(elencoAttCmp[0]);
    const trovato = elencoAttCmp.findIndex((x, i) => i > 0 && disciplinaDi(x) === disc0);
    if (trovato > 0) idxB = trovato;
  }
  riempiSelect(document.getElementById('cmpActB'), voci, idxB);
  document.getElementById('cmpActA').addEventListener('change', renderConfrontoAttivita);
  document.getElementById('cmpActB').addEventListener('change', renderConfrontoAttivita);

  const daEl = document.getElementById('cmpStopDa'), aEl = document.getElementById('cmpStopA');
  const leggi = el => el.value ? new Date(el.value + 'T00:00:00') : null;
  const aggiornaStop = () => { stopDa = leggi(daEl); stopA = leggi(aEl); salvaIpotesi(); renderRecords(); renderPrevisioneFutura(); };
  daEl.addEventListener('change', aggiornaStop);
  aEl.addEventListener('change', aggiornaStop);
  document.getElementById('cmpStopReset').addEventListener('click', () => { stopDa = null; stopA = null; salvaIpotesi(); renderRecords(); renderPrevisioneFutura(); });
}

caricaIpotesi();

function renderComparazione() {
  if (!document.getElementById('cmpTipo') || !rawData) return;
  if (!comparazioneInizializzata) { initComparazione(); comparazioneInizializzata = true; }
  renderConfrontoPeriodi();
  renderConfrontoAttivita();
  renderEfficienza();
  renderQualita();
  renderPrevisioneFutura();
}
// ==== FINE COMPARAZIONE E PREVISIONE ====

// ==== ATTIVITA ====
let attFiltrate = [];
let attVisibili = 40;
let attInizializzata = false;
let attCorrente = null;
let attDettCorrente = null;
let attCharts = [];
let pianoDati = null;
const attPerChiave = {};

const NOMI_TIPO = { tennis: 'Tennis', camminata: 'Camminata', bici: 'Bici', nuoto: 'Nuoto', facile: 'Facile', lungo: 'Lungo', progressivo: 'Progressivo', soglia: 'Soglia', ritmogara: 'Ritmo gara', ripetute: 'Ripetute', fartlek: 'Fartlek', gara: 'Gara', forza: 'Forza', corsa: 'Corsa', altro: 'Altro' };
const TIPI_ALLENAMENTO = [['auto', 'Automatico'], ['facile', 'Facile / rigenerante'], ['lungo', 'Lungo'], ['progressivo', 'Progressivo'], ['soglia', 'Soglia / medio'], ['ritmogara', 'Ritmo gara'], ['ripetute', 'Ripetute'], ['fartlek', 'Fartlek'], ['gara', 'Gara'], ['altro', 'Altro']];
const PAROLE_TIPO = [
  ['ritmogara', /passo gara|ritmo gara|race pace/i],
  ['gara', /\bgara\b|\brace\b|\bmezza\b|maratona/i],
  ['ripetute', /ripet|interv|\d+\s*x\s*\d+|\bserie\b|hill repeat/i],
  ['fartlek', /fartlek|variazion|allung/i],
  ['soglia', /soglia|threshold|\btempo\b|\bmedio\b/i],
  ['progressivo', /progress/i],
  ['lungo', /lungo|long run|\bfondo\b/i],
  ['facile', /easy|lento|rigener|recupero|defatic|facile/i]
];
const OBIETTIVI = {
  facile: 'Costruire base aerobica e recuperare: battiti bassi, passo comodo, nessuna fatica a fine corsa.',
  lungo: 'Sviluppare resistenza e la capacità di mantenere il ritmo nel tempo, con i battiti sotto controllo fino alla fine.',
  progressivo: 'Partire tranquillo e finire più veloce, con controllo: ogni parte un po\' più intensa della precedente.',
  soglia: 'Allenare la capacità di sostenere ritmi sostenuti: passo costante e battiti stabili nella zona di soglia.',
  ritmogara: 'Imparare il ritmo gara: passo regolare, vicino all\'obiettivo, con battiti stabili.',
  ripetute: 'Stimolo intenso con recuperi: ripetute costanti nel passo, battiti alti negli sforzi e recupero tra una e l\'altra.',
  fartlek: 'Variazioni di ritmo libere: stimolo di qualità e capacità di cambiare passo e recuperare.',
  gara: 'Dare il massimo con una gestione intelligente del ritmo: partenza controllata e finale forte.',
  forza: 'Sviluppare forza e stabilità muscolare a sostegno della corsa.',
  tennis: 'Allenare coordinazione, rapidità e resistenza con intensità variabile: valuto l\'intensità e, se inserisci il punteggio, il risultato.',
  camminata: 'Movimento a bassa intensità: recupero attivo e volume senza stress sulle gambe.',
  bici: 'Allenamento aerobico senza impatto: costanza di intensità e durata.',
  nuoto: 'Lavoro aerobico a corpo libero: costanza del ritmo e della frequenza.',
  corsa: 'Corsa non classificata: valuto battiti, passo e costanza.',
  altro: 'Attività complementare: movimento e carico cardiovascolare senza stress sulle gambe.'
};
const FONTI_TIPO = { nome: 'dal nome', dati: 'dai dati', piano: 'dal piano', manuale: 'scelto da te', orologio: 'segnata come gara sull\'orologio', tipo: 'dalla disciplina' };

function chiaveAtt(a) { return String(a.id || ('d' + a.date)); }
function eCorsa(a) { return String(a.type || '').toLowerCase().includes('run'); }
function passoAtt(a) { const km = Number(a.distance_km), min = Number(a.duration_min); return km > 0 && min > 0 ? min * 60 / km : null; }
function mediaArr(v) { return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; }
function medianaArr(v) { if (!v.length) return 0; const o = v.slice().sort((x, y) => x - y); const m = Math.floor(o.length / 2); return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2; }
function cvArr(v) { if (v.length < 3) return null; const m = mediaArr(v); const sd = Math.sqrt(mediaArr(v.map(x => (x - m) * (x - m)))); return m > 0 ? sd / m : null; }
function perc(x) { return Math.round(x * 100) + '%'; }
function quoteZone(a) {
  const z = Array.isArray(a.hr_zones_sec) ? a.hr_zones_sec.map(v => Number(v) || 0) : [];
  const tot = z.reduce((s, v) => s + v, 0);
  return tot > 0 && z.length === 5 ? z.map(v => v / tot) : null;
}
let noteInMemoria = {};   // copia di sicurezza se il browser non permette di salvare (es. navigazione privata)
function leggiNote() { try { return JSON.parse(localStorage.getItem('noteAttivita') || '{}'); } catch (e) { return noteInMemoria; } }
function salvaNote(n) { noteInMemoria = n; try { localStorage.setItem('noteAttivita', JSON.stringify(n)); } catch (e) { /* ignoro */ } }

function baselineCorse(escludi) {
  const lim = Date.now() - 90 * 86400000;
  const runs = soloCorse(rawData.activities || []).filter(r => r !== escludi && dataAttivita(r).getTime() >= lim);
  const km = runs.map(r => Number(r.distance_km));
  return { runs, medianaKm: medianaArr(km), lungoMax: km.length ? Math.max.apply(null, km) : 0 };
}

// ---- riconoscimento di ripetute da serie o da giri ----
function trovaRipetute(det) {
  if (!det) return null;
  const s = det.serie;
  if (s && s.spd && s.t) {
    const v = s.spd;
    const valid = v.filter(x => x !== null && x > 0.8).sort((x, y) => x - y);
    if (valid.length < 30) return null;
    const p = q => valid[Math.min(valid.length - 1, Math.floor(valid.length * q))];
    const lo = p(0.25), hi = p(0.85);
    if (hi - lo < 0.5) return null;
    const soglia = (lo + hi) / 2;
    const sm = v.map((x, i) => { const w = [v[i - 1], x, v[i + 1]].filter(y => y !== null && y !== undefined); return w.length ? mediaArr(w) : null; });
    const reps = [];
    let ini = null;
    for (let i = 0; i <= sm.length; i++) {
      const sopra = i < sm.length && sm[i] !== null && sm[i] >= soglia;
      if (sopra && ini === null) ini = i;
      if (!sopra && ini !== null) {
        const fin = i - 1, durata = s.t[fin] - s.t[ini];
        if (durata >= 30 && durata <= 900) {
          const idx = []; for (let k = ini; k <= fin; k++) if (v[k] !== null && v[k] > 0) idx.push(k);
          const hrs = s.hr ? idx.map(k => s.hr[k]).filter(x => x !== null && x !== undefined) : [];
          let hrDopo = null;
          if (s.hr) { const dopo = []; for (let k = fin + 1; k < s.t.length && s.t[k] - s.t[fin] <= 75; k++) if (s.hr[k] !== null && s.hr[k] !== undefined) dopo.push(s.hr[k]); if (dopo.length) hrDopo = Math.min.apply(null, dopo); }
          reps.push({ durata, passo: 1000 / mediaArr(idx.map(k => v[k])), hrMax: hrs.length ? Math.max.apply(null, hrs) : null, hrDopo });
        }
        ini = null;
      }
    }
    return reps.length >= 3 ? reps : null;
  }
  const L = det.laps;
  if (L && L.length >= 6 && L.filter(l => l.t <= 240).length >= L.length * 0.5) {
    const sp = L.map(l => l.d / l.t), ord = sp.slice().sort((x, y) => x - y);
    const lo = ord[Math.floor(ord.length * 0.25)], hi = ord[Math.min(ord.length - 1, Math.floor(ord.length * 0.85))];
    if (hi - lo < 0.5) return null;
    const soglia = (lo + hi) / 2;
    const reps = L.filter((l, i) => sp[i] >= soglia).map(l => ({ durata: l.t, passo: l.t / l.d * 1000, hrMax: l.hrMax || null, hrDopo: null }));
    return reps.length >= 3 ? reps : null;
  }
  return null;
}

function derivaCardiaca(laps) {
  const l = (laps || []).filter(x => x.d >= 700 && x.t > 0 && x.hr > 0);
  if (l.length < 4) return null;
  const m = Math.floor(l.length / 2);
  const A = l.slice(0, m), B = l.slice(l.length - m);
  const agg = arr => { const D = arr.reduce((s, x) => s + x.d, 0), T = arr.reduce((s, x) => s + x.t, 0); return { v: D / T, hr: arr.reduce((s, x) => s + x.hr * x.t, 0) / T }; };
  const a = agg(A), b = agg(B);
  return { deriva: ((b.hr / a.hr) / (b.v / a.v) - 1) * 100, passoA: 1000 / a.v, passoB: 1000 / b.v, hrA: a.hr, hrB: b.hr };
}

function pianoPer(a) {
  if (!Array.isArray(pianoDati)) return null;
  const g = String(a.date || '').slice(0, 10);
  return pianoDati.find(p => p && p.date === g) || null;
}

function riconosciTipo(a, det, base) {
  if (!eCorsa(a)) return { tipo: tipoSport(a), fonte: 'tipo' };
  if (String(a.event_type || '').toLowerCase() === 'race') return { tipo: 'gara', fonte: 'orologio' };
  const nome = String(a.name || '');
  for (let i = 0; i < PAROLE_TIPO.length; i++) if (PAROLE_TIPO[i][1].test(nome)) return { tipo: PAROLE_TIPO[i][0], fonte: 'nome' };
  const att = (a.split_summaries || []).find(x => /interval/i.test(x.type || '') && /active/i.test(x.type || ''));
  if (att && Number(att.n) >= 3) return { tipo: 'ripetute', fonte: 'dati' };
  const reps = trovaRipetute(det);
  if (reps && reps.length >= 4) return { tipo: 'ripetute', fonte: 'dati' };
  const z = quoteZone(a);
  if (z && z[3] + z[4] >= 0.25) return { tipo: 'soglia', fonte: 'dati' };
  const km = Number(a.distance_km);
  if (base && base.medianaKm > 0 && km >= base.medianaKm * 1.4 && km >= 10) return { tipo: 'lungo', fonte: 'dati' };
  const te = Number(a.aerobic_te);
  if (z && z[0] + z[1] >= 0.5) return { tipo: 'facile', fonte: 'dati' };
  if (te > 0 && te <= 2.5) return { tipo: 'facile', fonte: 'dati' };
  return { tipo: 'corsa', fonte: 'dati' };
}

// ---- analisi e voto (regole, non un'analisi personalizzata) ----
function etichettaVoto(v) { return v >= 8.5 ? 'Eccellente' : v >= 7.5 ? 'Molto buono' : v >= 6.5 ? 'Buono' : v >= 5.5 ? 'Discreto' : 'Da rivedere'; }

function analizzaAttivita(a, det, note, piano) {
  const base = baselineCorse(a);
  let info;
  if (note && note.tipo && note.tipo !== 'auto') info = { tipo: note.tipo, fonte: 'manuale' };
  else if (piano && piano.tipo) info = { tipo: piano.tipo, fonte: 'piano' };
  else info = riconosciTipo(a, det, base);
  const tipo = info.tipo;
  const out = { tipo, fonte: info.fonte, obiettivo: (piano && piano.obiettivo) || OBIETTIVI[tipo] || OBIETTIVI.altro, punti: [], voto: null, sintesi: '' };
  const P = (s, t) => out.punti.push({ s, t });
  const km = Number(a.distance_km), min = Number(a.duration_min), passo = passoAtt(a), hr = Number(a.avg_hr) || null;
  const durataTxt = min > 0 ? fmtTempo(min * 60) : '--';

  if (!eCorsa(a)) return analizzaNonCorsa(a, note || {}, out, P);

  const z = quoteZone(a), laps = (det && det.laps) || [], dv = derivaCardiaca(laps), te = Number(a.aerobic_te) || null;
  const rpe = note && Number(note.rpe) > 0 ? Number(note.rpe) : null;
  const interni = laps.filter((l, i) => l.d >= 900 && i > 0 && i < laps.length - 1).map(l => l.d / l.t);
  const cvPasso = cvArr(interni);
  let voto = 7;

  const derivaPunti = (okSoglia, malSoglia) => {
    if (!dv) return;
    const t = (dv.deriva >= 0 ? '+' : '') + dv.deriva.toFixed(1).replace('.', ',') + '%';
    if (dv.deriva <= okSoglia) { voto += 0.6; P('+', 'Battiti stabili nel tempo: deriva cardiaca ' + t + ' (seconda metà a ' + fmtPasso(dv.passoB) + ' con FC ' + Math.round(dv.hrB) + ', prima metà a ' + fmtPasso(dv.passoA) + ' con FC ' + Math.round(dv.hrA) + ').'); }
    else if (dv.deriva <= malSoglia) P('i', 'Deriva cardiaca ' + t + ': i battiti salgono un po\' rispetto al ritmo.');
    else { voto -= 1; P('-', 'Deriva cardiaca alta (' + t + '): a parità di ritmo il cuore ha lavorato sempre di più; può indicare stanchezza, caldo o partenza troppo forte.'); }
  };

  if (tipo === 'facile') {
    if (z) {
      const f = z[0] + z[1];
      if (f >= 0.75) { voto += 1.2; P('+', 'Ottimo controllo: ' + perc(f) + ' del tempo in zone 1-2.'); }
      else if (f >= 0.5) { voto += 0.2; P('i', perc(f) + ' del tempo in zone 1-2: va bene, ma per un facile punterei a più del 75%.'); }
      else { voto -= 1.5; P('-', 'Un po\' troppo intenso per un facile: solo ' + perc(f) + ' in zone 1-2 e ' + perc(z[2] + z[3] + z[4]) + ' in zona 3 o più.'); }
    } else if (te) {
      if (te <= 2.4) { voto += 0.8; P('+', 'Effetto allenante basso (' + te.toFixed(1).replace('.', ',') + '), coerente con un facile.'); }
      else { voto -= 0.8; P('-', 'Effetto allenante ' + te.toFixed(1).replace('.', ',') + ': alto per un facile.'); }
    }
    derivaPunti(3, 6);
    if (cvPasso !== null) { if (cvPasso < 0.05) { voto += 0.4; P('+', 'Passo regolare tra i chilometri.'); } else P('i', 'Passo un po\' variabile tra i chilometri (variazione ' + perc(cvPasso) + ').'); }
    if (rpe) { if (rpe >= 6) { voto -= 1; P('-', 'Sforzo percepito ' + rpe + '/10: alto per un facile.'); } else if (rpe <= 4) { voto += 0.5; P('+', 'Sforzo percepito ' + rpe + '/10: giusto per un facile.'); } }
  } else if (tipo === 'lungo') {
    if (base.lungoMax > 0) {
      if (km >= base.lungoMax * 0.9) { voto += 0.5; P('+', 'Lungo impegnativo: ' + fmtNum(km, 1) + ' km, vicino o oltre al tuo lungo più lungo degli ultimi 3 mesi (' + fmtNum(base.lungoMax, 1) + ' km).'); }
      else if (km < base.lungoMax * 0.7) P('i', 'Più corto dei tuoi lunghi recenti (' + fmtNum(km, 1) + ' km contro un massimo di ' + fmtNum(base.lungoMax, 1) + ' km).');
    }
    if (z) {
      if (z[0] + z[1] + z[2] >= 0.8) { voto += 0.8; P('+', perc(z[0] + z[1] + z[2]) + ' del tempo in zone 1-3: intensità adatta a un lungo.'); }
      else if (z[3] + z[4] >= 0.2) { voto -= 1; P('-', perc(z[3] + z[4]) + ' del tempo in zone 4-5: troppo intenso per un lungo.'); }
    }
    derivaPunti(5, 8);
    if (dv) {
      const rapp = dv.passoB / dv.passoA - 1;
      if (rapp <= -0.02) { voto += 0.6; P('+', 'Finale più veloce dell\'inizio (' + fmtPasso(dv.passoB) + ' contro ' + fmtPasso(dv.passoA) + '): buona gestione.'); }
      else if (rapp > 0.05) { voto -= 0.8; P('-', 'Calo di ritmo nella seconda metà (' + fmtPasso(dv.passoB) + ' contro ' + fmtPasso(dv.passoA) + ').'); }
    }
  } else if (tipo === 'soglia' || tipo === 'ritmogara' || tipo === 'progressivo') {
    if (z) {
      const centro = z[2] + z[3];
      if (centro >= 0.55) { voto += 0.8; P('+', perc(centro) + ' del tempo in zone 3-4: stimolo di soglia centrato.'); }
      if (z[4] >= 0.2) { voto -= 0.8; P('-', perc(z[4]) + ' del tempo in zona 5: spesso oltre la soglia.'); }
      if (z[0] + z[1] >= 0.6) P('i', perc(z[0] + z[1]) + ' del tempo a bassa intensità: riscaldamento lungo o lavoro poco intenso.');
    } else if (hr && base.runs.length) {
      const med = medianaArr(base.runs.map(r => Number(r.avg_hr)).filter(x => x > 0));
      if (hr >= med * 1.05) { voto += 0.5; P('+', 'FC media sopra la tua media recente: lavoro di intensità adeguata.'); } else P('i', 'FC media vicina alla tua media recente: lavoro poco spinto.');
    }
    if (tipo !== 'progressivo' && cvPasso !== null) { if (cvPasso < 0.04) { voto += 0.6; P('+', 'Passo molto regolare (variazione ' + perc(cvPasso) + ').'); } else if (cvPasso > 0.08) { voto -= 0.5; P('-', 'Passo irregolare (variazione ' + perc(cvPasso) + ') per un lavoro a ritmo costante.'); } }
    if (tipo === 'progressivo' && dv) { if (dv.passoB < dv.passoA * 0.97) { voto += 0.8; P('+', 'Seconda metà più veloce (' + fmtPasso(dv.passoB) + ' contro ' + fmtPasso(dv.passoA) + '): progressione riuscita.'); } else { voto -= 0.5; P('-', 'La seconda metà non è più veloce della prima: manca la progressione.'); } }
    if (tipo !== 'progressivo') derivaPunti(5, 8);
    if (te) { if (te >= 3) { voto += 0.4; P('+', 'Effetto allenante aerobico ' + te.toFixed(1).replace('.', ',') + ': stimolo adeguato.'); } else P('i', 'Effetto allenante aerobico ' + te.toFixed(1).replace('.', ',') + ': stimolo moderato.'); }
  } else if (tipo === 'ripetute' || tipo === 'fartlek') {
    const reps = trovaRipetute(det);
    if (reps) {
      const pas = reps.map(r => r.passo), n = reps.length, terzo = Math.max(1, Math.floor(n / 3));
      const primo = mediaArr(pas.slice(0, terzo)), ultimo = mediaArr(pas.slice(n - terzo)), cvR = cvArr(pas);
      P('i', 'Ho riconosciuto ' + n + ' sforzi (durata media ' + fmtTempo(mediaArr(reps.map(r => r.durata))) + ') a passo medio ' + fmtPasso(mediaArr(pas)) + '.');
      if (cvR !== null) { if (cvR < 0.04) { voto += 0.8; P('+', 'Ripetute molto costanti nel passo (variazione ' + perc(cvR) + ').'); } else if (cvR > 0.08) { voto -= 0.5; P('-', 'Passo piuttosto irregolare tra le ripetute (variazione ' + perc(cvR) + ').'); } }
      if (n >= 4) { const calo = ultimo / primo - 1; if (calo > 0.04) { voto -= 0.8; P('-', 'Calo nelle ultime ripetute: ' + fmtPasso(ultimo) + ' contro ' + fmtPasso(primo) + ' delle prime.'); } else { voto += 0.6; P('+', 'Ritmo mantenuto fino alle ultime ripetute (' + fmtPasso(ultimo) + ' contro ' + fmtPasso(primo) + ').'); } }
      const hrM = reps.map(r => r.hrMax).filter(x => x);
      if (hrM.length) P('i', 'Battiti di picco medi negli sforzi: ' + Math.round(mediaArr(hrM)) + ' bpm' + (Number(a.max_hr) > 0 ? ' (massimo della seduta ' + Math.round(a.max_hr) + ')' : '') + '.');
      const rec = reps.filter(r => r.hrMax && r.hrDopo).map(r => r.hrMax - r.hrDopo);
      if (rec.length) { const m = mediaArr(rec); if (m >= 12) { voto += 0.4; P('+', 'Buon recupero: tra uno sforzo e l\'altro la FC scende in media di ' + Math.round(m) + ' bpm.'); } else P('i', 'Recupero cardiaco: la FC scende in media di ' + Math.round(m) + ' bpm tra gli sforzi.'); }
    } else P('i', 'Non riesco a riconoscere le ripetute dai dati (servono i dettagli dell\'attività): valuto solo zone e effetto allenante.');
    if (z) { const alte = z[3] + z[4]; if (alte >= 0.25) { voto += 0.5; P('+', perc(alte) + ' del tempo in zone 4-5: stimolo intenso adeguato.'); } else if (alte < 0.12) { voto -= 0.4; P('i', 'Solo ' + perc(alte) + ' del tempo in zone 4-5: sforzi poco intensi o recuperi lunghi.'); } }
    const an = Number(a.anaerobic_te);
    if (an >= 1.5) { voto += 0.3; P('+', 'Effetto anaerobico ' + an.toFixed(1).replace('.', ',') + ': buon lavoro di velocità.'); }
  } else if (tipo === 'gara') {
    if (dv) {
      const rapp = dv.passoB / dv.passoA - 1;
      if (rapp <= 0) { voto += 0.8; P('+', 'Negative split: seconda metà più veloce (' + fmtPasso(dv.passoB) + ' contro ' + fmtPasso(dv.passoA) + ').'); }
      else if (rapp <= 0.03) { voto += 0.3; P('i', 'Ritmo quasi costante: seconda metà ' + fmtPasso(dv.passoB) + ' contro ' + fmtPasso(dv.passoA) + ' della prima.'); }
      else { voto -= 0.5; P('-', 'Calo nella seconda metà (' + fmtPasso(dv.passoB) + ' contro ' + fmtPasso(dv.passoA) + '): partenza forse troppo decisa.'); }
    }
    if (laps.length >= 4) {
      const ok = laps.filter(l => l.d >= 900), v = ok.map(l => l.d / l.t), mv = mediaArr(v);
      if (v.length >= 3 && v[0] > mv * 1.06) { voto -= 0.4; P('-', 'Primo chilometro troppo veloce rispetto alla media (' + fmtPasso(1000 / v[0]) + ' contro ' + fmtPasso(1000 / mv) + ').'); }
      const q = Math.max(1, Math.floor(v.length / 4));
      if (v.length >= 6 && mediaArr(v.slice(v.length - q)) < mediaArr(v.slice(0, v.length - q)) * 0.95) { voto -= 0.6; P('-', 'Cedimento nel finale: ultimi chilometri più lenti del 5% rispetto al resto.'); }
    }
    if (hr && Number(a.max_hr) > 0) P('i', 'FC media ' + Math.round(hr) + ' bpm, massima ' + Math.round(a.max_hr) + ' bpm.');
    if (te && te >= 4) P('i', 'Effetto allenante aerobico ' + te.toFixed(1).replace('.', ',') + ': sforzo molto alto, serve recupero.');
  } else {
    derivaPunti(5, 8);
    if (z) P('i', 'Tempo nelle zone: ' + z.map((v, i) => 'Z' + (i + 1) + ' ' + perc(v)).join(' • ') + '.');
    if (te) P('i', 'Effetto allenante aerobico ' + te.toFixed(1).replace('.', ',') + (a.te_label ? ' (' + String(a.te_label).toLowerCase().replace(/_/g, ' ') + ')' : '') + '.');
  }

  puntiMeteo(a, P);
  if (piano && Number(piano.distanza_km) > 0) { const r = km / Number(piano.distanza_km); if (r >= 0.9 && r <= 1.1) { voto += 0.3; P('+', 'Distanza in linea col piano (' + fmtNum(km, 1) + ' km su ' + fmtNum(piano.distanza_km, 1) + ').'); } else P('-', 'Distanza diversa dal piano: ' + fmtNum(km, 1) + ' km invece di ' + fmtNum(piano.distanza_km, 1) + '.'); }
  if (!out.punti.length) P('i', 'Dati insufficienti per una valutazione: servono zone cardiache o i dettagli km per km.');

  out.voto = out.punti.some(p => p.s !== 'i') ? Math.max(3, Math.min(10, voto)) : null;
  out.sintesi = (NOMI_TIPO[tipo] || 'Corsa') + ' da ' + fmtNum(km, 2) + ' km in ' + durataTxt + ' a ' + fmtPasso(passo) + (hr ? ' con FC media ' + Math.round(hr) + ' bpm' : '') + (out.voto !== null ? ' • ' + etichettaVoto(out.voto) : '') + '.';
  return out;
}

// ---- elenco ----
function elencoFiltrato() {
  const testo = (document.getElementById('attTesto').value || '').toLowerCase().trim();
  const disc = document.getElementById('attDisc').value;
  const per = document.getElementById('attPeriodo').value;
  const ord = document.getElementById('attOrdine').value;
  const lim = per === 'tutto' ? 0 : Date.now() - Number(per) * 86400000;
  let l = (rawData.activities || []).filter(a => !isNaN(dataAttivita(a)));
  if (disc !== 'tutte') l = l.filter(a => disciplinaDi(a) === disc);
  if (lim) l = l.filter(a => dataAttivita(a).getTime() >= lim);
  if (testo) l = l.filter(a => (String(a.name || '') + ' ' + String(a.location || '')).toLowerCase().includes(testo));
  const chiavi = { data: a => -dataAttivita(a).getTime(), dist: a => -Number(a.distance_km || 0), dur: a => -Number(a.duration_min || 0), passo: a => passoAtt(a) || 1e9, fc: a => -Number(a.avg_hr || 0), te: a => -Number(a.aerobic_te || 0) };
  return l.sort((x, y) => chiavi[ord](x) - chiavi[ord](y));
}

function renderListaAttivita() {
  attFiltrate = elencoFiltrato();
  const base = baselineCorse(null);
  const box = document.getElementById('attLista');
  const km = attFiltrate.filter(eCorsa).reduce((s, a) => s + Number(a.distance_km || 0), 0);
  const ore = attFiltrate.reduce((s, a) => s + Number(a.duration_min || 0), 0) / 60;
  document.getElementById('attRiepilogo').innerText = attFiltrate.length + (attFiltrate.length === 1 ? ' attività' : ' attività') + ' • ' + fmtNum(km, 1) + ' km di corsa • ' + formatOreMinuti(ore) + ' in totale';
  const note = leggiNote();
  const prog = document.getElementById('attProgressiLista');
  if (prog) {
    listaCharts.forEach(c => { try { c.destroy(); } catch (e) { /* ok */ } }); listaCharts = [];
    if (document.getElementById('attDisc').value === 'Forza') {
      prog.innerHTML = '<div class="glass-card neon-emerald p-6"><h3 class="text-sm font-extrabold uppercase tracking-wider text-emerald-400 mb-3">Progressi sui carichi</h3>' + htmlProgressiForza('lis') + '</div>';
      disegnaProgressiForza('lis');
    } else prog.innerHTML = '';
  }
  box.innerHTML = attFiltrate.slice(0, attVisibili).map(a => {
    const k = chiaveAtt(a); attPerChiave[k] = a;
    const tipo = eCorsa(a) ? (note[k] && note[k].tipo && note[k].tipo !== 'auto' ? note[k].tipo : riconosciTipo(a, null, base).tipo) : null;
    const dt = dataAttivita(a);
    const num = (v, t) => v ? '<span class="whitespace-nowrap">' + t + '</span>' : '';
    return '<button onclick="apriAttivita(\'' + esc(k) + '\')" class="w-full text-left glass-card p-4 hover:border-orange-400/40 transition">' +
      '<div class="flex flex-wrap items-center justify-between gap-2"><div class="min-w-0"><p class="text-sm font-bold text-white truncate">' + esc(a.name || disciplinaDi(a)) +
      (tipo && NOMI_TIPO[tipo] ? ' <span class="ml-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-orange-500/20 text-orange-300">' + esc(NOMI_TIPO[tipo]) + '</span>' : '') + '</p>' +
      '<p class="text-xs text-slate-400">' + esc(fmtData(dt)) + ' • ' + esc(disciplinaDi(a)) + (a.location ? ' • ' + esc(a.location) : '') + '</p></div>' +
      '<div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300">' +
      num(Number(a.distance_km) > 0, fmtNum(a.distance_km, 2) + ' km') + num(Number(a.duration_min) > 0, fmtTempo(Number(a.duration_min) * 60)) +
      num(eCorsa(a) && passoAtt(a), fmtPasso(passoAtt(a))) + num(Number(a.avg_hr) > 0, '❤ ' + Math.round(a.avg_hr)) + '</div></div></button>';
  }).join('') || '<p class="text-sm text-slate-400">Nessuna attività con questi filtri.</p>';
  document.getElementById('attAltre').classList.toggle('hidden', attFiltrate.length <= attVisibili);
}

function initAttivita() {
  const dsc = {};
  (rawData.activities || []).forEach(a => { dsc[disciplinaDi(a)] = (dsc[disciplinaDi(a)] || 0) + 1; });
  const nomi = Object.keys(dsc).sort((x, y) => dsc[y] - dsc[x]);
  document.getElementById('attDisc').innerHTML = '<option value="tutte">Tutte le discipline</option>' + nomi.map(n => '<option value="' + esc(n) + '">' + esc(n) + ' (' + dsc[n] + ')</option>').join('');
  ['attTesto', 'attDisc', 'attPeriodo', 'attOrdine'].forEach(id => {
    document.getElementById(id).addEventListener(id === 'attTesto' ? 'input' : 'change', () => { attVisibili = 40; renderListaAttivita(); });
  });
  document.getElementById('attAltre').addEventListener('click', () => { attVisibili += 40; renderListaAttivita(); });
  const esp = document.getElementById('attEsporta'), imp = document.getElementById('attImporta');
  if (esp) esp.addEventListener('click', esportaNote);
  if (imp) imp.addEventListener('change', () => {
    const f = imp.files && imp.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { const n = importaNote(String(r.result)); alert(n < 0 ? 'File non valido.' : 'Ripristinate le note di ' + n + ' attività.'); renderListaAttivita(); };
    r.readAsText(f);
  });
  try { fetch('piano.json').then(r => r.ok ? r.json() : null).then(j => { pianoDati = j; if (typeof renderCalendario === 'function') renderCalendario(); }).catch(() => {}); } catch (e) { /* nessun piano */ }
}

function registraAttivita() { (rawData.activities || []).forEach(a => { attPerChiave[chiaveAtt(a)] = a; }); }

function renderAttivita() {
  if (!document.getElementById('attLista') || !rawData) return;
  registraAttivita();
  if (!attInizializzata) { initAttivita(); attInizializzata = true; }
  renderListaAttivita();
}

// ---- dettaglio ----
function distruggiGraficiAtt() { attCharts.forEach(c => { try { c.destroy(); } catch (e) { /* ok */ } }); attCharts = []; }

let attOrigine = 'elenco';

function chiudiAttivita() {
  distruggiGraficiAtt();
  document.getElementById('attDettaglio').classList.add('hidden');
  document.getElementById('attListaWrap').classList.remove('hidden');
  const torna = attOrigine === 'coach';
  attOrigine = 'elenco';
  if (torna) { switchTab('tab-coach'); return; }
  window.scrollTo(0, 0);
}

async function apriAttivita(chiave, origine) {
  const a = attPerChiave[chiave];
  if (!a) return;
  attOrigine = origine || 'elenco';
  attCorrente = a;
  document.getElementById('attListaWrap').classList.add('hidden');
  const box = document.getElementById('attDettaglio');
  box.classList.remove('hidden');
  box.innerHTML = '<p class="text-sm text-slate-400">Carico i dettagli…</p>';
  window.scrollTo(0, 0);
  let det = null;
  if (a.id) {
    try { const r = await fetch('dettagli/' + a.id + '.json'); if (r.ok) det = await r.json(); } catch (e) { det = null; }
  }
  attDettCorrente = det;
  renderDettaglio(a, det);
}

function salvaNotaAtt(campo, valore) {
  if (!attCorrente) return;
  const n = leggiNote(), k = chiaveAtt(attCorrente);
  n[k] = n[k] || {};
  n[k][campo] = valore;
  salvaNote(n);
  const el = document.getElementById('attValutazione');
  if (el) el.innerHTML = htmlValutazione(analizzaAttivita(attCorrente, attDettCorrente, n[k], pianoPer(attCorrente)));
}

function htmlValutazione(an) {
  const col = an.voto === null ? 'text-slate-300' : an.voto >= 8 ? 'text-emerald-400' : an.voto >= 7 ? 'text-lime-400' : an.voto >= 6 ? 'text-amber-400' : 'text-orange-400';
  const icone = { '+': '✅', '-': '⚠️', 'i': 'ℹ️' };
  return '<div class="flex flex-wrap items-center justify-between gap-4 mb-3"><div><p class="text-xs text-slate-400">Tipo di allenamento</p>' +
    '<p class="text-lg font-black text-white">' + esc(NOMI_TIPO[an.tipo] || an.tipo) + ' <span class="text-xs font-normal text-slate-500">(' + esc(FONTI_TIPO[an.fonte] || an.fonte) + ')</span></p></div>' +
    (an.voto === null ? '<div class="text-right"><p class="text-xs text-slate-500">Nessun voto automatico<br>per questa attività</p></div></div>' :
    '<div class="text-right"><p class="text-xs text-slate-400">Voto indicativo</p><p class="text-4xl font-black ' + col + '">' + an.voto.toFixed(1).replace('.', ',') + '<span class="text-lg text-slate-500"> / 10</span></p>' +
    '<p class="text-xs font-bold ' + col + '">' + etichettaVoto(an.voto) + '</p></div></div>') +
    '<p class="text-sm text-slate-200 mb-3">' + esc(an.sintesi) + '</p>' +
    '<p class="text-xs text-slate-400 mb-3"><span class="font-bold text-orange-300">Obiettivo di questo allenamento:</span> ' + esc(an.obiettivo) + '</p>' +
    '<ul class="space-y-1.5 text-sm text-slate-300">' + an.punti.map(p => '<li>' + icone[p.s] + ' ' + esc(p.t) + '</li>').join('') + '</ul>' +
    '<p class="text-xs text-slate-500 mt-3">Valutazione automatica basata su regole (battiti, zone, passo, costanza): è un\'indicazione, non un\'analisi personalizzata. Non conosce meteo, sensazioni e contesto, se non quelli che segni qui sopra.</p>';
}

function mediaMetrica(chiave, escludi) {
  const v = baselineCorse(escludi).runs.slice(-10).map(r => Number(r[chiave])).filter(x => x > 0);
  return v.length >= 3 ? mediaArr(v) : null;
}

function allineaUnita(vals, rif) {
  const nn = vals.filter(v => v !== null && v !== undefined);
  if (!nn.length || !(rif > 0)) return vals;
  const m = mediaArr(nn);
  if (!(m > 0)) return vals;
  const r = rif / m;
  const f = [0.001, 0.01, 0.1, 1, 10, 100, 1000].find(x => r / x > 0.7 && r / x < 1.4);
  return f && f !== 1 ? vals.map(v => v === null || v === undefined ? v : v * f) : vals;
}

const METRICHE_GRAFICO = [
  { k: 'pace', nome: 'Passo', unita: 'min/km', rif: null, colore: '#00f0ff', inverti: true, fmt: v => fmtPasso(v) },
  { k: 'vel', nome: 'Velocità', unita: 'km/h', rif: null, colore: '#00f0ff', fmt: v => fmtNum(v, 1) + ' km/h' },
  { k: 'hr', nome: 'Frequenza cardiaca', unita: 'bpm', rif: null, colore: '#ef4444', fmt: v => Math.round(v) + ' bpm' },
  { k: 'cad', nome: 'Cadenza', unita: 'spm', rif: 'avg_cadence', colore: '#38bdf8', fmt: v => Math.round(v) + ' spm' },
  { k: 'gct', nome: 'Contatto al suolo', unita: 'ms', rif: 'avg_gct', colore: '#a855f7', fmt: v => Math.round(v) + ' ms' },
  { k: 'vo', nome: 'Oscillazione verticale', unita: 'cm', rif: 'avg_vert_osc', colore: '#f43f5e', fmt: v => fmtNum(v, 1) + ' cm' },
  { k: 'sl', nome: 'Lunghezza del passo', unita: 'm', rif: 'avg_stride', colore: '#10b981', fmt: v => v > 10 ? fmtNum(v / 100, 2) + ' m' : fmtNum(v, 2) + ' m' },
  { k: 'vr', nome: 'Rapporto verticale', unita: '%', rif: 'avg_vert_ratio', colore: '#ff9d00', fmt: v => fmtNum(v, 1) + ' %' },
  { k: 'pw', nome: 'Potenza', unita: 'W', rif: 'avg_power', colore: '#eab308', fmt: v => Math.round(v) + ' W' },
  { k: 'el', nome: 'Altimetria', unita: 'm', rif: null, colore: '#94a3b8', fmt: v => Math.round(v) + ' m' }
];

// punti {x, y} di una misura: dalla serie dettagliata se c'è, altrimenti dai giri (km per km)
const SPORT_METRICHE = { pace: ['corsa', 'camminata'], vel: ['bici', 'nuoto', 'altro'], hr: ['corsa', 'camminata', 'bici', 'nuoto', 'forza', 'tennis', 'altro'], cad: ['corsa'], gct: ['corsa'], vo: ['corsa'], sl: ['corsa'], vr: ['corsa'], pw: ['corsa', 'bici'], el: ['corsa', 'camminata', 'bici', 'altro'] };

function datiMetrica(a, det, m) {
  if (!det) return null;
  if (SPORT_METRICHE[m.k] && SPORT_METRICHE[m.k].indexOf(tipoSport(a)) < 0) return null;
  const s = det.serie;
  if (s && s.t) {
    const x = s.d ? s.d.map(v => v === null ? null : v / 1000) : s.t.map(v => v === null ? null : v / 60);
    let vals = null;
    if (m.k === 'pace') {
      const maxP = tipoSport(a) === 'camminata' ? 1500 : 600;
      if (s.spd) vals = s.spd.map((v, i) => { const w = []; for (let j = i - 2; j <= i + 2; j++) if (s.spd[j] > 0.8) w.push(s.spd[j]); const p = w.length ? 1000 / mediaArr(w) : null; return p && p < maxP ? p : null; });
    } else if (m.k === 'vel') {
      if (s.spd) vals = s.spd.map((v, i) => { const w = []; for (let j = i - 2; j <= i + 2; j++) if (s.spd[j] >= 0) w.push(s.spd[j]); return w.length ? mediaArr(w) * 3.6 : null; });
    } else if (s[m.k]) vals = m.rif ? allineaUnita(s[m.k], Number(a[m.rif])) : s[m.k];
    if (vals) return { punti: vals.map((y, i) => ({ x: x[i], y: y === undefined ? null : y })).filter(p => p.x !== null && p.x !== undefined), unita: s.d ? 'km' : 'min' };
  }
  if (det.laps && det.laps.length) {
    let cum = 0;
    const xs = det.laps.map(l => { cum += l.d; return cum / 1000; });
    let vals = null;
    if (m.k === 'pace') vals = det.laps.map(l => l.t / l.d * 1000);
    else if (m.k === 'vel') vals = det.laps.map(l => l.d / l.t * 3.6);
    else if (m.k !== 'el' && det.laps.some(l => l[m.k] > 0)) { const raw = det.laps.map(l => l[m.k] > 0 ? l[m.k] : null); vals = m.rif ? allineaUnita(raw, Number(a[m.rif])) : raw; }
    if (vals) return { punti: vals.map((y, i) => ({ x: xs[i], y })), unita: 'km' };
  }
  return null;
}

function svgPercorso(pts) {
  const lat0 = mediaArr(pts.map(p => p[0])), kx = Math.cos(lat0 * Math.PI / 180);
  const X = pts.map(p => p[1] * kx), Y = pts.map(p => -p[0]);
  const minX = Math.min.apply(null, X), maxX = Math.max.apply(null, X), minY = Math.min.apply(null, Y), maxY = Math.max.apply(null, Y);
  const W = 560, H = 340, pad = 24;
  const sc = Math.min((W - 2 * pad) / ((maxX - minX) || 1e-9), (H - 2 * pad) / ((maxY - minY) || 1e-9));
  const ox = (W - (maxX - minX) * sc) / 2, oy = (H - (maxY - minY) * sc) / 2;
  const pt = i => [ox + (X[i] - minX) * sc, oy + (Y[i] - minY) * sc];
  const d = pts.map((_, i) => { const q = pt(i); return (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join(' ');
  const s0 = pt(0), s1 = pt(pts.length - 1);
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="w-full h-auto rounded-xl bg-slate-900/60 border border-white/10"><path d="' + d + '" fill="none" stroke="#ff6b00" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>' +
    '<circle cx="' + s0[0].toFixed(1) + '" cy="' + s0[1].toFixed(1) + '" r="6" fill="#10b981"/><circle cx="' + s1[0].toFixed(1) + '" cy="' + s1[1].toFixed(1) + '" r="6" fill="#ef4444"/></svg>' +
    '<p class="text-xs text-slate-500 mt-2"><span class="text-emerald-400">●</span> partenza • <span class="text-red-400">●</span> arrivo • il nord è in alto</p>';
}

function tabellaKm(laps) {
  const col = [
    ['Km', l => fmtNum(l.cum / 1000, 2), true], ['Tempo', l => fmtTempo(l.t), true], ['Passo', l => fmtPasso(l.t / l.d * 1000), true],
    ['FC', l => l.hr, l => l.hr > 0], ['FC max', l => l.hrMax, l => l.hrMax > 0], ['Cad.', l => l.cad, l => l.cad > 0], ['Contatto ms', l => l.gct, l => l.gct > 0],
    ['Osc. cm', l => l.vo, l => l.vo > 0], ['Passo cm', l => l.sl, l => l.sl > 0], ['Rapp. %', l => l.vr, l => l.vr > 0], ['Watt', l => l.pw, l => l.pw > 0],
    ['Disl. +/-', l => (l.up || 0) + '/' + (l.dn || 0), l => l.up > 0 || l.dn > 0]
  ];
  let cum = 0;
  const righe = laps.map(l => { cum += l.d; return Object.assign({}, l, { cum }); });
  const attive = col.filter(c => c[2] === true || righe.some(c[2]));
  const lunghi = righe.filter(l => l.d >= 900);
  const vel = lunghi.map(l => l.d / l.t);
  const vMax = vel.length ? Math.max.apply(null, vel) : null, vMin = vel.length ? Math.min.apply(null, vel) : null;
  return '<div class="overflow-x-auto"><table class="w-full text-xs min-w-[520px]"><thead><tr class="text-slate-500 uppercase tracking-wider text-left">' + attive.map(c => '<th class="pb-2 pr-3 font-bold">' + c[0] + '</th>').join('') + '</tr></thead><tbody>' +
    righe.map(l => {
      const v = l.d / l.t, cls = l.d >= 900 && vel.length > 2 ? (v === vMax ? 'text-emerald-400 font-bold' : v === vMin ? 'text-orange-400 font-bold' : 'text-slate-300') : 'text-slate-400';
      return '<tr class="border-t border-white/5 ' + cls + '">' + attive.map(c => '<td class="py-1.5 pr-3">' + esc(c[1](l)) + '</td>').join('') + '</tr>';
    }).join('') + '</tbody></table></div><p class="text-xs text-slate-500 mt-2">In verde il chilometro più veloce, in arancio il più lento (giri completi).</p>';
}

function sezAtt(neon, titolo, corpo) {
  return '<div class="glass-card ' + neon + ' p-6 mb-6"><h3 class="text-sm font-extrabold uppercase tracking-wider ' + (TITOLO_COLORE[neon] || 'text-white') + ' mb-3">' + titolo + '</h3>' + corpo + '</div>';
}

// ==== SPORT ====
const ATTREZZI = ['Bilanciere', 'Manubri', 'Macchina', 'Cavi', 'Corpo libero', 'Kettlebell', 'Altro'];
const SUPERFICI = ['', 'Terra', 'Cemento', 'Erba', 'Indoor'];
let listaCharts = [];

function tipoSport(a) {
  const t = String(a.type || '').toLowerCase();
  if (t.includes('run')) return 'corsa';
  if (t.includes('strength') || t.includes('weight')) return 'forza';
  if (t.includes('tennis') || t.includes('padel') || t.includes('squash') || t.includes('badminton')) return 'tennis';
  if (t.includes('walk') || t.includes('hik')) return 'camminata';
  if (t.includes('cycl') || t.includes('bik') || t.includes('ride')) return 'bici';
  if (t.includes('swim')) return 'nuoto';
  return 'altro';
}

function modificaNota(fn) {
  if (!attCorrente) return null;
  const n = leggiNote(), k = chiaveAtt(attCorrente);
  n[k] = n[k] || {};
  fn(n[k]);
  salvaNote(n);
  return n[k];
}

function aggiornaValutazioneAtt() {
  const el = document.getElementById('attValutazione');
  if (!el || !attCorrente) return;
  el.innerHTML = htmlValutazione(analizzaAttivita(attCorrente, attDettCorrente, leggiNote()[chiaveAtt(attCorrente)] || {}, pianoPer(attCorrente)));
}

// ---- meteo ----
function testoMeteo(c) {
  if (c === null || c === undefined) return '';
  if (c === 0) return 'sereno';
  if (c <= 2) return 'poco nuvoloso';
  if (c === 3) return 'coperto';
  if (c === 45 || c === 48) return 'nebbia';
  if (c >= 51 && c <= 57) return 'pioggerella';
  if (c >= 61 && c <= 67) return 'pioggia';
  if (c >= 71 && c <= 77) return 'neve';
  if (c >= 80 && c <= 82) return 'rovesci';
  if (c >= 95) return 'temporale';
  return '';
}

function puntiMeteo(a, P) {
  const m = a.meteo;
  if (!m || m.t === null || m.t === undefined) return;
  if (Number(m.app) >= 25) P('i', 'Caldo: temperatura percepita ' + Math.round(m.app) + ' °C (' + Math.round(m.t) + ' °C reali). A parità di sforzo i battiti salgono.');
  else if (Number(m.t) <= 4) P('i', 'Freddo: ' + Math.round(m.t) + ' °C (percepita ' + Math.round(m.app) + ' °C). Muscoli rigidi e prime fasi più lente sono normali.');
  if (Number(m.vento) >= 25) P('i', 'Vento forte (' + Math.round(m.vento) + ' km/h): il passo e i battiti ne risentono, soprattutto contro vento.');
  if (Number(m.pioggia) >= 1) P('i', 'Pioggia (circa ' + fmtNum(m.pioggia, 1) + ' mm durante l\'attività).');
}

// ---- esercizi di forza ----
function totaliEsercizi(ex) {
  let serie = 0, rip = 0, volume = 0;
  (ex || []).forEach(r => { const s = Number(r.serie) || 0, p = Number(r.rip) || 0, kg = Number(r.kg) || 0; serie += s; rip += s * p; volume += s * p * kg; });
  return { serie, rip, volume };
}

function righeEsercizi() {
  const note = leggiNote(), out = [];
  Object.keys(note).forEach(k => {
    const a = attPerChiave[k], ex = note[k] && note[k].esercizi;
    if (!a || !Array.isArray(ex)) return;
    ex.forEach(r => {
      const kg = Number(r.kg), rip = Number(r.rip), serie = Number(r.serie), nome = String(r.nome || '').trim();
      if (!nome || !(kg >= 0) || !(rip > 0) || !(serie > 0)) return;
      out.push({ k, data: dataAttivita(a), nome, nomeNorm: nome.toLowerCase(), attrezzo: r.attrezzo || '', kg, rip, serie, e1rm: kg > 0 && rip <= 12 ? kg * (1 + rip / 30) : null });
    });
  });
  return out.sort((x, y) => x.data - y.data);
}

function seduteForza() {
  const per = {};
  righeEsercizi().forEach(r => { (per[r.k] = per[r.k] || { k: r.k, data: r.data, volume: 0, serie: 0 }); per[r.k].volume += r.serie * r.rip * r.kg; per[r.k].serie += r.serie; });
  return Object.keys(per).map(k => per[k]).sort((x, y) => x.data - y.data);
}

function recordCarichiSeduta(a, ex) {
  const dt = dataAttivita(a), prev = righeEsercizi().filter(r => r.data < dt), out = [];
  const mie = {};
  (ex || []).forEach(r => { const n = String(r.nome || '').trim().toLowerCase(), kg = Number(r.kg); if (n && kg > 0) mie[n] = Math.max(mie[n] || 0, kg); });
  Object.keys(mie).forEach(n => {
    const prima = prev.filter(r => r.nomeNorm === n).reduce((m, r) => Math.max(m, r.kg), 0);
    if (prima > 0 && mie[n] > prima) out.push({ nome: (ex.find(r => String(r.nome || '').trim().toLowerCase() === n) || {}).nome || n, kg: mie[n], prima });
  });
  return out;
}

// ---- analisi delle attività che non sono corsa ----
function analizzaNonCorsa(a, note, out, P) {
  const kind = tipoSport(a), min = Number(a.duration_min), hr = Number(a.avg_hr) || null, z = quoteZone(a);
  const pezzi = [NOMI_TIPO[kind] || 'Attività', min > 0 ? fmtTempo(min * 60) : '--'];
  if (kind !== 'forza' && Number(a.distance_km) > 0) pezzi.push(fmtNum(a.distance_km, 2) + ' km');
  if (hr) pezzi.push('FC media ' + Math.round(hr) + ' bpm');
  if (Number(a.calories) > 0) pezzi.push(Math.round(a.calories) + ' kcal');
  if (z) P('i', 'Intensità cardiaca: ' + perc(z[2] + z[3] + z[4]) + ' del tempo in zone 3-5 (' + z.map((v, i) => 'Z' + (i + 1) + ' ' + perc(v)).join(' • ') + ').');
  else if (hr) P('i', 'FC media ' + Math.round(hr) + ' bpm' + (Number(a.max_hr) > 0 ? ', massima ' + Math.round(a.max_hr) + ' bpm' : '') + '.');
  if (Number(a.anaerobic_te) >= 1) P('i', 'Effetto allenante anaerobico ' + fmtNum(a.anaerobic_te, 1) + '.');
  if (Number(a.body_battery_delta) < 0) P('i', 'Body Battery consumata durante l\'attività: ' + Math.abs(a.body_battery_delta) + ' punti.');

  const simili = (rawData.activities || []).filter(x => x !== a && tipoSport(x) === kind && dataAttivita(x) < dataAttivita(a) && Number(x.duration_min) > 0).slice(0, 6);
  if ((kind === 'tennis' || kind === 'altro') && Number(a.calories) > 0 && min > 0 && simili.length >= 2) {
    const kh = a.calories / (min / 60), prec = medianaArr(simili.filter(x => Number(x.calories) > 0).map(x => x.calories / (x.duration_min / 60)));
    if (prec > 0) P(kh >= prec * 1.1 ? '+' : 'i', 'Dispendio ' + Math.round(kh) + ' kcal/h contro ' + Math.round(prec) + ' kcal/h delle ultime sedute simili (' + (kh >= prec ? '+' : '') + Math.round((kh / prec - 1) * 100) + '%).');
  }

  if (kind === 'forza') {
    const ex = note.esercizi || [];
    if (ex.length) {
      const t = totaliEsercizi(ex);
      P('i', t.serie + ' serie, ' + t.rip + ' ripetizioni, volume totale ' + Math.round(t.volume).toLocaleString('it-IT') + ' kg in ' + ex.length + (ex.length === 1 ? ' esercizio.' : ' esercizi.'));
      const dt = dataAttivita(a), prevS = seduteForza().filter(s => s.data < dt);
      if (prevS.length && t.volume > 0) { const p = prevS[prevS.length - 1], d = (t.volume / p.volume - 1) * 100; P(d >= -10 ? '+' : 'i', 'Volume ' + (d >= 0 ? '+' : '') + d.toFixed(0) + '% rispetto alla seduta precedente.'); }
      recordCarichiSeduta(a, ex).forEach(r => P('+', 'Nuovo massimo su ' + r.nome + ': ' + fmtNum(r.kg, 1) + ' kg (prima ' + fmtNum(r.prima, 1) + ' kg).'));
    } else P('i', 'Inserisci gli esercizi nel registro qui sotto: calcolo serie, volume e progressi sui carichi.');
  }
  if (kind === 'tennis') {
    const p = note.partita, sets = p && Array.isArray(p.sets) ? p.sets.filter(s => Array.isArray(s) && (Number(s[0]) > 0 || Number(s[1]) > 0)) : [];
    if (sets.length) {
      const r = risultatoPartita(sets);
      P(r.setVinti > r.setPersi ? '+' : 'i', 'Risultato: ' + sets.map(s => s[0] + '-' + s[1]).join(', ') + ' (set ' + r.setVinti + '-' + r.setPersi + ', game ' + r.gameVinti + '-' + r.gamePersi + ').');
    } else P('i', 'Inserisci il punteggio nel riquadro "Partita" per vedere il risultato.');
    if (a.extra) {
      const colpi = Number(a.extra.totalSwings || a.extra.numberOfSwings || a.extra.swings);
      if (colpi > 0) P('i', 'Colpi registrati dall\'orologio: ' + colpi + (min > 0 ? ' (circa ' + fmtNum(colpi / (min / 60), 0) + ' all\'ora)' : '') + '.');
    }
  }
  if (kind !== 'forza') puntiMeteo(a, P);
  const rpe = note && Number(note.rpe) > 0 ? Number(note.rpe) : null;
  if (rpe) P('i', 'Sforzo percepito segnato da te: ' + rpe + '/10.');
  out.sintesi = pezzi.join(' • ') + '. Per questa disciplina non do un voto: ti mostro intensità e, se inserisci i dati, i progressi.';
  return out;
}

function risultatoPartita(sets) {
  let setVinti = 0, setPersi = 0, gameVinti = 0, gamePersi = 0;
  sets.forEach(s => { const io = Number(s[0]) || 0, av = Number(s[1]) || 0; gameVinti += io; gamePersi += av; if (io > av) setVinti++; else if (av > io) setPersi++; });
  return { setVinti, setPersi, gameVinti, gamePersi };
}

// ---- registro esercizi ----
function htmlRegistroEsercizi(note) {
  const ex = note.esercizi || [];
  const nomi = {};
  righeEsercizi().forEach(r => { nomi[r.nome] = true; });
  const CLS = 'bg-slate-900 text-white text-xs rounded-lg border border-white/10 px-2 py-2';
  const righe = ex.map((r, i) => '<tr class="border-t border-white/5">' +
    '<td class="py-1.5 pr-2"><input list="listaEsercizi" value="' + esc(r.nome || '') + '" onchange="aggiornaEsercizio(' + i + ', \'nome\', this.value)" placeholder="Esercizio" class="' + CLS + ' w-40"></td>' +
    '<td class="py-1.5 pr-2"><select onchange="aggiornaEsercizio(' + i + ', \'attrezzo\', this.value)" class="' + CLS + '">' + ATTREZZI.map(t => '<option' + ((r.attrezzo || 'Bilanciere') === t ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></td>' +
    '<td class="py-1.5 pr-2"><input type="number" min="0" value="' + esc(r.serie || '') + '" onchange="aggiornaEsercizio(' + i + ', \'serie\', this.value)" class="' + CLS + ' w-16"></td>' +
    '<td class="py-1.5 pr-2"><input type="number" min="0" value="' + esc(r.rip || '') + '" onchange="aggiornaEsercizio(' + i + ', \'rip\', this.value)" class="' + CLS + ' w-16"></td>' +
    '<td class="py-1.5 pr-2"><input type="number" min="0" step="0.5" value="' + esc(r.kg === undefined ? '' : r.kg) + '" onchange="aggiornaEsercizio(' + i + ', \'kg\', this.value)" class="' + CLS + ' w-20"></td>' +
    '<td class="py-1.5"><button onclick="eliminaEsercizio(' + i + ')" class="text-slate-500 hover:text-red-400 text-sm" title="Elimina">✕</button></td></tr>').join('');
  return '<datalist id="listaEsercizi">' + Object.keys(nomi).map(n => '<option value="' + esc(n) + '">').join('') + '</datalist>' +
    '<div class="overflow-x-auto"><table class="w-full text-xs min-w-[460px]"><thead><tr class="text-slate-500 uppercase tracking-wider text-left"><th class="pb-2 font-bold">Esercizio</th><th class="pb-2 font-bold">Attrezzo</th><th class="pb-2 font-bold">Serie</th><th class="pb-2 font-bold">Rip.</th><th class="pb-2 font-bold">Kg</th><th></th></tr></thead><tbody>' + righe + '</tbody></table></div>' +
    '<button onclick="aggiungiEsercizio()" class="mt-3 px-3 py-2 rounded-lg border border-white/10 text-xs text-slate-300 hover:text-white transition">+ Aggiungi esercizio</button>' +
    '<p id="attTotaliForza" class="text-xs text-slate-400 mt-3">' + testoTotaliForza(ex) + '</p>' +
    '<p class="text-xs text-slate-500 mt-1">Per più carichi diversi sullo stesso esercizio aggiungi più righe. Kg = carico per ogni ripetizione (0 per corpo libero). Si salva in questo browser.</p>';
}
function testoTotaliForza(ex) { const t = totaliEsercizi(ex); return ex.length ? 'Totale: ' + t.serie + ' serie • ' + t.rip + ' ripetizioni • volume ' + Math.round(t.volume).toLocaleString('it-IT') + ' kg' : 'Nessun esercizio inserito.'; }

function rinfrescaProgressi(pref) {
  const wrap = document.getElementById('attProgressiWrap');
  if (!wrap) return;
  const sel = document.getElementById(pref + 'Sel'), prec = sel ? sel.value : '';
  wrap.innerHTML = htmlProgressiForza(pref, prec);
  disegnaProgressiForza(pref);
}

function dopoModificaEsercizi() {
  const nota = leggiNote()[chiaveAtt(attCorrente)] || {};
  const tot = document.getElementById('attTotaliForza');
  if (tot) tot.innerText = testoTotaliForza(nota.esercizi || []);
  aggiornaValutazioneAtt();
  rinfrescaProgressi('det');
}
function aggiungiEsercizio() {
  modificaNota(n => { n.esercizi = n.esercizi || []; const ult = n.esercizi[n.esercizi.length - 1]; n.esercizi.push({ nome: '', attrezzo: ult ? ult.attrezzo : 'Bilanciere', serie: '', rip: '', kg: '' }); });
  const box = document.getElementById('attRegistro');
  if (box) box.innerHTML = htmlRegistroEsercizi(leggiNote()[chiaveAtt(attCorrente)] || {});
}
function aggiornaEsercizio(i, campo, valore) {
  modificaNota(n => { if (n.esercizi && n.esercizi[i]) n.esercizi[i][campo] = valore; });
  dopoModificaEsercizi();
}
function eliminaEsercizio(i) {
  modificaNota(n => { if (n.esercizi) n.esercizi.splice(i, 1); });
  const box = document.getElementById('attRegistro');
  if (box) box.innerHTML = htmlRegistroEsercizi(leggiNote()[chiaveAtt(attCorrente)] || {});
  dopoModificaEsercizi();
}

// ---- progressi sui carichi ----
function htmlProgressiForza(pref, preferito) {
  const righe = righeEsercizi();
  if (!righe.length) return '<p class="text-sm text-slate-400">Quando inserirai esercizi e carichi nelle sedute di forza, qui compariranno i progressi: carico massimo, 1RM stimato e volume.</p>';
  const nomi = {};
  righe.forEach(r => { if (!nomi[r.nomeNorm]) nomi[r.nomeNorm] = r.nome; });
  const CLS = 'bg-slate-900 text-white text-xs rounded-lg border border-white/10 px-3 py-2';
  const prs = Object.keys(nomi).map(n => {
    const r = righe.filter(x => x.nomeNorm === n), best = r.reduce((m, x) => x.kg > m.kg ? x : m, r[0]), e = r.filter(x => x.e1rm).reduce((m, x) => !m || x.e1rm > m.e1rm ? x : m, null);
    return '<tr class="border-t border-white/5"><td class="py-1.5 pr-3 text-white font-semibold">' + esc(nomi[n]) + '</td><td class="py-1.5 pr-3 text-slate-400">' + esc(best.attrezzo) + '</td><td class="py-1.5 pr-3 text-slate-300">' + fmtNum(best.kg, 1) + ' kg × ' + best.rip + '</td><td class="py-1.5 pr-3 text-slate-400">' + esc(fmtData(best.data)) + '</td><td class="py-1.5 text-slate-300">' + (e ? fmtNum(e.e1rm, 1) + ' kg' : '—') + '</td></tr>';
  }).join('');
  return '<div class="flex flex-wrap items-center gap-3 mb-3 text-xs"><span class="text-slate-400">Esercizio:</span><select id="' + pref + 'Sel" class="' + CLS + '" onchange="disegnaProgressiForza(\'' + pref + '\')">' +
    Object.keys(nomi).map(n => '<option value="' + esc(n) + '"' + (n === preferito ? ' selected' : '') + '>' + esc(nomi[n]) + '</option>').join('') + '</select></div>' +
    '<div class="h-60"><canvas id="' + pref + 'ChartCarico"></canvas></div>' +
    '<p class="text-xs text-slate-400 mt-4 mb-2">Volume totale per seduta (serie × ripetizioni × kg)</p><div class="h-48"><canvas id="' + pref + 'ChartVolume"></canvas></div>' +
    '<p class="text-xs text-slate-400 mt-4 mb-2">I tuoi massimi</p><div class="overflow-x-auto"><table class="w-full text-xs min-w-[420px]"><thead><tr class="text-slate-500 uppercase tracking-wider text-left"><th class="pb-2">Esercizio</th><th class="pb-2">Attrezzo</th><th class="pb-2">Miglior carico</th><th class="pb-2">Data</th><th class="pb-2">1RM stimato</th></tr></thead><tbody>' + prs + '</tbody></table></div>' +
    '<p class="text-xs text-slate-500 mt-2">1RM stimato con la formula di Epley (kg × (1 + ripetizioni / 30)), valida fino a circa 12 ripetizioni: è una stima.</p>';
}

function disegnaProgressiForza(pref) {
  const sel = document.getElementById(pref + 'Sel'), c1 = document.getElementById(pref + 'ChartCarico'), c2 = document.getElementById(pref + 'ChartVolume');
  if (!sel || !c1 || !c2) return;
  const lista = pref === 'det' ? attCharts : listaCharts;
  const vecchi = lista.filter(c => c._pref === pref);
  vecchi.forEach(c => { try { c.destroy(); } catch (e) { /* ok */ } });
  const resto = lista.filter(c => c._pref !== pref);
  lista.length = 0; resto.forEach(c => lista.push(c));
  const righe = righeEsercizi().filter(r => r.nomeNorm === sel.value);
  const perSeduta = {};
  righe.forEach(r => { const p = perSeduta[r.k] = perSeduta[r.k] || { data: r.data, kg: 0, e1rm: 0 }; p.kg = Math.max(p.kg, r.kg); p.e1rm = Math.max(p.e1rm, r.e1rm || 0); });
  const punti = Object.keys(perSeduta).map(k => perSeduta[k]).sort((x, y) => x.data - y.data);
  const opzioni = (titolo) => ({ responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#94a3b8' } } },
    scales: { x: { ticks: { color: '#64748b' }, grid: { display: false } }, y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' }, title: { display: true, text: titolo, color: '#64748b' } } } });
  const g1 = new Chart(c1.getContext('2d'), { type: 'line', data: { labels: punti.map(p => formatDateShort(p.data)), datasets: [
    { label: 'Carico massimo (kg)', data: punti.map(p => p.kg), borderColor: '#a855f7', backgroundColor: '#a855f7', borderWidth: 2, pointRadius: 4, tension: 0.2 },
    { label: '1RM stimato (kg)', data: punti.map(p => p.e1rm > 0 ? Math.round(p.e1rm * 10) / 10 : null), borderColor: '#ff9d00', borderDash: [6, 6], backgroundColor: '#ff9d00', borderWidth: 2, pointRadius: 3, tension: 0.2, spanGaps: true }] }, options: opzioni('kg') });
  const sed = seduteForza();
  const g2 = new Chart(c2.getContext('2d'), { type: 'bar', data: { labels: sed.map(s => formatDateShort(s.data)), datasets: [{ label: 'Volume (kg)', data: sed.map(s => Math.round(s.volume)), backgroundColor: '#10b981', borderRadius: 4 }] }, options: opzioni('kg') });
  g1._pref = pref; g2._pref = pref;
  lista.push(g1); lista.push(g2);
}

// ---- tennis ----
function htmlPartita(note) {
  const p = note.partita || {}, sets = p.sets || [];
  const CLS = 'bg-slate-900 text-white text-xs rounded-lg border border-white/10 px-2 py-2 w-14 text-center';
  const righe = [0, 1, 2, 3, 4].map(i => '<div class="flex items-center gap-2"><span class="text-xs text-slate-500 w-10">Set ' + (i + 1) + '</span>' +
    '<input type="number" min="0" max="20" value="' + esc(sets[i] ? sets[i][0] : '') + '" onchange="aggiornaPartita(' + i + ', 0, this.value)" class="' + CLS + '"><span class="text-slate-500">–</span>' +
    '<input type="number" min="0" max="20" value="' + esc(sets[i] ? sets[i][1] : '') + '" onchange="aggiornaPartita(' + i + ', 1, this.value)" class="' + CLS + '"></div>').join('');
  const CL2 = 'bg-slate-900 text-white text-xs rounded-lg border border-white/10 px-3 py-2';
  return '<p class="text-xs text-slate-400 mb-3">Inserisci i game del set: i tuoi a sinistra, dell\'avversario a destra.</p><div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 mb-4">' + righe + '</div>' +
    '<div class="flex flex-wrap items-end gap-3 text-xs"><label class="flex flex-col gap-1 text-slate-400">Superficie<select onchange="aggiornaPartita(\'sup\', 0, this.value)" class="' + CL2 + '">' + SUPERFICI.map(s => '<option value="' + s + '"' + ((p.superficie || '') === s ? ' selected' : '') + '>' + (s || '--') + '</option>').join('') + '</select></label>' +
    '<label class="flex flex-col gap-1 text-slate-400 flex-1 min-w-[160px]">Avversario<input type="text" value="' + esc(p.avversario || '') + '" onchange="aggiornaPartita(\'avv\', 0, this.value)" class="' + CL2 + '"></label></div>';
}
function aggiornaPartita(i, j, valore) {
  modificaNota(n => {
    n.partita = n.partita || { sets: [] };
    if (i === 'sup') n.partita.superficie = valore;
    else if (i === 'avv') n.partita.avversario = valore;
    else { n.partita.sets = n.partita.sets || []; while (n.partita.sets.length <= i) n.partita.sets.push(['', '']); n.partita.sets[i][j] = valore; }
  });
  aggiornaValutazioneAtt();
}

function disegnaTennisAtt() {
  const canvas = document.getElementById('attChartTennis');
  if (!canvas) return;
  const lista = (rawData.activities || []).filter(x => tipoSport(x) === 'tennis' && Number(x.duration_min) > 0 && !isNaN(dataAttivita(x))).sort((x, y) => dataAttivita(x) - dataAttivita(y)).slice(-15);
  if (lista.length < 2) { canvas.parentNode.innerHTML = '<p class="text-sm text-slate-400">Servono almeno due sedute di tennis per vedere l\'andamento.</p>'; return; }
  attCharts.push(new Chart(canvas.getContext('2d'), { type: 'line', data: { labels: lista.map(x => formatDateShort(dataAttivita(x))), datasets: [
    { label: 'FC media (bpm)', data: lista.map(x => Number(x.avg_hr) || null), borderColor: '#ef4444', backgroundColor: '#ef4444', borderWidth: 2, pointRadius: 4, tension: 0.2, spanGaps: true, yAxisID: 'y' },
    { label: 'Dispendio (kcal/h)', data: lista.map(x => Number(x.calories) > 0 ? Math.round(x.calories / (x.duration_min / 60)) : null), borderColor: '#00f0ff', backgroundColor: '#00f0ff', borderWidth: 2, pointRadius: 4, tension: 0.2, spanGaps: true, yAxisID: 'y1' }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#94a3b8' } } },
      scales: { x: { ticks: { color: '#64748b' }, grid: { display: false } }, y: { ticks: { color: '#ef4444' }, grid: { color: 'rgba(255,255,255,0.05)' } }, y1: { position: 'right', ticks: { color: '#00f0ff' }, grid: { drawOnChartArea: false } } } } }));
}

// ---- altri dati dell'orologio ----
const NOMI_EXTRA = { totalSets: 'Set totali', totalGames: 'Game totali', numberOfSwings: 'Colpi totali', totalSwings: 'Colpi totali', forehandSwings: 'Dritti', backhandSwings: 'Rovesci', serves: 'Servizi', totalReps: 'Ripetizioni totali', activeSets: 'Serie attive' };
function nomeExtra(k) { return NOMI_EXTRA[k] || k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase()); }
function htmlExtra(a) {
  const e = a.extra;
  if (!e) return '';
  const nascosti = /Cadence|fastestSplit|VerticalOscillation|GroundContact|StrideLength|VerticalRatio|[Pp]ower/;
  const voci = Object.keys(e).filter(k => !nascosti.test(k) && e[k] !== null);
  if (!voci.length) return '';
  return '<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">' + voci.map(k => '<div class="rounded-xl bg-slate-900/60 border border-white/10 p-3"><p class="text-[10px] uppercase tracking-wider text-slate-500">' + esc(nomeExtra(k)) + '</p><p class="text-lg font-black text-white">' + esc(String(e[k])) + '</p></div>').join('') + '</div>' +
    '<p class="text-xs text-slate-500 mt-2">Valori registrati dall\'orologio per questa attività, come arrivano da Garmin.</p>';
}

// ---- copia di sicurezza di note ed esercizi ----
function esportaNote() {
  const blob = new Blob([JSON.stringify(leggiNote(), null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const l = document.createElement('a');
  l.href = url; l.download = 'note_attivita.json';
  document.body.appendChild(l); l.click(); document.body.removeChild(l);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function importaNote(testo) {
  let j;
  try { j = JSON.parse(testo); } catch (e) { return -1; }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return -1;
  const n = leggiNote();
  let tot = 0;
  Object.keys(j).forEach(k => { if (j[k] && typeof j[k] === 'object') { n[k] = Object.assign({}, n[k] || {}, j[k]); tot++; } });
  salvaNote(n);
  return tot;
}
// ==== FINE SPORT ====

function metricheSport(a, det) { return METRICHE_GRAFICO.filter(m => datiMetrica(a, det, m)); }

function renderDettaglio(a, det) {
  distruggiGraficiAtt();
  const box = document.getElementById('attDettaglio');
  const k = chiaveAtt(a), note = leggiNote()[k] || {}, kind = tipoSport(a);
  const an = analizzaAttivita(a, det, note, pianoPer(a));
  const dt = dataAttivita(a);
  const opzTipo = TIPI_ALLENAMENTO.map(t => '<option value="' + t[0] + '"' + ((note.tipo || 'auto') === t[0] ? ' selected' : '') + '>' + t[1] + '</option>').join('');
  const opzRpe = '<option value="">--</option>' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => '<option value="' + n + '"' + (Number(note.rpe) === n ? ' selected' : '') + '>' + n + '</option>').join('');
  const CLS = 'bg-slate-900 text-white text-xs rounded-lg border border-white/10 px-3 py-2';
  const selTipo = kind === 'corsa' ? '<label class="flex flex-col gap-1 text-slate-400">Tipo di allenamento<select class="' + CLS + '" onchange="salvaNotaAtt(\'tipo\', this.value)">' + opzTipo + '</select></label>' : '';

  let html = '<button onclick="chiudiAttivita()" class="text-xs text-slate-300 hover:text-white mb-4">' + (attOrigine === 'coach' ? '← Torna al calendario' : '← Torna all\'elenco') + '</button>';
  html += '<div class="glass-card neon-orange-bright p-6 mb-6"><p class="text-xs font-extrabold uppercase tracking-wider text-orange-400">' + esc(disciplinaDi(a)) + ' • ' + esc(fmtData(dt)) + ' ' + String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0') + '</p>' +
    '<h2 class="text-2xl font-black text-white">' + esc(a.name || disciplinaDi(a)) + '</h2><p class="text-xs text-slate-400">' + esc(a.location || '') + '</p>' +
    '<div class="flex flex-wrap items-end gap-3 mt-4 text-xs">' + selTipo +
    '<label class="flex flex-col gap-1 text-slate-400">Sforzo percepito<select class="' + CLS + '" onchange="salvaNotaAtt(\'rpe\', this.value)">' + opzRpe + '</select></label>' +
    '<label class="flex flex-col gap-1 text-slate-400 flex-1 min-w-[200px]">Note e sensazioni<input type="text" value="' + esc(note.testo || '') + '" onchange="salvaNotaAtt(\'testo\', this.value)" placeholder="es. gambe pesanti, ottime sensazioni…" class="' + CLS + '"></label></div>' +
    '<p class="text-xs text-slate-500 mt-2">Tipo, sforzo e note si salvano in questo browser (su un altro dispositivo non compaiono).</p></div>';
  const valutazione = '<div id="attValutazione">' + htmlValutazione(an) + '</div>';
  const titoloV = (neon, t) => '<h3 class="text-sm font-extrabold uppercase tracking-wider ' + (TITOLO_COLORE[neon] || 'text-white') + ' mb-3">' + t + '</h3>';
  if (det && det.percorso && det.percorso.length > 1) {
    const kmA = Number(a.distance_km), minA = Number(a.duration_min);
    const mini = [['Distanza', kmA > 0 ? fmtNum(kmA, 2) + ' km' : '--'], ['Tempo', minA > 0 ? fmtTempo(minA * 60) : '--'], ['Passo', kind === 'corsa' && passoAtt(a) ? fmtPasso(passoAtt(a)) : '--']]
      .map(m => '<div class="rounded-xl bg-slate-900/60 border border-white/10 p-2 text-center"><p class="text-[10px] uppercase tracking-wider text-slate-500">' + m[0] + '</p><p class="text-sm font-black text-white">' + m[1] + '</p></div>').join('');
    html += '<div class="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">' +
      '<div class="lg:col-span-2 glass-card neon-amber p-6">' + titoloV('neon-amber', 'Percorso') + svgPercorso(det.percorso) + '<div class="grid grid-cols-3 gap-2 mt-4">' + mini + '</div></div>' +
      '<div class="lg:col-span-3 glass-card neon-emerald p-6">' + titoloV('neon-emerald', 'Valutazione dell\'allenamento') + valutazione + '</div></div>';
  } else {
    html += sezAtt('neon-emerald', 'Valutazione dell\'allenamento', valutazione);
  }

  // numeri chiave, scelti in base allo sport
  const car = [];
  const add = (titolo, icona, valore, sub) => { if (valore !== null && valore !== undefined && valore !== '--') car.push({ titolo, icona, valore, sub: sub || '' }); };
  const km = Number(a.distance_km), min = Number(a.duration_min);
  if (kind !== 'forza') add(kind === 'tennis' ? 'Distanza percorsa' : 'Distanza', '📏', km > 0 ? fmtNum(km, 2) + ' km' : null);
  add('Tempo', '⏱️', min > 0 ? fmtTempo(min * 60) : null, Number(a.elapsed_s) > 0 && Number(a.moving_s) > 0 && Math.abs(a.elapsed_s - a.moving_s) > 5 ? 'in movimento ' + fmtTempo(a.moving_s) + ' • totale ' + fmtTempo(a.elapsed_s) : '');
  if (kind === 'corsa' || kind === 'camminata') add('Passo medio', '🏃', passoAtt(a) ? fmtPasso(passoAtt(a)) : null, kind === 'corsa' && Number(a.gap_speed_ms) > 0 ? 'in pari salita ' + fmtPasso(1000 / a.gap_speed_ms) : '');
  if (kind === 'bici') add('Velocità media', '🚴', Number(a.avg_speed_ms) > 0 ? fmtNum(a.avg_speed_ms * 3.6, 1) + ' km/h' : null, Number(a.max_speed_ms) > 0 ? 'massima ' + fmtNum(a.max_speed_ms * 3.6, 1) + ' km/h' : '');
  if (kind === 'nuoto' && km > 0 && min > 0) add('Passo', '🏊', fmtTempo(min * 60 / (km * 10)) + ' /100 m');
  add('FC media', '❤️', Number(a.avg_hr) > 0 ? Math.round(a.avg_hr) + ' bpm' : null, Number(a.max_hr) > 0 ? 'massima ' + Math.round(a.max_hr) + ' bpm' : '');
  if (kind === 'corsa') add('Cadenza', '👣', Number(a.avg_cadence) > 0 ? Math.round(a.avg_cadence) + ' spm' : null, Number(a.max_cadence) > 0 ? 'massima ' + Math.round(a.max_cadence) + ' spm' : '');
  if (kind === 'camminata' && Number(a.steps) > 0) add('Passi', '👣', Number(a.steps).toLocaleString('it-IT'));
  if (kind === 'corsa' || kind === 'camminata' || kind === 'bici' || kind === 'altro') add('Dislivello', '⛰️', Number(a.elevation_gain_m) > 0 || Number(a.elevation_loss_m) > 0 ? '+' + Math.round(a.elevation_gain_m || 0) + ' m' : null, Number(a.elevation_loss_m) > 0 ? '-' + Math.round(a.elevation_loss_m) + ' m' : '');
  add('Effetto allenante', '💥', Number(a.aerobic_te) > 0 ? fmtNum(a.aerobic_te, 1) : null, (Number(a.anaerobic_te) > 0 ? 'anaerobico ' + fmtNum(a.anaerobic_te, 1) : '') + (a.te_label ? (Number(a.anaerobic_te) > 0 ? ' • ' : '') + String(a.te_label).toLowerCase().replace(/_/g, ' ') : ''));
  add('Calorie', '🔥', Number(a.calories) > 0 ? Math.round(a.calories) + ' kcal' : null);
  if (kind === 'corsa' || kind === 'bici') add('Potenza', '⚡', Number(a.avg_power) > 0 ? Math.round(a.avg_power) + ' W' : null, (Number(a.norm_power) > 0 ? 'normalizzata ' + Math.round(a.norm_power) + ' W' : '') + (Number(a.max_power) > 0 ? ' • max ' + Math.round(a.max_power) + ' W' : ''));
  add('Body Battery', '🔋', Number(a.body_battery_delta) ? (a.body_battery_delta > 0 ? '+' : '') + a.body_battery_delta : null, 'variazione durante l\'attività');
  if (kind === 'forza' && (note.esercizi || []).length) { const t = totaliEsercizi(note.esercizi); add('Volume sollevato', '🏋️', Math.round(t.volume).toLocaleString('it-IT') + ' kg', t.serie + ' serie • ' + t.rip + ' ripetizioni'); }
  const m = a.meteo;
  if (m && m.t !== null && m.t !== undefined && kind !== 'forza') add('Meteo', '🌤️', Math.round(m.t) + ' °C', [testoMeteo(m.codice), Number(m.app) === m.app ? 'percepita ' + Math.round(m.app) + ' °C' : '', Number(m.um) > 0 ? 'umidità ' + Math.round(m.um) + '%' : '', Number(m.vento) >= 0 && m.vento !== null ? 'vento ' + Math.round(m.vento) + ' km/h' : '', Number(m.pioggia) > 0 ? 'pioggia ' + fmtNum(m.pioggia, 1) + ' mm' : ''].filter(Boolean).join(' • '));
  html += sezAtt('neon-cyan-bright', 'Numeri chiave', '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">' + car.map((c, i) => cartaRecord(NEON_CLASSI[i % NEON_CLASSI.length], c)).join('') + '</div>');

  // sezioni specifiche per sport
  if (kind === 'forza') {
    html += sezAtt('neon-purple', 'Registro esercizi', '<div id="attRegistro">' + htmlRegistroEsercizi(note) + '</div>');
    const primoEs = (note.esercizi || []).map(r => String(r.nome || '').trim().toLowerCase()).find(Boolean);
    html += sezAtt('neon-emerald', 'Progressi sui carichi', '<div id="attProgressiWrap">' + htmlProgressiForza('det', primoEs) + '</div>');
  }
  if (kind === 'tennis') {
    html += sezAtt('neon-emerald', 'Partita', htmlPartita(note));
    html += sezAtt('neon-cyan-bright', 'Intensità nelle ultime sedute di tennis', '<div class="h-60"><canvas id="attChartTennis"></canvas></div>');
  }

  // corsa e camminata: km per km
  const haSerie = det && det.serie && det.serie.t && (det.serie.spd || det.serie.hr);
  const haLaps = det && det.laps && det.laps.length;
  if (kind === 'corsa' || kind === 'camminata') {
    if (haLaps || haSerie) html += sezAtt('neon-coral', 'Chilometro per chilometro', (haLaps ? tabellaKm(det.laps) : '') + '<div class="h-72 mt-4"><canvas id="attChartPasso"></canvas></div>');
    else if (kind === 'corsa') html += sezAtt('neon-coral', 'Chilometro per chilometro', '<p class="text-sm text-slate-400">I dettagli di questa attività non sono (ancora) stati scaricati: compaiono dopo l\'aggiornamento dei dati, a partire dalle attività più recenti. Se non arrivano mai, l\'API Garmin non li offre.</p>');
  }

  // cuore: zone
  const zoneHtml = barraZone(a, 'Zone di frequenza cardiaca');
  if (!zoneHtml.includes('non disponibili')) html += sezAtt('neon-azure', 'Cuore: tempo nelle zone', zoneHtml);

  // dinamica di corsa (solo corsa) oppure andamento nel tempo (altri sport)
  const chipsOk = metricheSport(a, det).length > 0;
  if (kind === 'corsa') {
    const dyn = [
      ['Contatto al suolo', '🦶', 'avg_gct', v => Math.round(v) + ' ms'], ['Oscillazione verticale', '↕️', 'avg_vert_osc', v => fmtNum(v, 1) + ' cm'],
      ['Lunghezza del passo', '📐', 'avg_stride', v => v > 10 ? fmtNum(v / 100, 2) + ' m' : fmtNum(v, 2) + ' m'], ['Rapporto verticale', '📊', 'avg_vert_ratio', v => fmtNum(v, 1) + ' %']
    ].filter(d => Number(a[d[2]]) > 0).map(d => {
      const mm = mediaMetrica(d[2], a), v = Number(a[d[2]]);
      const sub = mm ? (v >= mm ? '+' : '-') + fmtNum(Math.abs(v - mm) / mm * 100, 1) + '% rispetto alla tua media recente' : 'media dell\'attività';
      return { titolo: d[0], icona: d[1], valore: d[3](v), sub };
    });
    if (dyn.length || chipsOk) {
      html += sezAtt('neon-purple', 'Dinamica di corsa', (dyn.length ? '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">' + dyn.map((c, i) => cartaRecord(NEON_CLASSI[(i + 4) % NEON_CLASSI.length], c)).join('') + '</div>' : '') +
        (chipsOk ? '<p class="text-xs text-slate-400 mb-2">Scegli una o più misure da vedere sullo stesso grafico:</p><div id="attMetricheChips" class="flex flex-wrap gap-2 mb-2"></div><p id="attMetricaNota" class="text-xs text-slate-500 mb-3"></p><div class="h-72"><canvas id="attChartMetrica"></canvas></div>' : ''));
    }
  } else if (chipsOk) {
    html += sezAtt('neon-coral', 'Andamento nel tempo', '<p class="text-xs text-slate-400 mb-2">Scegli una o più misure da vedere sullo stesso grafico:</p><div id="attMetricheChips" class="flex flex-wrap gap-2 mb-2"></div><p id="attMetricaNota" class="text-xs text-slate-500 mb-3"></p><div class="h-72"><canvas id="attChartMetrica"></canvas></div>');
  }
  if (kind !== 'corsa') { const ex = htmlExtra(a); if (ex) html += sezAtt('neon-amber', 'Altri dati dell\'orologio', ex); }
  box.innerHTML = html;
  if ((kind === 'corsa' || kind === 'camminata') && (haLaps || haSerie)) disegnaPassoFcAtt(det);
  if (document.getElementById('attMetricheChips')) inizializzaMetricheAtt();
  if (kind === 'forza') disegnaProgressiForza('det');
  if (kind === 'tennis') disegnaTennisAtt();
}

function disegnaPassoFcAtt(det) {
  const canvas = document.getElementById('attChartPasso');
  if (!canvas) return;
  let labels, pace, hr;
  const s = det.serie;
  if (s && s.t && (s.spd || s.hr)) {
    const x = s.d ? s.d.map(v => v === null ? null : v / 1000) : s.t.map(v => v / 60);
    labels = x.map(v => v === null ? '' : v.toFixed(2));
    const spd = s.spd || [];
    pace = labels.map((_, i) => { const w = []; for (let j = i - 2; j <= i + 2; j++) if (spd[j] > 0.8) w.push(spd[j]); const p = w.length ? 1000 / mediaArr(w) : null; return p && p < 600 ? Math.round(p) : null; });
    hr = s.hr || labels.map(() => null);
  } else {
    let cum = 0;
    labels = det.laps.map(l => { cum += l.d; return (cum / 1000).toFixed(2); });
    pace = det.laps.map(l => Math.round(l.t / l.d * 1000));
    hr = det.laps.map(l => l.hr || null);
  }
  const scales = {
    x: { title: { display: true, text: 'km', color: '#64748b' }, ticks: { color: '#64748b', maxTicksLimit: 10, autoSkip: true }, grid: { display: false } },
    y: { reverse: true, title: { display: true, text: 'Passo (più in alto = più veloce)', color: '#ff9d00' }, ticks: { color: '#ff9d00', callback: v => fmtPasso(v) }, grid: { color: 'rgba(255,255,255,0.05)' } }
  };
  const datasets = [{ label: 'Passo', data: pace, borderColor: '#ff9d00', backgroundColor: '#ff9d00', borderWidth: 2, pointRadius: 0, tension: 0.25, spanGaps: true, yAxisID: 'y' }];
  if (hr.some(v => v)) {
    datasets.push({ label: 'FC (bpm)', data: hr, borderColor: '#ef4444', backgroundColor: '#ef4444', borderWidth: 2, pointRadius: 0, tension: 0.25, spanGaps: true, yAxisID: 'y1' });
    scales.y1 = { position: 'right', title: { display: true, text: 'FC (bpm)', color: '#ef4444' }, ticks: { color: '#ef4444' }, grid: { drawOnChartArea: false } };
  }
  attCharts.push(new Chart(canvas.getContext('2d'), {
    type: 'line', data: { labels, datasets },
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: '#94a3b8' } }, tooltip: { callbacks: { title: (items) => items.length ? items[0].label + ' km' : '', label: (ctx) => ctx.dataset.yAxisID === 'y' ? 'Passo: ' + fmtPasso(ctx.parsed.y) : 'FC: ' + Math.round(ctx.parsed.y) + ' bpm' } } },
      scales }
  }));
}

let attChartMetricaIstanza = null;
let attMetricheAttive = [];

function metricheDisponibili() { return attCorrente ? METRICHE_GRAFICO.filter(m => datiMetrica(attCorrente, attDettCorrente, m)) : []; }

function renderChipsMetriche() {
  const box = document.getElementById('attMetricheChips');
  if (!box) return;
  box.innerHTML = metricheDisponibili().map(m => {
    const on = attMetricheAttive.indexOf(m.k) >= 0;
    return '<button onclick="toggleMetricaAtt(\'' + m.k + '\')" class="px-3 py-1.5 text-xs rounded-full border transition ' + (on ? 'font-extrabold text-slate-950 border-transparent' : 'font-bold text-slate-300 border-white/10 hover:text-white') + '" style="' + (on ? 'background:' + m.colore : '') + '">' + esc(m.nome) + '</button>';
  }).join('');
}

function toggleMetricaAtt(k) {
  const i = attMetricheAttive.indexOf(k);
  if (i >= 0) { if (attMetricheAttive.length > 1) attMetricheAttive.splice(i, 1); } else attMetricheAttive.push(k);
  renderChipsMetriche();
  disegnaMetricaAtt();
}

function inizializzaMetricheAtt() {
  const disp = metricheDisponibili();
  const preferite = ['cad', 'gct', 'vo', 'sl', 'vr', 'pw', 'hr', 'pace', 'el'];
  const primo = preferite.find(k => disp.some(m => m.k === k)) || (disp[0] && disp[0].k);
  attMetricheAttive = primo ? [primo] : [];
  renderChipsMetriche();
  disegnaMetricaAtt();
}

function disegnaMetricaAtt() {
  const canvas = document.getElementById('attChartMetrica');
  if (!canvas || !attCorrente) return;
  const serie = attMetricheAttive.map(k => METRICHE_GRAFICO.find(m => m.k === k)).filter(Boolean)
    .map(m => ({ m, d: datiMetrica(attCorrente, attDettCorrente, m) })).filter(o => o.d);
  if (!serie.length) return;
  const multi = serie.length > 1;
  if (attChartMetricaIstanza) { attCharts = attCharts.filter(c => c !== attChartMetricaIstanza); try { attChartMetricaIstanza.destroy(); } catch (e) { /* ok */ } }
  const nota = document.getElementById('attMetricaNota');
  if (nota) nota.innerText = multi ? 'Con più misure insieme le scale sono normalizzate: ogni curva va da 0 (il suo minimo) a 100 (il suo massimo); per il passo, più in alto = più veloce. Passa il cursore o il dito per i valori reali.' : '';
  const datasets = serie.map(o => {
    const vals = o.d.punti.map(p => p.y).filter(v => v !== null && v !== undefined);
    const mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
    const norm = v => v === null || v === undefined ? null : (mx === mn ? 50 : (o.m.inverti ? (mx - v) : (v - mn)) / (mx - mn) * 100);
    return {
      label: o.m.nome, data: o.d.punti.map(p => ({ x: p.x, y: multi ? norm(p.y) : p.y, reale: p.y })),
      borderColor: o.m.colore, backgroundColor: o.m.colore, borderWidth: 2, pointRadius: 0, tension: 0.25, spanGaps: true, fmtReale: o.m.fmt
    };
  });
  const unitaX = serie[0].d.unita;
  const y = multi
    ? { min: 0, max: 100, title: { display: true, text: 'scala normalizzata', color: '#64748b' }, ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } }
    : { reverse: !!serie[0].m.inverti, title: { display: true, text: serie[0].m.nome + ' (' + serie[0].m.unita + ')', color: serie[0].m.colore }, ticks: { color: '#64748b', callback: v => serie[0].m.fmt(v) }, grid: { color: 'rgba(255,255,255,0.05)' } };
  attChartMetricaIstanza = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      plugins: {
        legend: { labels: { color: '#94a3b8' } },
        tooltip: { callbacks: { title: (items) => items.length ? Number(items[0].parsed.x).toFixed(2) + ' ' + unitaX : '', label: (ctx) => ctx.dataset.label + ': ' + ctx.dataset.fmtReale(ctx.raw.reale) } }
      },
      scales: { x: { type: 'linear', title: { display: true, text: unitaX, color: '#64748b' }, ticks: { color: '#64748b', maxTicksLimit: 10 }, grid: { display: false } }, y }
    }
  });
  attCharts.push(attChartMetricaIstanza);
}
// ==== FINE ATTIVITA ====

// ==== CALENDARIO ====
let calMese = null;
const MESI_IT = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
const COLORI_TIPO_CAL = { facile: '#10b981', lungo: '#38bdf8', progressivo: '#84cc16', soglia: '#ff9d00', ritmogara: '#ff6b00', ripetute: '#ef4444', fartlek: '#f43f5e', gara: '#eab308', corsa: '#94a3b8', forza: '#a855f7', altro: '#64748b' };

function calSposta(delta) { calMese = new Date(calMese.getFullYear(), calMese.getMonth() + delta, 1); renderCalendario(); }
function calOggi() { const o = new Date(); calMese = new Date(o.getFullYear(), o.getMonth(), 1); renderCalendario(); }
function apriDaCalendario(chiave) { switchTab('tab-attivita'); apriAttivita(chiave, 'coach'); }

function chipCal(a, base, note) {
  const k = chiaveAtt(a), run = eCorsa(a);
  const tipo = run ? ((note[k] && note[k].tipo && note[k].tipo !== 'auto') ? note[k].tipo : riconosciTipo(a, null, base).tipo) : null;
  const col = run ? (COLORI_TIPO_CAL[tipo] || COLORI_TIPO_CAL.corsa) : (COLORI_DISCIPLINA[disciplinaDi(a)] || COLORI_TIPO_CAL.altro);
  const km = Number(a.distance_km), min = Number(a.duration_min);
  const testo = run && km > 0 ? fmtNum(km, 1) + ' km' : (min > 0 ? Math.round(min) + '\'' : '');
  const nome = run ? (NOMI_TIPO[tipo] || 'Corsa') : disciplinaDi(a);
  const titolo = (a.name || nome) + (km > 0 ? ' • ' + fmtNum(km, 2) + ' km' : '') + (min > 0 ? ' • ' + fmtTempo(min * 60) : '');
  return '<button onclick="apriDaCalendario(\'' + esc(k) + '\')" title="' + esc(titolo) + '" class="block w-full text-left rounded-md px-1.5 py-1 mb-1 text-[10px] sm:text-[11px] leading-tight font-bold truncate hover:brightness-125 transition" style="background:' + col + '33;border-left:3px solid ' + col + ';color:#e2e8f0"><span class="hidden sm:inline">' + esc(nome) + ' </span>' + esc(testo) + '</button>';
}

function renderCalendario() {
  const griglia = document.getElementById('calGriglia');
  if (!griglia || !rawData) return;
  registraAttivita();
  if (!calMese) { const o = new Date(); calMese = new Date(o.getFullYear(), o.getMonth(), 1); }
  const anno = calMese.getFullYear(), mese = calMese.getMonth();
  document.getElementById('calTitolo').innerText = MESI_IT[mese] + ' ' + anno;

  const perGiorno = {};
  (rawData.activities || []).forEach(a => {
    const d = dataAttivita(a);
    if (isNaN(d) || !(Number(a.duration_min) > 0)) return;
    const k = isoLocale(d);
    (perGiorno[k] = perGiorno[k] || []).push(a);
  });
  Object.keys(perGiorno).forEach(k => perGiorno[k].sort((x, y) => dataAttivita(x) - dataAttivita(y)));
  const pianoGiorno = {};
  if (Array.isArray(pianoDati)) pianoDati.forEach(p => { if (p && p.date) (pianoGiorno[p.date] = pianoGiorno[p.date] || []).push(p); });
  const note = leggiNote(), base = baselineCorse(null), oggiIso = isoLocale(new Date());

  const primo = new Date(anno, mese, 1), ultimo = new Date(anno, mese + 1, 0);
  const inizio = lunediDi(primo);
  const settimane = Math.ceil((Math.round((ultimo - inizio) / 86400000) + 1) / 7);
  const giorniSett = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
  const colonne = 'display:grid;grid-template-columns:repeat(7,minmax(0,1fr)) 74px;gap:4px';
  let html = '<div style="' + colonne + '" class="mb-1">' + giorniSett.map(g => '<div class="text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">' + g + '</div>').join('') + '<div class="text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">Sett.</div></div>';

  let kmMese = 0, minMese = 0, sessMese = 0; const giorniAttivi = {};
  for (let w = 0; w < settimane; w++) {
    let kmSett = 0, minSett = 0, nSett = 0, celle = '';
    for (let g = 0; g < 7; g++) {
      const d = new Date(inizio.getFullYear(), inizio.getMonth(), inizio.getDate() + w * 7 + g);
      const k = isoLocale(d), fuori = d.getMonth() !== mese;
      const lista = perGiorno[k] || [];
      lista.forEach(a => { if (eCorsa(a)) kmSett += Number(a.distance_km || 0); minSett += Number(a.duration_min || 0); nSett += 1; });
      if (!fuori && lista.length) { giorniAttivi[k] = true; lista.forEach(a => { if (eCorsa(a)) kmMese += Number(a.distance_km || 0); minMese += Number(a.duration_min || 0); sessMese += 1; }); }
      const chips = lista.slice(0, 3).map(a => chipCal(a, base, note)).join('') + (lista.length > 3 ? '<p class="text-[10px] text-slate-500">+' + (lista.length - 3) + ' altre</p>' : '');
      const piani = (pianoGiorno[k] || []).map(p => '<div class="rounded-md px-1.5 py-1 mb-1 text-[10px] leading-tight border border-dashed border-white/30 text-slate-300 truncate" title="' + esc(p.titolo || p.tipo || 'Piano') + '">Piano: ' + esc(NOMI_TIPO[p.tipo] || p.titolo || p.tipo || '') + (Number(p.distanza_km) > 0 ? ' ' + fmtNum(p.distanza_km, 0) + ' km' : '') + '</div>').join('');
      celle += '<div class="min-h-[76px] sm:min-h-[96px] rounded-lg border border-white/5 bg-slate-900/40 p-1 ' + (fuori ? 'opacity-35 ' : '') + (k === oggiIso ? 'ring-1 ring-orange-400' : '') + '">' +
        '<p class="text-[10px] ' + (k === oggiIso ? 'text-orange-400 font-extrabold' : 'text-slate-500') + ' mb-1">' + d.getDate() + '</p>' + piani + chips + '</div>';
    }
    celle += '<div class="rounded-lg bg-slate-800/40 p-1.5 text-center flex flex-col justify-center"><p class="text-xs font-black text-white">' + (kmSett > 0 ? fmtNum(kmSett, 1) + ' km' : '—') + '</p><p class="text-[10px] text-slate-400">' + (minSett > 0 ? formatOreMinuti(minSett / 60) : '') + '</p><p class="text-[10px] text-slate-500">' + (nSett ? nSett + (nSett === 1 ? ' sess.' : ' sess.') : '') + '</p></div>';
    html += '<div style="' + colonne + '" class="mb-1">' + celle + '</div>';
  }
  griglia.innerHTML = html;
  document.getElementById('calRiepilogo').innerText = 'Nel mese: ' + fmtNum(kmMese, 1) + ' km di corsa • ' + formatOreMinuti(minMese / 60) + ' di attività • ' + sessMese + (sessMese === 1 ? ' sessione' : ' sessioni') + ' • ' + Object.keys(giorniAttivi).length + ' giorni attivi';
  const leg = ['facile', 'lungo', 'progressivo', 'soglia', 'ritmogara', 'ripetute', 'fartlek', 'gara', 'corsa'].map(t => '<span><span class="inline-block w-2.5 h-2.5 rounded-sm mr-1" style="background:' + COLORI_TIPO_CAL[t] + '"></span>' + (NOMI_TIPO[t] || t) + '</span>')
    .concat(['Forza', 'Tennis', 'Bici', 'Camminata'].map(n => '<span><span class="inline-block w-2.5 h-2.5 rounded-sm mr-1" style="background:' + (COLORI_DISCIPLINA[n] || COLORI_TIPO_CAL.altro) + '"></span>' + n + '</span>'));
  document.getElementById('calLegenda').innerHTML = leg.join('');
}
// ==== FINE CALENDARIO ====

function changeWeek(direction) {
  weekOffset += direction;
  renderOverview();
  renderHealthTab();
}

async function loadDashboard() {
  try {
    if (typeof window.INTERVALS_DATA !== 'undefined' && window.INTERVALS_DATA) {
      rawData = window.INTERVALS_DATA;
      console.log("Dati Intervals.icu / Huawei caricati con successo da script globale.");
    } else {
      const response = await fetch('garmin_data.json?t=' + new Date().getTime());
      if (!response.ok) throw new Error('File JSON non trovato');
      rawData = await response.json();
    }
    
    baseDate = new Date();

    renderNextEvent();
    renderOverview();
    renderHealthTab();
    renderRecords();
    renderComparazione();
    renderAttivita();
    renderCalendario();
  } catch (err) {
    console.error("Errore nel caricamento dei dati della dashboard:", err);
    if (typeof window.INTERVALS_DATA !== 'undefined') {
      rawData = window.INTERVALS_DATA;
      baseDate = new Date();
      renderOverview();
      renderHealthTab();
    }
  }
}

function getHealthArray() {
  if (!rawData) return [];
  if (Array.isArray(rawData)) return rawData;
  return rawData.daily_health || rawData.health_data || rawData.user_summary || [];
}

function getWeekMetrics(mondayObj) {
  if(!rawData) return { steps: [], runs: [], bpm: [], sleep: [], totalDist: 0, avgSteps: 0, avgBpm: 0, avgSleep: 0, calories: [] };
  
  const health = getHealthArray();
  const activities = rawData.activities || [];

  const weekDatesYMD = [];
  for(let i=0; i<7; i++) {
    const d = new Date(mondayObj);
    d.setDate(d.getDate() + i);
    weekDatesYMD.push(formatDateYMD(d));
  }

  const steps = [];
  const sleep = [];
  const bpm = [];
  const calories = [];
  const runs = [0, 0, 0, 0, 0, 0, 0];
  let totalDist = 0;

  weekDatesYMD.forEach((dateStr) => {
    const match = health.find(h => {
      const d = normalizeDateStr(getVal(h, ['date', 'calendarDate', 'day', 'day_str']));
      return d === dateStr;
    });

    if(match) {
      const st = getVal(match, ['steps', 'total_steps', 'step_count']);
      steps.push(st !== null ? Number(st) : null);

      const sl = getVal(match, ['sleep_hours', 'sleep_time', 'total_sleep_hours']);
      sleep.push(sl !== null ? Number(sl) : null);

      const hr = getVal(match, ['resting_hr', 'restingHeartRate', 'rhr']);
      bpm.push(hr !== null ? Number(hr) : null);

      const cal = getVal(match, ['calories', 'total_calories', 'active_calories']);
      calories.push(cal !== null ? Number(cal) : null);
    } else {
      steps.push(null);
      sleep.push(null);
      bpm.push(null);
      calories.push(null);
    }
  });

  activities.forEach(act => {
    const actDateRaw = getVal(act, ['date', 'start_time', 'start_time_local', 'day']);
    if (actDateRaw) {
      const actDateStr = normalizeDateStr(actDateRaw);
      const dayIndex = weekDatesYMD.indexOf(actDateStr);
      const actType = String(getVal(act, ['type', 'activity_type', 'name'], '')).toLowerCase();
      
      if (dayIndex !== -1 && (actType.includes('run') || actType.includes('corsa') || actType === 'running' || actType === 'virtualrun')) {
        let dist = Number(getVal(act, ['distance_km', 'distance', 'dist_km', 'distance_m'], 0));
        if (dist > 1000) dist = dist / 1000;
        runs[dayIndex] += dist;
        totalDist += dist;
      }
    }
  });

  const validSteps = steps.filter(v => v !== null && v > 0);
  const validBpm = bpm.filter(v => v !== null && v > 0);
  const validSleep = sleep.filter(v => v !== null && v > 0);
  const validCal = calories.filter(v => v !== null && v > 0);

  const avgSteps = validSteps.length ? Math.round(validSteps.reduce((a,b)=>a+b,0)/validSteps.length) : 0;
  const avgBpm = validBpm.length ? Math.round(validBpm.reduce((a,b)=>a+b,0)/validBpm.length) : 0;
  const avgSleep = validSleep.length ? (validSleep.reduce((a,b)=>a+b,0)/validSleep.length).toFixed(1) : 0;
  const avgCal = validCal.length ? Math.round(validCal.reduce((a,b)=>a+b,0)/validCal.length) : 0;

  return { steps, runs, bpm, sleep, calories, totalDist, avgSteps, avgBpm, avgSleep, avgCal };
}

function renderOverview() {
  if(!rawData) return;

  const currentMonday = getMonday(baseDate);
  currentMonday.setDate(currentMonday.getDate() + (weekOffset * 7));
  currentMonday.setHours(0, 0, 0, 0);

  const currentSunday = new Date(currentMonday);
  currentSunday.setDate(currentSunday.getDate() + 6);

  const prevMonday = new Date(currentMonday);
  prevMonday.setDate(prevMonday.getDate() - 7);

  const rangeText = `${formatDateShort(currentMonday)} – ${formatDateShort(currentSunday)}`;
  document.getElementById('currentWeekRange').innerText = rangeText;
  document.getElementById('weekSubHeader').innerText = `Settimana Solare: ${rangeText}`;

  const currData = getWeekMetrics(currentMonday);
  const prevData = getWeekMetrics(prevMonday);
  renderWeeklyHours(currentMonday);

  const diffSteps = currData.avgSteps - prevData.avgSteps;
  const diffRuns = currData.totalDist - prevData.totalDist;
  const diffBpm = currData.avgBpm - prevData.avgBpm;
  const diffSleep = Number(currData.avgSleep) - Number(prevData.avgSleep);

  const stepsDiffStr = diffSteps >= 0 ? `+${diffSteps.toLocaleString('it-IT')}` : `${diffSteps.toLocaleString('it-IT')}`;
  const runsDiffStr = diffRuns >= 0 ? `+${diffRuns.toFixed(1)}` : `${diffRuns.toFixed(1)}`;
  const bpmDiffStr = diffBpm >= 0 ? `+${diffBpm}` : `${diffBpm}`;
  const sleepDiffStr = (diffSleep >= 0 ? '+' : '-') + formatOreMinuti(Math.abs(diffSleep));

  document.getElementById('diffRunsStepsLabel').innerText = `Corsa: ${runsDiffStr} km | Passi: ${stepsDiffStr}/gg`;
  document.getElementById('diffBpmSleepLabel').innerText = `FC riposo: ${bpmDiffStr} bpm | Sonno: ${sleepDiffStr}/gg`;

  const health = getHealthArray();
  const targetEntry = health.length > 0 ? health[0] : {};

  document.getElementById('cardDist').innerText = currData.totalDist.toFixed(1) + ' km';
  document.getElementById('cardWorkouts').innerText = currData.runs.filter(r => r > 0).length + ' corse svolte';
  
  const hrVal = getVal(targetEntry, ['resting_hr', 'restingHeartRate', 'rhr'], '--');
  document.getElementById('cardBpmToday').innerText = hrVal + (hrVal !== '--' ? ' bpm' : '');
  document.getElementById('cardBpmAvg').innerText = `Media sett.: ${currData.avgBpm || '--'} bpm`;

  const stepsVal = getVal(targetEntry, ['steps', 'total_steps'], 0);
  document.getElementById('cardStepsToday').innerText = Number(stepsVal).toLocaleString('it-IT');
  document.getElementById('cardStepsAvg').innerText = `Media sett.: ${currData.avgSteps.toLocaleString('it-IT')} passi/gg`;

  let sleepVal = getVal(targetEntry, ['sleep_hours', 'sleep_time'], 0);
  document.getElementById('cardSleepToday').innerText = formatOreMinuti(sleepVal);
  document.getElementById('cardSleepAvg').innerText = `Media sett.: ${formatOreMinuti(currData.avgSleep)}/gg`;

  const calVal = getVal(targetEntry, ['calories', 'total_calories'], 0);
  document.getElementById('cardCalToday').innerText = Number(calVal).toLocaleString('it-IT') + ' kcal';
  document.getElementById('cardCalAvg').innerText = `Media sett.: ${currData.avgCal.toLocaleString('it-IT')} kcal/gg`;

  const dayLabels = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
  const weekDays = dayLabels.map((lbl, idx) => {
    const d = new Date(currentMonday);
    d.setDate(d.getDate() + idx);
    return `${lbl} ${d.getDate()}`;
  });

  initCharts(weekDays, currData.steps, currData.runs, currData.bpm, currData.sleep);
}

function renderUltimoAllenamento(activities) {
  const elTempo = document.getElementById('valRecoveryTime');
  const elSub = document.getElementById('valRecoverySub');
  const adesso = new Date();
  let ultima = null;
  let ore = null;
  activities.forEach(act => {
    const raw = getVal(act, ['date', 'start_time', 'start_time_local']);
    if (!raw) return;
    const h = (adesso - new Date(String(raw).replace(' ', 'T'))) / 3600000;
    if (isNaN(h) || h < 0) return;
    if (ore === null || h < ore) { ultima = act; ore = h; }
  });
  if (!ultima) {
    elTempo.innerText = '--';
    elSub.innerText = 'Nessun allenamento trovato';
    return;
  }
  elTempo.innerText = ore < 1 ? 'Meno di 1 ora fa' : ore < 48 ? Math.floor(ore) + ' ore fa' : Math.floor(ore / 24) + ' giorni fa';
  const nomi = { running: 'Corsa', trail_running: 'Trail', strength_training: 'Forza', tennis_v2: 'Tennis', cycling: 'Bici', walking: 'Camminata', hiking: 'Escursione' };
  const tipo = String(getVal(ultima, ['type'], 'Allenamento'));
  let testo = nomi[tipo] || (tipo.charAt(0).toUpperCase() + tipo.slice(1).replace(/_/g, ' '));
  const km = Number(getVal(ultima, ['distance_km'], 0));
  if (km > 0) testo += ' ' + km.toFixed(1) + ' km';
  const te = Number(getVal(ultima, ['aerobic_te'], 0));
  if (te > 0) {
    const giudizio = te >= 5 ? 'sovraccarico' : te >= 4 ? 'miglioramento notevole' : te >= 3 ? 'miglioramento' : te >= 2 ? 'mantenimento' : te >= 1 ? 'beneficio minimo' : 'nessun beneficio';
    testo += ' \u2022 Effetto allenante ' + te.toFixed(1) + ' (' + giudizio + ')';
  }
  elSub.innerText = testo;
}

function renderHealthTab() {
  if (!rawData) return;

  const health = getHealthArray();
  const activities = rawData.activities || [];
  if (health.length === 0) return;

  const currentMonday = getMonday(baseDate);
  currentMonday.setDate(currentMonday.getDate() + (weekOffset * 7));
  currentMonday.setHours(0, 0, 0, 0);

  const weekDatesYMD = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(currentMonday);
    d.setDate(d.getDate() + i);
    weekDatesYMD.push(formatDateYMD(d));
  }

  const bodyBattery = [];
  const bodyBatteryMin = [];
  const stress = [];
  const hrv = [];
  const rhr = [];

  weekDatesYMD.forEach((dateStr) => {
    const match = health.find(h => {
      const d = normalizeDateStr(getVal(h, ['date', 'calendarDate', 'day', 'day_str']));
      return d === dateStr;
    });

    if (match) {
      const restingHr = Number(getVal(match, ['resting_hr', 'restingHeartRate', 'rhr'], 48));
      const bb = getVal(match, ['body_battery', 'bodyBattery', 'bodyBatteryMostRecentValue', 'charged']);
      const str = getVal(match, ['stress_level', 'stress', 'averageStressLevel']);
      const hrvVal = getVal(match, ['hrv', 'hrvStatus', 'lastNightAvgHrv'], Math.round(110 - restingHr));

      const bbLow = getVal(match, ['body_battery_min']);
      bodyBattery.push(bb !== null ? Number(bb) : null);
      bodyBatteryMin.push(bbLow !== null ? Number(bbLow) : null);
      stress.push(str !== null ? Number(str) : null);
      hrv.push(hrvVal !== null ? Number(hrvVal) : null);
      rhr.push(restingHr);
    } else {
      bodyBattery.push(null);
      bodyBatteryMin.push(null);
      stress.push(null);
      hrv.push(null);
      rhr.push(null);
    }
  });

  const targetEntry = health[0];

  const sleepScoreToday = getVal(targetEntry, ['sleep_score', 'sleepScore', 'overallScore'], '--');
  const rhrToday = getVal(targetEntry, ['resting_hr', 'restingHeartRate', 'rhr'], '--');
  const bbToday = getVal(targetEntry, ['body_battery', 'bodyBattery', 'bodyBatteryMostRecentValue'], '--');
  const stressToday = getVal(targetEntry, ['stress_level', 'stress', 'averageStressLevel'], '--');
  const hrvToday = getVal(targetEntry, ['hrv', 'hrvStatus', 'lastNightAvgHrv'], '--');

  let recoveryHours = getVal(targetEntry, ['recovery_time_hours', 'recovery_time', 'recoveryTime', 'time_to_recovery', 'hours_to_recovery']);
  
  if (recoveryHours === null || recoveryHours === undefined || recoveryHours === '--') {
    // Garmin non fornisce il tempo di recupero: stima prudente basata sull'effetto allenante (TE) degli ultimi 4 giorni
    const oreRecupero = (te) => te >= 5 ? 72 : te >= 4 ? 54 : te >= 3 ? 30 : te >= 2 ? 12 : 0;
    const adesso = new Date();
    let massimo = 0;
    activities.forEach(act => {
      const raw = getVal(act, ['date', 'start_time', 'start_time_local']);
      const te = Number(getVal(act, ['aerobic_te'], 0));
      if (!raw || !te) return;
      const passate = (adesso - new Date(String(raw).replace(' ', 'T'))) / 3600000;
      if (passate >= 0 && passate <= 96) massimo = Math.max(massimo, oreRecupero(te) - passate);
    });
    recoveryHours = Math.max(0, Math.round(massimo));
  }

  let vo2 = null;
  for (let h of health) {
    const candidate = getVal(h, ['vo2_max', 'vo2Max', 'vo2max']);
    if (candidate !== null && candidate !== undefined && candidate !== '') {
      vo2 = candidate;
      break;
    }
  }
  if (!vo2) vo2 = 51;

  let formScore = '--';
  if (bbToday !== '--' && stressToday !== '--') {
    const bbNum = Number(bbToday);
    const stressNum = Number(stressToday);
    const hrvNum = hrvToday !== '--' ? Number(hrvToday) : 85;
    
    let baseForm = (bbNum * 0.35) + (Math.min(hrvNum, 100) * 0.35) + ((100 - stressNum) * 0.30);
    let recPenalty = Math.min(35, (Number(recoveryHours) / 42) * 25);
    formScore = Math.round(baseForm - recPenalty);
    formScore = Math.min(100, Math.max(15, formScore));
  }

  document.getElementById('cardFormScore').innerText = formScore + ' %';

  let statusText = "Forma Buona";
  let adviceText = "Buon livello energetico complessivo.";

  if (formScore !== '--') {
    if (formScore < 50) {
      statusText = "Affaticamento Accumulato";
      adviceText = "Corpo ancora sotto carico per gli ultimi allenamenti. Consigliato riposo o corsetta rigenerante.";
    } else if (formScore < 75) {
      statusText = "Forma Moderata";
      adviceText = "Energia in fase di ricarica. Utile per allenamenti leggeri o fondo medio.";
    } else {
      statusText = "Forma Ottimale";
      adviceText = "Piena prontezza fisica e mentale per allenamenti ad alta intensità. 🚀";
    }
  }

  document.getElementById('cardFormStatus').innerText = statusText;
  document.getElementById('cardFormAdvice').innerText = adviceText;

  document.getElementById('cardVo2Max').innerText = vo2 + ' ml/kg/min';

  const fitAge = getVal(targetEntry, ['fitness_age', 'fitnessAge'], 20);
  document.getElementById('cardFitnessAge').innerText = `Età Fitness: ${fitAge} anni`;

  document.getElementById('cardHrvToday').innerText = hrvToday + (hrvToday !== '--' ? ' ms' : '');
  
  // --- DINAMICA COMMENTI CARD VFC ---
  let hrvStatusMsg = "Bilanciato";
  if (hrvToday !== '--') {
    const hrvNum = Number(hrvToday);
    if (hrvNum >= 70) hrvStatusMsg = "Ottima stabilità del sistema nervoso ⚡";
    else if (hrvNum >= 50) hrvStatusMsg = "Valore nella norma, buon recupero 👍";
    else hrvStatusMsg = "VFC bassa: possibili segni di stanchezza 🛌";
  }
  document.getElementById('cardHrvStatus').innerText = hrvStatusMsg;

  document.getElementById('cardBodyBattery').innerText = bbToday + (bbToday !== '--' ? ' / 100' : '');
  
  // --- DINAMICA COMMENTI BODY BATTERY ---
  let bbStatusMsg = "Carica Ottimale";
  if (bbToday !== '--') {
    const bbNum = Number(bbToday);
    if (bbNum >= 80) bbStatusMsg = "Sei carico e pronto a correre! 🚀";
    else if (bbNum >= 40) bbStatusMsg = "Energia buona, gestiscila con cura 👍";
    else bbStatusMsg = "Batterie scariche, meglio riposare 🛌";
  }
  document.getElementById('cardBodyBatteryStatus').innerText = bbStatusMsg;

  document.getElementById('cardStressToday').innerText = stressToday + (stressToday !== '--' ? ' / 100' : '');
  
  // --- DINAMICA COMMENTI STRESS ---
  let stressStatusMsg = "Stress Basso";
  if (stressToday !== '--') {
    const stressNum = Number(stressToday);
    if (stressNum <= 25) stressStatusMsg = "Mente rilassata e distesa 🧘‍♂️";
    else if (stressNum <= 50) stressStatusMsg = "Stress moderato della giornata ⚖️";
    else stressStatusMsg = "Stress elevato, stacca la spina ⚠️";
  }
  document.getElementById('cardStressStatus').innerText = stressStatusMsg;

  document.getElementById('cardSleepScoreToday').innerText = sleepScoreToday + (sleepScoreToday !== '--' ? ' / 100' : '');
  
  // --- DINAMICA COMMENTI SONNO ---
  let sleepStatusMsg = "Buon Riposo";
  if (sleepScoreToday !== '--') {
    const sleepNum = Number(sleepScoreToday);
    if (sleepNum >= 85) sleepStatusMsg = "Sonno profondo e rigenerante! 🌟";
    else if (sleepNum >= 70) sleepStatusMsg = "Riposo sufficiente 👍";
    else sleepStatusMsg = "Qualità del sonno scarsa, recupera 😴";
  }
  document.getElementById('cardSleepScoreStatus').innerText = sleepStatusMsg;

  document.getElementById('valRhr').innerText = rhrToday + (rhrToday !== '--' ? ' bpm' : '');
  
  const respToday = getVal(targetEntry, ['respiration_rate', 'respirationRate', 'avgRespiration', 'averageRespiration', 'sleep_respiration_rate'], '--');
  document.getElementById('valRespiration').innerText = respToday + (respToday !== '--' ? ' brm' : '');

  renderUltimoAllenamento(activities);

  const dayLabels = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
  const weekDays = dayLabels.map((lbl, idx) => {
    const d = new Date(currentMonday);
    d.setDate(d.getDate() + idx);
    return `${lbl} ${d.getDate()}`;
  });

  const bbRange = bodyBattery.map((mx, i) => mx === null ? null : [bodyBatteryMin[i] !== null ? bodyBatteryMin[i] : mx, mx]);
  initHealthCharts(weekDays, bbRange, stress, hrv, rhr);
}

function initCharts(labels, steps, runs, bpm, sleep) {
  const ctxSteps = document.getElementById('chartStepsRuns').getContext('2d');
  if(chartStepsInstance) chartStepsInstance.destroy();

  chartStepsInstance = new Chart(ctxSteps, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Passi',
          data: steps,
          backgroundColor: 'rgba(0, 240, 255, 0.75)',
          borderColor: '#00f0ff',
          borderWidth: 1,
          borderRadius: 6,
          yAxisID: 'ySteps'
        },
        {
          label: 'Corsa (km)',
          data: runs,
          backgroundColor: 'rgba(255, 107, 0, 0.85)',
          borderColor: '#ff6b00',
          borderWidth: 1,
          borderRadius: 6,
          yAxisID: 'yRuns'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#94a3b8' } } },
      scales: {
        x: { ticks: { color: '#64748b' }, grid: { display: false } },
        ySteps: {
          type: 'linear',
          position: 'left',
          ticks: { color: '#00f0ff' },
          grid: { color: 'rgba(255,255,255,0.05)' },
          title: { display: true, text: 'Passi', color: '#00f0ff' }
        },
        yRuns: {
          type: 'linear',
          position: 'right',
          ticks: { color: '#ff6b00' },
          grid: { display: false },
          title: { display: true, text: 'Km Corsa', color: '#ff6b00' },
          suggestedMax: 10
        }
      }
    }
  });

  const ctxBpmSleep = document.getElementById('chartBpmSleepCombined').getContext('2d');
  if(chartBpmSleepInstance) chartBpmSleepInstance.destroy();

  chartBpmSleepInstance = new Chart(ctxBpmSleep, {
    data: {
      labels: labels,
      datasets: [
        {
          type: 'line',
          label: 'FC a Riposo (bpm)',
          data: bpm,
          borderColor: '#00f0ff',
          backgroundColor: '#00f0ff',
          borderWidth: 3.5,
          pointRadius: 5,
          pointHoverRadius: 7,
          tension: 0.3,
          order: 1,
          yAxisID: 'yBpm'
        },
        {
          type: 'bar',
          label: 'Ore di Sonno (h)',
          data: sleep,
          backgroundColor: 'rgba(255, 107, 0, 0.35)',
          borderColor: '#ff6b00',
          borderWidth: 1,
          borderRadius: 6,
          order: 2,
          yAxisID: 'ySleep'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#94a3b8' } },
        tooltip: {
          callbacks: {
            label: (ctx) => ctx.dataset.yAxisID === 'ySleep'
              ? 'Sonno: ' + formatOreMinuti(ctx.parsed.y)
              : ctx.dataset.label + ': ' + ctx.parsed.y
          }
        }
      },
      scales: {
        x: { ticks: { color: '#64748b' }, grid: { display: false } },
        yBpm: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: 'FC a Riposo (bpm)', color: '#00f0ff' },
          ticks: { color: '#00f0ff' },
          grid: { color: 'rgba(255,255,255,0.05)' }
        },
        ySleep: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: 'Ore Sonno (h)', color: '#ff6b00' },
          ticks: { color: '#ff6b00' },
          grid: { display: false }
        }
      }
    }
  });
}

function initHealthCharts(labels, bodyBattery, stress, hrv, rhr) {
  const ctxBbStress = document.getElementById('chartBodyBatteryStress').getContext('2d');
  if(chartBodyBatteryStressInstance) chartBodyBatteryStressInstance.destroy();

  chartBodyBatteryStressInstance = new Chart(ctxBbStress, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          type: 'bar',
          label: 'Body Battery (min - max)',
          data: bodyBattery,
          backgroundColor: 'rgba(16, 185, 129, 0.45)',
          borderColor: '#10b981',
          borderWidth: 2,
          borderRadius: 8,
          borderSkipped: false,
          order: 2
        },
        {
          type: 'line',
          label: 'Livello Stress (media)',
          data: stress,
          borderColor: '#ff9d00',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [5, 5],
          tension: 0.3,
          order: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#94a3b8' } },
        tooltip: {
          callbacks: {
            label: (ctx) => Array.isArray(ctx.raw)
              ? 'Body Battery: da ' + ctx.raw[0] + ' a ' + ctx.raw[1]
              : ctx.dataset.label + ': ' + ctx.parsed.y
          }
        }
      },
      scales: {
        x: { ticks: { color: '#64748b' }, grid: { display: false } },
        y: { min: 0, max: 100, ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });

  const ctxHrvRhr = document.getElementById('chartHrvRhr').getContext('2d');
  if(chartHrvRhrInstance) chartHrvRhrInstance.destroy();

  chartHrvRhrInstance = new Chart(ctxHrvRhr, {
    data: {
      labels: labels,
      datasets: [
        {
          type: 'bar',
          label: 'VFC / HRV (ms)',
          data: hrv,
          backgroundColor: 'rgba(0, 240, 255, 0.5)',
          borderColor: '#00f0ff',
          borderWidth: 1,
          borderRadius: 6,
          yAxisID: 'yHrv'
        },
        {
          type: 'line',
          label: 'FC Riposo (bpm)',
          data: rhr,
          borderColor: '#ff4500',
          backgroundColor: '#ff4500',
          borderWidth: 3,
          pointRadius: 4,
          tension: 0.3,
          yAxisID: 'yRhr'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#94a3b8' } } },
      scales: {
        x: { ticks: { color: '#64748b' }, grid: { display: false } },
        yHrv: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: 'VFC (ms)', color: '#00f0ff' },
          ticks: { color: '#00f0ff' },
          grid: { color: 'rgba(255,255,255,0.05)' }
        },
        yRhr: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: 'FC Riposo (bpm)', color: '#ff4500' },
          ticks: { color: '#ff4500' },
          grid: { display: false }
        }
      }
    }
  });
}

window.onload = loadDashboard;
