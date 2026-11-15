export function initMobileAccordions() {
  const toggles = Array.from(document.querySelectorAll('.col-collapsible .col-toggle'));
  if (!toggles.length) return;

  const isMobile = () => window.matchMedia('(max-width: 900px)').matches;

  const setCollapsed = (col, collapsed) => {
    if (!col) return;
    col.classList.toggle('is-collapsed', collapsed);
    const btn = col.querySelector('.col-toggle');
    if (btn) btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    const hint = col.querySelector('.col-toggle-hint');
    if (hint) hint.textContent = collapsed ? 'Toca para ver' : 'Toca para ocultar';
  };

  const sync = () => {
    document.querySelectorAll('.col-collapsible').forEach((col) => {
      if (isMobile()) {
        // Default collapsed on mobile to keep view compact
        if (!col.dataset.accordionReady) {
          setCollapsed(col, true);
          col.dataset.accordionReady = 'true';
        } else {
          // keep current state, but ensure body visibility matches (handled by class)
          const collapsed = col.classList.contains('is-collapsed');
          setCollapsed(col, collapsed);
        }
      } else {
        col.classList.remove('is-collapsed');
        const btn = col.querySelector('.col-toggle');
        if (btn) btn.setAttribute('aria-expanded', 'true');
      }
    });
  };

  toggles.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!isMobile()) return;
      const col = btn.closest('.col-collapsible');
      if (!col) return;
      const collapsed = col.classList.contains('is-collapsed');
      setCollapsed(col, !collapsed);
    });
  });

  const openLeft = () => {
    if (!isMobile()) return;
    const col = document.getElementById('col-left');
    setCollapsed(col, false);
    const panel = document.getElementById('parcel-filter-panel');
    if (panel) panel.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const locationBtn = document.getElementById('btn-toggle-filter');
  if (locationBtn) {
    locationBtn.addEventListener('click', (event) => {
      if (!isMobile()) return;
      event.preventDefault();
      openLeft();
    });
  }

  window.addEventListener('resize', sync);
  sync();
}
