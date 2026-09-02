import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL || 'http://localhost:8080';

async function login(page) {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.locator('input[type="email"]').fill('tockppd@gmail.com');
  await page.locator('input[type="password"]').fill('easygold1234');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/dashboard/, { timeout: 15000 });
}

async function dumpTicketsTable(page, scope, statusChip) {
  const url = scope === 'all' ? BASE + '/ticket-tracking?scope=all' : BASE + '/ticket-tracking';
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('table', { timeout: 15000 });

  if (statusChip && statusChip !== 'all') {
    const chips = page.locator('button.rounded-full');
    const count = await chips.count();
    let clicked = false;
    for (let i = 0; i < count; i++) {
      const txt = (await chips.nth(i).innerText()) || '';
      if (txt.trim().startsWith(statusChip)) {
        await chips.nth(i).click();
        clicked = true;
        break;
      }
    }
    if (!clicked) console.log('  !! could not find chip:', statusChip);
    await page.waitForTimeout(500);
  }

  const table = page.locator('table').first();
  const thead = table.locator('thead');
  const headCount = await thead.count();
  let headers = [];
  if (headCount > 0) {
    const ths = thead.locator('th');
    const n = await ths.count();
    for (let i = 0; i < n; i++) headers.push((await ths.nth(i).innerText()).trim());
  }
  const tbody = table.locator('tbody');
  const rowCount = await tbody.locator('tr').count();
  const firstRows = tbody.locator('tr').first();
  const cells = firstRows.locator('td');
  const cellCount = await cells.count();
  const firstCells = [];
  for (let i = 0; i < Math.min(cellCount, 4); i++) firstCells.push((await cells.nth(i).innerText()).trim().slice(0, 40));

  console.log(`[${scope} scope · status=${statusChip || 'all'}] rows=${rowCount}`);
  console.log(`  header => ${headers.length ? JSON.stringify(headers) : 'EMPTY/NONE'}`);
  console.log(`  first row cells => ${cellCount ? JSON.stringify(firstCells) : 'EMPTY/NONE'}`);
}

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google Chrome/Application/chrome.exe',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
try {
  await login(page);
  for (const s of ['All', 'pending', 'reviewed', 'lm_approved', 'finalized', 'to-return', 'returned', 'rejected', 'recalled']) {
    await dumpTicketsTable(page, 'all', s);
  }
  for (const s of ['All', 'pending', 'reviewed', 'lm_approved', 'finalized', 'returned']) {
    await dumpTicketsTable(page, 'mine', s);
  }
} finally {
  await browser.close();
}
console.log('DONE');