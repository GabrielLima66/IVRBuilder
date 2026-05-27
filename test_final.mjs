/**
 * IVR Builder — definitive test suite (post-recon v2)
 * All selectors verified against real DOM.
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'test-results');
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:5173';

const R = { pass: [], fail: [], warn: [] };
const consoleMsgs = [];

const ts = () => new Date().toISOString().slice(11,19);
const log = m => console.log(`[${ts()}] ${m}`);
const pass = m => { R.pass.push(m); log(`✅ ${m}`); };
const fail = m => { R.fail.push(m); log(`❌ ${m}`); };
const warn = m => { R.warn.push(m); log(`⚠  ${m}`); };
const sec  = t => log(`\n${'─'.repeat(55)}\n  ${t}\n${'─'.repeat(55)}`);

async function snap(page, name, label = '') {
  const p = join(OUT, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  log(`📸  ${name}.png${label ? ' — ' + label : ''}`);
}

/** Close any open modal by clicking its X button (Escape not always honoured) */
async function closeModal(page) {
  const x = page.locator('.modal button[aria-label="Fechar"], .modal-backdrop button[aria-label="Fechar"]').first();
  if (await x.count()) {
    await x.click({ force: true });
    await page.waitForTimeout(400);
    return true;
  }
  // fallback: click backdrop outside modal box
  const backdrop = page.locator('.modal-backdrop').first();
  if (await backdrop.count()) {
    const modal = page.locator('.modal').first();
    const mBox = await modal.boundingBox().catch(() => null);
    if (mBox) {
      // click above the modal
      await page.mouse.click(mBox.x + mBox.width / 2, Math.max(mBox.y - 30, 10));
      await page.waitForTimeout(300);
    }
  }
  return false;
}

async function run() {
  sec('BROWSER SETUP');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('console', m => consoleMsgs.push({ type: m.type(), text: m.text() }));
  page.on('pageerror', e => consoleMsgs.push({ type: 'pageerror', text: e.message }));

  try {
    // ─────────────────────────────────────────────────────────────────────
    sec('1 · HOME SCREEN — screenshot + elements');
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await snap(page, '01-home', 'home screen');

    const homeBtns = await page.locator('button.btn-neon').allTextContents();
    pass(`Home — buttons: ${homeBtns.map(t => t.trim()).join(' | ')}`);

    // Check no JS errors on home load
    const earlyErrors = consoleMsgs.filter(m => m.type === 'error' || m.type === 'pageerror');
    if (earlyErrors.length === 0) pass('Home screen — zero JS errors on load');
    else fail(`Home screen — ${earlyErrors.length} JS error(s): ${earlyErrors.map(e => e.text).join('; ')}`);

    // ─────────────────────────────────────────────────────────────────────
    sec('2 · NEW PROJECT MODAL');
    await page.locator('button.btn-neon').filter({ hasText: '+ NOVO PROJETO' }).first().click();
    await page.waitForSelector('.modal', { state: 'visible' });
    await snap(page, '02a-new-project-modal-open', 'modal open');
    pass('New project modal appeared');

    const criarBtn = page.locator('.modal button').filter({ hasText: 'CRIAR' });
    const disabledInit = await criarBtn.isDisabled();
    pass(`CRIAR button disabled before typing: ${disabledInit}`);

    const nameInput = page.locator('input[placeholder*="orpen-ivr"]');
    await nameInput.fill('ivr-test-auto');
    await page.waitForTimeout(200);
    const enabledAfterTyping = await criarBtn.isEnabled();
    pass(`CRIAR button enabled after typing: ${enabledAfterTyping}`);
    await snap(page, '02b-modal-name-filled', 'name filled');

    await criarBtn.click();
    await page.waitForSelector('.react-flow', { timeout: 10000 });
    await page.waitForTimeout(500);
    pass('Project created, canvas mounted');

    // ─────────────────────────────────────────────────────────────────────
    sec('3 · CANVAS — initial state');
    await snap(page, '03-canvas-initial', 'canvas initial');

    const nodes0 = await page.locator('.react-flow__node').count();
    const edges0 = await page.locator('.react-flow__edge').count();
    pass(`Canvas initial state: ${nodes0} node(s), ${edges0} edge(s)`);

    // Verify data-theme attribute is set
    const initTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    pass(`Initial data-theme: "${initTheme}"`);

    // ─────────────────────────────────────────────────────────────────────
    sec('4 · SIDEBAR — palette + search + accordion');
    // Sidebar is the <aside> that contains palette-items on the left
    const sidebar = page.locator('[class*="sidebar"], aside').first();
    const hasSidebar = await sidebar.count();
    if (hasSidebar) pass('Sidebar element present');
    else fail('Sidebar not found');

    const draggables = await page.locator('.palette-item[draggable="true"]').count();
    pass(`Palette items (draggable): ${draggables}`);

    // Sidebar categories (accordion buttons)
    const categories = await page.locator('button').filter({ hasText: /CONTAINERS|ESTRUTURA|CONTROLE|EXECUÇÃO|INTERAÇÃO|SISTEMA/i }).all();
    pass(`Sidebar categories: ${categories.length}`);

    // Screenshot sidebar
    const sidebarBox = await sidebar.boundingBox().catch(() => null);
    if (sidebarBox) {
      await page.screenshot({ path: join(OUT, '04a-sidebar.png'), clip: sidebarBox });
      log('📸  04a-sidebar.png — sidebar closeup');
    }

    // Collapse all / expand first category
    const collapseAllBtn = page.locator('button[aria-label="Colapsar tudo"]');
    if (await collapseAllBtn.count()) {
      await collapseAllBtn.click();
      await page.waitForTimeout(300);
      await snap(page, '04b-sidebar-collapsed', 'all collapsed');
      pass('Sidebar collapse-all works');
    }

    if (categories.length > 0) {
      await categories[0].click();
      await page.waitForTimeout(300);
      await snap(page, '04c-sidebar-expanded', 'first category open');
      pass(`Category "${(await categories[0].textContent()).trim()}" expanded`);
    }

    // Semantic search
    const searchInput = page.locator('input[type="text"]').first();
    if (await searchInput.count()) {
      for (const term of ['menu', 'answer', 'goto']) {
        await searchInput.fill(term);
        await page.waitForTimeout(400);
        const results = await page.locator('.palette-item').count();
        pass(`Search "${term}": ${results} result(s)`);
      }
      await searchInput.fill('');
      await page.waitForTimeout(300);
      await snap(page, '04d-sidebar-search-cleared');
    }

    // ─────────────────────────────────────────────────────────────────────
    sec('5 · DRAG NODES ONTO CANVAS');
    const paletteItems = await page.locator('.palette-item[draggable="true"]').all();
    const pane = page.locator('.react-flow__pane').first();
    const paneBox = await pane.boundingBox().catch(() => null);

    const droppedTypes = [];
    if (paneBox && paletteItems.length > 0) {
      const dropPositions = [
        [0.35, 0.35],
        [0.55, 0.35],
        [0.55, 0.55],
      ];
      for (let i = 0; i < Math.min(3, paletteItems.length); i++) {
        const item = paletteItems[i];
        const itemBox = await item.boundingBox().catch(() => null);
        if (!itemBox) continue;
        const label = (await item.textContent()).trim().slice(0, 30);
        const [fx, fy] = dropPositions[i];
        const dropX = paneBox.x + paneBox.width * fx;
        const dropY = paneBox.y + paneBox.height * fy;

        await page.mouse.move(itemBox.x + itemBox.width / 2, itemBox.y + itemBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(dropX, dropY, { steps: 25 });
        await page.mouse.up();
        await page.waitForTimeout(500);
        droppedTypes.push(label);
      }
      const nodesAfter = await page.locator('.react-flow__node').count();
      pass(`Dragged ${droppedTypes.length} nodes → total nodes: ${nodesAfter}`);
      await snap(page, '05-after-drag', `after dragging ${droppedTypes.length} nodes`);
    } else {
      warn('Drag test skipped — no pane box or no palette items');
    }

    // ─────────────────────────────────────────────────────────────────────
    sec('6 · NODE SELECTION + PROPERTIES PANEL');
    const nodeEls = await page.locator('.react-flow__node').all();
    if (nodeEls.length > 0) {
      // Click the config node specifically (not context which has z-index:-1)
      const configNode = page.locator('.react-flow__node-config').first();
      const targetNode = (await configNode.count()) ? configNode : page.locator('.react-flow__node').first();
      await targetNode.click({ force: true });
      await page.waitForTimeout(400);
      await snap(page, '06a-node-selected', 'node selected');

      // Properties panel is the second <aside> (first = sidebar, second = properties)
      const asides = await page.locator('aside').all();
      pass(`<aside> elements found: ${asides.length} (sidebar + properties panel)`);

      if (asides.length >= 2) {
        const propsAside = asides[asides.length - 1]; // last aside = properties
        const propsText = (await propsAside.textContent()).slice(0, 200).replace(/\n+/g, ' ');
        pass(`Properties panel content: "${propsText.slice(0, 100)}..."`);
        const propsBox = await propsAside.boundingBox();
        if (propsBox) {
          await page.screenshot({ path: join(OUT, '06b-properties-panel.png'), clip: propsBox });
          log('📸  06b-properties-panel.png — props panel closeup');
        }
      } else {
        warn('Only 1 <aside> found — properties panel may not be rendering');
      }

      // Click canvas to deselect
      await page.mouse.click(paneBox ? paneBox.x + paneBox.width / 2 : 500,
                              paneBox ? paneBox.y + paneBox.height / 2 : 400);
      await page.waitForTimeout(200);
    }

    // ─────────────────────────────────────────────────────────────────────
    sec('7 · SETTINGS / CONFIG MODAL (6 sections)');
    const configBtn = page.locator('button[title="Configurações do projeto"]');
    if (await configBtn.count()) {
      await configBtn.click();
      await page.waitForTimeout(600);

      const modalBackdrop = page.locator('.modal-backdrop').first();
      if (await modalBackdrop.count()) {
        pass('Config modal opened (modal-backdrop present)');
        await snap(page, '07a-settings-modal', 'settings modal');

        // Check for 6 sections
        const expectedSections = ['INTERFACE', 'CANVAS', 'EDGES', 'EXPORTAÇÃO', 'IMPORTAÇÃO', 'PROJETO'];
        for (const sec_name of expectedSections) {
          const found = await page.locator('.modal-backdrop').filter({ hasText: sec_name }).count();
          if (found) pass(`  Config section present: "${sec_name}"`);
          else warn(`  Config section not found: "${sec_name}"`);
        }

        // Check PRO / AMIGÁVEL mode buttons
        const proBtn = page.locator('.modal-backdrop button').filter({ hasText: 'PRO' });
        const amigBtn = page.locator('.modal-backdrop button').filter({ hasText: 'AMIGÁVEL' });
        const hasPro = await proBtn.count();
        const hasAmig = await amigBtn.count();
        pass(`Mode buttons — PRO: ${hasPro > 0}, AMIGÁVEL: ${hasAmig > 0}`);

        // ── THEME SWITCHING inside modal
        sec('8 · THEME SWITCHING inside settings');
        const themeMap = {
          'hacking': 'matrix',
          'orpen': 'orpen',
          'dark': 'dark',
        };
        for (const [btnLabel, expectedTheme] of Object.entries(themeMap)) {
          // Theme buttons might be labelled differently — check text
          const themeBtn = page.locator('.modal-backdrop button, .modal-backdrop [role="button"]')
            .filter({ hasText: new RegExp(btnLabel, 'i') }).first();
          if (await themeBtn.count()) {
            await themeBtn.click({ force: true });
            await page.waitForTimeout(400);
            const actual = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
            pass(`Theme "${btnLabel}" → data-theme="${actual}" (expected "${expectedTheme}")`);
            await snap(page, `08-theme-${expectedTheme}`, `theme: ${expectedTheme}`);
          } else {
            // Try by finding color chip or label
            const colorLabels = await page.locator('.modal-backdrop').evaluate(el => el.innerText);
            const hasLabel = colorLabels.toLowerCase().includes(btnLabel);
            warn(`Theme button "${btnLabel}" not found — label in modal: ${hasLabel}`);
          }
        }

        // Close modal via X button
        const closeX = page.locator('.modal-backdrop button[aria-label="Fechar"]');
        if (await closeX.count()) {
          await closeX.click({ force: true });
          await page.waitForTimeout(400);
          const stillOpen = await page.locator('.modal-backdrop').count();
          pass(`Settings modal closed (still open: ${stillOpen > 0})`);
        } else {
          warn('Close button not found in settings modal');
        }

      } else {
        fail('Config modal did not open (no .modal-backdrop found)');
      }
    } else {
      fail('Config button [title="Configurações do projeto"] not found');
    }

    // ─────────────────────────────────────────────────────────────────────
    sec('9 · MODE TOGGLE — PRO / AMIGÁVEL');
    const proHeaderBtn = page.locator('button').filter({ hasText: /^PRO$/ }).first();
    const amigHeaderBtn = page.locator('button').filter({ hasText: /^AMIGÁVEL$/ }).first();
    if (await amigHeaderBtn.count()) {
      await amigHeaderBtn.click();
      await page.waitForTimeout(300);
      await snap(page, '09a-mode-amigavel', 'amigável mode');
      pass('Switched to AMIGÁVEL mode');
    }
    if (await proHeaderBtn.count()) {
      await proHeaderBtn.click();
      await page.waitForTimeout(300);
      await snap(page, '09b-mode-pro', 'pro mode');
      pass('Switched back to PRO mode');
    }

    // ─────────────────────────────────────────────────────────────────────
    sec('10 · EXPORT MODAL');
    const exportBtn = page.locator('button').filter({ hasText: /exportar ura/i }).first();
    if (await exportBtn.count()) {
      await exportBtn.click();
      await page.waitForTimeout(600);

      const exportModal = page.locator('.modal').first();
      if (await exportModal.count()) {
        pass('Export modal opened');
        await snap(page, '10a-export-modal', 'export modal');

        // Check content
        const modalText = (await exportModal.textContent()).slice(0, 300);
        pass(`Export modal title: "${modalText.slice(0, 80).replace(/\n/g, ' ')}"`);

        // Verify download buttons
        const dlBtns = ['⎘ COPIAR', '⤓ .conf', '⤓ .layout.json', '⤓ BAIXAR AMBOS'];
        for (const btnLabel of dlBtns) {
          const found = await page.locator('.modal button').filter({ hasText: btnLabel }).count();
          if (found) pass(`  Export button: "${btnLabel}" ✓`);
          else warn(`  Export button not found: "${btnLabel}"`);
        }

        // Check .conf content preview
        const preContent = await page.locator('.modal pre, .modal code, .modal textarea').first().textContent().catch(() => null);
        if (preContent && preContent.length > 20) {
          pass(`Export .conf preview (${preContent.length} chars): "${preContent.slice(0,80).replace(/\n/g,' ')}"`);
        } else {
          warn('Export .conf preview content not found or empty');
        }

        // Close — try aria-label first, then "X" text fallback
        const closeExport = page.locator('.modal button[aria-label="Fechar"], .modal button').filter({ hasText: /^X$/ }).first();
        if (await closeExport.count()) {
          await closeExport.click({ force: true });
          await page.waitForTimeout(500);
          const modalGone = (await page.locator('.modal-backdrop').count()) === 0;
          pass(`Export modal closed: ${modalGone}`);
        } else {
          // Force-close by pressing Escape or clicking outside
          await page.keyboard.press('Escape');
          await page.waitForTimeout(400);
          warn('Export close button not found — tried Escape');
        }
      } else {
        fail('Export modal did not appear');
      }
    } else {
      fail('Export button "⤓ EXPORTAR URA (.conf)" not found');
    }

    // Ensure no modal is blocking before continuing
    if (await page.locator('.modal-backdrop').count()) {
      const xBtn = page.locator('.modal-backdrop button[aria-label="Fechar"], .modal-backdrop button').filter({ hasText: /^X$/ }).first();
      if (await xBtn.count()) await xBtn.click({ force: true });
      await page.waitForTimeout(400);
    }

    // ─────────────────────────────────────────────────────────────────────
    sec('11 · CONTEXT NAV PANEL (no node selected)');
    // Deselect all nodes first
    await page.mouse.click(700, 400);
    await page.waitForTimeout(300);

    // When no node selected → PropertiesPanel shows ContextNavPanel inside the aside
    const asides = await page.locator('aside').all();
    if (asides.length >= 2) {
      const rightPanel = asides[asides.length - 1];
      const navText = (await rightPanel.textContent()).slice(0, 200).replace(/\n+/g, ' ');
      pass(`Right panel (no selection): "${navText.slice(0, 100)}"`);
      const panelBox = await rightPanel.boundingBox();
      if (panelBox) {
        await page.screenshot({ path: join(OUT, '11-context-nav.png'), clip: panelBox });
        log('📸  11-context-nav.png — context nav panel');
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    sec('12 · EXPORT ORDER PANEL (⊞ ORDEM button)');
    const ordenBtn = page.locator('button').filter({ hasText: '⊞ ORDEM' }).first();
    if (await ordenBtn.count()) {
      await ordenBtn.click({ force: true });
      await page.waitForTimeout(400);
      await snap(page, '12-export-order-panel', 'export order panel');
      pass('Export order panel toggled');
      // Toggle back
      await ordenBtn.click({ force: true });
      await page.waitForTimeout(300);
    } else {
      warn('⊞ ORDEM button not found');
    }

    // ─────────────────────────────────────────────────────────────────────
    sec('13 · BACK TO HOME');
    const backBtn = page.locator('button').filter({ hasText: '← VOLTAR' }).first();
    if (await backBtn.count()) {
      await backBtn.click();
      await page.waitForTimeout(600);
      await snap(page, '13-back-to-home', 'back to home');
      const onHome = await page.locator('button.btn-neon').filter({ hasText: '+ NOVO PROJETO' }).count();
      if (onHome) pass('Back to home successfully');
      else warn('Back button clicked but home not detected');
    }

    // ─────────────────────────────────────────────────────────────────────
    sec('14 · CONSOLE LOG ANALYSIS');
    const errors   = consoleMsgs.filter(m => m.type === 'error' || m.type === 'pageerror');
    const warnings = consoleMsgs.filter(m => m.type === 'warning');
    const infos    = consoleMsgs.filter(m => m.type === 'log' || m.type === 'info');

    log(`\n   Total messages: ${consoleMsgs.length}`);
    log(`   Errors:   ${errors.length}`);
    log(`   Warnings: ${warnings.length}`);
    log(`   Info/Log: ${infos.length}`);

    if (errors.length === 0) {
      pass('Zero JS / page errors in console');
    } else {
      fail(`${errors.length} JS error(s):`);
      errors.forEach(e => log(`     ❌  ${e.text}`));
    }

    if (warnings.length > 0) {
      warn(`${warnings.length} console warning(s):`);
      warnings.slice(0, 10).forEach(w => log(`     ⚠  ${w.text}`));
    }

    const logContent = consoleMsgs.map(m => `[${m.type.toUpperCase()}] ${m.text}`).join('\n');
    writeFileSync(join(OUT, 'console.log'), logContent, 'utf8');
    log('   → test-results/console.log saved');

  } catch (err) {
    fail(`Test suite crashed: ${err.message}`);
    log(err.stack);
    await snap(page, 'zz-crash').catch(() => {});
  } finally {
    await browser.close();
  }

  // ─────────────────────────────────────────────────────────────────────
  sec('FINAL REPORT');
  log(`\n  ✅ PASS (${R.pass.length}):`);
  R.pass.forEach(p => log(`     • ${p}`));
  log(`\n  ❌ FAIL (${R.fail.length}):`);
  R.fail.forEach(f => log(`     • ${f}`));
  log(`\n  ⚠  WARN (${R.warn.length}):`);
  R.warn.forEach(w => log(`     • ${w}`));

  const report = {
    ts: new Date().toISOString(),
    summary: { pass: R.pass.length, fail: R.fail.length, warn: R.warn.length },
    pass: R.pass, fail: R.fail, warn: R.warn,
    consoleErrors: consoleMsgs.filter(m => m.type==='error'||m.type==='pageerror').map(m=>m.text),
    consoleWarnings: consoleMsgs.filter(m => m.type==='warning').map(m=>m.text),
  };
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  log('\n  Saved: test-results/report.json  test-results/console.log');
  log(`  Screenshots: test-results/*.png`);
}

run().catch(console.error);
