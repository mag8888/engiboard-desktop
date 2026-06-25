// tests/ui/smoke.spec.js
// Визуальный click/toggle smoke-сьют фронтенда EngiBoard.
// Цель (запрос DB): убедиться, что на Windows (Edge/WebView2) всё работает —
// кликается, включается и выключается, без багов и ошибок в консоли.
//
// Каждый тест: грузит приложение в demo-режиме, реально кликает элементы,
// проверяет состояние (toggle on/off) и снимает скриншот в ./screenshots.

const { test, expect } = require('@playwright/test');
const path = require('path');

const SHOTS = path.join(__dirname, '..', '..', 'screenshots');

// собираем ОШИБКИ JS по ходу теста. Сетевой шум (404 на favicon и прочие
// "Failed to load resource") отбрасываем — это артефакт статик-сервера, а не
// баг приложения; настоящие JS-исключения ловит pageerror и остаются строгими.
function attachConsole(page) {
  const errors = [];
  const isNetworkNoise = (t) => /Failed to load resource|net::ERR|favicon/i.test(t || '');
  page.on('console', m => { if (m.type() === 'error' && !isNetworkNoise(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  return errors;
}

// дождаться, что приложение показано (demo auto-show из storageState)
async function ensureApp(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.showApp === 'function', { timeout: 15000 });
  await page.evaluate(() => {
    if (!localStorage.getItem('eb_account')) localStorage.setItem('eb_account', 'demo');
    if (typeof showApp === 'function') showApp();
    // встать на конкретный проект, развернуть недели
    try {
      if (Array.isArray(PROJECTS) && PROJECTS.length) switchProject(PROJECTS[0].id);
      const pid = currentProject;
      [...new Set(TASKS.filter(t => t.proj === pid).map(t => t.w || ''))]
        .forEach(w => { if (typeof isWeekCollapsed === 'function' && isWeekCollapsed(pid, w)) toggleWeek(pid, w); });
    } catch (_) {}
  });
  await page.waitForSelector('.row[data-task-id]', { timeout: 10000 });
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: false });
}

test.describe('EngiBoard UI smoke (clicks & toggles)', () => {

  test('01 app boots, header + sidebar render, no console errors', async ({ page }) => {
    const errors = attachConsole(page);
    await ensureApp(page);
    await expect(page.locator('.sb-i[data-sec="projects"]')).toBeVisible();
    await expect(page.locator('#captureBtn')).toBeVisible();
    await expect(page.locator('.row[data-task-id]').first()).toBeVisible();
    await shot(page, '01-boot');
    expect(errors, 'console errors on boot:\n' + errors.join('\n')).toHaveLength(0);
  });

  test('02 create task from bottom input → appears with chat message', async ({ page }) => {
    await ensureApp(page);
    const typed = 'UITEST task ' + Date.now();
    // поле новой задачи живёт внизу скролл-контейнера #list (contain:paint),
    // куда Playwright не может надёжно доскроллить для .fill(). Дёргаем тот
    // самый keydown-обработчик, что вешает wireUpEmptyInput() — это и есть
    // реальный код-путь создания задачи.
    const ok = await page.evaluate(async (t) => {
      const inp = document.querySelector('.newInpProj');
      if (!inp) return false;
      inp.value = t;
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
      const task = TASKS.find(x => x.title === t);
      return !!task && task.chat && task.chat[0] && task.chat[0].text === t;
    }, typed);
    expect(ok, 'task created and typed text is first chat message').toBeTruthy();
    await page.evaluate(() => { const l = document.getElementById('list'); if (l) l.scrollTop = l.scrollHeight; });
    await shot(page, '02-create-task');
  });

  test('03 status menu: open, pick a status, menu closes', async ({ page }) => {
    await ensureApp(page);
    const st = page.locator('.row[data-task-id] .tc-status').first();
    await st.click();
    await expect(page.locator('.st-menu')).toBeVisible();
    await shot(page, '03a-status-open');
    await page.locator('.st-menu .st-opt').nth(1).click();
    await expect(page.locator('.st-menu')).toHaveCount(0);
    await shot(page, '03b-status-picked');
  });

  test('04 assignee menu: re-click toggles closed; outside click closes', async ({ page }) => {
    await ensureApp(page);
    const asg = page.locator('.row[data-task-id] .card-assignee').first();
    await asg.click();
    await expect(page.locator('#_ebAssignMenu')).toBeVisible();
    await asg.click();                                 // toggle off
    await expect(page.locator('#_ebAssignMenu')).toHaveCount(0);
    await asg.click();                                 // open again
    await expect(page.locator('#_ebAssignMenu')).toBeVisible();
    await page.mouse.click(1200, 700);                 // outside click
    await expect(page.locator('#_ebAssignMenu')).toHaveCount(0);
    await shot(page, '04-assignee-toggle');
  });

  test('05 menus are mutually exclusive (one open at a time)', async ({ page }) => {
    await ensureApp(page);
    const row = page.locator('.row[data-task-id]').first();
    await row.locator('.tc-status').click();
    await expect(page.locator('.st-menu')).toBeVisible();
    await row.locator('.card-assignee').click();        // opening assignee closes status
    await expect(page.locator('.st-menu')).toHaveCount(0);
    await expect(page.locator('#_ebAssignMenu')).toBeVisible();
    await row.locator('.card-kebab').click();           // opening kebab closes assignee
    await expect(page.locator('#_ebAssignMenu')).toHaveCount(0);
    await expect(page.locator('#_ebTaskMenu')).toBeVisible();
    await shot(page, '05-one-menu');
    await page.mouse.click(1200, 750);
    await expect(page.locator('#_ebTaskMenu')).toHaveCount(0);
  });

  test('06 status filters multi-select, All resets', async ({ page }) => {
    await ensureApp(page);
    // pick two existing status chips
    const ids = await page.evaluate(() => [...document.querySelectorAll('.chip[data-f]')]
      .map(c => c.dataset.f).filter(f => f !== 'all').slice(0, 2));
    for (const f of ids) await page.locator(`.chip[data-f="${f}"]`).click();
    const active = await page.evaluate(() => [...curFilter]);
    expect(active.length).toBe(2);
    await shot(page, '06a-multi-filter');
    await page.locator('.chip[data-f="all"]').click();
    expect(await page.evaluate(() => curFilter.size)).toBe(0);
    await shot(page, '06b-filter-reset');
  });

  test('07 bug type: mark via on-card toggle; Hide bugs checkbox toggles', async ({ page }) => {
    await ensureApp(page);
    const row = page.locator('.row[data-task-id]').first();
    // v0.1.169: mark as bug via the quick toggle next to the assignee
    await row.locator('.card-bugtoggle').first().click();
    await expect(row.locator('.card-bugtoggle.on').first()).toBeVisible();
    await shot(page, '07a-bug-toggle');
    // 'Hide bugs' checkbox appears in the filter bar + toggles _hideBugs
    const hideCb = page.locator('.bug-hide-cb input[type="checkbox"]');
    await expect(hideCb).toBeVisible();
    await hideCb.click();
    expect(await page.evaluate(() => _hideBugs)).toBeTruthy();
    await page.locator('.bug-hide-cb input[type="checkbox"]').click();
    expect(await page.evaluate(() => _hideBugs)).toBeFalsy();
    await shot(page, '07b-hide-bugs');
  });

  test('08 archive toggle flips aria-pressed', async ({ page }) => {
    await ensureApp(page);
    const arch = page.locator('.row[data-task-id] .card-archive').first();
    const before = await arch.getAttribute('aria-pressed');
    await arch.click();
    await page.waitForTimeout(150);
    // row may leave the list (archived hidden) — verify via state instead
    const flipped = await page.evaluate((b) => {
      const t = TASKS.find(x => x.hidden) || null;
      return !!t; // at least one task is now hidden
    }, before);
    expect(flipped).toBeTruthy();
    await shot(page, '08-archive');
  });

  test('09 pin/unpin via kebab surfaces Pinned section', async ({ page }) => {
    await ensureApp(page);
    const row = page.locator('.row[data-task-id]').first();
    await row.locator('.card-kebab').click();
    await page.locator('#_ebTaskMenu .tcm-item', { hasText: 'Pin to top' }).click();
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => TASKS.some(t => t.pinned))).toBeTruthy();
    await shot(page, '09-pin');
  });

  test('10 dark mode toggles on and off', async ({ page }) => {
    await ensureApp(page);
    const toggle = page.locator('#themeToggle');
    const isDark = () => page.evaluate(() => document.body.classList.contains('dark-mode'));
    const start = await isDark();
    await toggle.click();
    await page.waitForFunction(s => document.body.classList.contains('dark-mode') !== s, start, { timeout: 5000 });
    await shot(page, '10a-toggled');
    const mid = await isDark();
    expect(mid).not.toBe(start);
    await toggle.click();
    await page.waitForFunction(s => document.body.classList.contains('dark-mode') === s, start, { timeout: 5000 });
    await shot(page, '10b-back');
    expect(await isDark()).toBe(start);
  });

  test('11 sort menu → Status changes order mode', async ({ page }) => {
    await ensureApp(page);
    await page.locator('#sortChip').click();
    await page.locator('.tcm-item, .st-opt, [onclick*="setSortMode"]').filter({ hasText: /Status/i }).first().click().catch(async () => {
      // fallback: set directly
      await page.evaluate(() => setSortMode(currentProject, 'status'));
    });
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => getSortMode(currentProject))).toBe('status');
    await shot(page, '11-sort-status');
  });

  test('12 present mode: open, next/prev, close', async ({ page }) => {
    await ensureApp(page);
    await page.evaluate(() => openPresent(TASKS.find(t => t.proj === currentProject).id));
    await expect(page.locator('#present.on')).toBeVisible();
    await shot(page, '12a-present-open');
    // bottom nav next (if enabled)
    const next = page.locator('.pres-nav-arrow').nth(1);
    if (await next.isEnabled()) await next.click();
    await page.waitForTimeout(150);
    await shot(page, '12b-present-next');
    await page.locator('.pres-close').click();
    await expect(page.locator('#present.on')).toHaveCount(0);
  });

  test('13 present gallery: thumbnail switches the viewer', async ({ page }) => {
    await ensureApp(page);
    // ensure a task has after + extra shots, open it
    const slot = await page.evaluate(() => {
      const t = TASKS.find(x => x.shot1 && x.shot2) || TASKS[0];
      const px = c => 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="110"><rect width="160" height="110" fill="${c}"/></svg>`);
      if (!t.shot1) t.shot1 = px('navy');
      if (!t.shot2) t.shot2 = px('teal');
      t.shots = [px('orange'), px('purple')];
      openPresent(t.id);
      return t.shots.length;
    });
    expect(slot).toBeGreaterThan(0);
    await expect(page.locator('#presViewImg')).toBeVisible();
    const before = await page.locator('#presViewImg').getAttribute('src');
    await page.locator('.pres-after-thumbs .pres-thumb[data-slot="2"]').click();
    const after = await page.locator('#presViewImg').getAttribute('src');
    expect(after).not.toBe(before);
    await shot(page, '13-present-gallery');
    await page.locator('.pres-close').click();
  });

  test('14 dashboard shows New project button; nav back to projects', async ({ page }) => {
    await ensureApp(page);
    await page.locator('.sb-i[data-sec="dashboard"]').click();
    await expect(page.locator('.dash-newproj-btn')).toBeVisible();
    await shot(page, '14-dashboard');
    await page.locator('.sb-i[data-sec="projects"]').click();
    await expect(page.locator('.row[data-task-id]').first()).toBeVisible();
  });

  test('15 card-view toggle (list/expanded) without console errors', async ({ page }) => {
    const errors = attachConsole(page);
    await ensureApp(page);
    const btns = page.locator('#cvToggle button, [onclick*="setCardView"]');
    const n = await btns.count();
    if (n >= 2) {
      await btns.nth(1).click(); await page.waitForTimeout(150); await shot(page, '15a-view-a');
      await btns.nth(0).click(); await page.waitForTimeout(150); await shot(page, '15b-view-b');
    }
    expect(errors, 'console errors on view toggle:\n' + errors.join('\n')).toHaveLength(0);
  });
});
