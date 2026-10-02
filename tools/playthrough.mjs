// Plays all five shifts: answers each case with the true call (optionally taking bribes / flagging ARBITER),
// clicks through verdicts, reports and the finale. Prints a log + screenshots of key screens.
import { chromium } from 'playwright-core';
const mode = process.argv[2] || 'honest'; // honest | bribe | sloppy
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('http://localhost:5240/');
await page.waitForFunction(() => window.__ready);
await page.evaluate(() => localStorage.clear());
await page.reload(); await page.waitForFunction(() => window.__ready);
await page.click('.title-actions .primary');
for (let day = 1; day <= 5; day++) {
  await page.waitForSelector('.inbox', { timeout: 10000 });
  // open every mail, answer choices
  const n = await page.$$eval('.mail-list li', (l) => l.length);
  for (let i = 0; i < n; i++) {
    await page.click(`.mail-list li:nth-child(${i + 1})`);
    const ch = await page.$('.choice');
    if (ch) await page.click(mode === 'bribe' ? '.choice button.danger' : '.choice button:not(.danger)');
  }
  if (day === 3) await page.screenshot({ path: `shots/pt-inbox3-${mode}.png` });
  await page.click('text=Start shift →');
  let k = 0;
  while (true) {
    await page.waitForSelector('.review-screen', { timeout: 10000 });
    await page.evaluate(() => document.querySelector('.coach')?.remove());
    const info = await page.evaluate((mode) => {
      const r = __app.review, c = r.case;
      __pump(20);
      const t = c.truth;
      let restart = t.restart, entries = t.infringements.map((i) => ({ team: i.team, num: i.num, type: i.type, card: i.card }));
      if (mode === 'bribe' && c.bribe) restart = c.bribe.wants;
      if (mode === 'sloppy') { restart = 'Play on'; entries = []; }
      r.decision = { restart, entries };
      if (c.arbiter && c.arbiter.wrong && mode !== 'sloppy') r.flagged = true;
      r.caseTime = 30;
      r._submit();
      return { gen: c.gen, restart: t.restart, offs: t.infringements.map((i) => `${i.type}/${i.card}#${i.num}${i.offBall ? '(off)' : ''}`).join(','), arb: c.arbiter ? `${c.arbiter.restart}${c.arbiter.wrong ? '(WRONG)' : ''}` : '', bribe: c.bribe ? c.bribe.wants : '', teams: `${c.clip.attacking.short}-${c.clip.defending.short}` };
    }, mode);
    const score = await page.$eval('.v-score b', (e) => e.textContent);
    console.log(`D${day} C${++k} ${info.gen.padEnd(9)} ${info.teams} → ${info.restart.padEnd(14)} ${info.offs.padEnd(40)} score ${score} ${info.arb ? 'ARB ' + info.arb : ''} ${info.bribe ? 'BRIBE wants ' + info.bribe : ''}`);
    if (day === 4 && k === 3) await page.screenshot({ path: `shots/pt-verdict-${mode}.png` });
    await page.click('.v-actions .primary');
    const report = await page.$('.report');
    if (report) {
      const txt = await page.$eval('.report h2', (e) => e.textContent);
      const wal = await page.$eval('.report .pay b', (e) => e.textContent);
      console.log(`   report: ${txt} wallet ${wal}`);
      if (day === 5) await page.screenshot({ path: `shots/pt-report-${mode}.png` });
      await page.click('.report .primary');
      break;
    }
  }
  if (await page.$('.ending')) break;
}
await page.waitForTimeout(300);
if (await page.$('.final')) {
  await page.screenshot({ path: `shots/pt-final-${mode}.png` });
  const btns = await page.$$('.final-opt');
  await btns[mode === 'bribe' ? btns.length - 1 : 0].click();
}
await page.waitForSelector('.ending');
console.log('ENDING:', await page.$eval('.ending h1', (e) => e.textContent), '|', await page.$eval('.end-stats', (e) => e.textContent));
await page.screenshot({ path: `shots/pt-ending-${mode}.png` });
console.log('errors:', errs.slice(0, 10));
await browser.close();
