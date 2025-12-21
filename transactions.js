// Transaction management

let transactionsListener = null;
// Initialize with today's date by default
let transactionsSelectedFilterDate = (() => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
})();
let transactionsSearchText = '';

// Get abbreviated day of week (first 3 letters in Spanish)
function getAbbreviatedDayOfWeek(date) {
  const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  return days[date.getDay()];
}

// Format date in 24-hour format
function formatDate24h(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

// Format date with day of week
function formatDateWithDay(date) {
  const dayOfWeek = getAbbreviatedDayOfWeek(date);
  const dateStr = formatDate24h(date);
  return `${dayOfWeek}, ${dateStr}`;
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
    let dayTransactions = []; // Transactions for the selected day (before search filter)
    
    if (transactionsSelectedFilterDate) {
      const filterDateStart = new Date(transactionsSelectedFilterDate.getFullYear(), transactionsSelectedFilterDate.getMonth(), transactionsSelectedFilterDate.getDate(), 0, 0, 0, 0).getTime();
      const filterDateEnd = new Date(transactionsSelectedFilterDate.getFullYear(), transactionsSelectedFilterDate.getMonth(), transactionsSelectedFilterDate.getDate(), 23, 59, 59, 999).getTime();
      
      dayTransactions = sortedTransactions.filter(([id, transaction]) => {
        const transactionDate = transaction.date || transaction.createdAt;
        if (!transactionDate) return false;
        return transactionDate >= filterDateStart && transactionDate <= filterDateEnd;
      });
      
      transactionsToShow = dayTransactions;
    } else {
      // Hide summary if no date is selected
      const summaryContainer = document.getElementById('transactions-day-summary');
      if (summaryContainer) {
        summaryContainer.classList.add('hidden');
      }
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
    
    // Calculate totals for the selected day (after applying search filter)
    if (transactionsSelectedFilterDate) {
      updateDaySummary(transactionsToShow);
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
          <div class="text-base sm:text-lg font-light">${escapeHtml(transaction.description || 'Sin subcategoría')}</div>
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
  delete form.dataset.viewMode;
  
  // Enable all fields
  const formInputs = form.querySelectorAll('input, select, textarea');
  formInputs.forEach(input => {
    input.removeAttribute('readonly');
    input.removeAttribute('disabled');
  });
  
  // Update button visibility - hide delete button for new transactions
  const deleteBtn = document.getElementById('delete-transaction-form-btn');
  const editBtn = document.getElementById('edit-transaction-form-btn');
  const closeBtn = document.getElementById('close-transaction-form-btn');
  const saveBtn = document.getElementById('save-transaction-form-btn');
  
  if (deleteBtn) {
    deleteBtn.classList.add('hidden');
    deleteBtn.style.display = 'none';
  }
  if (editBtn) {
    editBtn.classList.add('hidden');
    editBtn.style.display = 'none';
  }
  if (closeBtn) {
    closeBtn.classList.remove('hidden');
    closeBtn.style.display = 'flex';
  }
  if (saveBtn) {
    saveBtn.classList.remove('hidden');
    saveBtn.style.display = 'flex';
    saveBtn.textContent = 'Guardar';
  }
  
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
  
  // Clear form state
  delete form.dataset.editingTransactionId;
  delete form.dataset.viewMode;
  delete form.dataset.transactionData;
  
  // Enable all fields
  const formInputs = form.querySelectorAll('input, select, textarea');
  formInputs.forEach(input => {
    input.removeAttribute('readonly');
    input.removeAttribute('disabled');
  });
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
      
      // Reload transaction to show updated data in view mode
      await viewTransaction(transactionId);
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
      const newTransactionRef = await createTransaction(transactionData);
      hideSpinner();
      
      // Close form for new transactions
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
    const detail = document.getElementById('transaction-detail');
    
    if (list) list.style.display = 'none';
    if (header) header.style.display = 'none';
    if (detail) detail.classList.add('hidden');
    if (dateFilter) dateFilter.style.display = 'none';
    if (form) form.classList.remove('hidden');
    
    // Set form to view mode (readonly)
    form.dataset.viewMode = 'view';
    form.dataset.editingTransactionId = transactionId;
    
    // Set form title
    const formTitle = document.getElementById('transaction-form-title');
    if (formTitle) {
      formTitle.textContent = 'Ver Transacción';
    }
    
    // Load form data in readonly mode
    document.getElementById('transaction-type').value = transaction.type;
    document.getElementById('transaction-description').value = transaction.description || '';
    document.getElementById('transaction-amount').value = transaction.amount || '';
    document.getElementById('transaction-notes').value = transaction.notes || '';
    
    // Set date
    const dateInput = document.getElementById('transaction-date');
    if (transaction.date && dateInput) {
      const date = new Date(transaction.date);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      dateInput.value = `${year}-${month}-${day}`;
    }
    
    // Load categories and accounts
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
    
    // Make all fields readonly
    const formInputs = form.querySelectorAll('input, select, textarea');
    formInputs.forEach(input => {
      input.setAttribute('readonly', 'readonly');
      input.setAttribute('disabled', 'disabled');
    });
    
    // Update buttons for view mode
    const editBtn = document.getElementById('edit-transaction-form-btn');
    const deleteBtn = document.getElementById('delete-transaction-form-btn');
    const closeBtn = document.getElementById('close-transaction-form-btn');
    const saveBtn = document.getElementById('save-transaction-form-btn');
    
    if (editBtn) {
      editBtn.classList.remove('hidden');
      editBtn.style.display = 'flex';
    }
    if (deleteBtn) {
      deleteBtn.classList.remove('hidden');
      deleteBtn.style.display = 'flex';
    }
    if (closeBtn) {
      closeBtn.classList.remove('hidden');
      closeBtn.style.display = 'flex';
    }
    if (saveBtn) {
      saveBtn.classList.add('hidden');
      saveBtn.style.display = 'none';
    }
    
    // Store transaction data
    form.dataset.transactionData = JSON.stringify(transaction);

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

// Edit transaction - switch from view mode to edit mode
async function editTransaction(transactionId, transaction) {
  const form = document.getElementById('transaction-form');
  
  // Change to edit mode
  form.dataset.viewMode = 'edit';
  form.dataset.editingTransactionId = transactionId;
  
  // Set form title
  const formTitle = document.getElementById('transaction-form-title');
  if (formTitle) {
    formTitle.textContent = 'Editar Transacción';
  }
  
  // Enable all fields for editing
  const formInputs = form.querySelectorAll('input, select, textarea');
  formInputs.forEach(input => {
    input.removeAttribute('readonly');
    input.removeAttribute('disabled');
  });
  
  // Update buttons for edit mode
  const editBtn = document.getElementById('edit-transaction-form-btn');
  const deleteBtn = document.getElementById('delete-transaction-form-btn');
  const closeBtn = document.getElementById('close-transaction-form-btn');
  const saveBtn = document.getElementById('save-transaction-form-btn');
  
  if (editBtn) {
    editBtn.classList.add('hidden');
    editBtn.style.display = 'none';
  }
  if (deleteBtn) {
    deleteBtn.classList.add('hidden');
    deleteBtn.style.display = 'none';
  }
  if (closeBtn) {
    closeBtn.classList.remove('hidden');
    closeBtn.style.display = 'flex';
  }
  if (saveBtn) {
    saveBtn.classList.remove('hidden');
    saveBtn.style.display = 'flex';
  }
  
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
document.getElementById('close-transaction-form-btn').addEventListener('click', hideTransactionForm);
document.getElementById('close-transaction-form').addEventListener('click', hideTransactionForm);
document.getElementById('transaction-form-element').addEventListener('submit', async (e) => {
  e.preventDefault();
  await saveTransaction();
});
document.getElementById('back-to-transactions').addEventListener('click', backToTransactions);

// Edit button - submit form when editing
document.getElementById('edit-transaction-form-btn').addEventListener('click', async () => {
  const form = document.getElementById('transaction-form');
  const isEditing = form.dataset.editingTransactionId;
  if (isEditing) {
    // If editing, submit the form
    await saveTransaction();
  } else {
    // If new, just submit
    await saveTransaction();
  }
});

// Delete button - delete transaction if editing
document.getElementById('delete-transaction-form-btn').addEventListener('click', async () => {
  const form = document.getElementById('transaction-form');
  const transactionId = form.dataset.editingTransactionId;
  if (transactionId) {
    await deleteTransactionHandler(transactionId);
  } else {
    // If new transaction, just close
    hideTransactionForm();
  }
});

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
      display.textContent = formatDateWithDay(transactionsSelectedFilterDate);
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
    
    
    // Generate PDF - Formato A4 con márgenes reducidos
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    
    let yPos = 10;
    const startX = 8; // Margen izquierdo reducido (antes 14)
    const pageWidth = doc.internal.pageSize.getWidth();
    const rightMargin = pageWidth - 8; // Margen derecho reducido (antes 14)
    
    // Title - Alineado a la derecha como en el PDF
    doc.setFontSize(20);
    doc.setFont(undefined, 'bold');
    doc.text('Cierre Diario', rightMargin, yPos, { align: 'right' });
    yPos += 8;
    
    // Date - Formato completo de fecha con día de la semana
    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = reportDate.toLocaleDateString('es-UY', dateOptions);
    // Capitalizar primera letra del día de la semana
    const dateStrCapitalized = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    doc.text(dateStrCapitalized, rightMargin, yPos, { align: 'right' });
    yPos += 15;
    
    // Resumen del Día - Ingresos, Egresos, Balance (alineado horizontalmente ocupando todo el ancho)
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Resumen', startX, yPos);
    yPos += 10;
    
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    
    // INGRESOS al inicio (margen izquierdo)
    doc.text('INGRESOS:', startX, yPos);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(12);
    doc.text(formatNumber(totalIngresos), startX, yPos + 7);
    
    // EGRESOS en el centro
    const centerX = (startX + rightMargin) / 2;
    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.text('EGRESOS:', centerX, yPos, { align: 'center' });
    doc.setFont(undefined, 'normal');
    doc.setFontSize(12);
    doc.text(formatNumber(totalEgresos), centerX, yPos + 7, { align: 'center' });
    
    // BALANCE al final (margen derecho)
    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.text('BALANCE:', rightMargin, yPos, { align: 'right' });
    doc.setFont(undefined, 'bold');
    doc.setFontSize(12);
    doc.text(formatNumber(totalDiferencia), rightMargin, yPos + 7, { align: 'right' });
    doc.setFont(undefined, 'normal');
    
    yPos += 15;
    
    // Resumen de Cuentas - Tabla con encabezado gris oscuro
    if (accountSummary.length > 0) {
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('Resumen de Cuentas', startX, yPos);
      yPos += 8;
      
      const tableHeaders = ['Cuenta', 'Apertura', 'Cierre', 'Diferencia'];
      // Usar el mismo ancho que el título (desde startX hasta rightMargin)
      const tableWidth = rightMargin - startX;
      const colWidths = [
        Math.floor(tableWidth * 0.45), // Cuenta: 45%
        Math.floor(tableWidth * 0.18), // Apertura: 18%
        Math.floor(tableWidth * 0.18), // Cierre: 18%
        Math.floor(tableWidth * 0.18)  // Diferencia: 18%
      ];
      const headerHeight = 8;
      const rowHeight = 7;
      
      // Encabezado con fondo gris oscuro y texto blanco
      doc.setFillColor(80, 80, 80);
      doc.rect(startX, yPos, tableWidth, headerHeight, 'F');
      doc.setDrawColor(80, 80, 80);
      doc.rect(startX, yPos, tableWidth, headerHeight, 'D');
      
      doc.setFontSize(9);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(255, 255, 255);
      let xPos = startX;
      tableHeaders.forEach((header, i) => {
        const align = i === 0 ? 'left' : 'right';
        const textX = i === 0 ? xPos + 3 : xPos + colWidths[i] - 3;
        // Resaltar el encabezado "Saldo" (última columna, índice 3) con tamaño de fuente ligeramente mayor
        if (i === 3) {
          doc.setFontSize(10);
        } else {
          doc.setFontSize(9);
        }
        doc.text(header, textX, yPos + 5.5, { align: align });
        xPos += colWidths[i];
      });
      doc.setFontSize(9); // Restaurar tamaño de fuente
      doc.setTextColor(0, 0, 0);
      yPos += headerHeight;
      
      // Filas de datos
      doc.setFont(undefined, 'normal');
      doc.setFontSize(9);
      accountSummary.forEach((acc, idx) => {
        if (yPos > 285) {
          doc.addPage();
          yPos = 10;
          // Redibujar encabezado
          doc.setFillColor(80, 80, 80);
          doc.rect(startX, yPos, tableWidth, headerHeight, 'F');
          doc.setDrawColor(80, 80, 80);
          doc.rect(startX, yPos, tableWidth, headerHeight, 'D');
          doc.setFont(undefined, 'bold');
          doc.setFontSize(9);
          doc.setTextColor(255, 255, 255);
          xPos = startX;
          tableHeaders.forEach((header, i) => {
            const align = i === 0 ? 'left' : 'right';
            const textX = i === 0 ? xPos + 3 : xPos + colWidths[i] - 3;
            // Resaltar el encabezado "Diferencia" (última columna, índice 3) con tamaño de fuente ligeramente mayor
            if (i === 3) {
              doc.setFontSize(10);
            } else {
              doc.setFontSize(9);
            }
            doc.text(header, textX, yPos + 5.5, { align: align });
            xPos += colWidths[i];
          });
          doc.setFontSize(9); // Restaurar tamaño de fuente
          doc.setTextColor(0, 0, 0);
          yPos += headerHeight;
        }
        
        // Borde de fila
        doc.setDrawColor(200, 200, 200);
        doc.rect(startX, yPos, tableWidth, rowHeight, 'D');
        
        // Datos de la fila
        xPos = startX;
        const rowData = [
          acc.name,
          formatNumber(acc.saldoInicial),
          formatNumber(acc.saldoFinal),
          formatNumber(acc.diferencia)
        ];
        
        rowData.forEach((cell, i) => {
          const align = i === 0 ? 'left' : 'right';
          const textX = i === 0 ? xPos + 3 : xPos + colWidths[i] - 3;
          
          // Resaltar la columna Diferencia (última columna, índice 3) con negrita
          if (i === 3) {
            doc.setFont(undefined, 'bold');
          } else {
            doc.setFont(undefined, 'normal');
          }
          
          doc.text(String(cell), textX, yPos + 5, { align: align });
          // Línea vertical entre columnas
          if (i < rowData.length - 1) {
            doc.setDrawColor(200, 200, 200);
            doc.line(xPos + colWidths[i], yPos, xPos + colWidths[i], yPos + rowHeight);
          }
          xPos += colWidths[i];
        });
        
        yPos += rowHeight;
      });
      
      yPos += 8;
    }
    
    // Movimientos - Tabla con encabezado gris oscuro
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('Movimientos', startX, yPos);
    yPos += 8;
    
    const sortedTransactions = dayTransactions.sort((a, b) => {
      const dateA = a.date || a.createdAt;
      const dateB = b.date || b.createdAt;
      return dateA - dateB;
    });
    
    if (sortedTransactions.length > 0) {
      const movHeaders = ['Hora', 'Categoría', 'Subcategoría', 'Cuenta', 'Monto'];
      // Usar el mismo ancho que el título (desde startX hasta rightMargin)
      const movTableWidth = rightMargin - startX;
      // Ajustar anchos para aprovechar mejor el espacio - Hora más pequeña, más espacio para texto
      const movColWidths = [
        Math.floor(movTableWidth * 0.10), // Hora: 10% (más pequeña porque es formato 24h)
        Math.floor(movTableWidth * 0.26), // Categoría: 26% (reducido para dar más espacio a Cuenta)
        Math.floor(movTableWidth * 0.36), // Subcategoría: 36% (reducido para dar más espacio a Cuenta)
        Math.floor(movTableWidth * 0.18), // Cuenta: 18% (aumentado para ver texto completo)
        Math.floor(movTableWidth * 0.10)  // Monto: 10% (más pequeña)
      ];
      const movHeaderHeight = 8;
      const movRowHeight = 7;
      
      // Encabezado con fondo gris oscuro y texto blanco
      doc.setFillColor(80, 80, 80);
      doc.rect(startX, yPos, movTableWidth, movHeaderHeight, 'F');
      doc.setDrawColor(80, 80, 80);
      doc.rect(startX, yPos, movTableWidth, movHeaderHeight, 'D');
      
      doc.setFontSize(7); // Fuente más pequeña para aprovechar mejor el espacio
      doc.setFont(undefined, 'bold');
      doc.setTextColor(255, 255, 255);
      let xPos = startX;
      movHeaders.forEach((header, i) => {
        const align = i === movHeaders.length - 1 ? 'right' : 'left';
        const textX = i === movHeaders.length - 1 ? xPos + movColWidths[i] - 2 : xPos + 2;
        doc.text(header, textX, yPos + 5.5, { align: align });
        xPos += movColWidths[i];
      });
      doc.setTextColor(0, 0, 0);
      yPos += movHeaderHeight;
      
      // Filas de transacciones - Fuente más pequeña para aprovechar mejor el espacio
      doc.setFont(undefined, 'normal');
      doc.setFontSize(7);
      sortedTransactions.forEach((transaction, idx) => {
        if (yPos > 285) {
          doc.addPage();
          yPos = 10;
          // Redibujar encabezado
          doc.setFillColor(80, 80, 80);
          doc.rect(startX, yPos, movTableWidth, movHeaderHeight, 'F');
          doc.setDrawColor(80, 80, 80);
          doc.rect(startX, yPos, movTableWidth, movHeaderHeight, 'D');
          doc.setFont(undefined, 'bold');
          doc.setFontSize(7); // Fuente más pequeña para aprovechar mejor el espacio
          doc.setTextColor(255, 255, 255);
          xPos = startX;
          movHeaders.forEach((header, i) => {
            const align = i === movHeaders.length - 1 ? 'right' : 'left';
            const textX = i === movHeaders.length - 1 ? xPos + movColWidths[i] - 2 : xPos + 2;
            doc.text(header, textX, yPos + 5.5, { align: align });
            xPos += movColWidths[i];
          });
          doc.setTextColor(0, 0, 0);
          yPos += movHeaderHeight;
        }
        
        const transDate = transaction.date ? new Date(transaction.date) : new Date(transaction.createdAt);
        // Formato 24 horas sin am/pm
        const hours = String(transDate.getHours()).padStart(2, '0');
        const minutes = String(transDate.getMinutes()).padStart(2, '0');
        const seconds = String(transDate.getSeconds()).padStart(2, '0');
        const timeStr = `${hours}:${minutes}:${seconds}`;
        const fechaCompleta = timeStr;
        
        // Eliminar "INGRESO", "INGRESOS", "EGRESO" y "EGRESOS" con guion para ocupar menos espacio
        let concepto = transaction.categoryName || 'Sin categoría';
        concepto = concepto.replace(/^INGRESOS?\s*[–-]\s*/i, '').replace(/^EGRESOS?\s*[–-]\s*/i, '').trim();
        if (!concepto) concepto = 'Sin categoría';
        const descripcion = transaction.description || '';
        const cuenta = transaction.accountName || 'Sin cuenta';
        const monto = formatNumber(parseFloat(transaction.amount) || 0);
        
        // Borde de fila
        doc.setDrawColor(200, 200, 200);
        doc.rect(startX, yPos, movTableWidth, movRowHeight, 'D');
        
        // Datos de la fila
        xPos = startX;
        const rowData = [fechaCompleta, concepto, descripcion, cuenta, monto];
        
        rowData.forEach((cell, i) => {
          const align = i === rowData.length - 1 ? 'right' : 'left';
          const textX = i === rowData.length - 1 ? xPos + movColWidths[i] - 2 : xPos + 2;
          
          // Truncar texto solo si es extremadamente largo - con fuente 7 caben más caracteres
          let cellText = String(cell);
          // Aproximadamente 1mm = 0.5 caracteres con fuente tamaño 7 (más pequeña = más caracteres)
          const maxCharsConcepto = Math.floor(movColWidths[1] * 0.5);
          const maxCharsDescripcion = Math.floor(movColWidths[2] * 0.5);
          const maxCharsCuenta = Math.floor(movColWidths[3] * 0.6); // Más caracteres para Cuenta (60% del ancho)
          
          // Solo truncar si realmente es muy largo (aumentar límites, especialmente para Cuenta)
          if (i === 1 && cellText.length > maxCharsConcepto + 5) { // Categoría
            cellText = cellText.substring(0, maxCharsConcepto) + '...';
          } else if (i === 2 && cellText.length > maxCharsDescripcion + 5) { // Subcategoría
            cellText = cellText.substring(0, maxCharsDescripcion) + '...';
          } else if (i === 3 && cellText.length > maxCharsCuenta + 10) { // Cuenta - límite más alto
            cellText = cellText.substring(0, maxCharsCuenta) + '...';
          }
          
          doc.text(cellText, textX, yPos + 5, { align: align });
          // Línea vertical entre columnas
          if (i < rowData.length - 1) {
            doc.setDrawColor(200, 200, 200);
            doc.line(xPos + movColWidths[i], yPos, xPos + movColWidths[i], yPos + movRowHeight);
          }
          xPos += movColWidths[i];
        });
        
        yPos += movRowHeight;
      });
      
      yPos += 8;
    }
    
    // Firma del Responsable - Más espacio antes de la firma
    yPos += 15; // Espacio adicional antes de la firma
    
    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    doc.text('Firma del Responsable', startX, yPos);
    doc.setDrawColor(0, 0, 0);
    doc.line(startX, yPos + 3, startX + 80, yPos + 3);
    
    // Abrir diálogo de impresión directamente usando iframe oculto
    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    
    // Crear un iframe oculto
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.src = pdfUrl;
    document.body.appendChild(iframe);
    
    // Esperar a que el PDF se cargue y luego abrir el diálogo de impresión
    iframe.onload = function() {
      setTimeout(function() {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        // Limpiar el iframe después de un tiempo razonable
        setTimeout(function() {
          document.body.removeChild(iframe);
          URL.revokeObjectURL(pdfUrl);
        }, 1000);
      }, 500);
    };
    
    hideSpinner();
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
  // Report button - Genera reporte directamente sin modal
  const reportBtn = document.getElementById('report-btn');
  if (reportBtn) {
    // Remove existing listener if any
    reportBtn.removeEventListener('click', showReportModal);
    reportBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Usar la fecha del filtro si existe, sino usar la fecha de hoy
      const selectedDate = transactionsSelectedFilterDate || new Date();
      selectedDate.setHours(0, 0, 0, 0);
      await generateDailyReport(selectedDate);
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

// Update day summary (Ingresos, Egresos, Balance)
function updateDaySummary(dayTransactions) {
  const summaryContainer = document.getElementById('transactions-day-summary');
  const totalIncomeEl = document.getElementById('day-total-income');
  const totalExpensesEl = document.getElementById('day-total-expenses');
  const totalBalanceEl = document.getElementById('day-total-balance');
  const transactionCountEl = document.getElementById('day-transaction-count');
  
  if (!summaryContainer || !totalIncomeEl || !totalExpensesEl || !totalBalanceEl || !transactionCountEl) return;
  
  // Only show summary if a date is selected
  if (!transactionsSelectedFilterDate || !dayTransactions || dayTransactions.length === 0) {
    summaryContainer.classList.add('hidden');
    return;
  }
  
  // Calculate totals
  let totalIncome = 0;
  let totalExpenses = 0;
  
  dayTransactions.forEach(([id, transaction]) => {
    const amount = parseFloat(transaction.amount || 0);
    if (transaction.type === 'income') {
      totalIncome += amount;
    } else {
      totalExpenses += amount;
    }
  });
  
  const balance = totalIncome - totalExpenses;
  const transactionCount = dayTransactions.length;
  
  // Update display
  totalIncomeEl.textContent = formatNumber(totalIncome);
  totalExpensesEl.textContent = formatNumber(totalExpenses);
  totalBalanceEl.textContent = formatNumber(balance);
  transactionCountEl.textContent = transactionCount;
  
  // Show summary
  summaryContainer.classList.remove('hidden');
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

