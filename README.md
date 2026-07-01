<h1 align="center">Pixel Agents — OpenRouter 멀티모델 확장</h1>

<p align="center">
  <em>바닐라 Pixel Agents(“Claude Code 전용 관찰 시각화 도구”)를,<br/>
  OpenRouter의 여러 모델을 <b>실제 도구를 사용하는 에이전트</b>로 돌려<br/>
  그 <b>실제 활동</b>을 픽셀 오피스에 시각화하도록 확장한 포크입니다.</em>
</p>

<p align="center">
  <code>Claude 전용</code> → <code>OpenRouter의 임의 모델</code> ·
  <code>영문 라벨</code> → <code>한국어 라벨</code> ·
  <code>코어 소스 무수정</code>
</p>

> 📌 이 문서는 **과제 제출용 요약본**입니다. 바닐라 원본 README 전문은
> [`README.upstream.md`](README.upstream.md) 에 그대로 보존했습니다.
> 확장 기능 상세 사용법은 [`openrouter-agents/README.md`](openrouter-agents/README.md) 참조.

---

## 1. 한 줄 요약

바닐라 Pixel Agents는 **Claude Code 세션만** 픽셀 오피스에 캐릭터로 렌더링한다. 이 포크는 **OpenRouter의
여러 모델(GPT-4o-mini · Gemini 2.5 Flash · DeepSeek 등)을 각각 실제 도구를 사용하는 에이전트로 실행**하고,
**모델이 실제로 호출한 도구**를 오피스에 캐릭터 활동으로 시각화한다(하드코딩된 연출이 아님). 추가로 캐릭터
상태 라벨을 한국어로 현지화했다. 핵심은 **Pixel Agents 코어/서버 소스를 한 줄도 고치지 않고**, 원본이 이미
노출한 이벤트 인그레스를 재사용해 이를 달성했다는 점이다.

---

## 2. 바닐라 Pixel Agents란 (정확한 파악)

> 출처: 프로젝트 GitHub [`pixel-agents-hq/pixel-agents`](https://github.com/pixel-agents-hq/pixel-agents)
> (⭐ 약 8.4k, TypeScript) 및 동봉된 `README.upstream.md` / `CLAUDE.md`.

- **정체성**: “The game interface where AI agents build real things.” AI 코딩 에이전트를 픽셀아트 사무실의
  **애니메이션 캐릭터**로 보여주는 도구. 캐릭터는 하는 일에 따라 타이핑(쓰기)·읽기(검색)·대기 애니메이션을 한다.
- **배포 2형태**: ① VS Code 확장, ② `npx pixel-agents` 스탠드얼론 CLI(로컬 Fastify 서버 + 브라우저 SPA).
- **순수 관찰형(purely observational)**: *“No modifications to Claude Code are needed — Pixel Agents is
  purely observational.”* **자체적으로 LLM 을 호출하지 않는다.** 에이전트의 활동을 관찰해 그릴 뿐이다.
- **관찰 경로 2가지**: ① **Hooks 모드** — Claude 훅이 이벤트를 `POST /api/hooks/:providerId` 로 전송
  (서버 디스커버리 `~/.pixel-agents/server.json`). ② **Heuristic 모드** — `~/.claude/projects/…jsonl` 폴링.
- **통합 경계 `HookProvider`**: `normalizeHookEvent(raw)` 하나가 각 CLI 훅을 표준 `AgentEvent` 로 변환.
- **오늘의 한계(이 과제의 출발점)**: 아키텍처는 “agent-agnostic”을 표방하지만, **실제 구현된 provider는
  Claude Code 하나뿐**이다. 원문: *“Claude Code is the reference implementation today; **Codex, Gemini,
  Cursor, and others are on the roadmap**.”* → **다른 업체 모델 시각화는 로드맵일 뿐 실제로는 안 된다.**

---

## 3. 문제의식 · 목표

바닐라는 **Claude 세션만** 보여준다. 목표: **바닐라가 “로드맵”으로만 남겨둔 agent-agnostic 비전을 실제로
구현하여, OpenRouter의 여러 모델을 실제로 일하는 에이전트로 픽셀 오피스에 시각화한다.**

**핵심 통찰** — Pixel Agents는 관찰형이라 스스로 GPT를 들여다볼 수 없다. Claude는 훅이 내장돼 자동으로
이벤트를 쏘지만 OpenRouter 모델은 그렇지 않다. → **모델을 실행하는 쪽(브리지)이 모델의 실제 도구 호출을
이벤트로 대신 쏘아주면**, 코어를 고치지 않고도 원본 인그레스로 임의의 에이전트를 시각화할 수 있다.

---

## 4. 바닐라 대비 무엇이 달라졌나

| 구분 | 바닐라 Pixel Agents | 이 포크 |
|---|---|---|
| 시각화 대상 | **Claude Code 세션만** | Claude + **OpenRouter의 임의 모델**(GPT/Gemini/DeepSeek…) |
| 활동 구동 방식 | Claude 훅이 실제 활동을 자동 전송 | **모델의 실제 tool-use(function calling)** 가 캐릭터 활동을 구동 |
| 캐릭터 상태 라벨 | 영어(`Reading foo.ts`) | **한국어**(`foo.ts 읽는 중`, `파일 검색 중`, `실행 중: …`) |
| 설정 | — | **`.env` 기반**(API 키·모델 목록) |
| 코어/서버 소스 수정 | — | **없음(0줄)** — 기존 인그레스 재사용 ✅ |

수정/추가는 크게 **두 갈래**다.

### (A) OpenRouter 실제 tool-use 에이전트 브리지 — *핵심 기여*
`openrouter-agents/run.mjs` 가 `.env` 의 각 모델을 하나의 에이전트로 실행한다. 각 모델에게 **실제 도구**
(`list_dir` · `read_file` · `write_file`, 샌드박스 한정)를 function calling 으로 주고, **모델이 실제로
호출한 도구만** `PreToolUse/PostToolUse` 이벤트로 전송한다. 그래서 캐릭터의 활동은 모델의 실제 결정이며,
모델마다 도구 순서·종류가 다르게 나타난다. 각 모델은 자기 샌드박스에 실제 파일(`summary.md`)을 작성한다.

### (B) 캐릭터 상태 라벨 한국어 현지화
`server/src/providers/hook/claude/claude.ts` 의 `formatToolStatus()` 표시 문구를 한국어로 교체(함수 구조·
로직 불변, 문구만). 브리지가 보내는 활동도 이 라벨을 그대로 사용하므로 OpenRouter 캐릭터도 한국어로 표시된다.

---

## 5. 어떻게 동작하나 (아키텍처)

바닐라의 허브-앤-스포크 파이프라인은 그대로 두고, **왼쪽 입력원으로 OpenRouter 브리지만 추가로 꽂았다.**

```
                             [ 이 포크가 추가한 부분 ]
 openrouter-agents/run.mjs ──POST /api/hooks/claude──┐
   (모델 실행 + function calling 루프;                │
    '모델이 실제 호출한 도구'를 이벤트로 전송)         │
                                                      ▼
 Claude Code Hooks ─────POST /api/hooks/:providerId─→ HookProvider.normalizeHookEvent()
 JSONL transcripts ─────FileWatcher───────────────→          │  (원본 그대로)
                                                             ▼
                                                        AgentEvent(정규화)
                                                             ▼
                                            AgentRuntime → AgentStateStore → 브로드캐스트
                                                             ▼
                                              WebSocket/PostMessage → 픽셀 오피스 렌더링
```

**에이전트 루프(연출 없음)**: `run.mjs` 는 각 모델에 OpenRouter `chat/completions`(tools 포함)를 호출한다.
응답에 `tool_calls` 가 있으면 그 도구를 **실제로 실행**하고, 모델이 부른 도구를 pixel-agents 이름으로
매핑(`read_file→Read`, `list_dir→Glob`, `write_file→Write`)해 `PreToolUse`→실행→`PostToolUse` 를
전송한다. 도구 결과를 대화에 이어붙여 다시 호출하고, 도구 호출이 없으면 `Stop`. 합성 에이전트가 스캐너에
제거되지 않도록 진행 중 활동을 하트비트로 유지한다.

> **정확성 주석**: 현재 원본 런타임은 **단일 provider 구조**로, 훅 핸들러가 `providerId` 를 사실상 무시하고
> 등록된 provider(=`claude`)로 정규화한다(`server/src/hookEventHandler.ts` 의 `handleEvent(_providerId, …)`).
> 그래서 브리지는 기존 `claude` 인그레스를 재사용한다. Claude 세션과 **완전히 분리된 전용 provider 로 공존**
> 시키려면 런타임을 provider-id 라우팅으로 바꾸는 소규모 코어 수정이 필요하다(→ 8장 향후 과제).

---

## 6. 변경/추가 파일 요약

| 파일 | 유형 | 내용 |
|---|---|---|
| `openrouter-agents/run.mjs` | **신규** | OpenRouter 모델을 실제 tool-use 에이전트로 실행 + 이벤트 전송. 의존성 0(Node 내장 fetch). |
| `openrouter-agents/README.md` | **신규** | 브리지 사용법(한국어). |
| `.env.example` | 수정 | `OPENROUTER_API_KEY / OPENROUTER_MODELS` 슬롯 추가. |
| `.env` | 신규(로컬) | 실제 키·모델 설정. `.env*` 는 **gitignore** 되어 커밋 안 됨. |
| `server/src/providers/hook/claude/claude.ts` | 수정 | `formatToolStatus()` 표시 문구 → 한국어(로직 불변). |
| `README.md` (본 문서) | 수정 | 과제 제출용 요약. 원본은 `README.upstream.md` 로 보존. |

> `core/src/messages.ts` 는 빌드 시 AsyncAPI 에서 **자동 생성**되는 산출물이며 사람이 수정한 코드가 아니다.

---

## 7. 검증 (실측 — 실제로 동작함)

실행 중인 pixel-agents 서버에 붙여 **엔드투엔드 검증**을 마쳤다.

**① 캐릭터 생성** — WebSocket 으로 `agentCreated` 3건 확인 → 모델 3개가 각각 캐릭터로 등장.

**② 활동이 모델의 실제 도구 결정으로 구동됨** — `node openrouter-agents/run.mjs` 콘솔 로그:
```
🔧 [gpt-4o-mini]        list_dir → read_file("data.json") → read_file("project.md")
                        → read_file("notes/todo.txt") → write_file("summary.md")     (5회)
🔧 [gemini-2.5-flash]   list_dir → read_file×3 → read_file("notes/note1.txt")*
                        → list_dir("notes") → write_file("summary.md")               (7회)
🔧 [deepseek-chat-v3.1] list_dir → read_file×2 → list_dir("notes")
                        → read_file("notes/todo.txt") → write_file("summary.md")      (6회)
   * gemini 는 존재하지 않는 note1.txt 를 시도했다가 결과를 보고 스스로 방향을 바꿈
```
→ **모델마다 도구 순서·횟수가 다르다.** 연출이라면 매번 동일하지만, 실제 모델 결정이므로 매번 다르다.

**③ 라벨이 실제 도구를 그대로 반영(한국어)** — 관측된 캐릭터 라벨:
`파일 검색 중`(list_dir) · `data.json 읽는 중` · `project.md 읽는 중`(read_file) ·
`summary.md 작성 중`(write_file) · 완료 시 초록 체크.

**④ 실제 산출물** — 각 모델이 자기 `openrouter-agents/workspace/<모델>/summary.md` 에 실제 요약 파일을 작성.

---

## 8. 실행 방법

```powershell
# 1) 서버 (브라우저: http://127.0.0.1:3100)
node dist/cli.js --port 3100

# 2) 브라우저 ⚙️Settings → "Always Show Labels" 켜기  (라벨은 기본적으로 hover/선택 시에만 보임)

# 3) 실제 모델로 실행  (.env 에 OPENROUTER_API_KEY 필요)
node openrouter-agents/run.mjs
```

`.env` 예시(루트, gitignore됨):
```
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODELS=openai/gpt-4o-mini,google/gemini-2.5-flash,deepseek/deepseek-chat-v3.1
```
정확한 모델 슬러그는 <https://openrouter.ai/models> 에서 복사(**function calling 지원 모델** 권장).

---

## 9. 한계 및 향후 과제 (솔직한 범위)

- **Peer 구조**: 지금은 각 모델을 독립 에이전트로 실행한다. “리드가 서브에이전트를 스폰·핸드오프”하는
  **계층형 멀티에이전트**는 원본의 `SubagentStart/SubagentStop` 이벤트로 확장 가능(미구현).
- **provider id 재사용**: 브리지가 기존 `claude` 인그레스를 재사용하므로 내부 provider 는 `claude` 로
  라벨된다. Claude 세션과 **동시 공존**시키려면 전용 `openrouter` provider + 런타임 provider-id 라우팅
  (5장 참고)이 필요.
- **도구 범위**: 안전을 위해 도구를 샌드박스 파일 read/write 로 한정했다(임의 셸 실행 제외).

---

## 10. 라이선스 / 출처

- 원저작물: [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents) — **MIT License**(동봉 `LICENSE`).
  본 포크의 변경분도 동일 MIT.
- 캐릭터 스프라이트: [JIK-A-4, Metro City](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack).
- 원본 README 전문: [`README.upstream.md`](README.upstream.md) · 상세 아키텍처: [`CLAUDE.md`](CLAUDE.md).
