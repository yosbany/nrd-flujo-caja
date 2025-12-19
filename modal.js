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

