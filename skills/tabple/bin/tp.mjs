#!/usr/bin/env node
// Tabple Claude skill CLI.
// 서브명령 (나머지는 MCP 도구 mcp__tabple__* 가 커버):
//   tp context <project-id-or-key>             composite + 60s 캐시
//   tp wiki   get <page-id>                    TipTap JSON → Markdown
//   tp wiki   create -p <pid> -t <title>       위키 페이지 생성
//   tp wiki   update <page-id> [-t ...] [-c ...]  위키 페이지 수정
//   tp wiki   delete <page-id>                 위키 페이지 삭제
//   tp projects list                           다중 프로젝트 진입점 (캐시 안 함)
// SKILL.md 참고.

import { api, TabpleApiError } from "../lib/api.mjs";
import { withCache } from "../lib/cache.mjs";
import { pageContentToMarkdown } from "../lib/tiptap-md.mjs";
import { renderProjectContext, renderProjectList } from "../lib/render.mjs";

const HELP = `tp — Tabple Claude skill CLI

사용:
  tp context <project-id-or-key>     프로젝트 컨텍스트 카드 (60s 캐시)
  tp wiki get <page-id>              위키 페이지 본문 → Markdown
  tp wiki create -p <pid> -t <title> 위키 페이지 생성 (선택: --parent <pid> --icon 📄 --content "본문")
  tp wiki update <page-id> [-t ...] [-c ...] [--icon ...]   위키 페이지 수정
  tp wiki delete <page-id>           위키 페이지 삭제 (확인 없이 즉시, 자식은 cascade)
  tp projects list                   내 프로젝트 목록

  wiki create/update/delete 는 MCP 엔드포인트(/api/mcp)의 같은 도구를 부른다 — PAT 는 REST 쓰기를
  통과하지 않는다. 그래서 MCP 와 같은 조건이다: Pro · Pro 일회성 결제, 읽기 전용 토큰은 거절.

옵션:
  --no-cache       캐시 무시하고 강제 재요청
  --json           결과를 JSON 으로 출력 (디버그용)
  --recent <n>     context 의 최근 태스크 개수 (기본 10)
  --include-hidden 트리에서 가려진 페이지(PageList 인라인) 포함

  -p, --project    프로젝트 id (wiki create)
  -t, --title      페이지 제목 (wiki create/update)
  -c, --content    페이지 본문 — 기본 plain text (자동으로 <p> 로 감쌈).
                   이미 TipTap HTML/JSON 이면 그대로 전달
      --parent     부모 페이지 id (wiki create)
      --icon       이모지 아이콘 (wiki create/update)

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
    else if (a === "-p" || a === "--project") args.flags.project = argv[++i];
    else if (a === "-t" || a === "--title") args.flags.title = argv[++i];
    else if (a === "-c" || a === "--content") args.flags.content = argv[++i];
    else if (a === "--parent") args.flags.parent = argv[++i];
    else if (a === "--icon") args.flags.icon = argv[++i];
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

// ── 위키 CRUD ────────────────────────────────────────────────
// content 정규화: plain text 가 들어오면 TipTap doc JSON 한 단락으로 감쌈.
// 이미 HTML (`<p>` 시작) 또는 JSON 객체 문자열이면 그대로 전달.
// 백엔드는 content 를 HTML 문자열 또는 JSON 문자열로 저장 (tiptap 양쪽 호환).
function normalizeContent(input) {
  if (!input) return "";
  const trimmed = input.trim();
  if (!trimmed) return "";
  // 이미 HTML 또는 JSON 이면 그대로
  if (trimmed.startsWith("<") || trimmed.startsWith("{")) return trimmed;
  // plain text → <p> 로 감쌈 (백엔드는 HTML 저장 호환)
  // 줄바꿈은 \n → <br> 변환 (간단 휴리스틱)
  const escaped = trimmed
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const paragraphs = escaped.split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
  return paragraphs;
}

async function cmdWikiCreate(args) {
  const pid = args.flags.project;
  const title = args.flags.title;
  if (!pid) fail("프로젝트 id 가 필요합니다. --project <id> 또는 -p <id>");
  if (!/^\d+$/.test(String(pid))) fail("--project 는 숫자 id 여야 합니다.");
  if (!title) fail("제목이 필요합니다. --title \"...\" 또는 -t \"...\"");

  const parentId = args.flags.parent != null
    ? (/^\d+$/.test(String(args.flags.parent)) ? Number(args.flags.parent) : null)
    : null;
  const created = await api.createPage({
    projectId: Number(pid),
    title,
    content: normalizeContent(args.flags.content ?? ""),
    icon: args.flags.icon ?? "",
    parentId,
  });
  if (args.flags.json) {
    process.stdout.write(JSON.stringify(created, null, 2) + "\n");
    return;
  }
  const id = created?.id ?? "?";
  process.stdout.write(`✅ 위키 페이지 생성 완료 — id ${id} · "${title}"\n`);
}

async function cmdWikiUpdate(args) {
  const pageId = args._[2];
  if (!pageId) fail("페이지 id 가 필요합니다. 예: tp wiki update 123 -t \"새 제목\"");
  if (!/^\d+$/.test(pageId)) fail("페이지 id 는 숫자여야 합니다.");

  const patch = {};
  if (args.flags.title != null) patch.title = args.flags.title;
  if (args.flags.content != null) patch.content = normalizeContent(args.flags.content);
  if (args.flags.icon != null) patch.icon = args.flags.icon;
  if (Object.keys(patch).length === 0) {
    fail("수정할 필드가 없습니다. --title, --content, --icon 중 하나 이상 지정.");
  }

  const updated = await api.updatePage(Number(pageId), patch);
  if (args.flags.json) {
    process.stdout.write(JSON.stringify(updated, null, 2) + "\n");
    return;
  }
  const changed = Object.keys(patch).join(", ");
  process.stdout.write(`✅ 위키 페이지 ${pageId} 수정 완료 (${changed})\n`);
}

async function cmdWikiDelete(args) {
  const pageId = args._[2];
  if (!pageId) fail("페이지 id 가 필요합니다. 예: tp wiki delete 123");
  if (!/^\d+$/.test(pageId)) fail("페이지 id 는 숫자여야 합니다.");

  const deleted = await api.deletePage(Number(pageId));
  const count = Number(deleted?.deleted_count ?? 1);
  process.stdout.write(`🗑️ 위키 페이지 ${pageId} 삭제 완료${count > 1 ? ` (하위 페이지 포함 ${count}개)` : ""}\n`);
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
    else if (verb === "wiki" && sub === "create") await cmdWikiCreate(args);
    else if (verb === "wiki" && sub === "update") await cmdWikiUpdate(args);
    else if (verb === "wiki" && sub === "delete") await cmdWikiDelete(args);
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
