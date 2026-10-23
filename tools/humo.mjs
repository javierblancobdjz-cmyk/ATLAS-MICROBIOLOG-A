// Prueba de humo: abre la app servida en local, recorre todas las rutas (incluidos los parámetros del pivote único y las
// redirecciones de lo retirado) y falla si hay errores de consola, vistas rotas, códigos crudos o scroll horizontal a 390 px.
// Uso: node tools/humo.mjs [URL_BASE] [DIR_CAPTURAS]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(process.env.PW_PATH || 'playwright')); }
const base = process.argv[2] || 'http://localhost:8765/';
const out = process.argv[3] || null;
const rutas = [
  '#/inicio', '#/especies', '#/especie/ligilactobacillus-salivarius', '#/especie/lactococcus-lactis',
  '#/cepa/ligilactobacillus-salivarius.st-cect-5713', '#/comparar',
  '#/comparar?ids=ligilactobacillus-salivarius.st-cect-5713,streptococcus-salivarius,streptococcus-oligofermentans',
  '#/lineas', '#/lineas/oral', '#/lineas/oral?res=s_mutans', '#/lineas/oral?res=s_mutans&muerta=1',
  '#/lineas/oral?res=s_mutans&s=ligilactobacillus-salivarius', '#/lineas/oral?ataque=1', '#/lineas/salud_femenina?res=mastitis', '#/lineas/seguridad',
  '#/lineas?gen=spxB', '#/lineas?out=h2o2', '#/lineas?mec=exclusion_patogeno', '#/lineas?mid=M35', '#/lineas?q=hidroxiapatita',
  '#/biblioteca', '#/datos',
];
// Lo retirado en v2 («Qué se elimina»): debe redirigir sin error y sin pantalla propia.
const redirecciones = [
  ['#/pregunta', '#/especies'],
  ['#/pregunta?b=ligilactobacillus-salivarius.st-cect-5713&f=posbiotico', '#/cepa/ligilactobacillus-salivarius.st-cect-5713'],
  ['#/quien', '#/lineas'],
  ['#/quien/oral%7Cs_mutans', '#/lineas/oral?res=s_mutans'],
];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
const errores = [], fallos = [];
async function pagina(w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', e => errores.push(`[${w}] pageerror: ${e.message} @ ${page.url()}`));
  page.on('console', m => { if (m.type() === 'error') errores.push(`[${w}] console: ${m.text()} @ ${page.url()}`); });
  return page;
}
// Texto visible de la vista sin el contenido de <code> (rutas y comandos legítimos con guion bajo)
const inspecciona = page => page.evaluate(() => {
  const v = document.getElementById('view'); const c = v.cloneNode(true);
  c.querySelectorAll('code').forEach(x => x.remove());
  const t = c.innerText || c.textContent || '';
  return {
    len: (v.innerText || '').length, h1: v.querySelector('h1')?.innerText || '',
    roto: !!v.querySelector('.stub') && /Error en la vista/.test(v.innerText),
    crudo: (t.match(/\[object|undefined|\bNaN\b/g) || []),
    tabs: [...document.querySelectorAll('#tabs a')].map(a => a.dataset.tab),
    sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
  };
});

const page = await pagina(1400, 900);
const m390 = await pagina(390, 844);
for (const r of rutas) {
  await page.goto(base + r, { waitUntil: 'networkidle' });
  await page.waitForTimeout(250);
  const a = await inspecciona(page);
  console.log(r.padEnd(66), 'texto:', String(a.len).padStart(6), '| h1:', a.h1.slice(0, 56));
  if (a.roto) fallos.push(`${r}: la vista lanzó un error`);
  if (a.len < 40) fallos.push(`${r}: vista vacía`);
  if (a.crudo.length) fallos.push(`${r}: texto crudo ${[...new Set(a.crudo)].join(', ')}`);
  if (out) await page.screenshot({ path: `${out}/${r.replace(/[#/?&=,%|]/g, '_')}.png`, fullPage: false });
  await m390.goto(base + r, { waitUntil: 'networkidle' });
  await m390.waitForTimeout(200);
  const b = await inspecciona(m390);
  if (b.sw > b.cw + 1) fallos.push(`${r}: scroll horizontal a 390 px (${b.sw}/${b.cw})`);
}
const tabs = (await inspecciona(page)).tabs;
if (tabs.includes('pregunta') || tabs.includes('quien')) fallos.push('sigue la pestaña ' + tabs.join(','));
for (const [desde, hasta] of redirecciones) {
  await page.goto(base + desde, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const h = await page.evaluate(() => location.hash);
  const ok = decodeURIComponent(h) === decodeURIComponent(hasta);
  console.log(('redirige ' + desde).padEnd(66), '→', h, ok ? '' : '  ✗ (esperado ' + hasta + ')');
  if (!ok) fallos.push(`${desde} redirige a ${h}, no a ${hasta}`);
}
await browser.close();
if (errores.length) console.log('\nERRORES DE CONSOLA:\n' + errores.join('\n'));
if (fallos.length) console.log('\nFALLOS:\n' + fallos.join('\n'));
if (errores.length || fallos.length) process.exit(1);
console.log(`\nOK: ${rutas.length} rutas a 1400 y 390 px y ${redirecciones.length} redirecciones, sin errores de consola, sin scroll horizontal ni texto crudo`);
