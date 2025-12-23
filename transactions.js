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

// Convert amount string (with comma or point as decimal separator) to number
function parseAmount(amountStr) {
  if (!amountStr || typeof amountStr !== 'string') return NaN;
  // Replace comma with point for parsing
  const normalized = amountStr.trim().replace(',', '.');
  return parseFloat(normalized);
}

// Format amount for display (with comma as decimal separator)
function formatAmountForInput(amount) {
  if (isNaN(amount) || amount === 0) return '';
  // Round to 2 decimal places and convert to string
  const rounded = Math.round(amount * 100) / 100;
  const str = rounded.toString();
  // Replace point with comma
  return str.replace('.', ',');
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
      updateDaySummary(transactionsToShow).catch(err => {
        console.error('Error updating day summary:', err);
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
  
  // Restore fields from read-only text display first
  restoreFieldsFromReadOnlyText();
  
  form.classList.remove('hidden');
  if (list) list.style.display = 'none';
  if (header) header.style.display = 'none';
  
  // Ocultar filtros cuando se muestra el formulario
  const searchFilter = document.getElementById('transactions-search-filter-container');
  if (dateFilter) dateFilter.style.display = 'none';
  if (searchFilter) searchFilter.style.display = 'none';
  
  // Ocultar la sección de resúmenes cuando se crea una nueva transacción
  const daySummary = document.getElementById('transactions-day-summary');
  if (daySummary) {
    daySummary.style.display = 'none';
  }
  
  // Aplicar fondo de color según el tipo de transacción
  const formHeader = document.getElementById('transaction-form-header');
  form.classList.remove('bg-white', 'bg-green-50', 'bg-red-50');
  if (type === 'income') {
    form.classList.add('bg-green-50');
    if (formHeader) {
      formHeader.classList.remove('bg-red-600', 'bg-gray-600');
      formHeader.classList.add('bg-green-600');
    }
  } else {
    form.classList.add('bg-red-50');
    if (formHeader) {
      formHeader.classList.remove('bg-green-600', 'bg-gray-600');
      formHeader.classList.add('bg-red-600');
    }
  }
  
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
    closeBtn.textContent = 'Cancelar';
  }
  if (saveBtn) {
    saveBtn.classList.remove('hidden');
    saveBtn.style.display = 'flex';
    saveBtn.textContent = 'Guardar';
  }
  
  // Set transaction type
  document.getElementById('transaction-type').value = type;
  
  // Reset form title and subtitle
  const formTitle = document.getElementById('transaction-form-title');
  const formSubtitle = document.getElementById('transaction-form-subtitle');
  if (formTitle) {
    formTitle.textContent = type === 'income' ? 'Nuevo Ingreso' : 'Nuevo Egreso';
  }
  if (formSubtitle) {
    formSubtitle.textContent = type === 'income' 
      ? 'Registre un ingreso de dinero. Complete todos los campos marcados con *'
      : 'Registre un egreso de dinero. Complete todos los campos marcados con *';
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
  
  // Setup category change listener for "OTROS" validation
  // Esperar un poco para que las categorías se carguen completamente
  setTimeout(() => {
    setupCategoryNotesValidation();
  }, 200);
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
    // Mostrar todas las opciones disponibles al hacer focus
    showDescriptionAutocomplete(e.target.value || '');
  });
  
  newInput.addEventListener('click', (e) => {
    // Mostrar todas las opciones disponibles al hacer clic
    if (!e.target.value) {
      showDescriptionAutocomplete('');
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

// Load unique descriptions for autocomplete and datalist
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
    
    // Populate datalist with all available subcategories
    const datalist = document.getElementById('subcategory-list');
    if (datalist) {
      datalist.innerHTML = '';
      availableDescriptions.forEach(desc => {
        const option = document.createElement('option');
        option.value = desc;
        datalist.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Error loading descriptions:', error);
    availableDescriptions = [];
  }
}

// Show autocomplete suggestions (fallback for browsers that don't support datalist well)
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
  
  // Show filtered list (mostrar todas las opciones si el campo está vacío o al hacer focus)
  autocompleteList.innerHTML = '';
  autocompleteList.classList.remove('hidden');
  
  // Show all or filtered suggestions (limit to 15)
  const toShow = inputValue ? filtered : availableDescriptions;
  toShow.slice(0, 15).forEach(desc => {
    const item = document.createElement('div');
    item.className = 'px-4 py-2.5 hover:bg-gray-100 cursor-pointer text-sm border-b border-gray-100 last:border-0';
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
  
  // Restore fields from read-only text display first
  restoreFieldsFromReadOnlyText();
  
  form.classList.add('hidden');
  // Limpiar colores de fondo
  form.classList.remove('bg-green-50', 'bg-red-50');
  form.classList.add('bg-white');
  
  // Mostrar el header nuevamente cuando se cierra el formulario
  const formHeader = document.getElementById('transaction-form-header');
  if (formHeader) {
    formHeader.style.display = '';
  }
  
  // Mostrar filtros nuevamente
  const searchFilter = document.getElementById('transactions-search-filter-container');
  if (list) list.style.display = 'block';
  if (header) header.style.display = 'flex';
  if (dateFilter) dateFilter.style.display = 'flex';
  if (searchFilter) searchFilter.style.display = 'block';
  
  // Mostrar la sección de resúmenes nuevamente cuando se cierra el formulario
  const daySummary = document.getElementById('transactions-day-summary');
  if (daySummary && transactionsSelectedFilterDate) {
    // Solo mostrar si hay una fecha seleccionada (para que se muestre si corresponde)
    daySummary.style.display = '';
  }
  
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
  const amountStr = document.getElementById('transaction-amount').value.trim();
  const amount = parseAmount(amountStr);
  const categoryId = document.getElementById('transaction-category').value;
  const accountId = document.getElementById('transaction-account').value;
  const dateInput = document.getElementById('transaction-date').value;
  const notes = document.getElementById('transaction-notes').value.trim();
  
  // Validar si la categoría contiene "OTROS" y requiere notas
  if (categoryId) {
    try {
      const categorySnapshot = await getCategory(categoryId);
      const category = categorySnapshot.val();
      
      if (category && category.name && category.name.toUpperCase().includes('OTROS')) {
        if (!notes || notes.trim().length === 0) {
          await showError('Las notas son obligatorias cuando la categoría contiene "OTROS". Por favor complete las notas adicionales');
          document.getElementById('transaction-notes').focus();
          return;
        }
      }
    } catch (error) {
      console.error('Error validating category:', error);
    }
  }

  // Validaciones con mensajes claros y preventivos
  
  // 1. Validación de subcategoría
  if (!description || description.length === 0) {
    await showError('Por favor ingrese la subcategoría de esta transacción');
    document.getElementById('transaction-description').focus();
    return;
  }
  
  // Validar longitud máxima de subcategoría (evitar textos muy largos)
  if (description.length > 200) {
    await showError('La subcategoría es muy larga. Por favor use máximo 200 caracteres');
    document.getElementById('transaction-description').focus();
    return;
  }
  
  // Validar que la subcategoría no sea solo espacios
  if (description.trim().length === 0) {
    await showError('La subcategoría no puede estar vacía');
    document.getElementById('transaction-description').focus();
    return;
  }

  // 2. Validación de monto
  if (!amountStr || amountStr.length === 0) {
    await showError('Por favor ingrese un monto');
    document.getElementById('transaction-amount').focus();
    return;
  }
  
  if (isNaN(amount) || amount === 0) {
    await showError('Por favor ingrese un monto válido. Use números y coma para decimales (ej: 1500,50)');
    document.getElementById('transaction-amount').focus();
    return;
  }
  
  if (amount <= 0) {
    await showError('El monto debe ser mayor a cero');
    document.getElementById('transaction-amount').focus();
    return;
  }
  
  // Validar monto máximo razonable (evitar errores de tipeo)
  if (amount > 999999999) {
    await showError('El monto es demasiado grande. Por favor verifique que sea correcto');
    document.getElementById('transaction-amount').focus();
    return;
  }
  
  // Validar que el monto tenga máximo 2 decimales
  // Puede tener coma o punto como separador decimal
  const decimalPart = amountStr.includes(',') 
    ? amountStr.split(',')[1] 
    : (amountStr.includes('.') ? amountStr.split('.')[1] : null);
  if (decimalPart && decimalPart.length > 2) {
    await showError('El monto solo puede tener máximo 2 decimales');
    document.getElementById('transaction-amount').focus();
    return;
  }

  // 3. Validación de categoría
  if (!categoryId) {
    await showError('Por favor seleccione una categoría de la lista');
    document.getElementById('transaction-category').focus();
    return;
  }

  // 4. Validación de cuenta
  if (!accountId) {
    await showError('Por favor seleccione una cuenta de la lista');
    document.getElementById('transaction-account').focus();
    return;
  }
  
  // 5. Validación de fecha
  if (!dateInput) {
    await showError('Por favor seleccione una fecha');
    document.getElementById('transaction-date').focus();
    return;
  }
  
  // Validar que la fecha no sea muy antigua (más de 10 años)
  const dateObj = new Date(dateInput);
  const tenYearsAgo = new Date();
  tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
  if (dateObj < tenYearsAgo) {
    await showError('La fecha no puede ser anterior a hace 10 años. Por favor verifique la fecha');
    document.getElementById('transaction-date').focus();
    return;
  }
  
  // Validar que la fecha no sea muy futura (más de 1 año)
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
  if (dateObj > oneYearFromNow) {
    await showError('La fecha no puede ser más de un año en el futuro. Por favor verifique la fecha');
    document.getElementById('transaction-date').focus();
    return;
  }
  
  // Validar formato de fecha
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateInput)) {
    await showError('La fecha tiene un formato incorrecto. Por favor seleccione una fecha válida');
    document.getElementById('transaction-date').focus();
    return;
  }

  // Validar notas si la categoría contiene "OTROS" (ya validado arriba, pero mantener para consistencia)
  
  try {
    // Verificar que la categoría existe y está activa
    const categorySnapshot = await getCategory(categoryId);
    const category = categorySnapshot.val();
    if (!category) {
      await showError('La categoría seleccionada no existe. Por favor seleccione otra');
      document.getElementById('transaction-category').value = '';
      document.getElementById('transaction-category').focus();
      return;
    }
    
    if (category.active === false) {
      await showError('La categoría seleccionada está desactivada. Por favor seleccione otra');
      document.getElementById('transaction-category').value = '';
      document.getElementById('transaction-category').focus();
      return;
    }

    // Verificar que la cuenta existe y está activa
    const accountSnapshot = await getAccount(accountId);
    const account = accountSnapshot.val();
    if (!account) {
      await showError('La cuenta seleccionada no existe. Por favor seleccione otra');
      document.getElementById('transaction-account').value = '';
      document.getElementById('transaction-account').focus();
      return;
    }
    
    if (account.active === false) {
      await showError('La cuenta seleccionada está desactivada. Por favor seleccione otra');
      document.getElementById('transaction-account').value = '';
      document.getElementById('transaction-account').focus();
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
      await showSuccess('✓ Transacción actualizada correctamente');
    } else {
      // Create new transaction
      // Verificar duplicados potenciales (mismo monto, subcategoría y fecha en el mismo día)
      const transactionsSnapshot = await getTransactionsRef().once('value');
      const allTransactions = transactionsSnapshot.val() || {};
      const dayStart = new Date(transactionDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(transactionDate);
      dayEnd.setHours(23, 59, 59, 999);
      
      const duplicateCheck = Object.values(allTransactions).some(t => {
        if (!t) return false;
        const tDate = t.date || t.createdAt;
        return t.type === type &&
               t.description && t.description.trim().toLowerCase() === description.trim().toLowerCase() &&
               Math.abs(parseFloat(t.amount) - amount) < 0.01 &&
               tDate >= dayStart.getTime() && tDate <= dayEnd.getTime();
      });
      
      if (duplicateCheck) {
        const confirmDuplicate = await showConfirm(
          'Posible duplicado',
          `Ya existe una transacción similar (mismo monto, subcategoría y fecha). ¿Desea guardarla de todas formas?`
        );
        if (!confirmDuplicate) {
          return;
        }
      }
      
      const transactionData = {
        type,
        description: description.trim(),
        amount,
        categoryId,
        categoryName: category.name,
        accountId,
        accountName: account.name,
        date: transactionDate,
        notes: notes ? notes.trim() : null,
        createdAt: Date.now()
      };

      showSpinner('Guardando transacción...');
      const newTransactionRef = await createTransaction(transactionData);
      hideSpinner();
      
      // Close form for new transactions
      hideTransactionForm();
      await showSuccess('✓ Transacción guardada correctamente');
    }
  } catch (error) {
    hideSpinner();
    console.error('Error al guardar transacción:', error);
    
    // Mensajes de error más amigables según el tipo de error
    if (error.message && error.message.includes('network') || error.message.includes('internet')) {
      await showError('Error de conexión. Por favor verifique su conexión a internet e intente nuevamente');
    } else if (error.message && error.message.includes('permission')) {
      await showError('No tiene permisos para realizar esta acción. Por favor contacte al administrador');
    } else {
      await showError('Error al guardar la transacción. Por favor verifique los datos e intente nuevamente');
    }
  }
}

// Convert form fields to read-only text display
function convertFieldsToReadOnlyText(transaction) {
  const form = document.getElementById('transaction-form');
  if (!form) return;
  
  // Monto
  const amountInput = document.getElementById('transaction-amount');
  if (amountInput && !amountInput.dataset.readonlyText) {
    const amountValue = parseFloat(transaction.amount || 0);
    const formattedAmount = formatNumber(amountValue);
    const amountContainer = amountInput.parentElement;
    const amountText = document.createElement('div');
    amountText.className = 'w-full px-4 py-3 border-2 border-gray-300 bg-gray-50 text-base sm:text-lg';
    amountText.textContent = formattedAmount;
    amountText.id = 'transaction-amount-text';
    amountInput.dataset.readonlyText = 'true';
    amountInput.style.display = 'none';
    amountContainer.insertBefore(amountText, amountInput);
  }
  
  // Subcategoría
  const descriptionInput = document.getElementById('transaction-description');
  if (descriptionInput && !descriptionInput.dataset.readonlyText) {
    const descriptionValue = transaction.description || '';
    const descriptionContainer = descriptionInput.parentElement;
    const descriptionText = document.createElement('div');
    descriptionText.className = 'w-full px-4 py-3 border-2 border-gray-300 bg-gray-50 text-base';
    descriptionText.textContent = descriptionValue || 'Sin subcategoría';
    descriptionText.id = 'transaction-description-text';
    descriptionInput.dataset.readonlyText = 'true';
    descriptionInput.style.display = 'none';
    // Ocultar también el autocomplete list si existe
    const autocompleteList = document.getElementById('description-autocomplete-list');
    if (autocompleteList) autocompleteList.style.display = 'none';
    descriptionContainer.insertBefore(descriptionText, descriptionInput);
  }
  
  // Categoría
  const categorySelect = document.getElementById('transaction-category');
  if (categorySelect && !categorySelect.dataset.readonlyText) {
    const selectedOption = categorySelect.options[categorySelect.selectedIndex];
    const categoryValue = selectedOption ? selectedOption.textContent : 'Sin categoría';
    const categoryContainer = categorySelect.parentElement;
    const categoryText = document.createElement('div');
    categoryText.className = 'w-full px-4 py-3 border-2 border-gray-300 bg-gray-50 text-base';
    categoryText.textContent = categoryValue;
    categoryText.id = 'transaction-category-text';
    categorySelect.dataset.readonlyText = 'true';
    categorySelect.style.display = 'none';
    categoryContainer.insertBefore(categoryText, categorySelect);
  }
  
  // Cuenta
  const accountSelect = document.getElementById('transaction-account');
  if (accountSelect && !accountSelect.dataset.readonlyText) {
    const selectedOption = accountSelect.options[accountSelect.selectedIndex];
    const accountValue = selectedOption ? selectedOption.textContent : 'Sin cuenta';
    const accountContainer = accountSelect.parentElement;
    const accountText = document.createElement('div');
    accountText.className = 'w-full px-4 py-3 border-2 border-gray-300 bg-gray-50 text-base';
    accountText.textContent = accountValue;
    accountText.id = 'transaction-account-text';
    accountSelect.dataset.readonlyText = 'true';
    accountSelect.style.display = 'none';
    accountContainer.insertBefore(accountText, accountSelect);
  }
  
  // Fecha
  const dateInput = document.getElementById('transaction-date');
  if (dateInput && !dateInput.dataset.readonlyText) {
    let dateValue = 'Sin fecha';
    if (transaction.date) {
      const date = new Date(transaction.date);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      dateValue = `${day}/${month}/${year}`;
    }
    const dateContainer = dateInput.parentElement;
    const dateText = document.createElement('div');
    dateText.className = 'w-full px-4 py-3 border-2 border-gray-300 bg-gray-50 text-base';
    dateText.textContent = dateValue;
    dateText.id = 'transaction-date-text';
    dateInput.dataset.readonlyText = 'true';
    dateInput.style.display = 'none';
    dateContainer.insertBefore(dateText, dateInput);
  }
  
  // Notas
  const notesTextarea = document.getElementById('transaction-notes');
  if (notesTextarea && !notesTextarea.dataset.readonlyText) {
    const notesValue = transaction.notes || '';
    const notesContainer = notesTextarea.parentElement;
    const notesText = document.createElement('div');
    notesText.className = 'w-full px-4 py-3 border-2 border-gray-300 bg-gray-50 resize-y text-base min-h-[80px]';
    notesText.textContent = notesValue || 'Sin notas';
    notesText.id = 'transaction-notes-text';
    notesTextarea.dataset.readonlyText = 'true';
    notesTextarea.style.display = 'none';
    notesContainer.insertBefore(notesText, notesTextarea);
  }
}

// Restore form fields from read-only text display
function restoreFieldsFromReadOnlyText() {
  const form = document.getElementById('transaction-form');
  if (!form) return;
  
  // Monto
  const amountInput = document.getElementById('transaction-amount');
  const amountText = document.getElementById('transaction-amount-text');
  if (amountInput && amountText) {
    amountInput.style.display = '';
    amountText.remove();
    delete amountInput.dataset.readonlyText;
  }
  
  // Subcategoría
  const descriptionInput = document.getElementById('transaction-description');
  const descriptionText = document.getElementById('transaction-description-text');
  if (descriptionInput && descriptionText) {
    descriptionInput.style.display = '';
    descriptionText.remove();
    delete descriptionInput.dataset.readonlyText;
    // Mostrar el autocomplete list si existe
    const autocompleteList = document.getElementById('description-autocomplete-list');
    if (autocompleteList) autocompleteList.style.display = '';
  }
  
  // Categoría
  const categorySelect = document.getElementById('transaction-category');
  const categoryText = document.getElementById('transaction-category-text');
  if (categorySelect && categoryText) {
    categorySelect.style.display = '';
    categoryText.remove();
    delete categorySelect.dataset.readonlyText;
  }
  
  // Cuenta
  const accountSelect = document.getElementById('transaction-account');
  const accountText = document.getElementById('transaction-account-text');
  if (accountSelect && accountText) {
    accountSelect.style.display = '';
    accountText.remove();
    delete accountSelect.dataset.readonlyText;
  }
  
  // Fecha
  const dateInput = document.getElementById('transaction-date');
  const dateText = document.getElementById('transaction-date-text');
  if (dateInput && dateText) {
    dateInput.style.display = '';
    dateText.remove();
    delete dateInput.dataset.readonlyText;
  }
  
  // Notas
  const notesTextarea = document.getElementById('transaction-notes');
  const notesText = document.getElementById('transaction-notes-text');
  if (notesTextarea && notesText) {
    notesTextarea.style.display = '';
    notesText.remove();
    delete notesTextarea.dataset.readonlyText;
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
    const searchFilter = document.getElementById('transactions-search-filter-container');
    const detail = document.getElementById('transaction-detail');
    
    if (list) list.style.display = 'none';
    if (header) header.style.display = 'none';
    if (detail) detail.classList.add('hidden');
    if (dateFilter) dateFilter.style.display = 'none';
    if (searchFilter) searchFilter.style.display = 'none';
    if (form) form.classList.remove('hidden');
    
    // Restore fields first in case we're switching from edit mode
    restoreFieldsFromReadOnlyText();
    
    // Aplicar fondo de color según el tipo de transacción
    const formHeader = document.getElementById('transaction-form-header');
    form.classList.remove('bg-white', 'bg-green-50', 'bg-red-50');
    if (transaction.type === 'income') {
      form.classList.add('bg-green-50');
      if (formHeader) {
        formHeader.classList.remove('bg-red-600', 'bg-gray-600');
        formHeader.classList.add('bg-green-600');
      }
    } else {
      form.classList.add('bg-red-50');
      if (formHeader) {
        formHeader.classList.remove('bg-green-600', 'bg-gray-600');
        formHeader.classList.add('bg-red-600');
      }
    }
    
    // Set form to view mode (readonly)
    form.dataset.viewMode = 'view';
    form.dataset.editingTransactionId = transactionId;
    
    // Actualizar título del header a "Ver Transacción"
    const formTitle = document.getElementById('transaction-form-title');
    if (formTitle) {
      formTitle.textContent = 'Ver Transacción';
    }
    
    // Ocultar la sección de resúmenes cuando se está viendo una transacción
    const daySummary = document.getElementById('transactions-day-summary');
    if (daySummary) {
      daySummary.style.display = 'none';
    }
    
    // Load form data in readonly mode
    document.getElementById('transaction-type').value = transaction.type;
    document.getElementById('transaction-description').value = transaction.description || '';
    const amountValue = transaction.amount ? parseFloat(transaction.amount) : 0;
    document.getElementById('transaction-amount').value = amountValue ? formatAmountForInput(amountValue) : '';
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
    
    // Convert fields to read-only text display
    convertFieldsToReadOnlyText(transaction);
    
    // Update buttons for view mode - show Edit, Delete, and Close buttons
    const editBtn = document.getElementById('edit-transaction-form-btn');
    const deleteBtn = document.getElementById('delete-transaction-form-btn');
    const closeBtn = document.getElementById('close-transaction-form-btn');
    const saveBtn = document.getElementById('save-transaction-form-btn');
    
    // Show Edit button
    if (editBtn) {
      editBtn.classList.remove('hidden');
      editBtn.style.display = 'flex';
    }
    // Show Delete button
    if (deleteBtn) {
      deleteBtn.classList.remove('hidden');
      deleteBtn.style.display = 'flex';
    }
    // Show Close button (renamed to "Cerrar")
    if (closeBtn) {
      closeBtn.classList.remove('hidden');
      closeBtn.style.display = 'flex';
      closeBtn.textContent = 'Cerrar';
    }
    // Hide Save button in view mode
    if (saveBtn) {
      saveBtn.classList.add('hidden');
      saveBtn.style.display = 'none';
    }
    
    // Asegurar que el botón X del header esté visible
    const closeHeaderBtn = document.getElementById('close-transaction-form');
    if (closeHeaderBtn) {
      closeHeaderBtn.style.display = 'flex';
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
  const searchFilter = document.getElementById('transactions-search-filter-container');
  
  if (list) list.style.display = 'block';
  if (header) header.style.display = 'flex';
  if (detail) detail.classList.add('hidden');
  if (dateFilter) dateFilter.style.display = 'flex';
  if (searchFilter) searchFilter.style.display = 'block';
}

// Edit transaction - switch from view mode to edit mode
async function editTransaction(transactionId, transaction) {
  const form = document.getElementById('transaction-form');
  
  // Restore fields from read-only text display first
  restoreFieldsFromReadOnlyText();
  
  // Change to edit mode
  form.dataset.viewMode = 'edit';
  form.dataset.editingTransactionId = transactionId;
  
  // Aplicar fondo de color según el tipo de transacción
  const formHeader = document.getElementById('transaction-form-header');
  // Mostrar el header cuando se está editando
  if (formHeader) {
    formHeader.style.display = '';
  }
  form.classList.remove('bg-white', 'bg-green-50', 'bg-red-50');
  if (transaction.type === 'income') {
    form.classList.add('bg-green-50');
    if (formHeader) {
      formHeader.classList.remove('bg-red-600', 'bg-gray-600');
      formHeader.classList.add('bg-green-600');
    }
  } else {
    form.classList.add('bg-red-50');
    if (formHeader) {
      formHeader.classList.remove('bg-green-600', 'bg-gray-600');
      formHeader.classList.add('bg-red-600');
    }
  }
  
  // Set form title
  const formTitle = document.getElementById('transaction-form-title');
  if (formTitle) {
    formTitle.textContent = 'Editar Transacción';
  }
  
  // Actualizar subtítulo según el tipo
  const formSubtitle = document.getElementById('transaction-form-subtitle');
  if (formSubtitle) {
    formSubtitle.textContent = transaction.type === 'income' 
      ? 'Modifique los datos del ingreso'
      : 'Modifique los datos del egreso';
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
    closeBtn.textContent = 'Cancelar';
  }
  if (saveBtn) {
    saveBtn.classList.remove('hidden');
    saveBtn.style.display = 'flex';
  }
  
  // Load form data
  document.getElementById('transaction-type').value = transaction.type;
  document.getElementById('transaction-description').value = transaction.description || '';
  const amountValue = transaction.amount ? parseFloat(transaction.amount) : 0;
  document.getElementById('transaction-amount').value = amountValue ? formatAmountForInput(amountValue) : '';
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
  
  // Setup category validation for "OTROS" after loading categories
  setTimeout(() => {
    setupCategoryNotesValidation();
  }, 200);
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
    await showSuccess('✓ Transacción eliminada correctamente');
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

// Edit button - switch to edit mode or submit form when editing
document.getElementById('edit-transaction-form-btn').addEventListener('click', async () => {
  const form = document.getElementById('transaction-form');
  const viewMode = form.dataset.viewMode;
  const transactionId = form.dataset.editingTransactionId;
  
  if (viewMode === 'view' && transactionId) {
    // If in view mode, switch to edit mode
    const transactionData = form.dataset.transactionData;
    if (transactionData) {
      const transaction = JSON.parse(transactionData);
      await editTransaction(transactionId, transaction);
    }
  } else {
    // If already in edit mode, submit the form
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

// Save button - save transaction
document.getElementById('save-transaction-form-btn').addEventListener('click', async () => {
  await saveTransaction();
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
    
    // Calculate current balances (initial balance + all transactions up to end of day)
    // Primero inicializar con el saldo inicial de cada cuenta
    Object.entries(accounts).forEach(([accountId, account]) => {
      const initialBalance = parseFloat(account.initialBalance) || 0;
      accountBalances[accountId] = initialBalance;
    });
    
    // Sumar todas las transacciones hasta el final del día del reporte
    Object.values(allTransactions).forEach(transaction => {
      if (!transaction || !transaction.accountId) return;
      const transactionDate = transaction.date || transaction.createdAt;
      if (!transactionDate) return;
      
      // Solo incluir transacciones hasta el final del día del reporte
      if (transactionDate > dateEnd) return;
      
      const accountId = transaction.accountId;
      const amount = parseFloat(transaction.amount) || 0;
      
      if (transaction.type === 'income') {
        accountBalances[accountId] = (accountBalances[accountId] || 0) + amount;
      } else if (transaction.type === 'expense') {
        accountBalances[accountId] = (accountBalances[accountId] || 0) - amount;
      }
    });
    
    // Calcular saldo inicial (initial balance + transacciones antes del día del reporte)
    Object.entries(accounts).forEach(([accountId, account]) => {
      const initialBalance = parseFloat(account.initialBalance) || 0;
      let saldoInicial = initialBalance;
      
      // Sumar transacciones antes del día del reporte
      Object.values(allTransactions).forEach(transaction => {
        if (!transaction || !transaction.accountId) return;
        if (transaction.accountId !== accountId) return;
        
        const transactionDate = transaction.date || transaction.createdAt;
        if (!transactionDate || transactionDate >= dateStart) return;
        
        const amount = parseFloat(transaction.amount) || 0;
        if (transaction.type === 'income') {
          saldoInicial += amount;
        } else if (transaction.type === 'expense') {
          saldoInicial -= amount;
        }
      });
      
      accountInitialBalances[accountId] = saldoInicial;
    });
    
    // Prepare account summary data
    const accountSummary = [];
    
    Object.entries(accounts).forEach(([id, account]) => {
      if (account?.active === false) return;
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
    
    // Helper function to get account order (fixed order)
    const getAccountOrder = (accountName) => {
      const nameUpper = accountName.toUpperCase();
      // Orden fijo: 1. Efectivo, 2. Débito, 3. Crédito, 4. Mercado Pago
      if (nameUpper.includes('EFECTIVO')) return 1;
      if (nameUpper.includes('DÉBITO') || nameUpper.includes('DEBITO')) return 2;
      if (nameUpper.includes('CRÉDITO') || nameUpper.includes('CREDITO')) return 3;
      if (nameUpper.includes('MERCADO PAGO') || nameUpper.includes('MERCADOPAGO')) return 4;
      // Si no coincide con ninguno, ponerlo al final pero ordenado alfabéticamente
      return 999;
    };
    
    // Sort accounts by fixed order
    accountSummary.sort((a, b) => {
      const orderA = getAccountOrder(a.name);
      const orderB = getAccountOrder(b.name);
      
      // Si ambos tienen orden fijo, ordenar por ese orden
      if (orderA !== 999 && orderB !== 999) {
        return orderA - orderB;
      }
      // Si solo uno tiene orden fijo, ese va primero
      if (orderA !== 999) return -1;
      if (orderB !== 999) return 1;
      // Si ninguno tiene orden fijo, ordenar alfabéticamente
      return a.name.localeCompare(b.name);
    });
    
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
      yPos += 3;
      
      const tableHeaders = ['Cuenta', 'Apertura', 'Cierre', 'Diferencia', 'Saldo'];
      // Usar el mismo ancho que el título (desde startX hasta rightMargin)
      const tableWidth = rightMargin - startX;
      const colWidths = [
        Math.floor(tableWidth * 0.35), // Cuenta: 35%
        Math.floor(tableWidth * 0.15), // Apertura: 15%
        Math.floor(tableWidth * 0.15), // Cierre: 15%
        Math.floor(tableWidth * 0.15), // Diferencia: 15%
        Math.floor(tableWidth * 0.20)  // Saldo: 20%
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
        // Resaltar el encabezado "Saldo" (última columna, índice 4) con tamaño de fuente ligeramente mayor
        if (i === 4) {
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
            // Resaltar el encabezado "Saldo" (última columna, índice 4) con tamaño de fuente ligeramente mayor
            if (i === 4) {
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
          formatNumber(acc.diferencia),
          formatNumber(acc.saldoFinal) // Saldo (saldo final)
        ];
        
        rowData.forEach((cell, i) => {
          const align = i === 0 ? 'left' : 'right';
          const textX = i === 0 ? xPos + 3 : xPos + colWidths[i] - 3;
          
          // Resaltar la columna Saldo (última columna, índice 4) con negrita
          if (i === 4) {
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
    yPos += 3;
    
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

// Validación en tiempo real del campo de monto
function setupAmountValidation() {
  const amountInput = document.getElementById('transaction-amount');
  if (!amountInput) return;
  
  // Permitir solo números, coma y punto
  amountInput.addEventListener('input', (e) => {
    let value = e.target.value;
    // Reemplazar punto con coma automáticamente
    value = value.replace('.', ',');
    // Permitir solo números, coma y espacios (que se eliminarán)
    value = value.replace(/[^\d,]/g, '');
    // Asegurar que solo haya una coma
    const parts = value.split(',');
    if (parts.length > 2) {
      value = parts[0] + ',' + parts.slice(1).join('');
    }
    e.target.value = value;
    
    const amount = parseAmount(value);
    
    // Remover clases de error previas
    e.target.classList.remove('border-red-500', 'bg-red-50', 'border-yellow-500', 'bg-yellow-50');
    
    if (value && !isNaN(amount)) {
      if (amount <= 0) {
        e.target.classList.add('border-red-500', 'bg-red-50');
      } else if (amount > 999999999) {
        e.target.classList.add('border-yellow-500', 'bg-yellow-50');
      }
    }
  });
  
  // Validar al perder el foco
  amountInput.addEventListener('blur', (e) => {
    const value = e.target.value.trim();
    const amount = parseAmount(value);
    
    if (value && !isNaN(amount) && amount > 0 && amount <= 999999999) {
      // Formatear con máximo 2 decimales y usar coma
      const rounded = Math.round(amount * 100) / 100;
      const formatted = formatAmountForInput(rounded);
      e.target.value = formatted;
    }
  });
}

// Validación en tiempo real del campo de subcategoría
function setupDescriptionValidation() {
  const descriptionInput = document.getElementById('transaction-description');
  if (!descriptionInput) return;
  
  descriptionInput.addEventListener('input', (e) => {
    const value = e.target.value.trim();
    
    // Remover clases de error previas
    e.target.classList.remove('border-red-500', 'bg-red-50');
    
    if (value.length === 0) {
      e.target.classList.add('border-red-500', 'bg-red-50');
    } else if (value.length > 200) {
      e.target.classList.add('border-yellow-500', 'bg-yellow-50');
    }
  });
}

// Validación de notas cuando la categoría contiene "OTROS"
function setupCategoryNotesValidation() {
  const categorySelect = document.getElementById('transaction-category');
  const notesTextarea = document.getElementById('transaction-notes');
  const notesContainer = notesTextarea?.parentElement;
  const notesLabel = notesContainer?.querySelector('label');
  const notesHelpText = notesContainer?.querySelector('.notes-help-text');
  const notesRequiredText = notesContainer?.querySelector('.notes-required-text');
  
  if (!categorySelect || !notesTextarea) return;
  
  // Función para verificar si la categoría contiene "OTROS"
  const checkCategoryForOthers = async () => {
    const categoryId = categorySelect.value;
    if (!categoryId) {
      // Si no hay categoría seleccionada, quitar requerido
      notesTextarea.removeAttribute('required');
      if (notesLabel) {
        const spanOptional = notesLabel.querySelector('.notes-optional');
        const spanRequired = notesLabel.querySelector('.notes-required');
        if (spanOptional) spanOptional.style.display = 'inline';
        if (spanRequired) spanRequired.style.display = 'none';
      }
      if (notesHelpText) notesHelpText.style.display = 'block';
      if (notesRequiredText) notesRequiredText.style.display = 'none';
      notesTextarea.classList.remove('border-red-500', 'bg-red-50');
      return;
    }
    
    try {
      const categorySnapshot = await getCategory(categoryId);
      const category = categorySnapshot.val();
      
      if (category && category.name && category.name.toUpperCase().includes('OTROS')) {
        // Categoría contiene "OTROS", hacer notas obligatorias
        notesTextarea.setAttribute('required', 'required');
        if (notesLabel) {
          const spanOptional = notesLabel.querySelector('.notes-optional');
          const spanRequired = notesLabel.querySelector('.notes-required');
          if (spanOptional) spanOptional.style.display = 'none';
          if (spanRequired) spanRequired.style.display = 'inline';
        }
        if (notesHelpText) notesHelpText.style.display = 'none';
        if (notesRequiredText) notesRequiredText.style.display = 'block';
        
        // Validar en tiempo real si está vacío
        if (!notesTextarea.value.trim()) {
          notesTextarea.classList.add('border-red-500', 'bg-red-50');
        } else {
          notesTextarea.classList.remove('border-red-500', 'bg-red-50');
        }
      } else {
        // Categoría no contiene "OTROS", hacer notas opcionales
        notesTextarea.removeAttribute('required');
        if (notesLabel) {
          const spanOptional = notesLabel.querySelector('.notes-optional');
          const spanRequired = notesLabel.querySelector('.notes-required');
          if (spanOptional) spanOptional.style.display = 'inline';
          if (spanRequired) spanRequired.style.display = 'none';
        }
        if (notesHelpText) notesHelpText.style.display = 'block';
        if (notesRequiredText) notesRequiredText.style.display = 'none';
        notesTextarea.classList.remove('border-red-500', 'bg-red-50');
      }
    } catch (error) {
      console.error('Error checking category:', error);
    }
  };
  
  // Escuchar cambios en la categoría
  categorySelect.addEventListener('change', checkCategoryForOthers);
  
  // Validar en tiempo real cuando se escribe en notas
  notesTextarea.addEventListener('input', () => {
    if (notesTextarea.hasAttribute('required')) {
      if (notesTextarea.value.trim()) {
        notesTextarea.classList.remove('border-red-500', 'bg-red-50');
      } else {
        notesTextarea.classList.add('border-red-500', 'bg-red-50');
      }
    }
  });
  
  // También verificar cuando se carga el formulario con una categoría ya seleccionada
  setTimeout(checkCategoryForOthers, 100);
}

// Setup autocomplete click outside handler
document.addEventListener('DOMContentLoaded', () => {
  // Configurar validaciones en tiempo real
  setupAmountValidation();
  setupDescriptionValidation();
  
  // Configurar validación de notas para categorías "OTROS"
  // Se configura cuando se abre el formulario, pero también aquí por si acaso
  const categorySelect = document.getElementById('transaction-category');
  if (categorySelect) {
    // Remover listeners previos si existen
    const newCategorySelect = categorySelect.cloneNode(true);
    categorySelect.parentNode.replaceChild(newCategorySelect, categorySelect);
  }
  
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

// Date picker modal for transactions filter
function showTransactionsDatePicker() {
  const modal = document.getElementById('transactions-date-picker-modal');
  const dateInput = document.getElementById('date-picker-input');
  
  if (!modal || !dateInput) {
    console.error('Date picker modal not found');
    return;
  }
  
  modal.classList.remove('hidden');
  
  // Set current filter date if available, otherwise use today
  if (transactionsSelectedFilterDate) {
    const dateStr = transactionsSelectedFilterDate.toISOString().split('T')[0];
    dateInput.value = dateStr;
  } else {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    dateInput.value = dateStr;
  }
  
  // Focus on the date input
  setTimeout(() => {
    dateInput.focus();
    // Try to show native date picker if available (some browsers support this)
    if (dateInput.showPicker && typeof dateInput.showPicker === 'function') {
      try {
        dateInput.showPicker();
      } catch (e) {
        // showPicker might not be available in all browsers
        console.log('showPicker not available');
      }
    }
  }, 100);
}

function hideTransactionsDatePicker() {
  const modal = document.getElementById('transactions-date-picker-modal');
  if (modal) modal.classList.add('hidden');
}

function applyTransactionsDateFilter(selectedDate) {
  if (!selectedDate) return;
  
  const date = new Date(selectedDate);
  date.setHours(0, 0, 0, 0);
  transactionsSelectedFilterDate = date;
  
  clearSearchInput();
  updateTransactionsDateFilterDisplay();
  loadTransactions(false); // Don't reinitialize date filter
  hideTransactionsDatePicker();
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
  
  // Setup date filter buttons
  const todayBtn = document.getElementById('transactions-today-date-btn');
  const prevBtn = document.getElementById('transactions-prev-date-btn');
  const nextBtn = document.getElementById('transactions-next-date-btn');
  const clearBtn = document.getElementById('transactions-clear-date-filter-btn');
  
  if (todayBtn) todayBtn.addEventListener('click', setTransactionsToday);
  if (prevBtn) prevBtn.addEventListener('click', prevTransactionsDate);
  if (nextBtn) nextBtn.addEventListener('click', nextTransactionsDate);
  if (clearBtn) clearBtn.addEventListener('click', clearTransactionsDateFilter);
  
  // Setup date picker modal
  const dateDisplay = document.getElementById('transactions-filter-date-display');
  if (dateDisplay) {
    dateDisplay.addEventListener('click', showTransactionsDatePicker);
  }
  
  const datePickerForm = document.getElementById('date-picker-form');
  if (datePickerForm) {
    datePickerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const dateInput = document.getElementById('date-picker-input');
      if (dateInput && dateInput.value) {
        applyTransactionsDateFilter(dateInput.value);
      }
    });
  }
  
  const closeDatePickerBtn = document.getElementById('close-date-picker-modal');
  const cancelDatePickerBtn = document.getElementById('cancel-date-picker-btn');
  
  if (closeDatePickerBtn) {
    closeDatePickerBtn.addEventListener('click', hideTransactionsDatePicker);
  }
  
  if (cancelDatePickerBtn) {
    cancelDatePickerBtn.addEventListener('click', hideTransactionsDatePicker);
  }
  
  // Close modal when clicking outside
  const datePickerModal = document.getElementById('transactions-date-picker-modal');
  if (datePickerModal) {
    datePickerModal.addEventListener('click', (e) => {
      if (e.target === datePickerModal) {
        hideTransactionsDatePicker();
      }
    });
  }
});

// Update day summary (Ingresos, Egresos, Balance)
async function updateDaySummary(dayTransactions) {
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
  
  // Calculate and display account balances
  await updateTransactionsAccountBalances();
}

// Update account balances for transactions view
async function updateTransactionsAccountBalances() {
  const accountBalancesContainer = document.getElementById('transactions-account-balances');
  const accountBalancesList = document.getElementById('transactions-account-balances-list');
  
  if (!accountBalancesContainer || !accountBalancesList) return;
  
  // Only show if a date is selected
  if (!transactionsSelectedFilterDate) {
    accountBalancesContainer.classList.add('hidden');
    return;
  }
  
  // Get all accounts and transactions
  const [accountsSnapshot, transactionsSnapshot] = await Promise.all([
    getAccountsRef().once('value'),
    getTransactionsRef().once('value')
  ]);
  
  const accounts = accountsSnapshot.val() || {};
  const allTransactions = transactionsSnapshot.val() || {};
  
  // Calculate end date (end of selected day)
  const filterDateEnd = new Date(transactionsSelectedFilterDate.getFullYear(), 
                                  transactionsSelectedFilterDate.getMonth(), 
                                  transactionsSelectedFilterDate.getDate(), 
                                  23, 59, 59, 999).getTime();
  
  // Calculate balance per account (initial balance + transactions up to end of selected day)
  const accountTotalBalances = {};
  
  Object.entries(accounts).forEach(([accountId, account]) => {
    if (account?.active === false) return;
    
    // Start with initial balance
    const initialBalance = parseFloat(account.initialBalance) || 0;
    let totalBalance = initialBalance;
    
    // Add transactions for this account up to the end date
    Object.values(allTransactions).forEach(transaction => {
      if (!transaction || !transaction.accountId) return;
      if (transaction.accountId !== accountId) return;
      
      const transactionDate = transaction.date || transaction.createdAt;
      if (!transactionDate) return;
      
      // Only include transactions up to the end of the selected day
      if (transactionDate > filterDateEnd) {
        return; // Skip transactions after the selected day
      }
      
      const amount = parseFloat(transaction.amount || 0);
      if (transaction.type === 'income') {
        totalBalance += amount;
      } else if (transaction.type === 'expense') {
        totalBalance -= amount;
      }
    });
    
    accountTotalBalances[accountId] = {
      name: account.name,
      balance: totalBalance
    };
  });
  
  // Clear and render account balances
  accountBalancesList.innerHTML = '';
  
  if (Object.keys(accountTotalBalances).length === 0) {
    accountBalancesContainer.classList.add('hidden');
    return;
  }
  
  // Helper function to get account order (fixed order)
  const getAccountOrder = (accountName) => {
    const nameUpper = accountName.toUpperCase();
    // Orden fijo: 1. Efectivo, 2. Débito, 3. Crédito, 4. Mercado Pago
    if (nameUpper.includes('EFECTIVO')) return 1;
    if (nameUpper.includes('DÉBITO') || nameUpper.includes('DEBITO')) return 2;
    if (nameUpper.includes('CRÉDITO') || nameUpper.includes('CREDITO')) return 3;
    if (nameUpper.includes('MERCADO PAGO') || nameUpper.includes('MERCADOPAGO')) return 4;
    // Si no coincide con ninguno, ponerlo al final pero ordenado alfabéticamente
    return 999;
  };
  
  // Sort accounts by fixed order
  const sortedAccounts = Object.entries(accountTotalBalances).sort((a, b) => {
    const orderA = getAccountOrder(a[1].name);
    const orderB = getAccountOrder(b[1].name);
    
    // Si ambos tienen orden fijo, ordenar por ese orden
    if (orderA !== 999 && orderB !== 999) {
      return orderA - orderB;
    }
    // Si solo uno tiene orden fijo, ese va primero
    if (orderA !== 999) return -1;
    if (orderB !== 999) return 1;
    // Si ninguno tiene orden fijo, ordenar alfabéticamente
    return a[1].name.localeCompare(b[1].name);
  });
  
  sortedAccounts.forEach(([accountId, accountData]) => {
    const item = document.createElement('div');
    const balanceColor = accountData.balance >= 0 ? 'text-purple-600' : 'text-red-600';
    item.className = 'flex justify-between items-center py-1 border-b border-gray-200 last:border-0';
    item.innerHTML = `
      <span class="text-xs text-gray-700 truncate flex-1 mr-2">${escapeHtml(accountData.name)}</span>
      <span class="text-xs sm:text-sm font-medium ${balanceColor} whitespace-nowrap">$${formatNumber(Math.abs(accountData.balance))}</span>
    `;
    accountBalancesList.appendChild(item);
  });
  
  // Show account balances section
  accountBalancesContainer.classList.remove('hidden');
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

