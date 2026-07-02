'use strict';

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */
const KG_PER_LB = 1 / 2.2046226218;
const CM_PER_IN = 2.54;

// Realistic adult ranges used for input validation (metric is the source of
// truth; imperial bounds are derived from these via conversion).
const HEIGHT_CM_MIN = 50;
const HEIGHT_CM_MAX = 272;
const WEIGHT_KG_MIN = 20;
const WEIGHT_KG_MAX = 300;

// BMI-to-gauge-percent stops. Values must match the gradient stops defined
// in the .gauge-track background in style.css (18%, 45%, 62%).
const GAUGE_STOPS = [
  { bmi: 12, pct: 0 },
  { bmi: 18.5, pct: 18 },
  { bmi: 25, pct: 45 },
  { bmi: 30, pct: 62 },
  { bmi: 45, pct: 100 },
];

const CATEGORY_LABELS = {
  underweight: 'Underweight',
  normal: 'Normal weight',
  overweight: 'Overweight',
  obese: 'Obese',
};

const CATEGORY_MESSAGES = {
  underweight: "You're below the healthy weight range for your height.",
  normal: "You're within the healthy weight range for your height.",
  overweight: "You're above the healthy weight range for your height.",
  obese: "You're significantly above the healthy weight range for your height.",
};

const HISTORY_KEY = 'bmiCalculatorHistory';
const HISTORY_LIMIT = 5;
const THEME_KEY = 'bmiCalculatorTheme';

/* --------------------------------------------------------------------------
   DOM references
   -------------------------------------------------------------------------- */
const bmiForm = document.getElementById('bmi-form');

const unitMetricBtn = document.getElementById('unit-metric-btn');
const unitImperialBtn = document.getElementById('unit-imperial-btn');

const heightMetricGroup = document.getElementById('height-metric-group');
const heightImperialGroup = document.getElementById('height-imperial-group');
const weightMetricGroup = document.getElementById('weight-metric-group');
const weightImperialGroup = document.getElementById('weight-imperial-group');

const heightCmInput = document.getElementById('height-cm');
const heightCmError = document.getElementById('height-cm-error');
const heightFtInput = document.getElementById('height-ft');
const heightInInput = document.getElementById('height-in');
const heightImperialError = document.getElementById('height-imperial-error');
const weightKgInput = document.getElementById('weight-kg');
const weightKgError = document.getElementById('weight-kg-error');
const weightLbInput = document.getElementById('weight-lb');
const weightLbError = document.getElementById('weight-lb-error');

const calculateBtn = document.getElementById('calculate-btn');

const resultCard = document.getElementById('result-card');
const resultContent = document.getElementById('result-content');
const bmiValueEl = document.getElementById('bmi-value');
const bmiCategoryEl = document.getElementById('bmi-category');
const bmiMessageEl = document.getElementById('bmi-message');
const bmiConversionEl = document.getElementById('bmi-conversion');
const gaugeMarker = document.getElementById('gauge-marker');

const historySection = document.getElementById('history-section');
const historyListEl = document.getElementById('history-list');
const clearHistoryBtn = document.getElementById('clear-history-btn');

const themeToggleBtn = document.getElementById('theme-toggle');

let currentUnit = 'metric';

/* --------------------------------------------------------------------------
   Unit conversion helpers
   -------------------------------------------------------------------------- */
function kgToLb(kg) {
  return kg / KG_PER_LB;
}

function lbToKg(lb) {
  return lb * KG_PER_LB;
}

function cmToFeetInchesString(cm) {
  const totalInches = cm / CM_PER_IN;
  let feet = Math.floor(totalInches / 12);
  let inches = Math.round((totalInches - feet * 12) * 10) / 10;
  if (inches >= 12) {
    feet += 1;
    inches -= 12;
  }
  return `${feet}'${inches}"`;
}

/* --------------------------------------------------------------------------
   BMI calculation & interpretation
   -------------------------------------------------------------------------- */
function calculateBmiMetric(weightKg, heightCm) {
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}

function calculateBmiImperial(weightLb, heightIn) {
  return (weightLb / (heightIn * heightIn)) * 703;
}

function getCategory(bmi) {
  if (bmi < 18.5) return 'underweight';
  if (bmi < 25) return 'normal';
  if (bmi < 30) return 'overweight';
  return 'obese';
}

function bmiToGaugePercent(bmi) {
  const min = GAUGE_STOPS[0];
  const max = GAUGE_STOPS[GAUGE_STOPS.length - 1];
  const clamped = Math.min(Math.max(bmi, min.bmi), max.bmi);

  for (let i = 0; i < GAUGE_STOPS.length - 1; i++) {
    const a = GAUGE_STOPS[i];
    const b = GAUGE_STOPS[i + 1];
    if (clamped >= a.bmi && clamped <= b.bmi) {
      const ratio = (clamped - a.bmi) / (b.bmi - a.bmi);
      return a.pct + ratio * (b.pct - a.pct);
    }
  }
  return 100;
}

/* --------------------------------------------------------------------------
   Validation
   Each validator reads its input(s), writes an inline error message + toggles
   aria-invalid on failure, and returns the parsed value(s) on success or null.
   -------------------------------------------------------------------------- */
function parseRequiredNumber(inputEl) {
  const raw = inputEl.value.trim();
  if (raw === '') return { ok: false, reason: 'required' };
  const value = Number(raw);
  if (!Number.isFinite(value)) return { ok: false, reason: 'invalid' };
  return { ok: true, value };
}

function setFieldError(inputs, errorEl, message) {
  errorEl.textContent = message || '';
  inputs.forEach((input) => {
    if (message) {
      input.setAttribute('aria-invalid', 'true');
    } else {
      input.removeAttribute('aria-invalid');
    }
  });
}

function clearAllErrors() {
  setFieldError([heightCmInput], heightCmError, '');
  setFieldError([heightFtInput, heightInInput], heightImperialError, '');
  setFieldError([weightKgInput], weightKgError, '');
  setFieldError([weightLbInput], weightLbError, '');
}

function validateMetricHeight() {
  const parsed = parseRequiredNumber(heightCmInput);
  if (!parsed.ok) {
    setFieldError(
      [heightCmInput],
      heightCmError,
      parsed.reason === 'required' ? 'Please enter your height.' : 'Enter a valid number.'
    );
    return null;
  }
  if (parsed.value <= 0) {
    setFieldError([heightCmInput], heightCmError, 'Height must be a positive number.');
    return null;
  }
  if (parsed.value < HEIGHT_CM_MIN || parsed.value > HEIGHT_CM_MAX) {
    setFieldError(
      [heightCmInput],
      heightCmError,
      `Please enter a realistic height (${HEIGHT_CM_MIN}–${HEIGHT_CM_MAX} cm).`
    );
    return null;
  }
  setFieldError([heightCmInput], heightCmError, '');
  return parsed.value;
}

function validateMetricWeight() {
  const parsed = parseRequiredNumber(weightKgInput);
  if (!parsed.ok) {
    setFieldError(
      [weightKgInput],
      weightKgError,
      parsed.reason === 'required' ? 'Please enter your weight.' : 'Enter a valid number.'
    );
    return null;
  }
  if (parsed.value <= 0) {
    setFieldError([weightKgInput], weightKgError, 'Weight must be a positive number.');
    return null;
  }
  if (parsed.value < WEIGHT_KG_MIN || parsed.value > WEIGHT_KG_MAX) {
    setFieldError(
      [weightKgInput],
      weightKgError,
      `Please enter a realistic weight (${WEIGHT_KG_MIN}–${WEIGHT_KG_MAX} kg).`
    );
    return null;
  }
  setFieldError([weightKgInput], weightKgError, '');
  return parsed.value;
}

function validateImperialHeight() {
  const ftParsed = parseRequiredNumber(heightFtInput);
  const inParsed = parseRequiredNumber(heightInInput);

  if (!ftParsed.ok || !inParsed.ok) {
    setFieldError(
      [heightFtInput, heightInInput],
      heightImperialError,
      'Please enter both feet and inches.'
    );
    return null;
  }
  if (ftParsed.value < 0 || inParsed.value < 0) {
    setFieldError([heightFtInput, heightInInput], heightImperialError, 'Height cannot be negative.');
    return null;
  }
  if (inParsed.value >= 12) {
    setFieldError([heightFtInput, heightInInput], heightImperialError, 'Inches must be less than 12.');
    return null;
  }

  const totalInches = ftParsed.value * 12 + inParsed.value;
  const totalCm = totalInches * CM_PER_IN;

  if (totalCm < HEIGHT_CM_MIN || totalCm > HEIGHT_CM_MAX) {
    setFieldError(
      [heightFtInput, heightInInput],
      heightImperialError,
      `Please enter a realistic height (${cmToFeetInchesString(HEIGHT_CM_MIN)}–${cmToFeetInchesString(HEIGHT_CM_MAX)}).`
    );
    return null;
  }

  setFieldError([heightFtInput, heightInInput], heightImperialError, '');
  return { totalInches, totalCm };
}

function validateImperialWeight() {
  const parsed = parseRequiredNumber(weightLbInput);
  if (!parsed.ok) {
    setFieldError(
      [weightLbInput],
      weightLbError,
      parsed.reason === 'required' ? 'Please enter your weight.' : 'Enter a valid number.'
    );
    return null;
  }
  if (parsed.value <= 0) {
    setFieldError([weightLbInput], weightLbError, 'Weight must be a positive number.');
    return null;
  }

  const minLb = kgToLb(WEIGHT_KG_MIN);
  const maxLb = kgToLb(WEIGHT_KG_MAX);
  if (parsed.value < minLb || parsed.value > maxLb) {
    setFieldError(
      [weightLbInput],
      weightLbError,
      `Please enter a realistic weight (${Math.round(minLb)}–${Math.round(maxLb)} lb).`
    );
    return null;
  }

  setFieldError([weightLbInput], weightLbError, '');
  return parsed.value;
}

/* --------------------------------------------------------------------------
   Result rendering
   -------------------------------------------------------------------------- */
function resetResultCard() {
  resultCard.classList.remove('underweight', 'normal', 'overweight', 'obese', 'has-result');
  resultContent.hidden = true;
  bmiValueEl.textContent = '0';
  bmiCategoryEl.textContent = '—';
  bmiMessageEl.textContent = '';
  bmiConversionEl.textContent = '';
  gaugeMarker.style.setProperty('--gauge-position', '0%');
}

function showResult(bmi, weightKg, heightCm) {
  const category = getCategory(bmi);

  bmiValueEl.textContent = bmi.toFixed(1);
  bmiCategoryEl.textContent = CATEGORY_LABELS[category];
  bmiMessageEl.textContent = CATEGORY_MESSAGES[category];
  bmiConversionEl.textContent =
    `${weightKg.toFixed(1)} kg (${kgToLb(weightKg).toFixed(1)} lb) · ` +
    `${heightCm.toFixed(1)} cm (${cmToFeetInchesString(heightCm)})`;

  gaugeMarker.style.setProperty('--gauge-position', `${bmiToGaugePercent(bmi)}%`);

  resultCard.classList.remove('underweight', 'normal', 'overweight', 'obese');
  resultCard.classList.add(category, 'has-result');
  resultContent.hidden = false;
}

/* --------------------------------------------------------------------------
   Calculate / Unit toggle
   -------------------------------------------------------------------------- */
function handleCalculate() {
  let bmi;
  let weightKg;
  let heightCm;

  if (currentUnit === 'metric') {
    const height = validateMetricHeight();
    const weight = validateMetricWeight();
    if (height === null || weight === null) {
      resetResultCard();
      return;
    }
    heightCm = height;
    weightKg = weight;
    bmi = calculateBmiMetric(weightKg, heightCm);
  } else {
    const height = validateImperialHeight();
    const weight = validateImperialWeight();
    if (height === null || weight === null) {
      resetResultCard();
      return;
    }
    heightCm = height.totalCm;
    weightKg = lbToKg(weight);
    bmi = calculateBmiImperial(weight, height.totalInches);
  }

  showResult(bmi, weightKg, heightCm);
  saveHistoryEntry(bmi, weightKg, heightCm);
}

function setUnit(unit) {
  currentUnit = unit;
  const isMetric = unit === 'metric';

  heightMetricGroup.hidden = !isMetric;
  heightImperialGroup.hidden = isMetric;
  weightMetricGroup.hidden = !isMetric;
  weightImperialGroup.hidden = isMetric;

  unitMetricBtn.classList.toggle('is-active', isMetric);
  unitMetricBtn.setAttribute('aria-pressed', String(isMetric));
  unitImperialBtn.classList.toggle('is-active', !isMetric);
  unitImperialBtn.setAttribute('aria-pressed', String(!isMetric));

  clearAllErrors();
  resetResultCard();
}

/* --------------------------------------------------------------------------
   History (localStorage)
   -------------------------------------------------------------------------- */
function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function formatHistoryDate(timestamp) {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderHistory(history) {
  historyListEl.replaceChildren();

  if (history.length === 0) {
    historySection.hidden = true;
    return;
  }
  historySection.hidden = false;

  history.forEach((entry) => {
    const li = document.createElement('li');
    li.className = `history-item ${entry.category}`;

    const bmiSpan = document.createElement('span');
    bmiSpan.className = 'history-bmi';
    bmiSpan.textContent = entry.bmi.toFixed(1);

    const measurements =
      entry.unit === 'metric'
        ? `${entry.heightCm.toFixed(0)} cm · ${entry.weightKg.toFixed(1)} kg`
        : `${cmToFeetInchesString(entry.heightCm)} · ${kgToLb(entry.weightKg).toFixed(1)} lb`;

    const metaSpan = document.createElement('span');
    metaSpan.className = 'history-meta';
    metaSpan.textContent = `${measurements} — ${formatHistoryDate(entry.timestamp)}`;

    li.append(bmiSpan, metaSpan);
    historyListEl.appendChild(li);
  });
}

function saveHistoryEntry(bmi, weightKg, heightCm) {
  const history = loadHistory();
  history.unshift({
    bmi: Math.round(bmi * 10) / 10,
    category: getCategory(bmi),
    weightKg: Math.round(weightKg * 10) / 10,
    heightCm: Math.round(heightCm * 10) / 10,
    unit: currentUnit,
    timestamp: Date.now(),
  });

  const trimmed = history.slice(0, HISTORY_LIMIT);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  } catch {
    /* localStorage unavailable (e.g. private browsing) — history just won't persist */
  }
  renderHistory(trimmed);
}

clearHistoryBtn.addEventListener('click', () => {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* localStorage unavailable — nothing to remove */
  }
  renderHistory([]);
});

/* --------------------------------------------------------------------------
   Dark mode
   -------------------------------------------------------------------------- */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggleBtn.setAttribute('aria-pressed', String(theme === 'dark'));
  themeToggleBtn.querySelector('span').textContent = theme === 'dark' ? '☀️' : '🌙';
}

function initTheme() {
  let stored = null;
  try {
    stored = localStorage.getItem(THEME_KEY);
  } catch {
    /* localStorage unavailable — fall back to system preference */
  }
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(stored || (prefersDark ? 'dark' : 'light'));
}

themeToggleBtn.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    /* localStorage unavailable — theme choice won't persist */
  }
  applyTheme(next);
});

/* --------------------------------------------------------------------------
   Event wiring & init
   -------------------------------------------------------------------------- */
unitMetricBtn.addEventListener('click', () => setUnit('metric'));
unitImperialBtn.addEventListener('click', () => setUnit('imperial'));

calculateBtn.addEventListener('click', handleCalculate);

bmiForm.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    handleCalculate();
  }
});

bmiForm.addEventListener('reset', () => {
  // The native reset hasn't cleared field values yet at this point in the
  // event lifecycle, so defer our cleanup until the browser finishes it.
  setTimeout(() => {
    clearAllErrors();
    resetResultCard();
  }, 0);
});

initTheme();
renderHistory(loadHistory());
