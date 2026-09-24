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

  // ── 위키 페이지 CRUD ─────────────────────────────────────────
  // 백엔드: POST /api/pages, PUT /api/pages/{id}, DELETE /api/pages/{id}
  // 데스크탑 wikiApi 와 동일 endpoint. content 는 TipTap HTML 문자열 또는 JSON 문자열.
  //
  // type / hidden_in_tree 는 명시될 때만 body 에 포함 (데스크탑 wikiApi.create 정합).
  // 백엔드가 type 키 누락 = "page" 기본값. "page" 를 명시 전송하는 게 동등하지만
  // 보수적으로 옵셔널 spread 로 통일.
  createPage: ({ projectId, title, content = "", icon = "", parentId = null, type, hiddenInTree }) =>
    request("/api/pages", {
      method: "POST",
      body: JSON.stringify({
        title,
        project_id: projectId,
        parent_id: parentId,
        content,
        icon,
        ...(type ? { type } : {}),
        ...(hiddenInTree ? { hidden_in_tree: true } : {}),
      }),
    }),
  updatePage: (pageId, patch) =>
    request(`/api/pages/${pageId}`, {
      method: "PUT",
      body: JSON.stringify(patch),
    }),
  deletePage: (pageId) =>
    request(`/api/pages/${pageId}`, { method: "DELETE" }),
};
