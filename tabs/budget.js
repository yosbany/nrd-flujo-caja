// Budget management

let budgetsListener = null;
let currentBudgetId = null;

// Import calculateAccountBalance from cashflow.js (it should be available globally)
// If not available, we'll need to make it available

// Helper function to escape HTML
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// formatNumber is now available from NRDCommon (window.formatNumber)

// Format date in 24-hour format
function formatDate24h(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

// Load budgets list
function loadBudgets() {
  logger.debug('Loading budgets');
  const budgetsList = document.getElementById('budgets-list');
  if (!budgetsList) {
    logger.warn('Budgets list element not found');
    return;
  }
  
  budgetsList.innerHTML = '';

  // Check if budgets service is available
  const nrd = window.nrd;
  if (!nrd) {
    logger.error('NRD service not available');
    budgetsList.innerHTML = '<p class="text-center text-red-600 py-6 sm:py-8 text-sm sm:text-base">Error: Servicio NRD no disponible</p>';
    return;
  }

  if (!nrd.budgets) {
    logger.error('Budgets service not available. Please update nrd-data-access library.');
    budgetsList.innerHTML = '<p class="text-center text-red-600 py-6 sm:py-8 text-sm sm:text-base">Error: El servicio de presupuestos no está disponible. Por favor actualice la librería nrd-data-access.</p>';
    return;
  }

  // Remove previous listener
  if (budgetsListener) {
    logger.debug('Removing previous budgets listener');
    budgetsListener();
    budgetsListener = null;
  }

  // Listen for budgets using NRD Data Access
  logger.debug('Setting up budgets listener');
  budgetsListener = nrd.budgets.onValue(async (budgets) => {
    logger.debug('Budgets data received', { count: Array.isArray(budgets) ? budgets.length : Object.keys(budgets || {}).length });
    if (!budgetsList) return;
    
    // Convert to object format if needed
    const budgetsDict = Array.isArray(budgets) 
      ? budgets.reduce((acc, budget) => {
          if (budget && budget.id) {
            acc[budget.id] = budget;
          }
          return acc;
        }, {})
      : budgets || {};

    // Clear list first to prevent duplicates
    budgetsList.innerHTML = '';

    if (Object.keys(budgetsDict).length === 0) {
      budgetsList.innerHTML = '<p class="text-center text-gray-600 py-6 sm:py-8 text-sm sm:text-base">No hay presupuestos definidos</p>';
      return;
    }

    // Show budgets list (use a Set to track IDs and prevent duplicates)
    const processedIds = new Set();
    Object.entries(budgetsDict).forEach(([id, budget]) => {
      // Skip if already processed (safety check)
      if (processedIds.has(id)) {
        logger.warn('Duplicate budget ID detected, skipping', { id });
        return;
      }
      processedIds.add(id);
      const startDate = budget.startDate ? new Date(budget.startDate) : null;
      const endDate = budget.endDate ? new Date(budget.endDate) : null;
      const startDateStr = startDate ? formatDate24h(startDate) : 'N/A';
      const endDateStr = endDate ? formatDate24h(endDate) : 'N/A';
      
      const item = document.createElement('div');
      item.className = 'border border-gray-200 p-3 sm:p-4 md:p-6 hover:border-red-600 transition-colors cursor-pointer';
      item.dataset.budgetId = id;
      item.innerHTML = `
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0">
          <div>
            <div class="text-base sm:text-lg font-light">${escapeHtml(budget.name || 'Sin nombre')}</div>
            <div class="text-xs sm:text-sm text-gray-600 mt-1">Período: ${startDateStr} - ${endDateStr}</div>
          </div>
        </div>
      `;
      
      // Make entire card clickable to view report
      item.addEventListener('click', (e) => {
        // Don't trigger if clicking on buttons (though there are none now)
        if (e.target.closest('button')) return;
        viewBudgetReport(id);
      });
      
      budgetsList.appendChild(item);
    });
  });
}

// Show budget list view
function showBudgetList() {
  const listView = document.getElementById('budget-list-view');
  const reportView = document.getElementById('budget-report-view');
  const formView = document.getElementById('budget-form-view');
  
  if (listView) listView.classList.remove('hidden');
  if (reportView) reportView.classList.add('hidden');
  if (formView) formView.classList.add('hidden');
  
  loadBudgets();
}

// View budget report
async function viewBudgetReport(budgetId) {
  logger.debug('Viewing budget report', { budgetId });
  currentBudgetId = budgetId;
  
  const nrd = window.nrd;
  if (!nrd || !nrd.budgets) {
    await showError('El servicio de presupuestos no está disponible. Por favor actualice la librería nrd-data-access.');
    return;
  }
  
  const listView = document.getElementById('budget-list-view');
  const reportView = document.getElementById('budget-report-view');
  const formView = document.getElementById('budget-form-view');
  
  if (listView) listView.classList.add('hidden');
  if (reportView) reportView.classList.remove('hidden');
  if (formView) formView.classList.add('hidden');
  
  // Load budget data
  const budget = await nrd.budgets.getById(budgetId);
  if (!budget) {
    await showError('Presupuesto no encontrado');
    showBudgetList();
    return;
  }
  
  // Load all transactions and accounts for calculations
  if (!nrd.transactions || !nrd.accounts) {
    await showError('Servicios NRD no disponibles');
    showBudgetList();
    return;
  }
  
  const [transactionsArray, accountsArray] = await Promise.all([
    nrd.transactions.getAll(),
    nrd.accounts.getAll()
  ]);
  
  const transactions = Array.isArray(transactionsArray) 
    ? transactionsArray.reduce((acc, t) => {
        if (t && t.id) acc[t.id] = t;
        return acc;
      }, {})
    : transactionsArray || {};
    
  const accounts = Array.isArray(accountsArray)
    ? accountsArray.reduce((acc, a) => {
        if (a && a.id) acc[a.id] = a;
        return acc;
      }, {})
    : accountsArray || {};
  
  // Render report
  await renderBudgetReport(budget, transactions, accounts);
}

// Render budget report
async function renderBudgetReport(budget, allTransactions, accounts) {
  const reportContent = document.getElementById('budget-report-content');
  if (!reportContent) return;
  
  const nrd = window.nrd;
  if (!nrd) {
    reportContent.innerHTML = '<p class="text-center text-red-600 py-6">Error: Servicio NRD no disponible</p>';
    return;
  }
  
  const startDate = new Date(budget.startDate);
  const endDate = new Date(budget.endDate);
  
  // Calculate initial balance (aggregated)
  let initialBalanceTotal = 0;
  const activeAccounts = Object.values(accounts).filter(a => a.active !== false);
  const calcBalance = window.calculateAccountBalance || calculateAccountBalance;
  for (const account of activeAccounts) {
    const balance = await calcBalance(account.id, allTransactions, startDate, accounts);
    initialBalanceTotal += balance;
  }
  
  // Filter transactions in period
  const periodTransactions = Object.values(allTransactions).filter(t => {
    const txDate = t.date || t.createdAt || 0;
    return txDate >= budget.startDate && txDate <= budget.endDate;
  });
  
  // Calculate final balance (aggregated)
  let finalBalanceTotal = 0;
  for (const account of activeAccounts) {
    const balance = await calcBalance(account.id, allTransactions, endDate, accounts);
    finalBalanceTotal += balance;
  }
  
  // Load categories
  if (!nrd.categories) {
    reportContent.innerHTML = '<p class="text-center text-red-600 py-6">Error: Servicio de categorías no disponible</p>';
    return;
  }
  
  const categoriesArray = await nrd.categories.getAll();
  const categories = Array.isArray(categoriesArray)
    ? categoriesArray.reduce((acc, c) => {
        if (c && c.id) acc[c.id] = c;
        return acc;
      }, {})
    : categoriesArray || {};
  
  // Group transactions by category and subcategory
  const incomeData = {};
  const expenseData = {};
  
  // Excluir categorías de transferencia interna del reporte de presupuesto
  const isTransferCategory = (cat) => cat && cat.name && String(cat.name).toUpperCase().includes('TRANSFERENCIA');

  periodTransactions.forEach(transaction => {
    if (!transaction.categoryId) return;
    
    const category = categories[transaction.categoryId];
    if (!category || isTransferCategory(category)) return;
    
    const description = (transaction.description || '').trim();
    const amount = parseFloat(transaction.amount || 0);
    const categoryId = transaction.categoryId;
    
    const data = category.type === 'income' ? incomeData : expenseData;
    
    if (!data[categoryId]) {
      data[categoryId] = {
        category,
        subcategories: {}
      };
    }
    
    if (!data[categoryId].subcategories[description]) {
      data[categoryId].subcategories[description] = {
        description,
        actual: 0,
        budget: 0
      };
    }
    
    data[categoryId].subcategories[description].actual += amount;
  });
  
  // Add budget data
  if (budget.budgets) {
    Object.entries(budget.budgets).forEach(([categoryId, categoryBudget]) => {
      if (categoryBudget.subcategories) {
        Object.entries(categoryBudget.subcategories).forEach(([description, budgetAmount]) => {
          // Find which data structure to use (income or expense)
          const category = categories[categoryId];
          if (!category || isTransferCategory(category)) return;
          
          const data = category.type === 'income' ? incomeData : expenseData;
          
          if (!data[categoryId]) {
            data[categoryId] = {
              category,
              subcategories: {}
            };
          }
          
          if (!data[categoryId].subcategories[description]) {
            data[categoryId].subcategories[description] = {
              description,
              actual: 0,
              budget: 0
            };
          }
          
          data[categoryId].subcategories[description].budget = budgetAmount;
        });
      }
    });
  }
  
  // Incluir todas las categorías (ingresos y egresos) aunque no tengan transacciones en el período,
  // excepto las de transferencia interna (no se muestran en el presupuesto)
  Object.values(categories).forEach(category => {
    if (!category || !category.id || isTransferCategory(category)) return;
    const categoryId = category.id;
    const data = category.type === 'income' ? incomeData : expenseData;
    if (!data[categoryId]) {
      data[categoryId] = {
        category,
        subcategories: {}
      };
    }
  });
  
  // Ordenar categorías por nombre para presentación consistente
  const sortCategoryEntries = (entries) => entries.sort((a, b) => {
    const nameA = (a[1].category && a[1].category.name) || '';
    const nameB = (b[1].category && b[1].category.name) || '';
    return nameA.localeCompare(nameB);
  });
  
  // Calculate totals
  let totalIncomeActual = 0;
  let totalIncomeBudget = 0;
  let totalExpenseActual = 0;
  let totalExpenseBudget = 0;
  
  Object.values(incomeData).forEach(catData => {
    Object.values(catData.subcategories).forEach(sub => {
      totalIncomeActual += sub.actual;
      totalIncomeBudget += sub.budget;
    });
  });
  
  Object.values(expenseData).forEach(catData => {
    Object.values(catData.subcategories).forEach(sub => {
      totalExpenseActual += sub.actual;
      totalExpenseBudget += sub.budget;
    });
  });
  
  const netProfit = totalIncomeActual - totalExpenseActual;
  
  // Render HTML
  let html = `
    <!-- Budget Name -->
    <div class="mb-4 sm:mb-6">
      <h2 class="text-xl sm:text-2xl font-light text-gray-900 mb-2">${escapeHtml(budget.name || 'Presupuesto sin nombre')}</h2>
      <div class="text-sm sm:text-base text-gray-600">
        <div>Período: ${formatDate24h(startDate)} - ${formatDate24h(endDate)}</div>
      </div>
    </div>
    
    <!-- Saldo Inicial -->
    <div class="mb-4 sm:mb-6 p-3 sm:p-4 border border-gray-200 bg-gray-50">
      <div class="flex justify-between items-center">
        <span class="text-sm sm:text-base font-medium text-gray-700">Saldo Inicial (Agregado):</span>
        <span class="text-sm sm:text-base font-medium text-gray-900">$${formatNumber(initialBalanceTotal)}</span>
      </div>
    </div>
    
    <!-- Ingresos -->
    <div class="mb-4 sm:mb-6">
      <h3 class="text-base sm:text-lg font-medium mb-3 sm:mb-4 text-green-600">Más: Ingresos</h3>
      
      <!-- Column Headers -->
      <div class="grid grid-cols-5 gap-2 sm:gap-4 mb-2 pb-2 border-b-2 border-gray-300 font-medium text-xs sm:text-sm">
        <div class="col-span-1">Categoría / Subcategoría</div>
        <div class="text-right">Actual</div>
        <div class="text-right">Presupuesto</div>
        <div class="text-right">Porcentaje</div>
        <div class="text-right">Restante</div>
      </div>
      
      <div class="space-y-2 sm:space-y-3">
  `;
  
  // Render income categories (ordenadas por nombre)
  sortCategoryEntries(Object.entries(incomeData)).forEach(([categoryId, catData]) => {
    const category = catData.category;
    let categoryActual = 0;
    let categoryBudget = 0;
    
    Object.values(catData.subcategories).forEach(sub => {
      categoryActual += sub.actual;
      categoryBudget += sub.budget;
    });
    
    const categoryPercentage = categoryBudget > 0 ? ((categoryActual / categoryBudget) * 100).toFixed(1) : '';
    const categoryRemaining = categoryBudget - categoryActual;
    
    html += `
      <div class="border border-gray-200 p-2 sm:p-3">
        <!-- Category Row -->
        <div class="grid grid-cols-5 gap-2 sm:gap-4 mb-2 font-medium text-sm sm:text-base">
          <div class="col-span-1">${escapeHtml(category.name)}</div>
          <div class="text-right">$${formatNumber(categoryActual)}</div>
          <div class="text-right">$${formatNumber(categoryBudget)}</div>
          <div class="text-right">${categoryPercentage ? categoryPercentage + '%' : ''}</div>
          <div class="text-right">$${formatNumber(categoryRemaining)}</div>
        </div>
        <!-- Subcategories -->
        <div class="ml-2 sm:ml-4 space-y-1 sm:space-y-2">
    `;
    
    Object.values(catData.subcategories).forEach(sub => {
      const percentage = sub.budget > 0 ? ((sub.actual / sub.budget) * 100).toFixed(1) : '';
      const remaining = sub.budget - sub.actual;
      html += `
        <div class="grid grid-cols-5 gap-2 sm:gap-4 text-xs sm:text-sm cursor-pointer hover:bg-gray-50 p-1 sm:p-2 subcategory-row" 
             data-category-id="${categoryId}" 
             data-subcategory="${escapeHtml(sub.description)}"
             data-budget-id="${currentBudgetId}">
          <div class="col-span-1 text-gray-700">${escapeHtml(sub.description || 'Sin descripción')}</div>
          <div class="text-right">$${formatNumber(sub.actual)}</div>
          <div class="text-right">$${formatNumber(sub.budget)}</div>
          <div class="text-right">${percentage ? percentage + '%' : ''}</div>
          <div class="text-right">$${formatNumber(remaining)}</div>
        </div>
      `;
    });
    
    html += `
        </div>
      </div>
    `;
  });
  
  html += `
      </div>
      <!-- Total Ingresos -->
      <div class="mt-3 sm:mt-4 p-2 sm:p-3 border-t-2 border-gray-300 bg-green-50">
        <div class="grid grid-cols-5 gap-2 sm:gap-4 font-medium text-sm sm:text-base">
          <div class="col-span-1">Total — Más: Ingresos</div>
          <div class="text-right">$${formatNumber(totalIncomeActual)}</div>
          <div class="text-right">$${formatNumber(totalIncomeBudget)}</div>
          <div class="text-right">${totalIncomeBudget > 0 ? ((totalIncomeActual / totalIncomeBudget) * 100).toFixed(1) + '%' : ''}</div>
          <div class="text-right">$${formatNumber(totalIncomeBudget - totalIncomeActual)}</div>
        </div>
      </div>
    </div>
    
    <!-- Egresos -->
    <div class="mb-4 sm:mb-6">
      <h3 class="text-base sm:text-lg font-medium mb-3 sm:mb-4 text-red-600">Menos: Egresos</h3>
      
      <!-- Column Headers -->
      <div class="grid grid-cols-5 gap-2 sm:gap-4 mb-2 pb-2 border-b-2 border-gray-300 font-medium text-xs sm:text-sm">
        <div class="col-span-1">Categoría / Subcategoría</div>
        <div class="text-right">Actual</div>
        <div class="text-right">Presupuesto</div>
        <div class="text-right">Porcentaje</div>
        <div class="text-right">Restante</div>
      </div>
      
      <div class="space-y-2 sm:space-y-3">
  `;
  
  // Render expense categories (ordenadas por nombre)
  sortCategoryEntries(Object.entries(expenseData)).forEach(([categoryId, catData]) => {
    const category = catData.category;
    let categoryActual = 0;
    let categoryBudget = 0;
    
    Object.values(catData.subcategories).forEach(sub => {
      categoryActual += sub.actual;
      categoryBudget += sub.budget;
    });
    
    const categoryPercentage = categoryBudget > 0 ? ((categoryActual / categoryBudget) * 100).toFixed(1) : '';
    const categoryRemaining = categoryBudget - categoryActual;
    
    html += `
      <div class="border border-gray-200 p-2 sm:p-3">
        <!-- Category Row -->
        <div class="grid grid-cols-5 gap-2 sm:gap-4 mb-2 font-medium text-sm sm:text-base">
          <div class="col-span-1">${escapeHtml(category.name)}</div>
          <div class="text-right">$${formatNumber(categoryActual)}</div>
          <div class="text-right">$${formatNumber(categoryBudget)}</div>
          <div class="text-right">${categoryPercentage ? categoryPercentage + '%' : ''}</div>
          <div class="text-right">$${formatNumber(categoryRemaining)}</div>
        </div>
        <!-- Subcategories -->
        <div class="ml-2 sm:ml-4 space-y-1 sm:space-y-2">
    `;
    
    Object.values(catData.subcategories).forEach(sub => {
      const percentage = sub.budget > 0 ? ((sub.actual / sub.budget) * 100).toFixed(1) : '';
      const remaining = sub.budget - sub.actual;
      html += `
        <div class="grid grid-cols-5 gap-2 sm:gap-4 text-xs sm:text-sm cursor-pointer hover:bg-gray-50 p-1 sm:p-2 subcategory-row" 
             data-category-id="${categoryId}" 
             data-subcategory="${escapeHtml(sub.description)}"
             data-budget-id="${currentBudgetId}">
          <div class="col-span-1 text-gray-700">${escapeHtml(sub.description || 'Sin descripción')}</div>
          <div class="text-right">$${formatNumber(sub.actual)}</div>
          <div class="text-right">$${formatNumber(sub.budget)}</div>
          <div class="text-right">${percentage ? percentage + '%' : ''}</div>
          <div class="text-right">$${formatNumber(remaining)}</div>
        </div>
      `;
    });
    
    html += `
        </div>
      </div>
    `;
  });
  
  html += `
      </div>
      <!-- Total Egresos -->
      <div class="mt-3 sm:mt-4 p-2 sm:p-3 border-t-2 border-gray-300 bg-red-50">
        <div class="grid grid-cols-5 gap-2 sm:gap-4 font-medium text-sm sm:text-base">
          <div class="col-span-1">Total — Menos: Egresos</div>
          <div class="text-right">$${formatNumber(totalExpenseActual)}</div>
          <div class="text-right">$${formatNumber(totalExpenseBudget)}</div>
          <div class="text-right">${totalExpenseBudget > 0 ? ((totalExpenseActual / totalExpenseBudget) * 100).toFixed(1) + '%' : ''}</div>
          <div class="text-right">$${formatNumber(totalExpenseBudget - totalExpenseActual)}</div>
        </div>
      </div>
    </div>
    
    <!-- Utilidad o Pérdida -->
    <div class="mb-4 sm:mb-6 p-3 sm:p-4 border border-gray-200 ${netProfit >= 0 ? 'bg-green-50' : 'bg-red-50'}">
      <div class="flex justify-between items-center">
        <span class="text-sm sm:text-base font-medium">Utilidad o (pérdida) neta:</span>
        <span class="text-sm sm:text-base font-medium ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}">$${formatNumber(netProfit)}</span>
      </div>
    </div>
    
    <!-- Saldo Final -->
    <div class="mb-4 sm:mb-6 p-3 sm:p-4 border border-gray-200 bg-gray-50">
      <div class="flex justify-between items-center">
        <span class="text-sm sm:text-base font-medium text-gray-700">Saldo Final (Agregado):</span>
        <span class="text-sm sm:text-base font-medium text-gray-900">$${formatNumber(finalBalanceTotal)}</span>
      </div>
    </div>
    
    <!-- Action Buttons (hidden when printing) -->
    <div class="no-print mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-gray-200 flex flex-col sm:flex-row gap-2 sm:gap-4">
      <button id="edit-budget-from-report-btn" 
        class="flex-1 px-4 sm:px-6 py-2 bg-blue-600 text-white border border-blue-600 hover:bg-blue-700 transition-colors uppercase tracking-wider text-xs sm:text-sm font-light">
        Editar
      </button>
      <button id="delete-budget-from-report-btn" 
        class="flex-1 px-4 sm:px-6 py-2 bg-red-600 text-white border border-red-600 hover:bg-red-700 transition-colors uppercase tracking-wider text-xs sm:text-sm font-light">
        Eliminar
      </button>
      <button id="print-budget-report-btn" 
        class="flex-1 px-4 sm:px-6 py-2 bg-gray-700 text-white border border-gray-700 hover:bg-gray-800 transition-colors uppercase tracking-wider text-xs sm:text-sm font-light">
        Imprimir
      </button>
      <button id="close-budget-report-btn" 
        class="flex-1 px-4 sm:px-6 py-2 bg-gray-600 text-white border border-gray-600 hover:bg-gray-700 transition-colors uppercase tracking-wider text-xs sm:text-sm font-light">
        Cerrar
      </button>
    </div>
  `;
  
  reportContent.innerHTML = html;
  
  // Setup action buttons
  const editBtn = document.getElementById('edit-budget-from-report-btn');
  const deleteBtn = document.getElementById('delete-budget-from-report-btn');
  const printBtn = document.getElementById('print-budget-report-btn');
  const closeBtn = document.getElementById('close-budget-report-btn');
  
  if (editBtn) {
    editBtn.addEventListener('click', () => editBudget(currentBudgetId));
  }
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => deleteBudget(currentBudgetId));
  }
  if (printBtn) {
    printBtn.addEventListener('click', () => printBudgetReport());
  }
  if (closeBtn) {
    closeBtn.addEventListener('click', () => showBudgetList());
  }
  
  // Add click handlers for subcategories
  reportContent.querySelectorAll('.subcategory-row').forEach(row => {
    row.addEventListener('click', () => {
      const categoryId = row.dataset.categoryId;
      const subcategory = row.dataset.subcategory;
      const budgetId = row.dataset.budgetId;
      showBudgetDetailModal(categoryId, subcategory, budgetId);
    });
  });
}

// Print budget report (imprime la misma página ocultando los botones al final)
function printBudgetReport() {
  window.print();
}

// Show budget detail modal (by account)
async function showBudgetDetailModal(categoryId, subcategory, budgetId) {
  logger.debug('Showing budget detail modal', { categoryId, subcategory, budgetId });
  
  const nrd = window.nrd;
  if (!nrd || !nrd.budgets) {
    await showError('El servicio de presupuestos no está disponible. Por favor actualice la librería nrd-data-access.');
    return;
  }
  
  const modal = document.getElementById('budget-detail-modal');
  if (!modal) return;
  
  // Load budget
  const budget = await nrd.budgets.getById(budgetId);
  if (!budget) {
    await showError('Presupuesto no encontrado');
    return;
  }
  
  // Load all transactions and accounts
  if (!nrd.transactions || !nrd.accounts || !nrd.categories) {
    await showError('Servicios NRD no disponibles');
    return;
  }
  
  const [transactionsArray, accountsArray, categoriesArray] = await Promise.all([
    nrd.transactions.getAll(),
    nrd.accounts.getAll(),
    nrd.categories.getAll()
  ]);
  
  const transactions = Array.isArray(transactionsArray) 
    ? transactionsArray.reduce((acc, t) => {
        if (t && t.id) acc[t.id] = t;
        return acc;
      }, {})
    : transactionsArray || {};
    
  const accounts = Array.isArray(accountsArray)
    ? accountsArray.reduce((acc, a) => {
        if (a && a.id) acc[a.id] = a;
        return acc;
      }, {})
    : accountsArray || {};
    
  const categories = Array.isArray(categoriesArray)
    ? categoriesArray.reduce((acc, c) => {
        if (c && c.id) acc[c.id] = c;
        return acc;
      }, {})
    : categoriesArray || {};
  
  const category = categories[categoryId];
  if (!category) {
    await showError('Categoría no encontrada');
    return;
  }
  
  const startDate = new Date(budget.startDate);
  const endDate = new Date(budget.endDate);
  
  // Filter transactions for this subcategory in period
  const subcategoryTransactions = Object.values(transactions).filter(t => {
    const txDate = t.date || t.createdAt || 0;
    return txDate >= budget.startDate && 
           txDate <= budget.endDate &&
           t.categoryId === categoryId &&
           (t.description || '').trim() === subcategory;
  });
  
  // Group by account
  const accountData = {};
  
  subcategoryTransactions.forEach(transaction => {
    const accountId = transaction.accountId;
    if (!accountId) return;
    
    if (!accountData[accountId]) {
      accountData[accountId] = {
        account: accounts[accountId],
        transactions: [],
        total: 0
      };
    }
    
    accountData[accountId].transactions.push(transaction);
    accountData[accountId].total += parseFloat(transaction.amount || 0);
  });
  
  // Get budget amount for this subcategory
  const budgetAmount = budget.budgets?.[categoryId]?.subcategories?.[subcategory] || 0;
  
  // Calculate initial and final balances by account
  const accountBalances = {};
  const calcBalance = window.calculateAccountBalance || calculateAccountBalance;
  for (const accountId of Object.keys(accountData)) {
    const account = accounts[accountId];
    if (!account || account.active === false) continue;
    
    const initialBalance = await calcBalance(accountId, transactions, startDate, accounts);
    const finalBalance = await calcBalance(accountId, transactions, endDate, accounts);
    
    accountBalances[accountId] = {
      initial: initialBalance,
      final: finalBalance
    };
  }
  
  // Render modal content
  const modalContent = document.getElementById('budget-detail-modal-content');
  if (!modalContent) return;
  
  let html = `
    <div class="mb-4">
      <h4 class="text-base sm:text-lg font-medium mb-2">${escapeHtml(category.name)} - ${escapeHtml(subcategory)}</h4>
      <div class="text-sm text-gray-600 mb-4">
        <div>Período: ${formatDate24h(startDate)} - ${formatDate24h(endDate)}</div>
        <div>Presupuesto: $${formatNumber(budgetAmount)}</div>
        <div>Actual Total: $${formatNumber(Object.values(accountData).reduce((sum, ad) => sum + ad.total, 0))}</div>
      </div>
    </div>
    
    <div class="space-y-4">
  `;
  
  Object.entries(accountData).forEach(([accountId, ad]) => {
    const account = ad.account;
    const balances = accountBalances[accountId] || { initial: 0, final: 0 };
    const percentage = budgetAmount > 0 ? ((ad.total / budgetAmount) * 100).toFixed(1) : '';
    const remaining = budgetAmount - ad.total;
    
    html += `
      <div class="border border-gray-200 p-3 sm:p-4">
        <div class="font-medium text-sm sm:text-base mb-2">${escapeHtml(account?.name || 'Cuenta desconocida')}</div>
        <div class="text-xs sm:text-sm space-y-1">
          <div>Saldo Inicial: $${formatNumber(balances.initial)}</div>
          <div>Actual: $${formatNumber(ad.total)}</div>
          <div>Presupuesto: $${formatNumber(budgetAmount)}</div>
          <div>${budgetAmount > 0 ? `Porcentaje: ${percentage}%` : 'Porcentaje:'}</div>
          <div>Restante: $${formatNumber(remaining)}</div>
          <div>Saldo Final: $${formatNumber(balances.final)}</div>
        </div>
        <div class="mt-2 text-xs text-gray-500">
          Transacciones: ${ad.transactions.length}
        </div>
      </div>
    `;
  });
  
  html += `
    </div>
  `;
  
  modalContent.innerHTML = html;
  modal.classList.remove('hidden');
}

// Edit budget
async function editBudget(budgetId) {
  logger.debug('Editing budget', { budgetId });
  currentBudgetId = budgetId;
  
  const nrd = window.nrd;
  if (!nrd || !nrd.budgets) {
    await showError('El servicio de presupuestos no está disponible. Por favor actualice la librería nrd-data-access.');
    return;
  }
  
  const budget = await nrd.budgets.getById(budgetId);
  if (!budget) {
    await showError('Presupuesto no encontrado');
    return;
  }
  
  showBudgetForm(budgetId, budget);
}

// Delete budget
async function deleteBudget(budgetId) {
  logger.debug('Deleting budget', { budgetId });
  
  const nrd = window.nrd;
  if (!nrd || !nrd.budgets) {
    await showError('El servicio de presupuestos no está disponible. Por favor actualice la librería nrd-data-access.');
    return;
  }
  
  const confirmed = await showConfirm('Eliminar Presupuesto', '¿Está seguro de eliminar este presupuesto? Esta acción no se puede deshacer.');
  if (!confirmed) return;
  
  try {
    showSpinner('Eliminando presupuesto...');
    await nrd.budgets.delete(budgetId);
    hideSpinner();
    await showSuccess('Presupuesto eliminado exitosamente');
    // Return to list view
    showBudgetList();
  } catch (error) {
    hideSpinner();
    logger.error('Error deleting budget', error);
    await showError('Error al eliminar presupuesto: ' + error.message);
  }
}

// Show budget form (create or edit)
async function showBudgetForm(budgetId = null, budgetData = null) {
  const listView = document.getElementById('budget-list-view');
  const reportView = document.getElementById('budget-report-view');
  const formView = document.getElementById('budget-form-view');
  
  if (listView) listView.classList.add('hidden');
  if (reportView) reportView.classList.add('hidden');
  if (formView) formView.classList.remove('hidden');
  
  const formTitle = document.getElementById('budget-form-title');
  const formSubtitle = document.getElementById('budget-form-subtitle');
  const formHeader = document.getElementById('budget-form-header');
  const saveBtn = document.getElementById('save-budget-btn');
  const deleteBtn = document.getElementById('delete-budget-form-btn');
  
  if (budgetId) {
    if (formTitle) formTitle.textContent = 'Editar Presupuesto';
    if (formSubtitle) formSubtitle.textContent = 'Modifique la información del presupuesto';
    if (formHeader) {
      formHeader.classList.remove('bg-green-600', 'bg-gray-600');
      formHeader.classList.add('bg-blue-600');
    }
    if (saveBtn) {
      saveBtn.classList.remove('bg-green-600', 'border-green-600', 'hover:bg-green-700');
      saveBtn.classList.add('bg-blue-600', 'border-blue-600', 'hover:bg-blue-700');
    }
    if (deleteBtn) deleteBtn.classList.remove('hidden');
    
    // Load budget data
    if (budgetData) {
      document.getElementById('budget-id').value = budgetId;
      document.getElementById('budget-name').value = budgetData.name || '';
      document.getElementById('budget-start-date').value = budgetData.startDate ? formatDateForInput(new Date(budgetData.startDate)) : '';
      document.getElementById('budget-end-date').value = budgetData.endDate ? formatDateForInput(new Date(budgetData.endDate)) : '';
      
      // Load subcategories with budgets
      await loadSubcategoriesForBudgetForm(budgetData);
    }
  } else {
    if (formTitle) formTitle.textContent = 'Nuevo Presupuesto';
    if (formSubtitle) formSubtitle.textContent = 'Cree un nuevo presupuesto';
    if (formHeader) {
      formHeader.classList.remove('bg-blue-600', 'bg-gray-600');
      formHeader.classList.add('bg-green-600');
    }
    if (saveBtn) {
      saveBtn.classList.remove('bg-blue-600', 'border-blue-600', 'hover:bg-blue-700');
      saveBtn.classList.add('bg-green-600', 'border-green-600', 'hover:bg-green-700');
    }
    if (deleteBtn) deleteBtn.classList.add('hidden');
    
    // Reset form
    document.getElementById('budget-form-element').reset();
    document.getElementById('budget-id').value = '';
    
    // Load empty subcategories
    await loadSubcategoriesForBudgetForm(null);
  }
}

// Format date for input[type="date"]
function formatDateForInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Load subcategories for budget form
async function loadSubcategoriesForBudgetForm(budgetData) {
  const subcategoriesContainer = document.getElementById('budget-subcategories-container');
  if (!subcategoriesContainer) return;
  
  const nrd = window.nrd;
  if (!nrd || !nrd.transactions || !nrd.categories) {
    subcategoriesContainer.innerHTML = '<p class="text-sm text-red-500">Error: Servicios NRD no disponibles</p>';
    return;
  }
  
  // Load all transactions to get unique subcategories
  const transactionsArray = await nrd.transactions.getAll();
  const transactions = Array.isArray(transactionsArray) 
    ? transactionsArray.reduce((acc, t) => {
        if (t && t.id) acc[t.id] = t;
        return acc;
      }, {})
    : transactionsArray || {};
  
  // Load categories
  if (!nrd.categories) {
    subcategoriesContainer.innerHTML = '<p class="text-sm text-red-500">Error: Servicio de categorías no disponible</p>';
    return;
  }
  
  const categoriesArray = await nrd.categories.getAll();
  const categories = Array.isArray(categoriesArray)
    ? categoriesArray.reduce((acc, c) => {
        if (c && c.id) acc[c.id] = c;
        return acc;
      }, {})
    : categoriesArray || {};
  
  // Group subcategories by category
  const subcategoriesByCategory = {};
  
  const EXCLUDED_SUBCATEGORIES = ['TRANSACCIONES', 'TRANSFERENCIAS'];
  const isExcludedSubcategory = (desc) => EXCLUDED_SUBCATEGORIES.some(
    excluded => (desc || '').toUpperCase().trim() === excluded
  );

  Object.values(transactions).forEach(transaction => {
    if (!transaction.categoryId || !transaction.description) return;
    
    const categoryId = transaction.categoryId;
    const description = transaction.description.trim();
    if (isExcludedSubcategory(description)) return;
    
    if (!subcategoriesByCategory[categoryId]) {
      subcategoriesByCategory[categoryId] = {
        category: categories[categoryId],
        subcategories: new Set()
      };
    }
    
    subcategoriesByCategory[categoryId].subcategories.add(description);
  });
  
  // Separate by type
  const incomeCategories = [];
  const expenseCategories = [];
  
  Object.entries(subcategoriesByCategory).forEach(([categoryId, data]) => {
    if (!data.category) return;
    if (isExcludedSubcategory(data.category.name)) return;
    
    const subcategoriesList = Array.from(data.subcategories).sort();
    const categoryBudget = budgetData?.budgets?.[categoryId];
    const categoryTotal = (categoryBudget && typeof categoryBudget.total === 'number' && categoryBudget.total > 0)
      ? categoryBudget.total
      : (categoryBudget?.subcategories
          ? Object.values(categoryBudget.subcategories).reduce((s, v) => s + (Number(v) || 0), 0)
          : 0);
    const categoryData = {
      categoryId,
      category: data.category,
      categoryTotal: categoryTotal > 0 ? categoryTotal : '',
      subcategories: subcategoriesList.map(desc => ({
        description: desc,
        budget: budgetData?.budgets?.[categoryId]?.subcategories?.[desc] || 0
      }))
    };
    
    if (data.category.type === 'income') {
      incomeCategories.push(categoryData);
    } else {
      expenseCategories.push(categoryData);
    }
  });
  
  let html = '';
  
  // Render income categories
  if (incomeCategories.length > 0) {
    html += '<div class="mb-6"><h4 class="text-sm font-medium text-green-600 mb-3">Ingresos</h4>';
    incomeCategories.forEach(catData => {
      html += `
        <div class="mb-4 border border-gray-200 p-3">
          <div class="font-medium text-sm mb-2">${escapeHtml(catData.category.name)}</div>
          <div class="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">
            <label class="flex-1 text-xs text-gray-600">Total categoría</label>
            <input type="number" step="0.01" min="0" 
                   class="budget-category-total-input w-32 px-2 py-1 border border-gray-300 text-sm" 
                   data-category-id="${catData.categoryId}" 
                   value="${catData.categoryTotal !== '' ? Number(catData.categoryTotal).toFixed(2) : ''}"
                   placeholder="0.00"
                   title="Si indica un valor, la suma de las subcategorías debe ser igual a este total">
          </div>
          <div class="space-y-2">
      `;
      
      catData.subcategories.forEach(sub => {
        html += `
          <div class="flex items-center gap-2">
            <label class="flex-1 text-xs text-gray-700">${escapeHtml(sub.description)}</label>
            <input type="number" 
                   step="0.01" 
                   min="0" 
                   class="budget-subcategory-input w-32 px-2 py-1 border border-gray-300 text-sm" 
                   data-category-id="${catData.categoryId}" 
                   data-description="${escapeHtml(sub.description)}"
                   value="${sub.budget > 0 ? sub.budget.toFixed(2) : ''}"
                   placeholder="0.00">
          </div>
        `;
      });
      
      html += `
          </div>
        </div>
      `;
    });
    html += '</div>';
  }
  
  // Render expense categories
  if (expenseCategories.length > 0) {
    html += '<div class="mb-6"><h4 class="text-sm font-medium text-red-600 mb-3">Egresos</h4>';
    expenseCategories.forEach(catData => {
      html += `
        <div class="mb-4 border border-gray-200 p-3">
          <div class="font-medium text-sm mb-2">${escapeHtml(catData.category.name)}</div>
          <div class="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">
            <label class="flex-1 text-xs text-gray-600">Total categoría</label>
            <input type="number" step="0.01" min="0" 
                   class="budget-category-total-input w-32 px-2 py-1 border border-gray-300 text-sm" 
                   data-category-id="${catData.categoryId}" 
                   value="${catData.categoryTotal !== '' ? Number(catData.categoryTotal).toFixed(2) : ''}"
                   placeholder="0.00"
                   title="Si indica un valor, la suma de las subcategorías debe ser igual a este total">
          </div>
          <div class="space-y-2">
      `;
      
      catData.subcategories.forEach(sub => {
        html += `
          <div class="flex items-center gap-2">
            <label class="flex-1 text-xs text-gray-700">${escapeHtml(sub.description)}</label>
            <input type="number" 
                   step="0.01" 
                   min="0" 
                   class="budget-subcategory-input w-32 px-2 py-1 border border-gray-300 text-sm" 
                   data-category-id="${catData.categoryId}" 
                   data-description="${escapeHtml(sub.description)}"
                   value="${sub.budget > 0 ? sub.budget.toFixed(2) : ''}"
                   placeholder="0.00">
          </div>
        `;
      });
      
      html += `
          </div>
        </div>
      `;
    });
    html += '</div>';
  }
  
  subcategoriesContainer.innerHTML = html || '<p class="text-sm text-gray-500">No hay subcategorías disponibles</p>';
}

// Save budget
async function saveBudget() {
  const nrd = window.nrd;
  if (!nrd || !nrd.budgets) {
    await showError('El servicio de presupuestos no está disponible. Por favor actualice la librería nrd-data-access.');
    return;
  }
  
  const budgetId = document.getElementById('budget-id')?.value;
  const name = document.getElementById('budget-name')?.value.trim();
  const startDateStr = document.getElementById('budget-start-date')?.value;
  const endDateStr = document.getElementById('budget-end-date')?.value;
  
  if (!name) {
    await showError('El nombre es requerido');
    return;
  }
  
  if (!startDateStr || !endDateStr) {
    await showError('Las fechas de inicio y fin son requeridas');
    return;
  }

  // Parsear como fecha local (evitar que "YYYY-MM-DD" se interprete como UTC y reste un día)
  const startDate = new Date(startDateStr + 'T00:00:00');
  const endDate = new Date(endDateStr + 'T23:59:59.999');
  
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    await showError('Las fechas no son válidas');
    return;
  }
  
  if (startDate > endDate) {
    await showError('La fecha de inicio debe ser anterior a la fecha de fin');
    return;
  }
  
  // Collect category totals
  const categoryTotals = {};
  document.querySelectorAll('.budget-category-total-input').forEach(input => {
    const categoryId = input.dataset.categoryId;
    const value = parseFloat(input.value || 0);
    if (categoryId && value > 0) categoryTotals[categoryId] = value;
  });

  // Collect subcategory budgets
  const budgets = {};
  const inputs = document.querySelectorAll('.budget-subcategory-input');
  
  inputs.forEach(input => {
    const categoryId = input.dataset.categoryId;
    const description = input.dataset.description;
    const value = parseFloat(input.value || 0);
    
    if (value > 0) {
      if (!budgets[categoryId]) {
        budgets[categoryId] = {
          subcategories: {}
        };
      }
      
      budgets[categoryId].subcategories[description] = value;
    }
  });

  // Si la categoría tiene total planificado, la suma de subcategorías debe ser exactamente ese total
  const TOLERANCE = 0.02;
  for (const [categoryId, total] of Object.entries(categoryTotals)) {
    const subSum = (budgets[categoryId]?.subcategories && Object.values(budgets[categoryId].subcategories).length > 0)
      ? Object.values(budgets[categoryId].subcategories).reduce((s, v) => s + (Number(v) || 0), 0)
      : 0;
    if (Math.abs(subSum - total) > TOLERANCE) {
      await showError(`Donde indicó un total de categoría (${total.toFixed(2)}), la suma de las subcategorías debe ser igual (actual: ${subSum.toFixed(2)}). Ajuste los valores.`);
      return;
    }
  }

  // Guardar total de categoría donde corresponda
  Object.entries(categoryTotals).forEach(([categoryId, total]) => {
    if (!budgets[categoryId]) budgets[categoryId] = { subcategories: {} };
    budgets[categoryId].total = total;
  });
  
  const budgetData = {
    name,
    startDate: startDate.getTime(),
    endDate: endDate.getTime(),
    budgets
  };
  
  if (budgetId) {
    budgetData.updatedAt = Date.now();
  } else {
    budgetData.createdAt = Date.now();
  }
  
  try {
    showSpinner('Guardando presupuesto...');
    
    if (budgetId) {
      await nrd.budgets.update(budgetId, budgetData);
    } else {
      await nrd.budgets.create(budgetData);
    }
    
    hideSpinner();
    await showSuccess('Presupuesto guardado exitosamente');
    showBudgetList();
  } catch (error) {
    hideSpinner();
    logger.error('Error saving budget', error);
    await showError('Error al guardar presupuesto: ' + error.message);
  }
}

// Initialize budget module
function initializeBudgets() {
  logger.debug('Initializing budgets module');
  
  // Check if budgets service is available
  const nrd = window.nrd;
  if (!nrd) {
    logger.error('NRD service not available');
    const budgetsList = document.getElementById('budgets-list');
    if (budgetsList) {
      budgetsList.innerHTML = '<p class="text-center text-red-600 py-6 sm:py-8 text-sm sm:text-base">Error: Servicio NRD no disponible</p>';
    }
    return;
  }

  if (!nrd.budgets) {
    logger.error('Budgets service not available. Please update nrd-data-access library.');
    const budgetsList = document.getElementById('budgets-list');
    if (budgetsList) {
      budgetsList.innerHTML = '<p class="text-center text-red-600 py-6 sm:py-8 text-sm sm:text-base">Error: El servicio de presupuestos no está disponible. Por favor actualice la librería nrd-data-access a la versión más reciente.</p>';
    }
    return;
  }
  
  // Setup new budget button
  const newBudgetBtn = document.getElementById('new-budget-btn');
  if (newBudgetBtn) {
    newBudgetBtn.addEventListener('click', () => {
      showBudgetForm();
    });
  }
  
  // Setup budget form submit (prevent duplicate submissions)
  const budgetForm = document.getElementById('budget-form-element');
  if (budgetForm) {
    let isSubmitting = false;
    budgetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (isSubmitting) {
        logger.warn('Budget form submission already in progress, ignoring duplicate submit');
        return;
      }
      isSubmitting = true;
      try {
        await saveBudget();
      } finally {
        // Reset after a delay to allow for navigation
        setTimeout(() => {
          isSubmitting = false;
        }, 1000);
      }
    });
  }
  
  // Setup cancel button
  const cancelBudgetBtn = document.getElementById('cancel-budget-btn');
  if (cancelBudgetBtn) {
    cancelBudgetBtn.addEventListener('click', () => {
      showBudgetList();
    });
  }
  
  // Note: Action buttons in report view are now set up dynamically in renderBudgetReport()
  // No need to set them up here as they're created dynamically
  
  // Setup delete button in form
  const deleteBudgetFormBtn = document.getElementById('delete-budget-form-btn');
  if (deleteBudgetFormBtn) {
    deleteBudgetFormBtn.addEventListener('click', async () => {
      const budgetId = document.getElementById('budget-id')?.value;
      if (budgetId) {
        await deleteBudget(budgetId);
      }
    });
  }
  
  // Setup close detail modal button
  const closeBudgetDetailModalBtn = document.getElementById('close-budget-detail-modal');
  if (closeBudgetDetailModalBtn) {
    closeBudgetDetailModalBtn.addEventListener('click', () => {
      const modal = document.getElementById('budget-detail-modal');
      if (modal) modal.classList.add('hidden');
    });
  }
  
  // Setup close form button
  const closeBudgetFormBtn = document.getElementById('close-budget-form');
  if (closeBudgetFormBtn) {
    closeBudgetFormBtn.addEventListener('click', () => {
      showBudgetList();
    });
  }
  
  // Load budgets list
  showBudgetList();
}

// Export functions for app.js
window.loadBudgets = loadBudgets;
window.showBudgetList = showBudgetList;
window.initializeBudgets = initializeBudgets;
