/* Dashboard — widgets are filtered by the signed-in user's permissions */
'use strict';

function rangeOf(key, from, to) {
  const t = new Date();
  const today = isoDate(t);
  if (key === 'today') return [today, today];
  if (key === 'yesterday') { const y = isoDate(addDays(t, -1)); return [y, y]; }
  if (key === 'week') { const d = new Date(t); const dow = (d.getDay() + 6) % 7; return [isoDate(addDays(d, -dow)), today]; }
  if (key === 'month') return [isoDate(new Date(t.getFullYear(), t.getMonth(), 1)), today];
  if (key === 'lastmonth') return [isoDate(new Date(t.getFullYear(), t.getMonth() - 1, 1)), isoDate(new Date(t.getFullYear(), t.getMonth(), 0))];
  if (key === '7d') return [isoDate(addDays(t, -6)), today];
  if (key === '30d') return [isoDate(addDays(t, -29)), today];
  if (key === '90d') return [isoDate(addDays(t, -89)), today];
  if (key === 'year') return [isoDate(new Date(t.getFullYear(), 0, 1)), today];
  if (key === 'custom' && from && to) return [from, to];
  return [isoDate(addDays(t, -29)), today];
}
const inRange = (d, [a, b]) => { const x = String(d).slice(0, 10); return x >= a && x <= b; };
function salesIn(range, list = visibleSales()) { return list.filter((s) => s.status !== 'cancelled' && inRange(s.date, range)); }
function revenueOf(list) { return round2(sum(list, (s) => saleTotals(s).net)); }
function saleProfit(s) {
  const t = saleTotals(s);
  const taxShare = s.total ? s.tax * (t.net / s.total) : 0;
  const exTax = s.taxInclusive ? t.net - taxShare : t.net - taxShare;
  return round2(exTax - saleCost(s));
}

PAGES.dashboard = {
  title: 'Dashboard', perm: ['dashboard', 'view'],
  render() {
    const hr = new Date().getHours();
    const greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
    const actions = [
      can('pos', 'create') ? `<a class="btn btn-primary" href="#/pos">${icon('cart')} New sale</a>` : '',
      can('repairs', 'create') ? `<a class="btn" href="#/repairs/new">${icon('wrench')} New repair job</a>` : '',
      can('purchases', 'create') ? `<a class="btn" href="#/purchases/new">${icon('truck')} Receive stock</a>` : '',
      can('warranties', 'view') ? `<a class="btn" href="#/warranties">${icon('shield')} Check warranty</a>` : '',
    ].join('');
    let html = pageHead(`${greet}, ${h(currentUser.name.split(' ')[0])}`, `${fmtDate(todayISO())} · Here's what's happening at ${h(db.settings.shopName)} today.`, actions);

    const sections = [];
    /* Sales & finance */
    if (can('sales', 'view')) {
      const own = !can('sales', 'manage');
      const T = salesIn(rangeOf('today')), W = salesIn(rangeOf('week')), M = salesIn(rangeOf('month'));
      const Y = salesIn(rangeOf('yesterday'));
      const diff = revenueOf(Y) ? Math.round(((revenueOf(T) - revenueOf(Y)) / revenueOf(Y)) * 100) : 0;
      const daily = (n) => Array.from({ length: n }, (_, i) => revenueOf(salesIn([isoDate(addDays(new Date(), i - n + 1)), isoDate(addDays(new Date(), i - n + 1))])));
      const tiles = [
        kpi({ label: own ? 'My sales today' : 'Sales today', value: money(revenueOf(T)), icon: 'receipt', tone: 'blue', trend: revenueOf(Y) ? diff : null, trendLabel: 'vs yesterday', foot: `${T.length} invoice${T.length === 1 ? '' : 's'}`, href: '#/sales' }),
        kpi({ label: own ? 'My sales this week' : 'This week', value: money(revenueOf(W)), icon: 'trendUp', tone: 'cyan', foot: `${W.length} invoices · last 7 days`, spark: daily(7) }),
        kpi({ label: own ? 'My sales this month' : 'This month', value: money(revenueOf(M)), icon: 'chart', tone: 'purple', spark: daily(Math.max(2, new Date().getDate())), foot: `${M.length} invoices · ${sum(M, (s) => s.items.filter((i) => i.deviceId).length)} devices sold` }),
      ];
      if (canFinance()) {
        const prof = sum(M, saleProfit) + sum(db.repairs.filter((r) => r.status === 'delivered' && inRange(r.deliveredAt, rangeOf('month'))), (r) => repairTotals(r).total - repairTotals(r).cost);
        tiles.push(kpi({ label: 'Gross profit (month)', value: money(Math.round(prof)), icon: 'cash', tone: 'green', foot: 'Sales + repairs, excl. tax, after cost of goods', href: '#/reports?tab=financial' }));
      }
      sections.push(`<div class="section-title">Sales${own ? ' — your invoices' : ''}</div><div class="kpis">${tiles.join('')}</div>`);
    }
    const fin = [];
    if (can('purchases', 'view')) { const m = db.purchases.filter((p) => p.status === 'received' && inRange(p.date, rangeOf('month'))); fin.push(kpi({ label: 'Purchases (month)', value: money(sum(m, (p) => p.total)), icon: 'truck', tone: 'gray', foot: `${m.length} goods receipts`, href: '#/purchases' })); }
    if (can('expenses', 'view')) { const m = db.expenses.filter((e) => e.status === 'posted' && inRange(e.date, rangeOf('month'))); fin.push(kpi({ label: 'Expenses (month)', value: money(sum(m, (e) => e.amount)), icon: 'wallet', tone: 'amber', foot: `${m.length} entries`, href: '#/finance?tab=expenses' })); }
    if (can('customers', 'view') && can('sales', 'view')) { const owing = db.customers.map((c) => customerBalance(c.id)).filter((b) => b > 0); fin.push(kpi({ label: 'Customer receivables', value: money(sum(owing)), icon: 'users', tone: 'red', foot: `${owing.length} customers owe`, href: '#/customers?f=owing' })); }
    if (can('suppliers', 'view') && can('purchases', 'view')) { const pay = db.suppliers.map((s) => supplierBalance(s.id)).filter((b) => b > 0); fin.push(kpi({ label: 'Supplier payables', value: money(sum(pay)), icon: 'handshake', tone: 'amber', foot: `${pay.length} suppliers`, href: '#/suppliers' })); }
    if (fin.length) sections.push(`<div class="section-title">Payments & balances</div><div class="kpis">${fin.join('')}</div>`);

    /* Inventory */
    if (can('inventory', 'view')) {
      const act = db.products.filter((p) => p.active);
      const low = act.filter((p) => stockState(p) === 'low'), out = act.filter((p) => stockState(p) === 'out');
      const devs = db.devices.filter((d) => d.status === 'in_stock');
      const tiles = [
        kpi({ label: 'Products', value: act.length, icon: 'package', tone: 'blue', foot: `${sum(act, stockOf)} units in stock`, href: '#/inventory' }),
        kpi({ label: 'Devices in stock (IMEI)', value: devs.length, icon: 'scan', tone: 'cyan', foot: `${devs.filter((d) => d.condition !== 'new').length} used / refurbished`, href: '#/imei?status=in_stock' }),
        kpi({ label: 'Low stock', value: low.length, icon: 'alert', tone: 'amber', foot: 'At or below minimum level', href: '#/inventory?f=low' }),
        kpi({ label: 'Out of stock', value: out.length, icon: 'ban', tone: 'red', foot: out.slice(0, 2).map((p) => p.name).join(', ') || 'None', href: '#/inventory?f=out' }),
      ];
      if (canSeeCost()) tiles.push(kpi({ label: 'Stock value (cost)', value: compactMoney(sum(act, stockValue)), icon: 'layers', tone: 'purple', foot: 'Actual cost (IMEI) + weighted avg.' }));
      sections.push(`<div class="section-title">Inventory</div><div class="kpis">${tiles.join('')}</div>`);
    }
    /* Repairs */
    if (can('repairs', 'view')) {
      const rep = visibleRepairs();
      const open = rep.filter(OPEN_REPAIR);
      const mine = !can('repairs', 'manage');
      const doneM = rep.filter((r) => r.status === 'delivered' && inRange(r.deliveredAt, rangeOf('month')));
      sections.push(`<div class="section-title">Repairs${mine ? ' — your jobs' : ''}</div><div class="kpis">
        ${kpi({ label: 'Total repair jobs', value: rep.length, icon: 'wrench', tone: 'blue', foot: `${open.length} open`, href: '#/repairs?tab=all' })}
        ${kpi({ label: 'Pending / in progress', value: open.filter((r) => r.status !== 'ready').length, icon: 'clock', tone: 'cyan', foot: `${open.filter((r) => r.status === 'awaiting_approval').length} awaiting approval · ${open.filter((r) => r.status === 'awaiting_parts').length} awaiting parts`, href: '#/repairs?tab=active' })}
        ${kpi({ label: 'Overdue', value: rep.filter(isOverdue).length, icon: 'alert', tone: 'red', foot: 'Past expected completion date', href: '#/repairs?tab=overdue' })}
        ${kpi({ label: 'Ready for collection', value: open.filter((r) => r.status === 'ready').length, icon: 'checkCircle', tone: 'green', foot: `${money(sum(open.filter((r) => r.status === 'ready'), (r) => repairTotals(r).balance))} to collect`, href: '#/repairs?tab=ready' })}
        ${kpi({ label: 'Delivered this month', value: doneM.length, icon: 'handshake', tone: 'purple', foot: can('reports', 'view') ? `${money(sum(doneM, (r) => repairTotals(r).total))} repair revenue` : '' })}
      </div>`);
    }
    /* Warranties */
    if (can('warranties', 'view')) {
      const cnt = (kind, st) => db.warranties.filter((w) => w.kind === kind && wStatus(w) === st).length;
      const pc = db.claims.filter((c) => ['pending', 'inspection'].includes(c.status));
      sections.push(`<div class="section-title">Warranties</div><div class="grid grid-3">
        <a class="card" href="#/warranties?tab=product" style="color:inherit;text-decoration:none"><div class="card-body"><div class="flex between mb-sm"><b>Product warranties</b>${icon('shield')}</div><div class="mini-stats"><div class="mini-stat"><div class="v success-text">${cnt('product', 'active')}</div><div class="l">Active</div></div><div class="mini-stat"><div class="v warning-text">${cnt('product', 'expiring')}</div><div class="l">Expiring ≤${db.settings.expiringDays}d</div></div><div class="mini-stat"><div class="v danger-text">${cnt('product', 'expired')}</div><div class="l">Expired</div></div></div></div></a>
        <a class="card" href="#/warranties?tab=repair" style="color:inherit;text-decoration:none"><div class="card-body"><div class="flex between mb-sm"><b>Repair warranties</b>${icon('wrench')}</div><div class="mini-stats"><div class="mini-stat"><div class="v success-text">${cnt('repair', 'active')}</div><div class="l">Active</div></div><div class="mini-stat"><div class="v warning-text">${cnt('repair', 'expiring')}</div><div class="l">Expiring</div></div><div class="mini-stat"><div class="v danger-text">${cnt('repair', 'expired')}</div><div class="l">Expired</div></div></div></div></a>
        <a class="card" href="#/claims" style="color:inherit;text-decoration:none"><div class="card-body"><div class="flex between mb-sm"><b>Warranty claims</b>${icon('shieldAlert')}</div><div class="mini-stats"><div class="mini-stat"><div class="v warning-text">${pc.filter((c) => c.kind === 'product').length}</div><div class="l">Product pending</div></div><div class="mini-stat"><div class="v warning-text">${pc.filter((c) => c.kind === 'repair').length}</div><div class="l">Repair pending</div></div><div class="mini-stat"><div class="v">${db.claims.filter((c) => c.status === 'approved' || c.status === 'resolved').length}</div><div class="l">Approved / resolved</div></div></div></div></a>
      </div>`);
    }
    html += sections.join('');

    /* Charts & lists */
    const cards = [];
    if (can('sales', 'view')) {
      const days = Array.from({ length: 14 }, (_, i) => isoDate(addDays(new Date(), i - 13)));
      const list = visibleSales().filter((s) => s.status !== 'cancelled');
      const pts = days.map((d) => { const ss = list.filter((s) => s.date === d); return { label: String(parseDay(d).getDate()), tip: `${fmtDate(d)} · ${ss.length} invoices`, value: revenueOf(ss) }; });
      cards.push(`<div class="card"><div class="card-head"><div><h3>Sales — last 14 days</h3><div class="sub">Net invoice value per day · ${money(sum(pts, (p) => p.value))} total</div></div>${can('reports', 'view') ? `<a class="btn btn-sm" href="#/reports">Full report</a>` : ''}</div><div class="card-body">${barChart(pts)}</div></div>`);
    }
    if (can('repairs', 'view')) {
      const open = visibleRepairs().filter(OPEN_REPAIR);
      const rows = REPAIR_STATUSES.filter(([k]) => !['delivered', 'cancelled'].includes(k)).map(([k, l]) => ({ label: l, value: open.filter((r) => r.status === k).length })).filter((r) => r.value);
      cards.push(`<div class="card"><div class="card-head"><div><h3>Repair pipeline</h3><div class="sub">${open.length} open jobs by status</div></div><a class="btn btn-sm" href="#/repairs?view=board">Board</a></div><div class="card-body">${hbarList(rows, { fmt: (v) => `${v} job${v === 1 ? '' : 's'}` })}</div></div>`);
    }
    if (cards.length) html += `<div class="grid ${cards.length > 1 ? 'grid-main-side' : ''} mt">${cards.join('')}</div>`;

    const lists = [];
    if (can('sales', 'view')) {
      const rec = visibleSales().slice(0, 6);
      lists.push(`<div class="card"><div class="card-head"><h3>Recent sales</h3><a class="btn btn-sm btn-ghost" href="#/sales">View all</a></div><div class="card-body flush">${rec.length ? rec.map((s) => `<a class="list-row" href="#/sales/${s.id}"><span class="kpi-icon tone-blue">${icon('receipt', 'ic-sm')}</span><div class="grow" style="min-width:0"><div class="bold small">${h(s.no)} · ${h(customerName(s.customerId))}</div><div class="xs muted truncate">${h(s.items.map((i) => i.name).join(', '))}</div></div><div class="right"><div class="bold small">${money(s.total)}</div><div class="xs muted">${relTime(s.at)}</div></div></a>`).join('') : emptyState('receipt', 'No sales yet')}</div></div>`);
    }
    if (can('repairs', 'view')) {
      const att = visibleRepairs().filter((r) => isOverdue(r) || r.status === 'ready' || r.status === 'awaiting_approval').slice(0, 6);
      lists.push(`<div class="card"><div class="card-head"><h3>Repairs needing attention</h3><a class="btn btn-sm btn-ghost" href="#/repairs">All jobs</a></div><div class="card-body flush">${att.length ? att.map((r) => `<a class="list-row" href="#/repairs/${r.id}"><span class="kpi-icon ${isOverdue(r) ? 'tone-red' : r.status === 'ready' ? 'tone-green' : 'tone-amber'}">${icon(isOverdue(r) ? 'clock' : 'wrench', 'ic-sm')}</span><div class="grow" style="min-width:0"><div class="bold small">${h(r.no)} · ${h(r.brand)} ${h(r.model)}</div><div class="xs muted truncate">${h(customerName(r.customerId))} · ${isOverdue(r) ? 'Overdue since ' + fmtDate(r.expected) : RS[r.status]}</div></div>${sbadge('repair', r.status)}</a>`).join('') : emptyState('checkCircle', 'Nothing urgent', 'No overdue or ready jobs.')}</div></div>`);
    }
    if (can('inventory', 'view')) {
      const low = db.products.filter((p) => p.active && stockState(p) !== 'ok').sort((a, b) => stockOf(a) - stockOf(b)).slice(0, 6);
      lists.push(`<div class="card"><div class="card-head"><h3>Stock alerts</h3><a class="btn btn-sm btn-ghost" href="#/inventory?f=low">Stock control</a></div><div class="card-body flush">${low.length ? low.map((p) => `<div class="list-row">${thumb(p)}<div class="grow" style="min-width:0"><div class="bold small truncate">${h(p.name)}</div><div class="xs muted">Min ${p.minStock} · ${h(p.sku)}</div></div><div class="right"><div class="bold">${stockOf(p)}</div>${sbadge('stock', stockState(p))}</div></div>`).join('') : emptyState('checkCircle', 'Stock levels healthy')}</div></div>`);
    }
    if (can('users', 'view')) {
      const acts = db.activity.slice(0, 7);
      lists.push(`<div class="card"><div class="card-head"><h3>Recent activity</h3><a class="btn btn-sm btn-ghost" href="#/activity">Activity log</a></div><div class="card-body flush">${acts.map((a) => `<div class="list-row">${avatar(userName(a.userId))}<div class="grow" style="min-width:0"><div class="small"><b>${h(userName(a.userId))}</b> · ${h(a.action)}</div><div class="xs muted truncate">${h(a.detail)}</div></div><span class="xs muted nowrap">${relTime(a.at)}</span></div>`).join('')}</div></div>`);
    }
    if (lists.length) html += `<div class="grid grid-2 mt">${lists.join('')}</div>`;
    if (!sections.length && !lists.length) html += `<div class="card"><div class="card-body">${emptyState('lock', 'No dashboard widgets', 'Your role has no modules with dashboard data.')}</div></div>`;
    return html;
  },
};
