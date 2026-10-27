/* =========================================================
   UI toolkit: badges, modals, confirm, toast, forms, data tables,
   charts, CSV export, signature pad, image reader, print documents.
   ========================================================= */
'use strict';

/* ---------------- Badges ---------------- */
const TONES = {
  sale: { completed: ['Completed', 'green'], partially_refunded: ['Partly refunded', 'amber'], refunded: ['Refunded', 'gray'], cancelled: ['Cancelled', 'red'] },
  device: { in_stock: ['In stock', 'green'], sold: ['Sold', 'blue'], returned: ['Returned', 'amber'], damaged: ['Damaged', 'red'], missing: ['Missing', 'red'], repair: ['Under repair', 'purple'], supplier_return: ['Returned to supplier', 'gray'], warranty_return: ['Warranty return (defective)', 'purple'] },
  repair: { received: ['Received', 'gray'], inspection: ['Inspection Pending', 'cyan'], diagnosed: ['Diagnosis Completed', 'cyan'], awaiting_approval: ['Awaiting Approval', 'amber'], awaiting_parts: ['Awaiting Parts', 'amber'], in_progress: ['In Progress', 'blue'], completed: ['Repair Completed', 'purple'], qc: ['Quality Check', 'purple'], ready: ['Ready for Collection', 'green'], delivered: ['Delivered', 'gray'], cancelled: ['Cancelled', 'red'] },
  warranty: { active: ['Active', 'green'], expiring: ['Expiring soon', 'amber'], expired: ['Expired', 'red'], void: ['Void', 'gray'], replaced: ['Replaced (unit swapped)', 'purple'] },
  claim: { pending: ['Pending', 'amber'], inspection: ['Under inspection', 'cyan'], approved: ['Approved', 'blue'], rejected: ['Rejected', 'red'], resolved: ['Resolved', 'green'] },
  purchase: { ordered: ['Ordered (PO)', 'amber'], received: ['Received', 'green'], cancelled: ['Cancelled', 'red'] },
  stock: { ok: ['In stock', 'green'], low: ['Low stock', 'amber'], out: ['Out of stock', 'red'] },
  pay: { paid: ['Paid', 'green'], partial: ['Partly paid', 'amber'], unpaid: ['Unpaid', 'red'], none: ['No charge', 'gray'] },
  adj: { pending: ['Pending approval', 'amber'], approved: ['Approved', 'green'], rejected: ['Rejected', 'red'] },
  condition: { new: ['New', 'blue'], used: ['Used', 'amber'], refurbished: ['Refurbished', 'purple'], damaged: ['Damaged', 'red'], under_repair: ['Under repair', 'cyan'] },
};
function badge(text, tone = 'gray', cls = '') { return `<span class="badge badge-${tone} ${cls}">${h(text)}</span>`; }
function sbadge(type, value) { const t = (TONES[type] || {})[value] || [value, 'gray']; return badge(t[0], t[1]); }
function payState(total, paid) { if (total <= 0) return 'none'; if (paid >= total - 0.001) return 'paid'; if (paid > 0) return 'partial'; return 'unpaid'; }

/* ---------------- Small render helpers ---------------- */
/**
 * KPI card. Optional: trend (% change → green ▲ / red ▼ pill), trendLabel, spark (numbers → small trend line).
 */
function kpi({ label, value, icon: ic, tone = 'blue', foot = '', href = '', trend = null, trendLabel = '', spark = null }) {
  const tag = href ? 'a' : 'div';
  const hasTrend = trend !== null && Number.isFinite(Number(trend));
  const trendHtml = hasTrend ? `<span class="trend ${trend > 0 ? 'up' : trend < 0 ? 'down' : 'flat'}">${trend > 0 ? '▲' : trend < 0 ? '▼' : '•'} ${Math.abs(trend)}%</span>${trendLabel ? `<span>${h(trendLabel)}</span>` : ''}` : '';
  return `<${tag} class="kpi kpi-${tone}" ${href ? `href="${href}"` : ''}>
    <div class="kpi-top"><span class="kpi-icon tone-${tone}">${icon(ic)}</span><span class="kpi-label">${h(label)}</span>${href ? `<span class="kpi-go" aria-hidden="true">${icon('chevronRight', 'ic-sm')}</span>` : ''}</div>
    <div class="kpi-value">${value}</div>
    ${spark && spark.length > 1 ? sparkline(spark) : ''}
    ${foot || hasTrend ? `<div class="kpi-foot">${trendHtml}${foot ? `<span>${foot}</span>` : ''}</div>` : ''}
  </${tag}>`;
}
/** Tiny single-series trend line for KPI cards (accent colour, no axes). */
function sparkline(values) {
  const max = Math.max(...values), min = Math.min(...values, 0), span = max - min || 1;
  const pts = values.map((v, i) => [((i / (values.length - 1)) * 100).toFixed(2), (30 - ((v - min) / span) * 26 - 2).toFixed(2)]);
  const line = pts.map((p) => p.join(',')).join(' ');
  return `<svg class="kpi-spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true"><polygon points="0,32 ${line} 100,32" class="area"/><polyline points="${line}" class="line" vector-effect="non-scaling-stroke"/></svg>`;
}
function emptyState(ic, title, text = '', action = '') {
  return `<div class="empty">${icon(ic)}<h4>${h(title)}</h4>${text ? `<p class="small">${h(text)}</p>` : ''}${action ? `<div class="mt-sm">${action}</div>` : ''}</div>`;
}
function avatar(name, cls = '') { return `<span class="avatar ${cls}" style="background:${colorFor(name)}">${h(initials(name))}</span>`; }
function thumb(p) {
  if (p && p.image) return `<span class="thumb"><img src="${p.image}" alt=""></span>`;
  const cat = p && db.categories.find((c) => c.id === p.categoryId);
  const col = cat ? cat.color : '#64748b';
  if (!p) return `<span class="thumb" style="background:${col}1a;color:${col}">${icon('package', 'ic-sm')}</span>`;
  return `<span class="thumb thumb-art" style="background:${col}14">${productArt(p)}</span>`;
}
function pageHead(title, sub = '', actions = '', crumbs = '') {
  return `<div class="page-head"><div>${crumbs ? `<div class="crumbs">${crumbs}</div>` : ''}<h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>${actions ? `<div class="btn-group">${actions}</div>` : ''}</div>`;
}
function tabsHtml(tabs, active, action = 'tab') {
  return `<div class="tabs" role="tablist">${tabs.map((t) => `<button class="tab ${t.key === active ? 'active' : ''}" role="tab" data-action="${action}" data-tab="${t.key}">${t.label}${t.count !== undefined ? `<span class="count">${t.count}</span>` : ''}</button>`).join('')}</div>`;
}
function opts(list, selected, placeholder) {
  return (placeholder !== undefined ? `<option value="">${h(placeholder)}</option>` : '') + list.map((o) => {
    const [v, l] = Array.isArray(o) ? o : [o, o];
    return `<option value="${h(v)}" ${String(v) === String(selected ?? '') ? 'selected' : ''}>${h(l)}</option>`;
  }).join('');
}
function field(label, inner, { req = false, hint = '', cls = '' } = {}) {
  return `<div class="field ${cls}"><label class="${req ? 'req' : ''}">${label}</label>${inner}${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
}
const linkTo = (href, text) => `<a href="${href}">${h(text)}</a>`;

/** Compact progress for phones: "Step 9 of 10 · Ready for Collection" with a bar. */
function stepsCompact(index, total, label, cancelled = false) {
  const pct = cancelled ? 100 : Math.round(((index + 1) / total) * 100);
  return `<div class="steps-compact"><div class="flex between small"><b>${cancelled ? 'Cancelled' : `Step ${index + 1} of ${total}`}</b><span class="text-2">${h(label)}</span></div><div class="progress mt-sm"><div style="width:${pct}%;${cancelled ? 'background:var(--danger)' : ''}"></div></div></div>`;
}

/* ---------------- Toast ---------------- */
function toast(msg, type = 'success', ms = 3800) {
  const root = $('#toast-root');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `${icon(type === 'error' ? 'xCircle' : type === 'warning' ? 'alert' : type === 'info' ? 'info' : 'checkCircle')}<div class="grow">${h(msg)}</div>`;
  root.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, ms);
}
function handleError(e) {
  console.error(e);
  toast(e && e.message ? e.message : 'Something went wrong.', 'error', 5200);
}

/* ---------------- Modal ---------------- */
function openModal({ title, body, foot = '', size = '', onMount, onClose }) {
  const root = $('#modal-root');
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal ${size ? 'modal-' + size : ''}" role="dialog" aria-modal="true" aria-label="${h(String(title).replace(/<[^>]+>/g, ''))}">
    <div class="modal-head"><h3>${title}</h3><button type="button" class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
    <div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div>`;
  root.appendChild(wrap);
  document.body.style.overflow = 'hidden';
  const m = {
    el: wrap,
    close() { wrap.remove(); if (!root.children.length) document.body.style.overflow = ''; onClose && onClose(); },
    setBody(html) { wrap.querySelector('.modal-body').innerHTML = html; },
  };
  wrap.querySelector('[data-close]').addEventListener('click', m.close);
  wrap.querySelectorAll('[data-dismiss]').forEach((b) => b.addEventListener('click', m.close));
  onMount && onMount(wrap, m);
  const f = wrap.querySelector('[autofocus]') || wrap.querySelector('.modal-body input:not([type=hidden]):not([type=checkbox]):not([readonly]), .modal-body select, .modal-body textarea');
  if (f && window.matchMedia('(min-width: 721px)').matches) setTimeout(() => f.focus(), 60);
  return m;
}
function closeTopModal() { const root = $('#modal-root'); const last = root.lastElementChild; if (last) last.querySelector('[data-close]').click(); }

function confirmDialog({ title = 'Are you sure?', message = '', confirmText = 'Confirm', danger = false, reason = false, reasonLabel = 'Reason', reasonRequired = true }) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({
      title, size: 'sm',
      body: `<div class="stack"><div class="flex" style="align-items:flex-start;gap:12px"><span class="kpi-icon ${danger ? 'tone-red' : 'tone-blue'}">${icon(danger ? 'alert' : 'info')}</span><div class="grow text-2">${message}</div></div>
        ${reason ? `<div class="field"><label class="${reasonRequired ? 'req' : ''}">${h(reasonLabel)}</label><textarea class="input" id="cf-reason" rows="3"></textarea><span class="err">Please enter a ${h(reasonLabel.toLowerCase())}.</span></div>` : ''}</div>`,
      foot: `<button class="btn" data-dismiss>Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="cf-ok">${h(confirmText)}</button>`,
      onMount(el, modal) {
        el.querySelector('#cf-ok').addEventListener('click', () => {
          const r = el.querySelector('#cf-reason');
          if (r && reasonRequired && r.value.trim().length < 3) { r.closest('.field').classList.add('invalid'); r.focus(); return; }
          done = true; modal.close(); resolve({ reason: r ? r.value.trim() : '' });
        });
      },
      onClose() { if (!done) resolve(null); },
    });
    return m;
  });
}

/* ---------------- Forms ---------------- */
function formObj(form) {
  const o = {};
  $$('[name]', form).forEach((el) => {
    const n = el.name;
    if (el.type === 'checkbox') {
      const group = $$(`[name="${n}"]`, form);
      if (group.length > 1) { o[n] = o[n] || []; if (el.checked) o[n].push(el.value); }
      else o[n] = el.checked;
    } else if (el.type === 'radio') { if (el.checked) o[n] = el.value; }
    else if (el.type !== 'file') o[n] = el.value.trim ? el.value.trim() : el.value;
  });
  return o;
}
function showFormError(form, e) {
  let box = form.querySelector('.form-error');
  if (!box) { box = document.createElement('div'); box.className = 'form-error'; form.prepend(box); }
  box.innerHTML = `<div class="alert alert-danger mb">${icon('alert')}<div>${h(e.message || e)}</div></div>`;
  box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  if (!(e instanceof AppError)) console.error(e);
}
function bindForm(form, handler) {
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (form.dataset.busy) return; // no double submits while the server is working
    const box = form.querySelector('.form-error'); if (box) box.innerHTML = '';
    $$('.field.invalid', form).forEach((f) => f.classList.remove('invalid'));
    const missing = $$('[required]', form).filter((el) => !String(el.value).trim());
    if (missing.length) { missing.forEach((el) => el.closest('.field') && el.closest('.field').classList.add('invalid')); showFormError(form, new AppError('Please fill in the highlighted required fields.')); missing[0].focus(); return; }
    const btns = [...$$('button[type=submit]', form), ...(form.id ? $$(`button[form="${form.id}"]`) : [])];
    form.dataset.busy = '1';
    btns.forEach((b) => { b.disabled = true; b.classList.add('is-busy'); });
    try { await handler(formObj(form), form); }
    catch (e) { showFormError(form, e); }
    finally { delete form.dataset.busy; btns.forEach((b) => { b.disabled = false; b.classList.remove('is-busy'); }); }
  });
}
function readImage(file, max = 640) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) return reject(new AppError('Please choose an image file.'));
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.78));
      };
      img.onerror = () => reject(new AppError('Could not read that image.'));
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
function signaturePad(canvas) {
  const ctx = canvas.getContext('2d');
  let drawing = false, dirty = false;
  const fit = () => { const r = canvas.getBoundingClientRect(); canvas.width = r.width * devicePixelRatio; canvas.height = r.height * devicePixelRatio; ctx.scale(devicePixelRatio, devicePixelRatio); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.strokeStyle = getComputedStyle(document.body).color; };
  setTimeout(fit, 30);
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener('pointerdown', (e) => { drawing = true; dirty = true; canvas.setPointerCapture(e.pointerId); const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); });
  canvas.addEventListener('pointermove', (e) => { if (!drawing) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); });
  canvas.addEventListener('pointerup', () => { drawing = false; });
  return { clear() { ctx.clearRect(0, 0, canvas.width, canvas.height); dirty = false; }, data() { return dirty ? canvas.toDataURL('image/png') : null; } };
}

/* ---------------- Data table ---------------- */
const DT = {};
function dataTable(id, cfg) {
  const prev = DT[id];
  DT[id] = { cfg, q: prev ? prev.q : (cfg.q || ''), page: prev ? prev.page : 1, sort: prev ? prev.sort : (cfg.sort || null), filters: prev ? prev.filters : { ...(cfg.initialFilters || {}) } };
  const s = DT[id];
  const filters = (cfg.filters || []).map((f) => `<select class="select input-sm" data-dt-filter="${id}" data-key="${f.key}" aria-label="${h(f.label)}">${opts(f.options, s.filters[f.key], f.label)}</select>`).join('');
  const toolbar = cfg.search === false && !filters && !cfg.toolbar ? '' : `<div class="dt-toolbar">
    ${cfg.search !== false ? `<div class="input-icon">${icon('search')}<input type="search" class="input input-sm" placeholder="${h(cfg.placeholder || 'Search…')}" data-dt-search="${id}" value="${h(s.q)}" aria-label="Search"></div>` : ''}
    ${filters}${cfg.toolbar || ''}</div>`;
  return `<div class="dt" id="dt-${id}">${toolbar}<div id="dtb-${id}">${dtBody(id)}</div></div>`;
}
function dtRows(id) {
  const s = DT[id], c = s.cfg;
  let rows = c.rows();
  if (s.q) {
    const terms = s.q.toLowerCase().split(/\s+/).filter(Boolean);
    rows = rows.filter((r) => { const t = (c.searchText ? c.searchText(r) : '').toLowerCase(); return terms.every((q) => t.includes(q)); });
  }
  (c.filters || []).forEach((f) => { const v = s.filters[f.key]; if (v) rows = rows.filter((r) => f.fn(r, v)); });
  if (s.sort) {
    const col = c.columns[s.sort.i];
    if (col && col.sort) rows = [...rows].sort((a, b) => { const x = col.sort(a), y = col.sort(b); return (x > y ? 1 : x < y ? -1 : 0) * s.sort.dir; });
  }
  return rows;
}
function dtBody(id) {
  const s = DT[id], c = s.cfg;
  const rows = dtRows(id);
  const size = c.pageSize || 12;
  const pages = Math.max(1, Math.ceil(rows.length / size));
  if (s.page > pages) s.page = pages;
  const slice = c.paginate === false ? rows : rows.slice((s.page - 1) * size, s.page * size);
  if (!rows.length) return emptyState(c.emptyIcon || 'search', c.emptyTitle || 'No records found', s.q || Object.values(s.filters).some(Boolean) ? 'Try a different search or clear the filters.' : (c.emptyText || ''), c.emptyAction || '');
  const head = c.columns.map((col, i) => {
    const sorted = s.sort && s.sort.i === i;
    return `<th class="${col.cls || ''} ${col.sort ? 'sortable' : ''}" ${col.sort ? `data-action="dt-sort" data-dt="${id}" data-i="${i}" aria-sort="${sorted ? (s.sort.dir > 0 ? 'ascending' : 'descending') : 'none'}"` : ''}>${col.label}${col.sort ? `<span class="sort">${sorted ? (s.sort.dir > 0 ? '▲' : '▼') : '↕'}</span>` : ''}</th>`;
  }).join('');
  const body = slice.map((r) => `<tr ${c.rowHref ? `class="clickable" data-action="go" data-href="${c.rowHref(r)}"` : c.rowAction ? `class="clickable" data-action="${c.rowAction}" data-id="${r.id}"` : ''}>${c.columns.map((col) => `<td data-label="${h(col.label)}" class="${col.cls || ''}">${col.render(r)}</td>`).join('')}</tr>`).join('');
  const foot = c.footer ? `<tfoot><tr>${c.footer(rows).map((v, i) => `<td data-label="${h(c.columns[i] ? c.columns[i].label : '')}" class="${(c.columns[i] || {}).cls || ''}">${v}</td>`).join('')}</tr></tfoot>` : '';
  const pager = c.paginate === false || rows.length <= size ? (c.showCount !== false ? `<div class="dt-foot"><span>${rows.length} record${rows.length === 1 ? '' : 's'}</span></div>` : '') : `<div class="dt-foot"><span>Showing ${(s.page - 1) * size + 1}–${Math.min(s.page * size, rows.length)} of ${rows.length}</span>
    <div class="pager"><button class="btn btn-sm btn-icon" data-action="dt-page" data-dt="${id}" data-p="${s.page - 1}" ${s.page <= 1 ? 'disabled' : ''} aria-label="Previous page">${icon('chevronLeft')}</button><span class="small">Page ${s.page} / ${pages}</span><button class="btn btn-sm btn-icon" data-action="dt-page" data-dt="${id}" data-p="${s.page + 1}" ${s.page >= pages ? 'disabled' : ''} aria-label="Next page">${icon('chevronRight')}</button></div></div>`;
  return `<div class="table-wrap"><table class="table rtable"><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table></div>${pager}`;
}
function dtRefresh(id) { const el = $('#dtb-' + id); if (el && DT[id]) el.innerHTML = dtBody(id); }
function dtExport(id, filename) {
  const s = DT[id]; const rows = dtRows(id);
  const cols = s.cfg.columns.filter((c) => c.csv);
  exportCSV(filename, cols.map((c) => c.label), rows.map((r) => cols.map((c) => c.csv(r))));
}
function exportCSV(filename, headers, rows) {
  const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = '﻿' + [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename.endsWith('.csv') ? filename : filename + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`Exported ${rows.length} rows to ${a.download} (opens in Excel)`, 'success');
}

/* ---------------- Charts ---------------- */
function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
function shortNum(v) { return v >= 1e6 ? (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(v >= 1e4 ? 0 : 1) + 'K' : String(Math.round(v)); }
function barChart(points, { fmt = money, labelEvery = 1, highlightLast = true } = {}) {
  const max = niceMax(Math.max(...points.map((p) => p.value), 0));
  const grid = [1, 0.75, 0.5, 0.25, 0].map((f) => `<div><span>${shortNum(max * f)}</span></div>`).join('');
  const bars = points.map((p, i) => `<div class="bar-col ${highlightLast && i === points.length - 1 ? 'today' : ''}" data-tip="${h(p.tip || p.label)}\n${h(fmt(p.value))}"><div class="bar" style="height:${Math.max(0.5, (p.value / max) * 100)}%"></div></div>`).join('');
  const labels = points.map((p, i) => `<span>${i % labelEvery === 0 || i === points.length - 1 ? h(p.label) : ''}</span>`).join('');
  return `<div class="bars" role="img" aria-label="Bar chart">${`<div class="bars-grid">${grid}</div>`}${bars}</div><div class="bar-labels">${labels}</div>`;
}
function hbarList(rows, { fmt = (v) => v } = {}) {
  if (!rows.length) return emptyState('chart', 'No data for this period');
  const max = Math.max(...rows.map((r) => r.value), 1);
  return `<div class="hbars">${rows.map((r) => `<div class="hbar" data-tip="${h(r.label)}\n${h(fmt(r.value))}${r.extra ? '\n' + h(r.extra) : ''}"><span class="truncate">${h(r.label)}</span><div class="hbar-track"><div class="hbar-fill" style="width:${(r.value / max) * 100}%"></div></div><span class="v">${h(r.display ?? fmt(r.value))}</span></div>`).join('')}</div>`;
}

/* ---------------- Printing ---------------- */
const PRINT_CSS = `
  *{box-sizing:border-box} body{font-family:Inter,system-ui,Segoe UI,Arial,sans-serif;color:#0f172a;margin:0;padding:28px;font-size:12.5px;line-height:1.45}
  h1{font-size:20px;margin:0} h2{font-size:15px;margin:0 0 6px} .muted{color:#64748b} .right{text-align:right} .center{text-align:center}
  .head{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #29abe2;padding-bottom:14px;margin-bottom:16px}
  .brand{display:flex;gap:12px;align-items:center} .logo{width:42px;height:42px;border-radius:10px;background:linear-gradient(135deg,#29abe2 45%,#39b54a);color:#161616;display:grid;place-items:center;font-weight:800;font-size:16px}
  .doc-title{font-size:18px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:14px}
  .box{border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px} .box h4{margin:0 0 4px;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:#64748b}
  table{width:100%;border-collapse:collapse;margin:8px 0} th{background:#f1f5f9;text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;padding:7px 8px;border-bottom:1px solid #cbd5e1}
  td{padding:7px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top} .num{text-align:right;white-space:nowrap}
  .totals{margin-left:auto;width:300px} .totals td{border:0;padding:4px 8px} .totals .grand td{font-size:15px;font-weight:800;border-top:2px solid #161616;padding-top:8px}
  .mono{font-family:Consolas,monospace;font-size:11.5px} .tag{display:inline-block;padding:2px 8px;border-radius:999px;background:#e3f5e5;color:#1d6a28;font-size:10.5px;font-weight:700}
  .terms{font-size:10.5px;color:#475569;border-top:1px dashed #cbd5e1;padding-top:10px;margin-top:16px}
  .sign{display:flex;justify-content:space-between;gap:30px;margin-top:40px} .sign div{flex:1;border-top:1px solid #94a3b8;padding-top:6px;text-align:center;color:#64748b;font-size:11px}
  .cert{border:3px double #29abe2;border-radius:14px;padding:26px} .big{font-size:22px;font-weight:800}
  .ok{color:#15803d} .bad{color:#b91c1c} .stamp{display:inline-block;border:2px solid currentColor;border-radius:8px;padding:4px 12px;font-weight:800;letter-spacing:.06em}
  @page{margin:12mm} @media print{body{padding:0}}`;
function printDoc(title, html) {
  const ifr = document.createElement('iframe');
  ifr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(ifr);
  const d = ifr.contentDocument;
  d.open(); d.write(`<!doctype html><html><head><meta charset="utf-8"><title>${h(title)}</title><style>${PRINT_CSS}</style></head><body>${html}</body></html>`); d.close();
  setTimeout(() => { ifr.contentWindow.focus(); ifr.contentWindow.print(); setTimeout(() => ifr.remove(), 1500); }, 250);
}
function docHeader(docTitle, meta) {
  const s = db.settings;
  return `<div class="head"><div class="brand"><div class="logo">${h(initials(s.shopName))}</div><div><h1>${h(s.shopName)}</h1><div class="muted">${h(s.address)} · ${h(s.phone)}</div><div class="muted">${h(s.email)} · Tax ID ${h(s.taxId)}</div></div></div>
    <div class="right"><div class="doc-title">${docTitle}</div>${meta}</div></div>`;
}
function docCustomer(cid, extra = '') {
  const c = find('customers', cid);
  return `<div class="box"><h4>Customer</h4><b>${h(c ? c.name : 'Walk-in customer')}</b>${c ? `<div>${h(c.phone)}${c.email ? ' · ' + h(c.email) : ''}</div><div class="muted">${h(c.address || '')}</div><div class="muted">ID ${h(c.code)}</div>` : ''}${extra}</div>`;
}

function invoiceDoc(s) {
  const t = saleTotals(s);
  const rows = s.items.map((it, i) => {
    const w = it.warrantyId && find('warranties', it.warrantyId);
    return `<tr><td>${i + 1}</td><td><b>${h(it.name)}</b>${it.code ? `<div class="mono">IMEI/SN: ${h(it.code)}</div>` : ''}${w ? `<div class="muted">Warranty ${h(w.no)}: ${w.months} months ${h(w.provider)} — until ${fmtDate(w.end)}${w.status === 'void' ? ' (VOID)' : ''}</div>` : ''}${it.returnedQty ? `<div class="bad">Returned: ${it.returnedQty}</div>` : ''}</td>
      <td class="num">${it.qty}</td><td class="num">${money(it.price)}</td><td class="num">${it.discount ? money(it.discount) : '—'}</td><td class="num">${money(it.lineTotal)}</td></tr>`;
  }).join('');
  const pays = s.payments.map((p) => `<tr><td>${fmtDateTime(p.at)}</td><td>${h(p.method)}${p.ref ? ' · ' + h(p.ref) : ''}</td><td class="num">${money(p.amount)}</td></tr>`).join('');
  return `${docHeader(showVat(s) ? 'Tax Invoice' : 'Invoice', `<div class="mono"><b>${h(s.no)}</b></div><div>${fmtDateTime(s.at)}</div><div class="muted">Served by ${h(userName(s.userId))}</div>${s.status !== 'completed' ? `<div class="stamp bad">${h(TONES.sale[s.status][0])}</div>` : ''}`)}
    <div class="grid2">${docCustomer(s.customerId)}<div class="box"><h4>Payment status</h4><div class="big ${t.balance > 0 ? 'bad' : 'ok'}">${t.balance > 0 ? 'Balance ' + money(t.balance) : 'PAID'}</div><div class="muted">Paid ${money(t.paid)} of ${money(t.net)}</div></div></div>
    <table><thead><tr><th>#</th><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Disc.</th><th class="num">Amount</th></tr></thead><tbody>${rows}</tbody></table>
    ${(s.replacements || []).length ? `<div class="box" style="margin-bottom:8px"><h4>Warranty replacements</h4>${s.replacements.map((x) => `${fmtDate(isoDate(new Date(x.at)))}: defective <span class="mono">${h(x.oldCode)}</span> replaced by <span class="mono">${h(x.newCode)}</span> (${h(x.no)}, warranty ${h(x.warrantyNo)})`).join('<br>')}</div>` : ''}
    <table class="totals"><tr><td>Subtotal</td><td class="num">${money(s.subtotal)}</td></tr>${s.discount ? `<tr><td>${discountLabel(s)}</td><td class="num">−${money(s.discount)}</td></tr>` : ''}
      ${showVat(s) ? `<tr><td>${h(db.settings.taxName)} ${pctText(vatRateOf(s))} ${s.taxInclusive ? '(included)' : ''}</td><td class="num">${money(s.tax)}</td></tr>` : ''}
      ${t.returned ? `<tr><td>Returns</td><td class="num">−${money(t.returned)}</td></tr>` : ''}
      <tr class="grand"><td>Total</td><td class="num">${money(t.net)}</td></tr>${s.change ? `<tr><td>Change given</td><td class="num">${money(s.change)}</td></tr>` : ''}</table>
    <h2>Payments</h2><table><thead><tr><th>Date</th><th>Method</th><th class="num">Amount</th></tr></thead><tbody>${pays || '<tr><td colspan="3" class="muted">No payments</td></tr>'}</tbody></table>
    <div class="terms"><b>Warranty terms:</b> ${h(db.settings.terms.product)}<br><br>${h(db.settings.invoiceFooter)}</div>
    <div class="sign"><div>Customer signature</div><div>Authorised signature</div></div>`;
}
function quoteDoc(q) {
  const rows = q.items.map((it, i) => `<tr><td>${i + 1}</td><td>${h(it.name)}</td><td class="num">${it.qty}</td><td class="num">${money(it.price)}</td><td class="num">${money(it.lineTotal)}</td></tr>`).join('');
  return `${docHeader('Quotation', `<div class="mono"><b>${h(q.no)}</b></div><div>${fmtDate(q.date)}</div><div class="muted">Valid until ${fmtDate(q.validUntil)}</div>`)}
    <div class="grid2">${docCustomer(q.customerId)}<div class="box"><h4>Prepared by</h4>${h(userName(q.userId))}${q.note ? `<div class="muted">${h(q.note)}</div>` : ''}</div></div>
    <table><thead><tr><th>#</th><th>Item</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead><tbody>${rows}</tbody></table>
    <table class="totals"><tr><td>Subtotal</td><td class="num">${money(q.subtotal)}</td></tr>${q.discount ? `<tr><td>${discountLabel(q)}</td><td class="num">−${money(q.discount)}</td></tr>` : ''}${showVat(q) ? `<tr><td>${h(db.settings.taxName)} ${pctText(vatRateOf(q))} ${db.settings.taxInclusive ? '(included)' : ''}</td><td class="num">${money(q.tax)}</td></tr>` : ''}<tr class="grand"><td>Total</td><td class="num">${money(q.total)}</td></tr></table>
    <div class="terms">Prices and availability are valid until ${fmtDate(q.validUntil)}. This is not a tax invoice.</div>`;
}
function warrantyDoc(w) {
  const st = wStatus(w);
  const cust = find('customers', w.customerId);
  const isRepair = w.kind === 'repair';
  const prod = !isRepair && find('products', w.productId);
  const comps = isRepair ? `<table><thead><tr><th>Coverage</th><th class="num">Period</th><th class="num">Valid until</th></tr></thead><tbody>${w.components.map((c) => `<tr><td>${h(c.label)}</td><td class="num">${c.days} days</td><td class="num">${fmtDate(c.end)}</td></tr>`).join('')}</tbody></table>` : '';
  return `<div class="cert">${docHeader(isRepair ? 'Repair Warranty' : 'Warranty Certificate', `<div class="mono"><b>${h(w.no)}</b></div><div class="stamp ${st === 'active' || st === 'expiring' ? 'ok' : 'bad'}">${h(TONES.warranty[st][0]).toUpperCase()}</div>`)}
    <div class="grid2"><div class="box"><h4>Customer</h4><b>${h(cust ? cust.name : '—')}</b><div>${h(cust ? cust.phone : '')}</div></div>
    <div class="box"><h4>${isRepair ? 'Device' : 'Product'}</h4><b>${h(isRepair ? w.device : prod ? prod.name : '')}</b>${w.imei ? `<div class="mono">IMEI ${h(w.imei)}</div>` : ''}${w.serial ? `<div class="mono">S/N ${h(w.serial)}</div>` : ''}</div></div>
    <div class="grid2"><div class="box"><h4>${isRepair ? 'Repair job' : 'Invoice'}</h4>${h(isRepair ? w.jobNo : w.invoiceNo)}${isRepair && w.invoiceNo ? `<div class="muted">Original invoice ${h(w.invoiceNo)}</div>` : ''}</div>
    <div class="box"><h4>Validity</h4><b>${fmtDate(w.start)} → ${fmtDate(warrantyEnd(w))}</b><div class="muted">${isRepair ? 'Separate from the original product warranty' : `${w.months} months · ${h(w.provider)} warranty · ${h(CONDITIONS[w.condition] || '')}`}</div></div></div>
    ${w.replacesWarrantyId ? `<div class="box" style="margin-bottom:12px"><h4>Warranty replacement</h4>This unit (<span class="mono">${h(w.imei || w.serial)}</span>) replaces the defective unit <span class="mono">${h(w.replacedDeviceCode)}</span> — ref ${h(w.replacementNo)}. ${w.mode === 'remaining' ? `Remaining original warranty (originally from ${fmtDate(w.originalStart)}).` : `Warranty period set at replacement: until ${fmtDate(w.end)}.`}</div>` : ''}
    ${comps}<div class="terms"><b>Terms & conditions:</b> ${h(w.terms)}</div><div class="sign"><div>Customer</div><div>For ${h(db.settings.shopName)}</div></div></div>`;
}
function repairDoc(r, kind = 'receipt') {
  const t = repairTotals(r);
  const titles = { receipt: 'Repair Job Receipt', estimate: 'Repair Estimate', invoice: 'Repair Invoice', delivery: 'Delivery Receipt' };
  const parts = r.parts.map((p) => `<tr><td>${h(p.name)}${p.covered ? ' <span class="tag">Warranty</span>' : ''}</td><td class="num">${p.qty}</td><td class="num">${money(p.price)}</td><td class="num">${p.covered ? money(0) : money(p.price * p.qty)}</td></tr>`).join('');
  const w = r.warrantyId && find('warranties', r.warrantyId);
  const charges = kind === 'receipt' ? `<div class="box"><h4>Estimate</h4><div class="big">${r.estimate ? money(r.estimate) : 'After diagnosis'}</div><div class="muted">Advance paid: ${money(t.paid)} · Expected: ${fmtDate(r.expected)}</div></div>` :
    `<table><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead><tbody>${parts}<tr><td>Labour – ${h(r.type)}${r.laborCovered ? ' <span class="tag">Warranty</span>' : ''}</td><td class="num">1</td><td class="num">${money(r.labor)}</td><td class="num">${money(t.labor)}</td></tr></tbody></table>
     <table class="totals">${r.discount ? `<tr><td>Discount</td><td class="num">−${money(r.discount)}</td></tr>` : ''}<tr class="grand"><td>Total</td><td class="num">${money(t.total)}</td></tr><tr><td>Paid</td><td class="num">${money(t.paid)}</td></tr><tr><td><b>Balance</b></td><td class="num"><b>${money(t.balance)}</b></td></tr></table>`;
  return `${docHeader(titles[kind], `<div class="mono"><b>${h(r.no)}</b></div><div>Received ${fmtDateTime(r.receivedAt)}</div>${r.deliveredAt ? `<div>Delivered ${fmtDateTime(r.deliveredAt)}</div>` : ''}${r.isWarrantyRepair ? '<div class="tag">WARRANTY REPAIR</div>' : ''}`)}
    <div class="grid2">${docCustomer(r.customerId)}<div class="box"><h4>Device</h4><b>${h(r.brand)} ${h(r.model)}</b> ${h(r.color)}<div class="mono">${r.imei ? 'IMEI ' + h(r.imei) : 'S/N ' + h(r.serial)}</div><div class="muted">Accessories: ${h(r.accessories.join(', ') || 'None')}</div></div></div>
    <div class="grid2"><div class="box"><h4>Reported problem</h4>${h(r.problem)}</div><div class="box"><h4>Condition at intake</h4>${h(r.condition)}${r.existingDamage ? `<div class="bad">Existing damage: ${h(r.existingDamage)}</div>` : ''}</div></div>
    ${kind !== 'receipt' && r.diagnosis ? `<div class="box" style="margin-bottom:12px"><h4>Diagnosis / work done</h4>${h(r.diagnosis)}</div>` : ''}
    ${charges}
    ${kind === 'delivery' ? `<div class="box" style="margin-top:12px"><h4>Handover</h4>Collected by <b>${h(r.collectedBy)}</b> · Handed over by ${h(userName(r.deliveredBy))}${w ? `<div>Repair warranty <b>${h(w.no)}</b>: ${w.components.map((c) => h(c.label) + ' until ' + fmtDate(c.end)).join('; ')}</div>` : '<div class="muted">No repair warranty applicable.</div>'}${r.signature ? `<img src="${r.signature}" style="height:70px;margin-top:6px">` : ''}</div>` : ''}
    <div class="terms"><b>Repair terms:</b> The shop is not responsible for data loss; please back up your device. Devices not collected within 60 days of notification may be disposed of to recover costs. ${h(db.settings.terms.repair)}</div>
    <div class="sign"><div>Customer signature</div><div>Received / handed over by</div></div>`;
}
