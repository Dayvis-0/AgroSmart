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

export function renderClimateCards(summary, meta = null) {
  if (!summary) return;
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
    node.textContent = '⏳ Consultando NASA POWER…';
    return;
  }

  if (status === 'ready') {
    const provider = climate.meta?.provider ?? 'NASA POWER';
    const period = climate.meta?.period?.start
      ? `${String(climate.meta.period.start).slice(0, 4)}–${String(climate.meta.period.end).slice(0, 4)}`
      : '';
    node.textContent = `✅ Datos cargados desde ${provider}${period ? ` (${period})` : ''}.`;
    note.textContent =
      climate.source === 'demo'
        ? '⚠️ Mostrando datos de demostración. NASA POWER ofrece estimaciones con resolución ~50 km y no reemplaza una estación meteorológica local.'
        : '⚠️ Fuente: NASA POWER API · Resolución ~50 km · Estimaciones satelitales/modeladas, no una estación meteorológica local.';
    return;
  }

  if (status === 'error') {
    const reason = climate.error?.message ?? 'Error desconocido.';
    node.textContent = `❌ No se pudo consultar NASA POWER: ${reason} Se muestran datos de demostración.`;
    note.textContent =
      '⚠️ Fallback activo: datos de demostración. Verifique la conexión e intente consultar nuevamente.';
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

export function renderRotations(container, ranked) {
  container.innerHTML = ranked
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
