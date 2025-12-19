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

  // Listen for categories
  categoriesListener = getCategoriesRef().on('value', (snapshot) => {
    if (!categoriesList) return;
    categoriesList.innerHTML = '';
    const categories = snapshot.val() || {};

    if (Object.keys(categories).length === 0) {
      categoriesList.innerHTML = '<p class="text-center text-gray-600 py-6 sm:py-8 text-sm sm:text-base">No hay categorías registradas</p>';
      return;
    }

    // Separate by type
    const incomeCategories = [];
    const expenseCategories = [];

    Object.entries(categories).forEach(([id, category]) => {
      if (category.type === 'income') {
        incomeCategories.push([id, category]);
      } else {
        expenseCategories.push([id, category]);
      }
    });

    // Show income categories
    if (incomeCategories.length > 0) {
      const incomeSection = document.createElement('div');
      incomeSection.className = 'mb-4 sm:mb-6';
      incomeSection.innerHTML = '<h3 class="text-sm sm:text-base font-light text-gray-600 mb-2 sm:mb-3 uppercase tracking-wider">Ingresos</h3>';
      categoriesList.appendChild(incomeSection);

      incomeCategories.forEach(([id, category]) => {
        const item = document.createElement('div');
        item.className = 'border border-gray-200 p-3 sm:p-4 md:p-6 hover:border-green-600 transition-colors cursor-pointer mb-2 sm:mb-3';
        item.dataset.categoryId = id;
        item.innerHTML = `
          <div class="text-base sm:text-lg font-light text-green-600">${escapeHtml(category.name)}</div>
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

      expenseCategories.forEach(([id, category]) => {
        const item = document.createElement('div');
        item.className = 'border border-gray-200 p-3 sm:p-4 md:p-6 hover:border-red-600 transition-colors cursor-pointer mb-2 sm:mb-3';
        item.dataset.categoryId = id;
        item.innerHTML = `
          <div class="text-base sm:text-lg font-light text-red-600">${escapeHtml(category.name)}</div>
        `;
        item.addEventListener('click', () => viewCategory(id));
        categoriesList.appendChild(item);
      });
    }
  });
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

