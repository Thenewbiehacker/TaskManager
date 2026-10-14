import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const project = resolve(import.meta.dirname, '..');
const serverFile = join(project, 'src', 'server.mjs');

function waitForUrl(child) {
  return new Promise((resolvePromise, reject) => {
    let stdout = '';
    const timeout = setTimeout(() => reject(new Error(`Server did not start: ${stdout}`)), 8000);
    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
      const match = stdout.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) { clearTimeout(timeout); resolvePromise(`http://127.0.0.1:${match[1]}`); }
    });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited (${code}): ${stdout}`)); });
  });
}
function nextMcpMessage(rl) {
  return new Promise(resolvePromise => rl.once('line', line => resolvePromise(JSON.parse(line))));
}

test('local task website seeds Notion snapshot and exposes REST plus MCP operations', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'nitc-hq-tasks-'));
  const dbFile = join(temp, 'tasks.sqlite');
  const server = spawn(process.execPath, [serverFile], { env: { ...process.env, PORT: '0', NITC_TASKS_DB: dbFile }, stdio: ['ignore', 'pipe', 'pipe'] });
  let mcp;
  try {
    const base = await waitForUrl(server);
    const homeHtml = await (await fetch(base)).text();
    assert.match(homeHtml, /rel="help" href="\/agent-guide\.html"/);
    assert.match(homeHtml, /href="\/agent-guide\.html">AI agent guide/);
    const guideResponse = await fetch(`${base}/agent-guide.html`);
    assert.equal(guideResponse.status, 200);
    const guide = await guideResponse.text();
    assert.match(guide, /Never delete tasks/);
    assert.match(guide, /Asia\/Kolkata/);
    assert.match(guide, /design-polish request authorizes presentation changes only/i);
    const health = await (await fetch(`${base}/api/health`)).json();
    assert.equal(health.timezone, 'Asia/Kolkata');

    const seeded = await (await fetch(`${base}/api/tasks?view=all`)).json();
    assert.equal(seeded.tasks.length, 15);
    assert.equal(seeded.tasks.filter(task => task.done).length, 7);
    assert.equal(seeded.tasks.filter(task => !task.done).length, 8);
    const seedSnapshot = JSON.parse(await readFile(join(project, 'data', 'seed.json'), 'utf8'));
    const normalize = task => ({ id: task.id, title: task.title, course: task.course, type: task.type, dueDate: task.dueDate, notes: task.notes, priority: task.priority, done: task.done });
    assert.deepEqual(seeded.tasks.map(normalize).sort((a, b) => a.id.localeCompare(b.id)), seedSnapshot.map(normalize).sort((a, b) => a.id.localeCompare(b.id)));
    assert.equal(seeded.tasks.find(task => task.title === 'Write GP lab record').dueDate, '2026-10-12');
    assert.equal(seeded.tasks.find(task => task.title === 'Clean my retainers').priority, null);
    const todo = await (await fetch(`${base}/api/tasks?view=todo`)).json();
    assert.equal(todo.tasks[0].priority, 10);
    assert.equal(todo.tasks.find(task => task.title === 'Write GP lab record'), undefined);

    const invalid = await fetch(`${base}/api/tasks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Bad priority', type: 'Coursework', course: 'Mechanics', priority: 11 }) });
    assert.equal(invalid.status, 400);
    const invalidDate = await fetch(`${base}/api/tasks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Bad date', type: 'Coursework', course: 'Mechanics', priority: 3, dueDate: '2026-02-31' }) });
    assert.equal(invalidDate.status, 400);
    const created = await (await fetch(`${base}/api/tasks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Agent-created mechanics task', type: 'Coursework', course: 'Mechanics', priority: 4, dueDate: null, notes: 'Test record' }) })).json();
    assert.equal(created.task.course, 'Mechanics');
    const taskId = created.task.id;

    const patched = await (await fetch(`${base}/api/tasks/${taskId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ notes: 'Updated note', type: 'Miscellaneous' }) })).json();
    assert.equal(patched.task.notes, 'Updated note');
    assert.equal(patched.task.course, null);
    await fetch(`${base}/api/tasks/${taskId}/complete`, { method: 'POST' });
    assert.equal((await (await fetch(`${base}/api/tasks/${taskId}`)).json()).task.done, true);
    await fetch(`${base}/api/tasks/${taskId}/reopen`, { method: 'POST' });
    assert.equal((await (await fetch(`${base}/api/tasks/${taskId}`)).json()).task.done, false);
    const search = await (await fetch(`${base}/api/tasks?q=Updated%20note`)).json();
    assert.equal(search.tasks.length, 1);

    mcp = spawn(process.execPath, [serverFile, '--mcp'], { env: { ...process.env, NITC_TASKS_DB: dbFile }, stdio: ['pipe', 'pipe', 'pipe'] });
    const rl = createInterface({ input: mcp.stdout, crlfDelay: Infinity });
    let requestId = 1;
    const send = async (method, params = {}) => {
      const id = requestId++;
      const responsePromise = nextMcpMessage(rl);
      mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      return (await responsePromise).result;
    };
    const init = await send('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    assert.equal(init.serverInfo.name, 'nitc-hq-tasks');
    const listed = await send('tools/list');
    assert.ok(listed.tools.some(tool => tool.name === 'create_task'));
    const searched = await send('tools/call', { name: 'search_tasks', arguments: { q: 'Agent-created mechanics task' } });
    assert.equal(searched.structuredContent.tasks.length, 1);
    assert.ok(listed.tools.find(tool => tool.name === 'complete_task').description.includes('without deleting'));
    const mcpId = searched.structuredContent.tasks[0].id;
    const mcpUpdated = await send('tools/call', { name: 'update_task', arguments: { id: mcpId, notes: 'Edited through MCP' } });
    assert.equal(mcpUpdated.structuredContent.task.notes, 'Edited through MCP');
    const mcpCompleted = await send('tools/call', { name: 'complete_task', arguments: { id: mcpId } });
    assert.equal(mcpCompleted.structuredContent.task.done, true);
    const mcpReopened = await send('tools/call', { name: 'reopen_task', arguments: { id: mcpId } });
    assert.equal(mcpReopened.structuredContent.task.done, false);
    const courses = await send('tools/call', { name: 'list_courses', arguments: {} });
    assert.equal(courses.structuredContent.courses.length, 9);
  } finally {
    if (mcp) mcp.kill('SIGTERM');
    server.kill('SIGTERM');
    await rm(temp, { recursive: true, force: true });
  }
});
