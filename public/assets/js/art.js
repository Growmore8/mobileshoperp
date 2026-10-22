/* Built-in product illustrations (inline SVG). Used whenever a product has no uploaded photo.
   Drawn from the product's type, brand and colour, so they work offline and need no image licences. */
'use strict';

const ART_COLORS = {
  'onyx black': '#2a2c33', 'blue black': '#1f2b45', black: '#23242a', midnight: '#1c2333', 'midnight black': '#1b1c22', 'iron gray': '#596069',
  obsidian: '#2b2b30', 'peacock green': '#2d7d6c', 'wave green': '#79b8a6', 'navigator beige': '#cdb994', 'phantom black': '#26272c', graphite: '#4a4e55',
  blue: '#4a78c2', purple: '#8e7cc3', white: '#e9eaee', red: '#c0392b', gold: '#d8b77a', silver: '#c7ccd3',
};
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
function artKind(p) {
  const n = (p.name || '').toLowerCase();
  const kind = catKind(p.categoryId);
  if (kind === 'watch' || n.includes('watch')) return 'watch';
  if (kind === 'phone') return 'phone';
  if (kind === 'parts') {
    if (n.includes('back glass')) return 'backglass';
    if (n.includes('display') || n.includes('oled') || n.includes('amoled')) return 'display';
    if (n.includes('battery')) return 'battery';
    if (n.includes('port') || n.includes('flex')) return 'flex';
    if (n.includes('speaker')) return 'spkmod';
    return 'box';
  }
  if (n.includes('car charger')) return 'car';
  if (n.includes('cable')) return 'cable';
  if (n.includes('adapter') || n.includes('charger')) return 'charger';
  if (n.includes('buds') || n.includes('earbud')) return 'buds';
  if (n.includes('earphone') || n.includes('wired')) return 'wired';
  if (n.includes('power bank')) return 'powerbank';
  if (n.includes('speaker')) return 'speaker';
  if (n.includes('tempered') || n.includes('screen guard') || n.includes('glass')) return 'glass';
  if (n.includes('case')) return 'case';
  return 'box';
}
function productArt(p) {
  const kind = artKind(p);
  const id = 'a' + String(p.id || Math.random()).replace(/\W/g, '');
  const brand = p.brand || '';
  const col = ART_COLORS[(p.color || '').toLowerCase()] || ({ phone: '#33363d', watch: '#3a3d44', powerbank: '#2f3540', car: '#2d3036', speaker: '#2f4f6f', case: '#5b8def', cable: '#2b2f36' }[kind] || '#3b4250');
  const dark = shade(col, -0.12), light = shade(col, 0.14);
  const lens = (x, y, r = 3.4) => `<circle cx="${x}" cy="${y}" r="${r + 1.2}" fill="${shade(col, -0.2)}"/><circle cx="${x}" cy="${y}" r="${r}" fill="#0b0c10"/><circle cx="${x - r * 0.35}" cy="${y - r * 0.35}" r="${r * 0.3}" fill="#5b6b8c" opacity=".8"/>`;
  const defs = `<defs>
    <linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d8dff"/><stop offset=".55" stop-color="#7a4fd6"/><stop offset="1" stop-color="#e05a8a"/></linearGradient>
    <linearGradient id="${id}b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient>
    <linearGradient id="${id}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dfe3ea"/></linearGradient>
    <linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".75"/><stop offset=".5" stop-color="#cfe3ff" stop-opacity=".35"/><stop offset="1" stop-color="#ffffff" stop-opacity=".6"/></linearGradient>
  </defs>`;
  const shadow = (cx, w) => `<ellipse cx="${cx}" cy="95" rx="${w}" ry="3.2" fill="#0f172a" opacity=".12"/>`;
  let g = '';
  switch (kind) {
    case 'phone': {
      let cam;
      if (brand === 'Apple') cam = `<rect x="83" y="13" width="19" height="19" rx="5.5" fill="${shade(col, 0.06)}" stroke="${shade(col, -0.15)}" stroke-width=".8"/>${lens(88.5, 18.5, 3)}${lens(96.5, 26.5, 3)}<circle cx="97" cy="18" r="1.2" fill="#f5e7b8"/>`;
      else if (brand === 'Google') cam = `<rect x="78" y="20" width="40" height="10" rx="5" fill="#15161a"/>${lens(89, 25, 2.8)}${lens(98, 25, 2.8)}`;
      else if (brand === 'Samsung') cam = `${lens(86, 17, 3)}${lens(86, 26, 3)}${lens(86, 35, 3)}<circle cx="93" cy="17" r="1.1" fill="#f5e7b8"/>`;
      else cam = `<rect x="82" y="12" width="22" height="22" rx="6" fill="${shade(col, -0.08)}"/>${lens(88.5, 18.5, 3.2)}${lens(97.5, 18.5, 2.4)}${lens(88.5, 27.5, 2.4)}<circle cx="97.5" cy="27.5" r="1.3" fill="#f5e7b8"/>`;
      g = `${shadow(80, 38)}
        <g transform="rotate(9 98 52)"><rect x="78" y="8" width="40" height="84" rx="8.5" fill="url(#${id}b)"/><rect x="78" y="8" width="40" height="84" rx="8.5" fill="none" stroke="${shade(col, -0.25)}" stroke-width=".8"/>${cam}</g>
        <rect x="42" y="9" width="41" height="84" rx="8.5" fill="#111318"/><rect x="44.5" y="11.5" width="36" height="79" rx="6.5" fill="url(#${id}s)"/>
        <circle cx="62.5" cy="17" r="1.7" fill="#0b0c10"/><text x="62.5" y="36" text-anchor="middle" font-family="Inter,Arial" font-size="9" font-weight="700" fill="#fff" opacity=".95">10:24</text>
        ${[0, 1, 2, 3].map((i) => `<rect x="${48.5 + i * 7.6}" y="74" width="5.4" height="5.4" rx="1.6" fill="#fff" opacity=".55"/>`).join('')}
        <path d="M44.5 55 Q62 45 80.5 58 L80.5 84 Q80.5 90.5 74 90.5 L51 90.5 Q44.5 90.5 44.5 84 Z" fill="#fff" opacity=".08"/>`;
      break;
    }
    case 'watch': {
      const round = brand === 'Samsung';
      g = `${shadow(80, 26)}<rect x="68" y="2" width="24" height="96" rx="7" fill="${shade(col, -0.05)}"/>${[14, 22, 78, 86].map((y) => `<rect x="71" y="${y}" width="18" height="1.4" rx=".7" fill="#000" opacity=".18"/>`).join('')}
        ${round ? `<circle cx="80" cy="50" r="25" fill="url(#${id}b)"/><circle cx="80" cy="50" r="20" fill="#0b0c10"/><circle cx="80" cy="50" r="17" fill="none" stroke="url(#${id}s)" stroke-width="3"/><rect x="104" y="42" width="3.5" height="7" rx="1.5" fill="${dark}"/><rect x="104" y="53" width="3.5" height="7" rx="1.5" fill="${dark}"/>`
          : `<rect x="56" y="24" width="48" height="54" rx="13" fill="url(#${id}b)"/><rect x="60" y="28" width="40" height="46" rx="10" fill="#0b0c10"/><circle cx="72" cy="45" r="5" fill="#ff5a5f"/><circle cx="86" cy="45" r="5" fill="#7ee081"/><circle cx="79" cy="58" r="5" fill="#5ac8fa"/><rect x="104" y="40" width="4" height="9" rx="2" fill="${dark}"/>`}
        <text x="80" y="${round ? 53 : 69}" text-anchor="middle" font-family="Inter,Arial" font-size="${round ? 8 : 6}" font-weight="700" fill="#fff">${round ? '10:24' : ''}</text>`;
      break;
    }
    case 'charger': {
      const white = brand === 'Apple';
      const body = white ? `url(#${id}w)` : '#25272d';
      g = `${shadow(80, 26)}<rect x="66" y="74" width="5" height="16" rx="1.5" fill="#b9c0ca"/><rect x="89" y="74" width="5" height="16" rx="1.5" fill="#b9c0ca"/>
        <rect x="54" y="18" width="52" height="58" rx="11" fill="${body}" stroke="${white ? '#cfd5de' : '#16171b'}"/><rect x="73" y="40" width="14" height="5.5" rx="2.75" fill="${white ? '#3b3f47' : '#0b0c10'}"/>
        <path d="M58 24 Q80 18 102 24" stroke="#fff" stroke-opacity="${white ? '.9' : '.15'}" stroke-width="2" fill="none"/><text x="80" y="62" text-anchor="middle" font-family="Inter,Arial" font-size="7" font-weight="700" fill="${white ? '#9aa2ae' : '#6b7280'}">${brand === 'Samsung' ? '25W' : '20W'}</text>`;
      break;
    }
    case 'cable': {
      const white = /lightning/i.test(p.name);
      const c = white ? '#e7e9ee' : '#2b2f36';
      g = `${shadow(80, 40)}<path d="M38 70 C38 26 76 22 82 46 C88 70 122 72 124 34" stroke="${shade(c, -0.08)}" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M38 70 C38 26 76 22 82 46 C88 70 122 72 124 34" stroke="${c}" stroke-width="5" fill="none" stroke-linecap="round" stroke-dasharray="2.4 1.6"/>
        <rect x="31" y="66" width="14" height="20" rx="3.5" fill="#d7dbe2" stroke="#aeb5bf"/><rect x="34.5" y="84" width="7" height="8" rx="1.5" fill="#9aa2ae"/>
        <rect x="117" y="16" width="14" height="20" rx="3.5" fill="#d7dbe2" stroke="#aeb5bf"/><rect x="120.5" y="9" width="7" height="8" rx="${white ? 1 : 3}" fill="${white ? '#d9b65b' : '#9aa2ae'}"/>`;
      break;
    }
    case 'buds':
      g = `${shadow(80, 32)}<rect x="50" y="42" width="60" height="46" rx="21" fill="url(#${id}w)" stroke="#cfd5de"/><path d="M51 58 H109" stroke="#cfd5de" stroke-width="1.2"/><circle cx="80" cy="74" r="1.8" fill="#7ee081"/>
        <g><circle cx="62" cy="28" r="10" fill="#f3f4f6" stroke="#cfd5de"/><circle cx="62" cy="28" r="5" fill="#2b2f36"/><rect x="66" y="31" width="6" height="16" rx="3" transform="rotate(-25 69 39)" fill="#f3f4f6" stroke="#cfd5de"/></g>
        <g><circle cx="98" cy="28" r="10" fill="#f3f4f6" stroke="#cfd5de"/><circle cx="98" cy="28" r="5" fill="#2b2f36"/><rect x="88" y="31" width="6" height="16" rx="3" transform="rotate(25 91 39)" fill="#f3f4f6" stroke="#cfd5de"/></g>`;
      break;
    case 'wired':
      g = `${shadow(80, 34)}<path d="M80 86 L80 62 C80 50 60 48 58 30 M80 62 C80 50 100 48 102 30" stroke="#2b2f36" stroke-width="2.4" fill="none"/><rect x="76" y="82" width="8" height="12" rx="2" fill="#2b2f36"/>
        <circle cx="58" cy="24" r="9" fill="#2b2f36"/><circle cx="58" cy="24" r="4.5" fill="#4b5563"/><circle cx="102" cy="24" r="9" fill="#2b2f36"/><circle cx="102" cy="24" r="4.5" fill="#4b5563"/><rect x="77" y="58" width="6" height="10" rx="2" fill="#4b5563"/>`;
      break;
    case 'powerbank': {
      const big = /20000/.test(p.name);
      const w = big ? 46 : 40, hgt = big ? 80 : 70, x = 80 - w / 2, y = 92 - hgt;
      g = `${shadow(80, 28)}<rect x="${x}" y="${y}" width="${w}" height="${hgt}" rx="10" fill="url(#${id}b)"/><rect x="${x}" y="${y}" width="${w}" height="${hgt}" rx="10" fill="none" stroke="${shade(col, -0.2)}"/>
        ${[0, 1, 2, 3].map((i) => `<circle cx="${80 - 9 + i * 6}" cy="${y + hgt - 14}" r="1.8" fill="${i < 3 ? '#5ac8fa' : '#64748b'}"/>`).join('')}<rect x="${80 - 7}" y="${y + 4}" width="14" height="4" rx="2" fill="#0b0c10"/>
        <text x="80" y="${y + hgt / 2}" text-anchor="middle" font-family="Inter,Arial" font-size="7.5" font-weight="800" fill="#fff" opacity=".85">${big ? '20K' : '10K'}</text><text x="80" y="${y + hgt / 2 + 9}" text-anchor="middle" font-family="Inter,Arial" font-size="5" fill="#fff" opacity=".6">mAh</text>`;
      break;
    }
    case 'case': {
      const clear = /clear/i.test(p.name);
      const c = clear ? '#cfe3ff' : (/iphone/i.test(p.name) ? '#e0566f' : col);
      g = `${shadow(80, 26)}<rect x="58" y="6" width="44" height="88" rx="11" fill="${c}" fill-opacity="${clear ? '.45' : '1'}" stroke="${shade(c, -0.2)}" stroke-width="1.4"/><rect x="62" y="10" width="36" height="80" rx="8" fill="none" stroke="#fff" stroke-opacity=".35"/>
        <rect x="63" y="12" width="${/iphone/i.test(p.name) ? 20 : 12}" height="${/iphone/i.test(p.name) ? 20 : 30}" rx="5" fill="var(--surface, #fff)" opacity=".85" stroke="${shade(c, -0.25)}"/><rect x="100" y="28" width="3" height="10" rx="1.5" fill="${shade(c, -0.15)}"/>
        <path d="M66 70 Q80 64 94 72" stroke="#fff" stroke-opacity=".4" stroke-width="2" fill="none"/>`;
      break;
    }
    case 'glass':
      g = `${shadow(80, 30)}<g transform="rotate(-10 80 50)"><rect x="56" y="6" width="48" height="88" rx="9" fill="url(#${id}g)" stroke="#94a3b8" stroke-width="1.2"/><rect x="74" y="11" width="12" height="2.5" rx="1.25" fill="#94a3b8"/>
        <path d="M60 40 L96 14 M60 56 L100 26 M64 80 L100 54" stroke="#fff" stroke-width="2.5" opacity=".8"/></g><text x="114" y="88" font-family="Inter,Arial" font-size="9" font-weight="800" fill="#2563eb">9H</text>`;
      break;
    case 'car':
      g = `${shadow(80, 18)}<rect x="70" y="58" width="20" height="30" rx="5" fill="#b9c0ca"/><rect x="66" y="22" width="28" height="42" rx="8" fill="url(#${id}b)"/><rect x="62" y="12" width="36" height="16" rx="6" fill="${shade(col, 0.05)}" stroke="${shade(col, -0.2)}"/>
        <rect x="68" y="17" width="9" height="5" rx="1.5" fill="#0b0c10"/><rect x="83" y="17" width="9" height="5" rx="2.5" fill="#0b0c10"/><circle cx="80" cy="42" r="2" fill="#5ac8fa"/><rect x="74" y="86" width="12" height="7" rx="3" fill="#94a3b8"/>`;
      break;
    case 'speaker':
      g = `${shadow(80, 34)}<rect x="44" y="26" width="72" height="56" rx="18" fill="url(#${id}b)"/>${Array.from({ length: 4 }, (_, r) => Array.from({ length: 8 }, (_, c) => `<circle cx="${55 + c * 7}" cy="${40 + r * 7}" r="1.5" fill="#0b0c10" opacity=".55"/>`).join('')).join('')}
        <path d="M58 26 Q80 6 102 26" stroke="${dark}" stroke-width="4" fill="none"/><rect x="70" y="70" width="20" height="4" rx="2" fill="#fff" opacity=".3"/>`;
      break;
    case 'display':
      g = `${shadow(80, 32)}<path d="M80 86 L80 96 L100 96" stroke="#d97706" stroke-width="6" fill="none"/><rect x="96" y="92" width="10" height="7" rx="1" fill="#b45309"/>
        <rect x="58" y="4" width="44" height="86" rx="9" fill="#0b0c10"/><rect x="60.5" y="6.5" width="39" height="81" rx="7" fill="url(#${id}s)" opacity=".9"/><path d="M60.5 30 L99.5 70" stroke="#fff" stroke-width="10" opacity=".08"/>`;
      break;
    case 'battery':
      g = `${shadow(80, 26)}<rect x="56" y="12" width="48" height="76" rx="6" fill="#20232a"/><rect x="56" y="12" width="48" height="16" rx="6" fill="#d9b65b"/><rect x="56" y="22" width="48" height="6" fill="#d9b65b"/>
        <text x="80" y="55" text-anchor="middle" font-family="Inter,Arial" font-size="9" font-weight="800" fill="#fff">Li-ion</text><text x="80" y="66" text-anchor="middle" font-family="Inter,Arial" font-size="6" fill="#9ca3af">3.85V</text>
        <path d="M70 12 L70 4 L90 4" stroke="#d97706" stroke-width="5" fill="none"/><rect x="88" y="1" width="9" height="6" rx="1" fill="#b45309"/>`;
      break;
    case 'flex':
      g = `${shadow(80, 36)}<path d="M40 70 C60 70 60 30 80 30 S100 60 120 60" stroke="#d97706" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M40 70 C60 70 60 30 80 30 S100 60 120 60" stroke="#fbbf24" stroke-width="2" fill="none" opacity=".6"/>
        <rect x="26" y="62" width="20" height="16" rx="3" fill="#2b2f36"/><rect x="31" y="67" width="10" height="5" rx="2.5" fill="#c7ccd3"/><rect x="116" y="54" width="14" height="12" rx="2" fill="#b45309"/>`;
      break;
    case 'backglass':
      g = `${shadow(80, 26)}<rect x="58" y="6" width="44" height="88" rx="10" fill="#8e7cc3"/><rect x="58" y="6" width="44" height="88" rx="10" fill="url(#${id}g)" opacity=".7"/><rect x="62" y="10" width="20" height="20" rx="6" fill="var(--surface, #fff)" opacity=".9"/><path d="M64 60 L98 34" stroke="#fff" stroke-width="5" opacity=".35"/>`;
      break;
    case 'spkmod':
      g = `${shadow(80, 26)}<rect x="52" y="30" width="56" height="34" rx="6" fill="#20232a"/>${Array.from({ length: 3 }, (_, r) => Array.from({ length: 9 }, (_, c) => `<rect x="${57 + c * 5.4}" y="${36 + r * 7}" width="3" height="4" rx="1" fill="#4b5563"/>`).join('')).join('')}<rect x="62" y="64" width="6" height="8" fill="#d9b65b"/><rect x="92" y="64" width="6" height="8" fill="#d9b65b"/>`;
      break;
    default:
      g = `${shadow(80, 28)}<path d="M80 14 L108 28 L108 70 L80 86 L52 70 L52 28 Z" fill="${light}"/><path d="M80 14 L108 28 L80 42 L52 28 Z" fill="${shade(col, 0.28)}"/><path d="M80 42 L80 86" stroke="${dark}" stroke-width="1"/>`;
  }
  return `<svg viewBox="18 2 124 96" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${h(p.name || 'Product')}">${defs}${g}</svg>`;
}
