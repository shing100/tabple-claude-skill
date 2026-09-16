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
};
