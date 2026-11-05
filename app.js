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
