# pixel-agents-openrouter

**OpenRouter의 여러 모델(GPT · Gemini · DeepSeek 등)을 각각 "실제 도구를 사용하는 에이전트"로 실행하고,
그 활동을 픽셀아트 사무실에 캐릭터로 실시간 시각화**하는 프로젝트입니다. 각 캐릭터는 자기가 연결된
모델명을 달고, 모델이 실제로 호출한 도구에 따라 움직입니다. 캐릭터 상태 라벨은 한국어로 표시됩니다.

바닐라 [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents)는 **Claude Code 세션만** 시각화하지만,
이 포크는 거기에 **OpenRouter 멀티모델 시각화 + 한국어화**를 더했습니다. Pixel Agents 코어/서버 소스는
한 줄도 고치지 않았습니다.

![pixel-agents-openrouter — 세 개의 OpenRouter 모델이 각자 모델명을 달고 사무실에서 일하는 모습](docs/screenshot.png)

*위 화면: `deepseek-chat-v3.1`, `gemini-2.5-flash`, `gpt-4o-mini` 세 모델이 각각 캐릭터로 등장해 동시에 작업 중.*

---

## pixel-agents-openrouter란

바닐라 Pixel Agents는 **관찰형 시각화 도구**입니다 — 스스로 LLM을 호출하지 않고, Claude Code가 남기는
훅(hooks)·트랜스크립트를 받아 에이전트의 활동을 캐릭터로 그립니다. 그래서 "다른 모델을 시각화"하려면,
**모델을 실행하는 쪽이 그 활동을 이벤트로 서버에 보내주면** 됩니다.

이 프로젝트는 바로 그 다리(bridge)를 만들었습니다: `openrouter-agents/run.mjs`가 `.env`에 적은 모델들을
각각 하나의 에이전트로 실행하면서, **모델이 실제로 호출한 도구**를 pixel-agents 서버로 전송합니다.
결과적으로 각 OpenRouter 모델이 사무실의 캐릭터가 되어, 자기 모델명을 달고, 실제로 하는 일에 맞춰
움직입니다.

## 주요 기능

- **OpenRouter 멀티모델 시각화** — `.env`의 모델 목록만큼 캐릭터가 등장합니다. 각 캐릭터의 이름(자막)은
  자기가 연결된 모델명(`gpt-4o-mini`, `gemini-2.5-flash`, `deepseek-chat-v3.1` …)입니다.
- **실제 tool-use 구동(연출 아님)** — 각 모델에게 실제 도구(`list_dir`·`read_file`·`write_file`, 샌드박스
  한정)를 function calling으로 줍니다. **모델이 실제로 호출한 도구**가 그대로 캐릭터 활동이 되므로,
  모델마다 도구 순서가 다르고 각 모델이 실제로 `summary.md`를 작성합니다.
- **한국어 라벨** — 캐릭터 상태 문구를 한국어로 현지화했습니다(`읽는 중`, `작성 중`, `파일 검색 중` 등).
- **코어 무수정** — pixel-agents 소스는 손대지 않고, 원본이 이미 제공하는 훅 인그레스만 재사용했습니다.

## 동작 원리

```
openrouter-agents/run.mjs
  ├─ 각 모델을 OpenRouter chat/completions(tools 포함)로 실행하는 에이전트 루프
  │    · 응답에 tool_calls 가 있으면 → 그 도구를 실제로 실행
  │    · 모델이 부른 도구를 pixel-agents 이벤트로 매핑 (read_file→Read, write_file→Write, …)
  └─ POST /api/hooks/claude ─→ pixel-agents 서버 ─→ 표준 이벤트로 정규화 ─→ 픽셀 오피스 렌더링
```

- **에이전트 루프**: `SessionStart → PreToolUse(모델이 부른 도구) → 실행 → PostToolUse → … → Stop`.
  도구 호출 사이(모델 추론 중)에도 캐릭터가 유지되도록 하트비트를 보냅니다.
- **모델명 표시**: 각 모델은 자기 이름의 작업 폴더(`openrouter-agents/workspace/<모델명>`)에서 파일을
  다루고, 그 폴더명이 곧 캐릭터의 이름(자막)으로 표시됩니다.
- **안전**: 도구는 모델별 샌드박스 폴더 안의 파일 읽기/쓰기로 제한했습니다(임의 셸 실행 없음).

## 작업 내역

| 파일 | 내용 |
|---|---|
| `openrouter-agents/run.mjs` | **(신규)** OpenRouter 모델을 실제 tool-use 에이전트로 실행하고 활동을 이벤트로 전송하는 브리지. 외부 의존성 0(Node 내장 fetch). |
| `openrouter-agents/README.md` | **(신규)** 브리지 상세 사용법(한국어). |
| `.env.example` | OpenRouter 설정 슬롯(`OPENROUTER_API_KEY`, `OPENROUTER_MODELS`) 추가. |
| `server/src/providers/hook/claude/claude.ts` | `formatToolStatus()` 표시 문구를 한국어로 교체(함수 로직은 그대로). |
| 캐릭터 스프라이트 | `webview-ui/public/assets/characters/` 커스텀 캐릭터로 교체. |

> pixel-agents의 **코어/서버 로직 자체는 수정하지 않았습니다.** OpenRouter 연동은 전적으로 위 브리지가
> 원본의 이벤트 인그레스를 사용해 이룬 것입니다.

## 검증

실행 중인 서버에 붙여 엔드투엔드로 확인했습니다.

- `.env`의 모델 수만큼 캐릭터가 생성되고, 각 캐릭터의 이름이 **연결된 모델명**으로 표시됩니다
  (`gpt-4o-mini` / `gemini-2.5-flash` / `deepseek-chat-v3.1`).
- 같은 작업을 줘도 **모델마다 실제 도구 호출 순서·횟수가 다릅니다**(예: 어떤 모델은 `notes/` 하위 폴더까지
  탐색, 어떤 모델은 없는 파일을 열어보고 스스로 방향 수정). 연출이라면 매번 동일하지만 실제이므로 매번 다릅니다.
- 각 모델이 자기 샌드박스에 실제 `summary.md`를 작성합니다.

## 설치 및 실행

```bash
npm install          # 의존성 설치 (루트 + 워크스페이스)
npm run build        # dist/ 빌드 (서버 + 웹뷰 + 에셋)

node dist/cli.js --port 3100     # 서버 실행 → 브라우저에서 http://127.0.0.1:3100
```

브라우저에서 ⚙️ **Settings → "Always Show Labels"** 를 켜면 캐릭터 위 한국어 라벨과 모델명이 항상 보입니다.

OpenRouter 모델을 띄우려면, 프로젝트 루트에 `.env`를 만들고(키는 [openrouter.ai/keys](https://openrouter.ai/keys)
— 무료 티어로도 발급 가능):

```
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODELS=openai/gpt-4o-mini,google/gemini-2.5-flash,deepseek/deepseek-chat-v3.1
```

서버가 켜진 상태에서:

```bash
node openrouter-agents/run.mjs
```

각 모델이 실제로 도구를 호출하며 오피스에 캐릭터로 등장합니다. 자세한 내용은
[`openrouter-agents/README.md`](openrouter-agents/README.md) 참고.

## 참고: 바닐라 Pixel Agents

원본 [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents)는 AI 코딩 에이전트를 픽셀 오피스
캐릭터로 보여주는 도구로, 오늘 실제로 지원하는 에이전트는 **Claude Code 하나**이며 다른 도구(Codex·Gemini·
Cursor 등)는 로드맵으로 남아 있습니다. 이 포크는 그 "다른 모델 시각화"의 한 갈래를 OpenRouter로 구현한
것입니다. 원본 README 전문은 [`README.upstream.md`](README.upstream.md), 상세 아키텍처는
[`CLAUDE.md`](CLAUDE.md)에 있습니다.

## 라이선스

MIT — 원저작물 [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents). 캐릭터 스프라이트는
직접 제작/교체본입니다.
