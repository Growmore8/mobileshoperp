/* Product & repair warranties, validity lookup, claims */
'use strict';

function findWarranties(q) {
  q = String(q || '').trim(); if (q.length < 3) return [];
  const k = normId(q); const lo = q.toLowerCase(); const digits = q.replace(/\D/g, '');
  const custIds = db.customers.filter((c) => (digits.length >= 6 && c.phone.replace(/\D/g, '').includes(digits)) || c.name.toLowerCase().includes(lo)).map((c) => c.id);
  return db.warranties.filter((w) => [w.no, w.imei, w.serial, w.invoiceNo, w.jobNo].some((x) => x && normId(x) === k) || (k.length >= 6 && [w.imei, w.serial].some((x) => x && x.includes(k))) || custIds.includes(w.customerId));
}
function wTitle(w) { return w.kind === 'repair' ? `${w.device} — repair ${w.jobNo}` : productName(w.productId); }
function validityCard(w, compact = false) {
  const st = wStatus(w);
  const d = daysUntil(warrantyEnd(w));
  const cls = st === 'active' ? 'ok' : st === 'expiring' || st === 'replaced' ? 'warn' : 'bad';
  const nwR = st === 'replaced' && find('warranties', w.replacedByWarrantyId);
  const txt = st === 'replaced' ? `Unit replaced — coverage moved to ${nwR ? nwR.no + ' (' + (nwR.imei || nwR.serial) + ')' : 'replacement unit'}` : st === 'void' ? `Void — ${w.voidReason || ''}` : st === 'expired' ? `Expired ${Math.abs(d)} day(s) ago` : `Valid — ${d} day(s) remaining`;
  return `<div class="validity ${cls}"><span class="vi">${icon(st === 'active' || st === 'expiring' ? 'shield' : 'shieldX', 'ic-lg')}</span><div class="grow" style="min-width:0">
    <div class="flex flex-wrap" style="gap:6px"><b>${h(w.no)}</b>${badge(w.kind === 'repair' ? 'Repair warranty' : 'Product warranty', w.kind === 'repair' ? 'purple' : 'blue', 'no-dot')}${sbadge('warranty', st)}</div>
    <div class="bold" style="font-size:15px;margin-top:2px">${txt}</div>
    <div class="small text-2">${h(wTitle(w))}${w.imei ? ` · <span class="mono">${h(w.imei)}</span>` : w.serial ? ` · <span class="mono">${h(w.serial)}</span>` : ''} · ${h(customerName(w.customerId))}</div>
    <div class="xs muted">${fmtDate(w.start)} → ${fmtDate(warrantyEnd(w))}${w.kind === 'product' ? ` · ${w.months} months ${h(w.provider)}` : ` · ${w.components.map((c) => `${h(c.label.split(' – ')[0].replace(/^\d+ × /, ''))} ${daysUntil(c.end) >= 0 ? '✓' : '✕'}`).join(', ')}`}</div>
    ${w.replacesWarrantyId ? `<div class="xs" style="margin-top:2px">${icon('swap', 'ic-sm')} Replacement unit for defective <span class="mono">${h(w.replacedDeviceCode)}</span> (${h(w.replacementNo)})</div>` : ''}</div>
    ${compact ? '' : `<div class="btn-group">${nwR ? `<a class="btn btn-sm btn-primary" href="#/warranties/${nwR.id}">Open new warranty</a>` : ''}<a class="btn btn-sm" href="#/warranties/${w.id}">Details</a>${can('warranties', 'create') && st !== 'void' && st !== 'replaced' ? `<button class="btn btn-sm btn-primary" data-action="claim-new" data-w="${w.id}">Register claim</button>` : ''}</div>`}</div>`;
}

PAGES.warranties = {
  title: 'Warranties', perm: ['warranties', 'view'],
  render({ id, query }) {
    if (id) return warrantyDetail(id);
    const tab = query.tab || 'product';
    const cnt = (kind, st) => db.warranties.filter((w) => w.kind === kind && wStatus(w) === st).length;
    const claims = db.claims;
    const freeRep = db.repairs.filter((r) => r.isWarrantyRepair);
    const wCost = sum(freeRep, (r) => repairTotals(r).coveredValue) + sum(claims.filter((c) => c.status === 'resolved'), (c) => c.cost);
    const lookup = `<div class="card mb"><div class="card-head"><div><h3>Warranty check</h3><div class="sub">Search by IMEI, serial number, invoice no., repair job no., warranty no. or customer phone</div></div></div><div class="card-body">
      <form id="wl-form" class="flex flex-wrap"><div class="input-icon" style="min-width:240px">${icon('scan')}<input class="input" id="wl-q" value="${h(query.q || '')}" placeholder="e.g. 354676… or INV-1042 or RJ-1003" autocomplete="off" aria-label="Warranty search"></div><button class="btn btn-primary" type="submit">${icon('search')} Check validity</button></form>
      <div id="wl-res" class="stack mt"></div></div></div>`;
    const tiles = `<div class="kpis mb">
      ${kpi({ label: 'Product — active', value: cnt('product', 'active'), icon: 'shield', tone: 'green', href: '#/warranties?tab=product&status=active' })}
      ${kpi({ label: `Product — expiring ≤${db.settings.expiringDays}d`, value: cnt('product', 'expiring'), icon: 'clock', tone: 'amber', href: '#/warranties?tab=product&status=expiring' })}
      ${kpi({ label: 'Product — expired', value: cnt('product', 'expired'), icon: 'shieldX', tone: 'red', href: '#/warranties?tab=product&status=expired' })}
      ${kpi({ label: 'Repair — active', value: cnt('repair', 'active'), icon: 'wrench', tone: 'green', href: '#/warranties?tab=repair&status=active' })}
      ${kpi({ label: 'Repair — expiring', value: cnt('repair', 'expiring'), icon: 'clock', tone: 'amber', href: '#/warranties?tab=repair&status=expiring' })}
      ${kpi({ label: 'Repair — expired', value: cnt('repair', 'expired'), icon: 'shieldX', tone: 'red', href: '#/warranties?tab=repair&status=expired' })}
      ${kpi({ label: 'Pending claims', value: claims.filter((c) => ['pending', 'inspection'].includes(c.status)).length, icon: 'shieldAlert', tone: 'purple', foot: `${claims.filter((c) => c.kind === 'product' && ['pending', 'inspection'].includes(c.status)).length} product · ${claims.filter((c) => c.kind === 'repair' && ['pending', 'inspection'].includes(c.status)).length} repair`, href: '#/claims' })}
      ${kpi({ label: 'Claims approved / rejected', value: `${claims.filter((c) => ['approved', 'resolved'].includes(c.status)).length} / ${claims.filter((c) => c.status === 'rejected').length}`, icon: 'checkCircle', tone: 'blue', href: '#/claims?tab=all' })}
      ${kpi({ label: 'Free warranty repairs', value: freeRep.length, icon: 'handshake', tone: 'cyan', foot: can('reports', 'view') ? `Warranty cost ${money(wCost)}` : '' })}
    </div>`;
    const tabs = tabsHtml([{ key: 'product', label: 'Product warranties', count: db.warranties.filter((w) => w.kind === 'product').length }, { key: 'repair', label: 'Repair warranties', count: db.warranties.filter((w) => w.kind === 'repair').length }], tab);
    const rows = () => db.warranties.filter((w) => w.kind === tab);
    const table = dataTable('w-' + tab, {
      rows, rowHref: (w) => '#/warranties/' + w.id, placeholder: 'Search warranty, IMEI, customer, product…',
      searchText: (w) => [w.no, w.imei, w.serial, w.invoiceNo, w.jobNo, customerName(w.customerId), wTitle(w)].join(' '),
      initialFilters: query.status ? { st: query.status } : {},
      filters: [
        { key: 'st', label: 'Any status', options: Object.entries(TONES.warranty).map(([k, v]) => [k, v[0]]), fn: (w, v) => wStatus(w) === v },
        ...(tab === 'product' ? [{ key: 'prov', label: 'Any provider', options: ['Manufacturer', 'Distributor', 'Shop'], fn: (w, v) => w.provider === v }, { key: 'cat', label: 'Any category', options: db.categories.filter((c) => c.warrantyMonths || c.kind === 'phone').map((c) => [c.id, c.name]), fn: (w, v) => (find('products', w.productId) || {}).categoryId === v }] : []),
        { key: 'exp', label: 'Any expiry', options: [['30', 'Expires within 30 days'], ['60', 'Expires within 60 days'], ['90', 'Expires within 90 days']], fn: (w, v) => { const d = daysUntil(warrantyEnd(w)); return d >= 0 && d <= Number(v); } },
      ],
      columns: [
        { label: 'Warranty', cls: 'td-main', sort: (w) => w.no, render: (w) => `<div class="cell-main mono">${h(w.no)}</div><div class="cell-sub">${tab === 'repair' ? 'Job ' + h(w.jobNo) : 'Invoice ' + h(w.invoiceNo)}</div>`, csv: (w) => w.no },
        { label: tab === 'repair' ? 'Device & coverage' : 'Product', render: (w) => `${h(tab === 'repair' ? w.device : productName(w.productId))}${w.imei || w.serial ? `<div class="xs mono muted">${h(w.imei || w.serial)}</div>` : ''}${tab === 'repair' ? `<div class="xs muted">${w.components.map((c) => h(c.label)).join(' · ')}</div>` : ''}`, csv: wTitle },
        { label: 'Customer', render: (w) => h(customerName(w.customerId)), csv: (w) => customerName(w.customerId) },
        { label: tab === 'repair' ? 'Coverage' : 'Type', render: (w) => (tab === 'repair' ? w.components.map((c) => `${c.type === 'labor' ? 'Labour' : 'Part'} ${c.days}d`).join(', ') : `${w.months}m · ${h(w.provider)}`), csv: (w) => (tab === 'repair' ? w.components.map((c) => c.days).join('/') : w.months) },
        { label: 'Start', sort: (w) => w.start, render: (w) => fmtDate(w.start), csv: (w) => w.start },
        { label: 'Expiry', sort: warrantyEnd, render: (w) => `<b>${fmtDate(warrantyEnd(w))}</b>`, csv: warrantyEnd },
        { label: 'Status', render: (w) => sbadge('warranty', wStatus(w)), csv: wStatus },
      ],
      toolbar: can('warranties', 'export') ? `<button class="btn btn-sm" data-action="w-export" data-t="${tab}">${icon('download', 'ic-sm')} Export</button>` : '',
    });
    return pageHead('Warranties', 'Product warranties and repair-service warranties are tracked as separate records with their own dates and terms.', can('warranties', 'create') ? `<button class="btn btn-primary" data-action="claim-new">${icon('shieldAlert')} Register claim</button>` : '') + lookup + tiles + `<div class="card">${tabs}${table}</div>`;
  },
  mount({ id, query }) {
    if (id) return;
    const f = $('#wl-form'); if (!f) return;
    const run = () => {
      const q = $('#wl-q').value; const res = findWarranties(q);
      $('#wl-res').innerHTML = !q.trim() ? '' : res.length ? res.map((w) => validityCard(w)).join('') : `<div class="alert alert-warning">${icon('search')}<div>No warranty found for “${h(q)}”. Check the number, or search by the customer's phone.</div></div>`;
    };
    f.addEventListener('submit', (e) => { e.preventDefault(); run(); log('warranties', 'Warranty lookup', `Searched “${$('#wl-q').value}”`); saveDB(); });
    if (query.q) run();
  },
};
ACT['w-export'] = (el) => { need('warranties', 'export'); dtExport('w-' + el.dataset.t, `${el.dataset.t}-warranties-${todayISO()}`); };

function warrantyDetail(id) {
  const w = find('warranties', id); if (!w) return emptyState('shield', 'Warranty not found');
  const claims = db.claims.filter((c) => c.warrantyId === w.id);
  const isR = w.kind === 'repair';
  const rep = isR && find('repairs', w.repairId);
  const prod = !isR && find('products', w.productId);
  const dev = w.deviceId && find('devices', w.deviceId);
  const other = isR ? db.warranties.filter((x) => x.kind === 'product' && x.imei && x.imei === w.imei) : db.warranties.filter((x) => x.kind === 'repair' && x.imei && x.imei === w.imei);
  const acts = [
    can('warranties', 'print') ? `<button class="btn" data-action="w-print" data-id="${w.id}">${icon('printer')} Print ${isR ? 'warranty card' : 'certificate'}</button><button class="btn" data-action="pdf" data-path="/documents/warranty/${w.id}" data-name="${w.no}">${icon('download')} PDF</button>` : '',
    can('warranties', 'approve') && w.status === 'active' ? `<button class="btn" data-action="w-extend" data-id="${w.id}">${icon('clock')} Extend</button>` : '',
    can('warranties', 'create') && w.status === 'active' ? `<button class="btn btn-primary" data-action="claim-new" data-w="${w.id}">${icon('shieldAlert')} Register claim</button>` : '',
  ].join('');
  return pageHead(`<span class="mono">${h(w.no)}</span>`, isR ? 'Repair service & replaced-part warranty' : `${h(w.type)} · ${CONDITIONS[w.condition] || ''}`, acts, `<a href="#/warranties?tab=${w.kind}">Warranties</a> ${icon('chevronRight', 'ic-sm')} ${h(w.no)}`) + `
    <div class="mb">${validityCard(w, true)}</div>
    <div class="grid grid-main-side"><div class="stack">
      <div class="card"><div class="card-head"><h3>${isR ? 'Coverage' : 'Warranty details'}</h3></div><div class="card-body">
        ${isR ? `<div class="coverage">${w.components.map((c) => { const d = daysUntil(c.end); return `<div class="cov"><div><div class="bold">${h(c.label)}</div><div class="xs muted">${c.type === 'labor' ? 'Labour / service warranty' : 'Replaced-part warranty'} · ${c.days} days</div></div><div class="right"><div class="small">until <b>${fmtDate(c.end)}</b></div>${d >= 0 ? badge(`${d} days left`, d <= db.settings.expiringDays ? 'amber' : 'green') : badge('Expired', 'red')}</div></div>`; }).join('')}</div>` : `<dl class="dl"><dt>Product</dt><dd>${h(prod ? prod.name : '')}</dd>${w.imei ? `<dt>IMEI</dt><dd class="mono">${dev && can('inventory', 'view') ? `<a href="#/imei/${dev.id}">${h(w.imei)}</a>` : h(w.imei)}</dd>` : ''}${w.serial ? `<dt>Serial</dt><dd class="mono">${h(w.serial)}</dd>` : ''}${w.qty > 1 ? `<dt>Quantity</dt><dd>${w.qty}</dd>` : ''}<dt>Provider</dt><dd>${h(w.provider)}</dd><dt>Period</dt><dd>${w.months} months</dd><dt>Start</dt><dd>${fmtDate(w.start)} <span class="xs muted">(${db.settings.warrantyStart === 'sale' ? 'sale date' : 'activation date'})</span></dd><dt>Expiry</dt><dd><b>${fmtDate(w.end)}</b></dd></dl>`}
      </div></div>
      ${w.replacementNo ? replacementCard(db.replacements.find((r) => r.no === w.replacementNo), w.replacesWarrantyId ? 'This warranty covers a replacement unit' : 'This unit was replaced under warranty') : ''}
      <div class="card"><div class="card-head"><h3>Terms & exclusions</h3></div><div class="card-body"><p class="text-2 small">${h(w.terms)}</p></div></div>
      <div class="card"><div class="card-head"><h3>Claims</h3></div><div class="card-body flush">${claims.length ? claims.map((c) => `<a class="list-row" href="#/claims/${c.id}"><span class="kpi-icon tone-purple">${icon('shieldAlert', 'ic-sm')}</span><div class="grow"><div class="bold small">${h(c.no)} · ${h(c.fault)}</div><div class="xs muted">${fmtDate(c.date)}${c.resolution ? ' · ' + h(c.resolution) : ''}</div></div>${sbadge('claim', c.status)}</a>`).join('') : emptyState('shieldAlert', 'No claims on this warranty')}</div></div>
    </div><div class="stack">
      <div class="card"><div class="card-head"><h3>Linked records</h3></div><div class="card-body"><dl class="dl">
        <dt>Customer</dt><dd>${can('customers', 'view') && w.customerId ? `<a href="#/customers/${w.customerId}">${h(customerName(w.customerId))}</a>` : h(customerName(w.customerId))}</dd>
        ${w.invoiceNo ? `<dt>${isR ? 'Original invoice' : 'Sales invoice'}</dt><dd class="mono">${w.saleId && can('sales', 'view') ? `<a href="#/sales/${w.saleId}">${h(w.invoiceNo)}</a>` : h(w.invoiceNo)}</dd>` : ''}
        ${isR ? `<dt>Repair job</dt><dd class="mono">${rep ? `<a href="#/repairs/${rep.id}">${h(rep.no)}</a>` : h(w.jobNo)}</dd><dt>Service</dt><dd>${h(rep ? rep.type : '')}</dd>` : ''}
      </dl>${other.length ? `<hr><div class="label mb-sm">${isR ? 'Original product warranty (separate)' : 'Repair warranties on this device'}</div>${other.map((x) => `<div class="flex between small mb-sm"><a href="#/warranties/${x.id}">${h(x.no)}</a>${sbadge('warranty', wStatus(x))}</div>`).join('')}<p class="xs muted">Repair warranties never overwrite or extend the product warranty.</p>` : ''}</div></div>
      <div class="card"><div class="card-head"><h3>Warranty history</h3></div><div class="card-body"><ul class="timeline">${w.history.slice().reverse().map((x) => `<li><div class="t-title">${h(x.action)}</div><div class="t-meta">${fmtDateTime(x.at)} · ${h(userName(x.userId))}</div><div class="small text-2">${h(x.note)}</div></li>`).join('')}</ul></div></div>
    </div></div>`;
}
Object.assign(ACT, {
  'w-print': (el) => { need('warranties', 'print'); const w = find('warranties', el.dataset.id); printDoc(w.no, warrantyDoc(w)); },
  'w-extend': (el) => {
    const w = find('warranties', el.dataset.id); const isR = w.kind === 'repair';
    const m = openModal({ title: `Extend ${h(w.no)}`, size: 'sm', body: `<form id="we-form" class="stack" novalidate><div class="alert alert-info">${icon('info')}<div>Extensions are recorded as an authorised, traceable change in the warranty history and activity log.</div></div>${isR ? field('Extend all components by (days)', '<input class="input" name="days" inputmode="numeric" required value="30">', { req: true }) : field('Extend by (months)', '<input class="input" name="months" inputmode="numeric" required value="6">', { req: true })}${field('Reason / authorisation', '<textarea class="input" name="reason" rows="2" required placeholder="e.g. Extended warranty purchased (INV-…)"></textarea>', { req: true })}</form>`,
      foot: `<button class="btn" data-dismiss>Cancel</button><button class="btn btn-primary" type="submit" form="we-form">Extend warranty</button>`,
      onMount(e2) { bindForm($('#we-form', e2), async (d) => { await svc.extendWarranty(w.id, d); m.close(); toast('Warranty extended.'); refresh(); }); } });
  },
  'claim-new': (el) => openClaimForm(el.dataset.w),
});

/* ---------------- Claims ---------------- */
function openClaimForm(warrantyId) {
  let w = warrantyId ? find('warranties', warrantyId) : null;
  let photos = [];
  const m = openModal({ title: 'Register warranty claim', size: 'lg',
    body: `<form id="cl-form" class="stack" novalidate>
      <div id="cl-pick" class="${w ? 'hidden' : ''}"><div class="field"><label class="req">Find the warranty</label><div class="input-icon">${icon('search')}<input class="input" id="cl-q" placeholder="IMEI, serial, invoice no., job no. or phone" autocomplete="off"></div></div><div class="stack-sm mt-sm" id="cl-results"></div></div>
      <div id="cl-sel"></div>
      <div id="cl-details" class="${w ? '' : 'hidden'} stack">
        ${field('Reported fault', '<textarea class="input" name="fault" rows="3" required placeholder="Describe the problem the customer reports"></textarea>', { req: true })}
        <div class="field"><label>Inspection at the counter — any exclusions?</label><div class="stack-sm">
          <label class="check"><input type="checkbox" name="physical"> Physical / impact damage (cracks, dents, bends)</label>
          <label class="check"><input type="checkbox" name="liquid"> Liquid damage indicator triggered</label>
          <label class="check"><input type="checkbox" name="tampered"> Opened / repaired elsewhere, seal broken</label>
          <label class="check" id="cl-unrel"><input type="checkbox" name="unrelated"> Complaint unrelated to the repaired part / service</label></div></div>
        <div id="cl-elig"></div>
        ${field('Notes', '<input class="input" name="notes" placeholder="Documents presented, accessories received…">')}
        <div class="field"><label>Photos / documents</label><div class="photo-grid" id="cl-photos"></div><label class="btn btn-sm" style="width:max-content">${icon('camera', 'ic-sm')} Add photo<input type="file" accept="image/*" capture="environment" hidden id="cl-file"></label></div>
      </div></form>`,
    foot: `<button class="btn" data-dismiss>Cancel</button><button class="btn btn-primary" type="submit" form="cl-form" id="cl-submit" ${w ? '' : 'disabled'}>${icon('check')} Register claim</button>`,
    onMount(el) {
      const f = $('#cl-form', el);
      const elig = () => {
        if (!w) return;
        const flags = { physical: f.physical.checked, liquid: f.liquid.checked, tampered: f.tampered.checked, unrelated: f.unrelated.checked };
        const e = checkEligibility(w, flags);
        $('#cl-elig', el).innerHTML = e.eligible ? `<div class="alert alert-success">${icon('checkCircle')}<div><b>Eligible under warranty terms.</b> ${w.kind === 'repair' ? 'Active coverage: ' + e.activeComponents.map((c) => h(c.label)).join(', ') : `Valid until ${fmtDate(w.end)}.`} The final decision is made after inspection.</div></div>` : `<div class="alert alert-danger">${icon('xCircle')}<div><b>Likely not eligible:</b><ul style="margin:4px 0 0;padding-left:18px">${e.reasons.map((r) => `<li>${h(r)}</li>`).join('')}</ul><div class="xs mt-sm">You can still register the claim; an authorised user decides (goodwill override possible).</div></div></div>`;
      };
      const select = (wid) => {
        w = find('warranties', wid);
        $('#cl-pick', el).classList.add('hidden'); $('#cl-details', el).classList.remove('hidden'); $('#cl-submit', el).disabled = false;
        $('#cl-sel', el).innerHTML = validityCard(w, true) + `<button type="button" class="btn btn-xs btn-ghost mt-sm" id="cl-change">Choose a different warranty</button>`;
        $('#cl-unrel', el).classList.toggle('hidden', w.kind !== 'repair');
        $('#cl-change', el).addEventListener('click', () => { w = null; $('#cl-pick', el).classList.remove('hidden'); $('#cl-details', el).classList.add('hidden'); $('#cl-sel', el).innerHTML = ''; $('#cl-submit', el).disabled = true; });
        elig();
      };
      $('#cl-q', el).addEventListener('input', (e) => {
        const res = findWarranties(e.target.value).slice(0, 8);
        $('#cl-results', el).innerHTML = res.map((x) => `<button type="button" class="pick" data-w="${x.id}">${icon(x.kind === 'repair' ? 'wrench' : 'shield')}<div class="grow" style="min-width:0"><div class="bold small">${h(x.no)} · ${h(wTitle(x))}</div><div class="xs muted">${h(customerName(x.customerId))} · ${h(x.imei || x.serial || x.invoiceNo)} · until ${fmtDate(warrantyEnd(x))}</div></div>${sbadge('warranty', wStatus(x))}</button>`).join('') || (e.target.value.length > 2 ? '<div class="small muted">No warranty found.</div>' : '');
        $$('[data-w]', $('#cl-results', el)).forEach((b) => b.addEventListener('click', () => select(b.dataset.w)));
      });
      ['physical', 'liquid', 'tampered', 'unrelated'].forEach((n) => f[n].addEventListener('change', elig));
      $('#cl-file', el).addEventListener('change', async (e) => { try { photos.push(await readImage(e.target.files[0], 720)); $('#cl-photos', el).innerHTML = photos.map((p) => `<img src="${p}" alt="">`).join(''); } catch (err) { handleError(err); } });
      if (w) select(w.id);
      bindForm(f, async (d) => {
        if (!w) throw new AppError('Select the warranty first.');
        const c = await svc.createClaim({ warrantyId: w.id, fault: d.fault, notes: d.notes, photos, flags: { physical: d.physical, liquid: d.liquid, tampered: d.tampered, unrelated: d.unrelated } });
        m.close(); toast(`Claim ${c.no} registered${c.eligibility.eligible ? '' : ' (flagged: not eligible)'}.`, c.eligibility.eligible ? 'success' : 'warning');
        location.hash = '#/claims/' + c.id;
      });
    } });
}
PAGES.claims = {
  title: 'Warranty Claims', perm: ['warranties', 'view'], nav: 'claims',
  render({ id, query }) {
    if (id) return claimDetail(id);
    const tab = query.tab || 'open';
    const f = { open: (c) => ['pending', 'inspection'].includes(c.status), approved: (c) => c.status === 'approved', rejected: (c) => c.status === 'rejected', resolved: (c) => c.status === 'resolved', all: () => true };
    const tabs = tabsHtml([{ key: 'open', label: 'Pending & inspection', count: db.claims.filter(f.open).length }, { key: 'approved', label: 'Approved', count: db.claims.filter(f.approved).length }, { key: 'rejected', label: 'Rejected', count: db.claims.filter(f.rejected).length }, { key: 'resolved', label: 'Resolved', count: db.claims.filter(f.resolved).length }, { key: 'all', label: 'All', count: db.claims.length }], tab);
    return pageHead('Warranty Claims', 'Product warranty claims and repeat-repair (repair warranty) claims, from registration to resolution.', can('warranties', 'create') ? `<button class="btn btn-primary" data-action="claim-new">${icon('plus')} Register claim</button>` : '') +
      `<div class="card">${tabs}${dataTable('claims-' + tab, {
        rows: () => db.claims.filter(f[tab] || f.all), rowHref: (c) => '#/claims/' + c.id, searchText: (c) => { const w = find('warranties', c.warrantyId); return [c.no, c.fault, customerName(c.customerId), w.no, w.imei, wTitle(w)].join(' '); },
        filters: [{ key: 'k', label: 'Product & repair', options: [['product', 'Product warranty claims'], ['repair', 'Repair warranty claims']], fn: (c, v) => c.kind === v }, { key: 'as', label: 'Anyone assigned', options: db.users.map((u) => [u.id, u.name]), fn: (c, v) => c.assignedTo === v }],
        columns: [
          { label: 'Claim', cls: 'td-main', sort: (c) => c.at, render: (c) => `<div class="cell-main mono">${h(c.no)}</div><div class="cell-sub">${fmtDate(c.date)}</div>` },
          { label: 'Type', render: (c) => badge(c.kind === 'repair' ? 'Repair warranty' : 'Product warranty', c.kind === 'repair' ? 'purple' : 'blue', 'no-dot') },
          { label: 'Device / product', render: (c) => { const w = find('warranties', c.warrantyId); return `${h(wTitle(w))}${w.imei ? `<div class="xs mono muted">${h(w.imei)}</div>` : ''}`; } },
          { label: 'Customer', render: (c) => h(customerName(c.customerId)) },
          { label: 'Fault', render: (c) => `<span class="small">${h(c.fault)}</span>` },
          { label: 'Pre-check', render: (c) => (c.eligibility.eligible ? badge('Eligible', 'green') : badge('Not eligible', 'red')) },
          { label: 'Status', render: (c) => sbadge('claim', c.status) },
        ],
        emptyIcon: 'shieldAlert', emptyTitle: 'No claims here',
      })}</div>`;
  },
  mount({ id, query }) { if (!id && query.new && can('warranties', 'create')) { history.replaceState(null, '', '#/claims'); openClaimForm(query.new); } },
};
function claimDetail(id) {
  const c = find('claims', id); if (!c) return emptyState('shieldAlert', 'Claim not found');
  const w = find('warranties', c.warrantyId);
  const rep = c.repairId && find('repairs', c.repairId);
  const now = checkEligibility(w, c.flags);
  const closed = ['resolved', 'rejected'].includes(c.status);
  const canEdit = can('warranties', 'edit') && !closed;
  const canDecide = can('warranties', 'approve') && ['pending', 'inspection'].includes(c.status);
  const flow = ['pending', 'inspection', 'approved', 'resolved'];
  const idx = c.status === 'rejected' ? 2 : flow.indexOf(c.status);
  return pageHead(`<span class="mono">${h(c.no)}</span>`, `${c.kind === 'repair' ? 'Repair warranty claim' : 'Product warranty claim'} · ${fmtDate(c.date)} · by ${h(userName(c.createdBy))}`, '', `<a href="#/claims">Claims</a> ${icon('chevronRight', 'ic-sm')} ${h(c.no)}`) + `
    <div class="card mb"><div class="card-body"><div class="steps">${flow.map((s, i) => { const label = s === 'approved' && c.status === 'rejected' ? 'Rejected' : TONES.claim[s][0]; const cls = c.status === 'rejected' && i === 2 ? '' : i < idx ? 'done' : i === idx ? 'current' : ''; return `<span class="step ${cls}" ${c.status === 'rejected' && i === 2 ? 'style="background:var(--danger-bg);color:var(--danger)"' : ''}><span class="n">${i < idx ? '✓' : i + 1}</span>${label}</span>`; }).join('')}</div></div></div>
    <div class="grid grid-main-side"><div class="stack">
      <div class="card"><div class="card-head"><h3>Claim</h3>${sbadge('claim', c.status)}</div><div class="card-body"><dl class="dl"><dt>Reported fault</dt><dd>${h(c.fault)}</dd><dt>Notes</dt><dd>${h(c.notes || '—')}</dd><dt>Exclusions noted</dt><dd>${Object.entries(c.flags || {}).filter(([, v]) => v).map(([k]) => badge({ physical: 'Physical damage', liquid: 'Liquid damage', tampered: 'Tampered', unrelated: 'Unrelated to repair' }[k], 'red', 'no-dot')).join(' ') || 'None'}</dd><dt>Assigned to</dt><dd>${h(userName(c.assignedTo))}</dd>${c.findings ? `<dt>Inspection findings</dt><dd>${h(c.findings)}</dd>` : ''}${c.decisionNote ? `<dt>Decision</dt><dd>${h(c.decisionNote)}${c.override ? ' ' + badge('Goodwill override', 'amber') : ''}</dd>` : ''}${c.resolution ? `<dt>Resolution</dt><dd>${h({ repair: 'Repair', replacement: 'Replacement', refund: 'Refund', other: 'Other' }[c.resolution])}${c.resolutionNote ? ' — ' + h(c.resolutionNote) : ''}</dd>` : ''}${c.cost ? `<dt>Claim cost</dt><dd>${money(c.cost)}</dd>` : ''}${rep ? `<dt>Warranty repair</dt><dd><a href="#/repairs/${rep.id}">${h(rep.no)}</a> ${sbadge('repair', rep.status)}</dd>` : ''}</dl>
        ${c.photos && c.photos.length ? `<div class="photo-grid mt">${c.photos.map((p) => `<img src="${p}" alt="">`).join('')}</div>` : ''}</div></div>
      ${c.replacementId ? replacementCard(find('replacements', c.replacementId)) : ''}
      ${!closed && (canEdit || canDecide) ? `<div class="card"><div class="card-head"><h3>Process claim</h3></div><div class="card-body"><form id="cp-claim" class="form-grid" novalidate>
        ${field('Assigned to', `<select class="select" name="assignedTo">${opts(db.users.filter((u) => u.active).map((u) => [u.id, u.name]), c.assignedTo, 'Unassigned')}</select>`)}
        ${field('Next status', `<select class="select" name="status">${opts([...(c.status === 'pending' ? [['inspection', 'Under inspection']] : []), ...(canDecide ? [['approved', 'Approve claim'], ['rejected', 'Reject claim']] : []), ...(c.status === 'approved' ? [['resolved', 'Mark resolved']] : [])], '', 'Keep current status')}</select>`)}
        ${field('Inspection findings', `<textarea class="input" name="findings" rows="2">${h(c.findings)}</textarea>`, { cls: 'span-all' })}
        ${field('Decision / note', `<input class="input" name="decisionNote" value="${h(c.decisionNote)}" placeholder="Why approved / rejected">`, { cls: 'span-all' })}
        ${c.status === 'approved' ? `${field('Resolution', `<select class="select" name="resolution">${opts([['repair', 'Repair'], ['replacement', 'Replacement'], ['refund', 'Refund'], ['other', 'Other']], c.resolution, 'Select…')}</select>`)}${field('Claim cost', `<input class="input" name="cost" inputmode="decimal" value="${c.cost || ''}">`, { hint: 'Cost to the business' })}${field('Resolution note', `<input class="input" name="resolutionNote" value="${h(c.resolutionNote)}">`, { cls: 'span-all' })}` : ''}
        ${canDecide && !now.eligible ? `<label class="check span-all"><input type="checkbox" name="override"> Goodwill override — approve although the terms are not met</label>` : ''}
        <div class="span-all flex" style="justify-content:flex-end">${c.status === 'approved' && c.kind === 'product' && w.deviceId && can('warranties', 'approve') && (find('devices', w.deviceId) || {}).status === 'sold' ? `<button type="button" class="btn" data-action="claim-replace" data-id="${c.id}">${icon('swap')} Replace with new unit</button>` : ''}${c.status === 'approved' && !c.repairId && can('repairs', 'create') ? `<button type="button" class="btn" data-action="claim-repair" data-id="${c.id}">${icon('wrench')} Create free warranty repair job</button>` : ''}<button class="btn btn-primary" type="submit">${icon('check')} Save</button></div>
      </form></div></div>` : closed ? '' : `<div class="alert alert-info">${icon('lock')}<div>You can view this claim but not process it.</div></div>`}
    </div><div class="stack">
      <div class="card"><div class="card-head"><h3>Eligibility check</h3></div><div class="card-body">${now.eligible ? `<div class="alert alert-success">${icon('checkCircle')}<div>Covered by the warranty terms${w.kind === 'repair' ? ': ' + now.activeComponents.map((x) => h(x.label)).join(', ') : ''}.</div></div>` : `<div class="alert alert-danger">${icon('xCircle')}<div><ul style="margin:0;padding-left:18px">${now.reasons.map((r) => `<li>${h(r)}</li>`).join('')}</ul></div></div>`}<p class="xs muted mt-sm">Checked against the warranty terms and exclusions — not only the expiry date.</p></div></div>
      <div class="card"><div class="card-head"><h3>Warranty</h3><a class="btn btn-xs" href="#/warranties/${w.id}">Open</a></div><div class="card-body">${validityCard(w, true)}</div></div>
      <div class="card"><div class="card-head"><h3>History</h3></div><div class="card-body"><ul class="timeline">${c.history.slice().reverse().map((x) => `<li><div class="t-title">${h(x.action)}</div><div class="t-meta">${fmtDateTime(x.at)} · ${h(userName(x.userId))}</div><div class="small text-2">${h(x.note)}</div></li>`).join('')}</ul></div></div>
    </div></div>`;
}
PAGES.claims.mount = ((orig) => (args) => {
  orig(args);
  if (!args.id) return;
  const f = $('#cp-claim'); if (!f) return;
  bindForm(f, async (d) => {
    const patch = { assignedTo: d.assignedTo || null, findings: d.findings, decisionNote: d.decisionNote };
    if (d.status) patch.status = d.status;
    if ('resolution' in d && d.resolution) patch.resolution = d.resolution;
    if ('resolutionNote' in d) patch.resolutionNote = d.resolutionNote;
    if ('cost' in d) patch.cost = d.cost;
    if (d.override) patch.override = true;
    await svc.updateClaim(args.id, patch); toast('Claim updated.'); refresh();
  });
})(PAGES.claims.mount);
ACT['claim-repair'] = async (el) => { const r = await svc.claimToRepair(el.dataset.id); toast(`Warranty repair job ${r.no} created (no charge).`); location.hash = '#/repairs/' + r.id; };

/* Warranty replacement chain: defective unit -> replacement unit (both IMEIs linked) */
function replacementCard(rec, title = 'Warranty replacement') {
  if (!rec) return '';
  const oldD = find('devices', rec.oldDeviceId), newD = find('devices', rec.newDeviceId);
  const link = (d, code) => (d && can('inventory', 'view') ? `<a class="mono" href="#/imei/${d.id}">${h(code)}</a>` : `<span class="mono">${h(code)}</span>`);
  const nw = find('warranties', rec.newWarrantyId), ow = find('warranties', rec.oldWarrantyId);
  return `<div class="card"><div class="card-head"><h3>${title}</h3>${badge(rec.no, 'purple', 'no-dot')}</div><div class="card-body stack">
    <div class="grid grid-2">
      <div class="cov" style="border-color:var(--danger)"><div style="min-width:0"><div class="xs muted bold">DEFECTIVE UNIT — RETURNED</div><div class="bold small">${h(productName(rec.oldProductId))}</div>${link(oldD, rec.oldCode)}<div class="xs muted">Warranty ${ow ? `<a href="#/warranties/${ow.id}">${h(ow.no)}</a>` : ''} closed · ${oldD ? h(DEVICE_STATUS[oldD.status]) : ''}</div></div>${badge('Defective', 'red')}</div>
      <div class="cov" style="border-color:var(--success)"><div style="min-width:0"><div class="xs muted bold">REPLACEMENT UNIT — GIVEN</div><div class="bold small">${h(productName(rec.newProductId))}</div>${link(newD, rec.newCode)}<div class="xs muted">Warranty ${nw ? `<a href="#/warranties/${nw.id}">${h(nw.no)}</a> until ${fmtDate(nw.end)}` : ''}</div></div>${badge('New', 'green')}</div>
    </div>
    <div class="small text-2">${fmtDateTime(rec.at)} · by ${h(userName(rec.userId))} · ${rec.mode === 'remaining' ? 'Remaining original warranty period carried over' : `Warranty period chosen at replacement${nw ? ' — until ' + fmtDate(nw.end) : ''}`}${canSeeCost() ? ` · replacement cost ${money(rec.cost)}` : ''}${rec.note ? `<div>${h(rec.note)}</div>` : ''}</div>
  </div></div>`;
}
function openReplacementForm(claimId) {
  const c = find('claims', claimId); const w = find('warranties', c.warrantyId);
  const old = find('devices', w.deviceId); const op = find('products', old.productId);
  const prods = db.products.filter((p) => p.serialized && p.active && (p.id === op.id || p.categoryId === op.categoryId));
  let prodId = op.id, sel = null;
  const left = daysUntil(w.end);
  const stdMonths = op.warrantyMonths || w.months || 12;
  const minDate = todayISO();
  const m = openModal({
    title: `Warranty replacement — ${h(c.no)}`, size: 'lg',
    body: `<form id="rp-f" class="stack" novalidate>
      <div class="grid grid-2">
        <div class="cov" style="border-color:var(--danger)"><div style="min-width:0"><div class="xs muted bold">DEFECTIVE UNIT — COMING BACK</div><div class="bold small">${h(op.name)}</div><div class="mono">${h(deviceCode(old))}</div>${old.imei2 ? `<div class="mono xs muted">${h(old.imei2)}</div>` : ''}</div>${badge('Defective', 'red')}</div>
        <div class="cov" style="border-color:var(--success)" id="rp-new"><div><div class="xs muted bold">REPLACEMENT UNIT — TO CUSTOMER</div><div class="small muted">Scan or select below</div></div></div>
      </div>
      <div class="form-grid">
        ${field('Replacement model', `<select class="select" id="rp-prod">${opts(prods.map((p) => [p.id, `${p.name} (${stockOf(p)} in stock)`]), op.id)}</select>`, { hint: 'Same model by default. Another model of the same category can be chosen if agreed.' })}
        ${field('Scan / type the new unit\u2019s IMEI', `<div class="input-icon">${icon('scan')}<input class="input mono" id="rp-scan" placeholder="Scan IMEI barcode on the box" autocomplete="off"></div>`, { hint: 'Press Enter after typing.' })}
      </div>
      <div class="pick-list" id="rp-list" style="max-height:220px"></div>
      <div class="field" id="rp-period"><label class="req">Warranty period for the replacement unit</label>
        <span class="hint">Choose how long the new unit is covered — this is always your decision.</span>
        <div class="stack-sm mt-sm">
          <label class="check" ${left < 0 ? 'style="opacity:.5"' : ''}><input type="radio" name="mode" value="remaining" ${left < 0 ? 'disabled' : ''}> Continue the remaining original warranty — until <b>${fmtDate(w.end)}</b> ${left < 0 ? '(already ended)' : `(${left} days left)`}</label>
          <label class="check"><input type="radio" name="mode" value="months"> <input class="input input-sm" style="width:80px" name="months" id="rp-months" inputmode="numeric" value="${stdMonths}" aria-label="Months"> months from today</label>
          <label class="check"><input type="radio" name="mode" value="date"> Until <input class="input input-sm" style="width:auto" type="date" name="endDate" id="rp-date" min="${minDate}" value="${isoDate(addMonths(new Date(), stdMonths))}" aria-label="End date"></label>
        </div>
        <div class="small mt-sm" id="rp-preview"></div><span class="err">Choose the warranty period.</span></div>
      ${field('Note', '<input class="input" name="note" placeholder="e.g. Defective unit sent to supplier for RMA">')}
      <div class="alert alert-info">${icon('info')}<div class="small">Both IMEIs are linked permanently. The defective unit moves to <b>Warranty return (defective)</b> — it is not sellable and can be returned to the supplier. The original invoice ${h(w.invoiceNo)} stays unchanged and shows the swap. Warranty ${h(w.no)} closes and coverage moves to a new warranty on the replacement IMEI.</div></div>
    </form>`,
    foot: `<button class="btn" data-dismiss>Cancel</button><button class="btn btn-primary" type="submit" form="rp-f">${icon('swap')} Confirm replacement</button>`,
    onMount(el) {
      const f = $('#rp-f', el);
      const choose = (d) => {
        sel = d.id;
        $('#rp-new', el).innerHTML = `<div style="min-width:0"><div class="xs muted bold">REPLACEMENT UNIT — TO CUSTOMER</div><div class="bold small">${h(productName(d.productId))}</div><div class="mono">${h(deviceCode(d))}</div>${d.imei2 ? `<div class="mono xs muted">${h(d.imei2)}</div>` : ''}</div>${badge('New', 'green')}`;
        $$('[data-rd]', el).forEach((b) => b.style.borderColor = b.dataset.rd === sel ? 'var(--primary)' : '');
      };
      const draw = () => {
        const list = db.devices.filter((d) => d.productId === prodId && d.status === 'in_stock');
        $('#rp-list', el).innerHTML = list.map((d) => `<button type="button" class="pick" data-rd="${d.id}">${icon('phone')}<div class="grow" style="min-width:0"><div class="mono bold">${h(deviceCode(d))}</div>${d.imei2 ? `<div class="mono xs muted">${h(d.imei2)}</div>` : ''}</div>${sbadge('condition', d.condition)}</button>`).join('') || emptyState('package', 'No units of this model in stock', 'Choose another model or receive stock first.');
        $$('[data-rd]', el).forEach((b) => b.addEventListener('click', () => choose(find('devices', b.dataset.rd))));
      };
      $('#rp-prod', el).addEventListener('change', (e) => { prodId = e.target.value; sel = null; draw(); });
      $('#rp-scan', el).addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return; e.preventDefault();
        const d = findDeviceByCode(e.target.value);
        if (!d) { beep(false); toast('No unit with that IMEI / serial.', 'error'); return; }
        if (d.status !== 'in_stock') { beep(false); toast(`${deviceCode(d)} is ${DEVICE_STATUS[d.status].toLowerCase()}.`, 'error'); return; }
        if (!prods.some((p) => p.id === d.productId)) { beep(false); toast('That unit is in a different product category.', 'error'); return; }
        beep(true); prodId = d.productId; $('#rp-prod', el).value = prodId; draw(); choose(d); e.target.value = '';
      });
      draw();
      // live preview of the chosen period; typing in a box selects its option
      const preview = () => {
        const mode = ($('[name=mode]:checked', el) || {}).value;
        const months = Number($('#rp-months', el).value);
        const end = mode === 'remaining' ? w.end : mode === 'months' && months > 0 ? isoDate(addDays(addMonths(new Date(), months), -1)) : mode === 'date' ? $('#rp-date', el).value : '';
        if (mode) $('#rp-period', el).classList.remove('invalid');
        $('#rp-preview', el).innerHTML = end ? `${icon('shield', 'ic-sm')} New warranty: <b>${fmtDate(todayISO())} → ${fmtDate(end)}</b> (${daysUntil(end) + 1} days)` : '<span class="muted">No period selected yet.</span>';
      };
      $('#rp-months', el).addEventListener('focus', () => { $('[name=mode][value=months]', el).checked = true; preview(); });
      $('#rp-date', el).addEventListener('focus', () => { $('[name=mode][value=date]', el).checked = true; preview(); });
      $$('#rp-period input', el).forEach((i) => i.addEventListener('input', preview));
      $$('[name=mode]', el).forEach((i) => i.addEventListener('change', preview));
      preview();
      bindForm(f, async (d) => {
        if (!d.mode) { $('#rp-period', el).classList.add('invalid'); throw new AppError('Choose the warranty period for the replacement unit.'); }
        const rec = await svc.replaceUnderWarranty(c.id, { newDeviceId: sel, mode: d.mode, months: d.months, endDate: d.endDate, note: d.note });
        m.close();
        const nw = find('warranties', rec.newWarrantyId);
        openModal({ title: 'Replacement completed', size: 'sm',
          body: `<div class="center stack"><span class="kpi-icon tone-green" style="width:56px;height:56px;margin:0 auto;border-radius:50%">${icon('swap', 'ic-lg')}</span><div><b>${h(rec.no)}</b></div><div class="small"><span class="mono danger-text">${h(rec.oldCode)}</span> → <span class="mono success-text">${h(rec.newCode)}</span></div><div class="small muted">New warranty ${h(nw.no)} valid until ${fmtDate(nw.end)}.</div></div>`,
          foot: `${can('warranties', 'print') ? `<button class="btn" id="rp-print">${icon('printer')} Replacement warranty card</button>` : ''}<button class="btn btn-primary" data-dismiss>Done</button>`,
          onMount(e3) { const b = $('#rp-print', e3); b && b.addEventListener('click', () => printDoc(nw.no, warrantyDoc(nw))); } });
        refresh();
      });
    },
  });
}
ACT['claim-replace'] = (el) => openReplacementForm(el.dataset.id);
