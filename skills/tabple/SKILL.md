---
name: tabple
description: Load Tabple project context (wiki + board) and CRUD tasks for any LLM coding session. Use when the user mentions Tabple, promstack, 프롬스택, 프로젝트 컨텍스트, 위키 페이지, 보드, 태스크 — or asks "load context from project X" / "wiki 에서 Y 찾아줘" / "태스크 만들어줘".
argument-hint: "[context <id-or-key> | wiki get <page-id> | projects list]"
allowed-tools: Bash(node *)
---

# Tabple Skill

Tabple (https://tabple.com) 의 프로젝트·위키·보드를 LLM 코드 에이전트가 컨텍스트로 활용하도록 돕는 스킬.

**전제**: 사용자가 PAT 를 발급해 `TABPLE_TOKEN` 환경변수 또는 `~/.tabple/config.json` 에 저장해 둠. 미설정 시 CLI 실행이 즉시 친절한 에러로 안내한다. README.md 참고.

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

사용자가 `claude mcp add ... tabple ...` 로 Tabple MCP 서버를 등록해 두었다면, 다음 도구가 자동 노출된다:

- `mcp__tabple__list_projects`
- `mcp__tabple__get_tasks`
- `mcp__tabple__create_task`
- `mcp__tabple__update_task`
- `mcp__tabple__list_pages`
- `mcp__tabple__get_project_stats`

**MCP 가 커버하는 작업은 무조건 MCP 우선** — 출력이 구조화돼 있고 자동 검증·디스커버리가 붙어 있다.

### B. CLI (`tp`) — MCP 가 못 하는 두 가지만

| 능력 | 채널 | 이유 |
|---|---|---|
| 위키 페이지 **본문** → Markdown | `Bash: node ${CLAUDE_SKILL_DIR}/bin/tp.mjs wiki get <id>` | MCP 의 `list_pages` 는 트리만, 본문 fetch 도구 미제공 |
| 프로젝트 **composite context** (project + columns + tasks + members + stats + pages 한 번에, 60s 캐시) | `Bash: node ${CLAUDE_SKILL_DIR}/bin/tp.mjs context <id-or-key>` | 분당 30콜 한도 보호 + LLM-친화 카드 포맷 |
| 프로젝트 목록 (캐시 없이) | `Bash: node ${CLAUDE_SKILL_DIR}/bin/tp.mjs projects list` | MCP `list_projects` 와 동등 — MCP 미등록 폴백 |

`${CLAUDE_SKILL_DIR}` 은 Claude Code 가 자동으로 스킬 디렉터리 절대경로로 치환한다 (cwd 와 무관하게 동작). 사용자가 `npm link` 했다면 짧게 `tp ...` 로 써도 됨.

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

1. `mcp__tabple__list_pages` (또는 `tp context` 결과의 Wiki Pages 섹션) 에서 제목/icon 으로 후보 추리기
2. 후보가 좁아지면 `node ${CLAUDE_SKILL_DIR}/bin/tp.mjs wiki get <page-id>` 로 본문 가져와 LLM 컨텍스트에 주입

### 3. "위키 페이지 N 본문 보여줘"

```
Bash: node ${CLAUDE_SKILL_DIR}/bin/tp.mjs wiki get N
```

본문은 LLM-친화 Markdown. 표·코드블록·링크·체크리스트 유지. 미지원 노드 (mermaid/figma embed 등) 는 url 이나 placeholder 로 degrade — LLM 이 "이 페이지에 mermaid 다이어그램이 있지만 본문에는 포함 안 됨" 같은 식으로 사용자에게 안내해야 한다.

### 4. "프로젝트 X 의 태스크 목록 / 상세"

MCP 가 있으면 `mcp__tabple__get_tasks` 사용. 없으면 `tp context X` 의 Recent Tasks 테이블 + 더 필요하면 `... context X --recent 50`.

### 5. "X 프로젝트에 '로그인 버그 수정' 태스크 만들어줘"

MCP 의 `mcp__tabple__create_task` 호출. 호출 전 사용자에게:
- 어떤 컬럼(상태) 에 넣을지
- 우선순위 / 담당자 / 기한이 필요한지

확인. 컬럼 id 모르면 먼저 `tp context X` 로 컬럼 목록 확인.

### 6. "이 태스크 상태 In Progress 로 바꿔"

`mcp__tabple__update_task` 호출. task id 모르면 `tp context X` 의 Recent Tasks 에서 찾는다.

### 7. "내 모든 프로젝트에서 Y 와 관련된 거 찾아줘"

1. `mcp__tabple__list_projects` (또는 `node ${CLAUDE_SKILL_DIR}/bin/tp.mjs projects list`)
2. 각 프로젝트별로 `tp context <id>` — Wiki Pages 트리와 Recent Tasks 에서 Y 매칭
3. 후보 좁힌 뒤 위키는 `tp wiki get`, 태스크는 MCP `get_tasks` 로 깊이 들어감

**주의**: 프로젝트가 많으면 한 번에 다 도는 대신 "어느 프로젝트부터 볼지" 사용자에게 묻거나, 최근 활성 N 개만 우선 본다.

---

## 출력 가이드

- `tp context` 의 결과 표는 **그대로 사용자에게 보여줄 가치가 있다** (한국어 헤더, 짧음). 다만 매번 통째로 인용하면 길어지니, "5개 컬럼 · 위키 12 페이지 · 진행 중 7 / 완료 23 ..." 식으로 핵심만 압축해 보여주고 카드 자체는 LLM 컨텍스트에 보관.
- `tp wiki get` 의 결과는 가공 없이 그대로 컨텍스트에 둔다. 사용자에게는 페이지 제목 + 1-2 줄 요약만 먼저 제시.
- MCP 도구 결과는 raw JSON 이라 사용자에게 그대로 던지지 말 것 — 표 또는 불릿으로 재구성.

## 절대 하지 말 것

- `tp context` 를 짧은 간격으로 같은 프로젝트에 반복 호출 (60s 캐시가 있지만 `--no-cache` 남발 금지). 분당 30콜 한도가 빠르게 차면 사용자 다른 호출이 거부된다.
- 태스크 생성/수정 전 사용자 확인 없이 진행. **MCP `create_task`/`update_task` 는 즉시 서버 반영** — 되돌리려면 또 호출 필요.
- 위키 페이지 본문을 LLM 이 직접 새로 작성해 PUT — 본문 편집은 데스크톱 앱의 TipTap 에디터에서. (스킬 범위 밖)

## 트러블슈팅

- `tp: Tabple 토큰이 설정되지 않았습니다` → README "PAT 발급" 단계로 안내.
- `tp: API 401 ...` → 토큰 만료 또는 권한 부족. Tabple Desktop → Settings → MCP 에서 토큰 재발급.
- `tp: API 429 ...` → 분당 한도 초과. 60초 기다린 뒤 재시도 or 캐시된 결과 활용.
- `tp wiki get` 의 결과가 plain HTML 처럼 보인다 → 페이지 본문이 JSON 이 아닌 HTML 로 저장된 경우. 이 경우 본문이 그대로 출력되는 게 정상 (degrade path).

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
