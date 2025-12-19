// Analysis management

// Format date in 24-hour format
function formatDate24h(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

// Format date for display
function formatDate(date) {
  return date.toLocaleDateString('es-ES', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric' 
  });
}

// Load analysis view
function loadAnalysis() {
  // Set default dates (last 30 days)
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  
  const startInput = document.getElementById('analysis-date-start');
  const endInput = document.getElementById('analysis-date-end');
  
  if (startInput) {
    const year = startDate.getFullYear();
    const month = String(startDate.getMonth() + 1).padStart(2, '0');
    const day = String(startDate.getDate()).padStart(2, '0');
    startInput.value = `${year}-${month}-${day}`;
  }
  
  if (endInput) {
    const year = endDate.getFullYear();
    const month = String(endDate.getMonth() + 1).padStart(2, '0');
    const day = String(endDate.getDate()).padStart(2, '0');
    endInput.value = `${year}-${month}-${day}`;
  }
  
  // Clear results
  const resultsContainer = document.getElementById('analysis-results');
  if (resultsContainer) {
    resultsContainer.innerHTML = '';
  }
}

// Show/hide period selection based on analysis type
function updateAnalysisType() {
  const analysisType = document.getElementById('analysis-type').value;
  const periodSelection = document.getElementById('period-selection');
  
  if (analysisType === 'period' && periodSelection) {
    periodSelection.classList.remove('hidden');
  } else if (periodSelection) {
    periodSelection.classList.add('hidden');
  }
}

// Generate analysis
async function generateAnalysis() {
  const analysisType = document.getElementById('analysis-type').value;
  const startDateInput = document.getElementById('analysis-date-start').value;
  const endDateInput = document.getElementById('analysis-date-end').value;
  const resultsContainer = document.getElementById('analysis-results');
  
  if (!startDateInput || !endDateInput) {
    await showError('Por favor seleccione las fechas de inicio y fin');
    return;
  }
  
  if (!resultsContainer) {
    await showError('Error: contenedor de resultados no encontrado');
    return;
  }
  
  showSpinner('Generando análisis...');
  try {
    // Parse dates
    const startDate = new Date(startDateInput);
    const endDate = new Date(endDateInput);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
    
    if (startDate > endDate) {
      hideSpinner();
      await showError('La fecha de inicio debe ser anterior a la fecha de fin');
      return;
    }
    
    // Get all transactions
    const snapshot = await getTransactionsRef().once('value');
    const transactions = snapshot.val() || {};
    
    // Filter transactions by date range
    const filteredTransactions = Object.values(transactions).filter(transaction => {
      const transactionDate = transaction.date || transaction.createdAt;
      if (!transactionDate) return false;
      return transactionDate >= startDate.getTime() && transactionDate <= endDate.getTime();
    });
    
    if (filteredTransactions.length === 0) {
      hideSpinner();
      resultsContainer.innerHTML = '<p class="text-center text-gray-600 py-6 sm:py-8 text-sm sm:text-base">No hay transacciones en el período seleccionado</p>';
      return;
    }
    
    let analysisHtml = '';
    
    if (analysisType === 'category') {
      analysisHtml = generateCategoryAnalysis(filteredTransactions);
    } else if (analysisType === 'account') {
      analysisHtml = generateAccountAnalysis(filteredTransactions);
    } else if (analysisType === 'period') {
      const periodType = document.getElementById('period-type').value;
      analysisHtml = await generatePeriodAnalysis(filteredTransactions, periodType, startDate, endDate);
    }
    
    hideSpinner();
    resultsContainer.innerHTML = analysisHtml;
  } catch (error) {
    hideSpinner();
    console.error('Error generating analysis:', error);
    await showError('Error al generar análisis: ' + error.message);
  }
}

// Generate analysis by category
function generateCategoryAnalysis(transactions) {
  const categoryData = {};
  let totalIncome = 0;
  let totalExpenses = 0;
  
  transactions.forEach(transaction => {
    const categoryName = transaction.categoryName || 'Sin categoría';
    if (!categoryData[categoryName]) {
      categoryData[categoryName] = { income: 0, expense: 0 };
    }
    
    if (transaction.type === 'income') {
      const amount = parseFloat(transaction.amount || 0);
      categoryData[categoryName].income += amount;
      totalIncome += amount;
    } else {
      const amount = parseFloat(transaction.amount || 0);
      categoryData[categoryName].expense += amount;
      totalExpenses += amount;
    }
  });
  
  const balance = totalIncome - totalExpenses;
  
  let html = `
    <div class="border border-gray-200 p-4 sm:p-6 mb-4 sm:mb-6">
      <h3 class="text-lg sm:text-xl font-light mb-4 sm:mb-6">Resumen General</h3>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div class="bg-green-50 p-3 sm:p-4">
          <div class="text-xs sm:text-sm uppercase tracking-wider text-gray-600 mb-1">Ingresos</div>
          <div class="text-xl sm:text-2xl font-light text-green-600">$${totalIncome.toFixed(2)}</div>
        </div>
        <div class="bg-red-50 p-3 sm:p-4">
          <div class="text-xs sm:text-sm uppercase tracking-wider text-gray-600 mb-1">Egresos</div>
          <div class="text-xl sm:text-2xl font-light text-red-600">$${totalExpenses.toFixed(2)}</div>
        </div>
        <div class="bg-blue-50 p-3 sm:p-4">
          <div class="text-xs sm:text-sm uppercase tracking-wider text-gray-600 mb-1">Balance</div>
          <div class="text-xl sm:text-2xl font-light ${balance >= 0 ? 'text-blue-600' : 'text-red-600'}">$${balance.toFixed(2)}</div>
        </div>
      </div>
    </div>
    
    <div class="border border-gray-200 p-4 sm:p-6">
      <h3 class="text-lg sm:text-xl font-light mb-4 sm:mb-6">Análisis por Categoría</h3>
      <div class="space-y-3 sm:space-y-4">
  `;
  
  const sortedCategories = Object.entries(categoryData).sort((a, b) => {
    const totalA = a[1].income + a[1].expense;
    const totalB = b[1].income + b[1].expense;
    return totalB - totalA;
  });
  
  sortedCategories.forEach(([categoryName, data]) => {
    const categoryTotal = data.income + data.expense;
    const incomePercent = totalIncome > 0 ? (data.income / totalIncome * 100).toFixed(1) : 0;
    const expensePercent = totalExpenses > 0 ? (data.expense / totalExpenses * 100).toFixed(1) : 0;
    
    html += `
      <div class="border border-gray-200 p-3 sm:p-4">
        <div class="flex justify-between items-center mb-2">
          <div class="text-base sm:text-lg font-light">${escapeHtml(categoryName)}</div>
          <div class="text-base sm:text-lg font-light font-medium">$${categoryTotal.toFixed(2)}</div>
        </div>
        ${data.income > 0 ? `
        <div class="text-xs sm:text-sm text-gray-600 mb-1">
          Ingresos: $${data.income.toFixed(2)} (${incomePercent}%)
        </div>
        ` : ''}
        ${data.expense > 0 ? `
        <div class="text-xs sm:text-sm text-gray-600">
          Egresos: $${data.expense.toFixed(2)} (${expensePercent}%)
        </div>
        ` : ''}
      </div>
    `;
  });
  
  html += `
      </div>
    </div>
  `;
  
  return html;
}

// Generate analysis by account
async function generateAccountAnalysis(transactions) {
  // Get all accounts
  const accountsSnapshot = await getAccountsRef().once('value');
  const accounts = accountsSnapshot.val() || {};
  const accountMap = {};
  Object.entries(accounts).forEach(([id, account]) => {
    accountMap[id] = account.name;
  });
  
  const accountData = {};
  let totalIncome = 0;
  let totalExpenses = 0;
  
  transactions.forEach(transaction => {
    const accountId = transaction.accountId || 'sin-cuenta';
    const accountName = accountMap[accountId] || 'Sin cuenta';
    
    if (!accountData[accountName]) {
      accountData[accountName] = { income: 0, expense: 0 };
    }
    
    if (transaction.type === 'income') {
      const amount = parseFloat(transaction.amount || 0);
      accountData[accountName].income += amount;
      totalIncome += amount;
    } else {
      const amount = parseFloat(transaction.amount || 0);
      accountData[accountName].expense += amount;
      totalExpenses += amount;
    }
  });
  
  const balance = totalIncome - totalExpenses;
  
  let html = `
    <div class="border border-gray-200 p-4 sm:p-6 mb-4 sm:mb-6">
      <h3 class="text-lg sm:text-xl font-light mb-4 sm:mb-6">Resumen General</h3>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div class="bg-green-50 p-3 sm:p-4">
          <div class="text-xs sm:text-sm uppercase tracking-wider text-gray-600 mb-1">Ingresos</div>
          <div class="text-xl sm:text-2xl font-light text-green-600">$${totalIncome.toFixed(2)}</div>
        </div>
        <div class="bg-red-50 p-3 sm:p-4">
          <div class="text-xs sm:text-sm uppercase tracking-wider text-gray-600 mb-1">Egresos</div>
          <div class="text-xl sm:text-2xl font-light text-red-600">$${totalExpenses.toFixed(2)}</div>
        </div>
        <div class="bg-blue-50 p-3 sm:p-4">
          <div class="text-xs sm:text-sm uppercase tracking-wider text-gray-600 mb-1">Balance</div>
          <div class="text-xl sm:text-2xl font-light ${balance >= 0 ? 'text-blue-600' : 'text-red-600'}">$${balance.toFixed(2)}</div>
        </div>
      </div>
    </div>
    
    <div class="border border-gray-200 p-4 sm:p-6">
      <h3 class="text-lg sm:text-xl font-light mb-4 sm:mb-6">Análisis por Cuenta</h3>
      <div class="space-y-3 sm:space-y-4">
  `;
  
  const sortedAccounts = Object.entries(accountData).sort((a, b) => {
    const totalA = a[1].income + a[1].expense;
    const totalB = b[1].income + b[1].expense;
    return totalB - totalA;
  });
  
  sortedAccounts.forEach(([accountName, data]) => {
    const accountTotal = data.income + data.expense;
    const incomePercent = totalIncome > 0 ? (data.income / totalIncome * 100).toFixed(1) : 0;
    const expensePercent = totalExpenses > 0 ? (data.expense / totalExpenses * 100).toFixed(1) : 0;
    
    html += `
      <div class="border border-gray-200 p-3 sm:p-4">
        <div class="flex justify-between items-center mb-2">
          <div class="text-base sm:text-lg font-light">${escapeHtml(accountName)}</div>
          <div class="text-base sm:text-lg font-light font-medium">$${accountTotal.toFixed(2)}</div>
        </div>
        ${data.income > 0 ? `
        <div class="text-xs sm:text-sm text-gray-600 mb-1">
          Ingresos: $${data.income.toFixed(2)} (${incomePercent}%)
        </div>
        ` : ''}
        ${data.expense > 0 ? `
        <div class="text-xs sm:text-sm text-gray-600">
          Egresos: $${data.expense.toFixed(2)} (${expensePercent}%)
        </div>
        ` : ''}
      </div>
    `;
  });
  
  html += `
      </div>
    </div>
  `;
  
  return html;
}

// Generate analysis by period
async function generatePeriodAnalysis(transactions, periodType, startDate, endDate) {
  const periodData = {};
  let totalIncome = 0;
  let totalExpenses = 0;
  
  transactions.forEach(transaction => {
    const transactionDate = new Date(transaction.date || transaction.createdAt);
    let periodKey = '';
    
    if (periodType === 'daily') {
      periodKey = formatDate(transactionDate);
    } else if (periodType === 'weekly') {
      const weekStart = new Date(transactionDate);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      periodKey = `Semana ${formatDate(weekStart)}`;
    } else if (periodType === 'monthly') {
      periodKey = transactionDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
      periodKey = periodKey.charAt(0).toUpperCase() + periodKey.slice(1);
    } else if (periodType === 'yearly') {
      periodKey = transactionDate.getFullYear().toString();
    }
    
    if (!periodData[periodKey]) {
      periodData[periodKey] = { income: 0, expense: 0 };
    }
    
    if (transaction.type === 'income') {
      const amount = parseFloat(transaction.amount || 0);
      periodData[periodKey].income += amount;
      totalIncome += amount;
    } else {
      const amount = parseFloat(transaction.amount || 0);
      periodData[periodKey].expense += amount;
      totalExpenses += amount;
    }
  });
  
  const balance = totalIncome - totalExpenses;
  
  let html = `
    <div class="border border-gray-200 p-4 sm:p-6 mb-4 sm:mb-6">
      <h3 class="text-lg sm:text-xl font-light mb-4 sm:mb-6">Resumen General</h3>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div class="bg-green-50 p-3 sm:p-4">
          <div class="text-xs sm:text-sm uppercase tracking-wider text-gray-600 mb-1">Ingresos</div>
          <div class="text-xl sm:text-2xl font-light text-green-600">$${totalIncome.toFixed(2)}</div>
        </div>
        <div class="bg-red-50 p-3 sm:p-4">
          <div class="text-xs sm:text-sm uppercase tracking-wider text-gray-600 mb-1">Egresos</div>
          <div class="text-xl sm:text-2xl font-light text-red-600">$${totalExpenses.toFixed(2)}</div>
        </div>
        <div class="bg-blue-50 p-3 sm:p-4">
          <div class="text-xs sm:text-sm uppercase tracking-wider text-gray-600 mb-1">Balance</div>
          <div class="text-xl sm:text-2xl font-light ${balance >= 0 ? 'text-blue-600' : 'text-red-600'}">$${balance.toFixed(2)}</div>
        </div>
      </div>
    </div>
    
    <div class="border border-gray-200 p-4 sm:p-6">
      <h3 class="text-lg sm:text-xl font-light mb-4 sm:mb-6">Análisis por Período (${periodType === 'daily' ? 'Diario' : periodType === 'weekly' ? 'Semanal' : periodType === 'monthly' ? 'Mensual' : 'Anual'})</h3>
      <div class="space-y-3 sm:space-y-4">
  `;
  
  // Sort periods chronologically
  const sortedPeriods = Object.entries(periodData).sort((a, b) => {
    if (periodType === 'yearly') {
      return parseInt(a[0]) - parseInt(b[0]);
    } else if (periodType === 'monthly') {
      return new Date(a[0]) - new Date(b[0]);
    } else {
      return a[0].localeCompare(b[0]);
    }
  });
  
  sortedPeriods.forEach(([periodKey, data]) => {
    const periodBalance = data.income - data.expense;
    
    html += `
      <div class="border border-gray-200 p-3 sm:p-4">
        <div class="flex justify-between items-center mb-2">
          <div class="text-base sm:text-lg font-light">${escapeHtml(periodKey)}</div>
          <div class="text-base sm:text-lg font-light font-medium ${periodBalance >= 0 ? 'text-blue-600' : 'text-red-600'}">$${periodBalance.toFixed(2)}</div>
        </div>
        <div class="text-xs sm:text-sm text-gray-600 space-y-1">
          <div>Ingresos: $${data.income.toFixed(2)}</div>
          <div>Egresos: $${data.expense.toFixed(2)}</div>
        </div>
      </div>
    `;
  });
  
  html += `
      </div>
    </div>
  `;
  
  return html;
}

// Setup event listeners when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Analysis type change
  const analysisTypeSelect = document.getElementById('analysis-type');
  if (analysisTypeSelect) {
    analysisTypeSelect.addEventListener('change', updateAnalysisType);
  }
  
  // Generate analysis button
  const generateBtn = document.getElementById('generate-analysis-btn');
  if (generateBtn) {
    generateBtn.addEventListener('click', generateAnalysis);
  }
});

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

