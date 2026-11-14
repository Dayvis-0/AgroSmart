export function createClimateChart(canvasId) {
  let chart = null;

  function buildConfig(series) {
    return {
      data: {
        labels: series.labels,
        datasets: [
          {
            type: 'line',
            label: 'Temperatura (°C)',
            data: series.temp,
            borderColor: '#00d4ff',
            backgroundColor: 'rgba(0,212,255,0.08)',
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: '#00d4ff',
            tension: 0.4,
            fill: true,
            yAxisID: 'y'
          },
          {
            type: 'bar',
            label: 'Precipitación (mm)',
            data: series.prec,
            backgroundColor: 'rgba(0,255,136,0.25)',
            borderColor: '#00ff88',
            borderWidth: 1,
            borderRadius: 2,
            yAxisID: 'y2'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            labels: {
              color: '#94a3b8',
              font: { size: 10, family: 'JetBrains Mono' },
              boxWidth: 12,
              padding: 12
            }
          },
          tooltip: {
            backgroundColor: '#111827',
            borderColor: 'rgba(0,212,255,0.3)',
            borderWidth: 1,
            titleColor: '#e2e8f0',
            bodyColor: '#94a3b8',
            titleFont: { family: 'JetBrains Mono', size: 11 },
            bodyFont: { family: 'JetBrains Mono', size: 11 }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.03)' },
            ticks: { color: '#475569', font: { size: 10, family: 'JetBrains Mono' } }
          },
          y: {
            type: 'linear',
            position: 'left',
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#00d4ff', font: { size: 10, family: 'JetBrains Mono' } },
            title: { display: true, text: '°C', color: '#00d4ff', font: { size: 10 } }
          },
          y2: {
            type: 'linear',
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: { color: '#00ff88', font: { size: 10, family: 'JetBrains Mono' } },
            title: { display: true, text: 'mm', color: '#00ff88', font: { size: 10 } }
          }
        }
      }
    };
  }

  function update(series) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !series) return;
    if (chart) chart.destroy();
    chart = new Chart(canvas.getContext('2d'), buildConfig(series));
  }

  function destroy() {
    if (!chart) return;
    chart.destroy();
    chart = null;
  }

  return { update, destroy };
}
