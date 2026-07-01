# pixel-agents-openrouter

**OpenRouter의 여러 모델(GPT · Gemini · DeepSeek …)을 각각 "실제 도구를 사용하는 에이전트"로 실행하고, 그 활동을 픽셀아트 사무실에 캐릭터로 실시간 시각화하는 프로젝트.**

각 캐릭터는 자기가 연결된 모델명을 달고, 모델이 *실제로 호출한 도구*에 따라 움직입니다. 상태 라벨은 한국어로 표시됩니다.

바닐라 [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents)는 **Claude Code 세션만** 시각화하지만, 이 포크는 거기에 **OpenRouter 멀티모델 시각화 + 한국어화 + 커스텀 캐릭터**를 더했습니다. 그러면서 **pixel-agents 코어/서버 소스는 한 줄도 고치지 않았습니다.**

![pixel-agents-openrouter — 세 개의 OpenRouter 모델이 각자 모델명을 달고 사무실에서 일하는 모습](docs/screenshot.png)

*위 화면: `deepseek-chat-v3.1`, `gemini-2.5-flash`, `gpt-4o-mini` 세 모델이 각각 캐릭터로 등장해 동시에 작업 중.*

---

## 한눈에 보는 차이

| 구분 | 바닐라 Pixel Agents | pixel-agents-openrouter (이 포크) |
|---|---|---|
| 시각화 대상 | Claude Code 세션만 | Claude + **OpenRouter의 임의 모델** (GPT·Gemini·DeepSeek…) |
| 캐릭터 이름 | 작업 폴더명 | **연결된 모델명** (`gpt-4o-mini` 등) |
| 활동 라벨 | 영어 (`Reading foo.ts`) | **한국어** (`foo.ts 읽는 중`) |
| 활동을 만드는 것 | Claude 훅이 자동 전송 | 브리지가 **모델의 실제 tool 호출**을 전송 |
| 캐릭터 그림 | 기본 6종 | 커스텀 교체본 |
| 코어/서버 수정 | — | **없음 (0줄)** |

---

## 왜 이렇게 만들었나 — 핵심 아이디어

이 프로젝트의 열쇠는 딱 한 문장입니다: **Pixel Agents는 "관찰형" 도구다.**

Pixel Agents는 스스로 LLM을 호출하지 않습니다. 원본 문서의 표현대로 *"purely observational"* — 에이전트가 지금 무슨 일을 하는지 **이벤트로 보고받아 그림으로 그리는 모니터링 대시보드**에 가깝습니다. 그림을 그리는 데 필요한 건 '누가', '무슨 도구를', '언제 시작/끝'이라는 이벤트뿐입니다.

> **비유.** Pixel Agents = 관제 화면. Claude Code = 현장에서 "나 지금 파일 읽어요"라고 무전 치는 작업자. 관제 화면은 무전을 듣고 캐릭터를 움직입니다. **무전 규격만 맞으면 누가 보내든 상관없습니다.**

여기서 문제와 해법이 나옵니다.

- **문제** — Claude Code는 훅(hooks) API가 내장돼 있어 실행되면 자동으로 규격에 맞는 이벤트를 서버로 쏩니다. 하지만 OpenRouter의 GPT·Gemini 같은 모델에는 그런 훅이 없고, 관찰형인 Pixel Agents가 그 모델을 스스로 들여다볼 수도 없습니다.
- **해법** — 서버는 **규격에 맞는 이벤트만 받으면** 누가 보냈는지 따지지 않습니다. 그렇다면 **"모델을 실행하면서, 그 활동을 이벤트로 대신 쏴 주는 프로그램"** 을 하나 만들면 됩니다. 이것이 이 프로젝트의 **브리지**(`openrouter-agents/run.mjs`)입니다.

브리지가 원본의 이벤트 인그레스를 그대로 사용하므로, **pixel-agents 코어는 한 줄도 고칠 필요가 없습니다.**

---

## 동작 원리

```
┌────────────────── openrouter-agents/run.mjs (브리지) ──────────────────┐
│                                                                        │
│   .env 의 모델마다:                                                     │
│     ┌──────────────┐   tools(function calling)   ┌──────────────────┐  │
│     │  에이전트 루프 │ ─────────────────────────▶ │ OpenRouter        │  │
│     │              │ ◀───────────────────────── │ chat/completions  │  │
│     └──────┬───────┘        tool_calls           │ (gpt/gemini/…)    │  │
│            │  모델이 '실제로' 부른 도구를 이벤트로  └──────────────────┘  │
└────────────┼───────────────────────────────────────────────────────────┘
             │  POST /api/hooks/claude
             │  (SessionStart / PreToolUse / PostToolUse / Stop)
             ▼
      ┌──────────────────┐  normalizeHookEvent  ┌────────────┐  broadcast  ┌───────────┐
      │ pixel-agents 서버 │ ───────────────────▶ │ AgentEvent │ ──────────▶ │ 픽셀 오피스 │
      │  (원본, 무수정)   │                      │  + 상태     │  WebSocket  │  (캔버스)  │
      └──────────────────┘                      └────────────┘             └───────────┘
        · 캐릭터 이름 = basename(cwd) = 모델명
        · 라벨 = formatToolStatus(tool) = 한국어
```

**이벤트 파이프라인.** 활동 정보는 `POST /api/hooks/:providerId` → `normalizeHookEvent()` → 표준 `AgentEvent` → 런타임 상태 변경 → WebSocket 브로드캐스트 → 웹뷰 렌더링 순으로 흘러 캐릭터가 됩니다. 런타임은 CLI별 도구 이름이 아니라 표준 이벤트의 종류(`kind`: `toolStart` / `toolEnd` / `turnEnd` / `sessionStart` / `sessionEnd` …)만 보고 동작하므로, 이벤트 소스가 Claude든 GPT든 무관합니다.

**실제 tool-use로 구동 (연출 아님).** 활동을 미리 짜둔 순서대로 재생하면 "연출"일 뿐, 모델이 실제로 뭘 하는지 못 보여줍니다. 그래서 각 모델에게 실제 도구를 function calling으로 주고, **모델이 실제로 호출한 `tool_calls`를 그대로 캐릭터 활동으로** 만듭니다. OpenRouter가 OpenAI 호환 `/api/v1/chat/completions`를 제공하므로 표준 `tools` / `tool_calls` 방식이 그대로 통합니다.

```js
// openrouter-agents/run.mjs — 에이전트 루프 (단순화)
const messages = [{ role: 'system', ... }, { role: 'user', content: task }];
while (step++ < MAX_STEPS) {
  const msg = await chat(model, messages, TOOLS);   // OpenRouter 호출
  if (!msg.tool_calls) { hook(Stop); break; }       // 도구 안 부르면 = 완료
  for (const call of msg.tool_calls) {              // 모델이 '실제로' 부른 도구
    hook(PreToolUse, TOOL_MAP[call.name]);          // → 캐릭터가 그 활동을 함
    const result = executeTool(call.name, call.args); // 샌드박스에서 실제 실행
    hook(PostToolUse);
    messages.push({ role: 'tool', content: result }); // 결과를 모델에게 돌려줌
  }
}
```

**모델명은 어디서 오나.** 서버에서 hooks 에이전트의 이름은 작업 폴더(`cwd`)의 마지막 이름(`path.basename(cwd)`)입니다. 그래서 각 모델이 *자기 모델명 폴더*(`openrouter-agents/workspace/<모델명>`)에서 작업하게 만들면, 그 폴더명이 곧 캐릭터 이름이 됩니다. 서버를 고치는 대신, 서버가 이름을 정하는 규칙을 파악해 입력을 맞춘 것입니다.

**하트비트.** 합성 에이전트(실제 프로세스가 없는)는 이벤트가 끊기면 서버가 세션 종료로 보고 캐릭터를 지웁니다(설계 동작). 그래서 브리지는 작업 중 약 2초 간격으로 현재 활동을 재전송해 캐릭터를 살려둡니다.

---

## 주요 기능

- **OpenRouter 멀티모델 시각화** — `.env`의 모델 목록만큼 캐릭터가 등장하고, 각 캐릭터의 이름(자막)은 자기가 연결된 모델명입니다.
- **실제 tool-use 구동** — 각 모델에게 실제 도구(`list_dir` · `read_file` · `write_file`, 샌드박스 한정)를 주고, 모델이 실제로 호출한 도구가 그대로 캐릭터 활동이 됩니다. 그래서 모델마다 도구 순서·횟수가 다르고, 각 모델이 실제로 `summary.md`를 작성합니다.
- **한국어 라벨** — 캐릭터 상태 문구를 한국어로 현지화 (`읽는 중`, `작성 중`, `파일 검색 중` …).
- **커스텀 캐릭터 스프라이트** — 기본 캐릭터를 교체본으로.
- **코어 무수정** — pixel-agents 소스는 손대지 않고, 원본이 이미 제공하는 훅 인그레스만 재사용.

### 도구 이름 → 캐릭터 활동 매핑

| 모델이 부른 도구 | pixel-agents 도구 | 캐릭터 라벨(한국어) | 애니메이션 |
|---|---|---|---|
| `list_dir` | `Glob` | 파일 검색 중 | 읽기 |
| `read_file` | `Read` | `data.json` 읽는 중 | 읽기 |
| `write_file` | `Write` | `summary.md` 작성 중 | 타이핑 |

> **안전.** 도구는 모델별 샌드박스 폴더 안의 **파일 읽기/쓰기**로만 제한했습니다. 임의 셸 실행은 주지 않습니다(모델이 무엇을 부를지 모르므로).

---

## 설치 및 실행

```bash
npm install          # 의존성 설치 (루트 + 워크스페이스)
npm run build        # dist/ 빌드 (서버 + 웹뷰 + 에셋)

node dist/cli.js --port 3100     # 서버 실행 → 브라우저에서 http://127.0.0.1:3100
```

브라우저에서 ⚙️ **Settings → "Always Show Labels"** 를 켜면 캐릭터 위 한국어 라벨과 모델명이 항상 보입니다.

OpenRouter 모델을 띄우려면, 프로젝트 루트에 `.env`를 만듭니다(키는 [openrouter.ai/keys](https://openrouter.ai/keys) — 무료 티어로도 발급 가능):

```
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODELS=openai/gpt-4o-mini,google/gemini-2.5-flash,deepseek/deepseek-chat-v3.1
```

서버가 켜진 상태에서 브리지를 실행합니다:

```bash
node openrouter-agents/run.mjs
```

각 모델이 실제로 도구를 호출하며 오피스에 캐릭터로 등장합니다. 자세한 내용은 [`openrouter-agents/README.md`](openrouter-agents/README.md) 참고.

---

## 검증

실행 중인 서버에 붙여 엔드투엔드로 확인했습니다.

- `.env`의 모델 수만큼 캐릭터가 생성되고, 각 캐릭터의 이름이 **연결된 모델명**으로 표시됩니다 (`gpt-4o-mini` / `gemini-2.5-flash` / `deepseek-chat-v3.1`).
- 같은 작업을 줘도 **모델마다 실제 도구 호출 순서·횟수가 다릅니다** (예: 어떤 모델은 `notes/` 하위 폴더까지 탐색, 어떤 모델은 없는 파일을 열어보고 스스로 방향 수정). 연출이라면 매번 동일하지만, 실제이므로 매번 다릅니다.
- 각 모델이 자기 샌드박스에 실제 `summary.md`를 작성합니다.

---

## 커스텀 캐릭터 스프라이트 규격

캐릭터 그림을 교체할 때 렌더 엔진이 기대하는 **정확한 규격**이 있습니다(안 맞으면 애니메이션이 깨집니다).

| 항목 | 규격 |
|---|---|
| 파일 | `char_0.png` ~ `char_5.png` (6개) |
| 이미지 크기 | 112 × 96 픽셀 |
| 배치 | 가로 7프레임(16px) × 세로 3방향(32px). 행0=정면(down), 행1=뒤(up), 행2=오른쪽(right). 왼쪽은 오른쪽을 자동 반전 |
| 프레임 순서 | 걷기1·걷기2·걷기3 · 타이핑1·타이핑2 · 읽기1·읽기2 |
| 색상 | RGBA (배경 투명 필수) |
| 위치 | `webview-ui/public/assets/characters/` → 빌드 시 `dist/assets/`로 복사 |

> 하나의 이미지를 격자로 잘라 프레임을 뽑고 순서대로 보여줘 애니메이션을 만드는 **스프라이트 시트** 방식입니다. 그래서 "아무 그림"이 아니라 이 격자 규격을 지켜야 합니다. 21칸 전부에서 **발 높이(바닥선)를 동일하게** 맞춰야 걷기·앉기가 자연스럽습니다.

---

## 변경된 파일 요약

| 파일 | 내용 |
|---|---|
| `openrouter-agents/run.mjs` | **(신규)** OpenRouter 모델을 실제 tool-use 에이전트로 실행하고 활동을 이벤트로 전송하는 브리지. 외부 의존성 0 (Node 내장 fetch). |
| `openrouter-agents/README.md` | **(신규)** 브리지 상세 사용법(한국어). |
| `.env.example` | OpenRouter 설정 슬롯(`OPENROUTER_API_KEY`, `OPENROUTER_MODELS`) 추가. |
| `server/src/providers/hook/claude/claude.ts` | `formatToolStatus()` 표시 문구를 한국어로 교체 (함수 로직은 그대로). |
| `webview-ui/public/assets/characters/` | 커스텀 캐릭터 스프라이트로 교체. |

> pixel-agents의 **코어/서버 로직 자체는 수정하지 않았습니다.** OpenRouter 연동은 전적으로 위 브리지가 원본의 이벤트 인그레스를 사용해 이룬 것입니다.

---


## 더 깊은 설명

이 프로젝트를 만들며 다룬 개념(관찰형 설계, 정규화 경계, 계약 기반 통합, function calling 에이전트 루프, 표현/로직 분리)을 코드와 함께 자세히 정리한 강의노트가 있습니다.

- **[강의노트: 바닐라와의 차이, 그리고 어떻게 만들었나](docs/lecture-note.html)** — 8개 챕터, 코드·다이어그램 포함
- 원본 아키텍처: [`CLAUDE.md`](CLAUDE.md)
- 원본 README 전문: [`README.upstream.md`](README.upstream.md)

### 이 프로젝트에서 배우는 개념 (요약)

1. **관찰형 설계** — 시각화 도구는 실행 주체가 아니라 "보고를 받아 그리는" 계층일 수 있다. 실행과 표현의 분리.
2. **계약 기반 통합** — 시스템이 공개한 인터페이스(HTTP 인그레스 + 이벤트 규격 + 이름 규칙)만 지키면, 내부를 고치지 않고 확장할 수 있다.
3. **정규화 경계** — 제각각인 외부 입력을 하나의 표준(AgentEvent)으로 번역하는 지점을 두면, 다운스트림은 소스에 무관해진다.
4. **function calling 에이전트 루프** — "모델 호출 → 도구 실행 → 결과 되돌리기"의 반복이 에이전트의 본질. 실제 도구 호출이 있어야 "연출"이 아니다.
5. **표현/로직 분리** — 라벨 문구가 한 함수에 모여 있어 로직을 건드리지 않고 한국어화가 가능했다.

---

## 참고: 바닐라 Pixel Agents

원본 [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents)는 AI 코딩 에이전트를 픽셀 오피스 캐릭터로 보여주는 도구로, 오늘 실제로 지원하는 에이전트는 **Claude Code 하나**이며 다른 도구(Codex · Gemini · Cursor 등)는 로드맵으로 남아 있습니다. 이 포크는 그 "다른 모델 시각화"의 한 갈래를 OpenRouter로 구현한 것입니다.

## 라이선스

MIT — 원저작물 [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents). 캐릭터 스프라이트는 직접 제작/교체본입니다.