import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_BASE_URL = "https://tabple.com";

export function loadConfig() {
  const envToken = process.env.TABPLE_TOKEN?.trim();
  const envBase = process.env.TABPLE_BASE_URL?.trim();

  let fileToken;
  let fileBase;
  try {
    const raw = readFileSync(join(homedir(), ".tabple", "config.json"), "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.token === "string") fileToken = parsed.token.trim();
    if (typeof parsed.baseUrl === "string") fileBase = parsed.baseUrl.trim();
  } catch {
    // silent — config 파일 없음은 정상 (env 만 사용하는 경우)
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
