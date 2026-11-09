export const KINDS = {
  home: { label: '在家', description: '慢慢补充能量', operation: 'add', amount: 1 },
  school: { label: '学校', description: '保持原有能量', operation: 'keep', amount: 0 },
  small: { label: '小耗', description: '见人、远行、听讲座', operation: 'subtract', amount: 1 },
  big: { label: '大耗', description: '让累计精力归零', operation: 'reset', amount: 0 },
};
export const OPERATIONS = ['add', 'subtract', 'keep', 'reset'];
export const START_DATE = '2026-11-01';
export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function validDate(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const [y, m, d] = key.split('-').map(Number);
  if (y < 1970) return false;
  const date = new Date(y, m - 1, d);
  return dateKey(date) === key;
}
export function validateData(input) {
  if (!input || input.schemaVersion !== 1 || !input.records || Array.isArray(input.records) || typeof input.records !== 'object') {
    throw new Error('记录文件格式不正确，未读取或覆盖任何记录。');
  }
  const records = {};
  for (const [key, r] of Object.entries(input.records)) {
    if (!validDate(key) || key < START_DATE || !r || !Object.hasOwn(KINDS, r.kind) || !OPERATIONS.includes(r.operation)
      || !Number.isSafeInteger(r.amount) || r.amount < 0 || r.amount > 1000000
      || (['keep', 'reset'].includes(r.operation) && r.amount !== 0)
      || (['add', 'subtract'].includes(r.operation) && r.amount === 0)
      || typeof r.note !== 'string' || r.note.length > 140) {
      throw new Error(`日期 ${key} 的记录格式不正确，请先检查备份。`);
    }
    records[key] = { kind: r.kind, operation: r.operation, amount: r.amount, note: r.note };
  }
  return { schemaVersion: 1, records };
}
export function applyRecord(total, record) {
  if (!record) return total;
  if (record.operation === 'reset') return 0;
  if (record.operation === 'add') return total + record.amount;
  if (record.operation === 'subtract') return total - record.amount;
  return total;
}
export function totalAt(records, through = dateKey()) {
  return Object.keys(records).sort().filter(key => key <= through).reduce((total, key) => applyRecord(total, records[key]), 0);
}
export function changeLabel(record) {
  if (!record) return '—';
  if (record.operation === 'reset') return '零';
  if (record.operation === 'keep') return '0';
  return `${record.operation === 'add' ? '+' : '−'}${record.amount}`;
}
export function sameRecord(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}
export function mergeRecord(latest, key, record, original) {
  if (!sameRecord(latest.records[key], original)) {
    throw new Error('这一天的记录已在其他设备更新。请先刷新记录，再确认你的修改。');
  }
  const records = { ...latest.records };
  if (record === null) delete records[key];
  else records[key] = record;
  return validateData({ schemaVersion: 1, records });
}
