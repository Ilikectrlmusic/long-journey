import { validateData, mergeRecord } from './model.js';

export const REPO = { owner: 'Ilikectrlmusic', name: 'long-journey', branch: 'main', path: 'data/energy.json' };
const API = `https://api.github.com/repos/${REPO.owner}/${REPO.name}`;
const FILE_API = `${API}/contents/${REPO.path}`;
const TOKEN_KEY = 'long-journey:github-token';
const BASE = new URL('../', import.meta.url);
let memoryToken = '';
function safeRead(storage, key) { try { return storage.getItem(key) || ''; } catch { return ''; } }
export function getToken() {
  return memoryToken || safeRead(sessionStorage, TOKEN_KEY) || safeRead(localStorage, TOKEN_KEY);
}
export function setToken(token, remember) {
  disconnect();
  memoryToken = token;
  try { (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token); } catch { /* The connection still works in this tab. */ }
}
export function disconnect() {
  memoryToken = '';
  for (const storage of [sessionStorage, localStorage]) {
    try { storage.removeItem(TOKEN_KEY); } catch { /* Storage may be disabled. */ }
  }
}
function decodeContent(content) {
  const bytes = Uint8Array.from(atob(content.replace(/\s/g, '')), c => c.charCodeAt(0));
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
function encodeContent(data) {
  const bytes = new TextEncoder().encode(JSON.stringify(data, null, 2) + '\n');
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
async function request(url, { token = '', ...options } = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new Error('无法连接 GitHub，请检查网络后重试。你的修改尚未保存到云端。');
  }
  if (!response.ok) {
    const errors = {
      401: 'GitHub 密钥无效或已过期，请重新连接。',
      403: 'GitHub 拒绝了请求：请检查密钥的仓库权限、有效期，或稍后重试。',
      404: '无法访问记录文件，请检查密钥是否已选择 long-journey 仓库。',
      409: '云端刚刚发生了更新，请重试保存；若同一天有变化，请先刷新记录。',
      422: 'GitHub 未接受这次保存，请刷新记录后重试。',
      429: '请求太频繁，请稍等片刻再试。',
    };
    throw new Error(errors[response.status] || `GitHub 暂时无法完成请求（${response.status}），请稍后重试。`);
  }
  return response.json();
}
export async function readCloud(token = getToken()) {
  const file = await request(`${FILE_API}?ref=${REPO.branch}`, { token });
  if (file.encoding !== 'base64' || !file.sha || typeof file.content !== 'string') throw new Error('GitHub 返回的记录文件不完整。');
  return { data: validateData(decodeContent(file.content)), sha: file.sha };
}
export async function readPublished() {
  const response = await fetch(new URL('data/energy.json', BASE), { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('暂时无法读取已发布的记录，请检查网络后刷新。');
  return validateData(await response.json());
}
export async function verifyToken(token) {
  const repo = await request(API, { token });
  if (!repo.permissions?.push) throw new Error('此账号或密钥没有仓库写入权限，请选择 Contents: Read and write。');
  return readCloud(token);
}
export async function saveRecord(key, record, original) {
  const token = getToken();
  if (!token) throw new Error('请先连接 GitHub，才能将记录保存到云端。');
  // Read the latest file and merge just this date, preserving edits on other devices.
  const latest = await readCloud(token);
  const data = mergeRecord(latest.data, key, record, original);
  await request(FILE_API, {
    token,
    method: 'PUT',
    body: JSON.stringify({
      message: `${record ? '记录' : '删除'} ${key} 的精力`,
      branch: REPO.branch,
      sha: latest.sha,
      content: encodeContent(data),
    }),
  });
  return data;
}
