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
      node.textContent = `${node.dataset.climateSrc} · sin datos`;
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
  const isDemo = meta?.provider === 'Datos de demostración' || meta?.provider === 'Demo';
  const provider = isDemo ? 'Ejemplo' : 'Estimación de zona';
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
    node.textContent = '⏳ Consultando el clima de la zona… esto puede tardar unos segundos.';
    note.textContent = 'Esperá un momento mientras se cargan los datos.';
    return;
  }

  if (status === 'stale') {
    setClimateVisibility(false);
    node.textContent = '📍 Cambiaste la ubicación. Presioná “Consultar clima de mi zona” para ver el clima estimado de este lugar.';
    note.textContent = 'Cuando cambias de distrito o coordenadas, hay que consultar de nuevo.';
    return;
  }

  if (status === 'ready') {
    setClimateVisibility(true);
    const isDemo = climate.source === 'demo';
    const period = climate.meta?.period?.start
      ? `${String(climate.meta.period.start).slice(0, 4)}–${String(climate.meta.period.end).slice(0, 4)}`
      : '';
    node.textContent = isDemo
      ? `ℹ️ Estás viendo datos de ejemplo${period ? ` (${period})` : ''}. Te sirven como referencia para probar la herramienta.`
      : `✅ Listo: clima estimado de tu zona${period ? ` (${period})` : ''}. Usalo como guía para tu decisión.`;
    note.textContent = isDemo
      ? '⚠️ Estos son datos de ejemplo. Para tu ubicación, podés presionar “Consultar clima de mi zona”. La estimación no reemplaza una estación local.'
      : '⚠️ Es una estimación para la zona (aprox. 50 km). No es lo mismo que medir en tu chacra, pero ayuda a orientarte.';
    return;
  }

  if (status === 'error') {
    const hasData = Boolean(climate.summary);
    setClimateVisibility(hasData);
    const reason = climate.error?.message ?? 'Hubo un problema.';
    node.textContent = hasData
      ? `❌ No se pudo consultar el clima ahora (${reason}). Te mostramos datos de ejemplo para que puedas seguir.`
      : `❌ No se pudo consultar el clima ahora (${reason}). Revisá tu conexión y probá de nuevo con “Consultar clima de mi zona”.`;
    note.textContent = hasData
      ? '⚠️ Mientras tanto, los datos que ves son de ejemplo. Podés intentar consultar otra vez.'
      : 'Cuando se conecte, vas a poder ver la estimación de tu zona.';
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
  if (!scores) {
    return CRITERIA.map(() => '<div class="crit-pill">—</div>').join('');
  }
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
        const scored = rotation.wscore !== null && rotation.wscore !== undefined;
        const pct = scored ? rotation.wscore : 0;
        const pctText = scored ? rotation.wscore : '—';
        const color = scored ? barColor(rotation.wscore) : '#64748b';
        const bestBadge =
          rotation.rank === 0 && scored ? '<span class="best-badge">⭐ Mejor opción</span>' : '';
        const currentBadge =
          rotation.origin === 'current' ? '<span class="best-badge">🔁 Actual</span>' : '';
        const cardClass = rotation.class ? `rotation-card ${rotation.class}` : 'rotation-card';
        const pendingNote = rotation.scores
          ? ''
          : '<div class="rot-note" style="color:#94a3b8">ℹ️ <span style="color:var(--text-secondary)">Todavía no calculamos el puntaje de esta rotación.</span></div>';

        return `
      <div class="${cardClass}" style="animation: fadeIn 0.4s ease ${rotation.rank * 0.1}s both">
        <div class="rot-header">
          <div>
            <div class="rot-name">${rotation.nombre}${bestBadge}${currentBadge}</div>
            <div class="rot-sequence">${rotation.sequenceText}</div>
          </div>
          <div class="rot-score-label" style="color:${color}">${pctText}<small>${scored ? '/100' : ''}</small></div>
        </div>
        <div class="score-bar-wrap">
          <div class="score-bar" style="width:${pct}%;background:${color}"></div>
        </div>
        <div class="crit-row">${criteriaHtml(rotation.scores)}</div>
        <div class="rot-notes">${notesHtml(rotation.notas)}${pendingNote}</div>
      </div>`;
      })
      .join('');
}
