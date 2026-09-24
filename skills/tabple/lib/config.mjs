import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_BASE_URL = "https://tabple.com";

export function loadConfig() {
  // 환경변수 — TABPLE_TOKEN 우선, 옛 TASKFLOW_TOKEN 도 fallback 인식 (사용자 셸 config 호환).
  const envToken = (process.env.TABPLE_TOKEN || process.env.TASKFLOW_TOKEN)?.trim();
  const envBase = (process.env.TABPLE_BASE_URL || process.env.TASKFLOW_BASE_URL)?.trim();

  let fileToken;
  let fileBase;
  // ~/.tabple/config.json 우선, 없으면 ~/.taskflow/config.json (옛 경로) 자동 fallback.
  for (const dir of [".tabple", ".taskflow"]) {
    if (fileToken) break;
    try {
      const raw = readFileSync(join(homedir(), dir, "config.json"), "utf8");
      const parsed = JSON.parse(raw);
      if (typeof parsed.token === "string") fileToken = parsed.token.trim();
      if (typeof parsed.baseUrl === "string") fileBase = parsed.baseUrl.trim();
    } catch {
      // silent — 둘 다 없으면 env 만 사용
    }
  }

  const token = envToken || fileToken;
  const baseUrl = (envBase || fileBase || DEFAULT_BASE_URL).replace(/\/+$/, "");

  if (!token) {
    throw new Error(
      "Tabple 토큰이 설정되지 않았습니다.\n" +
        "  1) export TABPLE_TOKEN=tf_xxx   또는\n" +
        "  2) ~/.tabple/config.json 에 {\"token\":\"tf_xxx\"} 저장\n" +
        "토큰 발급: Tabple Desktop → Settings → MCP",
    );
  }

  return { token, baseUrl };
}
