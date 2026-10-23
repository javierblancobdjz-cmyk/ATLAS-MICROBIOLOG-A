// Prueba de humo: abre la app servida en local, recorre las pestañas y falla si hay errores de consola.
// Uso: node tools/humo.mjs [URL_BASE] [DIR_CAPTURAS]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(process.env.PW_PATH || 'playwright')); }
const base = process.argv[2] || 'http://localhost:8765/';
const out = process.argv[3] || null;
const rutas = ['#/inicio', '#/especies', '#/especie/ligilactobacillus-salivarius', '#/comparar', '#/lineas', '#/pregunta', '#/biblioteca', '#/datos'];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errores = [];
page.on('pageerror', e => errores.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errores.push('console: ' + m.text()); });
for (const r of rutas) {
  await page.goto(base + r, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const len = await page.evaluate(() => document.getElementById('view')?.innerText.length || 0);
  const h1 = await page.evaluate(() => document.querySelector('#view h1')?.innerText || '');
  console.log(r.padEnd(42), 'texto:', String(len).padStart(6), '| h1:', h1.slice(0, 60));
  if (out) await page.screenshot({ path: `${out}/${r.replace(/[#/]/g, '_')}.png`, fullPage: false });
}
await browser.close();
if (errores.length) { console.log('\nERRORES:\n' + errores.join('\n')); process.exit(1); }
console.log('\nOK sin errores de consola');
