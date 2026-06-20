// Transaction management

import {
  initializeDescriptionsIndex,
  getAvailableDescriptions,
  getDescriptionsMetadata,
  getDescriptionsForCategory,
  getDescriptionsForCategories
} from '../modules/transaction-descriptions.js';
import { getCategoriesDict } from '../modules/categories-store.js';

let transactionsListener = null;
// Initialize with today's date by default
let transactionsSelectedFilterDate = (() => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
})();
let transactionsSearchText = '';
let transactionsAdvancedFilters = {
  dateFrom: null,
  dateTo: null,
  type: null,
  accountId: null,
  categoryIds: [],
  subcategoryDescriptions: [],
  fromReconciliation: null
};

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

// formatNumber is now available from NRDCommon (window.formatNumber)

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
  const nrd = window.nrd;
  if (!nrd) {
    logger.error('NRD service not available');
    return;
  }
  
  logger.debug('Loading transactions', { initializeToToday });
  const transactionsList = document.getElementById('transactions-list');
  if (!transactionsList) {
    logger.warn('Transactions list element not found');
    return;
  }
  
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
    logger.debug('Removing previous transactions listener');
    transactionsListener(); // Unsubscribe from NRD Data Access listener
    transactionsListener = null;
  }

  // Listen for transactions using NRD Data Access
  logger.debug('Setting up transactions listener');
  transactionsListener = nrd.transactions.onValue((transactionsArray) => {
    if (!transactionsList) return;
    transactionsList.innerHTML = '';
    
    // Convert to object format if needed (NRD Data Access may return object with IDs as keys or array)
    const transactions = Array.isArray(transactionsArray) 
      ? transactionsArray.reduce((acc, transaction) => {
          if (transaction && transaction.id) {
            acc[transaction.id] = transaction;
          }
          return acc;
        }, {})
      : transactionsArray || {};

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
    
    // Apply advanced filters
    if (transactionsAdvancedFilters.dateFrom || transactionsAdvancedFilters.dateTo) {
      const dateFrom = transactionsAdvancedFilters.dateFrom ? 
        new Date(transactionsAdvancedFilters.dateFrom).setHours(0, 0, 0, 0) : null;
      const dateTo = transactionsAdvancedFilters.dateTo ? 
        new Date(transactionsAdvancedFilters.dateTo).setHours(23, 59, 59, 999) : null;
      
      transactionsToShow = transactionsToShow.filter(([id, transaction]) => {
        const transactionDate = transaction.date || transaction.createdAt || 0;
        if (dateFrom && transactionDate < dateFrom) return false;
        if (dateTo && transactionDate > dateTo) return false;
        return true;
      });
    }
    
    if (transactionsAdvancedFilters.type) {
      transactionsToShow = transactionsToShow.filter(([id, transaction]) => {
        return transaction.type === transactionsAdvancedFilters.type;
      });
    }
    
    if (transactionsAdvancedFilters.accountId) {
      transactionsToShow = transactionsToShow.filter(([id, transaction]) => {
        return transaction.accountId === transactionsAdvancedFilters.accountId;
      });
    }
    
    if (transactionsAdvancedFilters.categoryIds && transactionsAdvancedFilters.categoryIds.length > 0) {
      transactionsToShow = transactionsToShow.filter(([id, transaction]) => {
        return transaction.categoryId && transactionsAdvancedFilters.categoryIds.includes(transaction.categoryId);
      });
    }

    if (transactionsAdvancedFilters.subcategoryDescriptions && transactionsAdvancedFilters.subcategoryDescriptions.length > 0) {
      const subSet = new Set(transactionsAdvancedFilters.subcategoryDescriptions);
      transactionsToShow = transactionsToShow.filter(([id, transaction]) => {
        const desc = (transaction.description || '').trim();
        return desc && subSet.has(desc);
      });
    }
    
    if (transactionsAdvancedFilters.fromReconciliation === true) {
      transactionsToShow = transactionsToShow.filter(([id, transaction]) => {
        return transaction.idHashBancario;
      });
    }
    
    // Filter by search text if provided
    if (transactionsSearchText && transactionsSearchText.trim()) {
      // Función para parsear términos: extrae términos entre comillas y términos separados por espacios
      const parseSearchTerms = (searchText) => {
        const terms = [];
        let currentTerm = '';
        let insideQuotes = false;
        let quoteChar = '';
        
        for (let i = 0; i < searchText.length; i++) {
          const char = searchText[i];
          
          // Detectar inicio de comillas (simples o dobles)
          if ((char === '"' || char === "'") && !insideQuotes) {
            insideQuotes = true;
            quoteChar = char;
            // Si había un término antes de las comillas, agregarlo
            if (currentTerm.trim()) {
              terms.push(currentTerm.trim());
              currentTerm = '';
            }
            continue;
          }
          
          // Detectar fin de comillas
          if (char === quoteChar && insideQuotes) {
            insideQuotes = false;
            quoteChar = '';
            // Agregar el término entre comillas
            if (currentTerm.trim()) {
              terms.push(currentTerm.trim());
              currentTerm = '';
            }
            continue;
          }
          
          // Si estamos dentro de comillas, agregar cualquier carácter
          if (insideQuotes) {
            currentTerm += char;
            continue;
          }
          
          // Si encontramos un espacio fuera de comillas, terminar el término actual
          if (char === ' ' || char === '\t') {
            if (currentTerm.trim()) {
              terms.push(currentTerm.trim());
              currentTerm = '';
            }
            continue;
          }
          
          // Agregar carácter al término actual
          currentTerm += char;
        }
        
        // Agregar el último término si existe
        if (currentTerm.trim()) {
          terms.push(currentTerm.trim());
        }
        
        return terms.filter(term => term.length > 0);
      };
      
      const normalizeSearchText = window.normalizeSearchText || window.NRDCommon?.normalizeSearchText || ((t) => t.toLowerCase());
      const normalizedSearchText = normalizeSearchText(transactionsSearchText.trim());
      const searchTerms = parseSearchTerms(normalizedSearchText);
      
      if (searchTerms.length > 0) {
        transactionsToShow = transactionsToShow.filter(([id, transaction]) => {
          // Search in all transaction properties
          const description = normalizeSearchText(transaction.description || '');
          const categoryName = normalizeSearchText(transaction.categoryName || '');
          const accountName = normalizeSearchText(transaction.accountName || '');
          const notes = normalizeSearchText(transaction.notes || '');
          const amount = normalizeSearchText(formatNumber(parseFloat(transaction.amount || 0)));
          const date = transaction.date ? normalizeSearchText(formatDate24h(new Date(transaction.date))) : '';
          const type = normalizeSearchText(transaction.type === 'income' ? 'ingreso' : 'egreso');
          
          // Combinar todas las propiedades en un solo texto para buscar
          const searchableText = `${description} ${categoryName} ${accountName} ${notes} ${amount} ${date} ${type}`;
          
          // Verificar que TODOS los términos estén presentes (AND lógico)
          return searchTerms.every(term => searchableText.includes(normalizeSearchText(term)));
        });
      }
    }
    
    // Calculate totals for the selected day (after applying search filter)
    if (transactionsSelectedFilterDate) {
      updateDaySummary(transactionsToShow).catch(err => {
        logger.error('Error updating day summary', err);
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
      
      const subcategoria = transaction.description || 'Sin subcategoría';
      item.innerHTML = `
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0 mb-2 sm:mb-3">
          <div class="text-base sm:text-lg font-light">${escapeHtml(subcategoria)}</div>
          <div class="text-base sm:text-lg font-light ${amountColor} font-medium">${prefix}$${formatNumber(parseFloat(transaction.amount || 0))}</div>
        </div>
        <div class="text-xs sm:text-sm text-gray-600 space-y-0.5 sm:space-y-1">
          <div>Fecha: ${formatDate24h(date)}</div>
          <div>Subcategoría: ${escapeHtml(subcategoria)}</div>
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
  // Wait for helper functions to be available (they're loaded from other modules)
  const maxWait = 5000;
  const startTime = Date.now();
  while (!window.loadCategoriesForTransaction || !window.loadAccountsForTransaction) {
    if (Date.now() - startTime >= maxWait) {
      logger.error('Helper functions not available after timeout');
      await showError('Error: Funciones auxiliares no disponibles. Por favor recarga la página.');
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
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
  // saveBtn ya fue declarado arriba, solo reutilizamos
  
  if (formTitle) {
    formTitle.textContent = type === 'income' ? 'Nuevo Ingreso' : 'Nuevo Egreso';
  }
  if (formSubtitle) {
    formSubtitle.textContent = type === 'income' 
      ? 'Registre un ingreso de dinero. Complete todos los campos marcados con *'
      : 'Registre un egreso de dinero. Complete todos los campos marcados con *';
  }
  // Cambiar color del botón guardar a verde
  if (saveBtn) {
    saveBtn.classList.remove('bg-blue-600', 'border-blue-600', 'hover:bg-blue-700');
    saveBtn.classList.add('bg-green-600', 'border-green-600', 'hover:bg-green-700');
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
  const categories = await window.loadCategoriesForTransaction(type);
  const categorySelect = document.getElementById('transaction-category');
  categorySelect.innerHTML = '<option value="">Seleccionar categoría</option>';
  categories.forEach(category => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    categorySelect.appendChild(option);
  });
  
  // Load accounts
  const accounts = await window.loadAccountsForTransaction();
  const accountSelect = document.getElementById('transaction-account');
  accountSelect.innerHTML = '<option value="">Seleccionar cuenta</option>';
  accounts.forEach(account => {
    const option = document.createElement('option');
    option.value = account.id;
    option.textContent = account.name;
    accountSelect.appendChild(option);
  });
  
  // Load unique descriptions for autocomplete (from in-memory index)
  loadDescriptionsForAutocomplete();
  
  // Setup autocomplete input listener
  setupDescriptionAutocomplete();
  
  // Setup account change listener to reload categories ordered by last use
  // accountSelect ya fue declarado arriba, solo reutilizamos
  if (accountSelect) {
    accountSelect.addEventListener('change', async () => {
      const selectedAccountId = accountSelect.value;
      const transactionType = document.getElementById('transaction-type')?.value;
      
      if (transactionType) {
        // Recargar categorías ordenadas por último uso en esta cuenta
        if (!window.loadCategoriesForTransaction) {
          logger.error('loadCategoriesForTransaction not available');
          return;
        }
        const categories = await window.loadCategoriesForTransaction(transactionType, selectedAccountId);
        const categorySelect = document.getElementById('transaction-category');
        const currentCategoryId = categorySelect.value;
        
        categorySelect.innerHTML = '<option value="">-- Seleccione una categoría --</option>';
        categories.forEach(category => {
          const option = document.createElement('option');
          option.value = category.id;
          option.textContent = category.name;
          if (category.id === currentCategoryId) {
            option.selected = true;
          }
          categorySelect.appendChild(option);
        });
        
        // Si hay una categoría seleccionada, actualizar el autocomplete de subcategorías
        if (currentCategoryId) {
          const descriptionInput = document.getElementById('transaction-description');
          if (descriptionInput && descriptionInput.value) {
            showDescriptionAutocomplete(descriptionInput.value);
          }
        }
      }
      
      // Actualizar lista de cuentas para transferencia (excluir la cuenta seleccionada)
      await checkCategoryForTransfer();
    });
  }
  
  // Setup category change listener to update subcategory autocomplete order
  // categorySelect ya fue declarado arriba, solo reutilizamos
  if (categorySelect) {
    categorySelect.addEventListener('change', async () => {
      const descriptionInput = document.getElementById('transaction-description');
      if (descriptionInput && descriptionInput.value) {
        // Actualizar el autocomplete con el nuevo orden basado en cuenta y categoría
        showDescriptionAutocomplete(descriptionInput.value);
      }
      
      // Check if category is transferencia
      await checkCategoryForTransfer();
    });
  }
  
  // Setup category change listener for "OTROS" validation
  // Esperar un poco para que las categorías se carguen completamente
  setTimeout(() => {
    setupCategoryNotesValidation();
    checkCategoryForTransfer();
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
    // Mostrar todas las opciones disponibles al hacer clic, ordenadas por uso reciente del mismo tipo
    showDescriptionAutocomplete(e.target.value || '');
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
let descriptionsWithMetadata = {}; // Store metadata: { description: { type, lastUsed, accountId, categoryId } }

// Load unique descriptions for autocomplete with metadata (from shared index, no network)
function loadDescriptionsForAutocomplete() {
  initializeDescriptionsIndex();
  availableDescriptions = getAvailableDescriptions();
  descriptionsWithMetadata = getDescriptionsMetadata();
}

// Show autocomplete suggestions (fallback for browsers that don't support datalist well)
function showDescriptionAutocomplete(inputValue) {
  const autocompleteList = document.getElementById('description-autocomplete-list');
  if (!autocompleteList) return;
  
  // Get current transaction type, account, and category
  const transactionType = document.getElementById('transaction-type')?.value;
  const accountId = document.getElementById('transaction-account')?.value || null;
  const categoryId = document.getElementById('transaction-category')?.value || null;
  
  // Filter descriptions based on input
  const normalizeSearchText = window.normalizeSearchText || window.NRDCommon?.normalizeSearchText || ((t) => t.toLowerCase());
  const normalizedInput = normalizeSearchText(inputValue);
  const sourceDescriptions = categoryId
    ? getDescriptionsForCategory(categoryId)
    : availableDescriptions;

  let filtered = sourceDescriptions.filter(desc =>
    normalizeSearchText(desc).includes(normalizedInput)
  );
  
  // Sort by: same account+category first (most recent first), then same account (most recent first), then same type (most recent first), then others
  filtered = filtered.sort((a, b) => {
    const metaA = descriptionsWithMetadata[a] || { 
      type: '', 
      lastUsed: 0, 
      accountId: null, 
      categoryId: null,
      usageByAccountCategory: {}
    };
    const metaB = descriptionsWithMetadata[b] || { 
      type: '', 
      lastUsed: 0, 
      accountId: null, 
      categoryId: null,
      usageByAccountCategory: {}
    };
    
    // Get last use for specific account+category combination
    const keyA = `${accountId || 'none'}_${categoryId || 'none'}`;
    const keyB = `${accountId || 'none'}_${categoryId || 'none'}`;
    const lastUseA = metaA.usageByAccountCategory[keyA] || 0;
    const lastUseB = metaB.usageByAccountCategory[keyB] || 0;
    
    // If both have usage with this account+category, sort by date (most recent first)
    if (lastUseA > 0 && lastUseB > 0) {
      return lastUseB - lastUseA;
    }
    // If only one has usage with this account+category, that one goes first
    if (lastUseA > 0 && lastUseB === 0) return -1;
    if (lastUseA === 0 && lastUseB > 0) return 1;
    
    // If neither has usage with this account+category, check same type
    const aIsSameType = metaA.type === transactionType;
    const bIsSameType = metaB.type === transactionType;
    
    if (aIsSameType && !bIsSameType) return -1;
    if (!aIsSameType && bIsSameType) return 1;
    
    // If both are same type or both are different, sort by general lastUsed (most recent first)
    return metaB.lastUsed - metaA.lastUsed;
  });
  
  // If no matches, hide list
  if (filtered.length === 0) {
    autocompleteList.classList.add('hidden');
    autocompleteList.innerHTML = '';
    return;
  }
  
  // Show filtered list
  autocompleteList.innerHTML = '';
  autocompleteList.classList.remove('hidden');
  
  // Show suggestions (limit to 15)
  filtered.slice(0, 15).forEach(desc => {
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
  if (searchFilter) searchFilter.style.display = 'flex';
  
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
  
  // Hide and clear transfer account field
  const transferContainer = document.getElementById('transaction-transfer-account-container');
  const transferAccountSelect = document.getElementById('transaction-transfer-account');
  if (transferContainer) transferContainer.classList.add('hidden');
  if (transferAccountSelect) {
    transferAccountSelect.value = '';
    transferAccountSelect.removeAttribute('required');
  }
}

// Save transaction
async function saveTransaction() {
  // Get nrd service dynamically to avoid initialization issues
  const nrd = window.nrd;
  if (!nrd) {
    await showError('Servicio NRD no disponible');
    return;
  }
  
  const form = document.getElementById('transaction-form');
  const isEditing = form.dataset.editingTransactionId;
  
  const type = document.getElementById('transaction-type').value;
  const description = document.getElementById('transaction-description').value.trim();
  const amountStr = document.getElementById('transaction-amount').value.trim();
  const amount = parseAmount(amountStr);
  const categoryId = document.getElementById('transaction-category').value;
  const accountId = document.getElementById('transaction-account').value;
  const transferAccountId = document.getElementById('transaction-transfer-account')?.value || '';
  const dateInput = document.getElementById('transaction-date').value;
  const notes = document.getElementById('transaction-notes').value.trim();
  
  // Validar si la categoría contiene "OTROS" y requiere notas
  if (categoryId) {
    try {
      const category = await nrd.categories.getById(categoryId);
      
      if (category && category.name && category.name.toUpperCase().includes('OTROS')) {
        if (!notes || notes.trim().length === 0) {
          await showError('Las notas son obligatorias cuando la categoría contiene "OTROS". Por favor complete las notas adicionales');
          document.getElementById('transaction-notes').focus();
          return;
        }
      }
      
      // Validar si la categoría contiene "TRANSFERENCIA" y requiere cuenta destino/origen
      if (category && category.name && category.name.toUpperCase().includes('TRANSFERENCIA')) {
        if (!transferAccountId || transferAccountId.trim().length === 0) {
          await showError('Por favor seleccione la cuenta destino/origen de la transferencia');
          document.getElementById('transaction-transfer-account')?.focus();
          return;
        }
        
        // Validar que la cuenta destino sea diferente a la cuenta origen
        if (transferAccountId === accountId) {
          await showError('La cuenta destino debe ser diferente a la cuenta origen');
          document.getElementById('transaction-transfer-account')?.focus();
          return;
        }
      }
    } catch (error) {
      logger.error('Error validating category', error);
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

  // Alertar si la subcategoría es nueva (no usada antes con esta categoría)
  if (categoryId && description) {
    const knownForCategory = Object.keys(descriptionsWithMetadata).filter(
      desc => descriptionsWithMetadata[desc].categoryIds && descriptionsWithMetadata[desc].categoryIds.has(categoryId)
    );
    const normalize = (t) => (t || '').trim().toLowerCase();
    const isNewSubcategory = !knownForCategory.some(d => normalize(d) === normalize(description));
    if (isNewSubcategory) {
      const showConfirm = window.NRDCommon?.showConfirm || (async (title, msg) => window.confirm(`${title}\n\n${msg}`));
      const confirmed = await showConfirm(
        'Nueva subcategoría',
        `La subcategoría "${description}" no se ha usado antes con esta categoría. Se registrará como nueva. ¿Desea continuar?`
      );
      if (!confirmed) {
        document.getElementById('transaction-description').focus();
        return;
      }
    }
  }

  // Validar notas si la categoría contiene "OTROS" (ya validado arriba, pero mantener para consistencia)
  
  try {
    // Verificar que la categoría existe y está activa
    const category = await nrd.categories.getById(categoryId);
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
    const account = await nrd.accounts.getById(accountId);
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
      const existingTransaction = await nrd.transactions.getById(transactionId);
      if (!existingTransaction) {
        await showError('La transacción no existe');
        return;
      }
      
      // Check if this is a transferencia transaction
      const isTransferencia = category && category.name && category.name.toUpperCase().includes('TRANSFERENCIA');
      
      if (isTransferencia && transferAccountId) {
        // Es una transferencia: actualizar ambas transacciones
        const transferAccount = await nrd.accounts.getById(transferAccountId);
        if (!transferAccount) {
          await showError('La cuenta destino/origen seleccionada no existe. Por favor seleccione otra');
          document.getElementById('transaction-transfer-account').value = '';
          document.getElementById('transaction-transfer-account').focus();
          return;
        }
        
        if (transferAccount.active === false) {
          await showError('La cuenta destino/origen seleccionada está desactivada. Por favor seleccione otra');
          document.getElementById('transaction-transfer-account').value = '';
          document.getElementById('transaction-transfer-account').focus();
          return;
        }
        
        // Find related transfer transaction
        const relatedTransaction = await findRelatedTransferTransaction(existingTransaction);
        
        const user = nrd?.auth?.getCurrentUser() || null;
        showSpinner('Actualizando transferencia...');
        
        // Update current transaction
        const currentTransactionData = {
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
        
        await nrd.transactions.update(transactionId, currentTransactionData);
        logger.audit('ENTITY_UPDATE', { entity: 'transaction', id: transactionId, data: currentTransactionData, uid: user?.uid, email: user?.email, timestamp: Date.now() });
        
        // Update or create related transaction
        if (relatedTransaction) {
          // Update existing related transaction
          const oppositeType = type === 'income' ? 'expense' : 'income';
          const relatedAccountId = type === 'expense' ? transferAccountId : accountId;
          const relatedAccountName = type === 'expense' ? transferAccount.name : account.name;
          
          const relatedTransactionData = {
            type: oppositeType,
            description,
            amount,
            categoryId,
            categoryName: category.name,
            accountId: relatedAccountId,
            accountName: relatedAccountName,
            date: transactionDate,
            notes: notes || null,
            createdAt: relatedTransaction.createdAt, // Preserve original creation date
            updatedAt: Date.now()
          };
          
          await nrd.transactions.update(relatedTransaction.id, relatedTransactionData);
          logger.audit('ENTITY_UPDATE', { entity: 'transaction', id: relatedTransaction.id, data: relatedTransactionData, uid: user?.uid, email: user?.email, timestamp: Date.now() });
          logger.info('Transfer transactions updated successfully', { transactionId, relatedTransactionId: relatedTransaction.id });
        } else {
          // Create new related transaction if it doesn't exist
          const oppositeType = type === 'income' ? 'expense' : 'income';
          const relatedAccountId = type === 'expense' ? transferAccountId : accountId;
          const relatedAccountName = type === 'expense' ? transferAccount.name : account.name;
          
          const relatedTransactionData = {
            type: oppositeType,
            description,
            amount,
            categoryId,
            categoryName: category.name,
            accountId: relatedAccountId,
            accountName: relatedAccountName,
            date: transactionDate,
            notes: notes || null,
            createdAt: Date.now()
          };
          
          const newRelatedTransactionId = await nrd.transactions.create(relatedTransactionData);
          logger.audit('ENTITY_CREATE', { entity: 'transaction', id: newRelatedTransactionId, data: relatedTransactionData, uid: user?.uid, email: user?.email, timestamp: Date.now() });
          logger.info('Transfer transactions updated successfully (created related)', { transactionId, newRelatedTransactionId });
        }
        
        hideSpinner();
        hideTransactionForm();
        loadTransactions(false);
        await showSuccess('✓ Transferencia actualizada correctamente');
      } else {
        // Regular transaction update
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

        const user = nrd?.auth?.getCurrentUser() || null;
        showSpinner('Actualizando transacción...');
        logger.info('Updating transaction', { transactionId, type, amount, categoryId, accountId });
        await nrd.transactions.update(transactionId, transactionData);
        logger.audit('ENTITY_UPDATE', { entity: 'transaction', id: transactionId, data: transactionData, uid: user?.uid, email: user?.email, timestamp: Date.now() });
        logger.info('Transaction updated successfully', { transactionId });
        hideSpinner();
        
        // Cerrar el formulario y volver a la lista de transacciones
        hideTransactionForm();
        // Recargar las transacciones para actualizar la lista del día seleccionado
        loadTransactions(false);
        await showSuccess('✓ Transacción actualizada correctamente');
      }
    } else {
      // Create new transaction
      // Verificar duplicados potenciales (mismo monto, subcategoría y fecha en el mismo día)
      const transactionsArray = await nrd.transactions.getAll();
      const allTransactions = Array.isArray(transactionsArray) 
        ? transactionsArray.reduce((acc, transaction) => {
            if (transaction && transaction.id) {
              acc[transaction.id] = transaction;
            }
            return acc;
          }, {})
        : transactionsArray || {};
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
      
      // Check if this is a transferencia transaction
      const isTransferencia = category && category.name && category.name.toUpperCase().includes('TRANSFERENCIA');
      
      if (isTransferencia && transferAccountId) {
        // Es una transferencia: crear dos transacciones
        const transferAccount = await nrd.accounts.getById(transferAccountId);
        if (!transferAccount) {
          await showError('La cuenta destino/origen seleccionada no existe. Por favor seleccione otra');
          document.getElementById('transaction-transfer-account').value = '';
          document.getElementById('transaction-transfer-account').focus();
          return;
        }
        
        if (transferAccount.active === false) {
          await showError('La cuenta destino/origen seleccionada está desactivada. Por favor seleccione otra');
          document.getElementById('transaction-transfer-account').value = '';
          document.getElementById('transaction-transfer-account').focus();
          return;
        }
        
        const user = nrd?.auth?.getCurrentUser() || null;
        showSpinner('Guardando transferencia...');
        logger.info('Creating transfer transaction', { type, amount, categoryId, fromAccount: accountId, toAccount: transferAccountId });
        
        // Crear transacción de egreso en cuenta origen
        const expenseTransactionData = {
          type: 'expense',
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
        
        // Crear transacción de ingreso en cuenta destino
        const incomeTransactionData = {
          type: 'income',
          description: description.trim(),
          amount,
          categoryId,
          categoryName: category.name,
          accountId: transferAccountId,
          accountName: transferAccount.name,
          date: transactionDate,
          notes: notes ? notes.trim() : null,
          createdAt: Date.now()
        };
        
        const expenseTransactionId = await nrd.transactions.create(expenseTransactionData);
        logger.audit('ENTITY_CREATE', { entity: 'transaction', id: expenseTransactionId, data: expenseTransactionData, uid: user?.uid, email: user?.email, timestamp: Date.now() });
        
        const incomeTransactionId = await nrd.transactions.create(incomeTransactionData);
        logger.audit('ENTITY_CREATE', { entity: 'transaction', id: incomeTransactionId, data: incomeTransactionData, uid: user?.uid, email: user?.email, timestamp: Date.now() });
        
        logger.info('Transfer transactions created successfully', { expenseTransactionId, incomeTransactionId, amount });
        hideSpinner();
        
        // Close form for new transactions
        hideTransactionForm();
        // Recargar las transacciones para actualizar la lista del día seleccionado
        loadTransactions(false);
        await showSuccess('✓ Transferencia guardada correctamente (2 transacciones creadas)');
      } else {
        // Transacción normal: crear una sola transacción
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

        const user = nrd?.auth?.getCurrentUser() || null;
        showSpinner('Guardando transacción...');
        logger.info('Creating new transaction', { type, amount, categoryId, accountId });
        const transactionId = await nrd.transactions.create(transactionData);
        logger.audit('ENTITY_CREATE', { entity: 'transaction', id: transactionId, data: transactionData, uid: user?.uid, email: user?.email, timestamp: Date.now() });
        logger.info('Transaction created successfully', { transactionId, type, amount });
        hideSpinner();
        
        // Close form for new transactions
        hideTransactionForm();
        // Recargar las transacciones para actualizar la lista del día seleccionado
        loadTransactions(false);
        await showSuccess('✓ Transacción guardada correctamente');
      }
    }
  } catch (error) {
    hideSpinner();
    logger.error('Error al guardar transacción:', error);
    
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
    const transaction = await nrd.transactions.getById(transactionId);
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
    if (form) form.classList.add('hidden');
    if (dateFilter) dateFilter.style.display = 'none';
    if (searchFilter) searchFilter.style.display = 'none';
    if (detail) detail.classList.remove('hidden');
    
    // Ocultar la sección de resúmenes cuando se está viendo una transacción
    const daySummary = document.getElementById('transactions-day-summary');
    if (daySummary) {
      daySummary.style.display = 'none';
    }
    
    // Preparar datos para mostrar - determinar tipo primero
    const isIncome = transaction.type === 'income';
    const amount = parseFloat(transaction.amount) || 0;
    const amountColor = isIncome ? 'text-green-600' : 'text-red-600';
    const prefix = isIncome ? '+' : '-';
    const date = transaction.date ? new Date(transaction.date) : (transaction.createdAt ? new Date(transaction.createdAt) : new Date());
    const dateStr = formatDate24h(date);
    
    // Cambiar color del header según el tipo de transacción
    const detailHeader = document.getElementById('transaction-detail-header');
    if (detailHeader) {
      // Remover todos los colores posibles
      detailHeader.classList.remove('bg-green-600', 'bg-red-600', 'bg-blue-600', 'bg-gray-600');
      // Agregar el color correspondiente al tipo
      if (isIncome) {
        detailHeader.classList.add('bg-green-600');
      } else {
        detailHeader.classList.add('bg-red-600');
      }
    }
    
    // Obtener categoría y cuenta para mostrar
    let categoryName = 'Sin categoría';
    let accountName = 'Sin cuenta';
    
    if (transaction.categoryId) {
      try {
        const category = await nrd.categories.getById(transaction.categoryId);
        if (category) {
          categoryName = category.name || 'Sin categoría';
        }
      } catch (e) {
        logger.error('Error loading category', e);
      }
    }
    
    if (transaction.accountId) {
      try {
        const account = await nrd.accounts.getById(transaction.accountId);
        if (account) {
          accountName = account.name || 'Sin cuenta';
        }
      } catch (e) {
        logger.error('Error loading account:', e);
      }
    }
    
    // Generar contenido HTML para el detalle
    const detailContent = document.getElementById('transaction-detail-content');
    if (detailContent) {
      detailContent.innerHTML = `
        <div class="space-y-4 sm:space-y-6">
          <div>
            <label class="block text-xs uppercase tracking-wider text-gray-500 mb-2">Subcategoría</label>
            <p class="text-base sm:text-lg font-light text-gray-800">${escapeHtml(transaction.description || 'Sin subcategoría')}</p>
          </div>
          
          <div>
            <label class="block text-xs uppercase tracking-wider text-gray-500 mb-2">Monto</label>
            <p class="text-2xl sm:text-3xl font-light ${amountColor}">${prefix}$${formatNumber(Math.abs(amount))}</p>
          </div>
          
          <div>
            <label class="block text-xs uppercase tracking-wider text-gray-500 mb-2">Fecha</label>
            <p class="text-base sm:text-lg font-light text-gray-800">${dateStr}</p>
          </div>
          
          <div>
            <label class="block text-xs uppercase tracking-wider text-gray-500 mb-2">Categoría</label>
            <p class="text-base sm:text-lg font-light text-gray-800">${escapeHtml(categoryName)}</p>
          </div>
          
          <div>
            <label class="block text-xs uppercase tracking-wider text-gray-500 mb-2">Cuenta</label>
            <p class="text-base sm:text-lg font-light text-gray-800">${escapeHtml(accountName)}</p>
          </div>
          
          ${transaction.notes ? `
          <div>
            <label class="block text-xs uppercase tracking-wider text-gray-500 mb-2">Notas</label>
            <p class="text-base sm:text-lg font-light text-gray-800 whitespace-pre-wrap">${escapeHtml(transaction.notes)}</p>
          </div>
          ` : ''}
        </div>
      `;
    }
    
    // Store transaction data para los botones
    if (detail) {
      detail.dataset.transactionId = transactionId;
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
  const searchFilter = document.getElementById('transactions-search-filter-container');
  
  if (list) list.style.display = 'block';
  if (header) header.style.display = 'flex';
  if (detail) detail.classList.add('hidden');
  if (dateFilter) dateFilter.style.display = 'flex';
  if (searchFilter) searchFilter.style.display = 'flex';
}

// Edit transaction - switch from view mode to edit mode
async function editTransaction(transactionId, transaction) {
  const form = document.getElementById('transaction-form');
  const detail = document.getElementById('transaction-detail');
  const list = document.getElementById('transactions-list');
  const header = document.querySelector('#transactions-view .flex.flex-col');
  const dateFilter = document.getElementById('transactions-date-filter-container');
  const searchFilter = document.getElementById('transactions-search-filter-container');
  
  // Ocultar el detalle y mostrar el formulario
  if (detail) detail.classList.add('hidden');
  if (list) list.style.display = 'none';
  if (header) header.style.display = 'none';
  if (dateFilter) dateFilter.style.display = 'none';
  if (searchFilter) searchFilter.style.display = 'none';
  if (form) form.classList.remove('hidden');
  
  // Restore fields from read-only text display first
  restoreFieldsFromReadOnlyText();
  
  // Change to edit mode
  form.dataset.viewMode = 'edit';
  form.dataset.editingTransactionId = transactionId;
  
  // Aplicar fondo de color según el tipo de transacción (mantener color según tipo, no azul)
  const formHeader = document.getElementById('transaction-form-header');
  // Mostrar el header cuando se está editando
  if (formHeader) {
    formHeader.style.display = '';
    // Mantener el color según el tipo de transacción, no azul
    formHeader.classList.remove('bg-green-600', 'bg-red-600', 'bg-gray-600', 'bg-blue-600');
    if (transaction.type === 'income') {
      formHeader.classList.add('bg-green-600');
    } else {
      formHeader.classList.add('bg-red-600');
    }
  }
  form.classList.remove('bg-white', 'bg-green-50', 'bg-red-50');
  if (transaction.type === 'income') {
    form.classList.add('bg-green-50');
  } else {
    form.classList.add('bg-red-50');
  }
  
  // Set form title
  const formTitle = document.getElementById('transaction-form-title');
  const saveBtn = document.getElementById('save-transaction-form-btn');
  
  if (formTitle) {
    formTitle.textContent = 'Editar Transacción';
  }
  // Cambiar color del botón guardar a azul
  if (saveBtn) {
    saveBtn.classList.remove('bg-green-600', 'border-green-600', 'hover:bg-green-700');
    saveBtn.classList.add('bg-blue-600', 'border-blue-600', 'hover:bg-blue-700');
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
  // saveBtn ya fue declarado arriba, solo reutilizamos
  
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
  
  // Load accounts first
  if (!window.loadAccountsForTransaction) {
    logger.error('loadAccountsForTransaction not available');
    return;
  }
  const accounts = await window.loadAccountsForTransaction();
  const accountSelect = document.getElementById('transaction-account');
  accountSelect.innerHTML = '<option value="">Seleccionar cuenta</option>';
  accounts.forEach(account => {
    const option = document.createElement('option');
    option.value = account.id;
    option.textContent = account.name;
    option.selected = account.id === transaction.accountId;
    accountSelect.appendChild(option);
  });
  
  // Load categories for this type, ordered by last use with the selected account
  if (!window.loadCategoriesForTransaction) {
    logger.error('loadCategoriesForTransaction not available');
    return;
  }
  const categories = await window.loadCategoriesForTransaction(transaction.type, transaction.accountId);
  const categorySelect = document.getElementById('transaction-category');
  categorySelect.innerHTML = '<option value="">Seleccionar categoría</option>';
  categories.forEach(category => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    option.selected = category.id === transaction.categoryId;
    categorySelect.appendChild(option);
  });
  
  // Cargar descripciones para el autocomplete de subcategoría (filtrado por categoría seleccionada)
  loadDescriptionsForAutocomplete();

  // Check if this is a transferencia transaction and load transfer account
  const nrd = window.nrd;
  let transferAccountIdToLoad = null;
  if (nrd && transaction.categoryId) {
    try {
      const category = await nrd.categories.getById(transaction.categoryId);
      if (category && category.name && category.name.toUpperCase().includes('TRANSFERENCIA')) {
        // Find related transfer transaction to get the transfer account
        const relatedTransaction = await findRelatedTransferTransaction(transaction);
        if (relatedTransaction) {
          // The transfer account is always the related transaction's account
          transferAccountIdToLoad = relatedTransaction.accountId;
        }
      }
    } catch (error) {
      logger.error('Error checking for transfer account', error);
    }
  }
  
  // Setup category validation for "OTROS" and check for transferencia
  // Call checkCategoryForTransfer immediately to show/hide transfer field
  await checkCategoryForTransfer();
  
  // If we found a transfer account, set it after checkCategoryForTransfer populates the select
  if (transferAccountIdToLoad) {
    setTimeout(() => {
      const transferAccountSelect = document.getElementById('transaction-transfer-account');
      if (transferAccountSelect) {
        transferAccountSelect.value = transferAccountIdToLoad;
      }
    }, 100);
  }
  
  // Setup description autocomplete for subcategory field
  setupDescriptionAutocomplete();
  
  setTimeout(() => {
    setupCategoryNotesValidation();
    // Call again to ensure it's set up correctly after DOM updates
    checkCategoryForTransfer();
  }, 200);
  
  // Setup category change listener to check for transferencia and update autocomplete
  // Get fresh reference after DOM updates
  const categorySelectForListener = document.getElementById('transaction-category');
  if (categorySelectForListener) {
    categorySelectForListener.addEventListener('change', async () => {
      await checkCategoryForTransfer();
      // Update autocomplete when category changes
      const descriptionInput = document.getElementById('transaction-description');
      if (descriptionInput && descriptionInput.value) {
        showDescriptionAutocomplete(descriptionInput.value);
      }
    });
  }
  
  // Setup account change listener to reload transfer accounts if needed
  // Get fresh reference after DOM updates
  const accountSelectForListener = document.getElementById('transaction-account');
  if (accountSelectForListener) {
    accountSelectForListener.addEventListener('change', async () => {
      await checkCategoryForTransfer();
      // Update autocomplete when account changes
      const descriptionInput = document.getElementById('transaction-description');
      if (descriptionInput && descriptionInput.value) {
        showDescriptionAutocomplete(descriptionInput.value);
      }
    });
  }
  
  // Asegurar que el formulario esté visible
  if (form) {
    form.classList.remove('hidden');
  }
}

// Find related transfer transaction (the counterpart)
async function findRelatedTransferTransaction(transaction) {
  const nrd = window.nrd;
  if (!nrd) {
    logger.error('NRD service not available');
    return null;
  }
  
  try {
    // Check if this transaction is part of a transferencia
    if (!transaction.categoryId) return null;
    
    const category = await nrd.categories.getById(transaction.categoryId);
    if (!category || !category.name || !category.name.toUpperCase().includes('TRANSFERENCIA')) {
      return null;
    }
    
    // Get all transactions to find the counterpart
    const transactionsArray = await nrd.transactions.getAll();
    const allTransactions = Array.isArray(transactionsArray) 
      ? transactionsArray.reduce((acc, t) => {
          if (t && t.id) {
            acc[t.id] = t;
          }
          return acc;
        }, {})
      : transactionsArray || {};
    
    // Find the counterpart transaction
    // Same category, same amount, same date, same description, opposite type
    const oppositeType = transaction.type === 'income' ? 'expense' : 'income';
    const transactionDate = transaction.date || transaction.createdAt;
    
    const relatedTransaction = Object.values(allTransactions).find(t => {
      if (!t || !t.id) return false;
      if (t.id === transaction.id) return false; // Don't match itself
      if (t.categoryId !== transaction.categoryId) return false; // Same category
      if (t.type !== oppositeType) return false; // Opposite type
      if (Math.abs(parseFloat(t.amount || 0) - parseFloat(transaction.amount || 0)) > 0.01) return false; // Same amount (with small tolerance)
      if (t.description?.trim() !== transaction.description?.trim()) return false; // Same description
      
      // Same date (within the same day)
      const tDate = t.date || t.createdAt;
      if (!tDate || !transactionDate) return false;
      const tDay = new Date(tDate);
      tDay.setHours(0, 0, 0, 0);
      const transactionDay = new Date(transactionDate);
      transactionDay.setHours(0, 0, 0, 0);
      if (tDay.getTime() !== transactionDay.getTime()) return false;
      
      return true;
    });
    
    return relatedTransaction || null;
  } catch (error) {
    logger.error('Error finding related transfer transaction:', error);
    return null;
  }
}

// Delete transaction handler
async function deleteTransactionHandler(transactionId) {
  const nrd = window.nrd;
  if (!nrd) {
    await showError('Servicio NRD no disponible');
    return;
  }
  
  try {
    // Get the transaction to check if it's a transferencia
    const transaction = await nrd.transactions.getById(transactionId);
    if (!transaction) {
      await showError('La transacción no existe');
      return;
    }
    
    // Check if this is part of a transferencia
    const relatedTransaction = await findRelatedTransferTransaction(transaction);
    
    let confirmMessage = '¿Está seguro de eliminar esta transacción?';
    let confirmTitle = 'Eliminar Transacción';
    
    if (relatedTransaction) {
      // This is a transferencia, inform that both will be deleted
      const accountName = escapeHtml(transaction.accountName || 'cuenta origen');
      const relatedAccountName = escapeHtml(relatedTransaction.accountName || 'cuenta destino');
      const transactionType = transaction.type === 'income' ? 'Ingreso' : 'Egreso';
      const relatedTransactionType = relatedTransaction.type === 'income' ? 'Ingreso' : 'Egreso';
      const transactionAmount = formatNumber(transaction.amount);
      const relatedTransactionAmount = formatNumber(relatedTransaction.amount);
      
      confirmTitle = 'Eliminar Transferencia';
      confirmMessage = `Esta transacción es parte de una transferencia.<br><br>Se eliminarán ambas transacciones:<br>• ${accountName}: ${transactionType} de $${transactionAmount}<br>• ${relatedAccountName}: ${relatedTransactionType} de $${relatedTransactionAmount}<br><br>¿Desea continuar?`;
    }
    
    const confirmed = await showConfirm(confirmTitle, confirmMessage);
    if (!confirmed) return;

    // Cerrar el modal de detalles inmediatamente después de la confirmación
    backToTransactions();
    
    showSpinner(relatedTransaction ? 'Eliminando transferencia...' : 'Eliminando transacción...');
    
    // Delete both transactions if it's a transferencia
    if (relatedTransaction) {
      try {
        // Delete both transactions
        await Promise.all([
          nrd.transactions.delete(transactionId),
          nrd.transactions.delete(relatedTransaction.id)
        ]);
        
        const user = nrd?.auth?.getCurrentUser() || null;
        logger.audit('ENTITY_DELETE', { entity: 'transaction', id: transactionId, relatedId: relatedTransaction.id, type: 'transfer', uid: user?.uid, email: user?.email, timestamp: Date.now() });
        logger.info('Transfer transactions deleted successfully', { transactionId, relatedTransactionId: relatedTransaction.id });
        
        hideSpinner();
        // Cerrar el formulario y volver a la lista de transacciones
        hideTransactionForm();
        // Recargar las transacciones para actualizar la lista del día seleccionado
        loadTransactions(false);
        await showSuccess('✓ Transferencia eliminada correctamente (2 transacciones eliminadas)');
      } catch (error) {
        hideSpinner();
        logger.error('Error deleting transfer transactions:', error);
        await showError('Error al eliminar transferencia: ' + error.message);
      }
    } else {
      // Regular transaction deletion
      await nrd.transactions.delete(transactionId);
      const user = nrd?.auth?.getCurrentUser() || null;
      logger.audit('ENTITY_DELETE', { entity: 'transaction', id: transactionId, uid: user?.uid, email: user?.email, timestamp: Date.now() });
      logger.info('Transaction deleted successfully', { transactionId });
      hideSpinner();
      // Cerrar el formulario y volver a la lista de transacciones
      hideTransactionForm();
      // Recargar las transacciones para actualizar la lista del día seleccionado
      loadTransactions(false);
      await showSuccess('✓ Transacción eliminada correctamente');
    }
  } catch (error) {
    hideSpinner();
    logger.error('Error deleting transaction:', error);
    await showError('Error al eliminar transacción: ' + error.message);
  }
}

// Event listeners
document.getElementById('new-income-btn').addEventListener('click', () => showNewTransactionForm('income'));
document.getElementById('new-expense-btn').addEventListener('click', () => showNewTransactionForm('expense'));
document.getElementById('close-transaction-form-btn').addEventListener('click', () => {
  hideTransactionForm();
  // Recargar las transacciones para actualizar la lista del día seleccionado
  loadTransactions(false);
});
document.getElementById('close-transaction-form').addEventListener('click', () => {
  hideTransactionForm();
  // Recargar las transacciones para actualizar la lista del día seleccionado
  loadTransactions(false);
});
document.getElementById('transaction-form-element').addEventListener('submit', async (e) => {
  e.preventDefault();
  await saveTransaction();
});
const backToTransactionsBtn = document.getElementById('back-to-transactions');
if (backToTransactionsBtn) {
  backToTransactionsBtn.addEventListener('click', backToTransactions);
}

// Close transaction detail button
const closeTransactionDetailBtn = document.getElementById('close-transaction-detail-btn');
if (closeTransactionDetailBtn) {
  closeTransactionDetailBtn.addEventListener('click', backToTransactions);
}

// Edit transaction button from detail view
const editTransactionBtn = document.getElementById('edit-transaction-btn');
if (editTransactionBtn) {
  editTransactionBtn.addEventListener('click', async () => {
    const detail = document.getElementById('transaction-detail');
    if (detail && detail.dataset.transactionId) {
      const transactionId = detail.dataset.transactionId;
      try {
        const transaction = await nrd.transactions.getById(transactionId);
        if (transaction) {
          await editTransaction(transactionId, transaction);
        }
      } catch (error) {
        await showError('Error al cargar transacción para editar: ' + error.message);
      }
    }
  });
}

// Delete transaction button from detail view
const deleteTransactionBtn = document.getElementById('delete-transaction-btn');
if (deleteTransactionBtn) {
  deleteTransactionBtn.addEventListener('click', async () => {
    const detail = document.getElementById('transaction-detail');
    if (detail && detail.dataset.transactionId) {
      const transactionId = detail.dataset.transactionId;
      await deleteTransactionHandler(transactionId);
    }
  });
}

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
  
  // Remove color classes first
  display.classList.remove('text-red-600', 'text-gray-700');
  
  if (transactionsSelectedFilterDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const filterDate = new Date(transactionsSelectedFilterDate);
    filterDate.setHours(0, 0, 0, 0);
    
    if (filterDate.getTime() === today.getTime()) {
      display.textContent = 'Hoy';
      // Apply red color when showing "Hoy"
      display.classList.add('text-red-600');
    } else {
      display.textContent = formatDateWithDay(transactionsSelectedFilterDate);
      display.classList.add('text-gray-700');
    }
  } else {
    display.textContent = 'Todas';
    display.classList.add('text-gray-700');
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
  updateFilterBadge();
  // Pass false to prevent re-initializing to today
  loadTransactions(false);
}

// Report modal functions
function showReportModal() {
  const modal = document.getElementById('report-date-modal');
  const dateInput = document.getElementById('report-date');
  
  if (!modal) {
    logger.error('Modal not found');
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

// formatNumber is now available from NRDCommon (window.formatNumber)

// Generate daily report PDF
async function generateDailyReport(reportDate) {
  showSpinner('Generando reporte...');
  
  try {
    // Get all data
    const [allTransactionsArray, accountsArray] = await Promise.all([
      nrd.transactions.getAll(),
      nrd.accounts.getAll()
    ]);
    
    // Convert to objects with IDs as keys for compatibility
    const allTransactions = allTransactionsArray.reduce((acc, t) => {
      if (t && t.id) acc[t.id] = t;
      return acc;
    }, {});
    const accounts = accountsArray.reduce((acc, a) => {
      if (a && a.id) acc[a.id] = a;
      return acc;
    }, {});
    
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
        
        const concepto = transaction.categoryName || 'Sin categoría';
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
    
    // Generar PDF y abrir diálogo de impresión
    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    
    // Abrir ventana nueva para imprimir (más confiable que iframe oculto)
    const printWindow = window.open(pdfUrl, '_blank');
    
    if (!printWindow) {
      hideSpinner();
      await showError('No se pudo abrir la ventana de impresión. Verifique que los pop-ups estén permitidos.');
      URL.revokeObjectURL(pdfUrl);
      return;
    }
    
    // Función para limpiar recursos (solo revoca la URL, no cierra la ventana)
    const cleanup = () => {
      // Revocar URL después de un tiempo para liberar memoria
      // No cerrar la ventana automáticamente - el usuario puede querer imprimir varias veces
      setTimeout(() => {
        URL.revokeObjectURL(pdfUrl);
      }, 5000); // Tiempo más largo para permitir interacción con el diálogo
    };
    
    // Esperar a que la ventana cargue y luego imprimir
    printWindow.onload = () => {
      // Dar tiempo suficiente para que el PDF se renderice completamente
      setTimeout(() => {
        try {
          printWindow.focus();
          // Intentar imprimir
          printWindow.print();
          
          // Limpiar URL después de un tiempo razonable (no interfiere con el diálogo)
          cleanup();
          
        } catch (error) {
          logger.error('Error al imprimir:', error);
          hideSpinner();
          showError('Error al abrir el diálogo de impresión. Por favor, intente nuevamente.');
          cleanup();
        }
      }, 500); // Tiempo reducido ya que window.open es más rápido
    };
    
    // Manejar errores de carga
    printWindow.onerror = function() {
      hideSpinner();
      showError('Error al cargar el PDF. Por favor, intente nuevamente.');
      cleanup();
    };
    
    // Timeout de seguridad en caso de que onload no se dispare
    setTimeout(() => {
      try {
        if (printWindow && !printWindow.closed) {
          printWindow.focus();
          printWindow.print();
          cleanup();
        }
      } catch (error) {
        logger.error('Error al imprimir (timeout):', error);
        hideSpinner();
        showError('Error al abrir el diálogo de impresión. Por favor, intente nuevamente.');
        cleanup();
      }
    }, 2000);
    
    hideSpinner();
  } catch (error) {
    hideSpinner();
    logger.error('Error generating report:', error);
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
      const category = await nrd.categories.getById(categoryId);
      
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
      logger.error('Error checking category:', error);
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

// Check if category is transferencia and show/hide transfer account field
async function checkCategoryForTransfer() {
  const nrd = window.nrd;
  if (!nrd) {
    logger.error('NRD service not available');
    return;
  }
  
  const categorySelect = document.getElementById('transaction-category');
  const transferContainer = document.getElementById('transaction-transfer-account-container');
  const transferAccountSelect = document.getElementById('transaction-transfer-account');
  const transferAccountLabel = document.getElementById('transfer-account-label');
  const transferAccountHelp = document.getElementById('transfer-account-help');
  const transactionAccountLabel = document.getElementById('transaction-account-label');
  const transactionAccountHelp = document.getElementById('transaction-account-help');
  const transactionType = document.getElementById('transaction-type')?.value;
  const accountSelect = document.getElementById('transaction-account');
  
  if (!categorySelect || !transferContainer || !transferAccountSelect) return;
  
  const categoryId = categorySelect.value;
  
  if (!categoryId) {
    transferContainer.classList.add('hidden');
    transferAccountSelect.removeAttribute('required');
    transferAccountSelect.value = '';
    // Restaurar label del primer campo de cuenta
    if (transactionAccountLabel) transactionAccountLabel.textContent = '¿Desde qué cuenta?';
    if (transactionAccountHelp) transactionAccountHelp.textContent = 'Seleccione la cuenta desde donde sale o entra el dinero';
    return;
  }
  
  try {
    const category = await nrd.categories.getById(categoryId);
    
    if (category && category.name && category.name.toUpperCase().includes('TRANSFERENCIA')) {
      // Categoría es transferencia, mostrar campo de cuenta destino/origen
      transferContainer.classList.remove('hidden');
      transferAccountSelect.setAttribute('required', 'required');
      
      // Ingreso: primera cuenta = destino (¿A qué cuenta?), segunda = origen (¿Desde qué cuenta?)
      // Egreso: primera cuenta = origen (¿Desde qué cuenta?), segunda = destino (¿Hacia qué cuenta?)
      if (transactionType === 'income') {
        if (transactionAccountLabel) transactionAccountLabel.textContent = '¿A qué cuenta?';
        if (transactionAccountHelp) transactionAccountHelp.textContent = 'Seleccione la cuenta destino de la transferencia (donde llega el dinero)';
        if (transferAccountLabel) transferAccountLabel.textContent = '¿Desde qué cuenta?';
        if (transferAccountHelp) transferAccountHelp.textContent = 'Seleccione la cuenta origen de la transferencia (de donde sale el dinero)';
      } else {
        if (transactionAccountLabel) transactionAccountLabel.textContent = '¿Desde qué cuenta?';
        if (transactionAccountHelp) transactionAccountHelp.textContent = 'Seleccione la cuenta origen de la transferencia (de donde sale el dinero)';
        if (transferAccountLabel) transferAccountLabel.textContent = '¿Hacia qué cuenta?';
        if (transferAccountHelp) transferAccountHelp.textContent = 'Seleccione la cuenta destino de la transferencia (hacia donde va el dinero)';
      }
      
      // Cargar cuentas excluyendo la cuenta seleccionada
      if (!window.loadAccountsForTransaction) {
        logger.error('loadAccountsForTransaction not available');
        return;
      }
      const accounts = await window.loadAccountsForTransaction();
      const selectedAccountId = accountSelect?.value;
      
      transferAccountSelect.innerHTML = '<option value="">-- Seleccione una cuenta --</option>';
      accounts.forEach(account => {
        // Excluir la cuenta ya seleccionada
        if (account.id !== selectedAccountId) {
          const option = document.createElement('option');
          option.value = account.id;
          option.textContent = account.name;
          transferAccountSelect.appendChild(option);
        }
      });
      
      // Seleccionar automáticamente la subcategoría "transferencia" si existe y el campo está vacío
      const descriptionInput = document.getElementById('transaction-description');
      if (descriptionInput && (!descriptionInput.value || descriptionInput.value.trim() === '')) {
        // Asegurarse de que las descripciones estén cargadas
        if (availableDescriptions.length === 0) {
          loadDescriptionsForAutocomplete();
        }
        
        // Buscar "transferencia" en las descripciones disponibles (case-insensitive)
        // Priorizar coincidencias exactas o que empiecen con "transferencia"
        const transferenciaDesc = availableDescriptions.find(desc => {
          const descLower = desc.toLowerCase();
          return descLower === 'transferencia' || descLower.startsWith('transferencia');
        }) || availableDescriptions.find(desc => 
          desc.toLowerCase().includes('transferencia')
        );
        
        if (transferenciaDesc) {
          descriptionInput.value = transferenciaDesc;
          logger.debug('Auto-selected transferencia subcategory', { subcategory: transferenciaDesc });
        }
      }
    } else {
      // Categoría no es transferencia, ocultar campo y restaurar label del primer campo
      transferContainer.classList.add('hidden');
      transferAccountSelect.removeAttribute('required');
      transferAccountSelect.value = '';
      if (transactionAccountLabel) transactionAccountLabel.textContent = '¿Desde qué cuenta?';
      if (transactionAccountHelp) transactionAccountHelp.textContent = 'Seleccione la cuenta desde donde sale o entra el dinero';
    }
  } catch (error) {
    logger.error('Error checking category for transfer:', error);
    transferContainer.classList.add('hidden');
    transferAccountSelect.removeAttribute('required');
    if (transactionAccountLabel) transactionAccountLabel.textContent = '¿Desde qué cuenta?';
    if (transactionAccountHelp) transactionAccountHelp.textContent = 'Seleccione la cuenta desde donde sale o entra el dinero';
  }
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
    logger.error('Date picker modal not found');
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
  
  // Setup advanced filters
  setupAdvancedFilters();
  
  // Initialize filter badge
  updateFilterBadge();
  
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
});

// Setup advanced filters
function setupAdvancedFilters() {
  const openBtn = document.getElementById('transactions-advanced-filter-btn');
  const modal = document.getElementById('transactions-advanced-filters-modal');
  const closeBtn = document.getElementById('close-transactions-advanced-filters-modal');
  const searchBtn = document.getElementById('transactions-advanced-filters-search-btn');
  const clearBtn = document.getElementById('transactions-advanced-filters-clear-btn');
  
  if (!openBtn || !modal) return;
  
  // Open modal
  openBtn.addEventListener('click', () => {
    loadAdvancedFiltersOptions();
    modal.classList.remove('hidden');
  });
  
  // Close modal
  const closeModal = () => modal.classList.add('hidden');
  
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  
  // Apply filters
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      applyAdvancedFilters();
      closeModal();
    });
  }
  
  // Clear filters
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      clearAdvancedFilters();
      closeModal();
    });
  }
}

function _onTransactionsFilterCategoriesChange() {
  const categorySelect = document.getElementById('transactions-filter-categories');
  if (!categorySelect) return;
  const selectedIds = Array.from(categorySelect.selectedOptions).map(opt => opt.value);
  loadSubcategoriesForFilter(selectedIds);
}

// Al cambiar Tipo (Ingreso/Egreso/Todos), volver a cargar categorías filtradas por ese tipo
async function _onTransactionsFilterTypeChange() {
  const typeSelect = document.getElementById('transactions-filter-type');
  const type = typeSelect ? (typeSelect.value || null) : null;
  await loadFilterCategoriesByType(type);
  _onTransactionsFilterCategoriesChange();
}

// Carga y rellena el select de categorías filtrado por tipo (income/expense/null=todos), orden: ingresos primero, luego egresos
function loadFilterCategoriesByType(typeFilter) {
  const categorySelect = document.getElementById('transactions-filter-categories');
  if (!categorySelect) return;

  let categories = Object.values(getCategoriesDict()).filter(c => c && c.id && c.active !== false);
  if (typeFilter) {
    categories = categories.filter(c => c.type === typeFilter);
  }
  categories.sort((a, b) => {
    const order = { income: 0, expense: 1 };
    const ia = order[a.type] ?? 2;
    const ib = order[b.type] ?? 2;
    if (ia !== ib) return ia - ib;
    return (a.name || '').localeCompare(b.name || '');
  });
  const previouslySelected = new Set(transactionsAdvancedFilters.categoryIds);
  categorySelect.innerHTML = '';
  categories.forEach(category => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name || 'Sin nombre';
    const nameUpper = (category.name || '').toUpperCase();
    const isTransfer = nameUpper.includes('TRANSFERENCIA');
    if (isTransfer) {
      option.style.color = '#2563eb';
      option.style.fontWeight = '500';
    } else if (category.type === 'income') {
      option.style.color = '#15803d';
      option.style.fontWeight = '500';
    } else if (category.type === 'expense') {
      option.style.color = '#dc2626';
      option.style.fontWeight = '500';
    }
    if (previouslySelected.has(category.id)) option.selected = true;
    categorySelect.appendChild(option);
  });
}

// Carga el listado de subcategorías para las categorías seleccionadas (description de transacciones con ese categoryId)
function loadSubcategoriesForFilter(selectedCategoryIds) {
  const container = document.getElementById('transactions-filter-subcategories-container');
  const subSelect = document.getElementById('transactions-filter-subcategories');
  if (!container || !subSelect) return;
  if (!selectedCategoryIds || selectedCategoryIds.length === 0) {
    subSelect.innerHTML = '';
    container.classList.add('hidden');
    return;
  }

  initializeDescriptionsIndex();
  const subcategories = getDescriptionsForCategories(selectedCategoryIds);
  subSelect.innerHTML = '';
  subcategories.forEach(desc => {
    const option = document.createElement('option');
    option.value = desc;
    option.textContent = desc;
    if (transactionsAdvancedFilters.subcategoryDescriptions.includes(desc)) {
      option.selected = true;
    }
    subSelect.appendChild(option);
  });
  container.classList.remove('hidden');
}

// Load options for advanced filters
async function loadAdvancedFiltersOptions() {
  const nrd = window.nrd;
  if (!nrd) return;
  
  // Load accounts
  const accountSelect = document.getElementById('transactions-filter-account');
  if (accountSelect && nrd.accounts) {
    const accounts = await nrd.accounts.getAll();
    accountSelect.innerHTML = '<option value="">Todas las cuentas</option>';
    accounts.forEach(account => {
      if (account && account.id && account.active !== false) {
        const option = document.createElement('option');
        option.value = account.id;
        option.textContent = account.name || 'Sin nombre';
        if (transactionsAdvancedFilters.accountId === account.id) {
          option.selected = true;
        }
        accountSelect.appendChild(option);
      }
    });
  }
  
  // Load categories: orden ingreso primero, luego egresos; si hay filtro por tipo, solo mostrar ese tipo.
  const typeSelect = document.getElementById('transactions-filter-type');
  const selectedType = transactionsAdvancedFilters.type || null;
  const categorySelect = document.getElementById('transactions-filter-categories');
  if (categorySelect) {
    let categories = Object.values(getCategoriesDict()).filter(c => c && c.id && c.active !== false);
    if (selectedType) {
      categories = categories.filter(c => c.type === selectedType);
    }
    categories.sort((a, b) => {
      const order = { income: 0, expense: 1 };
      const ia = order[a.type] ?? 2;
      const ib = order[b.type] ?? 2;
      if (ia !== ib) return ia - ib;
      return (a.name || '').localeCompare(b.name || '');
    });
    categorySelect.innerHTML = '';
    categories.forEach(category => {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = category.name || 'Sin nombre';
      const nameUpper = (category.name || '').toUpperCase();
      const isTransfer = nameUpper.includes('TRANSFERENCIA');
      if (isTransfer) {
        option.style.color = '#2563eb';
        option.style.fontWeight = '500';
      } else if (category.type === 'income') {
        option.style.color = '#15803d';
        option.style.fontWeight = '500';
      } else if (category.type === 'expense') {
        option.style.color = '#dc2626';
        option.style.fontWeight = '500';
      }
      if (transactionsAdvancedFilters.categoryIds.includes(category.id)) {
        option.selected = true;
      }
      categorySelect.appendChild(option);
    });
    categorySelect.removeEventListener('change', _onTransactionsFilterCategoriesChange);
    categorySelect.addEventListener('change', _onTransactionsFilterCategoriesChange);
  }
  if (typeSelect) {
    typeSelect.removeEventListener('change', _onTransactionsFilterTypeChange);
    typeSelect.addEventListener('change', _onTransactionsFilterTypeChange);
  }
  _onTransactionsFilterCategoriesChange();

  // Set current filter values
  const dateFromInput = document.getElementById('transactions-filter-date-from');
  const dateToInput = document.getElementById('transactions-filter-date-to');
  // typeSelect, accountSelect, categorySelect ya declarados arriba

  if (dateFromInput && transactionsAdvancedFilters.dateFrom) {
    dateFromInput.value = new Date(transactionsAdvancedFilters.dateFrom).toISOString().split('T')[0];
  }
  if (dateToInput && transactionsAdvancedFilters.dateTo) {
    dateToInput.value = new Date(transactionsAdvancedFilters.dateTo).toISOString().split('T')[0];
  }
  if (typeSelect) {
    typeSelect.value = transactionsAdvancedFilters.type || '';
  }
  if (accountSelect) {
    accountSelect.value = transactionsAdvancedFilters.accountId || '';
  }
  if (categorySelect && transactionsAdvancedFilters.categoryIds.length > 0) {
    Array.from(categorySelect.options).forEach(opt => {
      opt.selected = transactionsAdvancedFilters.categoryIds.includes(opt.value);
    });
  }
  const fromReconciliationCheck = document.getElementById('transactions-filter-from-reconciliation');
  if (fromReconciliationCheck) {
    fromReconciliationCheck.checked = transactionsAdvancedFilters.fromReconciliation === true;
  }
}

// Apply advanced filters
function applyAdvancedFilters() {
  const dateFromInput = document.getElementById('transactions-filter-date-from');
  const dateToInput = document.getElementById('transactions-filter-date-to');
  const typeSelect = document.getElementById('transactions-filter-type');
  const accountSelect = document.getElementById('transactions-filter-account');
  const categorySelect = document.getElementById('transactions-filter-categories');
  
  transactionsAdvancedFilters.dateFrom = dateFromInput?.value ? new Date(dateFromInput.value).getTime() : null;
  transactionsAdvancedFilters.dateTo = dateToInput?.value ? new Date(dateToInput.value).getTime() : null;
  transactionsAdvancedFilters.type = typeSelect?.value || null;
  transactionsAdvancedFilters.accountId = accountSelect?.value || null;
  
  transactionsAdvancedFilters.categoryIds = [];
  if (categorySelect) {
    const selectedOptions = Array.from(categorySelect.selectedOptions);
    transactionsAdvancedFilters.categoryIds = selectedOptions.map(opt => opt.value);
  }
  transactionsAdvancedFilters.subcategoryDescriptions = [];
  const subcategorySelect = document.getElementById('transactions-filter-subcategories');
  if (subcategorySelect) {
    const subSelected = Array.from(subcategorySelect.selectedOptions);
    transactionsAdvancedFilters.subcategoryDescriptions = subSelected.map(opt => opt.value);
  }
  
  const fromReconciliationCheck = document.getElementById('transactions-filter-from-reconciliation');
  transactionsAdvancedFilters.fromReconciliation = fromReconciliationCheck?.checked ? true : null;
  
  // Clear single date filter when using date range
  if (transactionsAdvancedFilters.dateFrom || transactionsAdvancedFilters.dateTo) {
    transactionsSelectedFilterDate = null;
    updateTransactionsDateFilterDisplay();
  }
  
  updateFilterBadge();
  loadTransactions(false);
}

// Clear advanced filters
function clearAdvancedFilters() {
  transactionsAdvancedFilters = {
    dateFrom: null,
    dateTo: null,
    type: null,
    accountId: null,
    categoryIds: [],
    subcategoryDescriptions: [],
    fromReconciliation: null
  };
  
  const dateFromInput = document.getElementById('transactions-filter-date-from');
  const dateToInput = document.getElementById('transactions-filter-date-to');
  const typeSelect = document.getElementById('transactions-filter-type');
  const accountSelect = document.getElementById('transactions-filter-account');
  const categorySelect = document.getElementById('transactions-filter-categories');
  const subcategorySelect = document.getElementById('transactions-filter-subcategories');
  const subcategoriesContainer = document.getElementById('transactions-filter-subcategories-container');
  const fromReconciliationCheck = document.getElementById('transactions-filter-from-reconciliation');
  
  if (dateFromInput) dateFromInput.value = '';
  if (dateToInput) dateToInput.value = '';
  if (typeSelect) typeSelect.value = '';
  if (accountSelect) accountSelect.value = '';
  if (categorySelect) {
    Array.from(categorySelect.options).forEach(opt => opt.selected = false);
  }
  if (subcategorySelect) {
    subcategorySelect.innerHTML = '';
    Array.from(subcategorySelect.options).forEach(opt => opt.selected = false);
  }
  if (subcategoriesContainer) subcategoriesContainer.classList.add('hidden');
  if (fromReconciliationCheck) fromReconciliationCheck.checked = false;
  
  updateFilterBadge();
  loadTransactions(false);
}

// Update filter badge count
function updateFilterBadge() {
  const badge = document.getElementById('transactions-filter-badge');
  if (!badge) return;
  
  let count = 0;
  if (transactionsAdvancedFilters.dateFrom) count++;
  if (transactionsAdvancedFilters.dateTo) count++;
  if (transactionsAdvancedFilters.type) count++;
  if (transactionsAdvancedFilters.accountId) count++;
  if (transactionsAdvancedFilters.categoryIds && transactionsAdvancedFilters.categoryIds.length > 0) {
    count += transactionsAdvancedFilters.categoryIds.length;
  }
  if (transactionsAdvancedFilters.subcategoryDescriptions && transactionsAdvancedFilters.subcategoryDescriptions.length > 0) {
    count += transactionsAdvancedFilters.subcategoryDescriptions.length;
  }
  if (transactionsAdvancedFilters.fromReconciliation === true) count++;
  
  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

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
  const [accountsArray, allTransactionsArray] = await Promise.all([
    nrd.accounts.getAll(),
    nrd.transactions.getAll()
  ]);
  
  // Convert to objects with IDs as keys for compatibility
  const accounts = accountsArray.reduce((acc, a) => {
    if (a && a.id) acc[a.id] = a;
    return acc;
  }, {});
  const allTransactions = allTransactionsArray.reduce((acc, t) => {
    if (t && t.id) acc[t.id] = t;
    return acc;
  }, {});
  
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
      <span class="text-xs text-gray-700 truncate flex-1 mr-2 font-bold">${escapeHtml(accountData.name)}</span>
      <span class="text-xs sm:text-sm font-medium ${balanceColor} whitespace-nowrap">$${formatNumber(Math.abs(accountData.balance))}</span>
    `;
    accountBalancesList.appendChild(item);
  });
  
  // Show account balances section
  accountBalancesContainer.classList.remove('hidden');
  
  // Setup toggle for account balances section
  setupTransactionsAccountBalancesToggle();
}

// Toggle transactions account balances section collapse/expand
window.transactionsAccountBalancesToggleSetup = false;
function setupTransactionsAccountBalancesToggle() {
  const toggleBtn = document.getElementById('transactions-account-balances-toggle');
  const toggleIcon = document.getElementById('transactions-account-balances-toggle-icon');
  const content = document.getElementById('transactions-account-balances-content');
  
  if (!toggleBtn || !toggleIcon || !content) return;
  
  // Only setup once per page load
  if (window.transactionsAccountBalancesToggleSetup) return;
  window.transactionsAccountBalancesToggleSetup = true;
  
  // Check if collapsed state is stored in localStorage (default to expanded)
  const isCollapsed = localStorage.getItem('transactions-account-balances-collapsed') === 'true';
  
  // Set initial state
  if (isCollapsed) {
    content.classList.add('hidden');
    toggleIcon.textContent = '▶';
    toggleIcon.classList.add('text-gray-400');
  } else {
    content.classList.remove('hidden');
    toggleIcon.textContent = '▼';
    toggleIcon.classList.remove('text-gray-400');
  }
  
  toggleBtn.addEventListener('click', () => {
    const isCurrentlyCollapsed = content.classList.contains('hidden');
    
    if (isCurrentlyCollapsed) {
      // Expand
      content.classList.remove('hidden');
      toggleIcon.textContent = '▼';
      toggleIcon.classList.remove('text-gray-400');
      localStorage.setItem('transactions-account-balances-collapsed', 'false');
    } else {
      // Collapse
      content.classList.add('hidden');
      toggleIcon.textContent = '▶';
      toggleIcon.classList.add('text-gray-400');
      localStorage.setItem('transactions-account-balances-collapsed', 'true');
    }
  });
}

// Escape HTML to prevent XSS
// escapeHtml is now available from NRDCommon (window.escapeHtml)

// Make functions available globally
window.loadTransactions = loadTransactions;
window.hideTransactionForm = hideTransactionForm;
window.setupReportHandlers = setupReportHandlers;
window.setupTransactionsAccountBalancesToggle = setupTransactionsAccountBalancesToggle;

