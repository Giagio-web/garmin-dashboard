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

function getVal(obj, keys, defaultVal = null) {
  if (!obj) return defaultVal;
  for (let k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
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
    const response = await fetch('garmin_data.json');
    if (!response.ok) throw new Error('File JSON non trovato');
    rawData = await response.json();
    
    const health = rawData.daily_health || rawData.health_data || [];
    if (health.length > 0) {
      const lastEntry = health[health.length - 1];
      if (lastEntry && lastEntry.date) {
        const parts = lastEntry.date.split('-');
        if (parts.length === 3) {
          baseDate = new Date(parts[0], parts[1] - 1, parts[2]);
        }
      }
    }

    renderOverview();
    renderHealthTab();
  } catch (err) {
    console.error("Errore nel caricamento del JSON:", err);
    const subHeader = document.getElementById('weekSubHeader');
    if (subHeader) subHeader.innerText = "Impossibile caricare garmin_data.json";
  }
}

function getWeekMetrics(mondayObj) {
  if(!rawData) return { steps: [], runs: [], bpm: [], sleep: [], totalDist: 0, avgSteps: 0, avgBpm: 0, avgSleep: 0, calories: [] };
  
  const health = rawData.daily_health || rawData.health_data || [];
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
    const match = health.find(h => h.date === dateStr);
    if(match) {
      const st = getVal(match, ['steps', 'total_steps', 'step_count']);
      steps.push(st !== null ? Number(st) : null);

      const sl = getVal(match, ['sleep_hours', 'sleep_time', 'total_sleep_hours', 'sleepHours']);
      sleep.push(sl !== null ? Number(sl) : null);

      const hr = getVal(match, ['avg_hr', 'resting_hr', 'resting_heart_rate', 'avg_heart_rate']);
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
      const actDateStr = String(actDateRaw).split('T')[0].split(' ')[0];
      const dayIndex = weekDatesYMD.indexOf(actDateStr);
      const actType = String(getVal(act, ['type', 'activity_type', 'activityType'], '')).toLowerCase();
      if (dayIndex !== -1 && (actType.includes('run') || actType.includes('corsa') || actType === 'running')) {
        const dist = Number(getVal(act, ['distance_km', 'distance', 'dist_km'], 0));
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

  const health = rawData.daily_health || rawData.health_data || [];
  const todayYMD = formatDateYMD(new Date());
  const todayMatch = health.find(h => h.date === todayYMD) || (health.length > 0 ? health[health.length - 1] : {});

  document.getElementById('cardDist').innerText = currData.totalDist.toFixed(1) + ' km';
  document.getElementById('cardWorkouts').innerText = currData.runs.filter(r => r > 0).length + ' corse svolte';
  
  const hrVal = getVal(todayMatch, ['avg_hr', 'resting_hr', 'resting_heart_rate'], '--');
  document.getElementById('cardBpmToday').innerText = hrVal + (hrVal !== '--' ? ' bpm' : '');
  document.getElementById('cardBpmAvg').innerText = `Media sett.: ${currData.avgBpm || '--'} bpm`;

  const stepsVal = getVal(todayMatch, ['steps', 'total_steps', 'step_count'], 0);
  document.getElementById('cardStepsToday').innerText = Number(stepsVal).toLocaleString('it-IT');
  document.getElementById('cardStepsAvg').innerText = `Media sett.: ${currData.avgSteps.toLocaleString('it-IT')} passi/gg`;

  const sleepVal = getVal(todayMatch, ['sleep_hours', 'sleep_time', 'total_sleep_hours'], 0);
  document.getElementById('cardSleepToday').innerText = sleepVal + 'h';
  document.getElementById('cardSleepAvg').innerText = `Media sett.: ${currData.avgSleep}h/gg`;

  const calVal = getVal(todayMatch, ['calories', 'total_calories', 'active_calories'], 0);
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
  if(!rawData) return;

  const currentMonday = getMonday(baseDate);
  currentMonday.setDate(currentMonday.getDate() + (weekOffset * 7));
  currentMonday.setHours(0, 0, 0, 0);

  const health = rawData.daily_health || rawData.health_data || [];
  const userProfile = rawData.user_profile || rawData.profile || {};

  const weekDatesYMD = [];
  for(let i=0; i<7; i++) {
    const d = new Date(currentMonday);
    d.setDate(d.getDate() + i);
    weekDatesYMD.push(formatDateYMD(d));
  }

  const bodyBattery = [];
  const stress = [];
  const hrv = [];
  const rhr = [];

  weekDatesYMD.forEach((dateStr) => {
    const match = health.find(h => h.date === dateStr);
    if(match) {
      const bb = getVal(match, ['body_battery', 'body_battery_max', 'bodyBattery']);
      bodyBattery.push(bb !== null ? Number(bb) : null);

      const st = getVal(match, ['stress_level', 'avg_stress', 'stress']);
      stress.push(st !== null ? Number(st) : null);

      const hv = getVal(match, ['hrv', 'hrv_weekly_avg', 'hrv_value']);
      hrv.push(hv !== null ? Number(hv) : null);

      const rh = getVal(match, ['resting_hr', 'resting_heart_rate', 'rhr']);
      rhr.push(rh !== null ? Number(rh) : null);
    } else {
      bodyBattery.push(null);
      stress.push(null);
      hrv.push(null);
      rhr.push(null);
    }
  });

  const todayYMD = formatDateYMD(new Date());
  const todayMatch = health.find(h => h.date === todayYMD) || (health.length > 0 ? health[health.length - 1] : {});

  const bbVal = Number(getVal(todayMatch, ['body_battery', 'body_battery_max', 'bodyBattery'], 70));
  const hrvVal = Number(getVal(todayMatch, ['hrv', 'hrv_weekly_avg', 'hrv_value'], 50));
  const stressVal = Number(getVal(todayMatch, ['stress_level', 'avg_stress', 'stress'], 25));
  
  let formScore = Math.round((bbVal * 0.4) + (Math.min(hrvVal, 100) * 0.4) + ((100 - stressVal) * 0.2));
  formScore = Math.min(100, Math.max(0, formScore));

  document.getElementById('cardFormScore').innerText = formScore + ' %';
  
  let statusText = "Forma Ottimale";
  let adviceText = "Eccellente bilanciamento. Ideale per allenamenti ad alta intensità o gare.";
  
  if(formScore < 50) {
    statusText = "Affaticamento Elevato";
    adviceText = "Si consiglia riposo attivo, stretching o corsa leggera di recupero.";
  } else if(formScore < 75) {
    statusText = "Forma Moderata";
    adviceText = "Buona prontezza per allenamenti di mantenimento o fondo medio.";
  }

  document.getElementById('cardFormStatus').innerText = statusText;
  document.getElementById('cardFormAdvice').innerText = adviceText;

  const vo2 = getVal(userProfile, ['vo2_max', 'vo2max', 'vo2'], getVal(todayMatch, ['vo2_max', 'vo2max'], null));
  document.getElementById('cardVo2Max').innerText = vo2 !== null ? vo2 + ' ml/kg/min' : '--';

  const fitAge = getVal(userProfile, ['fitness_age', 'fitnessAge'], getVal(todayMatch, ['fitness_age', 'fitnessAge'], null));
  document.getElementById('cardFitnessAge').innerText = fitAge !== null ? `Età Fitness: ${fitAge} anni` : 'Età Fitness: --';

  const hrvToday = getVal(todayMatch, ['hrv', 'hrv_weekly_avg', 'hrv_value']);
  document.getElementById('cardHrvToday').innerText = hrvToday !== null ? hrvToday + ' ms' : '-- ms';

  const bbToday = getVal(todayMatch, ['body_battery', 'body_battery_max', 'bodyBattery']);
  document.getElementById('cardBodyBattery').innerText = bbToday !== null ? bbToday + ' / 100' : '--';

  const stressToday = getVal(todayMatch, ['stress_level', 'avg_stress', 'stress']);
  document.getElementById('cardStressToday').innerText = stressToday !== null ? stressToday + ' / 100' : '--';

  const sleepScoreToday = getVal(todayMatch, ['sleep_score', 'sleepScore']);
  document.getElementById('cardSleepScoreToday').innerText = sleepScoreToday !== null ? sleepScoreToday + ' / 100' : '-- / 100';

  const rhrToday = getVal(todayMatch, ['resting_hr', 'resting_heart_rate', 'rhr']);
  document.getElementById('valRhr').innerText = rhrToday !== null ? rhrToday + ' bpm' : '-- bpm';

  const respToday = getVal(todayMatch, ['respiration_rate', 'avg_respiration', 'respiration']);
  document.getElementById('valRespiration').innerText = respToday !== null ? respToday + ' brm' : '-- brm';

  const recToday = getVal(todayMatch, ['recovery_time_hours', 'recovery_time', 'recovery']);
  document.getElementById('valRecoveryTime').innerText = recToday !== null ? recToday + ' ore' : '-- ore';

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
          borderRadius: 6
        },
        {
          label: 'Corsa (km)',
          data: runs,
          backgroundColor: 'rgba(255, 107, 0, 0.85)',
          borderColor: '#ff6b00',
          borderWidth: 1,
          borderRadius: 6
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
          title: { display: true, text: 'BPM Media', color: '#00f0ff' },
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
          label: 'Stress Level',
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
          title: { display: true, text: 'RHR (bpm)', color: '#ff4500' },
          ticks: { color: '#ff4500' },
          grid: { display: false }
        }
      }
    }
  });
}

window.onload = loadDashboard;
