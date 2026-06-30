// tests/ui/regression.spec.js
// Regression-набор: каждое исправление сессии v0.1.181–v0.1.183 закреплено
// тестом. Гоняет тот же dist/index.html, что и десктоп-сборка (и в CI на
// Windows/Edge·WebView2). Если будущая правка вернёт баг — тест упадёт.
//
// Покрытие:
//   R1 escapeHtml экранирует HTML (база против stored-XSS)
//   R2 safeColor валидирует цвет (presence-аватары / editor)
//   R3 linkifyText: голый домен линкуется, домен e-mail — нет, www/http — да
//   R4 ручной реордер авто-переключает проект в Manual и держит порядок
//   R5 present-режим не падает на статусе вне диапазона (STATUSES fallback)
//   R6 заголовок чата экранирует вредоносное имя задачи (chatTitle XSS)
//   R7 новая локальная задача создаётся с w:'' s:7 (не устаревшая неделя 26W17)
//   R8 ключевой код фиксов присутствует в отдаваемом фронтенде

const { test, expect } = require('@playwright/test');

async function load(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.showApp === 'function', { timeout: 15000 });
  await page.evaluate(() => {
    if (!localStorage.getItem('eb_account')) localStorage.setItem('eb_account', 'demo');
    if (typeof showApp === 'function') showApp();
    try { if (Array.isArray(PROJECTS) && PROJECTS.length) switchProject(PROJECTS[0].id); } catch (_) {}
  });
  await page.waitForSelector('.row[data-task-id]', { timeout: 10000 });
}

// собрать настоящие JS-ошибки (сетевой шум статик-сервера отбрасываем)
function jsErrors(page) {
  const e = [];
  page.on('pageerror', x => e.push('pageerror: ' + x.message));
  page.on('console', m => {
    if (m.type() === 'error' && !/Failed to load resource|favicon|net::ERR/i.test(m.text())) e.push(m.text());
  });
  return e;
}

test.describe('EngiBoard regression — session fixes stay in', () => {

  test('R1 escapeHtml neutralises HTML', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => escapeHtml('<img src=x onerror=alert(1)>'));
    expect(r).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });

  test('R2 safeColor validates colours', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => ({
      hex: safeColor('#0EA5E9'),
      rgb: safeColor('rgb(1,2,3)'),
      inj: safeColor('";onload=alert(1)'),
    }));
    expect(r.hex).toBe('#0EA5E9');
    expect(r.rgb).toBe('rgb(1,2,3)');
    expect(r.inj).not.toContain('"');           // injection collapses to a safe fallback
  });

  test('R3 linkify: bare domain links, e-mail domain does not', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => ({
      bare: /class="chat-link"/.test(linkifyText('see google.com please')),
      email: /<a\s/.test(linkifyText('write to bob@google.com ok')),
      www: /class="chat-link"/.test(linkifyText('go www.example.org/x')),
      http: /class="chat-link"/.test(linkifyText('open https://foo.bar/baz')),
    }));
    expect(r.bare).toBe(true);
    expect(r.email).toBe(false);
    expect(r.www).toBe(true);
    expect(r.http).toBe(true);
  });

  test('R4 manual reorder flips sort to Manual and moves the task', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      const pid = currentProject;
      const inP = TASKS.filter(t => t.proj === pid);
      const byW = {};
      inP.forEach(t => { (byW[t.w || ''] = byW[t.w || ''] || []).push(t); });
      const wk = Object.keys(byW).find(w => byW[w].length >= 2);
      if (!wk) return { skip: true };
      setSortMode(pid, 'status');                 // non-manual sort active
      const firstId = byW[wk][0].id;
      moveTaskDown(firstId);                       // manual reorder
      const after = TASKS.filter(t => t.proj === pid && (t.w || '') === wk).map(t => t.id);
      return { skip: false, mode: getSortMode(pid), movedFromTop: after[0] !== firstId };
    });
    test.skip(r.skip === true, 'no week with 2+ tasks in demo data');
    expect(r.mode).toBe('manual');                // the fix: auto-switch so the move sticks
    expect(r.movedFromTop).toBe(true);
  });

  test('R5 present mode survives an out-of-range status', async ({ page }) => {
    const errs = jsErrors(page);
    await load(page);
    const on = await page.evaluate(() => {
      const t = TASKS.find(x => x.proj === currentProject);
      t.s = 999;                                  // out of STATUSES range
      if (typeof openPresent === 'function') openPresent(t.id);
      return document.getElementById('present')?.classList.contains('on');
    });
    await page.waitForTimeout(300);
    expect(errs.join('\n')).not.toMatch(/STATUSES|Cannot read|undefined .*\bcls\b/);
    expect(on).toBe(true);
  });

  test('R6 chat title escapes a malicious task name', async ({ page }) => {
    await load(page);
    const res = await page.evaluate(() => {
      window.__xss = false;
      const t = TASKS.find(x => x.proj === currentProject);
      t.n = '<img src=x onerror="window.__xss=true">';
      t.title = t.n;
      if (typeof openChatForTask === 'function') openChatForTask(t.id);
      return { html: document.getElementById('chatTitle')?.innerHTML || '', xss: window.__xss };
    });
    expect(res.html).not.toContain('<img');       // rendered escaped, not as a tag
    expect(res.xss).toBe(false);                  // onerror never fired
  });

  test('R7 new local task uses an empty week and Upcoming status (no 26W17)', async ({ page }) => {
    await load(page);
    const t = await page.evaluate(async () => {
      const pid = currentProject;
      await createTaskFor(pid, 'RegTest_' + Date.now(), false);   // local path (no cloud)
      const created = TASKS.filter(x => x.proj === pid && /^RegTest_/.test(x.title || x.n || '')).pop();
      return created ? { w: created.w, s: created.s } : null;
    });
    expect(t).not.toBeNull();
    expect(t.w).toBe('');                          // was the stale '26W17'
    expect(t.s).toBe(7);                           // aligned with cloud default (Upcoming)
  });

  test('R8 key fix code is present in the served frontend', async ({ page }) => {
    const src = await (await page.request.get('/index.html')).text();
    expect(src).toContain('_ensureManualSort');           // reorder fix wired
    expect(src).toContain('function safeColor');          // colour guard
    expect(src).toContain('escapeHtml(name)');            // Team-panel XSS fix
    expect(src).toContain('STATUSES[t.s] || STATUSES[0]'); // present-mode fallback
  });
});
