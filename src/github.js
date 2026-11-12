// Guardar y abrir dibujos (.json) en un repositorio de GitHub mediante la API de contenidos.
// Sin servidor propio: el navegador habla directo con api.github.com (permite CORS) usando un token de acceso
// personal de grano fino con permiso "Contents: read and write" sobre UN repositorio. El token vive solo en el
// navegador de cada dispositivo (localStorage) y nunca entra en el archivo del dibujo.

const API = 'https://api.github.com';
const CFG_KEY = 'ipad-cad-gh', SHA_KEY = 'ipad-cad-gh-sha';

export class GhError extends Error {
  constructor(msg, status) { super(msg); this.status = status; }
}

const jget = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

export const loadCfg = () => ({ repo: '', branch: 'main', dir: 'dibujos', token: '', ...jget(CFG_KEY, {}) });
export const saveCfg = (c) => jset(CFG_KEY, c);
export const clearCfg = () => { try { localStorage.removeItem(CFG_KEY); localStorage.removeItem(SHA_KEY); } catch (e) { /* sin almacenamiento */ } };
export const isReady = (c) => /^[\w.-]+\/[\w.-]+$/.test(c.repo || '') && !!c.token;

// Ultima version conocida (sha del blob) de cada archivo, para avisar si otro dispositivo lo cambio.
const shaKey = (c, path) => `${c.repo}@${c.branch}:${path}`;
export const knownSha = (c, path) => jget(SHA_KEY, {})[shaKey(c, path)] || null;
export const rememberSha = (c, path, sha) => { const m = jget(SHA_KEY, {}); m[shaKey(c, path)] = sha; jset(SHA_KEY, m); };

export const cleanDir = (d) => String(d || '').split('/').map((s) => s.trim()).filter(Boolean).join('/');
export const filePath = (c, name) => [cleanDir(c.dir), name].filter(Boolean).join('/');
const enc = (p) => p.split('/').map(encodeURIComponent).join('/');

export function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function call(c, method, url, body, accept = 'application/vnd.github+json', f = fetch) {
  let r;
  try {
    r = await f(url, {
      method, cache: 'no-store', // la API deja cachear 60 s: no queremos un sha viejo
      headers: { Authorization: 'Bearer ' + c.token, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) { throw new GhError('Sin conexión con GitHub', 0); }
  if (r.ok) return r;
  let msg = '';
  try { msg = (await r.json()).message || ''; } catch (e) { /* sin cuerpo */ }
  if (r.status === 401) throw new GhError('El token no es válido o venció', 401);
  if (r.status === 403) throw new GhError('GitHub rechazó la operación (permisos del token o límite de uso)' + (msg ? ': ' + msg : ''), 403);
  if (r.status === 404) throw new GhError('No se encontró (revisa repositorio, rama y que el token tenga acceso)', 404);
  if (r.status === 409 || r.status === 422) throw new GhError('Conflicto: el archivo cambió en GitHub', r.status);
  throw new GhError(`GitHub respondió ${r.status}` + (msg ? ': ' + msg : ''), r.status);
}

// Lista los .json de la carpeta configurada ([] si la carpeta aun no existe).
export async function list(c, f = fetch) {
  const dir = cleanDir(c.dir);
  const url = `${API}/repos/${c.repo}/contents${dir ? '/' + enc(dir) : ''}?ref=${encodeURIComponent(c.branch)}`;
  let r;
  try { r = await call(c, 'GET', url, null, undefined, f); } catch (e) { if (e.status === 404) { await call(c, 'GET', `${API}/repos/${c.repo}`, null, undefined, f); return []; } throw e; }
  const j = await r.json();
  if (!Array.isArray(j)) return [];
  return j.filter((x) => x.type === 'file' && /\.json$/i.test(x.name)).map((x) => ({ name: x.name, sha: x.sha, size: x.size })).sort((a, b) => a.name.localeCompare(b.name));
}

// sha actual del archivo en la rama, o null si no existe.
export async function currentSha(c, path, f = fetch) {
  try {
    const r = await call(c, 'GET', `${API}/repos/${c.repo}/contents/${enc(path)}?ref=${encodeURIComponent(c.branch)}`, null, undefined, f);
    const j = await r.json();
    return j.sha || null;
  } catch (e) { if (e.status === 404) return null; throw e; }
}

export async function read(c, path, f = fetch) {
  const r = await call(c, 'GET', `${API}/repos/${c.repo}/contents/${enc(path)}?ref=${encodeURIComponent(c.branch)}`, null, 'application/vnd.github.raw+json', f);
  return r.text();
}

// Crea o actualiza (con sha) un archivo; devuelve el sha nuevo.
export async function write(c, path, text, message, sha, f = fetch) {
  const r = await call(c, 'PUT', `${API}/repos/${c.repo}/contents/${enc(path)}`, { message, content: toBase64(text), branch: c.branch, ...(sha ? { sha } : {}) }, undefined, f);
  const j = await r.json();
  return j.content?.sha || null;
}
