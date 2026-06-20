// Alert logic - background processing and notifications (no UI)
// Depends on: cashflow.js (calculateAccountBalance, getAverageMonthlyFlow), window.formatCurrency

import {
  initializeTransactionsStore,
  subscribeTransactions,
  transactionsToDict
} from '../modules/transactions-store.js';

const logger = window.logger || console;

let transactionsUnsubscribe = null;
let accountsListener = null;
let budgetsListener = null;
let alertsDebounceTimer = null;
let currentTransactions = {};
let currentAccounts = {};
let currentBudgets = [];

// Alert types
const ALERT_TYPES = {
  BUDGET_EXCEEDED: 'budget_exceeded',
  LOW_BALANCE: 'low_balance',
  NEGATIVE_FLOW: 'negative_flow',
  BUDGET_WARNING: 'budget_warning'
};

// Alert severity
const ALERT_SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

// Get alert settings (from Firebase config or defaults)
async function getAlertSettings() {
  try {
    const nrd = window.nrd;
    if (!nrd || !nrd.config) {
      return getDefaultAlertSettings();
    }
    const [lowBalanceThreshold, enabled] = await Promise.all([
      nrd.config.get('alertLowBalanceThreshold'),
      nrd.config.get('alertEnabled')
    ]);
    return {
      lowBalanceThreshold: lowBalanceThreshold ? parseFloat(lowBalanceThreshold) : 10000,
      budgetWarningThreshold: 0.9,
      enabled: enabled === 'true' || enabled === null || enabled === undefined ? true : enabled === 'false' ? false : true
    };
  } catch (error) {
    logger.warn('Error loading alert settings', error);
    return getDefaultAlertSettings();
  }
}

function getDefaultAlertSettings() {
  return {
    lowBalanceThreshold: 10000,
    budgetWarningThreshold: 0.9,
    enabled: true
  };
}

// Save alert settings to Firebase
async function saveAlertSettings(settings) {
  try {
    const nrd = window.nrd;
    if (!nrd || !nrd.config) {
      throw new Error('Servicio de configuración no disponible');
    }
    await Promise.all([
      nrd.config.setConfig('alertLowBalanceThreshold', {
        name: 'Umbral de Saldo Bajo',
        variableName: 'alertLowBalanceThreshold',
        description: 'Monto mínimo de saldo en cuenta para generar alerta de saldo bajo',
        value: String(settings.lowBalanceThreshold)
      }),
      nrd.config.setConfig('alertEnabled', {
        name: 'Alertas Habilitadas',
        variableName: 'alertEnabled',
        description: 'Activar o desactivar el sistema de alertas financieras',
        value: String(settings.enabled)
      })
    ]);
  } catch (error) {
    logger.error('Error saving alert settings', error);
    throw error;
  }
}

// Check budget alerts
async function checkBudgetAlerts(budget, allTransactions, accounts) {
  const alerts = [];
  const nrd = window.nrd;
  const formatCurrency = window.formatCurrency || ((v) => `$${Math.round(v)}`);
  if (!nrd || !nrd.categories) return alerts;

  try {
    const categoriesArray = await nrd.categories.getAll();
    const categories = Array.isArray(categoriesArray)
      ? categoriesArray.reduce((acc, c) => { if (c && c.id) acc[c.id] = c; return acc; }, {})
      : categoriesArray || {};
    const startDate = budget.startDate;
    const endDate = budget.endDate;
    const periodTransactions = Object.values(allTransactions || {}).filter(t => {
      const txDate = t.date || t.createdAt || 0;
      return txDate >= startDate && txDate <= endDate;
    });
    const expenseData = {};

    const isTransferCategory = (cat) => cat && cat.name && String(cat.name).toUpperCase().includes('TRANSFERENCIA');
    periodTransactions.forEach(tx => {
      if (tx.type !== 'expense' || !tx.categoryId) return;
      const category = categories[tx.categoryId];
      if (!category || isTransferCategory(category)) return;
      if (!expenseData[tx.categoryId]) {
        expenseData[tx.categoryId] = { category, subcategories: {} };
      }
      const description = tx.description || 'Sin descripción';
      if (!expenseData[tx.categoryId].subcategories[description]) {
        expenseData[tx.categoryId].subcategories[description] = { description, actual: 0, budget: 0 };
      }
      expenseData[tx.categoryId].subcategories[description].actual += parseFloat(tx.amount || 0);
    });

    if (budget.budgets) {
      Object.entries(budget.budgets).forEach(([categoryId, categoryBudget]) => {
        if (categoryBudget.subcategories) {
          Object.entries(categoryBudget.subcategories).forEach(([description, budgetAmount]) => {
            const category = categories[categoryId];
            if (!category || category.type !== 'expense') return;
            if (!expenseData[categoryId]) {
              expenseData[categoryId] = { category, subcategories: {} };
            }
            if (!expenseData[categoryId].subcategories[description]) {
              expenseData[categoryId].subcategories[description] = { description, actual: 0, budget: 0 };
            }
            expenseData[categoryId].subcategories[description].budget = budgetAmount;
          });
        }
      });
    }

    Object.values(expenseData).forEach(catData => {
      Object.values(catData.subcategories).forEach(sub => {
        if (sub.budget > 0 && sub.actual > sub.budget) {
          const exceededAmount = sub.actual - sub.budget;
          const percentage = (sub.actual / sub.budget) * 100;
          alerts.push({
            id: `budget_exceeded_${budget.id}_${catData.category.id}_${sub.description}`,
            type: ALERT_TYPES.BUDGET_EXCEEDED,
            severity: percentage > 150 ? ALERT_SEVERITY.CRITICAL : percentage > 125 ? ALERT_SEVERITY.HIGH : ALERT_SEVERITY.MEDIUM,
            title: `Presupuesto Excedido: ${sub.description}`,
            message: `El presupuesto de "${sub.description}" (${catData.category.name}) ha sido excedido en ${formatCurrency(Math.round(exceededAmount))} (${percentage.toFixed(1)}% del presupuesto)`,
            budgetId: budget.id,
            budgetName: budget.name,
            categoryId: catData.category.id,
            categoryName: catData.category.name,
            subcategory: sub.description,
            budgetAmount: sub.budget,
            actualAmount: sub.actual,
            exceededAmount,
            percentage,
            timestamp: Date.now(),
            resolved: false
          });
        } else if (sub.budget > 0 && sub.actual >= sub.budget * 0.9) {
          alerts.push({
            id: `budget_warning_${budget.id}_${catData.category.id}_${sub.description}`,
            type: ALERT_TYPES.BUDGET_WARNING,
            severity: ALERT_SEVERITY.LOW,
            title: `Advertencia de Presupuesto: ${sub.description}`,
            message: `El presupuesto de "${sub.description}" (${catData.category.name}) está al ${((sub.actual / sub.budget) * 100).toFixed(1)}%`,
            budgetId: budget.id,
            budgetName: budget.name,
            categoryId: catData.category.id,
            categoryName: catData.category.name,
            subcategory: sub.description,
            budgetAmount: sub.budget,
            actualAmount: sub.actual,
            percentage: (sub.actual / sub.budget) * 100,
            timestamp: Date.now(),
            resolved: false
          });
        }
      });
    });
  } catch (error) {
    logger.error('Error checking budget alerts', error);
  }
  return alerts;
}

// Calculate alerts based on current data
async function calculateAlerts(allTransactions, accounts, budgets = []) {
  const formatCurrency = window.formatCurrency || ((v) => `$${Math.round(v)}`);
  const calculateAccountBalance = window.calculateAccountBalance;
  const getAverageMonthlyFlow = window.getAverageMonthlyFlow;
  if (!calculateAccountBalance || !getAverageMonthlyFlow) {
    logger.warn('calculateAccountBalance or getAverageMonthlyFlow not available');
    return [];
  }

  const alerts = [];
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const settings = await getAlertSettings();

  const activeAccounts = Object.values(accounts || {}).filter(a => a.active !== false);
  for (const account of activeAccounts) {
    const balance = await calculateAccountBalance(account.id, allTransactions, null, accounts);
    const threshold = settings.lowBalanceThreshold || 10000;
    if (balance < threshold) {
      alerts.push({
        id: `low_balance_${account.id}`,
        type: ALERT_TYPES.LOW_BALANCE,
        severity: balance < (threshold * 0.5) ? ALERT_SEVERITY.CRITICAL :
          balance < (threshold * 0.75) ? ALERT_SEVERITY.HIGH : ALERT_SEVERITY.MEDIUM,
        title: `Saldo Bajo: ${account.name || 'Sin nombre'}`,
        message: `El saldo de la cuenta "${account.name || 'Sin nombre'}" es de ${formatCurrency(Math.round(balance))}, por debajo del umbral de ${formatCurrency(Math.round(threshold))}`,
        accountId: account.id,
        accountName: account.name,
        currentValue: balance,
        threshold,
        timestamp: Date.now(),
        resolved: false
      });
    }
  }

  const monthlyFlow = await getAverageMonthlyFlow(allTransactions, 1);
  if (monthlyFlow.averageNetFlow < 0) {
    alerts.push({
      id: 'negative_flow',
      type: ALERT_TYPES.NEGATIVE_FLOW,
      severity: Math.abs(monthlyFlow.averageNetFlow) > 50000 ? ALERT_SEVERITY.CRITICAL : ALERT_SEVERITY.HIGH,
      title: 'Flujo de Caja Negativo',
      message: `El flujo neto del mes es negativo: ${formatCurrency(Math.round(monthlyFlow.averageNetFlow))}`,
      currentValue: monthlyFlow.averageNetFlow,
      threshold: 0,
      timestamp: Date.now(),
      resolved: false
    });
  }

  const currentBudgets = budgets.filter(b =>
    b.startDate <= currentMonthEnd.getTime() && b.endDate >= currentMonthStart.getTime()
  );
  for (const budget of currentBudgets) {
    const budgetAlerts = await checkBudgetAlerts(budget, allTransactions, accounts);
    alerts.push(...budgetAlerts);
  }

  return alerts.sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

// Trigger critical alerts (notifications)
async function triggerCriticalAlerts(alerts) {
  const nrd = window.nrd;
  if (!nrd || !nrd.notifications) return;

  const lastTime = getLastNotificationTime();
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  if (lastTime && lastTime > oneHourAgo) return;

  try {
    for (const alert of alerts) {
      const notification = {
        title: `🚨 Alerta Crítica: ${alert.title}`,
        message: alert.message || 'Se ha detectado una alerta crítica en el sistema de flujo de caja',
        sent: false,
        createdAt: Date.now()
      };
      await nrd.notifications.create(notification);
    }
    setLastNotificationTime(Date.now());
  } catch (error) {
    logger.error('Error sending critical alert notifications', error);
  }
}

function getLastNotificationTime() {
  try {
    const stored = localStorage.getItem('nrd_flujo_caja_last_notification_time');
    return stored ? parseInt(stored, 10) : null;
  } catch (e) {
    return null;
  }
}

function setLastNotificationTime(timestamp) {
  try {
    localStorage.setItem('nrd_flujo_caja_last_notification_time', timestamp.toString());
  } catch (e) {}
}

// Background: calculate alerts and trigger critical notifications
function scheduleAlertsBackground() {
  if (alertsDebounceTimer) clearTimeout(alertsDebounceTimer);
  alertsDebounceTimer = setTimeout(() => {
    alertsDebounceTimer = null;
    void runAlertsBackground();
  }, 300);
}

async function runAlertsBackground() {
  try {
    const settings = await getAlertSettings();
    if (!settings.enabled) return;

    const transactionsArray = Object.values(currentTransactions || {});
    const accountsArray = Object.values(currentAccounts || {});
    const alerts = await calculateAlerts(transactionsArray, accountsArray, currentBudgets);
    const activeAlerts = alerts.filter(a => !a.resolved);
    const criticalAlerts = activeAlerts.filter(a => a.severity === ALERT_SEVERITY.CRITICAL);
    if (criticalAlerts.length > 0) {
      await triggerCriticalAlerts(criticalAlerts);
    }
  } catch (error) {
    logger.error('Error in alerts background', error);
  }
}

// Initialize background alert processing (listens to data changes)
function initializeAlertsBackground() {
  const nrd = window.nrd;
  if (!nrd) {
    logger.warn('NRD not available for alerts, will retry');
    setTimeout(initializeAlertsBackground, 2000);
    return;
  }

  if (transactionsUnsubscribe) return;

  void initializeTransactionsStore()
    .catch((error) => logger.error('Failed to init transactions store for alerts', error))
    .finally(() => {
      if (transactionsUnsubscribe) return;

      transactionsUnsubscribe = subscribeTransactions((transactionsArray) => {
        currentTransactions = transactionsToDict(transactionsArray);
        scheduleAlertsBackground();
      });
    });

  accountsListener = nrd.accounts.onValue((accounts) => {
    currentAccounts = Array.isArray(accounts)
      ? accounts.reduce((acc, a) => { if (a && a.id) acc[a.id] = a; return acc; }, {})
      : accounts || {};
    scheduleAlertsBackground();
  });

  if (nrd.budgets) {
    budgetsListener = nrd.budgets.onValue((budgets) => {
      currentBudgets = Array.isArray(budgets) ? budgets : Object.values(budgets || {});
      scheduleAlertsBackground();
    });
  }

  scheduleAlertsBackground();
}

// Expose globally
window.calculateAlerts = calculateAlerts;
window.getAlertSettings = getAlertSettings;
window.saveAlertSettings = saveAlertSettings;
window.ALERT_TYPES = ALERT_TYPES;
window.ALERT_SEVERITY = ALERT_SEVERITY;
window.initializeAlertsBackground = initializeAlertsBackground;
