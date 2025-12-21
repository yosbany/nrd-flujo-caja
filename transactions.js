// Transaction management

let transactionsListener = null;
// Initialize with today's date by default
let transactionsSelectedFilterDate = (() => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
})();
let transactionsSearchText = '';

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
    
    // Filter by search text if provided
    if (transactionsSearchText && transactionsSearchText.trim()) {
      const searchLower = transactionsSearchText.toLowerCase().trim();
      transactionsToShow = transactionsToShow.filter(([id, transaction]) => {
        // Search in all transaction properties
        const description = (transaction.description || '').toLowerCase();
        const categoryName = (transaction.categoryName || '').toLowerCase();
        const accountName = (transaction.accountName || '').toLowerCase();
        const notes = (transaction.notes || '').toLowerCase();
        const amount = formatNumber(parseFloat(transaction.amount || 0)).toLowerCase();
        const date = transaction.date ? formatDate24h(new Date(transaction.date)) : '';
        const type = transaction.type === 'income' ? 'ingreso' : 'egreso';
        
        return description.includes(searchLower) ||
               categoryName.includes(searchLower) ||
               accountName.includes(searchLower) ||
               notes.includes(searchLower) ||
               amount.includes(searchLower) ||
               date.includes(searchLower) ||
               type.includes(searchLower);
      });
    }
    
    // Show filtered transactions
    if (transactionsToShow.length === 0) {
      if (transactionsSearchText && transactionsSearchText.trim()) {
        transactionsList.innerHTML = '<p class="text-center text-gray-600 py-6 sm:py-8 text-sm sm:text-base">No se encontraron transacciones que coincidan con la búsqueda</p>';
      } else if (transactionsSelectedFilterDate) {
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
  
  // Setup autocomplete input listener
  setupDescriptionAutocomplete();
}

// Setup description autocomplete listeners
function setupDescriptionAutocomplete() {
  const descriptionInput = document.getElementById('transaction-description');
  if (!descriptionInput) return;
  
  // Remove existing listeners by cloning
  const newInput = descriptionInput.cloneNode(true);
  descriptionInput.parentNode.replaceChild(newInput, descriptionInput);
  
  // Add new listeners
  newInput.addEventListener('input', (e) => {
    showDescriptionAutocomplete(e.target.value);
  });
  
  newInput.addEventListener('focus', (e) => {
    if (e.target.value) {
      showDescriptionAutocomplete(e.target.value);
    }
  });
  
  newInput.addEventListener('blur', () => {
    // Delay hiding to allow click on suggestion
    setTimeout(() => {
      const autocompleteList = document.getElementById('description-autocomplete-list');
      if (autocompleteList) {
        autocompleteList.classList.add('hidden');
      }
    }, 200);
  });
}

// Store descriptions for autocomplete
let availableDescriptions = [];

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
    
    // Store sorted descriptions
    availableDescriptions = Array.from(descriptions).sort();
  } catch (error) {
    console.error('Error loading descriptions:', error);
    availableDescriptions = [];
  }
}

// Show autocomplete suggestions
function showDescriptionAutocomplete(inputValue) {
  const autocompleteList = document.getElementById('description-autocomplete-list');
  if (!autocompleteList) return;
  
  // Filter descriptions based on input
  const filtered = availableDescriptions.filter(desc => 
    desc.toLowerCase().includes(inputValue.toLowerCase())
  );
  
  // If no matches or input is empty, hide list
  if (!inputValue || filtered.length === 0) {
    autocompleteList.classList.add('hidden');
    autocompleteList.innerHTML = '';
    return;
  }
  
  // Show filtered list
  autocompleteList.innerHTML = '';
  autocompleteList.classList.remove('hidden');
  
  // Limit to 10 suggestions
  filtered.slice(0, 10).forEach(desc => {
    const item = document.createElement('div');
    item.className = 'px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm';
    item.textContent = desc;
    item.addEventListener('click', () => {
      document.getElementById('transaction-description').value = desc;
      autocompleteList.classList.add('hidden');
    });
    autocompleteList.appendChild(item);
  });
}

// Hide autocomplete when clicking outside
document.addEventListener('click', (e) => {
  const autocompleteList = document.getElementById('description-autocomplete-list');
  const descriptionInput = document.getElementById('transaction-description');
  
  if (autocompleteList && descriptionInput && 
      !autocompleteList.contains(e.target) && 
      e.target !== descriptionInput) {
    autocompleteList.classList.add('hidden');
  }
});

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

function clearSearchInput() {
  const searchInput = document.getElementById('transactions-search-input');
  if (searchInput) {
    searchInput.value = '';
    transactionsSearchText = '';
  }
}

function setTransactionsToday() {
  transactionsSelectedFilterDate = new Date();
  transactionsSelectedFilterDate.setHours(0, 0, 0, 0);
  clearSearchInput();
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
  clearSearchInput();
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
  clearSearchInput();
  updateTransactionsDateFilterDisplay();
  loadTransactions();
}

function clearTransactionsDateFilter() {
  transactionsSelectedFilterDate = null;
  clearSearchInput();
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
    
    // Calculate totals
    let totalIngresos = 0;
    let totalEgresos = 0;
    dayTransactions.forEach(transaction => {
      const amount = parseFloat(transaction.amount) || 0;
      if (transaction.type === 'income') {
        totalIngresos += amount;
      } else {
        totalEgresos += amount;
      }
    });
    const totalDiferencia = totalIngresos - totalEgresos;
    
    // Generate PDF
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    let yPos = 20;
    const startX = 14;
    const pageWidth = doc.internal.pageSize.getWidth();
    const rightMargin = pageWidth - 14;
    
    // Title
    doc.setFontSize(20);
    doc.setFont(undefined, 'bold');
    doc.text('CIERRE DIARIO', pageWidth / 2, yPos, { align: 'center' });
    yPos += 8;
    
    // Date
    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    const dateStr = formatDate24h(reportDate);
    doc.text(dateStr, pageWidth / 2, yPos, { align: 'center' });
    yPos += 12;
    
    // Summary Box
    doc.setFillColor(245, 245, 245);
    doc.rect(startX, yPos, pageWidth - 28, 25, 'F');
    doc.setDrawColor(200, 200, 200);
    doc.rect(startX, yPos, pageWidth - 28, 25, 'D');
    
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text('Resumen del Día', startX + 5, yPos + 7);
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    const summaryX = startX + 10;
    const summaryY = yPos + 15;
    const summaryWidth = (pageWidth - 28) / 3;
    
    doc.text('Ingresos:', summaryX, summaryY);
    doc.setFont(undefined, 'bold');
    doc.text('$' + formatNumber(totalIngresos), summaryX, summaryY + 6);
    
    doc.setFont(undefined, 'normal');
    doc.text('Egresos:', summaryX + summaryWidth, summaryY);
    doc.setFont(undefined, 'bold');
    doc.text('$' + formatNumber(totalEgresos), summaryX + summaryWidth, summaryY + 6);
    
    doc.setFont(undefined, 'normal');
    doc.text('Balance:', summaryX + summaryWidth * 2, summaryY);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(totalDiferencia >= 0 ? 0 : 200, totalDiferencia >= 0 ? 150 : 0, 0);
    doc.text('$' + formatNumber(totalDiferencia), summaryX + summaryWidth * 2, summaryY + 6);
    doc.setTextColor(0, 0, 0);
    
    yPos += 32;
    
    // Account Summary Table
    if (accountSummary.length > 0) {
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text('Resumen de Cuentas', startX, yPos);
      yPos += 10;
      
      doc.setFontSize(9);
      const tableHeaders = ['Cuenta', 'Saldo Inicial', 'Saldo Final', 'Diferencia'];
      // Ajustar anchos para evitar solapamiento - usar todo el ancho disponible
      const pageAvailableWidth = pageWidth - (startX * 2);
      const colWidths = [90, 45, 45, 45];
      const headerHeight = 7;
      const tableWidth = colWidths.reduce((a, b) => a + b, 0);
      
      // Draw header background
      doc.setFillColor(230, 230, 230);
      doc.rect(startX, yPos - 6, tableWidth, headerHeight, 'F');
      
      // Draw header border
      doc.setDrawColor(150, 150, 150);
      doc.rect(startX, yPos - 6, tableWidth, headerHeight, 'D');
      
      let xPos = startX;
      
      // Headers with borders
      doc.setFont(undefined, 'bold');
      doc.setTextColor(0, 0, 0);
      const headerY = yPos - 5;
      tableHeaders.forEach((header, i) => {
        const align = i > 0 ? 'right' : 'left';
        const textX = i > 0 ? xPos + colWidths[i] - 3 : xPos + 3;
        doc.text(header, textX, headerY, { align: align });
        // Vertical line between columns
        if (i < tableHeaders.length - 1) {
          doc.setDrawColor(200, 200, 200);
          doc.line(xPos + colWidths[i], headerY - 5, xPos + colWidths[i], headerY + 2);
        }
        xPos += colWidths[i];
      });
      yPos += 3;
      
      // Data rows with borders
      doc.setFont(undefined, 'normal');
      accountSummary.forEach((acc) => {
        // Check if we need a new page
        if (yPos > 250) {
          doc.addPage();
          yPos = 20;
          // Redraw headers on new page
          doc.setFillColor(230, 230, 230);
          doc.rect(startX, yPos - 6, tableWidth, headerHeight, 'F');
          doc.setDrawColor(150, 150, 150);
          doc.rect(startX, yPos - 6, tableWidth, headerHeight, 'D');
          doc.setFont(undefined, 'bold');
          xPos = startX;
          const headerY = yPos - 5;
          tableHeaders.forEach((header, i) => {
            const align = i > 0 ? 'right' : 'left';
            const textX = i > 0 ? xPos + colWidths[i] - 3 : xPos + 3;
            doc.text(header, textX, headerY, { align: align });
            if (i < tableHeaders.length - 1) {
              doc.setDrawColor(200, 200, 200);
              doc.line(xPos + colWidths[i], headerY - 5, xPos + colWidths[i], headerY + 2);
            }
            xPos += colWidths[i];
          });
          yPos += 3;
        }
        
        xPos = startX;
        
        // Truncate account name if too long (approximately 27 chars for width 90)
        let accountName = acc.name;
        const maxChars = 27;
        if (accountName.length > maxChars) {
          accountName = accountName.substring(0, maxChars - 3) + '...';
        }
        
        const row = [
          accountName,
          '$' + formatNumber(acc.saldoInicial),
          '$' + formatNumber(acc.saldoFinal),
          '$' + formatNumber(acc.diferencia)
        ];
        
        const rowHeight = 6;
        const rowTop = yPos;
        
        // Draw row border
        doc.setDrawColor(220, 220, 220);
        doc.rect(startX, rowTop, tableWidth, rowHeight);
        
        // Draw row cells
        row.forEach((cell, i) => {
          const align = i > 0 ? 'right' : 'left';
          const textX = i > 0 ? xPos + colWidths[i] - 3 : xPos + 3;
          const textY = rowTop + 4.5;
          
          // For account name, allow wrapping if needed
          if (i === 0) {
            const lines = doc.splitTextToSize(String(cell), colWidths[i] - 6);
            let lineY = textY;
            lines.forEach((line, idx) => {
              if (idx === 0 || (rowTop + (idx + 1) * 4) <= rowTop + rowHeight - 1) {
                doc.text(line, textX, lineY, { align: align });
                lineY += 4;
              }
            });
          } else {
            doc.text(String(cell), textX, textY, { align: align });
          }
          
          // Vertical line between columns
          if (i < row.length - 1) {
            doc.setDrawColor(220, 220, 220);
            doc.line(xPos + colWidths[i], rowTop, xPos + colWidths[i], rowTop + rowHeight);
          }
          xPos += colWidths[i];
        });
        
        yPos = rowTop + rowHeight + 1;
      });
      
      yPos += 8;
    }
    
    // Transactions Table
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Movimientos del Día', startX, yPos);
    yPos += 10;
    
    doc.setFontSize(8);
    const transHeaders = ['Tipo', 'Hora', 'Categoría', 'Cuenta', 'Descripción', 'Monto'];
    // Ajustar anchos para mejor legibilidad
    const transColWidths = [18, 22, 42, 32, 52, 38];
    const transHeaderHeight = 7;
    const transTableWidth = transColWidths.reduce((a, b) => a + b, 0);
    
    // Draw header background
    doc.setFillColor(230, 230, 230);
    doc.rect(startX, yPos - 5, transTableWidth, transHeaderHeight, 'F');
    
    // Draw header border
    doc.setDrawColor(150, 150, 150);
    doc.rect(startX, yPos - 5, transTableWidth, transHeaderHeight, 'D');
    
    // Headers with borders
    doc.setFont(undefined, 'bold');
    xPos = startX;
    const transHeaderY = yPos - 5;
    transHeaders.forEach((header, i) => {
      const align = i === transHeaders.length - 1 ? 'right' : 'left';
      const textX = i === transHeaders.length - 1 ? xPos + transColWidths[i] - 2 : xPos + 2;
      doc.text(header, textX, transHeaderY, { align: align });
      // Vertical line between columns
      if (i < transHeaders.length - 1) {
        doc.setDrawColor(200, 200, 200);
        doc.line(xPos + transColWidths[i], transHeaderY - 5, xPos + transColWidths[i], transHeaderY + 2);
      }
      xPos += transColWidths[i];
    });
    yPos += 3;
    
    // Transaction rows with borders
    doc.setFont(undefined, 'normal');
    const sortedTransactions = dayTransactions.sort((a, b) => {
      const dateA = a.date || a.createdAt;
      const dateB = b.date || b.createdAt;
      return dateA - dateB;
    });
    
    sortedTransactions.forEach((transaction, idx) => {
      // Check if we need a new page
      if (yPos > 265) {
        doc.addPage();
        yPos = 20;
        // Redraw headers on new page
        doc.setFillColor(230, 230, 230);
        doc.rect(startX, yPos - 5, transTableWidth, transHeaderHeight, 'F');
        doc.setDrawColor(150, 150, 150);
        doc.rect(startX, yPos - 5, transTableWidth, transHeaderHeight, 'D');
        doc.setFont(undefined, 'bold');
        xPos = startX;
        const transHeaderY = yPos - 5;
        transHeaders.forEach((header, i) => {
          const align = i === transHeaders.length - 1 ? 'right' : 'left';
          const textX = i === transHeaders.length - 1 ? xPos + transColWidths[i] - 2 : xPos + 2;
          doc.text(header, textX, transHeaderY, { align: align });
          if (i < transHeaders.length - 1) {
            doc.setDrawColor(200, 200, 200);
            doc.line(xPos + transColWidths[i], transHeaderY - 5, xPos + transColWidths[i], transHeaderY + 2);
          }
          xPos += transColWidths[i];
        });
        yPos += 3;
        doc.setFont(undefined, 'normal');
      }
      
      const transDate = transaction.date ? new Date(transaction.date) : new Date(transaction.createdAt);
      const timeStr = transDate.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' });
      
      // Smart truncation based on column width (approximate chars: 42->22, 32->16, 52->26)
      let category = transaction.categoryName || 'Sin categoría';
      const maxCategoryChars = 22;
      if (category.length > maxCategoryChars) {
        category = category.substring(0, maxCategoryChars - 3) + '...';
      }
      
      let accountName = transaction.accountName || 'Sin cuenta';
      const maxAccountChars = 16;
      if (accountName.length > maxAccountChars) {
        accountName = accountName.substring(0, maxAccountChars - 3) + '...';
      }
      
      let description = transaction.description || '';
      const maxDescChars = 26;
      if (description.length > maxDescChars) {
        description = description.substring(0, maxDescChars - 3) + '...';
      }
      
      const amount = parseFloat(transaction.amount) || 0;
      const type = transaction.type === 'income' ? 'ING' : 'EGR';
      
      const transData = [
        type,
        timeStr,
        category,
        accountName,
        description,
        '$' + formatNumber(amount)
      ];
      
      // Fixed row height for consistency
      const rowHeight = 6;
      const rowTop = yPos;
      
      // Alternating row colors
      if (idx % 2 === 0) {
        doc.setFillColor(250, 250, 250);
        doc.rect(startX, rowTop, transTableWidth, rowHeight, 'F');
      }
      
      // Draw row border
      doc.setDrawColor(220, 220, 220);
      doc.rect(startX, rowTop, transTableWidth, rowHeight);
      
      // Set color for amount based on type
      const amountColor = transaction.type === 'income' ? [0, 150, 0] : [200, 0, 0];
      
      // Draw row cells with borders and text wrapping
      xPos = startX;
      transData.forEach((cell, i) => {
        const align = i === transData.length - 1 ? 'right' : 'left';
        const textX = i === transData.length - 1 ? xPos + transColWidths[i] - 2 : xPos + 2;
        const textY = rowTop + 4.5;
        
        // Set text color for amount and type
        if (i === transData.length - 1) {
          doc.setTextColor(...amountColor);
        } else if (i === 0) {
          doc.setTextColor(transaction.type === 'income' ? 0 : 200, transaction.type === 'income' ? 150 : 0, 0);
        } else {
          doc.setTextColor(0, 0, 0);
        }
        
        // Allow wrapping only for description column
        if (i === 4) { // Description column
          const lines = doc.splitTextToSize(String(cell), transColWidths[i] - 4);
          let lineY = textY;
          lines.forEach((line, lineIdx) => {
            if (lineIdx === 0 || (rowTop + (lineIdx + 1) * 4) <= rowTop + rowHeight - 1) {
              doc.text(line, textX, lineY, { align: align });
              lineY += 4;
            }
          });
        } else {
          doc.text(String(cell), textX, textY, { align: align });
        }
        
        // Reset text color
        doc.setTextColor(0, 0, 0);
        
        // Vertical line between columns
        if (i < transData.length - 1) {
          doc.setDrawColor(220, 220, 220);
          doc.line(xPos + transColWidths[i], rowTop, xPos + transColWidths[i], rowTop + rowHeight);
        }
        xPos += transColWidths[i];
      });
      
      yPos = rowTop + rowHeight + 1;
    });
    
    // Total row
    if (sortedTransactions.length > 0) {
      yPos += 2;
      const totalRowTop = yPos;
      const totalRowHeight = 8;
      
      doc.setFillColor(240, 240, 240);
      doc.rect(startX, totalRowTop, transTableWidth, totalRowHeight, 'F');
      doc.setDrawColor(150, 150, 150);
      doc.rect(startX, totalRowTop, transTableWidth, totalRowHeight);
      
      doc.setFont(undefined, 'bold');
      doc.setFontSize(9);
      doc.text('TOTALES:', startX + 2, totalRowTop + 5.5);
      const totalX = startX + transTableWidth - 2;
      doc.text('Ingresos: $' + formatNumber(totalIngresos), totalX, totalRowTop + 3, { align: 'right' });
      doc.setTextColor(0, 150, 0);
      doc.text('Egresos: $' + formatNumber(totalEgresos), totalX, totalRowTop + 5.5, { align: 'right' });
      doc.setTextColor(0, 0, 0);
      doc.setTextColor(totalDiferencia >= 0 ? 0 : 200, totalDiferencia >= 0 ? 150 : 0, 0);
      doc.text('Balance: $' + formatNumber(totalDiferencia), totalX, totalRowTop + 8, { align: 'right' });
      doc.setTextColor(0, 0, 0);
      
      yPos = totalRowTop + totalRowHeight + 8;
    } else {
      yPos += 8;
    }
    
    // Footer
    if (yPos > 260) {
      doc.addPage();
      yPos = 20;
    }
    
    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    doc.text('Firma del Responsable', startX, yPos);
    doc.setDrawColor(0, 0, 0);
    doc.line(startX, yPos + 3, startX + 80, yPos + 3);
    
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

// Setup autocomplete click outside handler
document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', (e) => {
    const autocompleteList = document.getElementById('description-autocomplete-list');
    const descriptionInput = document.getElementById('transaction-description');
    
    if (autocompleteList && descriptionInput && 
        !autocompleteList.contains(e.target) && 
        e.target !== descriptionInput) {
      autocompleteList.classList.add('hidden');
    }
  });
});

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
  
  // Setup search input listener
  const searchInput = document.getElementById('transactions-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      transactionsSearchText = e.target.value;
      loadTransactions(false); // Don't reinitialize date filter
    });
  }
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

