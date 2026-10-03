import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.setDefaultTimeout(240000);
const errs = [];
page.on('pageerror', (e) => { errs.push(e.message); console.log('[pageerror]', e.message); });
page.on('console', (m) => { if (m.type() === 'error') console.log('[err]', m.text()); });
await page.goto('http://localhost:5240/?fast');
await page.waitForFunction(() => window.__ready);
await page.evaluate(() => localStorage.clear());
await page.reload(); await page.waitForFunction(() => window.__ready);
await page.waitForTimeout(1500);
await page.screenshot({ path: 'shots/ot-title.png' });
await page.click('.title-actions .ot');
let n = 0;
while (true) {
  await page.waitForFunction(() => __app.review && __app.review.case && !__app.review.locked || document.querySelector('.ot-over'));
  if (await page.$('.ot-over')) break;
  const info = await page.evaluate((n) => {
    const r = __app.review, c = r.case; __pump(10);
    const t = c.truth;
    // answer the first four right, then get three wrong
    const wrong = n >= 4;
    r.decision = wrong ? { restart: t.restart === 'Play on' ? 'Free kick' : 'Play on', entries: [] } : { restart: t.restart, entries: t.infringements.map((i) => ({ team: i.team, num: i.num, type: i.type, card: i.card })) };
    r.caseTime = 40; r._submit();
    return `${c.gen}${c.close ? ' (close)' : ''}`;
  }, n);
  await page.waitForSelector('.v-score b');
  const score = await page.$eval('.v-score b', (e) => e.textContent);
  const combo = await page.$$eval('.v-combo .chip', (l) => l.map((e) => e.textContent).join(' | ')).catch(() => '');
  console.log(`OT ${++n} ${info} score ${score} ${combo}`);
  if (n === 3) await page.screenshot({ path: 'shots/ot-verdict.png' });
  await page.click('.v-actions .primary');
  if (n > 14) break;
}
await page.waitForSelector('.ot-over');
await page.screenshot({ path: 'shots/ot-over.png' });
console.log('over:', await page.$eval('.ot-over', (e) => e.textContent.replace(/\s+/g, ' ')));
console.log('errors', errs);
await browser.close();
