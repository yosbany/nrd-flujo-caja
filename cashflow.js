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

// Get day name in Spanish
function getDayName(date) {
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return days[date.getDay()];
}

// Get month name in Spanish
function getMonthName(monthIndex) {
  const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  return months[monthIndex];
}

// Calculate and display breakdown for weekly view
function updateWeeklyBreakdown(transactionsToProcess, periodRange) {
  if (!periodRange) return;
  
  // Initialize breakdown by day (Monday to Sunday)
  const breakdown = {
    income: {},
    expenses: {},
    balance: {}
  };
  
  // Initialize all days of the week
  const weekStart = new Date(periodRange.start);
  const weekDay = (weekStart.getDay() + 6) % 7; // Convert to Monday=0, Sunday=6
  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);
    const dayKey = day.getTime();
    breakdown.income[dayKey] = 0;
    breakdown.expenses[dayKey] = 0;
    breakdown.balance[dayKey] = 0;
  }
  
  // Process transactions
  transactionsToProcess.forEach(({ id, ...transaction }) => {
    const transactionDate = transaction.date || transaction.createdAt;
    if (!transactionDate) return;
    
    const date = new Date(transactionDate);
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
    const dayKey = dayStart.getTime();
    
    const amount = parseFloat(transaction.amount || 0);
    
    if (transaction.type === 'income') {
      breakdown.income[dayKey] = (breakdown.income[dayKey] || 0) + amount;
    } else {
      breakdown.expenses[dayKey] = (breakdown.expenses[dayKey] || 0) + amount;
    }
  });
  
  // Calculate balance for each day
  Object.keys(breakdown.income).forEach(dayKey => {
    breakdown.balance[dayKey] = (breakdown.income[dayKey] || 0) - (breakdown.expenses[dayKey] || 0);
  });
  
  // Render breakdown
  renderBreakdown('income-breakdown', breakdown.income, periodRange, 'week', 'green');
  renderBreakdown('expenses-breakdown', breakdown.expenses, periodRange, 'week', 'red');
  renderBreakdown('balance-breakdown', breakdown.balance, periodRange, 'week', 'blue');
}

// Calculate and display breakdown for monthly view
function updateMonthlyBreakdown(transactionsToProcess, currentYear) {
  // Initialize breakdown by month (January to current month)
  const breakdown = {
    income: {},
    expenses: {},
    balance: {}
  };
  
  const now = new Date();
  const currentMonth = now.getMonth();
  
  // Initialize all months from January to current month
  for (let month = 0; month <= currentMonth; month++) {
    const monthKey = `${currentYear}-${String(month).padStart(2, '0')}`;
    breakdown.income[monthKey] = 0;
    breakdown.expenses[monthKey] = 0;
    breakdown.balance[monthKey] = 0;
  }
  
  // Process all transactions (not just filtered ones) to show year-to-date
  // We need to get all transactions for the year, not just the current month
  // But we'll use transactionsToProcess which should already be filtered to the current month
  // Actually, we need all transactions from the year, so we'll need to get them separately
  // For now, let's process what we have and show from January to current month
  
  // Process transactions - we need to get ALL transactions from the year, not just current month
  // This function will be called with transactionsToProcess which is filtered to current month
  // We need to fetch all transactions for the year instead
  transactionsToProcess.forEach(({ id, ...transaction }) => {
    const transactionDate = transaction.date || transaction.createdAt;
    if (!transactionDate) return;
    
    const date = new Date(transactionDate);
    const year = date.getFullYear();
    const month = date.getMonth();
    
    // Only process if it's the current year
    if (year === currentYear) {
      const monthKey = `${year}-${String(month).padStart(2, '0')}`;
      const amount = parseFloat(transaction.amount || 0);
      
      if (transaction.type === 'income') {
        breakdown.income[monthKey] = (breakdown.income[monthKey] || 0) + amount;
      } else {
        breakdown.expenses[monthKey] = (breakdown.expenses[monthKey] || 0) + amount;
      }
    }
  });
  
  // Calculate balance for each month
  Object.keys(breakdown.income).forEach(monthKey => {
    breakdown.balance[monthKey] = (breakdown.income[monthKey] || 0) - (breakdown.expenses[monthKey] || 0);
  });
  
  // Render breakdown
  renderBreakdown('income-breakdown', breakdown.income, null, 'month', 'green', currentYear);
  renderBreakdown('expenses-breakdown', breakdown.expenses, null, 'month', 'red', currentYear);
  renderBreakdown('balance-breakdown', breakdown.balance, null, 'month', 'blue', currentYear);
}

// Render breakdown in the UI
function renderBreakdown(containerId, breakdownData, periodRange, type, color, year = null) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  container.innerHTML = '';
  container.classList.remove('hidden');
  
  // Map color names to Tailwind classes
  const colorClasses = {
    'green': 'text-green-600',
    'red': 'text-red-600',
    'blue': 'text-blue-600'
  };
  const colorClass = colorClasses[color] || 'text-gray-600';
  
  if (type === 'week') {
    // Sort by day (Monday to Sunday)
    const weekStart = new Date(periodRange.start);
    const sortedDays = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + i);
      sortedDays.push(day);
    }
    
    sortedDays.forEach(day => {
      const dayKey = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0).getTime();
      const amount = breakdownData[dayKey] || 0;
      if (amount === 0) return; // Skip days with no transactions
      
      const dayName = getDayName(day);
      const dayNumber = day.getDate();
      const item = document.createElement('div');
      item.className = 'flex justify-between items-center text-xs border-t border-gray-300 pt-1';
      item.innerHTML = `
        <span class="text-gray-700">${dayName} ${dayNumber}</span>
        <span class="${colorClass} font-medium">$${formatNumber(amount)}</span>
      `;
      container.appendChild(item);
    });
  } else if (type === 'month') {
    // Sort by month (January to current month)
    const now = new Date();
    const currentMonth = now.getMonth();
    
    for (let month = 0; month <= currentMonth; month++) {
      const monthKey = `${year}-${String(month).padStart(2, '0')}`;
      const amount = breakdownData[monthKey] || 0;
      
      const monthName = getMonthName(month);
      const item = document.createElement('div');
      item.className = 'flex justify-between items-center text-xs border-t border-gray-300 pt-1';
      item.innerHTML = `
        <span class="text-gray-700">${monthName}</span>
        <span class="${colorClass} font-medium">$${formatNumber(amount)}</span>
      `;
      container.appendChild(item);
    }
    
    // Show container even if all amounts are 0, to show the month list
    if (container.children.length > 0) {
      container.classList.remove('hidden');
    }
  }
  
  // Hide container if no data
  if (container.children.length === 0) {
    container.classList.add('hidden');
  }
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

// Calculate account balance from transactions up to a given date
// If accounts object is provided, includes initial balance
async function calculateAccountBalance(accountId, allTransactions, upToDate = null, accounts = null) {
  // Get initial balance if accounts are provided
  let initialBalance = 0;
  if (accounts) {
    const account = accounts[accountId];
    if (account && account.initialBalance !== undefined) {
      initialBalance = parseFloat(account.initialBalance) || 0;
    }
  } else {
    // Load accounts if not provided
    const accountsSnapshot = await getAccountsRef().once('value');
    const accountsData = accountsSnapshot.val() || {};
    const account = accountsData[accountId];
    if (account && account.initialBalance !== undefined) {
      initialBalance = parseFloat(account.initialBalance) || 0;
    }
  }
  
  let balance = initialBalance;
  Object.values(allTransactions).forEach(transaction => {
    if (transaction && transaction.accountId === accountId) {
      // Si hay fecha límite, solo incluir transacciones hasta esa fecha
      if (upToDate) {
        const transactionDate = transaction.date || transaction.createdAt;
        if (transactionDate && transactionDate > upToDate.getTime()) {
          return; // Saltar esta transacción
        }
      }
      
      const amount = parseFloat(transaction.amount || 0);
      if (transaction.type === 'income') {
        balance += amount;
      } else {
        balance -= amount;
      }
    }
  });
  return balance;
}

// Get all historical periods of the same type
function getHistoricalPeriods(period, referenceDate, maxPeriods = 12) {
  const periods = [];
  const refDate = referenceDate || new Date();
  
  for (let i = 1; i <= maxPeriods; i++) {
    let periodDate = new Date(refDate);
    
    if (period === 'today') {
      periodDate.setDate(periodDate.getDate() - i);
    } else if (period === 'week') {
      // Calcular semana anterior: retroceder 7 días por cada semana
      const daysToSubtract = i * 7;
      periodDate.setDate(periodDate.getDate() - daysToSubtract);
    } else if (period === 'month') {
      periodDate.setMonth(periodDate.getMonth() - i);
    } else if (period === 'year') {
      periodDate.setFullYear(periodDate.getFullYear() - i);
    }
    
    const periodRange = getPeriodDateRange(period, periodDate);
    if (periodRange) {
      periods.push(periodRange);
    } else {
      // Si no hay más períodos disponibles, salir del loop
      break;
    }
  }
  
  return periods;
}

// Calculate estimated money needed per account based on historical data
async function calculateEstimatedMoneyNeeded(period, referenceDate, allTransactions) {
  // Para "Todos": no mostrar estimación (período muy amplio)
  if (period === 'all') {
    return null;
  }
  
  const accountsSnapshot = await getAccountsRef().once('value');
  const accounts = accountsSnapshot.val() || {};
  
  // Buscar solo la cuenta que contiene "Efectivo"
  const efectivoAccount = Object.entries(accounts)
    .find(([id, account]) => account.active !== false && 
          account.name && account.name.toUpperCase().includes('EFECTIVO'));
  
  if (!efectivoAccount) return null;
  
  const [efectivoAccountId, efectivoAccountData] = efectivoAccount;
  
  // 2. Obtener todos los períodos históricos del mismo tipo
  // Usar la fecha de referencia si está disponible, de lo contrario usar la fecha actual
  const refDate = referenceDate || new Date();
  
  // Obtener el rango del período seleccionado para calcular el balance hasta el final de ese período
  const currentPeriodRange = getPeriodDateRange(period, refDate);
  const upToDate = currentPeriodRange ? new Date(currentPeriodRange.end) : refDate;
  
  // 1. Obtener el balance de la cuenta hasta la fecha del período seleccionado (Caja Real Final)
  const cajaRealFinal = await calculateAccountBalance(efectivoAccountId, allTransactions, upToDate, accounts);
  
  const historicalPeriods = getHistoricalPeriods(period, refDate);
  
  if (historicalPeriods.length === 0) {
    return null;
  }
  
  // 3. Calcular descalces históricos (Egresos - Ingresos) para cada período
  const descalces = [];
  historicalPeriods.forEach(periodRange => {
    const expenses = calculateExpensesByAccount(allTransactions, periodRange, efectivoAccountId);
    const income = calculateIncomeByAccount(allTransactions, periodRange, efectivoAccountId);
    
    const totalExpenses = expenses[efectivoAccountId] || 0;
    const totalIncome = income[efectivoAccountId] || 0;
    const descalce = totalExpenses - totalIncome; // Egresos - Ingresos
    
    if (totalExpenses > 0 || totalIncome > 0) {
      descalces.push(descalce);
    }
  });
  
  if (descalces.length === 0) {
    return null;
  }
  
  // Calcular promedio de ingresos y egresos históricos para mostrar
  const historicalExpenses = {};
  const historicalIncome = {};
  let totalHistoricalExpenses = 0;
  let totalHistoricalIncome = 0;
  let periodsWithData = 0;
  
  historicalPeriods.forEach(periodRange => {
    const expenses = calculateExpensesByAccount(allTransactions, periodRange, efectivoAccountId);
    const income = calculateIncomeByAccount(allTransactions, periodRange, efectivoAccountId);
    
    const exp = expenses[efectivoAccountId] || 0;
    const inc = income[efectivoAccountId] || 0;
    
    if (exp > 0 || inc > 0) {
      totalHistoricalExpenses += exp;
      totalHistoricalIncome += inc;
      periodsWithData++;
    }
  });
  
  const avgExpenses = periodsWithData > 0 ? totalHistoricalExpenses / periodsWithData : 0;
  const avgIncome = periodsWithData > 0 ? totalHistoricalIncome / periodsWithData : 0;
  
  // 4. Determinar el peor descalce histórico (máximo, ya que descalce = egresos - ingresos)
  // El peor descalce es el más positivo (mayor déficit)
  // Si todos los descalces son negativos (siempre hubo superávit), usar 0
  const maxDescalce = Math.max(...descalces);
  const peorDescalce = maxDescalce < 0 ? 0 : maxDescalce;
  
  // 5. Calcular Egresos estimados con margen de seguridad del 10%
  const margenSeguridad = 0.10;
  const egresosEstimados = avgExpenses * (1 + margenSeguridad);
  
  // 6. Calcular el descalce del período: Egresos estimados - Ingresos estimados
  // Esto representa cuánto falta o sobra para el período basándose en promedios históricos
  const descalcePeriodo = egresosEstimados - avgIncome;
  
  // 7. Calcular el balance después de recibir ingresos y pagar egresos
  // Balance Final Proyectado = Balance Actual + Ingresos - Egresos estimados
  const balanceFinalProyectado = cajaRealFinal + avgIncome - egresosEstimados;
  
  // 8. Aplicar regla de decisión
  // Si el descalce del período es negativo (ingresos > egresos), no se necesita inyectar
  // Si el descalce es positivo (egresos > ingresos), se necesita inyectar esa diferencia
  // Pero también considerar si el balance final proyectado es suficiente
  let actionType = 'neutral';
  let actionAmount = 0;
  let actionText = '';
  
  if (descalcePeriodo > 0) {
    // Hay déficit: egresos estimados > ingresos estimados
    // Necesita efectivo: sacar de otra cuenta para poner en efectivo
    actionType = 'transfer';
    actionAmount = descalcePeriodo;
    actionText = 'Sacar efectivo de cuenta';
  } else if (descalcePeriodo < 0) {
    // Hay superávit: ingresos estimados > egresos estimados
    // Sobra efectivo: depositar el exceso a otra cuenta
    actionType = 'deposit';
    actionAmount = Math.abs(descalcePeriodo);
    actionText = 'Depositar efectivo a cuenta';
  } else {
    // Equilibrado
    actionType = 'neutral';
    actionAmount = 0;
    actionText = 'Mantener';
  }
  
  // DCH es el descalce del período para mantener consistencia
  const dch = descalcePeriodo;
  
  const periodNames = {
    'today': 'día',
    'week': 'semana',
    'month': 'mes',
    'year': 'año'
  };
  
  const periodDescription = `${periodsWithData} ${periodNames[period] || 'período'}${periodsWithData !== 1 ? 's' : ''} anterior${periodsWithData !== 1 ? 'es' : ''}`;
  
  return {
    accountId: efectivoAccountId,
    accountName: efectivoAccountData.name,
    expenses: avgExpenses,
    income: avgIncome,
    cajaRealFinal: cajaRealFinal,
    peorDescalce: peorDescalce,
    balanceProyectado: dch,
    dch: dch,
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
  
  // Mostrar indicador de carga
  container.classList.remove('hidden');
  container.innerHTML = `
    <h3 class="text-xs font-light text-gray-700 mb-2 uppercase tracking-wider">Disponibilidad en Efectivo Estimado</h3>
    <p class="text-[10px] sm:text-xs text-gray-500">Calculando...</p>
  `;
  
  const estimatedData = await calculateEstimatedMoneyNeeded(period, referenceDate, allTransactions);
  
  if (!estimatedData) {
    container.classList.add('hidden');
    return;
  }
  
  const periodText = estimatedData.periodDescription;
  
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
  
  container.innerHTML = `
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-xs font-light text-gray-700 uppercase tracking-wider">Disponibilidad en Efectivo Estimado</h3>
      <button id="help-calculacion-btn" class="text-gray-400 hover:text-gray-600 text-sm w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-200 transition-colors" title="Ver cómo se calculó">
        ?
      </button>
    </div>
    <p class="text-[10px] sm:text-xs text-gray-500 mb-3">Basado en: ${periodText}</p>
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      <div class="flex-1">
        <div class="text-[10px] sm:text-xs text-gray-500 space-y-0.5">
          <div>Egresos promedio: <span class="font-medium text-red-600">$${formatNumber(estimatedData.expenses)}</span></div>
          <div>Ingresos promedio: <span class="font-medium text-green-600">$${formatNumber(estimatedData.income)}</span></div>
        </div>
      </div>
      <div class="text-center sm:text-right ${actionBg} px-3 py-2 rounded">
        ${estimatedData.actionType !== 'neutral' ? `
        <div class="text-[10px] sm:text-xs text-gray-600 mb-1 uppercase tracking-wide">${estimatedData.actionText}</div>
        <div class="text-lg sm:text-xl font-bold ${actionColor}">
          ${actionIcon} $${formatNumber(estimatedData.actionAmount)}
        </div>
        ` : `
        <div class="text-xs sm:text-sm text-gray-500">Mantener</div>
        `}
      </div>
    </div>
  `;
  
  // Agregar event listener al botón de ayuda
  const helpBtn = container.querySelector('#help-calculacion-btn');
  if (helpBtn) {
    helpBtn.addEventListener('click', () => {
      showCalculationHelpModal(estimatedData);
    });
  }
}

// Show calculation help modal
function showCalculationHelpModal(data) {
  // Crear overlay del modal
  const overlay = document.createElement('div');
  overlay.id = 'calculation-help-modal-overlay';
  overlay.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
  
  const margenSeguridad = 0.10;
  const egresosConMargen = data.expenses * (1 + margenSeguridad);
  const descalceCalculado = egresosConMargen - data.income;
  
  const modalContent = `
    <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
      <!-- Header -->
      <div class="bg-gray-700 px-6 py-4">
        <div class="flex items-center justify-between">
          <h3 class="text-xl font-semibold text-white">Cálculo de Disponibilidad en Efectivo</h3>
          <button id="close-calculation-help-modal" class="text-white hover:text-gray-200 text-2xl font-light w-8 h-8 flex items-center justify-center hover:bg-white/20 rounded-full transition-colors">×</button>
        </div>
      </div>
      
      <!-- Content -->
      <div class="p-6 overflow-y-auto space-y-4">
        <div class="bg-gray-50 p-4 rounded border border-gray-200">
          <h4 class="text-sm font-semibold text-gray-700 mb-3">Información del Período</h4>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-600">Período analizado:</span>
              <span class="font-medium text-gray-800">${data.periodDescription}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">Cuenta:</span>
              <span class="font-medium text-gray-800">${escapeHtml(data.accountName)}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">Balance actual:</span>
              <span class="font-medium ${data.cajaRealFinal >= 0 ? 'text-green-600' : 'text-red-600'}">$${formatNumber(data.cajaRealFinal)}</span>
            </div>
          </div>
        </div>
        
        <div class="bg-gray-50 p-4 rounded border border-gray-200">
          <h4 class="text-sm font-semibold text-gray-700 mb-3">Promedios Históricos</h4>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-600">Ingresos promedio:</span>
              <span class="font-medium text-green-600">$${formatNumber(data.income)}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">Egresos promedio:</span>
              <span class="font-medium text-red-600">$${formatNumber(data.expenses)}</span>
            </div>
          </div>
        </div>
        
        <div class="bg-blue-50 p-4 rounded border border-blue-200">
          <h4 class="text-sm font-semibold text-blue-700 mb-3">Cálculo del Margen de Seguridad</h4>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-600">Egresos promedio:</span>
              <span class="font-medium">$${formatNumber(data.expenses)}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">Margen de seguridad:</span>
              <span class="font-medium">${(margenSeguridad * 100).toFixed(0)}%</span>
            </div>
            <div class="border-t border-blue-200 pt-2 mt-2">
              <div class="flex justify-between">
                <span class="text-gray-700 font-medium">Egresos estimados (con margen):</span>
                <span class="font-semibold text-red-600">$${formatNumber(egresosConMargen)}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div class="bg-yellow-50 p-4 rounded border border-yellow-200">
          <h4 class="text-sm font-semibold text-yellow-700 mb-3">Descalce del Período</h4>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-600">Egresos estimados:</span>
              <span class="font-medium text-red-600">$${formatNumber(egresosConMargen)}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">Ingresos estimados:</span>
              <span class="font-medium text-green-600">-$${formatNumber(data.income)}</span>
            </div>
            <div class="border-t border-yellow-200 pt-2 mt-2">
              <div class="flex justify-between">
                <span class="text-gray-700 font-semibold">Descalce del período:</span>
                <span class="font-bold ${descalceCalculado >= 0 ? 'text-red-600' : 'text-green-600'}">$${formatNumber(Math.abs(descalceCalculado))}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div class="bg-green-50 p-4 rounded border border-green-200">
          <h4 class="text-sm font-semibold text-green-700 mb-3">Resultado</h4>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between items-center">
              <span class="text-gray-700 font-medium">Acción recomendada:</span>
              <span class="px-3 py-1 rounded text-xs font-semibold uppercase ${
                data.actionType === 'transfer' ? 'bg-red-100 text-red-700' :
                data.actionType === 'deposit' ? 'bg-green-100 text-green-700' :
                'bg-gray-100 text-gray-700'
              }">
                ${data.actionText}
              </span>
            </div>
            ${data.actionType !== 'neutral' ? `
            <div class="flex justify-between items-center mt-2 pt-2 border-t border-green-200">
              <span class="text-gray-700 font-semibold">Monto:</span>
              <span class="text-lg font-bold ${data.actionType === 'transfer' ? 'text-red-600' : 'text-green-600'}">
                ${data.actionType === 'transfer' ? '↓' : '↑'} $${formatNumber(data.actionAmount)}
              </span>
            </div>
            ` : ''}
          </div>
        </div>
        
        <div class="bg-gray-50 p-3 rounded border border-gray-200 mt-4">
          <p class="text-xs text-gray-600">
            <strong>Nota:</strong> Este cálculo se basa en promedios históricos del mismo tipo de período. 
            El margen de seguridad del ${(margenSeguridad * 100).toFixed(0)}% se aplica a los egresos para considerar gastos extraordinarios.
          </p>
        </div>
      </div>
      
      <!-- Footer -->
      <div class="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end">
        <button id="close-calculation-help-modal-btn" class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium">
          Cerrar
        </button>
      </div>
    </div>
  `;
  
  overlay.innerHTML = modalContent;
  document.body.appendChild(overlay);
  
  // Event listeners para cerrar
  const closeModal = () => {
    document.body.removeChild(overlay);
  };
  
  overlay.querySelector('#close-calculation-help-modal').addEventListener('click', closeModal);
  overlay.querySelector('#close-calculation-help-modal-btn').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeModal();
    }
  });
}

// Calculate and render account subtotals
async function updateAccountSubtotals(transactionsToProcess, period = 'all', referenceDate = null) {
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
  
  // Always show sections (they show balance by account which is always relevant)
  const subtotalsSection = document.getElementById('account-subtotals-section');
  if (subtotalsSection) {
    subtotalsSection.classList.remove('hidden');
  }
  const balanceSection = document.getElementById('account-balance-section');
  if (balanceSection) {
    balanceSection.classList.remove('hidden');
  }
  
  // Helper function to sort accounts by name consistently
  const sortAccountsByName = (entries) => {
    return entries.sort((a, b) => {
      const accountA = accounts[a[0]];
      const accountB = accounts[b[0]];
      if (!accountA || !accountB) return 0;
      return accountA.name.localeCompare(accountB.name);
    });
  };
  
  // Render income subtotals
  // Show all active accounts, even if they have no income in the period (show 0)
  const incomeContainer = document.getElementById('account-income-subtotals');
  if (incomeContainer) {
    incomeContainer.innerHTML = '';
    
    const allAccountIncome = {};
    // Use all active accounts, not just those with transactions
    Object.entries(accounts).forEach(([accountId, account]) => {
      if (account?.active === false) return;
      allAccountIncome[accountId] = accountIncome[accountId] || 0;
    });
    
    if (Object.keys(allAccountIncome).length === 0) {
      incomeContainer.innerHTML = '<p class="text-xs text-gray-500">No hay cuentas activas</p>';
    } else {
      const sortedIncome = sortAccountsByName(Object.entries(allAccountIncome));
      
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
  // Show all active accounts, even if they have no expenses in the period (show 0)
  const expenseContainer = document.getElementById('account-expense-subtotals');
  if (expenseContainer) {
    expenseContainer.innerHTML = '';
    
    const allAccountExpenses = {};
    // Use all active accounts, not just those with transactions
    Object.entries(accounts).forEach(([accountId, account]) => {
      if (account?.active === false) return;
      allAccountExpenses[accountId] = accountExpenses[accountId] || 0;
    });
    
    if (Object.keys(allAccountExpenses).length === 0) {
      expenseContainer.innerHTML = '<p class="text-xs text-gray-500">No hay cuentas activas</p>';
    } else {
      const sortedExpenses = sortAccountsByName(Object.entries(allAccountExpenses));
      
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
  // Show all active accounts, even if they have no transactions in the period
  const balanceContainer = document.getElementById('account-balance-subtotals');
  if (balanceContainer) {
    balanceContainer.innerHTML = '';
    
    const accountBalances = {};
    // Use all active accounts, not just those with transactions
    Object.entries(accounts).forEach(([accountId, account]) => {
      if (account?.active === false) return;
      const income = accountIncome[accountId] || 0;
      const expenses = accountExpenses[accountId] || 0;
      accountBalances[accountId] = income - expenses;
    });
    
    if (Object.keys(accountBalances).length === 0) {
      balanceContainer.innerHTML = '<p class="text-xs text-gray-500">No hay cuentas activas</p>';
    } else {
      const sortedBalances = sortAccountsByName(Object.entries(accountBalances));
      
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
  
  // Render total balance (initial balance + transactions up to end of selected period)
  // Show all active accounts with their total accumulated balance up to the end of the period
  const totalBalanceContainer = document.getElementById('account-balance-totals');
  if (totalBalanceContainer) {
    totalBalanceContainer.innerHTML = '';
    
    // Get period date range to determine the end date
    const periodRange = getPeriodDateRange(period, referenceDate);
    let endDate = null;
    
    if (periodRange) {
      // Use the end of the period
      endDate = new Date(periodRange.end);
    } else if (period === 'all') {
      // For 'all', use null to include all transactions
      endDate = null;
    } else {
      // Default to current date if period is invalid
      endDate = new Date();
    }
    
    // Get all transactions to calculate total balance
    const allTransactionsSnapshot = await getTransactionsRef().once('value');
    const allTransactions = allTransactionsSnapshot.val() || {};
    
    // Calculate total balance per account (initial balance + transactions up to end date)
    const accountTotalBalances = {};
    Object.entries(accounts).forEach(([accountId, account]) => {
      if (account?.active === false) return;
      
      // Start with initial balance
      const initialBalance = parseFloat(account.initialBalance) || 0;
      let totalBalance = initialBalance;
      
      // Add transactions for this account up to the end date
      Object.values(allTransactions).forEach(transaction => {
        if (transaction && transaction.accountId === accountId) {
          // Filter by date if endDate is specified
          if (endDate) {
            const transactionDate = transaction.date || transaction.createdAt;
            if (transactionDate && transactionDate > endDate.getTime()) {
              return; // Skip transactions after the end date
            }
          }
          
          const amount = parseFloat(transaction.amount || 0);
          if (transaction.type === 'income') {
            totalBalance += amount;
          } else {
            totalBalance -= amount;
          }
        }
      });
      
      accountTotalBalances[accountId] = totalBalance;
    });
    
    if (Object.keys(accountTotalBalances).length === 0) {
      totalBalanceContainer.innerHTML = '<p class="text-xs text-gray-500">No hay cuentas activas</p>';
    } else {
      const sortedTotalBalances = sortAccountsByName(Object.entries(accountTotalBalances));
      
      sortedTotalBalances.forEach(([accountId, totalBalance]) => {
        const account = accounts[accountId];
        if (!account) return;
        
        const item = document.createElement('div');
        const balanceColor = totalBalance >= 0 ? 'text-purple-600' : 'text-red-600';
        item.className = 'flex justify-between items-center py-1 border-b border-purple-200 last:border-0';
        item.innerHTML = `
          <span class="text-xs text-gray-700 truncate flex-1 mr-2">${escapeHtml(account.name)}</span>
          <span class="text-xs sm:text-sm font-medium ${balanceColor} whitespace-nowrap">$${formatNumber(Math.abs(totalBalance))}</span>
        `;
        totalBalanceContainer.appendChild(item);
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
    await updateAccountSubtotals(transactionsToProcess, cashflowSelectedFilterPeriod, cashflowPeriodReferenceDate);

    // Calculate and render estimated money needed
    await renderEstimatedMoneyNeeded(cashflowSelectedFilterPeriod, cashflowPeriodReferenceDate, transactions);

    // Update Top 10 sections
    await updateTop10Sections(transactionsToProcess);

    // Update breakdowns for weekly and monthly views
    const incomeBreakdown = document.getElementById('income-breakdown');
    const expensesBreakdown = document.getElementById('expenses-breakdown');
    const balanceBreakdown = document.getElementById('balance-breakdown');
    
    // Hide breakdowns by default
    if (incomeBreakdown) incomeBreakdown.classList.add('hidden');
    if (expensesBreakdown) expensesBreakdown.classList.add('hidden');
    if (balanceBreakdown) balanceBreakdown.classList.add('hidden');
    
    if (cashflowSelectedFilterPeriod === 'week' && periodRange) {
      updateWeeklyBreakdown(transactionsToProcess, periodRange);
    } else if (cashflowSelectedFilterPeriod === 'month') {
      const currentYear = cashflowPeriodReferenceDate ? new Date(cashflowPeriodReferenceDate).getFullYear() : new Date().getFullYear();
      // For monthly view, we need all transactions from the year, not just the current month
      const yearStart = new Date(currentYear, 0, 1, 0, 0, 0, 0).getTime();
      const yearEnd = new Date(currentYear, 11, 31, 23, 59, 59, 999).getTime();
      const allYearTransactions = Object.entries(transactions).map(([id, transaction]) => ({
        id,
        ...transaction
      })).filter(({ id, ...transaction }) => {
        const transactionDate = transaction.date || transaction.createdAt;
        if (!transactionDate) return false;
        return transactionDate >= yearStart && transactionDate <= yearEnd;
      });
      updateMonthlyBreakdown(allYearTransactions, currentYear);
    }

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
  if (cashflowSelectedFilterPeriod === 'all') return;
  
  if (!cashflowPeriodReferenceDate) {
    cashflowPeriodReferenceDate = new Date();
  }
  
  const refDate = new Date(cashflowPeriodReferenceDate);
  if (cashflowSelectedFilterPeriod === 'today') {
    refDate.setDate(refDate.getDate() - 1);
  } else if (cashflowSelectedFilterPeriod === 'week') {
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
  if (cashflowSelectedFilterPeriod === 'all') return;
  
  if (!cashflowPeriodReferenceDate) {
    cashflowPeriodReferenceDate = new Date();
  }
  
  const refDate = new Date(cashflowPeriodReferenceDate);
  if (cashflowSelectedFilterPeriod === 'today') {
    refDate.setDate(refDate.getDate() + 1);
  } else if (cashflowSelectedFilterPeriod === 'week') {
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

// Check if period is current period
function isCurrentPeriod(period, referenceDate = null) {
  const today = new Date();
  const refDate = referenceDate || new Date();
  
  if (period === 'today') {
    return refDate.getDate() === today.getDate() &&
           refDate.getMonth() === today.getMonth() &&
           refDate.getFullYear() === today.getFullYear();
  }
  
  if (period === 'week') {
    // Check if reference date is in current week
    const weekRange = getPeriodDateRange('week', today);
    if (!weekRange) return false;
    return refDate.getTime() >= weekRange.start && refDate.getTime() <= weekRange.end;
  }
  
  if (period === 'month') {
    return refDate.getMonth() === today.getMonth() &&
           refDate.getFullYear() === today.getFullYear();
  }
  
  if (period === 'year') {
    return refDate.getFullYear() === today.getFullYear();
  }
  
  return false;
}

// Format period display text
function formatPeriodDisplay(period, referenceDate = null) {
  if (period === 'all') return 'Todos los períodos';
  
  const refDate = referenceDate || new Date();
  const isCurrent = isCurrentPeriod(period, refDate);
  
  if (period === 'today') {
    if (isCurrent) {
      return 'Hoy';
    } else {
      return `Día: ${formatDate24h(refDate)}`;
    }
  }
  
  const periodRange = getPeriodDateRange(period, refDate);
  
  if (!periodRange) return '';
  
  const startDate = new Date(periodRange.start);
  const endDate = new Date(periodRange.end);
  
  if (period === 'week') {
    const startStr = formatDate24h(startDate);
    const endStr = formatDate24h(endDate);
    if (isCurrent) {
      return `Semana Actual, ${startStr} - ${endStr}`;
    } else {
      return `Semana: ${startStr} - ${endStr}`;
    }
  } else if (period === 'month') {
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    if (isCurrent) {
      return `Mes Actual, ${monthNames[startDate.getMonth()]} ${startDate.getFullYear()}`;
    } else {
      return `Mes: ${monthNames[startDate.getMonth()]} ${startDate.getFullYear()}`;
    }
  } else if (period === 'year') {
    if (isCurrent) {
      return `Año Actual, ${startDate.getFullYear()}`;
    } else {
      return `Año: ${startDate.getFullYear()}`;
    }
  }
  
  return '';
}

// Update period display
function updatePeriodDisplay() {
  const periodDisplayEl = document.getElementById('cashflow-period-display');
  if (periodDisplayEl) {
    const displayText = formatPeriodDisplay(cashflowSelectedFilterPeriod, cashflowPeriodReferenceDate);
    const isCurrent = isCurrentPeriod(cashflowSelectedFilterPeriod, cashflowPeriodReferenceDate);
    
    periodDisplayEl.textContent = displayText;
    
    // Highlight current period
    if (isCurrent && cashflowSelectedFilterPeriod !== 'all' && cashflowSelectedFilterPeriod !== 'today') {
      periodDisplayEl.className = 'text-sm sm:text-base font-semibold text-red-600';
    } else {
      periodDisplayEl.className = 'text-sm sm:text-base font-light text-gray-700';
    }
    
    // Show/hide navigation arrows
    const prevBtn = document.getElementById('cashflow-period-prev-btn');
    const nextBtn = document.getElementById('cashflow-period-next-btn');
    
    const showArrows = cashflowSelectedFilterPeriod !== 'all';
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
