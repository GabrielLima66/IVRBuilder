/**
 * Reconnaissance — discover actual selectors in the IVR Builder app
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'test-results');
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:5173';

async function snap(page, name) {
  const path = join(OUT, `recon-${name}.png`);
  await page.screenshot({ path, fullPage: true });
  console.log(`📸  recon-${name}.png`);
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const consoleMsgs = [];
  page.on('console', m => consoleMsgs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => consoleMsgs.push(`[pageerror] ${e.message}`));

  // ── 1. HOME ─────────────────────────────────────────────────────────
  console.log('\n=== HOME SCREEN ===');
  await page.goto(BASE);
  await page.waitForLoadState('networkidle');
  await snap(page, '01-home');

  // Dump all buttons
  const buttons = await page.locator('button').all();
  console.log(`Buttons found: ${buttons.length}`);
  for (const btn of buttons) {
    const txt = (await btn.textContent()).trim();
    const cls = await btn.getAttribute('class');
    const aria = await btn.getAttribute('aria-label');
    console.log(`  btn: "${txt}" | class="${cls}" | aria="${aria}"`);
  }

  // Dump all inputs
  const inputs = await page.locator('input').all();
  console.log(`\nInputs found: ${inputs.length}`);
  for (const inp of inputs) {
    const ph = await inp.getAttribute('placeholder');
    const type = await inp.getAttribute('type');
    const name = await inp.getAttribute('name');
    console.log(`  input: type="${type}" placeholder="${ph}" name="${name}"`);
  }

  // HTML structure of body (top-level)
  const bodyHTML = await page.evaluate(() => {
    const clean = el => {
      const cls = el.className ? ` class="${el.className}"` : '';
      const id  = el.id ? ` id="${el.id}"` : '';
      return `<${el.tagName.toLowerCase()}${id}${cls}>`;
    };
    const walk = (el, depth) => {
      if (depth > 4) return '';
      let out = '  '.repeat(depth) + clean(el) + '\n';
      for (const child of el.children) out += walk(child, depth + 1);
      return out;
    };
    return walk(document.body, 0);
  });
  console.log('\n=== DOM structure (body, depth 4) ===');
  console.log(bodyHTML.slice(0, 4000));

  // ── 2. CLICK NEW PROJECT ─────────────────────────────────────────────
  console.log('\n=== AFTER CLICKING NOVO PROJETO ===');
  const newBtn = page.locator('button').filter({ hasText: /novo|new/i }).first();
  if (await newBtn.count()) {
    await newBtn.click();
    await page.waitForTimeout(800);
    await snap(page, '02-after-new');

    // Any dialog / modal?
    const dialogs = await page.locator('[role="dialog"], [class*="modal"], [class*="Modal"]').all();
    console.log(`Dialogs/modals: ${dialogs.length}`);
    for (const d of dialogs) {
      const txt = (await d.textContent()).trim().slice(0, 200);
      const cls = await d.getAttribute('class');
      console.log(`  dialog: class="${cls}" | text="${txt}"`);
    }

    // All buttons again
    const btns2 = await page.locator('button').all();
    console.log(`\nButtons after click: ${btns2.length}`);
    for (const btn of btns2) {
      const txt = (await btn.textContent()).trim();
      const cls = await btn.getAttribute('class');
      const aria = await btn.getAttribute('aria-label');
      console.log(`  btn: "${txt}" | class="${cls}" | aria="${aria}"`);
    }

    // All inputs
    const inputs2 = await page.locator('input').all();
    console.log(`\nInputs after click: ${inputs2.length}`);
    for (const inp of inputs2) {
      const ph = await inp.getAttribute('placeholder');
      const type = await inp.getAttribute('type');
      const val = await inp.inputValue().catch(() => '');
      console.log(`  input: type="${type}" placeholder="${ph}" value="${val}"`);
    }
  }

  // ── 3. NAVIGATE TO CANVAS ─────────────────────────────────────────────
  // If a dialog appeared, interact with it
  const confirmBtn = page.locator('button').filter({ hasText: /criar|ok|confirm|abrir|open|start/i }).first();
  if (await confirmBtn.count()) {
    console.log('\n=== CONFIRMING DIALOG ===');
    await confirmBtn.click();
    await page.waitForTimeout(1000);
    await snap(page, '03-after-confirm');
  }

  // Try pressing Enter on name input
  const nameInput = page.locator('input').first();
  if (await nameInput.count()) {
    const val = await nameInput.inputValue().catch(() => '');
    if (!val) await nameInput.fill('Teste Recon');
    await nameInput.press('Enter');
    await page.waitForTimeout(1000);
    await snap(page, '03b-after-enter');
  }

  // ── 4. CANVAS DOM ─────────────────────────────────────────────────────
  const rfPresent = await page.locator('.react-flow').count();
  console.log(`\n=== CANVAS (react-flow present: ${rfPresent}) ===`);

  if (rfPresent) {
    await snap(page, '04-canvas');

    const canvasDOM = await page.evaluate(() => {
      const rf = document.querySelector('.react-flow');
      if (!rf) return 'not found';
      const clean = el => {
        const cls = el.className ? ` class="${typeof el.className === 'string' ? el.className.slice(0, 60) : ''}"` : '';
        const id  = el.id ? ` id="${el.id}"` : '';
        return `<${el.tagName.toLowerCase()}${id}${cls}>`;
      };
      const walk = (el, depth) => {
        if (depth > 3) return '';
        let out = '  '.repeat(depth) + clean(el) + '\n';
        for (const child of el.children) out += walk(child, depth + 1);
        return out;
      };
      return walk(rf.parentElement, 0);
    });
    console.log(canvasDOM.slice(0, 4000));

    // Buttons in canvas view
    const canvasBtns = await page.locator('button').all();
    console.log(`\nAll buttons in canvas view (${canvasBtns.length}):`);
    for (const btn of canvasBtns) {
      const txt = (await btn.textContent()).trim().slice(0, 80);
      const cls = (await btn.getAttribute('class') || '').slice(0, 80);
      const aria = await btn.getAttribute('aria-label');
      console.log(`  "${txt}" | ${cls} | aria="${aria}"`);
    }
  } else {
    // Show current page body
    const bodyNow = await page.evaluate(() => document.body.innerHTML.slice(0, 3000));
    console.log('Current page body:', bodyNow);
  }

  // ── CONSOLE MESSAGES ──────────────────────────────────────────────────
  console.log('\n=== CONSOLE MESSAGES ===');
  consoleMsgs.forEach(m => console.log(' ', m));

  await browser.close();
  console.log('\n✅ Recon done — screenshots in test-results/');
}

run().catch(console.error);
