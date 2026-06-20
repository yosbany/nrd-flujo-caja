// Bank reconciliation view management

const logger = window.logger || console;

let transactionsListener = null;
let accountsListener = null;
let currentTransactions = {};
let currentAccounts = {};
let selectedAccountId = null;
let currentSystemBalance = 0;
let currentBankBalance = 0;

// Initialize reconciliation view
export function initializeReconciliation() {
  logger.debug('Initializing reconciliation view');
  
  // Setup event handlers
  setupReconciliationHandlers();
  
  // Load data
  loadReconciliationData();
}

// Setup event handlers
function setupReconciliationHandlers() {
  const accountSelect = document.getElementById('reconciliation-account-select');
  if (accountSelect) {
    accountSelect.addEventListener('change', async (e) => {
      selectedAccountId = e.target.value;
      if (selectedAccountId) {
        await loadAccountReconciliation();
      } else {
        hideReconciliationSections();
      }
    });
  }

  const loadBtn = document.getElementById('load-reconciliation-btn');
  if (loadBtn) {
    loadBtn.addEventListener('click', async () => {
      await loadReconciliation();
    });
  }

  const reconcileAllBtn = document.getElementById('reconcile-all-btn');
  if (reconcileAllBtn) {
    reconcileAllBtn.addEventListener('click', async () => {
      await reconcileAllTransactions();
    });
  }

  const unreconcileAllBtn = document.getElementById('unreconcile-all-btn');
  if (unreconcileAllBtn) {
    unreconcileAllBtn.addEventListener('click', async () => {
      await unreconcileAllTransactions();
    });
  }

  const addAdjustmentBtn = document.getElementById('add-adjustment-btn');
  if (addAdjustmentBtn) {
    addAdjustmentBtn.addEventListener('click', () => {
      showAddAdjustmentModal();
    });
  }
}

// Load transactions and accounts data
function loadReconciliationData() {
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
    logger.debug('Transactions updated for reconciliation', { count: Object.keys(currentTransactions).length });
    if (selectedAccountId) {
      loadAccountReconciliation();
    }
  });

  // Listen to accounts
  accountsListener = nrd.accounts.onValue((accounts) => {
    currentAccounts = accounts.reduce((acc, account) => {
      if (account && account.id) {
        acc[account.id] = account;
      }
      return acc;
    }, {});
    logger.debug('Accounts updated for reconciliation', { count: Object.keys(currentAccounts).length });
    populateAccountSelector();
  });
}

// Populate account selector
function populateAccountSelector() {
  const accountSelect = document.getElementById('reconciliation-account-select');
  if (!accountSelect) return;

  accountSelect.innerHTML = '<option value="">-- Seleccione una cuenta --</option>';
  
  Object.values(currentAccounts || {}).forEach(account => {
    if (account && account.active !== false) {
      const option = document.createElement('option');
      option.value = account.id;
      option.textContent = account.name || 'Sin nombre';
      accountSelect.appendChild(option);
    }
  });
}

// Load reconciliation for selected account
async function loadAccountReconciliation() {
  if (!selectedAccountId) return;

  const account = currentAccounts[selectedAccountId];
  if (!account) return;

  // Show statement input section
  const statementSection = document.getElementById('reconciliation-statement-section');
  if (statementSection) {
    statementSection.classList.remove('hidden');
  }

  // Calculate system balance
  if (typeof calculateAccountBalance === 'function') {
    const transactionsArray = Object.values(currentTransactions || {});
    currentSystemBalance = await calculateAccountBalance(selectedAccountId, transactionsArray, null, currentAccounts);
  } else {
    logger.warn('calculateAccountBalance function not available');
    currentSystemBalance = 0;
  }

  // Load bank balance from account (if stored)
  const statementDate = document.getElementById('reconciliation-statement-date');
  const bankBalanceInput = document.getElementById('reconciliation-bank-balance');
  
  if (account.lastReconciliationDate) {
    if (statementDate) {
      const date = new Date(account.lastReconciliationDate);
      statementDate.value = date.toISOString().split('T')[0];
    }
  } else {
    if (statementDate) {
      statementDate.value = new Date().toISOString().split('T')[0];
    }
  }

  if (account.lastBankBalance !== undefined && account.lastBankBalance !== null) {
    if (bankBalanceInput) {
      bankBalanceInput.value = formatNumber(account.lastBankBalance);
    }
    currentBankBalance = account.lastBankBalance;
  }
}

// Load reconciliation
async function loadReconciliation() {
  try {
    const statementDateInput = document.getElementById('reconciliation-statement-date');
    const bankBalanceInput = document.getElementById('reconciliation-bank-balance');
    
    if (!statementDateInput || !bankBalanceInput) {
      await window.NRDCommon?.showError?.('Elementos del formulario no encontrados');
      return;
    }

    const statementDate = statementDateInput.value;
    const bankBalanceStr = bankBalanceInput.value.trim();
    
    if (!statementDate) {
      await window.NRDCommon?.showError?.('Debe seleccionar una fecha del estado de cuenta');
      return;
    }

    if (!bankBalanceStr) {
      await window.NRDCommon?.showError?.('Debe ingresar el saldo bancario');
      return;
    }

    currentBankBalance = parseAmount(bankBalanceStr);
    
    // Calculate system balance up to statement date
    const statementDateObj = new Date(statementDate);
    statementDateObj.setHours(23, 59, 59, 999);
    
    if (typeof calculateAccountBalance === 'function') {
      const transactionsArray = Object.values(currentTransactions || {}).filter(tx => {
        const txDate = tx.date || tx.createdAt || 0;
        return txDate <= statementDateObj.getTime();
      });
      currentSystemBalance = await calculateAccountBalance(selectedAccountId, transactionsArray, statementDateObj.getTime(), currentAccounts);
    }

    // Render reconciliation
    await renderReconciliation();
    
  } catch (error) {
    logger.error('Error loading reconciliation', error);
    await window.NRDCommon?.showError?.(error.message || 'Error al cargar conciliación');
  }
}

// Render reconciliation
async function renderReconciliation() {
  const formatCurrency = window.formatCurrency || ((val) => `$${Math.round(val)}`);
  const formatNumber = window.formatNumber || ((val) => val.toFixed(2));

  // Show summary
  const summarySection = document.getElementById('reconciliation-summary');
  if (summarySection) {
    summarySection.classList.remove('hidden');
    
    const systemBalanceEl = document.getElementById('reconciliation-system-balance');
    const bankBalanceEl = document.getElementById('reconciliation-bank-balance-display');
    const differenceEl = document.getElementById('reconciliation-difference');
    
    if (systemBalanceEl) {
      systemBalanceEl.textContent = formatCurrency(Math.round(currentSystemBalance));
    }
    if (bankBalanceEl) {
      bankBalanceEl.textContent = formatCurrency(Math.round(currentBankBalance));
    }
    if (differenceEl) {
      const difference = currentBankBalance - currentSystemBalance;
      differenceEl.textContent = formatCurrency(Math.round(difference));
      differenceEl.className = `text-2xl font-light ${difference === 0 ? 'text-green-600' : 'text-red-600'}`;
    }
  }

  // Don't render transactions - only show bank movements from Excel
  // await renderReconciliationTransactions();
  
  // Hide transactions section
  const transactionsSection = document.getElementById('reconciliation-transactions-section');
  if (transactionsSection) {
    transactionsSection.classList.add('hidden');
  }
}

// Render reconciliation transactions
async function renderReconciliationTransactions() {
  const transactionsList = document.getElementById('reconciliation-transactions-list');
  const transactionsSection = document.getElementById('reconciliation-transactions-section');
  
  if (!transactionsList || !transactionsSection) return;

  const statementDateInput = document.getElementById('reconciliation-statement-date');
  if (!statementDateInput || !statementDateInput.value) return;

  const statementDate = new Date(statementDateInput.value);
  statementDate.setHours(23, 59, 59, 999);

  // Get transactions for this account up to statement date that are NOT reconciled
  const accountTransactions = Object.values(currentTransactions || {}).filter(tx => {
    const isReconciled = tx.reconciled === true || (tx.reconciledDate && tx.reconciledDate > 0);
    return tx.accountId === selectedAccountId && 
           (tx.date || tx.createdAt || 0) <= statementDate.getTime() &&
           !isReconciled; // Only show pending (unreconciled) transactions
  }).sort((a, b) => {
    const dateA = a.date || a.createdAt || 0;
    const dateB = b.date || b.createdAt || 0;
    return dateB - dateA; // Most recent first
  });

  transactionsSection.classList.remove('hidden');
  transactionsList.innerHTML = '';

  if (accountTransactions.length === 0) {
    transactionsList.innerHTML = '<p class="text-center text-gray-600 py-4">No hay transacciones pendientes para esta cuenta en el período seleccionado</p>';
    return;
  }

  const formatCurrency = window.formatCurrency || ((val) => `$${Math.round(val)}`);
  const formatDate24h = (date) => {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // Load categories map
  const categoriesMap = {};
  const nrd = window.nrd;
  if (nrd?.categories) {
    try {
      const cats = await nrd.categories.getAll();
      (Array.isArray(cats) ? cats : Object.values(cats || {})).forEach(c => {
        if (c && c.id) categoriesMap[c.id] = c.name;
      });
    } catch (e) { /* ignore */ }
  }

  // Get account to check if it has category mappings configured
  const account = selectedAccountId ? currentAccounts[selectedAccountId] : null;
  const hasAccountMappings = account && account.categoryMapping && Array.isArray(account.categoryMapping) && account.categoryMapping.length > 0;

  // Separate transactions into classified and unclassified
  const classifiedTransactions = [];
  const unclassifiedTransactions = [];

  accountTransactions.forEach(tx => {
    // Only consider classified if transaction has explicit categoryName
    // (not based on pattern mappings, only manual assignments)
    const hasExplicitCategoryName = !!tx.categoryName;
    
    if (hasExplicitCategoryName) {
      classifiedTransactions.push(tx);
    } else {
      unclassifiedTransactions.push(tx);
    }
  });

  // Render unclassified section
  if (unclassifiedTransactions.length > 0) {
    const unclassifiedSection = document.createElement('div');
    unclassifiedSection.className = 'mb-6';
    unclassifiedSection.innerHTML = `
      <h4 class="text-sm font-medium text-gray-700 mb-3 uppercase tracking-wider">Sin Clasificar</h4>
      <div class="space-y-2" id="unclassified-transactions-list"></div>
    `;
    transactionsList.appendChild(unclassifiedSection);
    
    const unclassifiedList = document.getElementById('unclassified-transactions-list');
    unclassifiedTransactions.forEach(tx => {
      const txDate = tx.date || tx.createdAt || 0;
      const isIncome = tx.type === 'income';
      const amount = parseFloat(tx.amount || 0);
      
      const item = document.createElement('div');
      item.className = 'border border-gray-200 p-3 bg-white';
      
      item.innerHTML = `
        <div class="flex items-center justify-between gap-2">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <input type="checkbox" 
                class="reconciliation-checkbox" data-transaction-id="${tx.id}"
                onchange="window.toggleTransactionReconciliation('${tx.id}', this.checked)">
              <span class="text-sm font-medium ${isIncome ? 'text-green-600' : 'text-red-600'}">
                ${isIncome ? '+' : '-'}${formatCurrency(Math.round(amount))}
              </span>
            </div>
            <div class="text-xs text-gray-600">
              <div>${escapeHtml(tx.description || 'Sin descripción')}</div>
              <div>${formatDate24h(txDate)}</div>
            </div>
          </div>
        </div>
      `;
      
      unclassifiedList.appendChild(item);
    });
  }

  // Render classified section
  if (classifiedTransactions.length > 0) {
    const classifiedSection = document.createElement('div');
    classifiedSection.className = 'mb-6';
    classifiedSection.innerHTML = `
      <h4 class="text-sm font-medium text-gray-700 mb-3 uppercase tracking-wider">Clasificados</h4>
      <div class="space-y-2" id="classified-transactions-list"></div>
    `;
    transactionsList.appendChild(classifiedSection);
    
    const classifiedList = document.getElementById('classified-transactions-list');
    classifiedTransactions.forEach(tx => {
      const txDate = tx.date || tx.createdAt || 0;
      const isIncome = tx.type === 'income';
      const amount = parseFloat(tx.amount || 0);
      // Only show categoryName if it's explicitly set (manual assignment)
      const categoryName = tx.categoryName || '';
      const categoryLabel = categoryName
        ? `<span class="text-xs uppercase text-blue-600 font-medium">${escapeHtml(categoryName)}</span>`
        : '';
      
      const item = document.createElement('div');
      item.className = 'border border-gray-200 p-3 bg-white';
      
      item.innerHTML = `
        <div class="flex items-center justify-between gap-2">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <input type="checkbox" 
                class="reconciliation-checkbox" data-transaction-id="${tx.id}"
                onchange="window.toggleTransactionReconciliation('${tx.id}', this.checked)">
              <span class="text-sm font-medium ${isIncome ? 'text-green-600' : 'text-red-600'}">
                ${isIncome ? '+' : '-'}${formatCurrency(Math.round(amount))}
              </span>
              ${categoryLabel}
            </div>
            <div class="text-xs text-gray-600">
              <div>${escapeHtml(tx.description || 'Sin descripción')}</div>
              <div>${formatDate24h(txDate)}</div>
            </div>
          </div>
        </div>
      `;
      
      classifiedList.appendChild(item);
    });
  }

  // Show message if no transactions
  if (unclassifiedTransactions.length === 0 && classifiedTransactions.length === 0) {
    transactionsList.innerHTML = '<p class="text-center text-gray-600 py-4">No hay transacciones pendientes para esta cuenta en el período seleccionado</p>';
  }
}

// Toggle transaction reconciliation
window.toggleTransactionReconciliation = async function(transactionId, reconciled) {
  try {
    const nrd = window.nrd;
    if (!nrd) {
      await window.NRDCommon?.showError?.('Servicio NRD no disponible');
      return;
    }

    const statementDateInput = document.getElementById('reconciliation-statement-date');
    const reconciliationDate = statementDateInput && statementDateInput.value ? 
      new Date(statementDateInput.value).getTime() : Date.now();

    const updates = {
      reconciled: reconciled,
      reconciledDate: reconciled ? reconciliationDate : null
    };

    await nrd.transactions.update(transactionId, updates);
    logger.info('Transaction reconciliation toggled', { transactionId, reconciled });
    
    // Re-render reconciliation
    await renderReconciliation();
    
  } catch (error) {
    logger.error('Error toggling transaction reconciliation', error);
    await window.NRDCommon?.showError?.(error.message || 'Error al actualizar conciliación');
  }
};

// Reconcile all transactions
async function reconcileAllTransactions() {
  const confirmed = await window.NRDCommon?.showConfirm?.('¿Marcar todas las transacciones como conciliadas?');
  if (!confirmed) return;

  try {
    const statementDateInput = document.getElementById('reconciliation-statement-date');
    const reconciliationDate = statementDateInput && statementDateInput.value ? 
      new Date(statementDateInput.value).getTime() : Date.now();

    const statementDate = new Date(statementDateInput.value);
    statementDate.setHours(23, 59, 59, 999);

    const accountTransactions = Object.values(currentTransactions || {}).filter(tx => {
      return tx.accountId === selectedAccountId && 
             (tx.date || tx.createdAt || 0) <= statementDate.getTime();
    });

    const nrd = window.nrd;
    if (!nrd) {
      await window.NRDCommon?.showError?.('Servicio NRD no disponible');
      return;
    }

    showSpinner('Conciliando transacciones...');

    for (const tx of accountTransactions) {
      if (!tx.reconciled) {
        await nrd.transactions.update(tx.id, {
          reconciled: true,
          reconciledDate: reconciliationDate
        });
      }
    }

    hideSpinner();
    await window.NRDCommon?.showSuccess?.('Todas las transacciones han sido marcadas como conciliadas');
    
    // Update account last reconciliation
    if (currentAccounts[selectedAccountId]) {
      await nrd.accounts.update(selectedAccountId, {
        lastReconciliationDate: reconciliationDate,
        lastBankBalance: currentBankBalance
      });
    }
    
    await renderReconciliation();
    
  } catch (error) {
    hideSpinner();
    logger.error('Error reconciling all transactions', error);
    await window.NRDCommon?.showError?.(error.message || 'Error al conciliar transacciones');
  }
}

// Unreconcile all transactions
async function unreconcileAllTransactions() {
  const confirmed = await window.NRDCommon?.showConfirm?.('¿Desmarcar todas las transacciones?');
  if (!confirmed) return;

  try {
    const accountTransactions = Object.values(currentTransactions || {}).filter(tx => {
      return tx.accountId === selectedAccountId;
    });

    const nrd = window.nrd;
    if (!nrd) {
      await window.NRDCommon?.showError?.('Servicio NRD no disponible');
      return;
    }

    showSpinner('Desmarcando transacciones...');

    for (const tx of accountTransactions) {
      if (tx.reconciled) {
        await nrd.transactions.update(tx.id, {
          reconciled: false,
          reconciledDate: null
        });
      }
    }

    hideSpinner();
    await window.NRDCommon?.showSuccess?.('Todas las transacciones han sido desmarcadas');
    
    await renderReconciliation();
    
  } catch (error) {
    hideSpinner();
    logger.error('Error unreconciling transactions', error);
    await window.NRDCommon?.showError?.(error.message || 'Error al desmarcar transacciones');
  }
}

// Show add adjustment modal
function showAddAdjustmentModal() {
  // Simple prompt for now - can be enhanced with a proper modal
  const description = prompt('Descripción del ajuste:');
  if (!description) return;

  const amountStr = prompt('Monto del ajuste (use coma para decimales):');
  if (!amountStr) return;

  const amount = parseAmount(amountStr);
  if (isNaN(amount)) {
    window.NRDCommon?.showError?.('Monto inválido');
    return;
  }

  createAdjustmentTransaction(description, amount);
}

// Create adjustment transaction
async function createAdjustmentTransaction(description, amount) {
  try {
    const nrd = window.nrd;
    if (!nrd) {
      await window.NRDCommon?.showError?.('Servicio NRD no disponible');
      return;
    }

    const statementDateInput = document.getElementById('reconciliation-statement-date');
    const adjustmentDate = statementDateInput && statementDateInput.value ? 
      new Date(statementDateInput.value).getTime() : Date.now();

    // Determine type based on amount
    const type = amount >= 0 ? 'income' : 'expense';
    const absAmount = Math.abs(amount);

    const transactionData = {
      type,
      description: `Ajuste: ${description}`,
      amount: absAmount,
      categoryId: null,
      categoryName: 'Ajuste de Conciliación',
      accountId: selectedAccountId,
      accountName: currentAccounts[selectedAccountId]?.name || 'Sin nombre',
      date: adjustmentDate,
      notes: 'Ajuste de conciliación bancaria',
      reconciled: true,
      reconciledDate: adjustmentDate,
      createdAt: Date.now()
    };

    showSpinner('Creando ajuste...');
    const transactionId = await nrd.transactions.create(transactionData);
    logger.info('Adjustment transaction created', { transactionId });
    hideSpinner();
    
    await window.NRDCommon?.showSuccess?.('Ajuste creado exitosamente');
    await renderReconciliation();
    
  } catch (error) {
    hideSpinner();
    logger.error('Error creating adjustment', error);
    await window.NRDCommon?.showError?.(error.message || 'Error al crear ajuste');
  }
}

// Hide reconciliation sections
function hideReconciliationSections() {
  const sections = [
    'reconciliation-statement-section',
    'reconciliation-summary',
    'reconciliation-transactions-section',
    'reconciliation-adjustments-section'
  ];
  
  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}

// Helper functions
function parseAmount(amountStr) {
  if (!amountStr) return 0;
  return parseFloat(amountStr.replace(/\./g, '').replace(',', '.')) || 0;
}

function formatNumber(value) {
  return (value || 0).toFixed(2).replace('.', ',');
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Make initializeReconciliation available globally
window.initializeReconciliation = initializeReconciliation;

// Cleanup function
export function cleanupReconciliation() {
  if (transactionsListener) {
    transactionsListener();
    transactionsListener = null;
  }
  if (accountsListener) {
    accountsListener();
    accountsListener = null;
  }
  selectedAccountId = null;
  currentSystemBalance = 0;
  currentBankBalance = 0;
}
