// Index of transaction descriptions (subcategorías) built from the shared transactions store.

import { subscribeTransactions, getTransactions } from './transactions-store.js';

const logger = window.logger || console;

let availableDescriptions = [];
let descriptionsWithMetadata = {};
let descriptionsByCategoryId = {};
let storeUnsubscribe = null;

export function rebuildDescriptionsIndex(transactionsArray) {
  const nextMetadata = {};
  const nextByCategory = {};

  for (const transaction of transactionsArray) {
    if (!transaction || !transaction.description || !String(transaction.description).trim()) continue;

    const desc = String(transaction.description).trim();
    const transactionDate = transaction.date || transaction.createdAt || 0;

    if (!nextMetadata[desc]) {
      nextMetadata[desc] = {
        type: transaction.type,
        lastUsed: transactionDate,
        accountId: transaction.accountId || null,
        categoryId: transaction.categoryId || null,
        categoryIds: new Set(),
        usageByAccountCategory: {}
      };
    }

    if (transaction.categoryId) {
      nextMetadata[desc].categoryIds.add(transaction.categoryId);
      if (!nextByCategory[transaction.categoryId]) {
        nextByCategory[transaction.categoryId] = new Set();
      }
      nextByCategory[transaction.categoryId].add(desc);
    }

    if (transactionDate > nextMetadata[desc].lastUsed) {
      nextMetadata[desc].lastUsed = transactionDate;
      nextMetadata[desc].type = transaction.type;
    }

    const accountId = transaction.accountId || null;
    const categoryId = transaction.categoryId || null;
    const key = `${accountId || 'none'}_${categoryId || 'none'}`;

    if (!nextMetadata[desc].usageByAccountCategory[key] ||
        transactionDate > nextMetadata[desc].usageByAccountCategory[key]) {
      nextMetadata[desc].usageByAccountCategory[key] = transactionDate;
    }
  }

  descriptionsWithMetadata = nextMetadata;
  descriptionsByCategoryId = nextByCategory;
  availableDescriptions = Object.keys(descriptionsWithMetadata).sort();
}

export function initializeDescriptionsIndex() {
  if (storeUnsubscribe) return;

  rebuildDescriptionsIndex(getTransactions());
  storeUnsubscribe = subscribeTransactions((transactionsArray) => {
    rebuildDescriptionsIndex(transactionsArray);
  });
}

export function getAvailableDescriptions() {
  return availableDescriptions;
}

export function getDescriptionsMetadata() {
  return descriptionsWithMetadata;
}

export function getDescriptionsForCategory(categoryId) {
  if (!categoryId || !descriptionsByCategoryId[categoryId]) return [];
  return Array.from(descriptionsByCategoryId[categoryId]).sort();
}

export function getDescriptionsForCategories(categoryIds) {
  if (!categoryIds || categoryIds.length === 0) return [];
  const result = new Set();
  categoryIds.forEach((categoryId) => {
    const items = descriptionsByCategoryId[categoryId];
    if (items) items.forEach((desc) => result.add(desc));
  });
  return Array.from(result).sort((a, b) => a.localeCompare(b));
}

export function syncDescriptionsCache(target) {
  target.availableDescriptions = availableDescriptions;
  target.descriptionsWithMetadata = descriptionsWithMetadata;
}
