# Tabple Claude Code Skill

[Tabple](https://tabple.com) 의 프로젝트·위키·태스크를 Claude Code 같은 LLM 코드 에이전트가 작업 컨텍스트로 쓸 수 있게 해 주는 스킬 패키지입니다.

프로젝트 구성과 위키 본문을 가져와 작업 컨텍스트로 쓰고, 이어서 태스크와 위키 페이지를 만들거나 고칠 수도 있습니다. Tabple 계정의 개인 액세스 토큰(PAT)으로 접근하며, 토큰 소유자가 볼 수 있는 프로젝트만 다룹니다.

## 목차

- [주요 기능](#주요-기능)
- [설치](#설치)
- [설정](#설정)
- [사용법](#사용법)
- [접근 범위](#접근-범위)
- [개발](#개발)
- [프로젝트 구조](#프로젝트-구조)
- [문서](#문서)
- [기여와 릴리스](#기여와-릴리스)
- [라이선스](#라이선스)

## 주요 기능

- **프로젝트 컨텍스트 로드**: 프로젝트 기본 정보, 컬럼, 멤버, 통계, 위키 트리, 최근 태스크를 한 번에 가져옵니다 (`tp context`, 60초 캐시).
- **위키 본문 읽기**: 페이지 본문을 Markdown 으로 변환해 가져옵니다 (`tp wiki get`).
- **MCP 도구**: 태스크, 위키, PRD, 기능명세를 조회하고 만들거나 고치는 도구 17개가 있습니다 (MCP 서버를 등록하면).
- **위키 쓰기**: 페이지를 만들고, 고치고, 지웁니다. CLI 와 MCP 가 같은 도구를 호출합니다.
- **프로젝트 목록**: 내 프로젝트를 나열해 여러 프로젝트를 훑을 때 출발점으로 씁니다 (`tp projects list`).

## 설치

요구 사항: Node.js 20 이상 (`skills/tabple/package.json` 의 `engines`).

### 방법 1. 플러그인 마켓플레이스 (권장)

Claude Code 에서 다음 명령을 실행합니다.

```text
/plugin marketplace add shing100/tabple-claude-skill
/plugin install tabple@tabple-claude-skill
```

마켓플레이스 이름은 `tabple-claude-skill`, 플러그인 이름은 `tabple` 입니다 (`.claude-plugin/marketplace.json`).

### 방법 2. 파일 직접 복사

```bash
git clone https://github.com/shing100/tabple-claude-skill.git
mkdir -p ~/.claude/skills
cp -r tabple-claude-skill/skills/tabple ~/.claude/skills/tabple
```

복사 대신 심볼릭 링크(`ln -s "$(pwd)/tabple-claude-skill/skills/tabple" ~/.claude/skills/tabple`)를 쓰면 저장소를 갱신할 때 스킬도 함께 바뀝니다.

Tabple 데스크탑 앱을 쓰고 있다면 설정 화면의 Claude Code 스킬 항목에서 버튼을 눌러 설치할 수도 있습니다.

### 설치 확인

토큰을 설정한 뒤(아래 [설정](#설정)) 다음을 실행합니다. 내 프로젝트 표가 나오면 성공입니다.

```bash
node ~/.claude/skills/tabple/bin/tp.mjs projects list
```

플러그인으로 설치했다면 Claude Code 에서 `/tabple projects list` 로 확인합니다.

## 설정

### 1. 토큰 발급

1. Tabple 데스크탑 앱에서 **Settings → MCP** 화면을 엽니다.
2. **새 토큰 발급**을 누르고 표시된 토큰을 복사합니다.

자세한 단계는 [skills/tabple/README.md](skills/tabple/README.md) 에 있습니다. 토큰은 비밀 값이므로 저장소나 공유 화면에 올리지 않습니다.

### 2. 환경 변수 또는 설정 파일

| 이름 | 용도 | 기본값 |
|---|---|---|
| `TABPLE_TOKEN` | 개인 액세스 토큰 (필수) | 없음 |
| `TABPLE_BASE_URL` | API 주소 (셀프호스팅용) | `https://tabple.com` |

두 변수 모두 이전 이름(`TASKFLOW_TOKEN`, `TASKFLOW_BASE_URL`)도 읽습니다. 환경 변수 값이 있으면 설정 파일보다 우선합니다.

설정 파일 `~/.tabple/config.json` 에는 `token`(필수)과 `baseUrl`(선택) 키를 적습니다. 이 파일이 없으면 이전 경로 `~/.taskflow/config.json` 을 읽습니다.

환경 변수로 설정하는 예:

```bash
echo 'export TABPLE_TOKEN="<발급받은 토큰>"' >> ~/.zshrc   # 또는 ~/.bashrc
source ~/.zshrc
```

설정 파일로 설정하는 예:

```bash
mkdir -p ~/.tabple
cat > ~/.tabple/config.json <<'EOF'
{
  "token": "<발급받은 토큰>"
}
EOF
chmod 600 ~/.tabple/config.json
```

> `TABPLE_BASE_URL` 을 바꾸면 토큰을 그 주소로 보냅니다. 신뢰하는 주소만 지정하세요.

### 3. MCP 서버 등록 (선택, 권장)

CLI 는 `context`, `wiki get`, 위키 쓰기, `projects list` 만 다룹니다. 태스크와 PRD·기능명세는 MCP 도구로 다루는 편이 깔끔합니다.

```bash
claude mcp add --transport http tabple https://tabple.com/api/mcp \
  --header "Authorization: Bearer $TABPLE_TOKEN"
claude mcp list   # tabple 이 보이면 등록 완료
```

셸이 `$TABPLE_TOKEN` 을 펼쳐서 넘기므로 토큰 값이 MCP 등록 정보에 남습니다. 설정 파일을 공유하지 마세요. 서버 이름을 `tabple` 로 등록하면 도구 이름 접두사가 `mcp__tabple__` 가 됩니다.

## 사용법

### 슬래시 명령과 자연어

```text
/tabple projects list
/tabple context <프로젝트 id 또는 key>
/tabple wiki get <페이지 id>
```

인자는 그대로 CLI 에 넘기고, 인자 없이 `/tabple` 만 입력하면 무엇이 필요한지 묻습니다. "프로젝트 X 컨텍스트 로드해줘", "위키에서 Y 찾아줘", "X 프로젝트에 태스크 만들어줘" 같은 요청에도 Claude 가 이 스킬을 자동으로 사용합니다.

### CLI 명령 (`tp`)

| 명령 | 설명 |
|---|---|
| `tp context <id-or-key>` | 프로젝트 컨텍스트 카드 (60초 캐시) |
| `tp wiki get <page-id>` | 위키 페이지 본문을 Markdown 으로 |
| `tp wiki create -p <project-id> -t <제목> [-c <본문>] [--parent <page-id>] [--icon <이모지>]` | 위키 페이지 생성 |
| `tp wiki update <page-id> [-t <제목>] [-c <본문>] [--icon <이모지>]` | 위키 페이지 수정 |
| `tp wiki delete <page-id>` | 위키 페이지 삭제 (확인 없이 즉시 지우며, 하위 페이지도 함께 지움) |
| `tp projects list` | 내 프로젝트 목록 (캐시 없음) |

옵션: `--no-cache` (캐시 무시), `--json` (JSON 출력), `--recent <n>` (최근 태스크 개수, 기본 10), `--include-hidden` (트리에서 가려진 페이지 포함).

`-c` 본문은 기본적으로 plain text 로 취급해 문단마다 `<p>` 로 감쌉니다. `<` 나 `{` 로 시작하면 HTML 또는 JSON 으로 그대로 보냅니다. 전체 도움말은 `node skills/tabple/bin/tp.mjs --help` 로 볼 수 있습니다. `skills/tabple` 에서 `npm link` 를 실행하면 `tp` 명령으로 쓸 수 있습니다.

### MCP 도구

MCP 서버를 `tabple` 로 등록하면 다음 도구를 쓸 수 있습니다.

- **프로젝트**: `mcp__tabple__list_projects`, `mcp__tabple__get_project_stats`
- **태스크**: `mcp__tabple__get_tasks`, `mcp__tabple__create_task`, `mcp__tabple__update_task`
- **위키**: `mcp__tabple__list_pages`, `mcp__tabple__get_page` (본문은 HTML), `mcp__tabple__create_page`, `mcp__tabple__update_page`, `mcp__tabple__delete_page`
- **PRD** (프로젝트당 1건): `mcp__tabple__get_prd`, `mcp__tabple__update_prd`
- **기능명세**: `mcp__tabple__list_features`, `mcp__tabple__create_feature`, `mcp__tabple__update_feature`, `mcp__tabple__delete_feature`, `mcp__tabple__link_feature_task`

태스크 생성·수정과 위키 쓰기는 서버에 즉시 반영됩니다. 되돌리려면 반대 동작을 다시 호출해야 합니다. `delete_page` 는 하위 페이지도 함께 지웁니다.

## 접근 범위

**할 수 있는 것**

- 토큰 소유자가 볼 수 있는 프로젝트의 목록, 상세, 컬럼, 태스크, 멤버, 통계, 위키 트리와 페이지 본문을 읽습니다.
- 위키 페이지를 만들고, 고치고, 지웁니다 (CLI 와 MCP 모두).
- MCP 를 등록하면 태스크 생성·수정, PRD·기능명세 편집도 합니다.

**할 수 없는 것과 주의할 점**

- 토큰 소유자가 볼 수 없는 프로젝트와 페이지는 다룰 수 없습니다. 권한은 토큰 소유자의 계정을 따릅니다.
- 읽기 전용 토큰으로는 쓰기 요청을 서버가 거절합니다. 위키 쓰기는 MCP 와 같은 요금제 조건을 따릅니다.
- 위키 검색 전용 API 는 없고, 태스크 키워드 검색은 클라이언트에서 걸러 내는 방식입니다. 큰 프로젝트에서는 페이지네이션이 필요할 수 있습니다.
- 위키 본문은 표, 코드, 체크리스트, 링크, 이미지, 제목을 Markdown 으로 옮깁니다. mermaid, Figma, draw.io 같은 임베드 블록은 주소나 자리표시 문구만 남습니다.
- 서버에는 호출 한도가 있습니다. 429 응답이 오면 잠시 뒤에 다시 시도합니다.
- 요청은 `TABPLE_BASE_URL`(기본 `https://tabple.com`)로만 보냅니다. 토큰은 환경 변수나 `~/.tabple/config.json` 에서 읽습니다.
- `context` 결과는 `~/.tabple/cache/` 에 JSON 파일로 저장되며, 60초가 지나도 자동으로 지워지지 않습니다. 공용 기기에서는 이 디렉터리를 직접 지워야 합니다.

## 개발

```bash
cd skills/tabple
npm test   # Markdown 변환 테스트 (node:test, 12건)
```

Node.js 20 이상이 필요합니다. 이 패키지에는 린트나 타입 체크 스크립트가 없습니다. 네트워크 없이 확인하려면 `node skills/tabple/bin/tp.mjs --help` 를 실행하세요.

## 프로젝트 구조

- `.claude-plugin/` — 마켓플레이스(`marketplace.json`)와 플러그인(`plugin.json`) 매니페스트
- `skills/tabple/` — 스킬 본체
  - `SKILL.md` — Claude 가 따르는 동작 규약 (`AGENTS.md` 는 다른 코드 에이전트용 미러)
  - `bin/tp.mjs` — CLI 진입점 (이전 이름 `bin/tf.mjs` 로 실행하는 경우를 위해 `tp.mjs` 를 그대로 실행)
  - `lib/` — API 클라이언트, 설정, 캐시, 렌더링, TipTap 에서 Markdown 으로의 변환
  - `test/` — 변환기 테스트

## 문서

- [skills/tabple/README.md](skills/tabple/README.md) — 토큰 발급과 설정 단계별 안내
- [skills/tabple/SKILL.md](skills/tabple/SKILL.md) — 스킬 동작 규약 (Claude 용)
- [skills/tabple/AGENTS.md](skills/tabple/AGENTS.md) — 다른 코드 에이전트용 규약

## 기여와 릴리스

이 저장소에는 기여 가이드나 릴리스 절차 문서가 아직 없습니다. 버전은 `.claude-plugin/marketplace.json`, `.claude-plugin/plugin.json`, `skills/tabple/package.json` 세 곳에 적혀 있습니다. 현재 값은 `0.2.1` 입니다.

## 라이선스

MIT License. Copyright (c) 2026 Geun, Lim.

전문은 [LICENSE](LICENSE) 파일을 참고하세요.
