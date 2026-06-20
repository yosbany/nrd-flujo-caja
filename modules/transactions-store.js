// Shared in-memory cache for /transactions — single Firebase listener for the whole app.

const logger = window.logger || console;

let cachedTransactions = [];
let firebaseUnsubscribe = null;
const subscribers = new Set();
let initialized = false;

export function transactionsToDict(transactionsArray) {
  if (!Array.isArray(transactionsArray)) {
    return transactionsArray || {};
  }
  return transactionsArray.reduce((acc, transaction) => {
    if (transaction && transaction.id) {
      acc[transaction.id] = transaction;
    }
    return acc;
  }, {});
}

export function initializeTransactionsStore() {
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
    firebaseUnsubscribe = nrd.transactions.onValue((transactionsArray) => {
      cachedTransactions = Array.isArray(transactionsArray) ? transactionsArray : [];
      subscribers.forEach((callback) => {
        try {
          callback(cachedTransactions);
        } catch (error) {
          logger.error('transactions-store subscriber error', error);
        }
      });
    });
    initialized = true;
    resolve();
  });
}

export function subscribeTransactions(callback) {
  subscribers.add(callback);
  callback(cachedTransactions);
  return () => {
    subscribers.delete(callback);
  };
}

export function getTransactions() {
  return cachedTransactions;
}

export function getTransactionsDict() {
  return transactionsToDict(cachedTransactions);
}
