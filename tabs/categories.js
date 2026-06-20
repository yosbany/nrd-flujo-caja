// Category management

import {
  initializeTransactionsStore,
  subscribeTransactions,
  getTransactions,
  getTransactionsDict,
  transactionsToDict
} from '../modules/transactions-store.js';
import { getCategoriesDict, initializeCategoriesStore } from '../modules/categories-store.js';

const SUBCATEGORIES_PAGE_SIZE = 50;
const SUBCATEGORIES_TREND_BATCH = 20;
const RENDER_DEBOUNCE_MS = 120;

let categoriesListener = null;
let transactionsUnsubscribe = null;
let categoriesViewActive = false;
let categoriesDictCache = {};
let renderDebounceTimer = null;
let renderGeneration = 0;
let subcategoriesVisibleCount = SUBCATEGORIES_PAGE_SIZE;
let subcategoriesTrendCancelGen = 0;

function getTransferCategoryIds(categoriesDict) {
  return new Set(
    Object.entries(categoriesDict)
      .filter(([, cat]) => cat && cat.name && String(cat.name).toUpperCase().includes('TRANSFERENCIA'))
      .map(([id]) => id)
  );
}

function buildAggregatesFromTransactions(transactionsArray, categoriesDict) {
  const transferCategoryIds = getTransferCategoryIds(categoriesDict);
  const categoryTotals = {};
  const categoryTransactions = {};
  const subcategoriesMap = {};

  for (const transaction of transactionsArray) {
    if (!transaction) continue;

    const categoryId = transaction.categoryId;
    if (categoryId && !transferCategoryIds.has(categoryId)) {
      if (!categoryTotals[categoryId]) {
        categoryTotals[categoryId] = 0;
        categoryTransactions[categoryId] = [];
      }
      categoryTotals[categoryId] += parseFloat(transaction.amount) || 0;
      const categoryDate = transaction.date || transaction.createdAt || 0;
      if (categoryDate > 0) {
        categoryTransactions[categoryId].push({
          id: transaction.id,
          date: categoryDate,
          amount: parseFloat(transaction.amount) || 0,
          type: transaction.type
        });
      }
    }

    const rawDesc = transaction.description;
    if (!rawDesc || !String(rawDesc).trim()) continue;

    const desc = String(rawDesc).trim();
    if (!subcategoriesMap[desc]) {
      subcategoriesMap[desc] = {
        count: 0,
        incomeCount: 0,
        expenseCount: 0,
        transactionIds: [],
        total: 0,
        lastUsedDate: 0,
        transactions: []
      };
    }

    const entry = subcategoriesMap[desc];
    entry.count++;
    if (transaction.id) entry.transactionIds.push(transaction.id);
    if (transaction.type === 'expense') entry.expenseCount++;
    else if (transaction.type === 'income') entry.incomeCount++;

    const amount = parseFloat(transaction.amount) || 0;
    if (transaction.type === 'expense') entry.total -= amount;
    else entry.total += amount;

    const transactionDate = transaction.date || transaction.createdAt || 0;
    if (transactionDate > entry.lastUsedDate) entry.lastUsedDate = transactionDate;
    if (transactionDate > 0) {
      entry.transactions.push({
        id: transaction.id,
        date: transactionDate,
        amount,
        type: transaction.type
      });
    }
  }

  return { transferCategoryIds, categoryTotals, categoryTransactions, subcategoriesMap };
}

function scheduleCategoriesRender() {
  if (!categoriesViewActive) return;
  if (renderDebounceTimer) clearTimeout(renderDebounceTimer);
  renderDebounceTimer = setTimeout(() => {
    renderDebounceTimer = null;
    void renderCategoriesView();
  }, RENDER_DEBOUNCE_MS);
}

function renderCategorySection(categoriesList, title, items, colorClass, hoverClass) {
  if (items.length === 0) return;

  const section = document.createElement('div');
  section.className = 'mb-4 sm:mb-6';
  section.innerHTML = `<h3 class="text-sm sm:text-base font-light text-gray-600 mb-2 sm:mb-3 uppercase tracking-wider">${title}</h3>`;
  categoriesList.appendChild(section);

  items.forEach(({ id, category, total, transactions: categoryTrans }) => {
    const item = document.createElement('div');
    const isActive = category.active !== false;
    const opacityClass = isActive ? '' : 'opacity-50';
    item.className = `border border-gray-200 p-3 sm:p-4 md:p-6 ${hoverClass} transition-colors cursor-pointer mb-2 sm:mb-3 ${opacityClass}`;
    item.dataset.categoryId = id;
    const formattedTotal = new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'UYU' }).format(total);
    const statusText = isActive ? '' : ' (Desactivada)';
    const trendGraph = calculateTrendGraph(categoryTrans || [], category.name);

    item.innerHTML = `
      <div class="flex justify-between items-center">
        <div class="flex-1">
          <div class="text-base sm:text-lg font-light ${colorClass}">${escapeHtml(category.name)}${statusText}</div>
        </div>
        <div class="flex items-center gap-3 sm:gap-4">
          <div class="text-sm sm:text-base font-light ${colorClass}">${formattedTotal}</div>
          <div class="flex-shrink-0">${trendGraph.svg}</div>
        </div>
      </div>
    `;

    if (trendGraph.clickable) {
      const svgElement = item.querySelector('svg');
      if (svgElement) {
        svgElement.style.cursor = 'pointer';
        svgElement.addEventListener('click', (e) => {
          e.stopPropagation();
          showTrendGraphModal(category.name, categoryTrans || []);
        });
      }
    }

    item.addEventListener('click', () => viewCategory(id));
    categoriesList.appendChild(item);
  });
}

function renderSubcategoryTrendsLazy(trendCells, descriptions, subcategoriesMap, renderGen) {
  subcategoriesTrendCancelGen++;
  const trendGen = subcategoriesTrendCancelGen;
  let index = 0;

  function renderBatch() {
    if (!categoriesViewActive || trendGen !== subcategoriesTrendCancelGen || renderGen !== renderGeneration) return;

    const end = Math.min(index + SUBCATEGORIES_TREND_BATCH, trendCells.length);
    for (; index < end; index++) {
      const description = descriptions[index];
      const trendCell = trendCells[index];
      const data = subcategoriesMap[description];
      if (!trendCell || !data) continue;

      const trendGraph = calculateTrendGraph(data.transactions || [], description);
      trendCell.innerHTML = trendGraph.svg;

      if (trendGraph.clickable) {
        const svgElement = trendCell.querySelector('svg');
        if (svgElement) {
          svgElement.style.cursor = 'pointer';
          svgElement.addEventListener('click', (e) => {
            e.stopPropagation();
            showTrendGraphModal(description, data.transactions || []);
          });
        }
      }
    }

    if (index < trendCells.length) {
      requestAnimationFrame(renderBatch);
    }
  }

  requestAnimationFrame(renderBatch);
}

function renderSubcategoriesSection(container, subcategoriesMap, transactions, renderGen) {
  const subcategoriesSection = document.createElement('div');
  subcategoriesSection.className = 'mt-8 sm:mt-10 pt-6 sm:pt-8 border-t border-gray-300';
  subcategoriesSection.innerHTML = '<h3 class="text-sm sm:text-base font-light text-gray-600 mb-4 sm:mb-6 uppercase tracking-wider">Subcategorías (Descripciones)</h3>';

  const subcategoriesList = Object.keys(subcategoriesMap).sort((a, b) => {
    return (subcategoriesMap[b].lastUsedDate || 0) - (subcategoriesMap[a].lastUsedDate || 0);
  });

  if (subcategoriesList.length === 0) {
    subcategoriesSection.innerHTML += '<p class="text-center text-gray-600 py-4 text-sm">No hay subcategorías registradas</p>';
    container.appendChild(subcategoriesSection);
    return;
  }

  const visibleList = subcategoriesList.slice(0, subcategoriesVisibleCount);
  const table = document.createElement('div');
  table.className = 'overflow-x-auto';
  table.innerHTML = `
    <table class="w-full border-collapse">
      <thead>
        <tr class="bg-gray-100 border-b border-gray-300">
          <th class="text-left p-2 sm:p-3 text-xs sm:text-sm font-light text-gray-700 uppercase tracking-wider">Descripción</th>
          <th class="text-center p-2 sm:p-3 text-xs sm:text-sm font-light text-gray-700 uppercase tracking-wider">Ingresos</th>
          <th class="text-center p-2 sm:p-3 text-xs sm:text-sm font-light text-gray-700 uppercase tracking-wider">Egresos</th>
          <th class="text-center p-2 sm:p-3 text-xs sm:text-sm font-light text-gray-700 uppercase tracking-wider">Total</th>
          <th class="text-right p-2 sm:p-3 text-xs sm:text-sm font-light text-gray-700 uppercase tracking-wider">Monto Total</th>
          <th class="text-center p-2 sm:p-3 text-xs sm:text-sm font-light text-gray-700 uppercase tracking-wider">Tendencia</th>
          <th class="text-center p-2 sm:p-3 text-xs sm:text-sm font-light text-gray-700 uppercase tracking-wider">Acciones</th>
        </tr>
      </thead>
      <tbody id="subcategories-tbody"></tbody>
    </table>
  `;

  const tbody = table.querySelector('#subcategories-tbody');
  const trendCells = [];
  const trendDescriptions = [];

  visibleList.forEach((description) => {
    const row = document.createElement('tr');
    row.className = 'border-b border-gray-200 hover:bg-gray-50';
    row.dataset.description = description;

    const data = subcategoriesMap[description];

    const descCell = document.createElement('td');
    descCell.className = 'p-2 sm:p-3 text-sm sm:text-base font-light';
    descCell.textContent = description;

    const incomeCountCell = document.createElement('td');
    incomeCountCell.className = 'p-2 sm:p-3 text-sm sm:text-base font-light text-center text-green-600';
    incomeCountCell.textContent = data.incomeCount || 0;

    const expenseCountCell = document.createElement('td');
    expenseCountCell.className = 'p-2 sm:p-3 text-sm sm:text-base font-light text-center text-red-600';
    expenseCountCell.textContent = data.expenseCount || 0;

    const totalCountCell = document.createElement('td');
    totalCountCell.className = 'p-2 sm:p-3 text-sm sm:text-base font-medium text-center';
    totalCountCell.textContent = data.count;

    const totalCell = document.createElement('td');
    totalCell.className = 'p-2 sm:p-3 text-sm sm:text-base font-medium text-right';
    totalCell.textContent = new Intl.NumberFormat('es-UY', {
      style: 'currency',
      currency: 'UYU',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Math.abs(data.total));

    const trendCell = document.createElement('td');
    trendCell.className = 'p-2 sm:p-3 text-center text-xs text-gray-400';
    trendCell.textContent = '…';
    trendCells.push(trendCell);
    trendDescriptions.push(description);

    const actionsCell = document.createElement('td');
    actionsCell.className = 'p-2 sm:p-3 text-center';

    const editBtn = document.createElement('button');
    editBtn.className = 'edit-subcategory-btn text-blue-600 hover:text-blue-800 text-xs sm:text-sm font-light mr-2 sm:mr-4';
    editBtn.textContent = 'Editar';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      editSubcategory(description, data.transactionIds);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-subcategory-btn text-red-600 hover:text-red-800 text-xs sm:text-sm font-light';
    deleteBtn.textContent = 'Eliminar';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteSubcategory(description, data.transactionIds);
    });

    actionsCell.appendChild(editBtn);
    actionsCell.appendChild(deleteBtn);

    row.appendChild(descCell);
    row.appendChild(incomeCountCell);
    row.appendChild(expenseCountCell);
    row.appendChild(totalCountCell);
    row.appendChild(totalCell);
    row.appendChild(trendCell);
    row.appendChild(actionsCell);

    row.style.cursor = 'pointer';
    row.addEventListener('click', (e) => {
      if (e.target.closest('.edit-subcategory-btn') || e.target.closest('.delete-subcategory-btn')) return;
      showSubcategoryTransactionsModal(description, data.transactionIds, transactions);
    });

    tbody.appendChild(row);
  });

  subcategoriesSection.appendChild(table);

  if (subcategoriesList.length > subcategoriesVisibleCount) {
    const loadMoreWrap = document.createElement('div');
    loadMoreWrap.className = 'mt-4 text-center';
    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.type = 'button';
    loadMoreBtn.className = 'px-4 py-2 border border-gray-300 text-gray-700 hover:border-red-600 hover:text-red-600 transition-colors text-xs sm:text-sm font-light uppercase tracking-wider';
    const remaining = subcategoriesList.length - subcategoriesVisibleCount;
    loadMoreBtn.textContent = `Cargar más (${remaining} restantes)`;
    loadMoreBtn.addEventListener('click', () => {
      subcategoriesVisibleCount += SUBCATEGORIES_PAGE_SIZE;
      scheduleCategoriesRender();
    });
    loadMoreWrap.appendChild(loadMoreBtn);
    subcategoriesSection.appendChild(loadMoreWrap);
  } else if (subcategoriesList.length > SUBCATEGORIES_PAGE_SIZE) {
    const countNote = document.createElement('p');
    countNote.className = 'mt-3 text-center text-xs text-gray-500';
    countNote.textContent = `Mostrando ${subcategoriesList.length} subcategorías`;
    subcategoriesSection.appendChild(countNote);
  }

  container.appendChild(subcategoriesSection);
  renderSubcategoryTrendsLazy(trendCells, trendDescriptions, subcategoriesMap, renderGen);
}

async function renderCategoriesView() {
  if (!categoriesViewActive) return;

  const gen = ++renderGeneration;
  const categoriesList = document.getElementById('categories-list');
  if (!categoriesList) return;

  const categoriesDict = categoriesDictCache;
  if (Object.keys(categoriesDict).length === 0) {
    categoriesList.innerHTML = '<p class="text-center text-gray-600 py-6 sm:py-8 text-sm sm:text-base">No hay categorías registradas</p>';
    return;
  }

  const transactionsArray = getTransactions();
  const { transferCategoryIds, categoryTotals, categoryTransactions, subcategoriesMap } =
    buildAggregatesFromTransactions(transactionsArray, categoriesDict);
  const transactions = transactionsToDict(transactionsArray);

  if (gen !== renderGeneration || !categoriesViewActive) return;

  categoriesList.innerHTML = '';

  const incomeCategories = [];
  const expenseCategories = [];

  Object.entries(categoriesDict).forEach(([id, category]) => {
    if (transferCategoryIds.has(id)) return;
    const categoryData = {
      id,
      category,
      total: categoryTotals[id] || 0,
      transactions: categoryTransactions[id] || []
    };
    if (category.type === 'income') incomeCategories.push(categoryData);
    else expenseCategories.push(categoryData);
  });

  renderCategorySection(categoriesList, 'Ingresos', incomeCategories, 'text-green-600', 'hover:border-green-600');
  renderCategorySection(categoriesList, 'Egresos', expenseCategories, 'text-red-600', 'hover:border-red-600');
  renderSubcategoriesSection(categoriesList, subcategoriesMap, transactions, gen);
}

function loadCategories() {
  const nrd = window.nrd;
  if (!nrd) {
    logger.error('NRD service not available');
    const categoriesList = document.getElementById('categories-list');
    if (categoriesList) {
      categoriesList.innerHTML = '<p class="text-center text-red-600 py-6 sm:py-8 text-sm sm:text-base">Error: Servicio NRD no disponible</p>';
    }
    return;
  }

  logger.debug('Loading categories');
  const categoriesList = document.getElementById('categories-list');
  if (!categoriesList) {
    logger.warn('Categories list element not found');
    return;
  }

  categoriesViewActive = true;
  subcategoriesVisibleCount = SUBCATEGORIES_PAGE_SIZE;
  categoriesList.innerHTML = '<p class="text-center text-gray-600 py-6 sm:py-8 text-sm sm:text-base">Cargando categorías...</p>';

  if (categoriesListener) {
    categoriesListener();
    categoriesListener = null;
  }
  if (transactionsUnsubscribe) {
    transactionsUnsubscribe();
    transactionsUnsubscribe = null;
  }

  void initializeTransactionsStore()
    .catch((error) => logger.error('Failed to init transactions store', error))
    .finally(() => {
      if (!categoriesViewActive) return;

      transactionsUnsubscribe = subscribeTransactions(() => {
        scheduleCategoriesRender();
      });

      categoriesListener = nrd.categories.onValue((categories) => {
        categoriesDictCache = Array.isArray(categories)
          ? categories.reduce((acc, category) => {
              if (category && category.id) acc[category.id] = category;
              return acc;
            }, {})
          : categories || {};
        scheduleCategoriesRender();
      });
    });
}

function cleanupCategories() {
  categoriesViewActive = false;
  renderGeneration++;
  subcategoriesTrendCancelGen++;
  if (renderDebounceTimer) {
    clearTimeout(renderDebounceTimer);
    renderDebounceTimer = null;
  }
  if (categoriesListener) {
    categoriesListener();
    categoriesListener = null;
  }
  if (transactionsUnsubscribe) {
    transactionsUnsubscribe();
    transactionsUnsubscribe = null;
  }
}

// Mostrar modal con transacciones de una subcategoría
async function showSubcategoryTransactionsModal(description, transactionIds, allTransactions) {
  try {
    // Obtener las transacciones de esta subcategoría
    const subcategoryTransactions = transactionIds
      .map(id => [id, allTransactions[id]])
      .filter(([id, transaction]) => transaction) // Filtrar transacciones que existan
      .sort(([idA, transA], [idB, transB]) => {
        // Ordenar por fecha descendente (más reciente primero)
        const dateA = transA.date || transA.createdAt || 0;
        const dateB = transB.date || transB.createdAt || 0;
        return dateB - dateA;
      });

    if (subcategoryTransactions.length === 0) {
      await showInfo('No hay transacciones', `No se encontraron transacciones para la subcategoría "${description}"`);
      return;
    }

    // Crear contenido del modal
    const modal = document.getElementById('custom-modal');
    const titleEl = document.getElementById('modal-title');
    const messageEl = document.getElementById('modal-message');
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');

    titleEl.textContent = `Transacciones: ${escapeHtml(description)}`;
    
    // Crear lista HTML de transacciones con scrollbar personalizado
    let transactionsHTML = '<div class="space-y-2 max-h-96 overflow-y-auto mb-4 custom-scrollbar">';
    subcategoryTransactions.forEach(([id, transaction]) => {
      const date = transaction.date ? new Date(transaction.date) : (transaction.createdAt ? new Date(transaction.createdAt) : new Date());
      const isIncome = transaction.type === 'income';
      const amountColor = isIncome ? 'text-green-600' : 'text-red-600';
      const prefix = isIncome ? '+' : '-';
      
      const dateStr = formatDate24h(date);
      const subcategoryText = transaction.description || description;
      const notes = transaction.notes && transaction.notes.trim() ? transaction.notes.trim() : '';
      const copyText = notes ? `${dateStr} ${subcategoryText} - ${notes}` : `${dateStr} ${subcategoryText}`;
      
      // Escapar solo las comillas dobles para el atributo HTML, pero mantener el texto original
      const escapedCopyText = copyText.replace(/"/g, '&quot;');
      
      transactionsHTML += `
        <div class="border border-gray-200 p-2 transaction-item cursor-pointer hover:bg-gray-50 hover:border-red-300 transition-colors" data-transaction-id="${id}" data-copy-text="${escapedCopyText}" title="Click para copiar al portapapeles">
          <div class="space-y-0.5">
            <div class="flex justify-between items-center">
              <div class="text-[10px] text-gray-500">${dateStr}</div>
              <div class="text-xs font-medium ${amountColor}">
                ${prefix}$${formatNumber(parseFloat(transaction.amount || 0))}
              </div>
            </div>
            <div class="text-[10px] text-gray-500">${escapeHtml(transaction.categoryName || 'Sin categoría')}</div>
            <div class="text-[10px] text-gray-500">${escapeHtml(transaction.accountName || 'Sin cuenta')}</div>
            <div class="text-[10px] text-gray-500 mt-1 pt-1 border-t border-gray-100">
              ${escapeHtml(subcategoryText)}
            </div>
            ${notes ? `<div class="text-[10px] text-gray-400 mt-1 pt-1 border-t border-gray-100">${escapeHtml(notes)}</div>` : ''}
          </div>
        </div>
      `;
    });
    transactionsHTML += '</div>';
    
    messageEl.innerHTML = `
      <div>
        <p class="text-xs text-gray-700 mb-3">Se encontraron ${subcategoryTransactions.length} transacción(es) con esta subcategoría.</p>
        ${transactionsHTML}
      </div>
    `;
    
    confirmBtn.style.display = 'none';
    cancelBtn.textContent = 'Cerrar';

    // Hacer el modal más ancho para las transacciones de subcategoría
    const modalContent = modal.querySelector('.bg-white');
    if (modalContent) {
      modalContent.classList.remove('max-w-md');
      modalContent.classList.add('max-w-2xl');
    }

    modal.classList.remove('hidden');

    const handleCancel = () => {
      modal.classList.add('hidden');
      messageEl.innerHTML = '';
      confirmBtn.style.display = '';
      cancelBtn.removeEventListener('click', handleCancel);
      modal.removeEventListener('click', handleBackgroundClick);
      
      // Restaurar el tamaño original del modal
      const modalContent = modal.querySelector('.bg-white');
      if (modalContent) {
        modalContent.classList.remove('max-w-2xl');
        modalContent.classList.add('max-w-md');
      }
    };

    // Cerrar al hacer click fuera del modal
    const handleBackgroundClick = (e) => {
      if (e.target === modal) {
        handleCancel();
      }
    };

    // Función para copiar texto al portapapeles
    const handleCopySearch = async (e) => {
      // Buscar el elemento transaction-item más cercano
      const transactionItem = e.target.closest('.transaction-item');
      if (!transactionItem) return;
      
      // Obtener el texto del atributo data-copy-text usando getAttribute para obtener el valor crudo
      let copyText = transactionItem.getAttribute('data-copy-text');
      if (!copyText) return;
      
      // Decodificar entidades HTML manualmente
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = copyText;
      copyText = tempDiv.textContent || tempDiv.innerText || copyText;
      
      try {
        // Copiar al portapapeles
        await navigator.clipboard.writeText(copyText);
        
        // Mostrar feedback visual temporal en toda la tarjeta
        const originalBg = transactionItem.style.backgroundColor;
        const originalBorder = transactionItem.style.borderColor;
        transactionItem.style.backgroundColor = '#dcfce7'; // green-100
        transactionItem.style.borderColor = '#16a34a'; // green-600
        
        // Agregar texto de confirmación temporalmente
        const originalHTML = transactionItem.innerHTML;
        const confirmDiv = document.createElement('div');
        confirmDiv.className = 'text-[10px] text-green-600 font-medium text-center py-1';
        confirmDiv.textContent = '✓ Copiado al portapapeles';
        transactionItem.insertBefore(confirmDiv, transactionItem.firstChild);
        
        setTimeout(() => {
          transactionItem.style.backgroundColor = originalBg;
          transactionItem.style.borderColor = originalBorder;
          confirmDiv.remove();
        }, 1500);
      } catch (error) {
        logger.error('Error al copiar', error);
        // Fallback: usar el método antiguo
        const textArea = document.createElement('textarea');
        textArea.value = copyText;
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand('copy');
          
          // Mostrar feedback visual temporal en toda la tarjeta
          const originalBg = transactionItem.style.backgroundColor;
          const originalBorder = transactionItem.style.borderColor;
          transactionItem.style.backgroundColor = '#dcfce7'; // green-100
          transactionItem.style.borderColor = '#16a34a'; // green-600
          
          // Agregar texto de confirmación temporalmente
          const originalHTML = transactionItem.innerHTML;
          const confirmDiv = document.createElement('div');
          confirmDiv.className = 'text-[10px] text-green-600 font-medium text-center py-1';
          confirmDiv.textContent = '✓ Copiado al portapapeles';
          transactionItem.insertBefore(confirmDiv, transactionItem.firstChild);
          
          setTimeout(() => {
            transactionItem.style.backgroundColor = originalBg;
            transactionItem.style.borderColor = originalBorder;
            confirmDiv.remove();
          }, 1500);
        } catch (err) {
          logger.error('Error al copiar', err);
        }
        document.body.removeChild(textArea);
      }
    };

    // Esperar a que el DOM se actualice antes de agregar listeners
    setTimeout(() => {
      cancelBtn.addEventListener('click', handleCancel);
      modal.addEventListener('click', handleBackgroundClick);
      
      // Agregar listeners para copiar al hacer click en cualquier parte de la tarjeta
      document.querySelectorAll('.transaction-item').forEach(element => {
        element.addEventListener('click', handleCopySearch);
      });
    }, 10);
  } catch (error) {
    logger.error('Error showing subcategory transactions modal', error);
    await showError('Error al cargar las transacciones de la subcategoría');
  }
}

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
function calculateTrendGraph(transactions, subcategoryName = '') {
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
  const tooltip = subcategoryName 
    ? `Tendencia semanal: ${subcategoryName} (${numWeeks} ${numWeeks === 1 ? 'semana' : 'semanas'}) - Click para ampliar`
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
function showTrendGraphModal(subcategoryName, transactions) {
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
  modalTitle.textContent = `Tendencia Semanal: ${escapeHtml(subcategoryName)}`;
  
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

// Make functions available globally
window.loadCategories = loadCategories;
window.cleanupCategories = cleanupCategories;
window.hideCategoryForm = hideCategoryForm;
window.loadCategoriesForTransaction = loadCategoriesForTransaction;

// Pending edit subcategory (modal)
let editSubcategoryPending = null;

function setupEditSubcategoryModalListeners() {
  const modal = document.getElementById('edit-subcategory-modal');
  if (!modal || modal.dataset.listenersAttached === 'true') return;
  modal.dataset.listenersAttached = 'true';

  const closeBtn = document.getElementById('close-edit-subcategory-modal');
  const cancelBtn = document.getElementById('cancel-edit-subcategory-btn');
  const confirmBtn = document.getElementById('confirm-edit-subcategory-btn');
  const newValueInput = document.getElementById('edit-subcategory-new-value');

  function hideEditSubcategoryModal() {
    editSubcategoryPending = null;
    if (modal) modal.classList.add('hidden');
  }

  function onConfirm() {
    const pending = editSubcategoryPending;
    if (!pending) return;
    const newVal = (newValueInput?.value || '').trim();
    if (!newVal) {
      showError('La nueva descripción no puede estar vacía');
      if (newValueInput) newValueInput.focus();
      return;
    }
    if (newVal === pending.oldDescription) {
      hideEditSubcategoryModal();
      return;
    }
    hideEditSubcategoryModal();
    doUpdateSubcategory(pending.oldDescription, newVal, pending.transactionIds);
  }

  if (closeBtn) closeBtn.addEventListener('click', hideEditSubcategoryModal);
  if (cancelBtn) cancelBtn.addEventListener('click', hideEditSubcategoryModal);
  if (confirmBtn) confirmBtn.addEventListener('click', onConfirm);
  if (newValueInput) {
    newValueInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      }
    });
  }
  modal.addEventListener('click', (e) => {
    if (e.target === modal) hideEditSubcategoryModal();
  });
}

// Editar subcategoría (muestra modal custom)
function editSubcategory(oldDescription, transactionIds) {
  const nrd = window.nrd;
  if (!nrd) {
    showError('Servicio NRD no disponible');
    return;
  }
  setupEditSubcategoryModalListeners();
  const modal = document.getElementById('edit-subcategory-modal');
  const oldValueEl = document.getElementById('edit-subcategory-old-value');
  const newValueInput = document.getElementById('edit-subcategory-new-value');
  if (!modal || !oldValueEl || !newValueInput) return;
  editSubcategoryPending = { oldDescription, transactionIds };
  oldValueEl.textContent = oldDescription;
  newValueInput.value = oldDescription;
  modal.classList.remove('hidden');
  newValueInput.focus();
  newValueInput.select();
}

// Ejecutar la actualización de subcategoría (tras Aceptar en el modal)
async function doUpdateSubcategory(oldDescription, trimmedNewDescription, transactionIds) {
  const nrd = window.nrd;
  if (!nrd) {
    await showError('Servicio NRD no disponible');
    return;
  }
  showSpinner(`Actualizando ${transactionIds.length} transacción(es)...`);
  try {
    logger.info('Editing subcategory', { oldDescription, newDescription: trimmedNewDescription, transactionCount: transactionIds.length });
    for (const transactionId of transactionIds) {
      await nrd.transactions.update(transactionId, { description: trimmedNewDescription });
    }
    const user = nrd?.auth?.getCurrentUser() || null;
    logger.audit('BATCH_UPDATE', { entity: 'transaction', field: 'description', count: transactionIds.length, oldValue: oldDescription, newValue: trimmedNewDescription, uid: user?.uid, email: user?.email, timestamp: Date.now() });
    logger.info('Subcategory edited successfully', { transactionCount: transactionIds.length });
    hideSpinner();
    await showSuccess(`${transactionIds.length} transacción(es) actualizada(s) exitosamente`);
    loadCategories();
  } catch (error) {
    hideSpinner();
    logger.error('Error editing subcategory', error);
    await showError('Error al actualizar descripción: ' + error.message);
  }
}

// Eliminar subcategoría
async function deleteSubcategory(description, transactionIds) {
  const nrd = window.nrd;
  if (!nrd) {
    await showError('Servicio NRD no disponible');
    return;
  }
  
  const confirmMessage = `¿Está seguro de eliminar la descripción "${description}"?\n\nEsto afectará ${transactionIds.length} transacción(es). Las transacciones quedarán sin descripción específica.`;
  
  if (!confirm(confirmMessage)) {
    return;
  }
  
  showSpinner(`Eliminando descripción de ${transactionIds.length} transacción(es)...`);
  
  try {
    logger.info('Deleting subcategory', { description, transactionCount: transactionIds.length });
    // Update each transaction individually using NRD Data Access
    for (const transactionId of transactionIds) {
      await nrd.transactions.update(transactionId, { description: '' });
    }
    const user = nrd?.auth?.getCurrentUser() || null;
    logger.audit('BATCH_UPDATE', { entity: 'transaction', field: 'description', count: transactionIds.length, oldValue: description, newValue: '', uid: user?.uid, email: user?.email, timestamp: Date.now() });
    logger.info('Subcategory deleted successfully', { transactionCount: transactionIds.length });
    hideSpinner();
    await showSuccess(`Descripción eliminada de ${transactionIds.length} transacción(es)`);
    
    // Recargar categorías para actualizar la tabla
    loadCategories();
  } catch (error) {
    hideSpinner();
    logger.error('Error deleting subcategory', error);
    await showError('Error al eliminar descripción: ' + error.message);
  }
}

// Show category form
function showCategoryForm(categoryId = null) {
  const form = document.getElementById('category-form');
  const list = document.getElementById('categories-list');
  const header = document.querySelector('#categories-view .flex.flex-col');
  const title = document.getElementById('category-form-title');
  const formElement = document.getElementById('category-form-element');
  
  if (form) form.classList.remove('hidden');
  if (list) list.style.display = 'none';
  if (header) header.style.display = 'none';
  
  if (formElement) {
    formElement.reset();
    const categoryIdInput = document.getElementById('category-id');
    if (categoryIdInput) categoryIdInput.value = categoryId || '';
  }

  const subtitle = document.getElementById('category-form-subtitle');
  const saveBtn = document.getElementById('save-category-form-btn');
  
  if (categoryId) {
    if (title) title.textContent = 'Ver Categoría';
    if (subtitle) subtitle.textContent = 'Visualice la información de la categoría';
    // Cambiar color del header a gris para detalle
    const formHeader = document.getElementById('category-form-header');
    if (formHeader) {
      formHeader.classList.remove('bg-green-600', 'bg-blue-600');
      formHeader.classList.add('bg-gray-600');
    }
    // Set to view mode
    form.dataset.viewMode = 'view';
    
    // Update button visibility - show edit, delete, toggle active, close buttons
    const deleteBtn = document.getElementById('delete-category-form-btn');
    const editBtn = document.getElementById('edit-category-form-btn');
    const toggleActiveBtn = document.getElementById('toggle-category-active-btn');
    const closeBtn = document.getElementById('close-category-form-btn');
    const saveBtn = document.getElementById('save-category-form-btn');
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
    const nameInput = document.getElementById('category-name');
    const typeInput = document.getElementById('category-type');
    if (nameInput) {
      nameInput.setAttribute('readonly', 'readonly');
      nameInput.setAttribute('disabled', 'disabled');
    }
    if (typeInput) {
      typeInput.setAttribute('readonly', 'readonly');
      typeInput.setAttribute('disabled', 'disabled');
    }
    
    // Load category using NRD Data Access
    (async () => {
      try {
        const category = await nrd.categories.getById(categoryId);
        if (category) {
          if (nameInput) nameInput.value = category.name || '';
          if (typeInput) typeInput.value = category.type || 'expense';
          
          // Update toggle active button
          const isActive = category.active !== false;
          if (toggleActiveBtn) {
            toggleActiveBtn.style.display = 'flex';
            toggleActiveBtn.textContent = isActive ? 'Desactivar' : 'Activar';
            toggleActiveBtn.className = isActive 
              ? 'flex-1 px-4 sm:px-6 py-2 bg-yellow-600 text-white border border-yellow-600 hover:bg-yellow-700 transition-colors uppercase tracking-wider text-xs sm:text-sm font-light'
              : 'flex-1 px-4 sm:px-6 py-2 bg-green-600 text-white border border-green-600 hover:bg-green-700 transition-colors uppercase tracking-wider text-xs sm:text-sm font-light';
          }
        }
      } catch (error) {
        logger.error('Error loading category', error);
      }
    })();
  } else {
    if (title) title.textContent = 'Nueva Categoría';
    if (subtitle) subtitle.textContent = 'Cree una nueva categoría para organizar transacciones';
    // Cambiar color del header a verde para nuevo
    const formHeader = document.getElementById('category-form-header');
    if (formHeader) {
      formHeader.classList.remove('bg-blue-600', 'bg-gray-600');
      formHeader.classList.add('bg-green-600');
    }
    const saveBtn = document.getElementById('save-category-form-btn');
    // Cambiar color del botón guardar a verde
    if (saveBtn) {
      saveBtn.classList.remove('bg-blue-600', 'border-blue-600', 'hover:bg-blue-700');
      saveBtn.classList.add('bg-green-600', 'border-green-600', 'hover:bg-green-700');
    }
    delete form.dataset.viewMode;
    
    // Update button visibility - hide edit/delete/toggle, show save/close
    const deleteBtn = document.getElementById('delete-category-form-btn');
    const editBtn = document.getElementById('edit-category-form-btn');
    const toggleActiveBtn = document.getElementById('toggle-category-active-btn');
    const closeBtn = document.getElementById('close-category-form-btn');
    if (deleteBtn) {
      deleteBtn.style.display = 'none';
      deleteBtn.classList.add('hidden');
    }
    if (editBtn) {
      editBtn.style.display = 'none';
      editBtn.classList.add('hidden');
    }
    if (toggleActiveBtn) {
      toggleActiveBtn.style.display = 'none';
      toggleActiveBtn.classList.add('hidden');
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
    const nameInput = document.getElementById('category-name');
    const typeInput = document.getElementById('category-type');
    if (nameInput) {
      nameInput.removeAttribute('readonly');
      nameInput.removeAttribute('disabled');
    }
    if (typeInput) {
      typeInput.removeAttribute('readonly');
      typeInput.removeAttribute('disabled');
      typeInput.value = 'expense';
    }
  }
}

// Hide category form
function hideCategoryForm() {
  const form = document.getElementById('category-form');
  const list = document.getElementById('categories-list');
  const header = document.querySelector('#categories-view .flex.flex-col');
  
  if (form) form.classList.add('hidden');
  if (list) list.style.display = 'block';
  if (header) header.style.display = 'flex';
}

// View category detail
async function viewCategory(categoryId) {
  const nrd = window.nrd;
  if (!nrd) {
    await showError('Servicio NRD no disponible');
    return;
  }
  
  logger.debug('Viewing category', { categoryId });
  showSpinner('Cargando categoría...');
  try {
    const category = await nrd.categories.getById(categoryId);
    hideSpinner();
    if (!category) {
      logger.warn('Category not found', { categoryId });
      await showError('Categoría no encontrada');
      return;
    }

    logger.debug('Category loaded successfully', { categoryId, name: category.name });
    // Show edit form instead of detail view
    showCategoryForm(categoryId);
  } catch (error) {
    hideSpinner();
    logger.error('Error loading category', error);
    await showError('Error al cargar categoría: ' + error.message);
  }
}

// Category form submit
document.getElementById('category-form-element').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const nrd = window.nrd;
  if (!nrd) {
    await showError('Servicio NRD no disponible');
    return;
  }
  
  const categoryId = document.getElementById('category-id').value;
  const name = document.getElementById('category-name').value.trim();
  const type = document.getElementById('category-type').value;

  if (!name || !type) {
    await showError('Por favor complete todos los campos requeridos');
    return;
  }

  showSpinner('Guardando categoría...');
  try {
    // Get current category to preserve active status if editing
    let active = true;
    if (categoryId) {
      const category = await nrd.categories.getById(categoryId);
      if (category) {
        active = category.active !== false; // Preserve existing status
      }
    }
    
    const user = nrd?.auth?.getCurrentUser() || null;
    if (categoryId) {
      logger.info('Updating category', { categoryId, name, type, active });
      await nrd.categories.update(categoryId, { name, type, active });
      logger.audit('ENTITY_UPDATE', { entity: 'category', id: categoryId, data: { name, type, active }, uid: user?.uid, email: user?.email, timestamp: Date.now() });
      logger.info('Category updated successfully', { categoryId });
    } else {
      logger.info('Creating new category', { name, type, active });
      const id = await nrd.categories.create({ name, type, active: true });
      logger.audit('ENTITY_CREATE', { entity: 'category', id, data: { name, type, active: true }, uid: user?.uid, email: user?.email, timestamp: Date.now() });
      logger.info('Category created successfully', { id, name });
    }
    hideSpinner();
    hideCategoryForm();
    await showSuccess('Categoría guardada exitosamente');
  } catch (error) {
    hideSpinner();
    logger.error('Error saving category', error);
    await showError('Error al guardar categoría: ' + error.message);
  }
});

// New category button
document.getElementById('new-category-btn').addEventListener('click', () => {
  showCategoryForm();
});

// Close category form button
document.getElementById('close-category-form').addEventListener('click', () => {
  hideCategoryForm();
});
document.getElementById('close-category-form-btn').addEventListener('click', () => {
  hideCategoryForm();
});

// Edit button - switch to edit mode
document.getElementById('edit-category-form-btn').addEventListener('click', async () => {
  const form = document.getElementById('category-form');
  const categoryId = document.getElementById('category-id').value;
  if (categoryId) {
    // Change to edit mode
    form.dataset.viewMode = 'edit';
    
    // Set form title
    const title = document.getElementById('category-form-title');
    const subtitle = document.getElementById('category-form-subtitle');
    const saveBtn = document.getElementById('save-category-form-btn');
    if (title) title.textContent = 'Editar Categoría';
    if (subtitle) subtitle.textContent = 'Modifique la información de la categoría';
    // Cambiar color del header a azul para edición
    const formHeader = document.getElementById('category-form-header');
    if (formHeader) {
      formHeader.classList.remove('bg-green-600', 'bg-gray-600');
      formHeader.classList.add('bg-blue-600');
    }
    // Cambiar color del botón guardar a azul
    if (saveBtn) {
      saveBtn.classList.remove('bg-green-600', 'border-green-600', 'hover:bg-green-700');
      saveBtn.classList.add('bg-blue-600', 'border-blue-600', 'hover:bg-blue-700');
    }
    
    // Enable fields
    const nameInput = document.getElementById('category-name');
    const typeInput = document.getElementById('category-type');
    if (nameInput) {
      nameInput.removeAttribute('readonly');
      nameInput.removeAttribute('disabled');
    }
    if (typeInput) {
      typeInput.removeAttribute('readonly');
      typeInput.removeAttribute('disabled');
    }
    
    // Update buttons
    const editBtn = document.getElementById('edit-category-form-btn');
    const deleteBtn = document.getElementById('delete-category-form-btn');
    const toggleActiveBtn = document.getElementById('toggle-category-active-btn');
    const closeBtn = document.getElementById('close-category-form-btn');
    // saveBtn ya está declarado arriba
    if (editBtn) {
      editBtn.style.display = 'none';
      editBtn.classList.add('hidden');
    }
    if (deleteBtn) {
      deleteBtn.style.display = 'none';
      deleteBtn.classList.add('hidden');
    }
    if (toggleActiveBtn) {
      toggleActiveBtn.style.display = 'none';
      toggleActiveBtn.classList.add('hidden');
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
document.getElementById('save-category-form-btn').addEventListener('click', async () => {
  const categoryForm = document.getElementById('category-form-element');
  if (categoryForm) {
    categoryForm.dispatchEvent(new Event('submit'));
  }
});

// Toggle active button - activate/deactivate category
document.getElementById('toggle-category-active-btn').addEventListener('click', async () => {
  const nrd = window.nrd;
  if (!nrd) {
    await showError('Servicio NRD no disponible');
    return;
  }
  
  const categoryId = document.getElementById('category-id').value;
  if (!categoryId) return;
  
  showSpinner('Actualizando categoría...');
  try {
    const category = await nrd.categories.getById(categoryId);
    if (!category) {
      logger.warn('Category not found', { categoryId });
      await showError('Categoría no encontrada');
      hideSpinner();
      return;
    }
    
    const currentActive = category.active !== false;
    const newActive = !currentActive;
    
    const user = nrd?.auth?.getCurrentUser() || null;
    logger.info('Toggling category active status', { categoryId, currentActive, newActive });
    await nrd.categories.update(categoryId, { 
      name: category.name, 
      type: category.type, 
      active: newActive 
    });
    logger.audit('ENTITY_UPDATE', { entity: 'category', id: categoryId, data: { active: newActive }, uid: user?.uid, email: user?.email, timestamp: Date.now() });
    logger.info('Category active status toggled successfully', { categoryId, newActive });
    
    hideSpinner();
    
    // Reload category form to update button
    showCategoryForm(categoryId);
    await showSuccess(`Categoría ${newActive ? 'activada' : 'desactivada'} exitosamente`);
  } catch (error) {
    hideSpinner();
    logger.error('Error toggling category active status', error);
    await showError('Error al actualizar categoría: ' + error.message);
  }
});

// Delete button - delete category if editing
document.getElementById('delete-category-form-btn').addEventListener('click', async () => {
  const nrd = window.nrd;
  if (!nrd) {
    await showError('Servicio NRD no disponible');
    return;
  }
  
  const categoryId = document.getElementById('category-id').value;
  if (categoryId) {
    // Check if category has associated transactions
    showSpinner('Verificando transacciones...');
    try {
      const transactions = getTransactionsDict();
      
      // Find transactions associated with this category
      const associatedTransactions = Object.entries(transactions).filter(
        ([id, transaction]) => transaction && transaction.categoryId === categoryId
      );
      
      hideSpinner();
      
      if (associatedTransactions.length > 0) {
        // Show modal with transactions list
        const result = await showTransactionsListModal(
          'No se puede eliminar la categoría',
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
      const confirmed = await showConfirm('Eliminar Categoría', '¿Está seguro de eliminar esta categoría?');
      if (!confirmed) return;
      
      showSpinner('Eliminando categoría...');
      const user = nrd?.auth?.getCurrentUser() || null;
      logger.info('Deleting category', { categoryId });
      await nrd.categories.delete(categoryId);
      logger.audit('ENTITY_DELETE', { entity: 'category', id: categoryId, uid: user?.uid, email: user?.email, timestamp: Date.now() });
      logger.info('Category deleted successfully', { categoryId });
      hideSpinner();
      hideCategoryForm();
      await showSuccess('Categoría eliminada exitosamente');
    } catch (error) {
      hideSpinner();
      await showError('Error al eliminar categoría: ' + error.message);
    }
  } else {
    // If new category, just close
    hideCategoryForm();
  }
});

// Load categories for transaction form, ordered by last use with the selected account
async function loadCategoriesForTransaction(type, accountId = null) {
  const nrd = window.nrd;
  if (!nrd) {
    logger.error('NRD service not available');
    return [];
  }
  
  logger.debug('Loading categories for transaction form', { type, accountId });
  try {
    let categories = getCategoriesDict();
    if (Object.keys(categories).length === 0) {
      await initializeCategoriesStore();
      categories = getCategoriesDict();
    }
    
    let categoriesList = Object.entries(categories)
      .filter(([id, category]) => category.type === type && (category.active !== false))
        .map(([id, category]) => ({ id, ...category }));
    
    // Si hay una cuenta seleccionada, ordenar por último uso en esa cuenta
    if (accountId) {
      try {
        const transactions = getTransactionsDict();
      
        // Calcular último uso de cada categoría en esta cuenta
        const categoryLastUse = {};
        Object.values(transactions).forEach(transaction => {
          if (transaction && 
              transaction.accountId === accountId && 
              transaction.categoryId && 
              transaction.type === type) {
            const transactionDate = transaction.date || transaction.createdAt || 0;
            const catId = transaction.categoryId;
            
            if (!categoryLastUse[catId] || transactionDate > categoryLastUse[catId]) {
              categoryLastUse[catId] = transactionDate;
            }
          }
        });
        
        // Ordenar categorías: primero las usadas en esta cuenta (más reciente primero), luego las demás
        categoriesList.sort((a, b) => {
          const lastUseA = categoryLastUse[a.id] || 0;
          const lastUseB = categoryLastUse[b.id] || 0;
          
          // Si ambas tienen uso, ordenar por fecha (más reciente primero)
          if (lastUseA > 0 && lastUseB > 0) {
            return lastUseB - lastUseA;
          }
          // Si solo una tiene uso, esa va primero
          if (lastUseA > 0 && lastUseB === 0) return -1;
          if (lastUseA === 0 && lastUseB > 0) return 1;
          // Si ninguna tiene uso, mantener orden alfabético
          return a.name.localeCompare(b.name);
        });
      } catch (error) {
        logger.error('Error loading category usage', error);
        // En caso de error, mantener orden alfabético
        categoriesList.sort((a, b) => a.name.localeCompare(b.name));
      }
    } else {
      // Sin cuenta seleccionada, orden alfabético
      categoriesList.sort((a, b) => a.name.localeCompare(b.name));
    }
    
    return categoriesList;
  } catch (error) {
    logger.error('Error loading categories for transaction form', error);
    return [];
  }
}

// escapeHtml is now available from NRDCommon (window.escapeHtml)

