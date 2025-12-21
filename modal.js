// Custom Modal and Alert System

// Show confirmation modal
function showConfirm(title, message, confirmText = 'Confirmar', cancelText = 'Cancelar') {
  return new Promise((resolve) => {
    const modal = document.getElementById('custom-modal');
    const titleEl = document.getElementById('modal-title');
    const messageEl = document.getElementById('modal-message');
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');

    titleEl.textContent = title;
    messageEl.textContent = message;
    confirmBtn.textContent = confirmText;
    cancelBtn.textContent = cancelText;

    modal.classList.remove('hidden');

    const handleConfirm = () => {
      modal.classList.add('hidden');
      confirmBtn.removeEventListener('click', handleConfirm);
      cancelBtn.removeEventListener('click', handleCancel);
      resolve(true);
    };

    const handleCancel = () => {
      modal.classList.add('hidden');
      confirmBtn.removeEventListener('click', handleConfirm);
      cancelBtn.removeEventListener('click', handleCancel);
      resolve(false);
    };

    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);

    // Close on background click
    const handleBackgroundClick = (e) => {
      if (e.target === modal) {
        handleCancel();
        modal.removeEventListener('click', handleBackgroundClick);
      }
    };
    modal.addEventListener('click', handleBackgroundClick);
  });
}

// Show confirmation modal with two options (returns 'option1', 'option2', or null)
function showConfirmWithOptions(title, message, option1Text, option2Text) {
  return new Promise((resolve) => {
    const modal = document.getElementById('custom-modal');
    const titleEl = document.getElementById('modal-title');
    const messageEl = document.getElementById('modal-message');
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');

    titleEl.textContent = title;
    messageEl.textContent = message;
    confirmBtn.textContent = option1Text;
    cancelBtn.textContent = option2Text;

    modal.classList.remove('hidden');

    const handleOption1 = () => {
      modal.classList.add('hidden');
      confirmBtn.removeEventListener('click', handleOption1);
      cancelBtn.removeEventListener('click', handleOption2);
      resolve('option1');
    };

    const handleOption2 = () => {
      modal.classList.add('hidden');
      confirmBtn.removeEventListener('click', handleOption1);
      cancelBtn.removeEventListener('click', handleOption2);
      resolve('option2');
    };

    confirmBtn.addEventListener('click', handleOption1);
    cancelBtn.addEventListener('click', handleOption2);

    // Close on background click - cancels
    const handleBackgroundClick = (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
        confirmBtn.removeEventListener('click', handleOption1);
        cancelBtn.removeEventListener('click', handleOption2);
        modal.removeEventListener('click', handleBackgroundClick);
        resolve(null);
      }
    };
    modal.addEventListener('click', handleBackgroundClick);
  });
}

// Show alert
function showAlert(title, message) {
  return new Promise((resolve) => {
    const alert = document.getElementById('custom-alert');
    const titleEl = document.getElementById('alert-title');
    const messageEl = document.getElementById('alert-message');
    const okBtn = document.getElementById('alert-ok');

    titleEl.textContent = title;
    messageEl.textContent = message;

    alert.classList.remove('hidden');

    const handleOk = () => {
      alert.classList.add('hidden');
      okBtn.removeEventListener('click', handleOk);
      resolve();
    };

    okBtn.addEventListener('click', handleOk);

    // Close on background click
    const handleBackgroundClick = (e) => {
      if (e.target === alert) {
        handleOk();
        alert.removeEventListener('click', handleBackgroundClick);
      }
    };
    alert.addEventListener('click', handleBackgroundClick);
  });
}

// Show success alert
function showSuccess(message) {
  return showAlert('Éxito', message);
}

// Show error alert
function showError(message) {
  return showAlert('Error', message);
}

// Show info alert
function showInfo(message) {
  return showAlert('Información', message);
}

// Loading spinner functions
function showSpinner(message = 'Cargando...') {
  const spinner = document.getElementById('loading-spinner');
  const messageEl = spinner.querySelector('p');
  if (messageEl) {
    messageEl.textContent = message;
  }
  spinner.classList.remove('hidden');
}

function hideSpinner() {
  const spinner = document.getElementById('loading-spinner');
  spinner.classList.add('hidden');
}

// Show date picker modal
function showDatePicker(title, message) {
  return new Promise((resolve) => {
    const modal = document.getElementById('custom-modal');
    const titleEl = document.getElementById('modal-title');
    const messageEl = document.getElementById('modal-message');
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');

    titleEl.textContent = title;
    messageEl.innerHTML = message;
    
    // Create date input
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.id = 'report-date-input';
    dateInput.className = 'w-full px-3 py-2 border border-gray-300 focus:outline-none focus:border-red-600 bg-white text-sm sm:text-base rounded mt-2';
    
    // Set default to today
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    dateInput.value = `${year}-${month}-${day}`;
    
    // Insert date input after message
    messageEl.appendChild(dateInput);
    
    confirmBtn.textContent = 'Generar';
    cancelBtn.textContent = 'Cancelar';

    modal.classList.remove('hidden');

    const handleConfirm = () => {
      const selectedDate = dateInput.value;
      modal.classList.add('hidden');
      messageEl.innerHTML = ''; // Clean up
      confirmBtn.removeEventListener('click', handleConfirm);
      cancelBtn.removeEventListener('click', handleCancel);
      resolve(selectedDate);
    };

    const handleCancel = () => {
      modal.classList.add('hidden');
      messageEl.innerHTML = ''; // Clean up
      confirmBtn.removeEventListener('click', handleConfirm);
      cancelBtn.removeEventListener('click', handleCancel);
      resolve(null);
    };

    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);

    // Close on background click
    const handleBackgroundClick = (e) => {
      if (e.target === modal) {
        handleCancel();
        modal.removeEventListener('click', handleBackgroundClick);
      }
    };
    modal.addEventListener('click', handleBackgroundClick);
  });
}

// Show report modal with date picker and action buttons
function showReportModal() {
  return new Promise((resolve) => {
    const modal = document.getElementById('custom-modal');
    const titleEl = document.getElementById('modal-title');
    const messageEl = document.getElementById('modal-message');
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');

    titleEl.textContent = 'Reporte de Flujo de Caja';
    messageEl.innerHTML = `
      <div class="space-y-4">
        <div>
          <label class="block text-sm text-gray-700 mb-2">Seleccione la fecha para filtrar las transacciones:</label>
          <input type="date" id="report-date-input" class="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:border-red-600 bg-white text-sm sm:text-base rounded">
        </div>
        <div class="flex flex-col sm:flex-row gap-2">
          <button id="report-whatsapp-btn" class="flex-1 px-4 py-2 bg-green-600 text-white border border-green-600 hover:bg-green-700 transition-colors uppercase tracking-wider text-xs sm:text-sm font-light rounded">
            Enviar por WhatsApp
          </button>
          <button id="report-print-btn" class="flex-1 px-4 py-2 bg-red-600 text-white border border-red-600 hover:bg-red-700 transition-colors uppercase tracking-wider text-xs sm:text-sm font-light rounded">
            Imprimir
          </button>
        </div>
      </div>
    `;
    
    confirmBtn.style.display = 'none';
    cancelBtn.textContent = 'Cancelar';

    // Set default date to today
    setTimeout(() => {
      const dateInput = document.getElementById('report-date-input');
      if (dateInput) {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        dateInput.value = `${year}-${month}-${day}`;
      }
    }, 10);

    modal.classList.remove('hidden');

    const handleWhatsApp = () => {
      const dateInput = document.getElementById('report-date-input');
      const selectedDate = dateInput ? dateInput.value : null;
      if (!selectedDate) {
        return;
      }
      modal.classList.add('hidden');
      messageEl.innerHTML = '';
      confirmBtn.style.display = '';
      document.getElementById('report-whatsapp-btn')?.removeEventListener('click', handleWhatsApp);
      document.getElementById('report-print-btn')?.removeEventListener('click', handlePrint);
      cancelBtn.removeEventListener('click', handleCancel);
      modal.removeEventListener('click', handleBackgroundClick);
      resolve({ selectedDate, action: 'whatsapp' });
    };

    const handlePrint = () => {
      const dateInput = document.getElementById('report-date-input');
      const selectedDate = dateInput ? dateInput.value : null;
      if (!selectedDate) {
        return;
      }
      modal.classList.add('hidden');
      messageEl.innerHTML = '';
      confirmBtn.style.display = '';
      document.getElementById('report-whatsapp-btn')?.removeEventListener('click', handleWhatsApp);
      document.getElementById('report-print-btn')?.removeEventListener('click', handlePrint);
      cancelBtn.removeEventListener('click', handleCancel);
      modal.removeEventListener('click', handleBackgroundClick);
      resolve({ selectedDate, action: 'print' });
    };

    const handleCancel = () => {
      modal.classList.add('hidden');
      messageEl.innerHTML = '';
      confirmBtn.style.display = '';
      document.getElementById('report-whatsapp-btn')?.removeEventListener('click', handleWhatsApp);
      document.getElementById('report-print-btn')?.removeEventListener('click', handlePrint);
      cancelBtn.removeEventListener('click', handleCancel);
      modal.removeEventListener('click', handleBackgroundClick);
      resolve(null);
    };

    // Close on background click
    const handleBackgroundClick = (e) => {
      if (e.target === modal) {
        handleCancel();
      }
    };

    // Wait for DOM to update before attaching listeners
    setTimeout(() => {
      const whatsappBtn = document.getElementById('report-whatsapp-btn');
      const printBtn = document.getElementById('report-print-btn');
      if (whatsappBtn) {
        whatsappBtn.addEventListener('click', handleWhatsApp);
      }
      if (printBtn) {
        printBtn.addEventListener('click', handlePrint);
      }
      cancelBtn.addEventListener('click', handleCancel);
      modal.addEventListener('click', handleBackgroundClick);
    }, 10);
  });
}

// Show transactions list modal (for preventing deletion of categories/accounts with transactions)
function showTransactionsListModal(title, transactions, onTransactionClick) {
  return new Promise((resolve) => {
    const modal = document.getElementById('custom-modal');
    const titleEl = document.getElementById('modal-title');
    const messageEl = document.getElementById('modal-message');
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');

    titleEl.textContent = title;
    
    // Create transactions list HTML
    let transactionsHTML = '<div class="space-y-2 max-h-96 overflow-y-auto mb-4">';
    if (transactions.length === 0) {
      transactionsHTML += '<p class="text-gray-600 text-sm">No hay transacciones asociadas</p>';
    } else {
      transactions.forEach(([id, transaction]) => {
        const date = transaction.date ? new Date(transaction.date) : new Date(transaction.createdAt);
        const isIncome = transaction.type === 'income';
        const amountColor = isIncome ? 'text-green-600' : 'text-red-600';
        const prefix = isIncome ? '+' : '-';
        
        transactionsHTML += `
          <div class="border border-gray-200 p-3 rounded cursor-pointer hover:bg-gray-50 transition-colors transaction-item" data-transaction-id="${id}">
            <div class="flex justify-between items-center">
              <div class="flex-1">
                <div class="text-sm font-medium">${escapeHtml(transaction.description || 'Sin subcategoría')}</div>
                <div class="text-xs text-gray-500 mt-1">
                  ${formatDate24h(date)} • ${escapeHtml(transaction.categoryName || 'Sin categoría')} • ${escapeHtml(transaction.accountName || 'Sin cuenta')}
                </div>
              </div>
              <div class="text-sm font-medium ${amountColor} ml-4">
                ${prefix}$${formatNumber(parseFloat(transaction.amount || 0))}
              </div>
            </div>
          </div>
        `;
      });
    }
    transactionsHTML += '</div>';
    
    messageEl.innerHTML = `
      <div>
        <p class="text-sm text-gray-700 mb-3">No se puede eliminar porque tiene ${transactions.length} transacción(es) asociada(s). Haga clic en una transacción para ver su detalle y eliminarla si es necesario.</p>
        ${transactionsHTML}
      </div>
    `;
    
    confirmBtn.style.display = 'none';
    cancelBtn.textContent = 'Cerrar';

    modal.classList.remove('hidden');

    // Handle transaction click
    const handleTransactionClick = (e) => {
      const item = e.target.closest('.transaction-item');
      if (item) {
        const transactionId = item.dataset.transactionId;
        modal.classList.add('hidden');
        messageEl.innerHTML = '';
        confirmBtn.style.display = '';
        cancelBtn.removeEventListener('click', handleCancel);
        modal.removeEventListener('click', handleBackgroundClick);
        // Remove all transaction click listeners
        document.querySelectorAll('.transaction-item').forEach(el => {
          el.removeEventListener('click', handleTransactionClick);
        });
        if (onTransactionClick && transactionId) {
          onTransactionClick(transactionId);
        }
        resolve({ transactionId });
      }
    };

    const handleCancel = () => {
      modal.classList.add('hidden');
      messageEl.innerHTML = '';
      confirmBtn.style.display = '';
      cancelBtn.removeEventListener('click', handleCancel);
      modal.removeEventListener('click', handleBackgroundClick);
      // Remove all transaction click listeners
      document.querySelectorAll('.transaction-item').forEach(el => {
        el.removeEventListener('click', handleTransactionClick);
      });
      resolve(null);
    };

    // Close on background click
    const handleBackgroundClick = (e) => {
      if (e.target === modal) {
        handleCancel();
      }
    };

    // Wait for DOM to update before attaching listeners
    setTimeout(() => {
      document.querySelectorAll('.transaction-item').forEach(item => {
        item.addEventListener('click', handleTransactionClick);
      });
      cancelBtn.addEventListener('click', handleCancel);
      modal.addEventListener('click', handleBackgroundClick);
    }, 10);
  });
}

// Helper functions for the modal
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate24h(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatNumber(number) {
  return number.toLocaleString('es-UY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

