/* POS, sales & invoices, quotations, customers */
'use strict';

const POS = { items: [], customerId: '', discount: 0, cat: '', q: '' };

/* ---------------- Shared: customer form ---------------- */
function openCustomerForm(c, onSaved) {
  const m = openModal({
    title: c ? 'Edit customer' : 'New customer', size: 'lg',
    body: `<form id="cust-form" class="form-grid" novalidate>
      ${field('Full name', `<input class="input" name="name" required value="${h(c?.name)}">`, { req: true })}
      ${field('Phone number', `<input class="input" name="phone" inputmode="tel" required value="${h(c?.phone)}" placeholder="077 123 4567">`, { req: true, hint: 'Used to find the customer quickly at the counter.' })}
      ${field('Email (optional)', `<input class="input" name="email" type="email" value="${h(c?.email)}">`)}
      ${field('Address', `<input class="input" name="address" value="${h(c?.address)}">`)}
      ${field('Notes', `<textarea class="input" name="notes" rows="3">${h(c?.notes)}</textarea>`, { cls: 'span-all' })}
    </form>`,
    foot: `<button class="btn" data-dismiss>Cancel</button><button class="btn btn-primary" type="submit" form="cust-form">${icon('check')} Save customer</button>`,
    onMount(el) {
      bindForm($('#cust-form', el), async (d) => { const saved = await svc.saveCustomer({ ...(c ? { id: c.id } : {}), ...d }); m.close(); toast(`Customer ${saved.name} saved.`); onSaved && onSaved(saved); });
    },
  });
}
function customerOptions(selected) {
  return `<option value="">Walk-in customer</option>${db.customers.slice().sort(by('name')).map((c) => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${h(c.name)} · ${h(c.phone)}</option>`).join('')}`;
}

/* ---------------- POS ---------------- */
PAGES.pos = {
  title: 'POS / New Sale', perm: ['pos', 'view'],
  render() {
    const cats = db.categories.filter((c) => db.products.some((p) => p.categoryId === c.id && p.active));
    return `<div class="pos" id="pos">
      <div class="pos-left">
        <div class="pos-search"><div class="input-icon">${icon('scan')}<input id="pos-q" class="input" type="search" placeholder="Scan barcode / IMEI or search name, SKU, brand…" value="${h(POS.q)}" autocomplete="off" aria-label="Search products"></div><button class="btn" style="height:46px" data-action="pos-bulk" data-tip="Scan many IMEIs at once">${icon('layers')}<span class="hide-sm">Bulk scan</span></button></div>
        <div class="chips scroll-sm" id="pos-cats"><button class="chip ${!POS.cat ? 'active' : ''}" data-action="pos-cat" data-cat="">All</button>${cats.map((c) => `<button class="chip ${POS.cat === c.id ? 'active' : ''}" data-action="pos-cat" data-cat="${c.id}">${h(c.name)}</button>`).join('')}</div>
        <div class="small muted" id="pos-hint">Tip: press <b>Enter</b> after scanning — an exact barcode or IMEI adds the item instantly. ${can('pos', 'edit') ? '' : 'Price changes and discounts are disabled for your role.'}</div>
        <div class="products-grid" id="pos-grid"></div>
      </div>
      <div class="cart-scrim" data-action="pos-cart-close"></div>
      <aside class="card cart" id="pos-cart" aria-label="Cart"></aside>
      <button class="cart-fab" data-action="pos-cart-open" id="pos-fab"></button>
    </div>`;
  },
  mount() {
    posGrid(); posCart();
    const q = $('#pos-q');
    q.addEventListener('input', () => { POS.q = q.value; posGrid(); });
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); posScan(q.value); } });
    if (window.matchMedia('(min-width: 1025px)').matches) q.focus();
  },
};
function posProducts() {
  const q = POS.q.trim().toLowerCase(); const qn = normId(q).toLowerCase();
  return db.products.filter((p) => p.active && (!POS.cat || p.categoryId === POS.cat) && (!q || [p.name, p.sku, p.barcode, p.brand, p.model, p.code].some((x) => x && x.toLowerCase().includes(q))
    || (qn.length >= 4 && p.serialized && db.devices.some((d) => d.productId === p.id && d.status === 'in_stock' && [d.imei1, d.imei2, d.serial].some((x) => x && x.toLowerCase().includes(qn))))));
}
function posGrid() {
  const list = posProducts();
  const grid = $('#pos-grid'); if (!grid) return;
  grid.innerHTML = list.length ? list.map((p) => {
    const st = stockOf(p); const cat = db.categories.find((c) => c.id === p.categoryId);
    const inCart = POS.items.filter((i) => i.productId === p.id).reduce((s, i) => s + i.qty, 0);
    return `<button class="p-card ${st - (p.serialized ? inCart : inCart) <= 0 ? 'out' : ''}" data-action="pos-add" data-id="${p.id}" aria-label="Add ${h(p.name)}">
      <div class="p-img" style="background:${cat.color}14;color:${cat.color}">${p.image ? `<img src="${p.image}" alt="${h(p.name)}">` : productArt(p)}</div>
      <div class="p-name">${h(p.name)}</div>
      <div class="xs muted truncate">${h(p.color || p.brand)}${p.condition !== 'new' ? ' · ' + CONDITIONS[p.condition] : ''}</div>
      <div class="p-meta"><span class="p-price">${money(p.price)}</span>${st <= 0 ? badge('Out', 'red') : st <= p.minStock ? badge(st + ' left', 'amber') : badge(st + ' in stock', 'green')}</div>
      ${inCart ? `<div class="xs" style="color:var(--primary);font-weight:600">${inCart} in cart</div>` : ''}
    </button>`;
  }).join('') : `<div class="card" style="grid-column:1/-1">${emptyState('search', 'No products match', 'Try another name, SKU, barcode or IMEI.')}</div>`;
}
function posScan(val) {
  const v = val.trim(); if (!v) return;
  const dev = findDeviceByCode(v);
  if (dev) {
    if (dev.status !== 'in_stock') { toast(`${deviceCode(dev)} is ${DEVICE_STATUS[dev.status].toLowerCase()} — cannot be sold.`, 'error'); return; }
    posAddDevice(dev); POS.q = ''; $('#pos-q').value = ''; posGrid(); return;
  }
  const p = db.products.find((x) => x.active && (x.barcode === v || x.sku.toLowerCase() === v.toLowerCase()));
  if (p) { posAdd(p.id); POS.q = ''; $('#pos-q').value = ''; posGrid(); return; }
  const list = posProducts();
  if (list.length === 1) posAdd(list[0].id);
  else toast(list.length ? `${list.length} products match — tap one to add.` : 'No product or IMEI found for that code.', list.length ? 'info' : 'warning');
}
function posAdd(pid) {
  const p = find('products', pid);
  if (p.serialized) return posPickDevice(p);
  const st = stockOf(p);
  const line = POS.items.find((i) => i.productId === pid);
  if ((line ? line.qty : 0) + 1 > st) { toast(st ? `Only ${st} × ${p.name} in stock.` : `${p.name} is out of stock.`, 'error'); return; }
  if (line) line.qty += 1; else POS.items.push({ key: uid('ln'), productId: pid, qty: 1, price: p.price, discount: 0 });
  posCart(); posGrid();
}
function posAddDevice(d) {
  if (POS.items.some((i) => i.deviceId === d.id)) { toast('That IMEI is already in the cart.', 'warning'); return; }
  const p = find('products', d.productId);
  POS.items.push({ key: uid('ln'), productId: p.id, deviceId: d.id, qty: 1, price: p.price, discount: 0 });
  toast(`Added ${p.name} — ${deviceCode(d)}`, 'success', 1800);
  posCart(); posGrid();
}
function posPickDevice(p, replaceKey) {
  const taken = new Set(POS.items.map((i) => i.deviceId).filter(Boolean));
  const list = db.devices.filter((d) => d.productId === p.id && d.status === 'in_stock' && !taken.has(d.id));
  if (!list.length) { toast(`No ${p.name} units available in stock.`, 'error'); return; }
  const label = p.idType === 'imei' ? 'IMEI' : 'serial number';
  const m = openModal({
    title: `Select ${label} — ${h(p.name)}`,
    body: `<div class="input-icon mb">${icon('search')}<input class="input" id="pick-q" placeholder="Filter by ${label}…" autocomplete="off"></div><div class="pick-list" id="pick-list"></div><p class="xs muted mt-sm">${list.length} unit(s) available. Each unit is sold against its exact ${label} and linked to the customer, invoice and warranty.</p>`,
    onMount(el) {
      const draw = (q = '') => {
        const qn = normId(q);
        $('#pick-list', el).innerHTML = list.filter((d) => !qn || [d.imei1, d.imei2, d.serial].some((x) => x && x.includes(qn))).map((d) => {
          const pur = find('purchases', d.purchaseId);
          return `<button class="pick" data-dev="${d.id}">${icon('phone')}<div class="grow" style="min-width:0"><div class="mono bold">${h(d.imei1 || d.serial)}</div>${d.imei2 ? `<div class="mono xs muted">IMEI 2: ${h(d.imei2)}</div>` : ''}<div class="xs muted">Received ${fmtDate(pur ? pur.date : d.createdAt)}${canSeeCost() ? ' · cost ' + money(d.cost) : ''}</div></div>${sbadge('condition', d.condition)}</button>`;
        }).join('') || emptyState('search', 'No matching unit');
        $$('[data-dev]', el).forEach((b) => b.addEventListener('click', () => {
          const d = find('devices', b.dataset.dev);
          if (replaceKey) { const ln = POS.items.find((i) => i.key === replaceKey); ln.deviceId = d.id; posCart(); } else posAddDevice(d);
          m.close();
        }));
      };
      draw();
      $('#pick-q', el).addEventListener('input', (e) => draw(e.target.value));
    },
  });
}
function posTotals() { return calcCart(POS.items.map((i) => ({ ...i })), POS.discount); }
function posCart() {
  const el = $('#pos-cart'); if (!el) return;
  const t = posTotals();
  const edit = can('pos', 'edit');
  const items = POS.items.map((it) => {
    const p = find('products', it.productId); const d = it.deviceId && find('devices', it.deviceId);
    const wm = d ? (d.condition === 'new' ? p.warrantyMonths : p.usedWarrantyMonths) : p.warrantyMonths;
    return `<div class="cart-item">
      <div style="min-width:0"><div class="ci-name">${h(p.name)}</div>
        ${d ? `<div class="ci-sub">${p.idType === 'imei' ? 'IMEI' : 'S/N'} ${h(deviceCode(d))} <button class="btn btn-xs btn-ghost" data-action="pos-change-dev" data-key="${it.key}">Change</button></div>` : ''}
        ${d ? warrantySelect(it, wm) : `<div class="xs muted">${wm ? `${icon('shield', 'ic-sm')} ${wm}m ${h(p.warrantyProvider.toLowerCase())} warranty` : 'No warranty'}</div>`}${d && d.condition !== 'new' ? `<div class="xs muted">${CONDITIONS[d.condition]}</div>` : ''}</div>
      <button class="btn btn-xs btn-ghost btn-icon" data-action="pos-remove" data-key="${it.key}" aria-label="Remove">${icon('x', 'ic-sm')}</button>
      <div class="flex">${p.serialized ? `<span class="small muted">Qty 1</span>` : `<div class="qty"><button data-action="pos-qty" data-key="${it.key}" data-d="-1" aria-label="Decrease">${icon('minus', 'ic-sm')}</button><input value="${it.qty}" data-pos-qty="${it.key}" inputmode="numeric" aria-label="Quantity"><button data-action="pos-qty" data-key="${it.key}" data-d="1" aria-label="Increase">${icon('plus', 'ic-sm')}</button></div>`}
        ${edit ? `<input class="input input-sm" style="width:110px" data-pos-price="${it.key}" value="${it.price}" inputmode="decimal" aria-label="Unit price">` : `<span class="small">× ${money(it.price)}</span>`}</div>
      <div class="bold right" style="align-self:center">${money(it.price * it.qty - it.discount)}</div>
    </div>`;
  }).join('');
  el.innerHTML = `<div class="cart-head"><div class="flex between"><h3>Current sale</h3><button class="btn btn-icon btn-sm btn-ghost cart-close" style="display:none" data-action="pos-cart-close" aria-label="Close cart">${icon('x')}</button></div>
      <div class="flex"><select class="select input-sm grow" id="pos-cust" aria-label="Customer">${customerOptions(POS.customerId)}</select>${can('customers', 'create') ? `<button class="btn btn-sm btn-icon" data-action="pos-new-cust" aria-label="New customer" data-tip="New customer">${icon('userPlus')}</button>` : ''}</div>
      ${POS.customerId && customerBalance(POS.customerId) > 0 ? `<div class="alert alert-warning" style="padding:6px 10px">${icon('alert', 'ic-sm')}<div class="xs">Existing balance due: <b>${money(customerBalance(POS.customerId))}</b></div></div>` : ''}</div>
    <div class="cart-items">${items || emptyState('cart', 'Cart is empty', 'Tap a product or scan a barcode / IMEI.')}</div>
    <div class="cart-totals">
      <div class="row"><span class="muted">Subtotal (${sum(POS.items, (i) => i.qty)} items)</span><span>${money(t.subtotal)}</span></div>
      <div class="row" style="align-items:center"><span class="muted">Discount</span>${edit ? `<input class="input input-sm" style="width:110px;text-align:right" id="pos-disc" value="${POS.discount || ''}" placeholder="0" inputmode="decimal" aria-label="Invoice discount">` : `<span>${money(t.discount)}</span>`}</div>
      <div class="row"><span class="muted">${h(db.settings.taxName)} ${db.settings.taxRate}%${db.settings.taxInclusive ? ' (incl.)' : ''}</span><span>${money(t.tax)}</span></div>
      <div class="row total"><span>Total</span><span>${money(t.total)}</span></div>
    </div>
    <div class="cart-actions">
      <button class="btn btn-primary btn-lg" data-action="pos-checkout" ${POS.items.length ? '' : 'disabled'}>${icon('cash')} Charge ${money(t.total)}</button>
      <button class="btn" data-action="pos-quote" ${POS.items.length ? '' : 'disabled'}>${icon('quote')} Quotation</button>
      <button class="btn" data-action="pos-clear" ${POS.items.length ? '' : 'disabled'}>${icon('trash')} Clear</button>
    </div>`;
  const fab = $('#pos-fab');
  if (fab) fab.innerHTML = `<span class="flex">${icon('cart')} Cart (${sum(POS.items, (i) => i.qty)})</span><span>${money(t.total)} ${icon('chevronRight', 'ic-sm')}</span>`;
  $('#pos-cust').addEventListener('change', (e) => { POS.customerId = e.target.value; posCart(); });
  const disc = $('#pos-disc');
  if (disc) disc.addEventListener('change', () => { const v = Number(disc.value) || 0; if (v < 0) { toast('Discount cannot be negative.', 'error'); return; } POS.discount = Math.min(v, t.subtotal); posCart(); });
  $$('[data-pos-price]', el).forEach((inp) => inp.addEventListener('change', () => {
    const ln = POS.items.find((i) => i.key === inp.dataset.posPrice); const p = find('products', ln.productId);
    const v = Number(inp.value);
    if (!(v >= 0)) { toast('Enter a valid price.', 'error'); inp.value = ln.price; return; }
    if (canSeeCost() && v < p.cost) toast(`Warning: price is below cost (${money(p.cost)}).`, 'warning');
    ln.price = v; posCart();
  }));
  $$('[data-pos-war]', el).forEach((sel) => sel.addEventListener('change', () => {
    const ln = POS.items.find((i) => i.key === sel.dataset.posWar); ln.warrantyMonths = sel.value; posCart();
  }));
  $$('[data-pos-qty]', el).forEach((inp) => inp.addEventListener('change', () => {
    const ln = POS.items.find((i) => i.key === inp.dataset.posQty); const p = find('products', ln.productId);
    const v = Math.floor(Number(inp.value));
    if (!(v > 0)) { inp.value = ln.qty; return; }
    if (v > stockOf(p)) { toast(`Only ${stockOf(p)} in stock.`, 'error'); inp.value = ln.qty; return; }
    ln.qty = v; posCart(); posGrid();
  }));
}
Object.assign(ACT, {
  'pos-cat': (el) => { POS.cat = el.dataset.cat; $$('#pos-cats .chip').forEach((c) => c.classList.toggle('active', c.dataset.cat === POS.cat)); posGrid(); },
  'pos-add': (el) => posAdd(el.dataset.id),
  'pos-remove': (el) => { POS.items = POS.items.filter((i) => i.key !== el.dataset.key); posCart(); posGrid(); },
  'pos-qty': (el) => {
    const ln = POS.items.find((i) => i.key === el.dataset.key); const p = find('products', ln.productId);
    const nq = ln.qty + Number(el.dataset.d);
    if (nq < 1) { POS.items = POS.items.filter((i) => i !== ln); }
    else if (nq > stockOf(p)) { toast(`Only ${stockOf(p)} in stock.`, 'error'); return; }
    else ln.qty = nq;
    posCart(); posGrid();
  },
  'pos-change-dev': (el) => { const ln = POS.items.find((i) => i.key === el.dataset.key); posPickDevice(find('products', ln.productId), ln.key); },
  'pos-clear': async () => { const ok = await confirmDialog({ title: 'Clear cart?', message: 'All items will be removed from the current sale.', confirmText: 'Clear cart', danger: true }); if (ok) { POS.items = []; POS.discount = 0; posCart(); posGrid(); } },
  'pos-cart-open': () => $('#pos').classList.add('show-cart'),
  'pos-cart-close': () => $('#pos').classList.remove('show-cart'),
  'pos-new-cust': () => openCustomerForm(null, (c) => { POS.customerId = c.id; posCart(); }),
  'pos-quote': async () => {
    const q = await svc.saveQuote({ customerId: POS.customerId, items: POS.items, discount: POS.discount });
    toast(`Quotation ${q.no} saved.`);
    openModal({ title: `Quotation ${h(q.no)}`, size: 'sm', body: `<p>Quotation for <b>${h(customerName(q.customerId))}</b> totalling <b>${money(q.total)}</b> is valid until ${fmtDate(q.validUntil)}.</p><p class="muted small">The cart was kept so you can still complete the sale.</p>`,
      foot: `<button class="btn" data-dismiss>Close</button>${can('pos', 'print') ? `<button class="btn btn-primary" id="q-print">${icon('printer')} Print / PDF</button>` : ''}`,
      onMount(el) { const b = $('#q-print', el); b && b.addEventListener('click', () => printDoc(q.no, quoteDoc(q))); } });
  },
  'pos-checkout': () => posCheckout(),
  'pos-bulk': () => openBulkScanner({ mode: 'sell', taken: POS.items.map((i) => i.deviceId).filter(Boolean),
    onDone(units) {
      units.forEach((u) => { const d = find('devices', u.deviceId); POS.items.push({ key: uid('ln'), productId: d.productId, deviceId: d.id, qty: 1, price: find('products', d.productId).price, discount: 0 }); });
      posCart(); posGrid(); toast(`${units.length} unit(s) added to the cart.`);
    } }),
});
/** Required warranty period for each phone in the cart — chosen by the seller, starts today. */
function warrantySelect(it, standard) {
  const choices = [...new Set([1, 3, 6, 12, 18, 24, standard].filter((x) => x > 0))].sort((a, b) => a - b);
  const missing = it.warrantyMonths === undefined || it.warrantyMonths === '';
  const end = !missing && Number(it.warrantyMonths) > 0 ? isoDate(addDays(addMonths(new Date(), Number(it.warrantyMonths)), -1)) : '';
  return `<div class="field ${missing && POS.warnWarranty ? 'invalid' : ''}" style="margin-top:4px">
    <select class="select input-sm" data-pos-war="${it.key}" aria-label="Warranty period" style="max-width:230px">
      <option value="" ${missing ? 'selected' : ''}>Select warranty period…</option>
      <option value="0" ${it.warrantyMonths === '0' ? 'selected' : ''}>No warranty</option>
      ${choices.map((m) => `<option value="${m}" ${String(it.warrantyMonths) === String(m) ? 'selected' : ''}>${m} month${m === 1 ? '' : 's'}${m === standard ? ' (standard)' : ''}</option>`).join('')}
    </select>
    <span class="xs ${missing ? 'danger-text' : 'muted'}">${missing ? 'Required — choose the warranty' : end ? `${icon('shield', 'ic-sm')} ${fmtDate(todayISO())} → ${fmtDate(end)}` : 'Sold without warranty'}</span></div>`;
}
function posCheckout() {
  const noWarranty = POS.items.filter((i) => i.deviceId && (i.warrantyMonths === undefined || i.warrantyMonths === ''));
  if (noWarranty.length) {
    POS.warnWarranty = true; posCart();
    if ($('#pos')) $('#pos').classList.add('show-cart');
    const first = $(`[data-pos-war="${noWarranty[0].key}"]`); if (first) first.focus();
    toast(`Select the warranty period for ${noWarranty.length} phone${noWarranty.length === 1 ? '' : 's'} before charging.`, 'error');
    return;
  }
  const t = posTotals();
  const methods = db.settings.paymentMethods;
  let rows = [{ method: 'Cash', amount: t.total }];
  const m = openModal({
    title: 'Take payment', size: 'lg',
    body: `<form id="pay-form" novalidate class="stack">
      <div class="pay-summary"><div><div class="xs muted">Total due</div><div class="v">${money(t.total)}</div></div><div><div class="xs muted">Paid</div><div class="v" id="pay-paid"></div></div><div><div class="xs muted" id="pay-bal-l">Balance</div><div class="v" id="pay-bal"></div></div></div>
      <div><div class="label mb-sm">Payment method(s)</div><div id="pay-rows" class="stack-sm"></div>
        <div class="flex flex-wrap mt-sm"><button type="button" class="btn btn-sm" id="pay-add">${icon('plus', 'ic-sm')} Split payment</button><span class="xs muted">Quick cash:</span><span id="pay-quick" class="flex flex-wrap" style="gap:6px"></span></div></div>
      <div class="field"><label>Customer</label><select class="select" id="pay-cust">${customerOptions(POS.customerId)}</select><span class="hint">A registered customer is needed for partial payments and is linked to device warranties.</span></div>
      <label class="check hidden" id="pay-credit-wrap"><input type="checkbox" id="pay-credit"> Record the unpaid balance as customer credit (partial payment)</label>
      ${POS.items.some((i) => i.deviceId) ? `<div class="alert alert-info">${icon('shield')}<div>Warranty from today (sale date): ${POS.items.filter((i) => i.deviceId).map((i) => `<b>${h(productName(i.productId))}</b> — ${Number(i.warrantyMonths) > 0 ? `${i.warrantyMonths} months` : 'no warranty'}`).join(', ')}.</div></div>` : ''}
    </form>`,
    foot: `<button class="btn" data-dismiss>Back</button><button class="btn btn-primary btn-lg" type="submit" form="pay-form">${icon('check')} Complete sale</button>`,
    onMount(el) {
      const draw = () => {
        $('#pay-rows', el).innerHTML = rows.map((r, i) => `<div class="pay-row"><select class="select" data-pm="${i}">${opts(methods, r.method)}</select><input class="input" data-pa="${i}" value="${r.amount}" inputmode="decimal" aria-label="Amount"><button type="button" class="btn btn-icon" data-pr="${i}" ${rows.length === 1 ? 'disabled' : ''} aria-label="Remove">${icon('x', 'ic-sm')}</button></div>`).join('');
        $$('[data-pm]', el).forEach((s) => s.addEventListener('change', () => { rows[s.dataset.pm].method = s.value; }));
        $$('[data-pa]', el).forEach((s) => s.addEventListener('input', () => { rows[s.dataset.pa].amount = Number(s.value) || 0; upd(); }));
        $$('[data-pr]', el).forEach((s) => s.addEventListener('click', () => { rows.splice(Number(s.dataset.pr), 1); draw(); }));
        upd();
      };
      const upd = () => {
        const paid = round2(sum(rows, (r) => r.amount));
        $('#pay-paid', el).textContent = money(paid);
        const bal = round2(t.total - paid);
        $('#pay-bal-l', el).textContent = bal < 0 ? 'Change' : 'Balance due';
        $('#pay-bal', el).textContent = money(Math.abs(bal));
        $('#pay-bal', el).className = 'v ' + (bal > 0 ? 'danger-text' : bal < 0 ? 'success-text' : '');
        $('#pay-credit-wrap', el).classList.toggle('hidden', !(bal > 0));
      };
      const quick = [t.total, Math.ceil(t.total / 1000) * 1000, Math.ceil(t.total / 5000) * 5000].filter((v, i, a) => a.indexOf(v) === i);
      $('#pay-quick', el).innerHTML = quick.map((v) => `<button type="button" class="btn btn-xs" data-q="${v}">${money(v)}</button>`).join('');
      $$('[data-q]', el).forEach((b) => b.addEventListener('click', () => { rows = [{ method: 'Cash', amount: Number(b.dataset.q) }]; draw(); }));
      $('#pay-add', el).addEventListener('click', () => { const left = Math.max(0, round2(t.total - sum(rows, (r) => r.amount))); rows.push({ method: 'Card', amount: left }); draw(); });
      draw();
      bindForm($('#pay-form', el), async () => {
        POS.customerId = $('#pay-cust', el).value;
        const s = await svc.createSale({ customerId: POS.customerId, items: POS.items, discount: POS.discount, payments: rows, allowCredit: $('#pay-credit', el).checked });
        m.close();
        POS.items = []; POS.discount = 0; POS.customerId = ''; POS.q = ''; POS.warnWarranty = false;
        if ($('#pos')) { $('#pos').classList.remove('show-cart'); posCart(); posGrid(); }
        updateChrome();
        saleDone(s);
      });
    },
  });
}
function saleDone(s) {
  const t = saleTotals(s);
  const ws = s.items.map((i) => i.warrantyId && find('warranties', i.warrantyId)).filter(Boolean);
  openModal({
    title: 'Sale completed', size: 'sm',
    body: `<div class="center stack"><span class="kpi-icon tone-green" style="width:56px;height:56px;margin:0 auto;border-radius:50%">${icon('check', 'ic-lg')}</span>
      <div><div class="mono muted">${h(s.no)}</div><div class="kpi-value">${money(s.total)}</div>${s.change ? `<div class="success-text bold">Change due: ${money(s.change)}</div>` : ''}${t.balance > 0 ? `<div class="danger-text bold">Balance on account: ${money(t.balance)}</div>` : ''}</div>
      <div class="small muted">${h(customerName(s.customerId))} · ${s.items.length} line(s)${ws.length ? ` · ${ws.length} warranty record(s) created` : ''}</div></div>`,
    foot: `${can('pos', 'print') || can('sales', 'print') ? `<button class="btn" id="sd-print">${icon('printer')} Invoice</button><button class="btn" data-action="pdf" data-path="/documents/invoice/${s.id}" data-name="${s.no}">${icon('download')} PDF</button>` : ''}${ws.length && can('warranties', 'print') ? `<button class="btn" id="sd-wprint">${icon('shield')} Warranty card</button>` : ''}<button class="btn btn-primary" data-dismiss>New sale</button>`,
    onMount(el) {
      const b = $('#sd-print', el); b && b.addEventListener('click', () => printDoc(s.no, invoiceDoc(s)));
      const w = $('#sd-wprint', el); w && w.addEventListener('click', () => printDoc('Warranty', ws.map(warrantyDoc).join('<div style="page-break-after:always"></div>')));
    },
  });
}

/* ---------------- Sales list ---------------- */
PAGES.sales = {
  title: 'Sales & Invoices', perm: ['sales', 'view'],
  render({ id, query }) {
    if (id) return saleDetail(id);
    const tab = query.tab || 'invoices';
    const sales = visibleSales();
    const head = pageHead('Sales & Invoices', can('sales', 'manage') ? 'All invoices across staff.' : 'Showing invoices you created.', `${can('sales', 'export') && tab === 'invoices' ? `<button class="btn" data-action="sales-export">${icon('download')} Export</button>` : ''}${can('pos', 'create') ? `<a class="btn btn-primary" href="#/pos">${icon('plus')} New sale</a>` : ''}`);
    const returns = sales.flatMap((s) => (s.returns || []).map((r) => ({ ...r, sale: s })));
    const tabs = tabsHtml([{ key: 'invoices', label: 'Invoices', count: sales.length }, { key: 'quotes', label: 'Quotations', count: db.quotes.length }, { key: 'returns', label: 'Returns & refunds', count: returns.length }], tab);
    let body = '';
    if (tab === 'invoices') {
      body = dataTable('sales', {
        rows: () => sales, placeholder: 'Search invoice, customer, IMEI, product…', rowHref: (s) => '#/sales/' + s.id,
        searchText: (s) => [s.no, customerName(s.customerId), s.items.map((i) => i.name + ' ' + i.code).join(' '), userName(s.userId)].join(' '),
        filters: [
          { key: 'period', label: 'Any date', options: [['today', 'Today'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['month', 'This month']], fn: (s, v) => inRange(s.date, rangeOf(v)) },
          { key: 'status', label: 'Any status', options: Object.entries(TONES.sale).map(([k, v]) => [k, v[0]]), fn: (s, v) => s.status === v },
          { key: 'pay', label: 'Any payment', options: [['paid', 'Paid'], ['due', 'Balance due']], fn: (s, v) => (v === 'due' ? saleTotals(s).balance > 0 : saleTotals(s).balance <= 0) },
          ...(can('sales', 'manage') ? [{ key: 'staff', label: 'All staff', options: db.users.map((u) => [u.id, u.name]), fn: (s, v) => s.userId === v }] : []),
        ],
        columns: [
          { label: 'Invoice', cls: 'td-main', sort: (s) => s.at, render: (s) => `<div class="cell-main mono">${h(s.no)}</div><div class="cell-sub">${fmtDateTime(s.at)}</div>`, csv: (s) => s.no },
          { label: 'Date', sort: (s) => s.at, render: (s) => fmtDate(s.date), csv: (s) => s.date, cls: 'hidden' },
          { label: 'Customer', sort: (s) => customerName(s.customerId), render: (s) => h(customerName(s.customerId)), csv: (s) => customerName(s.customerId) },
          { label: 'Items', render: (s) => `<span class="truncate" style="max-width:240px;display:inline-block">${h(s.items.map((i) => i.name).join(', '))}</span>`, csv: (s) => s.items.map((i) => `${i.qty}x ${i.name}${i.code ? ' [' + i.code + ']' : ''}`).join('; ') },
          { label: 'Staff', render: (s) => h(userName(s.userId)), csv: (s) => userName(s.userId) },
          { label: 'Total', cls: 'num', sort: (s) => s.total, render: (s) => `<b>${money(saleTotals(s).net)}</b>`, csv: (s) => saleTotals(s).net },
          { label: 'Payment', render: (s) => sbadge('pay', s.status === 'cancelled' ? 'none' : payState(saleTotals(s).net, saleTotals(s).paid)), csv: (s) => saleTotals(s).balance },
          { label: 'Status', render: (s) => sbadge('sale', s.status), csv: (s) => s.status },
        ],
        footer: (rows) => ['<b>Total</b>', '', `${rows.length} invoices`, '', '', `<b>${money(sum(rows, (s) => saleTotals(s).net))}</b>`, `${money(sum(rows, (s) => saleTotals(s).balance))} due`, ''],
      });
    } else if (tab === 'quotes') {
      body = dataTable('quotes', {
        rows: () => db.quotes, searchText: (q) => q.no + ' ' + customerName(q.customerId),
        columns: [
          { label: 'Quotation', cls: 'td-main', render: (q) => `<div class="cell-main mono">${h(q.no)}</div><div class="cell-sub">${fmtDate(q.date)}</div>` },
          { label: 'Customer', render: (q) => h(customerName(q.customerId)) },
          { label: 'Items', render: (q) => h(q.items.map((i) => `${i.qty}× ${i.name}`).join(', ')) },
          { label: 'Valid until', render: (q) => (daysUntil(q.validUntil) < 0 ? badge('Expired ' + fmtDate(q.validUntil), 'gray') : fmtDate(q.validUntil)) },
          { label: 'Total', cls: 'num', render: (q) => `<b>${money(q.total)}</b>` },
          { label: '', cls: 'actions', render: (q) => `${can('pos', 'print') ? `<button class="btn btn-xs" data-action="quote-print" data-id="${q.id}">${icon('printer', 'ic-sm')} Print</button><button class="btn btn-xs" data-action="pdf" data-path="/documents/quotation/${q.id}" data-name="${q.no}">${icon('download', 'ic-sm')} PDF</button>` : ''}${can('pos', 'create') ? `<button class="btn btn-xs btn-primary" data-action="quote-load" data-id="${q.id}">${icon('cart', 'ic-sm')} Load in POS</button>` : ''}` },
        ],
        emptyIcon: 'quote', emptyTitle: 'No quotations yet',
      });
    } else {
      body = dataTable('returns', {
        rows: () => returns.sort((a, b) => (a.at < b.at ? 1 : -1)), searchText: (r) => r.sale.no + ' ' + r.reason + ' ' + r.items.join(' '), rowHref: (r) => '#/sales/' + r.sale.id,
        columns: [
          { label: 'Invoice', cls: 'td-main', render: (r) => `<div class="cell-main mono">${h(r.sale.no)}</div><div class="cell-sub">${fmtDateTime(r.at)}</div>` },
          { label: 'Items returned', render: (r) => h(r.items.join(', ')) },
          { label: 'Reason', render: (r) => `<span class="small">${h(r.reason)}</span>` },
          { label: 'Processed by', render: (r) => h(userName(r.userId)) },
          { label: 'Value', cls: 'num', render: (r) => money(r.amount) },
          { label: 'Refunded', cls: 'num', render: (r) => `<b>${money(r.refund)}</b> <span class="xs muted">${h(r.method)}</span>` },
        ],
        emptyIcon: 'undo', emptyTitle: 'No returns recorded',
      });
    }
    return head + `<div class="card">${tabs}${body}</div>`;
  },
};
Object.assign(ACT, {
  'sales-export': () => { need('sales', 'export'); dtExport('sales', `invoices-${todayISO()}`); log('sales', 'Exported', 'Invoice list exported to CSV'); saveDB(); },
  'quote-print': (el) => { const q = find('quotes', el.dataset.id); printDoc(q.no, quoteDoc(q)); },
  'quote-load': (el) => {
    const q = find('quotes', el.dataset.id);
    const items = []; const taken = new Set(); let missing = 0;
    q.items.forEach((it) => {
      const p = find('products', it.productId);
      if (p.serialized) {
        for (let k = 0; k < it.qty; k++) {
          const d = db.devices.filter((x) => x.productId === p.id && x.status === 'in_stock' && !taken.has(x.id)).pop();
          if (!d) { missing++; continue; }
          taken.add(d.id); items.push({ key: uid('ln'), productId: p.id, deviceId: d.id, qty: 1, price: it.price, discount: 0 });
        }
      } else items.push({ key: uid('ln'), productId: p.id, qty: Math.min(it.qty, p.qty), price: it.price, discount: 0 });
    });
    POS.items = items; POS.customerId = q.customerId || ''; POS.discount = q.discount || 0;
    toast(missing ? `${missing} unit(s) not in stock were skipped. IMEIs were auto-selected — tap “Change” to pick others.` : 'Quotation loaded. IMEIs were auto-selected (oldest stock first).', missing ? 'warning' : 'success', 5000);
    location.hash = '#/pos';
  },
});

/* ---------------- Sale detail ---------------- */
function saleDetail(id) {
  const s = find('sales', id);
  if (!s || (!can('sales', 'manage') && s.userId !== currentUser.id)) return emptyState('lock', 'Invoice not available', 'It does not exist or belongs to another staff member.');
  const t = saleTotals(s);
  const c = find('customers', s.customerId);
  const acts = [
    can('sales', 'print') ? `<button class="btn" data-action="sale-print" data-id="${s.id}">${icon('printer')} Print</button><button class="btn" data-action="pdf" data-path="/documents/invoice/${s.id}" data-name="${s.no}">${icon('download')} PDF</button>` : '',
    can('sales', 'edit') && t.balance > 0 ? `<button class="btn btn-primary" data-action="sale-pay" data-id="${s.id}">${icon('cash')} Receive payment</button>` : '',
    can('sales', 'refund') && s.status !== 'cancelled' && s.status !== 'refunded' ? `<button class="btn" data-action="sale-refund" data-id="${s.id}">${icon('undo')} Return / refund</button>` : '',
    can('sales', 'cancel') && s.status === 'completed' ? `<button class="btn btn-danger" data-action="sale-cancel" data-id="${s.id}">${icon('ban')} Cancel invoice</button>` : '',
  ].join('');
  const restricted = !can('sales', 'refund') ? `<div class="alert alert-info mb">${icon('lock')}<div>Returns, refunds and cancellations require additional permissions. Ask a manager.</div></div>` : '';
  const items = s.items.map((it) => {
    const w = it.warrantyId && find('warranties', it.warrantyId);
    return `<tr><td class="td-main" data-label="Item"><div class="cell-main">${h(it.name)}</div>${it.deviceId ? `<div class="cell-sub mono">${can('inventory', 'view') ? `<a href="#/imei/${it.deviceId}">${h(it.code)}</a>` : h(it.code)}</div>` : ''}${it.returnedQty ? `<div class="xs danger-text">${it.returnedQty} returned</div>` : ''}</td>
      <td data-label="Warranty">${w ? `<a href="#/warranties/${w.id}">${h(w.no)}</a> ${sbadge('warranty', wStatus(w))}<div class="xs muted">until ${fmtDate(w.end)}</div>` : '<span class="muted">—</span>'}</td>
      <td data-label="Qty" class="num">${it.qty}</td><td data-label="Price" class="num">${money(it.price)}</td><td data-label="Amount" class="num"><b>${money(it.lineTotal)}</b></td></tr>`;
  }).join('');
  const related = db.activity.filter((a) => a.ref === s.no).slice(0, 10);
  return pageHead(`Invoice <span class="mono">${h(s.no)}</span>`, `${fmtDateTime(s.at)} · by ${h(userName(s.userId))}`, acts, `<a href="#/sales">Sales</a> ${icon('chevronRight', 'ic-sm')} ${h(s.no)}`) + restricted + `
    <div class="grid grid-main-side">
      <div class="stack">
        <div class="card"><div class="card-head"><h3>Items</h3><div class="flex">${sbadge('sale', s.status)}${sbadge('pay', s.status === 'cancelled' ? 'none' : payState(t.net, t.paid))}</div></div>
          <div class="table-wrap"><table class="table rtable"><thead><tr><th>Item</th><th>Warranty</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Amount</th></tr></thead><tbody>${items}</tbody></table></div></div>
        <div class="card"><div class="card-head"><h3>Payments</h3></div><div class="table-wrap"><table class="table rtable"><thead><tr><th>Date</th><th>Method</th><th>Received by</th><th class="num">Amount</th></tr></thead><tbody>${s.payments.map((p) => `<tr><td class="td-main" data-label="Date">${fmtDateTime(p.at)}</td><td data-label="Method">${h(p.method)}${p.ref ? ` <span class="xs muted">${h(p.ref)}</span>` : ''}</td><td data-label="By">${h(userName(p.userId))}</td><td data-label="Amount" class="num ${p.amount < 0 ? 'danger-text' : ''}"><b>${money(p.amount)}</b></td></tr>`).join('') || `<tr><td colspan="4" class="muted">No payments recorded</td></tr>`}</tbody></table></div></div>
        ${(s.replacements || []).map((x) => replacementCard(db.replacements.find((r) => r.no === x.no), 'Warranty replacement on this invoice')).join('')}
        ${s.returns.length ? `<div class="card"><div class="card-head"><h3>Returns & refunds</h3></div><div class="card-body flush">${s.returns.map((r) => `<div class="list-row"><span class="kpi-icon tone-amber">${icon('undo', 'ic-sm')}</span><div class="grow"><div class="small bold">${h(r.items.join(', '))}</div><div class="xs muted">${fmtDateTime(r.at)} · ${h(userName(r.userId))} · ${h(r.reason)}</div></div><div class="right"><div class="bold">${money(r.refund)}</div><div class="xs muted">refunded</div></div></div>`).join('')}</div></div>` : ''}
        ${s.status === 'cancelled' ? `<div class="alert alert-danger">${icon('ban')}<div><b>Cancelled</b> by ${h(userName(s.cancelledBy))} on ${fmtDateTime(s.cancelledAt)} — ${h(s.cancelReason)}. Stock was restored and warranties voided; the record is kept for audit.</div></div>` : ''}
      </div>
      <div class="stack">
        <div class="card"><div class="card-head"><h3>Summary</h3></div><div class="card-body"><dl class="dl">
          <dt>Subtotal</dt><dd class="right">${money(s.subtotal)}</dd><dt>Discount</dt><dd class="right">−${money(s.discount)}</dd>
          <dt>${h(db.settings.taxName)} ${s.taxInclusive ? '(incl.)' : ''}</dt><dd class="right">${money(s.tax)}</dd>
          ${t.returned ? `<dt>Returns</dt><dd class="right">−${money(t.returned)}</dd>` : ''}
          <dt><b>Net total</b></dt><dd class="right"><b>${money(t.net)}</b></dd><dt>Paid</dt><dd class="right">${money(t.paid)}</dd>
          <dt><b>Balance</b></dt><dd class="right ${t.balance > 0 ? 'danger-text' : ''}"><b>${money(t.balance)}</b></dd>
          ${canFinance() ? `<dt>Est. gross profit</dt><dd class="right success-text">${money(saleProfit(s))}</dd>` : ''}
        </dl></div></div>
        <div class="card"><div class="card-head"><h3>Customer</h3></div><div class="card-body">${c ? `<div class="flex">${avatar(c.name)}<div><div class="bold">${can('customers', 'view') ? `<a href="#/customers/${c.id}">${h(c.name)}</a>` : h(c.name)}</div><div class="small muted">${h(c.phone)} · ${h(c.code)}</div></div></div>` : '<span class="muted">Walk-in customer</span>'}</div></div>
        ${related.length ? `<div class="card"><div class="card-head"><h3>Audit trail</h3></div><div class="card-body"><ul class="timeline">${related.map((a) => `<li><div class="t-title">${h(a.action)}</div><div class="t-meta">${fmtDateTime(a.at)} · ${h(userName(a.userId))}</div><div class="small text-2">${h(a.detail)}</div></li>`).join('')}</ul></div></div>` : ''}
      </div>
    </div>`;
}
Object.assign(ACT, {
  'sale-print': (el) => { need('sales', 'print'); const s = find('sales', el.dataset.id); printDoc(s.no, invoiceDoc(s)); },
  'sale-pay': (el) => {
    const s = find('sales', el.dataset.id); const bal = saleTotals(s).balance;
    const m = openModal({ title: `Receive payment — ${h(s.no)}`, size: 'sm',
      body: `<form id="sp-form" class="stack" novalidate><div class="alert alert-info">${icon('info')}<div>Balance due: <b>${money(bal)}</b></div></div>${field('Amount', `<input class="input" name="amount" inputmode="decimal" required value="${bal}">`, { req: true })}${field('Method', `<select class="select" name="method">${opts(db.settings.paymentMethods)}</select>`)}${field('Reference (optional)', '<input class="input" name="ref" placeholder="Card slip / transfer ref">')}</form>`,
      foot: `<button class="btn" data-dismiss>Cancel</button><button class="btn btn-primary" type="submit" form="sp-form">Record payment</button>`,
      onMount(el2) { bindForm($('#sp-form', el2), async (d) => { await svc.salePayment(s.id, d.method, Number(d.amount), d.ref); m.close(); toast('Payment recorded.'); refresh(); }); } });
  },
  'sale-refund': (el) => {
    const s = find('sales', el.dataset.id);
    const lines = s.items.map((it, idx) => ({ it, idx, avail: it.qty - (it.returnedQty || 0) })).filter((x) => x.avail > 0);
    const m = openModal({ title: `Return / refund — ${h(s.no)}`, size: 'lg',
      body: `<form id="rf-form" class="stack" novalidate>
        <div class="table-wrap"><table class="table rtable"><thead><tr><th>Item</th><th class="num">Sold</th><th class="num">Return qty</th></tr></thead><tbody>${lines.map((x) => `<tr><td class="td-main" data-label="Item"><div class="cell-main">${h(x.it.name)}</div>${x.it.code ? `<div class="cell-sub mono">${h(x.it.code)}</div>` : ''}</td><td data-label="Available" class="num">${x.avail}</td><td data-label="Return" class="num">${x.it.deviceId ? `<label class="check"><input type="checkbox" data-ret="${x.idx}" value="1"> Return</label>` : `<input class="input input-sm" style="width:80px;margin-left:auto" data-ret="${x.idx}" inputmode="numeric" value="0">`}</td></tr>`).join('')}</tbody></table></div>
        <div class="form-grid">
          ${field('Returned stock goes to', `<select class="select" name="restock"><option value="stock">Sellable stock (item OK)</option><option value="inspect">Hold for inspection</option><option value="damaged">Damaged / defective (write off)</option></select>`, { hint: 'Every option is recorded as a traceable stock movement.' })}
          ${field('Refund method', `<select class="select" name="method">${opts(db.settings.paymentMethods)}</select>`)}
          ${field('Reason', '<textarea class="input" name="reason" rows="2" required placeholder="e.g. Customer changed their mind within 7 days"></textarea>', { req: true, cls: 'span-all' })}
        </div>
        <div class="alert alert-warning">${icon('alert')}<div>Warranties of returned devices are voided automatically. The refund equals the amount paid above the new invoice total.</div></div></form>`,
      foot: `<button class="btn" data-dismiss>Cancel</button><button class="btn btn-danger" type="submit" form="rf-form">${icon('undo')} Process return</button>`,
      onMount(el2) {
        bindForm($('#rf-form', el2), async (d) => {
          const sel = $$('[data-ret]', el2).map((i) => ({ idx: Number(i.dataset.ret), qty: i.type === 'checkbox' ? (i.checked ? 1 : 0) : Number(i.value) || 0 })).filter((x) => x.qty > 0);
          const r = await svc.refundSale(s.id, { lines: sel, reason: d.reason, restock: d.restock, method: d.method });
          m.close(); toast(`Return processed. Refund: ${money(r.refund)}.`); refresh();
        });
      } });
  },
  'sale-cancel': async (el) => {
    const s = find('sales', el.dataset.id);
    const ok = await confirmDialog({ title: `Cancel ${s.no}?`, message: 'Stock will be restored, warranties voided and any payment refunded. The invoice stays in the system marked as cancelled.', confirmText: 'Cancel invoice', danger: true, reason: true, reasonLabel: 'Cancellation reason' });
    if (!ok) return;
    await svc.cancelSale(s.id, ok.reason); toast(`${s.no} cancelled.`); refresh();
  },
});

/* ---------------- Customers ---------------- */
PAGES.customers = {
  title: 'Customers', perm: ['customers', 'view'],
  render({ id, query }) {
    if (id) return customerDetail(id, query);
    const showMoney = can('sales', 'view');
    const stats = (c) => { const ss = db.sales.filter((s) => s.customerId === c.id && s.status !== 'cancelled'); return { n: ss.length, spent: sum(ss, (s) => saleTotals(s).net), rep: db.repairs.filter((r) => r.customerId === c.id).length }; };
    return pageHead('Customers', `${db.customers.length} customers on file.`, `${can('customers', 'export') ? `<button class="btn" data-action="cust-export">${icon('download')} Export</button>` : ''}${can('customers', 'create') ? `<button class="btn btn-primary" data-action="cust-new">${icon('userPlus')} New customer</button>` : ''}`) +
      `<div class="card">${dataTable('customers', {
        rows: () => db.customers, placeholder: 'Search name, phone, email, ID…', rowHref: (c) => '#/customers/' + c.id,
        searchText: (c) => [c.name, c.phone, c.email, c.code, c.address].join(' '),
        initialFilters: query.f === 'owing' ? { f: 'owing' } : {},
        filters: showMoney ? [{ key: 'f', label: 'All customers', options: [['owing', 'With balance due']], fn: (c) => customerBalance(c.id) > 0 }] : [],
        columns: [
          { label: 'Customer', cls: 'td-main', sort: (c) => c.name, render: (c) => `<div class="flex">${avatar(c.name)}<div><div class="cell-main">${h(c.name)}</div><div class="cell-sub">${h(c.code)}</div></div></div>`, csv: (c) => c.name },
          { label: 'Phone', render: (c) => h(c.phone), csv: (c) => c.phone },
          { label: 'Email', render: (c) => h(c.email || '—'), csv: (c) => c.email },
          ...(showMoney ? [{ label: 'Invoices', cls: 'num', sort: (c) => stats(c).n, render: (c) => stats(c).n, csv: (c) => stats(c).n },
            { label: 'Total spent', cls: 'num', sort: (c) => stats(c).spent, render: (c) => money(stats(c).spent), csv: (c) => stats(c).spent }] : []),
          { label: 'Repairs', cls: 'num', render: (c) => stats(c).rep, csv: (c) => stats(c).rep },
          ...(showMoney ? [{ label: 'Balance', cls: 'num', sort: (c) => customerBalance(c.id), render: (c) => { const b = customerBalance(c.id); return b > 0 ? `<b class="danger-text">${money(b)}</b>` : '<span class="muted">—</span>'; }, csv: (c) => customerBalance(c.id) }] : []),
        ],
      })}</div>`;
  },
};
Object.assign(ACT, {
  'cust-new': () => openCustomerForm(null, (c) => { location.hash = '#/customers/' + c.id; }),
  'cust-edit': (el) => openCustomerForm(find('customers', el.dataset.id), () => refresh()),
  'cust-export': () => { need('customers', 'export'); dtExport('customers', `customers-${todayISO()}`); },
  'cust-sale': (el) => { POS.customerId = el.dataset.id; location.hash = '#/pos'; },
  'cust-pay': (el) => {
    const c = find('customers', el.dataset.id); const bal = customerBalance(c.id);
    const m = openModal({ title: `Receive payment — ${h(c.name)}`, size: 'sm',
      body: `<form id="cp-form" class="stack" novalidate><div class="alert alert-info">${icon('info')}<div>Total outstanding: <b>${money(bal)}</b>. Payment is applied to the oldest invoices / repair jobs first.</div></div>${field('Amount', `<input class="input" name="amount" inputmode="decimal" required value="${bal}">`, { req: true })}${field('Method', `<select class="select" name="method">${opts(db.settings.paymentMethods)}</select>`)}</form>`,
      foot: `<button class="btn" data-dismiss>Cancel</button><button class="btn btn-primary" type="submit" form="cp-form">Record payment</button>`,
      onMount(el2) { bindForm($('#cp-form', el2), async (d) => { const ap = await svc.customerPayment(c.id, Number(d.amount), d.method); m.close(); toast(`Payment applied: ${ap.join(', ')}`); refresh(); }); } });
  },
  'cust-statement': (el) => {
    need('customers', 'print');
    const c = find('customers', el.dataset.id);
    const docs = [...db.sales.filter((s) => s.customerId === c.id).map((s) => ({ date: s.at, ref: s.no, desc: s.items.map((i) => i.name).join(', '), amt: saleTotals(s).net, paid: saleTotals(s).paid, st: s.status })),
      ...db.repairs.filter((r) => r.customerId === c.id && r.status === 'delivered').map((r) => ({ date: r.deliveredAt, ref: r.no, desc: `Repair: ${r.brand} ${r.model} — ${r.type}`, amt: repairTotals(r).total, paid: repairTotals(r).paid, st: 'delivered' }))].sort((a, b) => (a.date > b.date ? 1 : -1));
    printDoc('Statement ' + c.name, `${docHeader('Customer Statement', `<div>${fmtDate(todayISO())}</div>`)}<div class="grid2">${docCustomer(c.id)}<div class="box"><h4>Balance due</h4><div class="big ${customerBalance(c.id) > 0 ? 'bad' : 'ok'}">${money(customerBalance(c.id))}</div></div></div>
      <table><thead><tr><th>Date</th><th>Reference</th><th>Description</th><th class="num">Amount</th><th class="num">Paid</th><th class="num">Balance</th></tr></thead><tbody>${docs.map((d) => `<tr><td>${fmtDate(isoDate(new Date(d.date)))}</td><td class="mono">${h(d.ref)}</td><td>${h(d.desc)}${d.st === 'cancelled' ? ' (cancelled)' : ''}</td><td class="num">${money(d.amt)}</td><td class="num">${money(d.paid)}</td><td class="num">${money(d.st === 'cancelled' ? 0 : d.amt - d.paid)}</td></tr>`).join('')}</tbody></table>`);
  },
});
function customerDetail(id, query) {
  const c = find('customers', id); if (!c) return emptyState('user', 'Customer not found');
  const tab = query.tab || 'overview';
  const sales = db.sales.filter((s) => s.customerId === c.id);
  const devices = db.devices.filter((d) => d.customerId === c.id);
  const ws = db.warranties.filter((w) => w.customerId === c.id);
  const reps = db.repairs.filter((r) => r.customerId === c.id);
  const claims = db.claims.filter((x) => x.customerId === c.id);
  const bal = customerBalance(c.id);
  const showMoney = can('sales', 'view');
  const acts = [
    can('customers', 'edit') ? `<button class="btn" data-action="cust-edit" data-id="${c.id}">${icon('edit')} Edit</button>` : '',
    can('customers', 'print') && showMoney ? `<button class="btn" data-action="cust-statement" data-id="${c.id}">${icon('printer')} Statement</button><button class="btn" data-action="pdf" data-path="/documents/statement/${c.id}" data-name="Statement-${c.code}">${icon('download')} PDF</button>` : '',
    can('repairs', 'create') ? `<a class="btn" href="#/repairs/new?customer=${c.id}">${icon('wrench')} New repair</a>` : '',
    can('sales', 'edit') && bal > 0 ? `<button class="btn" data-action="cust-pay" data-id="${c.id}">${icon('cash')} Receive payment</button>` : '',
    can('pos', 'create') ? `<button class="btn btn-primary" data-action="cust-sale" data-id="${c.id}">${icon('cart')} New sale</button>` : '',
  ].join('');
  const tabs = tabsHtml([{ key: 'overview', label: 'Overview' }, ...(showMoney ? [{ key: 'invoices', label: 'Invoices', count: sales.length }] : []), { key: 'devices', label: 'Devices & warranties', count: ws.length }, { key: 'repairs', label: 'Repairs', count: reps.length }, { key: 'claims', label: 'Claims', count: claims.length }], tab);
  let body = '';
  if (tab === 'overview') {
    body = `<div class="card-body"><div class="mini-stats mb">
      ${showMoney ? `<div class="mini-stat"><div class="v">${money(sum(sales.filter((s) => s.status !== 'cancelled'), (s) => saleTotals(s).net))}</div><div class="l">Lifetime purchases</div></div>` : ''}
      <div class="mini-stat"><div class="v">${devices.length}</div><div class="l">Devices owned</div></div>
      <div class="mini-stat"><div class="v success-text">${ws.filter((w) => ['active', 'expiring'].includes(wStatus(w))).length}</div><div class="l">Active warranties</div></div>
      <div class="mini-stat"><div class="v">${reps.length}</div><div class="l">Repair jobs</div></div>
      ${showMoney ? `<div class="mini-stat"><div class="v ${bal > 0 ? 'danger-text' : ''}">${money(bal)}</div><div class="l">Balance due</div></div>` : ''}</div>
      <div class="grid grid-2"><div><div class="label mb-sm">Contact</div><dl class="dl"><dt>Phone</dt><dd>${h(c.phone)}</dd><dt>Email</dt><dd>${h(c.email || '—')}</dd><dt>Address</dt><dd>${h(c.address || '—')}</dd><dt>Customer since</dt><dd>${fmtDate(isoDate(new Date(c.createdAt)))}</dd></dl></div>
      <div><div class="label mb-sm">Notes</div><p class="text-2">${h(c.notes || 'No notes.')}</p></div></div></div>`;
  } else if (tab === 'invoices') {
    body = dataTable('cust-sales', { rows: () => sales, search: false, rowHref: (s) => '#/sales/' + s.id, columns: [
      { label: 'Invoice', cls: 'td-main', render: (s) => `<div class="cell-main mono">${h(s.no)}</div><div class="cell-sub">${fmtDate(s.date)}</div>` },
      { label: 'Items', render: (s) => h(s.items.map((i) => i.name).join(', ')) },
      { label: 'Total', cls: 'num', render: (s) => money(saleTotals(s).net) },
      { label: 'Balance', cls: 'num', render: (s) => (saleTotals(s).balance > 0 ? `<b class="danger-text">${money(saleTotals(s).balance)}</b>` : '—') },
      { label: 'Status', render: (s) => sbadge('sale', s.status) }], emptyTitle: 'No invoices' });
  } else if (tab === 'devices') {
    body = dataTable('cust-w', { rows: () => ws, search: false, rowHref: (w) => '#/warranties/' + w.id, columns: [
      { label: 'Warranty', cls: 'td-main', render: (w) => `<div class="cell-main mono">${h(w.no)}</div><div class="cell-sub">${w.kind === 'repair' ? 'Repair warranty · ' + h(w.jobNo) : 'Product warranty · ' + h(w.invoiceNo)}</div>` },
      { label: 'Device / product', render: (w) => `${h(w.kind === 'repair' ? w.device : productName(w.productId))}${w.imei || w.serial ? `<div class="xs mono muted">${h(w.imei || w.serial)}</div>` : ''}` },
      { label: 'Valid until', render: (w) => fmtDate(warrantyEnd(w)) },
      { label: 'Status', render: (w) => sbadge('warranty', wStatus(w)) }], emptyTitle: 'No warranties' });
  } else if (tab === 'repairs') {
    body = dataTable('cust-r', { rows: () => reps, search: false, rowHref: (r) => '#/repairs/' + r.id, columns: [
      { label: 'Job', cls: 'td-main', render: (r) => `<div class="cell-main mono">${h(r.no)}</div><div class="cell-sub">${fmtDate(isoDate(new Date(r.receivedAt)))}</div>` },
      { label: 'Device', render: (r) => `${h(r.brand)} ${h(r.model)}<div class="xs muted">${h(r.type)}</div>` },
      { label: 'Charges', cls: 'num', render: (r) => money(repairTotals(r).total) },
      { label: 'Status', render: (r) => `${sbadge('repair', r.status)}${r.isWarrantyRepair ? ' ' + badge('Warranty', 'purple', 'no-dot') : ''}` }], emptyTitle: 'No repairs' });
  } else {
    body = dataTable('cust-c', { rows: () => claims, search: false, rowHref: (x) => '#/claims/' + x.id, columns: [
      { label: 'Claim', cls: 'td-main', render: (x) => `<div class="cell-main mono">${h(x.no)}</div><div class="cell-sub">${fmtDate(x.date)}</div>` },
      { label: 'Fault', render: (x) => h(x.fault) }, { label: 'Status', render: (x) => sbadge('claim', x.status) }], emptyTitle: 'No claims' });
  }
  return pageHead(`<span class="flex">${avatar(c.name, 'avatar-lg')}<span>${h(c.name)}<div class="sub" style="font-weight:400">${h(c.code)} · ${h(c.phone)}</div></span></span>`, '', acts, `<a href="#/customers">Customers</a> ${icon('chevronRight', 'ic-sm')} ${h(c.name)}`) + `<div class="card">${tabs}${body}</div>`;
}
