// Cashflow management

let cashflowListener = null;
// Initialize with null to show all transactions by default
let cashflowSelectedFilterPeriod = 'all'; // 'today', 'week', 'month', 'year', 'all'
// Reference date for period navigation (null means use current date)
let cashflowPeriodReferenceDate = null;

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
function getPeriodDateRange(period, referenceDate = null) {
  const refDate = referenceDate || new Date();
  const today = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate(), 0, 0, 0, 0);
  const now = referenceDate ? new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate(), 23, 59, 59, 999) : new Date();
  
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
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      return {
        start: weekStart.getTime(),
        end: new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate(), 23, 59, 59, 999).getTime()
      };
    case 'month':
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
      return {
        start: monthStart.getTime(),
        end: monthEnd.getTime()
      };
    case 'year':
      const yearStart = new Date(today.getFullYear(), 0, 1, 0, 0, 0, 0);
      const yearEnd = new Date(today.getFullYear(), 11, 31, 23, 59, 59, 999);
      return {
        start: yearStart.getTime(),
        end: yearEnd.getTime()
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
  transactionsToProcess.forEach(({ id, ...transaction }) => {
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

// Update Top 10 sections
async function updateTop10Sections(transactionsToProcess) {
  // Get categories for names
  const categoriesSnapshot = await getCategoriesRef().once('value');
  const categories = categoriesSnapshot.val() || {};
  
  // Top 10 Categorías (by total amount, income + expense)
  const categoryTotals = {};
  transactionsToProcess.forEach(({ id, ...transaction }) => {
    if (transaction.categoryId) {
      const categoryId = transaction.categoryId;
      if (!categoryTotals[categoryId]) {
        categoryTotals[categoryId] = {
          amount: 0,
          name: categories[categoryId]?.name || 'Sin categoría',
          type: categories[categoryId]?.type || 'expense'
        };
      }
      const amount = parseFloat(transaction.amount || 0);
      categoryTotals[categoryId].amount += amount;
    }
  });
  
  const topCategories = Object.entries(categoryTotals)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 10);
  
  // Top 10 Subcategorías (by total amount)
  const subcategoryTotals = {};
  transactionsToProcess.forEach(({ id, ...transaction }) => {
    if (transaction.description && transaction.description.trim()) {
      const desc = transaction.description.trim();
      if (!subcategoryTotals[desc]) {
        subcategoryTotals[desc] = {
          amount: 0,
          name: desc
        };
      }
      const amount = parseFloat(transaction.amount || 0);
      if (transaction.type === 'income') {
        subcategoryTotals[desc].amount += amount;
      } else {
        subcategoryTotals[desc].amount -= amount;
      }
    }
  });
  
  const topSubcategories = Object.entries(subcategoryTotals)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 10);
  
  // Top 10 Transacciones (by amount) - transactionsToProcess already has IDs
  const topTransactions = transactionsToProcess
    .map(({ id, ...transaction }) => ({
      id: id,
      description: transaction.description || 'Sin subcategoría',
      categoryName: transaction.categoryName || 'Sin categoría',
      accountName: transaction.accountName || 'Sin cuenta',
      amount: parseFloat(transaction.amount || 0),
      type: transaction.type,
      date: transaction.date || transaction.createdAt
    }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 10);
  
  // Render Top 10 Categorías
  renderTopCategories(topCategories);
  
  // Render Top 10 Subcategorías
  renderTopSubcategories(topSubcategories);
  
  // Render Top 10 Transacciones
  renderTopTransactions(topTransactions);
}

// Render Top 10 Categorías
function renderTopCategories(categories) {
  const container = document.getElementById('top-categories-list');
  if (!container) return;
  
  if (categories.length === 0) {
    container.innerHTML = '<p class="text-[10px] text-gray-500 text-center py-4">No hay categorías</p>';
    return;
  }
  
  container.innerHTML = '';
  categories.forEach((category, index) => {
    const item = document.createElement('div');
    item.className = 'flex justify-between items-center py-1 border-b border-gray-100';
    const isIncome = category.type === 'income';
    const amountColor = isIncome ? 'text-green-600' : 'text-red-600';
    const prefix = isIncome ? '+' : '-';
    
    item.innerHTML = `
      <div class="flex items-center gap-1.5 flex-1 min-w-0">
        <span class="text-[10px] text-gray-500 font-medium">${index + 1}.</span>
        <span class="text-[10px] font-light truncate">${escapeHtml(category.name)}</span>
      </div>
      <span class="text-[10px] font-medium ${amountColor} ml-2 whitespace-nowrap">${prefix}$${formatNumber(Math.abs(category.amount))}</span>
    `;
    container.appendChild(item);
  });
}

// Render Top 10 Subcategorías
function renderTopSubcategories(subcategories) {
  const container = document.getElementById('top-subcategories-list');
  if (!container) return;
  
  if (subcategories.length === 0) {
    container.innerHTML = '<p class="text-[10px] text-gray-500 text-center py-4">No hay subcategorías</p>';
    return;
  }
  
  container.innerHTML = '';
  subcategories.forEach((subcategory, index) => {
    const item = document.createElement('div');
    item.className = 'flex justify-between items-center py-1 border-b border-gray-100';
    const amountColor = subcategory.amount >= 0 ? 'text-green-600' : 'text-red-600';
    const prefix = subcategory.amount >= 0 ? '+' : '-';
    
    item.innerHTML = `
      <div class="flex items-center gap-1.5 flex-1 min-w-0">
        <span class="text-[10px] text-gray-500 font-medium">${index + 1}.</span>
        <span class="text-[10px] font-light truncate">${escapeHtml(subcategory.name)}</span>
      </div>
      <span class="text-[10px] font-medium ${amountColor} ml-2 whitespace-nowrap">${prefix}$${formatNumber(Math.abs(subcategory.amount))}</span>
    `;
    container.appendChild(item);
  });
}

// Render Top 10 Transacciones
function renderTopTransactions(transactions) {
  const container = document.getElementById('top-transactions-list');
  if (!container) return;
  
  if (transactions.length === 0) {
    container.innerHTML = '<p class="text-[10px] text-gray-500 text-center py-4">No hay transacciones</p>';
    return;
  }
  
  container.innerHTML = '';
  transactions.forEach((transaction, index) => {
    const item = document.createElement('div');
    item.className = 'flex justify-between items-start py-1 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors';
    if (transaction.id) {
      item.dataset.transactionId = transaction.id;
      item.addEventListener('click', () => {
        if (typeof switchView === 'function') {
          switchView('transactions');
          setTimeout(() => {
            if (typeof viewTransaction === 'function') {
              viewTransaction(transaction.id);
            }
          }, 300);
        }
      });
    }
    
    const isIncome = transaction.type === 'income';
    const amountColor = isIncome ? 'text-green-600' : 'text-red-600';
    const prefix = isIncome ? '+' : '-';
    const date = transaction.date ? new Date(transaction.date) : new Date(transaction.createdAt);
    
    item.innerHTML = `
      <div class="flex items-start gap-1.5 flex-1 min-w-0">
        <span class="text-[10px] text-gray-500 font-medium">${index + 1}.</span>
        <div class="flex-1 min-w-0">
          <div class="text-[10px] font-light truncate">${escapeHtml(transaction.description)}</div>
          <div class="text-[9px] text-gray-500 mt-0.5">${formatDate24h(date)}</div>
        </div>
      </div>
      <span class="text-[10px] font-medium ${amountColor} ml-2 whitespace-nowrap">${prefix}$${formatNumber(Math.abs(transaction.amount))}</span>
    `;
    container.appendChild(item);
  });
}

// Calculate expenses by category for drill-down
async function getExpensesByCategory(transactionsToProcess) {
  const categoriesSnapshot = await getCategoriesRef().once('value');
  const categories = categoriesSnapshot.val() || {};
  
  const categoryTotals = {};
  transactionsToProcess.forEach(({ id, ...transaction }) => {
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
  // Update period display
  updatePeriodDisplay();

  // Listen for transactions
  cashflowListener = getTransactionsRef().on('value', async (snapshot) => {
    const transactions = snapshot.val() || {};
    
    // Get current period range
    const periodRange = getPeriodDateRange(cashflowSelectedFilterPeriod, cashflowPeriodReferenceDate);
    let transactionsToProcess = Object.entries(transactions).map(([id, transaction]) => ({
      id,
      ...transaction
    }));
    
    if (periodRange) {
      transactionsToProcess = transactionsToProcess.filter(({ id, ...transaction }) => {
        const transactionDate = transaction.date || transaction.createdAt;
        if (!transactionDate) return false;
        return transactionDate >= periodRange.start && transactionDate <= periodRange.end;
      });
    }

    // Calculate current totals
    let totalIncome = 0;
    let totalExpenses = 0;
    transactionsToProcess.forEach(({ id, ...transaction }) => {
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
      // Calculate previous period using reference date
      const prevRefDate = cashflowPeriodReferenceDate ? new Date(cashflowPeriodReferenceDate) : new Date();
      if (cashflowSelectedFilterPeriod === 'week') {
        prevRefDate.setDate(prevRefDate.getDate() - 7);
      } else if (cashflowSelectedFilterPeriod === 'month') {
        prevRefDate.setMonth(prevRefDate.getMonth() - 1);
      } else if (cashflowSelectedFilterPeriod === 'year') {
        prevRefDate.setFullYear(prevRefDate.getFullYear() - 1);
      } else if (cashflowSelectedFilterPeriod === 'today') {
        prevRefDate.setDate(prevRefDate.getDate() - 1);
      }
      const previousRange = getPeriodDateRange(cashflowSelectedFilterPeriod, prevRefDate);
      if (previousRange) {
        const previousTransactions = Object.values(transactions).filter(transaction => {
          const transactionDate = transaction.date || transaction.createdAt;
          if (!transactionDate) return false;
          return transactionDate >= previousRange.start && transactionDate <= previousRange.end;
        });
        
        previousTransactions.forEach(({ id, ...transaction }) => {
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

    // Update expenses percentage of income
    const expensesPercentageEl = document.getElementById('expenses-percentage');
    if (expensesPercentageEl && totalIncome > 0) {
      const percentage = (totalExpenses / totalIncome) * 100;
      expensesPercentageEl.textContent = `${percentage.toFixed(1)}% de los ingresos`;
    } else if (expensesPercentageEl) {
      expensesPercentageEl.textContent = '';
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

    // Update Top 10 sections
    await updateTop10Sections(transactionsToProcess);

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
  let transactionsToProcess = Object.entries(transactions).map(([id, transaction]) => ({
    id,
    ...transaction
  }));
  
  if (periodRange) {
    transactionsToProcess = transactionsToProcess.filter(({ id, ...transaction }) => {
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
        btn.classList.add('bg-red-600', 'text-white', 'border-red-600', 'hover:bg-red-700', 'hover:text-white');
        btn.classList.remove('text-gray-600', 'border-gray-300', 'hover:text-red-600');
      } else {
        btn.classList.remove('bg-red-600', 'text-white', 'border-red-600', 'hover:bg-red-700', 'hover:text-white');
        btn.classList.add('text-gray-600', 'border-gray-300', 'hover:text-red-600');
      }
    }
  });
}

function setPeriodFilter(period) {
  cashflowSelectedFilterPeriod = period;
  // Reset reference date when changing period type
  cashflowPeriodReferenceDate = null;
  updatePeriodDisplay();
  loadCashflow();
}

// Navigate to previous period
function navigateToPreviousPeriod() {
  if (cashflowSelectedFilterPeriod === 'all' || cashflowSelectedFilterPeriod === 'today') return;
  
  if (!cashflowPeriodReferenceDate) {
    cashflowPeriodReferenceDate = new Date();
  }
  
  const refDate = new Date(cashflowPeriodReferenceDate);
  if (cashflowSelectedFilterPeriod === 'week') {
    refDate.setDate(refDate.getDate() - 7);
  } else if (cashflowSelectedFilterPeriod === 'month') {
    refDate.setMonth(refDate.getMonth() - 1);
  } else if (cashflowSelectedFilterPeriod === 'year') {
    refDate.setFullYear(refDate.getFullYear() - 1);
  }
  
  cashflowPeriodReferenceDate = refDate;
  updatePeriodDisplay();
  loadCashflow();
}

// Navigate to next period
function navigateToNextPeriod() {
  if (cashflowSelectedFilterPeriod === 'all' || cashflowSelectedFilterPeriod === 'today') return;
  
  if (!cashflowPeriodReferenceDate) {
    cashflowPeriodReferenceDate = new Date();
  }
  
  const refDate = new Date(cashflowPeriodReferenceDate);
  if (cashflowSelectedFilterPeriod === 'week') {
    refDate.setDate(refDate.getDate() + 7);
  } else if (cashflowSelectedFilterPeriod === 'month') {
    refDate.setMonth(refDate.getMonth() + 1);
  } else if (cashflowSelectedFilterPeriod === 'year') {
    refDate.setFullYear(refDate.getFullYear() + 1);
  }
  
  cashflowPeriodReferenceDate = refDate;
  updatePeriodDisplay();
  loadCashflow();
}

// Format period display text
function formatPeriodDisplay(period, referenceDate = null) {
  if (period === 'all') return 'Todos los períodos';
  if (period === 'today') return 'Hoy';
  
  const refDate = referenceDate || new Date();
  const periodRange = getPeriodDateRange(period, refDate);
  
  if (!periodRange) return '';
  
  const startDate = new Date(periodRange.start);
  const endDate = new Date(periodRange.end);
  
  if (period === 'week') {
    const startStr = formatDate24h(startDate);
    const endStr = formatDate24h(endDate);
    return `Semana: ${startStr} - ${endStr}`;
  } else if (period === 'month') {
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `Mes: ${monthNames[startDate.getMonth()]} ${startDate.getFullYear()}`;
  } else if (period === 'year') {
    return `Año: ${startDate.getFullYear()}`;
  }
  
  return '';
}

// Update period display
function updatePeriodDisplay() {
  const periodDisplayEl = document.getElementById('cashflow-period-display');
  if (periodDisplayEl) {
    const displayText = formatPeriodDisplay(cashflowSelectedFilterPeriod, cashflowPeriodReferenceDate);
    periodDisplayEl.textContent = displayText;
    
    // Show/hide navigation arrows
    const prevBtn = document.getElementById('cashflow-period-prev-btn');
    const nextBtn = document.getElementById('cashflow-period-next-btn');
    
    const showArrows = cashflowSelectedFilterPeriod !== 'all' && cashflowSelectedFilterPeriod !== 'today';
    if (prevBtn) {
      if (showArrows) {
        prevBtn.classList.remove('hidden');
      } else {
        prevBtn.classList.add('hidden');
      }
    }
    if (nextBtn) {
      if (showArrows) {
        nextBtn.classList.remove('hidden');
      } else {
        nextBtn.classList.add('hidden');
      }
    }
  }
}

// Initialize period filter on load
document.addEventListener('DOMContentLoaded', () => {
  // Setup event listeners after DOM is ready
  const todayBtn = document.getElementById('filter-today-btn');
  const weekBtn = document.getElementById('filter-week-btn');
  const monthBtn = document.getElementById('filter-month-btn');
  const yearBtn = document.getElementById('filter-year-btn');
  const allBtn = document.getElementById('filter-all-btn');
  const prevBtn = document.getElementById('cashflow-period-prev-btn');
  const nextBtn = document.getElementById('cashflow-period-next-btn');
  
  if (todayBtn) todayBtn.addEventListener('click', () => setPeriodFilter('today'));
  if (weekBtn) weekBtn.addEventListener('click', () => setPeriodFilter('week'));
  if (monthBtn) monthBtn.addEventListener('click', () => setPeriodFilter('month'));
  if (yearBtn) yearBtn.addEventListener('click', () => setPeriodFilter('year'));
  if (allBtn) allBtn.addEventListener('click', () => setPeriodFilter('all'));
  if (prevBtn) prevBtn.addEventListener('click', navigateToPreviousPeriod);
  if (nextBtn) nextBtn.addEventListener('click', navigateToNextPeriod);
  
  updatePeriodFilterButtons();
  updatePeriodDisplay();
});

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
