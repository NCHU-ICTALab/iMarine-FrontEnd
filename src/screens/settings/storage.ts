/* 設定持久化：單一 localStorage key，node/測試環境自動退記憶體。
   getSetting/setSetting/subscribe 為全站消費 API；prefersReduced 供各頁動畫分支。 */
const KEY = 'imarine.settings.v1';

type Store = Record<string, unknown>;

const mem: Record<string, string> = {};
function read(): string | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(KEY);
  } catch {}
  return mem[KEY] ?? null;
}
function write(v: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(KEY, v);
      return;
    }
  } catch {}
  mem[KEY] = v;
}
function load(): Store {
  const raw = read();
  if (!raw) return { _version: 1 };
  try {
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? (o as Store) : { _version: 1 };
  } catch {
    return { _version: 1 };
  }
}

const subs = new Map<string, Set<(v: unknown) => void>>();

export function getSetting<T>(key: string, fallback: T): T {
  const s = load();
  return key in s ? (s[key] as T) : fallback;
}

export function setSetting(key: string, value: unknown): void {
  const s = load();
  s[key] = value;
  s._version = 1;
  write(JSON.stringify(s));
  subs.get(key)?.forEach((cb) => cb(value));
}

export function subscribe(key: string, cb: (v: unknown) => void): () => void {
  if (!subs.has(key)) subs.set(key, new Set());
  subs.get(key)!.add(cb);
  return () => {
    subs.get(key)!.delete(cb);
  };
}

/* 各頁 reduced-motion 分支的唯一入口：設定覆寫優先，其次系統偏好 */
export function prefersReduced(): boolean {
  if (getSetting('frontend.reduceMotion', false)) return true;
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
