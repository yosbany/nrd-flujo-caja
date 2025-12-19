// Cashflow management

let cashflowListener = null;
// Initialize with null to show all transactions by default
let cashflowSelectedFilterDate = null;

// Format date in 24-hour format
function formatDate24h(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

// Load cashflow summary
function loadCashflow(initializeToToday = false) {
  const summaryContainer = document.getElementById('cashflow-summary');
  if (!summaryContainer) return;
  
  // Initialize filter date to today if not set (only if initializeToToday is true)
  if (!cashflowSelectedFilterDate && initializeToToday) {
    cashflowSelectedFilterDate = new Date();
    cashflowSelectedFilterDate.setHours(0, 0, 0, 0);
  }
  
  // Update filter display
  updateDateFilterDisplay();
  
  summaryContainer.innerHTML = '';

  // Remove previous listener
  if (cashflowListener) {
    getTransactionsRef().off('value', cashflowListener);
    cashflowListener = null;
  }

  // Listen for transactions
  cashflowListener = getTransactionsRef().on('value', (snapshot) => {
    if (!summaryContainer) return;
    
    const transactions = snapshot.val() || {};
    let totalIncome = 0;
    let totalExpenses = 0;

    // Filter by date if filter is active
    let transactionsToProcess = Object.values(transactions);
    if (cashflowSelectedFilterDate) {
      const filterDateStart = new Date(cashflowSelectedFilterDate.getFullYear(), cashflowSelectedFilterDate.getMonth(), cashflowSelectedFilterDate.getDate(), 0, 0, 0, 0).getTime();
      const filterDateEnd = new Date(cashflowSelectedFilterDate.getFullYear(), cashflowSelectedFilterDate.getMonth(), cashflowSelectedFilterDate.getDate(), 23, 59, 59, 999).getTime();
      
      transactionsToProcess = transactionsToProcess.filter(transaction => {
        const transactionDate = transaction.date || transaction.createdAt;
        if (!transactionDate) return false;
        return transactionDate >= filterDateStart && transactionDate <= filterDateEnd;
      });
    }

    // Calculate totals
    transactionsToProcess.forEach(transaction => {
      if (transaction.type === 'income') {
        totalIncome += parseFloat(transaction.amount || 0);
      } else {
        totalExpenses += parseFloat(transaction.amount || 0);
      }
    });

    const balance = totalIncome - totalExpenses;

    // Update summary cards
    document.getElementById('total-income').textContent = `$${totalIncome.toFixed(2)}`;
    document.getElementById('total-expenses').textContent = `$${totalExpenses.toFixed(2)}`;
    document.getElementById('total-balance').textContent = `$${balance.toFixed(2)}`;

    // Update balance color
    const balanceElement = document.getElementById('total-balance');
    if (balanceElement) {
      if (balance >= 0) {
        balanceElement.classList.remove('text-red-600');
        balanceElement.classList.add('text-blue-600');
      } else {
        balanceElement.classList.remove('text-blue-600');
        balanceElement.classList.add('text-red-600');
      }
    }

    // Show transactions summary by category
    const categorySummary = {};
    transactionsToProcess.forEach(transaction => {
      const categoryName = transaction.categoryName || 'Sin categoría';
      if (!categorySummary[categoryName]) {
        categorySummary[categoryName] = {
          income: 0,
          expense: 0,
          type: transaction.type
        };
      }
      if (transaction.type === 'income') {
        categorySummary[categoryName].income += parseFloat(transaction.amount || 0);
      } else {
        categorySummary[categoryName].expense += parseFloat(transaction.amount || 0);
      }
    });

    // Display category summary
    if (Object.keys(categorySummary).length === 0) {
      if (cashflowSelectedFilterDate) {
        summaryContainer.innerHTML = '<p class="text-center text-gray-600 py-6 sm:py-8 text-sm sm:text-base">No hay transacciones para la fecha seleccionada</p>';
      } else {
        summaryContainer.innerHTML = '<p class="text-center text-gray-600 py-6 sm:py-8 text-sm sm:text-base">No hay transacciones registradas</p>';
      }
      return;
    }

    const summaryHtml = Object.entries(categorySummary)
      .sort((a, b) => {
        const totalA = a[1].income + a[1].expense;
        const totalB = b[1].income + b[1].expense;
        return totalB - totalA;
      })
      .map(([categoryName, data]) => {
        const total = data.income + data.expense;
        const isIncome = data.income > 0;
        const color = isIncome ? 'text-green-600' : 'text-red-600';
        return `
          <div class="border border-gray-200 p-3 sm:p-4 md:p-6">
            <div class="flex justify-between items-center mb-2">
              <div class="text-base sm:text-lg font-light">${escapeHtml(categoryName)}</div>
              <div class="text-base sm:text-lg font-light ${color} font-medium">
                ${isIncome ? '+' : '-'}$${total.toFixed(2)}
              </div>
            </div>
            ${data.income > 0 ? `<div class="text-xs sm:text-sm text-gray-600">Ingresos: $${data.income.toFixed(2)}</div>` : ''}
            ${data.expense > 0 ? `<div class="text-xs sm:text-sm text-gray-600">Egresos: $${data.expense.toFixed(2)}</div>` : ''}
          </div>
        `;
      })
      .join('');

    summaryContainer.innerHTML = summaryHtml;
  });
}

// Date filter handlers
function updateDateFilterDisplay() {
  const display = document.getElementById('filter-date-display');
  if (!display) return;
  
  if (cashflowSelectedFilterDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const filterDate = new Date(cashflowSelectedFilterDate);
    filterDate.setHours(0, 0, 0, 0);
    
    if (filterDate.getTime() === today.getTime()) {
      display.textContent = 'Hoy';
    } else {
      display.textContent = formatDate24h(cashflowSelectedFilterDate);
    }
  } else {
    display.textContent = 'Todas';
  }
}

function setToday() {
  cashflowSelectedFilterDate = new Date();
  cashflowSelectedFilterDate.setHours(0, 0, 0, 0);
  updateDateFilterDisplay();
  loadCashflow();
}

function prevDate() {
  if (!cashflowSelectedFilterDate) {
    cashflowSelectedFilterDate = new Date();
    cashflowSelectedFilterDate.setHours(0, 0, 0, 0);
  } else {
    const prev = new Date(cashflowSelectedFilterDate);
    prev.setDate(prev.getDate() - 1);
    prev.setHours(0, 0, 0, 0);
    cashflowSelectedFilterDate = prev;
  }
  updateDateFilterDisplay();
  loadCashflow();
}

function nextDate() {
  if (!cashflowSelectedFilterDate) {
    cashflowSelectedFilterDate = new Date();
    cashflowSelectedFilterDate.setHours(0, 0, 0, 0);
  } else {
    const next = new Date(cashflowSelectedFilterDate);
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);
    cashflowSelectedFilterDate = next;
  }
  updateDateFilterDisplay();
  loadCashflow();
}

function clearDateFilter() {
  cashflowSelectedFilterDate = null;
  updateDateFilterDisplay();
  // Pass false to prevent re-initializing to today
  loadCashflow(false);
}

// Initialize date filter display on load
document.addEventListener('DOMContentLoaded', () => {
  // Keep as null to show all by default, only set hours if date is set
  if (cashflowSelectedFilterDate) {
    cashflowSelectedFilterDate.setHours(0, 0, 0, 0);
  }
  updateDateFilterDisplay();
  
  // Setup event listeners after DOM is ready
  const todayBtn = document.getElementById('today-date-btn');
  const prevBtn = document.getElementById('prev-date-btn');
  const nextBtn = document.getElementById('next-date-btn');
  const clearBtn = document.getElementById('clear-date-filter-btn');
  
  if (todayBtn) todayBtn.addEventListener('click', setToday);
  if (prevBtn) prevBtn.addEventListener('click', prevDate);
  if (nextBtn) nextBtn.addEventListener('click', nextDate);
  if (clearBtn) clearBtn.addEventListener('click', clearDateFilter);
});

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

