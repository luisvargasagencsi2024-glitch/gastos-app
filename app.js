// ========== CATEGORIES ==========

const CATEGORIES = [
  { id: 1, name: 'Salario',     type: 'income',  icon: '💰' },
  { id: 2, name: 'Comida',      type: 'expense', icon: '🍕' },
  { id: 3, name: 'Transporte',  type: 'expense', icon: '🚗' },
  { id: 4, name: 'Vivienda',    type: 'expense', icon: '🏠' },
  { id: 5, name: 'Servicios',   type: 'expense', icon: '💡' },
  { id: 6, name: 'Salud',       type: 'expense', icon: '💊' },
  { id: 7, name: 'Ocio',        type: 'expense', icon: '🎬' },
  { id: 8, name: 'Educación',   type: 'expense', icon: '📚' },
];

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function getCategory(id) {
  return CATEGORIES.find(c => c.id === id);
}

// ========== API ==========

async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error de conexión');
  return data;
}

// ========== STATE ==========

let user = null;
let transactions = [];
let budgets = {};

// ========== AUTH ==========

async function checkAuth() {
  const data = await api('GET', '/api/me');
  if (data.authenticated) {
    user = data.user;
    return true;
  }
  return false;
}

function showAuth() {
  document.getElementById('appAuth').classList.remove('hidden');
  document.getElementById('appMain').classList.add('hidden');
}

function showApp() {
  document.getElementById('appAuth').classList.add('hidden');
  document.getElementById('appMain').classList.remove('hidden');
  document.getElementById('headerUser').textContent = user ? user.username : '';
}

// ========== DATA LOADING ==========

async function loadTransactions() {
  transactions = await api('GET', '/api/transactions');
}

async function loadBudgets() {
  budgets = await api('GET', '/api/budgets');
}

// ========== HELPERS ==========

function pad(n) { return String(n).padStart(2, '0'); }

function getMonthKey(d) {
  const dt = new Date(d + 'T12:00:00');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}`;
}

function parseMonthKey(key) {
  const [y, m] = key.split('-').map(Number);
  return { y, m };
}

function getMonthLabel(key) {
  const { y, m } = parseMonthKey(key);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDate(d) {
  const dt = new Date(d + 'T12:00:00');
  return `${pad(dt.getDate())} ${MONTH_NAMES[dt.getMonth()]} ${dt.getFullYear()}`;
}

function formatMoney(n) {
  return 'S/ ' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getMonthTransactions(monthKey) {
  return transactions.filter(t => getMonthKey(t.date) === monthKey);
}

function getMonthSummary(monthKey) {
  const txs = getMonthTransactions(monthKey);
  let income = 0, expense = 0;
  txs.forEach(t => {
    if (t.type === 'income') income += t.amount;
    else expense += t.amount;
  });
  return { income, expense, balance: income - expense };
}

function getAllMonths() {
  const set = new Set();
  transactions.forEach(t => set.add(getMonthKey(t.date)));
  return [...set].sort();
}

// ========== NAVIGATION ==========

let currentView = 'dashboard';

function setView(name) {
  currentView = name;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  destroyCharts();
  if (name === 'dashboard') renderDashboard();
  else if (name === 'transactions') renderTransactions();
  else if (name === 'budgets') renderBudgets();
  else if (name === 'reports') renderReports();
}

// ========== CHARTS ==========

let chartInstances = [];

function destroyCharts() {
  chartInstances.forEach(c => c.destroy());
  chartInstances = [];
}

function newChart(canvas, config) {
  const c = new Chart(canvas, config);
  chartInstances.push(c);
  return c;
}

// ========== DASHBOARD ==========

function renderDashboard() {
  const el = document.getElementById('view-dashboard');
  const months = getAllMonths();
  if (!months.length) {
    el.innerHTML = `<div class="empty-state"><div class="emoji">📊</div><p>Agrega tus primeras transacciones para ver el dashboard</p></div>`;
    return;
  }
  const currentKey = months[months.length - 1];
  const summary = getMonthSummary(currentKey);
  const expenseTxs = getMonthTransactions(currentKey).filter(t => t.type === 'expense');

  const totalBudget = CATEGORIES.filter(c => c.type === 'expense').reduce((sum, c) => sum + (budgets[c.id] || 0), 0);
  const totalSpent = expenseTxs.reduce((sum, t) => sum + t.amount, 0);
  const pct = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
  const remaining = totalBudget - totalSpent;
  const hasBudget = totalBudget > 0;

  let barColor, alertMsg, alertClass;
  if (!hasBudget) {
    barColor = 'green';
    alertMsg = null;
    alertClass = '';
  } else if (pct >= 100) {
    barColor = 'red';
    alertMsg = `🔴 ¡Superaste tu presupuesto por ${formatMoney(Math.abs(remaining))}!`;
    alertClass = 'danger';
  } else if (pct >= 90) {
    barColor = 'red';
    alertMsg = `🔴 ¡Cuidado! Has gastado el ${pct}% de tu presupuesto`;
    alertClass = 'danger';
  } else if (pct >= 70) {
    barColor = 'yellow';
    alertMsg = `⚠️ Ya has gastado el ${pct}% de tu presupuesto`;
    alertClass = 'warning';
  } else {
    barColor = 'green';
    alertMsg = `✅ Llevas gastado el ${pct}% — vas bien`;
    alertClass = 'ok';
  }

  el.innerHTML = `
    <div class="summary-grid">
      <div class="summary-card">
        <div class="label">Ingresos</div>
        <div class="value income">${formatMoney(summary.income)}</div>
      </div>
      <div class="summary-card">
        <div class="label">Gastos</div>
        <div class="value expense">${formatMoney(summary.expense)}</div>
      </div>
      <div class="summary-card">
        <div class="label">Balance</div>
        <div class="value balance">${formatMoney(summary.balance)}</div>
      </div>
    </div>

    <div class="card budget-overview">
      <div class="card-title">Presupuesto vs Gastos — ${getMonthLabel(currentKey)}</div>

      <div class="budget-grid">
        <div class="budget-label">Presupuesto total</div>
        <div class="budget-value">${hasBudget ? formatMoney(totalBudget) : '—'}</div>

        <div class="budget-label">Gastado hasta ahora</div>
        <div class="budget-value ${totalSpent > totalBudget && hasBudget ? 'budget-over' : ''}">${formatMoney(totalSpent)}</div>

        ${hasBudget ? `
        <div class="budget-label">Restante</div>
        <div class="budget-value" style="color:${remaining >= 0 ? '#10b981' : '#ef4444'};font-weight:700">${remaining >= 0 ? formatMoney(remaining) : '- ' + formatMoney(Math.abs(remaining))}</div>
        ` : ''}
      </div>

      ${hasBudget ? `
      <div class="budget-bar-wrapper">
        <div class="budget-bar-track">
          <div class="budget-bar-fill ${barColor}" style="width:${Math.min(pct, 100)}%"></div>
        </div>
        <span class="budget-bar-pct">${pct}%</span>
      </div>
      ` : `
      <p class="budget-no-data">Configura tus presupuestos en la pestaña <strong>Presupuestos</strong> para ver esta sección</p>
      `}

      ${alertMsg ? `<p class="budget-alert ${alertClass}">${alertMsg}</p>` : ''}

      <div class="budget-income-row">
        <span>Ingresos del mes</span>
        <span class="budget-income-value">${formatMoney(summary.income)}</span>
      </div>
      <div class="budget-income-row budget-savings">
        <span>${hasBudget ? 'Ahorro estimado (ingresos − gastos)' : 'Ahorro del mes'}</span>
        <span class="budget-income-value" style="color:${summary.balance >= 0 ? '#10b981' : '#ef4444'};font-weight:700">${formatMoney(summary.balance)}</span>
      </div>
    </div>

    <div class="charts-row">
      <div class="card">
        <div class="card-title">Gastos por categoría — ${getMonthLabel(currentKey)}</div>
        <div class="chart-container"><canvas id="chartDoughnut"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">Evolución mensual</div>
        <div class="chart-container"><canvas id="chartLine"></canvas></div>
      </div>
    </div>
  `;

  const catMap = {};
  expenseTxs.forEach(t => {
    const cat = getCategory(t.category_id);
    const name = cat ? cat.name : 'Otros';
    catMap[name] = (catMap[name] || 0) + t.amount;
  });
  const labels = Object.keys(catMap);
  const values = Object.values(catMap);
  const colors = ['#ef4444','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f97316'];

  const ctx1 = document.getElementById('chartDoughnut');
  if (ctx1 && labels.length) {
    newChart(ctx1, {
      type: 'doughnut',
      data: { labels, datasets: [{ data: values, backgroundColor: colors.slice(0, labels.length), borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, font: { size: 12 } } } } },
    });
  }

  const ctx2 = document.getElementById('chartLine');
  if (ctx2) {
    newChart(ctx2, {
      type: 'line',
      data: {
        labels: months.map(getMonthLabel),
        datasets: [
          { label: 'Ingresos', data: months.map(m => getMonthSummary(m).income), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.08)', fill: true, tension: 0.3, pointRadius: 4 },
          { label: 'Gastos', data: months.map(m => getMonthSummary(m).expense), borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.08)', fill: true, tension: 0.3, pointRadius: 4 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' },
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, font: { size: 11 }, padding: 16 } } },
        scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { font: { size: 11 } } }, x: { grid: { display: false }, ticks: { font: { size: 11 } } } },
      },
    });
  }
}

// ========== TRANSACTIONS ==========

function renderTransactions() {
  const el = document.getElementById('view-transactions');
  const months = getAllMonths();

  if (!months.length) {
    el.innerHTML = `
      <div class="card">
        <div class="empty-state"><div class="emoji">📝</div><p>Aún no tienes transacciones</p>
        <button class="btn btn-primary" id="btnAddTxEmpty" style="margin-top:16px">+ Agregar primera</button></div>
      </div>`;
    const btn = el.querySelector('#btnAddTxEmpty');
    if (btn) btn.addEventListener('click', () => openTxModal(null, todayStr().slice(0, 7)));
    return;
  }

  let currentFilter = months[months.length - 1];
  const filterOpts = months.map(m => `<option value="${m}" ${m === currentFilter ? 'selected' : ''}>${getMonthLabel(m)}</option>`).join('');

  el.innerHTML = `
    <div class="card">
      <div class="filters">
        <div class="form-group">
          <label>Mes</label>
          <select id="filterMonth">${filterOpts}</select>
        </div>
        <button class="btn btn-primary" id="btnAddTx">+ Agregar</button>
      </div>
      <ul class="transaction-list" id="txList"></ul>
    </div>`;

  el.querySelector('#filterMonth').addEventListener('change', () => renderTxList(el.querySelector('#filterMonth').value));
  el.querySelector('#btnAddTx').addEventListener('click', () => openTxModal(null, el.querySelector('#filterMonth').value));
  renderTxList(currentFilter);
}

function renderTxList(monthKey) {
  const txs = getMonthTransactions(monthKey).sort((a, b) => b.date.localeCompare(a.date));
  const list = document.getElementById('txList');
  if (!txs.length) {
    list.innerHTML = `<div class="empty-state"><div class="emoji">📭</div><p>No hay transacciones este mes</p></div>`;
    return;
  }
  list.innerHTML = txs.map(t => {
    const cat = getCategory(t.category_id);
    const icon = cat ? cat.icon : '📄';
    return `
      <li class="transaction-item" data-id="${t.id}">
        <div class="tx-left">
          <div class="tx-icon ${t.type}">${icon}</div>
          <div class="tx-info">
            <div class="tx-cat">${cat ? cat.name : 'Sin categoría'}</div>
            <div class="tx-desc">${t.description || '—'}</div>
          </div>
        </div>
        <div class="tx-right">
          <div class="tx-amount ${t.type}">${t.type === 'income' ? '+' : '-'}${formatMoney(t.amount)}</div>
          <div class="tx-date">${formatDate(t.date)}</div>
        </div>
        <button class="tx-delete" title="Eliminar">✕</button>
      </li>`;
  }).join('');

  list.querySelectorAll('.tx-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = Number(btn.closest('.transaction-item').dataset.id);
      if (confirm('¿Eliminar esta transacción?')) {
        await api('DELETE', `/api/transactions/${id}`);
        await loadTransactions();
        renderTxList(monthKey);
      }
    });
  });

  list.querySelectorAll('.transaction-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('tx-delete')) return;
      const id = Number(item.dataset.id);
      const tx = transactions.find(t => t.id === id);
      if (tx) openTxModal(tx, monthKey);
    });
  });
}

// ========== TRANSACTION MODAL ==========

function populateCatDropdown(catType, selectedId) {
  const selCat = document.getElementById('categoria');
  selCat.innerHTML = CATEGORIES.filter(c => c.type === catType).map(c =>
    `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${c.icon} ${c.name}</option>`
  ).join('');
}

function openTxModal(existingTx, monthKey) {
  const modal = document.getElementById('modal');
  document.getElementById('modalTitle').textContent = existingTx ? 'Editar transacción' : 'Nueva transacción';
  document.getElementById('editId').value = existingTx ? existingTx.id : '';
  const tipo = existingTx ? existingTx.type : 'expense';
  document.getElementById('tipo').value = tipo;
  document.getElementById('monto').value = existingTx ? existingTx.amount : '';
  document.getElementById('descripcion').value = existingTx ? (existingTx.description || '') : '';
  document.getElementById('fecha').value = existingTx ? existingTx.date : todayStr();
  populateCatDropdown(tipo, existingTx ? existingTx.category_id : null);
  modal.classList.remove('hidden');
}

document.getElementById('tipo').addEventListener('change', () => {
  populateCatDropdown(document.getElementById('tipo').value, null);
});

document.getElementById('transactionForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = Number(document.getElementById('editId').value) || null;
  const data = {
    amount: Number(document.getElementById('monto').value),
    type: document.getElementById('tipo').value,
    categoryId: Number(document.getElementById('categoria').value),
    description: document.getElementById('descripcion').value.trim(),
    date: document.getElementById('fecha').value,
  };
  if (id) {
    await api('PUT', `/api/transactions/${id}`, data);
  } else {
    await api('POST', '/api/transactions', data);
  }
  closeTxModal();
  await loadTransactions();
  const sel = document.getElementById('filterMonth');
  if (sel) renderTxList(sel.value);
  if (currentView !== 'transactions') setView(currentView);
});

document.getElementById('btnCancel').addEventListener('click', closeTxModal);
document.getElementById('modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeTxModal();
});

function closeTxModal() {
  document.getElementById('modal').classList.add('hidden');
}

// ========== BUDGETS ==========

function renderBudgets() {
  const el = document.getElementById('view-budgets');
  const months = getAllMonths();
  if (!months.length) {
    el.innerHTML = `<div class="empty-state"><div class="emoji">🎯</div><p>Agrega transacciones para ver los presupuestos</p></div>`;
    return;
  }
  const currentKey = months[months.length - 1];
  const expenseTxs = getMonthTransactions(currentKey).filter(t => t.type === 'expense');
  const spentByCat = {};
  expenseTxs.forEach(t => { spentByCat[t.category_id] = (spentByCat[t.category_id] || 0) + t.amount; });

  const items = CATEGORIES.filter(c => c.type === 'expense').map(cat => {
    const budget = budgets[cat.id] || 0;
    const spent = spentByCat[cat.id] || 0;
    const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
    const colorClass = pct >= 80 ? 'red' : pct >= 50 ? 'yellow' : 'green';
    return { cat, budget, spent, pct: Math.round(pct), colorClass };
  });

  el.innerHTML = `
    <div class="card">
      <div class="card-title">Presupuestos — ${getMonthLabel(currentKey)}</div>
      <div class="budget-list">
        ${items.map(i => `
          <div class="budget-item">
            <div class="budget-header">
              <span class="budget-cat">${i.cat.icon} ${i.cat.name}</span>
              <div>
                <span class="budget-numbers">${formatMoney(i.spent)} / ${formatMoney(i.budget)}</span>
                <button class="budget-edit" data-cat-id="${i.cat.id}">Editar</button>
              </div>
            </div>
            <div class="budget-bar"><div class="budget-fill ${i.colorClass}" style="width:${i.pct}%"></div></div>
          </div>`).join('')}
      </div>
    </div>`;

  el.querySelectorAll('.budget-edit').forEach(btn => {
    btn.addEventListener('click', () => openBudgetModal(Number(btn.dataset.catId)));
  });
}

function openBudgetModal(catId) {
  const cat = getCategory(catId);
  if (!cat) return;
  document.getElementById('budgetCatId').value = catId;
  document.getElementById('budgetName').textContent = `${cat.icon} ${cat.name}`;
  document.getElementById('budgetAmount').value = budgets[catId] || 0;
  document.getElementById('budgetModal').classList.remove('hidden');
}

document.getElementById('budgetForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const categoryId = Number(document.getElementById('budgetCatId').value);
  const amount = Number(document.getElementById('budgetAmount').value);
  if (amount >= 0) {
    await api('PUT', '/api/budgets', { categoryId, amount });
    budgets[categoryId] = amount;
    closeBudgetModal();
    if (currentView === 'budgets') renderBudgets();
  }
});

document.getElementById('btnBudgetCancel').addEventListener('click', closeBudgetModal);
document.getElementById('budgetModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeBudgetModal();
});

function closeBudgetModal() {
  document.getElementById('budgetModal').classList.add('hidden');
}

// ========== REPORTS ==========

function renderReports() {
  const el = document.getElementById('view-reports');
  const months = getAllMonths();
  if (!months.length) {
    el.innerHTML = `<div class="empty-state"><div class="emoji">📈</div><p>Agrega transacciones para ver los reportes</p></div>`;
    return;
  }

  const rows = months.map(m => ({ month: m, label: getMonthLabel(m), ...getMonthSummary(m) }));

  el.innerHTML = `
    <div class="card">
      <div class="card-title">Resumen mensual</div>
      <table class="report-table">
        <thead><tr><th>Mes</th><th>Ingresos</th><th>Gastos</th><th>Balance</th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><strong>${r.label}</strong></td>
              <td style="color:#10b981">${formatMoney(r.income)}</td>
              <td style="color:#ef4444">${formatMoney(r.expense)}</td>
              <td style="font-weight:600;color:${r.balance >= 0 ? '#10b981' : '#ef4444'}">${formatMoney(r.balance)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="card">
      <div class="card-title">Comparativa mensual</div>
      <div class="chart-container" style="height:300px"><canvas id="chartReportBar"></canvas></div>
    </div>`;

  const ctx = document.getElementById('chartReportBar');
  if (ctx) {
    newChart(ctx, {
      type: 'bar',
      data: {
        labels: rows.map(r => r.label),
        datasets: [
          { label: 'Ingresos', data: rows.map(r => r.income), backgroundColor: 'rgba(16,185,129,0.7)', borderColor: '#10b981', borderWidth: 2, borderRadius: 4 },
          { label: 'Gastos', data: rows.map(r => r.expense), backgroundColor: 'rgba(239,68,68,0.7)', borderColor: '#ef4444', borderWidth: 2, borderRadius: 4 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' },
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, font: { size: 11 }, padding: 16 } } },
        scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { font: { size: 11 } } }, x: { grid: { display: false }, ticks: { font: { size: 11 } } } },
      },
    });
  }
}

// ========== AUTH UI ==========

function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.remove('hidden');
}

function clearErrors() {
  document.querySelectorAll('.form-error').forEach(e => e.classList.add('hidden'));
}

document.getElementById('showRegister').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('loginForm').classList.add('hidden');
  document.getElementById('registerForm').classList.remove('hidden');
  clearErrors();
});

document.getElementById('showLogin').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('registerForm').classList.add('hidden');
  document.getElementById('loginForm').classList.remove('hidden');
  clearErrors();
});

document.getElementById('btnLogin').addEventListener('click', async () => {
  clearErrors();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!username || !password) {
    showError('loginError', 'Completa todos los campos');
    return;
  }
  try {
    const data = await api('POST', '/api/login', { username, password });
    user = data.user;
    await initApp();
  } catch (err) {
    showError('loginError', err.message);
  }
});

document.getElementById('btnRegister').addEventListener('click', async () => {
  clearErrors();
  const username = document.getElementById('regUsername').value.trim();
  const password = document.getElementById('regPassword').value;
  const password2 = document.getElementById('regPassword2').value;
  if (!username || !password || !password2) {
    showError('regError', 'Completa todos los campos');
    return;
  }
  if (password !== password2) {
    showError('regError', 'Las contraseñas no coinciden');
    return;
  }
  if (password.length < 4) {
    showError('regError', 'La contraseña debe tener al menos 4 caracteres');
    return;
  }
  try {
    const data = await api('POST', '/api/register', { username, password });
    user = data.user;
    await initApp();
  } catch (err) {
    showError('regError', err.message);
  }
});

// Enter key support
document.getElementById('loginPassword').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btnLogin').click();
});
document.getElementById('regPassword2').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btnRegister').click();
});

// ========== INIT ==========

async function initApp() {
  showApp();
  await loadTransactions();
  await loadBudgets();
  setView('dashboard');
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('btnLogout').addEventListener('click', async () => {
    await api('POST', '/api/logout');
    user = null;
    transactions = [];
    budgets = {};
    destroyCharts();
    showAuth();
  });

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => setView(tab.dataset.view));
  });

  try {
    const authed = await checkAuth();
    if (authed) {
      await initApp();
    } else {
      showAuth();
    }
  } catch (_) {
    showAuth();
  }
});
