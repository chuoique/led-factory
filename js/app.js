/*
 * app.js - giao diện app QUẢN LÝ SẢN XUẤT mạch điều khiển LED (khung lấy từ app spa: D:\DEV\Claude\SPA).
 * Màn hình: ghép máy -> (tạo quản trị) -> đăng nhập -> giao diện theo vai trò.
 * Quyền thật sự được máy chủ kiểm tra; ở đây chỉ ẩn bớt những gì vai trò không dùng.
 *
 * Thêm màn hình mới: viết hàm vXxx(el), thêm vào VIEWS và TABS.
 */
(() => {
'use strict';
const APP_VERSION = 'LED Factory 0.21';
const $ = s => document.querySelector(s);

// ---------- tiện ích giao diện ----------
// Ngôn ngữ: chữ hiện ra (con chữ, placeholder, title) đi qua T() -> tiếng Anh nếu đã chọn (js/i18n.js)
const T = s => (window.I18N ? I18N.t(s) : s);
const TR_ATTR = { placeholder: 1, title: 1, 'aria-label': 1, alt: 1 };
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : TR_ATTR[k] ? T(v) : v);
  }
  for (const c of kids.flat(9)) if (c != null && c !== false) el.append(c instanceof Node ? c : (typeof c === 'string' ? T(c) : String(c)));
  return el;
}
// tiền: tiếng Việt "1.250.000 đ", tiếng Anh "1,250,000 ₫"
const money = n => (window.I18N && I18N.lang === 'en') ? Math.round(n || 0).toLocaleString('en-US') + ' ₫' : (Math.round(n || 0)).toLocaleString('vi-VN') + ' đ';
const pad = n => String(n).padStart(2, '0');
const hm = ms => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const dmy = ms => { const d = new Date(ms); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const dayLabel = ms => { const d = new Date(ms); return `${(window.I18N && I18N.wd(d.getDay())) || WD[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; };
const dayStart = ms => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const dateVal = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fromInputs = (date, time) => new Date(`${date}T${time || '00:00'}`).getTime();
const ROLE = { sysadmin: 'Quản trị hệ thống', chairman: 'Chủ tịch HĐQT', ceo: 'Giám đốc', owner: 'Quản lý', assistant: 'Trợ lý', store: 'Thủ kho', tech: 'Kỹ thuật', sales: 'Bán hàng' };
// 3 cấp quản trị đều toàn quyền (máy chủ kiểm tra); cấp thấp không cấp/sửa được tài khoản cấp cao hơn
const RANK = { sysadmin: 4, chairman: 3, ceo: 2, owner: 1 };   // sysadmin: chỉ cấp trên máy chủ, ẩn khỏi danh sách
// Trợ lý: nghiệp vụ như Quản lý (myRole = 'owner') nhưng không có phần quản trị (isAdmin = false)
const myRole = () => (S.me && (RANK[S.me.role] || S.me.role === 'assistant')) ? 'owner' : (S.me && S.me.role);
const isAdmin = () => !!(S.me && RANK[S.me.role]);
const myTabs = () => S.me && S.me.role === 'assistant' ? TABS.owner.filter(t => t !== 'staff') : TABS[myRole()];
const STATUS = { void: 'Đã hủy', done: 'Xong', cancelled: 'Đã hủy' };
const METHOD = { cash: 'Tiền mặt', transfer: 'Chuyển khoản', card: 'Thẻ' };
const chip = st => h('span', { class: 'chip ' + st }, STATUS[st] || st);

let toastTimer;
function toast(msg, bad) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = h('div', { class: 'toast' + (bad ? ' bad' : '') }, T(msg));
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), bad ? 4500 : 2200);
}
async function api(op, args, quiet) {
  try { return await Conn.request(op, args); }
  catch (e) { if (!quiet) toast(e.message, true); throw e; }
}
function sheet(title, body, actions) {
  const close = () => scrim.remove();
  const scrim = h('div', { class: 'scrim', onclick: e => { if (e.target === scrim) close(); } },
    h('div', { class: 'sheet' },
      h('div', { class: 'bar' }, h('h2', {}, title), h('button', { class: 'x', onclick: close, 'aria-label': 'Đóng' }, '✕')),
      body,
      actions && h('div', { class: 'row' }, actions)));
  document.body.append(scrim);
  const f = scrim.querySelector('input,select,textarea'); if (f && !('ontouchstart' in window)) f.focus();
  return close;
}
function field(label, input) { return h('label', { class: 'f' }, label, input); }

// Bỏ dấu tiếng Việt để tìm: "Nguyễn Lân" -> "nguyen lan"
const vn = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

// Ô chọn gõ để lọc (thay cho danh sách thả xuống dài). el.value = id đã chọn, el.text = chữ đang gõ.
function combo(items, label, selectedId, placeholder, onChange) {
  let value = selectedId || '';
  const cur = items.find(i => i.id === selectedId);
  const inp = h('input', { placeholder, value: cur ? label(cur) : '', autocomplete: 'off' });
  const box = h('div', { class: 'pick', hidden: true });
  const pick = i => { value = i ? i.id : ''; inp.value = i ? label(i) : ''; box.hidden = true; if (onChange) onChange(i); };
  const show = () => {
    const q = vn(inp.value), list = items.filter(i => !q || vn(label(i)).includes(q)).slice(0, 40);
    box.replaceChildren(...list.map(i => h('button', { type: 'button', onmousedown: e => e.preventDefault(), onclick: () => pick(i) }, label(i))));
    box.hidden = !list.length;
  };
  inp.addEventListener('focus', show);
  inp.addEventListener('input', () => { value = ''; if (onChange) onChange(null); show(); });
  inp.addEventListener('blur', () => setTimeout(() => { box.hidden = true; }, 150));
  const el = h('div', { class: 'combo' }, inp, box);
  Object.defineProperty(el, 'value', { get: () => value });
  Object.defineProperty(el, 'text', { get: () => inp.value.trim() });
  return el;
}

// Ảnh QR (thư viện qrcode-generator, chép sẵn trong lib/)
function qrImg(text) {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  return h('img', { src: q.createDataURL(8, 2), alt: text });
}
function busy(btn, p) { btn.disabled = true; return p.finally(() => { btn.disabled = false; }); }

// ---------- trạng thái app ----------
const S = { welcome: null, me: null, tab: null, products: [], staff: [], parts: null, suppliers: null, customers: null, view: null, viewTopic: null, log: [] };
Conn.on('log', l => { S.log.push(l); if (S.log.length > 200) S.log.shift(); });

const LOGO = () => h('img', { class: 'brandlogo', src: 'logo.png', alt: 'LED Factory' });
// Cờ chọn ngôn ngữ (thanh trên cùng + các màn hình trước khi đăng nhập); redraw = vẽ lại màn hình đang mở
function langFlags(redraw) {
  return h('div', { class: 'flags' }, ['vi', 'en'].map(l => h('button', {
    class: 'flag' + (I18N.lang === l ? ' on' : ''), title: l === 'vi' ? 'Tiếng Việt' : 'English', 'aria-label': l === 'vi' ? 'Tiếng Việt' : 'English',
    onclick: () => { if (I18N.lang !== l) { I18N.set(l); redraw(); } } }, h('img', { src: I18N.flag(l), alt: l.toUpperCase() }))));
}
const cornerFlags = redraw => h('div', { style: 'display:flex;justify-content:flex-end;margin:-6px -6px 4px 0' }, langFlags(redraw));

// ---------- màn hình: ghép máy ----------
function guessName() {
  const ua = navigator.userAgent;
  return T(/iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Điện thoại Android' : /Windows/.test(ua) ? 'Máy tính Windows' : /Mac/.test(ua) ? 'Máy Mac' : 'Thiết bị');
}
function screenPair(msg) {
  const code = h('input', { placeholder: 'XXXXXX-XXXXXX', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', class: 'big', maxlength: 16 });
  const name = h('input', { value: guessName(), maxlength: 40 });
  const st = h('p', { class: 'small muted' }, msg || '');
  const btn = h('button', { class: 'btn' }, 'Ghép máy');
  btn.onclick = () => {
    st.textContent = T('Đang tìm máy chủ và ghép máy…');
    busy(btn, Conn.pair(code.value, name.value.trim()).then(() => boot()).catch(e => { st.textContent = T(e.message); }));
  };
  $('#app').replaceChildren(h('div', { class: 'wrap center' }, h('div', { class: 'card' },
    cornerFlags(() => screenPair(msg)), LOGO(), h('h1', {}, 'Ghép máy với hệ thống'),
    h('p', { class: 'muted small' }, 'Nhập mã ghép máy do quản trị tạo (Tài khoản → Điện thoại / máy tính), hoặc mã khởi tạo in trên cửa sổ máy chủ khi chạy lần đầu. Mỗi máy chỉ cần ghép một lần.'),
    field('Mã ghép máy', code), field('Tên máy này', name), btn, st,
    h('p', { class: 'small muted' }, APP_VERSION))));
}

// ---------- màn hình: tạo quản trị / đăng nhập ----------
function screenSetup() {
  const un = h('input', { autocomplete: 'username', autocapitalize: 'none' }), dn = h('input', {}), pw = h('input', { type: 'password', autocomplete: 'new-password' }), pw2 = h('input', { type: 'password', autocomplete: 'new-password' });
  const btn = h('button', { class: 'btn' }, 'Tạo tài khoản quản trị');
  btn.onclick = () => {
    if (pw.value !== pw2.value) return toast('Hai lần nhập mật khẩu không khớp', true);
    busy(btn, api('auth.setup_owner', { username: un.value.trim(), display_name: dn.value.trim(), password: pw.value }).then(u => { S.me = u; toast('Đã tạo tài khoản quản trị'); screenMain(); }).catch(() => {}));
  };
  $('#app').replaceChildren(h('div', { class: 'wrap center', id: 'scr-setup' }, h('div', { class: 'card' },
    cornerFlags(screenSetup), LOGO(), h('h1', {}, 'Chào mừng!'), h('p', { class: 'muted small' }, 'Máy này được ghép bằng mã khởi tạo. Hãy tạo tài khoản quản trị: tài khoản có toàn quyền, dùng để thêm nhân viên, loại mạch, linh kiện và ghép các máy khác.'),
    field('Tên đăng nhập', un), field('Tên hiển thị', dn), field('Mật khẩu (ít nhất 6 ký tự)', pw), field('Nhập lại mật khẩu', pw2), btn)));
}
function screenLogin() {
  const un = h('input', { autocomplete: 'username', autocapitalize: 'none' }), pw = h('input', { type: 'password', autocomplete: 'current-password' });
  const btn = h('button', { class: 'btn' }, 'Đăng nhập');
  btn.onclick = () => busy(btn, api('auth.login', { username: un.value.trim(), password: pw.value }).then(u => { S.me = u; screenMain(); }).catch(() => {}));
  pw.addEventListener('keydown', e => { if (e.key === 'Enter') btn.click(); });
  $('#app').replaceChildren(h('div', { class: 'wrap center' }, h('div', { class: 'card' },
    cornerFlags(screenLogin), LOGO(), h('h1', {}, S.welcome ? S.welcome.spa_name : 'LED Factory'), h('p', { class: 'muted small' }, `Máy: ${S.welcome ? S.welcome.dev_name : ''}`),
    field('Tên đăng nhập', un), field('Mật khẩu', pw), btn,
    h('div', { class: 'row between' }, connBadge(), h('button', { class: 'btn ghost small', onclick: () => sheet('Kết nối', diagPanel()) }, 'Chẩn đoán')))));
}
function screenConnecting() {
  const d = Conn.diag();
  $('#app').replaceChildren(h('div', { class: 'wrap center' }, h('div', { class: 'card' },
    LOGO(), h('h2', {}, 'Đang kết nối tới máy chủ…'),
    h('p', { class: 'muted small', id: 'cstate' }, `Nội bộ: ${d.lan.state}`),
    h('div', { class: 'row' }, h('button', { class: 'btn ghost small', onclick: () => sheet('Kết nối', diagPanel()) }, 'Chẩn đoán'),
      h('button', { class: 'btn bad small', onclick: unpair }, 'Gỡ ghép máy')))));
}

// ---------- khung chính theo vai trò ----------
// ---------- khung chính theo vai trò ----------
// "Tạo mã" đặt ngay cạnh "Hệ thống" (yêu cầu): mục cuối trước Hệ thống
const TABS = {
  owner: ['production', 'keys', 'parts', 'purchases', 'sales', 'cash', 'reports', 'staff', 'system'],
  store: ['production', 'parts', 'purchases', 'system'],
  tech:  ['production', 'keys', 'parts', 'system'],
  sales: ['sales', 'keys', 'system'],
};
const TAB = {
  production: ['🛠', 'Sản xuất'], parts: ['🏬', 'Kho'], purchases: ['📥', 'Mua vào'], sales: ['🧾', 'Bán ra'],
  reports: ['📊', 'Thống kê'], cash: ['💵', 'Thu chi'], staff: ['👥', 'Tài khoản'], keys: ['🔑', 'Tạo mã'], system: ['⚙️', 'Hệ thống'],
};
function connBadge() {
  const d = Conn.diag();
  const b = h('span', { class: 'badge', id: 'cbadge', onclick: () => go('system') },
    h('span', { class: 'dot ' + (d.path || 'none') }), T(d.pathName) + (d.rtt != null ? ` · ${d.rtt} ms` : ''));
  return b;
}
// Mật khẩu tạm / mặc định: bắt đổi trước khi dùng app (máy chủ cũng chặn mọi thao tác khác)
function screenForceChange() {
  const o = h('input', { type: 'password', autocomplete: 'current-password' });
  const n = h('input', { type: 'password', autocomplete: 'new-password' }), n2 = h('input', { type: 'password', autocomplete: 'new-password' });
  const btn = h('button', { class: 'btn' }, 'Đổi mật khẩu');
  btn.onclick = () => {
    if (n.value.length < 6) return toast('Mật khẩu mới cần ít nhất 6 ký tự');
    if (n.value !== n2.value) return toast('Hai lần nhập mật khẩu mới không khớp');
    busy(btn, api('auth.change_password', { old: o.value, new: n.value })
      .then(() => { S.me.must_change = false; toast('Đã đổi mật khẩu'); screenMain(); }).catch(() => {}));
  };
  n2.addEventListener('keydown', e => { if (e.key === 'Enter') btn.click(); });
  $('#app').replaceChildren(h('div', { class: 'wrap center' }, h('div', { class: 'card' },
    LOGO(), h('h2', {}, `Chào ${S.me.display_name || S.me.username}`),
    h('p', { class: 'muted small' }, 'Bạn đang dùng mật khẩu tạm. Hãy đặt mật khẩu riêng của mình trước khi dùng app (ít nhất 6 ký tự, không ai khác biết).'),
    field('Mật khẩu hiện tại (mật khẩu tạm)', o), field('Mật khẩu mới', n), field('Nhập lại mật khẩu mới', n2), btn,
    h('button', { class: 'btn ghost', onclick: () => api('auth.logout').then(() => { S.me = null; screenLogin(); }).catch(() => {}) }, 'Đăng xuất'))));
}
function screenMain() {
  if (S.me && S.me.must_change) return screenForceChange();
  const tabs = myTabs() || ['system'];
  if (!tabs.includes(S.tab)) S.tab = tabs[0];
  $('#app').replaceChildren(
    h('header', { class: 'top' }, h('div', { class: 'in' },
      h('img', { class: 'hlogo', src: 'icon-192.png', alt: 'LED' }),
      h('div', { class: 'grow' }, h('div', { class: 'spa' }, S.welcome ? S.welcome.spa_name : 'LED Factory'),
        h('div', { class: 'who' }, `${S.me.display_name || S.me.username} · ${T(ROLE[S.me.role] || S.me.role)}`)),
      langFlags(screenMain),
      myRole() !== 'customer' && h('button', { class: 'hbtn', title: 'Tìm nhanh', 'aria-label': 'Tìm nhanh', onclick: quickSearch }, '🔍'),
      myRole() !== 'customer' && h('button', { class: 'hbtn', title: 'Quét mã', 'aria-label': 'Quét mã', onclick: scanSheet }, '📷'),
      connBadge())),
    h('div', { id: 'banner' }),
    h('main', { class: 'wrap', id: 'view' }),
    h('nav', { class: 'tabs' }, tabs.map(t => h('button', { class: t === S.tab ? 'on' : '', onclick: () => go(t) },
      h('span', { class: 'ic' }, TAB[t][0]), t === 'keys' && !can('keys.issue') ? 'Mạch' : TAB[t][1]))));
  loadCaches();
  go(S.tab);
}
function go(tab) {
  S.tab = tab;
  document.querySelectorAll('nav.tabs button').forEach((b, i) => b.classList.toggle('on', (myTabs() || [])[i] === tab));
  const el = $('#view');
  if (!el) return;
  el.replaceChildren(h('div', { class: 'empty' }, 'Đang tải…'));
  S.view = tab;
  (VIEWS[tab] || vSystem)(el).catch(e => { el.replaceChildren(h('div', { class: 'card' }, h('p', {}, 'Không tải được: ' + e.message), h('button', { class: 'btn ghost small', onclick: () => go(tab) }, 'Thử lại'))); });
}
async function loadCaches() {
  [S.products, S.staff] = await Promise.all([api('products.list', {}, true).catch(() => []), api('staff.list', {}, true).catch(() => [])]);
}
const TOPIC_VIEWS = { parts: ['parts'], purchases: ['purchases', 'reports', 'parts'], production: ['production', 'reports', 'parts'], boards: ['keys', 'parts'],
  sales: ['sales', 'reports', 'keys'], staff: ['staff'], cash: ['cash'] };
let refreshTimer;
Conn.on('event', topic => {
  if (topic === 'production' || topic === 'staff') loadCaches();
  if (topic === 'parts') S.parts = null;
  if (topic === 'purchases') S.suppliers = null;
  if (topic === 'sales') S.customers = null;
  if ((TOPIC_VIEWS[topic] || []).includes(S.view) && !document.querySelector('.scrim')) {
    clearTimeout(refreshTimer); refreshTimer = setTimeout(() => go(S.view), 300);
  }
});

function rangeOf(r) {
  const now = Date.now(), t0 = dayStart(now);
  if (r === 'today') return [t0, t0 + 86400000];
  if (r === '7d') return [t0 - 6 * 86400000, t0 + 86400000];
  const d = new Date(now); d.setDate(1); d.setHours(0, 0, 0, 0);
  if (r === 'lastmonth') { const e = d.getTime(); d.setMonth(d.getMonth() - 1); return [d.getTime(), e]; }
  if (r === 'year') { d.setMonth(0); return [d.getTime(), t0 + 86400000]; }
  if (r === 'all') return [0, t0 + 86400000];
  return [d.getTime(), t0 + 86400000];
}
const rangeSel = (val, onchange) => h('select', { onchange: e => onchange(e.target.value) },
  [['today', 'Hôm nay'], ['7d', '7 ngày'], ['month', 'Tháng này'], ['lastmonth', 'Tháng trước'], ['year', 'Năm nay'], ['all', 'Tất cả']].map(([v, l]) => h('option', { value: v, selected: v === val }, l)));

// ======================================================================================================
// NGHIỆP VỤ SẢN XUẤT (thay các màn hình spa). Máy chủ: server/src/biz.inc
// ======================================================================================================
const num = v => +(+v || 0).toFixed(3);
const BSTATUS = { stock: 'Trong kho', sold: 'Đã bán', returned: 'Khách trả / bảo hành', scrap: 'Hủy' };
const WSTATUS = { plan: 'Kế hoạch', running: 'Đang làm', done: 'Xong', cancelled: 'Đã hủy' };
const PMOVE = { purchase: 'Nhập mua', production: 'Xuất sản xuất', return: 'Trả NCC / hủy nhập', out: 'Xuất khác', in: 'Nhập khác', adjust: 'Kiểm kê (±)' };
const bchip = st => h('span', { class: 'chip ' + st }, BSTATUS[st] || st);
const wchip = st => h('span', { class: 'chip ' + st }, WSTATUS[st] || st);
// Biểu tượng mạch (giống biểu tượng khách bên spa): mờ = chưa có mã · sáng = có mã trong kho ·
// sáng + vòng xanh phát sáng = đã bán còn bảo hành · vòng xám = hết bảo hành · viền đỏ = trả / bảo hành / hủy
const CHIP_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="6" y="6" width="12" height="12" rx="1.5"/>' +
  '<rect x="9.5" y="9.5" width="5" height="5" fill="currentColor" stroke="none"/><path d="M9 2v4M12 2v4M15 2v4M9 18v4M12 18v4M15 18v4M2 9h4M2 12h4M2 15h4M18 9h4M18 12h4M18 15h4"/></svg>';
function boardState(b) {
  if (b.status === 'returned' || b.status === 'scrap') return 'bad';
  if (b.status === 'sold') return b.warranty_until && b.warranty_until < Date.now() ? 'sold exp' : 'sold';
  return (b.key_id || b.has_key || b.key_at) ? 'id' : '';
}
const BSTATE_T = { '': 'Chưa có mã (bán thành phẩm)', id: 'Có mã, trong kho', sold: 'Đã bán, còn bảo hành', 'sold exp': 'Đã bán, hết bảo hành', bad: 'Khách trả / bảo hành / hủy' };
function boardIcon(b, big) {
  const st = boardState(b);
  const s = h('span', { class: 'bic ' + st + (big ? ' big' : ''), title: BSTATE_T[st] });
  s.innerHTML = CHIP_SVG;
  return s;
}
const boardLegend = () => h('div', { class: 'bleg' }, Object.entries(BSTATE_T).map(([k, l]) => { const s = h('span', { class: 'bic ' + k }); s.innerHTML = CHIP_SVG; return h('span', {}, s, l); }));
const can = op => {   // ẩn nút theo vai trò (máy chủ vẫn kiểm tra lại)
  const r = myRole();
  const P = { store: ['parts.save', 'parts.move', 'suppliers.save', 'purchases.create', 'purchases.pay', 'wo.issue', 'parts.code_add', 'parts.import'],
    tech: ['bom.save', 'wo.save', 'wo.issue', 'wo.finish', 'boards.save', 'keys.issue', 'parts.import'],
    sales: ['customers.save', 'sales.create', 'sales.pay'] };
  return r === 'owner' || (P[r] || []).includes(op);
};
// UID: 24 hex, hiện dạng 8-8-8
const uidFmt = u => String(u || '').replace(/(.{8})(.{8})(.{8})/, '$1-$2-$3');
const uidNorm = s => { const x = String(s || '').replace(/[-\s]/g, '').toUpperCase(); return /^[0-9A-F]{24}$/.test(x) ? x : null; };
const uidFind = s => { const m = String(s || '').match(/([0-9A-Fa-f]{8})[-\s]?([0-9A-Fa-f]{8})[-\s]?([0-9A-Fa-f]{8})/); return m ? (m[1] + m[2] + m[3]).toUpperCase() : null; };
async function refreshProducts() { S.products = await api('products.list', {}, true).catch(() => S.products || []); return S.products; }
const segBar = (cur, items, onpick, add) => h('div', { class: 'seg' },
  items.map(([k, l, n]) => h('button', { class: k === cur ? 'on' : '', onclick: () => onpick(k) }, l, n != null && h('span', { class: 'n' }, n))),
  add && h('button', { class: 'add', onclick: add[1] }, add[0]));
const kv = pairs => h('dl', { class: 'kv' }, pairs.filter(Boolean).flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v == null || v === '' ? '—' : v)]));
const grid = (...k) => h('div', { style: 'display:grid;gap:10px' }, ...k);
const two = (a, b) => h('div', { class: 'row' }, h('div', { class: 'grow' }, a), h('div', { class: 'grow' }, b));
const numIn = (v, step) => h('input', { type: 'number', step: step || 'any', inputmode: 'decimal', value: v ?? '' });
const ask = (q) => window.prompt(T(q));

// ---------- TẠO MÃ + MẠCH (trước là 2 tab) ----------
// 1. "Tạo mã mạch LED": ô UID (gõ / UID.TXT / bấm dòng ở mục 2) -> ký -> dòng "id" cho config.json
// 2. "Nhập UID (chưa tạo mã)" = mục Mạch cũ GIỮ NGUYÊN (tìm, lọc, in tem, + Thêm mạch, chi tiết / dòng đời);
//    bấm 1 mạch chưa có ID -> UID lên ô Tạo mã phía trên
let keyCtx = { product_id: '', work_order_id: '' };
async function vKeys(el) {
  const canIssue = can('keys.issue');
  const [st, wos] = await Promise.all([canIssue ? api('keys.status') : { ready: false }, canIssue ? api('wo.list', { open: 1 }).catch(() => []) : []]);
  await refreshProducts();
  const cards = [];
  const uid = h('input', { placeholder: '36FFDB05-30473036-33562443', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', class: 'mono' });
  const msg = h('p', { class: 'small muted' });
  const btn = h('button', { class: 'btn', disabled: true }, 'Tạo mã');
  const out = h('div', { style: 'display:grid;gap:10px' });
  const ck = () => { const ok = !!uidNorm(uid.value); btn.disabled = !ok || !st.ready; btn.style.opacity = btn.disabled ? 0.45 : 1; };
  let reloadList = () => {};
  // bấm 1 dòng "chưa tạo mã" -> UID lên ô Tạo mã
  const setUid = b => {
    uid.value = uidFmt(b.uid); msg.className = 'small'; msg.style.color = 'var(--ok)';
    msg.textContent = T('Đã đưa UID lên') + (b.product_code || b.wo_number ? ` (${[b.product_code, b.wo_number].filter(Boolean).join(' · ')})` : '') + T(' – bấm Tạo mã');
    ck(); uid.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (!('ontouchstart' in window)) uid.focus();
  };
  if (canIssue) {
    const prod = combo(S.products.filter(p => p.tracked !== 0), p => `${p.code ? p.code + ' · ' : ''}${p.name}`, keyCtx.product_id, 'Loại mạch (không bắt buộc)…', p => { keyCtx.product_id = p ? p.id : ''; });
    const wo = combo(wos, o => `${o.number} · ${o.product_name || ''} (${o.with_id ?? o.boards}/${o.qty_plan})`, keyCtx.work_order_id, 'Lệnh sản xuất (không bắt buộc)…', o => { keyCtx.work_order_id = o ? o.id : ''; });
    uid.addEventListener('input', ck);
    uid.addEventListener('keydown', e => { if (e.key === 'Enter' && !btn.disabled) btn.click(); });
    const readFile = f => { if (!f) return; const r = new FileReader(); r.onload = () => {
      const u = uidFind(r.result);
      if (u) { uid.value = uidFmt(u); msg.className = 'small'; msg.style.color = 'var(--ok)'; msg.textContent = T('Đã lấy UID từ ') + f.name + T(' – bấm Tạo mã'); }
      else { msg.className = 'small'; msg.style.color = 'var(--bad)'; msg.textContent = T('Không tìm thấy UID (24 ký tự hex) trong ') + f.name; }
      ck(); }; r.readAsText(f); };
    const fileIn = h('input', { type: 'file', accept: '.txt,.TXT,text/plain', style: 'display:none', onchange: e => { readFile(e.target.files[0]); e.target.value = ''; } });
    // "Quét UID": tìm UID.TXT ở thư mục gốc ổ USB.
    //  - app mở trên chính máy chủ: máy chủ tự quét mọi ổ USB (usb.scan_uid)
    //  - Chrome / Edge máy tính khác: chọn ổ USB 1 lần (trình duyệt nhớ chỗ cho lần sau)
    const say = (ok, text) => { msg.className = 'small'; msg.style.color = `var(--${ok ? 'ok' : 'bad'})`; msg.textContent = text; };
    const useText = (text, src) => {
      const u = uidFind(text);
      if (u) { uid.value = uidFmt(u); say(true, T('Đã lấy UID từ ') + src + T(' – bấm Tạo mã')); }
      else say(false, T('Không tìm thấy UID (24 ký tự hex) trong ') + src);
      ck();
    };
    const useFound = (found, none) => {
      const f = (found || []).filter(x => uidFind(x.text));
      if (f.length === 1) return useText(f[0].text, `${f[0].drive}\\UID.TXT`);
      if (f.length > 1) {
        let close;
        close = sheet('Chọn ổ USB', h('div', { style: 'display:grid;gap:8px' }, f.map(x => h('button', { class: 'btn ghost', onclick: () => { close(); useText(x.text, `${x.drive}\\UID.TXT`); } },
          `${x.drive} ${x.label || ''} · ${uidFmt(uidFind(x.text))}`))));
        return;
      }
      say(false, T(none));
    };
    // "Lưu vào thiết bị": ghi mã vào "id" trong config.json của ổ USB có UID.TXT TRÙNG UID (không ghi nhầm mạch)
    //  1. trợ giúp trên máy này  2. máy chủ (app mở trên máy chủ)  3. ổ đã chọn bằng trình duyệt (Chrome / Edge)
    let lastDir = null;
    const sameUid = (a, b) => !!a && !!b && String(a).replace(/-/g, '').toUpperCase() === String(b).replace(/-/g, '').toUpperCase();
    const putId = (text, key) => /"id"\s*:\s*"[^"]*"/.test(text) ? text.replace(/("id"\s*:\s*")[^"]*(")/, `$1${key}$2`)
      : text.replace('{', `{${text.includes('\r\n') ? '\r\n' : '\n'}  "id": "${key}",`);
    const saveToDevice = async (uidv, key) => {
      let why = '';
      if (/Windows/.test(navigator.userAgent)) {
        try {
          const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 8000);
          const res = await fetch('http://127.0.0.1:47815/id', { method: 'POST', body: JSON.stringify({ uid: uidv, id: key }), signal: ctl.signal, cache: 'no-store' });
          clearTimeout(tm);
          if (res.ok) { const j = await res.json(); if (j.ok) return j.drive; why = j.why; }
        } catch (e) {}
      }
      try { return (await api('usb.write_id', { uid: uidv, id: key }, true)).drive; } catch (e) { why = why || e.message; }
      if (lastDir) {
        if ((await lastDir.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error(T('Cần cho phép ghi vào ổ USB'));
        let uidTxt = null, cfg = null;
        for await (const [name, hd] of lastDir.entries()) {
          if (hd.kind !== 'file') continue;
          if (name.toUpperCase() === 'UID.TXT') uidTxt = hd;
          if (name.toLowerCase() === 'config.json') cfg = hd;
        }
        if (uidTxt && cfg && sameUid(uidFind(await (await uidTxt.getFile()).text()), uidv)) {
          const text = await (await cfg.getFile()).text(), wr = await cfg.createWritable();
          await wr.write(putId(text, key)); await wr.close();
          return lastDir.name;
        }
      }
      throw new Error(why || T('Không thấy ổ USB của mạch này (cắm mạch vào máy đang mở app)'));
    };
    const scanUsb = async () => {
      // 1. Trợ giúp LED Factory đang chạy trên CHÍNH máy này (Windows): quét mọi ổ USB của máy này
      if (/Windows/.test(navigator.userAgent)) {
        try {
          const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 2000);
          const res = await fetch('http://127.0.0.1:47815/uid', { signal: ctl.signal, cache: 'no-store' });
          clearTimeout(tm);
          if (res.ok) return useFound((await res.json()).found, 'Không thấy UID.TXT ở thư mục gốc ổ USB nào của máy này');
        } catch (e) {}
      }
      // 2. App mở trên chính máy chủ: máy chủ quét
      let r = null;
      try { r = await api('usb.scan_uid', {}, true); } catch (e) {}
      if (r && r.local) return useFound(r.found, 'Không thấy UID.TXT ở thư mục gốc ổ USB nào của máy chủ');
      if (!window.showDirectoryPicker) return say(false, T('Máy này không quét được ổ USB: mở app trên máy chủ hoặc dùng Chrome / Edge trên máy tính, hoặc bấm Chọn UID.TXT'));
      try {
        const dir = await window.showDirectoryPicker({ id: 'lf-uid-usb', mode: 'read' });
        lastDir = dir;
        for await (const [name, hd] of dir.entries())
          if (hd.kind === 'file' && name.toUpperCase() === 'UID.TXT') return useText(await (await hd.getFile()).text(), `${dir.name}\\${name}`);
        say(false, T('Không có UID.TXT ở thư mục gốc của ') + dir.name);
      } catch (e) {
        if (e.name === 'AbortError') return;
        // trình duyệt không cho chọn cả ổ đĩa -> chọn thẳng file (vẫn nhớ chỗ cho lần sau)
        try {
          const [fh] = await window.showOpenFilePicker({ id: 'lf-uid-file', types: [{ description: 'UID.TXT', accept: { 'text/plain': ['.txt'] } }] });
          const file = await fh.getFile();
          useText(await file.text(), file.name);
        } catch (e2) { if (e2.name !== 'AbortError') say(false, e2.message); }
      }
    };
    const scanBtn = h('button', { class: 'btn ghost small', onclick: () => busy(scanBtn, scanUsb()) }, '🔍 Quét UID');
    const dz = h('div', { class: 'row dz' }, h('div', { class: 'grow' }, uid), scanBtn, h('label', { class: 'btn ghost small' }, 'Chọn UID.TXT', fileIn));
    ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', e => readFile(e.dataTransfer.files[0]));
    btn.onclick = () => busy(btn, api('keys.issue', { uid: uid.value, ...keyCtx }).then(r => {
      const b = r.board || {};
      const line = h('div', { class: 'idline' }, r.line);
      const copy = h('button', { class: 'btn' }, 'Sao chép');
      copy.onclick = () => { (navigator.clipboard ? navigator.clipboard.writeText(r.line) : Promise.reject()).then(() => { copy.textContent = T('Đã sao chép'); })
        .catch(() => { const s = window.getSelection(), rg = document.createRange(); rg.selectNodeContents(line); s.removeAllRanges(); s.addRange(rg); try { document.execCommand('copy'); copy.textContent = T('Đã sao chép'); } catch (e) {} }); };
      const key = (String(r.line).match(/[0-9A-Fa-f]{128}/) || [''])[0];
      const saveMsg = h('p', { class: 'small' });
      const save = h('button', { class: 'btn ghost', onclick: () => busy(save, saveToDevice(r.uid, key).then(drv => {
        saveMsg.style.color = 'var(--ok)';
        saveMsg.textContent = T('Đã lưu mã vào config.json trên ổ ') + drv + T(' – Eject (Safely Remove) ổ rồi rút / cắm lại mạch');
        save.textContent = T('✓ Đã lưu vào thiết bị');
      }).catch(e => { saveMsg.style.color = 'var(--bad)'; saveMsg.textContent = e.message; })) }, '💾 Lưu vào thiết bị');
      if (!key) save.disabled = true;
      out.replaceChildren(h('div', { class: 'card' },
        h('div', { class: 'row' }, boardIcon(b), h('p', { style: 'color:var(--' + (r.again ? 'muted' : 'ok') + ')' }, r.again ? `Mạch ĐÃ CÓ MÃ (tạo ${b.key_at ? dmy(b.key_at) : ''}) – tạo lại mã, không tính mạch mới` : 'Mạch MỚI – đã vào Thành phẩm')),
        h('div', { class: 'mono' }, 'UID ' + uidFmt(r.uid)),
        h('p', { class: 'small muted' }, 'Dán dòng dưới vào config.json trên ổ CONFIG của mạch (thay dòng "id" cũ):'), line,
        h('div', { class: 'row' }, copy, h('button', { class: 'btn ghost', onclick: () => printLabels([b]) }, '🏷 In tem QR'), h('button', { class: 'btn ghost', onclick: () => boardDetail(r.uid) }, 'Chi tiết mạch'), save),
        saveMsg));
      uid.value = ''; msg.textContent = ''; ck(); reloadList();
    }).catch(() => {}));
    cards.push(h('div', { class: 'card' }, h('h2', {}, 'Tạo mã mạch LED'),
      // từng mảnh là 1 con chữ riêng -> h() dịch từng mảnh (tên máy chủ giữ nguyên)
      !st.ready && h('div', { class: 'banner' }, 'Máy chủ', ' "', document.createTextNode(st.server || ''), '" ', 'không tạo được mã:', ' ', st.why || '', ' ',
        'Cài khóa riêng lên máy chủ này (giống key server: %LOCALAPPDATA%\\KeyServer\\ed25519_private.key) hoặc dùng máy chủ khác có khóa.'),
      two(field('Loại mạch', prod), field('Lệnh sản xuất', wo)),
      field('UID (24 ký tự hex) – gõ, chọn / kéo thả file UID.TXT, hoặc bấm 1 mạch chưa có mã ở mục bên dưới', dz), msg, btn), out);
  }
  // phan Mach (giu nguyen noi dung): bam mach CHUA co ID -> UID len o Lay ID; mach da co ID -> chi tiet
  const list = boardsCard(canIssue ? setUid : null);
  reloadList = list.load;
  cards.push(list.card);
  el.replaceChildren(...cards);
  ck(); await list.load();
}

// ---------- tem QR theo UID ----------
let labelCfg = (() => { try { return JSON.parse(localStorage.getItem('lf-label')) || null; } catch (e) { return null; } })() || { w: 40, h: 25, mode: 'roll' };
function labelEl(b, cfg) {
  const q = Math.min(cfg.h - 2.4, cfg.w * 0.45);
  const qr = qrcode(0, 'M'); qr.addData(uidFmt(b.uid)); qr.make();
  return h('div', { class: 'label', style: `width:${cfg.w}mm;height:${cfg.h}mm` },
    h('img', { src: qr.createDataURL(6, 0), style: `width:${q}mm;height:${q}mm`, alt: b.uid }),
    h('div', {}, h('div', { class: 'lt' }, b.product_code || b.product_name || 'LED'), h('div', { class: 'lu' }, uidFmt(b.uid)),
      h('div', { class: 'ls' }, [b.wo_number, b.key_at ? dmy(b.key_at) : ''].filter(Boolean).join(' · '))));
}
function printLabels(boards) {
  boards = boards.filter(b => b && b.uid);
  if (!boards.length) return toast('Chưa chọn mạch nào', true);
  printTags(boards, labelEl, 'Mã QR chứa UID (dạng XXXXXXXX-XXXXXXXX-XXXXXXXX): quét bằng app (📷) hoặc máy quét để mở thẳng mạch đó.');
}
// Bảng in tem chung (mạch / linh kiện): khổ tem + kiểu in nhớ trên máy này
function printTags(items, render, note) {
  const w = numIn(labelCfg.w, 1), hh = numIn(labelCfg.h, 1);
  const mode = h('select', {}, h('option', { value: 'roll', selected: labelCfg.mode === 'roll' }, 'Máy in tem (mỗi tem 1 trang)'), h('option', { value: 'a4', selected: labelCfg.mode === 'a4' }, 'Giấy A4 (xếp nhiều tem)'));
  const prev = h('div', { class: 'labels' });
  const draw = () => { labelCfg = { w: +w.value || 40, h: +hh.value || 25, mode: mode.value }; try { localStorage.setItem('lf-label', JSON.stringify(labelCfg)); } catch (e) {}
    prev.replaceChildren(...items.slice(0, 60).map(b => render(b, labelCfg))); };
  w.oninput = hh.oninput = mode.onchange = draw; draw();
  sheet(`${T('In tem')} (${items.length})`, grid(two(field('Rộng (mm)', w), field('Cao (mm)', hh)), field('Kiểu in', mode), prev,
    h('p', { class: 'small muted' }, note)),
    h('button', { class: 'btn', onclick: () => {
      const st = document.createElement('style');
      st.textContent = labelCfg.mode === 'roll' ? `@page{size:${labelCfg.w}mm ${labelCfg.h}mm;margin:0}.print-area .label{page-break-after:always}` : '@page{size:A4;margin:8mm}';
      const area = h('div', { class: 'print-area' }, h('div', { class: 'labels' }, items.map(b => render(b, labelCfg))));
      document.head.append(st); document.body.append(area);
      setTimeout(() => { window.print(); setTimeout(() => { area.remove(); st.remove(); }, 500); }, 200);
    } }, '🖨 In'));
}
// Tem linh kiện / vật tư: QR = mã kho (LK-…), dán lên ngăn, hộp, túi, cuộn
function partTagEl(p, cfg) {
  const q = Math.min(cfg.h - 2.4, cfg.w * 0.45);
  const qr = qrcode(0, 'M'); qr.addData(p.code || ''); qr.make();
  return h('div', { class: 'label', style: `width:${cfg.w}mm;height:${cfg.h}mm` },
    h('img', { src: qr.createDataURL(6, 0), style: `width:${q}mm;height:${q}mm`, alt: p.code }),
    h('div', {}, h('div', { class: 'lu' }, p.code || ''), h('div', { class: 'lt' }, `${p.name || ''}${p.spec && !String(p.name).includes(p.spec) ? ' ' + p.spec : ''}`),
      h('div', { class: 'ls' }, [p.package, p.location && '📍' + p.location].filter(Boolean).join(' · '))));
}
function printPartTags(parts) {
  parts = parts.filter(p => p && p.code);
  if (!parts.length) return toast('Chưa chọn linh kiện nào', true);
  printTags(parts, partTagEl, 'Mã QR chứa mã kho (LK-…): quét bằng app (📷) hoặc máy quét để mở linh kiện, nhập / xuất / kiểm kê nhanh. Dán lên ngăn tủ, hộp, túi hoặc cuộn.');
}

// ---------- MẠCH (mục cũ, giữ nguyên nội dung; nằm trong trang Tạo mã, tiêu đề "Nhập UID (chưa tạo mã)") ----------
let boardQ = '', boardSt = '';
function boardsCard(onPick) {
  const q = h('input', { type: 'search', placeholder: 'UID, khách, lệnh, phiếu bán… hoặc gõ: chưa tạo mã / đã tạo mã', value: boardQ });
  const box = h('div', { class: 'list' });
  let rows = [], picked = new Set();
  const printBtn = h('button', { class: 'btn ghost', onclick: () => printLabels(rows.filter(b => picked.has(b.id))) }, '🏷 In tem đã chọn');
  // ô tìm: gõ "chưa tạo mã" / "đã tạo mã" (hoặc "chưa ID" / "đã ID"; tiếng Anh "no ID" / "has ID") (có dấu hay không) = lọc theo mã;
  // phần chữ còn lại tìm như thường (UID, khách, lệnh, phiếu)
  const idFilter = () => { const v = vn(boardQ), m = v.match(/\b(chua|da|no|has)\s*((lay\s*)?id|(tao\s*)?ma)\b/);
    return { q: m ? boardQ.slice(0, m.index).concat(boardQ.slice(m.index + m[0].length)).trim() : boardQ, f: m ? (m[1] === 'chua' || m[1] === 'no' ? { no_key: 1 } : { has_key: 1 }) : {} }; };
  const load = () => { const x = idFilter(); return api('boards.list', { q: x.q, status: boardSt, limit: 300, ...x.f }).then(r => {
    rows = r; picked = new Set([...picked].filter(id => rows.some(b => b.id === id)));
    printBtn.textContent = T('🏷 In tem đã chọn') + (picked.size ? ` (${picked.size})` : '');
    box.replaceChildren(...(rows.length ? rows.map(b => {
      const cb = h('input', { type: 'checkbox', checked: picked.has(b.id), onclick: e => e.stopPropagation(), onchange: e => { e.target.checked ? picked.add(b.id) : picked.delete(b.id); printBtn.textContent = T('🏷 In tem đã chọn') + (picked.size ? ` (${picked.size})` : ''); } });
      return h('div', { class: 'item', onclick: () => (onPick && !b.key_id) ? onPick(b) : boardDetail(b.uid) }, h('div', { class: 'l', style: 'display:flex;gap:6px;align-items:center' }, cb, boardIcon(b)), h('div', { class: 't mono' }, uidFmt(b.uid)),
        h('div', { class: 'r' }, bchip(b.status), b.key_id ? '' : [h('br'), h('span', { class: 'chip plan' }, 'Chưa có mã')]),
        h('div', { class: 's' }, [b.product_code || b.product_name, b.wo_number, b.customer_name, b.key_at && dmy(b.key_at)].filter(Boolean).join(' · ')));
    }) : [h('div', { class: 'empty' }, 'Không có mạch nào khớp. Mạch được thêm khi Tạo mã, hoặc bấm "+ Thêm mạch" để nhập UID trước.')]));
  }).catch(() => {}); };
  let t;
  q.addEventListener('input', () => { boardQ = q.value.trim(); clearTimeout(t); t = setTimeout(load, 250); });
  const stSel = h('select', { onchange: e => { boardSt = e.target.value; load(); } }, h('option', { value: '' }, 'Mọi trạng thái'),
    Object.entries(BSTATUS).map(([v, l]) => h('option', { value: v, selected: v === boardSt }, l)));
  return { load, card: h('div', { class: 'card' }, h('h3', {}, 'Nhập UID (chưa tạo mã)'), q, h('div', { class: 'row' }, stSel, printBtn,
    can('boards.save') && h('button', { class: 'btn ghost', onclick: () => boardEdit({}) }, '+ Thêm mạch')),
    onPick && h('p', { class: 'small muted' }, 'Bấm 1 mạch chưa có mã (biểu tượng mờ) để đưa UID lên ô Tạo mã phía trên.'), box, boardLegend()) };
}
async function boardDetail(uid) {
  const b = await api('boards.get', { uid });
  let close;
  close = sheet('Mạch ' + uidFmt(b.uid), grid(
    h('div', { class: 'row' }, boardIcon(b, true), h('div', {}, h('div', {}, bchip(b.status), ' ', b.key_id ? h('span', { class: 'chip sold' }, 'Đã có mã') : h('span', { class: 'chip plan' }, 'Chưa có mã')),
      h('div', { class: 'small muted' }, BSTATE_T[boardState(b)]))),
    // dòng đời: lệnh sản xuất -> Tạo mã -> bán -> bảo hành
    h('ul', { class: 'tl' },
      h('li', { class: b.wo_number ? 'on' : '' }, h('div', {}, h('b', {}, 'Sản xuất'), h('div', { class: 'small muted' }, b.wo_number ? `${b.wo_number}${b.product_name ? ' · ' + b.product_name : ''}` : T('chưa gắn lệnh sản xuất')))),
      h('li', { class: b.key_at ? 'on' : '' }, h('div', {}, h('b', {}, 'Tạo mã'), h('div', { class: 'small muted' }, b.key_at ? `${dmy(b.key_at)} ${hm(b.key_at)}` : T('chưa có mã')))),
      h('li', { class: b.sold_at ? 'on' : '' }, h('div', {}, h('b', {}, 'Bán'), h('div', { class: 'small muted' }, b.sold_at ? `${dmy(b.sold_at)} · ${b.customer_name || T('Khách lẻ')}${b.sale_number ? ' · ' + b.sale_number : ''}` : T('còn trong kho')))),
      h('li', { class: b.warranty_until ? 'on' : '' }, h('div', {}, h('b', {}, 'Bảo hành'), h('div', { class: 'small muted' }, b.warranty_until ? `${T('đến')} ${dmy(b.warranty_until)}${b.warranty_until < Date.now() ? T(' (hết hạn)') : ''}` : '—'))),
      (b.status === 'returned' || b.status === 'scrap') && h('li', { class: 'on' }, h('div', {}, h('b', { style: 'color:var(--bad)' }, BSTATUS[b.status]), h('div', { class: 'small muted' }, b.note || '')))),
    kv([['UID', h('span', { class: 'mono' }, uidFmt(b.uid))], ['Loại mạch', [b.product_code, b.product_name].filter(Boolean).join(' · ')], ['Lệnh SX', b.wo_number],
      ['Tạo mã', b.key_at ? `${dmy(b.key_at)} ${hm(b.key_at)}` : ''], ['Firmware', b.firmware], ['Khách', b.customer_name ? `${b.customer_name}${b.customer_phone ? ' · ' + b.customer_phone : ''}` : ''],
      ['Phiếu bán', b.sale_number], ['Ngày bán', b.sold_at ? dmy(b.sold_at) : ''],
      ['Bảo hành đến', b.warranty_until ? h('span', { style: `color:var(--${b.warranty_until > Date.now() ? 'ok' : 'bad'})` }, dmy(b.warranty_until) + (b.warranty_until > Date.now() ? '' : T(' (hết hạn)'))) : ''],
      ['Ghi chú', b.note]]),
    b.key_id && h('details', {}, h('summary', {}, T('Dòng "id" của mạch')), h('div', { class: 'idline' }, `"id": "${b.key_id}"`))),
    [h('button', { class: 'btn', onclick: () => printLabels([b]) }, '🏷 In tem'),
     can('keys.issue') && !b.key_id && h('button', { class: 'btn ghost', onclick: () => { close(); keyCtx = { product_id: b.product_id || '', work_order_id: b.work_order_id || '' }; go('keys'); } }, 'Tạo mã'),
     can('boards.save') && h('button', { class: 'btn ghost', onclick: () => { close(); boardEdit(b); } }, 'Sửa')]);
}
async function boardEdit(b) {
  const isNew = !b.id;
  await refreshProducts();
  const wos = await api('wo.list', {}).catch(() => []);
  const uid = h('input', { class: 'mono', value: uidFmt(b.uid) || '', placeholder: '36FFDB05-30473036-33562443', autocapitalize: 'characters', disabled: !isNew });
  let pid = b.product_id || '', wid = b.work_order_id || '';
  const prod = combo(S.products, p => `${p.code ? p.code + ' · ' : ''}${p.name}`, pid, 'Loại mạch…', p => { pid = p ? p.id : ''; });
  const wo = combo(wos, o => `${o.number} · ${o.product_name || ''}`, wid, 'Lệnh sản xuất…', o => { wid = o ? o.id : ''; });
  const st = h('select', {}, Object.entries(BSTATUS).map(([v, l]) => h('option', { value: v, selected: v === (b.status || 'stock') }, l)));
  const fw = h('input', { value: b.firmware || '', placeholder: 'VD: ledfull F69999F8' }), note = h('textarea', { value: b.note || '' });
  const btn = h('button', { class: 'btn' }, 'Lưu');
  let close;
  btn.onclick = () => {
    const a = { product_id: pid || null, work_order_id: wid || null, status: st.value, firmware: fw.value.trim() || null, note: note.value.trim() || null };
    if (isNew) a.uid = uid.value; else a.id = b.id;
    busy(btn, api('boards.save', a).then(r => { toast('Đã lưu'); close(); go('keys'); if (!isNew) boardDetail(r.uid); }).catch(() => {}));
  };
  close = sheet(isNew ? 'Thêm mạch (chưa tạo mã)' : 'Sửa mạch', grid(field('UID', uid), two(field('Loại mạch', prod), field('Lệnh SX', wo)),
    two(field('Trạng thái', st), field('Firmware', fw)), field('Ghi chú (lỗi, bảo hành…)', note)), btn);
}

// ---------- SẢN XUẤT: lệnh sản xuất + loại mạch / BOM ----------
let prodTab = 'wo';
async function vProduction(el) {
  const pick = t => { prodTab = t; go('production'); };
  if (prodTab === 'types') {
    const rows = await refreshProducts();
    el.replaceChildren(h('div', { class: 'card' },
      segBar('types', [['wo', 'Lệnh sản xuất'], ['types', 'Loại mạch & BOM', rows.length]], pick, can('products.save') && ['+ Loại mạch', () => productEdit({})]),
      h('div', { class: 'list' }, rows.length ? rows.map(p => h('div', { class: 'item', onclick: () => bomSheet(p.id) },
        h('div', { class: 'l' }, p.code || '▣'), h('div', { class: 't' }, p.name + (p.version ? ` (${p.version})` : '')),
        h('div', { class: 'r' }, h('b', {}, `${num(p.in_stock)}`), T(' trong kho'), h('br'), h('span', { class: 'muted' }, money(p.price))),
        h('div', { class: 's' }, [`BOM ${p.bom_lines} ${T('dòng')}`, `${T('giá thành')} ~${money(p.cost)}`, `${T('đã làm')} ${p.made}`, p.tracked === 0 ? T('không theo UID') : ''].filter(Boolean).join(' · ')))) :
        h('div', { class: 'empty' }, 'Chưa có loại mạch. Thêm loại mạch rồi nhập BOM (định mức linh kiện).'))));
    return;
  }
  const rows = await api('wo.list', {});
  el.replaceChildren(h('div', { class: 'card' },
    segBar('wo', [['wo', 'Lệnh sản xuất', rows.filter(o => o.status === 'plan' || o.status === 'running').length], ['types', 'Loại mạch & BOM']], pick, can('wo.save') && ['+ Lệnh SX', () => woEdit({})]),
    h('div', { class: 'list' }, rows.length ? rows.map(o => h('div', { class: 'item', onclick: () => woDetail(o.id) },
      h('div', { class: 'l' }, `${o.qty_plan}×`), h('div', { class: 't' }, `${o.number} · ${o.product_name || '?'}`), h('div', { class: 'r' }, wchip(o.status)),
      h('div', { class: 's' }, `${T('đã xuất LK')} ${o.parts_issued}/${o.qty_plan} · ${T('mạch có UID')} ${o.boards}${o.assignee ? ' · ' + o.assignee : ''}`))) :
      h('div', { class: 'empty' }, 'Chưa có lệnh sản xuất'))));
}
async function productEdit(p) {
  const f = { code: h('input', { value: p.code || '', placeholder: 'VD: F103-8P' }), name: h('input', { value: p.name || '', placeholder: 'Mạch điều khiển LED 8 cổng' }),
    version: h('input', { value: p.version || '', placeholder: 'VD: v2.1' }), price: numIn(p.price || 0, 1000), warranty_months: numIn(p.warranty_months ?? 12, 1),
    firmware: h('input', { value: p.firmware || '', placeholder: 'Firmware mặc định' }), description: h('textarea', { value: p.description || '' }),
    tracked: h('select', {}, h('option', { value: 1, selected: p.tracked !== 0 }, 'Theo dõi từng mạch theo UID'), h('option', { value: 0, selected: p.tracked === 0 }, 'Chỉ đếm số lượng (cáp, nguồn…)')),
    active: h('select', {}, h('option', { value: 1, selected: p.active !== 0 }, 'Đang làm / bán'), h('option', { value: 0, selected: p.active === 0 }, 'Ngừng')) };
  const btn = h('button', { class: 'btn' }, 'Lưu');
  let close;
  btn.onclick = () => {
    const a = { code: f.code.value.trim() || null, name: f.name.value.trim(), version: f.version.value.trim() || null, price: +f.price.value || 0,
      warranty_months: +f.warranty_months.value || 0, firmware: f.firmware.value.trim() || null, description: f.description.value, tracked: +f.tracked.value, active: +f.active.value };
    if (p.id) a.id = p.id;
    busy(btn, api('products.save', a).then(r => { toast('Đã lưu'); close(); refreshProducts(); if (!p.id) bomSheet(r.id); else go('production'); }).catch(() => {}));
  };
  close = sheet(p.id ? 'Sửa loại mạch' : 'Loại mạch mới', grid(two(field('Mã', f.code), field('Phiên bản', f.version)), field('Tên', f.name),
    two(field('Giá bán (đ)', f.price), field('Bảo hành (tháng)', f.warranty_months)), field('Cách quản lý', f.tracked), field('Firmware', f.firmware),
    field('Mô tả', f.description), field('Trạng thái', f.active)),
    [btn, p.id && h('button', { class: 'btn bad', onclick: () => { if (window.confirm(T('Xóa loại mạch này?'))) api('products.delete', { id: p.id }).then(() => { close(); refreshProducts(); go('production'); }).catch(() => {}); } }, 'Xóa')]);
}
async function partsCache() { return (S.parts = await api('parts.list', { limit: 5000 }, true).catch(() => S.parts || [])); }
const partLabel = p => `${p.code || ''} · ${p.name}${p.spec ? ' ' + p.spec : ''}${p.package ? ' (' + p.package + ')' : ''}`;
async function bomSheet(product_id) {
  const [p, parts] = await Promise.all([api('bom.get', { product_id }), partsCache()]);
  const edit = can('bom.save');
  const lines = [], box = h('div', { class: 'lines' });
  const costEl = h('b', {});
  const recalc = () => { costEl.textContent = money(lines.reduce((s, l) => { const pt = parts.find(x => x.id === l.sel.value); return s + (pt ? pt.cost * (+l.qty.value || 0) : 0); }, 0)); };
  const add = b => {
    const L = { sel: combo(parts, partLabel, b && b.part_id, 'Gõ mã / tên linh kiện…', recalc), qty: numIn(b ? b.qty : 1), ref: h('input', { value: b ? b.ref || '' : '', placeholder: 'R1,R2…' }) };
    L.qty.oninput = recalc;
    const rm = h('button', { class: 'x', type: 'button', onclick: () => { lines.splice(lines.indexOf(L), 1); row.remove(); recalc(); } }, '✕');
    const row = h('div', { class: 'line', style: 'grid-template-columns:1fr 64px 90px auto' }, L.sel, L.qty, L.ref, rm);
    lines.push(L); box.append(row); recalc();
  };
  (p.bom || []).forEach(add);
  if (!lines.length && edit) add();
  let close;
  const view = h('div', { class: 'list' }, (p.bom || []).map(b => h('div', { class: 'item' }, h('div', { class: 'l' }, `${num(b.qty)}×`), h('div', { class: 't' }, `${b.code} · ${b.name}`),
    h('div', { class: 'r' }, `${num(b.stock)} ${T(b.unit || '')}`), h('div', { class: 's' }, [b.spec, b.package, b.ref].filter(Boolean).join(' · ')))));
  close = sheet(`BOM: ${p.code ? p.code + ' · ' : ''}${p.name}`, grid(
    h('p', { class: 'small muted' }, 'Định mức linh kiện cho 1 mạch. Khi xuất linh kiện cho lệnh sản xuất, kho tự trừ theo BOM × số mạch.'),
    edit ? [h('div', { class: 'small muted' }, 'Linh kiện · SL/mạch · Vị trí (ref)'), box, h('button', { class: 'btn ghost small', type: 'button', onclick: () => add() }, '+ Thêm dòng')] : view,
    h('div', { class: 'row between' }, h('span', { class: 'muted' }, 'Giá thành linh kiện / mạch'), costEl)),
    [edit && h('button', { class: 'btn', onclick: e => busy(e.target, api('bom.save', { product_id, items: lines.filter(l => l.sel.value).map(l => ({ part_id: l.sel.value, qty: +l.qty.value || 1, ref: l.ref.value.trim() })) })
      .then(() => { toast('Đã lưu BOM'); close(); go('production'); }).catch(() => {})) }, 'Lưu BOM'),
     can('products.save') && h('button', { class: 'btn ghost', onclick: () => { close(); productEdit(p); } }, 'Sửa loại mạch'),
     edit && h('button', { class: 'btn ghost', onclick: () => { close(); importSheet(product_id, 'part'); } }, '📄 Nhập BOM từ file')]);
}
async function woEdit(o) {
  await refreshProducts();
  let pid = o.product_id || '';
  const prod = combo(S.products.filter(p => p.active !== 0), p => `${p.code ? p.code + ' · ' : ''}${p.name}`, pid, 'Loại mạch…', p => { pid = p ? p.id : ''; });
  const qty = numIn(o.qty_plan || 10, 1), who = h('input', { value: o.assignee || '', placeholder: 'Người / tổ phụ trách' }), note = h('textarea', { value: o.note || '' });
  const btn = h('button', { class: 'btn' }, 'Lưu');
  let close;
  btn.onclick = () => busy(btn, api('wo.save', { ...(o.id ? { id: o.id } : {}), product_id: pid, qty_plan: +qty.value, assignee: who.value.trim() || null, note: note.value })
    .then(r => { toast('Đã lưu'); close(); go('production'); woDetail(r.id); }).catch(() => {}));
  close = sheet(o.id ? `Sửa ${o.number}` : 'Lệnh sản xuất mới', grid(field('Loại mạch', prod), two(field('Số mạch', qty), field('Phụ trách', who)), field('Ghi chú', note)), btn);
}
async function woDetail(id) {
  const o = await api('wo.get', { id });
  const open = o.status === 'plan' || o.status === 'running';
  const n = numIn(Math.max(1, o.qty_plan - o.parts_issued), 1);
  let close;
  const issue = force => api('wo.issue', { id, qty: +n.value, force: force ? 1 : 0 }).then(() => { toast('Đã xuất linh kiện'); close(); woDetail(id); }).catch(e => {
    if (/Thiếu linh kiện/.test(e.message) && window.confirm(T('Thiếu linh kiện. Vẫn xuất (tồn kho sẽ âm)?'))) issue(true);
  });
  close = sheet(`${o.number} · ${o.product_name || ''}`, grid(
    h('div', { class: 'row' }, wchip(o.status)),
    kv([['Số mạch', o.qty_plan], ['Đã xuất linh kiện cho', `${o.parts_issued} mạch`], ['Thành phẩm (đã có mã)', `${(o.boards || []).filter(b => b.has_key).length}`],
      ['Bán thành phẩm (chưa có mã)', `${Math.max(0, o.parts_issued - (o.boards || []).filter(b => b.has_key).length)}`], ['Phụ trách', o.assignee],
      ['Bắt đầu', o.start_at ? dmy(o.start_at) : ''], ['Xong', o.done_at ? dmy(o.done_at) : ''], ['Ghi chú', o.note]]),
    h('h3', {}, 'Linh kiện theo BOM'),
    h('div', { class: 'list' }, (o.bom || []).length ? o.bom.map(b => { const need = b.qty * o.qty_plan, left = need - b.qty * o.parts_issued;
      return h('div', { class: 'item' }, h('div', { class: 'l' }, `${num(b.qty)}×`), h('div', { class: 't' }, `${b.code} · ${b.name}`),
        h('div', { class: 'r' }, h('b', { style: b.stock < left ? 'color:var(--bad)' : '' }, `${T('tồn')} ${num(b.stock)}`)),
        h('div', { class: 's' }, `${T('cần')} ${num(need)} · ${T('còn phải xuất')} ${num(Math.max(0, left))}`)); }) : h('div', { class: 'empty' }, 'Loại mạch chưa có BOM')),
    open && can('wo.issue') && h('div', { class: 'row' }, h('div', { class: 'grow' }, field('Xuất linh kiện cho (số mạch)', n)), h('button', { class: 'btn', onclick: () => issue(false) }, 'Xuất kho')),
    h('h3', {}, 'Mạch của lệnh (theo UID)'),
    h('div', { class: 'list' }, (o.boards || []).length ? o.boards.map(b => h('div', { class: 'item', onclick: () => { close(); boardDetail(b.uid); } },
      h('div', { class: 'l' }, boardIcon(b)), h('div', { class: 't mono' }, uidFmt(b.uid)), h('div', { class: 'r' }, bchip(b.status)), h('div', { class: 's' }, b.key_at ? dmy(b.key_at) : ''))) :
      h('div', { class: 'empty' }, 'Chưa có mạch: vào Tạo mã, chọn lệnh này rồi nhập UID từng mạch'))),
    [open && can('keys.issue') && h('button', { class: 'btn ghost', onclick: () => { close(); keyCtx = { product_id: o.product_id, work_order_id: o.id }; go('keys'); } }, '🔑 Tạo mã cho lệnh này'),
     (o.boards || []).length && h('button', { class: 'btn ghost', onclick: () => printLabels(o.boards.map(b => ({ ...b, product_name: o.product_name, wo_number: o.number }))) }, '🏷 In tem'),
     open && can('wo.save') && h('button', { class: 'btn ghost', onclick: () => { close(); woEdit(o); } }, 'Sửa'),
     open && can('wo.finish') && h('button', { class: 'btn', onclick: () => {
       let good = 0;
       if (o.tracked === 0) { const v = ask('Số mạch đạt (cộng vào kho thành phẩm)?'); if (v == null) return; good = +v || 0; }
       else if (!window.confirm(T('Đóng lệnh sản xuất này?'))) return;
       api('wo.finish', { id, qty_good: good }).then(() => { toast('Đã đóng lệnh'); close(); go('production'); }).catch(() => {});
     } }, 'Đóng lệnh')]);
}

// ---------- KHO LINH KIỆN ----------
// ---------- KHO: 4 nhóm ----------
//   Linh kiện / Vật tư: vào bằng phiếu nhập, ra khi xuất cho lệnh sản xuất (theo BOM) hoặc xuất tay
//   Bán thành phẩm: mạch đã xuất linh kiện cho lệnh nhưng CHƯA có ID (chỉ là số đếm theo lệnh – UID quét lúc Tạo mã)
//   Thành phẩm: mạch đã có ID còn trong kho (theo loại mạch) + hàng không theo dõi UID
let partQ = '', partLow = 0, khoTab = 'part', partBom = '';
const partSel = new Set();      // linh kiện đã tích (in tem)
const KHO = { part: 'Linh kiện', supply: 'Vật tư', wip: 'Bán thành phẩm', done: 'Thành phẩm' };
async function vParts(el) {
  const ov = await api('stock.overview');
  const pc = Object.fromEntries((ov.parts || []).map(x => [x.category, x]));
  const wipN = (ov.wip || []).reduce((s, o) => s + o.parts_issued - o.with_id, 0);
  const doneN = (ov.done || []).reduce((s, p) => s + (p.n || 0), 0) + ((ov.done_unknown || {}).n || 0);
  const cnt = { part: (pc.part || {}).n || 0, supply: (pc.supply || {}).n || 0, wip: wipN, done: doneN };
  const seg = h('div', { class: 'seg' }, Object.entries(KHO).map(([k, l]) => h('button', { class: k === khoTab ? 'on' : '', onclick: () => { khoTab = k; go('parts'); } }, l, h('span', { class: 'n' }, cnt[k]))));
  if (khoTab === 'wip') {
    el.replaceChildren(h('div', { class: 'card' }, seg,
      h('p', { class: 'small muted' }, 'Mạch đã xuất linh kiện cho lệnh sản xuất nhưng chưa tạo mã. Tạo mã cho mạch nào thì mạch đó chuyển sang Thành phẩm.'),
      h('div', { class: 'list' }, (ov.wip || []).length ? ov.wip.map(o => h('div', { class: 'item', onclick: () => woDetail(o.id) },
        h('div', { class: 'l' }, boardIcon({})), h('div', { class: 't' }, `${o.number} · ${o.product_code || o.product_name || ''}`),
        h('div', { class: 'r' }, h('b', {}, o.parts_issued - o.with_id), T(' mạch'), h('br'), wchip(o.status)),
        h('div', { class: 's' }, `${T('đã xuất linh kiện')} ${o.parts_issued}/${o.qty_plan} · ${T('đã có mã')} ${o.with_id}`))) :
        h('div', { class: 'empty' }, 'Không có mạch nào đang dở')),
      can('keys.issue') && (ov.wip || []).length > 0 && h('button', { class: 'btn ghost', onclick: () => go('keys') }, '🔑 Sang Tạo mã'), boardLegend()));
    return;
  }
  if (khoTab === 'done') {
    const rows = (ov.done || []).filter(p => p.n > 0);
    el.replaceChildren(h('div', { class: 'card' }, seg,
      h('p', { class: 'small muted' }, 'Mạch đã có mã còn trong kho (kể cả mạch khách trả về), theo loại mạch. Bấm để xem từng mạch, in tem.'),
      h('div', { class: 'list' }, rows.length || (ov.done_unknown || {}).n ? [...rows.map(p => h('div', { class: 'item', onclick: () => p.tracked !== 0 && finishedSheet(p) },
        h('div', { class: 'l' }, p.tracked !== 0 ? boardIcon({ key_id: 1 }) : '▣'), h('div', { class: 't' }, `${p.code ? p.code + ' · ' : ''}${p.name}`),
        h('div', { class: 'r' }, h('b', {}, num(p.n)), h('br'), h('span', { class: 'muted' }, money(p.price))),
        h('div', { class: 's' }, p.tracked !== 0 ? `${T('giá trị')} ${money(p.n * p.price)}` : T('không theo dõi UID')))),
        (ov.done_unknown || {}).n ? h('div', { class: 'item', onclick: () => finishedSheet({ name: T('Chưa gán loại mạch') }) }, h('div', { class: 'l' }, boardIcon({ key_id: 1 })),
          h('div', { class: 't' }, 'Chưa gán loại mạch'), h('div', { class: 'r' }, h('b', {}, ov.done_unknown.n)), h('div', { class: 's' }, 'Tạo mã không chọn loại mạch – bấm để sửa từng mạch')) : null]
        : h('div', { class: 'empty' }, 'Chưa có thành phẩm trong kho')),
      h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => go('keys') }, 'Xem mọi mạch (cả đã bán)')), boardLegend()));
    return;
  }
  const cat = khoTab;
  await refreshProducts();
  const q = h('input', { type: 'search', placeholder: 'Mã, tên, giá trị, mã NSX / LCSC, vị trí…', value: partQ });
  const box = h('div', { class: 'list' });
  let rows = [];
  // Theo mạch / lẻ: '' = tất cả, '_loose' = không thuộc BOM loại mạch nào, id = trong BOM loại mạch đó
  const bomSel = h('select', { style: 'width:auto;max-width:100%', onchange: () => { partBom = bomSel.value; partSel.clear(); load(); } },
    h('option', { value: '' }, 'Mọi linh kiện'), h('option', { value: '_loose', selected: partBom === '_loose' }, 'Lẻ (không thuộc mạch nào)'),
    S.products.map(p => h('option', { value: p.id, selected: partBom === p.id }, `${T('Mạch')} ${p.code ? p.code + ' · ' : ''}${p.name}`)));
  const tagBtn = h('button', { class: 'btn ghost small', onclick: () => printPartTags(rows.filter(p => partSel.has(p.id))) });
  const allBtn = h('button', { class: 'btn ghost small', onclick: () => { const all = rows.length && rows.every(p => partSel.has(p.id)); rows.forEach(p => all ? partSel.delete(p.id) : partSel.add(p.id)); draw(); } });
  const draw = () => {
    tagBtn.textContent = `${T('🏷 In tem')} (${partSel.size})`; tagBtn.disabled = !partSel.size;
    allBtn.textContent = T(rows.length && rows.every(p => partSel.has(p.id)) ? '☐ Bỏ chọn' : '☑ Chọn tất cả');
    box.replaceChildren(...(rows.length ? rows.map(p => {
      const low = p.min_stock != null && p.stock <= p.min_stock;
      const ck = h('input', { type: 'checkbox', checked: partSel.has(p.id), style: 'width:auto;margin:0 4px 0 0', onclick: e => { e.stopPropagation(); ck.checked ? partSel.add(p.id) : partSel.delete(p.id); tagBtn.textContent = `${T('🏷 In tem')} (${partSel.size})`; tagBtn.disabled = !partSel.size; } });
      return h('div', { class: 'item', onclick: () => partSheet(p.id) }, h('div', { class: 'l', style: 'display:flex;align-items:center' }, ck, p.code || '▪'), h('div', { class: 't' }, p.name + (p.spec && !p.name.includes(p.spec) ? ' ' + p.spec : '')),
        h('div', { class: 'r' }, h('b', { style: low || p.stock <= 0 ? 'color:var(--bad)' : '' }, `${num(p.stock)} ${T(p.unit || '')}`), p.active === 0 ? [h('br'), h('span', { class: 'chip' }, 'Ngừng')] : ''),
        h('div', { class: 's' }, [p.package, p.location && '📍' + p.location, p.cost ? money(p.cost) : '', p.supplier_name, p.boms ? `${p.boms} ${T('mạch')}` : T('lẻ'), p.codes].filter(Boolean).join(' · ')));
    }) : [h('div', { class: 'empty' }, partLow ? 'Không có mục nào sắp hết' : cat === 'supply' ? 'Chưa có vật tư' : 'Chưa có linh kiện')]));
  };
  const load = () => api('parts.list', { q: partQ, low: partLow, category: cat, all: myRole() === 'owner' ? 1 : 0,
    product_id: partBom && partBom !== '_loose' ? partBom : '', loose: partBom === '_loose' ? 1 : 0, limit: 2000 }).then(r => { rows = r; draw(); });
  let t;
  q.addEventListener('input', () => { partQ = q.value.trim(); clearTimeout(t); t = setTimeout(load, 250); });
  const g = pc[cat] || {};
  el.replaceChildren(h('div', { class: 'card' }, seg, q,
    segBar(partLow ? 'low' : 'all', [['all', 'Tất cả'], ['low', `⚠ Sắp hết${g.low ? ' (' + g.low + ')' : ''}`]], k => { partLow = k === 'low' ? 1 : 0; go('parts'); },
      can('parts.save') && [cat === 'supply' ? '+ Vật tư' : '+ Linh kiện', () => partEdit({ category: cat })]),
    h('div', { class: 'row' }, bomSel, allBtn, tagBtn, (can('parts.save') || can('bom.save')) && h('button', { class: 'btn ghost small', onclick: () => importSheet(partBom && partBom !== '_loose' ? partBom : '', cat) }, '📄 Nhập từ file')),
    h('div', { class: 'row between' }, h('span', { class: 'small muted' }, `${T('Giá trị tồn')} ${money(g.value || 0)}`),
      h('button', { class: 'btn ghost small', onclick: partHistory }, 'Lịch sử nhập xuất')), box));
  await load();
}
// Thành phẩm của 1 loại mạch: từng mạch có ID còn trong kho -> chọn để in tem
async function finishedSheet(p) {
  const [a, b] = await Promise.all([api('boards.list', { status: 'stock', product_id: p.product_id || '', limit: 1000 }), api('boards.list', { status: 'returned', product_id: p.product_id || '', limit: 1000 })]);
  const rows = a.concat(b).filter(x => x.key_id && (p.product_id || !x.product_id));
  let close;
  close = sheet(`${T('Thành phẩm')}: ${p.code ? p.code + ' · ' : ''}${p.name}`, grid(
    h('div', { class: 'list' }, rows.length ? rows.map(x => h('div', { class: 'item', onclick: () => { close(); boardDetail(x.uid); } }, h('div', { class: 'l' }, boardIcon(x)),
      h('div', { class: 't mono' }, uidFmt(x.uid)), h('div', { class: 'r' }, bchip(x.status)), h('div', { class: 's' }, [x.wo_number, x.key_at && dmy(x.key_at)].filter(Boolean).join(' · ')))) : h('div', { class: 'empty' }, 'Không có'))),
    rows.length && h('button', { class: 'btn', onclick: () => printLabels(rows) }, `${T('🏷 In tem')} (${rows.length})`));
}
async function partSheet(id) {
  const p = await api('parts.get', { id });
  const kind = h('select', {}, ['in', 'out', 'return', 'adjust'].map(v => h('option', { value: v }, PMOVE[v])));
  const qty = numIn(''), note = h('input', { placeholder: 'Ghi chú (lý do, chứng từ…)' });
  const btn = h('button', { class: 'btn' }, 'Ghi phiếu');
  let close;
  btn.onclick = () => busy(btn, api('parts.move', { part_id: id, kind: kind.value, qty: +qty.value, note: note.value.trim() || null })
    .then(r => { toast(`Đã ghi. Tồn: ${num(r.stock_after)} ${T(p.unit || '')}`); close(); go('parts'); }).catch(() => {}));
  close = sheet(`${p.code} · ${p.name}`, grid(
    h('div', { class: 'stats' }, h('div', { class: 'stat' }, 'Tồn hiện tại', h('b', {}, `${num(p.stock)} ${T(p.unit || '')}`)),
      h('div', { class: 'stat' }, 'Giá nhập gần nhất', h('b', {}, money(p.cost))), p.min_stock != null && h('div', { class: 'stat' }, 'Báo khi dưới', h('b', {}, num(p.min_stock)))),
    kv([['Giá trị / thông số', p.spec], ['Kiểu chân', p.package], ['Hãng / mã NSX', [p.maker, p.mpn].filter(Boolean).join(' · ')], ['Vị trí', p.location], ['NCC chính', p.supplier_name], ['Ghi chú', p.note]]),
    can('parts.move') && [two(field('Loại phiếu', kind), field('Số lượng', qty)), field('Ghi chú', note), h('p', { class: 'small muted' }, 'Kiểm kê: nhập số âm hoặc dương để chỉnh lệch tồn. Nhập mua dùng mục Mua vào.')],
    codesBlock(p, () => { close(); partSheet(id); }),
    (p.used_in || []).length && [h('h3', {}, 'Dùng trong BOM'), h('div', { class: 'list' }, p.used_in.map(u => h('div', { class: 'item' }, h('div', { class: 'l' }, `${num(u.qty)}×`), h('div', { class: 't' }, `${u.code || ''} ${u.name}`), h('div', { class: 'r' }), h('div', { class: 's' }, u.ref || ''))))],
    (p.prices || []).length && [h('h3', {}, 'Giá các lần nhập'), h('div', { class: 'list' }, p.prices.map(x => h('div', { class: 'item' }, h('div', { class: 'l' }, dmy(x.at).slice(0, 5)), h('div', { class: 't' }, x.supplier_name || x.number), h('div', { class: 'r' }, money(x.price)), h('div', { class: 's' }, `${x.number} · ${T('SL')} ${num(x.qty)}`))))],
    h('h3', {}, 'Nhập xuất gần đây'),
    h('div', { class: 'list' }, (p.moves || []).length ? p.moves.slice(0, 30).map(m => h('div', { class: 'item' }, h('div', { class: 'l' }, dmy(m.at).slice(0, 5)), h('div', { class: 't' }, PMOVE[m.kind] || m.kind),
      h('div', { class: 'r' }, h('b', { style: `color:var(--${m.qty < 0 ? 'bad' : 'ok'})` }, `${m.qty > 0 ? '+' : ''}${num(m.qty)}`)), h('div', { class: 's' }, [m.doc, T(m.note || ''), m.by_name].filter(Boolean).join(' · ')))) : h('div', { class: 'empty' }, 'Chưa có'))),
    [can('parts.move') && btn, can('parts.save') && h('button', { class: 'btn ghost', onclick: () => { close(); partEdit(p); } }, 'Sửa linh kiện'),
     h('button', { class: 'btn ghost', onclick: () => printPartTags([p]) }, '🏷 In tem')]);
}
// ---------- NHẬP TỪ FILE: BOM KiCad / Altium / EasyEDA (CSV, TSV), Excel .xlsx tự làm ----------
// Đọc file (js/bomimport.js) -> xem trước từng dòng: ghép với linh kiện đã có (mã LCSC / MPN / giá trị + kiểu vỏ) hoặc TẠO MỚI (tồn 0)
// -> parts.import: tạo linh kiện, gắn mã phụ (MPN, LCSC), điền BOM nếu chọn loại mạch
async function importSheet(productId, cat) {
  await refreshProducts();
  const parts = await partsCache();
  const byCode = new Map(), byKey = new Map();
  for (const p of parts) {
    for (const c of [p.code, p.mpn, ...String(p.codes || '').split(' ')]) if (c) byCode.set(String(c).toUpperCase(), p);
    for (const v of [p.name, p.spec]) if (v) { const k = BomImport.key(v, p.package); if (!byKey.has(k)) byKey.set(k, p); }
  }
  const fileIn = h('input', { type: 'file', accept: '.csv,.tsv,.txt,.xlsx,text/csv', style: 'display:none' });
  const fileLbl = h('span', { class: 'small muted' }, 'CSV / TSV xuất từ KiCad, Altium, EasyEDA; hoặc Excel .xlsx');
  const target = h('select', {}, h('option', { value: '' }, 'Nhập lẻ (chỉ tạo linh kiện, không gắn mạch)'),
    S.products.map(p => h('option', { value: p.id, selected: p.id === productId }, `${T('Điền BOM mạch')} ${p.code ? p.code + ' · ' : ''}${p.name}`)));
  const replace = h('input', { type: 'checkbox', style: 'width:auto' });
  const replaceRow = h('label', { class: 'small', style: 'display:flex;gap:6px;align-items:center' }, replace, 'Thay toàn bộ BOM cũ bằng BOM trong file (không chọn: gộp vào BOM đang có)');
  const catSel = h('select', {}, h('option', { value: 'part', selected: cat !== 'supply' }, 'Linh kiện mới vào nhóm Linh kiện'), h('option', { value: 'supply', selected: cat === 'supply' }, 'Linh kiện mới vào nhóm Vật tư'));
  const sheetsBox = h('div', { class: 'row', style: 'flex-wrap:wrap' });
  const sum = h('p', { class: 'small' });
  const box = h('div', { class: 'list' });
  let sheets = [], lines = [];
  const showTarget = () => { replaceRow.style.display = target.value ? '' : 'none'; };
  target.onchange = showTarget; showTarget();
  const counts = () => {
    const on = lines.filter(l => l.inc.checked), nw = on.filter(l => !l.part).length;
    sum.textContent = `${on.length} ${T('dòng sẽ nhập')}: ${nw} ${T('tạo mới (tồn 0)')}, ${on.length - nw} ${T('đã có trong kho')} · ${lines.length - on.length} ${T('bỏ qua')}`;
  };
  const build = () => {
    const groups = new Map();
    sheets.filter(s => s.on && s.on.checked && s.parsed).forEach(s => s.parsed.items.forEach(it => {
      const k = BomImport.key(it.name, it.package);
      const g = groups.get(k);
      if (g) { g.qty += it.qty; g.ref = [g.ref, it.ref].filter(Boolean).join(', '); g.label = [g.label, it.label].filter(Boolean).join(', '); g.skip = g.skip && it.skip; }
      else groups.set(k, { ...it });
    }));
    lines = [...groups.values()].map(it => {
      const L = { it, part: byCode.get(String(it.lcsc).toUpperCase()) || byCode.get(String(it.mpn).toUpperCase()) || byKey.get(BomImport.key(it.name, it.package)) || byKey.get(BomImport.key(it.value, it.package)) || null };
      L.inc = h('input', { type: 'checkbox', checked: !it.skip, style: 'width:auto', onchange: counts });
      L.nameIn = h('input', { value: it.name, style: 'min-width:0' });
      L.st = h('span', { class: 'chip' });
      const showSt = () => { L.st.textContent = T(L.part ? 'Đã có' : 'Mới'); L.st.className = 'chip ' + (L.part ? 'done' : ''); L.nameIn.disabled = !!L.part; counts(); };
      L.sel = combo(parts, partLabel, L.part && L.part.id, T('— Tạo mới —'), p => { L.part = p; showSt(); });
      showSt();
      L.row = h('div', { class: 'item', style: 'grid-template-columns:auto 1fr auto' },
        h('div', { class: 'l', style: 'display:flex;gap:4px;align-items:center' }, L.inc, `${num(it.qty)}×`),
        h('div', { class: 't', style: 'display:grid;gap:4px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))' }, L.nameIn, L.sel),
        h('div', { class: 'r' }, L.st),
        h('div', { class: 's' }, [it.package, it.mpn && 'MPN ' + it.mpn, it.lcsc, it.ref && it.ref.slice(0, 60) + (it.ref.length > 60 ? '…' : ''), it.label && it.label.slice(0, 40)].filter(Boolean).join(' · ')));
      return L;
    });
    box.replaceChildren(...(lines.length ? lines.map(l => l.row) : [h('div', { class: 'empty' }, 'Không có dòng nào')]));
    counts();
  };
  fileIn.onchange = async () => {
    const f = fileIn.files[0];
    if (!f) return;
    fileLbl.textContent = f.name;
    try { sheets = await BomImport.read(f); } catch (e) { toast(e.message, true); return; }
    sheets.forEach(s => { s.parsed = BomImport.items(s); });
    const ok = sheets.filter(s => s.parsed);
    if (!ok.length) { toast('Không nhận ra cột trong file (cần ít nhất cột Giá trị / Value và Vị trí / Số lượng)', true); sheetsBox.replaceChildren(); box.replaceChildren(); return; }
    sheetsBox.replaceChildren(...sheets.map(s => { s.on = h('input', { type: 'checkbox', checked: !!s.parsed, disabled: !s.parsed, style: 'width:auto', onchange: build });
      return h('label', { class: 'small', style: 'display:flex;gap:4px;align-items:center' }, s.on, `${s.name} (${s.parsed ? s.parsed.items.length : T('không nhận ra')})`); }));
    build();
  };
  let close;
  const go1 = h('button', { class: 'btn', onclick: () => {
    const rows = lines.filter(l => l.inc.checked).map(l => {
      const it = l.it;
      return { part_id: l.part ? l.part.id : '', name: l.nameIn.value.trim() || it.name, spec: it.value !== l.nameIn.value.trim() ? it.value : '', package: it.package,
        maker: it.maker, mpn: it.mpn, lcsc: it.lcsc, unit: it.unit, code: it.code, category: catSel.value, qty: it.qty, ref: it.ref,
        note: [it.desc, it.label && `${T('Nhãn')}: ${it.label}`].filter(Boolean).join(' · ') };
    });
    if (!rows.length) return toast('Chưa chọn dòng nào', true);
    if (target.value && replace.checked && !window.confirm(T('Thay toàn bộ BOM cũ của loại mạch này bằng BOM trong file?'))) return;
    busy(go1, api('parts.import', { rows, product_id: target.value, replace: replace.checked ? 1 : 0 }, false).then(r => {
      toast(`${T('Đã nhập')}: ${r.created} ${T('linh kiện mới')}, ${r.linked} ${T('đã có')}${target.value ? `, BOM ${r.bom_lines} ${T('dòng')}` : ''}`);
      close(); S.parts = null; partSel.clear(); go('parts');
    }).catch(() => {}));
  } }, '📥 Nhập');
  close = sheet('Nhập linh kiện từ file', grid(
    h('div', { class: 'row' }, h('label', { class: 'btn ghost' }, '📂 Chọn file', fileIn), fileLbl),
    field('Nhập vào', target), replaceRow, field('Nhóm cho linh kiện mới', catSel), sheetsBox, sum,
    h('p', { class: 'small muted' }, 'Mỗi dòng: tích = nhập; ô chọn = linh kiện đã có trong kho (để trống = tạo mới, tồn 0, mã tự cấp LK-…). Điểm đo, lỗ bắt vít, dòng "Cần mua: Không" bỏ chọn sẵn. MPN / mã LCSC trong file được gắn làm mã phụ.'),
    box), go1);
}
// Mã phụ: mã LCSC, MPN, mã vạch / QR in sẵn của nhà cung cấp -> quét là ra linh kiện này
const PCODE = { lcsc: 'LCSC', mpn: 'MPN', barcode: 'Mã vạch NCC', other: 'Khác' };
function codesBlock(p, reopen) {
  const edit = can('parts.code_add');
  const inp = h('input', { placeholder: T('Gõ hoặc quét mã (C25804, MPN, mã vạch…)'), autocapitalize: 'characters' });
  const kind = h('select', { style: 'width:auto' }, Object.entries(PCODE).map(([v, l]) => h('option', { value: v }, l)));
  const add = h('button', { class: 'btn ghost small', onclick: () => {
    const c = inp.value.trim();
    if (!c) return;
    busy(add, api('parts.code_add', { part_id: p.id, code: c, kind: /^C\d{3,}$/i.test(c) ? 'lcsc' : kind.value }).then(() => { toast('Đã gắn mã phụ'); reopen(); }).catch(() => {}));
  } }, '+ Gắn');
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); add.click(); } });
  const list = (p.codes || []).map(c => h('span', { class: 'chip', style: 'display:inline-flex;gap:6px;align-items:center' }, `${T(PCODE[c.kind] || c.kind)}: ${c.code}`,
    edit && h('button', { class: 'x', style: 'padding:0 2px', onclick: () => { if (window.confirm(T('Bỏ mã phụ này?'))) api('parts.code_del', { id: c.id }).then(reopen).catch(() => {}); } }, '✕')));
  if (!edit && !list.length) return null;
  return [h('h3', {}, 'Mã phụ (quét tem nhà cung cấp)'),
    list.length ? h('div', { class: 'row', style: 'flex-wrap:wrap' }, list) : h('p', { class: 'small muted' }, 'Chưa có. Quét / gõ mã in sẵn trên cuộn, túi của nhà cung cấp để lần sau quét thẳng là ra linh kiện này.'),
    edit && h('div', { class: 'row' }, h('div', { class: 'grow' }, inp), kind, add)];
}
async function supCache() { return (S.suppliers = await api('suppliers.list', {}, true).catch(() => S.suppliers || [])); }
async function partEdit(p) {
  const sups = await supCache();
  let sid = p.supplier_id || '';
  const I = (k, ph) => h('input', { value: p[k] || '', placeholder: ph || '' });
  const f = { code: I('code', 'Để trống: tự cấp LK-…'), name: I('name', 'Điện trở, Tụ, IC, LED…'), spec: I('spec', '10k 1%, 100nF 50V, STM32F103VET6…'), package: I('package', '0603, SOP-8, LQFP-100…'),
    maker: I('maker'), mpn: I('mpn'), unit: I('unit', 'cái'), location: I('location', 'Tủ A / ngăn 3'), min_stock: numIn(p.min_stock ?? ''), stock: numIn(0), note: h('textarea', { value: p.note || '' }),
    active: h('select', {}, h('option', { value: 1, selected: p.active !== 0 }, 'Đang dùng'), h('option', { value: 0, selected: p.active === 0 }, 'Ngừng')),
    category: h('select', {}, h('option', { value: 'part', selected: p.category !== 'supply' }, 'Linh kiện (điện trở, IC, LED…)'), h('option', { value: 'supply', selected: p.category === 'supply' }, 'Vật tư (thiếc, keo, vỏ, cáp, nguồn…)')) };
  const sup = combo(sups, s => s.name, sid, 'Nhà cung cấp chính…', s => { sid = s ? s.id : ''; });
  const btn = h('button', { class: 'btn' }, 'Lưu');
  let close;
  btn.onclick = () => {
    const a = {}; for (const k of ['code', 'name', 'spec', 'package', 'maker', 'mpn', 'unit', 'location']) a[k] = f[k].value.trim() || null;
    a.name = a.name || ''; a.min_stock = f.min_stock.value === '' ? null : +f.min_stock.value; a.note = f.note.value; a.active = +f.active.value; a.supplier_id = sid || null;
    a.category = f.category.value;
    if (p.id) a.id = p.id; else a.stock = +f.stock.value || 0;
    busy(btn, api('parts.save', a).then(async row => {
      for (const c of p._codes || []) await api('parts.code_add', { part_id: row.id, ...c }, true).catch(() => {});   // từ quét mã lạ
      toast('Đã lưu'); close(); S.parts = null; go('parts');
    }).catch(() => {}));
  };
  close = sheet(p.id ? (p.category === 'supply' ? 'Sửa vật tư' : 'Sửa linh kiện') : (p.category === 'supply' ? 'Vật tư mới' : 'Linh kiện mới'), grid(field('Nhóm', f.category), two(field('Mã', f.code), field('Đơn vị', f.unit)), field('Tên', f.name), two(field('Giá trị / thông số', f.spec), field('Kiểu chân', f.package)),
    two(field('Hãng', f.maker), field('Mã NSX (MPN)', f.mpn)), two(field('Vị trí kho', f.location), field('Báo khi tồn dưới', f.min_stock)), field('Nhà cung cấp chính', sup),
    !p.id && field('Tồn đầu kỳ', f.stock), field('Ghi chú', f.note), field('Trạng thái', f.active)),
    [btn, p.id && myRole() === 'owner' && h('button', { class: 'btn bad', onclick: () => { if (window.confirm(T('Xóa linh kiện này?'))) api('parts.delete', { id: p.id }).then(() => { close(); go('parts'); }).catch(() => {}); } }, 'Xóa')]);
}
let partRange = 'month';
function partHistory() {
  const box = h('div', { class: 'list' }, h('div', { class: 'empty' }, 'Đang tải…'));
  const load = () => { const [from, to] = rangeOf(partRange); api('parts.moves', { from, to }).then(rows => box.replaceChildren(...(rows.length ? rows.map(m =>
    h('div', { class: 'item' }, h('div', { class: 'l' }, dmy(m.at).slice(0, 5)), h('div', { class: 't' }, `${m.code || ''} ${m.part_name || '?'}`),
      h('div', { class: 'r' }, h('b', { style: `color:var(--${m.qty < 0 ? 'bad' : 'ok'})` }, `${m.qty > 0 ? '+' : ''}${num(m.qty)}`)),
      h('div', { class: 's' }, [T(PMOVE[m.kind] || m.kind), m.doc, m.note, m.by_name].filter(Boolean).join(' · ')))) : [h('div', { class: 'empty' }, 'Không có phiếu')]))).catch(() => {}); };
  sheet('Lịch sử nhập xuất linh kiện', grid(rangeSel(partRange, v => { partRange = v; load(); }), box));
  load();
}

// ---------- MUA VÀO: phiếu nhập + nhà cung cấp ----------
let purTab = 'list', purRange = 'month';
async function vPurchases(el) {
  const pick = t => { purTab = t; go('purchases'); };
  if (purTab === 'sup') {
    const rows = await supCache();
    el.replaceChildren(h('div', { class: 'card' }, segBar('sup', [['list', 'Phiếu nhập'], ['sup', 'Nhà cung cấp', rows.length]], pick, can('suppliers.save') && ['+ NCC', () => supEdit({})]),
      h('div', { class: 'list' }, rows.length ? rows.map(s => h('div', { class: 'item', onclick: () => supEdit(s) }, h('div', { class: 'l' }, '🏭'), h('div', { class: 't' }, s.name),
        h('div', { class: 'r' }, s.debt > 0 ? h('b', { style: 'color:var(--bad)' }, money(s.debt)) : ''), h('div', { class: 's' }, [s.code, s.phone, s.contact].filter(Boolean).join(' · ')))) :
        h('div', { class: 'empty' }, 'Chưa có nhà cung cấp'))));
    return;
  }
  const [from, to] = rangeOf(purRange);
  const rows = await api('purchases.list', { from, to });
  const done = rows.filter(p => p.status === 'done');
  el.replaceChildren(h('div', { class: 'card' }, segBar('list', [['list', 'Phiếu nhập'], ['sup', 'Nhà cung cấp']], pick, can('purchases.create') && ['+ Phiếu nhập', purchaseNew]),
    h('div', { class: 'row between' }, rangeSel(purRange, v => { purRange = v; go('purchases'); }), h('div', { class: 'total' }, money(done.reduce((s, p) => s + p.total, 0)))),
    h('p', { class: 'small muted' }, `${done.length} ${T('phiếu')} · ${T('còn nợ NCC')} ${money(done.reduce((s, p) => s + p.total - p.paid, 0))}`),
    h('div', { class: 'list' }, rows.length ? rows.map(p => h('div', { class: 'item', onclick: () => purchaseDetail(p.id) },
      h('div', { class: 'l' }, dmy(p.at).slice(0, 5)), h('div', { class: 't' }, p.supplier_name || 'Không ghi NCC'),
      h('div', { class: 'r' }, h('b', {}, money(p.total)), h('br'), p.status === 'void' ? h('span', { class: 'chip void' }, 'Đã hủy') : p.total > p.paid ? h('span', { style: 'color:var(--bad)' }, T('nợ ') + money(p.total - p.paid)) : h('span', { class: 'muted' }, 'Đã trả')),
      h('div', { class: 's' }, `${p.number} · ${p.lines} ${T('dòng')}${p.doc ? ' · ' + p.doc : ''}`))) : h('div', { class: 'empty' }, 'Chưa có phiếu nhập'))));
}
function supEdit(s) {
  const I = (k, ph, type) => h('input', { value: s[k] || '', placeholder: ph || '', type: type || 'text' });
  const f = { name: I('name'), code: I('code', 'Để trống: tự cấp'), phone: I('phone', '', 'tel'), email: I('email', '', 'email'), contact: I('contact', 'Người liên hệ'),
    website: I('website', 'lcsc.com, shop…'), tax_code: I('tax_code'), address: I('address'), note: h('textarea', { value: s.note || '' }) };
  const btn = h('button', { class: 'btn' }, 'Lưu');
  let close;
  btn.onclick = () => { const a = Object.fromEntries(Object.entries(f).map(([k, e]) => [k, e.value.trim() || null])); a.name = a.name || ''; if (s.id) a.id = s.id;
    busy(btn, api('suppliers.save', a).then(() => { toast('Đã lưu'); close(); S.suppliers = null; go('purchases'); }).catch(() => {})); };
  close = sheet(s.id ? 'Nhà cung cấp' : 'Nhà cung cấp mới', grid(field('Tên', f.name), two(field('Mã', f.code), field('Điện thoại', f.phone)), two(field('Người liên hệ', f.contact), field('Email', f.email)),
    two(field('Website / gian hàng', f.website), field('Mã số thuế', f.tax_code)), field('Địa chỉ', f.address), field('Ghi chú', f.note)),
    [btn, s.id && myRole() === 'owner' && h('button', { class: 'btn bad', onclick: () => { if (window.confirm(T('Xóa nhà cung cấp này?'))) api('suppliers.delete', { id: s.id }).then(() => { close(); S.suppliers = null; go('purchases'); }).catch(() => {}); } }, 'Xóa')]);
}
async function purchaseNew() {
  const [sups, parts] = await Promise.all([supCache(), partsCache()]);
  let sid = '';
  const sup = combo(sups, s => s.name, '', 'Nhà cung cấp…', s => { sid = s ? s.id : ''; });
  const lines = [], box = h('div', { class: 'lines' });
  const disc = numIn(0, 1000), vat = numIn(0, 1000), ship = numIn(0, 1000), paid = numIn('', 1000), doc = h('input', { placeholder: 'Số hóa đơn / đơn hàng NCC' }), note = h('input', {});
  const method = h('select', {}, Object.entries(METHOD).map(([v, l]) => h('option', { value: v }, l)));
  const totalEl = h('div', { class: 'total' });
  const sub = () => lines.reduce((s, l) => s + (+l.qty.value || 0) * (+l.price.value || 0), 0);
  const recalc = () => { const t = sub() - (+disc.value || 0) + (+vat.value || 0) + (+ship.value || 0); totalEl.textContent = money(t); paid.placeholder = String(Math.round(t)); };
  const add = () => {
    const L = { qty: numIn(1), price: numIn('', 1) };
    L.sel = combo(parts, partLabel, null, 'Gõ mã / tên linh kiện…', p => { if (p && !L.price.value) L.price.value = p.cost || ''; recalc(); });
    L.qty.oninput = L.price.oninput = recalc;
    const rm = h('button', { class: 'x', type: 'button', onclick: () => { lines.splice(lines.indexOf(L), 1); row.remove(); recalc(); } }, '✕');
    const row = h('div', { class: 'line' }, L.sel, L.qty, L.price, rm);
    lines.push(L); box.append(row); recalc();
  };
  add();
  disc.oninput = vat.oninput = ship.oninput = recalc;
  const btn = h('button', { class: 'btn' }, 'Lưu phiếu nhập (cộng kho)');
  let close;
  btn.onclick = () => {
    const items = lines.filter(l => l.sel.value).map(l => ({ part_id: l.sel.value, qty: +l.qty.value, price: +l.price.value || 0 }));
    const total = sub() - (+disc.value || 0) + (+vat.value || 0) + (+ship.value || 0);
    busy(btn, api('purchases.create', { supplier_id: sid || null, items, discount: +disc.value || 0, vat: +vat.value || 0, ship: +ship.value || 0,
      paid: paid.value === '' ? total : +paid.value, method: method.value, doc: doc.value.trim() || null, note: note.value.trim() || null })
      .then(r => { toast(`Đã lưu ${r.number}`); close(); S.parts = null; go('purchases'); }).catch(() => {}));
  };
  close = sheet('Phiếu nhập mua', grid(field('Nhà cung cấp', sup), h('div', { class: 'small muted' }, 'Linh kiện · SL · Đơn giá'), box,
    h('div', { class: 'row' }, h('button', { class: 'btn ghost small', type: 'button', onclick: add }, '+ Thêm dòng'), h('button', { class: 'btn ghost small', type: 'button', onclick: () => partEdit({}) }, '+ Linh kiện mới')),
    two(field('Chiết khấu (đ)', disc), field('VAT (đ)', vat)), two(field('Phí vận chuyển (đ)', ship), field('Đã trả (để trống = trả đủ)', paid)),
    two(field('Hình thức', method), field('Số chứng từ', doc)), field('Ghi chú', note),
    h('div', { class: 'row between' }, h('span', { class: 'muted' }, 'Tổng tiền'), totalEl)), btn);
}
function payBlock(d, op, done) {
  const left = d.total - d.paid;
  if (d.status !== 'done' || left <= 0) return null;
  const amt = numIn(left, 1000), m = h('select', {}, Object.entries(METHOD).map(([v, l]) => h('option', { value: v }, l)));
  return h('div', { class: 'row' }, h('div', { class: 'grow' }, field(op === 'purchases.pay' ? 'Trả thêm cho NCC (đ)' : 'Thu thêm của khách (đ)', amt)), m,
    h('button', { class: 'btn', onclick: e => busy(e.target, api(op, { id: d.id, amount: +amt.value, method: m.value }).then(() => { toast('Đã ghi'); done(); }).catch(() => {})) }, 'Ghi'));
}
async function purchaseDetail(id) {
  const p = await api('purchases.get', { id });
  let close;
  close = sheet(`Phiếu nhập ${p.number}`, grid(
    kv([['NCC', [p.supplier_name, p.supplier_phone].filter(Boolean).join(' · ')], ['Ngày', `${dmy(p.at)} ${hm(p.at)}`], ['Chứng từ', p.doc], ['Ghi chú', p.note],
      ['Trạng thái', p.status === 'void' ? [h('span', { class: 'chip void' }, 'Đã hủy'), ' ', p.void_reason || ''] : 'Đã nhập kho']]),
    h('div', { class: 'list' }, (p.items || []).map(it => h('div', { class: 'item' }, h('div', { class: 'l' }, `${num(it.qty)}×`), h('div', { class: 't' }, `${it.code || ''} ${it.name}`), h('div', { class: 'r' }, money(it.amount)), h('div', { class: 's' }, money(it.price) + (it.unit ? '/' + T(it.unit) : ''))))),
    kv([['Tiền hàng', money(p.subtotal)], p.discount && ['Chiết khấu', money(p.discount)], p.vat && ['VAT', money(p.vat)], p.ship && ['Vận chuyển', money(p.ship)],
      [h('b', {}, 'Tổng'), h('b', {}, money(p.total))], ['Đã trả', money(p.paid)], p.total > p.paid && ['Còn nợ', h('b', { style: 'color:var(--bad)' }, money(p.total - p.paid))]]),
    (p.payments || []).length && h('div', { class: 'small muted' }, p.payments.map(x => `${dmy(x.at)}: ${money(x.amount)} (${T(METHOD[x.method] || x.method)})`).join(' · ')),
    can('purchases.pay') && payBlock(p, 'purchases.pay', () => { close(); purchaseDetail(id); go('purchases'); })),
    myRole() === 'owner' && p.status === 'done' && h('button', { class: 'btn bad', onclick: () => {
      const reason = ask('Lý do hủy phiếu nhập? (kho sẽ trừ lại số đã nhập)');
      if (reason) api('purchases.void', { id, reason }).then(() => { toast('Đã hủy phiếu'); close(); go('purchases'); }).catch(() => {});
    } }, 'Hủy phiếu'));
}

// ---------- BÁN RA: phiếu bán + khách hàng ----------
let saleTab = 'list', saleRange = 'month';
async function custCache() { return (S.customers = await api('customers.list', { limit: 2000 }, true).catch(() => S.customers || [])); }
async function vSales(el) {
  const pick = t => { saleTab = t; go('sales'); };
  if (saleTab === 'cust') {
    const rows = await custCache();
    el.replaceChildren(h('div', { class: 'card' }, segBar('cust', [['list', 'Phiếu bán'], ['cust', 'Khách hàng', rows.length]], pick, can('customers.save') && ['+ Khách', () => custEdit({})]),
      h('div', { class: 'list' }, rows.length ? rows.map(c => h('div', { class: 'item', onclick: () => custDetail(c.id) }, h('div', { class: 'l' }, '👤'), h('div', { class: 't' }, c.name),
        h('div', { class: 'r' }, c.debt > 0 ? h('b', { style: 'color:var(--bad)' }, money(c.debt)) : '', h('br'), h('span', { class: 'muted' }, `${c.boards} ${T('mạch')}`)),
        h('div', { class: 's' }, [c.code, c.phone, c.contact].filter(Boolean).join(' · ')))) : h('div', { class: 'empty' }, 'Chưa có khách hàng'))));
    return;
  }
  const [from, to] = rangeOf(saleRange);
  const rows = await api('sales.list', { from, to });
  const done = rows.filter(s => s.status === 'done');
  el.replaceChildren(h('div', { class: 'card' }, segBar('list', [['list', 'Phiếu bán'], ['cust', 'Khách hàng']], pick, can('sales.create') && ['+ Phiếu bán', () => saleNew()]),
    h('div', { class: 'row between' }, rangeSel(saleRange, v => { saleRange = v; go('sales'); }), h('div', { class: 'total' }, money(done.reduce((s, x) => s + x.total, 0)))),
    h('p', { class: 'small muted' }, `${done.length} ${T('phiếu')} · ${T('khách còn nợ')} ${money(done.reduce((s, x) => s + x.total - x.paid, 0))}`),
    h('div', { class: 'list' }, rows.length ? rows.map(s => h('div', { class: 'item', onclick: () => saleDetail(s.id) },
      h('div', { class: 'l' }, dmy(s.at).slice(0, 5)), h('div', { class: 't' }, s.customer_name || 'Khách lẻ'),
      h('div', { class: 'r' }, h('b', {}, money(s.total)), h('br'), s.status === 'void' ? h('span', { class: 'chip void' }, 'Đã hủy') : s.total > s.paid ? h('span', { style: 'color:var(--bad)' }, T('nợ ') + money(s.total - s.paid)) : h('span', { class: 'muted' }, METHOD[s.method] || s.method)),
      h('div', { class: 's' }, `${s.number} · ${s.lines} ${T('dòng')}`))) : h('div', { class: 'empty' }, 'Chưa có phiếu bán'))));
}
function custEdit(c, after) {
  const I = (k, ph, type) => h('input', { value: c[k] || '', placeholder: ph || '', type: type || 'text' });
  const f = { name: I('name'), phone: I('phone', '', 'tel'), email: I('email', '', 'email'), contact: I('contact', 'Người liên hệ'), tax_code: I('tax_code'), address: I('address'), note: h('textarea', { value: c.note || '' }) };
  const btn = h('button', { class: 'btn' }, 'Lưu');
  let close;
  btn.onclick = () => { const a = Object.fromEntries(Object.entries(f).map(([k, e]) => [k, e.value.trim() || null])); a.name = a.name || ''; if (c.id) a.id = c.id;
    busy(btn, api('customers.save', a).then(r => { toast('Đã lưu'); close(); S.customers = null; if (after) after(r); else go('sales'); }).catch(() => {})); };
  close = sheet(c.id ? 'Sửa khách hàng' : 'Khách hàng mới', grid(field('Tên khách / công ty', f.name), two(field('Điện thoại', f.phone), field('Người liên hệ', f.contact)),
    two(field('Email', f.email), field('Mã số thuế', f.tax_code)), field('Địa chỉ', f.address), field('Ghi chú', f.note)),
    [btn, c.id && myRole() === 'owner' && h('button', { class: 'btn bad', onclick: () => { if (window.confirm(T('Xóa khách hàng này?'))) api('customers.delete', { id: c.id }).then(() => { close(); S.customers = null; go('sales'); }).catch(() => {}); } }, 'Xóa')]);
}
async function custDetail(id) {
  const c = await api('customers.get', { id });
  let close;
  close = sheet(c.name, grid(kv([['Mã', c.code], ['Điện thoại', c.phone], ['Liên hệ', c.contact], ['Email', c.email], ['MST', c.tax_code], ['Địa chỉ', c.address], ['Ghi chú', c.note]]),
    h('h3', {}, 'Phiếu bán'), h('div', { class: 'list' }, (c.sales || []).length ? c.sales.map(s => h('div', { class: 'item', onclick: () => { close(); saleDetail(s.id); } },
      h('div', { class: 'l' }, dmy(s.at).slice(0, 5)), h('div', { class: 't' }, s.number), h('div', { class: 'r' }, money(s.total)), h('div', { class: 's' }, s.status === 'void' ? T('Đã hủy') : s.total > s.paid ? T('nợ ') + money(s.total - s.paid) : ''))) : h('div', { class: 'empty' }, 'Chưa mua')),
    h('h3', {}, `Mạch đã mua (${(c.boards || []).length})`), h('div', { class: 'list' }, (c.boards || []).slice(0, 100).map(b => h('div', { class: 'item', onclick: () => { close(); boardDetail(b.uid); } },
      h('div', { class: 'l' }, boardIcon({ ...b, key_id: 1 })), h('div', { class: 't mono' }, uidFmt(b.uid)), h('div', { class: 'r' }, bchip(b.status)), h('div', { class: 's' }, [b.product_code || b.product_name, b.sold_at && T('bán ') + dmy(b.sold_at), b.warranty_until && T('BH đến ') + dmy(b.warranty_until)].filter(Boolean).join(' · ')))))),
    [can('sales.create') && h('button', { class: 'btn', onclick: () => { close(); saleNew(c); } }, '+ Phiếu bán cho khách này'),
     can('customers.save') && h('button', { class: 'btn ghost', onclick: () => { close(); custEdit(c); } }, 'Sửa')]);
}
async function saleNew(cust0) {
  const [custs] = await Promise.all([custCache(), refreshProducts()]);
  let cid = cust0 ? cust0.id : '';
  const cust = combo(custs, c => `${c.name}${c.phone ? ' · ' + c.phone : ''}`, cid, 'Khách hàng (để trống = khách lẻ)…', c => { cid = c ? c.id : ''; });
  const lines = [], box = h('div', { class: 'lines' });
  const disc = numIn(0, 1000), vat = numIn(0, 1000), ship = numIn(0, 1000), paid = numIn('', 1000), note = h('input', {});
  const method = h('select', {}, Object.entries(METHOD).map(([v, l]) => h('option', { value: v }, l)));
  const totalEl = h('div', { class: 'total' });
  const sub = () => lines.reduce((s, l) => s + (+l.qty.value || 0) * (+l.price.value || 0), 0);
  const recalc = () => { const t = sub() - (+disc.value || 0) + (+vat.value || 0) + (+ship.value || 0); totalEl.textContent = money(t); paid.placeholder = String(Math.round(t)); };
  const addRow = (L, labelEl) => { L.qty.oninput = L.price.oninput = recalc;
    const rm = h('button', { class: 'x', type: 'button', onclick: () => { lines.splice(lines.indexOf(L), 1); row.remove(); recalc(); } }, '✕');
    const row = h('div', { class: 'line' }, labelEl, L.qty, L.price, rm); lines.push(L); box.append(row); recalc(); };
  // mạch theo UID: quét / gõ UID
  const uidIn = h('input', { placeholder: 'Quét / gõ UID mạch rồi Enter', class: 'mono', autocapitalize: 'characters', autocomplete: 'off' });
  const addUid = async raw => {
    const u = uidFind(raw); if (!u) return toast('UID phải có 24 ký tự hex', true);
    if (lines.some(l => l.uid === u)) return toast('Mạch này đã có trong phiếu', true);
    const b = await api('boards.get', { uid: u }).catch(() => null); if (!b) return;
    if (b.status !== 'stock' && b.status !== 'returned') return toast(`Mạch ${uidFmt(u)}: ${T(BSTATUS[b.status] || b.status)}${b.customer_name ? ' – ' + b.customer_name : ''}`, true);
    const p = S.products.find(x => x.id === b.product_id);
    const L = { uid: u, board_id: b.id, qty: h('input', { type: 'number', value: 1, disabled: true }), price: numIn(p ? p.price : '', 1000) };
    addRow(L, h('div', { class: 'small' }, h('b', {}, b.product_code || b.product_name || 'Mạch'), h('div', { class: 'mono' }, uidFmt(u))));
    uidIn.value = '';
  };
  uidIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addUid(uidIn.value); } });
  S.saleScan = addUid;                       // máy quét / camera trong lúc mở phiếu -> thêm thẳng vào phiếu
  const addOther = () => {
    const L = { qty: numIn(1), price: numIn('', 1000) };
    L.sel = combo(S.products.filter(p => p.tracked === 0), p => `${p.name} (${T('tồn')} ${num(p.in_stock)})`, null, 'Hàng khác: chọn loại không theo UID, hoặc gõ tên…', p => { L.product = p; if (p) L.price.value = p.price; recalc(); });
    addRow(L, L.sel);
  };
  const btn = h('button', { class: 'btn' }, 'Lưu phiếu bán');
  let close;
  btn.onclick = () => {
    const items = lines.map(l => l.board_id ? { board_id: l.board_id, price: +l.price.value || 0 }
      : l.product ? { product_id: l.product.id, qty: +l.qty.value, price: +l.price.value || 0 } : { name: l.sel.text, qty: +l.qty.value, price: +l.price.value || 0 }).filter(x => x.board_id || x.product_id || x.name);
    const total = sub() - (+disc.value || 0) + (+vat.value || 0) + (+ship.value || 0);
    busy(btn, api('sales.create', { customer_id: cid || null, items, discount: +disc.value || 0, vat: +vat.value || 0, ship: +ship.value || 0,
      paid: paid.value === '' ? total : +paid.value, method: method.value, note: note.value.trim() || null })
      .then(r => { toast(`Đã lưu ${r.number}`); S.saleScan = null; close(); go('sales'); saleDetail(r.id); }).catch(() => {}));
  };
  close = sheet('Phiếu bán', grid(h('div', { class: 'row' }, h('div', { class: 'grow' }, field('Khách hàng', cust)),
      h('button', { class: 'btn ghost small', onclick: () => custEdit({}, c => { custCache().then(() => { cid = c.id; toast(`${T('Đã thêm khách')} ${c.name} – ${T('chọn lại trong ô Khách hàng')}`); }); }) }, '+ Khách mới')),
    field('Mạch theo UID', uidIn), h('div', { class: 'small muted' }, 'Hàng · SL · Đơn giá'), box,
    h('div', { class: 'row' }, h('button', { class: 'btn ghost small', type: 'button', onclick: addOther }, '+ Hàng khác'), h('button', { class: 'btn ghost small', type: 'button', onclick: scanSheet }, '📷 Quét QR')),
    two(field('Chiết khấu (đ)', disc), field('VAT (đ)', vat)), two(field('Phí vận chuyển (đ)', ship), field('Đã thu (để trống = thu đủ)', paid)),
    two(field('Hình thức', method), field('Ghi chú', note)),
    h('div', { class: 'row between' }, h('span', { class: 'muted' }, 'Tổng tiền'), totalEl)), btn);
  disc.oninput = vat.oninput = ship.oninput = recalc;
  if (!('ontouchstart' in window)) uidIn.focus();
}
async function saleDetail(id) {
  const s = await api('sales.get', { id });
  const biz = S.biz || (S.biz = await api('spa.info').catch(() => null)) || {};
  let close;
  const body = h('div', { style: 'display:grid;gap:10px' },
    biz.biz_name && h('div', { class: 'bizhead' }, h('b', {}, biz.biz_name), h('div', { class: 'small muted' }, [biz.biz_tax && `${T('MST:')} ${biz.biz_tax}`, biz.biz_phone && `${T('SĐT:')} ${biz.biz_phone}`].filter(Boolean).join(' · ')),
      biz.biz_addr && h('div', { class: 'small muted' }, biz.biz_addr)),
    kv([['Khách', [s.customer_name || T('Khách lẻ'), s.customer_phone].filter(Boolean).join(' · ')], s.customer_address && ['Địa chỉ', s.customer_address], s.customer_tax && ['MST', s.customer_tax],
      ['Ngày', `${dmy(s.at)} ${hm(s.at)}`], ['Thanh toán', METHOD[s.method] || s.method], s.note && ['Ghi chú', s.note],
      ['Trạng thái', s.status === 'void' ? [h('span', { class: 'chip void' }, 'Đã hủy'), ' ', s.void_reason || ''] : 'Đã bán']]),
    h('div', { class: 'list' }, (s.items || []).map(it => h('div', { class: 'item', onclick: () => it.uid && boardDetail(it.uid) }, h('div', { class: 'l' }, `${num(it.qty)}×`), h('div', { class: 't' }, it.name), h('div', { class: 'r' }, money(it.amount)), h('div', { class: 's' }, money(it.price))))),
    kv([['Tiền hàng', money(s.subtotal)], s.discount && ['Chiết khấu', money(s.discount)], s.vat && ['VAT', money(s.vat)], s.ship && ['Vận chuyển', money(s.ship)],
      [h('b', {}, 'Tổng'), h('b', {}, money(s.total))], ['Đã thu', money(s.paid)], s.total > s.paid && ['Còn nợ', h('b', { style: 'color:var(--bad)' }, money(s.total - s.paid))]]));
  close = sheet(`Phiếu bán ${s.number}`, grid(body, can('sales.pay') && payBlock(s, 'sales.pay', () => { close(); saleDetail(id); go('sales'); })),
    [h('button', { class: 'btn ghost', onclick: () => { const a = h('div', { class: 'print-area' }, body.cloneNode(true)); document.body.append(a); setTimeout(() => { window.print(); setTimeout(() => a.remove(), 500); }, 100); } }, '🖨 In phiếu'),
     (s.items || []).some(i => i.uid) && h('button', { class: 'btn ghost', onclick: () => printLabels(s.items.filter(i => i.uid).map(i => ({ uid: i.uid, product_name: i.name.split(' – ')[0] }))) }, '🏷 In tem'),
     myRole() === 'owner' && s.status === 'done' && h('button', { class: 'btn bad', onclick: () => {
       const reason = ask('Lý do hủy phiếu bán? (mạch trở lại kho)');
       if (reason) api('sales.void', { id, reason }).then(() => { toast('Đã hủy phiếu'); close(); go('sales'); }).catch(() => {});
     } }, 'Hủy phiếu')]);
}

// ---------- THỐNG KÊ (trước là Báo cáo) ----------
let repRange = 'month';
async function vReports(el) {
  const [from, to] = rangeOf(repRange);
  const r = await api('reports.summary', { from, to });
  const st = (l, v, c) => h('div', { class: 'stat' }, l, h('b', { style: c ? `color:var(--${c})` : '' }, v));
  el.replaceChildren(h('div', { class: 'card' }, rangeSel(repRange, v => { repRange = v; go('reports'); }),
    h('div', { class: 'stats' }, st('Doanh thu', money(r.sales.total)), st('Đã thu', money(r.sales.paid)), st('Mua vào', money(r.purchases.total)), st('Đã trả NCC', money(r.purchases.paid))),
    h('div', { class: 'stats' }, st('Mạch làm ra (đã tạo mã)', r.boards.made), st('Mạch bán', r.boards.sold), st('Mạch trong kho', r.boards.in_stock)),
    h('h3', {}, 'Công nợ (toàn bộ)'),
    h('div', { class: 'stats' }, st('Khách còn nợ', money(r.debts.receivable), r.debts.receivable > 0 ? 'bad' : ''), st('Còn nợ NCC', money(r.debts.payable), r.debts.payable > 0 ? 'bad' : '')),
    h('h3', {}, 'Kho linh kiện'),
    h('div', { class: 'stats' }, st('Giá trị tồn', money(r.stock_value.v)), st('Mã linh kiện', r.stock_value.n || 0), st('Sắp hết', r.stock_value.low || 0, r.stock_value.low ? 'bad' : '')),
    h('h3', {}, 'Bán chạy'),
    h('div', { class: 'list' }, (r.top_products || []).length ? r.top_products.map(x => h('div', { class: 'item' }, h('div', { class: 'l' }, `${num(x.qty)}×`), h('div', { class: 't' }, x.name), h('div', { class: 'r' }, money(x.amount)), h('div', { class: 's' }))) : h('div', { class: 'empty' }, 'Chưa có')),
    h('h3', {}, 'Lệnh sản xuất đang mở'),
    h('div', { class: 'list' }, (r.wo_open || []).length ? r.wo_open.map(o => h('div', { class: 'item' }, h('div', { class: 'l' }, `${o.qty_plan}×`), h('div', { class: 't' }, `${o.number} · ${o.product_name || ''}`), h('div', { class: 'r' }, wchip(o.status)), h('div', { class: 's' }, `${T('đã xuất LK')} ${o.parts_issued}/${o.qty_plan} · ${T('mạch có UID')} ${o.boards}`))) : h('div', { class: 'empty' }, 'Không có'))));
}

// ---------- TÀI KHOẢN (vai trò sản xuất) ----------
// Tab Tài khoản: 2 mục - tài khoản người dùng / điện thoại, máy tính đã ghép (trước là tab Thiết bị)
const accSeg = cur => segBar(cur, [['users', '👥 Tài khoản'], ['devices', '📱 Điện thoại / máy tính'], ['helpers', '🖥 Trợ giúp từ xa']], k => { S.accTab = k; go('staff'); });
async function vStaff(el) {
  if (S.accTab === 'devices') return vDevices(el);
  if (S.accTab === 'helpers') return vHelpers(el);
  const ORDER = { chairman: 0, ceo: 1, owner: 2, assistant: 3, store: 4, tech: 5, sales: 6 };
  const rows = (await api('staff.list')).sort((a, b) => ((ORDER[a.role] ?? 9) - (ORDER[b.role] ?? 9)) || String(a.display_name || a.username).localeCompare(String(b.display_name || b.username), 'vi'));
  el.replaceChildren(h('div', { class: 'card' }, accSeg('users'), h('button', { class: 'btn', onclick: () => staffEdit({}) }, '+ Thêm tài khoản'),
    h('p', { class: 'small muted' }, 'Mỗi người một tài khoản riêng. Trợ lý: như Quản lý nhưng không quản lý tài khoản, thiết bị, cài đặt hệ thống, trợ giúp từ xa. Thủ kho: linh kiện, mua vào. Kỹ thuật: sản xuất, Tạo mã. Bán hàng: khách, phiếu bán.'),
    h('div', { class: 'list' }, rows.map(u => h('div', { class: 'item', onclick: () => staffEdit(u) },
      h('div', { class: 'l' }, RANK[u.role] ? '👑' : '👤'), h('div', { class: 't' }, u.display_name || u.username),
      h('div', { class: 'r' }, h('span', { class: 'chip' }, ROLE[u.role] || u.role), u.active ? '' : [h('br'), h('span', { class: 'chip cancelled' }, 'Khóa')]),
      h('div', { class: 's' }, [u.staff_code, u.title, u.username, u.phone].filter(Boolean).join(' · ')))))));
}
function staffEdit(u) {
  const isNew = !u.id;
  const f = { username: h('input', { value: u.username || '', autocapitalize: 'none' }), display_name: h('input', { value: u.display_name || '' }),
    role: h('select', {}, Object.entries(ROLE).filter(([v]) => v !== 'sysadmin' && ((RANK[v] || 0) <= (RANK[S.me.role] || 0) || v === u.role))
      .map(([v, l]) => h('option', { value: v, selected: v === (u.role || 'tech') }, l))),
    phone: h('input', { type: 'tel', value: u.phone || '' }), password: h('input', { type: 'password', autocomplete: 'new-password', placeholder: isNew ? '' : 'Để trống nếu không đổi' }),
    staff_code: h('input', { value: u.staff_code || '' }), title: h('input', { value: u.title || '', placeholder: 'Kỹ thuật viên, Thủ kho…' }),
    active: h('select', {}, h('option', { value: 1, selected: u.active !== 0 }, 'Đang hoạt động'), h('option', { value: 0, selected: u.active === 0 }, 'Khóa tài khoản')) };
  const btn = h('button', { class: 'btn' }, 'Lưu');
  let close;
  btn.onclick = () => {
    const a = { username: f.username.value.trim(), display_name: f.display_name.value.trim(), role: f.role.value, phone: f.phone.value.trim(), active: +f.active.value,
      staff_code: f.staff_code.value.trim() || null, title: f.title.value.trim() || null };
    if (f.password.value) a.password = f.password.value;
    if (!isNew) a.id = u.id;
    busy(btn, api('staff.save', a).then(() => { toast('Đã lưu'); close(); loadCaches(); go('staff'); }).catch(() => {}));
  };
  close = sheet(isNew ? 'Tài khoản mới' : 'Sửa tài khoản', grid(field('Tên đăng nhập', f.username), field('Tên hiển thị', f.display_name), field('Vai trò', f.role),
    two(field('Mã NV', f.staff_code), field('Chức vụ', f.title)), field('Điện thoại', f.phone), field(isNew ? 'Mật khẩu (ít nhất 6 ký tự)' : 'Mật khẩu mới', f.password), field('Trạng thái', f.active)),
    [btn, !isNew && u.id !== S.me.id && h('button', { class: 'btn bad', onclick: () => { if (window.confirm(T('Xóa tài khoản này?'))) api('staff.delete', { id: u.id }).then(() => { close(); go('staff'); }).catch(() => {}); } }, 'Xóa')]);
}

// ---------- tìm nhanh ----------
function quickSearch() {
  const q = h('input', { type: 'search', placeholder: 'UID mạch, mã / tên linh kiện, khách, NCC, số phiếu BH- / PN- / LSX-…', autocomplete: 'off' });
  const box = h('div', { style: 'display:grid;gap:6px' });
  let t, close;
  const item = (icon, title, sub, onclick) => h('div', { class: 'item', onclick: () => { close(); onclick(); } }, h('div', { class: 'l' }, icon), h('div', { class: 't' }, title), h('div', { class: 'r' }), h('div', { class: 's' }, sub || ''));
  const grp = (g, title, rows, f) => { if ((rows || []).length) g.push(h('div', { class: 'grp' }, title), h('div', { class: 'list' }, rows.map(f))); };
  const run = () => {
    const v = q.value.trim();
    if (!v) return box.replaceChildren();
    api('search.all', { q: v }, true).then(r => {
      const g = [];
      grp(g, 'Mạch', r.boards, b => item(boardIcon(b), uidFmt(b.uid), [b.product_name, T(BSTATUS[b.status] || '')].filter(Boolean).join(' · '), () => boardDetail(b.uid)));
      grp(g, 'Linh kiện', r.parts, p => item('▪', `${p.code} · ${p.name}`, `${p.spec || ''} · ${T('tồn')} ${num(p.stock)} ${T(p.unit || '')}`, () => partSheet(p.id)));
      grp(g, 'Loại mạch', r.products, p => item('▣', p.name, p.code, () => bomSheet(p.id)));
      grp(g, 'Lệnh sản xuất', r.work_orders, o => item('🛠', o.number, `${o.product_name || ''} · ${T(WSTATUS[o.status] || o.status)}`, () => woDetail(o.id)));
      grp(g, 'Khách hàng', r.customers, c => item('👤', c.name, [c.phone, c.code].filter(Boolean).join(' · '), () => custDetail(c.id)));
      grp(g, 'Nhà cung cấp', r.suppliers, s => item('🏭', s.name, [s.phone, s.code].filter(Boolean).join(' · '), () => supEdit(s)));
      grp(g, 'Phiếu bán', r.sales, s => item('🧾', `${s.number} · ${money(s.total)}`, `${s.customer_name || T('Khách lẻ')} · ${dmy(s.at)}`, () => saleDetail(s.id)));
      grp(g, 'Phiếu nhập', r.purchases, p => item('📥', `${p.number} · ${money(p.total)}`, `${p.supplier_name || ''} · ${dmy(p.at)}`, () => purchaseDetail(p.id)));
      box.replaceChildren(...(g.length ? g : [h('div', { class: 'empty' }, 'Không tìm thấy')]));
    }).catch(() => {});
  };
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 200); });
  close = sheet('Tìm nhanh', h('div', { style: 'display:grid;gap:10px' }, q, box));
}

// ---------- điện thoại / máy tính đã ghép (trong tab Tài khoản) ----------
async function vDevices(el) {
  const rows = (await api('devices.list')).filter(d => !d.revoked);   // máy đã thu hồi: không hiện nữa
  const code = purpose => api('devices.pair_code', { purpose }).then(r => {
    const end = Date.now() + r.expires_min * 60000;
    const left = h('p', { class: 'small muted' });
    const tm = setInterval(() => { const s = Math.max(0, Math.round((end - Date.now()) / 1000)); left.textContent = T(s ? `Hết hạn sau ${Math.floor(s / 60)}:${pad(s % 60)}` : 'Đã hết hạn'); if (!s) clearInterval(tm); }, 1000);
    sheet('Mã ghép điện thoại / máy tính', h('div', { style: 'display:grid;gap:10px;text-align:center' },
      h('div', { class: 'big', style: 'font-size:30px' }, r.code), left,
      h('p', { class: 'small muted' }, 'Trên máy mới: mở app LED Factory → nhập mã này. Mã chỉ dùng được một lần.')));
  }).catch(() => {});
  el.replaceChildren(h('div', { class: 'card' }, accSeg('devices'),
    h('p', { class: 'small muted' }, 'Điện thoại, máy tính đã ghép với hệ thống để dùng app. Mỗi máy ghép một lần; người dùng đăng nhập tài khoản của mình trên máy đó. Mất máy: bấm vào máy → Thu hồi.'),
    h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => code('staff') }, '+ Ghép điện thoại / máy tính')),
    h('div', { class: 'list' }, rows.map(d => h('div', { class: 'item', onclick: () => deviceSheet(d) },
      h('div', { class: 'l' }, h('span', { class: 'dot ' + (d.revoked ? 'none' : d.online ? (d.online.lan ? 'lan' : d.online.p2p ? 'p2p' : 'channel') : '') })),
      h('div', { class: 't' }, d.name, d.this ? ' (máy này)' : ''),
      h('div', { class: 'r small' }, d.revoked ? h('span', { class: 'chip cancelled' }, 'Đã thu hồi') : d.online ? (d.online.lan ? 'Nội bộ' : d.online.p2p ? 'P2P' : d.online.via) : d.last_seen ? dmy(d.last_seen) : '—'),
      h('div', { class: 's' }, `${d.user || T('chưa đăng nhập')} · ${d.id}`))))));
}
function deviceSheet(d) {
  const name = h('input', { value: d.name });
  let close;
  close = sheet(d.name, h('div', { style: 'display:grid;gap:10px' },
    h('dl', { class: 'kv' }, h('dt', {}, 'Mã máy'), h('dd', { class: 'mono' }, d.id), h('dt', {}, 'Ghép lúc'), h('dd', {}, d.created_at ? `${dmy(d.created_at)} ${hm(d.created_at)}` : '—'),
      h('dt', {}, 'Người dùng'), h('dd', {}, d.user || '—'), h('dt', {}, 'Lần cuối'), h('dd', {}, d.last_seen ? `${dmy(d.last_seen)} ${hm(d.last_seen)}` : '—')),
    field('Tên máy', name)),
    [h('button', { class: 'btn', onclick: () => api('devices.rename', { id: d.id, name: name.value.trim() }).then(() => { close(); go('staff'); }).catch(() => {}) }, 'Đổi tên'),
     !d.this && !d.revoked && h('button', { class: 'btn bad', onclick: () => { if (window.confirm(T(`Thu hồi "${d.name}"? Máy này sẽ không kết nối được nữa.`))) api('devices.revoke', { id: d.id }).then(() => { toast('Đã thu hồi'); close(); go('staff'); }).catch(() => {}); } }, 'Thu hồi')]);
}

// ---------- TRỢ GIÚP TỪ XA: máy chủ xem / điều khiển máy tính cài "LED Factory Trợ giúp" (helper/) ----------
// Chỉ chiều hệ thống → máy trợ giúp. Xem / điều khiển / chạy lệnh: tài khoản quản lý, từ máy chủ hoặc điện thoại / máy tính khác (máy chủ kiểm tra quyền).
const HPATH = { 1: 'Nội bộ', 2: 'P2P qua Internet', 3: 'Internet chậm (chưa P2P)' };
async function vHelpers(el) {
  const r = await api('helper.list');
  const rows = r.helpers || [];
  el.replaceChildren(h('div', { class: 'card' }, accSeg('helpers'),
    h('p', { class: 'small muted' }, 'Máy tính Windows đã cài "LED Factory Trợ giúp": máy chủ xem và điều khiển màn hình, chạy lệnh, cập nhật trợ giúp. Cài trên máy cần hỗ trợ: Hệ thống → Kết nối → Tải trợ giúp từ xa, rồi Ghép trợ giúp với máy chủ.'),
    h('div', { class: 'list' }, rows.length ? rows.map(d => {
      const st = d.state || {};
      return h('div', { class: 'item', onclick: () => helperSheet(d, r) },
        h('div', { class: 'l' }, h('span', { class: 'dot ' + (d.online ? 'lan' : '') })),
        h('div', { class: 't' }, d.name),
        h('div', { class: 'r small' }, d.online ? (st.rd === 1 ? 'Đang hỗ trợ' : HPATH[d.path] || 'Sẵn sàng') : (d.last_seen ? dmy(d.last_seen) : '—')),
        h('div', { class: 's' }, [st.user, st.w ? `${st.w} x ${st.h}` : '', st.ver ? `${T('bản')} ${st.ver}` : ''].filter(Boolean).join(' · ') || d.id));
    }) : h('div', { class: 'empty' }, 'Chưa có máy nào cài trợ giúp'))));
}
function helperSheet(d, info) {
  const st = d.state || {}, old = st.ver && info.avail_ver > st.ver;
  let close;
  const upd = h('button', { class: 'btn ghost', onclick: () => busy(upd, api('helper.update', { id: d.id }).then(() => toast('Đã gửi bản cập nhật'))).catch(() => {}) }, old ? '⬆ Cập nhật trợ giúp' : '↻ Cài lại bản mới nhất');
  close = sheet(d.name, h('div', { style: 'display:grid;gap:10px' },
    h('dl', { class: 'kv' },
      h('dt', {}, 'Trạng thái'), h('dd', {}, d.online ? HPATH[d.path] || 'Đang kết nối' : 'Không kết nối'),
      h('dt', {}, 'Người dùng Windows'), h('dd', {}, st.user || '—'),
      h('dt', {}, 'Màn hình'), h('dd', {}, st.w ? `${st.w} x ${st.h}` : '—'),
      h('dt', {}, 'Phiên bản'), h('dd', {}, st.ver ? `${st.ver}${old ? ' → ' + info.avail_ver : ''}` : '—'),
      h('dt', {}, 'Hỏi trước khi điều khiển'), h('dd', {}, st.ask === undefined ? '—' : st.ask ? 'Có' : 'Không'),
      h('dt', {}, 'Tự chạy cùng Windows'), h('dd', {}, st.autorun === undefined ? '—' : st.autorun ? 'Bật' : 'Tắt'),
      h('dt', {}, 'Mã máy'), h('dd', { class: 'mono' }, d.id)),
    !d.online && h('p', { class: 'small muted' }, 'Máy trợ giúp không kết nối (máy tắt hoặc mất mạng).')),
    d.online ? [
      h('button', { class: 'btn', onclick: () => { close(); rdViewer(d); } }, '🖥 Xem & điều khiển'),
      h('button', { class: 'btn ghost', onclick: () => { close(); execSheet(d); } }, '⌨ Chạy lệnh'), upd,
      st.autorun !== undefined && h('button', { class: 'btn ghost', onclick: e => busy(e.target, api('helper.autostart', { id: d.id, on: !st.autorun }).then(() => {
        toast(st.autorun ? 'Đã tắt tự chạy cùng Windows' : 'Đã bật tự chạy cùng Windows'); close(); setTimeout(() => go('staff'), 800);
      })).catch(() => {}) }, st.autorun ? '⏻ Tắt tự chạy cùng Windows' : '⏻ Bật tự chạy cùng Windows')] : null);
}
function execSheet(d) {
  const cmd = h('textarea', { rows: 3, placeholder: 'ipconfig', style: 'font-family:monospace' });
  const tmo = h('input', { type: 'number', value: 120, min: 1, max: 3600, inputmode: 'numeric' });
  const out = h('pre', { class: 'small', style: 'white-space:pre-wrap;word-break:break-all;max-height:50vh;overflow:auto;background:rgba(127,127,127,.12);padding:8px;border-radius:8px;margin:0;font-family:monospace' });
  const run = h('button', { class: 'btn', onclick: async () => {
    const c = cmd.value.trim(), lim = +tmo.value || 120;
    if (!c) return;
    run.disabled = true;
    out.textContent = T('Đang chạy…');
    try {
      const { rid } = await api('helper.exec', { id: d.id, cmd: c, timeout: lim });
      for (;;) {
        await new Promise(res => setTimeout(res, 1000));
        const x = await api('helper.exec_get', { rid });
        if (x.done) { out.textContent = `${x.out}\n[${T('mã thoát')} ${x.code}]`; break; }
        out.textContent = `${T('Đang chạy…')} ${Math.round(x.age_s)} s`;
        if (x.age_s > lim + 30) { out.textContent = T('Không có kết quả (máy trợ giúp mất kết nối?)'); break; }
      }
    } catch (e) { out.textContent = e.message; }
    run.disabled = false;
  } }, '▶ Chạy');
  cmd.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run.click(); });
  sheet(`${T('Chạy lệnh')}: ${d.name}`, h('div', { style: 'display:grid;gap:10px' },
    h('p', { class: 'small muted' }, 'Lệnh chạy bằng cmd trên máy đó, dưới tài khoản Windows đang đăng nhập; người dùng thấy thông báo. Mở chương trình có cửa sổ: start "" "đường dẫn". Ctrl+Enter để chạy.'),
    field('Lệnh', cmd), field('Tối đa (giây)', tmo), out), [run]);
}
// Trong Hệ thống → Kết nối (chỉ máy Windows): tải bộ cài + ghép trợ giúp của CHÍNH máy này với máy chủ
function helperCard() {
  const dl = () => {
    const a = h('a', { href: 'helper/LedFactoryHelper.msi', download: 'LedFactoryHelper.msi' });
    document.body.appendChild(a); a.click(); a.remove();
    toast('Đang tải LedFactoryHelper.msi - mở file để cài');
  };
  const pairBtn = h('button', { class: 'btn ghost small', onclick: () => busy(pairBtn, api('helper.pair_code', {}).then(r => {
    location.href = `lfhelper://pair?c=${encodeURIComponent(r.code)}&a=${(r.lan || []).join(',')}&p=${r.port}`;
    toast('Trình duyệt hỏi mở "LED Factory Trợ giúp" → bấm Mở');
  })).catch(() => {}) }, '🔗 Ghép trợ giúp với máy chủ');
  return h('div', { style: 'display:grid;gap:6px;margin-top:10px;border-top:1px solid rgba(127,127,127,.25);padding-top:10px' },
    h('b', {}, 'Trợ giúp từ xa (máy tính Windows)'),
    h('p', { class: 'small muted' }, 'Cho phép máy chủ xem, điều khiển máy tính này và chạy lệnh để hỗ trợ; trợ giúp tự chạy cùng Windows, biểu tượng ở khay đồng hồ, tự cập nhật từ máy chủ. Bước 1: tải và mở file cài (Windows có thể cảnh báo "Windows protected your PC": bấm More info → Run anyway). Bước 2: bấm Ghép trợ giúp với máy chủ (trong mạng nội bộ hoặc qua Internet). Mỗi lần máy chủ muốn xem, máy này sẽ hỏi Cho phép.'),
    h('div', { class: 'row' }, h('button', { class: 'btn ghost small', onclick: dl }, '⬇ Tải trợ giúp từ xa'), pairBtn));
}
// Màn hình xem & điều khiển.
//  - Có đường nội bộ tới máy chủ: ảnh MJPEG thẳng từ máy chủ (/rd/stream, nhanh nhất).
//  - Ở xa (P2P / Internet): lấy từng khung qua helper.frame (chia mảnh ~120 KB) trên kênh đang dùng.
// Chuột / chạm / phím gửi qua helper.input. Điện thoại: chạm = bấm, kéo = kéo chuột, nút "Chuột phải" cho lần chạm sau.
function rdViewer(d) {
  const base = Conn.lanBase(), remote = base === null;
  const KEY = remote ? 'lf-rd-q-xa' : 'lf-rd-q';
  let q = remote ? { fps: 5, q: 50, scale: 70 } : { fps: 8, q: 60, scale: 100 };
  try { q = { ...q, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) {}
  let viewOnly = false, closed = false, lastMove = 0, moveTimer = null, rightNext = false, lastUrl = null;
  const down = new Set();
  const img = h('img', { alt: '', draggable: false, tabindex: 0, style: 'max-width:100%;max-height:100%;display:block;cursor:crosshair;outline:none;user-select:none;-webkit-user-select:none;touch-action:none;background:#000' });
  const status = h('span', { class: 'small', style: 'color:#ddd' }, 'Đang kết nối…');
  const send = (k, extra) => { if (viewOnly || closed) return; api('helper.input', { id: d.id, k, ...extra }, true).catch(() => {}); };
  const pos = e => {
    const r = img.getBoundingClientRect();
    if (!img.naturalWidth || !r.width) return null;
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    return x < 0 || y < 0 || x > 1 || y > 1 ? null : { x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 };
  };
  // Ở xa: vòng lấy khung. Khung lớn chia mảnh: lấy mảnh 0 (kèm tổng số mảnh) rồi các mảnh còn lại.
  let pullGen = 0;
  async function pull(gen) {
    let since = 0;
    while (!closed && gen === pullGen) {
      const t0 = performance.now();
      try {
        const f = await api('helper.frame', { id: d.id, since, part: 0 }, true);
        if (f.b64) {
          const parts = [f.b64];
          for (let i = 1; i < f.parts && parts.length === i; i++) {
            const p = await api('helper.frame', { id: d.id, seq: f.seq, part: i }, true);
            if (p.b64) parts.push(p.b64);
          }
          if (parts.length === f.parts && !closed && gen === pullGen) {
            const bin = atob(parts.join('')), u8 = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
            const url = URL.createObjectURL(new Blob([u8], { type: 'image/jpeg' }));
            img.src = url;
            if (lastUrl) URL.revokeObjectURL(lastUrl);
            lastUrl = url;
            since = f.seq;
          }
        }
      } catch (e) { await new Promise(r => setTimeout(r, 1000)); }
      const wait = 1000 / Math.max(1, q.fps) - (performance.now() - t0);
      await new Promise(r => setTimeout(r, Math.max(60, wait)));
    }
  }
  const start = () => api('helper.view', { id: d.id, ...q, pull: remote ? 1 : 0 }).then(r => {
    if (closed) return;
    if (remote) pull(++pullGen); else img.src = base + r.url;
  }).catch(() => {});
  const PRESETS = [['100,70,8', 'Nét'], ['100,55,8', 'Vừa'], ['70,50,6', 'Nhanh'], ['50,45,4', 'Mạng yếu']];
  if (remote && !PRESETS.some(([v]) => v === `${q.scale},${q.q},${q.fps}`)) PRESETS.push([`${q.scale},${q.q},${q.fps}`, 'Mặc định']);
  const qual = h('select', { style: 'width:auto', onchange: () => { const [s, qq, f] = qual.value.split(','); q = { scale: +s, q: +qq, fps: +f }; try { localStorage.setItem(KEY, JSON.stringify(q)); } catch (e) {} start(); } },
    PRESETS.map(([v, l]) => h('option', { value: v, selected: v === `${q.scale},${q.q},${q.fps}` }, l)));
  const vo = h('input', { type: 'checkbox', style: 'width:auto', onchange: () => { viewOnly = vo.checked; img.style.cursor = viewOnly ? 'default' : 'crosshair'; } });
  const typed = h('input', { placeholder: T('Gõ chữ gửi sang (cả tiếng Việt)'), style: 'width:220px' });
  const combo = (label, vks) => h('button', { class: 'btn ghost small', onclick: () => { vks.forEach(v => send('kd', { vk: v })); [...vks].reverse().forEach(v => send('ku', { vk: v })); img.focus(); } }, label);
  const rbtn = h('button', { class: 'btn ghost small', onclick: () => { rightNext = !rightNext; rbtn.classList.toggle('bad', rightNext); } }, '🖱 Chuột phải');
  const releaseAll = () => { down.forEach(v => send('ku', { vk: v })); down.clear(); };
  const onKey = e => {
    if (closed || document.activeElement === typed || document.activeElement === qual) return;
    e.preventDefault(); e.stopPropagation();
    const vk = e.keyCode;
    if (!vk) return;
    if (e.type === 'keydown') { down.add(vk); send('kd', { vk }); } else { down.delete(vk); send('ku', { vk }); }
  };
  const close = () => {
    if (closed) return;
    releaseAll();
    closed = true;
    img.src = '';
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    clearInterval(poll);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKey, true);
    window.removeEventListener('blur', releaseAll);
    api('helper.stop', { id: d.id }, true).catch(() => {});
    wrap.remove();
  };
  // Hàng phím: màn hẹp (điện thoại) ẩn sẵn, bấm "⌨ Phím" để hiện
  const keys = h('div', { style: `display:${innerWidth < 700 ? 'none' : 'flex'};flex-wrap:wrap;gap:6px;align-items:center;width:100%` },
    combo('⊞ Win', [91]), combo('Alt+Tab', [18, 9]), combo('Ctrl+Shift+Esc', [17, 16, 27]),
    combo('Enter', [13]), combo('⌫', [8]), combo('Esc', [27]), combo('Tab', [9]),
    typed, h('button', { class: 'btn ghost small', onclick: () => { if (typed.value) { send('tx', { s: typed.value }); typed.value = ''; img.focus(); } } }, 'Gửi chữ'));
  const wrap = h('div', { style: 'position:fixed;inset:0;z-index:9999;background:#111;display:flex;flex-direction:column' },
    h('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:6px 10px;background:#222;color:#eee' },
      h('b', {}, d.name), status, h('span', { style: 'flex:1' }),
      qual, h('label', { class: 'small', style: 'display:flex;gap:4px;align-items:center' }, vo, 'Chỉ xem'), rbtn,
      h('button', { class: 'btn ghost small', onclick: () => { keys.style.display = keys.style.display === 'none' ? 'flex' : 'none'; } }, '⌨ Phím'),
      h('button', { class: 'btn bad small', onclick: close }, '✕ Đóng'), keys),
    h('div', { style: 'flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:4px' }, img));
  // Chuột và chạm (pointer events): chạm = bấm trái; "Chuột phải" bật thì lần chạm / bấm kế tiếp là chuột phải
  let pressed = null;
  img.addEventListener('pointermove', e => {
    const p = pos(e); if (!p) return;
    if (e.pointerType !== 'mouse' && !pressed) return;
    const now = performance.now();
    clearTimeout(moveTimer);
    if (now - lastMove > 40) { lastMove = now; send('mm', p); } else moveTimer = setTimeout(() => { lastMove = performance.now(); send('mm', p); }, 45);
  });
  img.addEventListener('pointerdown', e => {
    e.preventDefault(); img.focus();
    const p = pos(e); if (!p) return;
    const b = rightNext ? 2 : e.button;
    pressed = b;
    try { img.setPointerCapture(e.pointerId); } catch (x) {}
    if (e.pointerType !== 'mouse') send('mm', p);   /* chạm: đưa chuột tới chỗ chạm trước */
    send('md', { ...p, b });
  });
  img.addEventListener('pointerup', e => {
    e.preventDefault();
    if (pressed === null) return;
    const p = pos(e) || {};
    send('mu', { ...p, b: pressed });
    pressed = null;
    if (rightNext) { rightNext = false; rbtn.classList.remove('bad'); }
  });
  img.addEventListener('pointercancel', () => { if (pressed !== null) send('mu', { b: pressed }); pressed = null; });
  img.addEventListener('contextmenu', e => e.preventDefault());
  img.addEventListener('wheel', e => { e.preventDefault(); const p = pos(e); if (p) send('wh', { ...p, d: Math.max(-1200, Math.min(1200, Math.round(-e.deltaY * (e.deltaMode ? 40 : 1.2)))) }); }, { passive: false });
  typed.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (typed.value) { send('tx', { s: typed.value }); typed.value = ''; } } });
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);
  window.addEventListener('blur', releaseAll);
  const poll = setInterval(() => api('helper.list', {}, true).then(r => {
    if (closed) return;
    const x = (r.helpers || []).find(z => z.id === d.id), st = (x && x.state) || {};
    status.textContent = T(!x || !x.online ? 'Máy trợ giúp mất kết nối'
      : st.rd === 2 ? 'Đang chờ người dùng bên đó bấm Cho phép…'
      : st.rd === 1 ? (st.frame_age_ms >= 0 && st.frame_age_ms < 5000 ? `${T(viewOnly ? 'Đang xem' : 'Đang điều khiển')} · ${T(HPATH[x.path] || '')}` : 'Đang chờ hình…')
      : st.why === 'denied' ? 'Người dùng KHÔNG cho phép' : st.why === 'timeout' ? 'Người dùng không trả lời' : st.why ? 'Người dùng đã dừng phiên hỗ trợ' : 'Đang kết nối…');
  }).catch(() => {}), 1500);
  document.body.append(wrap);
  start();
  img.focus();
}

// ---------- thu chi ----------
let cashRange = 'month';
async function vCash(el) {
  const [from, to] = rangeOf(cashRange);
  const [rows, sum] = await Promise.all([api('cash.list', { from, to }), api('cash.summary', { from, to })]);
  const tot = Object.fromEntries((sum.totals || []).map(t => [t.kind, t.amount]));
  el.replaceChildren(h('div', { class: 'card' },
    rangeSel(cashRange, v => { cashRange = v; go('cash'); }),
    h('div', { class: 'stats' }, h('div', { class: 'stat' }, I18N.label('Thu'), h('b', { style: 'color:var(--ok)' }, money(tot.in || 0))),
      h('div', { class: 'stat' }, I18N.label('Chi'), h('b', { style: 'color:var(--bad)' }, money(tot.out || 0))),
      h('div', { class: 'stat' }, 'Chênh lệch', h('b', {}, money((tot.in || 0) - (tot.out || 0))))),
    h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => cashEdit({ kind: 'out' }) }, '− Phiếu chi'), h('button', { class: 'btn ghost', onclick: () => cashEdit({ kind: 'in' }) }, '+ Phiếu thu')),
    h('div', { class: 'list' }, rows.length ? rows.map(c => h('div', { class: 'item', onclick: () => cashEdit(c) },
      h('div', { class: 'l' }, dmy(c.at).slice(0, 5)), h('div', { class: 't' }, c.content || ''),
      h('div', { class: 'r' }, h('b', { style: `color:var(--${c.kind === 'in' ? 'ok' : 'bad'})` }, `${c.kind === 'in' ? '+' : '−'}${money(c.amount)}`)),
      h('div', { class: 's' }, [c.fund, c.category, c.person].filter(Boolean).join(' · ')))) : h('div', { class: 'empty' }, 'Không có khoản nào'))));
}
function cashEdit(c) {
  const isNew = !c.id;
  const f = { kind: h('select', {}, h('option', { value: 'out', selected: c.kind === 'out' }, I18N.label('Chi')), h('option', { value: 'in', selected: c.kind === 'in' }, I18N.label('Thu'))),
    amount: h('input', { type: 'number', min: 0, step: 1000, inputmode: 'numeric', value: c.amount || '' }), content: h('input', { value: c.content || '' }),
    category: h('input', { value: c.category || '', placeholder: 'Điện, nước, vật tư, lương, thắp hương…' }), person: h('input', { value: c.person || '' }),
    fund: h('input', { value: c.fund || 'Quỹ tiền mặt' }), date: h('input', { type: 'date', value: dateVal(c.at || Date.now()) }), note: h('input', { value: c.note || '' }) };
  const btn = h('button', { class: 'btn' }, 'Lưu');
  let close;
  btn.onclick = () => {
    const a = { kind: f.kind.value, amount: +f.amount.value, content: f.content.value.trim(), category: f.category.value.trim() || null, person: f.person.value.trim() || null,
      fund: f.fund.value.trim() || null, at: fromInputs(f.date.value, '12:00'), note: f.note.value.trim() || null };
    if (!isNew) a.id = c.id;
    busy(btn, api('cash.save', a).then(() => { toast('Đã lưu'); close(); go('cash'); }).catch(() => {}));
  };
  close = sheet(isNew ? (c.kind === 'in' ? 'Phiếu thu' : 'Phiếu chi') : 'Sửa khoản thu chi', h('div', { style: 'display:grid;gap:10px' },
    h('div', { class: 'row' }, h('div', { class: 'grow' }, field('Loại', f.kind)), h('div', { class: 'grow' }, field('Số tiền (đ)', f.amount))),
    field('Nội dung', f.content), h('div', { class: 'row' }, h('div', { class: 'grow' }, field('Nhóm', f.category)), h('div', { class: 'grow' }, field('Ngày', f.date))),
    h('div', { class: 'row' }, h('div', { class: 'grow' }, field('Người thực hiện', f.person)), h('div', { class: 'grow' }, field('Quỹ', f.fund))), field('Ghi chú', f.note)),
    [btn, !isNew && h('button', { class: 'btn bad', onclick: () => { if (window.confirm(T('Xóa khoản này?'))) api('cash.delete', { id: c.id }).then(() => { close(); go('cash'); }).catch(() => {}); } }, 'Xóa')]);
}

// ---------- quét mã (camera / máy quét) ----------
// Tem QR trên mạch = UID; ngoài ra mã khách KH-…, mã linh kiện LK-…, số phiếu BH- / PN- / LSX-
async function handleScan(raw) {
  const code = String(raw || '').trim();
  if (!code) return;
  const u = uidFind(code);
  if (u && S.saleScan && document.querySelector('.scrim')) {      // đang mở phiếu bán: thêm mạch vào phiếu
    document.querySelectorAll('.scrim').forEach((s, i, all) => { if (i === all.length - 1 && s.querySelector('video')) s.remove(); });
    return S.saleScan(u);
  }
  document.querySelectorAll('.scrim').forEach(s => s.remove());
  S.saleScan = null;
  try {
    const r = await api('scan.lookup', { code });
    if (r.kind === 'board') {
      if (r.id) boardDetail(r.uid);
      else if (can('keys.issue') && window.confirm(T('Mạch chưa có trong danh sách. Tạo mã cho UID này?'))) { go('keys'); setTimeout(() => { const i = document.querySelector('#view input.mono'); if (i) { i.value = uidFmt(r.uid); i.dispatchEvent(new Event('input')); } }, 400); }
      else toast(`UID ${uidFmt(r.uid)}: ${T('chưa có trong danh sách')}`, true);
    }
    else if (r.kind === 'customer') custDetail(r.id);
    else if (r.kind === 'part') { partSheet(r.id); if (r.qty) toast(`${T('Tem LCSC')} ${r.lcsc}: ${num(r.qty)} ${T('cái')}`); }
    else if (r.kind === 'unknown') unknownCodeSheet(r);
    else if (r.kind === 'sale') saleDetail(r.id);
    else if (r.kind === 'purchase') purchaseDetail(r.id);
    else if (r.kind === 'work_order') woDetail(r.id);
    else if (r.kind === 'supplier') toast(r.name);
  } catch {}
}
// Quét phải mã chưa biết (mã vạch / QR của nhà cung cấp): gắn làm mã phụ của 1 linh kiện, hoặc tạo linh kiện mới
async function unknownCodeSheet(r) {
  const code = r.lcsc || r.scanned || '';
  if (!can('parts.code_add')) return toast(`${T('Không nhận ra mã')}: ${code}`, true);
  const parts = await partsCache();
  let pick = null;
  const sel = combo(parts, partLabel, '', 'Gõ mã / tên linh kiện…', p => { pick = p; });
  let close;
  const attach = h('button', { class: 'btn', onclick: () => {
    if (!pick) return toast('Chọn linh kiện', true);
    busy(attach, api('parts.code_add', { part_id: pick.id, code, kind: r.lcsc ? 'lcsc' : 'barcode' })
      .then(() => r.mpn ? api('parts.code_add', { part_id: pick.id, code: r.mpn, kind: 'mpn' }, true).catch(() => {}) : null)
      .then(() => { toast('Đã gắn mã phụ'); close(); S.parts = null; partSheet(pick.id); }).catch(() => {}));
  } }, 'Gắn vào linh kiện này');
  close = sheet('Mã chưa có trong kho', grid(
    h('div', { class: 'mono', style: 'word-break:break-all' }, code),
    r.lcsc && kv([['Mã LCSC', r.lcsc], ['MPN', r.mpn], ['Số lượng trên tem', r.qty ? num(r.qty) : '']]),
    h('p', { class: 'small muted' }, 'Gắn mã này vào linh kiện đã có (lần sau quét là ra linh kiện đó), hoặc tạo linh kiện mới.'),
    field('Linh kiện', sel)),
    [attach, can('parts.save') && h('button', { class: 'btn ghost', onclick: () => { close(); partEdit({ category: 'part', mpn: r.mpn || '', name: r.mpn || '', _codes: [{ code, kind: r.lcsc ? 'lcsc' : 'barcode' }] }); } }, '+ Linh kiện mới')]);
}
// Camera: đọc QR bằng jsQR (chạy trong trình duyệt, cần trang https)
async function scanSheet() {
  if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
    return toast('Quét bằng camera cần bản app https (app cài từ GitHub, hoặc https://IP:8543)', true);
  const video = h('video', { playsinline: true, muted: true, autoplay: true, style: 'width:100%;max-height:60vh;border-radius:10px;background:#000;object-fit:cover' });
  const st = h('p', { class: 'small muted' }, 'Đang mở camera…');
  const manual = h('input', { placeholder: 'Hoặc gõ: UID mạch / KH-… / BH-… / mã linh kiện', autocapitalize: 'characters' });
  manual.addEventListener('keydown', e => { if (e.key === 'Enter') handleScan(manual.value); });
  sheet('Quét mã', h('div', { style: 'display:grid;gap:8px' }, video, st, manual));
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); }
  catch (e) { st.textContent = T('Không mở được camera: ') + T(e.message) + T('. Kiểm tra quyền camera trong Cài đặt.'); return; }
  video.srcObject = stream;
  try { await video.play(); } catch {}
  st.textContent = T('Đưa mã QR vào khung hình…');
  const cv = document.createElement('canvas'), ctx = cv.getContext('2d', { willReadFrequently: true });
  const stopAll = () => stream.getTracks().forEach(t => t.stop());
  const tick = () => {
    if (!video.isConnected) return stopAll();          // đóng bảng -> tắt camera
    if (video.readyState >= 2 && video.videoWidth) {
      const sc = Math.min(1, 640 / video.videoWidth);
      cv.width = Math.round(video.videoWidth * sc); cv.height = Math.round(video.videoHeight * sc);
      ctx.drawImage(video, 0, 0, cv.width, cv.height);
      const img = ctx.getImageData(0, 0, cv.width, cv.height);
      const res = jsQR(img.data, cv.width, cv.height, { inversionAttempts: 'dontInvert' });
      if (res && res.data) { stopAll(); if (navigator.vibrate) navigator.vibrate(60); handleScan(res.data); return; }
    }
    requestAnimationFrame(tick);
  };
  tick();
}
// Máy quét USB/Bluetooth: "gõ" mã rất nhanh rồi Enter -> nhận ra dù con trỏ đang ở đâu
let kbBuf = '', kbLast = 0, kbStart = 0;
document.addEventListener('keydown', e => {
  if (!S.me || myRole() === 'customer') return;
  const now = performance.now();
  if (e.key === 'Enter') {
    const buf = kbBuf; kbBuf = '';
    // UID mạch (tem QR), mã khách KH-…, linh kiện LK-…, số phiếu BH- / PN- / LSX-
    // + tem LCSC "{pbn:…,pc:C…}" ; con trỏ không ở ô nhập thì nhận mọi mã (mã vạch NCC -> mã phụ)
    const ae = document.activeElement, typing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
    if (buf.length >= 5 && now - kbStart < buf.length * 35 + 120 &&
        (/^([0-9A-F]{8}-?[0-9A-F]{8}-?[0-9A-F]{8}$|KH-|NCC-|LK-|BH-|PN-|LSX-|\{.*pc:)/i.test(buf) || !typing)) {
      if (ae && typeof ae.value === 'string' && ae.value.endsWith(buf)) ae.value = ae.value.slice(0, -buf.length);
      e.preventDefault(); e.stopPropagation();
      handleScan(buf);
    }
    return;
  }
  if (e.key.length !== 1) return;
  if (now - kbLast > 60) { kbBuf = ''; kbStart = now; }    // người gõ tay chậm hơn nhiều -> bắt đầu lại
  kbBuf += e.key; kbLast = now;
}, true);

// ---------- hệ thống / chẩn đoán ----------
function diagPanel() {
  const box = h('div', { style: 'display:grid;gap:10px' });
  const draw = () => {
    const d = Conn.diag();
    const row = (name, dotc, state, rtt) => h('div', { class: 'item', style: 'cursor:default' }, h('div', { class: 'l' }, h('span', { class: 'dot ' + dotc })), h('div', { class: 't' }, name), h('div', { class: 'r mono' }, rtt != null ? rtt + ' ms' : '–'), h('div', { class: 's' }, state));
    box.replaceChildren(
      h('div', { class: 'row between' }, h('b', {}, d.pathName), h('span', { class: 'mono' }, d.rtt != null ? d.rtt + ' ms' : '')),
      d.detail && h('p', { class: 'small muted mono' }, d.detail),
      h('div', { class: 'list' },
        row('Nội bộ', d.lan.ok ? 'lan' : d.lan.busy ? 'channel' : 'none', d.lan.state, d.lan.rtt),
        row('P2P', d.p2p.state === 'open' ? 'p2p' : d.p2p.state === 'trying' ? 'channel' : '', d.p2p.note, d.p2p.rtt),
        d.channels.map(c => row(`${c.name} (${c.kind})${c.active ? ' ★' : ''}`, c.welcomed ? 'lan' : c.up ? 'channel' : c.failed ? 'none' : '', c.state, c.rtt)),
        !d.internetStarted && h('div', { class: 'empty small' }, 'Kênh Internet chưa dùng (đang ưu tiên nội bộ)')),
      h('p', { class: 'small muted' }, `Đổi đường ${d.switches} lần · mã hóa ${d.crypto} · ${APP_VERSION}`));
  };
  draw();
  const t = setInterval(() => { if (!box.isConnected) clearInterval(t); else draw(); }, 1000);
  return box;
}
// Thùng rác: chỉ quản trị hệ thống. Dữ liệu xóa chỉ được đánh dấu (kể cả trên Google Drive), khôi phục được.
const TRASH_T = { parts: 'Linh kiện', part_moves: 'Phiếu kho', suppliers: 'Nhà cung cấp', customers: 'Khách', products: 'Loại mạch', bom_items: 'BOM',
  work_orders: 'Lệnh SX', boards: 'Mạch', users: 'Tài khoản', cash_entries: 'Thu chi', payments: 'Thanh toán' };
async function trashSheet() {
  const box = h('div', { class: 'list' }, h('div', { class: 'empty' }, 'Đang tải…'));
  const load = () => api('trash.list', {}).then(rows => box.replaceChildren(...(rows.length ? rows.map(x => h('div', { class: 'item' },
    h('div', { class: 'l' }, '🗑'), h('div', { class: 't' }, x.label || x.id),
    h('div', { class: 'r' }, h('button', { class: 'btn ghost small', onclick: e => {
      e.stopPropagation();
      api('trash.restore', { table: x.tbl, id: x.id }).then(() => { toast('Đã khôi phục'); load(); }).catch(() => {});
    } }, 'Khôi phục')),
    h('div', { class: 's' }, `${TRASH_T[x.tbl] || x.tbl} · xóa ${dmy(x.updated_at)} ${hm(x.updated_at)}${x.by_name ? ' · ' + x.by_name : ''}`)))
    : [h('div', { class: 'empty' }, 'Thùng rác trống')]))).catch(() => {});
  sheet('Thùng rác', h('div', { style: 'display:grid;gap:10px' },
    h('p', { class: 'small muted' }, 'Dữ liệu bị xóa không mất: chỉ đánh dấu xóa trên mọi máy chủ và Google Drive. Khôi phục sẽ đồng bộ tới mọi máy.'), box));
  load();
}
async function vSystem(el) {
  const owner = isAdmin();
  const id = Conn.identity() || {};
  const lanIn = h('input', { placeholder: '192.168.1.125', inputmode: 'decimal' });
  const knownLan = (Conn.diag().lanAddrs || []);
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua), isWin = /Windows/.test(ua), isMac = /Macintosh/.test(ua) && !isIOS;
  // Tải chứng chỉ: mỗi địa chỉ 1 dòng + trạng thái "máy này đã tin chưa" (thử mở https của máy chủ)
  const certRows = knownLan.map(ip => {
    const st = h('span', { class: 'small muted' }, ' …');
    try {   // thử đúng kiểu kết nối app dùng: mở được wss = máy này đã tin chứng chỉ
      const ws = new WebSocket(`wss://${ip}:${Conn.LAN_HTTPS || 8543}/ws`);
      const done = (ok) => { st.textContent = T(ok ? ' ✅ máy này đã tin chứng chỉ' : ' ⚠ chưa tin (hoặc không cùng mạng)'); if (ok) st.style.color = 'green'; try { ws.close(); } catch (e) {} };
      const t = setTimeout(() => done(false), 5000);
      ws.onopen = () => { clearTimeout(t); done(true); };
      ws.onerror = () => { clearTimeout(t); done(false); };
    } catch (e) { st.textContent = T(' ⚠ không kiểm tra được'); }
    return h('div', { class: 'small' }, `Máy chủ ${ip}:`, st,
      isIOS ? [' · ', h('a', { href: `http://${ip}:${Conn.LAN_HTTP}/ca.crt`, target: '_blank', rel: 'noopener' }, 'tải qua Safari')] : null);
  });
  // Tải chứng chỉ ngay trong app (xin máy chủ qua kết nối mã hóa, tạo file tại chỗ): Chrome không chặn như tải qua http
  const certBtn = h('button', { class: 'btn ghost small', onclick: () => busy(certBtn, api('spa.ca', {}).then(r => {
    const url = URL.createObjectURL(new Blob([r.pem], { type: 'application/x-x509-ca-cert' }));
    const a = h('a', { href: url, download: 'lf-noi-bo.crt' });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast('Đã tải lf-noi-bo.crt (thư mục Tải xuống) - mở file để cài');
  }).catch(() => {})) }, '⬇ Tải chứng chỉ của hệ thống');
  const certSteps = isIOS ? 'iPhone/iPad: bấm "tải qua Safari" → Cho phép → Cài đặt → "Đã tải về hồ sơ" → Cài đặt → rồi Cài đặt chung → Giới thiệu → Cài đặt tin cậy chứng nhận → bật "LED Factory - chung chi goc…".'
    : isAndroid ? 'Android: bấm "Tải chứng chỉ của hệ thống" → Cài đặt → Bảo mật → Mã hóa & thông tin xác thực → Cài đặt chứng chỉ → Chứng chỉ CA → chọn file lf-noi-bo.crt (trong Tải xuống) → Vẫn cài đặt.'
    : isWin ? 'Windows: bấm "Tải chứng chỉ của hệ thống" (file lf-noi-bo.crt vào thư mục Tải xuống, hoặc trên chính máy chủ mở data\\certs\\ca.crt) → mở file → "Install Certificate" (Cài đặt chứng chỉ) → Current User → KHÔNG để "Automatically select…", chọn "Place all certificates in the following store" (Đặt tất cả chứng chỉ vào kho sau) → Browse → chọn đúng "Trusted Root Certification Authorities" (Tổ chức cấp chứng chỉ GỐC đáng tin cậy — không phải "trung gian") → OK → Next → Finish → Windows hỏi "Do you want to install this certificate?" → Yes. Rồi đóng hẳn app / trình duyệt và mở lại.'
    : isMac ? 'Mac: bấm "Tải chứng chỉ của hệ thống" → mở file (Keychain Access, chọn "login") → bấm đúp "LED Factory - chung chi goc" → Trust → "When using this certificate": Always Trust → đóng, nhập mật khẩu máy. Rồi mở lại trình duyệt.'
    : 'Tải file chứng chỉ rồi cài vào mục "chứng chỉ gốc tin cậy" của máy.';
  // 2 mục kỹ thuật: thu gọn (bấm tam giác mới mở), đặt dưới mục Máy chủ
  const techCards = [
    h('details', { class: 'card' }, h('summary', {}, T('Kết nối')), diagPanel(),
      h('div', { class: 'row' }, h('button', { class: 'btn ghost small', onclick: () => Conn.cutLan() }, 'Thử cắt / bật nội bộ'),
        h('button', { class: 'btn ghost small', onclick: () => Conn.cutP2P() }, 'Thử cắt P2P'),
        h('button', { class: 'btn ghost small', onclick: () => Conn.killChannel() }, 'Thử hỏng kênh'),
        h('button', { class: 'btn ghost small', onclick: () => Conn.reviveChannel() }, 'Bật lại kênh')),
      isWin && helperCard()),
    h('details', { class: 'card' }, h('summary', {}, T('Mạng nội bộ')),
      h('p', { class: 'small muted' }, knownLan.length ? `Địa chỉ đã biết: ${knownLan.join(', ')}` : 'Chưa biết địa chỉ máy chủ nội bộ.'),
      h('div', { class: 'row' }, h('div', { class: 'grow' }, lanIn), h('button', { class: 'btn ghost small', onclick: () => { if (Conn.addLan(lanIn.value.trim())) { toast('Đã thêm'); go('system'); } else toast('Địa chỉ nội bộ dạng 192.168.x.x', true); } }, 'Thêm'),
        h('button', { class: 'btn ghost small', onclick: () => { Conn.findLan(); toast('Đang tìm…'); } }, 'Tìm ngay')),
      h('p', { class: 'small muted' }, 'Lần đầu dùng mạng nội bộ, mỗi máy cần cài chứng chỉ của hệ thống một lần (tại xưởng, cùng mạng với máy chủ). Chưa cài thì app vẫn chạy qua Internet.'),
      !isIOS && h('div', { class: 'row' }, certBtn),
      h('div', { style: 'display:grid;gap:6px' }, certRows.length ? certRows : h('div', { class: 'small' }, 'Chưa biết địa chỉ máy chủ nội bộ.')),
      h('p', { class: 'small muted' }, certSteps)),
  ];
  // Giao diện (theme) + ngôn ngữ: lưu riêng trên máy này
  let curTheme = 'auto';
  try { curTheme = localStorage.getItem('theme') || 'auto'; } catch (e) {}
  const themeSel = h('select', { onchange: e => applyTheme(e.target.value) },
    Object.entries(THEMES).map(([v, l]) => h('option', { value: v, selected: v === curTheme }, I18N.lang === 'en' ? l[1] : l[0])));
  const langSel = h('select', { onchange: e => { I18N.set(e.target.value); screenMain(); } },
    h('option', { value: 'vi', selected: I18N.lang === 'vi' }, 'Tiếng Việt'), h('option', { value: 'en', selected: I18N.lang === 'en' }, 'English'));
  const cards = [
    h('div', { class: 'card' }, h('h2', {}, 'Tài khoản'),
      h('dl', { class: 'kv' }, h('dt', {}, 'Người dùng'), h('dd', {}, `${S.me.display_name} (${S.me.username})`), h('dt', {}, 'Vai trò'), h('dd', {}, ROLE[S.me.role]),
        h('dt', {}, 'Máy này'), h('dd', {}, `${(S.welcome || {}).dev_name || ''} · ${id.dev || ''}`)),
      h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px' }, field('Giao diện', themeSel), field('Ngôn ngữ', langSel)),
      h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: changePassword }, 'Đổi mật khẩu'),
        h('button', { class: 'btn ghost', onclick: () => api('auth.logout').then(() => { S.me = null; screenLogin(); }).catch(() => {}) }, 'Đăng xuất'),
        h('button', { class: 'btn bad', onclick: unpair }, 'Gỡ ghép máy này'))),
  ];
  // Doanh nghiệp: ảnh biển hiệu + thông tin pháp lý (ai cũng xem được, quản trị sửa được)
  const biz = S.biz = await api('spa.info').catch(() => S.biz || null);
  if (biz) {
    const f = { biz_name: h('input', { value: biz.biz_name }), biz_tax: h('input', { value: biz.biz_tax }),
                biz_addr: h('input', { value: biz.biz_addr }), biz_phone: h('input', { value: biz.biz_phone, type: 'tel' }) };
    cards.splice(0, 0, h('div', { class: 'card' }, h('h2', {}, 'Doanh nghiệp'),
      h('img', { src: 'bien-hieu.png', alt: 'Biển hiệu ' + (biz.biz_name || ''), class: 'signboard', style: 'width:100%;height:auto;border-radius:10px' }),   // bản mẫu: thay file web/bien-hieu.png
      owner ? h('div', { style: 'display:grid;gap:8px' }, field('Tên doanh nghiệp', f.biz_name), field('Mã số thuế', f.biz_tax),
          field('Địa chỉ', f.biz_addr), field('Điện thoại', f.biz_phone),
          h('button', { class: 'btn ghost', onclick: () => {
            const v = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value.trim()]));
            api('settings.save', v).then(() => { S.biz = { ...S.biz, ...v }; toast('Đã lưu thông tin doanh nghiệp'); }).catch(() => {});
          } }, 'Lưu thông tin doanh nghiệp'))
        : h('dl', { class: 'kv' }, h('dt', {}, 'Tên'), h('dd', {}, biz.biz_name), h('dt', {}, I18N.label('MST')), h('dd', {}, biz.biz_tax),
          h('dt', {}, 'Địa chỉ'), h('dd', {}, biz.biz_addr), h('dt', {}, 'Điện thoại'), h('dd', {}, biz.biz_phone))));
  }
  if (owner) {
    const st = await api('system.status').catch(() => null);
    if (st) {
      const name = h('input', { value: st.spa_name });
      cards.push(h('div', { class: 'card' }, h('h2', {}, 'Máy chủ'),
        h('dl', { class: 'kv' }, h('dt', {}, 'Mã hệ thống'), h('dd', { class: 'mono' }, st.spa_code), h('dt', {}, 'Máy chủ'), h('dd', {}, st.server_name),
          h('dt', {}, 'Chạy được'), h('dd', {}, `${Math.floor(st.uptime_s / 3600)} giờ ${Math.floor(st.uptime_s % 3600 / 60)} phút`),
          h('dt', {}, 'Địa chỉ nội bộ'), h('dd', {}, (st.lan || []).join(', ') || '—'),
          h('dt', {}, 'Kênh Internet'), h('dd', {}, st.channels.map(c => `${c.name}${c.up ? '' : '✕'}`).join(', ')),
          h('dt', {}, 'Dữ liệu'), h('dd', {}, `${st.counts.parts} linh kiện · ${st.counts.boards} mạch · ${st.counts.customers} khách · ${st.counts.users} tài khoản · ${st.counts.devices} máy`),
          h('dt', {}, 'Máy đang kết nối'), h('dd', {}, st.sessions.map(s => `${s.dev_name}${s.user ? ' (' + s.user + ')' : ''}: ${s.lan ? T('nội bộ') : s.p2p ? 'P2P' : s.via}`).join('; ') || '—')),
        field('Tên hệ thống', name),
        h('button', { class: 'btn ghost', onclick: () => api('settings.save', { spa_name: name.value.trim() }).then(() => { toast('Đã lưu'); if (S.welcome) S.welcome.spa_name = name.value.trim(); }).catch(() => {}) }, 'Lưu tên')));
    }
    // Nhiều máy chủ + sao lưu Google Drive
    const sy = await api('sync.status').catch(() => null);
    if (sy) {
      const g = sy.google || {};
      const ago = ms => { const m = Math.round((Date.now() - ms) / 60000); return m < 60 ? `${m} phút trước` : m < 2880 ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 1440)} ngày trước`; };
      cards.push(h('div', { class: 'card' }, h('h2', {}, 'Máy chủ & sao lưu'),
        h('dl', { class: 'kv' },
          h('dt', {}, 'Máy này'), h('dd', {}, `${sy.server_name}${sy.leader ? ' · đang trực' : ''}`),
          h('dt', {}, 'Máy chủ khác'), h('dd', {}, sy.peers.length ? sy.peers.map(p => h('div', {},
            `${p.alive ? '🟢' : '⚪'} ${p.name || p.id.slice(0, 8)} — ${p.alive ? 'đồng bộ qua ' + p.via : 'mất liên lạc ' + p.seen_s + ' giây'}`)) : 'Chưa có (1 máy chủ)'),
          h('dt', {}, 'Google Drive'), h('dd', {}, !g.configured ? 'Chưa cài (chạy google-drive.bat trên máy chủ)'
            : !g.enabled ? 'Đang tắt' : [
              h('div', {}, `Nhật ký: ${g.journal_up ? 'đưa lên ' + ago(g.journal_up) : 'chưa đưa lên'}${g.pending ? ` · còn ${g.pending} thay đổi chờ` : ' · đã đủ'}`),
              h('div', {}, `Ảnh chụp toàn bộ: mỗi ${g.every_h} giờ · lần cuối ${g.last ? ago(g.last) : 'chưa có'}`),
              g.error && h('div', { style: 'color:var(--bad)' }, '⚠ ' + g.error)])),
        h('p', { class: 'small muted' }, 'Thêm máy chủ: cài bản đóng gói trên máy mới bằng dữ liệu sao lưu của hệ thống — các máy tự tìm nhau (cùng mạng nội bộ hoặc qua Internet) và đồng bộ liên tục. Một máy hỏng, máy còn lại vẫn phục vụ đầy đủ.'),
        S.me.role === 'sysadmin' && h('button', { class: 'btn ghost', onclick: trashSheet }, '🗑 Thùng rác (dữ liệu đã xóa)')));
    }
  }
  if (myRole() !== 'customer') {   // khách hàng: không cần các mục kỹ thuật
    cards.push(...techCards);
    cards.push(h('details', { class: 'card' }, h('summary', {}, T('Nhật ký kỹ thuật')), h('pre', { class: 'log' }, S.log.slice(-120).map(T).join('\n'))));
  }
  el.replaceChildren(...cards);
}
// Giao diện hiển thị: [tên tiếng Việt, tên tiếng Anh, màu thanh trạng thái]
const THEMES = {
  auto: ['Tự động (theo máy)', 'Automatic (device)', null], light: ['Sáng — xanh', 'Light — blue', '#0b5cad'],
  dark: ['Tối', 'Dark', '#171e26'], rose: ['Hồng phấn', 'Rose', '#b4506a'], jade: ['Xanh ngọc', 'Jade', '#21806a'],
  ocean: ['Xanh biển', 'Ocean blue', '#2557a7'], lavender: ['Tím oải hương', 'Lavender', '#7650a8'], night: ['Đêm xanh', 'Night blue', '#161b22'],
  contrast: ['Tương phản cao (dễ đọc)', 'High contrast', '#000000'],
};
function applyTheme(t) {
  if (!THEMES[t]) t = 'auto';
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('theme', t); } catch (e) {}
  const m = document.querySelector('meta[name=theme-color]');
  if (m) m.setAttribute('content', THEMES[t][2] || '#0b5cad');
}
function changePassword() {
  const o = h('input', { type: 'password', autocomplete: 'current-password' }), n = h('input', { type: 'password', autocomplete: 'new-password' });
  const btn = h('button', { class: 'btn' }, 'Đổi mật khẩu');
  let close;
  btn.onclick = () => busy(btn, api('auth.change_password', { old: o.value, new: n.value }).then(() => { toast('Đã đổi mật khẩu'); close(); }).catch(() => {}));
  close = sheet('Đổi mật khẩu', h('div', { style: 'display:grid;gap:10px' }, field('Mật khẩu hiện tại', o), field('Mật khẩu mới', n)), btn);
}
function unpair() {
  if (!window.confirm(T('Gỡ ghép máy này? Muốn dùng lại phải xin mã ghép máy mới từ quản trị.'))) return;
  Conn.forget(); S.me = null; S.welcome = null; screenPair('Đã gỡ ghép máy.');
}

const VIEWS = { production: vProduction, boards: vKeys, parts: vParts, purchases: vPurchases, sales: vSales, reports: vReports,
  cash: vCash, staff: vStaff, devices: el => { S.accTab = 'devices'; return vStaff(el); }, keys: vKeys, system: vSystem };

// ---------- khởi động ----------
Conn.on('welcome', m => {
  const prevUser = S.me && S.me.id;
  S.welcome = m;
  if (m.need_owner) { if (!$('#scr-setup')) screenSetup(); return; }   // nhận màn hình theo id (không theo chữ – chữ đổi theo ngôn ngữ)
  if (!m.user) { if (S.me || !$('#app input[autocomplete="current-password"]')) { S.me = null; screenLogin(); } return; }
  S.me = m.user;
  if (!$('nav.tabs') || prevUser !== m.user.id) screenMain();
});
Conn.on('state', d => {
  const b = $('#cbadge');
  if (b) b.replaceWith(connBadge());
  const cs = $('#cstate'); if (cs) cs.textContent = T(`Nội bộ: ${d.lan.state}` + (d.internetStarted ? ` · Internet: ${d.channels.filter(c => c.up).length}/${d.channels.length} kênh` : ''));
  const ban = $('#banner');
  if (ban) ban.replaceChildren(...(d.path ? [] : [h('div', { class: 'wrap', style: 'padding-bottom:0' }, h('div', { class: 'banner' }, 'Mất kết nối tới máy chủ, đang tự nối lại…'))]));
});
function boot() {
  if (!Conn.hasIdentity()) return screenPair();
  screenConnecting();
  Conn.start().catch(e => screenPair(e.message));
}
boot();
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then(reg => {
    // quay lại app (hoặc mỗi 30 phút) -> hỏi GitHub có bản mới không
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    setInterval(() => reg.update().catch(() => {}), 30 * 60000);
  }).catch(() => {});
  // bản mới vừa cài xong -> mời tải lại (không tự tải lại để không mất chữ đang gõ)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || document.getElementById('upd')) return;
    const b = h('div', { id: 'upd', style: 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(76px + env(safe-area-inset-bottom,0px));z-index:99;' +
      'background:var(--brand,#0b5cad);color:#fff;padding:10px 16px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.25);display:flex;gap:12px;align-items:center;font-size:14px' },
      'Đã có bản mới của app', h('button', { class: 'btn small', style: 'background:#fff;color:#000;padding:6px 12px', onclick: () => location.reload() }, 'Tải lại'));
    document.body.appendChild(b);
  });
}
})();
