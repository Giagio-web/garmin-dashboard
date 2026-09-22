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
  const todayYMD = formatDateYMD(new Date());
  
  const targetEntry = health.find(h => {
    const d = normalizeDateStr(getVal(h, ['date', 'calendarDate', 'day']));
    return d === todayYMD;
  }) || (health.length > 0 ? health[health.length - 1] : {});

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
      const sleepScore = Number(getVal(match, ['sleep_score'], 80));
      const restingHr = Number(getVal(match, ['resting_hr'], 48));
      const sleepHours = Number(getVal(match, ['sleep_hours'], 7));

      const bb = getVal(match, ['body_battery', 'bodyBattery'], Math.min(100, Math.round(sleepScore * 0.9 + sleepHours * 2)));
      const str = getVal(match, ['stress_level', 'stress'], Math.max(10, Math.round(100 - sleepScore * 0.8)));
      const hrvVal = getVal(match, ['hrv', 'hrv_weekly_avg'], Math.round(110 - restingHr));

      bodyBattery.push(bb);
      stress.push(str);
      hrv.push(hrvVal);
      rhr.push(restingHr);
    } else {
      bodyBattery.push(null);
      stress.push(null);
      hrv.push(null);
      rhr.push(null);
    }
  });

  const todayYMD = formatDateYMD(new Date());
  const targetEntry = health.find(h => {
    const d = normalizeDateStr(getVal(h, ['date', 'calendarDate', 'day']));
    return d === todayYMD;
  }) || health[health.length - 1];

  const sleepScoreToday = Number(getVal(targetEntry, ['sleep_score'], 80));
  const rhrToday = Number(getVal(targetEntry, ['resting_hr'], 48));
  const sleepHoursToday = Number(getVal(targetEntry, ['sleep_hours'], 6.5));

  const bbToday = getVal(targetEntry, ['body_battery'], Math.min(100, Math.round(sleepScoreToday * 0.9 + sleepHoursToday * 2)));
  const stressToday = getVal(targetEntry, ['stress_level'], Math.max(10, Math.round(100 - sleepScoreToday * 0.8)));
  const hrvToday = getVal(targetEntry, ['hrv'], Math.round(110 - rhrToday));

  let formScore = Math.round((bbToday * 0.4) + (Math.min(hrvToday, 100) * 0.4) + ((100 - stressToday) * 0.2));
  formScore = Math.min(100, Math.max(0, formScore));

  document.getElementById('cardFormScore').innerText = formScore + ' %';

  let statusText = "Forma Ottimale";
  let adviceText = "Eccellente bilanciamento. Ideale per allenamenti ad alta intensità o gare.";
  if (formScore < 50) {
    statusText = "Affaticamento Elevato";
    adviceText = "Si consiglia riposo attivo, stretching o corsa leggera di recupero.";
  } else if (formScore < 75) {
    statusText = "Forma Moderata";
    adviceText = "Buona prontezza per allenamenti di mantenimento o fondo medio.";
  }

  document.getElementById('cardFormStatus').innerText = statusText;
  document.getElementById('cardFormAdvice').innerText = adviceText;

  const vo2 = getVal(targetEntry, ['vo2_max', 'vo2max'], 52);
  document.getElementById('cardVo2Max').innerText = vo2 + ' ml/kg/min';

  const fitAge = getVal(targetEntry, ['fitness_age'], 20);
  document.getElementById('cardFitnessAge').innerText = `Età Fitness: ${fitAge} anni`;

  document.getElementById('cardHrvToday').innerText = hrvToday + ' ms';
  document.getElementById('cardBodyBattery').innerText = bbToday + ' / 100';
  document.getElementById('cardStressToday').innerText = stressToday + ' / 100';
  document.getElementById('cardSleepScoreToday').innerText = sleepScoreToday + ' / 100';

  document.getElementById('valRhr').innerText = rhrToday + ' bpm';
  
  const respToday = getVal(targetEntry, ['respiration_rate'], 14);
  document.getElementById('valRespiration').innerText = respToday + ' brm';

  const recToday = getVal(targetEntry, ['recovery_time_hours'], 18);
  document.getElementById('valRecoveryTime').innerText = recToday + ' ore';

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
