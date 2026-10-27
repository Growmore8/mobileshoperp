/* =========================================================
   App shell: router, login, navigation, global search,
   notifications, theme, global event delegation.
   ========================================================= */
'use strict';

const PAGES = {};
const ACT = {};
let lastPath = '';

const NAV = [
  { title: 'Overview', items: [{ key: 'dashboard', label: 'Dashboard', icon: 'dashboard', perm: ['dashboard', 'view'] }] },
  { title: 'Sales', items: [
    { key: 'pos', label: 'POS / New Sale', icon: 'cart', perm: ['pos', 'view'] },
    { key: 'sales', label: 'Sales & Invoices', icon: 'receipt', perm: ['sales', 'view'] },
    { key: 'customers', label: 'Customers', icon: 'users', perm: ['customers', 'view'] },
  ] },
  { title: 'Inventory', items: [
    { key: 'products', label: 'Products', icon: 'package', perm: ['products', 'view'] },
    { key: 'inventory', label: 'Stock Control', icon: 'warehouse', perm: ['inventory', 'view'], count: () => db.products.filter((p) => p.active && stockState(p) !== 'ok').length, warn: true },
    { key: 'imei', label: 'IMEI Tracker', icon: 'scan', perm: ['inventory', 'view'] },
    { key: 'purchases', label: 'Purchases', icon: 'truck', perm: ['purchases', 'view'] },
    { key: 'suppliers', label: 'Suppliers', icon: 'handshake', perm: ['suppliers', 'view'] },
  ] },
  { title: 'Service', items: [
    { key: 'repairs', label: 'Repairs', icon: 'wrench', perm: ['repairs', 'view'], count: () => visibleRepairs().filter(OPEN_REPAIR).length },
    { key: 'warranties', label: 'Warranties', icon: 'shield', perm: ['warranties', 'view'] },
    { key: 'claims', label: 'Warranty Claims', icon: 'shieldAlert', perm: ['warranties', 'view'], count: () => db.claims.filter((c) => ['pending', 'inspection'].includes(c.status)).length, warn: true },
  ] },
  { title: 'Finance', items: [
    { key: 'finance', label: 'Payments & Expenses', icon: 'wallet', perm: ['expenses', 'view'] },
    { key: 'reports', label: 'Reports', icon: 'chart', perm: ['reports', 'view'] },
  ] },
  { title: 'Administration', items: [
    { key: 'users', label: 'Users & Roles', icon: 'key', perm: ['users', 'view'] },
    { key: 'activity', label: 'Activity Log', icon: 'history', perm: ['users', 'view'] },
    { key: 'settings', label: 'Settings', icon: 'sliders', perm: ['settings', 'view'] },
  ] },
];

/* ---------------- Routing ---------------- */
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs = ''] = raw.split('?');
  const [page = '', id = ''] = path.split('/');
  const query = Object.fromEntries(new URLSearchParams(qs));
  return { page, id: decodeURIComponent(id), query, path };
}
function navigate(href) { if (location.hash === href) render(); else location.hash = href; }
function setQuery(patch) {
  const { path, query } = parseHash();
  const q = { ...query, ...patch };
  Object.keys(q).forEach((k) => (q[k] === '' || q[k] == null) && delete q[k]);
  const qs = new URLSearchParams(q).toString();
  history.replaceState(null, '', '#/' + path + (qs ? '?' + qs : ''));
  render();
}
function landing() {
  for (const g of NAV) for (const it of g.items) if (can(...it.perm)) return '#/' + it.key;
  return '#/denied';
}
function render() {
  if (!currentUser) { renderLogin(); return; }
  const fresh = db.users.find((u) => u.id === currentUser.id);
  if (!fresh || !fresh.active) { signOut('Your account was deactivated.'); return; }
  currentUser = fresh;
  if (!$('.shell')) renderShell();
  const { page, id, query, path } = parseHash();
  if (!page) { history.replaceState(null, '', landing()); return render(); }
  const def = PAGES[page];
  const content = $('#content');
  closeDropdowns();
  document.body.classList.remove('nav-open');
  if (!def) { content.innerHTML = emptyState('search', 'Page not found', 'The page you are looking for does not exist.', `<a class="btn" href="${landing()}">Go to start page</a>`); return; }
  const allowed = !def.perm || can(...def.perm);
  $('#page-title').textContent = def.title;
  document.title = `${def.title} · ${db.settings.shopName}`;
  const navKey = def.nav || page;
  $$('.nav-link, .bn-item[data-key]').forEach((a) => a.classList.toggle('active', a.dataset.key === navKey));
  const moreBtn = $('.bn-item[data-action=open-more]'); if (moreBtn) moreBtn.classList.toggle('active', !BN_KEYS.includes(navKey));
  if (path !== lastPath) closeMoreSheet();
  if (!allowed) {
    content.innerHTML = `<div class="card"><div class="card-body">${emptyState('lock', 'Access restricted', `Your role (${roleOf().name}) does not have permission to view ${def.title}. Ask an administrator to update your permissions.`, `<a class="btn" href="${landing()}">Back to start page</a>`)}</div></div>`;
    return;
  }
  try {
    content.innerHTML = def.render({ id, query });
    def.mount && def.mount({ id, query });
  } catch (e) {
    console.error(e);
    content.innerHTML = `<div class="alert alert-danger">${icon('alert')}<div>Could not render this page: ${h(e.message)}</div></div>`;
  }
  if (path !== lastPath) { window.scrollTo(0, 0); lastPath = path; }
  updateChrome();
}
function refresh() { const y = window.scrollY; render(); window.scrollTo(0, y); }

/* ---------------- Login ---------------- */
function renderLogin() {
  const shop = (db.settings && db.settings.shopName) || META.shopName || 'Shop';
  document.title = `Sign in · ${shop}`;
  $('#app').innerHTML = `<div class="login">
    <div class="lg-bg" aria-hidden="true"><div class="lg-photo"></div><i class="b1"></i><i class="b2"></i></div>
    <div class="lg-inner">
      <div class="brand lg-brand"><img class="brand-logo brand-img" src="assets/img/logo-mark.png" alt=""><div><div class="brand-name">${h(shop)}</div><div class="brand-sub">MobiCore ERP</div></div></div>
      <section class="lg-copy">
        <div class="lg-eyebrow">Sales · Stock · Repairs · Warranty</div>
        <h1>Every phone. Every IMEI. <span class="hero-grad">Every warranty.</span></h1>
        <p>Sell phones and accessories, manage repairs and handle warranty claims, with every unit tracked by its IMEI from the supplier to the customer.</p>
        <div class="lg-tags">${[['scan', 'IMEI tracking'], ['wrench', 'Repairs'], ['shield', 'Warranty claims'], ['chart', 'Live reports']].map(([i, t]) => `<span class="lg-tag">${icon(i)}${t}</span>`).join('')}</div>
      </section>
      <section class="lg-card">
        <h2>Sign in</h2>
        <p class="lg-sub">Welcome back. Please sign in with your staff account.</p>
        <form id="login-form" class="stack" novalidate>
          <div class="field"><label for="lg-user">Username</label><input class="input" id="lg-user" name="username" autocomplete="username" placeholder="e.g. kevin" value="${h(rememberedUser())}" required></div>
          <div class="field"><label for="lg-pass">Password</label><div class="lg-pass"><input class="input" id="lg-pass" name="password" type="password" autocomplete="current-password" placeholder="••••••••" required><button class="lg-eye" type="button" aria-label="Show password" aria-pressed="false">${icon('eye')}</button></div></div>
          <label class="check lg-remember"><input type="checkbox" id="lg-remember" ${rememberedUser() ? 'checked' : ''}><span>Keep me signed in on this device<small>For 30 days. Don't tick this on a shared computer.</small></span></label>
          <button class="btn lg-submit" type="submit">Sign in <span aria-hidden="true">→</span></button>
        </form>
        <p class="lg-help">Forgot your password? Ask your administrator to reset it.</p>
        ${META.demo && META.demoAccounts.length ? `<div class="lg-demo"><div class="lg-or"><span>Demo accounts — click to sign in</span></div>
          <div class="demo-accounts">${META.demoAccounts.map((a) => `<button class="demo-acc" data-u="${h(a.username)}" data-p="${h(a.password)}" type="button">${avatar(a.name)}<div class="grow" style="min-width:0"><div class="n truncate">${h(a.name)}</div><div class="r truncate">${h(a.role)}${a.active ? '' : ' · deactivated'}</div><div class="r mono">${h(a.username)} / ${h(a.password)}</div></div></button>`).join('')}</div></div>` : ''}
      </section>
    </div>
    ${credit()}
  </div>`;
  $('.lg-eye').addEventListener('click', (ev) => {
    const btn = ev.currentTarget, inp = $('#lg-pass'), show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    btn.setAttribute('aria-pressed', String(show)); btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });
  const form = $('#login-form');
  bindForm(form, async (d) => {
    const keep = $('#lg-remember').checked;
    await login(d.username, d.password, keep);
    rememberUser(keep ? d.username : '');
    afterLogin();
  });
  $$('.demo-acc').forEach((b) => b.addEventListener('click', async () => {
    if (b.getAttribute('aria-busy')) return;
    b.setAttribute('aria-busy', 'true');
    try { await login(b.dataset.u, b.dataset.p); afterLogin(); } catch (e) { showFormError(form, e); } finally { b.removeAttribute('aria-busy'); }
  }));
  if (window.matchMedia('(min-width: 721px)').matches) (rememberedUser() ? $('#lg-pass') : $('#lg-user')).focus();
}
/* Username remembered with "Keep me signed in" so the next sign-in only needs the password */
const REMEMBER_USER_KEY = 'mobicore_remember_user';
function rememberedUser() { try { return localStorage.getItem(REMEMBER_USER_KEY) || ''; } catch (e) { return ''; } }
function rememberUser(u) { try { u ? localStorage.setItem(REMEMBER_USER_KEY, String(u).trim().toLowerCase()) : localStorage.removeItem(REMEMBER_USER_KEY); } catch (e) { /* private mode */ } }
function afterLogin() {
  $('#app').innerHTML = '';
  Object.keys(DT).forEach((k) => delete DT[k]);
  toast(`Welcome, ${currentUser.name} — signed in as ${roleOf().name}.`, 'success');
  history.replaceState(null, '', landing());
  lastPath = '';
  render();
}
async function signOut(message) {
  closeMoreSheet();
  await logout();
  Object.keys(DT).forEach((k) => delete DT[k]);
  POS.items = []; POS.customerId = ''; POS.discount = 0;
  $('#app').innerHTML = ''; $('#modal-root').innerHTML = ''; document.body.style.overflow = '';
  history.replaceState(null, '', '#/');
  renderLogin();
  if (message) toast(message, 'info');
}

/* ---------------- Shell ---------------- */
function renderShell() {
  const role = roleOf();
  const nav = NAV.map((g) => {
    const items = g.items.filter((it) => can(...it.perm));
    if (!items.length) return '';
    return `<div class="nav-group"><div class="nav-title">${g.title}</div>${items.map((it) => `<a class="nav-link" href="#/${it.key}" data-key="${it.key}">${icon(it.icon)}<span>${it.label}</span>${it.count ? `<span class="nav-count ${it.warn ? 'warn' : ''}" data-count="${it.key}" hidden></span>` : ''}</a>`).join('')}</div>`;
  }).join('');
  $('#app').innerHTML = `<div class="shell">
    <aside class="sidebar" aria-label="Main navigation">
      <div class="brand"><img class="brand-logo brand-img" src="assets/img/logo-mark.png" alt=""><div style="min-width:0"><div class="brand-name truncate">${h(db.settings.shopName)}</div><div class="brand-sub">MobiCore ERP</div></div></div>
      <nav class="nav">${nav}</nav>
      <div class="sidebar-foot"><div class="user-card">${avatar(currentUser.name)}<div class="grow" style="min-width:0"><div class="name truncate">${h(currentUser.name)}</div><div class="role truncate">${h(role.name)}</div></div><button class="icon-btn" style="color:#94a3b8" data-action="logout" aria-label="Sign out" data-tip="Sign out">${icon('logout')}</button></div></div>
    </aside>
    <div class="scrim" data-action="close-nav"></div>
    ${bottomNav()}
    <div class="main">
      <header class="topbar">
        <button class="icon-btn menu-btn" data-action="open-nav" aria-label="Show or hide menu" data-tip="Show / hide menu">${icon('menu')}</button>
        <img class="topbar-logo" src="assets/img/logo-mark.png" alt="">
        <div class="page-title truncate" id="page-title"></div>
        <div class="global-search" id="gsearch">
          <div class="input-icon">${icon('search')}<input class="input" id="gs-input" type="search" placeholder="Search IMEI, invoice, job no., customer…  ( / )" autocomplete="off" aria-label="Global search"></div>
          <div class="search-results hidden" id="gs-results"></div>
        </div>
        <div class="top-actions">
          <button class="icon-btn" id="gs-toggle" data-action="toggle-search" aria-label="Search" style="display:none">${icon('search')}</button>
          <div style="position:relative"><button class="icon-btn" data-action="notifs" aria-label="Notifications">${icon('bell')}<span class="dot-count hidden" id="notif-count"></span></button><div class="dropdown hidden" id="notif-dd"></div></div>
          <button class="icon-btn" data-action="theme" aria-label="Toggle dark mode" data-tip="Light / dark">${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}</button>
          <div style="position:relative"><button class="icon-btn" data-action="usermenu" aria-label="Account menu">${avatar(currentUser.name)}</button><div class="dropdown hidden" id="user-dd" style="width:290px"></div></div>
        </div>
      </header>
      ${META.demo ? `<div class="demo-ribbon no-print">${icon('sparkles', 'ic-sm')}<span class="grow truncate"><b>Demo</b><span class="ribbon-long"> mode — signed in as</span><span class="ribbon-short"> ·</span> <b>${h(currentUser.name)}</b> (${h(role.name)})<span class="ribbon-long">. Demo installation.</span></span><button class="btn btn-xs" data-action="switch-user">${icon('swap', 'ic-sm')} Switch user</button></div>` : ''}
      <main class="content" id="content" tabindex="-1"></main>
      ${credit()}
    </div></div>`;
  setupSearch();
  SB.init();
  const mq = window.matchMedia('(max-width: 720px)');
  const applyMq = () => { $('#gsearch').classList.toggle('collapsed', mq.matches); $('#gs-toggle').style.display = mq.matches ? 'grid' : 'none'; };
  mq.addEventListener ? mq.addEventListener('change', applyMq) : mq.addListener(applyMq);
  applyMq();
}
function updateChrome() {
  NAV.forEach((g) => g.items.forEach((it) => {
    if (!it.count) return;
    const n = it.count();
    $$(`[data-count="${it.key}"]`).forEach((el) => { el.textContent = n; el.hidden = !n; });
  }));
  const dot = $('#bn-more-dot');
  if (dot) dot.hidden = !NAV.some((g) => g.items.some((it) => it.count && it.warn && !BN_KEYS.includes(it.key) && can(...it.perm) && it.count() > 0));
  const n = getNotifications().length;
  const nc = $('#notif-count'); if (nc) { nc.textContent = n; nc.classList.toggle('hidden', !n); }
}
function closeDropdowns() { $$('.dropdown').forEach((d) => d.classList.add('hidden')); const r = $('#gs-results'); r && r.classList.add('hidden'); }

/* Developer credit, bottom of the login page and of every screen */
const APP_VERSION = '1.0.0';
function credit() {
  return `<footer class="app-credit no-print">© ${new Date().getFullYear()} Singtel Mobile. All rights reserved. · v${APP_VERSION} · Developed by Grow More Solutions Pvt Ltd · <a href="tel:+94779895511">077 989 5511</a></footer>`;
}

/* Tablet & phone bottom bar: the 4 most-used screens this role may open + More (everything else) */
let BN_KEYS = [];
function bottomNav() {
  const all = NAV.flatMap((g) => g.items);
  const pick = ['dashboard', 'pos', 'repairs', 'warranties', 'sales', 'inventory', 'imei', 'claims', 'customers', 'purchases', 'reports']
    .map((k) => all.find((it) => it.key === k)).filter((it) => it && can(...it.perm)).slice(0, 4);
  BN_KEYS = pick.map((it) => it.key);
  const short = { dashboard: 'Home', pos: 'POS', repairs: 'Repairs', warranties: 'Warranty', sales: 'Sales', inventory: 'Stock', imei: 'IMEI', claims: 'Claims', customers: 'Customers', purchases: 'Purchases', reports: 'Reports' };
  return `<nav class="bottom-nav no-print" aria-label="Quick navigation">${pick.map((it) => `<a class="bn-item" href="#/${it.key}" data-key="${it.key}">${icon(it.icon)}<span>${short[it.key]}</span>${it.count ? `<span class="bn-badge ${it.warn ? 'warn' : ''}" data-count="${it.key}" hidden></span>` : ''}</a>`).join('')}<button class="bn-item" data-action="open-more" aria-label="More screens and account">${icon('grid')}<span>More</span><span class="bn-dot" id="bn-more-dot" hidden></span></button></nav>`;
}

/* "More" sheet: the screens not on the bottom bar, grouped like the desktop menu, plus account actions */
function closeMoreSheet() {
  const s = $('#more-sheet'); if (!s) return;
  s.classList.remove('open'); document.body.classList.remove('sheet-open');
  document.removeEventListener('keydown', sheetKey);
  setTimeout(() => s.remove(), 230);
}
function sheetKey(e) { if (e.key === 'Escape') closeMoreSheet(); }
function openMoreSheet() {
  if ($('#more-sheet')) { closeMoreSheet(); return; }
  const cur = parseHash().page; const dark = document.documentElement.dataset.theme === 'dark';
  const groups = NAV.map((g) => ({ title: g.title, items: g.items.filter((it) => can(...it.perm) && !BN_KEYS.includes(it.key)) })).filter((g) => g.items.length);
  const el = document.createElement('div');
  el.id = 'more-sheet'; el.className = 'sheet-wrap no-print';
  el.innerHTML = `<div class="sheet-scrim" data-action="close-more"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="More screens">
      <div class="sheet-grip"></div>
      <div class="sheet-user">${avatar(currentUser.name)}<div class="grow" style="min-width:0"><div class="bold truncate">${h(currentUser.name)}</div><div class="xs muted truncate">${h(roleOf().name)} · ${h(db.settings.shopName)}</div></div><button class="icon-btn" data-action="close-more" aria-label="Close">${icon('x')}</button></div>
      <div class="sheet-body">
        ${groups.map((g) => `<div class="sheet-group"><div class="sheet-title">${g.title}</div><div class="sheet-grid">${g.items.map((it) => { const n = it.count ? it.count() : 0; return `<a class="sheet-tile ${it.key === cur ? 'active' : ''}" href="#/${it.key}"><span class="sheet-ic">${icon(it.icon)}${n ? `<span class="sheet-badge ${it.warn ? 'warn' : ''}">${n}</span>` : ''}</span><span>${it.label}</span></a>`; }).join('')}</div></div>`).join('')}
        <div class="sheet-group"><div class="sheet-title">Account</div><div class="sheet-list">
          <button class="menu-item" data-action="theme-sheet">${icon(dark ? 'sun' : 'moon', 'ic-sm')} ${dark ? 'Light mode' : 'Dark mode'}</button>
          <button class="menu-item" data-action="my-perms">${icon('key', 'ic-sm')} My permissions</button>
          <button class="menu-item" data-action="change-password">${icon('lock', 'ic-sm')} Change password</button>
          ${META.demo ? `<button class="menu-item" data-action="switch-user">${icon('swap', 'ic-sm')} Switch user (demo)</button>` : ''}
          <button class="menu-item danger-text" data-action="logout">${icon('logout', 'ic-sm')} Sign out</button>
        </div></div>
      </div>
    </div>`;
  document.body.appendChild(el); document.body.classList.add('sheet-open');
  document.addEventListener('keydown', sheetKey);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
  // tapping a screen or an account action closes the sheet (the action itself still runs)
  el.addEventListener('click', (e) => { if (e.target.closest('.sheet-tile, .menu-item')) closeMoreSheet(); });
}

/* ---------------- Sidebar: hide button + auto-close ---------------- */
// ☰ hides / shows the menu (remembered). While the mouse is working outside the menu it closes by itself after 10 s.
const SB = {
  KEY: 'mobicore_sidebar', DELAY: 10000, timer: null,
  state() { try { return JSON.parse(localStorage.getItem(SB.KEY) || '{}'); } catch (e) { return {}; } },
  set(patch) {
    const st = { ...SB.state(), ...patch };
    try { localStorage.setItem(SB.KEY, JSON.stringify(st)); } catch (e) { /* private mode */ }
    document.body.classList.toggle('sb-collapsed', !!st.collapsed);
  },
  init() {
    document.body.classList.toggle('sb-collapsed', !!SB.state().collapsed);
    const side = $('.sidebar');
    side.addEventListener('mouseenter', () => clearTimeout(SB.timer)); // using the menu keeps it open
    ['touchstart', 'scroll'].forEach((ev) => side.addEventListener(ev, SB.touch, { passive: true }));
    side.addEventListener('mouseleave', SB.touch);
    SB.touch();
  },
  touch() {
    clearTimeout(SB.timer);
    SB.timer = setTimeout(() => {
      const side = $('.sidebar'); if (!side) return;
      if (side.matches(':hover')) { SB.touch(); return; }
      if (window.matchMedia('(min-width: 1025px)').matches) { if (!document.body.classList.contains('sb-collapsed')) SB.set({ collapsed: true }); }
      else document.body.classList.remove('nav-open');
    }, SB.DELAY);
  },
};

/* ---------------- Global search ---------------- */
function globalSearch(q) {
  q = q.trim().toLowerCase(); if (q.length < 2) return [];
  const qn = normId(q).toLowerCase();
  const out = [];
  const add = (group, ic, title, sub, href) => out.push({ group, ic, title, sub, href });
  if (can('inventory', 'view')) db.devices.filter((d) => [d.imei1, d.imei2, d.serial].some((x) => x && x.toLowerCase().includes(qn))).slice(0, 5)
    .forEach((d) => add('Devices (IMEI / serial)', 'scan', deviceCode(d), `${productName(d.productId)} · ${DEVICE_STATUS[d.status]}`, '#/imei/' + d.id));
  if (can('sales', 'view')) visibleSales().filter((s) => s.no.toLowerCase().includes(q) || customerName(s.customerId).toLowerCase().includes(q)).slice(0, 5)
    .forEach((s) => add('Invoices', 'receipt', s.no, `${customerName(s.customerId)} · ${money(s.total)} · ${fmtDate(s.date)}`, '#/sales/' + s.id));
  if (can('repairs', 'view')) visibleRepairs().filter((r) => r.no.toLowerCase().includes(q) || (r.imei || '').includes(qn) || `${r.brand} ${r.model}`.toLowerCase().includes(q) || customerName(r.customerId).toLowerCase().includes(q)).slice(0, 5)
    .forEach((r) => add('Repair jobs', 'wrench', `${r.no} · ${r.brand} ${r.model}`, `${customerName(r.customerId)} · ${RS[r.status]}`, '#/repairs/' + r.id));
  if (can('warranties', 'view')) db.warranties.filter((w) => w.no.toLowerCase().includes(q) || (w.imei || '').includes(qn) || (w.serial || '').toLowerCase().includes(qn) || (w.invoiceNo || '').toLowerCase() === q || (w.jobNo || '').toLowerCase() === q).slice(0, 5)
    .forEach((w) => add('Warranties', 'shield', `${w.no} · ${w.kind === 'repair' ? 'Repair' : 'Product'} warranty`, `${customerName(w.customerId)} · ${TONES.warranty[wStatus(w)][0]} · until ${fmtDate(warrantyEnd(w))}`, '#/warranties/' + w.id));
  if (can('customers', 'view')) db.customers.filter((c) => c.name.toLowerCase().includes(q) || c.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '') || '#') || c.code.toLowerCase() === q).slice(0, 5)
    .forEach((c) => add('Customers', 'user', c.name, `${c.phone} · ${c.code}`, '#/customers/' + c.id));
  if (can('products', 'view')) db.products.filter((p) => [p.name, p.sku, p.barcode, p.code, p.brand].some((x) => x && x.toLowerCase().includes(q))).slice(0, 5)
    .forEach((p) => add('Products', 'package', p.name, `${p.sku} · ${stockOf(p)} in stock · ${money(p.price)}`, '#/products?q=' + encodeURIComponent(p.sku)));
  return out;
}
function setupSearch() {
  const input = $('#gs-input'), box = $('#gs-results');
  let focus = -1, items = [];
  const draw = () => {
    items = globalSearch(input.value);
    if (!input.value.trim()) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    if (!items.length) { box.innerHTML = `<div class="empty" style="padding:20px">${icon('search')}<div>No matches for “${h(input.value)}”</div></div>`; return; }
    let g = ''; box.innerHTML = items.map((r, i) => { const head = r.group !== g ? `<div class="sr-group">${h(r.group)}</div>` : ''; g = r.group; return `${head}<a class="sr-item ${i === focus ? 'focus' : ''}" href="${r.href}">${icon(r.ic)}<div class="grow" style="min-width:0"><div class="truncate bold">${h(r.title)}</div><div class="small muted truncate">${h(r.sub)}</div></div></a>`; }).join('');
  };
  input.addEventListener('input', () => { focus = -1; draw(); });
  input.addEventListener('focus', draw);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { focus = Math.min(items.length - 1, focus + 1); draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { focus = Math.max(0, focus - 1); draw(); e.preventDefault(); }
    else if (e.key === 'Enter' && items.length) { location.hash = items[Math.max(0, focus)].href; input.value = ''; box.classList.add('hidden'); input.blur(); }
    else if (e.key === 'Escape') { input.value = ''; box.classList.add('hidden'); input.blur(); }
  });
  box.addEventListener('click', (e) => { if (e.target.closest('a')) { input.value = ''; box.classList.add('hidden'); } });
}

/* ---------------- Global actions ---------------- */
Object.assign(ACT, {
  go: (el) => { location.hash = el.dataset.href; },
  'open-nav': () => {
    if (window.matchMedia('(min-width: 1025px)').matches) { SB.set({ collapsed: !document.body.classList.contains('sb-collapsed') }); }
    else document.body.classList.add('nav-open');
    SB.touch();
  },
  'close-nav': () => document.body.classList.remove('nav-open'),
  'open-more': () => openMoreSheet(),
  'close-more': () => closeMoreSheet(),
  'theme-sheet': () => { const b = $('.top-actions [data-action=theme]'); if (b) ACT.theme(b); },
  'toggle-search': () => { const g = $('#gsearch'); g.classList.toggle('collapsed'); if (!g.classList.contains('collapsed')) $('#gs-input').focus(); },
  theme: (el) => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
    el.innerHTML = icon(next === 'dark' ? 'sun' : 'moon');
  },
  notifs: () => {
    const dd = $('#notif-dd'); const open = dd.classList.contains('hidden'); closeDropdowns();
    if (!open) return;
    const list = getNotifications();
    dd.innerHTML = `<div class="dropdown-head"><b>Notifications</b><span class="small muted">${list.length} alert${list.length === 1 ? '' : 's'}</span></div><div class="dropdown-body">${list.length ? list.map((n) => `<a class="notif" href="${n.href}"><span class="notif-icon tone-${n.tone}">${icon(n.icon, 'ic-sm')}</span><div class="grow" style="min-width:0"><div class="bold small">${h(n.title)}</div><div class="xs muted">${h(n.text)}</div></div></a>`).join('') : emptyState('bell', 'All caught up', 'No alerts right now.')}</div>`;
    dd.classList.remove('hidden');
  },
  usermenu: () => {
    const dd = $('#user-dd'); const open = dd.classList.contains('hidden'); closeDropdowns();
    if (!open) return;
    dd.innerHTML = `<div class="dropdown-head"><div class="flex">${avatar(currentUser.name)}<div><div class="bold">${h(currentUser.name)}</div><div class="xs muted">@${h(currentUser.username)} · ${h(roleOf().name)}</div></div></div></div>
      <button class="menu-item" data-action="my-perms">${icon('key', 'ic-sm')} My permissions</button>
      <button class="menu-item" data-action="change-password">${icon('lock', 'ic-sm')} Change password</button>
      ${META.demo ? `<button class="menu-item" data-action="switch-user">${icon('swap', 'ic-sm')} Switch user (demo)</button>` : ''}
      <button class="menu-item" data-action="logout">${icon('logout', 'ic-sm')} Sign out</button>`;
    dd.classList.remove('hidden');
  },
  'my-perms': () => {
    const r = roleOf();
    openModal({ title: `My permissions — ${h(r.name)}`, size: 'lg', body: r.isAdmin ? `<div class="alert alert-info">${icon('info')}<div>Administrators have full access to every module and action.</div></div>` :
      `<p class="muted">${h(r.description || '')}</p><div class="stack-sm">${MODULES.map((m) => { const a = r.perms[m.key] || []; return `<div class="flex between flex-wrap" style="padding:8px 0;border-bottom:1px solid var(--border)"><b>${m.label}</b><div class="flex flex-wrap" style="gap:4px">${a.length ? a.map((x) => badge(ACTION_LABEL[x], 'blue', 'no-dot')).join('') : badge('No access', 'gray', 'no-dot')}</div></div>`; }).join('')}</div>`,
      foot: '<button class="btn" data-dismiss>Close</button>' });
  },
  logout: () => signOut(),
  'change-password': () => {
    const m = openModal({ title: 'Change password', size: 'sm',
      body: `<form id="pw-form" class="stack" novalidate>${field('Current password', '<input class="input" type="password" name="current_password" autocomplete="current-password" required>', { req: true })}${field('New password', '<input class="input" type="password" name="password" autocomplete="new-password" required>', { req: true, hint: 'At least 8 characters.' })}${field('Repeat new password', '<input class="input" type="password" name="password_confirmation" autocomplete="new-password" required>', { req: true })}</form>`,
      foot: `<button class="btn" data-dismiss>Cancel</button><button class="btn btn-primary" type="submit" form="pw-form">Update password</button>`,
      onMount(el) { bindForm($('#pw-form', el), async (d) => { await api('POST', '/auth/password', d); m.close(); toast('Password updated. Other devices were signed out.'); }); } });
  },
  'switch-user': () => {
    if (!META.demo) return;
    const m = openModal({ title: 'Switch user (demo)', body: `<p class="muted small">Demonstrates role-based access. In production each staff member signs in with their own password.</p><div class="pick-list">${META.demoAccounts.filter((a) => a.username !== currentUser.username).map((a) => `<button class="pick" data-u="${h(a.username)}" data-p="${h(a.password)}">${avatar(a.name)}<div class="grow"><div class="bold">${h(a.name)}</div><div class="small muted">${h(a.role)} · @${h(a.username)}</div></div>${a.active ? icon('chevronRight') : badge('Deactivated', 'red')}</button>`).join('')}</div>`,
      onMount(el) {
        $$('[data-u]', el).forEach((b) => b.addEventListener('click', async () => {
          try {
            await logout(); await login(b.dataset.u, b.dataset.p);
            m.close(); $('#app').innerHTML = ''; afterLogin();
          } catch (e) { m.close(); await signOut(); handleError(e); }
        }));
      } });
  },
  'dt-sort': (el) => { const s = DT[el.dataset.dt]; const i = Number(el.dataset.i); s.sort = s.sort && s.sort.i === i ? { i, dir: -s.sort.dir } : { i, dir: 1 }; dtRefresh(el.dataset.dt); },
  'dt-page': (el) => { DT[el.dataset.dt].page = Number(el.dataset.p); dtRefresh(el.dataset.dt); const t = $('#dt-' + el.dataset.dt); t && t.scrollIntoView({ block: 'start', behavior: 'smooth' }); },
  tab: (el) => setQuery({ tab: el.dataset.tab }),
  pdf: async (el) => { await downloadPdf(el.dataset.path, el.dataset.name); toast(`${el.dataset.name}.pdf downloaded.`); },
  print: (el) => ACT['print-' + el.dataset.kind] && ACT['print-' + el.dataset.kind](el),
});

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) {
    if (!e.target.closest('.dropdown') && !e.target.closest('.global-search')) closeDropdowns();
    return;
  }
  if (el.disabled || el.getAttribute('aria-disabled') === 'true') return;
  const fn = ACT[el.dataset.action];
  if (!fn) return;
  if (el.tagName === 'TR' && e.target.closest('a,button,input,select,label')) return;
  if (el.tagName === 'A' || el.tagName === 'BUTTON' || el.tagName === 'TR') e.preventDefault();
  if (el.getAttribute('aria-busy') === 'true') return;
  try {
    const r = fn(el, e);
    if (r && r.then) { el.setAttribute('aria-busy', 'true'); r.catch(handleError).finally(() => el.removeAttribute('aria-busy')); }
  } catch (err) { handleError(err); }
});
let dtTimer;
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset && el.dataset.dtSearch) { clearTimeout(dtTimer); dtTimer = setTimeout(() => { const s = DT[el.dataset.dtSearch]; if (!s) return; s.q = el.value; s.page = 1; dtRefresh(el.dataset.dtSearch); }, 150); }
});
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset && el.dataset.dtFilter) { const s = DT[el.dataset.dtFilter]; s.filters[el.dataset.key] = el.value; s.page = 1; dtRefresh(el.dataset.dtFilter); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('#modal-root').children.length) { closeTopModal(); return; }
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  if (!currentUser || typing || $('#modal-root').children.length) return;
  if (e.key === '/') { const i = $('#gs-input'); if (i) { e.preventDefault(); $('#gsearch').classList.remove('collapsed'); i.focus(); } }
  if (e.key === 'F2' && can('pos', 'view')) { e.preventDefault(); location.hash = '#/pos'; }
});
// Tooltips
(() => {
  let tip = null;
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-tip]');
    if (!el) { if (tip) { tip.remove(); tip = null; } return; }
    if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; document.body.appendChild(tip); }
    tip.textContent = el.dataset.tip;
  });
  document.addEventListener('mousemove', (e) => {
    if (!tip) return;
    const w = tip.offsetWidth, hgt = tip.offsetHeight;
    tip.style.left = Math.min(window.innerWidth - w - 8, e.clientX + 12) + 'px';
    tip.style.top = Math.max(8, e.clientY - hgt - 12) + 'px';
  });
  document.addEventListener('scroll', () => { if (tip) { tip.remove(); tip = null; } }, true);
})();

window.addEventListener('hashchange', render);
window.addEventListener('session-expired', () => { if ($('.shell')) signOut('Your session has expired. Please sign in again.'); });

// Pick up changes made by other staff. Pages with an open form are not redrawn, so nobody loses what they are typing.
setInterval(async () => {
  if (!currentUser || document.hidden || $('#modal-root').children.length) return;
  try {
    const changed = await syncData();
    if (!changed) return;
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (!typing && !$('#content form')) refresh(); else updateChrome();
  } catch (e) { /* offline — try again next time */ }
}, 45000);

/* ---------------- Boot ---------------- */
async function boot() {
  let theme = null;
  try { theme = localStorage.getItem(THEME_KEY); } catch (e) { /* ignore */ }
  if (!theme) theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  $('#app').innerHTML = `<div class="boot"><img class="brand-logo brand-img" style="width:56px;height:56px" src="assets/img/logo-mark.png" alt=""><div class="muted small">Loading…</div></div>`;
  await loadMeta();
  if (await restoreSession()) render(); else renderLogin();
}
