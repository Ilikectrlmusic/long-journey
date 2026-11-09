import { KINDS, START_DATE, dateKey, validDate, validateData, totalAt, changeLabel } from './model.js';
import { getToken, setToken, disconnect, readCloud, readPublished, verifyToken, saveRecord } from './cloud.js';

const $ = id => document.getElementById(id);
const isEditor = document.body.dataset.page === 'edit';
const today = dateKey();
let data = null;
let month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedDate = today;
let original = null;
let kind = 'school';
let dirty = false;
let busy = false;
let verified = false;

function textElement(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}
function formatDate(key, options = {}) {
  const [y, m, d] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', ...options }).format(new Date(y, m - 1, d));
}
function status(id, message, tone = '') {
  const element = $(id);
  element.textContent = message;
  element.classList.remove('error', 'success', 'warning');
  if (tone) element.classList.add(tone);
}
function updateConnection() {
  if (!isEditor) return;
  $('connection-title').textContent = verified ? '已连接 GitHub · 云端同步' : getToken() ? 'GitHub 连接待验证' : '记录保存到 GitHub';
  $('connection-description').textContent = verified ? '保存成功后，手机和电脑都能读取。记录将公开可见。' : '连接后即可跨设备同步，记录会保存到公开仓库。';
  $('connect-button').textContent = verified ? '更换连接' : '连接 GitHub';
  $('disconnect-button').hidden = !getToken();
}
async function loadData() {
  status('load-status', '正在读取云端记录…');
  let fallback = false;
  try {
    const result = getToken() ? await verifyToken(getToken()) : await readCloud('');
    data = result.data;
    verified = Boolean(getToken());
    status('load-status', '已读取云端最新记录 · ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
  } catch (error) {
    verified = false;
    try {
      data = await readPublished();
      fallback = true;
      status('load-status', `${error.message} 当前显示已发布版本，可能不是最新记录。`, 'warning');
    } catch {
      status('load-status', '无法读取记录，请检查网络后重试。尚未显示任何默认或空记录。', 'error');
      const retry = textElement('button', 'text-button', '重试');
      retry.type = 'button';
      retry.addEventListener('click', () => loadData());
      $('load-status').append(retry);
      updateConnection();
      return false;
    }
  }
  updateConnection();
  if (isEditor) {
    $('entry-fields').disabled = false;
    loadEntry(selectedDate);
  } else renderCalendar();
  return !fallback;
}
function renderSummary() {
  if (!data) return;
  const total = totalAt(data.records, today);
  $('current-total').textContent = total.toLocaleString('zh-CN');
  $('record-count').textContent = `${Object.keys(data.records).filter(key => key <= today).length} 天记录`;
  const progress = Math.max(0, Math.min(100, total));
  $('progress-fill').style.width = `${progress}%`;
  const track = document.querySelector('[role=progressbar]');
  track.setAttribute('aria-valuenow', progress);
  track.setAttribute('aria-valuetext', `累计 ${total} 分，参考刻度 0 至 100 分`);
  $('energy-message').textContent = total < 0 ? '有些日子需要多休息一点，慢慢来就好。' : total >= 100 ? '能量满满，记得留一点给自己。' : total === 0 ? '从零出发，也是一种新的开始。' : '每一点积攒，都是留给自己的小小余量。';
}
function renderCalendar() {
  renderSummary();
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  $('month-title').textContent = `${year} 年 ${monthIndex + 1} 月`;
  $('previous-month').disabled = year === 2026 && monthIndex === 10;
  $('next-month').disabled = year === 9999 && monthIndex === 11;
  const grid = $('calendar-grid');
  grid.replaceChildren();
  const offset = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  for (let i = 0; i < offset; i++) {
    const blank = textElement('div', 'day-blank', '');
    blank.setAttribute('aria-hidden', 'true');
    grid.append(blank);
  }
  const days = new Date(year, monthIndex + 1, 0).getDate();
  for (let day = 1; day <= days; day++) {
    const key = dateKey(new Date(year, monthIndex, day));
    const record = data?.records[key];
    const before = key < START_DATE;
    const future = key > today;
    const total = data && !before && !future ? totalAt(data.records, key) : null;
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = `day-cell${key === today ? ' today' : ''}${before ? ' before-start' : ''}${future ? ' future' : ''}`;
    cell.dataset.date = key;
    cell.disabled = before || future || !data;
    const label = changeLabel(record);
    cell.setAttribute('aria-label', `${key}${key === today ? ' 今天' : ''}，${before ? '记录开始前' : future ? '尚未到来' : record ? `${KINDS[record.kind].label}，${record.operation === 'reset' ? '精力归零' : `变化 ${label}`}，累计 ${total} 分` : `尚未记录，累计 ${total} 分`}`);
    if (key === today) cell.setAttribute('aria-current', 'date');
    cell.append(textElement('span', 'day-date', String(day)));
    cell.append(textElement('span', `day-circle ${record ? record.kind : 'empty'}${label.length > 4 ? ' long-number' : ''}`, label));
    cell.append(textElement('span', `day-total${key === START_DATE ? ' start-date' : ''}`, total === null ? '—' : key === START_DATE ? `起点 · ${total}` : `累计 ${total.toLocaleString('zh-CN')}`));
    cell.addEventListener('click', () => openDay(key));
    grid.append(cell);
  }
}
function openDay(key) {
  const record = data.records[key];
  $('day-dialog-title').textContent = formatDate(key, { year: 'numeric', weekday: 'long' });
  const content = $('day-detail');
  content.replaceChildren();
  const visual = textElement('div', 'day-detail-visual', '');
  visual.append(textElement('span', `day-circle ${record?.kind || 'empty'}`, changeLabel(record)));
  const totals = document.createElement('div');
  totals.append(textElement('p', '', record ? `${KINDS[record.kind].label} · ${record.operation === 'reset' ? '精力归零' : `当日变化 ${changeLabel(record)}`}` : '这一天尚未记录'));
  totals.append(textElement('strong', '', `累计 ${totalAt(data.records, key).toLocaleString('zh-CN')} 分`));
  visual.append(totals);
  content.append(visual);
  if (record?.note) content.append(textElement('p', 'day-note', record.note));
  $('edit-day-link').href = `edit/?date=${key}`;
  $('day-dialog').showModal();
}
function entryRecord() {
  const operation = $('entry-operation').value;
  return {
    kind,
    operation,
    amount: ['keep', 'reset'].includes(operation) ? 0 : Number($('entry-amount').value),
    note: $('entry-note').value.trim(),
  };
}
function updateAmount() {
  const operation = $('entry-operation').value;
  const fixed = operation === 'keep' || operation === 'reset';
  $('entry-amount').disabled = fixed;
  if (fixed) $('entry-amount').value = '0';
  else if (!(Number($('entry-amount').value) > 0)) $('entry-amount').value = '1';
  $('operation-hint').textContent = operation === 'reset' ? '这一天结束后累计精力为 0，之后重新积攒。' : operation === 'keep' ? '累计精力保持不变。' : '场景和变化分值可以单独调整，以你的实际感受为准。';
}
function updatePreview() {
  const record = entryRecord();
  $('preview-date').textContent = formatDate(selectedDate, { weekday: 'long' });
  const label = changeLabel(record);
  $('preview-circle').className = `preview-circle ${kind}${label.length > 4 ? ' long-number' : ''}`;
  $('preview-circle').textContent = label;
  $('preview-kind').textContent = KINDS[kind].label;
  const draft = { ...data.records, [selectedDate]: record };
  const total = Number.isFinite(record.amount) ? totalAt(draft, selectedDate) : null;
  $('preview-total').replaceChildren(document.createTextNode(total === null ? '—' : total.toLocaleString('zh-CN')), textElement('small', '', ' 分'));
  $('preview-message').textContent = record.operation === 'reset' ? '这一天归零。之后每天的累计将从这里重新计算。' : '修改过去的记录，后面的累计值也会自动更新。';
  for (const button of document.querySelectorAll('[data-kind]')) button.setAttribute('aria-pressed', String(button.dataset.kind === kind));
}
function loadEntry(key) {
  selectedDate = key;
  original = data.records[key] ?? null;
  const record = original ?? { kind: 'school', operation: 'keep', amount: 0, note: '' };
  kind = record.kind;
  $('entry-date').value = key;
  $('date-state').textContent = original ? '已记录 · 可修改' : '尚未记录';
  $('entry-operation').value = record.operation;
  $('entry-amount').value = record.amount;
  $('entry-note').value = record.note;
  $('delete-button').hidden = !original;
  updateAmount();
  updatePreview();
  dirty = false;
}
function setBusy(value) {
  busy = value;
  $('entry-fields').disabled = value;
  $('connect-button').disabled = value;
  $('disconnect-button').disabled = value;
  $('refresh-data').disabled = value;
  $('save-button').textContent = value ? '正在保存到云端…' : '保存到云端 ↗';
}
async function persist(record) {
  if (busy) return;
  if (!getToken()) {
    status('save-status', '请先连接 GitHub。当前内容尚未保存到云端。', 'error');
    $('connect-dialog').showModal();
    return;
  }
  try {
    if (record) validateData({ schemaVersion: 1, records: { [selectedDate]: record } });
    setBusy(true);
    status('save-status', '正在核对最新记录并保存到 GitHub…');
    data = await saveRecord(selectedDate, record, original);
    verified = true;
    loadEntry(selectedDate);
    updateConnection();
    status('save-status', `${record ? '已同步到云端' : '已从云端删除'} · 后续累计已重新计算。`, 'success');
    status('load-status', '已读取云端最新记录 · ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
  } catch (error) {
    status('save-status', `${error.message} 本次修改未确认同步，请勿关闭页面。`, 'error');
  } finally { setBusy(false); updateAmount(); }
}
function setupEditor() {
  const requestedDate = new URL(location.href).searchParams.get('date');
  if (requestedDate && validDate(requestedDate) && requestedDate >= START_DATE && requestedDate <= today) selectedDate = requestedDate;
  $('entry-date').max = today;
  $('entry-date').value = selectedDate;
  updateConnection();
  $('entry-date').addEventListener('change', () => {
    if (!$('entry-date').checkValidity()) return;
    if (dirty && !confirm('当前修改尚未同步。切换日期会放弃这些修改，继续吗？')) { $('entry-date').value = selectedDate; return; }
    loadEntry($('entry-date').value);
    status('save-status', '');
  });
  for (const button of document.querySelectorAll('[data-kind]')) {
    button.addEventListener('click', () => {
      kind = button.dataset.kind;
      $('entry-operation').value = KINDS[kind].operation;
      $('entry-amount').value = KINDS[kind].amount;
      updateAmount(); updatePreview(); dirty = true;
      status('save-status', '场景已更新，尚未保存到云端。');
    });
  }
  $('entry-operation').addEventListener('change', () => { updateAmount(); updatePreview(); dirty = true; status('save-status', '尚未保存到云端。'); });
  for (const id of ['entry-amount', 'entry-note']) $(id).addEventListener('input', () => { updatePreview(); dirty = true; status('save-status', '尚未保存到云端。'); });
  $('entry-form').addEventListener('submit', event => { event.preventDefault(); persist(entryRecord()); });
  $('connect-button').addEventListener('click', () => { status('connect-status', ''); $('connect-dialog').showModal(); });
  $('disconnect-button').addEventListener('click', () => { disconnect(); verified = false; updateConnection(); status('save-status', '已断开 GitHub 连接。云端记录不受影响。'); });
  $('connect-dialog').addEventListener('close', () => { $('github-token').value = ''; });
  $('connect-form').addEventListener('submit', async event => {
    event.preventDefault();
    const token = $('github-token').value.trim();
    if (!token) return;
    $('verify-button').disabled = true;
    status('connect-status', '正在验证仓库访问权限…');
    try {
      const latest = await verifyToken(token);
      setToken(token, $('remember-token').checked);
      data = latest.data;
      verified = true;
      updateConnection();
      $('connect-dialog').close();
      if (!dirty) loadEntry(selectedDate);
      else updatePreview();
      status('save-status', dirty ? '已连接 GitHub。请点击“保存到云端”提交本次修改。' : '已连接 GitHub，可以开始记录。', 'success');
      status('load-status', '已验证 GitHub 连接，并读取最新云端记录。');
    } catch (error) { status('connect-status', error.message, 'error'); }
    finally { $('verify-button').disabled = false; }
  });
  $('delete-button').addEventListener('click', () => {
    $('delete-description').textContent = `将从云端删除 ${formatDate(selectedDate, { year: 'numeric' })} 的记录，并重新计算后续累计。可以重新补录这一天。`;
    $('delete-dialog').showModal();
  });
  $('confirm-delete').addEventListener('click', () => { $('delete-dialog').close(); persist(null); });
  $('refresh-data').addEventListener('click', async () => {
    if (busy) return;
    if (dirty && !confirm('当前修改尚未同步。重新读取会放弃这些修改，继续吗？')) return;
    $('refresh-data').disabled = true;
    $('entry-fields').disabled = true;
    try { await loadData(); status('save-status', ''); }
    finally { $('refresh-data').disabled = false; $('entry-fields').disabled = !data; }
  });
  window.addEventListener('beforeunload', event => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } });
}
function setupCalendar() {
  $('today-label').textContent = formatDate(today, { year: 'numeric', weekday: 'long' });
  $('previous-month').addEventListener('click', () => { month = new Date(month.getFullYear(), month.getMonth() - 1, 1); renderCalendar(); });
  $('next-month').addEventListener('click', () => { month = new Date(month.getFullYear(), month.getMonth() + 1, 1); renderCalendar(); });
  $('this-month').addEventListener('click', () => { month = new Date(new Date().getFullYear(), new Date().getMonth(), 1); renderCalendar(); });
  $('export-data').addEventListener('click', () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `long-journey-${today}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  renderCalendar();
}
for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click', () => button.closest('dialog').close());
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } });
}
if (isEditor) setupEditor();
else setupCalendar();
await loadData();
