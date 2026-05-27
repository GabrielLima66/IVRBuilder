/**
 * IVR Builder — comprehensive Playwright test
 * Covers: screenshots, node creation, edges, modals, theme switching, console errors, export
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'test-results');
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:5173';
const LOGS = [];   // console messages
const ERRORS = []; // page errors

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  LOGS.push(line);
  console.log(line);
}

function section(title) {
  const bar = '─'.repeat(60);
  log(`\n${bar}\n  ${title}\n${bar}`);
}

async function screenshot(page, name) {
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  log(`📸  screenshot → test-results/${name}.png`);
  return path;
}

async function run() {
  section('SETUP');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Capture console messages and JS errors
  const consoleMessages = [];
  page.on('console', msg => {
    const entry = `[${msg.type().toUpperCase()}] ${msg.text()}`;
    consoleMessages.push(entry);
    if (msg.type() === 'error') ERRORS.push(entry);
  });
  page.on('pageerror', err => {
    const entry = `[PAGE ERROR] ${err.message}`;
    consoleMessages.push(entry);
    ERRORS.push(entry);
  });

  try {
    // ─────────────────────────────────────────────────────
    section('1. HOME SCREEN — initial state');
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await screenshot(page, '01-home');
    log(`✓  Home screen loaded`);

    // Confirm expected UI elements
    const title = await page.locator('h1, h2, [class*="title"], [class*="brand"]').first().textContent().catch(() => '(not found)');
    log(`   Page title element: "${title.trim()}"`);

    // Count project cards
    const cards = await page.locator('[class*="project"], [class*="card"]').count();
    log(`   Project cards visible: ${cards}`);

    // ─────────────────────────────────────────────────────
    section('2. CREATE A NEW PROJECT');
    // Look for "Novo Projeto" or "New" button
    const newBtn = page.locator('button').filter({ hasText: /novo|new|criar|create/i }).first();
    const newBtnText = await newBtn.textContent().catch(() => null);
    if (newBtnText) {
      log(`   Found "new project" button: "${newBtnText.trim()}"`);
      await newBtn.click();
      await page.waitForLoadState('networkidle');
      await screenshot(page, '02-after-new-project');
      log(`✓  New project created`);
    } else {
      log(`⚠  No "new project" button found — trying first available project`);
      const firstCard = page.locator('[class*="project"], [class*="card"]').first();
      const hasCard = await firstCard.count();
      if (hasCard) {
        await firstCard.click();
        await page.waitForLoadState('networkidle');
        await screenshot(page, '02-opened-project');
        log(`✓  Opened existing project`);
      }
    }

    // ─────────────────────────────────────────────────────
    section('3. CANVAS STATE');
    // Check if we're on canvas now (ReactFlow present)
    const rfPresent = await page.locator('.react-flow').count();
    log(`   ReactFlow canvas present: ${rfPresent > 0}`);
    if (rfPresent > 0) {
      await screenshot(page, '03-canvas-initial');
      log(`✓  Canvas screenshot taken`);

      // Count existing nodes
      const nodes = await page.locator('.react-flow__node').count();
      const edges = await page.locator('.react-flow__edge').count();
      log(`   Nodes on canvas: ${nodes}`);
      log(`   Edges on canvas: ${edges}`);
    }

    // ─────────────────────────────────────────────────────
    section('4. SIDEBAR — node palette');
    const sidebar = page.locator('[class*="sidebar"], [class*="Sidebar"], aside').first();
    const hasSidebar = await sidebar.count();
    log(`   Sidebar present: ${hasSidebar > 0}`);
    if (hasSidebar) {
      await screenshot(page, '04-sidebar');

      // Count palette items
      const items = await page.locator('[class*="palette"], [class*="node-item"], [draggable="true"]').count();
      log(`   Draggable palette items: ${items}`);

      // Try accordion expansion
      const accordions = await page.locator('[class*="accordion"], [class*="category"], details').all();
      log(`   Accordion sections: ${accordions.length}`);
      if (accordions.length > 1) {
        await accordions[1].click().catch(() => {});
        await page.waitForTimeout(300);
        await screenshot(page, '04b-sidebar-expanded');
        log(`✓  Second sidebar section expanded`);
      }

      // Semantic search
      const searchInput = page.locator('input[placeholder*="busca"], input[placeholder*="search"], input[type="search"]').first();
      const hasSearch = await searchInput.count();
      if (hasSearch) {
        await searchInput.fill('menu');
        await page.waitForTimeout(400);
        await screenshot(page, '04c-sidebar-search');
        log(`✓  Search "menu" executed`);
        const results = await page.locator('[class*="palette"], [class*="node-item"], [draggable="true"]').count();
        log(`   Search results visible: ${results}`);
        await searchInput.fill('');
        await page.waitForTimeout(300);
      }
    }

    // ─────────────────────────────────────────────────────
    section('5. DRAG A NODE ONTO THE CANVAS');
    const canvas = page.locator('.react-flow__pane, .react-flow__renderer').first();
    const canvasBox = await canvas.boundingBox().catch(() => null);
    const draggable = page.locator('[draggable="true"]').first();
    const draggableBox = await draggable.boundingBox().catch(() => null);

    if (canvasBox && draggableBox) {
      const dropX = canvasBox.x + canvasBox.width * 0.5;
      const dropY = canvasBox.y + canvasBox.height * 0.4;
      const itemText = await draggable.textContent().catch(() => '?');
      log(`   Dragging "${itemText.trim()}" to canvas center (${Math.round(dropX)}, ${Math.round(dropY)})`);

      await page.mouse.move(draggableBox.x + draggableBox.width / 2, draggableBox.y + draggableBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(dropX, dropY, { steps: 20 });
      await page.mouse.up();
      await page.waitForTimeout(600);

      const nodesAfter = await page.locator('.react-flow__node').count();
      log(`   Nodes after drag: ${nodesAfter}`);
      await screenshot(page, '05-after-drag');
      log(`✓  Drag attempt completed`);
    } else {
      log(`⚠  Could not get bounding boxes for drag test`);
    }

    // ─────────────────────────────────────────────────────
    section('6. SELECT A NODE & CHECK PROPERTIES PANEL');
    const nodeEls = await page.locator('.react-flow__node').all();
    if (nodeEls.length > 0) {
      await nodeEls[0].click();
      await page.waitForTimeout(400);
      const propPanel = await page.locator('[class*="properties"], [class*="Properties"], [class*="PropertiesPanel"]').first().count();
      log(`   Properties panel visible: ${propPanel > 0}`);
      await screenshot(page, '06-node-selected');
      log(`✓  Node selected, properties panel checked`);
    } else {
      log(`⚠  No nodes to select`);
    }

    // ─────────────────────────────────────────────────────
    section('7. SETTINGS / CONFIG MODAL');
    // Look for gear icon / settings button
    const settingsBtn = page.locator('button[aria-label*="config"], button[aria-label*="setting"], button[title*="config"], [class*="settings"] button, button[class*="gear"]').first();
    const altSettingsBtn = page.locator('button').filter({ hasText: /config|setting|⚙/i }).first();
    let settingsOpened = false;

    for (const btn of [settingsBtn, altSettingsBtn]) {
      if (await btn.count()) {
        await btn.click();
        await page.waitForTimeout(500);
        const modal = await page.locator('[class*="modal"], [role="dialog"]').first().count();
        if (modal) {
          await screenshot(page, '07-settings-modal');
          log(`✓  Settings/config modal opened`);
          settingsOpened = true;
          // Close it
          const closeBtn = page.locator('[aria-label*="fechar"], [aria-label*="close"], button').filter({ hasText: /×|✕|close|fechar/i }).first();
          if (await closeBtn.count()) {
            await closeBtn.click();
          } else {
            await page.keyboard.press('Escape');
          }
          await page.waitForTimeout(400);
          break;
        }
      }
    }
    if (!settingsOpened) {
      log(`⚠  Settings modal not found — trying keyboard shortcut`);
    }

    // ─────────────────────────────────────────────────────
    section('8. THEME SWITCHING');
    // Themes: hacking (matrix), orpen, dark
    const themes = ['hacking', 'orpen', 'dark'];
    for (const theme of themes) {
      // Try to open settings and switch theme
      // Or look for theme buttons directly
      const themeBtn = page.locator(`button, [role="option"]`).filter({ hasText: new RegExp(theme, 'i') }).first();
      if (await themeBtn.count()) {
        await themeBtn.click();
        await page.waitForTimeout(500);
        const dataTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        log(`   Theme "${theme}" clicked → data-theme="${dataTheme}"`);
        await screenshot(page, `08-theme-${theme}`);
      }
    }
    log(`✓  Theme switching tested`);

    // ─────────────────────────────────────────────────────
    section('9. EXPORT MODAL');
    const exportBtn = page.locator('button').filter({ hasText: /export|exportar/i }).first();
    if (await exportBtn.count()) {
      await exportBtn.click();
      await page.waitForTimeout(600);
      const modal = await page.locator('[class*="modal"], [role="dialog"]').first().count();
      if (modal) {
        await screenshot(page, '09-export-modal');
        log(`✓  Export modal opened`);
        const preview = await page.locator('pre, code, textarea, [class*="preview"]').first().textContent().catch(() => null);
        if (preview) {
          log(`   Export preview (first 200 chars): ${preview.slice(0, 200)}`);
        }
        // Close
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
      } else {
        log(`⚠  Export button found but modal didn't open`);
      }
    } else {
      log(`⚠  Export button not found`);
    }

    // ─────────────────────────────────────────────────────
    section('10. CONTEXT NAV PANEL');
    const navPanel = page.locator('[class*="ContextNav"], [class*="nav-panel"], [class*="context-nav"]').first();
    if (await navPanel.count()) {
      await screenshot(page, '10-context-nav');
      log(`✓  Context nav panel present`);
    } else {
      log(`⚠  Context nav panel not found`);
    }

    // ─────────────────────────────────────────────────────
    section('11. CONSOLE LOG ANALYSIS');
    const errors = consoleMessages.filter(m => m.startsWith('[ERROR]') || m.startsWith('[PAGE ERROR]'));
    const warnings = consoleMessages.filter(m => m.startsWith('[WARNING]'));
    const infos = consoleMessages.filter(m => m.startsWith('[INFO]') || m.startsWith('[LOG]'));

    log(`\n   Total console messages: ${consoleMessages.length}`);
    log(`   Errors:   ${errors.length}`);
    log(`   Warnings: ${warnings.length}`);
    log(`   Info/Log: ${infos.length}`);

    if (errors.length) {
      log('\n   ❌ ERRORS:');
      errors.forEach(e => log(`      ${e}`));
    }
    if (warnings.length) {
      log('\n   ⚠  WARNINGS (first 10):');
      warnings.slice(0, 10).forEach(w => log(`      ${w}`));
    }

    // ─────────────────────────────────────────────────────
    section('12. FINAL SCREENSHOT');
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await screenshot(page, '12-final-state');

    // ─────────────────────────────────────────────────────
    section('SUMMARY');
    log(`\n   Screenshots saved to: test-results/`);
    log(`   Total console messages captured: ${consoleMessages.length}`);
    log(`   JS Errors: ${errors.length === 0 ? '✅ none' : `❌ ${errors.length}`}`);
    log(`   Warnings: ${warnings.length === 0 ? '✅ none' : `⚠  ${warnings.length}`}`);

    // Save full console log
    writeFileSync(join(OUT, 'console.log'), consoleMessages.join('\n'), 'utf8');
    log(`   Full console log → test-results/console.log`);

  } catch (err) {
    log(`\n❌ TEST FAILED: ${err.message}\n${err.stack}`);
    await screenshot(page, 'error-state').catch(() => {});
  } finally {
    await browser.close();
    log('\n✅ Browser closed');
  }
}

run().catch(console.error);
