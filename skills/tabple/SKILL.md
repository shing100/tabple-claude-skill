---
name: tabple
description: Load Tabple project context (wiki + board) and CRUD tasks for any LLM coding session. Use when the user mentions Tabple, promstack, 프롬스택, 프로젝트 컨텍스트, 위키 페이지, 보드, 태스크 — or asks "load context from project X" / "wiki 에서 Y 찾아줘" / "태스크 만들어줘".
argument-hint: "[context <id-or-key> | wiki get <page-id> | projects list]"
allowed-tools: Bash(node *)
---

# Tabple Skill

Tabple (https://tabple.com) 의 프로젝트·위키·보드를 LLM 코드 에이전트가 컨텍스트로 활용하도록 돕는 스킬.

**전제**: 사용자가 PAT 를 발급해 `TABPLE_TOKEN` 환경변수 또는 `~/.tabple/config.json` (옛 경로) / `~/.tabple/config.json` (v0.8.7+ 신규) 에 저장해 둠. 미설정 시 CLI 실행이 즉시 친절한 에러로 안내한다. README.md 참고.

CLI 진입점: `node ${CLAUDE_SKILL_DIR}/bin/tp.mjs <subcommand>` (이 경로는 skill 위치와 무관하게 항상 유효).

---

## 직접 호출 (`/tabple <args>`)

사용자가 슬래시 명령으로 `/tabple projects list` · `/tabple context PRJ` · `/tabple wiki get 123` 처럼 호출하면, 그 인자를 그대로 CLI 에 전달:

```
Bash: node ${CLAUDE_SKILL_DIR}/bin/tp.mjs $ARGUMENTS
```

출력은 LLM-친화 Markdown 이므로 사용자에게 그대로 보여주되, 매우 길면 한 단락으로 압축 요약. 인자 없이 `/tabple` 만 호출되면 아래 워크플로우 섹션을 참고해 사용자에게 무엇이 필요한지 묻는다.

---

## 두 가지 호출 채널

이 스킬은 두 채널을 묶는다. **항상 우선순위가 있는 채널**을 골라 호출하라.

### A. MCP 도구 (이미 등록돼 있다면 우선)

사용자가 `claude mcp add ... tabple ...` 로 Tabple MCP 서버를 등록해 두었다면, 다음 도구가 자동 노출된다 (백엔드 17개):

**프로젝트**
- `mcp__tabple__list_projects` — 내 프로젝트 목록
- `mcp__tabple__get_project_stats` — 통계 (완료율·지연 등)

**태스크**
- `mcp__tabple__get_tasks` — 상태·담당자 필터로 조회
- `mcp__tabple__create_task` — 신규 생성
- `mcp__tabple__update_task` — 부분 수정

**위키 (CRUD 완결)**
- `mcp__tabple__list_pages` — 트리 (계층 구조)
- `mcp__tabple__get_page` — 본문(HTML)
- `mcp__tabple__create_page` — 생성 (TipTap HTML 직접 작성 — PRD/유저플로우/회의록 등)
- `mcp__tabple__update_page` — 수정 (title / content / icon)
- `mcp__tabple__delete_page` — 삭제 (⚠️ 자식 페이지도 cascade 로 함께 삭제)

**PRD (제품 요구사항 문서) — 프로젝트당 1건**
- `mcp__tabple__get_prd` — 조회 (없으면 null)
- `mcp__tabple__update_prd` — 부분 수정 (summary/goal/background/problem/solution/differentiation/category 텍스트 + target_users/scenarios/kpis/risks 객체 배열 + user_roles/platforms 문자열 배열)

**기능명세서 (Feature Spec) — 계층형 3-level**
- `mcp__tabple__list_features` — 요구사항(level=1) / 기능(2) / 상세(3) 트리. `q` 로 제목 검색
- `mcp__tabple__create_feature` — level + title 필수, parent_id 로 트리 연결
- `mcp__tabple__update_feature` — 부분 수정 (parent_id=null → 최상위 이동, story_points 는 피보나치만 1/2/3/5/8/13/21)
- `mcp__tabple__delete_feature` — 삭제 (⚠️ 자식 feature 도 cascade)
- `mcp__tabple__link_feature_task` — 기능 ↔ 태스크 연결 (`action: "link" | "unlink"`)

**MCP 가 커버하는 작업은 무조건 MCP 우선** — 출력이 구조화돼 있고 자동 검증·디스커버리가 붙어 있다. 사용자가 호출 권한 없는 도구(read_only 토큰 등) 만 백엔드가 403 반환.

### B. CLI (`tf`) — MCP 미등록 환경 폴백

백엔드 MCP 가 위키 CRUD 까지 모두 노출되므로 CLI 는 **MCP 가 등록 안 된 환경** (claude.ai 웹 UI 등 일부 호스트, 임시 환경) 의 폴백으로만 의미. composite context 만 캐싱·압축 이점 유지.

| 능력 | 채널 | 이유 |
|---|---|---|
| 프로젝트 **composite context** | `Bash: node ${CLAUDE_SKILL_DIR}/bin/tp.mjs context <id-or-key>` | project + columns + tasks + members + stats + pages 한 번에, 60s 캐시. 분당 30콜 한도 보호 + LLM-친화 카드 |
| 위키 페이지 본문 → **Markdown** | `Bash: node ${CLAUDE_SKILL_DIR}/bin/tp.mjs wiki get <id>` | MCP `get_page` 는 HTML, CLI 는 마크다운 변환해 받는 차이. 마크다운 작업 중이면 CLI 가 편함 |
| 위키 페이지 생성 (MCP 폴백) | `Bash: node ${CLAUDE_SKILL_DIR}/bin/tp.mjs wiki create -p <pid> -t "..." --content "..."` | MCP 미등록 환경 폴백. plain text → `<p>` 자동 wrap |
| 위키 페이지 수정 (MCP 폴백) | `Bash: node ${CLAUDE_SKILL_DIR}/bin/tp.mjs wiki update <id> [-t ...] [-c ...] [--icon ...]` | MCP 미등록 환경 폴백 |
| 위키 페이지 삭제 (MCP 폴백) | `Bash: node ${CLAUDE_SKILL_DIR}/bin/tp.mjs wiki delete <id>` | MCP 미등록 환경 폴백. 자식 cascade — 호출 전 사용자에게 자손 수 안내 |
| 프로젝트 목록 (캐시 없이) | `Bash: node ${CLAUDE_SKILL_DIR}/bin/tp.mjs projects list` | MCP `list_projects` 와 동등 — MCP 미등록 폴백 |

`${CLAUDE_SKILL_DIR}` 은 Claude Code 가 자동으로 스킬 디렉터리 절대경로로 치환한다 (cwd 와 무관하게 동작). 사용자가 `npm link` 했다면 짧게 `tf ...` 로 써도 됨.

---

## 워크플로우 (사용자 의도 → 호출 순서)

### 1. "프로젝트 X 컨텍스트 로드해줘" / "이 프로젝트의 위키랑 보드 가져와줘"

```
Bash: node ${CLAUDE_SKILL_DIR}/bin/tp.mjs context X
```

- X 는 id (정수) 또는 key (예: "PRJ") 또는 정확한 이름.
- 결과는 단일 마크다운 카드: Stats / Columns / Members / Labels / Wiki tree (page id 포함) / Recent Tasks (최근 10개).
- **사용자에게 이 카드를 통째로 인용하지 말고**, 한 단락으로 요약 후 "필요한 위키 페이지 id 만 알려주세요" 라고 좁혀라.

### 2. "위키에서 'OAuth' 같은 키워드 찾아줘"

1. `mcp__tabple__list_pages` (또는 `tf context` 결과의 Wiki Pages 섹션) 에서 제목/icon 으로 후보 추리기
2. 후보가 좁아지면 `node ${CLAUDE_SKILL_DIR}/bin/tp.mjs wiki get <page-id>` 로 본문 가져와 LLM 컨텍스트에 주입

### 3. "위키 페이지 N 본문 보여줘"

```
Bash: node ${CLAUDE_SKILL_DIR}/bin/tp.mjs wiki get N
```

본문은 LLM-친화 Markdown. 표·코드블록·링크·체크리스트 유지. 미지원 노드 (mermaid/figma embed 등) 는 url 이나 placeholder 로 degrade — LLM 이 "이 페이지에 mermaid 다이어그램이 있지만 본문에는 포함 안 됨" 같은 식으로 사용자에게 안내해야 한다.

### 4. "프로젝트 X 의 태스크 목록 / 상세"

MCP 가 있으면 `mcp__tabple__get_tasks` 사용. 없으면 `tf context X` 의 Recent Tasks 테이블 + 더 필요하면 `... context X --recent 50`.

### 5. "X 프로젝트에 '로그인 버그 수정' 태스크 만들어줘"

MCP 의 `mcp__tabple__create_task` 호출. 호출 전 사용자에게:
- 어떤 컬럼(상태) 에 넣을지
- 우선순위 / 담당자 / 기한이 필요한지

확인. 컬럼 id 모르면 먼저 `tf context X` 로 컬럼 목록 확인.

### 6. "이 태스크 상태 In Progress 로 바꿔"

`mcp__tabple__update_task` 호출. task id 모르면 `tf context X` 의 Recent Tasks 에서 찾는다.

### 6.5 "프로젝트 X 에 PRD / 유저플로우 / 기능명세 만들어줘"

PRD 와 기능명세는 **전용 MCP 도구**가 있어 위키 페이지가 아닌 구조화된 데이터로 저장됨. 유저플로우/회의록 같은 자유 형식은 위키 페이지로 작성.

**PRD (제품 요구사항 문서) — 프로젝트당 1건, 구조화된 필드**
```
mcp__tabple__update_prd({
  project_id: 42,
  summary: "...",
  goal: "...",
  background: "...",
  problem: "...",
  solution: "...",
  target_users: [{ name: "...", description: "..." }, ...],
  scenarios: [{ title: "...", description: "..." }, ...],
  kpis: [{ name: "...", target: "..." }, ...],
  risks: [{ description: "...", mitigation: "..." }, ...],
  user_roles: ["admin", "member"],
  platforms: ["web", "macOS"],
})
```
없으면 자동 생성, 있으면 지정 필드만 부분 갱신. 조회는 `mcp__tabple__get_prd({ project_id })`.

**기능명세서 — 계층형 3-level 트리**
```
// 요구사항 (level 1, root)
const req = await mcp__tabple__create_feature({
  project_id: 42, level: 1, title: "그룹 DM",
});
// 기능 (level 2, 자식)
const feat = await mcp__tabple__create_feature({
  project_id: 42, level: 2, title: "멤버 관리", parent_id: req.id,
});
// 상세 (level 3)
await mcp__tabple__create_feature({
  project_id: 42, level: 3, title: "멤버 추가/제거", parent_id: feat.id,
  story_points: 5, // 피보나치 1/2/3/5/8/13/21 만
});
```
기능 ↔ 보드 태스크 연결은 `mcp__tabple__link_feature_task({ task_id, feature_id, action: "link" })`.

**유저플로우 / 회의록 / 자유 형식 페이지** — 위키 페이지로 저장
1. `mcp__tabple__list_projects` 로 projectId 확인
2. 본문 HTML 초안 작성 — TipTap 호환. 백엔드 `WIKI_BLOCK_GUIDE` 가 callout / toggle / 2-3열 columns /
   체크리스트 / 코드블록 / 표 / mermaid / math 슬래시 블록 활용 권장. 단조로운 단락 나열 피하기:
   - **유저플로우**: mermaid 코드블록 `flowchart TD` + 진입점 → 단계 → 분기 → 종료
   - **회의록**: 참석자 체크리스트 + 안건 / 결정사항 / 액션 아이템 분리
3. `mcp__tabple__create_page({ project_id, title, icon, content, parent_id })` 호출
4. 응답의 새 page id 를 사용자에게 안내. 후속 편집은 `mcp__tabple__update_page`.

**MCP 미등록 환경 폴백** — Claude Code 가 MCP 도구를 못 보면 위키만 CLI 사용 가능 (PRD/Feature 도구는 CLI 미구현):
```
Bash: node ${CLAUDE_SKILL_DIR}/bin/tp.mjs wiki create -p 42 -t "유저플로우: 그룹 DM" --content "<h1>...</h1>..."
```

### 7. "내 모든 프로젝트에서 Y 와 관련된 거 찾아줘"

1. `mcp__tabple__list_projects` (또는 `node ${CLAUDE_SKILL_DIR}/bin/tp.mjs projects list`)
2. 각 프로젝트별로 `tf context <id>` — Wiki Pages 트리와 Recent Tasks 에서 Y 매칭
3. 후보 좁힌 뒤 위키는 `tf wiki get`, 태스크는 MCP `get_tasks` 로 깊이 들어감

**주의**: 프로젝트가 많으면 한 번에 다 도는 대신 "어느 프로젝트부터 볼지" 사용자에게 묻거나, 최근 활성 N 개만 우선 본다.

---

## 출력 가이드

- `tf context` 의 결과 표는 **그대로 사용자에게 보여줄 가치가 있다** (한국어 헤더, 짧음). 다만 매번 통째로 인용하면 길어지니, "5개 컬럼 · 위키 12 페이지 · 진행 중 7 / 완료 23 ..." 식으로 핵심만 압축해 보여주고 카드 자체는 LLM 컨텍스트에 보관.
- `tf wiki get` 의 결과는 가공 없이 그대로 컨텍스트에 둔다. 사용자에게는 페이지 제목 + 1-2 줄 요약만 먼저 제시.
- MCP 도구 결과는 raw JSON 이라 사용자에게 그대로 던지지 말 것 — 표 또는 불릿으로 재구성.

## 절대 하지 말 것

- `tf context` 를 짧은 간격으로 같은 프로젝트에 반복 호출 (60s 캐시가 있지만 `--no-cache` 남발 금지). 분당 30콜 한도가 빠르게 차면 사용자 다른 호출이 거부된다.
- 태스크 생성/수정 전 사용자 확인 없이 진행. **MCP `create_task`/`update_task` 는 즉시 서버 반영** — 되돌리려면 또 호출 필요.
- 위키 페이지 본문을 LLM 이 직접 새로 작성해 PUT — 본문 편집은 데스크톱 앱의 TipTap 에디터에서. (스킬 범위 밖)

## 트러블슈팅

- `tf: Tabple 토큰이 설정되지 않았습니다` → README "PAT 발급" 단계로 안내.
- `tf: API 401 ...` → 토큰 만료 또는 권한 부족. Tabple Desktop → Settings → MCP 에서 토큰 재발급.
- `tf: API 429 ...` → 분당 한도 초과. 60초 기다린 뒤 재시도 or 캐시된 결과 활용.
- `tf wiki get` 의 결과가 plain HTML 처럼 보인다 → 페이지 본문이 JSON 이 아닌 HTML 로 저장된 경우. 이 경우 본문이 그대로 출력되는 게 정상 (degrade path).

---

## 파일 구조

```
.claude/skills/tabple/
├── SKILL.md           # 이 파일
├── AGENTS.md          # 동일 내용 (Cursor/Codex/Gemini 용 미러)
├── README.md          # 설치/PAT 설정 가이드
├── package.json
├── bin/tp.mjs         # CLI entry
├── lib/
│   ├── api.mjs        # REST fetch + Bearer
│   ├── config.mjs     # TABPLE_TOKEN / ~/.tabple/config.json
│   ├── cache.mjs      # ~/.tabple/cache/*.json (TTL 60s)
│   ├── tiptap-md.mjs  # TipTap JSON → Markdown
│   └── render.mjs     # 컨텍스트 카드 포맷
└── test/tiptap-md.test.mjs   # node --test
```
