# Tabple Claude Code Skill

Tabple (<https://tabple.com>) 의 프로젝트·위키·보드를 **Claude Code** (및 다른 LLM 코드 에이전트) 에서 컨텍스트로 활용하게 해주는 스킬 패키지.

> **상태**: 내부 dogfooding (Tabple-Desktop 리포 안에서 직접 사용). 검증 후 별도 공개 GitHub repo 로 미러 예정.

---

## 무엇을 할 수 있나

- "프로젝트 X 컨텍스트 로드해줘" → Claude 가 위키 트리·보드 컬럼·최근 태스크 한 카드로 받아옴
- "위키에서 'OAuth' 키워드 찾아 본문 보여줘" → 페이지 검색 + 본문 마크다운으로 변환
- "프로젝트 X 에 '로그인 버그 수정' 태스크 만들어줘" → MCP 도구로 즉시 생성
- "내 모든 프로젝트에서 Y 관련된 거 찾아줘" → 다중 프로젝트 교차

스킬 동작 규약은 [SKILL.md](SKILL.md) 참고.

---

## 설치

### 1. PAT 발급

1. Tabple Desktop 앱 실행 → **Settings → MCP**
2. "새 토큰 발급" 클릭 → 토큰 복사 (`tf_xxxxxxxx` 형태)

### 2. 인증 정보 저장 (둘 중 하나)

#### 옵션 A — 환경변수 (권장, 셸별)

```bash
echo 'export TABPLE_TOKEN=tf_xxxxxxxx' >> ~/.zshrc   # 또는 ~/.bashrc
source ~/.zshrc
```

#### 옵션 B — 설정 파일 (전역, 멀티 셸)

```bash
mkdir -p ~/.tabple
cat > ~/.tabple/config.json <<'EOF'
{
  "token": "tf_xxxxxxxx"
}
EOF
chmod 600 ~/.tabple/config.json
```

### 3. (선행) 토큰 호환성 확인 — **블로커 spike**

이 스킬의 CLI 는 **읽기**를 REST 엔드포인트 (`/api/projects` 등) 로 직접 호출한다. 백엔드는 PAT 를 MCP 엔드포인트와
이 CLI 가 읽는 GET 6곳(`/api/projects` · `/api/projects/:id` · `/stats` · `/members` · `/api/pages` · `/api/pages/:id`)에서만
받는다. 위키 **쓰기**(`tp wiki create/update/delete`)는 REST 가 아니라 MCP 엔드포인트(`/api/mcp`)의 같은 도구를 부른다 —
그래서 MCP 와 같은 조건(Pro · Pro 일회성 결제, 읽기 전용 토큰은 거절)이다. **한 번 확인:**

```bash
curl -sS -H "Authorization: Bearer $TABPLE_TOKEN" \
  https://tabple.com/api/projects | head -c 200
```

- 정상: JSON 응답 (프로젝트 배열)
- 실패: `401 Unauthorized` → 토큰이 만료·폐기됐거나 잘못 복사됐다. Settings → MCP 에서 다시 발급.

### 4. Claude Code 에 스킬 등록

이 디렉터리(`.claude/skills/tabple/`)는 이미 본 리포 안에 있다. Claude Code 가 자동으로 발견한다.

**다른 리포에서도 쓰고 싶다면** (또는 전역 등록):

```bash
# 심볼릭 링크 (이 리포 변경이 즉시 반영)
ln -s "$(pwd)/.claude/skills/tabple" ~/.claude/skills/tabple

# 또는 복사 (고정 스냅샷)
cp -r .claude/skills/tabple ~/.claude/skills/tabple
```

### 5. (선택, 권장) MCP 서버도 함께 등록

CLI 는 MCP 가 못 하는 두 가지 (`tp context`, `tp wiki get`) 만 다룬다. 나머지 (태스크 CRUD, 프로젝트 stats 등) 는 MCP 도구가 처리하면 가장 깔끔하다.

```bash
claude mcp add --transport http tabple \
  https://tabple.com/api/mcp \
  --header "Authorization: Bearer $TABPLE_TOKEN"
```

확인:

```bash
claude mcp list   # tabple 가 보이면 OK
```

### 6. 검증

**셸에서 직접 실행** (Tabple-Desktop 리포 루트 기준):

```bash
node .claude/skills/tabple/bin/tp.mjs projects list
# → 내 프로젝트 표가 출력되면 성공
```

전역 설치 (`~/.claude/skills/tabple/`) 했다면:

```bash
node ~/.claude/skills/tabple/bin/tp.mjs projects list
```

이어서:

```bash
... bin/tp.mjs context <id-or-key>
# → 프로젝트 컨텍스트 카드 출력. 60초 안에 재실행하면 (cache hit) 메시지 → 캐시 동작 확인.

... bin/tp.mjs wiki get <page-id>
# → 위키 본문 Markdown.
```

**Claude Code 세션에서**:

```text
/tabple projects list                  # 직접 호출 (인자 그대로 CLI 로)
/tabple context PRJ                    # composite 컨텍스트
"tabple 스킬로 프로젝트 PRJ 컨텍스트 로드해줘"   # 자연어 — 같은 결과
```

`SKILL.md` 의 `argument-hint` 가 `/tabple` 입력 시 자동완성 힌트를 띄운다.

---

## 명령 레퍼런스

```text
tp context <project-id-or-key>      프로젝트 컨텍스트 카드 (60s 캐시)
tp wiki get <page-id>               위키 페이지 본문 → Markdown
tp projects list                    내 프로젝트 목록 (캐시 없음)

옵션:
  --no-cache         캐시 무시
  --json             JSON 으로 출력 (디버그)
  --recent <n>       context 의 최근 태스크 개수 (기본 10)
  --include-hidden   트리에서 가려진 페이지 (PageList 인라인) 포함

환경변수:
  TABPLE_TOKEN     PAT
  TABPLE_BASE_URL  기본 https://tabple.com (셀프호스팅용)
```

---

## 다른 에이전트에서 쓰기

이 스킬은 Claude Code 포맷이지만 핵심 자산은 두 가지뿐:

1. **워크플로우 규약** — [AGENTS.md](AGENTS.md) (SKILL.md 미러). Cursor/Codex CLI/Gemini 의 시스템 프롬프트나 `AGENTS.md` 슬롯에 그대로 붙이면 같은 규약으로 동작.
2. **CLI** — `bin/tp.mjs` 는 표준 Node 20+ 스크립트. 어떤 에이전트 환경에서든 `node` 가 있으면 호출 가능.

추가로 MCP 서버 (`/api/mcp`) 자체는 Claude Desktop / Claude Code / Cursor / Codex / Gemini / VS Code 모두 네이티브 지원. Tabple Desktop 의 Settings → MCP 화면이 각 클라이언트별 설정 스니펫을 제공한다.

---

## 개발

```bash
cd .claude/skills/tabple
npm test         # tiptap-md 회귀 테스트 (node --test)
```

`src/lib/markdown/markdownUtils.ts` 가 변경되면 `lib/tiptap-md.mjs` 도 같이 업데이트할 것 (그리고 새 케이스를 `test/tiptap-md.test.mjs` 에 추가).

---

## 알려진 제약

- **위키 검색 전용 엔드포인트 없음**: 현재는 `list_pages` (MCP) 또는 `tp context` 의 페이지 트리를 LLM 이 grep 하는 방식. 백엔드에 `search_pages` 추가되면 SKILL.md 워크플로우 갱신 예정.
- **태스크 검색 키워드**: MCP `get_tasks` 가 키워드 검색을 지원하지 않으면 클라이언트 측 필터에 의존. 큰 프로젝트에서는 페이지네이션 필요.
- **TipTap 노드 커버리지**: table·codeBlock·체크리스트·링크·이미지·헤딩은 마크다운으로 완전 변환. mermaid/figma/drawio 등 임베드 노드는 url 또는 placeholder 로 degrade.
- **분당 30콜 한도**: `tp context` 의 60s 캐시가 1차 방어선. 사용자가 여러 프로젝트를 빠르게 도는 워크플로우는 LLM 측에서 천천히 진행.

---

## 라이선스

내부 dogfooding 단계. 공개 시 라이선스 결정.
