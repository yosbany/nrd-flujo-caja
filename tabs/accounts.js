// Account management
import { parseSantanderStatement } from '../utils/santander.js';
import { parseSantanderCreditoStatement } from '../utils/santander-credito.js';
import { parseMercadoPagoStatement } from '../utils/mercadopago.js';

let accountsListener = null;

// Default accounts
const defaultAccounts = [
  'EFECTIVO',
  'DÉBITO SANTANDER',
  'CRÉDITO VISA SANTANDER',
  'MERCADO PAGO'
];

// Procesadores de estado de cuenta (para conciliación). La cuenta indica cuál usar.
const STATEMENT_PROCESSORS = {
  SANTANDER_DEBITO: 'santander_debito',
  SANTANDER_CREDITO: 'santander_credito',
  MERCADO_PAGO: 'mercadopago'
};
const STATEMENT_PROCESSOR_LABELS = {
  [STATEMENT_PROCESSORS.SANTANDER_DEBITO]: 'Débito Santander',
  [STATEMENT_PROCESSORS.SANTANDER_CREDITO]: 'Crédito Santander',
  [STATEMENT_PROCESSORS.MERCADO_PAGO]: 'Mercado Pago'
};

function populateStatementProcessorSelect() {
  const select = document.getElementById('account-statement-processor');
  if (!select) return;
  const currentValue = select.value;
  select.innerHTML = '';
  const none = document.createElement('option');
  none.value = '';
  none.textContent = 'Ninguno';
  select.appendChild(none);
  Object.entries(STATEMENT_PROCESSOR_LABELS).forEach(([value, label]) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    select.appendChild(opt);
  });
  if (currentValue && STATEMENT_PROCESSOR_LABELS[currentValue]) select.value = currentValue;
}

// Show reconciliation loading state (each time user enters the tab)
function showReconciliationLoading() {
  showSpinner('Cargando conciliación...');
  const contentEl = document.getElementById('reconciliation-content');
  if (contentEl) contentEl.classList.add('hidden');
}

// Load accounts
function loadAccounts() {
  logger.debug('Loading accounts');
  showReconciliationLoading();
  const accountsList = document.getElementById('accounts-list');
  if (!accountsList) {
    logger.warn('Accounts list element not found');
    return;
  }
  
  accountsList.innerHTML = '';

  // Initialize reconciliation when accounts view loads
  initializeReconciliation();

  // Remove previous listener
  if (accountsListener) {
    logger.debug('Removing previous accounts listener');
    accountsListener(); // Unsubscribe from NRD Data Access listener
    accountsListener = null;
  }

  // Listen for accounts using NRD Data Access
  logger.debug('Setting up accounts listener');
  accountsListener = nrd.accounts.onValue(async (accounts) => {
    logger.debug('Accounts data received', { count: Array.isArray(accounts) ? accounts.length : Object.keys(accounts || {}).length });
    if (!accountsList) return;
    accountsList.innerHTML = '';
    
    // Convert to object format if needed (NRD Data Access may return object with IDs as keys or array)
    const accountsDict = Array.isArray(accounts) 
      ? accounts.reduce((acc, account) => {
          if (account && account.id) {
            acc[account.id] = account;
          }
          return acc;
        }, {})
      : accounts || {};
    
    // Update reconciliation accounts and selector
    reconciliationAccounts = accountsDict;
    populateReconciliationAccountSelector();
    showReconciliationContentWhenReady();

    if (Object.keys(accountsDict).length === 0) {
      // Initialize default accounts if none exist
      initializeDefaultAccounts();
      return;
    }

    // Sort accounts by name
    const sortedAccounts = Object.entries(accountsDict).sort((a, b) => {
      return a[1].name.localeCompare(b[1].name);
    });

    // Get all transactions to calculate trends using NRD Data Access
    const transactionsArray = await nrd.transactions.getAll();
    const transactions = Array.isArray(transactionsArray) 
      ? transactionsArray.reduce((acc, transaction) => {
          if (transaction && transaction.id) {
            acc[transaction.id] = transaction;
          }
          return acc;
        }, {})
      : transactionsArray || {};
    
    // Group transactions by account for trend calculation
    const accountTransactions = {}; // Store transactions per account for trend calculation
    
    Object.values(transactions).forEach(transaction => {
      if (transaction && transaction.accountId) {
        const accountId = transaction.accountId;
        if (!accountTransactions[accountId]) {
          accountTransactions[accountId] = [];
        }
        
        // Store transaction for trend calculation
        const transactionDate = transaction.date || transaction.createdAt || 0;
        if (transactionDate > 0) {
          accountTransactions[accountId].push({
            id: transaction.id,
            date: transactionDate,
            amount: parseFloat(transaction.amount) || 0,
            type: transaction.type
          });
        }
      }
    });

    sortedAccounts.forEach(([id, account]) => {
      const item = document.createElement('div');
      const isActive = account.active !== false; // Default to true if not set
      const isBankAccount = account.isBankAccount === true;
      const opacityClass = isActive ? '' : 'opacity-50';
      item.className = `border border-gray-200 p-3 sm:p-4 md:p-6 hover:border-red-600 transition-colors cursor-pointer mb-2 sm:mb-3 ${opacityClass}`;
      item.dataset.accountId = id;
      // Usar saldo calculado (initial + transacciones) igual que en conciliación
      const initialBal = parseFloat(account.initialBalance) || 0;
      const accountTrans = accountTransactions[id] || [];
      const transTotal = accountTrans.reduce((sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0);
      const calculatedBalance = initialBal + transTotal;
      const formattedBalance = new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'UYU' }).format(calculatedBalance);
      const statusText = isActive ? '' : ' (Desactivada)';
      
      // Calcular gráfico de tendencia
      const trendGraph = calculateTrendGraph(accountTrans, account.name);
      
      // Badge para cuenta bancaria o efectivo (más sutil, a la izquierda)
      const accountNameUpper = (account.name || '').toUpperCase();
      const isEfectivo = accountNameUpper.includes('EFECTIVO');
      let accountBadge = '';
      
      if (isBankAccount) {
        accountBadge = '<span class="inline-flex items-center px-1.5 py-0.5 rounded-none text-[10px] font-light bg-gray-100 text-gray-500 border border-gray-200 mr-2">🏦</span>';
      } else if (isEfectivo) {
        accountBadge = '<span class="inline-flex items-center px-1.5 py-0.5 rounded-none text-[10px] font-light bg-gray-100 text-gray-500 border border-gray-200 mr-2">💵</span>';
      }
      
      item.innerHTML = `
        <div class="flex justify-between items-center">
          <div class="flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              ${accountBadge}
              <div class="text-base sm:text-lg font-light text-red-600">${escapeHtml(account.name)}${statusText}</div>
            </div>
          </div>
          <div class="flex items-center gap-3 sm:gap-4">
            <div class="text-sm sm:text-base font-light text-red-600">${formattedBalance}</div>
            <div class="flex-shrink-0">${trendGraph.svg}</div>
          </div>
        </div>
      `;
      
      // Agregar event listener al SVG si existe
      if (trendGraph.clickable) {
        const svgElement = item.querySelector('svg');
        if (svgElement) {
          svgElement.style.cursor = 'pointer';
          svgElement.addEventListener('click', (e) => {
            e.stopPropagation(); // Evitar que se abra el detalle de la cuenta
            showTrendGraphModal(account.name, accountTrans);
          });
        }
      }
      
      item.addEventListener('click', () => viewAccount(id));
      accountsList.appendChild(item);
    });
  });
}

// Load accounts for transaction form
async function loadAccountsForTransaction() {
  try {
    logger.debug('Loading accounts for transaction form');
    const accountsArray = await nrd.accounts.getAll();
    const accounts = Array.isArray(accountsArray) 
      ? accountsArray.reduce((acc, account) => {
          if (account && account.id) {
            acc[account.id] = account;
          }
          return acc;
        }, {})
      : accountsArray || {};
    
    return Object.entries(accounts)
      .filter(([id, account]) => account.active !== false)
      .map(([id, account]) => ({ id, ...account }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    logger.error('Error loading accounts for transaction form', error);
    return [];
  }
}

// Initialize default accounts
async function initializeDefaultAccounts() {
  // Check if user is authorized
  const nrd = window.nrd;
  const user = nrd?.auth?.getCurrentUser() || null;
  if (!user) {
    logger.warn('User not authenticated, skipping default accounts initialization');
    return;
  }

  showSpinner('Inicializando cuentas...');
  try {
    // Get existing accounts using NRD Data Access
    const existingAccountsArray = await nrd.accounts.getAll();
    const existingAccounts = Array.isArray(existingAccountsArray) 
      ? existingAccountsArray.reduce((acc, account) => {
          if (account && account.id) {
            acc[account.id] = account;
          }
          return acc;
        }, {})
      : existingAccountsArray || {};
    
    // Create a map of existing accounts by name (lowercase)
    const existingAccountsMap = {};
    Object.entries(existingAccounts).forEach(([id, account]) => {
      existingAccountsMap[account.name.toLowerCase()] = { id, ...account };
    });

    let added = 0;

    for (const accountName of defaultAccounts) {
      const accountNameLower = accountName.toLowerCase();
      
      // If account doesn't exist, create it
      if (!existingAccountsMap[accountNameLower]) {
        logger.info('Creating default account', { name: accountName });
        await nrd.accounts.create({
          name: accountName,
          active: true,
          initialBalance: 0
        });
        added++;
      }
    }

    hideSpinner();
    
    if (added > 0) {
      logger.info('Default accounts initialized', { added });
      await showSuccess(`Se agregaron ${added} cuenta(s) por defecto`);
    } else {
      logger.info('Default accounts initialization completed: no changes', { added });
    }
  } catch (error) {
    hideSpinner();
    logger.error('Failed to initialize default accounts', error);
    await showError('Error al inicializar cuentas: ' + error.message);
  }
}

// Show account form
function showAccountForm(accountId = null) {
  populateStatementProcessorSelect();
  const form = document.getElementById('account-form');
  const list = document.getElementById('accounts-list');
  const header = document.querySelector('#accounts-view .flex.flex-col');
  const title = document.getElementById('account-form-title');
  const formElement = document.getElementById('account-form-element');
  const reconciliationSection = document.getElementById('reconciliation-section');
  
  if (form) form.classList.remove('hidden');
  if (list) list.style.display = 'none';
  if (header) header.style.display = 'none';
  // Hide reconciliation section when showing account form
  if (reconciliationSection) {
    reconciliationSection.style.display = 'none';
    reconciliationSection.classList.add('hidden');
    logger.debug('Reconciliation section hidden when showing account form');
  }
  
  // Setup checkbox and add button listeners when form is shown
  setTimeout(() => {
    const checkbox = document.getElementById('account-is-bank-account');
    if (checkbox && !checkbox.dataset.listenerAdded) {
      checkbox.dataset.listenerAdded = 'true';
      checkbox.addEventListener('change', (e) => {
        toggleCategoryMappingSection(e.target.checked);
        const addMappingBtn = document.getElementById('add-category-mapping-btn');
        const form = document.getElementById('account-form');
        const isViewMode = form && form.dataset.viewMode === 'view';
        
        // Show/hide add button based on checkbox and mode
        if (addMappingBtn) {
          if (e.target.checked && !isViewMode) {
            addMappingBtn.style.display = 'block';
            addMappingBtn.classList.remove('hidden');
          } else {
            addMappingBtn.style.display = 'none';
            addMappingBtn.classList.add('hidden');
          }
        }
        
        if (!e.target.checked) {
          categoryMappings = [];
          renderCategoryMappings();
        }
      });
    }
    
    // Setup add mapping button listener directly (remove old listener first)
    const addBtn = document.getElementById('add-category-mapping-btn');
    if (addBtn) {
      // Remove any existing listener by cloning the button
      const newBtn = addBtn.cloneNode(true);
      addBtn.parentNode.replaceChild(newBtn, addBtn);
      
      // Add fresh listener
      newBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        logger.debug('Add category mapping button clicked (direct listener)', { buttonId: this.id });
        addCategoryMapping();
      });
      
      logger.debug('Add category mapping button listener setup', { buttonExists: !!newBtn });
    } else {
      logger.warn('Add category mapping button not found when setting up listener');
    }
  }, 100);
  
  if (formElement) {
    formElement.reset();
    const accountIdInput = document.getElementById('account-id');
    if (accountIdInput) accountIdInput.value = accountId || '';
    
    // Reset bank account checkbox and mappings
    const isBankAccountCheckbox = document.getElementById('account-is-bank-account');
    if (isBankAccountCheckbox) {
      isBankAccountCheckbox.checked = false;
    }
    loadCategoryMappings([]);
    toggleCategoryMappingSection(false);
  }

  const subtitle = document.getElementById('account-form-subtitle');
  const saveBtn = document.getElementById('save-account-form-btn');
  
  if (accountId) {
    if (title) title.textContent = 'Ver Cuenta';
    if (subtitle) subtitle.textContent = 'Visualice la información de la cuenta';
    // Cambiar color del header a gris para detalle
    const formHeader = document.getElementById('account-form-header');
    if (formHeader) {
      formHeader.classList.remove('bg-green-600', 'bg-blue-600');
      formHeader.classList.add('bg-gray-600');
    }
    // Set to view mode
    form.dataset.viewMode = 'view';
    
    // Update button visibility - show edit, delete, close buttons
    const deleteBtn = document.getElementById('delete-account-form-btn');
    const editBtn = document.getElementById('edit-account-form-btn');
    const closeBtn = document.getElementById('close-account-form-btn');
    const saveBtn = document.getElementById('save-account-form-btn');
    if (deleteBtn) {
      deleteBtn.style.display = 'flex';
      deleteBtn.classList.remove('hidden');
    }
    if (editBtn) {
      editBtn.style.display = 'flex';
      editBtn.classList.remove('hidden');
    }
    if (closeBtn) {
      closeBtn.style.display = 'flex';
      closeBtn.classList.remove('hidden');
    }
    if (saveBtn) {
      saveBtn.style.display = 'none';
      saveBtn.classList.add('hidden');
    }
    
    // Make fields readonly
    const nameInput = document.getElementById('account-name');
    const balanceInput = document.getElementById('account-initial-balance');
    const isBankAccountCheckbox = document.getElementById('account-is-bank-account');
    if (nameInput) {
      nameInput.setAttribute('readonly', 'readonly');
      nameInput.setAttribute('disabled', 'disabled');
    }
    if (balanceInput) {
      balanceInput.setAttribute('readonly', 'readonly');
      balanceInput.setAttribute('disabled', 'disabled');
    }
    if (isBankAccountCheckbox) {
      isBankAccountCheckbox.setAttribute('disabled', 'disabled');
    }
    const processorSelect = document.getElementById('account-statement-processor');
    if (processorSelect) processorSelect.setAttribute('disabled', 'disabled');
    
    // Hide add mapping button in view mode
    const addMappingBtn = document.getElementById('add-category-mapping-btn');
    if (addMappingBtn) {
      addMappingBtn.style.display = 'none';
      addMappingBtn.classList.add('hidden');
    }
    
    // Load account using NRD Data Access
    (async () => {
      try {
        const account = await nrd.accounts.getById(accountId);
        if (account) {
          if (nameInput) nameInput.value = account.name || '';
          if (balanceInput) balanceInput.value = account.initialBalance || 0;
          if (isBankAccountCheckbox) {
            isBankAccountCheckbox.checked = account.isBankAccount === true;
            toggleCategoryMappingSection(account.isBankAccount === true);
          }
          const processorSelect = document.getElementById('account-statement-processor');
          if (processorSelect) processorSelect.value = account.statementProcessor || '';
          // Load category mappings
          if (account.categoryMapping && Array.isArray(account.categoryMapping)) {
            loadCategoryMappings(account.categoryMapping);
          } else {
            loadCategoryMappings([]);
          }
        }
      } catch (error) {
        logger.error('Error loading account', error);
      }
    })();
  } else {
    if (title) title.textContent = 'Nueva Cuenta';
    if (subtitle) subtitle.textContent = 'Cree una nueva cuenta para organizar transacciones';
    // Cambiar color del header a verde para nuevo
    const formHeader = document.getElementById('account-form-header');
    if (formHeader) {
      formHeader.classList.remove('bg-blue-600', 'bg-gray-600');
      formHeader.classList.add('bg-green-600');
    }
    const saveBtn = document.getElementById('save-account-form-btn');
    // Cambiar color del botón guardar a verde
    if (saveBtn) {
      saveBtn.classList.remove('bg-blue-600', 'border-blue-600', 'hover:bg-blue-700');
      saveBtn.classList.add('bg-green-600', 'border-green-600', 'hover:bg-green-700');
    }
    delete form.dataset.viewMode;
    
    // Update button visibility - hide edit/delete, show save/close
    const deleteBtn = document.getElementById('delete-account-form-btn');
    const editBtn = document.getElementById('edit-account-form-btn');
    const closeBtn = document.getElementById('close-account-form-btn');
    if (deleteBtn) {
      deleteBtn.style.display = 'none';
      deleteBtn.classList.add('hidden');
    }
    if (editBtn) {
      editBtn.style.display = 'none';
      editBtn.classList.add('hidden');
    }
    if (closeBtn) {
      closeBtn.style.display = 'flex';
      closeBtn.classList.remove('hidden');
    }
    if (saveBtn) {
      saveBtn.style.display = 'flex';
      saveBtn.classList.remove('hidden');
    }
    
    // Enable fields
    const nameInput = document.getElementById('account-name');
    const balanceInput = document.getElementById('account-initial-balance');
    const isBankAccountCheckbox = document.getElementById('account-is-bank-account');
    if (nameInput) {
      nameInput.removeAttribute('readonly');
      nameInput.removeAttribute('disabled');
    }
    if (balanceInput) {
      balanceInput.removeAttribute('readonly');
      balanceInput.removeAttribute('disabled');
    }
    if (isBankAccountCheckbox) {
      isBankAccountCheckbox.removeAttribute('disabled');
    }
    const processorSelectNew = document.getElementById('account-statement-processor');
    if (processorSelectNew) processorSelectNew.removeAttribute('disabled');
    
    // Show add mapping button for new account
    const addMappingBtn = document.getElementById('add-category-mapping-btn');
    if (addMappingBtn && isBankAccountCheckbox && isBankAccountCheckbox.checked) {
      addMappingBtn.style.display = 'block';
      addMappingBtn.classList.remove('hidden');
    }
    
    // Reset category mappings for new account
    loadCategoryMappings([]);
    toggleCategoryMappingSection(false);
  }
}

// Hide account form
function hideAccountForm() {
  const form = document.getElementById('account-form');
  const list = document.getElementById('accounts-list');
  const header = document.querySelector('#accounts-view .flex.flex-col');
  const reconciliationSection = document.getElementById('reconciliation-section');
  
  if (form) form.classList.add('hidden');
  if (list) list.style.display = 'block';
  if (header) header.style.display = 'flex';
  // Show reconciliation section when hiding account form
  if (reconciliationSection) {
    reconciliationSection.style.display = 'block';
    reconciliationSection.classList.remove('hidden');
    logger.debug('Reconciliation section shown when hiding account form');
  }
  // Sync reconciliation file state (account selected = enable file input)
  const accountSelect = document.getElementById('reconciliation-account-select');
  if (accountSelect && accountSelect.value) {
    selectedReconciliationAccountId = accountSelect.value;
    accountSelect.disabled = true;
    const changeAccountBtn = document.getElementById('change-reconciliation-account-btn');
    const fileInput = document.getElementById('reconciliation-statement-file');
    if (changeAccountBtn) changeAccountBtn.classList.remove('hidden');
    if (fileInput) fileInput.disabled = false;
  }
}

// View account detail
async function viewAccount(accountId) {
  logger.debug('Viewing account', { accountId });
  showSpinner('Cargando cuenta...');
  try {
    const account = await nrd.accounts.getById(accountId);
    hideSpinner();
    if (!account) {
      logger.warn('Account not found', { accountId });
      await showError('Cuenta no encontrada');
      return;
    }

    logger.debug('Account loaded successfully', { accountId, name: account.name });
    // Show edit form instead of detail view
    showAccountForm(accountId);
  } catch (error) {
    hideSpinner();
    logger.error('Error loading account', error);
    await showError('Error al cargar cuenta: ' + error.message);
  }
}

// Account form submit
document.getElementById('account-form-element').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const accountId = document.getElementById('account-id').value;
  const name = document.getElementById('account-name').value.trim();
  const initialBalance = parseFloat(document.getElementById('account-initial-balance').value) || 0;
  const isBankAccount = document.getElementById('account-is-bank-account').checked;
  const statementProcessor = document.getElementById('account-statement-processor')?.value?.trim() || '';
  const categoryMappings = getCategoryMappings();

  if (!name) {
    await showError('Por favor complete todos los campos requeridos');
    return;
  }

  showSpinner('Guardando cuenta...');
  try {
    const nrd = window.nrd;
    const user = nrd?.auth?.getCurrentUser() || null;
    
    // Clean category mappings - remove undefined fields
    let cleanMappings = null;
    if (isBankAccount) {
      cleanMappings = categoryMappings.length > 0
        ? categoryMappings.map(mapping => {
            const clean = {
              descriptionPattern: mapping.descriptionPattern,
              categoryId: mapping.categoryId,
              type: mapping.type,
              sumatoria: mapping.sumatoria !== false
            };
            if (mapping.subcategory && mapping.subcategory.trim()) {
              clean.subcategory = mapping.subcategory.trim();
            }
            return clean;
          })
        : [];
    }

    // Build account data object without undefined fields
    const accountData = {
      name,
      initialBalance,
      active: true,
      isBankAccount: isBankAccount || false
    };
    accountData.statementProcessor = isBankAccount ? (statementProcessor || null) : null;

    // Incluir categoryMapping siempre en cuentas bancarias: lista o [] para eliminar los que había
    if (isBankAccount && cleanMappings !== null) {
      accountData.categoryMapping = cleanMappings;
    }
    
    if (accountId) {
      logger.info('Updating account', { accountId, ...accountData });
      await nrd.accounts.update(accountId, accountData);
      logger.audit('ENTITY_UPDATE', { entity: 'account', id: accountId, data: accountData, uid: user?.uid, email: user?.email, timestamp: Date.now() });
      logger.info('Account updated successfully', { accountId });
    } else {
      logger.info('Creating new account', accountData);
      const id = await nrd.accounts.create(accountData);
      logger.audit('ENTITY_CREATE', { entity: 'account', id, data: accountData, uid: user?.uid, email: user?.email, timestamp: Date.now() });
      logger.info('Account created successfully', { id, name });
    }
    hideSpinner();
    hideAccountForm();
    await showSuccess('Cuenta guardada exitosamente');
  } catch (error) {
    hideSpinner();
    logger.error('Error saving account', error);
    await showError('Error al guardar cuenta: ' + error.message);
  }
});

// New account button
document.getElementById('new-account-btn').addEventListener('click', () => {
  showAccountForm();
});

// Close account form button
document.getElementById('close-account-form').addEventListener('click', () => {
  hideAccountForm();
});
document.getElementById('close-account-form-btn').addEventListener('click', () => {
  hideAccountForm();
});

// Edit button - switch to edit mode
document.getElementById('edit-account-form-btn').addEventListener('click', async () => {
  const form = document.getElementById('account-form');
  const accountId = document.getElementById('account-id').value;
  if (accountId) {
    // Change to edit mode
    form.dataset.viewMode = 'edit';
    
    // Set form title
    const title = document.getElementById('account-form-title');
    const subtitle = document.getElementById('account-form-subtitle');
    if (title) title.textContent = 'Editar Cuenta';
    if (subtitle) subtitle.textContent = 'Modifique la información de la cuenta';
    // Cambiar color del header a azul para edición
    const formHeader = document.getElementById('account-form-header');
    if (formHeader) {
      formHeader.classList.remove('bg-green-600', 'bg-gray-600');
      formHeader.classList.add('bg-blue-600');
    }
    // Enable fields
    const nameInput = document.getElementById('account-name');
    const balanceInput = document.getElementById('account-initial-balance');
    const isBankAccountCheckbox = document.getElementById('account-is-bank-account');
    if (nameInput) {
      nameInput.removeAttribute('readonly');
      nameInput.removeAttribute('disabled');
    }
    if (balanceInput) {
      balanceInput.removeAttribute('readonly');
      balanceInput.removeAttribute('disabled');
    }
    if (isBankAccountCheckbox) {
      isBankAccountCheckbox.removeAttribute('disabled');
    }
    const processorSelectEdit = document.getElementById('account-statement-processor');
    if (processorSelectEdit) processorSelectEdit.removeAttribute('disabled');
    
    // Show add mapping button in edit mode (if bank account)
    const addMappingBtn = document.getElementById('add-category-mapping-btn');
    if (addMappingBtn && isBankAccountCheckbox && isBankAccountCheckbox.checked) {
      addMappingBtn.style.display = 'block';
      addMappingBtn.classList.remove('hidden');
    }
    
    // Re-render mappings to show edit/delete buttons
    renderCategoryMappings();
    
    // Update buttons
    const editBtn = document.getElementById('edit-account-form-btn');
    const deleteBtn = document.getElementById('delete-account-form-btn');
    const closeBtn = document.getElementById('close-account-form-btn');
    const saveBtn = document.getElementById('save-account-form-btn');
    
    // Cambiar color del botón guardar a azul
    if (saveBtn) {
      saveBtn.classList.remove('bg-green-600', 'border-green-600', 'hover:bg-green-700');
      saveBtn.classList.add('bg-blue-600', 'border-blue-600', 'hover:bg-blue-700');
    }
    if (editBtn) {
      editBtn.style.display = 'none';
      editBtn.classList.add('hidden');
    }
    if (deleteBtn) {
      deleteBtn.style.display = 'none';
      deleteBtn.classList.add('hidden');
    }
    if (closeBtn) {
      closeBtn.style.display = 'flex';
      closeBtn.classList.remove('hidden');
    }
    if (saveBtn) {
      saveBtn.style.display = 'flex';
      saveBtn.classList.remove('hidden');
    }
  }
});

// Save button - submit form
document.getElementById('save-account-form-btn').addEventListener('click', async () => {
  const accountForm = document.getElementById('account-form-element');
  if (accountForm) {
    accountForm.dispatchEvent(new Event('submit'));
  }
});

// Delete button - delete account if editing
document.getElementById('delete-account-form-btn').addEventListener('click', async () => {
  const accountId = document.getElementById('account-id').value;
  if (accountId) {
    const confirmed = await showConfirm('Eliminar Cuenta', '¿Está seguro de eliminar esta cuenta?');
    if (!confirmed) return;
    
    showSpinner('Eliminando cuenta...');
    try {
      const nrd = window.nrd;
    const user = nrd?.auth?.getCurrentUser() || null;
      logger.info('Deleting account', { accountId });
      await nrd.accounts.delete(accountId);
      logger.audit('ENTITY_DELETE', { entity: 'account', id: accountId, uid: user?.uid, email: user?.email, timestamp: Date.now() });
      logger.info('Account deleted successfully', { accountId });
      hideSpinner();
      hideAccountForm();
      await showSuccess('Cuenta eliminada exitosamente');
    } catch (error) {
      hideSpinner();
      logger.error('Error deleting account', error);
      await showError('Error al eliminar cuenta: ' + error.message);
    }
  } else {
    // If new account, just close
    hideAccountForm();
  }
});

// Initialize accounts
function initializeAccounts() {
  logger.debug('Initializing accounts');
  loadAccounts();
}

// escapeHtml is now available from NRDCommon (window.escapeHtml)

// Función auxiliar para obtener el lunes de la semana (inicio de semana)
function getWeekStart(timestamp) {
  const date = new Date(timestamp);
  const day = date.getDay(); // 0 = domingo, 1 = lunes, ..., 6 = sábado
  // Calcular días hasta el lunes anterior (o el mismo día si es lunes)
  // Si es domingo (day = 0), retrocedemos 6 días; si es lunes (day = 1), retrocedemos 0 días
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday.getTime();
}

// Calcular tendencia del importe promedio por transacción usando períodos semanales
// Solo considera las últimas 12 semanas
function calculateTrend(transactions) {
  if (!transactions || transactions.length < 2) {
    return null; // No hay suficiente datos para calcular tendencia
  }
  
  // Filtrar transacciones válidas y ordenar por fecha
  const validTransactions = transactions
    .filter(t => t.date && t.date > 0)
    .sort((a, b) => a.date - b.date);
  
  if (validTransactions.length < 2) {
    return null;
  }
  
  // Obtener la fecha más reciente
  const latestDate = validTransactions[validTransactions.length - 1].date;
  
  // Calcular el inicio de la semana actual (lunes de esta semana)
  const currentWeekStart = getWeekStart(Date.now());
  
  // Calcular el inicio de la semana anterior (última semana completa)
  // Restamos 7 días desde el inicio de la semana actual para obtener el inicio de la semana anterior
  const lastCompleteWeekStart = currentWeekStart - (7 * 24 * 60 * 60 * 1000);
  
  // Calcular la fecha de inicio: 12 semanas completas hacia atrás desde la semana anterior
  // (12 semanas = semana anterior + 11 semanas anteriores)
  const twelveWeeksAgoTimestamp = lastCompleteWeekStart - (11 * 7 * 24 * 60 * 60 * 1000);
  
  // Filtrar solo las transacciones de las últimas 12 semanas completas (excluyendo semana actual)
  const filteredTransactions = validTransactions.filter(transaction => {
    const weekStart = getWeekStart(transaction.date);
    // Incluir solo si está dentro del rango y antes de la semana actual
    return weekStart >= twelveWeeksAgoTimestamp && weekStart < currentWeekStart;
  });
  
  if (filteredTransactions.length < 2) {
    return null; // No hay suficiente datos en las últimas 12 semanas
  }
  
  // Agrupar transacciones por semana (lunes a domingo)
  const weeklyGroups = {};
  
  filteredTransactions.forEach(transaction => {
    const weekStart = getWeekStart(transaction.date);
    
    if (!weeklyGroups[weekStart]) {
      weeklyGroups[weekStart] = {
        transactions: [],
        weekStart: weekStart
      };
    }
    
    weeklyGroups[weekStart].transactions.push(transaction);
  });
  
  // Convertir a array y ordenar por semana
  const weeklyArray = Object.values(weeklyGroups).sort((a, b) => a.weekStart - b.weekStart);
  
  if (weeklyArray.length < 2) {
    return null; // Necesitamos al menos 2 semanas
  }
  
  // Calcular promedio semanal del importe por transacción
  const averages = weeklyArray.map((weekGroup, index) => {
    const transactions = weekGroup.transactions;
    
    if (transactions.length === 0) {
      return null;
    }
    
    // Calcular el promedio del importe por transacción en esta semana
    const avgAmount = transactions.reduce((sum, t) => {
      const amount = parseFloat(t.amount) || 0;
      return sum + Math.abs(amount); // Usar valor absoluto para la tendencia
    }, 0) / transactions.length;
    
    return {
      index: index,
      date: weekGroup.weekStart,
      avgAmount: avgAmount,
      weekStart: weekGroup.weekStart
    };
  }).filter(item => item !== null); // Filtrar semanas sin datos
  
  if (averages.length < 2) {
    return null;
  }
  
  // Calcular regresión lineal simple (y = mx + b)
  const n = averages.length;
  const sumX = averages.reduce((sum, item) => sum + item.index, 0);
  const sumY = averages.reduce((sum, item) => sum + item.avgAmount, 0);
  const sumXY = averages.reduce((sum, item) => sum + item.index * item.avgAmount, 0);
  const sumX2 = averages.reduce((sum, item) => sum + item.index * item.index, 0);
  
  const denominator = (n * sumX2 - sumX * sumX);
  if (Math.abs(denominator) < 0.0001) {
    return null; // Evitar división por cero
  }
  
  const slope = (n * sumXY - sumX * sumY) / denominator;
  
  // Calcular el porcentaje de cambio para determinar si es estable
  const firstAvg = averages[0].avgAmount;
  const lastAvg = averages[averages.length - 1].avgAmount;
  const percentChange = firstAvg > 0 ? Math.abs((lastAvg - firstAvg) / firstAvg) : 0;
  
  return {
    slope: slope,
    isIncreasing: slope > 0 && percentChange > 0.05, // Al menos 5% de cambio
    isDecreasing: slope < 0 && percentChange > 0.05,
    isStable: percentChange <= 0.05,
    dataPoints: averages
  };
}

// Generar gráfico SVG pequeño de tendencia semanal
function calculateTrendGraph(transactions, accountName = '') {
  const trend = calculateTrend(transactions);
  
  if (!trend) {
    // No hay suficiente datos (necesita al menos 2 semanas)
    return {
      svg: '<span class="text-xs text-gray-400" title="Se necesitan al menos 2 semanas de datos">-</span>',
      clickable: false
    };
  }
  
  const width = 70;
  const height = 35;
  const padding = 5;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  
  // Determinar color basado en la tendencia
  let strokeColor = '#94a3b8'; // Gris para estable
  let pointColor = '#64748b'; // Gris más oscuro para puntos cuando es estable
  if (trend.isIncreasing) {
    strokeColor = '#22c55e'; // Verde para aumentando
    pointColor = '#16a34a'; // Verde más oscuro para puntos
  } else if (trend.isDecreasing) {
    strokeColor = '#ef4444'; // Rojo para disminuyendo
    pointColor = '#dc2626'; // Rojo más oscuro para puntos
  }
  
  // Obtener puntos de datos (cada punto es una semana)
  const dataPoints = trend.dataPoints || [];
  if (dataPoints.length < 2) {
    return {
      svg: '<span class="text-xs text-gray-400" title="Se necesitan al menos 2 semanas de datos">-</span>',
      clickable: false
    };
  }
  
  // Normalizar datos para el gráfico
  const amounts = dataPoints.map(d => d.avgAmount);
  const minAmount = Math.min(...amounts);
  const maxAmount = Math.max(...amounts);
  const range = maxAmount - minAmount || 1; // Evitar división por cero
  
  // Generar puntos de la línea (cada punto representa una semana)
  const linePoints = dataPoints.map((point, index) => {
    const x = padding + (index / (dataPoints.length - 1 || 1)) * chartWidth;
    const normalizedY = range > 0 ? (point.avgAmount - minAmount) / range : 0.5;
    // Invertir Y porque en SVG Y=0 está arriba, y queremos que valores mayores estén más arriba
    const y = padding + chartHeight - (normalizedY * chartHeight);
    return { x, y, amount: point.avgAmount, weekIndex: index + 1, weekStart: point.weekStart };
  });
  
  // Crear la cadena de puntos para el polyline
  const pointsString = linePoints.map(p => `${p.x},${p.y}`).join(' ');
  
  // Generar círculos para cada punto (cada semana)
  const circles = linePoints.map(point => {
    // Mostrar todos los puntos, pero hacerlos más pequeños si hay muchas semanas
    const radius = dataPoints.length > 8 ? 1.5 : 2;
    return `<circle cx="${point.x}" cy="${point.y}" r="${radius}" fill="${pointColor}" stroke="${strokeColor}" stroke-width="0.5" opacity="0.9"/>`;
  }).join('\n      ');
  
  // Calcular número de semanas
  const numWeeks = dataPoints.length;
  const tooltip = accountName 
    ? `Tendencia semanal: ${accountName} (${numWeeks} ${numWeeks === 1 ? 'semana' : 'semanas'}) - Click para ampliar`
    : `Tendencia semanal (${numWeeks} ${numWeeks === 1 ? 'semana' : 'semanas'}) - Click para ampliar`;
  
  // Crear SVG con tooltip mostrando el número de semanas
  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="inline-block trend-graph-clickable" style="vertical-align: middle;" title="${tooltip}">
      <!-- Línea de fondo central (referencia) -->
      <line x1="${padding}" y1="${padding + chartHeight / 2}" 
            x2="${width - padding}" y2="${padding + chartHeight / 2}" 
            stroke="#e5e7eb" stroke-width="0.5" opacity="0.4"/>
      <!-- Línea de datos conectando las semanas -->
      <polyline points="${pointsString}" 
                fill="none" 
                stroke="${strokeColor}" 
                stroke-width="1.5" 
                stroke-linecap="round" 
                stroke-linejoin="round"
                opacity="0.7"/>
      <!-- Puntos circulares marcando cada semana -->
      ${circles}
    </svg>
  `;
  
  return {
    svg: svg,
    clickable: true,
    trend: trend,
    linePoints: linePoints,
    minAmount: minAmount,
    maxAmount: maxAmount
  };
}

// Mostrar modal con gráfico ampliado de tendencia semanal
function showTrendGraphModal(accountName, transactions) {
  const trend = calculateTrend(transactions);
  
  if (!trend) {
    showInfo('Tendencia no disponible', 'Se necesitan al menos 2 semanas de datos para mostrar la tendencia.');
    return;
  }
  
  const modal = document.getElementById('trend-graph-modal');
  const modalTitle = document.getElementById('trend-graph-modal-title');
  const modalContent = document.getElementById('trend-graph-modal-content');
  const closeBtn = document.getElementById('close-trend-graph-modal');
  
  if (!modal || !modalTitle || !modalContent || !closeBtn) {
    logger.warn('Modal elements not found');
    return;
  }
  
  // Establecer título
  modalTitle.textContent = `Tendencia Semanal: ${escapeHtml(accountName)}`;
  
  // Generar gráfico ampliado y detalles
  const expandedGraph = generateExpandedTrendGraph(transactions, trend);
  
  // Generar tabla de semanas con detalles
  const weeksTable = generateWeeksTable(trend);
  
  // Establecer contenido
  modalContent.innerHTML = `
    <div class="space-y-6">
      <!-- Gráfico ampliado -->
      <div class="border border-gray-200 p-4 bg-gray-50">
        ${expandedGraph}
      </div>
      
      <!-- Tabla de semanas -->
      <div>
        <h4 class="text-sm font-light text-gray-700 mb-3 uppercase tracking-wider">Detalle por Semana</h4>
        ${weeksTable}
      </div>
    </div>
  `;
  
  // Mostrar modal
  modal.classList.remove('hidden');
  
  // Event listeners para cerrar
  const closeModal = () => {
    modal.classList.add('hidden');
    modalContent.innerHTML = '';
  };
  
  closeBtn.onclick = closeModal;
  modal.onclick = (e) => {
    if (e.target === modal) {
      closeModal();
    }
  };
}

// Generar gráfico ampliado de tendencia semanal
function generateExpandedTrendGraph(transactions, trend) {
  const width = 600;
  const height = 300;
  const padding = 50;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  
  // Determinar color basado en la tendencia
  let strokeColor = '#94a3b8'; // Gris para estable
  let pointColor = '#64748b'; // Gris más oscuro para puntos cuando es estable
  let trendLabel = 'Estable';
  if (trend.isIncreasing) {
    strokeColor = '#22c55e'; // Verde para aumentando
    pointColor = '#16a34a';
    trendLabel = 'Aumentando';
  } else if (trend.isDecreasing) {
    strokeColor = '#ef4444'; // Rojo para disminuyendo
    pointColor = '#dc2626';
    trendLabel = 'Disminuyendo';
  }
  
  const dataPoints = trend.dataPoints || [];
  if (dataPoints.length < 2) {
    return '<p class="text-sm text-gray-500 text-center">No hay suficientes datos para generar el gráfico</p>';
  }
  
  // Normalizar datos
  const amounts = dataPoints.map(d => d.avgAmount);
  const minAmount = Math.min(...amounts);
  const maxAmount = Math.max(...amounts);
  const range = maxAmount - minAmount || 1;
  
  // Calcular incremento porcentual
  const firstAvg = dataPoints[0].avgAmount;
  const lastAvg = dataPoints[dataPoints.length - 1].avgAmount;
  const percentChange = firstAvg > 0 ? ((lastAvg - firstAvg) / firstAvg) * 100 : 0;
  
  // Generar puntos
  const linePoints = dataPoints.map((point, index) => {
    const x = padding + (index / (dataPoints.length - 1 || 1)) * chartWidth;
    const normalizedY = range > 0 ? (point.avgAmount - minAmount) / range : 0.5;
    const y = padding + chartHeight - (normalizedY * chartHeight);
    return { 
      x, 
      y, 
      amount: point.avgAmount, 
      weekIndex: index + 1, 
      weekStart: point.weekStart,
      date: new Date(point.weekStart)
    };
  });
  
  const pointsString = linePoints.map(p => `${p.x},${p.y}`).join(' ');
  
  // Generar círculos y etiquetas
  const circles = linePoints.map((point, index) => {
    const weekStartDate = new Date(point.weekStart);
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekEndDate.getDate() + 6); // Domingo de la misma semana
    
    const weekStartStr = formatDate24h(weekStartDate);
    const weekEndStr = formatDate24h(weekEndDate);
    
    return `
      <g>
        <circle cx="${point.x}" cy="${point.y}" r="4" fill="${pointColor}" stroke="${strokeColor}" stroke-width="1.5" opacity="0.9">
          <title>Semana ${point.weekIndex}: ${weekStartStr} - ${weekEndStr}&#10;Promedio: $${formatNumber(point.amount)}</title>
        </circle>
        <text x="${point.x}" y="${point.y - 10}" text-anchor="middle" class="text-xs fill-gray-600 font-light">S${point.weekIndex}</text>
        <text x="${point.x}" y="${height - 20}" text-anchor="middle" class="text-[10px] fill-gray-500" transform="rotate(-45 ${point.x} ${height - 20})">${weekStartStr}</text>
      </g>
    `;
  }).join('\n');
  
  // Calcular línea de tendencia
  const firstPoint = linePoints[0];
  const lastPoint = linePoints[linePoints.length - 1];
  
  // Ejes y grid
  const gridLines = [];
  for (let i = 0; i <= 5; i++) {
    const y = padding + (chartHeight / 5) * i;
    const value = maxAmount - (range / 5) * i;
    gridLines.push(`
      <line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" stroke="#e5e7eb" stroke-width="0.5" opacity="0.3"/>
      <text x="${padding - 10}" y="${y + 4}" text-anchor="end" class="text-xs fill-gray-500">$${formatNumber(value)}</text>
    `);
  }
  
  return `
    <div class="mb-4">
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-3">
          <span class="text-sm text-gray-600">Tendencia:</span>
          <span class="px-3 py-1 text-sm font-medium" style="background-color: ${strokeColor}20; color: ${strokeColor}">${trendLabel}</span>
          <span class="text-xs text-gray-500">(${dataPoints.length} ${dataPoints.length === 1 ? 'semana' : 'semanas'})</span>
        </div>
        <div class="text-sm text-gray-600">
          <span>Cambio:</span>
          <span style="color: ${percentChange >= 0 ? '#22c55e' : '#ef4444'}" class="font-medium">
            ${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="w-full h-auto">
      <!-- Grid lines -->
      ${gridLines.join('\n')}
      
      <!-- Línea de datos -->
      <polyline points="${pointsString}" 
                fill="none" 
                stroke="${strokeColor}" 
                stroke-width="3" 
                stroke-linecap="round" 
                stroke-linejoin="round"
                opacity="0.8"/>
      
      <!-- Línea de tendencia -->
      <line x1="${firstPoint.x}" y1="${firstPoint.y}" 
            x2="${lastPoint.x}" y2="${lastPoint.y}" 
            stroke="${strokeColor}" 
            stroke-width="2" 
            stroke-dasharray="4,4" 
            opacity="0.5"/>
      
      <!-- Puntos y etiquetas -->
      ${circles}
      
      <!-- Ejes -->
      <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="#374151" stroke-width="1"/>
      <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#374151" stroke-width="1"/>
    </svg>
  `;
}

// Generar tabla con detalles de cada semana
function generateWeeksTable(trend) {
  const dataPoints = trend.dataPoints || [];
  
  if (dataPoints.length === 0) {
    return '<p class="text-sm text-gray-500">No hay datos disponibles</p>';
  }
  
  // Invertir el orden para mostrar del más reciente al más antiguo
  const reversedDataPoints = [...dataPoints].reverse();
  
  // Calcular variación entre semanas (comparando con la semana siguiente en el array invertido)
  const weeksData = reversedDataPoints.map((point, index) => {
    const weekStartDate = new Date(point.weekStart);
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekEndDate.getDate() + 6);
    
    let variation = null;
    let variationPercent = null;
    let variationColor = 'text-gray-500';
    
    // Comparar con la semana anterior (que es la siguiente en el array invertido)
    if (index < reversedDataPoints.length - 1) {
      const nextPoint = reversedDataPoints[index + 1];
      const prevAmount = nextPoint.avgAmount; // Semana anterior en tiempo
      variation = point.avgAmount - prevAmount;
      if (prevAmount > 0) {
        variationPercent = (variation / prevAmount) * 100;
      }
      
      if (variation > 0) {
        variationColor = 'text-green-600';
      } else if (variation < 0) {
        variationColor = 'text-red-600';
      }
    }
    
    return {
      weekNumber: dataPoints.length - index, // Número de semana desde el inicio (de 12 a 1)
      weekStart: weekStartDate,
      weekEnd: weekEndDate,
      avgAmount: point.avgAmount,
      variation: variation,
      variationPercent: variationPercent,
      variationColor: variationColor
    };
  });
  
  const tableRows = weeksData.map(week => {
    const weekStartStr = formatDate24h(week.weekStart);
    const weekEndStr = formatDate24h(week.weekEnd);
    const formattedAmount = new Intl.NumberFormat('es-UY', {
      style: 'currency',
      currency: 'UYU',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(week.avgAmount);
    
    let variationHtml = '<span class="text-xs text-gray-400">-</span>';
    if (week.variation !== null) {
      const variationSign = week.variation >= 0 ? '+' : '';
      const variationPercentStr = week.variationPercent !== null 
        ? ` (${variationSign}${week.variationPercent.toFixed(1)}%)`
        : '';
      variationHtml = `
        <span class="text-xs ${week.variationColor}">
          ${variationSign}$${formatNumber(Math.abs(week.variation))}${variationPercentStr}
        </span>
      `;
    }
    
    return `
      <tr class="border-b border-gray-200 hover:bg-gray-50">
        <td class="p-2 text-sm text-center font-medium">${week.weekNumber}</td>
        <td class="p-2 text-xs text-gray-600">${weekStartStr}</td>
        <td class="p-2 text-xs text-gray-600">${weekEndStr}</td>
        <td class="p-2 text-sm font-medium text-right">${formattedAmount}</td>
        <td class="p-2 text-right">${variationHtml}</td>
      </tr>
    `;
  }).join('');
  
  return `
    <div class="overflow-x-auto border border-gray-200">
      <table class="w-full border-collapse text-left">
        <thead>
          <tr class="bg-gray-100 border-b border-gray-300">
            <th class="p-2 text-xs font-light text-gray-700 uppercase tracking-wider">Semana</th>
            <th class="p-2 text-xs font-light text-gray-700 uppercase tracking-wider">Inicio</th>
            <th class="p-2 text-xs font-light text-gray-700 uppercase tracking-wider">Fin</th>
            <th class="p-2 text-xs font-light text-gray-700 uppercase tracking-wider text-right">Promedio</th>
            <th class="p-2 text-xs font-light text-gray-700 uppercase tracking-wider text-right">Variación</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </div>
  `;
}

// Helper functions para formatear
function formatDate24h(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

// formatNumber is now available from NRDCommon (window.formatNumber)

// ============================================
// Bank Reconciliation Functions
// ============================================

let reconciliationTransactionsListener = null;
let reconciliationAccountsListener = null;
let reconciliationTransactions = {};
let reconciliationAccounts = {};
let selectedReconciliationAccountId = null;
let currentSystemBalance = 0;
let currentBankBalance = 0;
let currentBankInitialBalance = null; // Saldo inicial desde fila 15 del Excel (columna saldo)
let bankMovements = []; // Movimientos bancarios cargados del estado de cuenta
let verifiedMovements = new Set(); // Set de hashes de movimientos verificados
let manualMovementMappings = new Map(); // Map<hash, { categoryId, subcategory, type }> para movimientos sin patrón
/** Cuenta contraria por grupo (solo cuando el mapeo es subcategoría/categoría TRANSFERENCIAS). Key = getReconciliationGroupKey(group) */
let transferAccountByGroupKey = new Map();
let isConfirmingReconciliation = false; // Guard against concurrent confirmations

// Generate hash for bank movement to identify unique transactions
// Uses: date, type (income/expense), credit amount, debit amount
function generateBankMovementHash(date, type, credit, debit, description) {
  // Normalize data for consistent hashing
  const normalizedDate = date instanceof Date ? date.toISOString().split('T')[0] : String(date);
  const normalizedType = type === 'income' ? 'income' : 'expense';
  const normalizedCredit = Math.round(parseFloat(credit || 0) * 100) / 100; // Round to 2 decimals
  const normalizedDebit = Math.round(parseFloat(debit || 0) * 100) / 100; // Round to 2 decimals
  const normalizedDescription = (description || '').trim().toUpperCase().replace(/\s+/g, ' ');
  
  // Create hash string: date|type|credit|debit|description
  const hashString = `${normalizedDate}|${normalizedType}|${normalizedCredit}|${normalizedDebit}|${normalizedDescription}`;
  
  // Simple hash function (can be improved with crypto.subtle if needed)
  let hash = 0;
  for (let i = 0; i < hashString.length; i++) {
    const char = hashString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return `bank_${Math.abs(hash).toString(36)}`;
}

// Initialize reconciliation when accounts view loads
function initializeReconciliation() {
  logger.debug('Initializing reconciliation');
  
  // Setup event handlers
  setupReconciliationHandlers();
  setupMovementCategoryModalListeners();
  
  // Load data
  loadReconciliationData();
}

// Setup reconciliation event handlers
function setupReconciliationHandlers() {
  const accountSelect = document.getElementById('reconciliation-account-select');
  const changeAccountBtn = document.getElementById('change-reconciliation-account-btn');

  const fileInput = document.getElementById('reconciliation-statement-file');

  function syncReconciliationFileState() {
    const hasAccount = !!accountSelect?.value;
    if (accountSelect) accountSelect.disabled = hasAccount;
    if (changeAccountBtn) changeAccountBtn.classList.toggle('hidden', !hasAccount);
    if (fileInput) fileInput.disabled = !hasAccount;
  }

  if (accountSelect) {
    accountSelect.addEventListener('change', async (e) => {
      selectedReconciliationAccountId = e.target.value;
      if (selectedReconciliationAccountId) {
        syncReconciliationFileState();
        await loadAccountReconciliation();
        if (bankMovements.length > 0) {
          renderBankMovements();
        }
      } else {
        resetReconciliationSelection();
      }
    });
  }

  function resetReconciliationSelection() {
    selectedReconciliationAccountId = null;
    bankMovements = [];
    verifiedMovements.clear();
    manualMovementMappings.clear();
    const accSelect = document.getElementById('reconciliation-account-select');
    const changeBtn = document.getElementById('change-reconciliation-account-btn');
    const flInput = document.getElementById('reconciliation-statement-file');
    if (accSelect) {
      accSelect.value = '';
      accSelect.disabled = false;
    }
    if (changeBtn) changeBtn.classList.add('hidden');
    if (flInput) {
      flInput.value = '';
      flInput.disabled = true;
    }
    // Limpiar datos del estado de cuenta importado
    const statementDateInput = document.getElementById('reconciliation-statement-date');
    if (statementDateInput) statementDateInput.value = '';
    const bankNameEl = document.getElementById('reconciliation-statement-bank-name');
    const dateFromEl = document.getElementById('reconciliation-statement-date-from');
    const dateToEl = document.getElementById('reconciliation-statement-date-to');
    const initialBalanceEl = document.getElementById('reconciliation-statement-initial-balance');
    if (bankNameEl) bankNameEl.textContent = '—';
    if (dateFromEl) dateFromEl.textContent = '—';
    if (dateToEl) dateToEl.textContent = '—';
    if (initialBalanceEl) initialBalanceEl.textContent = '—';
    hideReconciliationSections();
  }

  if (changeAccountBtn) {
    changeAccountBtn.addEventListener('click', () => {
      resetReconciliationSelection();
    });
  }

  syncReconciliationFileState();

  if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        await processStatementExcelFile(file);
      }
    });
  }
  
  const confirmBtn = document.getElementById('confirm-reconciliation-btn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      await confirmBankReconciliation();
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

// Load transactions and accounts data for reconciliation
function loadReconciliationData() {
  const nrd = window.nrd;
  if (!nrd) {
    logger.error('NRD service not available');
    return;
  }

  // Clean up previous listeners
  if (reconciliationTransactionsListener) {
    reconciliationTransactionsListener();
    reconciliationTransactionsListener = null;
  }
  if (reconciliationAccountsListener) {
    reconciliationAccountsListener();
    reconciliationAccountsListener = null;
  }

  // Listen to transactions
  reconciliationTransactionsListener = nrd.transactions.onValue((transactions) => {
    reconciliationTransactions = transactions.reduce((acc, tx) => {
      if (tx && tx.id) {
        acc[tx.id] = tx;
      }
      return acc;
    }, {});
    logger.debug('Transactions updated for reconciliation', { count: Object.keys(reconciliationTransactions).length });
    if (selectedReconciliationAccountId) {
      loadAccountReconciliation();
    }
  });

  // Listen to accounts
  reconciliationAccountsListener = nrd.accounts.onValue((accounts) => {
    reconciliationAccounts = accounts.reduce((acc, account) => {
      if (account && account.id) {
        acc[account.id] = account;
      }
      return acc;
    }, {});
    logger.debug('Accounts updated for reconciliation', { count: Object.keys(reconciliationAccounts).length });
    populateReconciliationAccountSelector();
    showReconciliationContentWhenReady();
  });
}

function showReconciliationContentWhenReady() {
  hideSpinner();
  const contentEl = document.getElementById('reconciliation-content');
  if (contentEl) contentEl.classList.remove('hidden');
}

// Populate reconciliation account selector (solo cuentas con procesador de estado definido)
function populateReconciliationAccountSelector() {
  const accountSelect = document.getElementById('reconciliation-account-select');
  if (!accountSelect) return;

  accountSelect.innerHTML = '<option value="">-- Seleccione una cuenta --</option>';
  
  Object.values(reconciliationAccounts || {}).forEach(account => {
    if (!account || account.active === false) return;
    if (!account.statementProcessor) return; // Solo cuentas con procesador aparecen en conciliación
    const option = document.createElement('option');
    option.value = account.id;
    option.textContent = account.name || 'Sin nombre';
    accountSelect.appendChild(option);
  });
}

// Load reconciliation for selected account (prepares for file selection)
async function loadAccountReconciliation() {
  if (!selectedReconciliationAccountId) return;

  const account = reconciliationAccounts[selectedReconciliationAccountId];
  if (!account) return;

  currentSystemBalance = 0;
  currentBankBalance = 0;
  currentBankInitialBalance = null;
}

// Process statement Excel file según el procesador de la cuenta (Santander, Mercado Pago, etc.)
async function processStatementExcelFile(file) {
  const showSuccess = window.NRDCommon?.showSuccess || (async () => {});
  const showError = window.NRDCommon?.showError || (async () => {});

  try {
    const account = selectedReconciliationAccountId ? reconciliationAccounts[selectedReconciliationAccountId] : null;
    const processor = account?.statementProcessor;
    if (!account || !processor) {
      await showError('Seleccione una cuenta con procesador de estado de cuenta configurado.');
      return;
    }
    if (!window.XLSX) {
      await showError('La librería para leer archivos Excel no está disponible');
      return;
    }

    showSpinner('Leyendo archivo Excel...');
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false });

    let parsedData = null;
    if (processor === STATEMENT_PROCESSORS.SANTANDER_DEBITO) {
      parsedData = parseSantanderStatement(data, generateBankMovementHash);
    } else if (processor === STATEMENT_PROCESSORS.SANTANDER_CREDITO) {
      parsedData = parseSantanderCreditoStatement(data, generateBankMovementHash);
    } else if (processor === STATEMENT_PROCESSORS.MERCADO_PAGO) {
      parsedData = parseMercadoPagoStatement(data, generateBankMovementHash);
    } else {
      hideSpinner();
      await showError('Procesador de estado de cuenta no soportado: ' + (STATEMENT_PROCESSOR_LABELS[processor] || processor));
      return;
    }

    if (!parsedData) {
      hideSpinner();
      await showError('No se pudo leer el formato del archivo. Verifique que coincida con ' + (STATEMENT_PROCESSOR_LABELS[processor] || processor) + '.');
      return;
    }

    const statementDateInput = document.getElementById('reconciliation-statement-date');
    const bankBalanceInput = document.getElementById('reconciliation-bank-balance');

    if (parsedData.statementDate && statementDateInput) {
      const date = new Date(parsedData.statementDate);
      if (!isNaN(date.getTime())) statementDateInput.value = date.toISOString().split('T')[0];
    }
    if (parsedData.balance !== null && parsedData.balance !== undefined && bankBalanceInput) {
      const formatNumber = window.formatNumber || ((val) => String(val).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
      bankBalanceInput.value = formatNumber(parsedData.balance);
    }

    currentBankInitialBalance = parsedData.initialBalance ?? null;
    bankMovements = parsedData.movements || [];
    verifiedMovements.clear();
    manualMovementMappings.clear();

    const nrd = window.nrd;
    if (nrd && selectedReconciliationAccountId) {
      try {
        const existingTransactions = Object.values(reconciliationTransactions || {}).filter(
          tx => tx.accountId === selectedReconciliationAccountId && tx.idHashBancario
        );
        const txByHash = {};
        const reconciledMovementHashes = new Set();
        existingTransactions.forEach(tx => {
          if (tx.idHashBancario) txByHash[tx.idHashBancario] = tx;
          // Indexar hashes individuales de movimientos almacenados en la transacción
          if (Array.isArray(tx.bankMovementHashes)) {
            tx.bankMovementHashes.forEach(h => reconciledMovementHashes.add(h));
          }
        });
        bankMovements.forEach(movement => {
          if (txByHash[movement.hash] || reconciledMovementHashes.has(movement.hash)) {
            verifiedMovements.add(movement.hash);
          }
        });
      } catch (e) {
        logger.warn('Error comparing movements with existing transactions', e);
      }
    }

    await renderBankMovements();
    if (statementDateInput?.value && bankBalanceInput?.value) await loadReconciliation();

    hideSpinner();
    await showSuccess('Archivo procesado correctamente. Revise los movimientos y márquelos como verificados.');
  } catch (error) {
    logger.error('Error processing statement Excel file', error);
    hideSpinner();
    await showError('Error al procesar el archivo Excel: ' + (error.message || 'Error desconocido'));
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

    currentBankBalance = parseReconciliationAmount(bankBalanceStr);
    
    // Calculate system balance up to statement date
    const statementDateObj = new Date(statementDate);
    statementDateObj.setHours(23, 59, 59, 999);
    
    const calculateAccountBalanceFn = window.calculateAccountBalance;
    if (typeof calculateAccountBalanceFn === 'function') {
      // Pass all transactions - calculateAccountBalance will filter by date internally
      const transactionsArray = Object.values(reconciliationTransactions || {});
      // Pass Date object, not timestamp
      currentSystemBalance = await calculateAccountBalanceFn(selectedReconciliationAccountId, transactionsArray, statementDateObj, reconciliationAccounts);
    } else {
      logger.warn('calculateAccountBalance function not available');
      currentSystemBalance = 0;
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
  try {
    const formatCurrency = window.formatCurrency || ((val) => `$${Math.round(val)}`);
    const formatDateShort = (timestamp) => {
      if (!timestamp) return '—';
      const d = new Date(timestamp);
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    };

    // Tarjeta estado de cuenta: banco, fechas desde/hasta, saldo inicial (solo si hay movimientos)
    const statementCard = document.getElementById('reconciliation-statement-card');
    if (statementCard && bankMovements && bankMovements.length > 0) {
      statementCard.classList.remove('hidden');
      const bankNameEl = document.getElementById('reconciliation-statement-bank-name');
      const dateFromEl = document.getElementById('reconciliation-statement-date-from');
      const dateToEl = document.getElementById('reconciliation-statement-date-to');
      const initialBalanceEl = document.getElementById('reconciliation-statement-initial-balance');

      const account = selectedReconciliationAccountId ? reconciliationAccounts[selectedReconciliationAccountId] : null;
      if (bankNameEl) {
        bankNameEl.textContent = account?.name || '—';
      }

      const dates = bankMovements.map(m => m.date).filter(Boolean);
      const dateFrom = dates.length ? Math.min(...dates) : null;
      const dateTo = dates.length ? Math.max(...dates) : null;
      if (dateFromEl) dateFromEl.textContent = formatDateShort(dateFrom);
      if (dateToEl) dateToEl.textContent = formatDateShort(dateTo);

      // Saldo inicial: desde fila 15 columna saldo del Excel; si no viene, se calcula
      const initialBalance = currentBankInitialBalance != null
        ? currentBankInitialBalance
        : (() => {
            const totalIncome = bankMovements.filter(m => m.type === 'income').reduce((s, m) => s + (m.amount || 0), 0);
            const totalExpense = bankMovements.filter(m => m.type === 'expense').reduce((s, m) => s + (m.amount || 0), 0);
            return currentBankBalance - (totalIncome - totalExpense);
          })();
      if (initialBalanceEl) {
        initialBalanceEl.textContent = formatCurrency(Math.round(initialBalance));
      }
    } else if (statementCard) {
      statementCard.classList.add('hidden');
    }

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

    // Render bank movements (categorized)
    await renderBankMovements();
    // Don't render transactions - only show bank movements from Excel
    // await renderReconciliationTransactions();
    
    // Hide transactions section
    const transactionsSection = document.getElementById('reconciliation-transactions-section');
    if (transactionsSection) {
      transactionsSection.classList.add('hidden');
    }
  } catch (error) {
    logger.error('Error rendering reconciliation', error);
    await window.NRDCommon?.showError?.(error.message || 'Error al renderizar conciliación');
  }
}

// Agrupar movimientos en “runs” consecutivos con la misma clave (orden Excel)
// Indica si el grupo está mapeado a categoría o subcategoría TRANSFERENCIAS (obligatorio cuenta contraria)
function isTransferGroup(group, categoriesMap) {
  if (!group || !group.mapping) return false;
  const categoryName = (group.mapping.categoryName || categoriesMap[group.mapping.categoryId] || '').toUpperCase();
  const subcategory = (group.mapping.subcategory || '').toUpperCase();
  return categoryName.includes('TRANSFERENCIA') || subcategory.includes('TRANSFERENCIA');
}

// Clave única del grupo para guardar/leer cuenta contraria (debe coincidir con groupMovementsByMapping)
function getReconciliationGroupKey(group) {
  if (!group || !group.mapping) return '';
  const m = group.mapping;
  const base = `${m.categoryId}_${group.type}_${m.subcategory || ''}`;
  return m.sumatoria !== false && group.movements.length >= 2 ? base : `${base}_${group.movements[0]?.hash || ''}`;
}

function groupMovementsForDisplay(movements, account) {
  const groupsByKey = new Map();
  movements.forEach((movement) => {
    const mapping = getMatchingMapping(movement, account);
    // Misma clave que en confirmación: agrupar por (categoría, tipo, subcategoría) para que no se dupliquen transacciones
    const mappingKey = mapping
      ? `${mapping.categoryId}_${mapping.type}_${(mapping.subcategory || '').trim()}`
      : `no-mapping_${movement.type}_${movement.hash}`;
    if (!groupsByKey.has(mappingKey)) {
      groupsByKey.set(mappingKey, { mapping, movements: [], type: movement.type });
    }
    groupsByKey.get(mappingKey).movements.push(movement);
  });
  return Array.from(groupsByKey.values());
}

// Render bank movements from statement (categorized by group)
async function renderBankMovements() {
  const movementsSection = document.getElementById('bank-movements-section');
  const movementsList = document.getElementById('bank-movements-list');
  const confirmBtn = document.getElementById('confirm-reconciliation-btn');
  
  logger.info('renderBankMovements called', { 
    movementsCount: bankMovements.length,
    hasSection: !!movementsSection,
    hasList: !!movementsList,
    movementsSample: bankMovements.slice(0, 2).map(m => ({ 
      date: m.date, 
      description: m.description?.substring(0, 30), 
      amount: m.amount 
    }))
  });
  
  if (!movementsSection || !movementsList) {
    logger.error('Bank movements section or list not found in DOM', {
      movementsSectionId: 'bank-movements-section',
      movementsListId: 'bank-movements-list',
      movementsSectionFound: !!movementsSection,
      movementsListFound: !!movementsList
    });
    return;
  }
  
  if (bankMovements.length === 0) {
    logger.warn('No bank movements to display, hiding section');
    movementsSection.classList.add('hidden');
    if (confirmBtn) confirmBtn.classList.add('hidden');
    return;
  }
  
  // Count movements by type
  const incomeMovements = bankMovements.filter(m => m.type === 'income');
  const expenseMovements = bankMovements.filter(m => m.type === 'expense');
  
  logger.info('Showing bank movements section', { 
    movementsCount: bankMovements.length,
    incomeCount: incomeMovements.length,
    expenseCount: expenseMovements.length,
    incomeSample: incomeMovements.slice(0, 3).map(m => ({
      description: m.description?.substring(0, 40),
      amount: m.amount,
      type: m.type
    })),
    expenseSample: expenseMovements.slice(0, 3).map(m => ({
      description: m.description?.substring(0, 40),
      amount: m.amount,
      type: m.type
    }))
  });
  movementsSection.classList.remove('hidden');
  movementsList.innerHTML = '';
  
  const account = selectedReconciliationAccountId ? reconciliationAccounts[selectedReconciliationAccountId] : null;
  const hasAccountMappings = account && account.categoryMapping && Array.isArray(account.categoryMapping) && account.categoryMapping.length > 0;
  const groups = groupMovementsForDisplay(bankMovements, account);

  // Hashes ya cargados como transacción (idHashBancario + bankMovementHashes en transacciones de esta cuenta)
  const loadedHashes = new Set();
  if (selectedReconciliationAccountId && reconciliationTransactions) {
    Object.values(reconciliationTransactions)
      .filter(tx => tx.accountId === selectedReconciliationAccountId && tx.idHashBancario)
      .forEach(tx => {
        loadedHashes.add(tx.idHashBancario);
        if (Array.isArray(tx.bankMovementHashes)) {
          tx.bankMovementHashes.forEach(h => loadedHashes.add(h));
        }
      });
  }

  logger.info('Groups created for display', { 
    groupsCount: groups.length,
    totalMovements: groups.reduce((sum, g) => sum + g.movements.length, 0),
    groups: groups.map(g => ({
      movementsCount: g.movements.length,
      hasMapping: !!g.mapping,
      type: g.type
    }))
  });

  const categoriesMap = {};
  const nrd = window.nrd;
  if (nrd && nrd.categories) {
    try {
      const cats = await nrd.categories.getAll();
      (Array.isArray(cats) ? cats : Object.values(cats || {})).forEach(c => {
        if (c && c.id) categoriesMap[c.id] = c.name;
      });
    } catch (e) {
      logger.warn('Could not load categories for display', e);
    }
  }

  const otherAccounts = Object.values(reconciliationAccounts || {}).filter(
    a => a && a.id && a.id !== selectedReconciliationAccountId && a.active !== false
  );

  const classifiedGroups = groups.filter(g => g.mapping);
  const unclassifiedGroups = groups.filter(g => !g.mapping);
  
  const formatCurrency = window.formatCurrency || ((val) => `$${Math.round(val)}`);
  const formatDate24h = (timestamp) => {
    const d = new Date(timestamp);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };
  const escapeHtml = window.escapeHtml || ((text) => {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  });

  const renderSingleMovement = (movement, isInAggregation = false, isUnclassified = false, isAlreadyLoaded = false) => {
    const isVerified = verifiedMovements.has(movement.hash);
    const isIncome = movement.type === 'income';
    const matchingMapping = account ? getMatchingMapping(movement, account) : null;
    const hasNoPatternMatch = account ? !movementMatchesAccountPattern(movement, account) : false;
    const manualMapping = manualMovementMappings.get(movement.hash);
    let categoryLabel = '';
    if (matchingMapping) {
      const name = matchingMapping.categoryName || categoriesMap[matchingMapping.categoryId] || 'Categoría';
      const classification = matchingMapping.subcategory ? `${name} → ${matchingMapping.subcategory}` : name;
      categoryLabel = `<span class="text-xs text-blue-600">${escapeHtml(classification)}</span>`;
    } else {
      categoryLabel = '<span class="text-xs text-amber-600">No clasificado</span>';
    }
    const editButton = hasNoPatternMatch && !isInAggregation
      ? `<button type="button" class="edit-movement-category-btn px-2 py-1 text-xs bg-blue-600 text-white hover:bg-blue-700 border border-blue-600" data-hash="${movement.hash}">Editar</button>`
      : '';
    const canVerify = !isUnclassified && !isAlreadyLoaded;
    const checked = isVerified || isAlreadyLoaded;
    const row = document.createElement('div');
    row.className = `flex items-center justify-between gap-2 ${isInAggregation ? 'pl-6 py-1.5 border-l-2 border-gray-200' : ''}`;
    row.innerHTML = `
      <div class="flex items-center gap-3 flex-1">
        <input type="checkbox" ${checked ? 'checked' : ''} ${!canVerify ? 'disabled' : ''}
          class="bank-movement-checkbox w-4 h-4 text-blue-600 border-gray-300 rounded-none focus:ring-blue-500 ${canVerify ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}"
          data-hash="${movement.hash}"
          title="${isAlreadyLoaded ? 'Ya conciliado (cargado como transacción)' : canVerify ? '' : 'Clasifique el movimiento para poder verificarlo'}"
          onchange="${canVerify ? `window.toggleBankMovementVerification('${movement.hash}', this.checked)` : ''}">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-sm font-medium ${isIncome ? 'text-green-600' : 'text-red-600'}">
              ${isIncome ? '+' : '-'}${formatCurrency(Math.round(movement.amount))}
            </span>
            ${!isInAggregation && isAlreadyLoaded ? '<span class="inline-block px-2 py-0.5 text-xs font-medium rounded border border-gray-300 bg-gray-100 text-gray-700">Conciliado</span>' : ''}
            ${!isInAggregation && isVerified && !isAlreadyLoaded ? '<span class="text-xs text-green-600">✓ Verificado</span>' : ''}
            ${!isInAggregation ? categoryLabel : ''}
          </div>
          <div class="text-xs text-gray-600">
            <div class="${hasNoPatternMatch && !isInAggregation ? 'font-medium text-gray-800' : ''}">${escapeHtml(movement.description || 'Sin descripción')}</div>
            ${manualMapping?.notes ? `<div class="text-blue-600 mt-0.5">Nota: ${escapeHtml(manualMapping.notes)}</div>` : ''}
            <div>${formatDate24h(movement.date)}</div>
          </div>
        </div>
        ${!isInAggregation ? `<div>${editButton}</div>` : ''}
      </div>
    `;
    const editBtn = row.querySelector('.edit-movement-category-btn');
    if (editBtn) editBtn.addEventListener('click', () => showMovementCategoryModal(movement));
    return row;
  };

  let aggIndex = 0;
  const sections = [
    { label: 'CLASIFICADOS', headerClass: 'text-gray-800 border-gray-200', groups: classifiedGroups },
    { label: 'SIN CLASIFICAR', headerClass: 'text-amber-700 border-amber-200', groups: unclassifiedGroups }
  ];

  for (const sect of sections) {
    const sectionEl = document.createElement('div');
    sectionEl.className = 'mb-6';
    sectionEl.innerHTML = `<h4 class="text-base font-semibold uppercase tracking-wider mb-3 border-b-2 pb-2 ${sect.headerClass}">${escapeHtml(sect.label)}</h4>`;
    const sectionContainer = document.createElement('div');
    sectionContainer.className = 'space-y-4 mt-2';
    sectionEl.appendChild(sectionContainer);
    movementsList.appendChild(sectionEl);

    if (sect.groups.length === 0) {
      const emptyMsg = document.createElement('p');
      emptyMsg.className = 'text-sm text-gray-500 italic py-2';
      emptyMsg.textContent = sect.label === 'SIN CLASIFICAR'
        ? 'No hay movimientos sin clasificar. Los que no coincidan con ningún patrón de la cuenta aparecerán aquí.'
        : 'No hay movimientos clasificados';
      sectionContainer.appendChild(emptyMsg);
    }

    const isUnclassifiedSection = sect.label === 'SIN CLASIFICAR';

    for (const group of sect.groups) {
      const isAggregation = group.movements.length >= 2;
      const allVerified = group.movements.every(m => verifiedMovements.has(m.hash));
      const isIncome = group.type === 'income';
      const totalAmount = group.movements.reduce((sum, m) => sum + m.amount, 0);
      const categoryName = group.mapping ? (group.mapping.categoryName || categoriesMap[group.mapping.categoryId] || 'Categoría') : '';
      const classificationText = group.mapping
        ? (group.mapping.subcategory ? `${categoryName} → ${group.mapping.subcategory}` : categoryName)
        : 'Sin clasificar';

      if (isAggregation) {
        const groupKey = getReconciliationGroupKey(group);
        const isGroupLoaded = groupKey && loadedHashes.has(groupKey);
        const aggChecked = allVerified || isGroupLoaded;
        const card = document.createElement('div');
        card.className = `border border-gray-200 rounded-none p-3 mb-3 ${aggChecked ? 'bg-green-50' : 'bg-blue-50/50'}`;
        const aggId = `agg-${aggIndex++}`;
        const bodyId = `agg-body-${aggId}`;
        const maxDate = group.movements.length ? Math.max(...group.movements.map(m => m.date)) : null;
        const patternText = group.mapping?.descriptionPattern || (group.mapping ? 'Asignación manual' : '—');
        const aggCheckboxDisabled = isUnclassifiedSection || isGroupLoaded;
        card.innerHTML = `
          <div class="flex flex-wrap items-center gap-2 mb-1">
            <input type="checkbox" class="agg-mark-all-checkbox w-4 h-4 text-blue-600 border-gray-300 rounded-none focus:ring-blue-500 ${aggCheckboxDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}" ${aggChecked ? 'checked' : ''} ${aggCheckboxDisabled ? 'disabled' : ''} data-agg-id="${aggId}" title="${isGroupLoaded ? 'Ya conciliado (cargado como transacción)' : aggCheckboxDisabled ? 'Clasifique los movimientos para poder verificarlos' : 'Marcar todos'}">
            <span class="text-xs text-gray-500" title="Suma del grupo">∑</span>
            <span class="text-sm font-medium ${isIncome ? 'text-green-600' : 'text-red-600'}">
              ${isIncome ? '+' : '-'}${formatCurrency(Math.round(totalAmount))}
            </span>
            <span class="text-xs text-blue-600">${escapeHtml(classificationText)}</span>
            <span class="text-xs text-gray-500 ml-auto">${group.movements.length} movimientos agrupados</span>
            <button type="button" class="agg-toggle-btn text-xs text-blue-600 hover:text-blue-800 font-medium" data-agg-body="${bodyId}" data-agg-id="${aggId}" aria-expanded="false">
              Ver movimientos
            </button>
            ${isGroupLoaded ? '<span class="inline-block px-2 py-0.5 text-xs font-medium rounded border border-gray-300 bg-gray-100 text-gray-700">Conciliado</span>' : allVerified ? '<span class="text-xs text-green-600">✓ Todos verificados</span>' : ''}
          </div>
          <div class="text-xs text-gray-600 pl-6">
            <div class="font-medium text-gray-800">${escapeHtml(patternText)}</div>
            ${maxDate ? `<div>${formatDate24h(maxDate)}</div>` : ''}
          </div>
          <div id="${bodyId}" class="text-xs text-gray-600 space-y-0.5 hidden mt-1 pl-6" data-agg-id="${aggId}"></div>
        `;
        const cardBody = card.querySelector(`#${bodyId}`);
        group.movements.forEach(m => {
          cardBody.appendChild(renderSingleMovement(m, true, isUnclassifiedSection, loadedHashes.has(m.hash)));
        });
        if (isTransferGroup(group, categoriesMap)) {
          const groupKey = getReconciliationGroupKey(group);
          const transferRow = document.createElement('div');
          transferRow.className = 'mt-2 pt-2 border-t border-gray-200';
          transferRow.innerHTML = `
            <label class="block text-xs font-medium text-gray-700 mb-1">Cuenta contraria <span class="text-red-600">*</span></label>
            <select class="reconciliation-transfer-account w-full px-3 py-2 border border-gray-300 focus:outline-none focus:border-red-600 bg-white text-sm" data-group-key="${escapeHtml(groupKey)}">
              <option value="">-- Seleccione la cuenta contraria --</option>
              ${otherAccounts.map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name || a.id)}</option>`).join('')}
            </select>
            <p class="text-xs text-gray-500 mt-1">Requerido para registrar la transferencia entre cuentas.</p>
          `;
          const select = transferRow.querySelector('.reconciliation-transfer-account');
          select.value = transferAccountByGroupKey.get(groupKey) || '';
          select.addEventListener('change', () => {
            transferAccountByGroupKey.set(groupKey, select.value || '');
          });
          card.appendChild(transferRow);
        }
        const markAllCheckbox = card.querySelector('.agg-mark-all-checkbox');
        if (markAllCheckbox && !aggCheckboxDisabled) {
          markAllCheckbox.addEventListener('change', () => {
            const checked = markAllCheckbox.checked;
            group.movements.forEach(m => {
              if (checked) verifiedMovements.add(m.hash);
              else verifiedMovements.delete(m.hash);
            });
            renderBankMovements();
          });
        }
        const toggleBtn = card.querySelector('.agg-toggle-btn');
        if (toggleBtn) {
          toggleBtn.addEventListener('click', () => {
            const body = document.getElementById(bodyId);
            const isExpanded = body && !body.classList.contains('hidden');
            if (body) body.classList.toggle('hidden', isExpanded);
            if (toggleBtn) {
              toggleBtn.textContent = isExpanded ? 'Ver movimientos' : 'Ocultar movimientos';
              toggleBtn.setAttribute('aria-expanded', isExpanded ? 'false' : 'true');
            }
          });
        }
        sectionContainer.appendChild(card);
      } else {
        group.movements.forEach(movement => {
          const item = document.createElement('div');
          item.className = `border border-gray-200 rounded-none p-3 ${verifiedMovements.has(movement.hash) ? 'bg-green-50' : 'bg-white'}`;
          item.appendChild(renderSingleMovement(movement, false, isUnclassifiedSection, loadedHashes.has(movement.hash)));
          if (isTransferGroup(group, categoriesMap)) {
            const groupKey = getReconciliationGroupKey(group);
            const transferRow = document.createElement('div');
            transferRow.className = 'mt-2 pt-2 border-t border-gray-200';
            transferRow.innerHTML = `
              <label class="block text-xs font-medium text-gray-700 mb-1">Cuenta contraria <span class="text-red-600">*</span></label>
              <select class="reconciliation-transfer-account w-full px-3 py-2 border border-gray-300 focus:outline-none focus:border-red-600 bg-white text-sm" data-group-key="${escapeHtml(groupKey)}">
                <option value="">-- Seleccione la cuenta contraria --</option>
                ${otherAccounts.map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name || a.id)}</option>`).join('')}
              </select>
              <p class="text-xs text-gray-500 mt-1">Requerido para registrar la transferencia entre cuentas.</p>
            `;
            const select = transferRow.querySelector('.reconciliation-transfer-account');
            select.value = transferAccountByGroupKey.get(groupKey) || '';
            select.addEventListener('change', () => {
              transferAccountByGroupKey.set(groupKey, select.value || '');
            });
            item.appendChild(transferRow);
          }
          sectionContainer.appendChild(item);
        });
      }
    }
  }
  
  logger.info('Bank movements rendered', { 
    totalItemsAdded: movementsList.children.length,
    groupsProcessed: groups.length
  });
  
  // Mostrar botón de confirmar cuando haya al menos un movimiento verificado (confirmación parcial)
  if (confirmBtn) {
    const hasAnyVerified = bankMovements.length > 0 && bankMovements.some(m => verifiedMovements.has(m.hash));
    if (hasAnyVerified) {
      confirmBtn.classList.remove('hidden');
    } else {
      confirmBtn.classList.add('hidden');
    }
  }
}

// Toggle bank movement verification
window.toggleBankMovementVerification = function(hash, verified) {
  if (verified) {
    verifiedMovements.add(hash);
  } else {
    verifiedMovements.delete(hash);
  }
  
  // Re-render to update UI
  renderBankMovements();
  
  logger.debug('Bank movement verification toggled', { hash, verified, totalVerified: verifiedMovements.size });
};

// Show modal to assign category to movement (no pattern match)
async function showMovementCategoryModal(movement) {
  const modal = document.getElementById('movement-category-modal');
  const form = document.getElementById('movement-category-form');
  const hashInput = document.getElementById('movement-category-hash');
  const infoDiv = document.getElementById('movement-category-info');
  const categorySelect = document.getElementById('movement-category-select');
  
  if (!modal || !form || !hashInput) return;
  
  hashInput.value = movement.hash;
  
  const formatCurrency = window.formatCurrency || ((val) => `$${Math.round(val)}`);
  const formatDate24h = (timestamp) => {
    const d = new Date(timestamp);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };
  const isIncome = movement.type === 'income';
  
  infoDiv.innerHTML = `
    <div><strong>${isIncome ? '+' : '-'}${formatCurrency(Math.round(movement.amount))}</strong> - ${(movement.description || '').substring(0, 80)}${(movement.description || '').length > 80 ? '...' : ''}</div>
    <div class="text-xs mt-1">${formatDate24h(movement.date)}</div>
  `;
  
  await loadCategoriesForMovementModal(movement.type);
  const subcategoryInput = document.getElementById('movement-subcategory-input');
  if (subcategoryInput) subcategoryInput.value = '';
  
  const notesInput = document.getElementById('movement-notes-input');
  
  const manualMapping = manualMovementMappings.get(movement.hash);
  if (manualMapping) {
    categorySelect.value = manualMapping.categoryId || '';
    if (notesInput) notesInput.value = manualMapping.notes || '';
    if (manualMapping.categoryId) {
      await loadSubcategoriesForMovementModal(manualMapping.categoryId);
      if (subcategoryInput && manualMapping.subcategory) {
        subcategoryInput.value = manualMapping.subcategory;
      }
    }
  } else {
    form.reset();
    hashInput.value = movement.hash;
    if (subcategoryInput) subcategoryInput.value = '';
  }
  
  modal.classList.remove('hidden');
}

// Hide movement category modal
function hideMovementCategoryModal() {
  const modal = document.getElementById('movement-category-modal');
  if (modal) modal.classList.add('hidden');
  const autocompleteList = document.getElementById('movement-subcategory-autocomplete-list');
  if (autocompleteList) autocompleteList.classList.add('hidden');
}

// Load categories for movement modal (filtered by type)
async function loadCategoriesForMovementModal(movementType) {
  const select = document.getElementById('movement-category-select');
  if (!select) return;
  
  try {
    const nrd = window.nrd;
    if (!nrd) return;
    
    const categoriesArray = await nrd.categories.getAll();
    const categories = Array.isArray(categoriesArray) ? categoriesArray : Object.values(categoriesArray || {});
    
    select.innerHTML = '<option value="">-- Seleccione una categoría --</option>';
    const filtered = categories.filter(cat => cat && cat.id && cat.active !== false && cat.type === movementType);
    filtered.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      select.appendChild(opt);
    });
  } catch (error) {
    logger.error('Error loading categories for movement modal', error);
  }
}

// Subcategorías disponibles para el autocomplete del modal de movimiento (según categoría seleccionada)
let movementModalSubcategories = [];

async function loadSubcategoriesForMovementModal(categoryId) {
  movementModalSubcategories = [];
  if (!categoryId) return;
  
  try {
    const nrd = window.nrd;
    if (!nrd) return;
    
    const transactionsArray = await nrd.transactions.getAll();
    const transactions = Array.isArray(transactionsArray) 
      ? transactionsArray.reduce((acc, t) => { if (t && t.id) acc[t.id] = t; return acc; }, {})
      : transactionsArray || {};
    
    const subcategoriesSet = new Set();
    Object.values(transactions).forEach(tx => {
      if (tx.categoryId === categoryId && tx.description && tx.description.trim()) {
        subcategoriesSet.add(tx.description.trim());
      }
    });
    movementModalSubcategories = Array.from(subcategoriesSet).sort();
  } catch (error) {
    logger.error('Error loading subcategories for movement modal', error);
  }
}

function showMovementSubcategoryAutocomplete(inputValue) {
  const listEl = document.getElementById('movement-subcategory-autocomplete-list');
  const inputEl = document.getElementById('movement-subcategory-input');
  if (!listEl || !inputEl) return;
  
  const normalize = window.normalizeSearchText || window.NRDCommon?.normalizeSearchText || (t => (t || '').toLowerCase());
  const search = normalize(inputValue);
  const filtered = search
    ? movementModalSubcategories.filter(desc => normalize(desc).includes(search))
    : movementModalSubcategories.slice(0, 20);
  
  if (filtered.length === 0) {
    listEl.classList.add('hidden');
    listEl.innerHTML = '';
    return;
  }
  
  listEl.innerHTML = '';
  listEl.classList.remove('hidden');
  filtered.slice(0, 15).forEach(desc => {
    const item = document.createElement('div');
    item.className = 'px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm border-b border-gray-100 last:border-0';
    item.textContent = desc;
    item.addEventListener('click', () => {
      inputEl.value = desc;
      listEl.classList.add('hidden');
    });
    listEl.appendChild(item);
  });
}

// Setup movement category modal listeners
let movementCategoryModalListenersSetup = false;
function setupMovementCategoryModalListeners() {
  if (movementCategoryModalListenersSetup) return;
  movementCategoryModalListenersSetup = true;
  
  document.getElementById('cancel-movement-category-btn')?.addEventListener('click', hideMovementCategoryModal);
  
  document.getElementById('movement-category-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hashInput = document.getElementById('movement-category-hash');
    const categorySelect = document.getElementById('movement-category-select');
    const subcategoryInput = document.getElementById('movement-subcategory-input');
    const notesInput = document.getElementById('movement-notes-input');
    
    const hash = hashInput?.value;
    const categoryId = categorySelect?.value?.trim();
    if (!hash || !categoryId) {
      await window.NRDCommon?.showError?.('Seleccione una categoría');
      return;
    }
    
    const movement = bankMovements.find(m => m.hash === hash);
    if (!movement) return;
    
    const subcategory = subcategoryInput?.value?.trim() || undefined;
    const categoryName = categorySelect?.selectedOptions?.[0]?.textContent || undefined;
    const notes = notesInput?.value?.trim() || undefined;
    
    manualMovementMappings.set(hash, {
      categoryId,
      categoryName,
      subcategory,
      notes,
      type: movement.type
    });
    
    hideMovementCategoryModal();
    renderBankMovements();
    logger.debug('Manual movement category assigned', { hash, categoryId, subcategory });
  });
  
  document.getElementById('movement-category-select')?.addEventListener('change', async (e) => {
    const categoryId = e.target?.value;
    const subcategoryInput = document.getElementById('movement-subcategory-input');
    if (subcategoryInput) subcategoryInput.value = '';
    await loadSubcategoriesForMovementModal(categoryId);
  });

  const subcategoryInput = document.getElementById('movement-subcategory-input');
  const autocompleteList = document.getElementById('movement-subcategory-autocomplete-list');
  if (subcategoryInput) {
    subcategoryInput.addEventListener('focus', () => showMovementSubcategoryAutocomplete(subcategoryInput.value));
    subcategoryInput.addEventListener('input', (e) => showMovementSubcategoryAutocomplete(e.target.value));
    subcategoryInput.addEventListener('blur', () => {
      setTimeout(() => {
        if (autocompleteList) autocompleteList.classList.add('hidden');
      }, 200);
    });
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
  const accountTransactions = Object.values(reconciliationTransactions || {}).filter(tx => {
    const isReconciled = tx.reconciled === true || (tx.reconciledDate && tx.reconciledDate > 0);
    return tx.accountId === selectedReconciliationAccountId && 
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
  const escapeHtml = window.escapeHtml || ((text) => {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  });

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

  // Separate transactions into classified and unclassified
  const classifiedTransactions = [];
  const unclassifiedTransactions = [];

  // Get account to check if it has category mappings configured
  const account = selectedReconciliationAccountId ? reconciliationAccounts[selectedReconciliationAccountId] : null;
  const hasAccountMappings = account && account.categoryMapping && Array.isArray(account.categoryMapping) && account.categoryMapping.length > 0;

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
            <div class="flex items-center gap-2 mb-1 flex-wrap">
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
            <div class="flex items-center gap-2 mb-1 flex-wrap">
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

    const accountTransactions = Object.values(reconciliationTransactions || {}).filter(tx => {
      return tx.accountId === selectedReconciliationAccountId && 
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
    if (reconciliationAccounts[selectedReconciliationAccountId]) {
      await nrd.accounts.update(selectedReconciliationAccountId, {
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
    const accountTransactions = Object.values(reconciliationTransactions || {}).filter(tx => {
      return tx.accountId === selectedReconciliationAccountId;
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

  const amount = parseReconciliationAmount(amountStr);
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
      accountId: selectedReconciliationAccountId,
      accountName: reconciliationAccounts[selectedReconciliationAccountId]?.name || 'Sin nombre',
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

// Normalizar para comparar: quitar todos los espacios (así "SERV ZUREO" y "SERVZUREO" coinciden)
function normalizeForMatch(str) {
  return String(str || '').replace(/\s+/g, '').toUpperCase();
}

// Evalúa un solo patrón: *text* = contiene | *text = termina en | text* = empieza con
// Patrón solo asterisco(s) no clasifica: así los movimientos no quedan todos en "clasificados"
function descriptionMatchesOnePattern(description, onePattern) {
  if (!onePattern || !description) return false;
  const pat = onePattern.trim();
  if (!pat) return false;
  // No considerar patrón que es solo asterisco(s) como match (evita que todo quede clasificado)
  if (/^\*+$/.test(pat)) return false;
  const desc = String(description);
  const d = desc.toUpperCase();
  const dNorm = normalizeForMatch(desc);
  const p = pat.toUpperCase();
  if (pat.startsWith('*') && pat.endsWith('*') && pat.length > 1) {
    const middle = pat.slice(1, -1).trim();
    if (!middle) return false;
    return dNorm.includes(normalizeForMatch(middle));
  }
  if (pat.startsWith('*')) {
    const suffix = pat.slice(1).trim();
    if (!suffix) return false;
    return dNorm.endsWith(normalizeForMatch(suffix));
  }
  if (pat.endsWith('*')) {
    const prefix = pat.slice(0, -1).trim();
    if (!prefix) return false;
    return dNorm.startsWith(normalizeForMatch(prefix));
  }
  try {
    return new RegExp(pat, 'i').test(desc);
  } catch (e) {
    return dNorm.includes(normalizeForMatch(pat));
  }
}

// Varios patrones separados por coma (o salto de línea) = misma clasificación. Coincide si la descripción cumple alguno.
function descriptionMatchesPattern(description, patternStr) {
  if (!patternStr || !description) return false;
  const parts = String(patternStr).split(/[,\n]+/).map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return false;
  return parts.some(one => descriptionMatchesOnePattern(description, one));
}

// Check if movement matches any account pattern
function movementMatchesAccountPattern(movement, account) {
  if (!account.categoryMapping || !Array.isArray(account.categoryMapping)) return false;
  const sortedMappings = account.categoryMapping.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  for (const mapping of sortedMappings) {
    if (descriptionMatchesPattern(movement.description, mapping.descriptionPattern) && mapping.type === movement.type) {
      return true;
    }
  }
  return false;
}

// Get matching mapping for a movement (manual assignment or pattern matching)
function getMatchingMapping(movement, account) {
  // First check manual assignment
  const manualMapping = manualMovementMappings.get(movement.hash);
  if (manualMapping) {
    return manualMapping;
  }
  
  // Then try pattern matching
  if (account.categoryMapping && Array.isArray(account.categoryMapping)) {
    const sortedMappings = account.categoryMapping.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    for (const mapping of sortedMappings) {
      const matches = descriptionMatchesPattern(movement.description, mapping.descriptionPattern);

      if (matches) {
        logger.info('Pattern match found', {
          description: movement.description,
          pattern: mapping.descriptionPattern,
          movementType: movement.type,
          mappingType: mapping.type,
          typesMatch: mapping.type === movement.type,
          amount: movement.amount
        });
        
        // Check if types match
        if (mapping.type === movement.type) {
          logger.info('Pattern matched and types match, returning mapping', {
            description: movement.description,
            pattern: mapping.descriptionPattern
          });
          return mapping;
        } else {
          logger.warn('Pattern matched but types don\'t match, skipping', {
            description: movement.description,
            pattern: mapping.descriptionPattern,
            movementType: movement.type,
            mappingType: mapping.type,
            amount: movement.amount
          });
        }
      }
    }
  }
  return null;
}

// Group bank movements by matching mapping pattern
async function groupMovementsByMapping(movements, account, nrd) {
  const groups = [];
  const groupsByMappingKey = new Map();
  
  // Agrupar siempre por (categoría, tipo, subcategoría) para que coincida con la vista y no se dupliquen transacciones
  for (const movement of movements) {
    const matchingMapping = getMatchingMapping(movement, account);
    
    const mappingKey = matchingMapping
      ? `${matchingMapping.categoryId}_${matchingMapping.type}_${(matchingMapping.subcategory || '').trim()}`
      : `no-mapping_${movement.type}_${movement.hash}`;
    
    // Get or create group for this mapping key
    if (!groupsByMappingKey.has(mappingKey)) {
      const group = {
        mapping: matchingMapping,
        movements: [],
        type: movement.type
      };
      groupsByMappingKey.set(mappingKey, group);
      groups.push(group);
    }
    
    // Add movement to group
    groupsByMappingKey.get(mappingKey).movements.push(movement);
  }
  
  logger.debug('Grouped movements by mapping', { 
    totalMovements: movements.length,
    groupsCount: groups.length,
    groups: groups.map(g => ({
      mappingPattern: g.mapping?.descriptionPattern || 'no-mapping',
      movementsCount: g.movements.length,
      totalAmount: g.movements.reduce((sum, m) => sum + m.amount, 0)
    }))
  });
  
  return groups;
}

// Confirm bank reconciliation
async function confirmBankReconciliation() {
  if (isConfirmingReconciliation) {
    logger.warn('Reconciliation confirmation already in progress, ignoring duplicate call');
    return;
  }
  isConfirmingReconciliation = true;
  try {
    const nrd = window.nrd;
    if (!nrd) {
      await window.NRDCommon?.showError?.('Servicio NRD no disponible');
      return;
    }

    if (!selectedReconciliationAccountId) {
      await window.NRDCommon?.showError?.('Debe seleccionar una cuenta');
      return;
    }

    if (bankMovements.length === 0) {
      await window.NRDCommon?.showError?.('No hay movimientos bancarios para confirmar');
      return;
    }
    const movementsToProcess = bankMovements.filter(m => verifiedMovements.has(m.hash));
    if (movementsToProcess.length === 0) {
      await window.NRDCommon?.showError?.('Debe verificar al menos un movimiento para confirmar (puede ser parcial)');
      return;
    }
    
    const showSuccess = window.NRDCommon?.showSuccess || (async () => {});
    const showError = window.NRDCommon?.showError || (async () => {});
    
    showSpinner('Confirmando conciliación bancaria...');
    
    const account = reconciliationAccounts[selectedReconciliationAccountId];
    if (!account) {
      hideSpinner();
      await showError('Cuenta no encontrada');
      return;
    }
    
    const statementDateInput = document.getElementById('reconciliation-statement-date');
    if (!statementDateInput || !statementDateInput.value) {
      hideSpinner();
      await showError('Debe especificar la fecha del estado de cuenta');
      return;
    }
    
    const reconciliationDate = new Date(statementDateInput.value);
    reconciliationDate.setHours(23, 59, 59, 999);
    const reconciliationTimestamp = reconciliationDate.getTime();
    
    // Refrescar transacciones desde el servidor para evitar duplicados al confirmar varias veces
    // (reconciliationTransactions puede estar desactualizado si el listener no ha recibido los últimos cambios)
    let freshTransactionsList = [];
    try {
      const allTx = await nrd.transactions.getAll();
      freshTransactionsList = Array.isArray(allTx) ? allTx : Object.values(allTx || {});
      reconciliationTransactions = freshTransactionsList.reduce((acc, tx) => {
        if (tx && tx.id) acc[tx.id] = tx;
        return acc;
      }, {});
    } catch (e) {
      logger.warn('Could not refresh transactions for reconciliation, using in-memory snapshot', e);
    }
    
    // Get existing transactions for this account (siempre con datos frescos para evitar duplicados)
    const existingTransactions = (freshTransactionsList.length > 0 ? freshTransactionsList : Object.values(reconciliationTransactions || {}))
      .filter(tx => tx && tx.accountId === selectedReconciliationAccountId);
    
    // Create a map of existing transactions by hash (idHashBancario) para detectar ya conciliados
    const transactionsByHash = {};
    // Mapa inverso: hash individual de movimiento → transacción existente
    const transactionsByMovementHash = {};
    existingTransactions.forEach(tx => {
      if (tx.idHashBancario) {
        transactionsByHash[tx.idHashBancario] = tx;
      }
      // Indexar también por hashes individuales almacenados en bankMovementHashes
      if (Array.isArray(tx.bankMovementHashes)) {
        tx.bankMovementHashes.forEach(h => {
          transactionsByMovementHash[h] = tx;
        });
      }
    });
    
    // Group movements by matching mapping pattern (solo los verificados)
    const groupedMovements = await groupMovementsByMapping(movementsToProcess, account, nrd);

    const categoriesMapConfirm = {};
    try {
      const cats = await nrd.categories.getAll();
      (Array.isArray(cats) ? cats : Object.values(cats || {})).forEach(c => {
        if (c && c.id) categoriesMapConfirm[c.id] = c.name;
      });
    } catch (e) {
      logger.warn('Could not load categories for confirm', e);
    }

    for (const group of groupedMovements) {
      if (isTransferGroup(group, categoriesMapConfirm)) {
        const groupKey = getReconciliationGroupKey(group);
        const transferAccountId = transferAccountByGroupKey.get(groupKey);
        if (!transferAccountId) {
          hideSpinner();
          await showError('Hay movimientos clasificados como TRANSFERENCIAS. Debe seleccionar la cuenta contraria en cada uno para poder confirmar.');
          return;
        }
        const transferAccount = await nrd.accounts.getById(transferAccountId);
        if (!transferAccount || transferAccount.active === false) {
          hideSpinner();
          await showError('La cuenta contraria seleccionada en un grupo de transferencias no existe o está desactivada. Corrija y vuelva a confirmar.');
          return;
        }
      }
    }
    
    // Process grouped movements
    for (const group of groupedMovements) {
      if (group.movements.length === 0) continue;
      
      // Calculate total amount for the group
      const totalAmount = group.movements.reduce((sum, m) => sum + m.amount, 0);
      
      // Usar la fecha más reciente del grupo para registrar la transacción
      const latestDate = Math.max(...group.movements.map(m => m.date));
      
      // Create combined description
      // Respetar categoría y subcategoría mapeadas: usar subcategoría del mapeo si existe
      const descriptions = group.movements.map(m => m.description).filter((v, i, a) => a.indexOf(v) === i);
      const hasManualMapping = group.movements.some(m => manualMovementMappings.has(m.hash));
      const manualSubcategory = hasManualMapping
        ? group.movements.map(m => manualMovementMappings.get(m.hash)?.subcategory).filter(Boolean)[0]
        : null;
      const mappingSubcategory = (group.mapping && group.mapping.subcategory) ? String(group.mapping.subcategory).trim() : null;
      const subcategoryFromMapping = manualSubcategory || mappingSubcategory;
      
      const combinedDescription = subcategoryFromMapping
        ? subcategoryFromMapping
        : descriptions.length === 1
          ? descriptions[0]
          : `${descriptions[0]}${descriptions.length > 1 ? ` y ${descriptions.length - 1} más` : ''}`;
      
      // Collect notes from movements with manual mappings
      const movementNotes = group.movements
        .map(m => manualMovementMappings.get(m.hash)?.notes)
        .filter(Boolean);
      const combinedNotes = movementNotes.length > 0 
        ? movementNotes.join(' | ') 
        : (group.movements.length > 1 
            ? `Conciliación: ${group.movements.length} movimientos agrupados` 
            : undefined);
      
      // Generate combined hash for the group
      // Calculate credit and debit totals for the group
      const groupType = group.movements[0].type;
      const groupCredit = groupType === 'income' ? totalAmount : 0;
      const groupDebit = groupType === 'expense' ? totalAmount : 0;
      
      const groupHash = generateBankMovementHash(
        new Date(latestDate), 
        groupType,
        groupCredit,
        groupDebit,
        combinedDescription
      );
      // Un solo movimiento: usar su hash para poder comparar transacción ↔ movimiento (idHashBancario)
      const idHashBancario = group.movements.length === 1 ? group.movements[0].hash : groupHash;
      let existingTx = transactionsByHash[idHashBancario] || (group.movements.length === 1 ? transactionsByHash[groupHash] : null);
      // Buscar por hashes individuales de movimientos: detecta transacciones previas aunque el agrupamiento haya cambiado
      if (!existingTx) {
        for (const m of group.movements) {
          existingTx = transactionsByMovementHash[m.hash] || transactionsByHash[m.hash];
          if (existingTx) {
            logger.debug('Found existing transaction via individual movement hash', { movementHash: m.hash, txId: existingTx.id });
            break;
          }
        }
      }
      // Consulta directa por hash: evita duplicados si getAll() del inicio aún no incluye lo recién guardado
      if (!existingTx && idHashBancario && typeof nrd.transactions.queryByChild === 'function') {
        try {
          const byHash = await nrd.transactions.queryByChild('idHashBancario', idHashBancario);
          existingTx = (byHash || []).find(tx => tx.accountId === selectedReconciliationAccountId) || null;
          if (existingTx) {
            transactionsByHash[idHashBancario] = existingTx;
          }
        } catch (e) {
          logger.warn('queryByChild idHashBancario failed', e);
        }
      }
      
      // Hashes individuales de todos los movimientos del grupo (para detección de duplicados en futuras conciliaciones)
      const movementHashes = group.movements.map(m => m.hash);

      if (existingTx) {
        const updateData = {
          idHashBancario: idHashBancario,
          bankMovementHashes: movementHashes,
          reconciled: true,
          reconciledDate: reconciliationTimestamp,
          amount: totalAmount,
          date: latestDate,
          description: combinedDescription,
          type: group.movements[0].type
        };
        if (combinedNotes) updateData.notes = combinedNotes;
        if (group.mapping && group.mapping.categoryId) {
          updateData.categoryId = group.mapping.categoryId;
          const cat = await nrd.categories.getById(group.mapping.categoryId);
          if (cat) updateData.categoryName = cat.name;
        }
        await nrd.transactions.update(existingTx.id, updateData);
        transactionsByHash[idHashBancario] = { ...existingTx, ...updateData, id: existingTx.id };
        // Actualizar índice inverso con los nuevos hashes individuales
        movementHashes.forEach(h => { transactionsByMovementHash[h] = transactionsByHash[idHashBancario]; });
        logger.debug('Updated transaction with bank hash', { 
          transactionId: existingTx.id, 
          idHashBancario,
          movementsCount: group.movements.length
        });
      } else {
        // Try to match with existing transaction by amount and date (within 3 days)
        const matchingTx = existingTransactions.find(tx => {
          if (!tx.idHashBancario && tx.accountId === selectedReconciliationAccountId) {
            const txDate = tx.date || tx.createdAt || 0;
            const dateDiff = Math.abs(txDate - latestDate);
            const threeDays = 3 * 24 * 60 * 60 * 1000;
            const amountMatch = Math.abs((tx.amount || 0) - totalAmount) < 0.01;
            return amountMatch && dateDiff < threeDays;
          }
          return false;
        });
        
        if (matchingTx) {
          const matchUpdateData = {
            idHashBancario: idHashBancario,
            bankMovementHashes: movementHashes,
            reconciled: true,
            reconciledDate: reconciliationTimestamp,
            amount: totalAmount,
            date: latestDate,
            description: combinedDescription,
            type: group.movements[0].type
          };
          if (combinedNotes) matchUpdateData.notes = combinedNotes;
          if (group.mapping && group.mapping.categoryId) {
            matchUpdateData.categoryId = group.mapping.categoryId;
            const cat = await nrd.categories.getById(group.mapping.categoryId);
            if (cat) matchUpdateData.categoryName = cat.name;
          }
          await nrd.transactions.update(matchingTx.id, matchUpdateData);
          transactionsByHash[idHashBancario] = { ...matchingTx, ...matchUpdateData, id: matchingTx.id };
          movementHashes.forEach(h => { transactionsByMovementHash[h] = transactionsByHash[idHashBancario]; });
          logger.debug('Matched and updated transaction with bank hash', { 
            transactionId: matchingTx.id, 
            idHashBancario,
            movementsCount: group.movements.length
          });
        } else {
          // Assign category if there's a mapping (manual or pattern)
          let categoryId = null;
          let categoryName = null;
          
          if (group.mapping) {
            // Use mapping (can be manual or pattern)
            categoryId = group.mapping.categoryId || null;
            
            if (categoryId) {
              const category = await nrd.categories.getById(categoryId);
              if (category) {
                categoryName = category.name;
              }
            }
          }
          
          const isTransfer = isTransferGroup(group, categoriesMapConfirm);
          const transferAccountIdForGroup = isTransfer ? transferAccountByGroupKey.get(getReconciliationGroupKey(group)) : null;

          if (isTransfer && transferAccountIdForGroup) {
            const transferAccount = await nrd.accounts.getById(transferAccountIdForGroup);
            if (transferAccount) {
              const expenseTransactionData = {
                type: 'expense',
                accountId: selectedReconciliationAccountId,
                accountName: account.name,
                amount: totalAmount,
                categoryId: categoryId,
                categoryName: categoryName,
                description: combinedDescription,
                date: latestDate,
                idHashBancario: idHashBancario,
                bankMovementHashes: movementHashes,
                reconciled: true,
                reconciledDate: reconciliationTimestamp,
                createdAt: Date.now()
              };
              if (combinedNotes) expenseTransactionData.notes = combinedNotes;
              const incomeTransactionData = {
                type: 'income',
                accountId: transferAccount.id,
                accountName: transferAccount.name,
                amount: totalAmount,
                categoryId: categoryId,
                categoryName: categoryName,
                description: combinedDescription,
                date: latestDate,
                bankMovementHashes: movementHashes,
                reconciled: true,
                reconciledDate: reconciliationTimestamp,
                createdAt: Date.now()
              };
              if (combinedNotes) incomeTransactionData.notes = combinedNotes;
              const expenseId = await nrd.transactions.create(expenseTransactionData);
              await nrd.transactions.create(incomeTransactionData);
              transactionsByHash[idHashBancario] = { id: expenseId, ...expenseTransactionData };
              movementHashes.forEach(h => { transactionsByMovementHash[h] = transactionsByHash[idHashBancario]; });
              logger.debug('Created transfer pair from bank movements', {
                idHashBancario,
                movementsCount: group.movements.length,
                totalAmount,
                fromAccount: selectedReconciliationAccountId,
                toAccount: transferAccount.id
              });
            } else {
              const fallbackPayload = {
                type: group.movements[0].type,
                accountId: selectedReconciliationAccountId,
                accountName: account.name,
                amount: totalAmount,
                categoryId: categoryId,
                categoryName: categoryName,
                description: combinedDescription,
                date: latestDate,
                idHashBancario: idHashBancario,
                bankMovementHashes: movementHashes,
                reconciled: true,
                reconciledDate: reconciliationTimestamp,
                createdAt: Date.now(),
                ...(combinedNotes && { notes: combinedNotes })
              };
              const newIdFallback = await nrd.transactions.create(fallbackPayload);
              transactionsByHash[idHashBancario] = { id: newIdFallback, ...fallbackPayload };
              movementHashes.forEach(h => { transactionsByMovementHash[h] = transactionsByHash[idHashBancario]; });
            }
          } else {
            const newTransaction = {
              type: group.movements[0].type,
              accountId: selectedReconciliationAccountId,
              accountName: account.name,
              amount: totalAmount,
              categoryId: categoryId,
              categoryName: categoryName,
              description: combinedDescription,
              date: latestDate,
              idHashBancario: idHashBancario,
              bankMovementHashes: movementHashes,
              reconciled: true,
              reconciledDate: reconciliationTimestamp,
              createdAt: Date.now()
            };
            if (combinedNotes) newTransaction.notes = combinedNotes;
            const newId = await nrd.transactions.create(newTransaction);
            transactionsByHash[idHashBancario] = { id: newId, ...newTransaction };
            movementHashes.forEach(h => { transactionsByMovementHash[h] = transactionsByHash[idHashBancario]; });
          }
          logger.debug('Created new transaction from bank movements', {
            idHashBancario,
            movementsCount: group.movements.length,
            totalAmount,
            hasCategory: !!categoryId,
            isTransfer: !!isTransfer
          });
        }
      }
    }
    
    await nrd.accounts.update(selectedReconciliationAccountId, {
      lastReconciliationDate: reconciliationTimestamp,
      lastBankBalance: currentBankBalance
    });
    
    const processedHashes = new Set(movementsToProcess.map(m => m.hash));
    bankMovements = bankMovements.filter(m => !processedHashes.has(m.hash));
    processedHashes.forEach(h => {
      verifiedMovements.delete(h);
      manualMovementMappings.delete(h);
    });
    groupedMovements.forEach(g => transferAccountByGroupKey.delete(getReconciliationGroupKey(g)));
    
    if (bankMovements.length === 0) {
      const movementsSection = document.getElementById('bank-movements-section');
      if (movementsSection) movementsSection.classList.add('hidden');
    } else {
      renderBankMovements();
    }
    
    hideSpinner();
    const totalGroups = groupedMovements.length;
    const totalMovements = movementsToProcess.length;
    await showSuccess(`Confirmación parcial: ${totalMovements} movimiento(s) en ${totalGroups} transacción(es).${bankMovements.length > 0 ? ` Quedan ${bankMovements.length} movimiento(s) pendientes.` : ''}`);
    
    // Reload reconciliation data
    await loadReconciliationData();
    if (selectedReconciliationAccountId) {
      await loadAccountReconciliation();
      await renderReconciliation();
    }
    
  } catch (error) {
    logger.error('Error confirming bank reconciliation', error);
    const showError = window.NRDCommon?.showError || (async () => {});
    hideSpinner();
    await showError(error.message || 'Error al confirmar conciliación bancaria');
  } finally {
    isConfirmingReconciliation = false;
  }
}

// Hide reconciliation sections (e.g. when changing account to reconcile)
function hideReconciliationSections() {
  const sections = [
    'reconciliation-statement-card',
    'reconciliation-summary',
    'reconciliation-transactions-section',
    'reconciliation-adjustments-section',
    'bank-movements-section'
  ];
  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}

// Helper function for parsing amounts
function parseReconciliationAmount(amountStr) {
  if (!amountStr) return 0;
  return parseFloat(amountStr.replace(/\./g, '').replace(',', '.')) || 0;
}

// Category Mapping Management
let categoryMappings = [];

// Toggle category mapping section visibility
function toggleCategoryMappingSection(show) {
  const section = document.getElementById('account-category-mapping-section');
  if (section) {
    if (show) {
      section.classList.remove('hidden');
    } else {
      section.classList.add('hidden');
    }
  }
  // Procesador de estado está dentro de account-category-mapping-section; al desmarcar cuenta bancaria limpiamos el select
  const processorSelect = document.getElementById('account-statement-processor');
  if (!show && processorSelect) processorSelect.value = '';
}

// Load category mappings into UI
function loadCategoryMappings(mappings) {
  categoryMappings = Array.isArray(mappings) ? [...mappings] : [];
  renderCategoryMappings();
}

// Get current category mappings from UI
function getCategoryMappings() {
  return categoryMappings;
}

// Render category mappings list
async function renderCategoryMappings() {
  const container = document.getElementById('account-category-mappings-list');
  if (!container) return;
  
  const escapeHtml = window.escapeHtml || ((text) => {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  });
  
  // Check if we're in view mode
  const form = document.getElementById('account-form');
  const isViewMode = form && form.dataset.viewMode === 'view';
  
  container.innerHTML = '';
  
  if (categoryMappings.length === 0) {
    container.innerHTML = '<p class="text-xs text-gray-500 text-center py-2">No hay mapeos configurados</p>';
    return;
  }
  
  // Load categories for display
  const categoriesArray = await nrd.categories.getAll();
  const categories = Array.isArray(categoriesArray) 
    ? categoriesArray.reduce((acc, cat) => {
        if (cat && cat.id) acc[cat.id] = cat;
        return acc;
      }, {})
    : {};
  
  categoryMappings.forEach((mapping, index) => {
    const category = categories[mapping.categoryId];
    const categoryName = category ? category.name : 'Sin categoría';
    const typeLabel = mapping.type === 'income' ? 'Ingreso' : 'Egreso';
    
    const item = document.createElement('div');
    item.className = 'border border-gray-200 rounded-none p-2 flex items-start justify-between gap-2';
    
    // Only show edit/delete buttons if not in view mode
    const actionButtons = isViewMode ? '' : `
      <div class="flex gap-1">
        <button type="button" class="edit-mapping-btn px-2 py-1 text-xs bg-blue-600 text-white hover:bg-blue-700" data-index="${index}">
          Editar
        </button>
        <button type="button" class="delete-mapping-btn px-2 py-1 text-xs bg-red-600 text-white hover:bg-red-700" data-index="${index}">
          Eliminar
        </button>
      </div>
    `;
    
    item.innerHTML = `
      <div class="flex-1">
        <div class="text-xs font-medium text-gray-700">${escapeHtml(mapping.descriptionPattern)}</div>
        <div class="text-xs text-gray-500 mt-1">
          ${typeLabel} → ${escapeHtml(categoryName)}${mapping.subcategory ? ` → ${escapeHtml(mapping.subcategory)}` : ''}
        </div>
        <div class="text-xs text-gray-400 mt-0.5">${mapping.sumatoria !== false ? 'Sumatoria (una transacción por grupo)' : 'Una transacción por movimiento'}</div>
      </div>
      ${actionButtons}
    `;
    
    // Add event listeners only if not in view mode
    if (!isViewMode) {
      const editBtn = item.querySelector('.edit-mapping-btn');
      const deleteBtn = item.querySelector('.delete-mapping-btn');
      if (editBtn) editBtn.addEventListener('click', () => editCategoryMapping(index));
      if (deleteBtn) deleteBtn.addEventListener('click', () => deleteCategoryMapping(index));
    }
    
    container.appendChild(item);
  });
}

// Show category mapping modal
async function showCategoryMappingModal(index = null) {
  logger.debug('showCategoryMappingModal called', { index });
  const modal = document.getElementById('category-mapping-modal');
  const title = document.getElementById('category-mapping-modal-title');
  const form = document.getElementById('category-mapping-form');
  const indexInput = document.getElementById('category-mapping-index');
  
  if (!modal) {
    logger.error('Category mapping modal not found');
    await window.NRDCommon?.showError?.('Modal no encontrado');
    return;
  }
  
  if (!form) {
    logger.error('Category mapping form not found');
    await window.NRDCommon?.showError?.('Formulario no encontrado');
    return;
  }
  
  if (index !== null && categoryMappings[index]) {
    // Edit mode: establecer tipo y patrón primero para que loadCategoriesForMapping cargue las categorías correctas
    const mapping = categoryMappings[index];
    if (title) title.textContent = 'Editar Mapeo';
    if (indexInput) indexInput.value = index;
    document.getElementById('category-mapping-pattern').value = mapping.descriptionPattern || '';
    document.getElementById('category-mapping-type').value = mapping.type || 'expense';
    const catSelect = document.getElementById('category-mapping-category');
    const subcategoryInput = document.getElementById('category-mapping-subcategory-input');
    const autocompleteList = document.getElementById('category-mapping-subcategory-autocomplete-list');
    await loadCategoriesForMapping();
    if (catSelect && mapping.categoryId) {
      catSelect.value = mapping.categoryId;
      await loadSubcategoriesForMapping(mapping.categoryId);
    }
    if (subcategoryInput) subcategoryInput.value = mapping.subcategory || '';
    if (autocompleteList) autocompleteList.classList.add('hidden');
    const sumatoriaCheck = document.getElementById('category-mapping-sumatoria');
    if (sumatoriaCheck) sumatoriaCheck.checked = mapping.sumatoria !== false;
  } else {
    if (title) title.textContent = 'Nuevo Mapeo';
    if (indexInput) indexInput.value = '';
    form.reset();
    const sumatoriaCheck = document.getElementById('category-mapping-sumatoria');
    if (sumatoriaCheck) sumatoriaCheck.checked = true;
    await loadCategoriesForMapping();
    const subcategoryInput = document.getElementById('category-mapping-subcategory-input');
    if (subcategoryInput) subcategoryInput.value = '';
    const autocompleteList = document.getElementById('category-mapping-subcategory-autocomplete-list');
    if (autocompleteList) autocompleteList.classList.add('hidden');
  }
  modal.classList.remove('hidden');
}

function hideCategoryMappingModal() {
  const modal = document.getElementById('category-mapping-modal');
  if (modal) modal.classList.add('hidden');
  const autocompleteList = document.getElementById('category-mapping-subcategory-autocomplete-list');
  if (autocompleteList) autocompleteList.classList.add('hidden');
}

// Load categories for mapping select
async function loadCategoriesForMapping() {
  const select = document.getElementById('category-mapping-category');
  const typeSelect = document.getElementById('category-mapping-type');
  if (!select) return;
  
  try {
    const selectedType = typeSelect ? typeSelect.value : null;
    const categoriesArray = await nrd.categories.getAll();
    const categories = Array.isArray(categoriesArray) ? categoriesArray : Object.values(categoriesArray || {});
    
    select.innerHTML = '<option value="">-- Seleccione una categoría --</option>';
    
    // Filter by type if type is selected
    const filteredCategories = selectedType 
      ? categories.filter(cat => cat && cat.id && cat.active !== false && cat.type === selectedType)
      : categories.filter(cat => cat && cat.id && cat.active !== false);
    
    filteredCategories.forEach(category => {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = `${category.name} (${category.type === 'income' ? 'Ingreso' : 'Egreso'})`;
      select.appendChild(option);
    });
  } catch (error) {
    logger.error('Error loading categories for mapping', error);
  }
}

let mappingModalSubcategories = [];

async function loadSubcategoriesForMapping(categoryId) {
  logger.debug('loadSubcategoriesForMapping called', { categoryId });
  if (!categoryId) {
    mappingModalSubcategories = [];
    return;
  }
  try {
    const nrd = window.nrd;
    if (!nrd) return;
    const transactionsArray = await nrd.transactions.getAll();
    const transactions = Array.isArray(transactionsArray)
      ? transactionsArray.reduce((acc, t) => { if (t && t.id) acc[t.id] = t; return acc; }, {})
      : transactionsArray || {};
    const subcategoriesSet = new Set();
    Object.values(transactions).forEach(t => {
      if (t.categoryId === categoryId && t.description && t.description.trim())
        subcategoriesSet.add(t.description.trim());
    });
    mappingModalSubcategories = Array.from(subcategoriesSet).sort();
    logger.debug('Subcategories loaded for mapping', { categoryId, count: mappingModalSubcategories.length });
  } catch (error) {
    logger.error('Error loading subcategories for mapping', error);
    mappingModalSubcategories = [];
  }
}

function showMappingSubcategoryAutocomplete(inputValue) {
  const listEl = document.getElementById('category-mapping-subcategory-autocomplete-list');
  const inputEl = document.getElementById('category-mapping-subcategory-input');
  if (!listEl || !inputEl) return;
  const normalize = window.normalizeSearchText || window.NRDCommon?.normalizeSearchText || (t => (t || '').toLowerCase());
  const search = normalize(inputValue);
  const filtered = search
    ? mappingModalSubcategories.filter(desc => normalize(desc).includes(search))
    : mappingModalSubcategories.slice(0, 20);
  if (filtered.length === 0) {
    listEl.classList.add('hidden');
    listEl.innerHTML = '';
    return;
  }
  listEl.innerHTML = '';
  listEl.classList.remove('hidden');
  filtered.slice(0, 15).forEach(desc => {
    const item = document.createElement('div');
    item.className = 'px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm border-b border-gray-100 last:border-0';
    item.textContent = desc;
    item.addEventListener('click', () => {
      inputEl.value = desc;
      listEl.classList.add('hidden');
    });
    listEl.appendChild(item);
  });
}

// Add new category mapping
function addCategoryMapping() {
  logger.debug('addCategoryMapping called');
  showCategoryMappingModal();
}

// Edit category mapping
function editCategoryMapping(index) {
  showCategoryMappingModal(index);
}

// Delete category mapping
function deleteCategoryMapping(index) {
  if (index >= 0 && index < categoryMappings.length) {
    categoryMappings.splice(index, 1);
    renderCategoryMappings();
  }
}

// Save category mapping from form
function saveCategoryMapping(mappingData) {
  const indexInput = document.getElementById('category-mapping-index');
  const index = indexInput && indexInput.value !== '' ? parseInt(indexInput.value, 10) : null;
  
  if (index !== null && index >= 0 && index < categoryMappings.length) {
    // Update existing
    categoryMappings[index] = mappingData;
  } else {
    // Add new
    categoryMappings.push(mappingData);
  }
  
  renderCategoryMappings();
  hideCategoryMappingModal();
}

// Flag to ensure listeners are only set up once
let categoryMappingListenersSetup = false;

// Setup event listeners for category mapping using event delegation
function setupCategoryMappingListeners() {
  if (categoryMappingListenersSetup) return;
  categoryMappingListenersSetup = true;
  
  // Use event delegation for all buttons (works even if created dynamically)
  document.addEventListener('click', (e) => {
    // Add mapping button
    if (e.target && e.target.id === 'add-category-mapping-btn') {
      e.preventDefault();
      e.stopPropagation();
      logger.debug('Add category mapping button clicked');
      addCategoryMapping();
      return;
    }
    
    // Cancel button
    if (e.target && e.target.id === 'cancel-category-mapping-btn') {
      e.preventDefault();
      e.stopPropagation();
      hideCategoryMappingModal();
      return;
    }
  });
  
  // Use event delegation for select changes
  document.addEventListener('change', async (e) => {
    if (e.target && e.target.id === 'category-mapping-category') {
      const categoryId = e.target.value;
      await loadSubcategoriesForMapping(categoryId);
      const subcatInput = document.getElementById('category-mapping-subcategory-input');
      if (subcatInput) subcatInput.value = '';
      const autocompleteList = document.getElementById('category-mapping-subcategory-autocomplete-list');
      if (autocompleteList) autocompleteList.classList.add('hidden');
      return;
    }
    if (e.target && e.target.id === 'category-mapping-type') {
      const catSelect = document.getElementById('category-mapping-category');
      const subcatInput = document.getElementById('category-mapping-subcategory-input');
      const autocompleteList = document.getElementById('category-mapping-subcategory-autocomplete-list');
      if (catSelect) catSelect.value = '';
      if (subcatInput) subcatInput.value = '';
      if (autocompleteList) autocompleteList.classList.add('hidden');
      mappingModalSubcategories = [];
      await loadCategoriesForMapping();
      return;
    }
  });

  // Subcategory input autocomplete (focus / input / blur)
  document.addEventListener('focus', (e) => {
    if (e.target && e.target.id === 'category-mapping-subcategory-input') {
      showMappingSubcategoryAutocomplete(e.target.value);
    }
  }, true);
  document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'category-mapping-subcategory-input') {
      showMappingSubcategoryAutocomplete(e.target.value);
    }
  });
  document.addEventListener('blur', (e) => {
    if (e.target && e.target.id === 'category-mapping-subcategory-input') {
      const listEl = document.getElementById('category-mapping-subcategory-autocomplete-list');
      if (listEl) setTimeout(() => listEl.classList.add('hidden'), 200);
    }
  }, true);
  
  // Checkbox to toggle section - setup when available
  function setupCheckboxListener() {
    const checkbox = document.getElementById('account-is-bank-account');
    if (checkbox && !checkbox.dataset.listenerAdded) {
      checkbox.dataset.listenerAdded = 'true';
      checkbox.addEventListener('change', (e) => {
        toggleCategoryMappingSection(e.target.checked);
        if (!e.target.checked) {
          categoryMappings = [];
          renderCategoryMappings();
        }
      });
    }
  }
  
  // Try to setup checkbox listener immediately
  setupCheckboxListener();
  
  // Also try when form is shown (via mutation observer or timeout)
  const observer = new MutationObserver(() => {
    setupCheckboxListener();
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Form submit (static, can be set up once)
  const form = document.getElementById('category-mapping-form');
  if (form && !form.dataset.listenerAdded) {
    form.dataset.listenerAdded = 'true';
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const pattern = document.getElementById('category-mapping-pattern').value.trim();
      const type = document.getElementById('category-mapping-type').value;
      const categoryId = document.getElementById('category-mapping-category').value;
      const subcategoryInput = document.getElementById('category-mapping-subcategory-input');
      const subcategory = subcategoryInput ? subcategoryInput.value.trim() : '';
      
      if (!pattern || !type || !categoryId) {
        await window.NRDCommon?.showError?.('Por favor complete todos los campos requeridos');
        return;
      }
      
      const sumatoriaCheck = document.getElementById('category-mapping-sumatoria');
      const sumatoria = sumatoriaCheck ? sumatoriaCheck.checked : true;
      const mappingData = {
        descriptionPattern: pattern,
        type: type,
        categoryId: categoryId,
        subcategory: subcategory || undefined,
        sumatoria: sumatoria
      };
      
      saveCategoryMapping(mappingData);
    });
  }
}

// Initialize category mapping listeners when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupCategoryMappingListeners);
} else {
  setupCategoryMappingListeners();
}

// Make functions available globally
window.loadAccounts = loadAccounts;
window.hideAccountForm = hideAccountForm;
window.loadAccountsForTransaction = loadAccountsForTransaction;
window.initializeReconciliation = initializeReconciliation;
