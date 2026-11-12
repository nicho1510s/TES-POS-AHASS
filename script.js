/* UE POS Dashboard — static site for GitHub Pages. Edit CONFIG only. */
const CONFIG = {
  // From your sheet link: docs.google.com/spreadsheets/d/<THIS PART>/edit
  sheetId: '17uQxNnFVIUxRWOZ4DISYrpUzoD3OQmTq',
  // One entry per tab. Use `sheet` (exact tab name) or `csv` (the tab's "Publish to web" CSV link).
  periods: [
    { key: '2026-06', label: 'Juni 2026', sheet: 'UE POS JUN' },
    { key: '2026-07', label: 'Juli 2026', sheet: 'UE POS JUL' },
    { key: '2026-08', label: 'Agustus 2026', sheet: 'UE POS AUG' },
    { key: '2026-09', label: 'September 2026', sheet: 'UE POS SEP' },
    { key: '2026-10', label: 'Oktober 2026', sheet: 'UE POS OKT' }
    // , { key: '2026-11', label: 'November 2026', sheet: 'UE POS NOV' }
  ],
  defaultPeriod: '2026-10',
  refreshMin: 15,   // auto-refresh interval
  pageSize: 15,
  warnBelow: 80,    // <80% red, 80–<100% yellow, >=100% green
  // 0-based column positions (A=0). Change only if the sheet layout changes.
  col: { rank: 0, code: 1, group: 2, kelas: 3, jenis: 4, name: 5, day0: 6, days: 31, total: 37, target: 38 }
};

const $ = s => document.querySelector(s);
const fmt = n => Math.round(n).toLocaleString('id-ID');
const pct = n => n.toFixed(1).replace('.', ',') + '%';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cls = a => (a >= 100 ? 'ok' : a >= CONFIG.warnBelow ? 'warn' : 'bad');
const COLORS = { ok: '#16a34a', warn: '#d97706', bad: '#dc2626' };
const st = { rows: [], cache: {}, period: null, sort: { k: 'rank', d: 1 }, page: 1, all: false, charts: {} };

// Handles "1.016,5", "109,21%", "36.8" and blanks.
const num = v => {
  v = String(v ?? '').replace(/[%\s]/g, '');
  if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.');
  return parseFloat(v) || 0;
};

const csvUrl = p => {
  const u = p.csv || `https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(p.sheet)}`;
  return u + (u.includes('?') ? '&' : '?') + '_=' + Date.now();
};

function parse(text) {
  const c = CONFIG.col;
  const rows = [];
  Papa.parse(text, { skipEmptyLines: true }).data.forEach(r => {
    const code = String(r[c.code] || '').trim(), full = String(r[c.name] || '').trim();
    if (!/^\d+$/.test(code) || !full) return; // skips title, header and blank rows
    const days = Array.from({ length: c.days }, (_, i) => num(r[c.day0 + i]));
    const total = num(r[c.total]) || days.reduce((a, b) => a + b, 0);
    const target = num(r[c.target]);
    rows.push({
      code, name: full.split(' / ')[0].trim(), group: String(r[c.group] || '').trim(),
      kelas: String(r[c.kelas] || '').trim(), jenis: String(r[c.jenis] || '').trim(),
      days, total, target, acv: target ? (total / target) * 100 : 0, gap: Math.max(0, target - total)
    });
  });
  [...rows].sort((a, b) => b.acv - a.acv || b.total - a.total).forEach((r, i) => (r.rank = i + 1));
  return rows;
}

async function loadPeriod(p) {
  const res = await fetch(csvUrl(p));
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const rows = parse(await res.text());
  if (!rows.length) throw new Error(`No POS rows found for "${p.sheet || p.key}". Check the tab name and CONFIG.col.`);
  return (st.cache[p.key] = rows);
}

async function refresh() {
  try {
    st.rows = await loadPeriod(st.period);
    $('#alert').classList.add('hidden');
    status(true);
    render();
  } catch (e) {
    status(false);
    $('#alert').textContent = 'Could not load data: ' + e.message + ' — make sure the sheet is a Google Sheet shared as "Anyone with the link can view".';
    $('#alert').classList.remove('hidden');
  }
}

function status(ok) {
  $('#dot').className = ok ? 'ok' : 'err';
  $('#conn').textContent = ok ? 'Connected' : 'Connection failed';
  if (ok) $('#upd').textContent = 'Updated ' + new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function chart(id, cfg) {
  st.charts[id]?.destroy();
  st.charts[id] = new Chart($('#' + id), { ...cfg, options: { responsive: true, maintainAspectRatio: false, ...cfg.options } });
}

function render() {
  const r = st.rows, T = r.reduce((a, x) => a + x.target, 0), U = r.reduce((a, x) => a + x.total, 0), acv = T ? (U / T) * 100 : 0;
  const below = r.filter(x => x.target && x.acv < 100).length;
  $('#ov-sub').textContent = `${st.period.label} · ${r.length} POS Service`;
  $('#k-target').textContent = fmt(T);
  $('#k-ue').textContent = fmt(U);
  $('#k-acv').textContent = pct(acv);
  $('#k-bar').style.width = Math.min(100, acv) + '%';
  $('#k-bar').className = cls(acv);
  $('#k-gap').textContent = fmt(r.reduce((a, x) => a + x.gap, 0));
  $('#k-below').textContent = below;
  $('#k-below-n').textContent = `of ${r.filter(x => x.target).length} outlets with a target`;
  $('#f-refresh').textContent = `Auto-refresh: ${CONFIG.refreshMin} minutes`;

  // Daily UE (trailing empty days are trimmed)
  const daily = Array.from({ length: r[0].days.length }, (_, i) => r.reduce((a, x) => a + x.days[i], 0));
  let last = daily.length; while (last > 1 && !daily[last - 1]) last--;
  chart('c-daily', { type: 'line', data: { labels: daily.slice(0, last).map((_, i) => i + 1), datasets: [{ label: 'UE', data: daily.slice(0, last), borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,.12)', fill: true, tension: .3 }] }, options: { plugins: { legend: { display: false } } } });

  // Dealer-group achievement = sum UE / sum target
  const g = {};
  r.forEach(x => { const o = (g[x.group] ??= { t: 0, u: 0 }); o.t += x.target; o.u += x.total; });
  const arr = Object.entries(g).map(([k, o]) => [k, o.t ? (o.u / o.t) * 100 : 0]).sort((a, b) => b[1] - a[1]);
  chart('c-group', { type: 'bar', data: { labels: arr.map(a => a[0]), datasets: [{ data: arr.map(a => +a[1].toFixed(1)), backgroundColor: arr.map(a => COLORS[cls(a[1])]) }] }, options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { callback: v => v + '%' } } } } });

  // Filters + history list keep their current selection
  const gs = $('#f-group'), cur = gs.value;
  gs.innerHTML = '<option value="">All dealer groups</option>' + Object.keys(g).sort().map(x => `<option>${esc(x)}</option>`).join('');
  gs.value = cur;
  const hs = $('#h-select'), hcur = hs.value;
  hs.innerHTML = '<option value="">Select a POS…</option>' + Object.keys(g).sort().map(x =>
    `<optgroup label="${esc(x)}">${r.filter(y => y.group === x).sort((a, b) => a.name.localeCompare(b.name)).map(y => `<option value="${y.code}|${esc(y.name)}">${esc(y.name)}</option>`).join('')}</optgroup>`).join('');
  hs.value = hcur;
  renderTable();
}

const COLS = [['rank', 'Rank'], ['group', 'Grup Dealer'], ['code', 'No. AHASS'], ['name', 'Nama POS Service'], ['kelas', 'Kelas'], ['jenis', 'Jenis Pos'], ['target', 'Target', 1], ['total', 'UE', 1], ['acv', 'Pencapaian', 1], ['gap', 'Gap', 1]];

function filtered() {
  const q = $('#q').value.trim().toLowerCase(), g = $('#f-group').value, kl = $('#f-kelas').value, s = $('#f-status').value, { k, d } = st.sort;
  return st.rows.filter(r =>
    (!q || [r.name, r.group, r.code, r.jenis].join(' ').toLowerCase().includes(q)) &&
    (!g || r.group === g) && (!kl || r.kelas === kl) && (!s || (s === 'below' ? r.acv < 100 : r.acv >= 100))
  ).sort((a, b) => (typeof a[k] === 'string' && k !== 'code' ? a[k].localeCompare(b[k]) : num(a[k]) - num(b[k])) * d);
}

function renderTable() {
  const rows = filtered(), size = st.all ? rows.length || 1 : CONFIG.pageSize, pages = Math.max(1, Math.ceil(rows.length / size));
  st.page = Math.min(st.page, pages);
  const view = rows.slice((st.page - 1) * size, st.page * size);
  $('#tbody').innerHTML = view.map(r =>
    `<tr><td>${r.rank}</td><td>${esc(r.group)}</td><td>${r.code}</td><td><b>${esc(r.name)}</b></td><td>${esc(r.kelas)}</td>` +
    `<td><span class="tag ${/^tutup/i.test(r.jenis) ? 'off' : ''}">${esc(r.jenis)}</span></td>` +
    `<td class="n">${fmt(r.target)}</td><td class="n">${fmt(r.total)}</td><td class="n"><span class="pill ${cls(r.acv)}">${pct(r.acv)}</span></td><td class="n">${fmt(r.gap)}</td></tr>`
  ).join('') || '<tr><td colspan="10" class="msg">No POS matches the current filters.</td></tr>';
  $('#count').textContent = `${rows.length} POS`;
  $('#summary').textContent = `Showing ${view.length} of ${rows.length} POS`;
  $('#page').textContent = `Page ${st.page} of ${pages}`;
  $('#prev').disabled = st.page <= 1;
  $('#next').disabled = st.page >= pages;
}

async function showHistory() {
  const key = $('#h-select').value;
  if (!key) return;
  $('#h-note').textContent = 'Loading all months…';
  const data = await Promise.all(CONFIG.periods.map(p => (st.cache[p.key] ? st.cache[p.key] : loadPeriod(p).catch(() => []))));
  const pts = data.map(rows => rows.find(r => r.code + '|' + r.name === key));
  chart('c-hist', { type: 'bar', data: { labels: CONFIG.periods.map(p => p.label), datasets: [
    { type: 'bar', label: 'UE', data: pts.map(r => (r ? r.total : null)), backgroundColor: pts.map(r => (r ? COLORS[cls(r.acv)] : '#cbd5e1')) },
    { type: 'line', label: 'Target', data: pts.map(r => (r ? r.target : null)), borderColor: '#19243a', borderDash: [5, 4], pointRadius: 3 }
  ] } });
  $('#h-note').textContent = pts.map((r, i) => r ? `${CONFIG.periods[i].label.split(' ')[0]}: ${pct(r.acv)}` : '').filter(Boolean).join(' · ');
}

async function exportJpg() {
  const el = $('#rank-panel'), g = $('#f-group').value, kl = $('#f-kelas').value;
  $('#x-title').textContent = `UE POS — ${st.period.label}${g ? ' · ' + g : ''}${kl ? ' · ' + kl : ''}`;
  el.classList.add('exporting'); st.all = true; renderTable();
  try {
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff' });
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/jpeg', 0.92);
    a.download = `UE-POS-${st.period.key}.jpg`;
    a.click();
  } finally { el.classList.remove('exporting'); st.all = false; renderTable(); }
}

function init() {
  $('#thead').innerHTML = COLS.map(([k, t, n]) => `<th data-k="${k}" class="${n ? 'n' : ''}">${t} ↕</th>`).join('');
  $('#thead').onclick = e => { const k = e.target.dataset.k; if (!k) return; st.sort = { k, d: st.sort.k === k ? -st.sort.d : 1 }; renderTable(); };
  $('#period').innerHTML = CONFIG.periods.map(p => `<option value="${p.key}">${p.label}</option>`).join('');
  st.period = CONFIG.periods.find(p => p.key === CONFIG.defaultPeriod) || CONFIG.periods[CONFIG.periods.length - 1];
  $('#period').value = st.period.key;
  $('#period').onchange = e => { st.period = CONFIG.periods.find(p => p.key === e.target.value); st.page = 1; refresh(); };
  $('#refresh').onclick = refresh;
  ['#q', '#f-group', '#f-kelas', '#f-status'].forEach(s => $(s).addEventListener('input', () => { st.page = 1; renderTable(); }));
  $('#prev').onclick = () => { st.page--; renderTable(); };
  $('#next').onclick = () => { st.page++; renderTable(); };
  $('#export').onclick = exportJpg;
  $('#h-select').onchange = showHistory;
  document.querySelectorAll('nav a').forEach(a => a.addEventListener('click', () => document.querySelectorAll('nav a').forEach(x => x.classList.toggle('on', x === a))));
  refresh();
  setInterval(refresh, CONFIG.refreshMin * 60000);
}
document.addEventListener('DOMContentLoaded', init);
