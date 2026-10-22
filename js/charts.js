/**
 * charts.js — Ciclo de vida de las gráficas (Étoile 2.0).
 * Chart.js se retiró en 2.0.0-beta.3: todas las gráficas son ECharts (js/charts-echarts.js).
 * Charts.destroyAll() sigue siendo el punto de limpieza que llaman el Router y las vistas al cambiar de pantalla.
 */
const Charts = {
  destroyAll() {
    if (typeof ChartWrapper !== 'undefined') ChartWrapper.disposeAll();
  }
};
