/* =========================================================
   Bulk IMEI / serial scanner.
   Works with USB / Bluetooth barcode scanners (they type the code + Enter),
   pasted lists, and the device camera where the browser supports it.
   Modes:
     receive – register new units for one model (validates check digit + duplicates)
     sell    – add many in-stock units to the POS cart
     audit   – stock check: compares scanned units with what the system expects
   ========================================================= */
'use strict';

function beep(ok) {
  try {
    const ctx = beep.ctx || (beep.ctx = new (window.AudioContext || window.webkitAudioContext)());
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = ok ? 1320 : 260; g.gain.value = 0.04;
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + (ok ? 0.07 : 0.28));
  } catch (e) { /* audio not available */ }
}

function openBulkScanner({ mode, productId = '', expected = 0, existing = [], taken = [], title, onDone }) {
  const serialProducts = db.products.filter((p) => p.serialized && p.active);
  let prodId = productId;
  let dual = false;
  let pending = null;           // first IMEI of a dual-SIM pair waiting for its second scan
  const rows = [];              // { codes:[..], ok, msg, deviceId, tone }
  const takenSet = new Set(taken);
  existing.forEach((u) => rows.push({ codes: [u.imei1 || u.serial, u.imei2].filter(Boolean), ok: true, msg: 'Previously entered', tone: 'green' }));
  let stream = null, camTimer = null, drawFn = null;
  const recent = new Map();     // camera de-bounce

  const prod = () => find('products', prodId);
  const isImei = () => !prod() || prod().idType === 'imei';
  const accepted = () => rows.filter((r) => r.ok);
  const allCodes = () => new Set(rows.filter((r) => r.ok).flatMap((r) => r.codes.map(normId)).concat(pending ? [normId(pending)] : []));

  function check(code) {
    const k = normId(code);
    if (!k) return { ok: false, msg: 'Empty scan' };
    if (allCodes().has(k)) return { ok: false, msg: 'Already scanned in this batch' };
    if (mode === 'receive') {
      const p = prod();
      if (!p) return { ok: false, msg: 'Select the model first' };
      if (p.idType === 'imei' && !validImei(k)) return { ok: false, msg: /^\d+$/.test(k) && k.length !== 15 ? `Not an IMEI (${k.length} digits)` : 'Invalid IMEI — check digit failed' };
      if (p.idType !== 'imei' && k.length < 5) return { ok: false, msg: 'Serial too short' };
      const ex = findDeviceByCode(k);
      if (ex) return { ok: false, msg: `Already registered: ${productName(ex.productId)} (${DEVICE_STATUS[ex.status]})` };
      return { ok: true, msg: 'New unit' };
    }
    const d = findDeviceByCode(k);
    if (mode === 'sell') {
      if (!d) return { ok: false, msg: 'Unknown IMEI / serial — not in stock records' };
      if (prodId && d.productId !== prodId) return { ok: false, msg: `Different model: ${productName(d.productId)}` };
      if (d.status !== 'in_stock') return { ok: false, msg: `Not available — ${DEVICE_STATUS[d.status]}` };
      if (takenSet.has(d.id)) return { ok: false, msg: 'Already in the cart' };
      if (rows.some((r) => r.deviceId === d.id)) return { ok: false, msg: 'Already scanned in this batch' };
      return { ok: true, msg: productName(d.productId), deviceId: d.id };
    }
    // audit
    if (!d) return { ok: true, msg: 'NOT IN SYSTEM — unknown unit', tone: 'red', audit: 'unknown' };
    if (rows.some((r) => r.deviceId === d.id)) return { ok: false, msg: 'Already scanned in this batch' };
    if (prodId && d.productId !== prodId) return { ok: true, msg: `Wrong shelf — ${productName(d.productId)}`, tone: 'amber', deviceId: d.id, audit: 'other' };
    if (d.status === 'in_stock') return { ok: true, msg: `${productName(d.productId)} — in stock ✓`, tone: 'green', deviceId: d.id, audit: 'match' };
    return { ok: true, msg: `${productName(d.productId)} — system says ${DEVICE_STATUS[d.status]}`, tone: 'amber', deviceId: d.id, audit: 'mismatch' };
  }

  function add(raw) {
    const code = String(raw || '').trim();
    if (!code) return;
    // a phone box sometimes encodes "IMEI1/IMEI2" or "IMEI:xxxx" — keep only the digits groups
    const parts = code.match(/\d{15}/g);
    const codes = parts && parts.length > 1 ? parts : [code.replace(/^IMEI[:\s]*/i, '')];
    codes.forEach(addOne);
    draw();
  }
  function addOne(code) {
    const r = check(code);
    if (!r.ok) { beep(false); rows.unshift({ codes: [code], ok: false, msg: r.msg, tone: 'red' }); return; }
    if (mode === 'receive' && dual && isImei()) {
      if (!pending) { pending = normId(code); beep(true); return; }
      rows.unshift({ codes: [pending, normId(code)], ok: true, msg: 'New unit (dual SIM)', tone: 'green' }); pending = null; beep(true); return;
    }
    beep(r.tone !== 'red' && r.tone !== 'amber');
    rows.unshift({ codes: [normId(code)], ok: true, msg: r.msg, tone: r.tone || 'green', deviceId: r.deviceId, audit: r.audit });
  }

  const showProduct = mode !== 'sell' || !productId;
  const m = openModal({
    title: title || { receive: 'Bulk scan — receive units', sell: 'Bulk scan — sell units', audit: 'Stock check (IMEI audit)' }[mode], size: 'lg',
    body: `<div class="stack">
      <div class="form-grid">
        ${showProduct ? field(mode === 'audit' ? 'Model / shelf being counted' : 'Model', `<select class="select" id="bs-prod" ${mode === 'receive' && productId ? 'disabled' : ''}>${opts(serialProducts.map((p) => [p.id, `${p.name}${mode !== 'receive' ? ` (${stockOf(p)} in stock)` : ''}`]), prodId, mode === 'receive' ? 'Select model…' : 'Any model')}</select>`) : ''}
        ${mode === 'receive' ? `<div class="field"><label>IMEI pairing</label><label class="check" id="bs-dual-wrap"><input type="checkbox" id="bs-dual"> Dual-SIM box: scan IMEI 1 then IMEI 2 for each unit</label></div>` : ''}
      </div>
      <div class="field"><label>Scan or type, then Enter — you can also paste a whole list</label>
        <div class="flex"><div class="input-icon">${icon('scan')}<input class="input mono" id="bs-in" style="height:48px;font-size:16px" placeholder="Ready to scan…" autocomplete="off" autofocus></div>
        <button type="button" class="btn" id="bs-cam" style="height:48px">${icon('camera')} Camera</button></div>
        <span class="hint" id="bs-pending"></span></div>
      <div id="bs-cam-box" class="hidden"><video id="bs-video" playsinline muted style="width:100%;max-height:260px;border-radius:10px;background:#000;object-fit:cover"></video><div class="xs muted mt-sm">Point the camera at the IMEI barcode on the box or under the battery tray. Codes are added automatically.</div></div>
      <div class="flex between flex-wrap" id="bs-sum"></div>
      <div class="pick-list" id="bs-rows" style="max-height:300px"></div>
      <div id="bs-audit"></div>
    </div>`,
    foot: `<button type="button" class="btn btn-ghost" id="bs-clear">Clear errors</button>${mode === 'audit' ? `<button type="button" class="btn" id="bs-export">${icon('download')} Export result</button>` : ''}<button class="btn" data-dismiss>${mode === 'audit' ? 'Close' : 'Cancel'}</button>${mode !== 'audit' ? '<button class="btn btn-primary" id="bs-done"></button>' : ''}`,
    onClose() { stopCam(); },
    onMount(el) {
      const input = $('#bs-in', el);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); add(input.value); input.value = ''; } });
      input.addEventListener('paste', (e) => {
        const text = (e.clipboardData || window.clipboardData).getData('text');
        if (/[\s,;]/.test(text.trim())) { e.preventDefault(); text.split(/[\s,;]+/).filter(Boolean).forEach(addOne); draw(); }
      });
      const ps = $('#bs-prod', el);
      ps && ps.addEventListener('change', () => { prodId = ps.value; const dw = $('#bs-dual-wrap', el); if (dw) dw.classList.toggle('hidden', !isImei()); draw(); input.focus(); });
      const dc = $('#bs-dual', el);
      dc && dc.addEventListener('change', () => { dual = dc.checked; pending = null; draw(); input.focus(); });
      if (dc && prod() && (prod().brand === 'Apple' || !isImei())) $('#bs-dual-wrap', el).classList.add('hidden');
      $('#bs-clear', el).addEventListener('click', () => { for (let i = rows.length - 1; i >= 0; i--) if (!rows[i].ok) rows.splice(i, 1); draw(); input.focus(); });
      const done = $('#bs-done', el);
      done && done.addEventListener('click', () => {
        if (pending) { toast('The last unit is waiting for its second IMEI.', 'warning'); return; }
        const ok = accepted();
        if (!ok.length) { toast('Nothing scanned yet.', 'warning'); return; }
        stopCam(); m.close();
        onDone && onDone(ok.map((r) => ({ imei1: isImei() ? r.codes[0] : '', imei2: r.codes[1] || '', serial: isImei() ? '' : r.codes[0], deviceId: r.deviceId })), prodId);
      });
      const ex = $('#bs-export', el);
      ex && ex.addEventListener('click', () => {
        const res = auditResult();
        exportCSV(`stock-check-${todayISO()}`, ['IMEI / serial', 'Product', 'Result'], [
          ...rows.filter((r) => r.ok).map((r) => [r.codes[0], r.deviceId ? productName(find('devices', r.deviceId).productId) : '—', r.msg]),
          ...res.missing.map((d) => [deviceCode(d), productName(d.productId), 'MISSING — in system but not scanned']),
        ]);
      });
      const camBtn = $('#bs-cam', el);
      if (!('BarcodeDetector' in window)) { camBtn.title = 'Camera scanning needs Chrome / Edge on Android or a supported browser. USB & Bluetooth scanners work everywhere.'; }
      camBtn.addEventListener('click', () => (stream ? stopCam() : startCam(el)));
      draw();
      function draw() {
        const ok = accepted(), bad = rows.filter((r) => !r.ok);
        const want = mode === 'receive' ? Number(expected) || 0 : 0;
        $('#bs-sum', el).innerHTML = `<div class="flex flex-wrap">${badge(`${ok.length} accepted`, 'green')}${bad.length ? badge(`${bad.length} rejected`, 'red') : ''}${want ? badge(`${ok.length} / ${want} ordered`, ok.length === want ? 'green' : 'amber') : ''}</div>${prod() ? `<span class="small muted">${h(prod().name)}</span>` : ''}`;
        $('#bs-pending', el).innerHTML = pending ? `<span class="warning-text">IMEI 1 <span class="mono">${h(pending)}</span> scanned — now scan IMEI 2 of the same box.</span>` : '';
        $('#bs-rows', el).innerHTML = rows.map((r, i) => `<div class="pick" style="cursor:default;border-color:${r.tone === 'red' ? 'var(--danger)' : r.tone === 'amber' ? 'var(--warning)' : 'var(--border)'}"><span class="kpi-icon tone-${r.tone || 'green'}">${icon(r.ok && r.tone !== 'red' ? 'check' : 'x', 'ic-sm')}</span><div class="grow" style="min-width:0"><div class="mono bold small">${r.codes.map(h).join(' · ')}</div><div class="xs ${r.ok ? 'muted' : 'danger-text'}">${h(r.msg)}</div></div>${r.ok && mode !== 'audit' || mode === 'audit' ? `<button type="button" class="btn btn-xs btn-ghost" data-rm="${i}" aria-label="Remove">${icon('x', 'ic-sm')}</button>` : ''}</div>`).join('') || `<div class="empty" style="padding:24px">${icon('scan')}<div class="small">Scanned codes appear here. Each scan is checked instantly.</div></div>`;
        $$('[data-rm]', el).forEach((b) => b.addEventListener('click', () => { rows.splice(Number(b.dataset.rm), 1); draw(); input.focus(); }));
        if (done) { done.innerHTML = `${icon('check')} ${mode === 'receive' ? `Use ${ok.length} unit${ok.length === 1 ? '' : 's'}` : `Add ${ok.length} to cart`}`; done.disabled = !ok.length; }
        if (mode === 'audit') {
          const res = auditResult();
          $('#bs-audit', el).innerHTML = `<div class="mini-stats"><div class="mini-stat"><div class="v">${res.expected.length}</div><div class="l">Expected in stock${prod() ? '' : ' (all models)'}</div></div><div class="mini-stat"><div class="v success-text">${res.match}</div><div class="l">Matched</div></div><div class="mini-stat"><div class="v danger-text">${res.missing.length}</div><div class="l">Missing (not scanned)</div></div><div class="mini-stat"><div class="v warning-text">${res.issues}</div><div class="l">Unknown / wrong status</div></div></div>
            ${res.missing.length && ok.length ? `<details class="mt-sm"><summary class="small" style="cursor:pointer">Show ${res.missing.length} missing unit(s)</summary><div class="xs mono mt-sm">${res.missing.map((d) => `${h(deviceCode(d))} — ${h(productName(d.productId))}`).join('<br>')}</div></details>` : ''}`;
        }
      }
      drawFn = draw;
    },
  });
  function draw() { drawFn && drawFn(); }
  function auditResult() {
    const expectedUnits = db.devices.filter((d) => d.status === 'in_stock' && (!prodId || d.productId === prodId));
    const scanned = new Set(rows.filter((r) => r.ok && r.deviceId).map((r) => r.deviceId));
    return { expected: expectedUnits, match: rows.filter((r) => r.audit === 'match').length, missing: expectedUnits.filter((d) => !scanned.has(d.id)), issues: rows.filter((r) => r.audit && r.audit !== 'match').length };
  }
  async function startCam(el) {
    if (!('BarcodeDetector' in window)) { toast('Camera scanning is not supported in this browser. Use Chrome on Android, or a USB / Bluetooth scanner.', 'warning', 6000); return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const v = $('#bs-video', el); v.srcObject = stream; await v.play();
      $('#bs-cam-box', el).classList.remove('hidden'); $('#bs-cam', el).innerHTML = `${icon('x')} Stop camera`;
      const det = new window.BarcodeDetector({ formats: ['code_128', 'code_39', 'ean_13', 'qr_code', 'data_matrix'] });
      camTimer = setInterval(async () => {
        try {
          const codes = await det.detect(v);
          codes.forEach((c) => { const val = c.rawValue.trim(); const last = recent.get(val); if (last && Date.now() - last < 4000) return; recent.set(val, Date.now()); add(val); });
        } catch (e) { /* frame not ready */ }
      }, 300);
    } catch (e) { toast('Could not open the camera: ' + e.message, 'error'); stopCam(); }
  }
  function stopCam() {
    if (camTimer) clearInterval(camTimer); camTimer = null;
    if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null;
    const box = m && m.el && $('#bs-cam-box', m.el); if (box) box.classList.add('hidden');
    const b = m && m.el && $('#bs-cam', m.el); if (b) b.innerHTML = `${icon('camera')} Camera`;
  }
  return m;
}
