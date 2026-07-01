#!/usr/bin/env node
/**
 * OpenRouter 모델 → Pixel Agents 실시간 시각화 (실제 tool-use)
 * ------------------------------------------------------------------
 * 여러 OpenRouter 모델을 각각 하나의 에이전트로 실행한다. 각 모델에게 실제 도구
 * (list_dir/read_file/write_file)를 function calling 으로 주고, **모델이 실제로
 * 호출한 도구만** 캐릭터 활동으로 pixel-agents 서버에 전송한다.
 * → 화면은 모델의 실제 결정으로 구동된다(하드코딩된 활동 없음).
 *
 * 도구는 `openrouter-agents/workspace/<모델>/` 샌드박스 안에서만 동작한다
 * (경로 이스케이프 차단, 임의 셸 실행 없음).
 *
 * 검증 포인트:
 *   - 콘솔의 `🔧 [모델] read_file("project.md")` 로그와 브라우저 캐릭터 애니메이션/라벨이 일치.
 *   - 같은 작업을 다시 돌리면 모델 결정에 따라 도구 순서가 달라짐(연출이면 항상 동일).
 *   - `workspace/<모델>/summary.md` 등 모델이 실제로 쓴 파일이 생성됨.
 *
 * 사용법:
 *   1) node dist/cli.js --port 3100           # 서버
 *   2) 브라우저 http://127.0.0.1:3100 → ⚙️Settings에서 "Always Show Labels" 켜기
 *   3) node openrouter-agents/run.mjs          # .env 의 OPENROUTER_API_KEY 필요
 *      node openrouter-agents/run.mjs --seconds 60   # 60초 뒤 자동 퇴근
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const WORKSPACE_ROOT = path.join(__dirname, 'workspace');
const SERVER_JSON = path.join(os.homedir(), '.pixel-agents', 'server.json');
const HOOK_PATH = '/api/hooks/claude';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const HEARTBEAT_MS = 2000; // 합성 에이전트 유지용 하트비트
const MAX_STEPS = 8; // 무한루프 방지

const argv = process.argv.slice(2);
const secondsIdx = argv.indexOf('--seconds');
const RUN_SECONDS = secondsIdx !== -1 ? Number(argv[secondsIdx + 1]) : 0;

// ── .env / 서버 디스커버리 / 훅 전송 (self-contained) ─────────
function loadEnv() {
  const envPath = path.join(REPO_ROOT, '.env');
  const out = {};
  if (!fs.existsSync(envPath)) return out;
  for (const line of fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

function readServer() {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(SERVER_JSON, 'utf-8'));
  } catch {
    console.error(`\n[에러] pixel-agents 서버를 찾을 수 없습니다: ${SERVER_JSON}\n      먼저: node dist/cli.js --port 3100\n`);
    process.exit(1);
  }
  const token = raw.token ?? raw.authToken;
  if (!raw.port || !token) {
    console.error('[에러] server.json 에 port/token 이 없습니다.');
    process.exit(1);
  }
  return { port: raw.port, token };
}

async function hook(server, payload) {
  try {
    const res = await fetch(`http://127.0.0.1:${server.port}${HOOK_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${server.token}` },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) console.error('[에러] 401 — 서버 재시작 시 토큰 변경. 데모를 다시 실행하세요.');
    return res.status;
  } catch (e) {
    console.error(`[경고] 훅 전송 실패: ${e.message}`);
    return 0;
  }
}

// cwd 의 basename 이 캐릭터 이름(자막)이 된다(fileWatcher.ts: path.basename(cwd)).
// 각 에이전트에 모델명 경로를 줘서 캐릭터마다 연결된 모델명이 표시되게 한다.
const evSessionStart = (a) => ({ session_id: a.sessionId, hook_event_name: 'SessionStart', source: 'startup', cwd: a.cwd });
const evPreTool = (a) => ({ session_id: a.sessionId, hook_event_name: 'PreToolUse', tool_name: a.tool, tool_input: a.toolInput ?? {} });
const evPostTool = (a) => ({ session_id: a.sessionId, hook_event_name: 'PostToolUse', tool_name: a.tool });
const evStop = (a) => ({ session_id: a.sessionId, hook_event_name: 'Stop' });
const evSessionEnd = (a) => ({ session_id: a.sessionId, hook_event_name: 'SessionEnd', reason: 'clear' });

// ── 실제 도구 (샌드박스 한정) ────────────────────────────────
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: '작업 폴더 내 디렉터리의 파일/폴더 목록을 반환한다.',
      parameters: { type: 'object', properties: { path: { type: 'string', description: '작업 폴더 기준 상대 경로. 기본값 "."' } }, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '작업 폴더 내 파일의 텍스트 내용을 읽는다.',
      parameters: { type: 'object', properties: { path: { type: 'string', description: '읽을 파일의 상대 경로' } }, required: ['path'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: '작업 폴더 내 파일을 생성/덮어쓴다.',
      parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
    },
  },
];

// function 이름 → pixel-agents 도구/입력 매핑 (애니메이션·라벨용)
const TOOL_MAP = {
  list_dir: { tool: 'Glob', inputFrom: () => ({}) },
  read_file: { tool: 'Read', inputFrom: (a) => ({ file_path: a.path || '' }) },
  write_file: { tool: 'Write', inputFrom: (a) => ({ file_path: a.path || '' }) },
};

// 샌드박스 경로 안전 해석
function resolveSafe(root, p) {
  const resolved = path.resolve(root, p || '.');
  const rootAbs = path.resolve(root);
  if (resolved !== rootAbs && !resolved.startsWith(rootAbs + path.sep)) {
    throw new Error('경로가 작업 폴더를 벗어났습니다');
  }
  return resolved;
}

function executeTool(name, args, sandbox) {
  if (name === 'list_dir') {
    const dir = resolveSafe(sandbox, args.path || '.');
    const entries = fs.readdirSync(dir, { withFileTypes: true }).map((d) => (d.isDirectory() ? d.name + '/' : d.name));
    return `항목(${entries.length}): ${entries.join(', ') || '(비어 있음)'}`;
  }
  if (name === 'read_file') {
    const f = resolveSafe(sandbox, args.path);
    return fs.readFileSync(f, 'utf-8').slice(0, 4000);
  }
  if (name === 'write_file') {
    const f = resolveSafe(sandbox, args.path);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, args.content ?? '', 'utf-8');
    return `작성 완료: ${args.path} (${Buffer.byteLength(args.content ?? '')} bytes)`;
  }
  return `알 수 없는 도구: ${name}`;
}

// 각 에이전트 작업 폴더 시드(탐색할 실제 파일 제공)
function seedWorkspace(sandbox) {
  fs.mkdirSync(path.join(sandbox, 'notes'), { recursive: true });
  fs.writeFileSync(
    path.join(sandbox, 'project.md'),
    '# 데모 프로젝트\n픽셀 오피스 에이전트 도구-호출 시각화 검증용 샘플입니다.\n- 구성: data.json, notes/todo.txt\n- 목표: 파일을 탐색하고 summary.md 를 작성\n',
    'utf-8',
  );
  fs.writeFileSync(
    path.join(sandbox, 'data.json'),
    JSON.stringify({ project: 'pixel-office', purpose: 'tool-call visualization', files: ['project.md', 'data.json', 'notes/todo.txt'] }, null, 2),
    'utf-8',
  );
  fs.writeFileSync(path.join(sandbox, 'notes', 'todo.txt'), '1. 파일 구조 파악\n2. 핵심 요약\n3. summary.md 작성\n', 'utf-8');
}

// ── OpenRouter (tool 지원) ───────────────────────────────────
async function chat(apiKey, model, messages) {
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/pixel-agents-hq/pixel-agents',
      'X-Title': 'Pixel Agents OpenRouter Agent Loop',
    },
    body: JSON.stringify({ model, messages, tools: TOOLS, tool_choice: 'auto', max_tokens: 700 }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error?.message || `HTTP ${res.status}`);
  return j?.choices?.[0]?.message ?? { content: '' };
}

const setThinking = (a) => { a.tool = 'Bash'; a.toolInput = { command: '응답 생성 중' }; };
const setActivity = (a, tool, input) => { a.tool = tool; a.toolInput = input; };
const summarizeArgs = (args) => (args.path ? `"${args.path}"` : JSON.stringify(args).slice(0, 40));

const SYS =
  '너는 픽셀 오피스에서 일하는 AI 에이전트다. 반드시 제공된 도구(list_dir, read_file, write_file)를 ' +
  '사용해 작업 폴더를 탐색하고 작업을 수행하라. 추측하지 말고 실제로 파일을 읽어라. 한 번에 한두 개의 ' +
  '도구를 호출하고 결과를 본 뒤 다음을 결정하라. 작업이 끝나면 도구 없이 한국어로 최종 요약을 답하라.';
const DEFAULT_TASK =
  '작업 폴더를 list_dir 로 살펴보고, 파일 2~3개를 read_file 로 읽은 뒤, 핵심을 요약한 summary.md 를 ' +
  'write_file 로 작성하라. 끝나면 무엇을 했는지 한국어로 간단히 요약하라.';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 한 에이전트의 실제 tool-use 루프 ─────────────────────────
async function runAgentLoop(server, agent, apiKey, task) {
  seedWorkspace(agent.sandbox);
  await hook(server, evSessionStart(agent));
  agent.status = 'working';
  setThinking(agent);
  await hook(server, evPreTool(agent)); // 캐릭터 즉시 등장

  const messages = [
    { role: 'system', content: SYS },
    { role: 'user', content: task },
  ];
  let final = '';

  for (let step = 0; step < MAX_STEPS; step++) {
    setThinking(agent); // 모델 호출 동안 '추론 중' (하트비트가 유지)
    let msg;
    try {
      msg = await chat(apiKey, agent.model, messages);
    } catch (e) {
      console.error(`  ✖ [${agent.short}] 호출 실패: ${e.message}`);
      final = `[호출 실패] ${e.message}`;
      break;
    }
    messages.push(msg);
    const calls = msg.tool_calls || [];
    if (calls.length === 0) {
      final = msg.content || '(완료)';
      break;
    }
    for (const tc of calls) {
      const fn = tc.function?.name;
      let args = {};
      try {
        args = JSON.parse(tc.function?.arguments || '{}');
      } catch {
        /* 인자 파싱 실패 시 빈 객체 */
      }
      const map = TOOL_MAP[fn] || { tool: 'Bash', inputFrom: () => ({ command: fn }) };
      agent.toolCalls = (agent.toolCalls ?? 0) + 1;
      setActivity(agent, map.tool, map.inputFrom(args));
      await hook(server, evPreTool(agent)); // 모델이 '실제로' 부른 도구
      console.log(`  🔧 [${agent.short}] ${fn}(${summarizeArgs(args)})`);
      let result;
      try {
        result = executeTool(fn, args, agent.sandbox);
      } catch (e) {
        result = `오류: ${e.message}`;
      }
      await hook(server, evPostTool(agent));
      messages.push({ role: 'tool', tool_call_id: tc.id, content: String(result).slice(0, 2000) });
    }
  }

  agent.status = 'done';
  await hook(server, evStop(agent));
  console.log(`\n  ── ${agent.model} ── (도구 호출 ${agent.toolCalls ?? '?'}회)\n  ${String(final).trim().replace(/\n/g, '\n  ')}`);
}

// ── 메인 ─────────────────────────────────────────────────────
async function main() {
  const env = loadEnv();
  const server = readServer();
  const apiKey = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || '';
  const task = env.OPENROUTER_TASK && argv.includes('--use-env-task') ? env.OPENROUTER_TASK : DEFAULT_TASK;
  const models = (env.OPENROUTER_MODELS || 'openai/gpt-4o-mini,google/gemini-2.5-flash,deepseek/deepseek-chat-v3.1')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);

  if (!apiKey) {
    console.error('\n[에러] OPENROUTER_API_KEY 가 없습니다. .env 에 넣으세요. (이 스크립트는 실제 호출이라 키 필수)\n');
    process.exit(1);
  }

  console.log(`\n  pixel-agents 서버: http://127.0.0.1:${server.port}`);
  console.log(`  실제 tool-use 루프 (연출 없음). 모델 ${models.length}개:`);
  models.forEach((m) => console.log(`    · ${m}`));
  console.log(`  작업: ${task}`);
  console.log(`\n  ⚠️  브라우저에서 라벨이 안 보이면 ⚙️Settings → "Always Show Labels" 를 켜세요.\n`);

  const agents = models.map((model) => {
    const short = model.split('/').pop();
    const slug = model.replace(/[^a-z0-9]/gi, '-');
    return {
      sessionId: `orl-${slug}-${crypto.randomUUID().slice(0, 8)}`,
      model,
      short,
      // 각 모델이 실제로 작업하는 폴더(모델명으로 명명). 이 폴더명이 곧 캐릭터 이름(자막)이 된다.
      sandbox: path.join(WORKSPACE_ROOT, short),
      cwd: `${WORKSPACE_ROOT.replace(/\\/g, '/')}/${short}`,
      tool: 'Bash',
      toolInput: {},
      status: 'starting',
    };
  });

  // 하트비트: working=현재 활동 재전송, done=Stop 재전송 → 캐릭터 유지
  const heartbeat = setInterval(() => {
    for (const a of agents) {
      if (a.status === 'working') hook(server, evPreTool(a));
      else if (a.status === 'done') hook(server, evStop(a));
    }
  }, HEARTBEAT_MS);

  await Promise.all(agents.map((a) => runAgentLoop(server, a, apiKey, task)));

  console.log(`\n  ✔ 완료. workspace/<모델>/ 에 모델이 실제로 쓴 파일을 확인하세요.`);

  const shutdown = async () => {
    clearInterval(heartbeat);
    for (const a of agents) await hook(server, evSessionEnd(a));
    console.log('\n  캐릭터 퇴근(SessionEnd) 완료. 종료합니다.');
    process.exit(0);
  };
  process.on('SIGINT', shutdown);

  if (RUN_SECONDS > 0) {
    await sleep(RUN_SECONDS * 1000);
    await shutdown();
  } else {
    console.log('\n  브라우저에서 확인하세요. 종료하려면 Ctrl+C (캐릭터 퇴근).');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
