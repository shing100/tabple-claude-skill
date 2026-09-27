// 프로젝트 컨텍스트 → LLM 친화 마크다운 카드 포맷.
// 입력: { project, columns, tasks, labels, members, stats, pages }  (REST snake_case 그대로)
// 출력: 단일 .md 문자열.


function fmtDate(iso) {
  if (!iso) return "—";
  return String(iso).slice(0, 10);
}

function statusLabel(t, columnsById) {
  if (t.status) return t.status;
  const c = columnsById.get(t.column_id);
  return c?.name ?? `col#${t.column_id}`;
}

function buildPageTree(pages) {
  const byParent = new Map();
  for (const p of pages) {
    const k = p.parent_id ?? 0;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k).push(p);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.title.localeCompare(b.title, "ko"));
  }
  const lines = [];
  const walk = (parentKey, depth) => {
    const kids = byParent.get(parentKey) ?? [];
    for (const p of kids) {
      const icon = p.icon ? `${p.icon} ` : "";
      lines.push(`${"  ".repeat(depth)}- [${p.id}] ${icon}${p.title}`);
      walk(p.id, depth + 1);
    }
  };
  walk(0, 0);
  return lines;
}

function recentTasks(tasks, columnsById, limit) {
  const sorted = [...tasks].sort((a, b) => {
    const at = a.updated_at ?? a.created_at ?? "";
    const bt = b.updated_at ?? b.created_at ?? "";
    return bt.localeCompare(at);
  });
  return sorted.slice(0, limit);
}

function tasksByStatusCount(tasks, columnsById) {
  const counts = new Map();
  for (const t of tasks) {
    const s = statusLabel(t, columnsById);
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return counts;
}

export function renderProjectContext({ project, columns, tasks, labels, members, stats, pages }, opts = {}) {
  const recentLimit = opts.recentLimit ?? 10;
  const lines = [];
  const columnsById = new Map((columns ?? []).map((c) => [c.id, c]));

  // ── Header ────────────────────────────────────────────────────────
  const key = project.key ? ` (${project.key})` : "";
  lines.push(`# ${project.name}${key}`);
  if (project.description) lines.push(`\n${project.description}`);
  lines.push("");

  // ── Stats ────────────────────────────────────────────────────────
  if (stats) {
    lines.push("## Stats");
    lines.push(`- 총 태스크: **${stats.totalTasks ?? "?"}**  ·  완료: ${stats.completedTasks ?? 0}  ·  진행 중: ${stats.inProgressTasks ?? 0}  ·  대기: ${stats.todoTasks ?? 0}`);
    lines.push(`- 멤버: ${stats.memberCount ?? members?.length ?? "?"}명`);
    lines.push("");
  }

  // ── Columns ──────────────────────────────────────────────────────
  if (columns?.length) {
    const counts = tasksByStatusCount(tasks ?? [], columnsById);
    lines.push("## Columns");
    for (const c of [...columns].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))) {
      const n = counts.get(c.name) ?? counts.get(String(c.id)) ?? 0;
      lines.push(`- ${c.name} — ${n} 태스크`);
    }
    lines.push("");
  }

  // ── Members ──────────────────────────────────────────────────────
  if (members?.length) {
    lines.push("## Members");
    for (const m of members) {
      const name = m.name ?? m.user?.name ?? `user#${m.user_id ?? m.userId ?? "?"}`;
      const role = m.role ?? "member";
      lines.push(`- ${name} (${role})`);
    }
    lines.push("");
  }

  // ── Labels ───────────────────────────────────────────────────────
  if (labels?.length) {
    lines.push("## Labels");
    lines.push(labels.map((l) => `\`${l.name}\``).join(" · "));
    lines.push("");
  }

  // ── Wiki tree ────────────────────────────────────────────────────
  if (pages?.length) {
    lines.push("## Wiki Pages");
    lines.push("`[id]` 다음에 `tp wiki get <id>` 로 본문을 가져올 수 있다.");
    lines.push("");
    lines.push(...buildPageTree(pages));
    lines.push("");
  } else {
    lines.push("## Wiki Pages");
    lines.push("_(없음)_");
    lines.push("");
  }

  // ── Recent tasks ─────────────────────────────────────────────────
  const recents = recentTasks(tasks ?? [], columnsById, recentLimit);
  if (recents.length) {
    lines.push(`## Recent Tasks (top ${recents.length})`);
    lines.push("| ID | 상태 | 우선순위 | 제목 | 담당 | 기한 | 수정 |");
    lines.push("|---|---|---|---|---|---|---|");
    for (const t of recents) {
      const id = t.task_number ? `${project.key ?? "T"}-${t.task_number}` : `#${t.id}`;
      const st = statusLabel(t, columnsById);
      const pri = t.priority ?? "—";
      const title = (t.title ?? "").replace(/\|/g, "\\|");
      const assn = t.assignee_name ?? (t.assignees?.[0]?.name ?? "—");
      const due = fmtDate(t.due_date);
      const upd = fmtDate(t.updated_at ?? t.created_at);
      lines.push(`| ${id} | ${st} | ${pri} | ${title} | ${assn} | ${due} | ${upd} |`);
    }
    lines.push("");
  }

  // ── Footer ────────────────────────────────────────────────────────
  lines.push("---");
  lines.push("_Tabple context card — `tp context` 출력. 60s 캐시._");
  return lines.join("\n") + "\n";
}

export function renderProjectList(projects) {
  const lines = ["# Tabple Projects", ""];
  lines.push("| ID | Key | Name | Tasks | Members |");
  lines.push("|---|---|---|---|---|");
  for (const p of projects) {
    lines.push(`| ${p.id} | ${p.key ?? "—"} | ${p.name} | ${p.task_count ?? "?"} | ${p.member_count ?? "?"} |`);
  }
  lines.push("");
  lines.push("`tp context <id-or-key>` 로 상세 컨텍스트 로드.");
  return lines.join("\n") + "\n";
}
