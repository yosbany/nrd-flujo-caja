// Account management

let accountsListener = null;

// Default accounts
const defaultAccounts = [
  'EFECTIVO',
  'DÉBITO SANTANDER',
  'CRÉDITO VISA SANTANDER',
  'MERCADO PAGO'
];

// Load accounts
function loadAccounts() {
  const accountsList = document.getElementById('accounts-list');
  if (!accountsList) return;
  
  accountsList.innerHTML = '';

  // Remove previous listener
  if (accountsListener) {
    getAccountsRef().off('value', accountsListener);
    accountsListener = null;
  }

  // Listen for accounts and transactions
  accountsListener = getAccountsRef().on('value', async (snapshot) => {
    if (!accountsList) return;
    accountsList.innerHTML = '';
    const accounts = snapshot.val() || {};

    if (Object.keys(accounts).length === 0) {
      // Initialize default accounts if none exist
      initializeDefaultAccounts();
      return;
    }

    // Get all transactions to calculate balances
    const transactionsSnapshot = await getTransactionsRef().once('value');
    const transactions = transactionsSnapshot.val() || {};
    
    // Calculate balance per account (income - expense)
    const accountBalances = {};
    Object.values(transactions).forEach(transaction => {
      if (transaction && transaction.accountId) {
        const accountId = transaction.accountId;
        if (!accountBalances[accountId]) {
          accountBalances[accountId] = 0;
        }
        const amount = parseFloat(transaction.amount) || 0;
        if (transaction.type === 'income') {
          accountBalances[accountId] += amount;
        } else {
          accountBalances[accountId] -= amount;
        }
      }
    });

    Object.entries(accounts).forEach(([id, account]) => {
      const item = document.createElement('div');
      const isActive = account.active !== false; // Default to true if not set
      const opacityClass = isActive ? '' : 'opacity-50';
      item.className = `border border-gray-200 p-3 sm:p-4 md:p-6 hover:border-red-600 transition-colors cursor-pointer mb-2 sm:mb-3 ${opacityClass}`;
      item.dataset.accountId = id;
      const balance = accountBalances[id] || 0;
      const formattedBalance = new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'UYU' }).format(balance);
      const balanceColor = balance >= 0 ? 'text-green-600' : 'text-red-600';
      const statusText = isActive ? '' : ' (Desactivada)';
      item.innerHTML = `
        <div class="flex justify-between items-center">
          <div class="text-base sm:text-lg font-light">${escapeHtml(account.name)}${statusText}</div>
          <div class="text-sm sm:text-base font-light ${balanceColor}">${formattedBalance}</div>
        </div>
      `;
      item.addEventListener('click', () => viewAccount(id));
      accountsList.appendChild(item);
    });
  });
}

// Initialize default accounts
async function initializeDefaultAccounts() {
  showSpinner('Inicializando cuentas...');
  try {
    for (const accountName of defaultAccounts) {
      await createAccount({ name: accountName });
    }
    hideSpinner();
  } catch (error) {
    hideSpinner();
    console.error('Error initializing accounts:', error);
    await showError('Error al inicializar cuentas: ' + error.message);
  }
}

// Show account form
function showAccountForm(accountId = null) {
  const form = document.getElementById('account-form');
  const list = document.getElementById('accounts-list');
  const header = document.querySelector('#accounts-view .flex.flex-col');
  const title = document.getElementById('account-form-title');
  const formElement = document.getElementById('account-form-element');
  
  if (form) form.classList.remove('hidden');
  if (list) list.style.display = 'none';
  if (header) header.style.display = 'none';
  
  if (formElement) {
    formElement.reset();
    const accountIdInput = document.getElementById('account-id');
    if (accountIdInput) accountIdInput.value = accountId || '';
  }

  if (accountId) {
    if (title) title.textContent = 'Ver Cuenta';
    // Set to view mode
    form.dataset.viewMode = 'view';
    
    // Update button visibility - show edit, delete, toggle active, close buttons
    const deleteBtn = document.getElementById('delete-account-form-btn');
    const editBtn = document.getElementById('edit-account-form-btn');
    const toggleActiveBtn = document.getElementById('toggle-account-active-btn');
    const closeBtn = document.getElementById('close-account-form-btn');
    const saveBtn = document.getElementById('save-account-form-btn');
    if (deleteBtn) deleteBtn.style.display = 'flex';
    if (editBtn) editBtn.style.display = 'flex';
    if (closeBtn) closeBtn.style.display = 'flex';
    if (saveBtn) saveBtn.style.display = 'none';
    
    // Make field readonly
    const nameInput = document.getElementById('account-name');
    if (nameInput) {
      nameInput.setAttribute('readonly', 'readonly');
      nameInput.setAttribute('disabled', 'disabled');
    }
    
    getAccount(accountId).then(snapshot => {
      const account = snapshot.val();
      if (account) {
        if (nameInput) nameInput.value = account.name || '';
        
        // Update toggle active button
        const isActive = account.active !== false;
        if (toggleActiveBtn) {
          toggleActiveBtn.style.display = 'flex';
          toggleActiveBtn.textContent = isActive ? 'Desactivar' : 'Activar';
          toggleActiveBtn.className = isActive 
            ? 'flex-1 px-4 sm:px-6 py-2 bg-yellow-600 text-white border border-yellow-600 hover:bg-yellow-700 transition-colors uppercase tracking-wider text-xs sm:text-sm font-light'
            : 'flex-1 px-4 sm:px-6 py-2 bg-green-600 text-white border border-green-600 hover:bg-green-700 transition-colors uppercase tracking-wider text-xs sm:text-sm font-light';
        }
      }
    });
  } else {
    if (title) title.textContent = 'Nueva Cuenta';
    delete form.dataset.viewMode;
    
    // Update button visibility - hide edit/delete/toggle, show save/close
    const deleteBtn = document.getElementById('delete-account-form-btn');
    const editBtn = document.getElementById('edit-account-form-btn');
    const toggleActiveBtn = document.getElementById('toggle-account-active-btn');
    const closeBtn = document.getElementById('close-account-form-btn');
    const saveBtn = document.getElementById('save-account-form-btn');
    if (deleteBtn) deleteBtn.style.display = 'none';
    if (editBtn) editBtn.style.display = 'none';
    if (toggleActiveBtn) toggleActiveBtn.style.display = 'none';
    if (closeBtn) closeBtn.style.display = 'flex';
    if (saveBtn) saveBtn.style.display = 'flex';
    
    // Enable field
    const nameInput = document.getElementById('account-name');
    if (nameInput) {
      nameInput.removeAttribute('readonly');
      nameInput.removeAttribute('disabled');
    }
  }
}

// Hide account form
function hideAccountForm() {
  const form = document.getElementById('account-form');
  const list = document.getElementById('accounts-list');
  const header = document.querySelector('#accounts-view .flex.flex-col');
  
  if (form) form.classList.add('hidden');
  if (list) list.style.display = 'block';
  if (header) header.style.display = 'flex';
}

// View account detail
async function viewAccount(accountId) {
  showSpinner('Cargando cuenta...');
  try {
    const snapshot = await getAccount(accountId);
    const account = snapshot.val();
    hideSpinner();
    if (!account) {
      await showError('Cuenta no encontrada');
      return;
    }

    // Show edit form instead of detail view
    showAccountForm(accountId);
  } catch (error) {
    hideSpinner();
    await showError('Error al cargar cuenta: ' + error.message);
  }
}

// Setup event listeners when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Account form submit
  const accountForm = document.getElementById('account-form-element');
  if (accountForm) {
    accountForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const accountId = document.getElementById('account-id').value;
      const name = document.getElementById('account-name').value.trim();

      if (!name) {
        await showError('Por favor complete el nombre de la cuenta');
        return;
      }

      showSpinner('Guardando cuenta...');
      try {
        // Get current account to preserve active status if editing
        let active = true;
        if (accountId) {
          const accountSnapshot = await getAccount(accountId);
          const account = accountSnapshot.val();
          if (account) {
            active = account.active !== false; // Preserve existing status
          }
        }
        
        if (accountId) {
          await updateAccount(accountId, { name, active });
        } else {
          await createAccount({ name, active: true });
        }
        hideSpinner();
        hideAccountForm();
        await showSuccess('Cuenta guardada exitosamente');
      } catch (error) {
        hideSpinner();
        await showError('Error al guardar cuenta: ' + error.message);
      }
    });
  }

  // New account button
  const newAccountBtn = document.getElementById('new-account-btn');
  if (newAccountBtn) {
    newAccountBtn.addEventListener('click', () => {
      showAccountForm();
    });
  }

  // Close account form button
  const closeAccountFormBtn = document.getElementById('close-account-form');
  if (closeAccountFormBtn) {
    closeAccountFormBtn.addEventListener('click', () => {
      hideAccountForm();
    });
  }
  const closeAccountFormBtn2 = document.getElementById('close-account-form-btn');
  if (closeAccountFormBtn2) {
    closeAccountFormBtn2.addEventListener('click', () => {
      hideAccountForm();
    });
  }

  // Edit button - switch to edit mode
  const editAccountBtn = document.getElementById('edit-account-form-btn');
  if (editAccountBtn) {
    editAccountBtn.addEventListener('click', async () => {
      const form = document.getElementById('account-form');
      const accountId = document.getElementById('account-id').value;
      if (accountId) {
        // Change to edit mode
        form.dataset.viewMode = 'edit';
        
        // Set form title
        const title = document.getElementById('account-form-title');
        if (title) title.textContent = 'Editar Cuenta';
        
        // Enable field
        const nameInput = document.getElementById('account-name');
        if (nameInput) {
          nameInput.removeAttribute('readonly');
          nameInput.removeAttribute('disabled');
        }
        
        // Update buttons
        const editBtn = document.getElementById('edit-account-form-btn');
        const deleteBtn = document.getElementById('delete-account-form-btn');
        const toggleActiveBtn = document.getElementById('toggle-account-active-btn');
        const closeBtn = document.getElementById('close-account-form-btn');
        const saveBtn = document.getElementById('save-account-form-btn');
        if (editBtn) editBtn.style.display = 'none';
        if (deleteBtn) deleteBtn.style.display = 'none';
        if (toggleActiveBtn) toggleActiveBtn.style.display = 'none';
        if (closeBtn) closeBtn.style.display = 'flex';
        if (saveBtn) saveBtn.style.display = 'flex';
      }
    });
  }

  // Save button - submit form
  const saveAccountBtn = document.getElementById('save-account-form-btn');
  if (saveAccountBtn) {
    saveAccountBtn.addEventListener('click', async () => {
      const accountForm = document.getElementById('account-form-element');
      if (accountForm) {
        accountForm.dispatchEvent(new Event('submit'));
      }
    });
  }

  // Toggle active button - activate/deactivate account
  const toggleAccountBtn = document.getElementById('toggle-account-active-btn');
  if (toggleAccountBtn) {
    toggleAccountBtn.addEventListener('click', async () => {
      const accountId = document.getElementById('account-id').value;
      if (!accountId) return;
      
      showSpinner('Actualizando cuenta...');
      try {
        const accountSnapshot = await getAccount(accountId);
        const account = accountSnapshot.val();
        if (!account) {
          await showError('Cuenta no encontrada');
          hideSpinner();
          return;
        }
        
        const currentActive = account.active !== false;
        const newActive = !currentActive;
        
        await updateAccount(accountId, { 
          name: account.name, 
          active: newActive 
        });
        
        hideSpinner();
        
        // Reload account form to update button
        showAccountForm(accountId);
        await showSuccess(`Cuenta ${newActive ? 'activada' : 'desactivada'} exitosamente`);
      } catch (error) {
        hideSpinner();
        await showError('Error al actualizar cuenta: ' + error.message);
      }
    });
  }

  // Delete button - delete account if editing
  const deleteAccountBtn = document.getElementById('delete-account-form-btn');
  if (deleteAccountBtn) {
    deleteAccountBtn.addEventListener('click', async () => {
      const accountId = document.getElementById('account-id').value;
      if (accountId) {
        // Check if account has associated transactions
        showSpinner('Verificando transacciones...');
        try {
          const transactionsSnapshot = await getTransactionsRef().once('value');
          const transactions = transactionsSnapshot.val() || {};
          
          // Find transactions associated with this account
          const associatedTransactions = Object.entries(transactions).filter(
            ([id, transaction]) => transaction && transaction.accountId === accountId
          );
          
          hideSpinner();
          
          if (associatedTransactions.length > 0) {
            // Show modal with transactions list
            const result = await showTransactionsListModal(
              'No se puede eliminar la cuenta',
              associatedTransactions,
              async (transactionId) => {
                // Switch to transactions view and show the transaction
                if (typeof switchView === 'function') {
                  switchView('transactions');
                  // Wait a bit for the view to load
                  setTimeout(async () => {
                    if (typeof viewTransaction === 'function') {
                      await viewTransaction(transactionId);
                    }
                  }, 300);
                }
              }
            );
            return;
          }
          
          // No transactions associated, proceed with deletion
          const confirmed = await showConfirm('Eliminar Cuenta', '¿Está seguro de eliminar esta cuenta?');
          if (!confirmed) return;
          
          showSpinner('Eliminando cuenta...');
          await deleteAccount(accountId);
          hideSpinner();
          hideAccountForm();
          await showSuccess('Cuenta eliminada exitosamente');
        } catch (error) {
          hideSpinner();
          await showError('Error al eliminar cuenta: ' + error.message);
        }
      } else {
        // If new account, just close
        hideAccountForm();
      }
    });
  }
});

// Load accounts for transaction form
function loadAccountsForTransaction() {
  return getAccountsRef().once('value').then(snapshot => {
    const accounts = snapshot.val() || {};
    return Object.entries(accounts)
      .filter(([id, account]) => account.active !== false) // Only active accounts
      .map(([id, account]) => ({ id, ...account }));
  });
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

