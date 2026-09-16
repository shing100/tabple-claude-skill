#!/usr/bin/env node
// Tabple Claude skill CLI.
// 두 서브명령만 (나머지는 MCP 도구 mcp__tabple__* 가 커버):
//   tp context <project-id-or-key>   composite + 60s 캐시
//   tp wiki   get <page-id>          TipTap JSON → Markdown
//   tp projects list                 다중 프로젝트 진입점 (캐시 안 함)
// SKILL.md 참고.

import { api, TabpleApiError } from "../lib/api.mjs";
import { withCache } from "../lib/cache.mjs";
import { pageContentToMarkdown } from "../lib/tiptap-md.mjs";
import { renderProjectContext, renderProjectList } from "../lib/render.mjs";

const HELP = `tp — Tabple Claude skill CLI

사용:
  tp context <project-id-or-key>     프로젝트 컨텍스트 카드 (60s 캐시)
  tp wiki get <page-id>              위키 페이지 본문 → Markdown
  tp projects list                   내 프로젝트 목록

옵션:
  --no-cache       캐시 무시하고 강제 재요청
  --json           결과를 JSON 으로 출력 (디버그용)
  --recent <n>     context 의 최근 태스크 개수 (기본 10)
  --include-hidden 트리에서 가려진 페이지(PageList 인라인) 포함

환경:
  TABPLE_TOKEN          PAT (또는 ~/.tabple/config.json:token)
  TABPLE_BASE_URL       기본 https://tabple.com

`;

function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--no-cache") args.flags.noCache = true;
    else if (a === "--json") args.flags.json = true;
    else if (a === "--include-hidden") args.flags.includeHidden = true;
    else if (a === "--recent") args.flags.recent = Number(argv[++i]);
    else if (a === "-h" || a === "--help") args.flags.help = true;
    else args._.push(a);
  }
  return args;
}

function fail(msg, code = 1) {
  process.stderr.write(`tp: ${msg}\n`);
  process.exit(code);
}

async function resolveProjectId(idOrKey) {
  if (/^\d+$/.test(idOrKey)) return Number(idOrKey);
  // key (e.g., "PRJ") → list 후 매칭
  const listed = await api.listProjects();
  const projects = Array.isArray(listed) ? listed : (listed?.projects ?? []);
  const hit = projects.find(
    (p) => (p.key && p.key.toLowerCase() === idOrKey.toLowerCase()) ||
           p.name.toLowerCase() === idOrKey.toLowerCase(),
  );
  if (!hit) throw new Error(`프로젝트를 찾을 수 없습니다: "${idOrKey}". 'tp projects list' 로 확인.`);
  return hit.id;
}

async function cmdContext(args) {
  const target = args._[1];
  if (!target) fail("프로젝트 id 또는 key 가 필요합니다. 예: tp context 42");

  const projectId = await resolveProjectId(target);
  const cacheKey = `context:${projectId}`;
  const ttl = args.flags.noCache ? 0 : 60_000;

  const { value, cached } = await withCache(cacheKey, ttl, async () => {
    const [detail, stats, members, pages] = await Promise.all([
      api.getProject(projectId),
      api.getProjectStats(projectId).catch(() => null),
      api.getProjectMembers(projectId).catch(() => null),
      api.listPages(projectId, { includeHidden: !!args.flags.includeHidden }).catch(() => []),
    ]);
    return {
      project: detail.project,
      columns: detail.columns ?? [],
      tasks: detail.tasks ?? [],
      labels: detail.labels ?? [],
      stats,
      members: members?.members ?? (Array.isArray(members) ? members : []),
      pages: Array.isArray(pages) ? pages : [],
    };
  });

  if (args.flags.json) {
    process.stdout.write(JSON.stringify({ cached, ...value }, null, 2) + "\n");
    return;
  }
  process.stdout.write(renderProjectContext(value, { recentLimit: args.flags.recent ?? 10 }));
  if (cached) process.stderr.write("(cache hit, 60s)\n");
}

async function cmdWikiGet(args) {
  const pageId = args._[2];
  if (!pageId) fail("페이지 id 가 필요합니다. 예: tp wiki get 123");
  if (!/^\d+$/.test(pageId)) fail("페이지 id 는 숫자여야 합니다.");

  const page = await api.getPage(Number(pageId));
  if (args.flags.json) {
    process.stdout.write(JSON.stringify(page, null, 2) + "\n");
    return;
  }
  process.stdout.write(pageContentToMarkdown(page.title ?? `Page ${pageId}`, page.content));
}

async function cmdProjectsList(args) {
  const listed = await api.listProjects();
  const projects = Array.isArray(listed) ? listed : (listed?.projects ?? []);
  if (args.flags.json) {
    process.stdout.write(JSON.stringify(projects, null, 2) + "\n");
    return;
  }
  process.stdout.write(renderProjectList(projects));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.flags.help || args._.length === 0) {
    process.stdout.write(HELP);
    return;
  }

  const [verb, sub] = args._;
  try {
    if (verb === "context") await cmdContext(args);
    else if (verb === "wiki" && sub === "get") await cmdWikiGet(args);
    else if (verb === "projects" && sub === "list") await cmdProjectsList(args);
    else fail(`알 수 없는 명령: ${args._.join(" ")}\n\n${HELP}`);
  } catch (e) {
    if (e instanceof TabpleApiError) {
      fail(`API ${e.status} — ${e.url}\n${e.body}`, 2);
    }
    fail(e.message ?? String(e), 1);
  }
}

main();
