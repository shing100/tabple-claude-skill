import { loadConfig } from "./config.mjs";

export class TabpleApiError extends Error {
  constructor(status, body, url) {
    super(`Tabple API ${status} — ${url}\n${body}`);
    this.status = status;
    this.body = body;
    this.url = url;
  }
}

async function request(path, init = {}) {
  const { token, baseUrl } = loadConfig();
  const url = baseUrl + path;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new TabpleApiError(res.status, text.slice(0, 400), url);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const api = {
  listProjects: () => request("/api/projects"),
  getProject: (id) => request(`/api/projects/${id}`),
  getProjectStats: (id) => request(`/api/projects/${id}/stats`),
  getProjectMembers: (id) => request(`/api/projects/${id}/members`),
  listPages: (projectId, { includeHidden = false } = {}) => {
    const q = new URLSearchParams({ project_id: String(projectId) });
    if (includeHidden) q.set("include_hidden", "1");
    return request(`/api/pages?${q.toString()}`);
  },
  getPage: (pageId) => request(`/api/pages/${pageId}`),

  // ── 위키 페이지 쓰기 — MCP 도구 (callTool) ────────────────────
  // REST(`POST/PUT/DELETE /api/pages`)가 아니다 — PAT 는 REST 쓰기를 통과하지 않는다. 이유는
  // callTool 주석. 인자 이름은 MCP 도구 스키마(Tabple app/api/mcp/route.ts) 그대로다.
  // 선택 인자는 값이 있을 때만 싣는다 — 스키마가 `optional()` 이라 null 은 검증 오류다.
  createPage: ({ projectId, title, content = "", icon = "", parentId = null }) =>
    callTool("create_page", {
      project_id: projectId,
      title,
      content,
      ...(parentId != null ? { parent_id: parentId } : {}),
      ...(icon ? { icon } : {}),
    }),
  updatePage: (pageId, patch) => callTool("update_page", { page_id: pageId, ...patch }),
  deletePage: (pageId) => callTool("delete_page", { page_id: pageId }),
};

/**
 * MCP 도구 한 번 — `POST /api/mcp` 에 JSON-RPC `tools/call`.
 *
 * 위키 쓰기가 이 길로 가는 이유: PAT(`kind='mcp'`)는 MCP 엔드포인트와 이 CLI 가 읽는 GET 6곳
 * (위 request 들)에서만 통과한다 (Tabple lib/auth.ts `SessionLookupOptions`). `read_only` scope 는
 * MCP 가 도구마다 검사하는 것이 전부라, REST 쓰기가 PAT 를 받으면 읽기 전용 토큰이 다시 쓸 수 있게
 * 되기 때문이다. 같은 도구를 부르므로 읽기 전용 토큰 · 플랜(Pro · Pro 일회성 결제) · 잠긴 페이지 ·
 * 한도 판정이 MCP 로 연결한 에이전트와 같다.
 *
 * 서버는 세션이 없는(stateless) 전송이라 `initialize` 없이 바로 부른다. 결과는 SSE 이벤트로 오는 것이
 * 기본이고, 인증 · 플랜 · 호출 한도 거절은 JSON 본문 + 4xx 다 — 둘 다 받는다.
 */
const MCP_PROTOCOL_VERSION = "2025-06-18";

async function callTool(name, args) {
  const { token, baseUrl } = loadConfig();
  const url = baseUrl + "/api/mcp";
  const id = 1;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new TabpleApiError(res.status, text.slice(0, 400), url);
  }
  const reply = parseRpcMessages(text, res.headers.get("content-type")).find((m) => m?.id === id);
  if (!reply) {
    throw new TabpleApiError(res.status, `MCP 응답을 해석하지 못했습니다: ${text.slice(0, 300)}`, url);
  }
  if (reply.error) {
    throw new TabpleApiError(res.status, `${name}: ${JSON.stringify(reply.error)}`.slice(0, 400), url);
  }
  const body = (reply.result?.content ?? []).find((c) => c?.type === "text")?.text ?? "";
  if (reply.result?.isError) {
    // HTTP 는 200 이다 — 도구가 거절했다(읽기 전용 토큰 · 권한 · 없는 페이지 · 잠금). 상태 자리에 200 을
    // 찍으면 성공처럼 읽혀서 도구 오류라고 적는다.
    throw new TabpleApiError("도구 오류", `${name}: ${body}`.slice(0, 400), url);
  }
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

/** 응답 본문 → JSON-RPC 메시지들. SSE 면 `data:` 줄을 이벤트마다 모은다(빈 이벤트는 건너뛴다). */
function parseRpcMessages(text, contentType) {
  if (!/text\/event-stream/i.test(contentType ?? "")) {
    try {
      const value = JSON.parse(text);
      return Array.isArray(value) ? value : [value];
    } catch {
      return [];
    }
  }
  const messages = [];
  for (const event of text.split(/\r?\n\r?\n/)) {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n");
    if (!data.trim()) continue;
    try {
      messages.push(JSON.parse(data));
    } catch {
      // 깨진 이벤트 하나 때문에 나머지를 버리지 않는다 — 찾는 것은 id 가 맞는 응답 하나다
    }
  }
  return messages;
}
