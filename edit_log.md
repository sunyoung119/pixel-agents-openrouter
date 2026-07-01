# 작업 인수인계 문서 (edit_log.md)

> 이 문서는 **다른 모델/사람이 컨텍스트 없이 작업을 이어받기 위한 핸드오프 노트**입니다.
> 지금까지 이 세션에서 한 **모든 변경(소스 코드 + 시스템 상태)** 과 재현/검증/되돌리기 방법을 담고 있습니다.
> 작성: 2026-06-25 · 최종 업데이트: 2026-06-25 (데모 에이전트 운영 중 확인된 동작 — 토큰 회전 401 / "known" 세션 / 하트비트 필요성 추가, 5-B 참조).

---

## 0. 한 줄 요약

`pixel-agents` 프로젝트를 빌드/실행하고, **서버 측 도구 상태 라벨 문구(`formatToolStatus`)를 영어→한국어로 1곳 수정**했다.
그 외에는 전부 빌드 산출물·로컬 실행 상태·데모용 가짜 에이전트(휘발성)일 뿐, **영구적인 소스 변경은 단 1개 파일**이다.

---

## 1. 프로젝트 위치 / 환경

- **실제 프로젝트 루트(중첩 주의)**: `C:\Users\USER\Desktop\pixel-agents-main\pixel-agents-main\`
  (바깥 폴더 `...\pixel-agents-main\` 는 이 하위 폴더 하나만 담고 있음)
- **Git**: 이 폴더는 git 저장소가 **아님**. 따라서 변경 이력 추적이 없고, 이 `edit_log.md`가 사실상 유일한 변경 기록이다.
- **OS**: Windows 11, 셸은 PowerShell(주) + Bash 사용 가능
- **Node / npm**: `v22.20.0` / `10.9.3`
  - 주의: `@asyncapi/cli`(node≥24 요구)는 EBADENGINE 경고가 뜨지만, 우리가 쓰는 코드 생성은 `@asyncapi/modelina`라 node 22에서 정상 동작함.
- **무엇을 하는 프로젝트인가**: Claude Code 터미널 세션을 픽셀아트 사무실의 애니메이션 캐릭터로 시각화하는 도구.
  VS Code 익스텐션 + `npx pixel-agents` standalone CLI 두 형태. 상세 구조는 루트 `CLAUDE.md` 참조.
  - 4-패키지 모노레포: `core/`(프로토콜) → `server/`(Fastify 런타임) → `adapters/vscode/`, `webview-ui/`(React+Canvas UI)

---

## 2. 소스 코드 변경 (영구적 — 단 1건)

### 파일: `server/src/providers/hook/claude/claude.ts` 의 `formatToolStatus()` 함수

도구 실행 상태를 캐릭터 머리 위 라벨 텍스트로 만드는 함수. **표시 문구(따옴표/백틱 안 텍스트)만** 한국어로 교체했고,
함수 구조·`switch`·변수명(`inp`, `base`, `cmd`, `desc`, `teamName`, `recipient`)·slice 잘라내기 로직·`'…'`·import는 **전혀 변경하지 않음**.

#### 변경 전 → 변경 후 매핑

| case | 변경 전(영어) | 변경 후(한국어) |
|---|---|---|
| Read | `Reading ${base(inp.file_path)}` | `${base(inp.file_path)} 읽는 중` |
| Edit | `Editing ${base(inp.file_path)}` | `${base(inp.file_path)} 수정 중` |
| Write | `Writing ${base(inp.file_path)}` | `${base(inp.file_path)} 작성 중` |
| Bash | `Running: ${cmd…}` | `실행 중: ${cmd…}` (slice 로직 유지) |
| Glob | `Searching files` | `파일 검색 중` |
| Grep | `Searching code` | `코드 검색 중` |
| WebFetch | `Fetching web content` | `웹 내용 가져오는 중` |
| WebSearch | `Searching the web` | `웹 검색 중` |
| Task / Agent | `Subtask: ${desc…}` / `Running subtask` | `하위작업: ${desc…}` / `하위작업 실행 중` (slice 로직 유지) |
| AskUserQuestion | `Waiting for your answer` | `답변 기다리는 중` |
| EnterPlanMode | `Planning` | `계획 세우는 중` |
| NotebookEdit | `Editing notebook` | `노트북 수정 중` |
| TeamCreate | `Creating team: ${n}` / `Creating team` | `팀 생성: ${n}` / `팀 생성 중` |
| SendMessage | `-> ${r}` / `Sending message` | `→ ${r}` / `메시지 전송 중` (화살표도 `->`→`→`로 변경) |
| default | `Using ${toolName}` | `${toolName} 사용 중` |

#### 현재 함수 전체(적용된 상태)

```ts
export function formatToolStatus(toolName: string, input?: unknown): string {
  const inp = (input ?? {}) as Record<string, unknown>;
  const base = (p: unknown) => (typeof p === 'string' ? path.basename(p) : '');
  switch (toolName) {
    case 'Read':
      return `${base(inp.file_path)} 읽는 중`;
    case 'Edit':
      return `${base(inp.file_path)} 수정 중`;
    case 'Write':
      return `${base(inp.file_path)} 작성 중`;
    case 'Bash': {
      const cmd = (inp.command as string) || '';
      return `실행 중: ${cmd.length > BASH_COMMAND_DISPLAY_MAX_LENGTH ? cmd.slice(0, BASH_COMMAND_DISPLAY_MAX_LENGTH) + '…' : cmd}`;
    }
    case 'Glob':
      return '파일 검색 중';
    case 'Grep':
      return '코드 검색 중';
    case 'WebFetch':
      return '웹 내용 가져오는 중';
    case 'WebSearch':
      return '웹 검색 중';
    case 'Task':
    case 'Agent': {
      const desc = typeof inp.description === 'string' ? inp.description : '';
      return desc
        ? `하위작업: ${desc.length > TASK_DESCRIPTION_DISPLAY_MAX_LENGTH ? desc.slice(0, TASK_DESCRIPTION_DISPLAY_MAX_LENGTH) + '…' : desc}`
        : '하위작업 실행 중';
    }
    case 'AskUserQuestion':
      return '답변 기다리는 중';
    case 'EnterPlanMode':
      return '계획 세우는 중';
    case 'NotebookEdit':
      return '노트북 수정 중';
    case 'TeamCreate': {
      const teamName = typeof inp.team_name === 'string' ? inp.team_name : '';
      return teamName ? `팀 생성: ${teamName}` : '팀 생성 중';
    }
    case 'SendMessage': {
      const recipient = typeof inp.recipient === 'string' ? inp.recipient : '';
      return recipient ? `→ ${recipient}` : '메시지 전송 중';
    }
    default:
      return `${toolName} 사용 중`;
  }
}
```

> ⚠️ 이 문구는 **서버 측**에서 생성된다. 소스만 바꾸면 끝이 아니라 **CLI 번들 재빌드(`node esbuild.js`) + 서버 재시작**을 해야 실제 화면/런타임에 반영된다. (4장 참조)

---

## 3. 시스템 / 환경 변경 (빌드 산출물 · 실행 상태 · 부수효과)

소스 외에, 빌드·실행을 위해 만들어진 것들. 대부분 **재생성 가능하거나 휘발성**이다.

### 3-1. 생성된 빌드 산출물 (재생성 가능, git 추적 안 됨)
- `node_modules/` — `npm install`로 설치 (워크스페이스 포함)
- `core/src/messages.ts` — **자동 생성 파일**(커밋 대상이지만 zip에는 없었음). `npm run asyncapi:generate`로 생성됨.
- `dist/` — 빌드 산출물:
  - `dist/cli.js` (standalone CLI 번들, `formatToolStatus` 포함) ← **한국어 변경이 여기 들어있음**
  - `dist/extension.js`, `dist/hooks/claude-hook.js`, `dist/assets/`, `dist/webview/`

### 3-2. 현재 실행 중인 서버 (휘발성)
- `node dist/cli.js --port 3100` 가 백그라운드로 떠 있음.
- **현재 PID 8320, 포트 3100**. (재시작하면 PID·토큰 바뀜)
- 헬스체크: `GET http://127.0.0.1:3100/api/health` → `{"status":"ok",...}`
- 브라우저로 `http://127.0.0.1:3100` 접속 시 픽셀 오피스 SPA가 보임.

### 3-3. 홈 디렉터리 부수효과 (★중요 — 정리 시 참고)
- **`~/.claude/settings.json` 에 Pixel Agents 훅 14종이 설치됨** (`SessionStart`, `PreToolUse`, `PostToolUse`, `Stop`, `PermissionRequest`, `Notification`, `UserPromptSubmit`, `SubagentStart/Stop`, `TeammateIdle`, `TaskCreated/Completed`, `PostToolUseFailure` 등).
  - 모두 `node "C:\Users\USER\.pixel-agents\hooks\claude-hook.js"` 를 실행한다.
  - 즉, **이 머신의 모든 Claude Code 세션이 로컬 서버(3100)로 활동 이벤트를 POST**하게 된다(앱의 의도된 동작).
- **`~/.pixel-agents/`** 디렉터리 생성:
  - `server.json` (port/pid/token 디스커버리), `config.json`, `standalone-state.json`
  - `hooks/claude-hook.js` ← **수동 복사로 채워 넣음**(아래 3-4 버그 회피)
- 브라우저 UI에서 **"Watch All Sessions"** 가 켜져 있음(워크스페이스 밖 세션도 표시됨). `~/.pixel-agents/config.json`에 저장됨.

### 3-4. 알려진 버그/회피 (다음 작업자 필독)
- **`copyHookScript` 경로 버그**: standalone 서버 기동 시 로그에
  `Hook script not found at ...\dist\dist\hooks\claude-hook.js` (경로에 `dist\dist` 중복)가 뜬다.
  → 훅 항목은 `~/.claude/settings.json`에 등록되지만 **훅 스크립트 파일은 복사되지 않는** 문제.
  → **회피책으로 `dist/hooks/claude-hook.js` 를 `~/.pixel-agents/hooks/claude-hook.js` 로 수동 복사함.** (이미 해둠)
  → 재설치/다른 머신에서 재현 시 동일 수동 복사가 필요할 수 있음. 근본 수정하려면 `server/src/cli.ts`의 `copyHookScript(distRoot)` 호출과 `providers/index.ts`의 `copyHookScript` 경로 계산을 점검할 것.
- **esbuild 한글 이스케이프**: `dist/cli.js` 안에서 한글이 `읽...` 형태로 보인다. esbuild 기본 `charset:'ascii'` 때문이며 **런타임 동작은 동일**(정상). 번들에서 한국어 확인하려면 `\uXXXX`로 grep.

---

## 4. 빌드 & 실행 방법

### 4-A. 처음부터 (clean) — 이번에 실제로 쓴 절차
```powershell
cd C:\Users\USER\Desktop\pixel-agents-main\pixel-agents-main
$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD='1'; $env:HUSKY='0'   # playwright 브라우저/husky 스킵(빠르게)
npm install
npm run asyncapi:generate     # core/src/messages.ts 생성 (modelina, node22 OK)
node esbuild.js               # dist/cli.js, extension.js, hooks, assets 생성
npm run build:webview         # dist/webview 생성 (tsc -b && vite build)
node dist/cli.js --port 3100  # 서버 기동 (백그라운드 권장)
```
> 참고: 공식 `npm run build`(=compile)는 `check-types`·`lint`도 돌려 더 느리고 환경에 따라 실패 가능. **실행만 목적이면 위 타깃 빌드가 빠르고 안전**.

### 4-B. `formatToolStatus` 수정 후 재반영 (이번에 한 재빌드)
서버 코드만 바뀌었으므로 **메시지 생성/webview 빌드는 불필요**, CLI 번들만 다시 만들면 됨:
```powershell
cd C:\Users\USER\Desktop\pixel-agents-main\pixel-agents-main
node esbuild.js                                   # dist/cli.js 재생성
Stop-Process -Id <기존PID> -Force                 # 기존 서버 종료 (예: 8320)
node dist/cli.js --port 3100                       # 새 서버 기동
```
서버 재시작하면 `~/.pixel-agents/server.json` 의 **token이 갱신**되니, 데모 띄울 때 새 토큰을 다시 읽어야 함.

---

## 5. 데모 에이전트 띄우기 (가짜 직원 = hook 이벤트 주입)

진짜 Claude를 띄우지 않고, 로컬 서버에 hook 이벤트를 POST해서 캐릭터를 만들고 애니메이션시킨다.
(`server/manual-hook-events.http` 와 동일 방식, e2e 테스트가 쓰는 패턴.)

- 엔드포인트: `POST http://127.0.0.1:3100/api/hooks/claude`
- 헤더: `Authorization: Bearer <token>` (token은 `~/.pixel-agents/server.json`에서 읽기), `Content-Type: application/json`
- **생성 규칙**: `SessionStart`는 "대기 세션"만 등록 → 그 다음 `PreToolUse`가 들어와야 캐릭터가 실제 생성됨.
- 라벨 애니메이션: `PreToolUse`(tool_name 지정) → (보고 있다가) `PostToolUse` → ... → `Stop`(초록 ✓ 대기) / `SessionEnd`(퇴근).

예시(PowerShell):
```powershell
$token = (Get-Content "$env:USERPROFILE\.pixel-agents\server.json" -Raw | ConvertFrom-Json).token
$h = @{ Authorization = "Bearer $token" }
$u = "http://127.0.0.1:3100/api/hooks/claude"
function Hook($o){ Invoke-WebRequest $u -Method Post -Headers $h -ContentType "application/json" -Body ($o|ConvertTo-Json -Compress -Depth 5) -UseBasicParsing | Out-Null }
Hook @{ session_id="demo-staff-1"; hook_event_name="SessionStart"; source="startup"; cwd="C:/Users/USER/demo" }
Hook @{ session_id="demo-staff-1"; hook_event_name="PreToolUse"; tool_name="Read"; tool_input=@{ file_path="C:/Users/USER/demo/hello.txt" } }
# -> 캐릭터 머리 위에 "hello.txt 읽는 중" 표시
```
> 데모 에이전트는 **서버 메모리에만** 존재 → 서버 재시작하면 사라짐(휘발성). 영구 흔적 없음.

### 5-B. 데모 에이전트 운영 중 확인된 동작 (★실전 주의 — 실제로 겪은 함정들)

1. **토큰은 서버 재시작마다 바뀐다 → 옛 토큰이면 401.**
   재시작 후 옛 토큰으로 POST하면 `401 Unauthorized`. 반드시 매번 `~/.pixel-agents/server.json`의 최신 `token`을 읽어 쓸 것.
   (인증은 timing-safe 비교라 한 글자만 달라도 거부됨. 실제로 첫 서버 토큰 `a4119655-...`로 보냈다가 401 → 새 토큰 `937ac920-...`로 200.)

2. **이미 존재하는 `session_id`로 다시 SessionStart+PreToolUse를 보내도 새 캐릭터가 안 생긴다.**
   서버 로그에 `Agent N - SessionStart(source=startup) known` 으로 찍히고 **200 OK지만 갱신만** 됨(스폰 애니메이션 없음 → "안 나타남"으로 보임).
   → 새 캐릭터를 띄우려면 **매번 새 `session_id`** 를 쓰거나, 먼저 `SessionEnd`로 기존 세션을 정리한 뒤 새로 만들 것.

3. **가짜(hooks-only) 에이전트는 훅이 끊기면 잠시 뒤 사라진다 — "보였다가 사라짐"의 원인.**
   진짜 Claude 세션과 달리 합성 데모는 **트랜스크립트 파일/실제 프로세스가 없다.** Pixel Agents는 훅이 계속 들어오는 동안만 세션을 "살아있다"고 보고(`hookDelivered` 동안 스캐너 skip), **이벤트가 끊기면 스캐너가 "세션 종료"로 판단해 캐릭터를 제거**한다(설계 동작, 버그 아님).
   → **해결: 하트비트 루프** — 약 2~3초 간격(≤3s)으로 `PreToolUse`/`PostToolUse`를 계속 보내 살아있게 유지. 그러면 캐릭터가 머물면서 한국어 라벨로 계속 일하는 모습이 보임. 루프가 끝나(=훅 끊김) 다시 사라지는 건 동일 이유.

4. **표시 보장:** `cwd`를 **워크스페이스 경로**(`C:/Users/USER/Desktop/pixel-agents-main/pixel-agents-main`)로 주면 무조건 표시됨.
   워크스페이스 밖 경로(예: `C:/Users/USER/demo`)는 `standalone.watchAllSessions=true`(현재 켜져 있음, `~/.pixel-agents/config.json`)일 때만 표시됨.

> 요약: **새 캐릭터 = 새 session_id**, **계속 보이게 = 하트비트**, **인증 = 매번 새 토큰**.

---

## 6. 검증 방법 (이번에 한 방식)

1. **번들에 한국어 들어갔는지**: `dist/cli.js` 를 `읽`(=읽) 등으로 grep → 매치되면 OK. 동시에 `Reading \$\{base`, `Searching code` 등 영어가 0건이면 완전 교체된 것.
2. **런타임 실제 출력**: 이 세션(Agent 1)이 JSONL 휴리스틱 모드로 감시되므로, 도구 사용 시 서버 로그에
   `JSONL: Agent 1 - tool start: <id> 코드 검색 중`, `... 읽는 중`, `... PowerShell 사용 중` 처럼 **한국어로 찍힘** → 런타임 반영 확정.
3. **화면**: 브라우저(`http://127.0.0.1:3100`)에서 데모 캐릭터 머리 위 라벨이 한국어로 순환하는지 육안 확인.
- 서버 로그는 백그라운드 태스크 출력 파일에서 확인(현재 세션 기준 `...\tasks\<taskId>.output`). 새 모델은 단순히 서버를 포그라운드로 잠깐 돌리거나 콘솔 로그를 보면 됨.

---

## 7. 되돌리기 (rollback)

- **소스 되돌리기**: `server/src/providers/hook/claude/claude.ts`의 `formatToolStatus`를 2장 "변경 전(영어)" 문구로 되돌린 뒤 `node esbuild.js` + 서버 재시작.
- **서버 끄기**: `Stop-Process -Id <PID> -Force` (현재 PID 8320).
- **글로벌 훅 제거(권장 정리)**: 앱 우하단 ⚙️ 설정에서 **Hooks 토글 OFF** → `~/.claude/settings.json`에서 훅 자동 제거됨. (수동으로 지우려면 settings.json의 `hooks` 객체에서 pixel-agents 항목 삭제)
- **완전 정리**: 위 + `~/.pixel-agents/` 폴더 삭제 + (원하면) `node_modules/`, `dist/`, `core/src/messages.ts` 삭제.

---

## 8. 현재 상태 스냅샷 (최종 업데이트 시점)

- ✅ `formatToolStatus` 한국어화 완료(소스 + dist/cli.js 반영, 런타임 출력까지 확인).
- ✅ 서버 가동 중: PID **8320**, 포트 **3100**, token `937ac920-f299-4cf1-bad5-90da9738da07` (※ 재시작 시 변경, server.json에서 읽을 것).
- ✅ `~/.claude/settings.json` 훅 설치됨, `~/.pixel-agents/hooks/claude-hook.js` 수동 복사 완료.
- 🟡 데모 에이전트는 전부 휘발성. 마지막으로 `demo-worker`(Agent 4)를 **하트비트 루프**로 띄워 화면에 유지 중이었음 — 루프 종료 시 사라짐(5-B 참조).
- 🟡 이번 세션에서 띄운 데모 session_id 예: `demo-agent-1`, `demo-staff-1`, `demo-staff-2`, `demo-worker`. 모두 메모리에만 존재한 휘발성, 영구 변경 아님.
- ⚠️ git 추적 없음 → 이 `edit_log.md`가 변경 기록의 단일 출처.

---

## 9. 다음 작업 후보 (미완료/제안)

- [ ] **webview UI 영어 문구 한국어화** (툴바·설정·모달 등). `webview-ui/src/components/**`, `webview-ui/src/office/components/ToolOverlay.tsx` 등. 이건 webview라 `npm run build:webview`(vite) 재빌드 필요. 문구 상수는 `webview-ui/src/constants.ts` 참고.
- [ ] **`copyHookScript` dist\dist 경로 버그 근본 수정** (`server/src/cli.ts` + `providers/index.ts`).
- [ ] (선택) 한국어 라벨에 대한 단위 테스트 보강: `server/__tests__/claude.test.ts`에 `formatToolStatus` 케이스 추가.
- [ ] (선택) i18n 구조로 일반화(영/한 전환) — 현재는 하드코딩 교체.
