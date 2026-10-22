/* Repairs: list / board, intake, job card, delivery */
'use strict';

const techs = () => db.users.filter((u) => u.active && can('repairs', 'edit', u));
const repairBoardCols = [
  { title: 'Intake', st: ['received', 'inspection'] },
  { title: 'Diagnosis & approval', st: ['diagnosed', 'awaiting_approval', 'awaiting_parts'] },
  { title: 'In repair', st: ['in_progress', 'completed', 'qc'] },
  { title: 'Ready for collection', st: ['ready'] },
  { title: 'Delivered (7 days)', st: ['delivered'], recent: true },
];
function jobCard(r) {
  const t = repairTotals(r);
  return `<a class="job-card" href="#/repairs/${r.id}"><div class="flex between"><span class="jn">${h(r.no)}</span>${isOverdue(r) ? badge('Overdue', 'red') : r.priority === 'High' ? badge('High', 'amber') : ''}</div>
    <div class="jt">${h(r.brand)} ${h(r.model)}</div><div class="xs muted truncate">${h(r.problem)}</div>
    <div class="flex between">${sbadge('repair', r.status)}<span class="xs muted">${r.technicianId ? h(userName(r.technicianId).split(' ')[0]) : 'Unassigned'}</span></div>
    <div class="flex between xs muted"><span>${h(customerName(r.customerId))}</span><span class="nowrap">${r.status === 'delivered' ? fmtDate(isoDate(new Date(r.deliveredAt))).slice(0, 6) : 'Due ' + fmtDate(r.expected).slice(0, 6)}</span></div>
    ${r.isWarrantyRepair ? badge('Warranty repair', 'purple', 'no-dot') : t.balance > 0 && r.status === 'ready' ? `<span class="xs danger-text bold">Balance ${money(t.balance)}</span>` : ''}</a>`;
}

PAGES.repairs = {
  title: 'Repairs', perm: ['repairs', 'view'],
  render({ id, query }) {
    if (id === 'new') return repairIntake(query);
    if (id) return repairDetail(id);
    const rep = visibleRepairs();
    const view = query.view || 'list';
    const tab = query.tab || 'active';
    const filters = {
      active: (r) => OPEN_REPAIR(r) && r.status !== 'ready', awaiting: (r) => ['awaiting_approval', 'awaiting_parts'].includes(r.status), ready: (r) => r.status === 'ready',
      overdue: isOverdue, delivered: (r) => r.status === 'delivered', cancelled: (r) => r.status === 'cancelled', all: () => true,
    };
    const head = pageHead('Repair Jobs', can('repairs', 'manage') ? 'All repair jobs across technicians.' : 'Showing jobs assigned to you, unassigned jobs and jobs you registered.',
      `<div class="seg" role="group" aria-label="View"><button class="${view === 'list' ? 'active' : ''}" data-action="rep-view" data-v="list">${icon('list', 'ic-sm')} List</button><button class="${view === 'board' ? 'active' : ''}" data-action="rep-view" data-v="board">${icon('columns', 'ic-sm')} Board</button></div>
      ${can('repairs', 'export') ? `<button class="btn" data-action="rep-export">${icon('download')} Export</button>` : ''}${can('repairs', 'create') ? `<a class="btn btn-primary" href="#/repairs/new">${icon('plus')} New repair job</a>` : ''}`);
    if (view === 'board') {
      const cols = repairBoardCols.map((c) => {
        const list = rep.filter((r) => c.st.includes(r.status) && (!c.recent || daysSince(r.deliveredAt) <= 7));
        return `<div class="board-col"><div class="board-col-head"><span>${c.title}</span>${badge(String(list.length), 'gray', 'no-dot')}</div><div class="board-cards">${list.map(jobCard).join('') || '<div class="xs muted center" style="padding:16px">No jobs</div>'}</div></div>`;
      }).join('');
      return head + `<div class="board">${cols}</div>`;
    }
    const tabs = tabsHtml([
      { key: 'active', label: 'In workshop', count: rep.filter(filters.active).length }, { key: 'awaiting', label: 'Awaiting approval / parts', count: rep.filter(filters.awaiting).length },
      { key: 'ready', label: 'Ready for collection', count: rep.filter(filters.ready).length }, { key: 'overdue', label: 'Overdue', count: rep.filter(filters.overdue).length },
      { key: 'delivered', label: 'Delivered', count: rep.filter(filters.delivered).length }, { key: 'cancelled', label: 'Cancelled', count: rep.filter(filters.cancelled).length }, { key: 'all', label: 'All', count: rep.length }], tab);
    return head + `<div class="card">${tabs}${dataTable('repairs-' + tab, {
      rows: () => rep.filter(filters[tab] || filters.all), rowHref: (r) => '#/repairs/' + r.id, placeholder: 'Search job no., IMEI, customer, model…',
      searchText: (r) => [r.no, r.imei, r.serial, r.brand, r.model, customerName(r.customerId), (find('customers', r.customerId) || {}).phone, r.problem].join(' '),
      filters: [
        ...(can('repairs', 'manage') ? [{ key: 'tech', label: 'All technicians', options: [['none', 'Unassigned'], ...techs().map((u) => [u.id, u.name])], fn: (r, v) => (v === 'none' ? !r.technicianId : r.technicianId === v) }] : []),
        { key: 'st', label: 'Any status', options: REPAIR_STATUSES, fn: (r, v) => r.status === v },
        { key: 'type', label: 'Any repair type', options: db.settings.repairTypes.map((t) => t.name), fn: (r, v) => r.type === v },
      ],
      columns: [
        { label: 'Job', cls: 'td-main', sort: (r) => r.receivedAt, render: (r) => `<div class="cell-main mono">${h(r.no)} ${r.isWarrantyRepair ? badge('Warranty', 'purple', 'no-dot') : ''}</div><div class="cell-sub">${fmtDateTime(r.receivedAt)}</div>`, csv: (r) => r.no },
        { label: 'Device', render: (r) => `<b>${h(r.brand)} ${h(r.model)}</b><div class="xs mono muted">${h(r.imei || r.serial)}</div>`, csv: (r) => `${r.brand} ${r.model} ${r.imei}` },
        { label: 'Customer', render: (r) => h(customerName(r.customerId)), csv: (r) => customerName(r.customerId) },
        { label: 'Problem', render: (r) => `<span class="small">${h(r.type)}</span><div class="xs muted truncate" style="max-width:220px">${h(r.problem)}</div>`, csv: (r) => r.problem },
        { label: 'Technician', render: (r) => (r.technicianId ? h(userName(r.technicianId)) : '<span class="muted">Unassigned</span>'), csv: (r) => userName(r.technicianId) },
        { label: 'Due', sort: (r) => r.expected, render: (r) => `<span class="${isOverdue(r) ? 'danger-text bold' : ''}">${fmtDate(r.expected)}</span>`, csv: (r) => r.expected },
        { label: 'Charges', cls: 'num', render: (r) => `${money(repairTotals(r).total)}${repairTotals(r).balance > 0 ? `<div class="xs danger-text">Due ${money(repairTotals(r).balance)}</div>` : ''}`, csv: (r) => repairTotals(r).total },
        { label: 'Status', render: (r) => sbadge('repair', r.status), csv: (r) => RS[r.status] },
      ],
      emptyIcon: 'wrench', emptyTitle: 'No repair jobs here',
    })}</div>`;
  },
  mount({ id, query }) { if (id === 'new') intakeMount(query); },
};
Object.assign(ACT, {
  'rep-view': (el) => setQuery({ view: el.dataset.v }),
  'rep-export': () => { need('repairs', 'export'); const k = Object.keys(DT).find((x) => x.startsWith('repairs-') && $('#dt-' + x)); k && dtExport(k, `repairs-${todayISO()}`); },
});

/* ---------------- Intake ---------------- */
let INTAKE_PHOTOS = [];
function repairIntake(query) {
  if (!can('repairs', 'create')) return emptyState('lock', 'Access restricted');
  INTAKE_PHOTOS = [];
  const accs = ['SIM tray', 'Back cover', 'Charger', 'Cable', 'Box', 'Memory card', 'Case', 'SIM card'];
  return pageHead('New repair job', 'Register the device, record its condition and get the customer\'s approval of terms.', '', `<a href="#/repairs">Repairs</a> ${icon('chevronRight', 'ic-sm')} New`) + `
  <form id="ri" novalidate class="stack">
    <div class="card"><div class="card-head"><h3>1 · Customer</h3>${can('customers', 'create') ? `<button type="button" class="btn btn-sm" data-action="ri-newcust">${icon('userPlus', 'ic-sm')} New customer</button>` : ''}</div><div class="card-body form-grid">
      ${field('Customer', `<select class="select" name="customerId" id="ri-cust" required>${opts(db.customers.slice().sort(by('name')).map((c) => [c.id, `${c.name} · ${c.phone}`]), query.customer, 'Search / select customer…')}</select>`, { req: true, hint: 'Type to jump in the list. Use “New customer” for first-time visitors.' })}
      <div id="ri-cust-info" class="field"></div>
    </div></div>
    <div class="card"><div class="card-head"><h3>2 · Device</h3></div><div class="card-body form-grid cols-4">
      ${field('IMEI', `<input class="input mono" name="imei" id="ri-imei" inputmode="numeric" maxlength="17" value="${h(query.imei && /^\d+$/.test(query.imei) ? query.imei : '')}" placeholder="15 digits — dial *#06#">`, { hint: 'Or enter a serial number below' })}
      ${field('Serial number', `<input class="input mono" name="serial" value="${h(query.imei && !/^\d+$/.test(query.imei) ? query.imei : '')}">`)}
      ${field('Brand', `<input class="input" name="brand" id="ri-brand" required list="ri-brands"><datalist id="ri-brands">${['Apple', 'Samsung', 'Xiaomi', 'OnePlus', 'Google', 'Vivo', 'Oppo', 'Realme', 'Huawei', 'Nokia', 'Motorola'].map((b) => `<option value="${b}">`).join('')}</datalist>`, { req: true })}
      ${field('Model', '<input class="input" name="model" id="ri-model" required placeholder="e.g. iPhone 13">', { req: true })}
      <div id="ri-dev-info" class="span-all"></div>
      ${field('Colour', '<input class="input" name="color">')}
      ${field('Repair type', `<select class="select" name="type">${opts(db.settings.repairTypes.map((t) => t.name), 'General service')}</select>`)}
      ${field('Priority', `<select class="select" name="priority">${opts(['Normal', 'High', 'Urgent'])}</select>`)}
      ${field('Expected completion', `<input class="input" type="date" name="expected" value="${isoDate(addDays(new Date(), 3))}" min="${todayISO()}">`)}
      <div class="field span-all"><label>Accessories received</label><div class="chips">${accs.map((a) => `<label class="check chip" style="height:auto;padding:6px 12px"><input type="checkbox" name="accessories" value="${a}"> ${a}</label>`).join('')}</div></div>
    </div></div>
    <div class="card"><div class="card-head"><h3>3 · Problem & condition</h3></div><div class="card-body form-grid">
      ${field('Customer-reported problem', '<textarea class="input" name="problem" rows="3" required placeholder="What is wrong, when it started, what happened…"></textarea>', { req: true })}
      ${field('Physical condition', '<textarea class="input" name="condition" rows="3" placeholder="Scratches, dents, screen condition, buttons…"></textarea>')}
      ${field('Existing damage (customer acknowledged)', '<input class="input" name="existingDamage" placeholder="e.g. Cracked back glass, bent frame">', { cls: 'span-all' })}
      <div class="field span-all"><label>Device photos</label><div class="photo-grid" id="ri-photos"></div><label class="btn btn-sm" style="width:max-content">${icon('camera', 'ic-sm')} Add photos<input type="file" accept="image/*" capture="environment" multiple hidden id="ri-file"></label><span class="hint">Use the camera on phones/tablets to document the device at intake.</span></div>
    </div></div>
    <div class="card"><div class="card-head"><h3>4 · Estimate, technician & approval</h3></div><div class="card-body form-grid cols-4">
      ${field('Estimated cost', '<input class="input" name="estimate" inputmode="decimal" placeholder="0 = after diagnosis">')}
      ${field('Advance payment', '<input class="input" name="advance" inputmode="decimal" placeholder="0">')}
      ${field('Advance method', `<select class="select" name="advanceMethod">${opts(db.settings.paymentMethods)}</select>`)}
      ${can('repairs', 'manage') ? field('Assign technician', `<select class="select" name="technicianId">${opts(techs().map((u) => [u.id, u.name]), '', 'Unassigned')}</select>`) : '<div></div>'}
      <div class="span-all stack-sm">
        <label class="check"><input type="checkbox" name="estimateApproved"> Customer approves the estimated cost above</label>
        <label class="check"><input type="checkbox" name="termsAccepted"> Customer accepts the repair terms (data loss, uncollected devices, warranty conditions) <span class="danger-text">*</span></label>
        <details class="small muted"><summary style="cursor:pointer">View repair terms</summary><p class="mt-sm">${h(db.settings.terms.repair)} The shop is not responsible for data loss. Devices not collected within 60 days of notification may be disposed of.</p></details>
      </div>
    </div></div>
    <div class="flex" style="justify-content:flex-end;flex-wrap:wrap"><a class="btn" href="#/repairs">Cancel</a><button class="btn btn-primary btn-lg" type="submit">${icon('check')} Create job & print receipt</button></div>
  </form>`;
}
function intakeMount() {
  const f = $('#ri'); if (!f) return;
  const custInfo = () => {
    const c = find('customers', f.customerId.value);
    $('#ri-cust-info').innerHTML = c ? `<label>Customer history</label><div class="small text-2">${db.repairs.filter((r) => r.customerId === c.id).length} previous repair(s) · ${db.devices.filter((d) => d.customerId === c.id).length} device(s) bought here${can('sales', 'view') && customerBalance(c.id) > 0 ? ` · <span class="danger-text">Balance ${money(customerBalance(c.id))}</span>` : ''}</div>` : '';
  };
  const devInfo = () => {
    const v = normId(f.imei.value || f.serial.value);
    const box = $('#ri-dev-info');
    if (v.length < 8) { box.innerHTML = ''; return; }
    const d = findDeviceByCode(v);
    const open = db.repairs.find((r) => OPEN_REPAIR(r) && r.imei && normId(r.imei) === v);
    const prev = db.repairs.filter((r) => r.imei && normId(r.imei) === v && !OPEN_REPAIR(r));
    const rws = db.warranties.filter((w) => w.kind === 'repair' && w.imei === v && ['active', 'expiring'].includes(wStatus(w)));
    const msgs = [];
    if (f.imei.value && !/^\d{15}$/.test(normId(f.imei.value))) msgs.push(`<div class="alert alert-warning">${icon('alert')}<div>IMEI should be exactly 15 digits.</div></div>`);
    if (open) msgs.push(`<div class="alert alert-danger">${icon('alert')}<div>This device already has an open job: <a href="#/repairs/${open.id}">${h(open.no)}</a> (${RS[open.status]}).</div></div>`);
    if (d) {
      const p = find('products', d.productId); const w = d.warrantyId && find('warranties', d.warrantyId);
      if (!f.brand.value) f.brand.value = p.brand; if (!f.model.value) f.model.value = p.model;
      if (d.customerId && !f.customerId.value) { f.customerId.value = d.customerId; custInfo(); }
      msgs.push(`<div class="alert alert-info">${icon('info')}<div><b>Sold by us:</b> ${h(p.name)}${d.saleId ? ` on ${h((find('sales', d.saleId) || {}).no)}` : ''}. ${w ? `Product warranty ${h(w.no)} is <b>${TONES.warranty[wStatus(w)][0].toLowerCase()}</b> (until ${fmtDate(w.end)}). ${['active', 'expiring'].includes(wStatus(w)) ? 'If this is a manufacturing defect, consider registering a <a href="#/claims?new=' + w.id + '">product warranty claim</a> instead.' : ''}` : 'No product warranty on record.'}</div></div>`);
    }
    if (rws.length) msgs.push(`<div class="alert alert-warning">${icon('shield')}<div>Active <b>repair warranty</b> ${rws.map((w) => `<a href="#/warranties/${w.id}">${h(w.no)}</a>`).join(', ')} from a previous repair. For a repeat complaint, register a <a href="#/claims?new=${rws[0].id}">repair warranty claim</a>.</div></div>`);
    if (prev.length) msgs.push(`<div class="small muted">${prev.length} previous repair(s): ${prev.map((r) => `<a href="#/repairs/${r.id}">${h(r.no)}</a> (${h(r.type)})`).join(', ')}</div>`);
    box.innerHTML = msgs.join('');
  };
  f.customerId.addEventListener('change', custInfo);
  f.imei.addEventListener('input', devInfo); f.serial.addEventListener('input', devInfo);
  custInfo(); devInfo();
  const drawPhotos = () => { $('#ri-photos').innerHTML = INTAKE_PHOTOS.map((p) => `<img src="${p}" alt="Device photo">`).join(''); };
  $('#ri-file').addEventListener('change', async (e) => {
    for (const file of [...e.target.files].slice(0, 6)) { try { INTAKE_PHOTOS.push(await readImage(file, 720)); } catch (err) { handleError(err); } }
    drawPhotos();
  });
  bindForm(f, async (d) => {
    const r = await svc.createRepair({ ...d, accessories: Array.isArray(d.accessories) ? d.accessories : d.accessories ? [$('[name=accessories]:checked', f).value] : [], estimate: Number(d.estimate) || 0, advance: Number(d.advance) || 0, photos: INTAKE_PHOTOS });
    INTAKE_PHOTOS = [];
    toast(`Repair job ${r.no} created.`);
    location.hash = '#/repairs/' + r.id;
    if (can('repairs', 'print')) setTimeout(() => printDoc(r.no, repairDoc(r, 'receipt')), 300);
  });
}
ACT['ri-newcust'] = () => openCustomerForm(null, (c) => { const s = $('#ri-cust'); s.insertAdjacentHTML('beforeend', `<option value="${c.id}">${h(c.name)} · ${h(c.phone)}</option>`); s.value = c.id; s.dispatchEvent(new Event('change')); });

/* ---------------- Job card ---------------- */
function repairDetail(id) {
  const r = find('repairs', id);
  if (!r || !visibleRepairs().includes(r)) return emptyState('lock', 'Job not available', 'It does not exist or is assigned to another technician.');
  const t = repairTotals(r);
  const open = OPEN_REPAIR(r);
  const edit = can('repairs', 'edit') && open;
  const c = find('customers', r.customerId);
  const order = REPAIR_STATUSES.filter(([k]) => k !== 'cancelled');
  const idx = order.findIndex(([k]) => k === r.status);
  const visited = new Set(r.history.map((x) => x.status));
  const optional = ['awaiting_approval', 'awaiting_parts'];
  const stepCls = (k, i) => (r.status === 'cancelled' ? (visited.has(k) ? 'done' : '') : i === idx ? 'current' : i < idx ? (optional.includes(k) && !visited.has(k) ? 'skipped' : 'done') : '');
  const steps = `<div class="steps">${order.map(([k, l], i) => { const c = stepCls(k, i); return `<span class="step ${c}" ${c === 'skipped' ? 'title="Not required for this job"' : ''}><span class="n">${c === 'done' ? '✓' : i + 1}</span>${l}</span>`; }).join('')}${r.status === 'cancelled' ? `<span class="step" style="background:var(--danger-bg);color:var(--danger)"><span class="n" style="background:var(--danger)">✕</span>Cancelled</span>` : ''}</div>`;
  const w = r.warrantyId && find('warranties', r.warrantyId);
  const parent = r.parentRepairId && find('repairs', r.parentRepairId);
  const claim = r.claimId && find('claims', r.claimId);
  const followUps = db.repairs.filter((x) => x.parentRepairId === r.id);
  const nextMap = { received: 'inspection', inspection: 'diagnosed', diagnosed: r.approval.status === 'approved' ? 'in_progress' : 'awaiting_approval', awaiting_approval: 'in_progress', awaiting_parts: 'in_progress', in_progress: 'completed', completed: 'qc', qc: 'ready' };
  const next = nextMap[r.status];
  const parts = db.products.filter((p) => p.active && !p.serialized && ['parts', 'charge', 'audio'].includes(catKind(p.categoryId)));
  const acts = [
    can('repairs', 'print') ? `<button class="btn" data-action="rep-print" data-id="${r.id}">${icon('printer')} Print…</button>` : '',
    open && can('repairs', 'cancel') ? `<button class="btn btn-ghost danger-text" data-action="rep-cancel" data-id="${r.id}">${icon('ban')} Cancel job</button>` : '',
    r.status === 'ready' && can('repairs', 'deliver') ? `<button class="btn btn-success" data-action="rep-deliver" data-id="${r.id}">${icon('handshake')} Deliver to customer</button>` : '',
  ].join('');
  return pageHead(`<span class="mono">${h(r.no)}</span> · ${h(r.brand)} ${h(r.model)}`, `${h(r.type)} · received ${fmtDateTime(r.receivedAt)} by ${h(userName(r.createdBy))}`, acts, `<a href="#/repairs">Repairs</a> ${icon('chevronRight', 'ic-sm')} ${h(r.no)}`) + `
    <div class="flex flex-wrap mb">${sbadge('repair', r.status)}${isOverdue(r) ? badge(`Overdue — due ${fmtDate(r.expected)}`, 'red') : ''}${r.priority !== 'Normal' ? badge(r.priority + ' priority', 'amber') : ''}${r.isWarrantyRepair ? badge('Warranty repair — free of charge', 'purple') : ''}${sbadge('pay', payState(t.total, t.paid))}</div>
    <div class="card mb"><div class="card-body">${steps}${stepsCompact(Math.max(0, idx), order.length, RS[r.status] || r.status, r.status === 'cancelled')}</div>
      ${open && can('repairs', 'edit') ? `<div class="card-foot" style="justify-content:flex-start"><div class="flex flex-wrap grow">
        ${next && r.status !== 'ready' ? `<button class="btn btn-primary" data-action="rep-status" data-id="${r.id}" data-st="${next}">${icon('chevronRight')} Move to “${RS[next]}”</button>` : ''}
        <select class="select input-sm" id="rep-st" style="width:auto" aria-label="Set status">${opts(REPAIR_STATUSES.filter(([k]) => !['delivered', 'cancelled', r.status].includes(k)), '', 'Set another status…')}</select>
        <input class="input input-sm grow" id="rep-st-note" placeholder="Status note (optional, visible in history)" style="min-width:180px">
        <button class="btn btn-sm" data-action="rep-status" data-id="${r.id}">Update</button></div></div>` : ''}
    </div>
    <div class="grid grid-main-side"><div class="stack">
      ${r.status === 'awaiting_approval' || (open && r.approval.status === 'pending' && r.estimate > 0) ? `<div class="alert alert-warning">${icon('alert')}<div class="grow"><b>Customer approval needed</b> for the estimate of <b>${money(r.estimate)}</b>. ${edit ? `<div class="flex flex-wrap mt-sm"><button class="btn btn-sm btn-success" data-action="rep-approve" data-id="${r.id}" data-ok="1">${icon('check', 'ic-sm')} Customer approved</button><button class="btn btn-sm" data-action="rep-approve" data-id="${r.id}" data-ok="0">${icon('x', 'ic-sm')} Customer rejected</button></div>` : ''}</div></div>` : ''}
      <div class="card"><div class="card-head"><h3>Device & intake</h3></div><div class="card-body"><div class="grid grid-2">
        <dl class="dl"><dt>Device</dt><dd>${h(r.brand)} ${h(r.model)} ${h(r.color)}</dd><dt>${r.imei ? 'IMEI' : 'Serial'}</dt><dd class="mono">${r.deviceId && can('inventory', 'view') ? `<a href="#/imei/${r.deviceId}">${h(r.imei)}</a> ${badge('Sold by us', 'blue', 'no-dot')}` : h(r.imei || r.serial)}</dd><dt>Accessories</dt><dd>${h(r.accessories.join(', ') || 'None')}</dd><dt>Expected</dt><dd>${fmtDate(r.expected)}</dd></dl>
        <dl class="dl"><dt>Problem</dt><dd>${h(r.problem)}</dd><dt>Condition</dt><dd>${h(r.condition || '—')}</dd><dt>Existing damage</dt><dd>${h(r.existingDamage || 'None noted')}</dd><dt>Terms</dt><dd>${r.termsAccepted ? badge('Accepted by customer', 'green') : badge('Not accepted', 'red')}</dd></dl></div>
        ${r.photos.length || edit ? `<hr><div class="label mb-sm">Photos & documents</div><div class="photo-grid">${r.photos.map((p) => `<img src="${p}" alt="Device photo">`).join('')}</div>${edit ? `<label class="btn btn-sm mt-sm" style="width:max-content">${icon('camera', 'ic-sm')} Add photo<input type="file" accept="image/*" capture="environment" hidden data-rep-photo="${r.id}"></label>` : ''}` : ''}
      </div></div>
      <div class="card"><div class="card-head"><h3>Diagnosis & work</h3></div><div class="card-body">
        <form id="rep-work" class="form-grid" novalidate>
          ${field('Diagnosis / work done', `<textarea class="input" name="diagnosis" rows="3" ${edit ? '' : 'readonly'}>${h(r.diagnosis)}</textarea>`, { cls: 'span-all' })}
          ${field('Internal notes', `<textarea class="input" name="notes" rows="2" ${edit ? '' : 'readonly'}>${h(r.notes)}</textarea>`, { cls: 'span-all' })}
          ${field('Technician', `<select class="select" name="technicianId" ${edit && can('repairs', 'manage') ? '' : 'disabled'}>${opts(techs().map((u) => [u.id, u.name]), r.technicianId, 'Unassigned')}</select>`, { hint: can('repairs', 'manage') ? '' : 'Only managers can reassign jobs' })}
          ${field('Expected completion', `<input class="input" type="date" name="expected" value="${r.expected}" ${edit ? '' : 'readonly'}>`)}
          ${field('Revised estimate', `<input class="input" name="estimate" inputmode="decimal" value="${r.estimate}" ${edit ? '' : 'readonly'}>`, { hint: 'Changing it resets customer approval' })}
          ${field('Repair type', `<select class="select" name="type" ${edit ? '' : 'disabled'}>${opts(db.settings.repairTypes.map((x) => x.name), r.type)}</select>`)}
          ${edit ? `<div class="span-all flex" style="justify-content:flex-end"><button class="btn btn-primary" type="submit">${icon('check')} Save work details</button></div>` : ''}
        </form></div></div>
      <div class="card"><div class="card-head"><h3>Parts & charges</h3><span class="sub">Parts are deducted from stock when issued</span></div>
        <div class="table-wrap"><table class="table rtable"><thead><tr><th>Part / service</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Amount</th><th>Part warranty</th><th></th></tr></thead><tbody>
          ${r.parts.map((p, i) => `<tr><td class="td-main" data-label="Part"><div class="cell-main">${h(p.name)}</div>${p.covered ? badge('Covered by warranty', 'purple', 'no-dot') : ''}</td><td data-label="Qty" class="num">${p.qty}</td><td data-label="Price" class="num">${money(p.price)}</td><td data-label="Amount" class="num">${p.covered ? `<s class="muted">${money(p.price * p.qty)}</s> ${money(0)}` : money(p.price * p.qty)}</td><td data-label="Warranty">${p.warrantyDays} days</td><td class="actions">${edit ? `<button class="btn btn-xs btn-ghost" data-action="rep-part-rm" data-id="${r.id}" data-i="${i}" aria-label="Return part to stock">${icon('undo', 'ic-sm')} Return</button>` : ''}</td></tr>`).join('')}
          <tr><td class="td-main" data-label="Service"><div class="cell-main">Labour — ${h(r.type)}</div>${r.laborCovered ? badge('Covered by warranty', 'purple', 'no-dot') : ''}</td><td data-label="Qty" class="num">1</td><td data-label="Rate" class="num">${money(r.labor)}</td><td data-label="Amount" class="num">${money(t.labor)}</td><td data-label="Warranty">${(db.settings.repairTypes.find((x) => x.name === r.type) || {}).laborDays ?? 0} days</td><td></td></tr>
        </tbody></table></div>
        ${edit ? `<div class="card-body" style="border-top:1px solid var(--border)"><form id="rep-part" class="form-grid cols-4" novalidate>
          ${field('Issue part from stock', `<select class="select" name="productId" required>${opts(parts.map((p) => [p.id, `${p.name} (${p.qty} in stock)`]), '', 'Select part…')}</select>`, { cls: 'span-2' })}
          ${field('Qty', '<input class="input" name="qty" value="1" inputmode="numeric">')}
          ${field('Charge price', '<input class="input" name="price" inputmode="decimal" placeholder="List price">')}
          <label class="check"><input type="checkbox" name="covered" ${r.isWarrantyRepair ? 'checked' : ''}> Covered by warranty (no charge)</label>
          <div class="span-2"></div><div class="flex" style="justify-content:flex-end"><button class="btn" type="submit">${icon('plus', 'ic-sm')} Issue part</button></div>
        </form>
        <hr><form id="rep-charges" class="form-grid cols-4" novalidate>
          ${field('Labour charge', `<input class="input" name="labor" inputmode="decimal" value="${r.labor}">`)}
          ${field('Discount', `<input class="input" name="discount" inputmode="decimal" value="${r.discount}">`)}
          ${canFinance() ? field('Technician / service cost', `<input class="input" name="techCost" inputmode="decimal" value="${r.techCost}">`, { hint: 'Internal cost, not billed' }) : '<div></div>'}
          <div class="field"><label>&nbsp;</label><label class="check"><input type="checkbox" name="laborCovered" ${r.laborCovered ? 'checked' : ''}> Labour covered by warranty</label></div>
          <div class="span-all flex" style="justify-content:flex-end"><button class="btn" type="submit">Update charges</button></div>
        </form></div>` : ''}
        <div class="cart-totals"><div class="row"><span class="muted">Parts</span><span>${money(t.parts)}</span></div><div class="row"><span class="muted">Labour</span><span>${money(t.labor)}</span></div>${r.discount ? `<div class="row"><span class="muted">Discount</span><span>−${money(r.discount)}</span></div>` : ''}${t.coveredValue ? `<div class="row"><span class="muted">Covered by warranty</span><span>${money(t.coveredValue)}</span></div>` : ''}
          <div class="row total"><span>Total charge</span><span>${money(t.total)}</span></div><div class="row"><span class="muted">Paid</span><span>${money(t.paid)}</span></div><div class="row bold ${t.balance > 0 ? 'danger-text' : ''}"><span>Balance</span><span>${money(t.balance)}</span></div>
          ${canFinance() ? `<div class="row xs muted"><span>Internal cost (parts + technician)</span><span>${money(t.cost)} · margin ${money(t.total - t.cost)}</span></div>` : ''}</div>
        ${(can('repairs', 'edit') || can('repairs', 'deliver')) && t.balance > 0 && r.status !== 'cancelled' ? `<div class="card-foot"><button class="btn btn-primary" data-action="rep-pay" data-id="${r.id}">${icon('cash')} Take payment</button></div>` : ''}
      </div>
    </div><div class="stack">
      <div class="card"><div class="card-head"><h3>Customer</h3></div><div class="card-body"><div class="flex">${avatar(c.name)}<div><div class="bold">${can('customers', 'view') ? `<a href="#/customers/${c.id}">${h(c.name)}</a>` : h(c.name)}</div><div class="small muted">${h(c.phone)}</div></div></div>
        ${r.status === 'ready' ? `<div class="alert alert-success mt">${icon('bell')}<div class="small">Ready since ${fmtDateTime(r.readyAt)}. ${Object.values(db.settings.channels).some(Boolean) ? 'Customer notified automatically.' : 'Call or message the customer to collect.'}</div></div>` : ''}</div></div>
      <div class="card"><div class="card-head"><h3>Estimate & approval</h3></div><div class="card-body"><dl class="dl"><dt>Estimate</dt><dd>${r.estimate ? money(r.estimate) : 'After diagnosis'}</dd><dt>Approval</dt><dd>${badge(r.approval.status === 'approved' ? 'Approved' : r.approval.status === 'rejected' ? 'Rejected' : 'Pending', r.approval.status === 'approved' ? 'green' : r.approval.status === 'rejected' ? 'red' : 'amber')}</dd>${r.approval.at ? `<dt>Recorded</dt><dd>${fmtDateTime(r.approval.at)}<div class="xs muted">${h(r.approval.by)}</div></dd>` : ''}</dl></div></div>
      ${w || parent || claim || followUps.length ? `<div class="card"><div class="card-head"><h3>Warranty links</h3></div><div class="card-body stack-sm small">
        ${w ? `<div>${icon('shield', 'ic-sm')} Repair warranty <a href="#/warranties/${w.id}">${h(w.no)}</a> ${sbadge('warranty', wStatus(w))}<div class="xs muted">${w.components.map((x) => `${h(x.label)}: until ${fmtDate(x.end)}`).join('<br>')}</div></div>` : ''}
        ${claim ? `<div>${icon('shieldAlert', 'ic-sm')} Created from claim <a href="#/claims/${claim.id}">${h(claim.no)}</a></div>` : ''}
        ${parent ? `<div>${icon('wrench', 'ic-sm')} Follow-up of <a href="#/repairs/${parent.id}">${h(parent.no)}</a></div>` : ''}
        ${followUps.map((x) => `<div>${icon('wrench', 'ic-sm')} Follow-up job <a href="#/repairs/${x.id}">${h(x.no)}</a> ${sbadge('repair', x.status)}</div>`).join('')}
        ${r.deviceId ? (() => { const d = find('devices', r.deviceId); const pw = d && d.warrantyId && find('warranties', d.warrantyId); return pw ? `<div>${icon('shield', 'ic-sm')} Original product warranty <a href="#/warranties/${pw.id}">${h(pw.no)}</a> ${sbadge('warranty', wStatus(pw))} <div class="xs muted">Tracked separately — not changed by this repair.</div></div>` : ''; })() : ''}
      </div></div>` : ''}
      ${r.status === 'delivered' ? `<div class="card"><div class="card-head"><h3>Delivery</h3></div><div class="card-body"><dl class="dl"><dt>Delivered</dt><dd>${fmtDateTime(r.deliveredAt)}</dd><dt>Handed over by</dt><dd>${h(userName(r.deliveredBy))}</dd><dt>Collected by</dt><dd>${h(r.collectedBy)}</dd><dt>Signature</dt><dd>${r.signature ? `<img src="${r.signature}" alt="Signature" style="height:60px;background:#fff;border-radius:6px">` : '—'}</dd></dl></div></div>` : ''}
      <div class="card"><div class="card-head"><h3>Job history</h3></div><div class="card-body"><ul class="timeline">${r.history.slice().reverse().map((x) => `<li><div class="t-title">${RS[x.status] || x.status}</div><div class="t-meta">${fmtDateTime(x.at)} · ${h(userName(x.userId))}</div><div class="small text-2">${h(x.note)}</div></li>`).join('')}</ul></div></div>
    </div></div>`;
}
PAGES.repairs.mount = ((orig) => (args) => {
  orig(args);
  const { id } = args; if (!id || id === 'new') return;
  const r = find('repairs', id); if (!r) return;
  const work = $('#rep-work');
  if (work && can('repairs', 'edit') && OPEN_REPAIR(r)) bindForm(work, async (d) => {
    const patch = { diagnosis: d.diagnosis, notes: d.notes, expected: d.expected, estimate: Number(d.estimate) || 0, type: d.type };
    if (can('repairs', 'manage')) patch.technicianId = d.technicianId || null;
    await svc.updateRepair(r.id, patch); toast('Job updated.'); refresh();
  });
  const part = $('#rep-part');
  if (part) bindForm(part, async (d) => { await svc.addRepairPart(r.id, { productId: d.productId, qty: Number(d.qty), price: d.price === '' ? undefined : Number(d.price), covered: d.covered }); toast('Part issued from stock.'); refresh(); });
  const ch = $('#rep-charges');
  if (ch) bindForm(ch, async (d) => { const patch = { labor: d.labor, discount: d.discount, laborCovered: d.laborCovered }; if (canFinance()) patch.techCost = d.techCost; await svc.updateRepair(r.id, patch, 'Charges updated'); toast('Charges updated.'); refresh(); });
  const ph = $(`[data-rep-photo="${r.id}"]`);
  if (ph) ph.addEventListener('change', async (e) => { try { const img = await readImage(e.target.files[0], 720); await svc.addRepairPhoto(id, img); toast('Photo attached.'); refresh(); } catch (err) { handleError(err); } });
})(PAGES.repairs.mount);

Object.assign(ACT, {
  'rep-status': async (el) => {
    const st = el.dataset.st || $('#rep-st').value;
    if (!st) { toast('Choose a status first.', 'warning'); return; }
    await svc.setRepairStatus(el.dataset.id, st, ($('#rep-st-note') || {}).value || '');
    toast(`Status updated: ${RS[st]}`); refresh();
  },
  'rep-approve': async (el) => {
    const r = find('repairs', el.dataset.id); const ok = el.dataset.ok === '1';
    const res = await confirmDialog({ title: ok ? 'Record customer approval' : 'Record customer rejection', message: `Estimate: <b>${money(r.estimate)}</b>. How did the customer respond?`, confirmText: ok ? 'Record approval' : 'Record rejection', danger: !ok, reason: true, reasonLabel: 'Note (e.g. “Approved by phone, 2:15pm”)', reasonRequired: false });
    if (!res) return;
    await svc.repairApproval(r.id, ok, res.reason || (ok ? 'Customer approved' : 'Customer rejected'));
    if (ok && r.status === 'awaiting_approval') await svc.setRepairStatus(r.id, 'in_progress', 'Started after customer approval');
    toast(ok ? 'Approval recorded.' : 'Rejection recorded. Cancel the job or revise the estimate.'); refresh();
  },
  'rep-part-rm': async (el) => { const ok = await confirmDialog({ title: 'Return part to stock?', message: 'The part will be removed from this job and added back to inventory.', confirmText: 'Return part' }); if (ok) { await svc.removeRepairPart(el.dataset.id, Number(el.dataset.i)); toast('Part returned to stock.'); refresh(); } },
  'rep-pay': (el) => {
    const r = find('repairs', el.dataset.id); const bal = repairTotals(r).balance;
    const m = openModal({ title: `Repair payment — ${h(r.no)}`, size: 'sm', body: `<form id="rp-form" class="stack" novalidate><div class="alert alert-info">${icon('info')}<div>Balance due: <b>${money(bal)}</b></div></div>${field('Amount', `<input class="input" name="amount" value="${bal}" inputmode="decimal" required>`, { req: true })}${field('Method', `<select class="select" name="method">${opts(db.settings.paymentMethods)}</select>`)}</form>`,
      foot: `<button class="btn" data-dismiss>Cancel</button><button class="btn btn-primary" type="submit" form="rp-form">Record payment</button>`,
      onMount(e2) { bindForm($('#rp-form', e2), async (d) => { await svc.repairPayment(r.id, d.method, Number(d.amount)); m.close(); toast('Payment recorded.'); refresh(); }); } });
  },
  'rep-cancel': async (el) => { const ok = await confirmDialog({ title: 'Cancel repair job?', message: 'Issued parts will be returned to stock. The job record is kept for history.', confirmText: 'Cancel job', danger: true, reason: true, reasonLabel: 'Cancellation reason' }); if (ok) { await svc.cancelRepair(el.dataset.id, ok.reason); toast('Job cancelled.'); refresh(); } },
  'rep-print': (el) => {
    const r = find('repairs', el.dataset.id);
    const kinds = [['receipt', 'Job receipt', 'Given to the customer at intake'], ['estimate', 'Repair estimate', 'Parts, labour and total for approval'], ['invoice', 'Repair invoice', 'Final charges and payments'], ['delivery', 'Delivery receipt', 'Hand-over record with warranty', r.status !== 'delivered']];
    const m = openModal({ title: 'Print or download', size: 'sm', body: `<div class="stack-sm">${kinds.map(([k, t, s, dis]) => `<div class="pick" style="cursor:default;${dis ? 'opacity:.5' : ''}">${icon('file')}<div class="grow"><div class="bold">${t}</div><div class="xs muted">${s}${dis ? ' — available after delivery' : ''}</div></div>${dis ? '' : `<button class="btn btn-xs" data-k="${k}">${icon('printer', 'ic-sm')} Print</button><button class="btn btn-xs" data-action="pdf" data-path="/documents/repair/${r.id}?kind=${k}" data-name="${r.no}-${k}">${icon('download', 'ic-sm')} PDF</button>`}</div>`).join('')}</div>`,
      onMount(e2) { $$('[data-k]', e2).forEach((b) => b.addEventListener('click', () => { m.close(); printDoc(`${r.no} ${b.dataset.k}`, repairDoc(r, b.dataset.k)); })); } });
  },
  'rep-deliver': (el) => {
    const r = find('repairs', el.dataset.id); const t = repairTotals(r);
    const typeDays = (db.settings.repairTypes.find((x) => x.name === r.type) || {}).laborDays ?? 30;
    const canOverride = can('warranties', 'edit');
    let pad;
    const m = openModal({ title: `Deliver ${h(r.no)} to customer`, size: 'lg',
      body: `<form id="dl-form" class="stack" novalidate>
        <div class="pay-summary"><div><div class="xs muted">Total charge</div><div class="v">${money(t.total)}</div></div><div><div class="xs muted">Paid</div><div class="v">${money(t.paid)}</div></div><div><div class="xs muted">Balance</div><div class="v ${t.balance > 0 ? 'danger-text' : 'success-text'}">${money(t.balance)}</div></div></div>
        ${t.balance > 0 ? `<div class="form-grid">${field('Collect payment now', `<input class="input" name="payment" inputmode="decimal" value="${t.balance}">`)}${field('Method', `<select class="select" name="method">${opts(db.settings.paymentMethods)}</select>`)}</div>${can('repairs', 'approve') ? '<label class="check"><input type="checkbox" name="credit"> Allow delivery with unpaid balance (customer credit) — manager approval</label>' : ''}` : ''}
        <div class="form-grid">${field('Collected by', `<input class="input" name="collectedBy" required value="${h(customerName(r.customerId))}">`, { req: true, hint: 'Name of the person collecting' })}${field('Handed over by', `<input class="input" value="${h(currentUser.name)}" readonly>`)}</div>
        <div><div class="label mb-sm">Repair warranty to register ${canOverride ? '' : '<span class="xs muted">(defaults — override needs Warranties Edit permission)</span>'}</div>
          <div class="coverage"><div class="cov"><span>Labour — ${h(r.type)}</span><span class="flex"><input class="input input-sm" style="width:80px" name="laborDays" value="${typeDays}" inputmode="numeric" ${canOverride ? '' : 'readonly'}> days</span></div>
          ${r.parts.map((p, i) => `<div class="cov"><span>${h(p.qty)} × ${h(p.name)}</span><span class="flex"><input class="input input-sm" style="width:80px" data-pd="${i}" value="${p.warrantyDays}" inputmode="numeric" ${canOverride ? '' : 'readonly'}> days</span></div>`).join('')}</div>
          <p class="xs muted mt-sm">Starts on the ${db.settings.repairWarrantyStart === 'completion' ? 'repair completion' : 'delivery'} date. This is separate from the device's original product warranty, which is not changed.</p></div>
        <div class="field"><label>Customer signature ${db.settings.requireSignature ? '<span class="danger-text">*</span>' : ''}</label><canvas class="sign-pad" id="dl-sig" aria-label="Signature pad"></canvas><div><button type="button" class="btn btn-xs" id="dl-clear">Clear</button></div></div>
        <label class="check"><input type="checkbox" name="confirm"> Customer has checked the device, confirms it works and all accessories (${h(r.accessories.join(', ') || 'none')}) were returned</label>
      </form>`,
      foot: `<button class="btn" data-dismiss>Cancel</button><button class="btn btn-success" type="submit" form="dl-form">${icon('handshake')} Confirm delivery</button>`,
      onMount(e2) {
        pad = signaturePad($('#dl-sig', e2));
        $('#dl-clear', e2).addEventListener('click', () => pad.clear());
        bindForm($('#dl-form', e2), async (d) => {
          const res = await svc.deliverRepair(r.id, { collectedBy: d.collectedBy, confirm: d.confirm, signature: pad.data(), payment: Number(d.payment) || 0, method: d.method, credit: d.credit, laborDays: d.laborDays, partDays: $$('[data-pd]', e2).map((i) => i.value) });
          m.close();
          const w = res.warrantyId && find('warranties', res.warrantyId);
          openModal({ title: 'Device delivered', size: 'sm', body: `<div class="center stack"><span class="kpi-icon tone-green" style="width:56px;height:56px;margin:0 auto;border-radius:50%">${icon('check', 'ic-lg')}</span><div><b>${h(res.no)}</b> handed over to ${h(res.collectedBy)}.</div>${w ? `<div class="small">Repair warranty <b>${h(w.no)}</b> registered until ${fmtDate(warrantyEnd(w))}.</div>` : '<div class="small muted">No repair warranty applies to this service.</div>'}</div>`,
            foot: `${can('repairs', 'print') ? `<button class="btn" id="dd-p">${icon('printer')} Delivery receipt</button>` : ''}${w && can('warranties', 'print') ? `<button class="btn" id="dd-w">${icon('shield')} Warranty card</button>` : ''}<button class="btn btn-primary" data-dismiss>Done</button>`,
            onMount(e3) { const a = $('#dd-p', e3); a && a.addEventListener('click', () => printDoc(res.no, repairDoc(res, 'delivery'))); const b = $('#dd-w', e3); b && b.addEventListener('click', () => printDoc(w.no, warrantyDoc(w))); } });
          refresh();
        });
      } });
  },
});
