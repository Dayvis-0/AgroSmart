import { CRITERIA, barColor } from '../agriculture/rotation-engine.js';

export function startClock() {
  const tick = () => {
    const now = new Date();
    const opts = {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    };
    document.getElementById('topbar-time').textContent = now.toLocaleString('es-PE', opts) + ' PET';
  };
  tick();
  setInterval(tick, 1000);
}

function setClimateVisibility(visible) {
  const grid = document.querySelector('.climate-grid');
  const chartWrapper = document.querySelector('.chart-wrapper');
  const periodBtns = document.querySelector('.period-btns');
  const note = document.getElementById('climate-note');
  const display = visible ? '' : 'none';
  if (grid) grid.style.display = display;
  if (chartWrapper) chartWrapper.style.display = display;
  if (periodBtns) periodBtns.style.display = display;
  if (note) note.style.display = display;
}

export function renderClimateCards(summary, meta = null) {
  const visible = Boolean(summary);
  setClimateVisibility(visible);
  if (!summary) {
    const tempAct = document.getElementById('cc-temp-act');
    const tempMedia = document.getElementById('cc-temp');
    if (tempAct) tempAct.textContent = '—';
    if (tempMedia) tempMedia.textContent = '—';
    const prec = document.getElementById('cc-prec');
    const viento = document.getElementById('cc-viento');
    const rad = document.getElementById('cc-rad');
    if (prec) prec.textContent = '—';
    if (viento) viento.textContent = '—';
    if (rad) rad.textContent = '—';
    document.querySelectorAll('[data-climate-src]').forEach((node) => {
      node.textContent = `${node.dataset.climateSrc} · —`;
    });
    return;
  }

  const tempAct = document.getElementById('cc-temp-act');
  if (tempAct) {
    tempAct.textContent = (summary.tempCurrent ?? summary.temp).toFixed(1);
  }
  const tempMedia = document.getElementById('cc-temp');
  if (tempMedia) {
    tempMedia.textContent = summary.temp.toFixed(1);
  }
  document.getElementById('cc-prec').textContent = Math.round(summary.prec);
  document.getElementById('cc-viento').textContent = summary.viento.toFixed(1);
  document.getElementById('cc-rad').textContent = summary.rad.toFixed(1);

  const year = meta?.year ?? (meta?.period?.end ? String(meta.period.end).slice(0, 4) : '2026');
  const provider = meta?.provider ?? (meta ? 'NASA POWER' : 'Demo');
  document.querySelectorAll('[data-climate-src]').forEach((node) => {
    const parameter = node.dataset.climateSrc;
    node.textContent = `${parameter} · ${year} · ${provider}`;
  });
}

export function renderClimateStatus(status, climate) {
  const node = document.getElementById('climate-status');
  const note = document.getElementById('climate-note');
  if (!node || !note) return;

  if (status === 'loading') {
    setClimateVisibility(false);
    node.textContent = '⏳ Consultando NASA POWER…';
    note.textContent = '';
    return;
  }

  if (status === 'stale') {
    setClimateVisibility(false);
    node.textContent = '📍 Ubicación cambiada. Presione “Consultar clima” para ver indicadores y tendencias de la nueva ubicación.';
    note.textContent = '';
    return;
  }

  if (status === 'ready') {
    setClimateVisibility(true);
    const provider = climate.meta?.provider ?? 'NASA POWER';
    const period = climate.meta?.period?.start
      ? `${String(climate.meta.period.start).slice(0, 4)}–${String(climate.meta.period.end).slice(0, 4)}`
      : '';
    node.textContent = `✅ Datos cargados desde ${provider}${period ? ` (${period})` : ''}.`;
    note.textContent =
      climate.source === 'demo'
        ? '⚠️ Mostrando datos de demostración. NASA POWER ofrece estimaciones con resolución ~50 km y no reemplaza una estación meteorológica local.'
        : '⚠️ Fuente: NASA POWER API · Resolución ~50 km · Estimaciones satelitales/modeladas, no una estación meteorológica local (centroide consultado).';
    return;
  }

  if (status === 'error') {
    const hasData = Boolean(climate.summary);
    setClimateVisibility(hasData);
    const reason = climate.error?.message ?? 'Error desconocido.';
    node.textContent = hasData
      ? `❌ No se pudo consultar NASA POWER: ${reason} Se muestran datos de demostración.`
      : `❌ No se pudo consultar NASA POWER: ${reason} Presione “Consultar clima” para intentar nuevamente.`;
    note.textContent = hasData
      ? '⚠️ Fallback activo: datos de demostración. Verifique la conexión e intente consultar nuevamente.'
      : '';
  }
}

function notesHtml(notes) {
  return notes
    .map((note) => {
      const icon = note.type === 'ok' ? '✅' : note.type === 'warn' ? '⚠️' : '❌';
      const color = note.type === 'ok' ? '#00ff88' : note.type === 'warn' ? '#f59e0b' : '#ef4444';
      return `<div class="rot-note" style="color:${color}">${icon} <span style="color:var(--text-secondary)">${note.text}</span></div>`;
    })
    .join('');
}

function criteriaHtml(scores) {
  return CRITERIA.map((criterion) => `<div class="crit-pill">${criterion.icon} ${scores[criterion.key]}</div>`).join(
    ''
  );
}

export function renderRotations(container, ranked, { message = '' } = {}) {
  const messageHtml = message
    ? `<div class="chart-note" style="margin:0 0 10px 0;">ℹ️ ${message}</div>`
    : '';

  if (!ranked.length) {
    container.innerHTML = `${messageHtml}<div class="chart-note" style="margin:0;">Seleccione los cultivos necesarios para habilitar al menos una rotación compatible.</div>`;
    return;
  }

  container.innerHTML =
    messageHtml +
    ranked
      .map((rotation) => {
        const pct = rotation.wscore;
        const color = barColor(pct);
        const bestBadge = rotation.rank === 0 ? '<span class="best-badge">⭐ Mejor opción</span>' : '';

        return `
      <div class="rotation-card ${rotation.class}" style="animation: fadeIn 0.4s ease ${rotation.rank * 0.1}s both">
        <div class="rot-header">
          <div>
            <div class="rot-name">${rotation.nombre}${bestBadge}</div>
            <div class="rot-sequence">${rotation.secuencia}</div>
          </div>
          <div class="rot-score-label" style="color:${color}">${pct}<small>/100</small></div>
        </div>
        <div class="score-bar-wrap">
          <div class="score-bar" style="width:${pct}%;background:${color}"></div>
        </div>
        <div class="crit-row">${criteriaHtml(rotation.scores)}</div>
        <div class="rot-notes">${notesHtml(rotation.notas)}</div>
      </div>`;
      })
      .join('');
}
