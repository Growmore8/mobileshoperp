/* Products, stock control, IMEI tracker, purchases, suppliers */
'use strict';

const catName = (id) => (db.categories.find((c) => c.id === id) || {}).name || '—';
const trackLabel = (p) => (p.serialized ? (p.idType === 'imei' ? 'IMEI' : 'Serial no.') : 'Quantity');

/* ---------------- Products ---------------- */
PAGES.products = {
  title: 'Products', perm: ['products', 'view'],
  render({ query }) {
    const cost = canSeeCost();
    return pageHead('Products & Categories', 'Phones, accessories, wearables and spare parts. Serialised items are tracked per IMEI / serial number.',
      `${can('products', 'export') ? `<button class="btn" data-action="prod-export">${icon('download')} Export</button>` : ''}${can('products', 'create') ? `<button class="btn btn-primary" data-action="prod-new">${icon('plus')} New product</button>` : ''}`) +
      `<div class="card">${dataTable('products', {
        rows: () => db.products, q: query.q || '', placeholder: 'Search name, SKU, barcode, brand…',
        searchText: (p) => [p.name, p.code, p.sku, p.barcode, p.brand, p.model, p.color].join(' '),
        filters: [
          { key: 'cat', label: 'All categories', options: db.categories.map((c) => [c.id, c.name]), fn: (p, v) => p.categoryId === v },
          { key: 'track', label: 'Any tracking', options: [['imei', 'IMEI'], ['serial', 'Serial number'], ['qty', 'Quantity']], fn: (p, v) => (v === 'qty' ? !p.serialized : p.idType === v) },
          { key: 'st', label: 'Active & inactive', options: [['1', 'Active only'], ['0', 'Inactive only']], fn: (p, v) => p.active === (v === '1') },
        ],
        columns: [
          { label: 'Product', cls: 'td-main', sort: (p) => p.name, render: (p) => `<div class="flex">${thumb(p)}<div style="min-width:0"><div class="cell-main">${h(p.name)}${p.active ? '' : ' ' + badge('Inactive', 'gray')}</div><div class="cell-sub mono">${h(p.code)} · ${h(p.sku)}</div></div></div>`, csv: (p) => p.name },
          { label: 'Category', render: (p) => h(catName(p.categoryId)), csv: (p) => catName(p.categoryId) },
          { label: 'Brand', sort: (p) => p.brand, render: (p) => h(p.brand), csv: (p) => p.brand },
          { label: 'Tracking', render: (p) => badge(trackLabel(p), p.serialized ? 'purple' : 'gray', 'no-dot'), csv: trackLabel },
          ...(cost ? [{ label: 'Cost', cls: 'num', sort: (p) => p.cost, render: (p) => money(p.cost), csv: (p) => p.cost }] : []),
          { label: 'Price', cls: 'num', sort: (p) => p.price, render: (p) => `<b>${money(p.price)}</b>`, csv: (p) => p.price },
          { label: 'Stock', cls: 'num', sort: stockOf, render: (p) => `${stockOf(p)} ${stockState(p) !== 'ok' ? sbadge('stock', stockState(p)) : ''}`, csv: stockOf },
          { label: 'Warranty', render: (p) => (p.warrantyMonths ? `${p.warrantyMonths}m <span class="xs muted">${h(p.warrantyProvider)}</span>` : p.repairWarrantyDays ? `<span class="xs">${p.repairWarrantyDays}d repair</span>` : '<span class="muted">—</span>'), csv: (p) => p.warrantyMonths },
          { label: '', cls: 'actions', render: (p) => (can('products', 'edit') ? `<button class="btn btn-xs" data-action="prod-edit" data-id="${p.id}">${icon('edit', 'ic-sm')} Edit</button>` : '') },
        ],
      })}</div>`;
  },
};
function openProductForm(p) {
  const isNew = !p;
  p = p || { categoryId: '', serialized: false, idType: '', condition: 'new', minStock: 3, warrantyMonths: 0, warrantyProvider: 'Manufacturer', usedWarrantyMonths: 3, taxable: true, discountable: true, active: true };
  let image = p.image || '';
  const cost = canSeeCost();
  const hasMoves = !isNew && db.stockMoves.some((m) => m.productId === p.id);
  const m = openModal({
    title: isNew ? 'New product' : `Edit — ${h(p.name)}`, size: 'xl',
    body: `<form id="prod-form" class="form-grid cols-4" novalidate>
      <div class="form-section">Basic information</div>
      ${field('Product name', `<input class="input" name="name" required value="${h(p.name)}">`, { req: true, cls: 'span-2' })}
      ${field('Product code', `<input class="input" name="code" value="${h(p.code)}" placeholder="Auto">`, { hint: 'Leave blank to auto-generate' })}
      ${field('Category', `<select class="select" name="categoryId" required>${opts(db.categories.map((c) => [c.id, c.name]), p.categoryId, 'Select…')}</select>`, { req: true })}
      ${field('Brand', `<input class="input" name="brand" value="${h(p.brand)}" list="brands-dl"><datalist id="brands-dl">${[...new Set(db.products.map((x) => x.brand))].map((b) => `<option value="${h(b)}">`).join('')}</datalist>`)}
      ${field('Model', `<input class="input" name="model" value="${h(p.model)}">`)}
      ${field('Variant', `<input class="input" name="variant" value="${h(p.variant)}" placeholder="8GB / 256GB">`)}
      ${field('Colour', `<input class="input" name="color" value="${h(p.color)}">`)}
      ${field('Storage', `<input class="input" name="storage" value="${h(p.storage)}">`)}
      ${field('RAM', `<input class="input" name="ram" value="${h(p.ram)}">`)}
      ${field('Condition', `<select class="select" name="condition">${opts(Object.entries(CONDITIONS).slice(0, 3), p.condition)}</select>`)}
      ${field('Default supplier', `<select class="select" name="supplierId">${opts(db.suppliers.map((s) => [s.id, s.name]), p.supplierId, '—')}</select>`)}
      <div class="form-section">Pricing & tax</div>
      ${cost ? field('Cost price', `<input class="input" name="cost" inputmode="decimal" required value="${p.cost ?? ''}">`, { req: true }) : `<input type="hidden" name="cost" value="${p.cost ?? 0}">`}
      ${field('Retail price', `<input class="input" name="price" inputmode="decimal" required value="${p.price ?? ''}">`, { req: true })}
      ${field('Wholesale price', `<input class="input" name="wholesale" inputmode="decimal" value="${p.wholesale ?? ''}">`)}
      <div class="field"><label>Options</label><label class="check"><input type="checkbox" name="taxable" ${p.taxable ? 'checked' : ''}> Taxable (${db.settings.taxRate}%)</label><label class="check"><input type="checkbox" name="discountable" ${p.discountable ? 'checked' : ''}> Discount eligible</label></div>
      <div class="form-section">Identification & stock</div>
      ${field('Stock tracking', `<select class="select" name="idType" ${hasMoves ? 'disabled' : ''}><option value="" ${!p.serialized ? 'selected' : ''}>Quantity-based</option><option value="imei" ${p.idType === 'imei' ? 'selected' : ''}>Serialised — IMEI</option><option value="serial" ${p.idType === 'serial' ? 'selected' : ''}>Serialised — Serial no.</option></select>`, { hint: hasMoves ? 'Locked — stock history exists' : 'Phones use IMEI tracking' })}
      ${field('SKU', `<input class="input" name="sku" value="${h(p.sku)}">`)}
      ${field('Barcode', `<input class="input" name="barcode" value="${h(p.barcode)}" inputmode="numeric">`)}
      ${field('Minimum stock level', `<input class="input" name="minStock" inputmode="numeric" value="${p.minStock}">`, { hint: 'Low-stock alert threshold' })}
      <div class="form-section">Warranty</div>
      ${field('Warranty (months)', `<input class="input" name="warrantyMonths" inputmode="numeric" value="${p.warrantyMonths}">`, { hint: '0 = no product warranty' })}
      ${field('Warranty provider', `<select class="select" name="warrantyProvider">${opts(['Manufacturer', 'Distributor', 'Shop'], p.warrantyProvider)}</select>`)}
      ${field('Used / refurbished warranty (months)', `<input class="input" name="usedWarrantyMonths" inputmode="numeric" value="${p.usedWarrantyMonths ?? 3}">`, { hint: 'Shop warranty when the unit is not new' })}
      ${field('Repair-part warranty (days)', `<input class="input" name="repairWarrantyDays" inputmode="numeric" value="${p.repairWarrantyDays ?? ''}" placeholder="For spare parts">`, { hint: 'Used when fitted in a repair' })}
      <div class="form-section">Image & description</div>
      <div class="field span-2"><label>Product image</label><div class="flex"><span id="pf-img" class="thumb thumb-art" style="width:96px;height:72px;background:var(--surface-3)">${image ? `<img src="${image}" alt="">` : (isNew ? icon('camera') : productArt(p))}</span><div class="stack-sm"><label class="btn btn-sm">${icon('upload', 'ic-sm')} Upload photo<input type="file" accept="image/*" id="pf-file" hidden></label><span class="hint">${image ? 'Custom photo' : 'Using built-in illustration'}</span></div>${image ? `<button type="button" class="btn btn-sm btn-ghost" id="pf-rm">Remove</button>` : ''}</div></div>
      ${field('Description', `<textarea class="input" name="description" rows="2">${h(p.description)}</textarea>`, { cls: 'span-2' })}
      <label class="check span-all"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> Active (available for sale & purchase)</label>
    </form>`,
    foot: `${!isNew && can('products', 'delete') ? `<button class="btn btn-ghost danger-text" id="pf-del" style="margin-right:auto">${icon('trash')} Delete</button>` : ''}<button class="btn" data-dismiss>Cancel</button><button class="btn btn-primary" type="submit" form="prod-form">${icon('check')} Save product</button>`,
    onMount(el) {
      const f = $('#prod-form', el);
      f.categoryId.addEventListener('change', () => { if (isNew) { const c = db.categories.find((x) => x.id === f.categoryId.value); if (c) f.warrantyMonths.value = c.warrantyMonths; if (c && c.kind === 'phone') f.idType.value = 'imei'; } });
      $('#pf-file', el).addEventListener('change', async (e) => { try { image = await readImage(e.target.files[0], 400); $('#pf-img', el).innerHTML = `<img src="${image}" alt="">`; } catch (err) { handleError(err); } });
      const rm = $('#pf-rm', el); rm && rm.addEventListener('click', () => { image = ''; $('#pf-img', el).innerHTML = isNew ? icon('camera') : productArt(p); });
      const del = $('#pf-del', el);
      del && del.addEventListener('click', async () => {
        const ok = await confirmDialog({ title: 'Delete product?', message: 'Products with stock history are deactivated instead of deleted, so past transactions stay intact.', confirmText: 'Delete', danger: true });
        if (!ok) return; const r = await svc.deleteProduct(p.id); m.close(); toast(r === 'deleted' ? 'Product deleted.' : 'Product has history — it was deactivated.', r === 'deleted' ? 'success' : 'info'); refresh();
      });
      bindForm(f, async (d) => {
        const idType = hasMoves ? p.idType : d.idType;
        const data = { ...d, idType, serialized: !!idType, minStock: Number(d.minStock) || 0, warrantyMonths: Number(d.warrantyMonths) || 0, usedWarrantyMonths: Number(d.usedWarrantyMonths) || 0, repairWarrantyDays: d.repairWarrantyDays === '' ? null : Number(d.repairWarrantyDays), wholesale: Number(d.wholesale) || 0, image };
        if (!isNew) data.id = p.id;
        const saved = await svc.saveProduct(data); m.close(); toast(`${saved.name} saved.`); refresh();
      });
    },
  });
}
Object.assign(ACT, {
  'prod-new': () => openProductForm(null),
  'prod-edit': (el) => openProductForm(find('products', el.dataset.id)),
  'prod-export': () => { need('products', 'export'); dtExport('products', `products-${todayISO()}`); },
});

/* ---------------- Stock control ---------------- */
PAGES.inventory = {
  title: 'Stock Control', perm: ['inventory', 'view'],
  render({ query }) {
    const tab = query.tab || 'stock';
    const act = db.products.filter((p) => p.active);
    const cost = canSeeCost();
    const pend = db.adjustments.filter((a) => a.status === 'pending').length;
    const head = pageHead('Stock Control', `Costing: ${h(db.settings.costing)}`, `${can('inventory', 'print') ? `<button class="btn" data-action="inv-print">${icon('printer')} Stock sheet</button>` : ''}${can('inventory', 'create') ? `<button class="btn" data-action="adj-new">${icon('layers')} Stock adjustment</button>` : ''}${can('purchases', 'create') ? `<a class="btn btn-primary" href="#/purchases/new">${icon('truck')} Receive stock</a>` : ''}`);
    const tiles = `<div class="kpis mb">
      ${kpi({ label: 'Active SKUs', value: act.length, icon: 'package', tone: 'blue', foot: `${act.filter((p) => p.serialized).length} serialised · ${act.filter((p) => !p.serialized).length} quantity-based` })}
      ${kpi({ label: 'Units on hand', value: sum(act, stockOf), icon: 'warehouse', tone: 'cyan', foot: `${db.devices.filter((d) => d.status === 'in_stock').length} IMEI/serial units` })}
      ${cost ? kpi({ label: 'Stock value (cost)', value: money(sum(act, stockValue)), icon: 'layers', tone: 'purple', foot: `Retail value ${money(sum(act, (p) => stockOf(p) * p.price))}` }) : ''}
      ${kpi({ label: 'Low / out of stock', value: `${act.filter((p) => stockState(p) === 'low').length} / ${act.filter((p) => stockState(p) === 'out').length}`, icon: 'alert', tone: 'amber', foot: 'Reorder suggested', href: '#/inventory?f=low' })}
      ${kpi({ label: 'Held / damaged units', value: db.devices.filter((d) => ['returned', 'damaged', 'missing'].includes(d.status)).length, icon: 'ban', tone: 'red', foot: 'Returned, damaged or missing', href: '#/imei?status=damaged' })}
    </div>`;
    const tabs = tabsHtml([{ key: 'stock', label: 'Stock levels' }, { key: 'moves', label: 'Stock movements', count: db.stockMoves.length }, { key: 'adjustments', label: 'Adjustments', count: pend || undefined }], tab);
    let body = '';
    if (tab === 'stock') {
      body = dataTable('stock', {
        rows: () => act, placeholder: 'Search product, SKU…', searchText: (p) => [p.name, p.sku, p.brand].join(' '),
        initialFilters: query.f ? { st: query.f } : {},
        filters: [
          { key: 'cat', label: 'All categories', options: db.categories.map((c) => [c.id, c.name]), fn: (p, v) => p.categoryId === v },
          { key: 'st', label: 'All stock levels', options: [['low', 'Low stock'], ['out', 'Out of stock'], ['ok', 'Healthy']], fn: (p, v) => stockState(p) === v },
        ],
        columns: [
          { label: 'Product', cls: 'td-main', sort: (p) => p.name, render: (p) => `<div class="flex">${thumb(p)}<div style="min-width:0"><div class="cell-main">${h(p.name)}</div><div class="cell-sub mono">${h(p.sku)}</div></div></div>`, csv: (p) => p.name },
          { label: 'Category', render: (p) => h(catName(p.categoryId)), csv: (p) => catName(p.categoryId) },
          { label: 'Location', render: () => 'Main Store', csv: () => 'Main Store' },
          { label: 'Tracking', render: (p) => (p.serialized ? `<a href="#/imei?product=${p.id}">${trackLabel(p)} list</a>` : 'Quantity'), csv: trackLabel },
          { label: 'Min', cls: 'num', render: (p) => p.minStock, csv: (p) => p.minStock },
          { label: 'On hand', cls: 'num', sort: stockOf, render: (p) => `<b>${stockOf(p)}</b>`, csv: stockOf },
          { label: 'Status', render: (p) => sbadge('stock', stockState(p)), csv: stockState },
          ...(cost ? [{ label: 'Value (cost)', cls: 'num', sort: stockValue, render: (p) => money(stockValue(p)), csv: stockValue }] : []),
        ],
        footer: (rows) => ['<b>Total</b>', '', '', '', '', `<b>${sum(rows, stockOf)}</b>`, '', ...(cost ? [`<b>${money(sum(rows, stockValue))}</b>`] : [])],
        toolbar: can('inventory', 'export') ? `<button class="btn btn-sm" data-action="stock-export">${icon('download', 'ic-sm')} Export</button>` : '',
      });
    } else if (tab === 'moves') {
      const types = [...new Set(db.stockMoves.map((m) => m.type))];
      body = dataTable('moves', {
        rows: () => db.stockMoves, placeholder: 'Search product, IMEI, reference…', pageSize: 15,
        searchText: (m) => [productName(m.productId), m.ref, m.type, m.note, m.deviceId ? deviceCode(find('devices', m.deviceId)) : ''].join(' '),
        filters: [{ key: 'type', label: 'All movement types', options: types, fn: (m, v) => m.type === v }, { key: 'dir', label: 'In & out', options: [['in', 'Stock in'], ['out', 'Stock out']], fn: (m, v) => (v === 'in' ? m.qty > 0 : m.qty < 0) }],
        columns: [
          { label: 'Date', cls: 'td-main', sort: (m) => m.at, render: (m) => `<div class="cell-main">${fmtDateTime(m.at)}</div>`, csv: (m) => m.at },
          { label: 'Product', render: (m) => h(productName(m.productId)), csv: (m) => productName(m.productId) },
          { label: 'IMEI / serial', render: (m) => (m.deviceId ? `<a class="mono" href="#/imei/${m.deviceId}">${h(deviceCode(find('devices', m.deviceId)))}</a>` : '<span class="muted">—</span>'), csv: (m) => (m.deviceId ? deviceCode(find('devices', m.deviceId)) : '') },
          { label: 'Type', render: (m) => h(m.type), csv: (m) => m.type },
          { label: 'Qty', cls: 'num', render: (m) => `<b class="${m.qty > 0 ? 'success-text' : m.qty < 0 ? 'danger-text' : 'muted'}">${m.qty > 0 ? '+' : ''}${m.qty}</b>`, csv: (m) => m.qty },
          { label: 'Reference', render: (m) => `<span class="mono">${h(m.ref)}</span>`, csv: (m) => m.ref },
          { label: 'User', render: (m) => h(userName(m.userId)), csv: (m) => userName(m.userId) },
        ],
        toolbar: can('inventory', 'export') ? `<button class="btn btn-sm" data-action="moves-export">${icon('download', 'ic-sm')} Export</button>` : '',
      });
    } else {
      body = (can('inventory', 'approve') ? '' : `<div class="card-body" style="padding-bottom:0"><div class="alert alert-info">${icon('info')}<div>Your adjustments are sent to a manager for approval before stock changes.</div></div></div>`) + dataTable('adjs', {
        rows: () => db.adjustments, searchText: (a) => [a.no, productName(a.productId), a.reason, a.type].join(' '),
        filters: [{ key: 'st', label: 'Any status', options: Object.entries(TONES.adj).map(([k, v]) => [k, v[0]]), fn: (a, v) => a.status === v }],
        columns: [
          { label: 'Adjustment', cls: 'td-main', render: (a) => `<div class="cell-main mono">${h(a.no)}</div><div class="cell-sub">${fmtDateTime(a.at)} · ${h(userName(a.userId))}</div>` },
          { label: 'Product', render: (a) => `${h(productName(a.productId))}${a.deviceId ? `<div class="xs mono muted">${h(deviceCode(find('devices', a.deviceId)))}</div>` : ''}` },
          { label: 'Type', render: (a) => h(a.type) },
          { label: 'Qty', cls: 'num', render: (a) => (a.deviceId ? '1 unit' : `${a.qty > 0 ? '+' : ''}${a.qty}`) },
          { label: 'Reason', render: (a) => `<span class="small">${h(a.reason)}</span>` },
          { label: 'Status', render: (a) => `${sbadge('adj', a.status)}${a.approvedBy ? `<div class="xs muted">${h(userName(a.approvedBy))}</div>` : ''}` },
          { label: '', cls: 'actions', render: (a) => (a.status === 'pending' && can('inventory', 'approve') ? `<button class="btn btn-xs btn-success" data-action="adj-approve" data-id="${a.id}">${icon('check', 'ic-sm')} Approve</button><button class="btn btn-xs" data-action="adj-reject" data-id="${a.id}">Reject</button>` : '') },
        ],
        emptyIcon: 'layers', emptyTitle: 'No adjustments',
      });
    }
    return head + tiles + `<div class="card">${tabs}${body}</div>`;
  },
};
Object.assign(ACT, {
  'stock-export': () => { need('inventory', 'export'); dtExport('stock', `stock-${todayISO()}`); },
  'moves-export': () => { need('inventory', 'export'); dtExport('moves', `stock-movements-${todayISO()}`); },
  'inv-print': () => {
    need('inventory', 'print');
    const act = db.products.filter((p) => p.active);
    printDoc('Stock sheet', `${docHeader('Stock Sheet', `<div>${fmtDateTime(new Date().toISOString())}</div>`)}<table><thead><tr><th>Product</th><th>SKU</th><th class="num">Min</th><th class="num">System qty</th><th class="num">Counted</th><th>Notes</th></tr></thead><tbody>${act.map((p) => `<tr><td>${h(p.name)}</td><td class="mono">${h(p.sku)}</td><td class="num">${p.minStock}</td><td class="num">${stockOf(p)}</td><td></td><td></td></tr>`).join('')}</tbody></table><div class="sign"><div>Counted by</div><div>Verified by</div></div>`);
  },
  'adj-approve': async (el) => { await svc.approveAdjustment(el.dataset.id); toast('Adjustment approved — stock updated.'); refresh(); },
  'adj-reject': async (el) => { const ok = await confirmDialog({ title: 'Reject adjustment?', confirmText: 'Reject', danger: true, reason: true, reasonLabel: 'Note' }); if (ok) { await svc.rejectAdjustment(el.dataset.id, ok.reason); toast('Adjustment rejected.'); refresh(); } },
  'adj-new': () => {
    const m = openModal({ title: 'Stock adjustment', size: 'lg',
      body: `<form id="adj-form" class="form-grid" novalidate>
        ${field('Product', `<select class="select" name="productId" required>${opts(db.products.filter((p) => p.active).map((p) => [p.id, `${p.name} (${stockOf(p)} on hand)`]), '', 'Select product…')}</select>`, { req: true, cls: 'span-all' })}
        <div id="adj-dyn" class="span-all form-grid" style="grid-column:1/-1"></div>
        ${field('Reason', '<textarea class="input" name="reason" rows="2" required placeholder="e.g. Screen guard cracked while fitting"></textarea>', { req: true, cls: 'span-all' })}
        <div class="alert alert-info span-all">${icon('info')}<div>${can('inventory', 'approve') ? 'You have approval rights — the adjustment is applied immediately and logged.' : 'This adjustment will be pending until a manager approves it.'}</div></div>
      </form>`,
      foot: `<button class="btn" data-dismiss>Cancel</button><button class="btn btn-primary" type="submit" form="adj-form">Submit adjustment</button>`,
      onMount(el) {
        const f = $('#adj-form', el);
        const dyn = () => {
          const p = find('products', f.productId.value);
          if (!p) { $('#adj-dyn', el).innerHTML = ''; return; }
          if (p.serialized) {
            const devs = db.devices.filter((d) => d.productId === p.id && ['in_stock', 'returned', 'damaged', 'missing'].includes(d.status));
            $('#adj-dyn', el).innerHTML = field('Unit (IMEI / serial)', `<select class="select" name="deviceId" required>${opts(devs.map((d) => [d.id, `${deviceCode(d)} — ${DEVICE_STATUS[d.status]}`]), '', 'Select unit…')}</select>`, { req: true }) +
              field('Adjustment type', `<select class="select" name="type">${opts(['Damaged', 'Missing', 'Mark defective', 'Return to stock'])}</select>`);
          } else {
            $('#adj-dyn', el).innerHTML = field('Quantity change', '<input class="input" name="qty" inputmode="numeric" required placeholder="-2 or +5">', { req: true, hint: `Current: ${p.qty}. Use a negative number to remove stock.` }) +
              field('Adjustment type', `<select class="select" name="type">${opts(['Damaged', 'Missing', 'Found / count correction', 'Internal use', 'Opening stock'])}</select>`);
          }
        };
        f.productId.addEventListener('change', dyn);
        bindForm(f, async (d) => { const a = await svc.requestAdjustment({ productId: d.productId, deviceId: d.deviceId, qty: Number(d.qty), type: d.type, reason: d.reason }); m.close(); toast(a.status === 'approved' ? `${a.no} applied.` : `${a.no} submitted for approval.`); setQuery({ tab: 'adjustments' }); });
      } });
  },
});

/* ---------------- IMEI tracker ---------------- */
PAGES.imei = {
  title: 'IMEI Tracker', perm: ['inventory', 'view'],
  render({ id, query }) {
    if (id) return deviceDetail(id);
    const cost = canSeeCost();
    return pageHead('IMEI & Serial Tracker', 'Every serialised unit, from purchase through stock, sale, return, repair and warranty.', `<button class="btn btn-primary" data-action="imei-audit">${icon('scan')} Stock check (bulk scan)</button>`) +
      `<div class="card">${dataTable('devices', {
        rows: () => db.devices, placeholder: 'Search IMEI, serial, model, invoice, customer…', pageSize: 15, rowHref: (d) => '#/imei/' + d.id,
        searchText: (d) => { const s = d.saleId && find('sales', d.saleId); const pur = find('purchases', d.purchaseId); return [d.imei1, d.imei2, d.serial, productName(d.productId), s ? s.no : '', pur ? pur.no : '', customerName(d.customerId)].join(' '); },
        initialFilters: { ...(query.status ? { st: query.status } : {}), ...(query.product ? { prod: query.product } : {}) },
        filters: [
          { key: 'st', label: 'Any status', options: Object.entries(DEVICE_STATUS), fn: (d, v) => d.status === v },
          { key: 'cond', label: 'Any condition', options: Object.entries(CONDITIONS), fn: (d, v) => d.condition === v },
          { key: 'prod', label: 'All products', options: db.products.filter((p) => p.serialized).map((p) => [p.id, p.name]), fn: (d, v) => d.productId === v },
        ],
        columns: [
          { label: 'IMEI / serial', cls: 'td-main', sort: (d) => deviceCode(d), render: (d) => `<div class="cell-main mono">${h(deviceCode(d))}</div>${d.imei2 ? `<div class="cell-sub mono">${h(d.imei2)}</div>` : ''}`, csv: deviceCode },
          { label: 'Product', sort: (d) => productName(d.productId), render: (d) => h(productName(d.productId)), csv: (d) => productName(d.productId) },
          { label: 'Condition', render: (d) => sbadge('condition', d.condition), csv: (d) => d.condition },
          { label: 'Status', render: (d) => sbadge('device', d.status), csv: (d) => d.status },
          { label: 'Supplier', render: (d) => h((find('suppliers', d.supplierId) || {}).name || '—'), csv: (d) => (find('suppliers', d.supplierId) || {}).name },
          ...(cost ? [{ label: 'Cost', cls: 'num', render: (d) => money(d.cost), csv: (d) => d.cost }] : []),
          { label: 'Customer / invoice', render: (d) => { const s = d.saleId && find('sales', d.saleId); return s ? `${h(customerName(d.customerId))}<div class="xs mono muted">${h(s.no)}</div>` : '<span class="muted">—</span>'; }, csv: (d) => customerName(d.customerId) },
          { label: 'Warranty', render: (d) => { const w = d.warrantyId && find('warranties', d.warrantyId); return w && d.status === 'sold' ? sbadge('warranty', wStatus(w)) : '<span class="muted">—</span>'; } },
        ],
        toolbar: can('inventory', 'export') ? `<button class="btn btn-sm" data-action="dev-export">${icon('download', 'ic-sm')} Export</button>` : '',
      })}</div>`;
  },
};
ACT['imei-audit'] = () => openBulkScanner({ mode: 'audit' });
ACT['dev-export'] = () => { need('inventory', 'export'); dtExport('devices', `imei-inventory-${todayISO()}`); };
function deviceDetail(id) {
  const d = find('devices', id); if (!d) return emptyState('scan', 'Device not found');
  const p = find('products', d.productId); const pur = find('purchases', d.purchaseId); const sup = find('suppliers', d.supplierId);
  const s = d.saleId && find('sales', d.saleId);
  const ws = db.warranties.filter((w) => w.deviceId === d.id || (w.imei && w.imei === d.imei1));
  const reps = db.repairs.filter((r) => r.imei && (r.imei === d.imei1 || r.imei === d.imei2));
  const cost = canSeeCost();
  return pageHead(`<span class="mono">${h(deviceCode(d))}</span>`, `${h(p.name)} · ${h(p.color)}`, can('repairs', 'create') && d.status === 'sold' ? `<a class="btn" href="#/repairs/new?imei=${d.imei1 || d.serial}&customer=${d.customerId || ''}">${icon('wrench')} New repair for this device</a>` : '', `<a href="#/imei">IMEI Tracker</a> ${icon('chevronRight', 'ic-sm')} ${h(deviceCode(d))}`) + `
    <div class="flex flex-wrap mb">${sbadge('device', d.status)}${sbadge('condition', d.condition)}${ws.map((w) => `<a href="#/warranties/${w.id}">${badge(`${w.kind === 'repair' ? 'Repair' : 'Product'} warranty: ${TONES.warranty[wStatus(w)][0]}`, TONES.warranty[wStatus(w)][1])}</a>`).join('')}</div>
    <div class="grid grid-main-side">
      <div class="stack">
        <div class="grid grid-2">
          <div class="card"><div class="card-head"><h3>Identification</h3></div><div class="card-body"><dl class="dl">
            ${d.imei1 ? `<dt>IMEI 1</dt><dd class="mono">${h(d.imei1)} ${validImei(d.imei1) ? badge('Valid', 'green', 'no-dot') : ''}</dd>` : ''}${d.imei2 ? `<dt>IMEI 2</dt><dd class="mono">${h(d.imei2)}</dd>` : ''}${d.serial ? `<dt>Serial</dt><dd class="mono">${h(d.serial)}</dd>` : ''}
            <dt>Product</dt><dd>${h(p.name)}</dd><dt>Brand / model</dt><dd>${h(p.brand)} ${h(p.model)}</dd><dt>Variant</dt><dd>${h(p.variant || '—')} · ${h(p.color)}</dd><dt>Location</dt><dd>${h(d.location)}</dd></dl></div></div>
          <div class="card"><div class="card-head"><h3>Purchase</h3></div><div class="card-body"><dl class="dl">
            <dt>Supplier</dt><dd>${h(sup ? sup.name : '—')}</dd><dt>Purchase no.</dt><dd>${pur && can('purchases', 'view') ? `<a class="mono" href="#/purchases/${pur.id}">${h(pur.no)}</a>` : h(pur ? pur.no : '—')}</dd>
            <dt>Supplier invoice</dt><dd>${h(pur ? pur.supplierInvoice : '—')}</dd><dt>Received</dt><dd>${fmtDate(pur ? pur.date : '')}</dd>${cost ? `<dt>Unit cost</dt><dd>${money(d.cost)}</dd>` : ''}</dl></div></div>
        </div>
        ${d.replacementNo ? replacementCard(db.replacements.find((r) => r.no === d.replacementNo), d.replacementOfId ? 'Issued as a warranty replacement' : 'Returned defective — replaced under warranty') : ''}
        <div class="card"><div class="card-head"><h3>Sale & ownership</h3></div><div class="card-body">${s ? `<dl class="dl"><dt>Invoice</dt><dd>${can('sales', 'view') ? `<a class="mono" href="#/sales/${s.id}">${h(s.no)}</a>` : h(s.no)}</dd><dt>Customer</dt><dd>${can('customers', 'view') && d.customerId ? `<a href="#/customers/${d.customerId}">${h(customerName(d.customerId))}</a>` : h(customerName(d.customerId))}</dd><dt>Sold on</dt><dd>${fmtDateTime(s.at)}</dd><dt>Sold by</dt><dd>${h(userName(s.userId))}</dd></dl>` : `<p class="muted">Not currently sold${d.status === 'in_stock' ? ' — available for sale.' : '.'}</p>`}</div></div>
        <div class="card"><div class="card-head"><h3>Warranties</h3></div><div class="card-body flush">${ws.length ? ws.map((w) => `<a class="list-row" href="#/warranties/${w.id}"><span class="kpi-icon tone-${TONES.warranty[wStatus(w)][1] === 'green' ? 'green' : TONES.warranty[wStatus(w)][1] === 'amber' ? 'amber' : 'red'}">${icon('shield', 'ic-sm')}</span><div class="grow"><div class="bold small">${h(w.no)} · ${w.kind === 'repair' ? 'Repair warranty (' + h(w.jobNo) + ')' : h(w.type)}</div><div class="xs muted">${fmtDate(w.start)} → ${fmtDate(warrantyEnd(w))}</div></div>${sbadge('warranty', wStatus(w))}</a>`).join('') : emptyState('shield', 'No warranty records')}</div></div>
        <div class="card"><div class="card-head"><h3>Repair history</h3></div><div class="card-body flush">${reps.length ? reps.map((r) => `<a class="list-row" href="#/repairs/${r.id}"><span class="kpi-icon tone-blue">${icon('wrench', 'ic-sm')}</span><div class="grow"><div class="bold small">${h(r.no)} · ${h(r.type)}</div><div class="xs muted">${fmtDate(isoDate(new Date(r.receivedAt)))} · ${h(r.problem)}</div></div>${sbadge('repair', r.status)}</a>`).join('') : emptyState('wrench', 'No repairs recorded')}</div></div>
      </div>
      <div class="card"><div class="card-head"><h3>Device timeline</h3></div><div class="card-body"><ul class="timeline">${d.history.slice().reverse().map((x) => `<li><div class="t-title">${h(x.type)} <span class="mono xs muted">${h(x.ref)}</span></div><div class="t-meta">${fmtDateTime(x.at)} · ${h(userName(x.userId))}</div><div class="small text-2">${h(x.note)}</div></li>`).join('')}</ul></div></div>
    </div>`;
}

/* ---------------- Purchases ---------------- */
PAGES.purchases = {
  title: 'Purchases', perm: ['purchases', 'view'],
  render({ id, query }) {
    if (id === 'new') return purchaseForm(query);
    if (id) return purchaseDetail(id);
    return pageHead('Purchases & Goods Received', 'Purchase orders, supplier invoices and stock receipts. Stock only changes through recorded receipts.',
      `${can('purchases', 'export') ? `<button class="btn" data-action="pur-export">${icon('download')} Export</button>` : ''}${can('purchases', 'create') ? `<a class="btn" href="#/purchases/new?mode=po">${icon('file')} New purchase order</a><a class="btn btn-primary" href="#/purchases/new">${icon('truck')} Receive stock</a>` : ''}`) +
      `<div class="card">${dataTable('purchases', {
        rows: () => db.purchases, rowHref: (p) => '#/purchases/' + p.id, placeholder: 'Search purchase no., supplier, invoice…',
        searchText: (p) => [p.no, p.supplierInvoice, (find('suppliers', p.supplierId) || {}).name, p.items.map((i) => productName(i.productId)).join(' ')].join(' '),
        filters: [
          { key: 'st', label: 'Any status', options: Object.entries(TONES.purchase).map(([k, v]) => [k, v[0]]), fn: (p, v) => p.status === v },
          { key: 'sup', label: 'All suppliers', options: db.suppliers.map((s) => [s.id, s.name]), fn: (p, v) => p.supplierId === v },
        ],
        columns: [
          { label: 'Purchase', cls: 'td-main', sort: (p) => p.date, render: (p) => `<div class="cell-main mono">${h(p.no)}</div><div class="cell-sub">${fmtDate(p.date)}</div>`, csv: (p) => p.no },
          { label: 'Supplier', render: (p) => h(find('suppliers', p.supplierId).name), csv: (p) => find('suppliers', p.supplierId).name },
          { label: 'Supplier inv.', render: (p) => `<span class="mono">${h(p.supplierInvoice || '—')}</span>`, csv: (p) => p.supplierInvoice },
          { label: 'Units', cls: 'num', render: (p) => sum(p.items, (i) => i.qty), csv: (p) => sum(p.items, (i) => i.qty) },
          { label: 'Total', cls: 'num', sort: (p) => p.total, render: (p) => `<b>${money(p.total)}</b>`, csv: (p) => p.total },
          { label: 'Payment', render: (p) => (p.status === 'received' ? sbadge('pay', payState(purchaseTotals(p).net, purchaseTotals(p).paid)) : '<span class="muted">—</span>'), csv: (p) => purchaseTotals(p).balance },
          { label: 'Status', render: (p) => sbadge('purchase', p.status), csv: (p) => p.status },
        ],
      })}</div>`;
  },
};
ACT['pur-export'] = () => { need('purchases', 'export'); dtExport('purchases', `purchases-${todayISO()}`); };
let PF = null;
function purchaseForm(query) {
  if (!can('purchases', 'create')) return emptyState('lock', 'Access restricted', 'You cannot create purchases.');
  const po = query.po ? find('purchases', query.po) : null;
  const mode = po ? 'receive' : query.mode === 'po' ? 'po' : 'receive';
  PF = { po, mode, lines: po ? po.items.map((i) => ({ key: uid('l'), productId: i.productId, qty: i.qty, cost: i.cost, condition: i.condition, imeis: '' })) : [{ key: uid('l'), productId: '', qty: 1, cost: '', condition: 'new', imeis: '' }] };
  return pageHead(po ? `Receive ${h(po.no)}` : mode === 'po' ? 'New purchase order' : 'Receive stock (goods received)', mode === 'po' ? 'Order stock from a supplier. Stock is added only when the order is received.' : 'Record the supplier invoice and register every IMEI / serial number. Duplicate numbers are blocked.', '', `<a href="#/purchases">Purchases</a> ${icon('chevronRight', 'ic-sm')} ${po ? 'Receive' : 'New'}`) + `
  <form id="pf" novalidate class="stack">
    <div class="card"><div class="card-head"><h3>Supplier & document</h3></div><div class="card-body form-grid cols-4">
      ${field('Supplier', `<select class="select" name="supplierId" required>${opts(db.suppliers.map((s) => [s.id, s.name]), po ? po.supplierId : '', 'Select supplier…')}</select>`, { req: true, cls: 'span-2' })}
      ${field(mode === 'po' ? 'Expected delivery' : 'Supplier invoice no.', mode === 'po' ? `<input class="input" type="date" name="expected" value="${isoDate(addDays(new Date(), 3))}">` : `<input class="input" name="supplierInvoice" placeholder="e.g. MMD-55120">`)}
      ${field(mode === 'po' ? 'Order date' : 'Received date', `<input class="input" type="date" name="date" value="${todayISO()}" max="${todayISO()}">`)}
    </div></div>
    <div class="card"><div class="card-head"><div><h3>Items</h3><div class="sub">For IMEI products enter one number per line. Dual-SIM: <span class="mono">IMEI1, IMEI2</span></div></div><button type="button" class="btn btn-sm" data-action="pf-add">${icon('plus', 'ic-sm')} Add line</button></div><div class="card-body stack" id="pf-lines"></div>
      <div class="card-foot" style="justify-content:space-between"><span class="muted">Total units: <b id="pf-units">0</b></span><span class="bold" style="font-size:17px">Total: <span id="pf-total">${money(0)}</span></span></div></div>
    ${mode !== 'po' ? `<div class="card"><div class="card-head"><h3>Payment to supplier</h3></div><div class="card-body form-grid cols-4">
      ${field('Amount paid now', '<input class="input" name="paid" inputmode="decimal" placeholder="0" id="pf-paid">', { hint: 'Leave 0 to record the full amount as payable' })}
      ${field('Method', `<select class="select" name="method">${opts(db.settings.paymentMethods, 'Bank Transfer')}</select>`)}
      ${field('Notes', '<input class="input" name="note">', { cls: 'span-2' })}
    </div></div>` : `<div class="card"><div class="card-body">${field('Notes', '<input class="input" name="note">')}</div></div>`}
    <div class="flex" style="justify-content:flex-end;flex-wrap:wrap"><a class="btn" href="#/purchases">Cancel</a><button class="btn btn-primary btn-lg" type="submit">${icon('check')} ${mode === 'po' ? 'Create purchase order' : 'Receive into stock'}</button></div>
  </form>`;
}
function pfDraw() {
  const box = $('#pf-lines'); if (!box) return;
  const prods = db.products.filter((p) => p.active);
  const groups = db.categories.map((c) => `<optgroup label="${h(c.name)}">${prods.filter((p) => p.categoryId === c.id).map((p) => `<option value="${p.id}">${h(p.name)}</option>`).join('')}</optgroup>`).join('');
  box.innerHTML = PF.lines.map((l, i) => {
    const p = find('products', l.productId);
    const ser = p && p.serialized && PF.mode !== 'po';
    return `<div class="card" style="box-shadow:none;background:var(--surface-2)"><div class="card-body form-grid cols-4">
      <div class="field span-2"><label>Product ${i + 1}</label><select class="select" data-pl="${l.key}" data-f="productId"><option value="">Select product…</option>${groups}</select></div>
      ${field('Quantity', `<input class="input" data-pl="${l.key}" data-f="qty" inputmode="numeric" value="${l.qty}">`)}
      ${field('Unit cost', `<input class="input" data-pl="${l.key}" data-f="cost" inputmode="decimal" value="${l.cost}" placeholder="${p ? p.cost : ''}">`)}
      ${p && p.serialized ? field('Condition', `<select class="select" data-pl="${l.key}" data-f="condition">${opts(Object.entries(CONDITIONS).slice(0, 3), l.condition)}</select>`) : ''}
      ${ser ? `<div class="field span-2" style="grid-column:span 3"><label>${p.idType === 'imei' ? 'IMEI numbers' : 'Serial numbers'} (${l.qty})</label><textarea class="input mono" rows="3" data-pl="${l.key}" data-f="imeis" placeholder="${p.idType === 'imei' ? '356789012345678, 356789012345686' : 'RF8N12AB3CD'}">${h(l.imeis)}</textarea><span class="hint" id="pv-${l.key}"></span><div class="flex flex-wrap"><button type="button" class="btn btn-sm btn-primary" data-action="pf-scan" data-key="${l.key}">${icon('scan', 'ic-sm')} Bulk scan ${p.idType === 'imei' ? 'IMEIs' : 'serials'}</button><button type="button" class="btn btn-xs" data-action="pf-gen" data-key="${l.key}">${icon('sparkles', 'ic-sm')} Generate demo numbers</button></div></div>` : ''}
      <div class="field" style="justify-content:flex-end"><button type="button" class="btn btn-sm btn-ghost danger-text" data-action="pf-rm" data-key="${l.key}" ${PF.lines.length === 1 ? 'disabled' : ''}>${icon('trash', 'ic-sm')} Remove</button></div>
    </div></div>`;
  }).join('');
  PF.lines.forEach((l) => { const s = box.querySelector(`select[data-pl="${l.key}"][data-f="productId"]`); s.value = l.productId; });
  $$('[data-pl]', box).forEach((inp) => {
    const ev = inp.tagName === 'SELECT' ? 'change' : 'input';
    inp.addEventListener(ev, () => {
      const l = PF.lines.find((x) => x.key === inp.dataset.pl);
      l[inp.dataset.f] = inp.value;
      if (inp.dataset.f === 'productId') { const p = find('products', inp.value); if (p) { l.cost = p.cost; l.condition = p.condition; } pfDraw(); return; }
      if (inp.dataset.f === 'qty') { pfTotals(); pfValidate(l); const lab = inp.closest('.card-body').querySelector('textarea')?.closest('.field').querySelector('label'); if (lab) lab.textContent = lab.textContent.replace(/\(\d*\)/, `(${l.qty})`); return; }
      pfTotals(); if (inp.dataset.f === 'imeis') pfValidate(l);
    });
  });
  PF.lines.forEach(pfValidate);
  pfTotals();
}
function parseUnits(p, text) {
  return String(text || '').split(/\n+/).map((s) => s.trim()).filter(Boolean).map((line) => {
    const parts = line.split(/[,;\s]+/).filter(Boolean);
    return p.idType === 'imei' ? { imei1: parts[0], imei2: parts[1] || '' } : { serial: parts[0] };
  });
}
function pfValidate(l) {
  const el = $('#pv-' + l.key); const p = find('products', l.productId);
  if (!el || !p || !p.serialized) return;
  const units = parseUnits(p, l.imeis);
  const codes = units.flatMap((u) => [u.imei1, u.imei2, u.serial].filter(Boolean));
  const others = PF.lines.filter((x) => x !== l).flatMap((x) => { const pp = find('products', x.productId); return pp && pp.serialized ? parseUnits(pp, x.imeis).flatMap((u) => [u.imei1, u.imei2, u.serial].filter(Boolean)) : []; });
  const bad = p.idType === 'imei' ? codes.filter((c) => !validImei(c)) : codes.filter((c) => normId(c).length < 5);
  const dupDb = codes.filter((c) => findDeviceByCode(c));
  const dupIn = codes.filter((c, i) => codes.indexOf(c) !== i || others.includes(c));
  const msgs = [`${units.length} of ${Number(l.qty) || 0} entered`];
  if (bad.length) msgs.push(`<span class="danger-text">${bad.length} invalid: ${h(bad.slice(0, 2).join(', '))}</span>`);
  if (dupDb.length) msgs.push(`<span class="danger-text">Already registered: ${h(dupDb.slice(0, 2).join(', '))}</span>`);
  if (dupIn.length) msgs.push(`<span class="danger-text">Duplicate in this receipt</span>`);
  if (!bad.length && !dupDb.length && !dupIn.length && units.length === Number(l.qty)) msgs.push('<span class="success-text">✓ All numbers valid</span>');
  el.innerHTML = msgs.join(' · ');
}
function pfTotals() {
  const t = sum(PF.lines, (l) => (Number(l.qty) || 0) * (Number(l.cost) || 0));
  const u = $('#pf-units'); if (u) u.textContent = sum(PF.lines, (l) => Number(l.qty) || 0);
  const tt = $('#pf-total'); if (tt) tt.textContent = money(t);
}
PAGES.purchases.mount = ({ id }) => {
  if (id !== 'new' || !PF) return;
  pfDraw();
  bindForm($('#pf'), async (d) => {
    const items = PF.lines.filter((l) => l.productId).map((l) => { const p = find('products', l.productId); return { productId: l.productId, qty: Number(l.qty), cost: l.cost === '' ? p.cost : Number(l.cost), condition: l.condition || p.condition, units: p.serialized ? parseUnits(p, l.imeis) : undefined }; });
    const rec = await svc.savePurchase({ id: PF.po ? PF.po.id : undefined, supplierId: d.supplierId, supplierInvoice: d.supplierInvoice, date: d.date, expected: d.expected, note: d.note, status: PF.mode === 'po' ? 'ordered' : 'received', items, paid: Number(d.paid) || 0, method: d.method });
    toast(PF.mode === 'po' ? `Purchase order ${rec.no} created.` : `${rec.no} received — ${sum(rec.items, (i) => i.qty)} unit(s) added to stock.`);
    PF = null; location.hash = '#/purchases/' + rec.id;
  });
};
Object.assign(ACT, {
  'pf-add': () => { PF.lines.push({ key: uid('l'), productId: '', qty: 1, cost: '', condition: 'new', imeis: '' }); pfDraw(); },
  'pf-scan': (el) => {
    const l = PF.lines.find((x) => x.key === el.dataset.key); const p = find('products', l.productId);
    openBulkScanner({ mode: 'receive', productId: p.id, expected: Number(l.qty) || 0, existing: parseUnits(p, l.imeis), title: `Bulk scan — ${p.name}`,
      onDone(units) {
        l.imeis = units.map((u) => (p.idType === 'imei' ? (u.imei2 ? `${u.imei1}, ${u.imei2}` : u.imei1) : u.serial)).join('\n');
        const changed = Number(l.qty) !== units.length; l.qty = units.length; pfDraw();
        toast(`${units.length} unit(s) captured${changed ? ' — quantity updated to match' : ''}.`);
      } });
  },
  'pf-rm': (el) => { PF.lines = PF.lines.filter((l) => l.key !== el.dataset.key); pfDraw(); },
  'pf-gen': (el) => {
    const l = PF.lines.find((x) => x.key === el.dataset.key); const p = find('products', l.productId);
    const n = Math.max(1, Number(l.qty) || 1);
    const gen = () => { for (;;) { const body = '35' + String(Math.floor(Math.random() * 1e12)).padStart(12, '0'); const im = body + luhnCheckDigit(body); if (!findDeviceByCode(im)) return im; } };
    const ser = () => 'SN' + Math.random().toString(36).slice(2, 11).toUpperCase();
    l.imeis = Array.from({ length: n }, () => (p.idType === 'imei' ? (p.brand === 'Apple' ? gen() : `${gen()}, ${gen()}`) : ser())).join('\n');
    pfDraw();
  },
});
function purchaseDetail(id) {
  const p = find('purchases', id); if (!p) return emptyState('truck', 'Purchase not found');
  const sup = find('suppliers', p.supplierId); const t = purchaseTotals(p);
  const acts = [
    p.status === 'ordered' && can('purchases', 'create') ? `<a class="btn btn-primary" href="#/purchases/new?po=${p.id}">${icon('truck')} Receive this order</a>` : '',
    p.status === 'ordered' && can('purchases', 'cancel') ? `<button class="btn btn-danger" data-action="po-cancel" data-id="${p.id}">${icon('ban')} Cancel order</button>` : '',
    p.status === 'received' && t.balance > 0 && can('purchases', 'edit') ? `<button class="btn btn-primary" data-action="pur-pay" data-id="${p.id}">${icon('cash')} Pay supplier</button>` : '',
    p.status === 'received' && can('purchases', 'approve') ? `<button class="btn" data-action="pur-return" data-id="${p.id}">${icon('undo')} Return to supplier</button>` : '',
    can('purchases', 'print') ? `<button class="btn" data-action="pur-print" data-id="${p.id}">${icon('printer')} Print</button><button class="btn" data-action="pdf" data-path="/documents/purchase/${p.id}" data-name="${p.no}">${icon('download')} PDF</button>` : '',
  ].join('');
  return pageHead(`<span class="mono">${h(p.no)}</span>`, `${h(sup.name)} · ${fmtDate(p.date)}${p.supplierInvoice ? ' · Supplier invoice ' + h(p.supplierInvoice) : ''}`, acts, `<a href="#/purchases">Purchases</a> ${icon('chevronRight', 'ic-sm')} ${h(p.no)}`) + `
    <div class="flex mb">${sbadge('purchase', p.status)}${p.status === 'received' ? sbadge('pay', payState(t.net, t.paid)) : ''}${p.expected && p.status === 'ordered' ? badge('Expected ' + fmtDate(p.expected), 'blue') : ''}</div>
    <div class="grid grid-main-side"><div class="stack">
      <div class="card"><div class="card-head"><h3>Items</h3></div><div class="table-wrap"><table class="table rtable"><thead><tr><th>Product</th><th>Condition</th><th class="num">Qty</th><th class="num">Unit cost</th><th class="num">Amount</th></tr></thead><tbody>${p.items.map((i) => `<tr><td class="td-main" data-label="Product"><div class="cell-main">${h(productName(i.productId))}</div>${i.deviceIds && i.deviceIds.length ? `<div class="xs mono" style="display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:4px">${i.deviceIds.map((did) => { const dv = find('devices', did); return `<a href="#/imei/${did}">${h(deviceCode(dv))}</a>`; }).join('')}</div>` : ''}</td><td data-label="Condition">${sbadge('condition', i.condition)}</td><td data-label="Qty" class="num">${i.qty}</td><td data-label="Cost" class="num">${money(i.cost)}</td><td data-label="Amount" class="num"><b>${money(i.qty * i.cost)}</b></td></tr>`).join('')}</tbody><tfoot><tr><td colspan="4" data-label="">Total</td><td class="num" data-label="Total">${money(p.total)}</td></tr></tfoot></table></div></div>
      ${p.returns && p.returns.length ? `<div class="card"><div class="card-head"><h3>Returns to supplier</h3></div><div class="card-body flush">${p.returns.map((r) => `<div class="list-row"><span class="kpi-icon tone-amber">${icon('undo', 'ic-sm')}</span><div class="grow"><div class="small bold">${h(r.items.join(', '))}</div><div class="xs muted">${fmtDateTime(r.at)} · ${h(userName(r.userId))} · ${h(r.reason)}</div></div><b>${money(r.amount)}</b></div>`).join('')}</div></div>` : ''}
      ${p.status === 'cancelled' ? `<div class="alert alert-danger">${icon('ban')}<div>Cancelled: ${h(p.cancelReason)}</div></div>` : ''}
    </div><div class="stack">
      <div class="card"><div class="card-head"><h3>Balance</h3></div><div class="card-body"><dl class="dl"><dt>Total</dt><dd class="right">${money(p.total)}</dd>${t.returned ? `<dt>Returns credit</dt><dd class="right">−${money(t.returned)}</dd>` : ''}<dt>Paid</dt><dd class="right">${money(t.paid)}</dd><dt><b>Payable</b></dt><dd class="right ${t.balance > 0 ? 'danger-text' : ''}"><b>${money(t.balance)}</b></dd></dl></div></div>
      <div class="card"><div class="card-head"><h3>Payments</h3></div><div class="card-body flush">${(p.payments || []).length ? p.payments.map((x) => `<div class="list-row"><div class="grow"><div class="small bold">${money(x.amount)} · ${h(x.method)}</div><div class="xs muted">${fmtDateTime(x.at)} · ${h(userName(x.userId))}</div></div></div>`).join('') : emptyState('wallet', 'No payments yet')}</div></div>
      <div class="card"><div class="card-head"><h3>Record</h3></div><div class="card-body"><dl class="dl"><dt>Created by</dt><dd>${h(userName(p.createdBy))}</dd><dt>Created</dt><dd>${fmtDateTime(p.createdAt)}</dd>${p.receivedAt ? `<dt>Received by</dt><dd>${h(userName(p.receivedBy))}</dd><dt>Received</dt><dd>${fmtDateTime(p.receivedAt)}</dd>` : ''}${p.note ? `<dt>Notes</dt><dd>${h(p.note)}</dd>` : ''}</dl></div></div>
    </div></div>`;
}
Object.assign(ACT, {
  'po-cancel': async (el) => { const ok = await confirmDialog({ title: 'Cancel purchase order?', confirmText: 'Cancel order', danger: true, reason: true }); if (ok) { await svc.cancelPurchaseOrder(el.dataset.id, ok.reason); toast('Purchase order cancelled.'); refresh(); } },
  'pur-pay': (el) => {
    const p = find('purchases', el.dataset.id); const bal = purchaseTotals(p).balance;
    const m = openModal({ title: `Pay supplier — ${h(p.no)}`, size: 'sm', body: `<form id="pp-form" class="stack" novalidate><div class="alert alert-info">${icon('info')}<div>Outstanding: <b>${money(bal)}</b></div></div>${field('Amount', `<input class="input" name="amount" inputmode="decimal" value="${bal}" required>`, { req: true })}${field('Method', `<select class="select" name="method">${opts(db.settings.paymentMethods, 'Bank Transfer')}</select>`)}${field('Note', '<input class="input" name="note">')}</form>`,
      foot: `<button class="btn" data-dismiss>Cancel</button><button class="btn btn-primary" type="submit" form="pp-form">Record payment</button>`,
      onMount(e2) { bindForm($('#pp-form', e2), async (d) => { await svc.supplierPayment(p.id, Number(d.amount), d.method, d.note); m.close(); toast('Supplier payment recorded.'); refresh(); }); } });
  },
  'pur-return': (el) => {
    const p = find('purchases', el.dataset.id);
    const devs = p.items.flatMap((i) => i.deviceIds || []).map((x) => find('devices', x)).filter((d) => ['in_stock', 'damaged', 'returned', 'warranty_return'].includes(d.status));
    const qtyLines = p.items.filter((i) => !find('products', i.productId).serialized);
    const m = openModal({ title: `Return to supplier — ${h(p.no)}`, size: 'lg',
      body: `<form id="pr-form" class="stack" novalidate>${devs.length ? `<div><div class="label mb-sm">Serialised units</div><div class="stack-sm">${devs.map((d) => `<label class="check"><input type="checkbox" name="dev" value="${d.id}"> <span class="mono">${h(deviceCode(d))}</span> — ${h(productName(d.productId))} ${sbadge('device', d.status)}</label>`).join('')}</div></div>` : ''}
        ${qtyLines.length ? `<div><div class="label mb-sm">Quantity items</div><div class="stack-sm">${qtyLines.map((i) => `<div class="flex"><span class="grow">${h(productName(i.productId))} <span class="xs muted">(${find('products', i.productId).qty} on hand)</span></span><input class="input input-sm" style="width:90px" data-q="${i.productId}" inputmode="numeric" value="0"></div>`).join('')}</div></div>` : ''}
        ${!devs.length && !qtyLines.length ? '<p class="muted">No items from this purchase are available to return.</p>' : ''}
        ${field('Reason', '<textarea class="input" name="reason" rows="2" required placeholder="e.g. Dead on arrival / wrong colour"></textarea>', { req: true })}</form>`,
      foot: `<button class="btn" data-dismiss>Cancel</button><button class="btn btn-danger" type="submit" form="pr-form">Record return</button>`,
      onMount(e2) { bindForm($('#pr-form', e2), async (d) => { await svc.purchaseReturn(p.id, { deviceIds: d.dev === true ? [$('[name=dev]', e2).value] : Array.isArray(d.dev) ? d.dev : [], lines: $$('[data-q]', e2).map((i) => ({ productId: i.dataset.q, qty: Number(i.value) || 0 })), reason: d.reason }); m.close(); toast('Return recorded and supplier balance credited.'); refresh(); }); } });
  },
  'pur-print': (el) => {
    const p = find('purchases', el.dataset.id); const sup = find('suppliers', p.supplierId);
    printDoc(p.no, `${docHeader(p.status === 'ordered' ? 'Purchase Order' : 'Goods Received Note', `<div class="mono"><b>${h(p.no)}</b></div><div>${fmtDate(p.date)}</div>`)}<div class="grid2"><div class="box"><h4>Supplier</h4><b>${h(sup.name)}</b><div>${h(sup.contact)} · ${h(sup.phone)}</div><div class="muted">${h(sup.address)}</div></div><div class="box"><h4>Reference</h4>Supplier invoice: ${h(p.supplierInvoice || '—')}<div class="muted">Terms: ${h(sup.terms || '—')}</div></div></div>
      <table><thead><tr><th>Product</th><th>IMEI / Serial</th><th class="num">Qty</th><th class="num">Cost</th><th class="num">Amount</th></tr></thead><tbody>${p.items.map((i) => `<tr><td>${h(productName(i.productId))}</td><td class="mono">${(i.deviceIds || []).map((x) => h(deviceCode(find('devices', x)))).join('<br>') || '—'}</td><td class="num">${i.qty}</td><td class="num">${money(i.cost)}</td><td class="num">${money(i.qty * i.cost)}</td></tr>`).join('')}</tbody></table><table class="totals"><tr class="grand"><td>Total</td><td class="num">${money(p.total)}</td></tr></table><div class="sign"><div>Received by</div><div>Checked by</div></div>`);
  },
});

/* ---------------- Suppliers ---------------- */
PAGES.suppliers = {
  title: 'Suppliers', perm: ['suppliers', 'view'],
  render({ id }) {
    if (id) return supplierDetail(id);
    const money2 = can('purchases', 'view');
    return pageHead('Suppliers', 'Distributors and wholesalers you purchase from.', `${can('suppliers', 'export') ? `<button class="btn" data-action="sup-export">${icon('download')} Export</button>` : ''}${can('suppliers', 'create') ? `<button class="btn btn-primary" data-action="sup-new">${icon('plus')} New supplier</button>` : ''}`) +
      `<div class="card">${dataTable('suppliers', {
        rows: () => db.suppliers, rowHref: (s) => '#/suppliers/' + s.id, searchText: (s) => [s.name, s.contact, s.phone, s.email].join(' '),
        columns: [
          { label: 'Supplier', cls: 'td-main', sort: (s) => s.name, render: (s) => `<div class="cell-main">${h(s.name)}</div><div class="cell-sub">${h(s.code)} · ${h(s.terms || '')}</div>`, csv: (s) => s.name },
          { label: 'Contact', render: (s) => `${h(s.contact)}<div class="xs muted">${h(s.email)}</div>`, csv: (s) => s.contact },
          { label: 'Phone', render: (s) => h(s.phone), csv: (s) => s.phone },
          ...(money2 ? [{ label: 'Purchases', cls: 'num', render: (s) => db.purchases.filter((p) => p.supplierId === s.id && p.status === 'received').length },
            { label: 'Total purchased', cls: 'num', sort: (s) => sum(db.purchases.filter((p) => p.supplierId === s.id && p.status === 'received'), (p) => p.total), render: (s) => money(sum(db.purchases.filter((p) => p.supplierId === s.id && p.status === 'received'), (p) => p.total)), csv: (s) => sum(db.purchases.filter((p) => p.supplierId === s.id && p.status === 'received'), (p) => p.total) },
            { label: 'Payable', cls: 'num', sort: (s) => supplierBalance(s.id), render: (s) => (supplierBalance(s.id) > 0 ? `<b class="danger-text">${money(supplierBalance(s.id))}</b>` : '—'), csv: (s) => supplierBalance(s.id) }] : []),
        ],
      })}</div>`;
  },
};
function openSupplierForm(s) {
  const m = openModal({ title: s ? 'Edit supplier' : 'New supplier', size: 'lg',
    body: `<form id="sup-form" class="form-grid" novalidate>${field('Company name', `<input class="input" name="name" required value="${h(s?.name)}">`, { req: true })}${field('Contact person', `<input class="input" name="contact" value="${h(s?.contact)}">`)}${field('Phone', `<input class="input" name="phone" value="${h(s?.phone)}">`)}${field('Email', `<input class="input" name="email" value="${h(s?.email)}">`)}${field('Address', `<input class="input" name="address" value="${h(s?.address)}">`)}${field('Payment terms', `<input class="input" name="terms" value="${h(s?.terms)}" placeholder="Net 30">`)}</form>`,
    foot: `<button class="btn" data-dismiss>Cancel</button><button class="btn btn-primary" type="submit" form="sup-form">Save supplier</button>`,
    onMount(el) { bindForm($('#sup-form', el), async (d) => { await svc.saveSupplier({ ...(s ? { id: s.id } : {}), ...d }); m.close(); toast('Supplier saved.'); refresh(); }); } });
}
Object.assign(ACT, {
  'sup-new': () => openSupplierForm(null),
  'sup-edit': (el) => openSupplierForm(find('suppliers', el.dataset.id)),
  'sup-export': () => { need('suppliers', 'export'); dtExport('suppliers', `suppliers-${todayISO()}`); },
});
function supplierDetail(id) {
  const s = find('suppliers', id); if (!s) return emptyState('handshake', 'Supplier not found');
  const pur = db.purchases.filter((p) => p.supplierId === id);
  const prods = db.products.filter((p) => p.supplierId === id || pur.some((x) => x.items.some((i) => i.productId === p.id)));
  const showMoney = can('purchases', 'view');
  return pageHead(h(s.name), `${h(s.code)} · ${h(s.contact)} · ${h(s.phone)}`, can('suppliers', 'edit') ? `<button class="btn" data-action="sup-edit" data-id="${s.id}">${icon('edit')} Edit</button>` : '', `<a href="#/suppliers">Suppliers</a> ${icon('chevronRight', 'ic-sm')} ${h(s.name)}`) + `
    ${showMoney ? `<div class="kpis mb">${kpi({ label: 'Total purchased', value: money(sum(pur.filter((p) => p.status === 'received'), (p) => p.total)), icon: 'truck', tone: 'blue', foot: `${pur.length} documents` })}${kpi({ label: 'Paid', value: money(sum(pur, (p) => purchaseTotals(p).paid)), icon: 'wallet', tone: 'green' })}${kpi({ label: 'Outstanding payable', value: money(supplierBalance(s.id)), icon: 'alert', tone: 'red' })}${kpi({ label: 'Products supplied', value: prods.length, icon: 'package', tone: 'purple' })}</div>` : ''}
    <div class="grid grid-main-side"><div class="card"><div class="card-head"><h3>Purchase history</h3></div>${dataTable('sup-pur', { rows: () => pur, search: false, rowHref: (p) => '#/purchases/' + p.id, columns: [
      { label: 'Purchase', cls: 'td-main', render: (p) => `<div class="cell-main mono">${h(p.no)}</div><div class="cell-sub">${fmtDate(p.date)}</div>` },
      { label: 'Items', render: (p) => h(p.items.map((i) => `${i.qty}× ${productName(i.productId)}`).join(', ')) },
      { label: 'Total', cls: 'num', render: (p) => money(p.total) }, { label: 'Balance', cls: 'num', render: (p) => money(purchaseTotals(p).balance) }, { label: 'Status', render: (p) => sbadge('purchase', p.status) }] })}</div>
    <div class="card"><div class="card-head"><h3>Details</h3></div><div class="card-body"><dl class="dl"><dt>Contact</dt><dd>${h(s.contact)}</dd><dt>Phone</dt><dd>${h(s.phone)}</dd><dt>Email</dt><dd>${h(s.email)}</dd><dt>Address</dt><dd>${h(s.address)}</dd><dt>Terms</dt><dd>${h(s.terms)}</dd></dl><hr><div class="label mb-sm">Products</div>${prods.map((p) => `<div class="small">${h(p.name)}</div>`).join('')}</div></div></div>`;
}
