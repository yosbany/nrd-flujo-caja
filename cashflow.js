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

// Calculate estimated money needed per account based on historical expenses
async function calculateEstimatedMoneyNeeded(period, referenceDate, allTransactions) {
  const accountsSnapshot = await getAccountsRef().once('value');
  const accounts = accountsSnapshot.val() || {};
  
  // Buscar solo la cuenta que contiene "Efectivo"
  const efectivoAccount = Object.entries(accounts)
    .find(([id, account]) => account.active !== false && 
          account.name && account.name.toUpperCase().includes('EFECTIVO'));
  
  if (!efectivoAccount) return null;
  
  const [efectivoAccountId, efectivoAccountData] = efectivoAccount;
  
  let historicalPeriod = null;
  let historicalExpenses = {};
  let historicalIncome = {};
  let periodDescription = '';
  
  // Lógica de fallback: buscar datos históricos según el período
  if (period === 'today') {
    // Para "Hoy": buscar semana pasada, mes pasado, año pasado
    const today = referenceDate || new Date();
    
    // Intentar semana pasada (promedio diario)
    const lastWeekRange = getPreviousPeriodDateRange('week');
    if (lastWeekRange) {
      const weekExpenses = calculateExpensesByAccount(allTransactions, lastWeekRange, efectivoAccountId);
      const weekIncome = calculateIncomeByAccount(allTransactions, lastWeekRange, efectivoAccountId);
      if (hasData(weekExpenses) || hasData(weekIncome)) {
        // Calcular promedio diario (dividir por 7 días)
        const expenses = weekExpenses[efectivoAccountId] || 0;
        const income = weekIncome[efectivoAccountId] || 0;
        historicalExpenses[efectivoAccountId] = expenses / 7;
        historicalIncome[efectivoAccountId] = income / 7;
        historicalPeriod = lastWeekRange;
        periodDescription = 'semana pasada (promedio diario)';
      }
    }
    
    // Si no hay datos, intentar mes pasado (mismo día)
    if (!hasData(historicalExpenses) && !hasData(historicalIncome)) {
      const lastMonth = new Date(today);
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      const monthRange = getPeriodDateRange('today', lastMonth);
      if (monthRange) {
        const monthExpenses = calculateExpensesByAccount(allTransactions, monthRange, efectivoAccountId);
        const monthIncome = calculateIncomeByAccount(allTransactions, monthRange, efectivoAccountId);
        if (hasData(monthExpenses) || hasData(monthIncome)) {
          historicalExpenses[efectivoAccountId] = monthExpenses[efectivoAccountId] || 0;
          historicalIncome[efectivoAccountId] = monthIncome[efectivoAccountId] || 0;
          historicalPeriod = monthRange;
          periodDescription = 'mes pasado (mismo día)';
        }
      }
    }
    
    // Si no hay datos, intentar año pasado (mismo día)
    if (!hasData(historicalExpenses) && !hasData(historicalIncome)) {
      const lastYear = new Date(today);
      lastYear.setFullYear(lastYear.getFullYear() - 1);
      const yearRange = getPeriodDateRange('today', lastYear);
      if (yearRange) {
        const yearExpenses = calculateExpensesByAccount(allTransactions, yearRange, efectivoAccountId);
        const yearIncome = calculateIncomeByAccount(allTransactions, yearRange, efectivoAccountId);
        if (hasData(yearExpenses) || hasData(yearIncome)) {
          historicalExpenses[efectivoAccountId] = yearExpenses[efectivoAccountId] || 0;
          historicalIncome[efectivoAccountId] = yearIncome[efectivoAccountId] || 0;
          historicalPeriod = yearRange;
          periodDescription = 'año pasado (mismo día)';
        }
      }
    }
    
    // Si no hay datos, usar promedio de todos los días anteriores
    if (!hasData(historicalExpenses) && !hasData(historicalIncome)) {
      const todayStart = new Date(today);
      todayStart.setHours(0, 0, 0, 0);
      const allPreviousExpenses = calculateExpensesByAccount(allTransactions, {
        start: 0,
        end: todayStart.getTime() - 1
      }, efectivoAccountId);
      const allPreviousIncome = calculateIncomeByAccount(allTransactions, {
        start: 0,
        end: todayStart.getTime() - 1
      }, efectivoAccountId);
      if (hasData(allPreviousExpenses) || hasData(allPreviousIncome)) {
        // Calcular promedio diario
        const daysCount = Math.max(1, Math.floor((todayStart.getTime()) / (24 * 60 * 60 * 1000)));
        historicalExpenses[efectivoAccountId] = (allPreviousExpenses[efectivoAccountId] || 0) / daysCount;
        historicalIncome[efectivoAccountId] = (allPreviousIncome[efectivoAccountId] || 0) / daysCount;
        periodDescription = 'promedio histórico diario';
      }
    }
  } else if (period === 'week') {
    // Para "Semana": buscar mes pasado, año pasado
    const refDate = referenceDate || new Date();
    
    // Intentar mes pasado (promedio semanal del mes pasado)
    const lastMonth = new Date(refDate);
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const monthRange = getPeriodDateRange('month', lastMonth);
    if (monthRange) {
      const monthExpenses = calculateExpensesByAccount(allTransactions, monthRange, efectivoAccountId);
      const monthIncome = calculateIncomeByAccount(allTransactions, monthRange, efectivoAccountId);
      if (hasData(monthExpenses) || hasData(monthIncome)) {
        // Calcular promedio semanal (dividir por ~4.33 semanas)
        const weeksInMonth = 4.33;
        historicalExpenses[efectivoAccountId] = (monthExpenses[efectivoAccountId] || 0) / weeksInMonth;
        historicalIncome[efectivoAccountId] = (monthIncome[efectivoAccountId] || 0) / weeksInMonth;
        historicalPeriod = monthRange;
        periodDescription = 'mes pasado (promedio semanal)';
      }
    }
    
    // Si no hay datos, intentar año pasado (misma semana)
    if (!hasData(historicalExpenses) && !hasData(historicalIncome)) {
      const lastYear = new Date(refDate);
      lastYear.setFullYear(lastYear.getFullYear() - 1);
      const weekRange = getPeriodDateRange('week', lastYear);
      if (weekRange) {
        const weekExpenses = calculateExpensesByAccount(allTransactions, weekRange, efectivoAccountId);
        const weekIncome = calculateIncomeByAccount(allTransactions, weekRange, efectivoAccountId);
        if (hasData(weekExpenses) || hasData(weekIncome)) {
          historicalExpenses[efectivoAccountId] = weekExpenses[efectivoAccountId] || 0;
          historicalIncome[efectivoAccountId] = weekIncome[efectivoAccountId] || 0;
          historicalPeriod = weekRange;
          periodDescription = 'año pasado (misma semana)';
        }
      }
    }
    
    // Si no hay datos, usar promedio de todas las semanas anteriores
    if (!hasData(historicalExpenses) && !hasData(historicalIncome)) {
      // Calcular todas las semanas anteriores y promediar
      const currentWeekStart = getPeriodDateRange('week', refDate);
      if (currentWeekStart) {
        const allPreviousExpenses = calculateExpensesByAccount(allTransactions, {
          start: 0,
          end: currentWeekStart.start - 1
        }, efectivoAccountId);
        const allPreviousIncome = calculateIncomeByAccount(allTransactions, {
          start: 0,
          end: currentWeekStart.start - 1
        }, efectivoAccountId);
        if (hasData(allPreviousExpenses) || hasData(allPreviousIncome)) {
          // Contar cuántas semanas hay de datos y promediar
          const weeksCount = Math.max(1, Math.floor((currentWeekStart.start) / (7 * 24 * 60 * 60 * 1000)));
          historicalExpenses[efectivoAccountId] = (allPreviousExpenses[efectivoAccountId] || 0) / weeksCount;
          historicalIncome[efectivoAccountId] = (allPreviousIncome[efectivoAccountId] || 0) / weeksCount;
          periodDescription = 'promedio histórico semanal';
        }
      }
    }
  } else if (period === 'month') {
    // Para "Mes": buscar año pasado (mismo mes)
    const refDate = referenceDate || new Date();
    
    // Intentar año pasado (mismo mes)
    const lastYear = new Date(refDate);
    lastYear.setFullYear(lastYear.getFullYear() - 1);
    const yearMonthRange = getPeriodDateRange('month', lastYear);
    if (yearMonthRange) {
      const yearExpenses = calculateExpensesByAccount(allTransactions, yearMonthRange, efectivoAccountId);
      const yearIncome = calculateIncomeByAccount(allTransactions, yearMonthRange, efectivoAccountId);
      if (hasData(yearExpenses) || hasData(yearIncome)) {
        historicalExpenses[efectivoAccountId] = yearExpenses[efectivoAccountId] || 0;
        historicalIncome[efectivoAccountId] = yearIncome[efectivoAccountId] || 0;
        historicalPeriod = yearMonthRange;
        periodDescription = 'año pasado (mismo mes)';
      }
    }
    
    // Si no hay datos, usar promedio de todos los meses anteriores del mismo año
    if (!hasData(historicalExpenses) && !hasData(historicalIncome)) {
      const currentYearStart = new Date(refDate.getFullYear(), 0, 1);
      const allPreviousExpenses = calculateExpensesByAccount(allTransactions, {
        start: currentYearStart.getTime(),
        end: refDate.getTime() - 1
      }, efectivoAccountId);
      const allPreviousIncome = calculateIncomeByAccount(allTransactions, {
        start: currentYearStart.getTime(),
        end: refDate.getTime() - 1
      }, efectivoAccountId);
      if (hasData(allPreviousExpenses) || hasData(allPreviousIncome)) {
        historicalExpenses[efectivoAccountId] = allPreviousExpenses[efectivoAccountId] || 0;
        historicalIncome[efectivoAccountId] = allPreviousIncome[efectivoAccountId] || 0;
        periodDescription = 'promedio del año';
      }
    }
    
    // Si no hay datos, usar promedio de todos los meses anteriores
    if (!hasData(historicalExpenses) && !hasData(historicalIncome)) {
      const allPreviousExpenses = calculateExpensesByAccount(allTransactions, {
        start: 0,
        end: refDate.getTime() - 1
      }, efectivoAccountId);
      const allPreviousIncome = calculateIncomeByAccount(allTransactions, {
        start: 0,
        end: refDate.getTime() - 1
      }, efectivoAccountId);
      if (hasData(allPreviousExpenses) || hasData(allPreviousIncome)) {
        historicalExpenses[efectivoAccountId] = allPreviousExpenses[efectivoAccountId] || 0;
        historicalIncome[efectivoAccountId] = allPreviousIncome[efectivoAccountId] || 0;
        periodDescription = 'promedio histórico';
      }
    }
  } else if (period === 'year') {
    // Para "Año": buscar año anterior
    const refDate = referenceDate || new Date();
    
    // Intentar año anterior
    const lastYear = new Date(refDate);
    lastYear.setFullYear(lastYear.getFullYear() - 1);
    const yearRange = getPeriodDateRange('year', lastYear);
    if (yearRange) {
      const yearExpenses = calculateExpensesByAccount(allTransactions, yearRange, efectivoAccountId);
      const yearIncome = calculateIncomeByAccount(allTransactions, yearRange, efectivoAccountId);
      if (hasData(yearExpenses) || hasData(yearIncome)) {
        historicalExpenses[efectivoAccountId] = yearExpenses[efectivoAccountId] || 0;
        historicalIncome[efectivoAccountId] = yearIncome[efectivoAccountId] || 0;
        historicalPeriod = yearRange;
        periodDescription = 'año pasado';
      }
    }
    
    // Si no hay datos, usar promedio de todos los años anteriores
    if (!hasData(historicalExpenses) && !hasData(historicalIncome)) {
      const allPreviousExpenses = calculateExpensesByAccount(allTransactions, {
        start: 0,
        end: refDate.getTime() - 1
      }, efectivoAccountId);
      const allPreviousIncome = calculateIncomeByAccount(allTransactions, {
        start: 0,
        end: refDate.getTime() - 1
      }, efectivoAccountId);
      if (hasData(allPreviousExpenses) || hasData(allPreviousIncome)) {
        historicalExpenses[efectivoAccountId] = allPreviousExpenses[efectivoAccountId] || 0;
        historicalIncome[efectivoAccountId] = allPreviousIncome[efectivoAccountId] || 0;
        periodDescription = 'promedio histórico';
      }
    }
  } else if (period === 'all') {
    // Para "Todos": no mostrar estimación (período muy amplio)
    return null;
  }
  
  // Si no hay datos históricos, retornar null
  if (!hasData(historicalExpenses) && !hasData(historicalIncome)) {
    return null;
  }
  
  // Calcular ingresos y egresos en efectivo
  const expenses = historicalExpenses[efectivoAccountId] || 0;
  const income = historicalIncome[efectivoAccountId] || 0;
  
  // Aplicar 10% adicional a los egresos para gastos extraordinarios
  const estimatedExpenses = expenses * 1.10;
  
  // Calcular balance (ingresos - egresos estimados)
  const balance = income - estimatedExpenses;
  
  // Determinar si hay que transferir o depositar
  let actionType = 'neutral';
  let actionAmount = 0;
  let actionText = '';
  
  if (balance < 0) {
    // Balance negativo: necesita transferir dinero a efectivo
    actionType = 'transfer';
    actionAmount = Math.abs(balance);
    actionText = 'Transferir';
  } else if (balance > 0) {
    // Balance positivo: puede depositar el excedente
    actionType = 'deposit';
    actionAmount = balance;
    actionText = 'Depositar';
  }
  
  return {
    accountId: efectivoAccountId,
    accountName: efectivoAccountData.name,
    expenses: expenses,
    estimatedExpenses: estimatedExpenses,
    income: income,
    balance: balance,
    actionType: actionType,
    actionAmount: actionAmount,
    actionText: actionText,
    periodDescription: periodDescription
  };
}

// Helper: Calculate expenses by account for a given date range
function calculateExpensesByAccount(transactions, dateRange, accountIdFilter = null) {
  const expenses = {};
  
  Object.values(transactions).forEach(transaction => {
    if (!transaction || transaction.type !== 'expense' || !transaction.accountId) return;
    
    // Filtrar por cuenta si se especifica
    if (accountIdFilter && transaction.accountId !== accountIdFilter) return;
    
    const transactionDate = transaction.date || transaction.createdAt;
    if (!transactionDate) return;
    
    // Si hay rango de fechas, filtrar
    if (dateRange) {
      if (transactionDate < dateRange.start || transactionDate > dateRange.end) {
        return;
      }
    }
    
    const accountId = transaction.accountId;
    if (!expenses[accountId]) {
      expenses[accountId] = 0;
    }
    expenses[accountId] += parseFloat(transaction.amount || 0);
  });
  
  return expenses;
}

// Helper: Calculate income by account for a given date range
function calculateIncomeByAccount(transactions, dateRange, accountIdFilter = null) {
  const income = {};
  
  Object.values(transactions).forEach(transaction => {
    if (!transaction || transaction.type !== 'income' || !transaction.accountId) return;
    
    // Filtrar por cuenta si se especifica
    if (accountIdFilter && transaction.accountId !== accountIdFilter) return;
    
    const transactionDate = transaction.date || transaction.createdAt;
    if (!transactionDate) return;
    
    // Si hay rango de fechas, filtrar
    if (dateRange) {
      if (transactionDate < dateRange.start || transactionDate > dateRange.end) {
        return;
      }
    }
    
    const accountId = transaction.accountId;
    if (!income[accountId]) {
      income[accountId] = 0;
    }
    income[accountId] += parseFloat(transaction.amount || 0);
  });
  
  return income;
}

// Helper: Check if expenses object has data
function hasData(expenses) {
  if (!expenses) return false;
  // Si es un objeto con una sola cuenta (efectivo), verificar si tiene valor
  if (typeof expenses === 'object' && expenses.constructor === Object) {
    return Object.keys(expenses).length > 0 && 
           Object.values(expenses).some(amount => amount > 0);
  }
  return false;
}

// Render estimated money needed section
async function renderEstimatedMoneyNeeded(period, referenceDate, allTransactions) {
  const container = document.getElementById('estimated-money-needed-section');
  if (!container) return;
  
  const estimatedData = await calculateEstimatedMoneyNeeded(period, referenceDate, allTransactions);
  
  if (!estimatedData) {
    container.classList.add('hidden');
    return;
  }
  
  container.classList.remove('hidden');
  
  const header = container.querySelector('#estimated-money-needed-header');
  const accountsContainer = container.querySelector('#estimated-money-needed-accounts');
  
  if (!header || !accountsContainer) return;
  
  const periodText = estimatedData.periodDescription;
  
  header.innerHTML = `
    <h3 class="text-xs sm:text-sm font-medium text-gray-700 mb-0.5">Disponibilidades Estimadas Por Cuentas</h3>
    <p class="text-[10px] sm:text-xs text-gray-500">Basado en: ${periodText}</p>
  `;
  
  accountsContainer.innerHTML = '';
  
  // Mostrar información de efectivo
  const card = document.createElement('div');
  card.className = 'border border-gray-200 p-2 sm:p-3 bg-white rounded';
  
  // Determinar color y texto según la acción
  let actionColor = 'text-gray-600';
  let actionIcon = '';
  let actionBg = 'bg-gray-50';
  if (estimatedData.actionType === 'transfer') {
    actionColor = 'text-red-600';
    actionIcon = '↓';
    actionBg = 'bg-red-50';
  } else if (estimatedData.actionType === 'deposit') {
    actionColor = 'text-green-600';
    actionIcon = '↑';
    actionBg = 'bg-green-50';
  }
  
  card.innerHTML = `
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      <div class="flex-1">
        <div class="text-xs sm:text-sm font-medium text-gray-700 mb-1.5">${escapeHtml(estimatedData.accountName)}</div>
        <div class="text-[10px] sm:text-xs text-gray-500 space-y-0.5">
          <div>Egresos estimados: <span class="font-medium text-red-600">$${formatNumber(estimatedData.estimatedExpenses)}</span></div>
          <div>Ingresos estimados: <span class="font-medium text-green-600">$${formatNumber(estimatedData.income)}</span></div>
        </div>
      </div>
      <div class="text-center sm:text-right ${actionBg} px-3 py-2 rounded">
        ${estimatedData.actionType !== 'neutral' ? `
        <div class="text-[10px] sm:text-xs text-gray-600 mb-1 uppercase tracking-wide">${estimatedData.actionText}</div>
        <div class="text-lg sm:text-xl font-bold ${actionColor}">
          ${actionIcon} $${formatNumber(estimatedData.actionAmount)}
        </div>
        ` : `
        <div class="text-xs sm:text-sm text-gray-500">Balance equilibrado</div>
        `}
      </div>
    </div>
  `;
  accountsContainer.appendChild(card);
}

// Calculate and render account subtotals
async function updateAccountSubtotals(transactionsToProcess) {
  // Get accounts
  const accountsSnapshot = await getAccountsRef().once('value');
  const accounts = accountsSnapshot.val() || {};
  
  // Calculate totals per account
  const accountIncome = {};
  const accountExpenses = {};
  
  transactionsToProcess.forEach(({ id, ...transaction }) => {
    if (!transaction.accountId) return;
    
    const accountId = transaction.accountId;
    const amount = parseFloat(transaction.amount || 0);
    
    if (transaction.type === 'income') {
      if (!accountIncome[accountId]) {
        accountIncome[accountId] = 0;
      }
      accountIncome[accountId] += amount;
    } else {
      if (!accountExpenses[accountId]) {
        accountExpenses[accountId] = 0;
      }
      accountExpenses[accountId] += amount;
    }
  });
  
  // Get all account IDs that have transactions
  const accountIds = new Set([
    ...Object.keys(accountIncome),
    ...Object.keys(accountExpenses)
  ]);
  
  // Show/hide section based on whether there are accounts with transactions
  const section = document.getElementById('account-subtotals-section');
  if (section) {
    if (accountIds.size === 0) {
      section.classList.add('hidden');
      return;
    }
    section.classList.remove('hidden');
  }
  
  // Render income subtotals
  const incomeContainer = document.getElementById('account-income-subtotals');
  if (incomeContainer) {
    incomeContainer.innerHTML = '';
    if (Object.keys(accountIncome).length === 0) {
      incomeContainer.innerHTML = '<p class="text-xs text-gray-500">No hay ingresos</p>';
    } else {
      const sortedIncome = Object.entries(accountIncome)
        .sort((a, b) => b[1] - a[1])
        .filter(([accountId]) => accounts[accountId]?.active !== false);
      
      sortedIncome.forEach(([accountId, amount]) => {
        const account = accounts[accountId];
        if (!account) return;
        
        const item = document.createElement('div');
        item.className = 'flex justify-between items-center py-1 border-b border-green-200 last:border-0';
        item.innerHTML = `
          <span class="text-xs text-gray-700 truncate flex-1 mr-2">${escapeHtml(account.name)}</span>
          <span class="text-xs sm:text-sm font-medium text-green-600 whitespace-nowrap">$${formatNumber(amount)}</span>
        `;
        incomeContainer.appendChild(item);
      });
    }
  }
  
  // Render expense subtotals
  const expenseContainer = document.getElementById('account-expense-subtotals');
  if (expenseContainer) {
    expenseContainer.innerHTML = '';
    if (Object.keys(accountExpenses).length === 0) {
      expenseContainer.innerHTML = '<p class="text-xs text-gray-500">No hay egresos</p>';
    } else {
      const sortedExpenses = Object.entries(accountExpenses)
        .sort((a, b) => b[1] - a[1])
        .filter(([accountId]) => accounts[accountId]?.active !== false);
      
      sortedExpenses.forEach(([accountId, amount]) => {
        const account = accounts[accountId];
        if (!account) return;
        
        const item = document.createElement('div');
        item.className = 'flex justify-between items-center py-1 border-b border-red-200 last:border-0';
        item.innerHTML = `
          <span class="text-xs text-gray-700 truncate flex-1 mr-2">${escapeHtml(account.name)}</span>
          <span class="text-xs sm:text-sm font-medium text-red-600 whitespace-nowrap">$${formatNumber(amount)}</span>
        `;
        expenseContainer.appendChild(item);
      });
    }
  }
  
  // Render balance subtotals (income - expenses)
  const balanceContainer = document.getElementById('account-balance-subtotals');
  if (balanceContainer) {
    balanceContainer.innerHTML = '';
    
    const accountBalances = {};
    accountIds.forEach(accountId => {
      if (accounts[accountId]?.active === false) return;
      const income = accountIncome[accountId] || 0;
      const expenses = accountExpenses[accountId] || 0;
      accountBalances[accountId] = income - expenses;
    });
    
    if (Object.keys(accountBalances).length === 0) {
      balanceContainer.innerHTML = '<p class="text-xs text-gray-500">No hay datos</p>';
    } else {
      const sortedBalances = Object.entries(accountBalances)
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
      
      sortedBalances.forEach(([accountId, balance]) => {
        const account = accounts[accountId];
        if (!account) return;
        
        const item = document.createElement('div');
        const balanceColor = balance >= 0 ? 'text-blue-600' : 'text-red-600';
        item.className = 'flex justify-between items-center py-1 border-b border-blue-200 last:border-0';
        item.innerHTML = `
          <span class="text-xs text-gray-700 truncate flex-1 mr-2">${escapeHtml(account.name)}</span>
          <span class="text-xs sm:text-sm font-medium ${balanceColor} whitespace-nowrap">$${formatNumber(Math.abs(balance))}</span>
        `;
        balanceContainer.appendChild(item);
      });
    }
  }
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

// Show transaction details modal
async function showTransactionDetailsModal(transactionId) {
  try {
    const transactionSnapshot = await getTransaction(transactionId);
    const transaction = transactionSnapshot.val();
    
    if (!transaction) {
      await showError('Transacción no encontrada');
      return;
    }
    
    const isIncome = transaction.type === 'income';
    const headerColor = isIncome ? 'bg-green-600' : 'bg-red-600';
    const amountColor = isIncome ? 'text-green-600' : 'text-red-600';
    const prefix = isIncome ? '+' : '-';
    const date = transaction.date ? new Date(transaction.date) : new Date(transaction.createdAt);
    
    // Crear contenido del modal
    const modalContent = `
      <div class="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden">
        <!-- Header -->
        <div class="${headerColor} px-6 py-4">
          <div class="flex items-center justify-between">
            <h3 class="text-xl font-semibold text-white">${isIncome ? 'Ingreso' : 'Egreso'}</h3>
            <button id="close-transaction-modal" class="text-white hover:text-gray-200 text-2xl font-light w-8 h-8 flex items-center justify-center hover:bg-white/20 rounded-full transition-colors">×</button>
          </div>
        </div>
        
        <!-- Content -->
        <div class="p-6 space-y-4">
          <div>
            <label class="text-xs uppercase tracking-wider text-gray-500">Subcategoría</label>
            <p class="text-base font-medium text-gray-800 mt-1">${escapeHtml(transaction.description || 'Sin subcategoría')}</p>
          </div>
          
          <div>
            <label class="text-xs uppercase tracking-wider text-gray-500">Monto</label>
            <p class="text-2xl font-semibold ${amountColor} mt-1">${prefix}$${formatNumber(Math.abs(parseFloat(transaction.amount || 0)))}</p>
          </div>
          
          <div>
            <label class="text-xs uppercase tracking-wider text-gray-500">Fecha</label>
            <p class="text-base text-gray-800 mt-1">${formatDate24h(date)}</p>
          </div>
          
          <div>
            <label class="text-xs uppercase tracking-wider text-gray-500">Categoría</label>
            <p class="text-base text-gray-800 mt-1">${escapeHtml(transaction.categoryName || 'Sin categoría')}</p>
          </div>
          
          <div>
            <label class="text-xs uppercase tracking-wider text-gray-500">Cuenta</label>
            <p class="text-base text-gray-800 mt-1">${escapeHtml(transaction.accountName || 'Sin cuenta')}</p>
          </div>
          
          ${transaction.notes ? `
          <div>
            <label class="text-xs uppercase tracking-wider text-gray-500">Notas</label>
            <p class="text-base text-gray-800 mt-1">${escapeHtml(transaction.notes)}</p>
          </div>
          ` : ''}
        </div>
        
        <!-- Footer -->
        <div class="px-6 py-4 border-t border-gray-200 bg-gray-50 flex gap-3">
          <button id="view-full-transaction-btn" class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
            Ver Completo
          </button>
          <button id="close-transaction-modal-btn" class="flex-1 px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-lg hover:border-gray-400 transition-colors text-sm font-medium">
            Cerrar
          </button>
        </div>
      </div>
    `;
    
    // Crear o actualizar el modal
    let modal = document.getElementById('transaction-details-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'transaction-details-modal';
      modal.className = 'fixed inset-0 bg-black/50 z-50 hidden flex items-center justify-center p-4';
      document.body.appendChild(modal);
    }
    
    modal.innerHTML = modalContent;
    modal.classList.remove('hidden');
    
    // Event listeners
    const closeModal = () => {
      modal.classList.add('hidden');
    };
    
    const viewFull = () => {
      closeModal();
      if (typeof switchView === 'function') {
        switchView('transactions');
        setTimeout(() => {
          if (typeof viewTransaction === 'function') {
            viewTransaction(transactionId);
          }
        }, 300);
      }
    };
    
    document.getElementById('close-transaction-modal').addEventListener('click', closeModal);
    document.getElementById('close-transaction-modal-btn').addEventListener('click', closeModal);
    document.getElementById('view-full-transaction-btn').addEventListener('click', viewFull);
    
    // Cerrar al hacer clic fuera del modal
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });
    
  } catch (error) {
    console.error('Error showing transaction modal:', error);
    await showError('Error al cargar los detalles de la transacción');
  }
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
        showTransactionDetailsModal(transaction.id);
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

    // Update account subtotals
    await updateAccountSubtotals(transactionsToProcess);

    // Calculate and render estimated money needed
    await renderEstimatedMoneyNeeded(cashflowSelectedFilterPeriod, cashflowPeriodReferenceDate, transactions);

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
