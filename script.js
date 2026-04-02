/* ============================================================
   SpendSmart — Student Expense Tracker
   script.js  |  Full Logic: Storage, CRUD, Charts, Export
   ============================================================ */

'use strict';

/* ── STATE ── */
let expenses = [];         // Array of expense objects
let budgets  = {};         // { daily, weekly, monthly }
let editId   = null;       // ID of expense currently being edited
let deleteId = null;       // ID pending deletion confirmation

// Chart instances
let pieChart = null;
let barChart = null;

/* ── UTILITIES ── */

/** Generate a unique ID */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Format number as INR currency */
const fmt = (n) => '₹' + Number(n).toFixed(2);

/** Get today as YYYY-MM-DD string */
const today = () => new Date().toISOString().split('T')[0];

/** Parse date string to Date object at noon to avoid timezone shifts */
const parseDate = (s) => { const [y,m,d] = s.split('-'); return new Date(+y, +m-1, +d, 12); };

/** Get start of current week (Monday) as Date */
const weekStart = () => {
  const d = new Date(); d.setHours(0,0,0,0);
  const day = d.getDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
};

/** Get start of current month as Date */
const monthStart = () => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; };

/* ── LOCAL STORAGE ── */

const STORAGE_KEY  = 'spendsmart_expenses';
const BUDGET_KEY   = 'spendsmart_budgets';

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
}

function loadData() {
  try {
    expenses = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    budgets  = JSON.parse(localStorage.getItem(BUDGET_KEY))  || {};
  } catch {
    expenses = [];
    budgets  = {};
  }
}

function saveBudgets() {
  localStorage.setItem(BUDGET_KEY, JSON.stringify(budgets));
}

/* ── DOM REFS ── */

const form            = document.getElementById('expense-form');
const amountInput     = document.getElementById('amount');
const dateInput       = document.getElementById('date');
const categoryInput   = document.getElementById('category');
const noteInput       = document.getElementById('note');
const submitBtn       = document.getElementById('submit-btn');
const cancelEditBtn   = document.getElementById('cancel-edit-btn');
const tbody           = document.getElementById('expense-tbody');
const emptyState      = document.getElementById('empty-state');
const filterDate      = document.getElementById('filter-date');
const filterCategory  = document.getElementById('filter-category');
const clearFiltersBtn = document.getElementById('clear-filters-btn');
const exportBtn       = document.getElementById('btn-export');
const saveBudgetBtn   = document.getElementById('save-budget-btn');
const budgetAlert     = document.getElementById('budget-alert');
const alertMsg        = document.getElementById('alert-msg');
const modalOverlay    = document.getElementById('modal-overlay');
const modalCancel     = document.getElementById('modal-cancel');
const modalConfirm    = document.getElementById('modal-confirm');

// Budget inputs
const dailyBudgetInput   = document.getElementById('daily-budget');
const weeklyBudgetInput  = document.getElementById('weekly-budget');
const monthlyBudgetInput = document.getElementById('monthly-budget');

// Budget status spans
const dailyStatus   = document.getElementById('daily-status');
const weeklyStatus  = document.getElementById('weekly-status');
const monthlyStatus = document.getElementById('monthly-status');

// Dashboard cards
const cardTotal      = document.getElementById('card-total');
const cardTotalSub   = document.getElementById('card-total-sub');
const cardRemaining  = document.getElementById('card-remaining');
const cardTopCat     = document.getElementById('card-top-cat');
const cardTopCatSub  = document.getElementById('card-top-cat-sub');
const cardEntries    = document.getElementById('card-entries');
const budgetProgress = document.getElementById('budget-progress');

// Summary totals
const totalDaily   = document.getElementById('total-daily');
const totalWeekly  = document.getElementById('total-weekly');
const totalMonthly = document.getElementById('total-monthly');
const totalAll     = document.getElementById('total-all');

/* ── CATEGORY CONFIG ── */

const CAT_ICONS = {
  Food: '🍔', Travel: '🚌', Recharge: '📱',
  Shopping: '🛍', Entertainment: '🎮', Others: '📦'
};

const CHART_COLORS = [
  '#00e6b4', '#00c8ff', '#9b51e0', '#ff8c00', '#ff3b5c', '#44ccff'
];

/* ── INIT ── */

function init() {
  loadData();
  dateInput.value = today(); // Default date = today
  populateBudgetInputs();
  render();
  initCharts();
  updateCharts();
}

/* ── RENDER ── */

function render() {
  renderTable();
  updateSummary();
  updateDashboard();
  checkBudgets();
  updateCharts();
}

/** Render expense table with optional filters */
function renderTable() {
  const fDate = filterDate.value;
  const fCat  = filterCategory.value;

  let filtered = [...expenses].sort((a, b) => b.date.localeCompare(a.date));

  if (fDate) filtered = filtered.filter(e => e.date === fDate);
  if (fCat)  filtered = filtered.filter(e => e.category === fCat);

  tbody.innerHTML = '';

  if (filtered.length === 0) {
    emptyState.classList.add('visible');
    return;
  }
  emptyState.classList.remove('visible');

  filtered.forEach((exp, idx) => {
    const tr = document.createElement('tr');
    tr.style.animationDelay = `${idx * 0.04}s`;
    tr.innerHTML = `
      <td class="td-date">${formatDisplayDate(exp.date)}</td>
      <td><span class="cat-badge cat-${exp.category}">${CAT_ICONS[exp.category] || '◆'} ${exp.category}</span></td>
      <td class="td-note">${exp.note || '—'}</td>
      <td class="td-amount">${fmt(exp.amount)}</td>
      <td>
        <div class="action-btns">
          <button class="btn-action btn-edit" data-id="${exp.id}">Edit</button>
          <button class="btn-action btn-del"  data-id="${exp.id}">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/** Format YYYY-MM-DD to readable DD MMM YYYY */
function formatDisplayDate(s) {
  const d = parseDate(s);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ── SUMMARY CALCULATIONS ── */

function calcTotal(list) {
  return list.reduce((s, e) => s + Number(e.amount), 0);
}

function getDaily()   { return expenses.filter(e => e.date === today()); }
function getWeekly()  { const ws = weekStart(); return expenses.filter(e => parseDate(e.date) >= ws); }
function getMonthly() { const ms = monthStart(); return expenses.filter(e => parseDate(e.date) >= ms); }

function updateSummary() {
  totalDaily.textContent   = fmt(calcTotal(getDaily()));
  totalWeekly.textContent  = fmt(calcTotal(getWeekly()));
  totalMonthly.textContent = fmt(calcTotal(getMonthly()));
  totalAll.textContent     = fmt(calcTotal(expenses));
}

/* ── DASHBOARD ── */

function updateDashboard() {
  const monthlyTotal = calcTotal(getMonthly());
  const allTotal     = calcTotal(expenses);

  // Total spent card
  cardTotal.textContent    = fmt(monthlyTotal);
  cardTotalSub.textContent = 'This month';

  // Budget remaining card
  const mb = Number(budgets.monthly) || 0;
  if (mb > 0) {
    const rem = mb - monthlyTotal;
    cardRemaining.textContent    = fmt(Math.max(rem, 0));
    const pct = Math.min((monthlyTotal / mb) * 100, 100);
    budgetProgress.style.width   = pct + '%';
    budgetProgress.classList.toggle('danger', pct >= 80);
  } else {
    cardRemaining.textContent = '₹–';
    budgetProgress.style.width = '0%';
  }

  // Top category
  const catTotals = {};
  expenses.forEach(e => catTotals[e.category] = (catTotals[e.category] || 0) + Number(e.amount));
  const topCat = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];
  if (topCat) {
    cardTopCat.textContent    = `${CAT_ICONS[topCat[0]] || ''} ${topCat[0]}`;
    cardTopCatSub.textContent = fmt(topCat[1]);
  } else {
    cardTopCat.textContent    = '–';
    cardTopCatSub.textContent = 'No data';
  }

  // Entries
  cardEntries.textContent = expenses.length;
}

/* ── BUDGET CHECK ── */

function checkBudgets() {
  const warnings = [];
  let exceeded = false;

  const checks = [
    { key: 'daily',   total: calcTotal(getDaily()),   label: 'Daily',   el: dailyStatus   },
    { key: 'weekly',  total: calcTotal(getWeekly()),  label: 'Weekly',  el: weeklyStatus  },
    { key: 'monthly', total: calcTotal(getMonthly()), label: 'Monthly', el: monthlyStatus },
  ];

  checks.forEach(c => {
    const limit = Number(budgets[c.key]) || 0;
    c.el.className = 'budget-status';
    if (limit <= 0) { c.el.textContent = ''; return; }
    const pct = (c.total / limit) * 100;
    if (pct >= 100) {
      c.el.textContent = '✕ Over';
      c.el.classList.add('over');
      warnings.push(`${c.label} budget exceeded! (${fmt(c.total)} / ${fmt(limit)})`);
      exceeded = true;
    } else if (pct >= 80) {
      c.el.textContent = `⚠ ${pct.toFixed(0)}%`;
      c.el.classList.add('warn');
    } else {
      c.el.textContent = `✓ ${pct.toFixed(0)}%`;
      c.el.classList.add('ok');
    }
  });

  // Show/hide alert
  if (warnings.length > 0) {
    alertMsg.textContent = warnings[0];
    budgetAlert.style.display = 'flex';
    document.body.classList.add('budget-exceeded');
  } else {
    budgetAlert.style.display = 'none';
    document.body.classList.remove('budget-exceeded');
  }
}

/* ── CHARTS ── */

/** Initialize empty Chart.js instances */
function initCharts() {
  const sharedOptions = {
    color: '#8899bb',
    font: { family: "'JetBrains Mono', monospace", size: 11 }
  };

  // Pie chart
  pieChart = new Chart(document.getElementById('pie-chart'), {
    type: 'doughnut',
    data: { labels: [], datasets: [{ data: [], backgroundColor: CHART_COLORS, borderColor: 'rgba(0,0,0,0.3)', borderWidth: 2, hoverOffset: 8 }] },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '60%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { ...sharedOptions, padding: 14, boxWidth: 10, usePointStyle: true }
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ₹${ctx.parsed.toFixed(2)}`
          }
        }
      },
      animation: { animateRotate: true, duration: 800 }
    }
  });

  // Bar chart
  barChart = new Chart(document.getElementById('bar-chart'), {
    type: 'bar',
    data: {
      labels: [],
      datasets: [{
        label: 'Spending (₹)',
        data: [],
        backgroundColor: 'rgba(0,200,255,0.15)',
        borderColor: '#00c8ff',
        borderWidth: 1.5,
        borderRadius: 6,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => ` ₹${ctx.parsed.y.toFixed(2)}` }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { ...sharedOptions }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { ...sharedOptions, callback: v => '₹' + v }
        }
      },
      animation: { duration: 700 }
    }
  });
}

/** Refresh chart data from expenses */
function updateCharts() {
  // Pie: category totals
  const catTotals = {};
  expenses.forEach(e => catTotals[e.category] = (catTotals[e.category] || 0) + Number(e.amount));
  const cats = Object.keys(catTotals);
  const vals = cats.map(c => catTotals[c]);

  pieChart.data.labels   = cats;
  pieChart.data.datasets[0].data = vals;
  pieChart.update();

  // Bar: last 7 days
  const labels = [], data = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const str = d.toISOString().split('T')[0];
    const dayExpenses = expenses.filter(e => e.date === str);
    labels.push(d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }));
    data.push(calcTotal(dayExpenses));
  }

  barChart.data.labels = labels;
  barChart.data.datasets[0].data = data;
  barChart.update();
}

/* ── ADD / EDIT EXPENSE ── */

form.addEventListener('submit', (e) => {
  e.preventDefault();

  const amount   = parseFloat(amountInput.value);
  const date     = dateInput.value;
  const category = categoryInput.value;
  const note     = noteInput.value.trim();

  // Validation
  if (!amount || amount <= 0)   return showToast('Enter a valid amount.', 'error');
  if (!date)                     return showToast('Pick a date.', 'error');
  if (!category)                 return showToast('Select a category.', 'error');

  if (editId) {
    // UPDATE existing
    const idx = expenses.findIndex(e => e.id === editId);
    if (idx !== -1) {
      expenses[idx] = { ...expenses[idx], amount, date, category, note };
    }
    editId = null;
    submitBtn.querySelector('.btn-text').textContent = 'Add Expense';
    cancelEditBtn.style.display = 'none';
    showToast('Expense updated!', 'info');
  } else {
    // CREATE new
    expenses.push({ id: uid(), amount, date, category, note });
    showToast('Expense added!', 'success');
  }

  saveData();
  form.reset();
  dateInput.value = today();
  render();
});

/** Cancel edit mode */
cancelEditBtn.addEventListener('click', () => {
  editId = null;
  form.reset();
  dateInput.value = today();
  submitBtn.querySelector('.btn-text').textContent = 'Add Expense';
  cancelEditBtn.style.display = 'none';
});

/* ── TABLE ACTIONS (edit / delete) via event delegation ── */

tbody.addEventListener('click', (e) => {
  const id = e.target.dataset.id;
  if (!id) return;

  if (e.target.classList.contains('btn-edit')) {
    startEdit(id);
  } else if (e.target.classList.contains('btn-del')) {
    openDeleteModal(id);
  }
});

/** Populate form for editing */
function startEdit(id) {
  const exp = expenses.find(e => e.id === id);
  if (!exp) return;

  editId = id;
  amountInput.value   = exp.amount;
  dateInput.value     = exp.date;
  categoryInput.value = exp.category;
  noteInput.value     = exp.note || '';

  submitBtn.querySelector('.btn-text').textContent = 'Update Expense';
  cancelEditBtn.style.display = 'inline-flex';

  // Scroll to form
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  amountInput.focus();
  showToast('Editing expense…', 'info');
}

/* ── DELETE MODAL ── */

function openDeleteModal(id) {
  deleteId = id;
  modalOverlay.classList.add('active');
}

modalCancel.addEventListener('click', () => {
  modalOverlay.classList.remove('active');
  deleteId = null;
});

modalConfirm.addEventListener('click', () => {
  if (deleteId) {
    expenses = expenses.filter(e => e.id !== deleteId);
    saveData();
    render();
    showToast('Expense deleted.', 'error');
  }
  modalOverlay.classList.remove('active');
  deleteId = null;
});

// Close modal by clicking backdrop
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) {
    modalOverlay.classList.remove('active');
    deleteId = null;
  }
});

/* ── FILTERS ── */

filterDate.addEventListener('change',     render);
filterCategory.addEventListener('change', render);

clearFiltersBtn.addEventListener('click', () => {
  filterDate.value     = '';
  filterCategory.value = '';
  render();
});

/* ── BUDGET SAVE ── */

function populateBudgetInputs() {
  dailyBudgetInput.value   = budgets.daily   || '';
  weeklyBudgetInput.value  = budgets.weekly  || '';
  monthlyBudgetInput.value = budgets.monthly || '';
}

saveBudgetBtn.addEventListener('click', () => {
  budgets.daily   = parseFloat(dailyBudgetInput.value)   || 0;
  budgets.weekly  = parseFloat(weeklyBudgetInput.value)  || 0;
  budgets.monthly = parseFloat(monthlyBudgetInput.value) || 0;
  saveBudgets();
  render();
  showToast('Budgets saved!', 'success');
});

/* ── EXCEL EXPORT (SheetJS) ── */

exportBtn.addEventListener('click', () => {
  if (expenses.length === 0) {
    showToast('No expenses to export!', 'error');
    return;
  }

  // Build worksheet rows
  const rows = [
    ['SpendSmart — Student Expense Tracker'],
    ['Exported on', new Date().toLocaleString('en-IN')],
    [],
    ['Date', 'Category', 'Note', 'Amount (₹)']
  ];

  [...expenses]
    .sort((a, b) => b.date.localeCompare(a.date))
    .forEach(e => {
      rows.push([formatDisplayDate(e.date), e.category, e.note || '', Number(e.amount).toFixed(2)]);
    });

  // Summary section
  rows.push([]);
  rows.push(['── SUMMARY ──']);
  rows.push(['Daily Total',   calcTotal(getDaily()).toFixed(2)]);
  rows.push(['Weekly Total',  calcTotal(getWeekly()).toFixed(2)]);
  rows.push(['Monthly Total', calcTotal(getMonthly()).toFixed(2)]);
  rows.push(['All-Time Total', calcTotal(expenses).toFixed(2)]);

  if (budgets.daily || budgets.weekly || budgets.monthly) {
    rows.push([]);
    rows.push(['── BUDGETS ──']);
    if (budgets.daily)   rows.push(['Daily Budget',   Number(budgets.daily).toFixed(2)]);
    if (budgets.weekly)  rows.push(['Weekly Budget',  Number(budgets.weekly).toFixed(2)]);
    if (budgets.monthly) rows.push(['Monthly Budget', Number(budgets.monthly).toFixed(2)]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Column widths
  ws['!cols'] = [{ wch: 18 }, { wch: 16 }, { wch: 30 }, { wch: 14 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Expenses');

  const filename = `SpendSmart_${today()}.xlsx`;
  XLSX.writeFile(wb, filename);
  showToast(`Exported as ${filename}`, 'success');
});

/* ── TOAST NOTIFICATIONS ── */

function showToast(msg, type = 'success') {
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const container = document.getElementById('toast-container');

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${msg}</span>`;
  container.appendChild(toast);

  // Auto remove after 3s
  setTimeout(() => {
    toast.classList.add('removing');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, 3000);
}

/* ── KEYBOARD SHORTCUT ── */
// Press Escape to close modal or cancel edit
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (modalOverlay.classList.contains('active')) {
      modalOverlay.classList.remove('active');
      deleteId = null;
    }
    if (editId) {
      cancelEditBtn.click();
    }
  }
});

/* ── BOOT ── */
init();