// Spiller en hel hurtig kamp i en rigtig browser og fejler, hvis spillet går i stå eller giver fejl.
// Kør: python3 -m http.server 8000 &   og derefter   node tests/smoke.cjs   (kræver `npm i playwright` og Chrome)
const { chromium } = require('playwright');
const URL = process.env.SPIL_URL || 'http://localhost:8000/';
const T = { timeout: 200000 };
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const fejl = [];
  page.on('console', (m) => { if (m.type() === 'error') fejl.push('console: ' + m.text()); });
  page.on('pageerror', (e) => fejl.push('fejl på siden: ' + e.message));
  const S = (f, a) => page.evaluate(f, a);
  await page.goto(URL);
  await page.waitForFunction(() => document.getElementById('ui').className !== 's-load', null, T);
  await S(() => { window.__spil.world.fart = 4; });
  await page.fill('#f-navn', 'Røgtest'); await page.click('[data-a=gemSpiller]');
  const skyd = async (x, y) => {
    await page.waitForFunction(() => window.__spil.kamp && window.__spil.kamp.sigte && window.__spil.kamp.sigte.klar, null, T);
    const pt = await S(([x, y]) => { const w = window.__spil.world; const v = w.camera.position.clone().set(x, y, 29).project(w.camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; }, [x, y]);
    await page.mouse.click(pt[0], pt[1]);
  };
  const spilKamp = async (navn) => {
    const antal = await S(() => window.__spil.kamp.antal);
    for (let i = 0; i < antal; i++) {
      await page.waitForFunction((n) => { const k = window.__spil.kamp; return k && k.fase === 'opgaver' && k.nr === n && !k.laast && document.querySelector('.choice:not([disabled])'); }, i, T);
      const idx = await S(() => { const k = window.__spil.kamp; return k.valg.findIndex((f) => f.n === k.q.answer.n && f.d === k.q.answer.d); });
      if (i === 1) { await page.click(`.choice[data-i="${(idx + 1) % 4}"]`); await page.waitForTimeout(200); }   // ét forkert svar: hint og nyt forsøg
      await page.click(`.choice[data-i="${idx}"]`);
      await page.waitForFunction((n) => { const k = window.__spil.kamp; return k.nr === n + 1 || k.fase !== 'opgaver'; }, i, T);
      if (await S(() => window.__spil.kamp.fase) === 'chance') { await skyd(4.3, 0.6); await page.waitForFunction(() => window.__spil.kamp.fase !== 'chance', null, T); }
    }
    await page.waitForSelector('[data-a=klar]', T); await page.click('[data-a=klar]');
    const skud = await S(() => window.__spil.kamp.finale.antal);
    for (let s = 0; s < skud; s++) { await skyd(s % 2 ? 0 : -4.3, 0.8); await page.waitForFunction((n) => !window.__spil.kamp || window.__spil.kamp.finale.nr > n, s, T); }
    await page.waitForSelector('.s-result', T);
    console.log(`ok: ${navn} gennemført`);
  };
  await page.click('[data-a=spil]'); await page.click('[data-a=beskedOk]');      // den guidede første kamp
  await spilKamp('første kamp');
  await page.click('[data-a=hub]'); await page.click('[data-a=hurtig]');
  await spilKamp('hurtig kamp');
  await page.click('[data-a=pakke]'); await page.waitForSelector('.reveal', T);
  console.log('ok: kortpakke åbnet');
  await browser.close();
  if (fejl.length) { console.log([...new Set(fejl)].join('\n')); process.exit(1); }
  console.log('røgtest bestået: ingen fejl');
})().catch((e) => { console.error('RØGTEST FEJLEDE:', e.message.slice(0, 400)); process.exit(1); });
