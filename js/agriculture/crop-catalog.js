import {
  SUITABILITY_LABELS,
  evaluateCropSuitability,
  sortSuitabilityResults
} from './crop-suitability.js';

const GROUPS = [
  { status: 'recommended', title: 'Recomendados para tu zona/altitud' },
  { status: 'possible', title: 'Posibles o sin datos suficientes' },
  { status: 'not_recommended', title: 'No recomendados para estas condiciones' }
];

function cropTagHtml(crop, selectedIds, suitability) {
  const selected = selectedIds.includes(crop.id) ? ' selected' : '';
  const status = suitability?.status || 'possible';
  const reason = suitability?.reason || '';
  const badge = SUITABILITY_LABELS[status] || SUITABILITY_LABELS.possible;
  return `<div class="crop-tag crop-tag--${status}${selected}" data-crop-id="${crop.id}" data-suitability="${status}" title="${reason.replace(/"/g, '&quot;')}">
    <div class="crop-tag-main">${crop.icon} ${crop.name}</div>
    <div class="crop-tag-badge">${badge}</div>
    <div class="crop-tag-reason">${reason}</div>
  </div>`;
}

function renderFlat(container, crops, selectedIds) {
  container.innerHTML = `<div class="crop-grid-items">${crops
    .map((crop) => cropTagHtml(crop, selectedIds, null))
    .join('')}</div>`;
}

/**
 * Renders crop options in Step 4. When a parcel context is provided, crops are
 * grouped by suitability (recommended/possible/not recommended) with reasons.
 * Backward compatible with renderCrops(container, crops, selectedIds).
 */
export function renderCrops(container, crops, selectedIdsOrOptions = [], parcelArg = null) {
  if (!container) return;

  let selectedIds = [];
  let parcel = parcelArg;
  if (Array.isArray(selectedIdsOrOptions)) {
    selectedIds = selectedIdsOrOptions;
  } else if (selectedIdsOrOptions && typeof selectedIdsOrOptions === 'object') {
    selectedIds = Array.isArray(selectedIdsOrOptions.selectedIds) ? selectedIdsOrOptions.selectedIds : [];
    if ('parcel' in selectedIdsOrOptions) parcel = selectedIdsOrOptions.parcel;
  }

  const list = Array.isArray(crops) ? crops : [];
  if (!parcel) {
    renderFlat(container, list, selectedIds);
    return;
  }

  const sorted = sortSuitabilityResults(evaluateCropSuitability(list, parcel));
  const byStatus = new Map(GROUPS.map((group) => [group.status, []]));
  for (const item of sorted) {
    const bucket = byStatus.get(item.status) || byStatus.get('possible');
    bucket.push(item);
  }

  container.innerHTML = GROUPS.map((group) => {
    const items = byStatus.get(group.status) || [];
    if (!items.length) return '';
    return `<section class="crop-suitability-group" data-suitability-group="${group.status}">
      <div class="crop-suitability-title">${group.title}</div>
      <div class="crop-grid-items">${items
        .map((item) => cropTagHtml(item.crop, selectedIds, item))
        .join('')}</div>
    </section>`;
  }).join('');
}

export function toggleCrop(id) {
  const tag = document.querySelector(`[data-crop-id="${id}"]`);
  if (!tag) return null;
  tag.classList.toggle('selected');
  return tag.classList.contains('selected');
}

export function getSelectedIds() {
  return [...document.querySelectorAll('#crop-grid .crop-tag.selected')].map((tag) => tag.dataset.cropId);
}
