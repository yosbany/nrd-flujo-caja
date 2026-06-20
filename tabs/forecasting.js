// Forecasting view management

const logger = window.logger || console;

let forecastChartInstance = null;
let transactionsListener = null;
let accountsListener = null;
let currentTransactions = {};
let currentAccounts = {};

// Initialize forecasting view
export function initializeForecasting() {
  logger.debug('Initializing forecasting view');
  
  // Setup event handlers
  setupForecastingHandlers();
  
  // Load data
  loadForecastingData();
}

// Setup event handlers
function setupForecastingHandlers() {
  const calculateBtn = document.getElementById('calculate-forecast-btn');
  if (calculateBtn) {
    calculateBtn.addEventListener('click', async () => {
      await calculateAndRenderForecast();
    });
  }
}

// Load transactions and accounts data
function loadForecastingData() {
  const nrd = window.nrd;
  if (!nrd) {
    logger.error('NRD service not available');
    return;
  }

  // Clean up previous listeners
  if (transactionsListener) {
    transactionsListener();
    transactionsListener = null;
  }
  if (accountsListener) {
    accountsListener();
    accountsListener = null;
  }

  // Listen to transactions
  transactionsListener = nrd.transactions.onValue((transactions) => {
    currentTransactions = transactions.reduce((acc, tx) => {
      if (tx && tx.id) {
        acc[tx.id] = tx;
      }
      return acc;
    }, {});
    logger.debug('Transactions updated for forecasting', { count: Object.keys(currentTransactions).length });
  });

  // Listen to accounts
  accountsListener = nrd.accounts.onValue((accounts) => {
    currentAccounts = accounts.reduce((acc, account) => {
      if (account && account.id) {
        acc[account.id] = account;
      }
      return acc;
    }, {});
    logger.debug('Accounts updated for forecasting', { count: Object.keys(currentAccounts).length });
  });
}

// Calculate and render forecast
async function calculateAndRenderForecast() {
  showSpinner('Calculando proyección...');
  try {
    const monthsInput = document.getElementById('forecast-months-input');
    const monthsAhead = parseInt(monthsInput?.value || 3, 10);
    
    if (monthsAhead < 1 || monthsAhead > 12) {
      await window.NRDCommon?.showError?.('El número de meses debe estar entre 1 y 12');
      return;
    }

    // Convert transactions to array format
    const transactionsArray = Object.values(currentTransactions || {});
    
    if (transactionsArray.length === 0) {
      await window.NRDCommon?.showError?.('No hay suficientes transacciones para calcular proyecciones. Se necesitan al menos algunas transacciones históricas.');
      return;
    }

    // Calculate forecast
    const forecast = await window.calculateForecast(transactionsArray, monthsAhead);
    
    // Render forecast
    await renderForecast(forecast);
    
  } catch (error) {
    logger.error('Error calculating forecast', error);
    await window.NRDCommon?.showError?.(error.message || 'Error al calcular proyecciones');
  } finally {
    hideSpinner();
  }
}

// Render forecast results
async function renderForecast(forecast) {
  const formatCurrency = window.formatCurrency || ((val) => `$${val.toFixed(2)}`);
  const formatNumber = window.formatNumber || ((val) => val.toFixed(2));

  // Show summary
  const summarySection = document.getElementById('forecast-summary');
  if (summarySection) {
    summarySection.classList.remove('hidden');
    
    const realisticBalance = document.getElementById('forecast-realistic-balance');
    const optimisticBalance = document.getElementById('forecast-optimistic-balance');
    const pessimisticBalance = document.getElementById('forecast-pessimistic-balance');
    
    if (realisticBalance) {
      realisticBalance.textContent = formatCurrency(Math.round(forecast.forecasts[forecast.forecasts.length - 1]?.realistic?.balance || 0));
    }
    if (optimisticBalance) {
      optimisticBalance.textContent = formatCurrency(Math.round(forecast.forecasts[forecast.forecasts.length - 1]?.optimistic?.balance || 0));
    }
    if (pessimisticBalance) {
      pessimisticBalance.textContent = formatCurrency(Math.round(forecast.forecasts[forecast.forecasts.length - 1]?.pessimistic?.balance || 0));
    }
  }

  // Render chart
  renderForecastChart(forecast);

  // Render table
  renderForecastTable(forecast);
  
  // Render recommendations
  renderRecommendations(forecast);
}

// Render forecast chart
function renderForecastChart(forecast) {
  const chartContainer = document.getElementById('forecast-chart-container');
  const canvas = document.getElementById('forecast-chart');
  
  if (!chartContainer || !canvas) {
    logger.warn('Forecast chart elements not found');
    return;
  }

  chartContainer.classList.remove('hidden');

  // Destroy previous chart
  if (forecastChartInstance) {
    forecastChartInstance.destroy();
    forecastChartInstance = null;
  }

  const formatCurrency = window.formatCurrency || ((val) => `$${Math.round(val)}`);

  // Prepare data
  const labels = forecast.forecasts.map(f => f.month);
  const realisticBalances = forecast.forecasts.map(f => Math.round(f.realistic.balance));
  const optimisticBalances = forecast.forecasts.map(f => Math.round(f.optimistic.balance));
  const pessimisticBalances = forecast.forecasts.map(f => Math.round(f.pessimistic.balance));

  // Add current balance as first point
  labels.unshift('Actual');
  realisticBalances.unshift(Math.round(forecast.currentBalance));
  optimisticBalances.unshift(Math.round(forecast.currentBalance));
  pessimisticBalances.unshift(Math.round(forecast.currentBalance));

  const ctx = canvas.getContext('2d');
  forecastChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Realista',
          data: realisticBalances,
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.1)',
          tension: 0.4,
          fill: false
        },
        {
          label: 'Optimista',
          data: optimisticBalances,
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          tension: 0.4,
          fill: false
        },
        {
          label: 'Pesimista',
          data: pessimisticBalances,
          borderColor: 'rgb(239, 68, 68)',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          tension: 0.4,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
        },
        title: {
          display: true,
          text: 'Proyección de Balance por Escenario'
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: false,
          ticks: {
            callback: function(value) {
              return formatCurrency(value);
            }
          }
        }
      }
    }
  });
}

// Render forecast table
function renderForecastTable(forecast) {
  const tableContainer = document.getElementById('forecast-table-container');
  const tableBody = document.getElementById('forecast-table-body');
  
  if (!tableContainer || !tableBody) {
    logger.warn('Forecast table elements not found');
    return;
  }

  tableContainer.classList.remove('hidden');
  tableBody.innerHTML = '';

  const formatCurrency = window.formatCurrency || ((val) => `$${Math.round(val)}`);
  const formatNumber = window.formatNumber || ((val) => val.toFixed(2));

  forecast.forecasts.forEach((f, index) => {
    const row = document.createElement('tr');
    row.className = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';
    
    row.innerHTML = `
      <td class="py-2 px-2 font-medium text-gray-900">${f.month}</td>
      <td class="py-2 px-2 text-right text-gray-700">${formatCurrency(Math.round(f.realistic.income))}</td>
      <td class="py-2 px-2 text-right text-gray-700">${formatCurrency(Math.round(f.realistic.expenses))}</td>
      <td class="py-2 px-2 text-right ${f.realistic.netFlow >= 0 ? 'text-green-600' : 'text-red-600'} font-medium">${formatCurrency(Math.round(f.realistic.netFlow))}</td>
      <td class="py-2 px-2 text-right ${f.realistic.balance >= 0 ? 'text-blue-600' : 'text-red-600'} font-medium">${formatCurrency(Math.round(f.realistic.balance))}</td>
    `;
    
    tableBody.appendChild(row);
  });
}

// Generate recommendations based on forecast
function generateRecommendations(forecast) {
  const recommendations = [];
  const formatCurrency = window.formatCurrency || ((val) => `$${Math.round(val)}`);
  
  const lastForecast = forecast.forecasts[forecast.forecasts.length - 1];
  const realistic = lastForecast?.realistic;
  const pessimistic = lastForecast?.pessimistic;
  const optimistic = lastForecast?.optimistic;
  
  // Check for negative cash flow
  if (realistic && realistic.netFlow < 0) {
    const monthlyDeficit = Math.abs(realistic.netFlow);
    recommendations.push({
      priority: 'high',
      icon: '⚠️',
      title: 'Flujo de Caja Negativo',
      description: `El escenario realista proyecta un déficit mensual de ${formatCurrency(monthlyDeficit)}. Es crítico tomar medidas para equilibrar ingresos y gastos.`,
      actions: [
        'Revisar y reducir gastos operativos no esenciales',
        'Acelerar la cobranza de cuentas por cobrar',
        'Negociar mejores términos de pago con proveedores',
        'Considerar opciones de financiamiento a corto plazo'
      ]
    });
  }
  
  // Check for low balance
  const lowBalanceThreshold = 50000; // $50,000 threshold
  if (realistic && realistic.balance < lowBalanceThreshold) {
    recommendations.push({
      priority: 'high',
      icon: '💰',
      title: 'Saldo Bajo Proyectado',
      description: `El balance proyectado (${formatCurrency(realistic.balance)}) está por debajo del umbral recomendado. Esto puede limitar la capacidad operativa.`,
      actions: [
        'Construir una reserva de emergencia equivalente a 3-6 meses de gastos',
        'Revisar políticas de crédito y cobranza',
        'Optimizar el ciclo de conversión de efectivo',
        'Considerar líneas de crédito como respaldo'
      ]
    });
  }
  
  // Check expense vs income ratio
  if (realistic && realistic.income > 0) {
    const expenseRatio = (realistic.expenses / realistic.income) * 100;
    if (expenseRatio > 90) {
      recommendations.push({
        priority: 'medium',
        icon: '📊',
        title: 'Gastos Muy Altos en Relación a Ingresos',
        description: `Los gastos representan el ${expenseRatio.toFixed(1)}% de los ingresos, dejando poco margen para ahorro o imprevistos.`,
        actions: [
          'Identificar y eliminar gastos innecesarios o redundantes',
          'Negociar mejores precios con proveedores',
          'Implementar controles de presupuesto más estrictos',
          'Buscar formas de aumentar ingresos sin aumentar costos proporcionalmente'
        ]
      });
    }
  }
  
  // Check for declining trend
  if (forecast.forecasts.length >= 2) {
    const firstBalance = forecast.forecasts[0].realistic.balance;
    const lastBalance = forecast.forecasts[forecast.forecasts.length - 1].realistic.balance;
    if (lastBalance < firstBalance) {
      const decline = firstBalance - lastBalance;
      recommendations.push({
        priority: 'medium',
        icon: '📉',
        title: 'Tendencia Declinante',
        description: `Se proyecta una disminución de ${formatCurrency(decline)} en el balance durante el período proyectado.`,
        actions: [
          'Analizar las causas de la disminución del balance',
          'Implementar medidas correctivas inmediatas',
          'Revisar estrategias de crecimiento de ingresos',
          'Optimizar la gestión de inventario y activos'
        ]
      });
    }
  }
  
  // Check days of cash
  if (realistic && realistic.expenses > 0) {
    const dailyExpenses = realistic.expenses / 30;
    const daysOfCash = realistic.balance / dailyExpenses;
    if (daysOfCash < 30) {
      recommendations.push({
        priority: 'high',
        icon: '⏰',
        title: 'Días de Efectivo Limitados',
        description: `Con el flujo actual, el efectivo disponible duraría aproximadamente ${Math.round(daysOfCash)} días. Se recomienda mantener al menos 30-60 días.`,
        actions: [
          'Acelerar la entrada de efectivo (cobranza anticipada, descuentos por pronto pago)',
          'Diferir pagos no críticos cuando sea posible',
          'Mantener una línea de crédito disponible',
          'Diversificar fuentes de ingresos'
        ]
      });
    }
  }
  
  // Check savings rate
  if (realistic && realistic.income > 0) {
    const savingsRate = ((realistic.income - realistic.expenses) / realistic.income) * 100;
    if (savingsRate < 10) {
      recommendations.push({
        priority: 'medium',
        icon: '💵',
        title: 'Tasa de Ahorro Baja',
        description: `La tasa de ahorro proyectada es del ${savingsRate.toFixed(1)}%. Se recomienda mantener al menos un 10-20% para crecimiento sostenible.`,
        actions: [
          'Establecer un objetivo de ahorro mensual específico',
          'Automatizar transferencias a una cuenta de ahorro',
          'Revisar y optimizar gastos recurrentes',
          'Buscar oportunidades de aumentar ingresos'
        ]
      });
    }
  }
  
  // Check variance between scenarios
  if (optimistic && pessimistic) {
    const variance = optimistic.balance - pessimistic.balance;
    const variancePercent = realistic.income > 0 ? (variance / realistic.income) * 100 : 0;
    if (variancePercent > 50) {
      recommendations.push({
        priority: 'low',
        icon: '📈',
        title: 'Alta Variabilidad en Proyecciones',
        description: `Hay una diferencia significativa (${formatCurrency(variance)}) entre escenarios optimista y pesimista, indicando incertidumbre.`,
        actions: [
          'Desarrollar planes de contingencia para diferentes escenarios',
          'Mantener reservas adicionales para cubrir variaciones',
          'Monitorear indicadores clave regularmente',
          'Establecer alertas tempranas para cambios significativos'
        ]
      });
    }
  }
  
  // General positive recommendation if things look good
  if (realistic && realistic.netFlow > 0 && realistic.balance > lowBalanceThreshold) {
    recommendations.push({
      priority: 'low',
      icon: '✅',
      title: 'Flujo de Caja Saludable',
      description: `El flujo de caja proyectado es positivo y el balance se mantiene en niveles adecuados.`,
      actions: [
        'Mantener las prácticas actuales que están funcionando',
        'Considerar inversiones estratégicas para crecimiento',
        'Construir reservas adicionales para oportunidades futuras',
        'Revisar periódicamente las proyecciones para ajustar estrategias'
      ]
    });
  }
  
  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  
  return recommendations;
}

// Render recommendations
function renderRecommendations(forecast) {
  const container = document.getElementById('forecast-recommendations-container');
  const list = document.getElementById('forecast-recommendations-list');
  
  if (!container || !list) {
    logger.warn('Recommendations container not found');
    return;
  }
  
  const recommendations = generateRecommendations(forecast);
  
  if (recommendations.length === 0) {
    container.classList.add('hidden');
    return;
  }
  
  container.classList.remove('hidden');
  list.innerHTML = '';
  
  recommendations.forEach((rec, index) => {
    const priorityColors = {
      high: 'border-red-200 bg-red-50',
      medium: 'border-yellow-200 bg-yellow-50',
      low: 'border-blue-200 bg-blue-50'
    };
    
    const priorityLabels = {
      high: 'Alta',
      medium: 'Media',
      low: 'Baja'
    };
    
    const item = document.createElement('div');
    item.className = `border ${priorityColors[rec.priority]} p-4 rounded-lg`;
    
    item.innerHTML = `
      <div class="flex items-start gap-3 mb-2">
        <span class="text-2xl">${rec.icon}</span>
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1">
            <h4 class="font-medium text-gray-900">${escapeHtml(rec.title)}</h4>
            <span class="px-2 py-0.5 text-xs rounded ${rec.priority === 'high' ? 'bg-red-100 text-red-700' : rec.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}">
              ${priorityLabels[rec.priority]}
            </span>
          </div>
          <p class="text-sm text-gray-600 mb-3">${escapeHtml(rec.description)}</p>
          <div class="mt-3">
            <p class="text-xs font-medium text-gray-700 mb-2 uppercase tracking-wider">Acciones recomendadas:</p>
            <ul class="space-y-1.5">
              ${rec.actions.map(action => `
                <li class="text-sm text-gray-700 flex items-start gap-2">
                  <span class="text-red-600 mt-1">•</span>
                  <span>${escapeHtml(action)}</span>
                </li>
              `).join('')}
            </ul>
          </div>
        </div>
      </div>
    `;
    
    list.appendChild(item);
  });
}

// Helper function to escape HTML
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Make initializeForecasting available globally
window.initializeForecasting = initializeForecasting;

// Cleanup function
export function cleanupForecasting() {
  if (transactionsListener) {
    transactionsListener();
    transactionsListener = null;
  }
  if (accountsListener) {
    accountsListener();
    accountsListener = null;
  }
  if (forecastChartInstance) {
    forecastChartInstance.destroy();
    forecastChartInstance = null;
  }
}
