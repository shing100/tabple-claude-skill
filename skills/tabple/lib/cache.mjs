import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

const CACHE_DIR = join(homedir(), ".tabple", "cache");
const DEFAULT_TTL_MS = 60_000;

function ensureDir() {
  try { mkdirSync(CACHE_DIR, { recursive: true }); } catch { /* silent — exists */ }
}

function keyToPath(key) {
  const safe = createHash("sha1").update(key).digest("hex").slice(0, 16);
  return join(CACHE_DIR, `${safe}.json`);
}

export function getCached(key, ttlMs = DEFAULT_TTL_MS) {
  try {
    const path = keyToPath(key);
    const stat = statSync(path);
    if (Date.now() - stat.mtimeMs > ttlMs) return null;
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function setCached(key, value) {
  try {
    ensureDir();
    writeFileSync(keyToPath(key), JSON.stringify(value));
  } catch {
    // silent — 캐시 쓰기 실패는 치명적이지 않음
  }
}

export async function withCache(key, ttlMs, loader) {
  const hit = getCached(key, ttlMs);
  if (hit !== null) return { value: hit, cached: true };
  const value = await loader();
  setCached(key, value);
  return { value, cached: false };
}
