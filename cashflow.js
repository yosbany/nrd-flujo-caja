// Cashflow management

let cashflowListener = null;
// Initialize with null to show all transactions by default
let cashflowSelectedFilterPeriod = 'all'; // 'today', 'week', 'month', 'year', 'all'

// Format date in 24-hour format
function formatDate24h(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

// Format number with comma for decimals and point for thousands
function formatNumber(number) {
  return number.toLocaleString('es-UY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// Get period date range
function getPeriodDateRange(period) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  
  switch(period) {
    case 'today':
      return {
        start: today.getTime(),
        end: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999).getTime()
      };
    case 'week':
      // Semana iniciando en lunes: 0 => lunes, 6 => domingo
      const weekStart = new Date(today);
      const weekDay = (today.getDay() + 6) % 7;
      weekStart.setDate(today.getDate() - weekDay);
      return {
        start: weekStart.getTime(),
        end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime()
      };
    case 'month':
      return {
        start: new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0).getTime(),
        end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime()
      };
    case 'year':
      return {
        start: new Date(today.getFullYear(), 0, 1, 0, 0, 0, 0).getTime(),
        end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime()
      };
    case 'all':
    default:
      return null; // No filter
  }
}

// Get previous period date range
function getPreviousPeriodDateRange(period) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  
  switch(period) {
    case 'today':
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return {
        start: yesterday.getTime(),
        end: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999).getTime()
      };
    case 'week':
      // Semana anterior iniciando en lunes
      const weekDayPrev = (today.getDay() + 6) % 7;
      const lastWeekStart = new Date(today);
      lastWeekStart.setDate(today.getDate() - weekDayPrev - 7);
      const lastWeekEnd = new Date(today);
      lastWeekEnd.setDate(today.getDate() - weekDayPrev - 1);
      return {
        start: lastWeekStart.getTime(),
        end: new Date(lastWeekEnd.getFullYear(), lastWeekEnd.getMonth(), lastWeekEnd.getDate(), 23, 59, 59, 999).getTime()
      };
    case 'month':
      const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1, 0, 0, 0, 0);
      const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);
      return {
        start: lastMonth.getTime(),
        end: lastMonthEnd.getTime()
      };
    case 'year':
      const lastYear = new Date(today.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
      const lastYearEnd = new Date(today.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
      return {
        start: lastYear.getTime(),
        end: lastYearEnd.getTime()
      };
    case 'all':
    default:
      return null;
  }
}

// Calculate variation percentage
function calculateVariation(current, previous) {
  if (!previous || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

// Format variation text
function formatVariation(variation) {
  if (variation === null || variation === undefined || isNaN(variation)) return '';
  const sign = variation >= 0 ? '+' : '';
  return `${sign}${variation.toFixed(1)}% vs período anterior`;
}

// Get TOP 3 expense categories
async function getTopExpenseCategories(transactionsToProcess) {
  // Get all categories
  const categoriesSnapshot = await getCategoriesRef().once('value');
  const categories = categoriesSnapshot.val() || {};
  
  // Calculate totals per category
  const categoryTotals = {};
  transactionsToProcess.forEach(transaction => {
    if (transaction.type === 'expense' && transaction.categoryId) {
      const categoryId = transaction.categoryId;
      if (!categoryTotals[categoryId]) {
        categoryTotals[categoryId] = {
          amount: 0,
          name: categories[categoryId]?.name || 'Sin categoría'
        };
      }
      categoryTotals[categoryId].amount += parseFloat(transaction.amount || 0);
    }
  });
  
  // Sort by amount and get TOP 3
  const sorted = Object.entries(categoryTotals)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);
  
  return sorted;
}

// Calculate expenses by category for drill-down
async function getExpensesByCategory(transactionsToProcess) {
  const categoriesSnapshot = await getCategoriesRef().once('value');
  const categories = categoriesSnapshot.val() || {};
  
  const categoryTotals = {};
  transactionsToProcess.forEach(transaction => {
    if (transaction.type === 'expense' && transaction.categoryId) {
      const categoryId = transaction.categoryId;
      if (!categoryTotals[categoryId]) {
        categoryTotals[categoryId] = {
          amount: 0,
          name: categories[categoryId]?.name || 'Sin categoría'
        };
      }
      categoryTotals[categoryId].amount += parseFloat(transaction.amount || 0);
    }
  });
  
  return Object.entries(categoryTotals)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.amount - a.amount);
}

// Load cashflow summary
function loadCashflow() {
  // Remove previous listener
  if (cashflowListener) {
    getTransactionsRef().off('value', cashflowListener);
    cashflowListener = null;
  }

  // Update filter buttons
  updatePeriodFilterButtons();

  // Listen for transactions
  cashflowListener = getTransactionsRef().on('value', async (snapshot) => {
    const transactions = snapshot.val() || {};
    
    // Get current period range
    const periodRange = getPeriodDateRange(cashflowSelectedFilterPeriod);
    let transactionsToProcess = Object.values(transactions);
    
    if (periodRange) {
      transactionsToProcess = transactionsToProcess.filter(transaction => {
        const transactionDate = transaction.date || transaction.createdAt;
        if (!transactionDate) return false;
        return transactionDate >= periodRange.start && transactionDate <= periodRange.end;
      });
    }

    // Calculate current totals
    let totalIncome = 0;
    let totalExpenses = 0;
    transactionsToProcess.forEach(transaction => {
      if (transaction.type === 'income') {
        totalIncome += parseFloat(transaction.amount || 0);
      } else {
        totalExpenses += parseFloat(transaction.amount || 0);
      }
    });

    const balance = totalIncome - totalExpenses;

    // Calculate previous period totals for variation
    let previousIncome = 0;
    let previousExpenses = 0;
    let previousBalance = 0;
    
    if (cashflowSelectedFilterPeriod !== 'all') {
      const previousRange = getPreviousPeriodDateRange(cashflowSelectedFilterPeriod);
      if (previousRange) {
        const previousTransactions = Object.values(transactions).filter(transaction => {
          const transactionDate = transaction.date || transaction.createdAt;
          if (!transactionDate) return false;
          return transactionDate >= previousRange.start && transactionDate <= previousRange.end;
        });
        
        previousTransactions.forEach(transaction => {
          if (transaction.type === 'income') {
            previousIncome += parseFloat(transaction.amount || 0);
          } else {
            previousExpenses += parseFloat(transaction.amount || 0);
          }
        });
        previousBalance = previousIncome - previousExpenses;
      }
    }

    // Calculate variations
    const incomeVariation = calculateVariation(totalIncome, previousIncome);
    const expensesVariation = calculateVariation(totalExpenses, previousExpenses);
    const balanceVariation = calculateVariation(balance, previousBalance);

    // Update summary cards
    document.getElementById('total-income').textContent = `$${formatNumber(totalIncome)}`;
    document.getElementById('total-expenses').textContent = `$${formatNumber(totalExpenses)}`;
    document.getElementById('total-balance').textContent = `$${formatNumber(balance)}`;

    // Update variation indicators
    const incomeVariationEl = document.getElementById('income-variation');
    if (incomeVariationEl) {
      const variationText = formatVariation(incomeVariation);
      incomeVariationEl.textContent = variationText;
      incomeVariationEl.className = 'text-xs mt-1 ' + (incomeVariation >= 0 ? 'text-green-600' : 'text-red-600');
    }

    const expensesVariationEl = document.getElementById('expenses-variation');
    if (expensesVariationEl) {
      const variationText = formatVariation(expensesVariation);
      expensesVariationEl.textContent = variationText;
      expensesVariationEl.className = 'text-xs mt-1 ' + (expensesVariation <= 0 ? 'text-green-600' : 'text-red-600');
    }

    const balanceVariationEl = document.getElementById('balance-variation');
    if (balanceVariationEl) {
      const variationText = formatVariation(balanceVariation);
      balanceVariationEl.textContent = variationText;
      balanceVariationEl.className = 'text-xs mt-1 ' + (balanceVariation >= 0 ? 'text-green-600' : 'text-red-600');
    }

    // Update balance percentage
    const balancePercentageEl = document.getElementById('balance-percentage');
    if (balancePercentageEl && totalIncome > 0) {
      const percentage = (balance / totalIncome) * 100;
      balancePercentageEl.textContent = `${percentage.toFixed(1)}% de los ingresos`;
    } else if (balancePercentageEl) {
      balancePercentageEl.textContent = '';
    }

    // Update balance color
    const balanceElement = document.getElementById('total-balance');
    if (balanceElement) {
      if (balance >= 0) {
        balanceElement.classList.remove('text-red-600');
        balanceElement.classList.add('text-blue-600');
      } else {
        balanceElement.classList.remove('text-blue-600');
        balanceElement.classList.add('text-red-600');
      }
    }

    // Calculate margin percentage
    const marginPercentage = totalIncome > 0 ? (balance / totalIncome) * 100 : 0;
    
    // Update margin badge
    const marginBadge = document.getElementById('margin-badge');
    if (marginBadge) {
      if (marginPercentage > 3) {
        marginBadge.textContent = 'Margen > 3%';
        marginBadge.className = 'absolute top-3 right-3 px-2 py-1 rounded text-xs font-semibold bg-green-500 text-white';
      } else if (marginPercentage >= 1) {
        marginBadge.textContent = 'Margen 1-3%';
        marginBadge.className = 'absolute top-3 right-3 px-2 py-1 rounded text-xs font-semibold bg-yellow-500 text-white';
      } else {
        marginBadge.textContent = 'Margen < 1%';
        marginBadge.className = 'absolute top-3 right-3 px-2 py-1 rounded text-xs font-semibold bg-red-500 text-white';
      }
    }

    // Update trend indicator (for YEAR and ALL)
    const balanceTrendEl = document.getElementById('balance-trend');
    if (balanceTrendEl) {
      if (cashflowSelectedFilterPeriod === 'year' || cashflowSelectedFilterPeriod === 'all') {
        if (balanceVariation !== null && !isNaN(balanceVariation)) {
          const trend = balanceVariation >= 0 ? '↑' : '↓';
          balanceTrendEl.textContent = `Tendencia: ${trend}`;
          balanceTrendEl.className = 'text-xs mt-1 ' + (balanceVariation >= 0 ? 'text-green-600' : 'text-red-600');
        } else {
          balanceTrendEl.textContent = '';
        }
      } else {
        balanceTrendEl.textContent = '';
      }
    }

    // Get TOP 3 expense categories
    const topCategories = await getTopExpenseCategories(transactionsToProcess);
    // Eliminado: desglose de porcentajes de categorías de egresos

    // Apply visual emphasis based on filter
    const balanceCard = document.querySelector('#cashflow-view .bg-blue-50');
    const expensesCard = document.getElementById('expenses-card');
    
    if (cashflowSelectedFilterPeriod === 'today') {
      // Emphasize balance for TODAY
      if (balanceCard) {
        balanceCard.classList.add('ring-2', 'ring-blue-400');
      }
      if (expensesCard) {
        expensesCard.classList.remove('ring-2', 'ring-red-400');
      }
    } else if (cashflowSelectedFilterPeriod === 'week' || cashflowSelectedFilterPeriod === 'month') {
      // Operational focus - remove emphasis
      if (balanceCard) {
        balanceCard.classList.remove('ring-2', 'ring-blue-400');
      }
      if (expensesCard) {
        expensesCard.classList.remove('ring-2', 'ring-red-400');
      }
    } else {
      // Remove emphasis for YEAR/ALL
      if (balanceCard) {
        balanceCard.classList.remove('ring-2', 'ring-blue-400');
      }
      if (expensesCard) {
        expensesCard.classList.remove('ring-2', 'ring-red-400');
      }
    }
  });
}

// Show expenses drill-down
async function showExpensesDrilldown() {
  const drilldown = document.getElementById('expenses-drilldown');
  const content = document.getElementById('expenses-drilldown-content');
  
  if (!drilldown || !content) return;
  
  // Get current period transactions
  const transactionsSnapshot = await getTransactionsRef().once('value');
  const transactions = transactionsSnapshot.val() || {};
  
  const periodRange = getPeriodDateRange(cashflowSelectedFilterPeriod);
  let transactionsToProcess = Object.values(transactions);
  
  if (periodRange) {
    transactionsToProcess = transactionsToProcess.filter(transaction => {
      const transactionDate = transaction.date || transaction.createdAt;
      if (!transactionDate) return false;
      return transactionDate >= periodRange.start && transactionDate <= periodRange.end;
    });
  }
  
  // Get expenses by category
  const expensesByCategory = await getExpensesByCategory(transactionsToProcess);
  
  // Calculate total expenses
  const totalExpenses = expensesByCategory.reduce((sum, cat) => sum + cat.amount, 0);
  
  // Render content
  content.innerHTML = '';
  
  if (expensesByCategory.length === 0) {
    content.innerHTML = '<p class="text-gray-600 text-sm">No hay egresos en este período</p>';
  } else {
    expensesByCategory.forEach(category => {
      const percentage = totalExpenses > 0 ? (category.amount / totalExpenses) * 100 : 0;
      const item = document.createElement('div');
      item.className = 'flex justify-between items-center py-2 border-b border-gray-200';
      item.innerHTML = `
        <span class="text-sm font-medium">${escapeHtml(category.name)}</span>
        <div class="text-right">
          <div class="text-sm font-light">$${formatNumber(category.amount)}</div>
          <div class="text-xs text-gray-500">${percentage.toFixed(1)}%</div>
        </div>
      `;
      content.appendChild(item);
    });
  }
  
  drilldown.classList.remove('hidden');
}

// Hide expenses drill-down
function hideExpensesDrilldown() {
  const drilldown = document.getElementById('expenses-drilldown');
  if (drilldown) {
    drilldown.classList.add('hidden');
  }
}

// Period filter handlers
function updatePeriodFilterButtons() {
  const buttons = {
    'today': document.getElementById('filter-today-btn'),
    'week': document.getElementById('filter-week-btn'),
    'month': document.getElementById('filter-month-btn'),
    'year': document.getElementById('filter-year-btn'),
    'all': document.getElementById('filter-all-btn')
  };
  
  Object.entries(buttons).forEach(([period, btn]) => {
    if (btn) {
      if (period === cashflowSelectedFilterPeriod) {
        btn.classList.add('bg-red-600', 'text-white', 'border-red-600');
        btn.classList.remove('text-gray-600', 'border-gray-300');
      } else {
        btn.classList.remove('bg-red-600', 'text-white', 'border-red-600');
        btn.classList.add('text-gray-600', 'border-gray-300');
      }
    }
  });
}

function setPeriodFilter(period) {
  cashflowSelectedFilterPeriod = period;
  loadCashflow();
}

// Initialize period filter on load
document.addEventListener('DOMContentLoaded', () => {
  // Setup event listeners after DOM is ready
  const todayBtn = document.getElementById('filter-today-btn');
  const weekBtn = document.getElementById('filter-week-btn');
  const monthBtn = document.getElementById('filter-month-btn');
  const yearBtn = document.getElementById('filter-year-btn');
  const allBtn = document.getElementById('filter-all-btn');
  
  if (todayBtn) todayBtn.addEventListener('click', () => setPeriodFilter('today'));
  if (weekBtn) weekBtn.addEventListener('click', () => setPeriodFilter('week'));
  if (monthBtn) monthBtn.addEventListener('click', () => setPeriodFilter('month'));
  if (yearBtn) yearBtn.addEventListener('click', () => setPeriodFilter('year'));
  if (allBtn) allBtn.addEventListener('click', () => setPeriodFilter('all'));
  
  updatePeriodFilterButtons();
});

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
