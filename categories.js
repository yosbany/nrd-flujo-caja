// Category management

let categoriesListener = null;

// Load categories
function loadCategories() {
  const categoriesList = document.getElementById('categories-list');
  if (!categoriesList) return;
  
  categoriesList.innerHTML = '';

  // Remove previous listener
  if (categoriesListener) {
    getCategoriesRef().off('value', categoriesListener);
    categoriesListener = null;
  }

  // Listen for categories and transactions
  categoriesListener = getCategoriesRef().on('value', async (snapshot) => {
    if (!categoriesList) return;
    categoriesList.innerHTML = '';
    const categories = snapshot.val() || {};

    if (Object.keys(categories).length === 0) {
      categoriesList.innerHTML = '<p class="text-center text-gray-600 py-6 sm:py-8 text-sm sm:text-base">No hay categorías registradas</p>';
      return;
    }

    // Get all transactions to calculate totals
    const transactionsSnapshot = await getTransactionsRef().once('value');
    const transactions = transactionsSnapshot.val() || {};
    
    // Calculate totals per category
    const categoryTotals = {};
    Object.values(transactions).forEach(transaction => {
      if (transaction && transaction.categoryId) {
        const categoryId = transaction.categoryId;
        if (!categoryTotals[categoryId]) {
          categoryTotals[categoryId] = 0;
        }
        categoryTotals[categoryId] += parseFloat(transaction.amount) || 0;
      }
    });

    // Separate by type
    const incomeCategories = [];
    const expenseCategories = [];

    Object.entries(categories).forEach(([id, category]) => {
      if (category.type === 'income') {
        incomeCategories.push([id, category, categoryTotals[id] || 0]);
      } else {
        expenseCategories.push([id, category, categoryTotals[id] || 0]);
      }
    });

    // Show income categories
    if (incomeCategories.length > 0) {
      const incomeSection = document.createElement('div');
      incomeSection.className = 'mb-4 sm:mb-6';
      incomeSection.innerHTML = '<h3 class="text-sm sm:text-base font-light text-gray-600 mb-2 sm:mb-3 uppercase tracking-wider">Ingresos</h3>';
      categoriesList.appendChild(incomeSection);

      incomeCategories.forEach(([id, category, total]) => {
        const item = document.createElement('div');
        item.className = 'border border-gray-200 p-3 sm:p-4 md:p-6 hover:border-green-600 transition-colors cursor-pointer mb-2 sm:mb-3';
        item.dataset.categoryId = id;
        const formattedTotal = new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'UYU' }).format(total);
        item.innerHTML = `
          <div class="flex justify-between items-center">
            <div class="text-base sm:text-lg font-light text-green-600">${escapeHtml(category.name)}</div>
            <div class="text-sm sm:text-base font-light text-green-600">${formattedTotal}</div>
          </div>
        `;
        item.addEventListener('click', () => viewCategory(id));
        categoriesList.appendChild(item);
      });
    }

    // Show expense categories
    if (expenseCategories.length > 0) {
      const expenseSection = document.createElement('div');
      expenseSection.className = 'mb-4 sm:mb-6';
      expenseSection.innerHTML = '<h3 class="text-sm sm:text-base font-light text-gray-600 mb-2 sm:mb-3 uppercase tracking-wider">Egresos</h3>';
      categoriesList.appendChild(expenseSection);

      expenseCategories.forEach(([id, category, total]) => {
        const item = document.createElement('div');
        item.className = 'border border-gray-200 p-3 sm:p-4 md:p-6 hover:border-red-600 transition-colors cursor-pointer mb-2 sm:mb-3';
        item.dataset.categoryId = id;
        const formattedTotal = new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'UYU' }).format(total);
        item.innerHTML = `
          <div class="flex justify-between items-center">
            <div class="text-base sm:text-lg font-light text-red-600">${escapeHtml(category.name)}</div>
            <div class="text-sm sm:text-base font-light text-red-600">${formattedTotal}</div>
          </div>
        `;
        item.addEventListener('click', () => viewCategory(id));
        categoriesList.appendChild(item);
      });
    }
    
    // Cargar tabla de subcategorías al final
    loadSubcategoriesTable(categoriesList);
  });
}

// Cargar tabla de subcategorías (descripciones únicas)
async function loadSubcategoriesTable(container) {
  try {
    // Obtener todas las transacciones
    const transactionsSnapshot = await getTransactionsRef().once('value');
    const transactions = transactionsSnapshot.val() || {};
    
    // Extraer descripciones únicas, contar transacciones y calcular suma de montos
    const subcategoriesMap = {};
    Object.entries(transactions).forEach(([id, transaction]) => {
      if (transaction && transaction.description && transaction.description.trim()) {
        const desc = transaction.description.trim();
        if (!subcategoriesMap[desc]) {
          subcategoriesMap[desc] = { count: 0, transactionIds: [], total: 0 };
        }
        subcategoriesMap[desc].count++;
        subcategoriesMap[desc].transactionIds.push(id);
        // Sumar el monto (positivo para ingresos, negativo para egresos)
        const amount = parseFloat(transaction.amount) || 0;
        if (transaction.type === 'expense') {
          subcategoriesMap[desc].total -= amount; // Egresos son negativos
        } else {
          subcategoriesMap[desc].total += amount; // Ingresos son positivos
        }
      }
    });
    
    // Crear sección de subcategorías
    const subcategoriesSection = document.createElement('div');
    subcategoriesSection.className = 'mt-8 sm:mt-10 pt-6 sm:pt-8 border-t border-gray-300';
    subcategoriesSection.innerHTML = '<h3 class="text-sm sm:text-base font-light text-gray-600 mb-4 sm:mb-6 uppercase tracking-wider">Subcategorías (Descripciones)</h3>';
    
    const subcategoriesList = Object.keys(subcategoriesMap).sort();
    
    if (subcategoriesList.length === 0) {
      subcategoriesSection.innerHTML += '<p class="text-center text-gray-600 py-4 text-sm">No hay subcategorías registradas</p>';
      container.appendChild(subcategoriesSection);
      return;
    }
    
    // Crear tabla
    const table = document.createElement('div');
    table.className = 'overflow-x-auto';
    table.innerHTML = `
      <table class="w-full border-collapse">
        <thead>
          <tr class="bg-gray-100 border-b border-gray-300">
            <th class="text-left p-2 sm:p-3 text-xs sm:text-sm font-light text-gray-700 uppercase tracking-wider">Descripción</th>
            <th class="text-center p-2 sm:p-3 text-xs sm:text-sm font-light text-gray-700 uppercase tracking-wider">Transacciones</th>
            <th class="text-right p-2 sm:p-3 text-xs sm:text-sm font-light text-gray-700 uppercase tracking-wider">Total</th>
            <th class="text-center p-2 sm:p-3 text-xs sm:text-sm font-light text-gray-700 uppercase tracking-wider">Acciones</th>
          </tr>
        </thead>
        <tbody id="subcategories-tbody">
        </tbody>
      </table>
    `;
    
    const tbody = table.querySelector('#subcategories-tbody');
    
    subcategoriesList.forEach((description) => {
      const row = document.createElement('tr');
      row.className = 'border-b border-gray-200 hover:bg-gray-50';
      row.dataset.description = description;
      
      const data = subcategoriesMap[description];
      
      const descCell = document.createElement('td');
      descCell.className = 'p-2 sm:p-3 text-sm sm:text-base font-light';
      descCell.textContent = description;
      
      const countCell = document.createElement('td');
      countCell.className = 'p-2 sm:p-3 text-sm sm:text-base font-light text-center';
      countCell.textContent = data.count;
      
      const totalCell = document.createElement('td');
      totalCell.className = 'p-2 sm:p-3 text-sm sm:text-base font-medium text-right';
      // Usar valor absoluto para quitar el signo menos
      const absoluteTotal = Math.abs(data.total);
      const formattedTotal = new Intl.NumberFormat('es-UY', { 
        style: 'currency', 
        currency: 'UYU',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(absoluteTotal);
      totalCell.textContent = formattedTotal;
      
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
      row.appendChild(countCell);
      row.appendChild(totalCell);
      row.appendChild(actionsCell);
      
      tbody.appendChild(row);
    });
    
    subcategoriesSection.appendChild(table);
    container.appendChild(subcategoriesSection);
  } catch (error) {
    console.error('Error loading subcategories:', error);
  }
}

// Editar subcategoría
async function editSubcategory(oldDescription, transactionIds) {
  const newDescription = prompt(`Editar descripción:\n\nDescripción actual: ${oldDescription}\n\nNueva descripción:`, oldDescription);
  
  if (!newDescription || newDescription.trim() === '' || newDescription.trim() === oldDescription) {
    return;
  }
  
  const trimmedNewDescription = newDescription.trim();
  
  if (trimmedNewDescription === oldDescription) {
    return;
  }
  
  showSpinner(`Actualizando ${transactionIds.length} transacción(es)...`);
  
  try {
    const updates = {};
    transactionIds.forEach(transactionId => {
      updates[`transactions/${transactionId}/description`] = trimmedNewDescription;
    });
    
    await database.ref().update(updates);
    hideSpinner();
    await showSuccess(`${transactionIds.length} transacción(es) actualizada(s) exitosamente`);
    
    // Recargar categorías para actualizar la tabla
    loadCategories();
  } catch (error) {
    hideSpinner();
    await showError('Error al actualizar descripción: ' + error.message);
  }
}

// Eliminar subcategoría
async function deleteSubcategory(description, transactionIds) {
  const confirmMessage = `¿Está seguro de eliminar la descripción "${description}"?\n\nEsto afectará ${transactionIds.length} transacción(es). Las transacciones quedarán sin descripción específica.`;
  
  if (!confirm(confirmMessage)) {
    return;
  }
  
  showSpinner(`Eliminando descripción de ${transactionIds.length} transacción(es)...`);
  
  try {
    const updates = {};
    transactionIds.forEach(transactionId => {
      updates[`transactions/${transactionId}/description`] = '';
    });
    
    await database.ref().update(updates);
    hideSpinner();
    await showSuccess(`Descripción eliminada de ${transactionIds.length} transacción(es)`);
    
    // Recargar categorías para actualizar la tabla
    loadCategories();
  } catch (error) {
    hideSpinner();
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

  if (categoryId) {
    if (title) title.textContent = 'Editar Categoría';
    getCategory(categoryId).then(snapshot => {
      const category = snapshot.val();
      if (category) {
        const nameInput = document.getElementById('category-name');
        const typeInput = document.getElementById('category-type');
        if (nameInput) nameInput.value = category.name || '';
        if (typeInput) typeInput.value = category.type || 'expense';
      }
    });
  } else {
    if (title) title.textContent = 'Nueva Categoría';
    const typeInput = document.getElementById('category-type');
    if (typeInput) typeInput.value = 'expense';
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
  showSpinner('Cargando categoría...');
  try {
    const snapshot = await getCategory(categoryId);
    const category = snapshot.val();
    hideSpinner();
    if (!category) {
      await showError('Categoría no encontrada');
      return;
    }

    const typeColor = category.type === 'income' ? 'text-green-600' : 'text-red-600';
    const typeText = category.type === 'income' ? 'Ingreso' : 'Egreso';

    await showInfo(`Categoría: ${category.name}\nTipo: ${typeText}`);
    
    // Show edit form instead of detail view
    showCategoryForm(categoryId);
  } catch (error) {
    hideSpinner();
    await showError('Error al cargar categoría: ' + error.message);
  }
}

// Category form submit
document.getElementById('category-form-element').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const categoryId = document.getElementById('category-id').value;
  const name = document.getElementById('category-name').value.trim();
  const type = document.getElementById('category-type').value;

  if (!name || !type) {
    await showError('Por favor complete todos los campos requeridos');
    return;
  }

  showSpinner('Guardando categoría...');
  try {
    if (categoryId) {
      await updateCategory(categoryId, { name, type });
    } else {
      await createCategory({ name, type });
    }
    hideSpinner();
    hideCategoryForm();
    await showSuccess('Categoría guardada exitosamente');
  } catch (error) {
    hideSpinner();
    await showError('Error al guardar categoría: ' + error.message);
  }
});

// New category button
document.getElementById('new-category-btn').addEventListener('click', () => {
  showCategoryForm();
});

// Cancel category form
document.getElementById('cancel-category-btn').addEventListener('click', () => {
  hideCategoryForm();
});

// Close category form button
document.getElementById('close-category-form').addEventListener('click', () => {
  hideCategoryForm();
});

// Load categories for transaction form
function loadCategoriesForTransaction(type) {
  return getCategoriesRef().once('value').then(snapshot => {
    const categories = snapshot.val() || {};
    return Object.entries(categories)
      .filter(([id, category]) => category.type === type)
      .map(([id, category]) => ({ id, ...category }));
  });
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

