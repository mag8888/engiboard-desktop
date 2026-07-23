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

});
