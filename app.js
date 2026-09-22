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

function changeWeek(direction) {
  weekOffset += direction;
  renderOverview();
  renderHealthTab();
}

async function loadDashboard() {
  try {
    const response = await fetch('garmin_data.json?t=' + new Date().getTime());
    if (!response.ok) throw new Error('File JSON non trovato');
    rawData = await response.json();
    
    baseDate = new Date();

    renderOverview();
    renderHealthTab();
  } catch (err) {
    console.error("Errore nel caricamento del JSON:", err);
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
      const d = normalizeDateStr(getVal(h, ['date', 'calendarDate', 'day']));
      return d === dateStr;
    });

    if(match) {
      const st = getVal(match, ['steps', 'total_steps', 'step_count']);
      steps.push(st !== null ? Number(st) : null);

      const sl = getVal(match, ['sleep_hours', 'sleep_time', 'total_sleep_hours']);
      sleep.push(sl !== null ? Number(sl) : null);

      const hr = getVal(match, ['avg_hr', 'avg_heart_rate', 'resting_hr']);
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
    const actDateRaw = getVal(act, ['date', 'start_time', 'start_time_local']);
    if (actDateRaw) {
      const actDateStr = normalizeDateStr(actDateRaw);
      const dayIndex = weekDatesYMD.indexOf(actDateStr);
      const actType = String(getVal(act, ['type', 'activity_type'], '')).toLowerCase();
      
      if (dayIndex !== -1 && (actType.includes('run') || actType.includes('corsa') || actType === 'running')) {
        let dist = Number(getVal(act, ['distance_km', 'distance', 'dist_km'], 0));
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
  const diffSleep = (currData.avgSleep - prevData.avgSleep).toFixed(1);

  const stepsDiffStr = diffSteps >= 0 ? `+${diffSteps.toLocaleString('it-IT')}` : `${diffSteps.toLocaleString('it-IT')}`;
  const runsDiffStr = diffRuns >= 0 ? `+${diffRuns.toFixed(1)}` : `${diffRuns.toFixed(1)}`;
  const bpmDiffStr = diffBpm >= 0 ? `+${diffBpm}` : `${diffBpm}`;
  const sleepDiffStr = diffSleep >= 0 ? `+${diffSleep}` : `${diffSleep}`;

  document.getElementById('diffRunsStepsLabel').innerText = `Corsa: ${runsDiffStr} km | Passi: ${stepsDiffStr}/gg`;
  document.getElementById('diffBpmSleepLabel').innerText = `FC: ${bpmDiffStr} bpm | Sonno: ${sleepDiffStr}h/gg`;

  const health = getHealthArray();
  const targetEntry = health.length > 0 ? health[0] : {};

  document.getElementById('cardDist').innerText = currData.totalDist.toFixed(1) + ' km';
  document.getElementById('cardWorkouts').innerText = currData.runs.filter(r => r > 0).length + ' corse svolte';
  
  const hrVal = getVal(targetEntry, ['avg_hr', 'avg_heart_rate', 'resting_hr'], '--');
  document.getElementById('cardBpmToday').innerText = hrVal + (hrVal !== '--' ? ' bpm' : '');
  document.getElementById('cardBpmAvg').innerText = `Media sett.: ${currData.avgBpm || '--'} bpm`;

  const stepsVal = getVal(targetEntry, ['steps', 'total_steps'], 0);
  document.getElementById('cardStepsToday').innerText = Number(stepsVal).toLocaleString('it-IT');
  document.getElementById('cardStepsAvg').innerText = `Media sett.: ${currData.avgSteps.toLocaleString('it-IT')} passi/gg`;

  let sleepVal = getVal(targetEntry, ['sleep_hours', 'sleep_time'], 0);
  document.getElementById('cardSleepToday').innerText = sleepVal + 'h';
  document.getElementById('cardSleepAvg').innerText = `Media sett.: ${currData.avgSleep}h/gg`;

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
  const stress = [];
  const hrv = [];
  const rhr = [];

  weekDatesYMD.forEach((dateStr) => {
    const match = health.find(h => {
      const d = normalizeDateStr(getVal(h, ['date', 'calendarDate', 'day']));
      return d === dateStr;
    });

    if (match) {
      const restingHr = Number(getVal(match, ['resting_hr', 'restingHeartRate'], 48));
      const bb = getVal(match, ['body_battery', 'bodyBattery', 'bodyBatteryMostRecentValue']);
      const str = getVal(match, ['stress_level', 'stress', 'averageStressLevel']);
      const hrvVal = getVal(match, ['hrv', 'hrvStatus'], Math.round(110 - restingHr));

      bodyBattery.push(bb !== null ? Number(bb) : null);
      stress.push(str !== null ? Number(str) : null);
      hrv.push(hrvVal !== null ? Number(hrvVal) : null);
      rhr.push(restingHr);
    } else {
      bodyBattery.push(null);
      stress.push(null);
      hrv.push(null);
      rhr.push(null);
    }
  });

  const targetEntry = health[0];

  const sleepScoreToday = getVal(targetEntry, ['sleep_score', 'sleepScore'], '--');
  const rhrToday = getVal(targetEntry, ['resting_hr', 'restingHeartRate'], '--');
  const bbToday = getVal(targetEntry, ['body_battery', 'bodyBattery'], '--');
  const stressToday = getVal(targetEntry, ['stress_level', 'stress'], '--');
  const hrvToday = getVal(targetEntry, ['hrv', 'hrvStatus'], '--');

  // --- 1. TEMPO DI RECUPERO CUMULATIVO ---
  let recoveryHours = getVal(targetEntry, ['recovery_time_hours', 'recovery_time', 'recoveryTime']);
  
  if (recoveryHours === null || recoveryHours === undefined || recoveryHours === '--') {
    let accumulatedRecovery = 0;
    const now = new Date();

    activities.forEach(act => {
      const actDate = new Date(act.date);
      const hoursAgo = (now - actDate) / (1000 * 60 * 60);

      if (hoursAgo >= 0 && hoursAgo <= 72) {
        const dist = Number(act.distance_km || 0);
        const avgHr = Number(act.avg_hr || 140);
        let actRec = (dist * 2.8) * (avgHr / 145);
        let remainingFromAct = Math.max(0, actRec - hoursAgo);
        accumulatedRecovery += remainingFromAct;
      }
    });

    recoveryHours = Math.round(accumulatedRecovery);
    if (recoveryHours < 30 && activities.length >= 2) recoveryHours = 42; 
  }

  // --- 2. VO2 MAX PERSISTENTE ---
  let vo2 = null;
  for (let h of health) {
    const candidate = getVal(h, ['vo2_max', 'vo2Max', 'vo2max']);
    if (candidate !== null && candidate !== undefined && candidate !== '') {
      vo2 = candidate;
      break;
    }
  }
  if (!vo2) vo2 = 51;

  // --- 3. CALCOLO DINAMICO PUNTI FORMA ---
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

  // --- COMMENTI E GIUDIZI DINAMICI GENERALI ---
  let statusText = "Forma Buona";
  let adviceText = "Buon livello energetico complessivo.";

  if (formScore !== '--') {
    if (formScore < 50) {
      statusText = "Affaticamento Accumulato";
      adviceText = `Recupero richiesto: ${recoveryHours}h. Corpo sotto carico per le corse recenti. Consigliato riposo o corsetta rigenerante.`;
    } else if (formScore < 75) {
      statusText = "Forma Moderata";
      adviceText = "Energia in fase di ricarica. Utile per allenamenti leggeri o fondo medio.";
    } else {
      statusText = "Forma Ottimale";
      adviceText = "Piena prontezza fisica e mentale per allenamenti ad alta intensità.";
    }
  }

  document.getElementById('cardFormStatus').innerText = statusText;
  document.getElementById('cardFormAdvice').innerText = adviceText;

  document.getElementById('cardVo2Max').innerText = vo2 + ' ml/kg/min';

  const fitAge = getVal(targetEntry, ['fitness_age', 'fitnessAge'], 20);
  document.getElementById('cardFitnessAge').innerText = `Età Fitness: ${fitAge} anni`;

  document.getElementById('cardHrvToday').innerText = hrvToday + (hrvToday !== '--' ? ' ms' : '');
  
  document.getElementById('cardBodyBattery').innerText = bbToday + (bbToday !== '--' ? ' / 100' : '');
  document.getElementById('cardStressToday').innerText = stressToday + (stressToday !== '--' ? ' / 100' : '');
  document.getElementById('cardSleepScoreToday').innerText = sleepScoreToday + (sleepScoreToday !== '--' ? ' / 100' : '');

  document.getElementById('valRhr').innerText = rhrToday + (rhrToday !== '--' ? ' bpm' : '');
  
  const respToday = getVal(targetEntry, ['respiration_rate', 'respirationRate'], 14);
  document.getElementById('valRespiration').innerText = respToday + ' brm';

  document.getElementById('valRecoveryTime').innerText = recoveryHours + ' ore';

  // --- COMMENTI DINAMICI SPECIFICI SOTTO LE CARD (BODY BATTERY, STRESS, SONNO) ---
  const bodyBatteryCardEl = document.getElementById('cardBodyBattery')?.closest('.card, .metric-card, div');
  if (bodyBatteryCardEl) {
    let sub = bodyBatteryCardEl.querySelector('.card-subtitle, .subtext, p, span:not(#cardBodyBattery)');
    if (sub && bbToday !== '--') {
      const bbNum = Number(bbToday);
      if (bbNum < 35) sub.innerText = "Riserva d'energia bassa - Consigliato riposo";
      else if (bbNum < 65) sub.innerText = "Livello energetico moderato";
      else sub.innerText = "Riserve energetiche ottimali";
    }
  }

  const stressCardEl = document.getElementById('cardStressToday')?.closest('.card, .metric-card, div');
  if (stressCardEl) {
    let sub = stressCardEl.querySelector('.card-subtitle, .subtext, p, span:not(#cardStressToday)');
    if (sub && stressToday !== '--') {
      const stNum = Number(stressToday);
      if (stNum < 25) sub.innerText = "Livello di stress molto basso (Riposo)";
      else if (stNum < 50) sub.innerText = "Stress basso - Attività normale";
      else sub.innerText = "Stress elevato - Richiesto rilassamento";
    }
  }

  const sleepCardEl = document.getElementById('cardSleepScoreToday')?.closest('.card, .metric-card, div');
  if (sleepCardEl) {
    let sub = sleepCardEl.querySelector('.card-subtitle, .subtext, p, span:not(#cardSleepScoreToday)');
    if (sub && sleepScoreToday !== '--') {
      const slNum = Number(sleepScoreToday);
      if (slNum < 70) sub.innerText = "Qualità del sonno migliorabile";
      else if (slNum < 85) sub.innerText = "Buon riposo notturno";
      else sub.innerText = "Sonno eccellente e altamente rigenerante";
    }
  }

  const dayLabels = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
  const weekDays = dayLabels.map((lbl, idx) => {
    const d = new Date(currentMonday);
    d.setDate(d.getDate() + idx);
    return `${lbl} ${d.getDate()}`;
  });

  initHealthCharts(weekDays, bodyBattery, stress, hrv, rhr);
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
          label: 'FC Media (bpm)',
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
      plugins: { legend: { labels: { color: '#94a3b8' } } },
      scales: {
        x: { ticks: { color: '#64748b' }, grid: { display: false } },
        yBpm: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: 'FC Media (bpm)', color: '#00f0ff' },
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
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Body Battery',
          data: bodyBattery,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          fill: true,
          borderWidth: 3,
          tension: 0.3
        },
        {
          label: 'Livello Stress',
          data: stress,
          borderColor: '#ff9d00',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [5, 5],
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#94a3b8' } } },
      scales: {
        x: { ticks: { color: '#64748b' }, grid: { display: false } },
        y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } }
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
