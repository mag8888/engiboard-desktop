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
//   R9  кнопки ✎/✕ в чате переживают отправку сообщения (один рендерер)
//   R10 карточку с длинным чатом можно сжать обратно (чат скроллится)
//   R11 чипы undo/redo отражают стек; реордер отменяется
//   R12 задача создаётся прямо в нужной неделе; закрытая неделя не принимает
//   R13 в редакторе скриншотов нет комментариев, но сохранённые не уничтожены
//   R14 доп. AFTER-скриншот реально долетает; лимит 3; BEFORE остаётся один
//   R15 редактор статусов доступен, цвет применяется, приоритет сортирует,
//       переименование переживает смену языка
//   R16 картинки в XLSX привязаны к ячейке (twoCell, без отрицательных offset)
//   R17 PDF: диалог с периодом и типами, компакт по умолчанию и реально меньше
//   R18 Notes-колонка справа в каждой строке; недельная полоса вынесена влево
//   R19 чип компании не наезжает на название проекта (26W33 texts overlap)
//   R20 полоса AFTER-слотов 1·2·3: выбор, × удаляет именно показанную
//   R21 комментарии убраны и из лайтбокса главного окна (данные целы)
//   R22 чат в карточке сворачивается; свёрнутая карточка компактна даже после ручного растяжения
//   R23 презентация: навигация ←/→ внизу по центру карточки, счётчик между стрелками
//   R24 редактор: Polyline / Callout / Dimension снова на панели (регресс v0.1.189)

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

  // ── v0.1.195 — fixes from the client call 2026-08-28 ───────────────────

  test('R9 chat edit/delete controls survive sending a message', async ({ page }) => {
    // The reported bug: the ✎/✕ controls vanished after sending a message and
    // only came back after an unrelated status change, because the send path
    // rebuilt the panel from its own copy of the markup that had lost them.
    await load(page);
    const taskId = await page.evaluate(() => document.querySelector('.row[data-task-id]').dataset.taskId);
    const panel = page.locator(`#ntChat-${taskId}`);

    const before = await panel.locator('.msg-actions').count();
    expect(before).toBeGreaterThan(0);                    // full render has them

    const input = page.locator(`.row[data-task-id="${taskId}"] .nt-chat-input input`);
    await input.fill('RegTest R9 message');
    await input.press('Enter');
    await expect(panel).toContainText('RegTest R9 message');

    // ...and they must still be there on the incrementally re-rendered panel.
    expect(await panel.locator('.msg-actions').count()).toBeGreaterThan(before);
  });

  test('R9b every chat surface renders through the one shared renderer', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      const t = TASKS.find(x => Array.isArray(x.chat) && x.chat.length);
      if (!t) return null;
      const html = renderChatList(t.chat, t.id, { limit: 8 });
      return {
        actions: /class="msg-actions"/.test(html),
        edit: /editChatMsg\(/.test(html),
        del: /deleteChatMsg\(/.test(html),
        // read-only surfaces can opt out, but must still render the message
        readonly: !/class="msg-actions"/.test(renderChatList(t.chat, t.id, { actions: false })),
      };
    });
    expect(r).not.toBeNull();
    expect(r.actions).toBe(true);
    expect(r.edit).toBe(true);
    expect(r.del).toBe(true);
    expect(r.readonly).toBe(true);
  });

  test('R9c tail rendering keeps real chat indices for edit/delete', async ({ page }) => {
    // renderChatList shows only the last N messages; the ✎/✕ handlers must
    // still address the message's real index, or they would edit the wrong one.
    await load(page);
    const r = await page.evaluate(() => {
      const chat = Array.from({ length: 12 }, (_, i) => ({ a: 'AS', text: 'm' + i }));
      const html = renderChatList(chat, 'tX', { limit: 8 });
      const idx = [...html.matchAll(/deleteChatMsg\('tX',(\d+)\)/g)].map(m => +m[1]);
      return { count: idx.length, first: idx[0], last: idx[idx.length - 1] };
    });
    expect(r.count).toBe(8);
    expect(r.first).toBe(4);                              // 12 - 8, not 0
    expect(r.last).toBe(11);
  });

  test('R10 a card with a long chat can be shrunk back down', async ({ page }) => {
    // v0.1.190 fixed this, v0.1.193 re-broke it by removing the chat's
    // max-height so the panel demanded its content height again.
    await load(page);
    const taskId = await page.evaluate(() => {
      const t = TASKS.find(x => x.id === document.querySelector('.row[data-task-id]').dataset.taskId);
      t.chat = Array.from({ length: 40 }, (_, i) => ({ a: 'AS', ts: '10:00', text: 'long message number ' + i }));
      t.h = 600; render();
      return t.id;
    });
    const row = page.locator(`.row[data-task-id="${taskId}"]`);
    const tall = await row.evaluate(el => el.getBoundingClientRect().height);
    expect(tall).toBeGreaterThan(400);

    await page.evaluate((id) => { TASKS.find(x => x.id === id).h = 120; render(); }, taskId);
    const short = await page.locator(`.row[data-task-id="${taskId}"]`).evaluate(el => el.getBoundingClientRect().height);
    expect(short).toBeLessThan(200);                      // was stuck near `tall`
  });

  test('R19 the company chip does not overlap the project title', async ({ page }) => {
    // Этап-4 26W33 "The texts overlap". The sheet row carries a screenshot (not
    // present in the text export) with a red box around the header: the company
    // chip lived inside .brand, a fixed 146px flex-shrink:0 box aligned with the
    // sidebar, and overflowed straight over the project name beside it.
    await load(page);
    const r = await page.evaluate(() => {
      setMyCompany('Ingenieurbüro Luhmirins GmbH');   // a realistically long name
      updateMyCompanyLabel();
      const chip = document.getElementById('myCompanyLabel');
      const picker = document.getElementById('projPicker');
      const c = chip.getBoundingClientRect(), p = picker.getBoundingClientRect();
      return {
        visible: getComputedStyle(chip).display !== 'none',
        insideBrand: !!chip.closest('.brand'),
        gap: Math.round(p.left - c.right),
      };
    });
    expect(r.visible).toBe(true);
    expect(r.insideBrand).toBe(false);      // moved out of the fixed-width box
    expect(r.gap).toBeGreaterThanOrEqual(0); // no overlap with the project title
  });

  test('R18 every task row has a Notes window on the right that persists', async ({ page }) => {
    // Этап-4 LIST VIEW #4 "Add a Notes Window on the Right". t.notes existed
    // but was only editable inside presentation mode, so jotting a note meant
    // opening the presentation and closing it again.
    await load(page);
    const taskId = await page.evaluate(() => document.querySelector('.row[data-task-id]').dataset.taskId);
    const notes = page.locator(`.row[data-task-id="${taskId}"] .notes-area`);
    await expect(notes).toBeVisible();

    await notes.fill('R18 note');
    const r = await page.evaluate((id) => {
      const stored = TASKS.find(x => x.id === id).notes;
      render();                                       // survives a re-render?
      return { stored, rendered: document.querySelector(`.row[data-task-id="${id}"] .notes-area`).value };
    }, taskId);
    expect(r.stored).toBe('R18 note');
    expect(r.rendered).toBe('R18 note');
  });

  test('R18b typing in Notes does not drag the row or open presentation', async ({ page }) => {
    await load(page);
    const taskId = await page.evaluate(() => document.querySelector('.row[data-task-id]').dataset.taskId);
    await page.locator(`.row[data-task-id="${taskId}"] .notes-area`).click();
    await page.keyboard.type('hello');
    expect(await page.locator('#present.on').count()).toBe(0);
    const src = await (await page.request.get('/index.html')).text();
    expect(src).toContain('.notes-col,.notes-area');   // in the drag/click SKIP list
  });

  test('R18c the week bar is out-dented from the cards it groups', async ({ page }) => {
    // #5 "Week bar - More contrast + Indent" — the old 14px out-dent left only
    // a 14px step against the cards' 28px margin ("маленький вот этот индент").
    await load(page);
    const r = await page.evaluate(() => {
      const w = document.querySelector('.week-hdr');
      const row = document.querySelector('.row[data-task-id]');
      if (!w || !row) return null;
      return { step: Math.round(row.getBoundingClientRect().left - w.getBoundingClientRect().left) };
    });
    test.skip(r === null, 'demo project renders flat (single week)');
    expect(r.step).toBeGreaterThanOrEqual(20);         // was 14
  });

  test('R17 the PDF dialog offers date range, task types and a compact default', async ({ page }) => {
    // Этап-4 "Exporting PDF: Export windows / Select date from to / Select type
    // of tasks / One task per sheet is way too much — shall be much more compact"
    await load(page);
    await page.evaluate(() => exportPDF());
    const dlg = page.locator('#_ebPdfDlg');
    await expect(dlg).toBeVisible();
    await expect(dlg.locator('#_pdfFrom')).toHaveAttribute('type', 'date');
    await expect(dlg.locator('#_pdfTo')).toHaveAttribute('type', 'date');
    expect(await dlg.locator('#_pdfStatuses input[type=checkbox]').count()).toBeGreaterThan(1);
    // compact is the DEFAULT — "one task per page" is the opt-in
    await expect(dlg.locator('#_pdfDetailed')).not.toBeChecked();

    const r = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('#_pdfStatuses input[data-st]')].map(c => +c.dataset.st);
      const visible = visibleStatuses().map(s => s.id);
      document.getElementById('_ebPdfDlg').remove();
      return { boxes, visible };
    });
    expect(r.boxes).toEqual(r.visible);           // no soft-deleted statuses listed
  });

  test('R17b a compact PDF is produced and is smaller than one-task-per-page', async ({ page }) => {
    await load(page);
    const fs = require('fs');

    const build = async (detailed) => {
      const [dl] = await Promise.all([
        page.waitForEvent('download', { timeout: 60000 }),
        page.evaluate((d) => runExportPDF({ from: null, to: null, statuses: null, detailed: d }), detailed),
      ]);
      const buf = fs.readFileSync(await dl.path());
      return { name: dl.suggestedFilename(), size: buf.length, head: buf.toString('latin1', 0, 5) };
    };

    const compact = await build(false);
    expect(compact.name).toMatch(/\.pdf$/);
    expect(compact.head).toBe('%PDF-');           // a real PDF, not a stub

    const detailed = await build(true);
    expect(detailed.head).toBe('%PDF-');
    // the whole point of the item: compact must actually be smaller
    expect(compact.size).toBeLessThan(detailed.size);
  });

  test('R16 XLSX images are anchored inside their cell', async ({ page }) => {
    // Этап-4 "EXPORT in XLS → 1. Pictures in CELL": pictures floated over the
    // sheet. Two causes, both in the drawing anchor.
    const src = await (await page.request.get('/index.html')).text();
    const anchor = src.slice(src.indexOf('<xdr:twoCellAnchor'), src.indexOf('</xdr:twoCellAnchor>'));

    // editAs="oneCell" moves with cells but does not size with them.
    expect(anchor).toContain('editAs="twoCell"');
    expect(anchor).not.toContain('editAs="oneCell"');
    // Negative ST_Coordinate offsets are invalid; Excel clamps, LibreOffice
    // places the picture outside the cell.
    expect(anchor).not.toMatch(/<xdr:(col|row)Off>-\d/);
  });

  test('R16b the XLSX export produces a real workbook', async ({ page }) => {
    await load(page);
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      page.evaluate(() => exportCSV()),           // builds + downloads the .xlsx
    ]);
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/);

    const fs = require('fs');
    const path = await download.path();
    const buf = fs.readFileSync(path);
    expect(buf.length).toBeGreaterThan(1000);
    // PK zip magic — a truncated/malformed build would not carry it
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
    // the drawing part must be inside (local file headers store names verbatim)
    expect(buf.toString('latin1')).toContain('xl/drawings/drawing1.xml');
  });

  test('R15 the status editor is reachable on a local install', async ({ page }) => {
    // Этап-4 P1 "SETTINGS > Edit Status". The editor existed but was gated on
    // localStorage eb_user_role === 'admin', while isAdmin() treats the owner
    // of a local (no cloud session) install as admin — so on a plain desktop
    // install the panel was simply invisible and the item stayed open.
    await load(page);
    const r = await page.evaluate(() => ({
      admin: isAdmin(),
      rawRole: localStorage.getItem('eb_user_role'),
    }));
    expect(r.admin).toBe(true);                   // local install ⇒ owner is admin
    expect(r.rawRole).not.toBe('admin');          // ...and the raw string is NOT 'admin'
    const src = await (await page.request.get('/index.html')).text();
    expect(src).toContain('${isAdmin() ? `');     // gate uses the helper now
    expect(src).not.toContain("localStorage.getItem('eb_user_role') === 'admin' ? `");
  });

  test('R15b a custom status colour actually reaches the UI', async ({ page }) => {
    // A colour picked in the editor was saved but never shown: every renderer
    // prefers the curated CSS class (bg-done…) and only falls back to s.c.
    await load(page);
    const r = await page.evaluate(() => {
      const s = STATUSES.find(x => x.id === 1);   // Done, default #22C55E / bg-done
      const before = { cls: s.cls, c: s.c };
      document.body.insertAdjacentHTML('beforeend',
        `<input type="color" id="scolor_1" value="#ff00ff"><input type="text" id="slabel_1" value="${s.l}"><input type="number" id="sprio_1" value="1">`);
      _captureStatusEdits();
      const after = { cls: s.cls, c: s.c };
      // restoring the factory colour brings the curated class back
      document.getElementById('scolor_1').value = before.c;
      _captureStatusEdits();
      const restored = STATUSES.find(x => x.id === 1).cls;
      return { beforeCls: before.cls, afterCls: after.cls, afterC: after.c, restored };
    });
    expect(r.beforeCls).toBe('bg-done');
    expect(r.afterC).toBe('#ff00ff');
    expect(r.afterCls).toBe('');                  // class dropped ⇒ inline colour wins
    expect(r.restored).toBe('bg-done');           // and comes back on reset
  });

  test('R15c status priority actually drives status sorting', async ({ page }) => {
    // The Priority column was inert: sorting compared the raw status id.
    await load(page);
    const r = await page.evaluate(() => {
      const a = { s: 1, uid: 1 }, b = { s: 5, uid: 2 };
      const natural = _cmpBySortMode(a, b, 'status');       // 1 before 5
      const s1 = STATUSES.find(x => x.id === 1);
      const s5 = STATUSES.find(x => x.id === 5);
      const keep = [s1.priority, s5.priority];
      s1.priority = 90; s5.priority = 10;                   // flip them
      const flipped = _cmpBySortMode(a, b, 'status');
      s1.priority = keep[0]; s5.priority = keep[1];
      return { natural, flipped };
    });
    expect(r.natural).toBeLessThan(0);
    expect(r.flipped).toBeGreaterThan(0);                   // priority won
  });

  test('R15d switching language does not wipe a renamed status', async ({ page }) => {
    // applyLang() overwrote every label from I18N, keyed by array index.
    await load(page);
    const r = await page.evaluate(() => {
      const s = STATUSES.find(x => x.id === 5);
      const orig = s.l;
      s.l = 'Blocker'; s.custom = true;
      const was = currentLang;
      setLang(was === 'en' ? 'ru' : 'en');
      const afterSwitch = STATUSES.find(x => x.id === 5).l;
      const untouched = STATUSES.find(x => x.id === 1).l;   // still translated
      setLang(was);
      s.l = orig; delete s.custom;
      return { afterSwitch, untouched };
    });
    expect(r.afterSwitch).toBe('Blocker');                  // rename survived
    expect(r.untouched).toBeTruthy();                       // others still translate
  });

  test('R14 an extra AFTER image actually lands (slot 2+ was a silent no-op)', async ({ page }) => {
    // Этап-4 26W33: "The screenshot adding feature doesn't work consistently.
    // Sometimes nothing happens." assignShotToSlot handled only slots 0 and 1.
    await load(page);
    const r = await page.evaluate(async () => {
      const t = TASKS.find(x => x.proj === currentProject);
      t.shot1 = 'data:image/png;base64,' + 'A'.repeat(64);
      t.shot2 = 'data:image/png;base64,' + 'B'.repeat(64);
      t.shots = [];
      const extra = 'data:image/png;base64,' + 'C'.repeat(64);
      await assignShotToSlot(t, 2, extra);          // was dropped on the floor
      return { landed: t.shots[0] === extra, afterCount: afterCount(t) };
    });
    expect(r.landed).toBe(true);
    expect(r.afterCount).toBe(2);
  });

  test('R14b AFTER caps at 3 and BEFORE stays a single image', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(async () => {
      const t = TASKS.find(x => x.proj === currentProject);
      const img = n => 'data:image/png;base64,' + String(n).repeat(64);
      t.shot1 = img(1); t.shot2 = img(2); t.shots = [];
      await assignShotToSlot(t, 2, img(3));
      await assignShotToSlot(t, 3, img(4));
      const atCap = afterCount(t);
      await assignShotToSlot(t, 4, img(5));         // one too many — refused
      return {
        atCap,
        afterOverflow: afterCount(t),
        nextWhenFull: nextAfterSlot(t),
        beforeStillOne: typeof t.shot1 === 'string',
      };
    });
    expect(r.atCap).toBe(3);                        // AFTER_MAX
    expect(r.afterOverflow).toBe(3);                // refused, not appended
    expect(r.nextWhenFull).toBeNull();              // "+" hides at the cap
    expect(r.beforeStillOne).toBe(true);
  });

  test('R14c the next AFTER slot is chosen by position, not by last selection', async ({ page }) => {
    // "it replaces the image ... depends on which window was selected before"
    await load(page);
    const r = await page.evaluate(() => {
      const t = TASKS.find(x => x.proj === currentProject);
      const img = n => 'data:image/png;base64,' + String(n).repeat(64);
      t.shot1 = img(1); t.shot2 = null; t.shots = [];
      const empty = nextAfterSlot(t);               // no after yet → primary
      t.shot2 = img(2);
      const one = nextAfterSlot(t);                 // → first extra
      t.shots = [img(3)];
      return { empty, one, two: nextAfterSlot(t) };
    });
    expect(r.empty).toBe(1);
    expect(r.one).toBe(2);
    expect(r.two).toBe(3);
  });

  test('R13 the screenshot editor has no comment feature left, and still loads', async ({ page }) => {
    // Этап-4 sheet: "The comment in the screenshot editor does not get saved.
    // Remove the comment function completely" (26W27, repeated 26W33).
    const errs = jsErrors(page);
    await page.goto('/editor.html');
    await page.waitForFunction(() => typeof window.setTool === 'function', { timeout: 15000 });

    expect(await page.locator('[data-id="comment"]').count()).toBe(0);   // no tool button
    expect(await page.locator('#cmtPop').count()).toBe(0);               // no input popup
    expect(await page.locator('#cmtList').count()).toBe(0);              // no Comments panel

    const r = await page.evaluate(() => ({
      kmapQ: typeof KMAP === 'object' ? KMAP.q : 'missing',
      gone: ['showCmtPopUI', 'submitCmt', 'delCmt', 'toggleBubble', 'selComment']
        .filter(f => typeof window[f] === 'function'),
      // saved comments must still round-trip, not be destroyed.
      // top-level `let` lives in the script scope, not on window — read it by name.
      keepsData: (typeof comments !== 'undefined') && Array.isArray(comments),
    }));
    expect(r.kmapQ).toBeUndefined();                                     // Q no longer binds
    expect(r.gone).toEqual([]);
    expect(r.keepsData).toBe(true);

    await page.waitForTimeout(300);
    expect(errs.join('\n')).toBe('');                                    // editor still boots clean
  });

  test('R12 a task can be created straight into the week being worked on', async ({ page }) => {
    // Этап-4 sheet, P1, reported twice (26W27 + 26W33): "It is not possible to
    // create a task directly in the week we are working on right now."
    await load(page);
    const r = await page.evaluate(async () => {
      const pid = currentProject;
      const weeks = [...new Set(TASKS.filter(t => t.proj === pid && t.w).map(t => t.w))].sort();
      if (!weeks.length) return { skip: true };
      const wk = weeks[0];
      const title = 'RegTest_W_' + Date.now();
      await createTaskFor(pid, title, false, title, wk);
      const made = TASKS.filter(t => t.proj === pid && (t.title || t.n) === title).pop();
      return { skip: false, week: made && made.w, want: wk };
    });
    test.skip(r.skip === true, 'no dated week in demo data');
    expect(r.week).toBe(r.want);                  // was always '' (unscheduled)
  });

  test('R12b each open week offers an inline add-task placeholder', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      const pid = currentProject;
      const weeks = [...new Set(TASKS.filter(t => t.proj === pid).map(t => t.w || ''))];
      const rows = [...document.querySelectorAll('.newInpWeek')].map(i => i.dataset.week);
      return { weeks: weeks.length, rows: rows.length, tagged: rows.every(w => w !== undefined) };
    });
    test.skip(r.weeks < 2, 'demo project renders flat with a single week');
    expect(r.rows).toBeGreaterThan(0);
    expect(r.tagged).toBe(true);
  });

  test('R12c a completed week refuses new tasks', async ({ page }) => {
    // The week-complete lock blocks drag-drop; creating into it must be blocked
    // too, otherwise the new placeholder is a hole straight through the lock.
    await load(page);
    const r = await page.evaluate(async () => {
      const pid = currentProject;
      const wk = [...new Set(TASKS.filter(t => t.proj === pid && t.w).map(t => t.w))][0];
      if (!wk) return { skip: true };
      if (typeof toggleWeekComplete !== 'function') return { skip: true };
      toggleWeekComplete(pid, wk);
      const title = 'RegTest_Locked_' + Date.now();
      await createTaskFor(pid, title, false, title, wk);
      const made = TASKS.filter(t => t.proj === pid && (t.title || t.n) === title);
      const hasRow = !!document.querySelector(`.newInpWeek[data-week="${wk}"]`);
      toggleWeekComplete(pid, wk);                // restore
      return { skip: false, created: made.length, hasRow };
    });
    test.skip(r.skip === true, 'no dated week / no week-complete control');
    expect(r.created).toBe(0);                    // refused
    expect(r.hasRow).toBe(false);                 // and the placeholder is hidden
  });

  test('R11 undo/redo chips reflect the stack and reorder is undoable', async ({ page }) => {
    // "Кнопки поставил, но они не работают": the chips never changed state and
    // reorder — one of the most-used actions — pushed nothing onto the stack.
    await load(page);
    const start = await page.evaluate(() => ({
      undoDisabled: document.getElementById('undoChip').disabled,
      redoDisabled: document.getElementById('redoChip').disabled,
    }));
    expect(start.undoDisabled).toBe(true);        // empty stack ⇒ visibly dead
    expect(start.redoDisabled).toBe(true);

    const r = await page.evaluate(() => {
      const pid = currentProject;
      const byW = {};
      TASKS.filter(t => t.proj === pid).forEach(t => { (byW[t.w || ''] = byW[t.w || ''] || []).push(t); });
      const wk = Object.keys(byW).find(w => byW[w].length >= 2);
      if (!wk) return { skip: true };
      const order = () => TASKS.filter(t => t.proj === pid && (t.w || '') === wk).map(t => t.id).join(',');
      const before = order();
      moveTaskDown(byW[wk][0].id);
      const moved = order();
      const chipAfterMove = document.getElementById('undoChip').disabled;
      doUndo();
      const restored = order();
      const chipAfterUndo = document.getElementById('redoChip').disabled;
      doRedo();
      return { skip: false, before, moved, restored, redone: order(), chipAfterMove, chipAfterUndo };
    });
    test.skip(r.skip === true, 'no week with 2+ tasks in demo data');
    expect(r.moved).not.toBe(r.before);
    expect(r.chipAfterMove).toBe(false);          // undo became available
    expect(r.restored).toBe(r.before);            // reorder is undoable now
    expect(r.chipAfterUndo).toBe(false);          // redo became available
    expect(r.redone).toBe(r.moved);
  });

  test('R10b the chat panel scrolls instead of stretching the card', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      const t = TASKS.find(x => x.id === document.querySelector('.row[data-task-id]').dataset.taskId);
      t.chat = Array.from({ length: 40 }, (_, i) => ({ a: 'AS', ts: '10:00', text: 'msg ' + i }));
      t.h = 140; render();
      const panel = document.getElementById('ntChat-' + t.id);
      const cs = getComputedStyle(panel);
      return {
        overflowY: cs.overflowY,
        basisZero: cs.flexBasis === '0px' || cs.flexBasis === '0%',
        scrollable: panel.scrollHeight > panel.clientHeight,
      };
    });
    expect(r.overflowY).toBe('auto');
    expect(r.basisZero).toBe(true);                       // flex:1 1 0, not 1 1 auto
    expect(r.scrollable).toBe(true);
  });
  test('R20 AFTER slot strip: chip selects, × deletes exactly the shown image', async ({ page }) => {
    // call 2026-08-28: "выбрать второй — удалить, выбрать третий — добавить".
    await load(page);
    const r = await page.evaluate(() => {
      const t = TASKS.find(x => x.proj === currentProject);
      const A = 'data:image/png;base64,' + 'A'.repeat(64), B = 'data:image/png;base64,' + 'B'.repeat(64), C = 'data:image/png;base64,' + 'C'.repeat(64);
      t.shot2 = A; t.shots = [B, C]; render();
      const cell = () => document.querySelector(`.pi[data-task-id="${t.id}"][data-slot="after"]`);
      const chips = cell().querySelectorAll('.pi-chip').length;
      selectAfter(t.id, 1);
      const shownIsB = cell().querySelector('img').getAttribute('src') === B;
      cell().querySelector('.pi-del').click();
      const imgs = afterImages(t);
      return { chips, shownIsB, left: imgs.length, bGone: !imgs.includes(B), aKept: imgs.includes(A), cKept: imgs.includes(C) };
    });
    expect(r.chips).toBe(3);
    expect(r.shownIsB).toBe(true);
    expect(r.left).toBe(2);
    expect(r.bGone && r.aKept && r.cKept).toBe(true);
  });

  test('R21 lightbox in the main window shows no comment UI', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      const t = TASKS.find(x => x.shot1 || x.shot2);
      openLightbox(t.shot1 || t.shot2, t.id, 0);
      const lb = document.getElementById('lightbox');
      const vis = sel => { const el = lb.querySelector(sel); return el ? getComputedStyle(el).display : 'none'; };
      const out = { panel: vis('.lb-panel'), hint: vis('.lb-hint'), pins: vis('.lb-pins'), flag: LB_COMMENTS_ENABLED };
      closeLightbox();
      return out;
    });
    expect(r.panel).toBe('none');
    expect(r.hint).toBe('none');
    expect(r.pins).toBe('none');
    expect(r.flag).toBe(false);
  });

  test('R22 chat minimizes; a minimized card is compact even after a manual stretch', async ({ page }) => {
    // call 2026-08-28: "Can be minimized — он не уменьшается".
    await load(page);
    const r = await page.evaluate(() => {
      const t = TASKS.find(x => x.proj === currentProject);
      t.h = 420; if (_cardCollapsed[t.id]) toggleCardCollapse(t.id); else render();
      const row = () => document.querySelector(`.row[data-task-id="${t.id}"]`);
      row().scrollIntoView({ block: 'center' });
      const tall = row().getBoundingClientRect().height;
      toggleCardCollapse(t.id);
      const min = row().getBoundingClientRect().height;
      const chatHidden = !row().querySelector('.chat-list') && !row().querySelector('.nt-chat-input');
      toggleCardCollapse(t.id);
      const chatBack = !!row().querySelector('.nt-chat-input');
      t.h = 0; render();
      return { tall, min, chatHidden, chatBack };
    });
    expect(r.tall).toBeGreaterThan(380);
    expect(r.min).toBeLessThan(140);
    expect(r.chatHidden).toBe(true);
    expect(r.chatBack).toBe(true);
  });

  test('R23 presentation nav sits at the bottom-center of the card', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      const t = TASKS.find(x => x.proj === currentProject);
      openPresent(t.id);
      const card = document.querySelector('.pres-card').getBoundingClientRect();
      const nav = document.querySelector('.pres-foot-nav');
      const n = nav.getBoundingClientRect();
      const out = {
        inNav: !!nav.querySelector('.pres-side-prev') && !!nav.querySelector('.pres-side-next') && !!nav.querySelector('.pres-counter'),
        centerOff: Math.abs((n.left + n.right) / 2 - (card.left + card.right) / 2),
        bottomGap: Math.abs(card.bottom - n.bottom),
        headerCounter: !!document.querySelector('.pres-head .pres-counter'),
      };
      closePresent();
      return out;
    });
    expect(r.inNav).toBe(true);
    expect(r.centerOff).toBeLessThan(4);
    expect(r.bottomGap).toBeLessThan(4);
    expect(r.headerCounter).toBe(false);
  });

  test('R24 editor toolbar has Polyline, Callout and Dimension (lost in v0.1.189)', async ({ page }) => {
    await page.goto('/editor.html');
    const r = await page.evaluate(() => ['polyline', 'callout', 'dimension', 'comment']
      .map(id => !!document.querySelector(`.fb[data-id="${id}"]`)));
    expect(r).toEqual([true, true, true, false]);
  });
});
