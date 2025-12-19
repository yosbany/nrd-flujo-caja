// Cashflow management

let cashflowListener = null;
// Initialize with null to show all transactions by default
let cashflowSelectedFilterPeriod = 'all'; // 'today', 'week', 'month', 'year', 'all'

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

// Get period date range
function getPeriodDateRange(period) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  
  switch(period) {
    case 'today':
      return {
        start: today.getTime(),
        end: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999).getTime()
      };
    case 'week':
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)
      return {
        start: weekStart.getTime(),
        end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime()
      };
    case 'month':
      return {
        start: new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0).getTime(),
        end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime()
      };
    case 'year':
      return {
        start: new Date(today.getFullYear(), 0, 1, 0, 0, 0, 0).getTime(),
        end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime()
      };
    case 'all':
    default:
      return null; // No filter
  }
}

// Load cashflow summary
function loadCashflow() {
  // Remove previous listener
  if (cashflowListener) {
    getTransactionsRef().off('value', cashflowListener);
    cashflowListener = null;
  }

  // Update filter buttons
  updatePeriodFilterButtons();

  // Listen for transactions
  cashflowListener = getTransactionsRef().on('value', (snapshot) => {
    const transactions = snapshot.val() || {};
    let totalIncome = 0;
    let totalExpenses = 0;

    // Filter by period
    let transactionsToProcess = Object.values(transactions);
    const periodRange = getPeriodDateRange(cashflowSelectedFilterPeriod);
    
    if (periodRange) {
      transactionsToProcess = transactionsToProcess.filter(transaction => {
        const transactionDate = transaction.date || transaction.createdAt;
        if (!transactionDate) return false;
        return transactionDate >= periodRange.start && transactionDate <= periodRange.end;
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
    document.getElementById('total-income').textContent = `$${formatNumber(totalIncome)}`;
    document.getElementById('total-expenses').textContent = `$${formatNumber(totalExpenses)}`;
    document.getElementById('total-balance').textContent = `$${formatNumber(balance)}`;

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
  });
}

// Period filter handlers
function updatePeriodFilterButtons() {
  const buttons = {
    'today': document.getElementById('filter-today-btn'),
    'week': document.getElementById('filter-week-btn'),
    'month': document.getElementById('filter-month-btn'),
    'year': document.getElementById('filter-year-btn'),
    'all': document.getElementById('filter-all-btn')
  };
  
  Object.entries(buttons).forEach(([period, btn]) => {
    if (btn) {
      if (period === cashflowSelectedFilterPeriod) {
        btn.classList.add('bg-red-600', 'text-white', 'border-red-600');
        btn.classList.remove('text-gray-600', 'border-gray-300');
      } else {
        btn.classList.remove('bg-red-600', 'text-white', 'border-red-600');
        btn.classList.add('text-gray-600', 'border-gray-300');
      }
    }
  });
}

function setPeriodFilter(period) {
  cashflowSelectedFilterPeriod = period;
  loadCashflow();
}

// Initialize period filter on load
document.addEventListener('DOMContentLoaded', () => {
  // Setup event listeners after DOM is ready
  const todayBtn = document.getElementById('filter-today-btn');
  const weekBtn = document.getElementById('filter-week-btn');
  const monthBtn = document.getElementById('filter-month-btn');
  const yearBtn = document.getElementById('filter-year-btn');
  const allBtn = document.getElementById('filter-all-btn');
  
  if (todayBtn) todayBtn.addEventListener('click', () => setPeriodFilter('today'));
  if (weekBtn) weekBtn.addEventListener('click', () => setPeriodFilter('week'));
  if (monthBtn) monthBtn.addEventListener('click', () => setPeriodFilter('month'));
  if (yearBtn) yearBtn.addEventListener('click', () => setPeriodFilter('year'));
  if (allBtn) allBtn.addEventListener('click', () => setPeriodFilter('all'));
  
  updatePeriodFilterButtons();
});

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

