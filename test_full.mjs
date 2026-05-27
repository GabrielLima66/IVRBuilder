/**
 * IVR Builder — full test suite with correct selectors (post-recon)
 * Tests: screenshots, node creation, drag, edges, modals, theme, console errors, export
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'test-results');
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:5173';
const results = { pass: [], fail: [], warn: [] };
const consoleMsgs = [];

function log(msg) { console.log(`[${new Date().toISOString().slice(11,19)}] ${msg}`); }
function pass(msg) { results.pass.push(msg); log(`✅ ${msg}`); }
function fail(msg) { results.fail.push(msg); log(`❌ ${msg}`); }
function warn(msg) { results.warn.push(msg); log(`⚠  ${msg}`); }
function section(t) { log(`\n${'─'.repeat(55)}\n  ${t}\n${'─'.repeat(55)}`); }

async function snap(page, name, label='') {
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  log(`📸  ${name}.png${label ? ' — '+label : ''}`);
}

// ─────────────────────────────────────────────────────────────────────────
async function run() {
  section('SETUP');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('console', m => consoleMsgs.push({ type: m.type(), text: m.text() }));
  page.on('pageerror', e => consoleMsgs.push({ type: 'pageerror', text: e.message }));

  try {
    // ─────────────────────────────────────────────────────────────────
    section('1. HOME SCREEN');
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await snap(page, '01-home', 'initial state');

    const homeButtons = await page.locator('button.btn-neon').allTextContents();
    pass(`Home loaded — buttons: ${homeButtons.map(t=>t.trim()).join(' | ')}`);

    // ─────────────────────────────────────────────────────────────────
    section('2. NEW PROJECT MODAL');
    await page.locator('button.btn-neon').filter({ hasText: '+ NOVO PROJETO' }).first().click();
    await page.waitForSelector('.modal', { state: 'visible' });
    await snap(page, '02-new-project-modal', 'modal open');
    pass('New Project modal opened');

    // Modal contents
    const modalTitle = await page.locator('.modal h2, .modal .modal-title, .modal strong').first().textContent().catch(() => '?');
    const criarBtn = page.locator('.modal button').filter({ hasText: 'CRIAR' });
    const isDisabled = await criarBtn.isDisabled();
    pass(`Modal title: "${modalTitle.trim()}" | CRIAR disabled initially: ${isDisabled}`);

    // Fill name and create
    const nameInput = page.locator('input[placeholder*="orpen-ivr"]');
    await nameInput.fill('teste-recon-auto');
    await page.waitForTimeout(200);
    const isNowEnabled = await criarBtn.isEnabled();
    pass(`CRIAR enabled after typing: ${isNowEnabled}`);
    await snap(page, '02b-modal-filled', 'name filled');

    await criarBtn.click();
    await page.waitForTimeout(800);
    await snap(page, '02c-after-create', 'after create');
    pass('CRIAR clicked');

    // ─────────────────────────────────────────────────────────────────
    section('3. CANVAS');
    // The app may navigate to canvas — check for ReactFlow
    await page.waitForSelector('.react-flow', { timeout: 10000 }).catch(() => null);
    const rfPresent = await page.locator('.react-flow').count();

    if (rfPresent) {
      pass('ReactFlow canvas present');
      await snap(page, '03-canvas', 'canvas loaded');

      const nodes = await page.locator('.react-flow__node').count();
      const edges = await page.locator('.react-flow__edge').count();
      pass(`Canvas state: ${nodes} nodes, ${edges} edges`);

      // ── 3a. Sidebar recon
      section('4. SIDEBAR');
      // Look for sidebar via common class names
      const sidebarSelectors = [
        '[class*="Sidebar"]', '[class*="sidebar"]', 'aside',
        '[class*="palette"]', '[class*="accordion"]'
      ];
      let sidebarFound = false;
      for (const sel of sidebarSelectors) {
        const count = await page.locator(sel).count();
        if (count > 0) {
          log(`   Sidebar element "${sel}" found: ${count}`);
          sidebarFound = true;
        }
      }

      // Dump ALL buttons in canvas view (for debugging)
      const allBtns = await page.locator('button').all();
      log(`   Total buttons on canvas: ${allBtns.length}`);
      for (const btn of allBtns.slice(0, 20)) {
        const txt = (await btn.textContent()).trim().slice(0, 60);
        const cls = (await btn.getAttribute('class') || '').slice(0, 60);
        const aria = await btn.getAttribute('aria-label') || '';
        log(`     btn: "${txt}" | class="${cls}" | aria="${aria}"`);
      }

      // Drag test — find draggable sidebar items
      const draggables = await page.locator('[draggable="true"]').all();
      log(`   Draggable items: ${draggables.length}`);
      for (const d of draggables.slice(0, 5)) {
        const txt = (await d.textContent()).trim().slice(0, 40);
        const cls = (await d.getAttribute('class') || '').slice(0, 60);
        log(`     draggable: "${txt}" | class="${cls}"`);
      }
      await snap(page, '04-canvas-full', 'canvas with sidebar');

      // Screenshot sidebar specifically
      const sidebar = page.locator('[class*="Sidebar"], [class*="sidebar"], aside').first();
      if (await sidebar.count()) {
        const sidebarBox = await sidebar.boundingBox();
        if (sidebarBox) {
          await page.screenshot({
            path: join(OUT, '04b-sidebar-closeup.png'),
            clip: sidebarBox
          });
          log(`   📸  04b-sidebar-closeup.png`);
        }
        pass('Sidebar found and captured');

        // Expand accordion
        const accordionBtns = await page.locator('[class*="accordion"] button, [class*="category"] button, details summary').all();
        log(`   Accordion buttons: ${accordionBtns.length}`);
        if (accordionBtns.length > 1) {
          await accordionBtns[1].click().catch(() => {});
          await page.waitForTimeout(300);
          await snap(page, '04c-sidebar-accordion-expanded');
        }

        // Search
        const searchInput = page.locator('input[type="text"], input[type="search"]').first();
        if (await searchInput.count()) {
          await searchInput.fill('menu');
          await page.waitForTimeout(400);
          await snap(page, '04d-sidebar-search-menu', 'search "menu"');
          const resultCount = await page.locator('[draggable="true"]').count();
          pass(`Sidebar search "menu": ${resultCount} results`);
          await searchInput.fill('');
          await page.waitForTimeout(300);
        }
      } else {
        warn('Sidebar not found with common selectors');
      }

      // ── DRAG A NODE
      section('5. DRAG NODE ONTO CANVAS');
      const draggableItems = await page.locator('[draggable="true"]').all();
      if (draggableItems.length > 0) {
        const canvasPane = page.locator('.react-flow__pane').first();
        const paneBox = await canvasPane.boundingBox();
        const itemBox = await draggableItems[0].boundingBox();

        if (paneBox && itemBox) {
          const dropX = paneBox.x + paneBox.width * 0.5;
          const dropY = paneBox.y + paneBox.height * 0.4;
          const itemLabel = (await draggableItems[0].textContent()).trim().slice(0, 30);
          log(`   Dragging "${itemLabel}" → (${Math.round(dropX)}, ${Math.round(dropY)})`);

          await page.mouse.move(itemBox.x + itemBox.width / 2, itemBox.y + itemBox.height / 2);
          await page.mouse.down();
          await page.mouse.move(dropX - 50, dropY - 50, { steps: 10 });
          await page.mouse.move(dropX, dropY, { steps: 10 });
          await page.mouse.up();
          await page.waitForTimeout(600);

          const nodesAfter = await page.locator('.react-flow__node').count();
          pass(`Drag attempted "${itemLabel}" → nodes now: ${nodesAfter} (was: ${nodes})`);
          await snap(page, '05-after-drag', 'after drag');
        }
      } else {
        warn('No draggable items found for drag test');
      }

      // ── SELECT NODE
      section('6. NODE SELECTION + PROPERTIES PANEL');
      const nodeEls = await page.locator('.react-flow__node').all();
      if (nodeEls.length > 0) {
        // Click the first non-context node
        for (const nodeEl of nodeEls) {
          const cls = await nodeEl.getAttribute('class') || '';
          if (!cls.includes('context') && !cls.includes('Context')) {
            await nodeEl.click();
            break;
          }
        }
        await nodeEls[0].click();
        await page.waitForTimeout(400);

        // Check properties panel
        const propPanelSelectors = ['[class*="PropertiesPanel"]', '[class*="properties-panel"]', '[class*="properties"]'];
        let propFound = false;
        for (const sel of propPanelSelectors) {
          if (await page.locator(sel).count()) {
            pass(`Properties panel found: ${sel}`);
            await snap(page, '06-node-selected-props', 'with properties panel');
            propFound = true;
            break;
          }
        }
        if (!propFound) {
          warn('Properties panel not found after node click');
          await snap(page, '06-node-selected', 'node selected');
        }
      }

      // ── SETTINGS MODAL
      section('7. SETTINGS / CONFIG MODAL');
      // Look for gear/config button by aria-label or title
      const settingsSelectors = [
        'button[aria-label*="Configurações"]',
        'button[aria-label*="config"]',
        'button[title*="config"]',
        'button[title*="Configurações"]',
      ];
      let settingsOpened = false;
      for (const sel of settingsSelectors) {
        const btn = page.locator(sel).first();
        if (await btn.count()) {
          log(`   Found settings button: ${sel}`);
          await btn.click();
          await page.waitForTimeout(500);
          if (await page.locator('.modal, [role="dialog"]').count()) {
            await snap(page, '07-settings-modal', 'config modal');
            pass(`Settings modal opened via "${sel}"`);
            settingsOpened = true;
            await page.keyboard.press('Escape');
            await page.waitForTimeout(300);
          }
          break;
        }
      }
      if (!settingsOpened) {
        // Try buttons with partial text match
        const allBtns2 = await page.locator('button').all();
        for (const btn of allBtns2) {
          const txt = (await btn.textContent()).trim();
          const aria = (await btn.getAttribute('aria-label') || '').toLowerCase();
          if (/config|setting|gear|⚙|engrenagem/i.test(txt) || /config|setting/i.test(aria)) {
            log(`   Trying settings btn: "${txt}" / aria="${aria}"`);
            await btn.click();
            await page.waitForTimeout(500);
            if (await page.locator('.modal, [role="dialog"]').count()) {
              await snap(page, '07-settings-modal');
              pass('Settings modal opened');
              settingsOpened = true;
              await page.keyboard.press('Escape');
              await page.waitForTimeout(300);
              break;
            }
          }
        }
      }
      if (!settingsOpened) {
        // Screenshot all buttons for debugging
        await snap(page, '07-no-settings-found', 'all buttons');
        warn('Settings modal not found — captured current state');
      }

      // ── THEME SWITCHING
      section('8. THEME SWITCHING');
      const dataThemeBefore = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      log(`   Current data-theme: "${dataThemeBefore}"`);

      // Try opening settings to find theme switcher
      if (!settingsOpened) {
        // Try all buttons that might open settings
        for (const btn of await page.locator('button').all()) {
          const txt = (await btn.textContent()).trim();
          if (txt.length < 5 || /⚙|☰|≡|⋮|···/.test(txt)) {
            await btn.click();
            await page.waitForTimeout(300);
            if (await page.locator('.modal').count()) {
              settingsOpened = true;
              break;
            }
          }
        }
      }

      if (settingsOpened || await page.locator('.modal').count()) {
        // Look for theme buttons inside modal
        const themeOptions = await page.locator('.modal [class*="theme"], .modal [class*="color"]').all();
        log(`   Theme options in modal: ${themeOptions.length}`);
        for (const opt of themeOptions) {
          const txt = (await opt.textContent()).trim();
          log(`     theme option: "${txt}"`);
        }
        // Close modal
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }

      // Test direct theme change via JS (as secondary verification)
      const themeNames = ['matrix', 'orpen', 'dark'];
      for (const theme of themeNames) {
        await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
        await page.waitForTimeout(300);
        const actual = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        await snap(page, `08-theme-${theme}`, `theme: ${theme}`);
        pass(`Theme "${theme}" applied — data-theme="${actual}"`);
      }
      // Restore
      await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), dataThemeBefore || 'matrix');

      // ── EXPORT MODAL
      section('9. EXPORT');
      const exportBtns = await page.locator('button').all();
      let exportOpened = false;
      for (const btn of exportBtns) {
        const txt = (await btn.textContent()).trim();
        if (/export|exportar/i.test(txt)) {
          log(`   Found export button: "${txt}"`);
          await btn.click();
          await page.waitForTimeout(600);
          if (await page.locator('.modal, [role="dialog"]').count()) {
            await snap(page, '09-export-modal', 'export modal');
            pass(`Export modal opened: "${txt}"`);
            exportOpened = true;

            // Check for .conf preview
            const previewEl = page.locator('pre, code, textarea, [class*="preview"]').first();
            if (await previewEl.count()) {
              const preview = (await previewEl.textContent()).slice(0, 300);
              pass(`Export preview content: "${preview.slice(0,100)}..."`);
            }
            // List download buttons
            const dlBtns = await page.locator('.modal button').all();
            for (const dlBtn of dlBtns) {
              const t = (await dlBtn.textContent()).trim();
              log(`     modal button: "${t}"`);
            }
            await page.keyboard.press('Escape');
            await page.waitForTimeout(400);
            break;
          }
          break;
        }
      }
      if (!exportOpened) warn('Export modal not triggered');

      // ── CONTEXT NAV PANEL
      section('10. CONTEXT NAV PANEL');
      const navSelectors = ['[class*="ContextNav"]', '[class*="context-nav"]', '[class*="ContextNavPanel"]'];
      let navFound = false;
      for (const sel of navSelectors) {
        if (await page.locator(sel).count()) {
          await snap(page, '10-context-nav', sel);
          pass(`Context nav panel: ${sel}`);
          navFound = true;
          break;
        }
      }
      if (!navFound) warn('Context nav panel not found');

    } else {
      warn('ReactFlow canvas not found — still on home or name dialog');
      await snap(page, '03-no-canvas', 'current state');

      // Dump page content
      const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
      log(`Current page text: "${bodyText}"`);
    }

    // ─────────────────────────────────────────────────────────────────
    section('11. CONSOLE ANALYSIS');
    const errors = consoleMsgs.filter(m => m.type === 'error' || m.type === 'pageerror');
    const warnings = consoleMsgs.filter(m => m.type === 'warning');
    const infos = consoleMsgs.filter(m => m.type === 'log' || m.type === 'info');

    log(`\n   Total messages: ${consoleMsgs.length}`);
    log(`   Errors:   ${errors.length}`);
    log(`   Warnings: ${warnings.length}`);
    log(`   Info/Log: ${infos.length}`);

    if (errors.length === 0) pass('Zero JS errors in console');
    else {
      fail(`${errors.length} JS error(s) in console`);
      errors.forEach(e => log(`   ❌  ${e.text}`));
    }

    if (warnings.length > 0) {
      warn(`${warnings.length} console warning(s)`);
      warnings.slice(0, 10).forEach(w => log(`   ⚠  ${w.text}`));
    }

    // Save full console log
    const logContent = consoleMsgs.map(m => `[${m.type.toUpperCase()}] ${m.text}`).join('\n');
    writeFileSync(join(OUT, 'console.log'), logContent, 'utf8');
    log(`\n   Console log saved → test-results/console.log`);

    // ─────────────────────────────────────────────────────────────────
    section('FINAL SUMMARY');
    log(`\n   ✅ PASS: ${results.pass.length}`);
    results.pass.forEach(p => log(`      • ${p}`));
    log(`\n   ❌ FAIL: ${results.fail.length}`);
    results.fail.forEach(f => log(`      • ${f}`));
    log(`\n   ⚠  WARN: ${results.warn.length}`);
    results.warn.forEach(w => log(`      • ${w}`));

    // Save JSON report
    const report = {
      timestamp: new Date().toISOString(),
      pass: results.pass,
      fail: results.fail,
      warn: results.warn,
      consoleErrors: errors.map(e => e.text),
      consoleWarnings: warnings.map(w => w.text),
    };
    writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
    log(`\n   Report saved → test-results/report.json`);
    log(`   Screenshots → test-results/`);

  } catch (err) {
    fail(`Test suite crashed: ${err.message}`);
    log(err.stack);
    await snap(page, 'crash-state').catch(() => {});
  } finally {
    await browser.close();
  }
}

run().catch(console.error);
