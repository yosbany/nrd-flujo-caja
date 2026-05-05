// Main app controller (ES Module)
// Using NRDCommon from CDN (loaded in index.html)
const logger = window.logger || console;

// Import view initialization functions (these will be loaded as modules)
// Note: These are loaded dynamically, so we check for them when needed

// Setup navigation buttons
function setupNavigationButtons() {
  const navContainer = document.getElementById('app-nav-container');
  if (!navContainer) {
    logger.warn('Navigation container not found');
    return;
  }
  
  navContainer.className = 'bg-white border-b border-gray-200 flex overflow-x-auto';
  
  navContainer.innerHTML = `
    <button class="nav-btn flex-1 px-3 sm:px-4 py-3 sm:py-3.5 border-b-2 border-red-600 text-red-600 bg-red-50 font-medium transition-colors uppercase tracking-wider text-xs sm:text-sm font-light" data-view="cashflow">Flujo</button>
    <button class="nav-btn flex-1 px-3 sm:px-4 py-3 sm:py-3.5 border-b-2 border-transparent text-gray-600 hover:text-red-600 transition-colors uppercase tracking-wider text-xs sm:text-sm font-light" data-view="transactions">Transacciones</button>
    <button class="nav-btn flex-1 px-3 sm:px-4 py-3 sm:py-3.5 border-b-2 border-transparent text-gray-600 hover:text-red-600 transition-colors uppercase tracking-wider text-xs sm:text-sm font-light" data-view="categories">Categorías</button>
    <button class="nav-btn flex-1 px-3 sm:px-4 py-3 sm:py-3.5 border-b-2 border-transparent text-gray-600 hover:text-red-600 transition-colors uppercase tracking-wider text-xs sm:text-sm font-light" data-view="accounts">Cuentas</button>
    <button class="nav-btn flex-1 px-3 sm:px-4 py-3 sm:py-3.5 border-b-2 border-transparent text-gray-600 hover:text-red-600 transition-colors uppercase tracking-wider text-xs sm:text-sm font-light" data-view="budget">Presupuesto</button>
    <button class="nav-btn flex-1 px-3 sm:px-4 py-3 sm:py-3.5 border-b-2 border-transparent text-gray-600 hover:text-red-600 transition-colors uppercase tracking-wider text-xs sm:text-sm font-light" data-view="forecasting">Proyecciones</button>
  `;
}

// Navigation service will be created when NRDCommon is available
let navigationService = null;

// Function to create and setup navigation service
function createNavigationService() {
  if (navigationService) {
    return navigationService; // Already created
  }
  
  const NavigationService = window.NRDCommon?.NavigationService;
  if (!NavigationService) {
    logger.warn('NavigationService not available in NRDCommon');
    return null;
  }
  
  navigationService = new NavigationService();
  window.navigationService = navigationService;
  
  // Register view handlers
  navigationService.registerView('cashflow', () => {
    logger.debug('Loading cashflow view');
    if (typeof window.loadCashflow === 'function') {
      window.loadCashflow();
    } else {
      logger.error('loadCashflow function not available');
    }
    const dateFilter = document.getElementById('date-filter-container');
    if (dateFilter) {
      dateFilter.style.display = 'flex';
    }
  });

  navigationService.registerView('transactions', () => {
    logger.debug('Loading transactions view');
    if (typeof loadTransactions === 'function') {
      loadTransactions();
    } else {
      logger.warn('loadTransactions function not available, retrying...');
      setTimeout(() => {
        if (typeof loadTransactions === 'function') {
          loadTransactions();
        } else {
          logger.error('loadTransactions function still not available after delay');
        }
      }, 100);
    }
    if (typeof hideTransactionForm === 'function') {
      hideTransactionForm();
    }
    const transactionDetail = document.getElementById('transaction-detail');
    if (transactionDetail) transactionDetail.classList.add('hidden');
    const dateFilter = document.getElementById('transactions-date-filter-container');
    if (dateFilter) {
      dateFilter.style.display = 'flex';
    }
    if (typeof setupReportHandlers === 'function') {
      setTimeout(setupReportHandlers, 100);
    }
    if (typeof setupTransactionsAccountBalancesToggle === 'function') {
      setTimeout(() => {
        if (window.transactionsAccountBalancesToggleSetup !== undefined) {
          window.transactionsAccountBalancesToggleSetup = false;
        }
        setupTransactionsAccountBalancesToggle();
      }, 100);
    }
  });

  navigationService.registerView('categories', () => {
    logger.debug('Loading categories view');
    if (typeof loadCategories === 'function') {
      loadCategories();
    } else {
      logger.error('loadCategories function not available');
    }
    if (typeof hideCategoryForm === 'function') {
      hideCategoryForm();
    }
  });

  navigationService.registerView('accounts', () => {
    logger.debug('Loading accounts view');
    if (typeof loadAccounts === 'function') {
      loadAccounts();
    } else {
      logger.warn('loadAccounts function not available, retrying...');
      setTimeout(() => {
        if (typeof loadAccounts === 'function') {
          loadAccounts();
        } else {
          logger.error('loadAccounts function still not available after delay');
        }
      }, 100);
    }
    if (typeof hideAccountForm === 'function') {
      hideAccountForm();
    }
  });

  navigationService.registerView('budget', () => {
    logger.debug('Loading budget view');
    if (typeof initializeBudgets === 'function') {
      initializeBudgets();
    } else {
      logger.warn('initializeBudgets function not available, retrying...');
      setTimeout(() => {
        if (typeof initializeBudgets === 'function') {
          initializeBudgets();
        } else {
          logger.error('initializeBudgets function still not available after delay');
        }
      }, 100);
    }
  });

  navigationService.registerView('forecasting', () => {
    logger.debug('Loading forecasting view');
    if (typeof window.initializeForecasting === 'function') {
      window.initializeForecasting();
    } else {
      logger.warn('initializeForecasting function not available, retrying...');
      setTimeout(() => {
        if (typeof window.initializeForecasting === 'function') {
          window.initializeForecasting();
        } else {
          logger.error('initializeForecasting function still not available after delay');
        }
      }, 100);
    }
  });

  // Don't setup nav buttons here - they don't exist yet
  // Will be set up in initializeApp() after buttons are created
  
  return navigationService;
}

// Initialize app when NRDCommon is ready and user is authenticated
// Note: AuthService from NRDCommon handles authentication, we just setup navigation
let appInitialized = false;
function initializeApp() {
  if (appInitialized) {
    logger.debug('App already initialized, skipping');
    return;
  }
  appInitialized = true;
  logger.debug('Initializing app');
  
  // Create navigation service first (registers view handlers)
  const navService = createNavigationService();
  if (!navService) {
    logger.warn('NavigationService not available, using fallback');
    // Fallback: use direct event listeners
    setupNavigationButtons();
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        logger.debug('Nav button clicked (fallback)', { view });
        // Manual view switching as fallback
        const views = ['cashflow', 'transactions', 'categories', 'accounts', 'budget', 'forecasting'];
        views.forEach(v => {
          const el = document.getElementById(`${v}-view`);
          if (el) el.classList.add('hidden');
        });
        const selectedView = document.getElementById(`${view}-view`);
        if (selectedView) {
          selectedView.classList.remove('hidden');
          // Trigger view load
          if (view === 'cashflow' && typeof window.loadCashflow === 'function') window.loadCashflow();
          else if (view === 'transactions' && typeof loadTransactions === 'function') loadTransactions();
          else if (view === 'categories' && typeof loadCategories === 'function') loadCategories();
          else if (view === 'accounts' && typeof loadAccounts === 'function') loadAccounts();
          else if (view === 'budget' && typeof initializeBudgets === 'function') initializeBudgets();
          else if (view === 'forecasting' && typeof window.initializeForecasting === 'function') window.initializeForecasting();
        }
      });
    });
    // Switch to default view manually
    const defaultView = document.getElementById('cashflow-view');
    if (defaultView) {
      defaultView.classList.remove('hidden');
      if (typeof loadCashflow === 'function') loadCashflow();
    }
    if (typeof window.initializeAlertsBackground === 'function') {
      window.initializeAlertsBackground();
    }
    return;
  }
  
  // Setup navigation buttons (creates the buttons in DOM)
  setupNavigationButtons();
  
  // Wait a tiny bit to ensure DOM is updated, then setup nav button handlers
  setTimeout(() => {
    // Setup nav button handlers with NavigationService (attaches event listeners)
    navService.setupNavButtons();
    
    // Switch to default view
    navService.switchView('cashflow');
    
    // Initialize alerts background (calculates alerts, triggers critical notifications)
    if (typeof window.initializeAlertsBackground === 'function') {
      window.initializeAlertsBackground();
    }
    
    logger.debug('App initialized successfully');
  }, 50);
}

// Wait for NRDCommon and user authentication
// AuthService from NRDCommon will handle showing app-screen when user is authenticated
function waitForNRDAndInitialize() {
  const maxWait = 10000;
  const startTime = Date.now();
  
  const checkNRD = setInterval(() => {
    const NRDCommon = window.NRDCommon;
    const nrd = window.nrd;
    
    if (NRDCommon && nrd && nrd.auth) {
      clearInterval(checkNRD);
      logger.info('NRDCommon and NRD available, setting up auth listener');
      
      // Check current auth state
      const currentUser = nrd.auth.getCurrentUser();
      if (currentUser) {
        logger.info('Current user found, initializing app', { uid: currentUser.uid });
        initializeApp();
      }
      
      // Listen for auth state changes
      nrd.auth.onAuthStateChanged((user) => {
        logger.info('Auth state changed', { hasUser: !!user });
        if (user) {
          // User is authenticated, initialize app
          initializeApp();
          
          // NavigationService.switchView is already intercepted to redirect 'dashboard' -> 'cashflow'
          // So no additional handling needed here
        } else {
          logger.debug('User not authenticated, app initialization skipped');
          appInitialized = false;
        }
      });
    } else if (Date.now() - startTime >= maxWait) {
      clearInterval(checkNRD);
      logger.error('NRDCommon or NRD not available after timeout');
      // Try to initialize anyway with fallback
      initializeApp();
    }
  }, 100);
}

// Start waiting when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', waitForNRDAndInitialize);
} else {
  waitForNRDAndInitialize();
}


