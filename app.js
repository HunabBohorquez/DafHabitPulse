'use strict';

/* ================= Utilidades de fecha ================= */
const DateUtil = {
  key(d) {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  },
  parse(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); },
  addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); },
  today() { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); },
  weekdayMon0(d) { return (d.getDay() + 6) % 7; } // Lunes=0 ... Domingo=6
};
const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const SLEEP_GOAL = 7.5;
const STREAK_THRESHOLD = 0.75;

/* ================= HabitStore: datos y persistencia ================= */
const HabitStore = {
  KEY: 'habitpulse.v1',
  DEFAULT_HABITS: ['Ejercicio 30 min', 'Dormir >= 7.5h', 'Lectura / Estudio', 'Hidratación 2L', 'Sin comida chatarra'],
  state: { habits: [], logs: {} },

  defaults() {
    return this.DEFAULT_HABITS.map((name, i) => ({ id: 'h' + (i + 1), name }));
  },
  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && Array.isArray(p.habits) && p.logs) { this.state = p; return; }
      }
    } catch (e) { /* datos corruptos: se reinician */ }
    this.state = { habits: this.defaults(), logs: {} };
  },
  save() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.state)); } catch (e) { /* sin almacenamiento */ }
  },
  addHabit(name) {
    name = name.trim();
    if (!name || this.state.habits.some(h => h.name.toLowerCase() === name.toLowerCase())) return false;
    this.state.habits.push({ id: 'h' + Date.now().toString(36), name });
    this.save();
    return true;
  },
  removeHabit(id) {
    this.state.habits = this.state.habits.filter(h => h.id !== id);
    Object.values(this.state.logs).forEach(l => { l.done = l.done.filter(x => x !== id); });
    this.save();
  },
  getLog(dateKey) { return this.state.logs[dateKey] || null; },
  setLog(dateKey, log) { this.state.logs[dateKey] = log; this.save(); },
  compliance(log) {
    const n = this.state.habits.length;
    if (!log || n === 0) return 0;
    const ids = new Set(this.state.habits.map(h => h.id));
    return log.done.filter(id => ids.has(id)).length / n;
  },
  loggedDays() {
    return Object.keys(this.state.logs).sort().map(k => ({ key: k, date: DateUtil.parse(k), log: this.state.logs[k] }));
  },
  reset() { this.state = { habits: this.defaults(), logs: {} }; this.save(); },

  /* Generador determinista (mulberry32, semilla fija) */
  generateDemo(days = 90, endDate = DateUtil.today()) {
    let a = 20260101;
    const rand = () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    this.state = { habits: this.defaults(), logs: {} };
    const ids = this.state.habits.map(h => h.id);
    for (let i = 0; i < days; i++) {
      const date = DateUtil.addDays(endDate, -(days - 1 - i));
      const base = 0.6 + 0.25 * Math.sin(i / 9);
      const sleep = Math.round((5 + rand() * 4.5) * 2) / 2;
      const done = [];
      const flags = {};
      ids.forEach((id, idx) => {
        let ok;
        if (idx === 1) ok = sleep >= SLEEP_GOAL;
        else ok = rand() < clamp(base + (idx === 4 ? -0.1 : 0), 0.05, 0.95);
        flags[idx] = ok;
        if (ok) done.push(id);
      });
      const energy = clamp(Math.round(3.6 + 2.8 * flags[0] + 1.6 * (sleep >= SLEEP_GOAL) + 0.8 * flags[3] + (rand() - 0.5) * 3), 1, 10);
      const mood = clamp(Math.round(4.2 + 1.4 * flags[2] + 1.0 * flags[0] + 1.1 * flags[4] + 0.6 * (sleep >= SLEEP_GOAL) + (rand() - 0.5) * 3), 1, 10);
      this.state.logs[DateUtil.key(date)] = { done, sleep, energy, mood };
    }
    this.save();
  },

  toJSON() { return JSON.stringify(this.state, null, 2); },
  toCSV() {
    const hs = this.state.habits;
    const esc = s => `"${String(s).replace(/"/g, '""')}"`;
    const head = ['fecha', ...hs.map(h => esc(h.name)), 'sueno_h', 'energia', 'animo', 'cumplimiento_pct'];
    const rows = this.loggedDays().map(({ key, log }) => [
      key, ...hs.map(h => (log.done.includes(h.id) ? 1 : 0)),
      log.sleep, log.energy, log.mood, Math.round(this.compliance(log) * 100)
    ].join(','));
    return [head.join(','), ...rows].join('\n');
  }
};

/* ================= CorrelationEngine: estadística ================= */
const CorrelationEngine = {
  mean(a) { return a.reduce((s, v) => s + v, 0) / a.length; },
  /** Pearson r. Devuelve null si n<2 o varianza cero en X o Y. */
  pearson(x, y) {
    const n = x.length;
    if (n < 2 || n !== y.length) return null;
    const mx = this.mean(x), my = this.mean(y);
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) {
      const dx = x[i] - mx, dy = y[i] - my;
      sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
    }
    if (sxx === 0 || syy === 0) return null;
    return sxy / Math.sqrt(sxx * syy);
  },
  strength(r) {
    const a = Math.abs(r);
    if (a >= 0.7) return 'Fuerte';
    if (a >= 0.4) return 'Moderada';
    if (a >= 0.2) return 'Débil';
    return 'Insignificante';
  },
  analyzeFactor(label, days, test) {
    const x = days.map(d => (test(d) ? 1 : 0));
    const yes = days.filter((d, i) => x[i] === 1), no = days.filter((d, i) => x[i] === 0);
    const out = { label, nYes: yes.length, nNo: no.length, metrics: {}, impact: 0, valid: false };
    if (yes.length === 0 || no.length === 0) return out;
    ['energy', 'mood'].forEach(m => {
      const y = days.map(d => d.log[m]);
      const r = this.pearson(x, y);
      const my = this.mean(yes.map(d => d.log[m])), mn = this.mean(no.map(d => d.log[m]));
      out.metrics[m] = { r, yes: my, no: mn, pct: mn === 0 ? null : ((my - mn) / mn) * 100 };
    });
    const rs = Object.values(out.metrics).map(v => (v.r === null ? 0 : Math.abs(v.r)));
    out.impact = Math.max(...rs);
    out.valid = Object.values(out.metrics).some(v => v.r !== null);
    return out;
  },
  findings(store) {
    const days = store.loggedDays();
    if (days.length < 2) return [];
    const list = store.state.habits.map(h => this.analyzeFactor(h.name, days, d => d.log.done.includes(h.id)));
    list.push(this.analyzeFactor(`Sueño ≥ ${SLEEP_GOAL}h`, days, d => d.log.sleep >= SLEEP_GOAL));
    return list.sort((a, b) => b.impact - a.impact);
  },
  describe(f, metric) {
    const m = f.metrics[metric], nombre = metric === 'energy' ? 'Energía' : 'Ánimo';
    if (!m || m.r === null) return `${nombre}: sin varianza suficiente para calcular r.`;
    const sign = m.r >= 0 ? '+' : '';
    const verbo = m.yes >= m.no ? 'sube' : 'baja';
    const pct = m.pct === null ? 's/d' : `${m.pct >= 0 ? '+' : ''}${m.pct.toFixed(1)}%`;
    return `Correlación ${this.strength(m.r)} r = ${sign}${m.r.toFixed(2)}: cuando cumples '${f.label}', tu ${nombre} promedio ${verbo} de ${m.no.toFixed(1)} a ${m.yes.toFixed(1)} (${pct})`;
  }
};

/* ================= StreakAndHeatmap ================= */
const StreakAndHeatmap = {
  level(pct) {
    if (pct < 0.25) return 1;
    if (pct < 0.5) return 2;
    if (pct < STREAK_THRESHOLD) return 3;
    return 4;
  },
  metCriteria(store, key) {
    const log = store.getLog(key);
    return !!log && store.compliance(log) >= STREAK_THRESHOLD;
  },
  streaks(store, today = DateUtil.today()) {
    const keys = Object.keys(store.state.logs).sort();
    let record = 0, run = 0, prev = null;
    keys.forEach(k => {
      if (!this.metCriteria(store, k)) { run = 0; prev = null; return; }
      const d = DateUtil.parse(k);
      run = prev && DateUtil.key(DateUtil.addDays(prev, 1)) === k ? run + 1 : 1;
      prev = d;
      record = Math.max(record, run);
    });
    let cursor = today;
    if (!this.metCriteria(store, DateUtil.key(cursor))) cursor = DateUtil.addDays(cursor, -1);
    let current = 0;
    while (this.metCriteria(store, DateUtil.key(cursor))) { current++; cursor = DateUtil.addDays(cursor, -1); }
    return { current, record: Math.max(record, current) };
  },
  globalRate(store) {
    const days = store.loggedDays();
    if (!days.length) return 0;
    return days.reduce((s, d) => s + store.compliance(d.log), 0) / days.length;
  },
  weekdayAverages(store) {
    const sums = Array(7).fill(0), counts = Array(7).fill(0);
    store.loggedDays().forEach(d => {
      const w = DateUtil.weekdayMon0(d.date);
      sums[w] += store.compliance(d.log); counts[w]++;
    });
    return sums.map((s, i) => (counts[i] ? s / counts[i] : 0));
  },
  /** 26 columnas x 7 filas (Lun-Dom) = 182 días, terminando en la semana actual. */
  buildGrid(today = DateUtil.today()) {
    const monday = DateUtil.addDays(today, -DateUtil.weekdayMon0(today));
    const start = DateUtil.addDays(monday, -25 * 7);
    const cols = [];
    for (let c = 0; c < 26; c++) {
      const col = [];
      for (let r = 0; r < 7; r++) col.push(DateUtil.addDays(start, c * 7 + r));
      cols.push(col);
    }
    return cols;
  }
};

/* ================= UIController ================= */
const UIController = {
  selected: DateUtil.key(DateUtil.today()),
  $(id) { return document.getElementById(id); },

  init() {
    HabitStore.load();
    this.$('log-date').value = this.selected;
    this.$('log-date').max = DateUtil.key(DateUtil.today());
    this.bind();
    this.renderAll();
  },
  bind() {
    this.$('log-date').addEventListener('change', e => { this.selected = e.target.value || this.selected; this.renderForm(); });
    ['sleep', 'energy', 'mood'].forEach(id => {
      this.$(id).addEventListener('input', () => { this.$(id + '-out').textContent = this.$(id).value; });
    });
    this.$('log-form').addEventListener('submit', e => { e.preventDefault(); this.saveLog(); });
    this.$('habit-form').addEventListener('submit', e => {
      e.preventDefault();
      const inp = this.$('habit-name');
      if (HabitStore.addHabit(inp.value)) { inp.value = ''; this.renderAll(); } else inp.focus();
    });
    this.$('btn-demo').addEventListener('click', () => {
      if (confirm('Esto reemplazará tus datos actuales por 90 días de demo. ¿Continuar?')) { HabitStore.generateDemo(); this.renderAll(); }
    });
    this.$('btn-clear').addEventListener('click', () => {
      if (confirm('¿Borrar todos los datos?')) { HabitStore.reset(); this.renderAll(); }
    });
    this.$('btn-json').addEventListener('click', () => this.download('habitpulse.json', HabitStore.toJSON(), 'application/json'));
    this.$('btn-csv').addEventListener('click', () => this.download('habitpulse.csv', HabitStore.toCSV(), 'text/csv'));
    window.addEventListener('resize', () => this.renderChart());
  },
  download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  },
  saveLog() {
    const done = [...document.querySelectorAll('#habit-checks input:checked')].map(i => i.value);
    HabitStore.setLog(this.selected, {
      done, sleep: Number(this.$('sleep').value), energy: Number(this.$('energy').value), mood: Number(this.$('mood').value)
    });
    this.renderAll();
  },
  renderAll() {
    this.renderHabits(); this.renderForm(); this.renderMetrics(); this.renderHeatmap(); this.renderChart(); this.renderFindings();
  },
  renderHabits() {
    const ul = this.$('habit-list');
    ul.innerHTML = '';
    HabitStore.state.habits.forEach(h => {
      const li = document.createElement('li');
      const span = document.createElement('span'); span.textContent = h.name;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn-del'; b.textContent = '✕'; b.title = 'Eliminar hábito';
      b.addEventListener('click', () => {
        if (confirm(`¿Eliminar "${h.name}" y su historial?`)) { HabitStore.removeHabit(h.id); this.renderAll(); }
      });
      li.append(span, b); ul.appendChild(li);
    });
  },
  renderForm() {
    const log = HabitStore.getLog(this.selected);
    this.$('log-date').value = this.selected;
    const box = this.$('habit-checks');
    box.innerHTML = '';
    HabitStore.state.habits.forEach(h => {
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.value = h.id; cb.checked = !!log && log.done.includes(h.id);
      label.append(cb, document.createTextNode(' ' + h.name));
      box.appendChild(label);
    });
    const vals = log || { sleep: 7, energy: 5, mood: 5 };
    ['sleep', 'energy', 'mood'].forEach(id => { this.$(id).value = vals[id]; this.$(id + '-out').textContent = vals[id]; });
    this.$('log-status').textContent = log ? 'Registro existente (se sobrescribirá al guardar)' : 'Sin registro para esta fecha';
  },
  renderMetrics() {
    const s = StreakAndHeatmap.streaks(HabitStore);
    this.$('m-current').textContent = s.current;
    this.$('m-record').textContent = s.record;
    this.$('m-rate').textContent = Math.round(StreakAndHeatmap.globalRate(HabitStore) * 100) + '%';
  },
  renderHeatmap() {
    const grid = this.$('heatmap'), tip = this.$('tooltip');
    grid.innerHTML = '';
    const today = DateUtil.today();
    StreakAndHeatmap.buildGrid(today).forEach(col => {
      const colEl = document.createElement('div'); colEl.className = 'hm-col';
      col.forEach(d => {
        const k = DateUtil.key(d), log = HabitStore.getLog(k);
        const cell = document.createElement('div');
        const future = d > today;
        const pct = log ? HabitStore.compliance(log) : 0;
        cell.className = 'hm-cell l' + (future ? 'x' : log ? StreakAndHeatmap.level(pct) : 0);
        if (k === this.selected) cell.classList.add('sel');
        if (!future) {
          cell.addEventListener('click', () => { this.selected = k; this.renderForm(); this.renderHeatmap(); });
          cell.addEventListener('mousemove', e => {
            tip.hidden = false;
            tip.innerHTML = log
              ? `<b>${k}</b> (${DAY_NAMES[DateUtil.weekdayMon0(d)]})<br>Cumplimiento: ${Math.round(pct * 100)}%<br>Sueño: ${log.sleep}h · Energía: ${log.energy} · Ánimo: ${log.mood}`
              : `<b>${k}</b> (${DAY_NAMES[DateUtil.weekdayMon0(d)]})<br>Sin registro`;
            tip.style.left = Math.min(e.clientX + 14, window.innerWidth - 230) + 'px';
            tip.style.top = e.clientY + 14 + 'px';
          });
          cell.addEventListener('mouseleave', () => { tip.hidden = true; });
        }
        colEl.appendChild(cell);
      });
      grid.appendChild(colEl);
    });
  },
  renderChart() {
    const cv = this.$('chart'), ctx = cv.getContext('2d');
    const w = cv.clientWidth || 600, h = 220, dpr = window.devicePixelRatio || 1;
    cv.width = w * dpr; cv.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const css = getComputedStyle(document.documentElement);
    const fg = css.getPropertyValue('--muted').trim() || '#888', accent = css.getPropertyValue('--accent').trim() || '#3fb950';
    const data = StreakAndHeatmap.weekdayAverages(HabitStore);
    const pad = { l: 36, r: 10, t: 14, b: 26 }, cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
    ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = fg; ctx.strokeStyle = fg + '55';
    ctx.textAlign = 'right';
    [0, 25, 50, 75, 100].forEach(v => {
      const y = pad.t + ch - (v / 100) * ch;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.fillText(v + '%', pad.l - 6, y + 4);
    });
    const bw = cw / 7;
    data.forEach((v, i) => {
      const bh = v * ch, x = pad.l + i * bw + bw * 0.18, y = pad.t + ch - bh;
      ctx.fillStyle = accent; ctx.fillRect(x, y, bw * 0.64, bh);
      ctx.fillStyle = fg; ctx.textAlign = 'center';
      ctx.fillText(DAY_NAMES[i], x + bw * 0.32, h - 8);
      if (v > 0) ctx.fillText(Math.round(v * 100) + '%', x + bw * 0.32, y - 4);
    });
  },
  renderFindings() {
    const box = this.$('findings');
    box.innerHTML = '';
    const list = CorrelationEngine.findings(HabitStore);
    if (!list.length) { box.innerHTML = '<p class="empty">Registra al menos 2 días (o genera la demo) para ver hallazgos.</p>'; return; }
    list.forEach(f => {
      const card = document.createElement('article');
      const best = Math.max(...Object.values(f.metrics).map(m => (m.r === null ? 0 : Math.abs(m.r))), 0);
      card.className = 'card-find ' + (best >= 0.7 ? 'strong' : best >= 0.4 ? 'mid' : 'weak');
      const h = document.createElement('h3'); h.textContent = f.label;
      card.appendChild(h);
      if (!f.valid) {
        const p = document.createElement('p');
        p.textContent = `Sin variación suficiente (días cumplido: ${f.nYes}, no cumplido: ${f.nNo}). No se puede calcular r.`;
        card.appendChild(p);
      } else {
        ['energy', 'mood'].forEach(m => { const p = document.createElement('p'); p.textContent = CorrelationEngine.describe(f, m); card.appendChild(p); });
        const s = document.createElement('small'); s.textContent = `Días cumplido: ${f.nYes} · no cumplido: ${f.nNo}`; card.appendChild(s);
      }
      box.appendChild(card);
    });
  }
};

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => UIController.init());
if (typeof module !== 'undefined') module.exports = { DateUtil, HabitStore, CorrelationEngine, StreakAndHeatmap };
