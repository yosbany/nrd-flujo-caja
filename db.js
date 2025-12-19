// Database helper functions

// Get user reference
function getUserRef() {
  const user = getCurrentUser();
  if (!user) throw new Error('Usuario no autenticado');
  return database.ref(`users/${user.uid}`);
}

// Get transactions reference (shared across all users)
function getTransactionsRef() {
  return database.ref('transactions');
}

// Get categories reference (shared across all users)
function getCategoriesRef() {
  return database.ref('categories');
}

// Get transaction by ID
function getTransaction(transactionId) {
  return getTransactionsRef().child(transactionId).once('value');
}

// Get category by ID
function getCategory(categoryId) {
  return getCategoriesRef().child(categoryId).once('value');
}

// Create transaction
function createTransaction(transactionData) {
  return getTransactionsRef().push(transactionData);
}

// Update transaction
function updateTransaction(transactionId, transactionData) {
  return getTransactionsRef().child(transactionId).update(transactionData);
}

// Delete transaction
function deleteTransaction(transactionId) {
  return getTransactionsRef().child(transactionId).remove();
}

// Create category
function createCategory(categoryData) {
  return getCategoriesRef().push(categoryData);
}

// Update category
function updateCategory(categoryId, categoryData) {
  return getCategoriesRef().child(categoryId).update(categoryData);
}

// Delete category
function deleteCategory(categoryId) {
  return getCategoriesRef().child(categoryId).remove();
}

