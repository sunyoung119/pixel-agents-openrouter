# OpenRouter 모델 → 픽셀 오피스 실시간 시각화 (실제 tool-use)

여러 **OpenRouter 모델**(GPT · Gemini · DeepSeek 등)을 **실제 도구를 사용하는 에이전트**로
실행하고, **모델이 실제로 호출한 도구**를 pixel-agents 오피스에 캐릭터 활동으로 시각화한다.
캐릭터의 움직임은 하드코딩된 연출이 아니라 **모델의 실제 결정**으로 구동된다.

## 원리 (중요)

pixel-agents 는 **LLM 을 직접 호출하지 않는 "시각화(관찰) 레이어"** 다. Claude Code 는 훅(hooks)
API 가 내장돼 자동으로 이벤트를 서버로 보내지만, **OpenRouter 모델에는 그런 자동 연결이 없다.**
그래서 `run.mjs` 가 각 모델을 에이전트로 돌리면서, **모델이 실제로 호출한 도구를** 기존 훅
인그레스(`POST /api/hooks/claude`)로 대신 전송한다:

```
SessionStart → PreToolUse(모델이 실제 호출한 도구) → PostToolUse → … → Stop → SessionEnd
```

각 모델에게는 실제 도구가 function calling 으로 주어진다 — `list_dir`, `read_file`, `write_file`
(모두 `openrouter-agents/workspace/<모델>/` 샌드박스 안에서만 동작, 경로 이스케이프 차단, 임의 셸
실행 없음). 모델이 `read_file("data.json")` 을 호출하면 캐릭터가 `data.json 읽는 중` 으로 반응한다.
**pixel-agents 코어 소스는 한 줄도 고치지 않는다.**

## 실행 방법

### 1) 서버 띄우기
```powershell
cd C:\Users\USER\Desktop\pixel-agents-main\pixel-agents-main
node dist/cli.js --port 3100
```
브라우저에서 `http://127.0.0.1:3100` 열기.

### 2) ⚠️ 라벨 표시 켜기 (필수)
캐릭터 머리 위 한국어 라벨은 **기본적으로 hover/선택 시에만** 보인다
(`webview-ui/src/office/components/ToolOverlay.tsx:134`, `alwaysShowLabels` 기본 `false`).
→ ⚙️**Settings → "Always Show Labels" 체크** 하거나, 캐릭터에 **마우스를 올리면** 라벨이 뜬다.

### 3) 실제 모델로 실행
프로젝트 루트 `.env` 에 키를 넣는다 (`.env` 는 gitignore 됨):
```
OPENROUTER_API_KEY=sk-or-v1-...실제키...
OPENROUTER_MODELS=openai/gpt-4o-mini,google/gemini-2.5-flash,deepseek/deepseek-chat-v3.1
```
그리고:
```powershell
node openrouter-agents/run.mjs
```
콘솔에 각 모델이 **실제로 호출한 도구**가 로그로 찍히고(`🔧 [gpt-4o-mini] read_file("project.md")`),
브라우저에서 캐릭터가 그 도구에 맞춰 애니메이션 + 한국어 라벨로 반응한다. `Ctrl+C` 로 종료하면 퇴근.

## 옵션 / 설정

| 옵션 | 설명 |
|---|---|
| `--seconds <n>` | 작업 완료 후 n초 뒤 캐릭터를 퇴근시키고 종료. 없으면 `Ctrl+C` 까지 유지. |

| `.env` 변수 | 뜻 |
|---|---|
| `OPENROUTER_API_KEY` | OpenRouter 키. https://openrouter.ai/keys (실제 호출이라 필수) |
| `OPENROUTER_MODELS` | 에이전트로 띄울 모델 ID 목록(쉼표 구분). 각 모델 = 캐릭터 1명. **function calling 지원 모델** 권장. 정확한 ID: https://openrouter.ai/models |

> 모델은 각자의 `openrouter-agents/workspace/<모델>/` 샌드박스에서 파일을 탐색/작성한다.
> 이 폴더는 실행 시 시드 파일로 채워지고 결과물이 쌓이며, gitignore 된다.

## 검증 결과 (실측)

실행 중인 서버에 붙여 확인한 결과:
- **모델 3개 → 캐릭터 3명** 생성(WebSocket `agentCreated` 3건).
- **모델마다 실제로 다른 도구 시퀀스**를 수행 — 예: `gpt-4o-mini`는 5회, `gemini-2.5-flash`는 7회,
  `deepseek-chat-v3.1`은 6회 호출. `deepseek`/`gemini`는 `notes/` 하위 폴더를 별도로 탐색했고,
  `gemini`는 존재하지 않는 `note1.txt` 를 읽어보려다 결과를 보고 스스로 방향을 바꿨다.
  **연출이라면 매번 동일하지만, 실제이므로 매번 다르다.**
- 캐릭터 라벨이 실제 도구를 그대로 반영: `파일 검색 중`(list_dir) · `data.json 읽는 중`·
  `project.md 읽는 중`(read_file) · `summary.md 작성 중`(write_file) · 완료 시 초록 체크.
- 각 모델이 자기 샌드박스에 **실제 `summary.md`** 를 작성.

## 한계 / 다음 단계

- 지금은 각 모델을 **독립 에이전트(peer)** 로 실행한다. "리드가 서브에이전트를 스폰·핸드오프"하는
  **계층형 멀티에이전트**는 `SubagentStart/SubagentStop` 이벤트로 확장 가능하다.
- 기존 `claude` 인그레스를 재사용하므로 내부 provider 는 `claude` 로 라벨된다. 전용 `openrouter`
  provider + 런타임 provider-id 라우팅을 추가하면 Claude 세션과 **동시 공존**이 깔끔해진다
  (현재 런타임은 단일 provider 구조).
- 도구는 안전을 위해 파일 read/write(샌드박스)로 한정했다. 임의 셸 실행은 포함하지 않는다.
