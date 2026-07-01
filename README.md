# Pixel Agents — OpenRouter 멀티모델 확장

바닐라 **Pixel Agents**는 AI 코딩 에이전트(Claude Code)를 픽셀아트 사무실의 애니메이션 캐릭터로
보여주는 시각화 도구입니다. 이 포크는 여기에 **OpenRouter의 여러 모델(GPT · Gemini · DeepSeek 등)을
실제 도구를 사용하는 에이전트로 실행해 오피스에 시각화**하는 기능과 **한국어 라벨**을 더했습니다.
Pixel Agents 코어/서버 소스는 한 줄도 고치지 않았습니다.

![Pixel Agents 오피스 — 에이전트들이 한국어 라벨과 함께 일하는 모습](docs/screenshot.png)

## 바닐라 Pixel Agents란

- AI 에이전트를 픽셀 오피스의 캐릭터로 표현 — 하는 일에 따라 타이핑·읽기·대기 애니메이션을 합니다.
- **관찰형(observational)** 도구입니다. 스스로 LLM을 호출하지 않고, 에이전트의 활동을 훅/트랜스크립트로
  받아 그립니다.
- 오늘 실제로 지원하는 에이전트는 **Claude Code 하나**이며, 다른 도구(Codex·Gemini·Cursor 등)는 로드맵입니다.
- 원본: [pixel-agents-hq/pixel-agents](https://github.com/pixel-agents-hq/pixel-agents) (MIT).

## 이 포크가 더한 것

- **OpenRouter 멀티모델 시각화** — `.env`에 넣은 모델들을 각각 에이전트로 실행해 오피스에 캐릭터로 등장시킵니다.
- **실제 tool-use 구동** — 각 모델에게 실제 도구(`list_dir`·`read_file`·`write_file`, 샌드박스 한정)를
  function calling으로 주고, **모델이 실제로 호출한 도구**가 그대로 캐릭터 활동이 됩니다. 모델마다 도구
  순서가 달라지고, 각 모델이 실제로 `summary.md`를 작성합니다.
- **한국어 라벨** — 캐릭터 상태 문구를 한국어로 현지화(`읽는 중`, `작성 중`, `파일 검색 중` 등).
- **코어 무수정** — 기존 훅 인그레스(`POST /api/hooks/…`)를 재사용해 위 기능을 구현했습니다.

## 어떻게 동작하나

`openrouter-agents/run.mjs`가 각 모델을 실행하면서, 모델의 실제 도구 호출을 pixel-agents 서버로 이벤트로
전송합니다. 서버는 이를 표준 이벤트로 정규화해 오피스 캐릭터로 렌더링합니다.

```
run.mjs (OpenRouter 모델 실행 + 실제 도구 호출을 이벤트로 전송)
        └─ POST /api/hooks ─→ pixel-agents 서버 ─→ 픽셀 오피스 렌더링
```

## 설치 및 실행

```bash
npm install          # 의존성 설치 (루트 + 워크스페이스)
npm run build        # dist/ 빌드 (서버 + 웹뷰 + 에셋)

node dist/cli.js --port 3100     # 서버 실행 → 브라우저에서 http://127.0.0.1:3100 열기
```

브라우저에서 ⚙️ **Settings → "Always Show Labels"** 를 켜면 캐릭터 위 한국어 라벨이 항상 보입니다.

OpenRouter 모델을 오피스에 띄우려면, 프로젝트 루트에 `.env`를 만들고(키는 [openrouter.ai/keys](https://openrouter.ai/keys) —
무료 티어로도 발급 가능):

```
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODELS=openai/gpt-4o-mini,google/gemini-2.5-flash,deepseek/deepseek-chat-v3.1
```

그리고 서버가 켜진 상태에서:

```bash
node openrouter-agents/run.mjs
```

각 모델이 실제로 도구를 호출하며 오피스에 캐릭터로 등장하고, 콘솔에는 모델이 호출한 도구와 최종 응답이
출력됩니다. 자세한 사용법은 [`openrouter-agents/README.md`](openrouter-agents/README.md) 참고.

## 라이선스

MIT — 원저작물 [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents). 원본 README는
[`README.upstream.md`](README.upstream.md), 상세 아키텍처는 [`CLAUDE.md`](CLAUDE.md)에 있습니다.
