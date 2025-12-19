// Transaction management

let transactionsListener = null;
// Initialize with today's date by default
let transactionsSelectedFilterDate = (() => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
})();

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

// Load transactions
function loadTransactions(initializeToToday = true) {
  const transactionsList = document.getElementById('transactions-list');
  if (!transactionsList) return;
  
  // Initialize filter date to today if not set (only if initializeToToday is true)
  if (!transactionsSelectedFilterDate && initializeToToday) {
    transactionsSelectedFilterDate = new Date();
    transactionsSelectedFilterDate.setHours(0, 0, 0, 0);
  }
  
  // Update filter display
  updateTransactionsDateFilterDisplay();
  
  transactionsList.innerHTML = '';

  // Remove previous listener
  if (transactionsListener) {
    getTransactionsRef().off('value', transactionsListener);
    transactionsListener = null;
  }

  // Listen for transactions
  transactionsListener = getTransactionsRef().on('value', (snapshot) => {
    if (!transactionsList) return;
    transactionsList.innerHTML = '';
    const transactions = snapshot.val() || {};

    if (Object.keys(transactions).length === 0) {
      transactionsList.innerHTML = '<p class="text-center text-gray-600 py-6 sm:py-8 text-sm sm:text-base">No hay transacciones registradas</p>';
      return;
    }

    // Sort by date (newest first)
    const sortedTransactions = Object.entries(transactions).sort((a, b) => {
      const dateA = a[1].date || a[1].createdAt || 0;
      const dateB = b[1].date || b[1].createdAt || 0;
      return dateB - dateA;
    });

    // Filter transactions by date if filter is active
    let transactionsToShow = sortedTransactions;
    if (transactionsSelectedFilterDate) {
      const filterDateStart = new Date(transactionsSelectedFilterDate.getFullYear(), transactionsSelectedFilterDate.getMonth(), transactionsSelectedFilterDate.getDate(), 0, 0, 0, 0).getTime();
      const filterDateEnd = new Date(transactionsSelectedFilterDate.getFullYear(), transactionsSelectedFilterDate.getMonth(), transactionsSelectedFilterDate.getDate(), 23, 59, 59, 999).getTime();
      
      transactionsToShow = sortedTransactions.filter(([id, transaction]) => {
        const transactionDate = transaction.date || transaction.createdAt;
        if (!transactionDate) return false;
        return transactionDate >= filterDateStart && transactionDate <= filterDateEnd;
      });
    }
    
    // Show filtered transactions
    if (transactionsToShow.length === 0) {
      if (transactionsSelectedFilterDate) {
        transactionsList.innerHTML = '<p class="text-center text-gray-600 py-6 sm:py-8 text-sm sm:text-base">No hay transacciones para la fecha seleccionada</p>';
      } else {
        transactionsList.innerHTML = '<p class="text-center text-gray-600 py-6 sm:py-8 text-sm sm:text-base">No hay transacciones registradas</p>';
      }
      return;
    }
    
    transactionsToShow.forEach(([id, transaction]) => {
      const item = document.createElement('div');
      const isIncome = transaction.type === 'income';
      const borderColor = isIncome ? 'hover:border-green-600' : 'hover:border-red-600';
      const amountColor = isIncome ? 'text-green-600' : 'text-red-600';
      const prefix = isIncome ? '+' : '-';
      
      item.className = `border border-gray-200 p-3 sm:p-4 md:p-6 ${borderColor} transition-colors relative cursor-pointer`;
      item.dataset.transactionId = id;
      
      const date = transaction.date ? new Date(transaction.date) : new Date(transaction.createdAt);
      
      item.innerHTML = `
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0 mb-2 sm:mb-3">
          <div class="text-base sm:text-lg font-light">${escapeHtml(transaction.description || 'Sin descripción')}</div>
          <div class="text-base sm:text-lg font-light ${amountColor} font-medium">${prefix}$${formatNumber(parseFloat(transaction.amount || 0))}</div>
        </div>
        <div class="text-xs sm:text-sm text-gray-600 space-y-0.5 sm:space-y-1">
          <div>Fecha: ${formatDate24h(date)}</div>
          <div>Categoría: ${escapeHtml(transaction.categoryName || 'Sin categoría')}</div>
          <div>Cuenta: ${escapeHtml(transaction.accountName || 'Sin cuenta')}</div>
          ${transaction.notes ? `<div>Notas: ${escapeHtml(transaction.notes)}</div>` : ''}
        </div>
      `;
      
      item.addEventListener('click', () => viewTransaction(id));
      transactionsList.appendChild(item);
    });
  });
}

// Show new transaction form
async function showNewTransactionForm(type) {
  const form = document.getElementById('transaction-form');
  const list = document.getElementById('transactions-list');
  const header = document.querySelector('#transactions-view .flex.flex-col');
  const dateFilter = document.getElementById('transactions-date-filter-container');
  
  form.classList.remove('hidden');
  if (list) list.style.display = 'none';
  if (header) header.style.display = 'none';
  if (dateFilter) dateFilter.style.display = 'none';
  
  // Clear editing state
  delete form.dataset.editingTransactionId;
  
  // Set transaction type
  document.getElementById('transaction-type').value = type;
  
  // Reset form title
  const formTitle = document.getElementById('transaction-form-title');
  if (formTitle) {
    formTitle.textContent = type === 'income' ? 'Nuevo Ingreso' : 'Nuevo Egreso';
  }
  
  // Reset form
  document.getElementById('transaction-description').value = '';
  document.getElementById('transaction-amount').value = '';
  document.getElementById('transaction-notes').value = '';
  document.getElementById('transaction-account').value = '';
  
  // Set default date (today)
  const dateInput = document.getElementById('transaction-date');
  if (dateInput) {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    dateInput.value = `${year}-${month}-${day}`;
  }
  
  // Load categories for this type
  const categories = await loadCategoriesForTransaction(type);
  const categorySelect = document.getElementById('transaction-category');
  categorySelect.innerHTML = '<option value="">Seleccionar categoría</option>';
  categories.forEach(category => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    categorySelect.appendChild(option);
  });
  
  // Load accounts
  const accounts = await loadAccountsForTransaction();
  const accountSelect = document.getElementById('transaction-account');
  accountSelect.innerHTML = '<option value="">Seleccionar cuenta</option>';
  accounts.forEach(account => {
    const option = document.createElement('option');
    option.value = account.id;
    option.textContent = account.name;
    accountSelect.appendChild(option);
  });
  
  // Load unique descriptions for autocomplete
  await loadDescriptionsForAutocomplete();
}

// Load unique descriptions for autocomplete
async function loadDescriptionsForAutocomplete() {
  try {
    const transactionsSnapshot = await getTransactionsRef().once('value');
    const transactions = transactionsSnapshot.val() || {};
    
    // Extract unique descriptions
    const descriptions = new Set();
    Object.values(transactions).forEach(transaction => {
      if (transaction && transaction.description && transaction.description.trim()) {
        descriptions.add(transaction.description.trim());
      }
    });
    
    // Populate datalist
    const datalist = document.getElementById('description-list');
    if (datalist) {
      datalist.innerHTML = '';
      Array.from(descriptions).sort().forEach(desc => {
        const option = document.createElement('option');
        option.value = desc;
        datalist.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Error loading descriptions:', error);
  }
}

// Hide transaction form
function hideTransactionForm() {
  const form = document.getElementById('transaction-form');
  const list = document.getElementById('transactions-list');
  const header = document.querySelector('#transactions-view .flex.flex-col');
  const dateFilter = document.getElementById('transactions-date-filter-container');
  
  form.classList.add('hidden');
  if (list) list.style.display = 'block';
  if (header) header.style.display = 'flex';
  if (dateFilter) dateFilter.style.display = 'flex';
}

// Save transaction
async function saveTransaction() {
  const form = document.getElementById('transaction-form');
  const isEditing = form.dataset.editingTransactionId;
  
  const type = document.getElementById('transaction-type').value;
  const description = document.getElementById('transaction-description').value.trim();
  const amount = parseFloat(document.getElementById('transaction-amount').value);
  const categoryId = document.getElementById('transaction-category').value;
  const accountId = document.getElementById('transaction-account').value;
  const dateInput = document.getElementById('transaction-date').value;
  const notes = document.getElementById('transaction-notes').value.trim();

  if (!description || isNaN(amount) || amount <= 0) {
    await showError('Por favor complete todos los campos correctamente');
    return;
  }

  if (!categoryId) {
    await showError('Por favor seleccione una categoría');
    return;
  }

  if (!accountId) {
    await showError('Por favor seleccione una cuenta');
    return;
  }

  try {
    // Get category data
    const categorySnapshot = await getCategory(categoryId);
    const category = categorySnapshot.val();
    if (!category) {
      await showError('Categoría no encontrada');
      return;
    }

    // Get account data
    const accountSnapshot = await getAccount(accountId);
    const account = accountSnapshot.val();
    if (!account) {
      await showError('Cuenta no encontrada');
      return;
    }

    // Parse date - default to today if not provided
    let transactionDate;
    if (dateInput) {
      // Parse date string (YYYY-MM-DD) as local date to avoid timezone issues
      const [year, month, day] = dateInput.split('-').map(Number);
      const dateObj = new Date(year, month - 1, day);
      // Set to start of day (00:00:00) to match filter behavior
      dateObj.setHours(0, 0, 0, 0);
      transactionDate = dateObj.getTime();
    } else {
      // Default to today at start of day
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      transactionDate = today.getTime();
    }

    if (isEditing) {
      // Update existing transaction
      const transactionId = isEditing;
      const existingTransactionSnapshot = await getTransaction(transactionId);
      const existingTransaction = existingTransactionSnapshot.val();
      
      const transactionData = {
        type,
        description,
        amount,
        categoryId,
        categoryName: category.name,
        accountId,
        accountName: account.name,
        date: transactionDate,
        notes: notes || null,
        createdAt: existingTransaction.createdAt, // Preserve original creation date
        updatedAt: Date.now()
      };

      showSpinner('Actualizando transacción...');
      await updateTransaction(transactionId, transactionData);
      hideSpinner();
      hideTransactionForm();
      await showSuccess('Transacción actualizada exitosamente');
    } else {
      // Create new transaction
      const transactionData = {
        type,
        description,
        amount,
        categoryId,
        categoryName: category.name,
        accountId,
        accountName: account.name,
        date: transactionDate,
        notes: notes || null,
        createdAt: Date.now()
      };

      showSpinner('Guardando transacción...');
      await createTransaction(transactionData);
      hideSpinner();
      hideTransactionForm();
      await showSuccess('Transacción guardada exitosamente');
    }
  } catch (error) {
    hideSpinner();
    await showError('Error al guardar transacción: ' + error.message);
  }
}

// View transaction detail
async function viewTransaction(transactionId) {
  showSpinner('Cargando transacción...');
  try {
    const snapshot = await getTransaction(transactionId);
    const transaction = snapshot.val();
    hideSpinner();
    if (!transaction) {
      await showError('Transacción no encontrada');
      return;
    }

    const list = document.getElementById('transactions-list');
    const header = document.querySelector('#transactions-view .flex.flex-col');
    const form = document.getElementById('transaction-form');
    const dateFilter = document.getElementById('transactions-date-filter-container');
    
    if (list) list.style.display = 'none';
    if (header) header.style.display = 'none';
    if (form) form.classList.add('hidden');
    if (dateFilter) dateFilter.style.display = 'none';
    document.getElementById('transaction-detail').classList.remove('hidden');

    const date = transaction.date ? new Date(transaction.date) : new Date(transaction.createdAt);
    const isIncome = transaction.type === 'income';
    const amountColor = isIncome ? 'text-green-600' : 'text-red-600';
    const prefix = isIncome ? '+' : '-';
    const typeText = isIncome ? 'Ingreso' : 'Egreso';

    document.getElementById('transaction-detail-content').innerHTML = `
      <div class="py-4 sm:py-6 mb-4 sm:mb-6">
        <div class="flex justify-between py-2 sm:py-3 border-b border-gray-200 text-sm sm:text-base">
          <span class="text-gray-600 font-light">Tipo:</span>
          <span class="font-light ${amountColor}">${typeText}</span>
        </div>
        <div class="flex justify-between py-2 sm:py-3 border-b border-gray-200 text-sm sm:text-base">
          <span class="text-gray-600 font-light">Descripción:</span>
          <span class="font-light">${escapeHtml(transaction.description)}</span>
        </div>
        <div class="flex justify-between py-2 sm:py-3 border-b border-gray-200 text-sm sm:text-base">
          <span class="text-gray-600 font-light">Monto:</span>
          <span class="font-light ${amountColor} font-medium">${prefix}$${formatNumber(parseFloat(transaction.amount || 0))}</span>
        </div>
        <div class="flex justify-between py-2 sm:py-3 border-b border-gray-200 text-sm sm:text-base">
          <span class="text-gray-600 font-light">Categoría:</span>
          <span class="font-light">${escapeHtml(transaction.categoryName || 'Sin categoría')}</span>
        </div>
        <div class="flex justify-between py-2 sm:py-3 border-b border-gray-200 text-sm sm:text-base">
          <span class="text-gray-600 font-light">Cuenta:</span>
          <span class="font-light">${escapeHtml(transaction.accountName || 'Sin cuenta')}</span>
        </div>
        <div class="flex justify-between py-2 sm:py-3 border-b border-gray-200 text-sm sm:text-base">
          <span class="text-gray-600 font-light">Fecha:</span>
          <span class="font-light">${formatDate24h(date)}</span>
        </div>
        ${transaction.notes ? `
        <div class="flex justify-between py-2 sm:py-3 border-b border-gray-200 text-sm sm:text-base">
          <span class="text-gray-600 font-light">Notas:</span>
          <span class="font-light text-right">${escapeHtml(transaction.notes)}</span>
        </div>
        ` : ''}
      </div>
    `;

    // Store transaction data for edit/delete
    document.getElementById('transaction-detail').dataset.transactionId = transactionId;
    document.getElementById('transaction-detail').dataset.transactionData = JSON.stringify(transaction);
    
    // Attach button handlers
    const editBtn = document.getElementById('edit-transaction-btn');
    const deleteBtn = document.getElementById('delete-transaction-btn');
    
    if (editBtn) {
      editBtn.onclick = () => editTransaction(transactionId, transaction);
    }
    
    if (deleteBtn) {
      deleteBtn.onclick = () => deleteTransactionHandler(transactionId);
    }
  } catch (error) {
    hideSpinner();
    await showError('Error al cargar transacción: ' + error.message);
  }
}

// Back to transactions list
function backToTransactions() {
  const list = document.getElementById('transactions-list');
  const header = document.querySelector('#transactions-view .flex.flex-col');
  const detail = document.getElementById('transaction-detail');
  const dateFilter = document.getElementById('transactions-date-filter-container');
  
  if (list) list.style.display = 'block';
  if (header) header.style.display = 'flex';
  if (detail) detail.classList.add('hidden');
  if (dateFilter) dateFilter.style.display = 'flex';
}

// Edit transaction
async function editTransaction(transactionId, transaction) {
  // Hide detail view and show form
  document.getElementById('transaction-detail').classList.add('hidden');
  
  const form = document.getElementById('transaction-form');
  const list = document.getElementById('transactions-list');
  const header = document.querySelector('#transactions-view .flex.flex-col');
  const dateFilter = document.getElementById('transactions-date-filter-container');
  
  form.classList.remove('hidden');
  if (list) list.style.display = 'none';
  if (header) header.style.display = 'none';
  if (dateFilter) dateFilter.style.display = 'none';
  
  // Set form title
  const formTitle = document.getElementById('transaction-form-title');
  if (formTitle) {
    formTitle.textContent = 'Editar Transacción';
  }
  
  // Store transaction ID for update
  form.dataset.editingTransactionId = transactionId;
  
  // Load form data
  document.getElementById('transaction-type').value = transaction.type;
  document.getElementById('transaction-description').value = transaction.description || '';
  document.getElementById('transaction-amount').value = transaction.amount || '';
  document.getElementById('transaction-notes').value = transaction.notes || '';
  
  // Set date - use local date to avoid timezone issues
  const dateInput = document.getElementById('transaction-date');
  if (transaction.date && dateInput) {
    // Create date from timestamp using local timezone
    const date = new Date(transaction.date);
    // Use UTC methods to get the date components that were originally set
    // Since we store as local midnight, we need to get local date components
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    dateInput.value = `${year}-${month}-${day}`;
  }
  
  // Load categories for this type
  const categories = await loadCategoriesForTransaction(transaction.type);
  const categorySelect = document.getElementById('transaction-category');
  categorySelect.innerHTML = '<option value="">Seleccionar categoría</option>';
  categories.forEach(category => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    option.selected = category.id === transaction.categoryId;
    categorySelect.appendChild(option);
  });
  
  // Load accounts
  const accounts = await loadAccountsForTransaction();
  const accountSelect = document.getElementById('transaction-account');
  accountSelect.innerHTML = '<option value="">Seleccionar cuenta</option>';
  accounts.forEach(account => {
    const option = document.createElement('option');
    option.value = account.id;
    option.textContent = account.name;
    option.selected = account.id === transaction.accountId;
    accountSelect.appendChild(option);
  });
}

// Delete transaction handler
async function deleteTransactionHandler(transactionId) {
  const confirmed = await showConfirm('Eliminar Transacción', '¿Está seguro de eliminar esta transacción?');
  if (!confirmed) return;

  showSpinner('Eliminando transacción...');
  try {
    await deleteTransaction(transactionId);
    hideSpinner();
    backToTransactions();
    await showSuccess('Transacción eliminada exitosamente');
  } catch (error) {
    hideSpinner();
    await showError('Error al eliminar transacción: ' + error.message);
  }
}

// Event listeners
document.getElementById('new-income-btn').addEventListener('click', () => showNewTransactionForm('income'));
document.getElementById('new-expense-btn').addEventListener('click', () => showNewTransactionForm('expense'));
document.getElementById('cancel-transaction-btn').addEventListener('click', hideTransactionForm);
document.getElementById('transaction-form-element').addEventListener('submit', async (e) => {
  e.preventDefault();
  await saveTransaction();
});
document.getElementById('back-to-transactions').addEventListener('click', backToTransactions);
document.getElementById('close-transaction-form').addEventListener('click', hideTransactionForm);

// Date filter handlers
function updateTransactionsDateFilterDisplay() {
  const display = document.getElementById('transactions-filter-date-display');
  if (!display) return;
  
  if (transactionsSelectedFilterDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const filterDate = new Date(transactionsSelectedFilterDate);
    filterDate.setHours(0, 0, 0, 0);
    
    if (filterDate.getTime() === today.getTime()) {
      display.textContent = 'Hoy';
    } else {
      display.textContent = formatDate24h(transactionsSelectedFilterDate);
    }
  } else {
    display.textContent = 'Todas';
  }
}

function setTransactionsToday() {
  transactionsSelectedFilterDate = new Date();
  transactionsSelectedFilterDate.setHours(0, 0, 0, 0);
  updateTransactionsDateFilterDisplay();
  loadTransactions();
}

function prevTransactionsDate() {
  if (!transactionsSelectedFilterDate) {
    transactionsSelectedFilterDate = new Date();
    transactionsSelectedFilterDate.setHours(0, 0, 0, 0);
  } else {
    const prev = new Date(transactionsSelectedFilterDate);
    prev.setDate(prev.getDate() - 1);
    prev.setHours(0, 0, 0, 0);
    transactionsSelectedFilterDate = prev;
  }
  updateTransactionsDateFilterDisplay();
  loadTransactions();
}

function nextTransactionsDate() {
  if (!transactionsSelectedFilterDate) {
    transactionsSelectedFilterDate = new Date();
    transactionsSelectedFilterDate.setHours(0, 0, 0, 0);
  } else {
    const next = new Date(transactionsSelectedFilterDate);
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);
    transactionsSelectedFilterDate = next;
  }
  updateTransactionsDateFilterDisplay();
  loadTransactions();
}

function clearTransactionsDateFilter() {
  transactionsSelectedFilterDate = null;
  updateTransactionsDateFilterDisplay();
  // Pass false to prevent re-initializing to today
  loadTransactions(false);
}

// Report modal functions
function showReportModal() {
  const modal = document.getElementById('report-date-modal');
  const dateInput = document.getElementById('report-date');
  
  if (!modal) {
    console.error('Modal not found');
    return;
  }
  
  modal.classList.remove('hidden');
  
  // Set default date from filter if available
  if (dateInput && transactionsSelectedFilterDate) {
    const dateStr = transactionsSelectedFilterDate.toISOString().split('T')[0];
    dateInput.value = dateStr;
    dateInput.required = false; // Not required if we have a default
  } else {
    if (dateInput) {
      dateInput.required = true; // Required if no filter date
      dateInput.value = '';
    }
  }
}

function hideReportModal() {
  const modal = document.getElementById('report-date-modal');
  if (modal) modal.classList.add('hidden');
}

// Make hideReportModal available globally
window.hideReportModal = hideReportModal;

// Format number with comma for decimals and point for thousands
function formatNumber(number) {
  return number.toLocaleString('es-UY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// Generate daily report PDF
async function generateDailyReport(reportDate) {
  showSpinner('Generando reporte...');
  
  try {
    // Get all data
    const [transactionsSnapshot, accountsSnapshot] = await Promise.all([
      getTransactionsRef().once('value'),
      getAccountsRef().once('value')
    ]);
    
    const allTransactions = transactionsSnapshot.val() || {};
    const accounts = accountsSnapshot.val() || {};
    
    // Filter transactions for the selected date
    const dateStart = new Date(reportDate.getFullYear(), reportDate.getMonth(), reportDate.getDate(), 0, 0, 0, 0).getTime();
    const dateEnd = new Date(reportDate.getFullYear(), reportDate.getMonth(), reportDate.getDate(), 23, 59, 59, 999).getTime();
    
    const dayTransactions = Object.values(allTransactions).filter(transaction => {
      const transactionDate = transaction.date || transaction.createdAt;
      return transactionDate >= dateStart && transactionDate <= dateEnd;
    });
    
    // Calculate account balances
    const accountBalances = {};
    const accountInitialBalances = {};
    
    // Calculate initial balances (all transactions before the report date)
    Object.values(allTransactions).forEach(transaction => {
      const transactionDate = transaction.date || transaction.createdAt;
      if (transactionDate < dateStart && transaction.accountId) {
        const accountId = transaction.accountId;
        if (!accountInitialBalances[accountId]) {
          accountInitialBalances[accountId] = 0;
        }
        const amount = parseFloat(transaction.amount) || 0;
        if (transaction.type === 'income') {
          accountInitialBalances[accountId] += amount;
        } else {
          accountInitialBalances[accountId] -= amount;
        }
      }
    });
    
    // Calculate current balances (initial + day transactions)
    Object.keys(accounts).forEach(accountId => {
      accountBalances[accountId] = accountInitialBalances[accountId] || 0;
    });
    
    dayTransactions.forEach(transaction => {
      if (transaction.accountId) {
        const accountId = transaction.accountId;
        if (!accountBalances[accountId]) {
          accountBalances[accountId] = accountInitialBalances[accountId] || 0;
        }
        const amount = parseFloat(transaction.amount) || 0;
        if (transaction.type === 'income') {
          accountBalances[accountId] += amount;
        } else {
          accountBalances[accountId] -= amount;
        }
      }
    });
    
    // Prepare account summary data
    const accountSummary = [];
    
    Object.entries(accounts).forEach(([id, account]) => {
      const saldoFinal = accountBalances[id] || 0;
      const saldoInicial = accountInitialBalances[id] || 0;
      const diferencia = saldoFinal - saldoInicial;
      
      accountSummary.push({
        name: account.name,
        saldoInicial: saldoInicial,
        saldoFinal: saldoFinal,
        diferencia: diferencia
      });
    });
    
    // Sort accounts by name
    accountSummary.sort((a, b) => a.name.localeCompare(b.name));
    
    // Generate PDF
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    let yPos = 20;
    
    // Title
    doc.setFontSize(18);
    doc.text('Cierre Diario', 105, yPos, { align: 'center' });
    yPos += 10;
    
    // Date
    doc.setFontSize(12);
    const dateStr = formatDate24h(reportDate);
    doc.text(dateStr, 105, yPos, { align: 'center' });
    yPos += 15;
    
    // Account Summary Table
    doc.setFontSize(14);
    doc.text('Resumen de Cuentas', 14, yPos);
    yPos += 8;
    
    doc.setFontSize(10);
    const tableHeaders = ['Nombre de Cuenta', 'Saldo Inicial', 'Saldo Final', 'Diferencia'];
    const colWidths = [70, 40, 40, 40];
    const startX = 14;
    const headerHeight = 8;
    
    // Draw header background
    doc.setFillColor(220, 220, 220);
    doc.rect(startX, yPos - 5, colWidths.reduce((a, b) => a + b, 0), headerHeight, 'F');
    
    let xPos = startX;
    
    // Headers
    doc.setFont(undefined, 'bold');
    tableHeaders.forEach((header, i) => {
      doc.text(header, xPos, yPos);
      xPos += colWidths[i];
    });
    yPos += headerHeight;
    
    // Data rows
    doc.setFont(undefined, 'normal');
    accountSummary.forEach(acc => {
      xPos = startX;
      const row = [
        acc.name,
        formatNumber(acc.saldoInicial),
        formatNumber(acc.saldoFinal),
        formatNumber(acc.diferencia)
      ];
      
      let maxHeight = 6; // Default row height
      row.forEach((cell, i) => {
        const cellText = String(cell);
        const lines = doc.splitTextToSize(cellText, colWidths[i] - 2);
        const cellHeight = lines.length * 5;
        if (cellHeight > maxHeight) {
          maxHeight = cellHeight;
        }
      });
      
      // Draw row
      row.forEach((cell, i) => {
        const cellText = String(cell);
        const lines = doc.splitTextToSize(cellText, colWidths[i] - 2);
        let lineY = yPos;
        lines.forEach((line, lineIdx) => {
          doc.text(line, xPos + 1, lineY);
          lineY += 5;
        });
        xPos += colWidths[i];
      });
      
      yPos += maxHeight;
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }
    });
    
    yPos += 10;
    
    // Transactions Table
    doc.setFontSize(14);
    doc.text('Movimientos', 14, yPos);
    yPos += 8;
    
    doc.setFontSize(9);
    const transHeaders = ['Fecha', 'Categoría', 'Cuenta', 'Descripción', '$ Monto'];
    const transColWidths = [25, 40, 40, 60, 30];
    const transHeaderHeight = 8;
    
    // Draw header background
    doc.setFillColor(220, 220, 220);
    doc.rect(startX, yPos - 5, transColWidths.reduce((a, b) => a + b, 0), transHeaderHeight, 'F');
    
    // Headers
    doc.setFont(undefined, 'bold');
    xPos = startX;
    transHeaders.forEach((header, i) => {
      doc.text(header, xPos, yPos);
      xPos += transColWidths[i];
    });
    yPos += transHeaderHeight;
    
    // Transaction rows
    doc.setFont(undefined, 'normal');
    dayTransactions.sort((a, b) => {
      const dateA = a.date || a.createdAt;
      const dateB = b.date || b.createdAt;
      return dateA - dateB;
    }).forEach(transaction => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
        // Redraw headers on new page
        doc.setFillColor(220, 220, 220);
        doc.rect(startX, yPos - 5, transColWidths.reduce((a, b) => a + b, 0), transHeaderHeight, 'F');
        doc.setFont(undefined, 'bold');
        xPos = startX;
        transHeaders.forEach((header, i) => {
          doc.text(header, xPos, yPos);
          xPos += transColWidths[i];
        });
        yPos += transHeaderHeight;
        doc.setFont(undefined, 'normal');
      }
      
      const transDate = transaction.date ? new Date(transaction.date) : new Date(transaction.createdAt);
      const dateStr = formatDate24h(transDate);
      const category = transaction.categoryName || 'Sin categoría';
      const accountName = transaction.accountName || 'Sin cuenta';
      const description = transaction.description || '';
      const amount = parseFloat(transaction.amount) || 0;
      const amountStr = (transaction.type === 'income' ? '+' : '-') + formatNumber(amount);
      
      const transData = [dateStr, category, accountName, description, amountStr];
      
      // Calculate max height for this row
      let maxHeight = 6;
      transData.forEach((cell, i) => {
        const cellText = String(cell);
        const lines = doc.splitTextToSize(cellText, transColWidths[i] - 2);
        const cellHeight = lines.length * 4.5;
        if (cellHeight > maxHeight) {
          maxHeight = cellHeight;
        }
      });
      
      // Draw row with text wrapping
      xPos = startX;
      transData.forEach((cell, i) => {
        const cellText = String(cell);
        const lines = doc.splitTextToSize(cellText, transColWidths[i] - 2);
        let lineY = yPos;
        lines.forEach((line) => {
          doc.text(line, xPos + 1, lineY);
          lineY += 4.5;
        });
        xPos += transColWidths[i];
      });
      
      yPos += maxHeight;
    });
    
    yPos += 10;
    
    // Footer
    if (yPos > 250) {
      doc.addPage();
      yPos = 20;
    }
    
    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    doc.text('Firma del Responsable', 14, yPos);
    doc.line(14, yPos + 3, 80, yPos + 3);
    
    // Save PDF
    const fileName = `cierre-${reportDate.getFullYear()}-${String(reportDate.getMonth() + 1).padStart(2, '0')}-${String(reportDate.getDate()).padStart(2, '0')}.pdf`;
    doc.save(fileName);
    
    hideSpinner();
    await showSuccess('Reporte generado exitosamente');
  } catch (error) {
    hideSpinner();
    console.error('Error generating report:', error);
    await showError('Error al generar el reporte: ' + error.message);
  }
}

// Setup report button and modal handlers
function setupReportHandlers() {
  // Report button
  const reportBtn = document.getElementById('report-btn');
  if (reportBtn) {
    // Remove existing listener if any
    reportBtn.removeEventListener('click', showReportModal);
    reportBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showReportModal();
    });
  }
  
  // Report modal handlers
  const modal = document.getElementById('report-date-modal');
  const closeReportModal = document.getElementById('close-report-modal');
  const cancelReportBtn = document.getElementById('cancel-report-btn');
  const reportDateForm = document.getElementById('report-date-form');
  
  // Close modal when clicking outside
  if (modal) {
    modal.removeEventListener('click', handleModalOutsideClick);
    modal.addEventListener('click', handleModalOutsideClick);
  }
  
  if (closeReportModal) {
    closeReportModal.removeEventListener('click', hideReportModal);
    closeReportModal.addEventListener('click', hideReportModal);
  }
  
  if (cancelReportBtn) {
    cancelReportBtn.removeEventListener('click', hideReportModal);
    cancelReportBtn.addEventListener('click', hideReportModal);
  }
  
  if (reportDateForm) {
    reportDateForm.removeEventListener('submit', handleReportSubmit);
    reportDateForm.addEventListener('submit', handleReportSubmit);
  }
}

function handleModalOutsideClick(e) {
  if (e.target.id === 'report-date-modal') {
    hideReportModal();
  }
}

async function handleReportSubmit(e) {
  e.preventDefault();
  const dateInput = document.getElementById('report-date');
  if (!dateInput || !dateInput.value) {
    await showError('Por favor seleccione una fecha');
    return;
  }
  
  const selectedDate = new Date(dateInput.value);
  selectedDate.setHours(0, 0, 0, 0);
  hideReportModal();
  await generateDailyReport(selectedDate);
}

// Initialize filter display on page load
document.addEventListener('DOMContentLoaded', () => {
  updateTransactionsDateFilterDisplay();
  setupReportHandlers();
});

document.getElementById('transactions-today-date-btn').addEventListener('click', setTransactionsToday);
document.getElementById('transactions-prev-date-btn').addEventListener('click', prevTransactionsDate);
document.getElementById('transactions-next-date-btn').addEventListener('click', nextTransactionsDate);
document.getElementById('transactions-clear-date-filter-btn').addEventListener('click', clearTransactionsDateFilter);

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

