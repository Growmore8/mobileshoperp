/* =========================================================
   Core: storage, helpers, auth, permissions, business services.
   All mutations go through `svc.*`, which enforce permissions and
   validation, run inside a transaction (rollback on error) and write
   to the activity log. This mirrors what a real backend API would do.
   ========================================================= */
'use strict';

const THEME_KEY = 'mobicore_theme';

let db = null;
let currentUser = null;
const SEED_CTX = null; // the demo generator now lives on the server (DemoSeeder)

/* ---------------- Modules & permissions ---------------- */
const ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'print', 'export', 'refund', 'cancel', 'deliver', 'manage'];
const ACTION_LABEL = { view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete', approve: 'Approve', print: 'Print', export: 'Export', refund: 'Refund', cancel: 'Cancel', deliver: 'Deliver', manage: 'Manage' };
const MODULES = [
  { key: 'dashboard', label: 'Dashboard', actions: ['view'] },
  { key: 'pos', label: 'Billing / POS', actions: ['view', 'create', 'edit', 'print'], hint: 'Edit = override prices & discounts' },
  { key: 'sales', label: 'Sales & Invoices', actions: ['view', 'create', 'edit', 'delete', 'approve', 'print', 'export', 'refund', 'cancel', 'manage'], hint: 'Manage = see all staff invoices' },
  { key: 'products', label: 'Products', actions: ['view', 'create', 'edit', 'delete', 'export'] },
  { key: 'inventory', label: 'Inventory', actions: ['view', 'create', 'edit', 'delete', 'approve', 'print', 'export', 'manage'], hint: 'Approve = stock adjustments' },
  { key: 'purchases', label: 'Purchases', actions: ['view', 'create', 'edit', 'delete', 'approve', 'print', 'export', 'cancel'] },
  { key: 'customers', label: 'Customers', actions: ['view', 'create', 'edit', 'delete', 'print', 'export'] },
  { key: 'suppliers', label: 'Suppliers', actions: ['view', 'create', 'edit', 'delete', 'export'] },
  { key: 'repairs', label: 'Repairs', actions: ['view', 'create', 'edit', 'delete', 'approve', 'print', 'export', 'cancel', 'deliver', 'manage'], hint: 'Deliver = hand devices back; Manage = all jobs & assignment; Approve = deliver on credit' },
  { key: 'warranties', label: 'Warranties & Claims', actions: ['view', 'create', 'edit', 'approve', 'print', 'export', 'manage'], hint: 'Edit = override periods; Approve = claim decisions & extensions' },
  { key: 'expenses', label: 'Expenses & Payments', actions: ['view', 'create', 'edit', 'delete', 'approve', 'export'] },
  { key: 'reports', label: 'Reports', actions: ['view', 'print', 'export', 'manage'], hint: 'Manage = financial data (cost, profit)' },
  { key: 'users', label: 'Users, Roles & Logs', actions: ['view', 'create', 'edit', 'delete', 'manage'] },
  { key: 'settings', label: 'Settings', actions: ['view', 'manage'] },
];
const moduleLabel = (k) => (MODULES.find((m) => m.key === k) || {}).label || k;

class AppError extends Error {
  constructor(message, code = 'validation') { super(message); this.code = code; }
}

function roleOf(user = currentUser) { return user && db.roles.find((r) => r.id === user.roleId); }
function can(module, action = 'view', user = currentUser) {
  if (SEED_CTX) return true;
  if (!user) return false;
  const role = roleOf(user);
  if (!role) return false;
  if (role.isAdmin) return true;
  return !!(role.perms[module] && role.perms[module].includes(action));
}
function need(module, action) {
  if (SEED_CTX) return;
  if (!currentUser) throw new AppError('Your session has expired. Please sign in again.', 'auth');
  const fresh = db.users.find((u) => u.id === currentUser.id);
  if (!fresh || !fresh.active) throw new AppError('Your account is deactivated.', 'auth');
  if (!can(module, action)) throw new AppError(`Access denied — your role does not have “${ACTION_LABEL[action]}” permission for ${moduleLabel(module)}.`, 'perm');
}
const canFinance = () => can('reports', 'manage');
const canSeeCost = () => canFinance() || can('purchases', 'view');

/* ---------------- Generic helpers ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function h(v) { return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function uid(p = 'id') { return p + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3); }
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const sum = (arr, fn = (x) => x) => arr.reduce((s, x) => s + (Number(fn(x)) || 0), 0);
const by = (key, dir = 1) => (a, b) => (a[key] > b[key] ? dir : a[key] < b[key] ? -dir : 0);
function find(coll, id) { return id ? db[coll].find((x) => x.id === id) : undefined; }
function groupBy(arr, fn) { return arr.reduce((m, x) => { const k = fn(x); (m[k] = m[k] || []).push(x); return m; }, {}); }
function initials(name) { return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase(); }
const AVATAR_COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626', '#db2777', '#4f46e5', '#0d9488'];
function colorFor(str) { let x = 0; for (const c of String(str)) x = (x * 31 + c.charCodeAt(0)) >>> 0; return AVATAR_COLORS[x % AVATAR_COLORS.length]; }

/* ---------------- Dates ---------------- */
function now() { return SEED_CTX ? new Date(SEED_CTX.date) : new Date(); }
function nowISO() { return now().toISOString(); }
function isoDate(d = now()) { const z = new Date(d); return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, '0')}-${String(z.getDate()).padStart(2, '0')}`; }
function todayISO() { return isoDate(new Date()); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addMonths(d, n) { const x = new Date(d); const day = x.getDate(); x.setMonth(x.getMonth() + n); if (x.getDate() < day) x.setDate(0); return x; }
function parseDay(s) { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); }
function daysUntil(dateStr) { return Math.round((parseDay(dateStr) - parseDay(todayISO())) / 864e5); }
function daysSince(dateStr) { return -daysUntil(isoDate(new Date(dateStr))); }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(d) { if (!d) return '—'; const x = String(d).length <= 10 ? parseDay(d) : new Date(d); return `${String(x.getDate()).padStart(2, '0')} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`; }
function fmtDateTime(d) { if (!d) return '—'; const x = new Date(d); return `${fmtDate(x.toISOString ? isoDate(x) : d)}, ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`; }
function relTime(d) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  if (s < 86400 * 7) return Math.floor(s / 86400) + 'd ago';
  return fmtDate(isoDate(new Date(d)));
}
function money(n, opts = {}) {
  const v = round2(n);
  const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return `${v < 0 ? '−' : ''}${opts.noSymbol ? '' : (db?.settings?.currency || 'Rs.') + ' '}${s}`;
}
function compactMoney(n) {
  const v = Number(n) || 0; const c = db.settings.currency;
  if (Math.abs(v) >= 1e7) return `${c} ${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e5) return `${c} ${(v / 1e3).toFixed(0)}K`;
  return money(v);
}

/* ---------------- IMEI ---------------- */
function normId(s) { return String(s || '').replace(/[\s-]/g, '').toUpperCase(); }
function luhnCheckDigit(body) {
  let total = 0;
  for (let i = 0; i < body.length; i++) { let d = Number(body[body.length - 1 - i]); if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; } total += d; }
  return (10 - (total % 10)) % 10;
}
function validImei(s) { const v = normId(s); return /^\d{15}$/.test(v) && luhnCheckDigit(v.slice(0, 14)) === Number(v[14]); }
function findDeviceByCode(code) {
  const k = normId(code); if (!k) return null;
  return db.devices.find((d) => normId(d.imei1) === k || normId(d.imei2) === k || normId(d.serial) === k) || null;
}
function deviceCode(d) { return d.imei1 || d.serial || '—'; }

/* ---------------- Server connection ---------------- */
// The server (Laravel /api) is the source of truth. The browser keeps an in-memory copy (db)
// for fast screens, loaded by /api/sync and refreshed after every change.
const TOKEN_KEY = 'mobicore_token';
let SYNC_AT = null;
let META = { demo: false, demoAccounts: [] };
const COLLECTIONS = ['suppliers', 'customers', 'products', 'devices', 'sales', 'quotes', 'purchases', 'repairs', 'warranties', 'claims', 'replacements', 'expenses', 'stockMoves', 'adjustments', 'activity'];

function emptyDb() {
  const d = { settings: { currency: 'Rs.', taxRate: 0, taxName: 'Tax', notify: {}, channels: {}, terms: {}, repairTypes: [], paymentMethods: ['Cash'], expenseCategories: [] }, roles: [], users: [], categories: [] };
  COLLECTIONS.forEach((k) => { d[k] = []; });
  return d;
}
db = emptyDb();

function getToken() { try { return sessionStorage.getItem(TOKEN_KEY); } catch (e) { return null; } }
function setToken(t) { try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* private mode */ } }

/** Call the API. Throws AppError with the server's human-readable message. */
async function api(method, path, body, { multipart = false } = {}) {
  const headers = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = 'Bearer ' + token;
  let payload;
  if (body !== undefined && body !== null) {
    if (multipart) payload = body;
    else { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  }
  let res;
  try { res = await fetch('/api' + path, { method, headers, body: payload }); }
  catch (e) { throw new AppError('Cannot reach the server. Check the connection and try again.', 'network'); }
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/auth/login') {
    setToken(null); currentUser = null;
    setTimeout(() => window.dispatchEvent(new Event('session-expired')), 0);
    throw new AppError(json.message || 'Your session has expired. Please sign in again.', 'auth');
  }
  if (!res.ok) {
    const first = json.errors ? Object.values(json.errors)[0] : null;
    throw new AppError((first && first[0]) || json.message || `Request failed (${res.status}).`, res.status === 403 ? 'perm' : 'validation');
  }
  return json;
}

/** Load everything (full) or only changes since the last sync, and merge into db. Returns number of changed records. */
async function syncData(full = false) {
  const r = await api('GET', '/sync' + (!full && SYNC_AT ? '?since=' + encodeURIComponent(SYNC_AT) : ''));
  SYNC_AT = new Date(new Date(r.now).getTime() - 3000).toISOString(); // small overlap; merging is idempotent
  if (r.full) db = emptyDb();
  db.settings = r.settings; db.roles = r.roles; db.users = r.users; db.categories = r.categories;
  let changed = 0;
  COLLECTIONS.forEach((k) => {
    if (!r[k]) return;
    if (r.full) { db[k] = r[k]; return; }
    r[k].slice().reverse().forEach((row) => {
      const i = db[k].findIndex((x) => x.id === row.id);
      if (i >= 0) db[k][i] = row; else db[k].unshift(row);
      changed++;
    });
  });
  currentUser = db.users.find((u) => u.id === r.me.id) || r.me;
  return changed;
}

async function loadMeta() {
  try { const m = await api('GET', '/meta'); META = { demo: !!m.demo, demoAccounts: m.demo_accounts || [], shopName: m.shop_name }; } catch (e) { /* offline: login page still works */ }
}

function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(',');
  const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
async function uploadImage(path, field, dataUrl) {
  const fd = new FormData();
  if (dataUrl) fd.append(field, dataUrlToBlob(dataUrl), 'photo.jpg');
  return api('POST', path, fd, { multipart: true });
}

/** Download a server-generated PDF (needs the login token, so it goes through fetch). */
async function downloadPdf(path, filename) {
  const res = await fetch('/api' + path, { headers: { Authorization: 'Bearer ' + getToken(), Accept: 'application/pdf, application/json' } });
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new AppError(j.message || 'Could not create the PDF.'); }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(await res.blob()); a.download = filename + '.pdf';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// The server writes the audit trail; these stay as no-ops so older call sites keep working.
function saveDB() {}
function log() {}
function actor() { return currentUser && currentUser.id; }
function userName(id) { const u = find('users', id); return u ? u.name : (id ? 'Unknown' : '—'); }
function customerName(id) { const c = find('customers', id); return c ? c.name : 'Walk-in customer'; }
function productName(id) { const p = find('products', id); return p ? p.name : 'Unknown product'; }
function catKind(categoryId) { return (db.categories.find((c) => c.id === categoryId) || {}).kind || ''; }

/* ---------------- Auth ---------------- */
async function login(username, password) {
  const r = await api('POST', '/auth/login', { username, password });
  setToken(r.token);
  await syncData(true);
  return currentUser;
}
async function logout() {
  if (getToken()) { try { await api('POST', '/auth/logout'); } catch (e) { /* already signed out */ } }
  setToken(null); currentUser = null; SYNC_AT = null; db = emptyDb();
}
async function restoreSession() {
  if (!getToken()) return false;
  try { await syncData(true); return true; } catch (e) { setToken(null); return false; }
}

/* ---------------- Derived values ---------------- */
const DEVICE_STATUS = { in_stock: 'In stock', sold: 'Sold', returned: 'Returned (inspection)', damaged: 'Damaged', missing: 'Missing', repair: 'Under repair', supplier_return: 'Returned to supplier', warranty_return: 'Warranty return (defective)' };
const CONDITIONS = { new: 'New', used: 'Used', refurbished: 'Refurbished', damaged: 'Damaged', under_repair: 'Under repair' };

function stockOf(p) { return p.serialized ? db.devices.filter((d) => d.productId === p.id && d.status === 'in_stock').length : (p.qty || 0); }
function stockState(p) { const q = stockOf(p); if (q <= 0) return 'out'; if (q <= (p.minStock || 0)) return 'low'; return 'ok'; }
function stockValue(p) {
  return p.serialized ? sum(db.devices.filter((d) => d.productId === p.id && d.status === 'in_stock'), (d) => d.cost) : (p.qty || 0) * (p.cost || 0);
}
function saleTotals(s) {
  const returned = sum(s.returns || [], (r) => r.amount);
  const net = round2(s.total - returned);
  const paid = round2(sum(s.payments || [], (p) => p.amount));
  return { net, paid, returned, balance: s.status === 'cancelled' ? 0 : round2(net - paid) };
}
function saleCost(s) {
  return sum(s.items, (it) => it.cost * (it.qty - (it.returnedQty || 0)));
}
function purchaseTotals(p) {
  const returned = sum(p.returns || [], (r) => r.amount);
  const paid = sum(p.payments || [], (x) => x.amount);
  const net = round2(p.total - returned);
  return { net, paid, returned, balance: p.status === 'received' ? round2(net - paid) : 0 };
}
function repairTotals(r) {
  const partsAll = sum(r.parts, (p) => p.price * p.qty);
  const parts = sum(r.parts.filter((p) => !p.covered), (p) => p.price * p.qty);
  const labor = r.laborCovered ? 0 : Number(r.labor || 0);
  const total = Math.max(0, round2(parts + labor - Number(r.discount || 0)));
  const paid = round2(sum(r.payments, (p) => p.amount));
  const cost = round2(sum(r.parts, (p) => p.cost * p.qty) + Number(r.techCost || 0));
  const coveredValue = round2(sum(r.parts.filter((p) => p.covered), (p) => p.price * p.qty) + (r.laborCovered ? Number(r.labor || 0) : 0));
  return { partsAll, parts, labor, total, paid, balance: r.status === 'cancelled' ? 0 : round2(total - paid), cost, coveredValue };
}
function customerBalance(cid) {
  return round2(sum(db.sales.filter((s) => s.customerId === cid), (s) => saleTotals(s).balance)
    + sum(db.repairs.filter((r) => r.customerId === cid && r.status === 'delivered'), (r) => repairTotals(r).balance));
}
function supplierBalance(sid) { return round2(sum(db.purchases.filter((p) => p.supplierId === sid), (p) => purchaseTotals(p).balance)); }

/* Warranty status */
function warrantyEnd(w) { return w.kind === 'repair' ? w.components.reduce((m, c) => (c.end > m ? c.end : m), w.start) : w.end; }
function wStatus(w) {
  if (w.status === 'void') return 'void';
  if (w.status === 'replaced') return 'replaced';
  const d = daysUntil(warrantyEnd(w));
  if (d < 0) return 'expired';
  if (d <= db.settings.expiringDays) return 'expiring';
  return 'active';
}
function checkEligibility(w, flags = {}) {
  const reasons = [];
  if (w.status === 'void') reasons.push(`Warranty is void${w.voidReason ? ': ' + w.voidReason : ''}.`);
  if (w.status === 'replaced') { const nw = find('warranties', w.replacedByWarrantyId); reasons.push(`This unit was already replaced under warranty — coverage moved to ${nw ? nw.no + ' (' + (nw.imei || nw.serial) + ')' : 'the replacement unit'}.`); }
  let activeComponents = [];
  if (w.kind === 'repair') {
    activeComponents = w.components.filter((c) => daysUntil(c.end) >= 0);
    if (!activeComponents.length) reasons.push(`All repair warranty components have expired (latest${fmtDate(warrantyEnd(w))}).`);
  } else if (daysUntil(w.end) < 0) reasons.push(`Warranty expired on ${fmtDate(w.end)}.`);
  if (flags.physical) reasons.push('Physical / impact damage is excluded by the warranty terms.');
  if (flags.liquid) reasons.push('Liquid damage is excluded by the warranty terms.');
  if (flags.tampered) reasons.push('Device was opened or repaired by an unauthorised party (warranty seal broken).');
  if (flags.unrelated && w.kind === 'repair') reasons.push('Complaint is unrelated to the repaired component / service.');
  return { eligible: reasons.length === 0, reasons, activeComponents };
}

/* Repairs */
const REPAIR_STATUSES = [
  ['received', 'Received'], ['inspection', 'Inspection Pending'], ['diagnosed', 'Diagnosis Completed'],
  ['awaiting_approval', 'Awaiting Customer Approval'], ['awaiting_parts', 'Awaiting Spare Parts'], ['in_progress', 'Repair in Progress'],
  ['completed', 'Repair Completed'], ['qc', 'Quality Check'], ['ready', 'Ready for Collection'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled'],
];
const RS = Object.fromEntries(REPAIR_STATUSES);
const OPEN_REPAIR = (r) => !['delivered', 'cancelled'].includes(r.status);
const isOverdue = (r) => OPEN_REPAIR(r) && r.status !== 'ready' && r.expected && daysUntil(r.expected) < 0;
function visibleRepairs() {
  if (can('repairs', 'manage')) return db.repairs;
  return db.repairs.filter((r) => !r.technicianId || r.technicianId === currentUser.id || r.createdBy === currentUser.id);
}
function visibleSales() {
  if (can('sales', 'manage')) return db.sales;
  return db.sales.filter((s) => s.userId === currentUser.id);
}

/* ---------------- Services ---------------- */
/* VAT shown on a sale / quotation: the rate it was billed at (older records fall back to the current setting) */
function vatRateOf(doc) { return doc.taxRate ?? (Number(db.settings.taxRate) || 0); }
function showVat(doc) { return doc.tax > 0 || vatRateOf(doc) > 0; }
function pctText(v) { return `${Number((Number(v) || 0).toFixed(2))}%`; }
function discountLabel(doc, base = 'Discount') { return doc.discountPercent ? `${base} (${pctText(doc.discountPercent)} off)` : base; }
function vatOn() { return db.settings.taxEnabled !== false; }

function calcCart(items, orderDiscount = 0, discountPct = 0) {
  const rate = vatOn() ? (Number(db.settings.taxRate) || 0) / 100 : 0;
  const inclusive = db.settings.taxInclusive;
  let subtotal = 0;
  items.forEach((it) => { it.lineTotal = round2(it.price * it.qty - (Number(it.discount) || 0)); subtotal += it.lineTotal; });
  subtotal = round2(subtotal);
  const pct = Math.min(100, Math.max(0, Number(discountPct) || 0));
  const disc = round2(pct ? subtotal * pct / 100 : Math.min(Math.max(0, Number(orderDiscount) || 0), subtotal));
  let tax = 0;
  items.forEach((it) => {
    const p = find('products', it.productId);
    const share = subtotal ? it.lineTotal / subtotal : 0;
    const net = it.lineTotal - disc * share;
    it.tax = p && p.taxable ? round2(inclusive ? net - net / (1 + rate) : net * rate) : 0;
    tax += it.tax;
  });
  tax = round2(tax);
  const total = round2(inclusive ? subtotal - disc : subtotal - disc + tax);
  return { subtotal, discount: disc, tax, total };
}

/* Every change goes to the server, which validates it, checks permissions, saves it and logs it.
   After a successful call the local copy is refreshed and the updated record is returned. */
const nn = (v) => (v === '' || v === undefined ? null : v);
const num = (v) => (v === '' || v === undefined || v === null ? null : Number(v));
async function refreshAfter(coll, id) { await syncData(); return coll ? find(coll, String(id)) : undefined; }

const svc = {
  /* ----- Products ----- */
  async saveProduct(d) {
    const body = {
      name: d.name, code: nn(d.code), category_id: d.categoryId, brand: nn(d.brand), model: nn(d.model), variant: nn(d.variant), color: nn(d.color),
      storage: nn(d.storage), ram: nn(d.ram), price: num(d.price), wholesale: num(d.wholesale) || 0, sku: nn(d.sku), barcode: nn(d.barcode),
      tracking: d.idType || 'qty', condition: d.condition || 'new', min_stock: num(d.minStock) || 0, warranty_months: num(d.warrantyMonths) || 0,
      warranty_provider: d.warrantyProvider || 'Manufacturer', used_warranty_months: num(d.usedWarrantyMonths) || 0, repair_warranty_days: num(d.repairWarrantyDays),
      taxable: !!d.taxable, discountable: !!d.discountable, active: !!d.active, supplier_id: nn(d.supplierId), description: nn(d.description),
    };
    if (canSeeCost()) body.cost = num(d.cost) || 0;
    const r = d.id ? await api('PUT', `/products/${d.id}`, body) : await api('POST', '/products', body);
    const id = r.data.id;
    const before = d.id ? find('products', d.id) : null;
    if (d.image && d.image.startsWith('data:')) await uploadImage(`/products/${id}/image`, 'image', d.image);
    else if (!d.image && before && before.image) await uploadImage(`/products/${id}/image`, 'image', null);
    return refreshAfter('products', id);
  },
  async deleteProduct(id) { const r = await api('DELETE', `/products/${id}`); await syncData(true); return r.result; },

  /* ----- Purchases ----- */
  async savePurchase(d) {
    const body = {
      supplier_id: d.supplierId, status: d.status, supplier_invoice: nn(d.supplierInvoice), date: nn(d.date), expected_date: nn(d.expected), note: nn(d.note),
      paid: num(d.paid) || 0, method: d.method || 'Cash',
      items: d.items.map((i) => ({ product_id: i.productId, qty: Number(i.qty), cost: num(i.cost), condition: i.condition || 'new', units: i.units ? i.units.map((u) => ({ imei1: nn(u.imei1), imei2: nn(u.imei2), serial: nn(u.serial) })) : null })),
    };
    const r = d.id ? await api('POST', `/purchases/${d.id}/receive`, body) : await api('POST', '/purchases', body);
    return refreshAfter('purchases', r.data.id);
  },
  async cancelPurchaseOrder(id, reason) { await api('POST', `/purchases/${id}/cancel`, { reason }); return refreshAfter(); },
  async supplierPayment(id, amount, method, note) { await api('POST', `/purchases/${id}/payments`, { amount, method, note: nn(note) }); return refreshAfter(); },
  async purchaseReturn(id, { deviceIds = [], lines = [], reason }) {
    await api('POST', `/purchases/${id}/returns`, { device_ids: deviceIds, lines: lines.map((l) => ({ product_id: l.productId, qty: Number(l.qty) || 0 })), reason }); return refreshAfter();
  },

  /* ----- Stock adjustments ----- */
  async requestAdjustment({ productId, deviceId, qty, type, reason }) {
    const r = await api('POST', '/adjustments', { product_id: productId, device_id: nn(deviceId), qty: Number(qty) || 0, type, reason }); return refreshAfter('adjustments', r.data.id);
  },
  async approveAdjustment(id) { await api('POST', `/adjustments/${id}/approve`); return refreshAfter(); },
  async rejectAdjustment(id, note) { await api('POST', `/adjustments/${id}/reject`, { note: nn(note) }); return refreshAfter(); },

  /* ----- Sales ----- */
  async createSale({ customerId, items, discount = 0, discountPercent = 0, payments = [], note = '', allowCredit = false }) {
    const r = await api('POST', '/sales', {
      customer_id: nn(customerId), discount: Number(discount) || 0, discount_percent: Number(discountPercent) || 0, note: nn(note), allow_credit: !!allowCredit,
      items: items.map((i) => ({ product_id: i.productId, device_id: nn(i.deviceId), qty: Number(i.qty), price: Number(i.price), discount: Number(i.discount) || 0, warranty_months: i.deviceId ? num(i.warrantyMonths) : null })),
      payments: payments.filter((p) => Number(p.amount) > 0).map((p) => ({ method: p.method, amount: Number(p.amount), reference: nn(p.ref) })),
    });
    return refreshAfter('sales', r.data.id);
  },
  async saveQuote({ customerId, items, discount = 0, discountPercent = 0, note = '' }) {
    const r = await api('POST', '/quotations', { customer_id: nn(customerId), discount: Number(discount) || 0, discount_percent: Number(discountPercent) || 0, note: nn(note),
      items: items.map((i) => ({ product_id: i.productId, qty: Number(i.qty), price: Number(i.price), discount: Number(i.discount) || 0 })) });
    return refreshAfter('quotes', r.data.id);
  },
  async salePayment(id, method, amount, ref) { await api('POST', `/sales/${id}/payments`, { method, amount, reference: nn(ref) }); return refreshAfter(); },
  async refundSale(id, { lines, reason, restock = 'inspect', method = 'Cash' }) {
    const s = find('sales', id);
    const r = await api('POST', `/sales/${id}/refunds`, { lines: lines.map((l) => ({ item_id: s.items[l.idx].id, qty: Number(l.qty) })), reason, restock, method });
    await refreshAfter();
    return { amount: r.data.amount, refund: r.data.refund };
  },
  async cancelSale(id, reason) { await api('POST', `/sales/${id}/cancel`, { reason }); return refreshAfter('sales', id); },

  /* ----- Customers & suppliers ----- */
  async saveCustomer(d) {
    const body = { name: d.name, phone: d.phone, email: nn(d.email), address: nn(d.address), notes: nn(d.notes) };
    const r = d.id ? await api('PUT', `/customers/${d.id}`, body) : await api('POST', '/customers', body);
    return refreshAfter('customers', r.data.id);
  },
  async customerPayment(id, amount, method) { const r = await api('POST', `/customers/${id}/payments`, { amount, method }); await refreshAfter(); return r.applied; },
  async saveSupplier(d) {
    const body = { name: d.name, contact: nn(d.contact), phone: nn(d.phone), email: nn(d.email), address: nn(d.address), terms: nn(d.terms) };
    const r = d.id ? await api('PUT', `/suppliers/${d.id}`, body) : await api('POST', '/suppliers', body);
    return refreshAfter('suppliers', r.data.id);
  },

  /* ----- Repairs ----- */
  async createRepair(d) {
    const r = await api('POST', '/repairs', {
      customer_id: d.customerId, brand: d.brand, model: d.model, color: nn(d.color), imei: nn(d.imei), serial: nn(d.serial), condition: nn(d.condition),
      accessories: d.accessories || [], problem: d.problem, existing_damage: nn(d.existingDamage), type: nn(d.type), priority: d.priority || 'Normal',
      estimate: Number(d.estimate) || 0, estimate_approved: !!d.estimateApproved, expected_date: nn(d.expected), technician_id: nn(d.technicianId),
      advance: Number(d.advance) || 0, advance_method: d.advanceMethod || 'Cash', terms_accepted: !!d.termsAccepted,
    });
    for (const p of d.photos || []) await uploadImage(`/repairs/${r.data.id}/photos`, 'photo', p);
    return refreshAfter('repairs', r.data.id);
  },
  async updateRepair(id, patch) {
    const map = { diagnosis: 'diagnosis', notes: 'notes', expected: 'expected_date', estimate: 'estimate', type: 'type', priority: 'priority', technicianId: 'technician_id', labor: 'labor', discount: 'discount', laborCovered: 'labor_covered', techCost: 'tech_cost' };
    const body = {};
    Object.keys(patch).forEach((k) => { if (map[k]) body[map[k]] = ['labor', 'discount', 'estimate', 'techCost'].includes(k) ? Number(patch[k]) || 0 : k === 'laborCovered' ? !!patch[k] : nn(patch[k]); });
    await api('PUT', `/repairs/${id}`, body); return refreshAfter('repairs', id);
  },
  async setRepairStatus(id, status, note) { await api('POST', `/repairs/${id}/status`, { status, note: nn(note) }); return refreshAfter('repairs', id); },
  async repairApproval(id, approved, note, amount) { await api('POST', `/repairs/${id}/approval`, { approved, note: nn(note), amount: num(amount) }); return refreshAfter('repairs', id); },
  async addRepairPart(id, { productId, qty, price, covered }) { await api('POST', `/repairs/${id}/parts`, { product_id: productId, qty: Number(qty), price: num(price), covered: !!covered }); return refreshAfter('repairs', id); },
  async removeRepairPart(id, idx) { const part = find('repairs', id).parts[idx]; await api('DELETE', `/repairs/${id}/parts/${part.id}`); return refreshAfter('repairs', id); },
  async repairPayment(id, method, amount) { await api('POST', `/repairs/${id}/payments`, { method, amount }); return refreshAfter('repairs', id); },
  async addRepairPhoto(id, dataUrl) { await uploadImage(`/repairs/${id}/photos`, 'photo', dataUrl); return refreshAfter('repairs', id); },
  async deliverRepair(id, d) {
    await api('POST', `/repairs/${id}/deliver`, { collected_by: d.collectedBy, confirm: !!d.confirm, signature: d.signature || null, payment: Number(d.payment) || 0,
      method: d.method || 'Cash', credit: !!d.credit, labor_days: num(d.laborDays), part_days: (d.partDays || []).map(num) });
    return refreshAfter('repairs', id);
  },
  async cancelRepair(id, reason) { await api('POST', `/repairs/${id}/cancel`, { reason }); return refreshAfter('repairs', id); },

  /* ----- Warranties & claims ----- */
  async extendWarranty(id, { months, days, reason }) { await api('POST', `/warranties/${id}/extend`, { months: num(months), days: num(days), reason }); return refreshAfter('warranties', id); },
  async createClaim({ warrantyId, fault, flags = {}, notes = '', photos = [] }) {
    const r = await api('POST', '/claims', { warranty_id: warrantyId, fault, notes: nn(notes), flags: Object.fromEntries(Object.entries(flags).map(([k, v]) => [k, !!v])) });
    for (const p of photos) await uploadImage(`/claims/${r.data.id}/photos`, 'photo', p);
    return refreshAfter('claims', r.data.id);
  },
  async updateClaim(id, p) {
    const body = { status: nn(p.status), assigned_to: nn(p.assignedTo), findings: nn(p.findings), decision_note: nn(p.decisionNote), resolution: nn(p.resolution),
      resolution_note: nn(p.resolutionNote), cost: num(p.cost), override: !!p.override, flags: p.flags || null };
    await api('PUT', `/claims/${id}`, body); return refreshAfter('claims', id);
  },
  async claimToRepair(claimId) { const r = await api('POST', `/claims/${claimId}/repair`); return refreshAfter('repairs', r.data.id); },
  async replaceUnderWarranty(claimId, { newDeviceId, mode, months, endDate, note = '' }) {
    if (!newDeviceId) throw new AppError('Select the replacement unit (IMEI / serial).');
    const r = await api('POST', `/claims/${claimId}/replace`, { new_device_id: newDeviceId, mode, months: mode === 'months' ? num(months) : null, end_date: mode === 'date' ? nn(endDate) : null, note: nn(note) });
    return refreshAfter('replacements', r.data.id);
  },

  /* ----- Expenses ----- */
  async addExpense(d) { const r = await api('POST', '/expenses', { date: d.date, category: d.category, amount: Number(d.amount), method: d.method, note: nn(d.note) }); return refreshAfter('expenses', r.data.id); },
  async voidExpense(id, reason) { await api('POST', `/expenses/${id}/void`, { reason }); return refreshAfter('expenses', id); },

  /* ----- Users, roles, settings ----- */
  async saveUser(d) {
    const body = { name: d.name, username: d.username, role_id: d.roleId, password: nn(d.password), phone: nn(d.phone), email: nn(d.email) };
    const r = d.id ? await api('PUT', `/users/${d.id}`, body) : await api('POST', '/users', body); return refreshAfter('users', r.data.id);
  },
  async setUserActive(id, active) { await api('PATCH', `/users/${id}/active`, { active }); return refreshAfter('users', id); },
  async saveRole(d) {
    const body = { name: d.name, description: nn(d.description), permissions: d.perms || {} };
    const r = d.id ? await api('PUT', `/roles/${d.id}`, body) : await api('POST', '/roles', body); return refreshAfter('roles', r.data.id);
  },
  async deleteRole(id) { await api('DELETE', `/roles/${id}`); await syncData(true); },
  async saveCategoryWarranty(id, months) { await api('PUT', `/categories/${id}`, { warranty_months: Number(months) || 0 }); },
  async saveSettings(p) {
    const keys = { shopName: 'shop_name', tagline: 'tagline', address: 'address', phone: 'phone', email: 'email', taxId: 'tax_id', currency: 'currency', taxName: 'tax_name',
      taxRate: 'tax_rate', taxInclusive: 'tax_inclusive', taxEnabled: 'tax_enabled', invoicePrefix: 'invoice_prefix', invoiceFooter: 'invoice_footer', costing: 'costing', paymentMethods: 'payment_methods',
      expenseCategories: 'expense_categories', warrantyStart: 'warranty_start', repairWarrantyStart: 'repair_warranty_start', expiringDays: 'expiring_days', requireSignature: 'require_signature' };
    const body = {};
    Object.entries(p).forEach(([k, v]) => { if (keys[k]) body[keys[k]] = v; });
    if (p.repairTypes) body.repair_types = p.repairTypes.map((t) => ({ name: t.name, labor_days: Number(t.laborDays) || 0 }));
    if (p.terms) body.terms = p.terms;
    if (p.notify) body.notify = { low_stock: p.notify.lowStock, overdue_repairs: p.notify.overdueRepairs, ready_for_collection: p.notify.readyForCollection, warranty_expiry: p.notify.warrantyExpiry, pending_claims: p.notify.pendingClaims, receivables: p.notify.receivables };
    if (p.channels) body.channels = p.channels;
    await api('PUT', '/settings', body); return refreshAfter();
  },
};

/* ---------------- Notifications ---------------- */
function getNotifications() {
  const n = []; const s = db.settings.notify;
  if (s.lowStock && can('inventory', 'view')) {
    const out = db.products.filter((p) => p.active && stockState(p) === 'out');
    const low = db.products.filter((p) => p.active && stockState(p) === 'low');
    if (out.length) n.push({ tone: 'red', icon: 'package', title: `${out.length} product(s) out of stock`, text: out.slice(0, 3).map((p) => p.name).join(', ') + (out.length > 3 ? '…' : ''), href: '#/inventory?f=out' });
    if (low.length) n.push({ tone: 'amber', icon: 'package', title: `${low.length} product(s) low on stock`, text: low.slice(0, 3).map((p) => p.name).join(', ') + (low.length > 3 ? '…' : ''), href: '#/inventory?f=low' });
  }
  if (can('repairs', 'view')) {
    const rep = visibleRepairs();
    if (s.overdueRepairs) rep.filter(isOverdue).slice(0, 4).forEach((r) => n.push({ tone: 'red', icon: 'clock', title: `Overdue repair ${r.no}`, text: `${r.brand} ${r.model} — due ${fmtDate(r.expected)} (${RS[r.status]})`, href: '#/repairs/' + r.id }));
    const ready = rep.filter((r) => r.status === 'ready');
    if (s.readyForCollection && ready.length) n.push({ tone: 'green', icon: 'wrench', title: `${ready.length} device(s) ready for collection`, text: ready.slice(0, 3).map((r) => `${r.no} ${customerName(r.customerId)}`).join(', '), href: '#/repairs?tab=ready' });
  }
  if (can('warranties', 'view')) {
    const exp = db.warranties.filter((w) => wStatus(w) === 'expiring');
    if (s.warrantyExpiry && exp.length) n.push({ tone: 'amber', icon: 'shield', title: `${exp.length} warranties expiring within ${db.settings.expiringDays} days`, text: 'Product and repair warranties nearing expiry', href: '#/warranties?status=expiring' });
    const pend = db.claims.filter((c) => ['pending', 'inspection'].includes(c.status));
    if (s.pendingClaims && pend.length) n.push({ tone: 'purple', icon: 'shieldAlert', title: `${pend.length} warranty claim(s) awaiting action`, text: pend.slice(0, 3).map((c) => c.no).join(', '), href: '#/claims' });
  }
  if (s.receivables && can('customers', 'view') && can('sales', 'view')) {
    const owing = db.customers.map((c) => ({ c, b: customerBalance(c.id) })).filter((x) => x.b > 0);
    if (owing.length) n.push({ tone: 'blue', icon: 'wallet', title: `${owing.length} customer(s) with outstanding balances`, text: `Total receivable ${money(sum(owing, (x) => x.b))}`, href: '#/customers?f=owing' });
  }
  if (can('inventory', 'approve')) {
    const pa = db.adjustments.filter((a) => a.status === 'pending');
    if (pa.length) n.push({ tone: 'amber', icon: 'layers', title: `${pa.length} stock adjustment(s) need approval`, text: pa.map((a) => a.no).join(', '), href: '#/inventory?tab=adjustments' });
  }
  return n;
}
