/**
 * Recon for settings modal & properties panel structure
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'test-results');
mkdirSync(OUT, { recursive: true });

async function snap(page, name) {
  await page.screenshot({ path: join(OUT, `sr-${name}.png`), fullPage: false });
  console.log(`📸  sr-${name}.png`);
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // 1. Go home, create project
  await page.goto('http://localhost:5173');
  await page.waitForLoadState('networkidle');
  await page.locator('button.btn-neon').filter({ hasText: '+ NOVO PROJETO' }).first().click();
  await page.waitForSelector('.modal');
  const nameInput = page.locator('input[placeholder*="orpen-ivr"]');
  await nameInput.fill('settings-recon');
  await page.locator('.modal button').filter({ hasText: 'CRIAR' }).click();
  await page.waitForSelector('.react-flow', { timeout: 8000 });
  await page.waitForTimeout(500);
  await snap(page, '0-canvas');

  // 2. Click CONFIG button
  console.log('\n=== CLICKING ⚙ CONFIG ===');
  const configBtn = page.locator('button[title="Configurações do projeto"]');
  if (await configBtn.count()) {
    await configBtn.click();
    await page.waitForTimeout(800);
    await snap(page, '1-after-config-click');

    // Dump all elements with class containing 'modal', 'config', 'settings', 'overlay'
    const allEls = await page.evaluate(() => {
      const matches = [];
      document.querySelectorAll('*').forEach(el => {
        const cls = typeof el.className === 'string' ? el.className : '';
        if (/modal|config|setting|overlay|panel|Config|Modal|Panel/i.test(cls)) {
          matches.push({
            tag: el.tagName.toLowerCase(),
            class: cls.slice(0, 100),
            id: el.id || '',
            text: (el.innerText || '').slice(0, 100).replace(/\n/g, '↵'),
            role: el.getAttribute('role') || '',
            visible: el.getBoundingClientRect().width > 0
          });
        }
      });
      return matches.slice(0, 30);
    });

    console.log('Elements with modal/config/settings classes:');
    allEls.forEach(el => {
      console.log(`  <${el.tag} class="${el.class}" id="${el.id}" role="${el.role}" visible=${el.visible}>`);
      if (el.text) console.log(`    text: "${el.text}"`);
    });

    // Close it — try Escape or X button
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await snap(page, '2-after-escape');
    const stillOpen = await page.evaluate(() => {
      return [...document.querySelectorAll('*')].some(el => {
        const cls = typeof el.className === 'string' ? el.className : '';
        return /modal|overlay/i.test(cls) && el.getBoundingClientRect().width > 0;
      });
    });
    console.log(`Modal still open after Escape: ${stillOpen}`);
    if (stillOpen) {
      const closeBtn = page.locator('button[aria-label="Fechar"], button').filter({ hasText: /×|X|Close|Fechar/ }).first();
      if (await closeBtn.count()) {
        await closeBtn.click({ force: true });
        await page.waitForTimeout(300);
      }
    }
  } else {
    console.log('⚠ Config button not found by title');
    // Try by text content
    const btns = await page.locator('button').all();
    for (const btn of btns) {
      const t = (await btn.textContent()).trim();
      console.log(`  btn: "${t}" | title="${await btn.getAttribute('title')}"`);
    }
  }

  // 3. Click a node and check properties panel
  console.log('\n=== NODE SELECTION + PROPERTIES PANEL ===');
  const nodes = await page.locator('.react-flow__node').all();
  console.log(`Nodes: ${nodes.length}`);
  if (nodes.length > 0) {
    await nodes[0].click();
    await page.waitForTimeout(400);
    await snap(page, '3-node-selected');

    // Find properties panel
    const propsEls = await page.evaluate(() => {
      const matches = [];
      document.querySelectorAll('*').forEach(el => {
        const cls = typeof el.className === 'string' ? el.className : '';
        if (/propert|Propert|props|panel|Panel|inspector/i.test(cls)) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 50 && rect.height > 50) {
            matches.push({
              tag: el.tagName.toLowerCase(),
              class: cls.slice(0, 100),
              id: el.id || '',
              text: (el.innerText || '').slice(0, 80).replace(/\n/g, '↵'),
              w: Math.round(rect.width),
              h: Math.round(rect.height),
            });
          }
        }
      });
      return matches.slice(0, 20);
    });
    console.log('Properties-like elements after node click:');
    propsEls.forEach(el => {
      console.log(`  <${el.tag} class="${el.class}" ${el.w}x${el.h}> "${el.text}"`);
    });
  }

  // 4. Check export modal structure
  console.log('\n=== EXPORT MODAL ===');
  const exportBtn = page.locator('button').filter({ hasText: /exportar/i }).first();
  if (await exportBtn.count()) {
    await exportBtn.click();
    await page.waitForTimeout(600);
    await snap(page, '4-export-modal');

    const modalEls = await page.evaluate(() => {
      const matches = [];
      document.querySelectorAll('*').forEach(el => {
        const cls = typeof el.className === 'string' ? el.className : '';
        const rect = el.getBoundingClientRect();
        if (/modal|export|preview|conf/i.test(cls) && rect.width > 0) {
          matches.push({
            tag: el.tagName.toLowerCase(),
            class: cls.slice(0, 80),
            text: (el.innerText || '').slice(0, 100).replace(/\n/g, '↵'),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          });
        }
      });
      return matches.slice(0, 20);
    });
    console.log('Export modal elements:');
    modalEls.forEach(el => {
      console.log(`  <${el.tag} class="${el.class}" ${el.w}x${el.h}> "${el.text}"`);
    });

    // List buttons in export modal
    const modalBtns = await page.locator('[class*="modal"] button, [class*="Modal"] button').all();
    console.log(`\nExport modal buttons: ${modalBtns.length}`);
    for (const btn of modalBtns) {
      console.log(`  "${(await btn.textContent()).trim()}"`);
    }
    await page.keyboard.press('Escape');
  }

  await browser.close();
  console.log('\n✅ Settings recon done');
}

run().catch(console.error);
