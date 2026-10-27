/* Finance, reports, users & roles, activity log, settings */
'use strict';

function periodPicker(query) {
  const p = query.period || 'month';
  const presets = [['today', 'Today'], ['7d', '7 days'], ['week', 'This week'], ['month', 'This month'], ['lastmonth', 'Last month'], ['30d', '30 days'], ['90d', '90 days'], ['year', 'This year'], ['custom', 'Custom']];
  return `<div class="flex flex-wrap"><select class="select input-sm" style="width:auto" data-action-change="period" aria-label="Period">${opts(presets, p)}</select>
    ${p === 'custom' ? `<input type="date" class="input input-sm" style="width:auto" data-period-from value="${h(query.from || isoDate(addDays(new Date(), -30)))}"><span class="muted">to</span><input type="date" class="input input-sm" style="width:auto" data-period-to value="${h(query.to || todayISO())}"><button class="btn btn-sm" data-action="period-apply">Apply</button>` : ''}</div>`;
}
document.addEventListener('change', (e) => { if (e.target.matches('[data-action-change="period"]')) setQuery({ period: e.target.value }); });
ACT['period-apply'] = () => setQuery({ from: $('[data-period-from]').value, to: $('[data-period-to]').value });
const periodRange = (q) => rangeOf(q.period || 'month', q.from, q.to);
const periodLabel = (r) => `${fmtDate(r[0])} – ${fmtDate(r[1])}`;
function simpleTable(headers, rows, numCols = [], foot) {
  if (!rows.length) return emptyState('chart', 'No data for this period');
  return `<div class="table-wrap"><table class="table rtable"><thead><tr>${headers.map((x, i) => `<th class="${numCols.includes(i) ? 'num' : ''}">${h(x)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v, i) => `<td data-label="${h(headers[i])}" class="${i === 0 ? 'td-main' : ''} ${numCols.includes(i) ? 'num' : ''}">${v}</td>`).join('')}</tr>`).join('')}</tbody>${foot ? `<tfoot><tr>${foot.map((v, i) => `<td data-label="${h(headers[i])}" class="${numCols.includes(i) ? 'num' : ''}">${v}</td>`).join('')}</tr></tfoot>` : ''}</table></div>`;
}
const strip = (s) => String(s).replace(/<[^>]+>/g, '');

/* ---------------- Payments & expenses ---------------- */
function paymentLedger(range) {
  const out = [];
  db.sales.forEach((s) => s.payments.forEach((p) => inRange(p.at, range) && out.push({ at: p.at, kind: p.amount < 0 ? 'Sales refund' : 'Sales receipt', ref: s.no, party: customerName(s.customerId), method: p.method, amount: p.amount, userId: p.userId })));
  db.repairs.forEach((r) => r.payments.forEach((p) => inRange(p.at, range) && out.push({ at: p.at, kind: 'Repair receipt', ref: r.no, party: customerName(r.customerId), method: p.method, amount: p.amount, userId: p.userId })));
  db.purchases.forEach((pu) => (pu.payments || []).forEach((p) => inRange(p.at, range) && out.push({ at: p.at, kind: 'Supplier payment', ref: pu.no, party: find('suppliers', pu.supplierId).name, method: p.method, amount: -p.amount, userId: p.userId })));
  db.expenses.filter((e) => e.status === 'posted' && inRange(e.date, range)).forEach((e) => out.push({ at: e.at, kind: 'Expense', ref: e.no, party: e.category, method: e.method, amount: -e.amount, userId: e.userId }));
  return out.sort((a, b) => (a.at < b.at ? 1 : -1));
}
PAGES.finance = {
  title: 'Payments & Expenses', perm: ['expenses', 'view'],
  render({ query }) {
    const tab = query.tab || 'overview';
    const range = periodRange(query);
    const head = pageHead('Payments & Expenses', `Cash flow, receivables, payables and business expenses · ${periodLabel(range)}`, `${periodPicker(query)}${can('expenses', 'create') ? `<button class="btn btn-primary" data-action="exp-new">${icon('plus')} Record expense</button>` : ''}`);
    const tabs = tabsHtml([{ key: 'overview', label: 'Cash summary' }, { key: 'ledger', label: 'Payment ledger' }, { key: 'expenses', label: 'Expenses' }, { key: 'receivables', label: 'Receivables' }, { key: 'payables', label: 'Payables' }], tab);
    let body = '';
    const led = paymentLedger(range);
    if (tab === 'overview') {
      const methods = db.settings.paymentMethods;
      const inflow = led.filter((x) => x.amount > 0), outflow = led.filter((x) => x.amount < 0);
      body = `<div class="card-body"><div class="kpis mb">
        ${kpi({ label: 'Money in', value: money(sum(inflow, (x) => x.amount)), icon: 'trendUp', tone: 'green', foot: `${inflow.length} receipts (sales + repairs)` })}
        ${kpi({ label: 'Money out', value: money(-sum(outflow, (x) => x.amount)), icon: 'wallet', tone: 'red', foot: 'Refunds, suppliers, expenses' })}
        ${kpi({ label: 'Net cash flow', value: money(sum(led, (x) => x.amount)), icon: 'cash', tone: 'blue' })}
        ${kpi({ label: 'Expenses', value: money(-sum(led.filter((x) => x.kind === 'Expense'), (x) => x.amount)), icon: 'receipt', tone: 'amber' })}
      </div>${simpleTable(['Method', 'Sales receipts', 'Repair receipts', 'Refunds', 'Supplier payments', 'Expenses', 'Net'], methods.map((m) => { const L = led.filter((x) => x.method === m); const s = (k) => sum(L.filter((x) => x.kind === k), (x) => x.amount); return [`<b>${h(m)}</b>`, money(s('Sales receipt')), money(s('Repair receipt')), money(s('Sales refund')), money(s('Supplier payment')), money(s('Expense')), `<b>${money(sum(L, (x) => x.amount))}</b>`]; }), [1, 2, 3, 4, 5, 6], ['<b>Total</b>', ...['Sales receipt', 'Repair receipt', 'Sales refund', 'Supplier payment', 'Expense'].map((k) => `<b>${money(sum(led.filter((x) => x.kind === k), (x) => x.amount))}</b>`), `<b>${money(sum(led, (x) => x.amount))}</b>`])}</div>`;
    } else if (tab === 'ledger') {
      body = dataTable('ledger', { rows: () => led, pageSize: 15, searchText: (x) => [x.ref, x.party, x.kind, x.method].join(' '),
        filters: [{ key: 'k', label: 'All types', options: ['Sales receipt', 'Repair receipt', 'Sales refund', 'Supplier payment', 'Expense'], fn: (x, v) => x.kind === v }, { key: 'm', label: 'All methods', options: db.settings.paymentMethods, fn: (x, v) => x.method === v }],
        columns: [
          { label: 'Date', cls: 'td-main', sort: (x) => x.at, render: (x) => fmtDateTime(x.at), csv: (x) => x.at },
          { label: 'Type', render: (x) => h(x.kind), csv: (x) => x.kind }, { label: 'Reference', render: (x) => `<span class="mono">${h(x.ref)}</span>`, csv: (x) => x.ref },
          { label: 'Party', render: (x) => h(x.party), csv: (x) => x.party }, { label: 'Method', render: (x) => h(x.method), csv: (x) => x.method },
          { label: 'By', render: (x) => h(userName(x.userId)), csv: (x) => userName(x.userId) },
          { label: 'Amount', cls: 'num', sort: (x) => x.amount, render: (x) => `<b class="${x.amount < 0 ? 'danger-text' : 'success-text'}">${money(x.amount)}</b>`, csv: (x) => x.amount }],
        toolbar: can('expenses', 'export') ? `<button class="btn btn-sm" data-action="ledger-export">${icon('download', 'ic-sm')} Export</button>` : '' });
    } else if (tab === 'expenses') {
      const ex = db.expenses.filter((e) => inRange(e.date, range));
      const byCat = Object.entries(groupBy(ex.filter((e) => e.status === 'posted'), (e) => e.category)).map(([k, v]) => ({ label: k, value: sum(v, (e) => e.amount) })).sort((a, b) => b.value - a.value);
      body = `<div class="card-body"><div class="label mb-sm">By category</div>${hbarList(byCat, { fmt: money })}</div>` + dataTable('expenses', { rows: () => ex, searchText: (e) => [e.no, e.category, e.note].join(' '),
        filters: [{ key: 'c', label: 'All categories', options: db.settings.expenseCategories, fn: (e, v) => e.category === v }],
        columns: [
          { label: 'Expense', cls: 'td-main', sort: (e) => e.date, render: (e) => `<div class="cell-main mono">${h(e.no)}</div><div class="cell-sub">${fmtDate(e.date)}</div>` },
          { label: 'Category', render: (e) => h(e.category) }, { label: 'Note', render: (e) => `<span class="small">${h(e.note)}</span>${e.status === 'void' ? `<div class="xs danger-text">Void: ${h(e.voidReason)}</div>` : ''}` },
          { label: 'Method', render: (e) => h(e.method) }, { label: 'Recorded by', render: (e) => h(userName(e.userId)) },
          { label: 'Amount', cls: 'num', sort: (e) => e.amount, render: (e) => (e.status === 'void' ? `<s class="muted">${money(e.amount)}</s>` : `<b>${money(e.amount)}</b>`) },
          { label: '', cls: 'actions', render: (e) => (e.status === 'posted' && can('expenses', 'delete') ? `<button class="btn btn-xs btn-ghost" data-action="exp-void" data-id="${e.id}">Void</button>` : '') }],
        footer: (rows) => ['<b>Total</b>', '', '', '', '', `<b>${money(sum(rows.filter((e) => e.status === 'posted'), (e) => e.amount))}</b>`, ''], emptyIcon: 'wallet', emptyTitle: 'No expenses in this period' });
    } else if (tab === 'receivables') {
      const rows = db.customers.map((c) => ({ c, b: customerBalance(c.id), docs: [...db.sales.filter((s) => s.customerId === c.id && saleTotals(s).balance > 0).map((s) => s.no), ...db.repairs.filter((r) => r.customerId === c.id && r.status === 'delivered' && repairTotals(r).balance > 0).map((r) => r.no)] })).filter((x) => x.b > 0).sort((a, b) => b.b - a.b);
      body = `<div class="card-body">${simpleTable(['Customer', 'Phone', 'Open documents', 'Balance', ''], rows.map((x) => [`<a href="#/customers/${x.c.id}"><b>${h(x.c.name)}</b></a>`, h(x.c.phone), `<span class="mono small">${h(x.docs.join(', '))}</span>`, `<b class="danger-text">${money(x.b)}</b>`, can('sales', 'edit') ? `<button class="btn btn-xs" data-action="cust-pay" data-id="${x.c.id}">Receive</button>` : '']), [3], ['<b>Total</b>', '', '', `<b>${money(sum(rows, (x) => x.b))}</b>`, ''])}</div>`;
    } else {
      const rows = db.suppliers.map((s) => ({ s, b: supplierBalance(s.id), docs: db.purchases.filter((p) => p.supplierId === s.id && purchaseTotals(p).balance > 0) })).filter((x) => x.b > 0);
      body = `<div class="card-body">${simpleTable(['Supplier', 'Terms', 'Open purchases', 'Payable'], rows.map((x) => [`<a href="#/suppliers/${x.s.id}"><b>${h(x.s.name)}</b></a>`, h(x.s.terms), x.docs.map((p) => `<a class="mono small" href="#/purchases/${p.id}">${h(p.no)}</a> (${money(purchaseTotals(p).balance)})`).join(', '), `<b class="danger-text">${money(x.b)}</b>`]), [3], ['<b>Total</b>', '', '', `<b>${money(sum(rows, (x) => x.b))}</b>`])}</div>`;
    }
    return head + `<div class="card">${tabs}${body}</div>`;
  },
};
Object.assign(ACT, {
  'ledger-export': () => { need('expenses', 'export'); dtExport('ledger', `payment-ledger-${todayISO()}`); },
  'exp-new': () => {
    const m = openModal({ title: 'Record expense', body: `<form id="ex-form" class="form-grid" novalidate>${field('Category', `<select class="select" name="category" required>${opts(db.settings.expenseCategories, '', 'Select…')}</select>`, { req: true })}${field('Amount', '<input class="input" name="amount" inputmode="decimal" required>', { req: true })}${field('Date', `<input class="input" type="date" name="date" value="${todayISO()}" max="${todayISO()}">`)}${field('Paid by', `<select class="select" name="method">${opts(db.settings.paymentMethods)}</select>`)}${field('Note', '<input class="input" name="note">', { cls: 'span-all' })}</form>`,
      foot: `<button class="btn" data-dismiss>Cancel</button><button class="btn btn-primary" type="submit" form="ex-form">Save expense</button>`,
      onMount(el) { bindForm($('#ex-form', el), async (d) => { const e = await svc.addExpense(d); m.close(); toast(`${e.no} recorded.`); setQuery({ tab: 'expenses' }); }); } });
  },
  'exp-void': async (el) => { const ok = await confirmDialog({ title: 'Void expense?', message: 'The record stays in the ledger marked as void.', confirmText: 'Void', danger: true, reason: true }); if (ok) { await svc.voidExpense(el.dataset.id, ok.reason); toast('Expense voided.'); refresh(); } },
});

/* ---------------- Reports (computed on the server for any date range) ---------------- */
let REPORT = null;
const REPORT_TABS = [{ key: 'sales', label: 'Sales' }, { key: 'inventory', label: 'Inventory & purchases' }, { key: 'repairs', label: 'Repairs' }, { key: 'warranty', label: 'Warranties' }, { key: 'financial', label: 'Profit & loss', fin: true }];
function fmtCell(v, f) {
  if (v === null || v === undefined || v === '') return '—';
  if (f === 'money') return money(v);
  if (f === 'int') return Number(v).toLocaleString('en-US');
  if (f === 'date') return fmtDate(v);
  if (f === 'pct') return `${v}%`;
  return h(v);
}
function kpiText(k) { return k.format === 'money' ? money(k.value) : k.format === 'int' ? Number(k.value).toLocaleString('en-US') : k.format === 'days' ? `${k.value} days` : h(k.value); }
function reportTable(s) {
  const num = (f) => ['money', 'int', 'pct'].includes(f);
  if (!s.rows.length) return emptyState('chart', 'No data for this period');
  return `<div class="table-wrap"><table class="table rtable"><thead><tr>${s.headers.map((x, i) => `<th class="${num(s.formats[i]) ? 'num' : ''}">${h(x)}</th>`).join('')}</tr></thead>
    <tbody>${s.rows.map((r) => `<tr>${r.map((v, i) => `<td data-label="${h(s.headers[i])}" class="${i === 0 ? 'td-main' : ''} ${num(s.formats[i]) ? 'num' : ''}">${fmtCell(v, s.formats[i])}</td>`).join('')}</tr>`).join('')}</tbody>
    ${s.footer ? `<tfoot><tr>${s.footer.map((v, i) => `<td data-label="${h(s.headers[i])}" class="${num(s.formats[i]) ? 'num' : ''}"><b>${i === 0 ? h(v) : fmtCell(v, s.formats[i])}</b></td>`).join('')}</tr></tfoot>` : ''}</table></div>`;
}
function renderReport(r) {
  const kpis = `<div class="kpis">${r.kpis.map((k) => kpi({ label: k.label, value: kpiText(k), icon: k.icon, tone: k.tone, foot: h(k.foot || '') })).join('')}</div>`;
  const chart = r.chart && r.chart.points.length ? `<div class="card"><div class="card-head"><h3>${h(r.chart.title)}</h3></div><div class="card-body">${barChart(r.chart.points, { labelEvery: Math.ceil(r.chart.points.length / 15), highlightLast: false })}</div></div>` : '';
  const sections = `<div class="grid grid-2">${r.sections.map((s) => `<div class="card" ${s.headers.length > 5 ? 'style="grid-column:1/-1"' : ''}><div class="card-head"><h3>${h(s.title)}</h3><span class="sub">${s.rows.length} row${s.rows.length === 1 ? '' : 's'}</span></div>${reportTable(s)}</div>`).join('')}</div>`;
  return kpis + chart + sections + (r.note ? `<p class="xs muted">${h(r.note)}</p>` : '');
}
PAGES.reports = {
  title: 'Reports', perm: ['reports', 'view'],
  render({ query }) {
    const tab = query.tab || 'sales';
    const range = periodRange(query);
    const tabs = tabsHtml(REPORT_TABS.filter((t) => !t.fin || canFinance()), tab);
    return pageHead('Reports & Analytics', `${periodLabel(range)} · calculated on the server from all records`, `${periodPicker(query)}${can('reports', 'print') ? `<button class="btn" data-action="rep-print-report">${icon('printer')} Print / PDF</button>` : ''}${can('reports', 'export') ? `<button class="btn" data-action="report-export">${icon('download')} Excel (CSV)</button>` : ''}`) +
      `<div class="card mb">${tabs}</div><div class="stack" id="report-body"><div class="card"><div class="card-body">${emptyState('chart', 'Loading report…', 'Crunching the numbers on the server.')}</div></div></div>`;
  },
  async mount({ query }) {
    const tab = query.tab || 'sales';
    const [from, to] = periodRange(query);
    const key = location.hash;
    REPORT = null;
    try {
      const r = await api('GET', `/reports/${tab}?from=${from}&to=${to}`);
      if (location.hash !== key || !$('#report-body')) return; // user moved on while it loaded
      REPORT = r;
      $('#report-body').innerHTML = renderReport(r);
    } catch (e) {
      if ($('#report-body')) $('#report-body').innerHTML = `<div class="alert alert-danger">${icon('alert')}<div>${h(e.message)}</div></div>`;
    }
  },
};
Object.assign(ACT, {
  'report-export': async () => {
    need('reports', 'export');
    if (!REPORT) { toast('The report is still loading.', 'warning'); return; }
    const rows = [];
    REPORT.kpis.forEach((k) => rows.push([k.label, k.value]));
    rows.push([]);
    REPORT.sections.forEach((s) => { rows.push([s.title]); rows.push(s.headers); s.rows.forEach((r) => rows.push(r)); if (s.footer) rows.push(s.footer); rows.push([]); });
    exportCSV(`report-${REPORT.type}-${REPORT.from}-to-${REPORT.to}`, [`${db.settings.shopName} — ${REPORT.type} report — ${fmtDate(REPORT.from)} to ${fmtDate(REPORT.to)}`], rows);
    api('GET', `/reports/${REPORT.type}?from=${REPORT.from}&to=${REPORT.to}&export=1`).catch(() => {}); // audit log entry
  },
  'rep-print-report': () => {
    need('reports', 'print');
    if (!REPORT) { toast('The report is still loading.', 'warning'); return; }
    const r = REPORT;
    printDoc('Report', `${docHeader(`${r.type.toUpperCase()} REPORT`, `<div>${fmtDate(r.from)} – ${fmtDate(r.to)}</div>`)}
      <table><tbody>${r.kpis.map((k) => `<tr><td>${h(k.label)}</td><td class="num"><b>${kpiText(k)}</b></td><td class="muted">${h(k.foot || '')}</td></tr>`).join('')}</tbody></table>
      ${r.sections.map((s) => `<h2 style="margin-top:16px">${h(s.title)}</h2><table><thead><tr>${s.headers.map((x, i) => `<th class="${['money', 'int'].includes(s.formats[i]) ? 'num' : ''}">${h(x)}</th>`).join('')}</tr></thead><tbody>${s.rows.map((row) => `<tr>${row.map((v, i) => `<td class="${['money', 'int'].includes(s.formats[i]) ? 'num' : ''}">${fmtCell(v, s.formats[i])}</td>`).join('')}</tr>`).join('') || '<tr><td class="muted">No data</td></tr>'}</tbody></table>`).join('')}
      ${r.note ? `<div class="terms">${h(r.note)}</div>` : ''}`);
  },
});

/* ---------------- Users & roles ---------------- */
PAGES.users = {
  title: 'Users & Roles', perm: ['users', 'view'],
  render({ query }) {
    const tab = query.tab || 'users';
    const tabs = tabsHtml([{ key: 'users', label: 'Staff accounts', count: db.users.length }, { key: 'roles', label: 'Roles & permissions', count: db.roles.length }], tab);
    const head = pageHead('Users & Roles', 'Individual staff logins with role-based, granular permissions. Unauthorised menus and actions are hidden and blocked.', tab === 'users' && can('users', 'create') ? `<button class="btn btn-primary" data-action="user-new">${icon('userPlus')} New staff account</button>` : tab === 'roles' && can('users', 'manage') ? `<button class="btn btn-primary" data-action="role-new">${icon('plus')} New role</button>` : '');
    if (tab === 'users') {
      return head + `<div class="card">${tabs}${dataTable('users', {
        rows: () => db.users, searchText: (u) => [u.name, u.username, roleOf(u).name, u.phone].join(' '),
        filters: [{ key: 'r', label: 'All roles', options: db.roles.map((r) => [r.id, r.name]), fn: (u, v) => u.roleId === v }, { key: 'a', label: 'Active & inactive', options: [['1', 'Active'], ['0', 'Deactivated']], fn: (u, v) => u.active === (v === '1') }],
        columns: [
          { label: 'Staff member', cls: 'td-main', sort: (u) => u.name, render: (u) => `<div class="flex">${avatar(u.name)}<div><div class="cell-main">${h(u.name)}${u.id === currentUser.id ? ' ' + badge('You', 'blue', 'no-dot') : ''}</div><div class="cell-sub">@${h(u.username)}</div></div></div>` },
          { label: 'Role', render: (u) => `<a href="#/users?tab=roles&role=${u.roleId}">${h(roleOf(u).name)}</a>` },
          { label: 'Phone', render: (u) => h(u.phone || '—') },
          { label: 'Last sign-in', sort: (u) => u.lastLogin || '', render: (u) => (u.lastLogin ? relTime(u.lastLogin) : 'Never') },
          { label: 'Status', render: (u) => (u.active ? badge('Active', 'green') : badge('Deactivated', 'red')) },
          { label: '', cls: 'actions', render: (u) => `${can('users', 'edit') ? `<button class="btn btn-xs" data-action="user-edit" data-id="${u.id}">${icon('edit', 'ic-sm')} Edit</button>` : ''}${can('users', 'edit') && u.id !== currentUser.id ? `<button class="btn btn-xs ${u.active ? 'btn-ghost danger-text' : ''}" data-action="user-toggle" data-id="${u.id}">${u.active ? 'Deactivate' : 'Activate'}</button>` : ''}` },
        ],
      })}</div>`;
    }
    const sel = find('roles', query.role) || db.roles.find((r) => !r.isAdmin) || db.roles[0];
    const editable = can('users', 'manage') && !sel.isAdmin;
    const matrix = `<div class="table-wrap"><table class="table perm-table"><thead><tr><th>Module</th>${ACTIONS.map((a) => `<th>${ACTION_LABEL[a]}</th>`).join('')}<th>All</th></tr></thead><tbody>${MODULES.map((m) => `<tr><td><div class="bold small">${h(m.label)}</div>${m.hint ? `<div class="xs muted">${h(m.hint)}</div>` : ''}</td>${ACTIONS.map((a) => m.actions.includes(a) ? `<td><input type="checkbox" data-pm="${m.key}" data-pa="${a}" aria-label="${h(m.label)} ${a}" ${sel.isAdmin || (sel.perms[m.key] || []).includes(a) ? 'checked' : ''} ${editable ? '' : 'disabled'}></td>` : '<td><span class="muted">·</span></td>').join('')}<td><input type="checkbox" data-row="${m.key}" aria-label="All ${h(m.label)}" ${sel.isAdmin || m.actions.every((a) => (sel.perms[m.key] || []).includes(a)) ? 'checked' : ''} ${editable ? '' : 'disabled'}></td></tr>`).join('')}</tbody></table></div>`;
    return head + `<div class="card mb">${tabs}</div><div class="grid" style="grid-template-columns:minmax(0,280px) minmax(0,1fr)" id="roles-grid">
      <div class="card"><div class="card-head"><h3>Roles</h3></div><div class="role-list">${db.roles.map((r) => `<a class="role-item ${r.id === sel.id ? 'active' : ''}" href="#/users?tab=roles&role=${r.id}"><div style="min-width:0"><div class="bold small">${h(r.name)}</div><div class="xs muted">${db.users.filter((u) => u.roleId === r.id).length} user(s)</div></div>${r.isAdmin ? icon('lock', 'ic-sm') : icon('chevronRight', 'ic-sm')}</a>`).join('')}</div></div>
      <div class="card"><form id="role-form" novalidate><div class="card-head"><div><h3>${h(sel.name)}</h3><div class="sub">${sel.isAdmin ? 'Full access — cannot be restricted.' : editable ? 'Tick the actions this role may perform.' : 'Read-only — you need the Users “Manage” permission.'}</div></div>${editable ? `<div class="btn-group"><button type="button" class="btn btn-sm btn-ghost danger-text" data-action="role-del" data-id="${sel.id}">${icon('trash', 'ic-sm')} Delete</button><button class="btn btn-sm btn-primary" type="submit">${icon('check', 'ic-sm')} Save permissions</button></div>` : ''}</div>
        ${editable ? `<div class="card-body form-grid">${field('Role name', `<input class="input" name="name" value="${h(sel.name)}" required>`, { req: true })}${field('Description', `<input class="input" name="description" value="${h(sel.description)}">`)}</div>` : `<div class="card-body"><p class="text-2 small">${h(sel.description)}</p></div>`}
        ${matrix}<div class="card-body"><div class="alert alert-info">${icon('info')}<div class="small">Permissions are enforced by the server on every action, not only by hiding buttons. Denied attempts are written to the activity log.</div></div></div></form></div></div>
      <style>@media (max-width: 900px){#roles-grid{grid-template-columns:minmax(0,1fr)!important}}</style>`;
  },
  mount({ query }) {
    const f = $('#role-form'); if (!f) return;
    const sel = find('roles', query.role) || db.roles.find((r) => !r.isAdmin) || db.roles[0];
    $$('[data-row]', f).forEach((rc) => rc.addEventListener('change', () => $$(`[data-pm="${rc.dataset.row}"]`, f).forEach((c) => { c.checked = rc.checked; })));
    $$('[data-pm]', f).forEach((c) => c.addEventListener('change', () => { if (c.dataset.pa !== 'view' && c.checked) { const v = $(`[data-pm="${c.dataset.pm}"][data-pa="view"]`, f); if (v) v.checked = true; } }));
    if (sel.isAdmin || !can('users', 'manage')) return;
    bindForm(f, async (d) => {
      const perms = {};
      $$('[data-pm]:checked', f).forEach((c) => { (perms[c.dataset.pm] = perms[c.dataset.pm] || []).push(c.dataset.pa); });
      await svc.saveRole({ id: sel.id, name: d.name, description: d.description, perms });
      toast(`Permissions for ${d.name} saved. Users with this role see the change immediately.`); refresh();
    });
  },
};
function openUserForm(u) {
  const m = openModal({ title: u ? `Edit ${h(u.name)}` : 'New staff account', size: 'lg',
    body: `<form id="usr-form" class="form-grid" novalidate>${field('Full name', `<input class="input" name="name" required value="${h(u?.name)}">`, { req: true })}${field('Username', `<input class="input" name="username" required value="${h(u?.username)}" autocomplete="off">`, { req: true })}
      ${field('Role', `<select class="select" name="roleId" required ${u && u.id === currentUser.id ? 'disabled' : ''}>${opts(db.roles.map((r) => [r.id, r.name]), u?.roleId, 'Select role…')}</select>`, { req: true, hint: u && u.id === currentUser.id ? 'You cannot change your own role' : '' })}
      ${field(u ? 'Reset password' : 'Password', `<input class="input" name="password" type="password" autocomplete="new-password" ${u ? 'placeholder="Leave blank to keep current"' : 'required'}>`, { req: !u, hint: 'Minimum 8 characters. Stored as a salted hash.' })}
      ${field('Phone', `<input class="input" name="phone" value="${h(u?.phone)}">`)}${field('Email', `<input class="input" name="email" value="${h(u?.email)}">`)}</form>`,
    foot: `<button class="btn" data-dismiss>Cancel</button><button class="btn btn-primary" type="submit" form="usr-form">Save account</button>`,
    onMount(el) { bindForm($('#usr-form', el), async (d) => { if (u && u.id === currentUser.id) d.roleId = u.roleId; await svc.saveUser({ ...(u ? { id: u.id } : {}), ...d }); m.close(); toast('Staff account saved.'); refresh(); }); } });
}
Object.assign(ACT, {
  'user-new': () => openUserForm(null),
  'user-edit': (el) => openUserForm(find('users', el.dataset.id)),
  'user-toggle': async (el) => {
    const u = find('users', el.dataset.id);
    const ok = await confirmDialog({ title: `${u.active ? 'Deactivate' : 'Activate'} ${u.name}?`, message: u.active ? 'They will be signed out and can no longer sign in.Their records and history are kept.' : 'They will be able to sign in again.', confirmText: u.active ? 'Deactivate' : 'Activate', danger: u.active });
    if (ok) { await svc.setUserActive(u.id, !u.active); toast(`${u.name} ${u.active ? 'activated' : 'deactivated'}.`); refresh(); }
  },
  'role-new': () => {
    const m = openModal({ title: 'New role', size: 'sm', body: `<form id="rn-form" class="stack" novalidate>${field('Role name', '<input class="input" name="name" required placeholder="e.g. Cashier">', { req: true })}${field('Copy permissions from', `<select class="select" name="copy">${opts(db.roles.filter((r) => !r.isAdmin).map((r) => [r.id, r.name]), '', 'Start empty')}</select>`)}</form>`,
      foot: `<button class="btn" data-dismiss>Cancel</button><button class="btn btn-primary" type="submit" form="rn-form">Create role</button>`,
      onMount(el) { bindForm($('#rn-form', el), async (d) => { const src = find('roles', d.copy); const r = await svc.saveRole({ name: d.name, perms: src ? JSON.parse(JSON.stringify(src.perms)) : { dashboard: ['view'] }, description: src ? `Based on ${src.name}` : '' }); m.close(); toast('Role created.'); setQuery({ tab: 'roles', role: r.id }); }); } });
  },
  'role-del': async (el) => { const ok = await confirmDialog({ title: 'Delete role?', confirmText: 'Delete', danger: true }); if (ok) { await svc.deleteRole(el.dataset.id); toast('Role deleted.'); setQuery({ role: '' }); } },
});

/* ---------------- Activity log ---------------- */
PAGES.activity = {
  title: 'Activity Log', perm: ['users', 'view'],
  render() {
    return pageHead('Activity Log', 'Audit trail of sign-ins and important changes: prices, stock, warranties, permissions and financial transactions.', can('users', 'manage') ? `<button class="btn" data-action="act-export">${icon('download')} Export</button>` : '') +
      `<div class="card">${dataTable('activity', {
        rows: () => db.activity, pageSize: 20, placeholder: 'Search action, detail, reference…', searchText: (a) => [a.action, a.detail, a.ref, userName(a.userId), a.module].join(' '),
        filters: [
          { key: 'm', label: 'All modules', options: MODULES.map((m) => [m.key, m.label]), fn: (a, v) => a.module === v },
          { key: 'u', label: 'All users', options: db.users.map((u) => [u.id, u.name]), fn: (a, v) => a.userId === v },
          { key: 'p', label: 'Any time', options: [['today', 'Today'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days']], fn: (a, v) => inRange(a.at, rangeOf(v)) },
          { key: 's', label: 'All events', options: [['sensitive', 'Sensitive only (refunds, permissions, stock, warranty, prices)']], fn: (a) => /refund|cancel|permission|adjust|extend|price|role|deactivat|void|denied|blocked|return|override|Settings/i.test(a.action + ' ' + a.detail) },
        ],
        columns: [
          { label: 'When', cls: 'td-main', sort: (a) => a.at, render: (a) => `<div class="cell-main">${fmtDateTime(a.at)}</div><div class="cell-sub">${relTime(a.at)}</div>`, csv: (a) => a.at },
          { label: 'User', render: (a) => `<span class="flex">${avatar(userName(a.userId))}${h(userName(a.userId))}</span>`, csv: (a) => userName(a.userId) },
          { label: 'Module', render: (a) => badge(moduleLabel(a.module), 'gray', 'no-dot'), csv: (a) => a.module },
          { label: 'Action', render: (a) => `<b class="small">${h(a.action)}</b>`, csv: (a) => a.action },
          { label: 'Details', render: (a) => `<span class="small text-2">${h(a.detail)}</span>`, csv: (a) => a.detail },
        ],
      })}</div>`;
  },
};
ACT['act-export'] = () => { need('users', 'manage'); dtExport('activity', `activity-log-${todayISO()}`); };

/* ---------------- Settings ---------------- */
PAGES.settings = {
  title: 'Settings', perm: ['settings', 'view'],
  render() {
    const s = db.settings; const ro = can('settings', 'manage') ? '' : 'disabled';
    const card = (id, title, sub, inner) => `<div class="card"><form id="${id}" novalidate><div class="card-head"><div><h3>${title}</h3><div class="sub">${sub}</div></div>${ro ? '' : `<button class="btn btn-sm btn-primary" type="submit">${icon('check', 'ic-sm')} Save</button>`}</div><div class="card-body">${inner}</div></form></div>`;
    return pageHead('Settings', ro ? 'Read-only — you need the Settings “Manage” permission to change these.' : 'Business details, tax, invoices, warranty policies, repair configuration and notifications.') + `<div class="stack">
      ${card('st-biz', 'Business profile', 'Printed on invoices, receipts and warranty certificates', `<div class="form-grid cols-3">${field('Shop name', `<input class="input" name="shopName" value="${h(s.shopName)}" ${ro}>`)}${field('Tagline', `<input class="input" name="tagline" value="${h(s.tagline)}" ${ro}>`)}${field('Tax / business ID', `<input class="input" name="taxId" value="${h(s.taxId)}" ${ro}>`)}${field('Address', `<input class="input" name="address" value="${h(s.address)}" ${ro}>`)}${field('Phone', `<input class="input" name="phone" value="${h(s.phone)}" ${ro}>`)}${field('Email', `<input class="input" name="email" value="${h(s.email)}" ${ro}>`)}</div>`)}
      ${card('st-tax', 'Tax, currency & invoices', 'Configurable tax and payment methods', `<div class="form-grid cols-4">${field('Currency symbol', `<input class="input" name="currency" value="${h(s.currency)}" ${ro}>`)}${field('Tax name', `<input class="input" name="taxName" value="${h(s.taxName)}" ${ro}>`)}${field('Tax rate (%)', `<input class="input" name="taxRate" inputmode="decimal" value="${s.taxRate}" ${ro}>`)}${field('Prices', `<select class="select" name="taxInclusive" ${ro}><option value="1" ${s.taxInclusive ? 'selected' : ''}>Tax inclusive</option><option value="0" ${!s.taxInclusive ? 'selected' : ''}>Tax added at checkout</option></select>`)}${field('Invoice prefix', `<input class="input" name="invoicePrefix" value="${h(s.invoicePrefix)}" ${ro}>`)}${field('Payment methods', `<input class="input" name="paymentMethods" value="${h(s.paymentMethods.join(', '))}" ${ro}>`, { cls: 'span-2', hint: 'Comma-separated' })}${field('Expense categories', `<input class="input" name="expenseCategories" value="${h(s.expenseCategories.join(', '))}" ${ro}>`)}${field('Invoice footer', `<textarea class="input" name="invoiceFooter" rows="2" ${ro}>${h(s.invoiceFooter)}</textarea>`, { cls: 'span-all' })}${field('Costing method', `<input class="input" name="costing" value="${h(s.costing)}" ${ro}>`, { cls: 'span-all', hint: 'Used for stock valuation and gross profit' })}</div>`)}
      ${card('st-war', 'Product warranty policy', 'Defaults by category; per-product periods are set on each product', `<div class="form-grid cols-3">${field('Warranty starts on', '<input class="input" value="Sale date" readonly>', { hint: 'Phone warranty period is chosen by the seller at the POS' })}${field('“Expiring soon” threshold (days)', `<input class="input" name="expiringDays" inputmode="numeric" value="${s.expiringDays}" ${ro}>`)}<div></div>
        ${db.categories.map((c) => field(`${h(c.name)} — default months`, `<input class="input" data-catw="${c.id}" inputmode="numeric" value="${c.warrantyMonths}" ${ro}>`)).join('')}
        ${field('New product terms', `<textarea class="input" name="termsProduct" rows="3" ${ro}>${h(s.terms.product)}</textarea>`, { cls: 'span-all' })}${field('Used / refurbished terms', `<textarea class="input" name="termsUsed" rows="2" ${ro}>${h(s.terms.used)}</textarea>`, { cls: 'span-all' })}</div>`)}
      ${card('st-rep', 'Repairs & repair warranty', 'Labour warranty per repair type; part warranty is set on each spare-part product', `<div class="form-grid cols-3">${field('Repair warranty starts on', `<select class="select" name="repairWarrantyStart" ${ro}><option value="delivery" ${s.repairWarrantyStart === 'delivery' ? 'selected' : ''}>Delivery date</option><option value="completion" ${s.repairWarrantyStart === 'completion' ? 'selected' : ''}>Repair completion date</option></select>`)}${field('Customer signature at delivery', `<select class="select" name="requireSignature" ${ro}><option value="1" ${s.requireSignature ? 'selected' : ''}>Required</option><option value="0" ${!s.requireSignature ? 'selected' : ''}>Optional</option></select>`)}<div></div></div>
        <div class="label mt mb-sm">Repair types & labour warranty</div><div class="stack-sm" id="rt-list">${s.repairTypes.map((t, i) => `<div class="flex"><input class="input input-sm grow" data-rtn="${i}" value="${h(t.name)}" ${ro}><input class="input input-sm" style="width:90px" data-rtd="${i}" value="${t.laborDays}" inputmode="numeric" ${ro} aria-label="Labour warranty days"><span class="small muted">days</span></div>`).join('')}</div>${ro ? '' : `<button type="button" class="btn btn-xs mt-sm" data-action="rt-add">${icon('plus', 'ic-sm')} Add repair type</button>`}
        <div class="label mt mb-sm">Repair statuses (workflow)</div><div class="chips">${REPAIR_STATUSES.map(([, l], i) => badge(`${i + 1}. ${l}`, 'gray', 'no-dot')).join('')}</div>
        <div class="mt">${field('Repair warranty terms', `<textarea class="input" name="termsRepair" rows="3" ${ro}>${h(s.terms.repair)}</textarea>`)}</div>`)}
      ${card('st-not', 'Notifications', 'In-app alerts shown in the bell menu. Messaging channels can be connected later.', `<div class="grid grid-2"><div class="stack-sm">${[['lowStock', 'Low-stock & out-of-stock alerts'], ['overdueRepairs', 'Overdue repair alerts'], ['readyForCollection', 'Ready-for-collection alerts'], ['warrantyExpiry', 'Upcoming warranty expiry'], ['pendingClaims', 'Pending warranty claims'], ['receivables', 'Outstanding payment reminders']].map(([k, l]) => `<label class="flex between" style="padding:6px 0"><span>${l}</span><span class="switch"><input type="checkbox" name="n_${k}" ${s.notify[k] ? 'checked' : ''} ${ro}><span></span></span></label>`).join('')}</div>
        <div class="stack-sm">${[['sms', 'SMS gateway'], ['email', 'Email (SMTP)'], ['whatsapp', 'WhatsApp Business API']].map(([k, l]) => `<label class="flex between" style="padding:6px 0"><span>${l} <span class="xs muted">— integration-ready</span></span><span class="switch"><input type="checkbox" name="c_${k}" ${s.channels[k] ? 'checked' : ''} ${ro}><span></span></span></label>`).join('')}<p class="xs muted">When enabled, customers can be messaged about repair status changes, ready-for-collection notices and payment reminders.</p></div></div>`)}
      <div class="card"><div class="card-head"><div><h3>Data & security</h3><div class="sub">All data is stored on the server database</div></div></div><div class="card-body grid grid-2">
        <div class="stack-sm">${META.demo && roleOf().isAdmin ? `<div><button class="btn btn-danger" data-action="reset-demo">${icon('refresh')} Reset demo data</button></div><p class="xs muted">Demo installation only: wipes the database and regenerates realistic sample records for a fresh client presentation.</p>` : '<p class="small text-2">Database backups run on the server every night (configured during deployment).</p>'}</div>
        <ul class="small text-2" style="margin:0;padding-left:18px"><li>Passwords stored as bcrypt hashes; deactivated users are signed out everywhere immediately.</li><li>Every change is validated and permission-checked on the server, inside a database transaction.</li><li>Completed sales, repairs and financial records cannot be deleted — only cancelled, voided or refunded, keeping full history.</li><li>Duplicate IMEI / serial numbers are rejected by the database itself; every stock change is a traceable movement.</li><li>All important actions are written to the activity log.</li></ul>
      </div></div></div>`;
  },
  mount() {
    if (!can('settings', 'manage')) return;
    const s = new Proxy({}, { get: (_, k) => db.settings[k] });
    const save = async (patch, msg = 'Settings saved.') => { await svc.saveSettings(patch); toast(msg); refresh(); };
    bindForm($('#st-biz'), async (d) => save(d));
    bindForm($('#st-tax'), async (d) => {
      const rate = Number(d.taxRate); if (!(rate >= 0 && rate <= 100)) throw new AppError('Tax rate must be between 0 and 100.');
      const pm = d.paymentMethods.split(',').map((x) => x.trim()).filter(Boolean); if (!pm.length) throw new AppError('Add at least one payment method.');
      await save({ currency: d.currency, taxName: d.taxName, taxRate: rate, taxInclusive: d.taxInclusive === '1', invoicePrefix: d.invoicePrefix, invoiceFooter: d.invoiceFooter, costing: d.costing, paymentMethods: pm, expenseCategories: d.expenseCategories.split(',').map((x) => x.trim()).filter(Boolean) });
    });
    bindForm($('#st-war'), async (d) => {
      for (const i of $$('[data-catw]')) {
        const c = db.categories.find((x) => x.id === i.dataset.catw);
        if (c && Number(i.value) !== c.warrantyMonths) await svc.saveCategoryWarranty(c.id, i.value);
      }
      await save({ expiringDays: Number(d.expiringDays) || 30, terms: { ...s.terms, product: d.termsProduct, used: d.termsUsed } }, 'Warranty policy saved.');
    });
    bindForm($('#st-rep'), async (d) => {
      const types = $$('[data-rtn]').map((i) => ({ name: i.value.trim(), laborDays: Number($(`[data-rtd="${i.dataset.rtn}"]`).value) || 0 })).filter((t) => t.name);
      await save({ repairWarrantyStart: d.repairWarrantyStart, requireSignature: d.requireSignature === '1', repairTypes: types, terms: { ...s.terms, repair: d.termsRepair } }, 'Repair settings saved.');
    });
    bindForm($('#st-not'), async (d) => save({ notify: Object.fromEntries(Object.keys(s.notify).map((k) => [k, !!d['n_' + k]])), channels: Object.fromEntries(Object.keys(s.channels).map((k) => [k, !!d['c_' + k]])) }, 'Notification settings saved.'));
  },
};
Object.assign(ACT, {
  'rt-add': () => { const box = $('#rt-list'); const i = box.children.length; box.insertAdjacentHTML('beforeend', `<div class="flex"><input class="input input-sm grow" data-rtn="${i}" placeholder="Repair type"><input class="input input-sm" style="width:90px" data-rtd="${i}" value="30" inputmode="numeric"><span class="small muted">days</span></div>`); },
  'reset-demo': async () => {
    const ok = await confirmDialog({ title: 'Reset demo data?', message: 'All changes made during this session will be discarded and fresh sample data generated. You will be signed out.', confirmText: 'Reset & sign out', danger: true });
    if (!ok) return;
    toast('Resetting demo data… this takes about 15 seconds.', 'info', 15000);
    await api('POST', '/demo/reset');
    setToken(null);
    await signOut('Demo data has been reset. Please sign in again.');
  },
});
