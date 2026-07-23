// tests/ui/editor.spec.js — регресс аннотационного редактора (editor.html).
// Гоняет тот же dist/editor.html, что и десктоп-сборка. Инструменты рисуются
// драгом мыши по #paper; annotations/… — глобалы инлайн-скрипта редактора.

const { test, expect } = require('@playwright/test');

async function loadEditor(page) {
  await page.goto('/editor.html');
  await page.waitForFunction(() => typeof window.setTool === 'function' && document.getElementById('paper'), { timeout: 15000 });
}

// Нарисовать драг инструментом по #paper. Реальный page.mouse перехватывают
// оверлеи редактора, поэтому шлём синтетические MouseEvents прямо на #paper с
// корректными clientX/Y (fractions 0..1 от размеров paper) — тот же путь, что и
// живой клик пользователя (обработчики висят на paper).
async function drawDrag(page, fromFrac, toFrac) {
  await page.evaluate(({ f, t }) => {
    const r = paper.getBoundingClientRect();
    const cx = fr => r.left + r.width * fr, cy = fr => r.top + r.height * fr;
    paper.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: cx(f[0]), clientY: cy(f[1]) }));
    paper.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: cx((f[0] + t[0]) / 2), clientY: cy((f[1] + t[1]) / 2) }));
    paper.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: cx(t[0]), clientY: cy(t[1]) }));
    paper.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  }, { f: fromFrac, t: toFrac });
}

test.describe('EngiBoard editor — annotation tools', () => {

  test('E1 Dimension tool is available and creates a dimension annotation', async ({ page }) => {
    await loadEditor(page);
    const btn = await page.$('.fb[data-id="dimension"]');
    expect(btn).not.toBeNull();                    // tool re-added to the toolbar
    await page.evaluate(() => setTool('dimension'));
    await drawDrag(page, [0.2, 0.5], [0.7, 0.5]);   // horizontal drag
    const r = await page.evaluate(() => {
      const dims = annotations.filter(a => a.type === 'dimension');
      return { count: dims.length, hasWidth: dims.length ? Math.abs(dims[0].w) > 0.5 : false, domTicks: !!document.querySelector('.dim-wrap') };
    });
    expect(r.count).toBe(1);       // one dimension created
    expect(r.hasWidth).toBe(true); // with a real width
    expect(r.domTicks).toBe(true); // rendered (line + end ticks)
  });

  test('E2 Dimension label is manually editable (not the old auto mm)', async ({ page }) => {
    await loadEditor(page);
    await page.evaluate(() => setTool('dimension'));
    await drawDrag(page, [0.2, 0.4], [0.6, 0.4]);
    const r = await page.evaluate(() => {
      const d = annotations.find(a => a.type === 'dimension');
      updateDimLabel(d.id, '30 mm');               // manual override path
      return { label: d.label };
    });
    expect(r.label).toBe('30 mm');
  });

  test('E3 Polyline: click points, finish with double-click', async ({ page }) => {
    await loadEditor(page);
    await page.evaluate(() => setTool('polyline'));
    const r = await page.evaluate(() => {
      const r = paper.getBoundingClientRect();
      const click = (fx, fy) => paper.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: r.left + r.width * fx, clientY: r.top + r.height * fy }));
      click(0.2, 0.2); click(0.5, 0.6); click(0.8, 0.3);   // 3 vertices
      const building = !!(cur && cur.type === 'polyline' && cur.pts.length === 3);
      paper.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));   // finish
      const poly = annotations.find(a => a.type === 'polyline');
      return { building, committed: !!poly, pts: poly ? poly.pts.length : 0, dom: !!document.querySelector('#fhSvg path') };
    });
    expect(r.building).toBe(true);   // accumulates vertices while building
    expect(r.committed).toBe(true);  // double-click commits it
    expect(r.pts).toBe(3);           // keeps all 3 points
    expect(r.dom).toBe(true);        // rendered as an SVG path
  });

  test('E5 Callout: leader drag creates a callout with an editable label + arrow', async ({ page }) => {
    await loadEditor(page);
    await page.evaluate(() => setTool('callout'));
    await drawDrag(page, [0.3, 0.6], [0.6, 0.3]);   // drag the leader (target → text)
    const r = await page.evaluate(() => {
      const c = annotations.find(a => a.type === 'callout');
      const autoInput = !!document.querySelector('.callout-inp');   // auto-selected → editable
      if (c) updateCalloutText(c.id, 'зазор 2мм');
      selId = null; renderAll();
      return {
        created: !!c,
        autoInput,
        text: c ? c.text : null,
        arrow: !!document.querySelector('#fhSvg path'),      // leader arrow rendered
        box: !!document.querySelector('.callout-box'),        // text box rendered
      };
    });
    expect(r.created).toBe(true);
    expect(r.autoInput).toBe(true);   // text field opens right after drawing the leader
    expect(r.text).toBe('зазор 2мм'); // label is editable
    expect(r.arrow).toBe(true);       // arrow leader present
    expect(r.box).toBe(true);         // text box present
  });

  test('E4 Polyline: Escape cancels an unfinished polyline', async ({ page }) => {
    await loadEditor(page);
    await page.evaluate(() => setTool('polyline'));
    const r = await page.evaluate(() => {
      const r = paper.getBoundingClientRect();
      const click = (fx, fy) => paper.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: r.left + r.width * fx, clientY: r.top + r.height * fy }));
      click(0.3, 0.3); click(0.6, 0.6);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return { curCleared: cur == null, none: annotations.filter(a => a.type === 'polyline').length };
    });
    expect(r.curCleared).toBe(true);   // in-progress cleared
    expect(r.none).toBe(0);            // nothing committed
  });

});
