// Cashflow management

let cashflowListener = null;
// Initialize with today's date by default
let cashflowSelectedFilterDate = (() => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
})();

// Format date in 24-hour format
function formatDate24h(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

// Load cashflow summary
function loadCashflow(initializeToToday = true) {
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
  // Initialize to today if not set
  if (!cashflowSelectedFilterDate) {
    cashflowSelectedFilterDate = new Date();
    cashflowSelectedFilterDate.setHours(0, 0, 0, 0);
  } else {
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
  
  // Event listener for report button
  const reportBtn = document.getElementById('report-cashflow-btn');
  if (reportBtn) {
    reportBtn.addEventListener('click', generateCashflowReport);
  }
});

// Generate cashflow report
async function generateCashflowReport() {
  const result = await showReportModal();
  
  if (!result) {
    return; // User cancelled
  }
  
  const { selectedDate, action } = result;
  
  showSpinner('Generando reporte...');
  try {
    // Get all transactions
    const snapshot = await getTransactionsRef().once('value');
    const transactions = snapshot.val() || {};
    
    if (Object.keys(transactions).length === 0) {
      hideSpinner();
      await showInfo('No hay transacciones para generar el reporte');
      return;
    }
    
    // Parse selected date
    const dateParts = selectedDate.split('-');
    const year = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10) - 1;
    const day = parseInt(dateParts[2], 10);
    
    const selectedDateObj = new Date(year, month, day);
    const selectedDateStart = new Date(year, month, day, 0, 0, 0, 0).getTime();
    const selectedDateEnd = new Date(year, month, day, 23, 59, 59, 999).getTime();
    
    // Filter transactions by date
    const filteredTransactions = Object.values(transactions).filter(transaction => {
      const transactionDate = transaction.date || transaction.createdAt;
      if (!transactionDate) return false;
      return transactionDate >= selectedDateStart && transactionDate <= selectedDateEnd;
    });
    
    if (filteredTransactions.length === 0) {
      hideSpinner();
      await showInfo('No hay transacciones para la fecha seleccionada');
      return;
    }
    
    // Calculate totals
    let totalIncome = 0;
    let totalExpenses = 0;
    const transactionsByCategory = {};
    
    filteredTransactions.forEach(transaction => {
      const categoryName = transaction.categoryName || 'Sin categoría';
      if (!transactionsByCategory[categoryName]) {
        transactionsByCategory[categoryName] = { income: 0, expense: 0, items: [] };
      }
      
      if (transaction.type === 'income') {
        totalIncome += parseFloat(transaction.amount || 0);
        transactionsByCategory[categoryName].income += parseFloat(transaction.amount || 0);
      } else {
        totalExpenses += parseFloat(transaction.amount || 0);
        transactionsByCategory[categoryName].expense += parseFloat(transaction.amount || 0);
      }
      transactionsByCategory[categoryName].items.push(transaction);
    });
    
    const balance = totalIncome - totalExpenses;
    
    hideSpinner();
    
    // Generate PDF if action is print
    if (action === 'print') {
      showSpinner('Generando PDF...');
      const { jsPDF } = window.jspdf;
      const width = 80 * 2.83465; // 80mm width
      const height = 297; // A4 height
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: [width, height]
      });
      
      const margin = 10;
      const maxWidth = width - (margin * 2);
      let yPos = margin + 10;
      const lineHeight = 10;
      const fontSize = 9;
      
      function splitText(text, maxWidth) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = '';
        
        words.forEach(word => {
          const testLine = currentLine + (currentLine ? ' ' : '') + word;
          const testWidth = doc.getTextWidth(testLine);
          
          if (testWidth > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        });
        
        if (currentLine) {
          lines.push(currentLine);
        }
        
        return lines;
      }
      
      // Title
      doc.setFontSize(fontSize + 3);
      doc.setFont(undefined, 'bold');
      const titleLines = splitText('REPORTE DE FLUJO DE CAJA', maxWidth);
      titleLines.forEach(line => {
        doc.text(line, margin, yPos);
        yPos += lineHeight;
      });
      yPos += 5;
      
      // Date
      doc.setFontSize(fontSize);
      doc.setFont(undefined, 'bold');
      const dateText = `Fecha: ${formatDate24h(selectedDateObj)}`;
      doc.text(dateText, margin, yPos);
      yPos += lineHeight + 5;
      
      // Totals
      doc.setFont(undefined, 'bold');
      doc.text(`Ingresos: $${totalIncome.toFixed(2)}`, margin, yPos);
      yPos += lineHeight;
      doc.text(`Egresos: $${totalExpenses.toFixed(2)}`, margin, yPos);
      yPos += lineHeight;
      doc.text(`Balance: $${balance.toFixed(2)}`, margin, yPos);
      yPos += lineHeight + 5;
      
      // Transactions by category
      Object.entries(transactionsByCategory).forEach(([categoryName, data]) => {
        if (yPos > height - 50) {
          doc.addPage();
          yPos = margin + 10;
        }
        
        doc.setFont(undefined, 'bold');
        const categoryText = categoryName;
        const categoryLines = splitText(categoryText, maxWidth);
        categoryLines.forEach(line => {
          doc.text(line, margin, yPos);
          yPos += lineHeight;
        });
        
        if (data.income > 0) {
          doc.setFont(undefined, 'normal');
          doc.text(`  Ingresos: $${data.income.toFixed(2)}`, margin, yPos);
          yPos += lineHeight;
        }
        if (data.expense > 0) {
          doc.setFont(undefined, 'normal');
          doc.text(`  Egresos: $${data.expense.toFixed(2)}`, margin, yPos);
          yPos += lineHeight;
        }
        yPos += 3;
      });
      
      const filename = `Reporte_Flujo_Caja_${formatDate24h(selectedDateObj).replace(/\//g, '-')}.pdf`;
      doc.save(filename);
      hideSpinner();
      
      await new Promise(resolve => setTimeout(resolve, 300));
      await showSuccess('Reporte generado exitosamente');
    }
    
    // Generate WhatsApp message if action is whatsapp
    if (action === 'whatsapp') {
      let message = `REPORTE DE FLUJO DE CAJA\n`;
      message += `Fecha: ${formatDate24h(selectedDateObj)}\n\n`;
      message += `Ingresos: $${totalIncome.toFixed(2)}\n`;
      message += `Egresos: $${totalExpenses.toFixed(2)}\n`;
      message += `Balance: $${balance.toFixed(2)}\n\n`;
      
      Object.entries(transactionsByCategory).forEach(([categoryName, data]) => {
        message += `${categoryName}:\n`;
        if (data.income > 0) {
          message += `  Ingresos: $${data.income.toFixed(2)}\n`;
        }
        if (data.expense > 0) {
          message += `  Egresos: $${data.expense.toFixed(2)}\n`;
        }
        message += '\n';
      });
      
      const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
      window.open(url, '_blank');
      await showSuccess('Reporte generado y WhatsApp abierto');
    }
  } catch (error) {
    hideSpinner();
    console.error('Error generating report:', error);
    await showError('Error al generar reporte: ' + error.message);
  }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

