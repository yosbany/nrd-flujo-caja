// Shared in-memory cache for /categories — single Firebase listener for the whole app.

const logger = window.logger || console;

let cachedCategories = [];
let firebaseUnsubscribe = null;
const subscribers = new Set();
let initialized = false;

export function categoriesToDict(categoriesArray) {
  if (!Array.isArray(categoriesArray)) {
    return categoriesArray || {};
  }
  return categoriesArray.reduce((acc, category) => {
    if (category && category.id) {
      acc[category.id] = category;
    }
    return acc;
  }, {});
}

export function initializeCategoriesStore() {
  if (initialized && firebaseUnsubscribe) {
    return Promise.resolve();
  }

  const nrd = window.nrd;
  if (!nrd) {
    return Promise.reject(new Error('NRD service not available'));
  }

  if (firebaseUnsubscribe) {
    initialized = true;
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    firebaseUnsubscribe = nrd.categories.onValue((categoriesArray) => {
      cachedCategories = Array.isArray(categoriesArray) ? categoriesArray : [];
      subscribers.forEach((callback) => {
        try {
          callback(cachedCategories);
        } catch (error) {
          logger.error('categories-store subscriber error', error);
        }
      });
    });
    initialized = true;
    resolve();
  });
}

export function subscribeCategories(callback) {
  subscribers.add(callback);
  callback(cachedCategories);
  return () => {
    subscribers.delete(callback);
  };
}

export function getCategories() {
  return cachedCategories;
}

export function getCategoriesDict() {
  return categoriesToDict(cachedCategories);
}
