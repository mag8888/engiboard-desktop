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

  // ---------------------------------------------------------------------------
  // v0.1.184–186 — фиксы, которые Дмитрий лично подтвердил работающими на
  // созвоне 2026-07-17 ("зелёный список"). Закрепляем, чтобы обновления их не
  // сломали молча. См. docs/MEETING_2026-07-17_TASKS.md.
  // ---------------------------------------------------------------------------

  test('R9 "Move to week…" lists a manually-created empty week', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      const pid = currentProject;
      const t = TASKS.find(x => x.proj === pid);
      if (!t) return { skip: true };
      const wk = '99W99_reg';                       // a fresh empty week (no tasks)
      _addManualWeek(pid, wk);
      openMoveToWeekMenu({ preventDefault(){}, stopPropagation(){}, clientX: 10, clientY: 10 }, t.id);
      const menu = document.getElementById('_ebWeekMenu');
      const listed = !!menu && [...menu.querySelectorAll('.tcm-item')]
        .some(el => el.textContent.includes(wk));
      _removeManualWeek(pid, wk);
      menu?.remove();
      return { skip: false, listed };
    });
    test.skip(r.skip === true, 'no task in demo data');
    expect(r.listed).toBe(true);                    // empty week must appear in the menu
  });

  test('R10 switching a project persists eb_current_project', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      const other = (typeof PROJECTS !== 'undefined' && PROJECTS.length > 1)
        ? PROJECTS.find(p => p.id !== currentProject) : null;
      if (!other) return { skip: true };
      switchProject(other.id);
      return { skip: false, id: other.id, stored: localStorage.getItem('eb_current_project') };
    });
    test.skip(r.skip === true, 'need 2+ projects in demo data');
    expect(r.stored).toBe(r.id);                    // survives a Dashboard round-trip
  });

  test('R11 an empty week renders a per-week add-row drop target', async ({ page }) => {
    await load(page);
    const has = await page.evaluate(() => {
      const html = renderEmptyRowForProject(currentProject, '77W77', true);
      return typeof html === 'string' && html.includes('eb-addrow-emptywk');
    });
    expect(has).toBe(true);                          // empty-week add/drop target present
  });

  test('R12 new-project focus helper triggers the native repaint flush', async ({ page }) => {
    await load(page);
    const wired = await page.evaluate(() => typeof _focusNewProjectBoard === 'function');
    expect(wired).toBe(true);
    const src = await (await page.request.get('/index.html')).text();
    expect(src).toContain("inv('flush_repaint')");   // WKWebView repaint on project create
    expect(src).toContain('_focusNewProjectBoard');
  });

  test('R13 green-list fix code is present in the served frontend', async ({ page }) => {
    const src = await (await page.request.get('/index.html')).text();
    expect(src).toContain('_manualWeeks(t.proj)');        // move-to-week lists manual weeks
    expect(src).toContain('eb-addrow-emptywk');           // empty-week drop target
    expect(src).toContain('row-resized');                 // chat/row height resize
    expect(src).toContain("localStorage.setItem('eb_current_project'"); // project persistence
    expect(src).toContain('_allByFavorites');             // "All projects" toggle/restore
  });

  test('R15 switching a project from Dashboard forces the Projects section', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      const target = (typeof PROJECTS !== 'undefined' && PROJECTS.length > 1)
        ? PROJECTS.find(p => p.id !== currentProject) : (PROJECTS[0] || null);
      if (!target) return { skip: true };
      setSection('dashboard');                          // stand on the Dashboard view
      const dashOnBefore = document.getElementById('dashView')?.classList.contains('on');
      switchProject(target.id);                          // pick a project (as a dashboard card does)
      return {
        skip: false,
        dashOnBefore,
        section: currentSection,
        dashOnAfter: document.getElementById('dashView')?.classList.contains('on'),
        tasksHidden: document.getElementById('bodyTasks')?.dataset.hidden,
        proj: currentProject, want: target.id,
      };
    });
    test.skip(r.skip === true, 'need projects in demo data');
    expect(r.dashOnBefore).toBe(true);                   // we really were on the dashboard
    expect(r.section).toBe('projects');                  // forced onto Projects
    expect(r.dashOnAfter).toBe(false);                   // dashboard view hidden
    expect(r.tasksHidden).toBe('');                      // tasks body shown
    expect(r.proj).toBe(r.want);                         // the picked project stuck
  });

  test('R16 client group toggles without closing the project picker', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(async () => {
      const picker = document.getElementById('projPicker');
      picker?.classList.add('open');
      localStorage.setItem(_ebClientCollapseKey(), '[]');
      renderProjPicker();
      const hdr = document.querySelector('.pp-client-hdr');
      if (!hdr) return { skip: true };
      const name = hdr.querySelector('.pp-client-name')?.textContent;
      const itemsBefore = document.querySelectorAll('#ppList .proj-picker-item').length;
      // a REAL bubbling click — the failure only reproduces when the event
      // reaches the document-level outside-click handler.
      hdr.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      await new Promise(res => setTimeout(res, 20));
      const openAfter = document.getElementById('projPicker')?.classList.contains('open');
      const itemsAfter = document.querySelectorAll('#ppList .proj-picker-item').length;
      return { skip: false, openAfter, collapsed: isClientCollapsed(name), itemsBefore, itemsAfter };
    });
    test.skip(r.skip === true, 'no client groups in demo data');
    expect(r.openAfter).toBe(true);          // picker must NOT close (was the bug)
    expect(r.collapsed).toBe(true);          // the group did collapse
    expect(r.itemsAfter).toBeLessThan(r.itemsBefore); // its projects are hidden
  });

  test('R17 a resized row is bounded to its height and can be reset', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      document.querySelector('.list')?.classList.add('cv-list');
      const t = TASKS.find(x => x.proj === currentProject);
      if (!t) return { skip: true };
      // pile on chat so content would overflow a short row (the old bug: row
      // couldn't shrink below content height)
      t.chat = Array.from({ length: 14 }, (_, i) => ({ a: 'AB', text: 'chat line ' + i }));
      t.h = 220;
      render();
      const row = document.querySelector(`.row[data-task-id="${t.id}"]`);
      const bounded = Math.abs(row.offsetHeight - 220) <= 2;   // fixed height wins over content
      const cl = row.querySelector('.chat-list');
      const chatScrolls = cl ? cl.scrollHeight > cl.clientHeight + 2 : false;
      // reset via the helper the dblclick calls
      onResizeReset({ preventDefault(){}, stopPropagation(){} }, t.id);
      const row2 = document.querySelector(`.row[data-task-id="${t.id}"]`);
      return {
        skip: false, bounded, chatScrolls,
        clearedTh: t.h === undefined,
        resizedClassGone: !row2.classList.contains('row-resized'),
      };
    });
    test.skip(r.skip === true, 'no task in demo data');
    expect(r.bounded).toBe(true);          // height caps the row (was: content forced it taller)
    expect(r.chatScrolls).toBe(true);      // overflow chat scrolls inside instead of growing the row
    expect(r.clearedTh).toBe(true);        // double-click reset clears the stored height
    expect(r.resizedClassGone).toBe(true); // back to default row
  });

  test('R18 XLSX export carries the full chat and anchors images in-cell', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(async () => {
      const t = TASKS.find(x => x.proj === currentProject);
      if (!t) return { skip: true };
      const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEUlEQVR4nGP8z8Dwn4EIwDiqEAAqAgQBhlY6DwAAAABJRU5ErkJggg==';
      t.chat = [{ a: 'Dmitri', text: 'первое сообщение чата' }, { a: 'Alex', text: 'второе сообщение чата' }];
      t.shot1 = png; t.shot2 = png;
      // capture the file list without downloading
      const origZip = _buildZip; let cap = null;
      _buildZip = (fl) => { cap = fl; return origZip(fl); };
      const origUrl = URL.createObjectURL; URL.createObjectURL = () => 'blob:noop';
      const origClick = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function(){};
      try { await exportCSV(); }
      finally { _buildZip = origZip; URL.createObjectURL = origUrl; HTMLAnchorElement.prototype.click = origClick; }
      if (!cap) return { skip: false, captured: false };
      const dec = new TextDecoder();
      const get = n => { const f = cap.find(x => x.name === n); return f ? dec.decode(f.data) : ''; };
      const drawing = get('xl/drawings/drawing1.xml');
      const sst = get('xl/sharedStrings.xml');
      const styles = get('xl/styles.xml');
      const wf = xml => !new DOMParser().parseFromString(xml, 'application/xml').querySelector('parsererror');
      return {
        skip: false, captured: true,
        sheetWF: wf(get('xl/worksheets/sheet1.xml')),
        drawingWF: wf(drawing),
        fullChat: sst.includes('первое сообщение чата') && sst.includes('второе сообщение чата'),
        twoCell: drawing.includes('twoCellAnchor') && !drawing.includes('oneCellAnchor'),
        wrap: styles.includes('wrapText="1"'),
      };
    });
    test.skip(r.skip === true, 'no task in demo data');
    expect(r.captured).toBe(true);
    expect(r.sheetWF).toBe(true);     // valid worksheet XML
    expect(r.drawingWF).toBe(true);   // valid drawing XML
    expect(r.fullChat).toBe(true);    // whole chat exported, not just a count
    expect(r.twoCell).toBe(true);     // images anchored in-cell (was floating oneCellAnchor)
    expect(r.wrap).toBe(true);        // chat cell wraps
  });

  test('R19 PDF export renders a valid multi-page table (chat + images)', async ({ page }) => {
    await load(page);
    // jsPDF loads from a CDN; skip cleanly when the harness is offline.
    const ready = await page.evaluate(() => !!(window.jspdf && window.jspdf.jsPDF && typeof renderTasksTablePDF === 'function'));
    test.skip(!ready, 'jsPDF not loaded (offline harness)');
    const r = await page.evaluate(async () => {
      const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEUlEQVR4nGP8z8Dwn4EIwDiqEAAqAgQBhlY6DwAAAABJRU5ErkJggg==';
      const tasks = TASKS.filter(t => t.proj === currentProject).slice(0, 8);
      if (!tasks.length) return { skip: true };
      tasks[0].chat = [{ a: 'Dmitri', text: 'строка чата в pdf' }];
      tasks[0].shot1 = png; tasks[0].shot2 = png;
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      let err = null;
      try { await renderTasksTablePDF(doc, tasks, { margin: 15 }); }
      catch(e){ err = e.message; }
      const buf = doc.output('arraybuffer');
      const head = new TextDecoder().decode(new Uint8Array(buf).slice(0, 5));
      return { skip: false, err, isPDF: head === '%PDF-', bytes: buf.byteLength, pages: doc.internal.getNumberOfPages() };
    });
    test.skip(r.skip === true, 'no tasks in demo data');
    expect(r.err).toBe(null);          // table renders without throwing
    expect(r.isPDF).toBe(true);        // valid PDF output
    expect(r.pages).toBeGreaterThan(1);// cover + at least one table page
    expect(r.bytes).toBeGreaterThan(3000);
  });

  test('R20 present add-screenshot targets an explicit slot (no ambiguity)', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(async () => {
      const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEUlEQVR4nGP8z8Dwn4EIwDiqEAAqAgQBhlY6DwAAAABJRU5ErkJggg==';
      const t = TASKS.find(x => x.proj === currentProject);
      if (!t) return { skip: true };
      // empty task → bottom button aims at BEFORE (slot 0)
      delete t.shot1; delete t.shot2; delete t.shots;
      openPresent(t.id);
      const btnEmpty = [...document.querySelectorAll('.pres-nav button')].find(b => b.textContent.includes('Add screenshot'));
      const emptyTargetsBefore = /targetSlot:0\b/.test(btnEmpty?.getAttribute('onclick') || '');
      // both filled → per-slot "+" tile present; extras actually persist
      t.shot1 = png; t.shot2 = png; delete t.shots;
      openPresent(t.id);
      const hasAddTile = !!document.querySelector('#presCard .pres-thumb-add');
      await assignShotToSlot(t, 2, png);       // capture into an extra slot
      const extraSaved = Array.isArray(t.shots) && t.shots[0] === png;
      openPresent(t.id);
      const btnFull = [...document.querySelectorAll('.pres-nav button')].find(b => b.textContent.includes('Add screenshot'));
      const fullTargetsNextExtra = /targetSlot:3\b/.test(btnFull?.getAttribute('onclick') || '');
      return { skip: false, emptyTargetsBefore, hasAddTile, extraSaved, fullTargetsNextExtra };
    });
    test.skip(r.skip === true, 'no task in demo data');
    expect(r.emptyTargetsBefore).toBe(true);    // empty → first free slot, not a guess
    expect(r.hasAddTile).toBe(true);            // explicit "+" per the after gallery
    expect(r.extraSaved).toBe(true);            // extra slots now persist (were dropped)
    expect(r.fullTargetsNextExtra).toBe(true);  // bottom button points at the next free slot
  });

  test('R21 card action buttons sit above the chat (Presentation/Link moved up)', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      document.querySelector('.list')?.classList.add('cv-list');
      render();
      const col = document.querySelector('.row .chat-col');
      if (!col) return { skip: true };
      const top = sel => { const el = col.querySelector(sel); return el ? el.getBoundingClientRect().top : null; };
      return {
        skip: false,
        header: top('.card-header'),
        actions: top('.chat-row-actions'),
        chat: top('.chat-list'),
      };
    });
    test.skip(r.skip === true, 'no row in demo data');
    // header first, then the Presentation/Link actions, then the chat
    expect(r.actions).toBeGreaterThan(r.header);
    expect(r.chat).toBeGreaterThan(r.actions);
  });

  test('R22 tasks under a week are indented (folder look)', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      document.querySelector('.list')?.classList.add('cv-list');
      render();
      const hdr = document.querySelector('.week-hdr:not(.pinned-hdr)');
      const row = document.querySelector('.row.in-week');
      if (!hdr || !row) return { skip: true };
      return {
        skip: false,
        hdrLeft: hdr.getBoundingClientRect().left,
        rowLeft: row.getBoundingClientRect().left,
      };
    });
    test.skip(r.skip === true, 'no weeked rows in demo data');
    expect(r.rowLeft).toBeGreaterThan(r.hdrLeft + 8);   // rows sit indented under the header
  });

  test('R23 status filter chips show per-project counts', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      renderFilters();
      const scope = TASKS.filter(t => t.proj === currentProject && !t.hidden);
      const byS = {}; scope.forEach(t => { byS[t.s] = (byS[t.s] || 0) + 1; });
      const allChip = document.querySelector('#filterChips .chip[data-f="all"] .chip-ct');
      // pick a status that actually has tasks
      const sid = Object.keys(byS)[0];
      const stChip = document.querySelector(`#filterChips .chip[data-f="${sid}"] .chip-ct`);
      return {
        allCt: allChip ? parseInt(allChip.textContent) : null,
        total: scope.length,
        stCt: stChip ? parseInt(stChip.textContent) : null,
        stActual: byS[sid],
      };
    });
    expect(r.allCt).toBe(r.total);       // All chip counts every task in scope
    expect(r.stCt).toBe(r.stActual);     // per-status chip matches the real count
  });

  test('R24 "+ Add week" placeholder sits at the bottom and creates a week', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(async () => {
      render();
      const hdrs = [...document.querySelectorAll('.week-hdr')];
      const addRow = document.querySelector('.week-hdr.eb-addweek');
      if (!addRow || !hdrs.length) return { skip: true };
      const isLast = hdrs[hdrs.length - 1].classList.contains('eb-addweek');
      // drive the modal end-to-end
      const proj = currentProject;
      addRow.click();
      const inp = document.querySelector('#_ebWkInp');
      if (!inp) return { skip: false, isLast, modal: false };
      inp.value = '26W52';
      const ok = document.querySelector('#_ebWkOk');
      ok.click();
      await new Promise(res => setTimeout(res, 60));
      return {
        skip: false, isLast, modal: true,
        created: _manualWeeks(proj).includes('26W52'),
        rendered: [...document.querySelectorAll('.week-hdr .week-name')].some(e => e.textContent === '26W52'),
      };
    });
    test.skip(r.skip === true, 'no weeked view in demo data');
    expect(r.isLast).toBe(true);     // placeholder is the last week bar
    expect(r.modal).toBe(true);      // clicking it opens the create-week modal
    expect(r.created).toBe(true);    // a new week is registered
    expect(r.rendered).toBe(true);   // and shows up as a week header
  });

  test('R25 Collapse All / Expand All toggles every week', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      localStorage.setItem(_ebWkKey(currentProject), '[]');   // start expanded
      render();
      const total = [...document.querySelectorAll('.week-hdr:not(.eb-addweek):not(.pinned-hdr)')].length;
      if (!total) return { skip: true };
      toggleAllWeeks();                                       // collapse all
      const collapsed = [...document.querySelectorAll('.week-hdr:not(.eb-addweek):not(.pinned-hdr)')].filter(h => h.classList.contains('collapsed')).length;
      const rowsCollapsed = document.querySelectorAll('.row[data-task-id]:not(.eb-addrow)').length;
      const lblCollapsed = document.getElementById('collapseAllLbl')?.textContent;
      toggleAllWeeks();                                       // expand all
      const rowsExpanded = document.querySelectorAll('.row[data-task-id]:not(.eb-addrow)').length;
      const lblExpanded = document.getElementById('collapseAllLbl')?.textContent;
      return { skip: false, total, collapsed, rowsCollapsed, lblCollapsed, rowsExpanded, lblExpanded };
    });
    test.skip(r.skip === true, 'no weeks in demo data');
    expect(r.collapsed).toBe(r.total);       // every week collapsed
    expect(r.rowsCollapsed).toBe(0);         // no task rows visible when all collapsed
    expect(r.lblCollapsed).toBe('Expand');   // label flips
    expect(r.rowsExpanded).toBeGreaterThan(0); // expand brings them back
    expect(r.lblExpanded).toBe('Collapse');
  });

  test('R14 editor: pin-comment bubble is not swallowed by the paper handler', async ({ page }) => {
    const src = await (await page.request.get('/editor.html')).text();
    // v0.1.186: paper mousedown guard must let clicks on a pin/bubble through
    // so the comment opens instead of being eaten by the draw handler.
    expect(src).toMatch(/closest\([^)]*\.cpin[^)]*\)/);   // pin click passes the guard
    expect(src).toMatch(/closest\([^)]*\.cbbl[^)]*\)/);   // bubble click passes the guard
    expect(src).toContain('saveCmtEdit');                 // bubble is editable (edit/save)
  });
});
