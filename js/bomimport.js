/*
 * bomimport.js - đọc file danh sách linh kiện / BOM để nhập kho (không cần thư viện ngoài).
 *   CSV / TSV / TXT (KiCad, Altium, EasyEDA / JLCPCB - kể cả UTF-16), Excel .xlsx (giải nén bằng DecompressionStream)
 *   BomImport.read(file)  -> [{name, rows: [[ô, ô, …], …]}]   (mỗi sheet 1 bảng chữ)
 *   BomImport.items(sheet) -> {cols, items: [{ref, qty, value, package, footprint, mpn, maker, lcsc, desc, group, code, unit, type, name, skip}]}
 * Tự tìm dòng tiêu đề (Excel tự làm có vài dòng tựa phía trên), tự nhận cột theo tên (Anh / Việt).
 */
const BomImport = (() => {
'use strict';
const vn = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();

// ---------- CSV / TSV ----------
function decodeText(buf) {
  const u = new Uint8Array(buf);
  if (u[0] === 0xFF && u[1] === 0xFE) return new TextDecoder('utf-16le').decode(u.subarray(2));
  if (u[0] === 0xFE && u[1] === 0xFF) return new TextDecoder('utf-16be').decode(u.subarray(2));
  if (u.length > 3 && u[1] === 0 && u[3] === 0) return new TextDecoder('utf-16le').decode(u);   // UTF-16 không BOM (EasyEDA)
  try { return new TextDecoder('utf-8', { fatal: true }).decode(u[0] === 0xEF && u[1] === 0xBB ? u.subarray(3) : u); }
  catch { return new TextDecoder('windows-1258').decode(u); }
}
function parseDelimited(text) {
  const first = text.split(/\r?\n/).find(l => l.trim()) || '';
  const cnt = ch => first.split(ch).length - 1;
  const d = [['\t', cnt('\t')], [';', cnt(';')], [',', cnt(',')]].sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"' && cell === '') q = true;
    else if (c === d) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim()));
}

// ---------- XLSX (zip + XML) ----------
async function inflate(data) {
  const ds = new DecompressionStream('deflate-raw');
  const out = new Response(new Blob([data]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}
async function unzip(buf) {
  const u = new Uint8Array(buf), dv = new DataView(buf), files = {};
  let e = u.length - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('File Excel hỏng (không phải .xlsx?)');
  let p = dv.getUint32(e + 16, true);
  const n = dv.getUint16(e + 10, true);
  for (let i = 0; i < n; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u.subarray(p + 46, p + 46 + nl));
    const lnl = dv.getUint16(off + 26, true), lxl = dv.getUint16(off + 28, true);
    const data = u.subarray(off + 30 + lnl + lxl, off + 30 + lnl + lxl + csize);
    files[name] = { method, data };
    p += 46 + nl + xl + cl;
  }
  return async name => {
    const f = files[name];
    if (!f) return null;
    const raw = f.method === 8 ? await inflate(f.data) : f.data;
    return new TextDecoder().decode(raw);
  };
}
const xml = s => new DOMParser().parseFromString(s, 'application/xml');
const colIdx = ref => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
async function readXlsx(buf) {
  if (typeof DecompressionStream === 'undefined') throw new Error('Trình duyệt này chưa đọc được .xlsx - lưu lại thành .csv');
  const get = await unzip(buf);
  const shared = [];
  const ss = await get('xl/sharedStrings.xml');
  if (ss) for (const si of xml(ss).getElementsByTagName('si')) shared.push([...si.getElementsByTagName('t')].map(t => t.textContent).join(''));
  const wb = xml(await get('xl/workbook.xml'));
  const rels = xml(await get('xl/_rels/workbook.xml.rels') || '<r/>');
  const target = {};
  for (const r of rels.getElementsByTagName('Relationship')) target[r.getAttribute('Id')] = r.getAttribute('Target');
  const out = [];
  for (const s of wb.getElementsByTagName('sheet')) {
    const rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    let t = target[rid] || '';
    t = t.startsWith('/') ? t.slice(1) : 'xl/' + t.replace(/^\.\//, '');
    const sx = await get(t);
    if (!sx) continue;
    const rows = [];
    for (const r of xml(sx).getElementsByTagName('row')) {
      const row = [];
      for (const c of r.getElementsByTagName('c')) {
        const ty = c.getAttribute('t'), v = c.getElementsByTagName('v')[0];
        let val = '';
        if (ty === 's') val = shared[+(v && v.textContent)] || '';
        else if (ty === 'inlineStr') val = [...c.getElementsByTagName('t')].map(x => x.textContent).join('');
        else val = v ? v.textContent : '';
        row[colIdx(c.getAttribute('r') || 'A1')] = val;
      }
      rows.push(Array.from(row, x => x == null ? '' : String(x)));
    }
    out.push({ name: s.getAttribute('name'), rows: rows.filter(r => r.some(x => x.trim())) });
  }
  return out;
}

async function read(file) {
  const buf = await file.arrayBuffer();
  const name = (file.name || '').toLowerCase();
  if (name.endsWith('.xls') && !name.endsWith('.xlsx')) throw new Error('File .xls kiểu cũ: mở bằng Excel rồi lưu lại thành .xlsx hoặc .csv');
  if (name.endsWith('.xlsx') || new Uint8Array(buf, 0, 2).join() === '80,75') return readXlsx(buf);
  return [{ name: file.name, rows: parseDelimited(decodeText(buf)) }];
}

// ---------- nhận cột ----------
const COLS = {
  ref: ['reference', 'references', 'refs', 'ref', 'designator', 'designators', 'ref des', 'refdes', 'vi tri', 'vi tri (designator)', 'part reference'],
  qty: ['qty', 'quantity', 'so luong', 'sl', 'count', 'qty per board', 'quantity per pcb'],
  value: ['value', 'comment', 'gia tri', 'gia tri / ma', 'ma ic', 'part', 'name', 'val', 'part value', 'gia tri / thong so'],
  footprint: ['footprint', 'package', 'kieu vo', 'kieu vo / footprint', 'package / footprint', 'kieu chan', 'case', 'pcb footprint', 'footprint name'],
  mpn: ['mpn', 'manufacturer part', 'manufacturer part number', 'manufacturer_part_number', 'mfr part', 'mfr part #', 'mfr. part #', 'mfr_pn', 'part number', 'ma nsx', 'ma nha san xuat'],
  maker: ['manufacturer', 'mfr', 'mfr.', 'manufacturer name', 'hang', 'nha san xuat', 'hang san xuat'],
  lcsc: ['lcsc', 'lcsc part', 'lcsc part #', 'lcsc part number', 'supplier part', 'jlcpcb part', 'jlcpcb part #', 'lcsc#', 'ma lcsc'],
  desc: ['description', 'mo ta', 'ghi chu', 'chuc nang', 'chuc nang (van tat)', 'note', 'notes', 'function'],
  group: ['nhom', 'group', 'category', 'loai'],
  dnp: ['dnp', 'do not place', 'khong lap'],
  excl: ['exclude from bom'],
  buy: ['can mua', 'mua'],
  code: ['ma', 'ma linh kien', 'code', 'ma kho'],
  unit: ['don vi', 'unit', 'dvt'],
};
function headerOf(rows) {
  let best = { score: 0 };
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cols = {}, used = new Set();
    rows[i].forEach((c, j) => {
      const k = vn(c);
      if (!k) return;
      for (const [f, names] of Object.entries(COLS)) if (!(f in cols) && names.includes(k) && !used.has(j)) { cols[f] = j; used.add(j); break; }
    });
    const score = Object.keys(cols).length + ('value' in cols ? 2 : 0) + ('ref' in cols || 'qty' in cols ? 1 : 0);
    if (score > best.score) best = { score, row: i, cols };
  }
  return best.score >= 3 && 'value' in best.cols ? best : null;
}

// ---------- chuẩn hóa ----------
const TYPES = [   // tiền tố vị trí -> loại (tên linh kiện) ; skip = mặc định bỏ (không phải linh kiện mua)
  [/^(TP)\d/i, 'Điểm đo', true], [/^(MH|H)\d/i, 'Lỗ bắt vít', true], [/^(FID)\d/i, 'Điểm căn', true], [/^(LOGO|G|#)/i, 'Hình in', true],
  [/^FB\d/i, 'Ferrite'], [/^R[NA]?\d/i, 'Điện trở'], [/^C[P]?\d/i, 'Tụ'], [/^L\d/i, 'Cuộn cảm'], [/^D\d/i, 'Diode'], [/^LED\d/i, 'LED'],
  [/^Q\d/i, 'Transistor'], [/^U\d/i, 'IC'], [/^(Y|X)\d/i, 'Thạch anh'], [/^(J|P|CN|CON)\d/i, 'Đầu nối'], [/^F\d/i, 'Cầu chì'],
  [/^(SW|S)\d/i, 'Công tắc'], [/^(BZ|LS)\d/i, 'Loa / còi'], [/^T\d/i, 'Biến áp'], [/^(RL|K)\d/i, 'Rơ le'], [/^(BT|BAT)\d/i, 'Pin'],
];
function typeOf(ref, value, footprint) {
  const r = String(ref || '').trim().split(/[\s,;]+/)[0] || '';
  for (const [re, name, skip] of TYPES) if (re.test(r)) {
    if (name === 'Diode' && /led/i.test(value + ' ' + footprint)) return { type: 'LED' };
    return { type: name, skip: !!skip };
  }
  return { type: '' };
}
function packageOf(fp) {
  let f = String(fp || '').trim();
  if (!f) return '';
  f = f.replace(/^[^:]*:/, '');                                     // "Capacitor_SMD:C_0603_1608Metric"
  let m = f.match(/(?:^|_)(0201|0402|0603|0805|1206|1210|1812|2010|2512)(?:_|$|Metric)/);
  if (m) return m[1];
  m = f.match(/^(?:C|R|L|LED|D|CP)_(0201|0402|0603|0805|1206|1210|1812|2010|2512)/);
  if (m) return m[1];
  m = f.match(/^D_(SMA|SMB|SMC|SOD-\d+\w*|MiniMELF|MELF)/i);
  if (m) return m[1];
  m = f.match(/^(?:CP_Elec|C_Elec)_([\d.x]+)/);
  if (m) return 'Tụ hóa ' + m[1];
  m = f.match(/^((?:[A-Z]*SOP|SOIC|SSOP|TSSOP|MSOP|QFN|DFN|QFP|LQFP|TQFP|BGA|UFBGA|LGA|SOT|TO|DIP|SIP|VQFN|WQFN|HTSSOP|SO)-?\d+(?:-\d+)?)/i);
  if (m) return m[1].toUpperCase().replace(/^SO(\d)/, 'SO-$1');
  f = f.replace(/^[a-z]{1,3}_(?=[A-Z])/, '').replace(/_/g, ' ').replace(/(\d)mm\b/g, '$1').replace(/\s(Vertical|Horizontal|SMD|THT)\b.*$/i, '');
  return f.length > 32 ? f.slice(0, 32) : f;
}
function refCount(ref) {
  let n = 0;
  for (const part of String(ref || '').split(/[\s,;]+/).filter(Boolean)) {
    const m = part.match(/^([A-Za-z#_]+)(\d+)-(?:[A-Za-z#_]+)?(\d+)$/);              // "C3-C16" -> 14
    n += m ? Math.max(1, +m[3] - +m[2] + 1) : 1;
  }
  return n;
}
const truthy = v => { const k = vn(v); return k && !['0', 'no', 'false', 'khong', '-', ''].includes(k); };

function items(sheet) {
  const hd = headerOf(sheet.rows);
  if (!hd) return null;
  const c = hd.cols, get = (r, f) => (f in c ? String(r[c[f]] == null ? '' : r[c[f]]).trim() : '');
  const out = [];
  for (const r of sheet.rows.slice(hd.row + 1)) {
    const value = get(r, 'value'), ref = get(r, 'ref');
    if (!value) continue;
    if (/^(tong|tổng|total|so dong)/.test(vn(r.join(' ')))) continue;   // dòng tổng cộng của Excel tự làm
    if (truthy(get(r, 'dnp')) || truthy(get(r, 'excl'))) continue;     // KiCad: DNP / Exclude from BOM
    const footprint = get(r, 'footprint'), pkg = packageOf(footprint);
    let qty = parseFloat(String(get(r, 'qty')).replace(',', '.'));
    if (!(qty > 0)) qty = ref ? refCount(ref) : 1;
    const t = typeOf(ref, value, footprint);
    const mpn = get(r, 'mpn'), lcsc = (get(r, 'lcsc').match(/C\d{3,}/i) || [''])[0].toUpperCase();
    const val = value.replace(/\s*\([^)]*\)\s*$/, '').trim() || value;      // "74AHCT574 (TSSOP-20)" -> "74AHCT574"
    const isChip = t.type === 'IC' || t.type === 'Transistor' || t.type === '' || /^(?=.*\d)[A-Z0-9-]{5,}$/i.test(val) && !/^\d/.test(val);
    out.push({
      ref, qty, value: val, footprint, package: pkg, mpn, maker: get(r, 'maker'), lcsc, desc: get(r, 'desc'), group: get(r, 'group'),
      code: get(r, 'code'), unit: get(r, 'unit'), type: t.type, skip: !!t.skip || vn(get(r, 'buy')) === 'khong',   // Excel: Cần mua = Không
      // đầu nối: giá trị thường là tên nhãn (HUB75_OUT1…) -> đặt tên theo kiểu vỏ để các đầu nối giống nhau gộp 1 linh kiện
      name: t.type === 'Đầu nối' || vn(val) === vn(t.type) ? `${t.type || val} ${pkg}`.trim() : isChip || !t.type ? val : `${t.type} ${val}`,
      label: t.type === 'Đầu nối' ? val : '',
    });
  }
  return { cols: c, items: out };
}

// khóa so khớp: giá trị + kiểu vỏ (bỏ khoảng trắng, µ -> u, 100nF ~ 100n)
const normVal = s => vn(s).replace(/µ|μ/g, 'u').replace(/\s+/g, '').replace(/(ohm|Ω)$/i, '').replace(/([pnumk])f$/, '$1')
  .replace(/^(\d+)([rkm])(\d+)$/, '$1.$3$2').replace(/^([\d.]+)r$/, '$1');   // 4k7 = 4.7k ; 33R = 33
const key = (value, pkg) => `${normVal(value)}|${vn(pkg).replace(/\s+/g, '')}`;

return { read, items, key, normVal, packageOf, refCount };
})();
