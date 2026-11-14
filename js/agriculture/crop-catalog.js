export function renderCrops(container, crops, selectedIds) {
  container.innerHTML = crops
    .map(
      (crop) =>
        `<div class="crop-tag${selectedIds.includes(crop.id) ? ' selected' : ''}" data-crop-id="${crop.id}">${crop.icon} ${crop.name}</div>`
    )
    .join('');
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
