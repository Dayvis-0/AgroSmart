/**
 * AgroSmart - Módulo de Generación de Reportes Técnicos en PDF
 * Utiliza jsPDF para crear un informe agronómico estructurado y profesional.
 */

import { CRITERIA } from '../agriculture/rotation-engine.js';

function getJsPdf() {
  const jsPdfNamespace = window.jspdf;
  if (!jsPdfNamespace || !jsPdfNamespace.jsPDF) {
    throw new Error('Librería jsPDF no disponible en window.jspdf');
  }
  return jsPdfNamespace.jsPDF;
}

function noteSymbol(type) {
  if (type === 'ok') return '[✓]';
  if (type === 'warn') return '[!]';
  return '[✗]';
}

function noteColor(type) {
  if (type === 'ok') return [5, 150, 105]; // Emerald
  if (type === 'warn') return [217, 119, 6]; // Amber
  return [220, 38, 38]; // Red
}

function alertBadge(type) {
  if (type === 'amber') return { label: 'ADVERTENCIA CLIMÁTICA', color: [217, 119, 6], bg: [254, 243, 199] };
  if (type === 'red' || type === 'bad') return { label: 'RIESGO ELEVADO', color: [220, 38, 38], bg: [254, 226, 226] };
  return { label: 'AVISO TÉCNICO', color: [2, 132, 199], bg: [224, 242, 254] };
}

function describeClimateSource(climate = {}) {
  if (climate.source === 'nasa-power') {
    const period = climate.meta?.period?.start
      ? `${String(climate.meta.period.start).slice(0, 4)}–${String(climate.meta.period.end).slice(0, 4)}`
      : '';
    const periodText = period ? ` (${period})` : '';
    return {
      short: 'NASA POWER · estimación regional ~50 km',
      detail: `NASA POWER API (punto mensual, comunidad AG, estimación regional ~50 km)${periodText}. No es una estación local.`
    };
  }
  if (climate.source === 'demo') {
    return {
      short: 'Datos de demostración (respaldo)',
      detail: 'Datos de demostración locales usados como respaldo sin consulta satelital en vivo para esta comparación.'
    };
  }
  return {
    short: 'Clima no consultado',
    detail: 'No hay datos climáticos cargados; la comparación puede usar respaldo de demostración etiquetado.'
  };
}

function describeRegionalContext(regionalContext = {}, climate = {}) {
  const ctx = regionalContext || {};
  if (climate.source === 'demo' && ctx.status !== 'available') {
    return 'Segunda fuente NASA (GPM IMERG, precipitación regional ~10 km): no consultada en modo demostración/respaldo.';
  }
  if (ctx.status === 'available') {
    return `Segunda fuente NASA: ${ctx.product || 'GPM IMERG'} (${ctx.source || 'GES DISC'}). Resolución: ${ctx.resolution || '~10 km'} · Cobertura: ${ctx.coverage || 'referencial'}.`;
  }
  if (ctx.status === 'loading') {
    return `Segunda fuente NASA: consultando ${ctx.product || 'GPM IMERG'} (contexto regional ~10 km).`;
  }
  if (ctx.status === 'unavailable') {
    const reason = ctx.reason ? ` Motivo: ${ctx.reason}.` : '';
    return `Segunda fuente NASA (GPM IMERG, contexto regional ~10 km): no disponible en este navegador.${reason}`;
  }
  return 'Segunda fuente NASA (GPM IMERG, contexto regional ~10 km): estado no disponible.';
}

function formatWaterSource(source) {
  if (source === 'lluvia') return 'Lluvia (Secano estacional)';
  if (source === 'riego') return 'Riego tecnificado continuo';
  if (source === 'mixto') return 'Mixto (Riego complementario)';
  return source || 'No especificado';
}

function formatOrganicMatter(mo) {
  if (mo === 'alta') return 'Alta (> 3.5%)';
  if (mo === 'media') return 'Media (1.5 - 3.5%)';
  if (mo === 'baja') return 'Baja (< 1.5%)';
  return mo || 'Media';
}

/**
 * Genera el documento PDF técnico de comparación de rotaciones y clima.
 */
export function buildComparisonPdf({
  rankedRotations = [],
  alerts = [],
  parcel = {},
  soil = {},
  climate = {},
  priorities = {},
  regionalContext = null
}) {
  const jsPDF = getJsPdf();
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2; // 182 mm
  const today = new Date().toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  const climateSource = describeClimateSource(climate);
  const regionalContextText = describeRegionalContext(regionalContext, climate);

  let y = 0;

  // Helper para verificar espacio en la página
  const ensureSpace = (neededHeight = 12) => {
    if (y + neededHeight > pageHeight - 20) {
      doc.addPage();
      drawPageHeader(false);
      y = 20;
    }
  };

  // Dibujar encabezado institucional
  const drawPageHeader = (isFirstPage = true) => {
    if (isFirstPage) {
      // Fondo oscuro superior
      doc.setFillColor(15, 23, 42); // #0f172a
      doc.rect(0, 0, pageWidth, 28, 'F');

      // Línea de acento Cyan
      doc.setFillColor(0, 212, 255); // #00d4ff
      doc.rect(0, 28, pageWidth, 1.5, 'F');

      // Título y branding
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(255, 255, 255);
      doc.text('AGROSMART', margin, 13);

      // Badge de NASA Space Apps
      doc.setFillColor(8, 51, 68); // Dark cyan pill
      doc.roundedRect(margin + 42, 6.5, 34, 6.5, 1.5, 1.5, 'F');
      doc.setFontSize(7.5);
      doc.setTextColor(0, 212, 255);
      doc.text('NASA Space Apps', margin + 44, 11);

      // Subtítulo
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(203, 213, 225);
      doc.text('SISTEMA INTELIGENTE DE ROTACIÓN DE CULTIVOS & MONITOREO AGROCLIMÁTICO', margin, 21);

      // Metadata a la derecha
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(255, 255, 255);
      doc.text('INFORME TÉCNICO AGRONÓMICO', pageWidth - margin, 11, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(`Emisión: ${today}`, pageWidth - margin, 17, { align: 'right' });
      const sourceLabel = climate.source === 'nasa-power'
        ? 'Fuente clima: NASA POWER (~50 km, regional)'
        : 'Fuente clima: demostración (respaldo)';
      doc.text(sourceLabel, pageWidth - margin, 22, { align: 'right' });

      y = 35;
    } else {
      // Mini-header en páginas adicionales
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 12, 'F');

      doc.setFillColor(0, 212, 255);
      doc.rect(0, 12, pageWidth, 0.8, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(255, 255, 255);
      doc.text('AGROSMART · REPORTE TÉCNICO', margin, 8);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(`Fecha: ${today}`, pageWidth - margin, 8, { align: 'right' });

      y = 18;
    }
  };

  // Helper para títulos de sección
  const drawSectionTitle = (title, iconSymbol = '■') => {
    ensureSpace(12);
    doc.setFillColor(0, 212, 255);
    doc.rect(margin, y, 2.5, 6, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(title, margin + 5, y + 4.8);
    y += 9;
  };

  // Iniciar página 1
  drawPageHeader(true);

  // ─────────────────────────────────────────────────────────
  // SECCIÓN 1: FICHA TÉCNICA (PARCELA + CLIMA SATELITAL)
  // ─────────────────────────────────────────────────────────
  drawSectionTitle('1. PARCELA Y CONDICIONES AGROCLIMÁTICAS EVALUADAS');

  const cardW = (contentWidth - 4) / 2;
  const cardH = 34;

  // Tarjeta Parcela & Suelo
  doc.setFillColor(248, 250, 252); // #f8fafc
  doc.setDrawColor(226, 232, 240); // #e2e8f0
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, cardW, cardH, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text('DATOS DE LA PARCELA Y SUELO', margin + 4, y + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);

  const ubicacion = [parcel.community, parcel.district].filter(Boolean).join(', ') || 'No especificada';
  const coords = `Lat: ${Number(parcel.lat || 0).toFixed(4)}° | Lon: ${Number(parcel.lon || 0).toFixed(4)}°`;
  const phDesc = soil.ph ? (soil.ph < 6 ? 'Ácido' : soil.ph > 7.3 ? 'Alcalino' : 'Neutro / Óptimo') : 'N/D';

  doc.text(`• Ubicación: ${ubicacion}`, margin + 4, y + 11);
  doc.text(`• Coordenadas: ${coords}`, margin + 4, y + 15.5);
  doc.text(`• Textura de Suelo: ${(soil.texture || 'Franca').toUpperCase()}`, margin + 4, y + 20);
  doc.text(`• pH: ${soil.ph || 6.2} (${phDesc}) | M. Orgánica: ${formatOrganicMatter(soil.organicMatter)}`, margin + 4, y + 24.5);
  doc.text(`• Drenaje: ${soil.drainage || 'Moderado'} | Riego: ${formatWaterSource(soil.water)}`, margin + 4, y + 29);

  // Tarjeta Clima (fuente y contexto real)
  const col2X = margin + cardW + 4;
  const climateCardH = 40;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(col2X, y, cardW, climateCardH, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text('CLIMA Y FUENTES DE DATOS', col2X + 4, y + 5.5);

  const summary = climate.summary || null;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);

  if (summary) {
    doc.text(`• Temperatura media: ${Number(summary.temp ?? 0).toFixed(1)} °C`, col2X + 4, y + 11);
    doc.text(`• Precipitación anual: ${Math.round(Number(summary.prec ?? 0))} mm/año`, col2X + 4, y + 15.5);
    doc.text(`• Radiación solar: ${Number(summary.rad ?? 0).toFixed(1)} kWh/m²/día`, col2X + 4, y + 20);
    doc.text(`• Viento a 10 m: ${Number(summary.viento ?? 0).toFixed(1)} m/s`, col2X + 4, y + 24.5);
  } else {
    doc.text('• Sin datos climáticos cargados (se usa respaldo etiquetado).', col2X + 4, y + 11);
  }

  const sourceLines = doc.splitTextToSize(`• Fuente: ${climateSource.detail}`, cardW - 8);
  doc.text(sourceLines.slice(0, 2), col2X + 4, y + (summary ? 29 : 16.5));

  y += Math.max(cardH, climateCardH) + 2;

  ensureSpace(14);
  doc.setFillColor(241, 245, 249);
  const regionalLines = doc.splitTextToSize(`Contexto regional: ${regionalContextText}`, contentWidth - 8);
  const regionalBoxH = 5 + regionalLines.length * 3.8;
  doc.roundedRect(margin, y, contentWidth, regionalBoxH, 2, 2, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(51, 65, 85);
  doc.text(regionalLines, margin + 4, y + 4.5);
  y += regionalBoxH + 2;

  ensureSpace(10);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  const localInputLine = 'Entradas locales (usuario): ubicación/parcela, suelo, cultivos, prioridades y rotación actual. La estimación satelital es regional, no verdad a nivel de parcela.';
  doc.text(doc.splitTextToSize(localInputLine, contentWidth), margin, y + 2.5);
  y += 7;

  // ─────────────────────────────────────────────────────────
  // SECCIÓN 2: PONDERACIÓN DE PRIORIDADES
  // ─────────────────────────────────────────────────────────
  ensureSpace(16);
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(margin, y, contentWidth, 11, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text('PONDERACIONES DEL PRODUCTOR (Nivel de Prioridad 1 a 5):', margin + 4, y + 4.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  const weightsText = [
    `Agua: ${priorities.agua ?? 4}/5`,
    `Salud del Suelo: ${priorities.suelo ?? 3}/5`,
    `Productividad: ${priorities.prod ?? 5}/5`,
    `Costo-Beneficio: ${priorities.costo ?? 3}/5`,
    `Riesgo Climático: ${priorities.riesgo ?? 4}/5`
  ].join('    |    ');
  doc.text(weightsText, margin + 4, y + 8.5);

  y += 15;

  // ─────────────────────────────────────────────────────────
  // SECCIÓN 3: RANKING DE ROTACIONES
  // ─────────────────────────────────────────────────────────
  drawSectionTitle('2. EVALUACIÓN Y RANKING DE ROTACIONES DE CULTIVO');

  if (!rankedRotations.length) {
    ensureSpace(12);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('No hay opciones de rotación cargadas para analizar.', margin, y + 5);
    y += 10;
  } else {
    rankedRotations.forEach((rotation, index) => {
      const isBest = rotation.rank === 0;
      const notes = Array.isArray(rotation.notas) ? rotation.notas : [];
      const resumen = rotation.resumen && typeof rotation.resumen === 'object' ? rotation.resumen : null;
      const summaryParts = resumen
        ? [resumen.mejora, resumen.costo, resumen.riesgo].filter(Boolean)
        : [];
      const summaryText = summaryParts.join(' ');
      const summaryLines = summaryText ? doc.splitTextToSize(summaryText, contentWidth - 14) : [];
      const noteLineCount = notes.reduce((count, note) => {
        const lines = doc.splitTextToSize(note.text || '', contentWidth - 20);
        return count + Math.max(1, lines.length);
      }, 0);
      const summaryBlockH = summaryLines.length ? 4 + summaryLines.length * 3.8 : 0;
      const cardHeight = 27 + summaryBlockH + noteLineCount * 4.8;

      ensureSpace(cardHeight + 4);

      // Contenedor de la rotación
      doc.setFillColor(isBest ? 255 : 255, 255, 255);
      doc.setDrawColor(isBest ? 16 : 203, isBest ? 185 : 213, isBest ? 129 : 225);
      doc.setLineWidth(isBest ? 0.6 : 0.3);
      doc.roundedRect(margin, y, contentWidth, cardHeight, 2, 2, 'FD');

      // Franja izquierda indicadora
      doc.setFillColor(isBest ? 16 : 148, isBest ? 185 : 163, isBest ? 129 : 184);
      doc.rect(margin, y, 2.5, cardHeight, 'F');

      // Encabezado de la rotación
      const headerY = y + 5.5;

      // Badge de estado
      if (isBest) {
        doc.setFillColor(209, 250, 229); // Light green pill
        doc.roundedRect(margin + 5, y + 2.5, 46, 5, 1, 1, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(6, 95, 70);
        doc.text('★ OPCIÓN RECOMENDADA', margin + 7, y + 6);
      } else {
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(margin + 5, y + 2.5, 34, 5, 1, 1, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(71, 85, 105);
        doc.text(`Alternativa #${index + 1}`, margin + 7, y + 6);
      }

      // Nombre y Secuencia
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(15, 23, 42);
      const originSuffix = rotation.origin === 'current' ? ' (rotación actual)' : '';
      doc.text(`${rotation.nombre || 'Rotación'}${originSuffix}`, margin + 5, y + 12);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(51, 65, 85);
      const seqText = rotation.sequenceText || (Array.isArray(rotation.sequence) ? rotation.sequence.join(' → ') : '');
      doc.text(`Secuencia propuesta: ${seqText}`, margin + 5, y + 16.5);

      // Score numérico y barra
      const scoreX = pageWidth - margin - 45;
      const scored = rotation.wscore !== null && rotation.wscore !== undefined;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      const scoreColor = !scored
        ? [100, 116, 139]
        : rotation.wscore >= 70
          ? [16, 185, 129]
          : rotation.wscore >= 50
            ? [217, 119, 6]
            : [220, 38, 38];
      doc.setTextColor(scoreColor[0], scoreColor[1], scoreColor[2]);
      doc.text(scored ? `${rotation.wscore}` : '—', scoreX + 22, y + 8, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(scored ? '/100 pts' : '', scoreX + 24, y + 8);

      // Barra gráfica de score
      doc.setFillColor(226, 232, 240);
      doc.roundedRect(scoreX, y + 11, 40, 3, 1, 1, 'F');
      const barFillW = scored ? Math.max(2, (rotation.wscore / 100) * 40) : 0;
      doc.setFillColor(scoreColor[0], scoreColor[1], scoreColor[2]);
      doc.roundedRect(scoreX, y + 11, barFillW, 3, 1, 1, 'F');

      // Fila de Criterios evaluados (Scores individuales)
      doc.setFillColor(248, 250, 252);
      doc.rect(margin + 4, y + 19, contentWidth - 8, 5.5, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(71, 85, 105);

      const criteriaValues = CRITERIA.map((c) => {
        const val = rotation.scores?.[c.key] ?? '-';
        return `${c.label}: ${val}/100`;
      }).join('     |     ');
      doc.text(criteriaValues, margin + 7, y + 23);

      // Resumen en lenguaje sencillo (derivado)
      let noteY = y + 28.5;
      if (summaryLines.length) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.4);
        doc.setTextColor(30, 41, 59);
        doc.text(summaryLines, margin + 6, noteY);
        noteY += summaryLines.length * 3.8 + 1.5;
      }

      // Notas / evidencias y riesgos derivados
      notes.forEach((note) => {
        const sym = noteSymbol(note.type);
        const col = noteColor(note.type);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(col[0], col[1], col[2]);
        doc.text(sym, margin + 6, noteY);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(51, 65, 85);
        const textLines = doc.splitTextToSize(note.text, contentWidth - 20);
        doc.text(textLines, margin + 11, noteY);
        noteY += 4.5 * textLines.length;
      });

      y += cardHeight + 4;
    });
  }

  // ─────────────────────────────────────────────────────────
  // SECCIÓN 4: CENTRO DE ALERTAS Y RECOMENDACIONES
  // ─────────────────────────────────────────────────────────
  if (alerts && alerts.length > 0) {
    drawSectionTitle('3. CENTRO DE ALERTAS Y RECOMENDACIONES TÉCNICAS');

    alerts.forEach((alert) => {
      const badge = alertBadge(alert.type);
      const alertBody = alert.text || alert.body || 'Sin descripción adicional.';
      const bodyLines = doc.splitTextToSize(alertBody, contentWidth - 14);
      const alertH = 13 + bodyLines.length * 4.2;

      ensureSpace(alertH + 3);

      // Fondo de alerta
      doc.setFillColor(badge.bg[0], badge.bg[1], badge.bg[2]);
      doc.setDrawColor(badge.color[0], badge.color[1], badge.color[2]);
      doc.setLineWidth(0.3);
      doc.roundedRect(margin, y, contentWidth, alertH, 1.5, 1.5, 'FD');

      // Línea vertical izquierda
      doc.setFillColor(badge.color[0], badge.color[1], badge.color[2]);
      doc.rect(margin, y, 2.5, alertH, 'F');

      // Tag de Alerta
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(badge.color[0], badge.color[1], badge.color[2]);
      doc.text(`[${badge.label}]  ${alert.title || 'Alerta Meteorológica'}`, margin + 6, y + 5);

      // Texto
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(30, 41, 59);
      doc.text(bodyLines, margin + 6, y + 9.5);

      y += alertH + 3;
    });
  }

  // ─────────────────────────────────────────────────────────
  // PIE DE PÁGINA INSTITUCIONAL EN TODAS LAS PÁGINAS
  // ─────────────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);

    const footerY = pageHeight - 11;
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(margin, footerY, pageWidth - margin, footerY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.4);
    doc.setTextColor(100, 116, 139);
    const footerText = doc.splitTextToSize(
      'AgroSmart · Apoyo a decisiones agrícolas · Fuentes: NASA POWER (punto mensual, AG, estimación regional ~50 km), sondeo/contexto regional NASA GPM IMERG cuando aplica, y entradas locales del usuario. Respaldo de demostración etiquetado sin conexión.',
      contentWidth - 28
    );
    doc.text(footerText, margin, footerY + 3.8);

    doc.text(
      `Página ${page} de ${totalPages}`,
      pageWidth - margin,
      footerY + 4,
      { align: 'right' }
    );

    doc.setFontSize(6);
    doc.setTextColor(148, 163, 184);
    doc.text(
      '* Documento automatizado con fines de apoyo agronómico y planificación. Las estimaciones satelitales no sustituyen el análisis presencial de suelos.',
      margin,
      footerY + 7.5
    );
  }

  return doc;
}

/**
 * Descarga el documento PDF en el navegador.
 */
export function downloadPdf(doc, filename) {
  if (!doc || typeof doc.save !== 'function') {
    throw new Error('Documento PDF no válido para descarga.');
  }
  const name = filename || `AgroSmart-Reporte-Rotaciones-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(name);
}
