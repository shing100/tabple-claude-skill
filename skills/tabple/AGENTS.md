# Tabple Agent Guide (non-Claude-Code agents)

이 파일은 [SKILL.md](SKILL.md) 의 미러로, **Cursor / Codex CLI / Gemini CLI / VS Code Copilot Agent** 같이 Claude Code skill 포맷을 모르는 에이전트들이 같은 워크플로우 규약으로 동작하도록 한다.

Claude Code 사용자는 SKILL.md 가 자동으로 발동된다 — 이 파일은 무시해도 된다.

---

## 환경 변수

이 파일을 시스템 프롬프트 / 작업 디렉터리 컨텍스트로 주입한 뒤 다음 변수를 정의해두면 워크플로우의 모든 명령이 즉시 작동한다:

```bash
export TABPLE_SKILL_DIR="/absolute/path/to/.claude/skills/tabple"
export TABPLE_TOKEN="tf_xxxxxxxx"   # Tabple Desktop → Settings → MCP 에서 발급
```

이후 `$TABPLE_SKILL_DIR` 가 Claude Code 의 `${CLAUDE_SKILL_DIR}` 자리를 대신한다.

---

## 두 가지 호출 채널

### A. MCP 도구 (가능하면 우선)

Cursor / Codex / Gemini / Claude Code 모두 MCP 를 네이티브 지원한다. Tabple Desktop → Settings → MCP 화면이 각 클라이언트별 설정 스니펫을 제공한다. 등록 후 다음 도구가 자동 노출:

- `tabple.list_projects`
- `tabple.get_tasks`
- `tabple.create_task`
- `tabple.update_task`
- `tabple.list_pages`
- `tabple.get_project_stats`

(Claude Code 에서는 `mcp__tabple__*` 접두사로 노출)

**MCP 가 커버하는 작업은 무조건 MCP 우선** — 구조화돼 있고 자동 검증·디스커버리가 붙어 있다.

### B. CLI (`tp`) — MCP 가 못 하는 두 가지만

| 능력 | 명령 | 이유 |
|---|---|---|
| 위키 페이지 **본문** → Markdown | `node $TABPLE_SKILL_DIR/bin/tp.mjs wiki get <id>` | MCP `list_pages` 는 트리만, 본문 fetch 도구 미제공 |
| 프로젝트 **composite context** (project + columns + tasks + members + stats + pages 한 번에, 60s 캐시) | `node $TABPLE_SKILL_DIR/bin/tp.mjs context <id-or-key>` | 분당 30콜 한도 보호 + LLM-친화 카드 포맷 |
| 프로젝트 목록 (MCP 미등록 폴백) | `node $TABPLE_SKILL_DIR/bin/tp.mjs projects list` | MCP `list_projects` 와 동등 |

`npm link` 했다면 짧게 `tp ...` 로 써도 됨.

---

## 워크플로우 (사용자 의도 → 호출 순서)

### 1. "프로젝트 X 컨텍스트 로드해줘"

```bash
node $TABPLE_SKILL_DIR/bin/tp.mjs context X
```

X 는 id (정수) / key ("PRJ") / 정확한 이름. 결과는 Stats · Columns · Members · Labels · Wiki tree · Recent Tasks 카드. 사용자에게는 한 단락 요약 후 카드 자체는 컨텍스트에 보관.

### 2. "위키에서 'OAuth' 같은 키워드 찾아줘"

1. MCP `list_pages` (또는 `tp context` 결과의 Wiki Pages 섹션) 에서 제목/icon 으로 후보 추리기
2. 후보가 좁아지면 `tp wiki get <page-id>` 로 본문 가져와 컨텍스트에 주입

### 3. "위키 페이지 N 본문 보여줘"

```bash
node $TABPLE_SKILL_DIR/bin/tp.mjs wiki get N
```

LLM-친화 Markdown. 표·코드블록·링크·체크리스트 유지. 미지원 노드 (mermaid/figma embed 등) 는 placeholder 로 degrade — 사용자에게 누락 안내.

### 4. "태스크 목록/상세"

MCP `get_tasks` 사용. MCP 미등록이면 `tp context X` 의 Recent Tasks + `... --recent 50`.

### 5. "태스크 생성/수정"

MCP `create_task` / `update_task`. 호출 전 사용자에게 컬럼·우선순위·담당자·기한 확인. **즉시 서버 반영** — 되돌리려면 또 호출 필요.

### 6. "내 모든 프로젝트에서 Y 와 관련된 거"

1. MCP `list_projects` (또는 `tp projects list`)
2. 각 프로젝트별 `tp context <id>` — Wiki tree 와 Recent Tasks 에서 Y 매칭
3. 좁힌 뒤 위키는 `tp wiki get`, 태스크는 MCP `get_tasks`

프로젝트 많으면 사용자에게 "어느 것부터 볼지" 물어 좁힌다.

---

## 출력 가이드

- `tp context` 결과 표는 사용자에게 통째로 인용하지 말고 한 단락 요약, 카드는 컨텍스트에 보관.
- `tp wiki get` 결과는 가공 없이 컨텍스트에 두고 사용자에게는 제목 + 1-2줄 요약만 먼저 제시.
- MCP 도구 결과는 raw JSON — 표/불릿으로 재구성해 보여주기.

## 절대 하지 말 것

- 같은 `tp context` 짧은 간격 반복 호출 (60s 캐시가 1차 방어선, `--no-cache` 남발 금지). 분당 30콜 한도.
- 태스크 생성/수정 전 사용자 확인 없이 진행. **MCP create/update 는 즉시 서버 반영**.
- 위키 본문을 LLM 이 새로 작성해 PUT 금지 — 본문 편집은 Tabple Desktop 에디터에서.

## 트러블슈팅

- `tp: Tabple 토큰이 설정되지 않았습니다` → README "PAT 발급" 단계.
- `API 401` → 토큰 만료/권한 부족. Settings → MCP 에서 재발급.
- `API 429` → 분당 한도 초과. 60초 대기 또는 캐시된 결과 활용.
- `tp wiki get` 결과가 HTML 처럼 보인다 → 페이지 본문이 JSON 이 아닌 HTML 로 저장된 경우 (degrade path, 정상).
