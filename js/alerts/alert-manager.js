export function renderAlerts(container, alerts) {
  container.innerHTML = alerts
    .map(
      (alert) => `
      <div class="alert alert-${alert.type}">
        <div class="alert-icon">${alert.icon}</div>
        <div class="alert-body">
          <strong>${alert.title}</strong>
          ${alert.text}
        </div>
      </div>`
    )
    .join('');
}
