// tools/humo_pivote.cjs · E8 r2 · Prueba de humo OBLIGATORIA del pivote K2 y de la matriz de líneas.
// Falla (exit 1) si:
//   A. algún .js lee `mecanismo.funciona_inactivada` (estático) o alguna vista lo lee en ejecución (trampa en matriz.json);
//      el campo histórico guardaba requiere_viabilidad con la etiqueta invertida (L2). «¿Funciona muerta?» sale de forma+dirección.
//   B. matriz.json trae `funciona_inactivada` dentro de `mecanismo`.
//   C. la familia de mecanismo de una celda ≠ la del pivote (misma función famOf: debe dar 0).
//   D. el `funciona_inactivada` de celda (generar_v12.py, Python) ≠ Atlas.pivot.muerta() (JS) sobre las mismas evidencias.
//   E. alguna fila dice «No» en «¿Funciona muerta?» (un hueco no puede pintarse como cero).
//   F. una celda coloreada con determinante desconocido no lleva «det. ?» (o lo lleva sin serlo).
//   G. scroll horizontal de PÁGINA a 390 px en el pivote o la matriz, o errores de consola (claro y oscuro).
//   H. (v2, P1-03) criterios de aceptación del pivote sobre el build: s_mutans con 6 especies a favor y exactamente 2 filas
//      «Sí, célula inactivada» (DSMZ 16671 y CECT 5713), sin fila «L. paracasei (especie)»; CECT 5713 dice «exclusión
//      (determinante desconocido)»; DSMZ 16671 cita ev010 como «Resultado mixto» con su fuente y sin color; 1 clic de la
//      celda L. salivarius × S. mutans al pivote con s=; con muerta=1 ≤ 3 pantallas a 390×844; asociaciones fuera de las
//      filas de efecto y mezcla rotulada; ningún código crudo con guion bajo, «undefined», «[object» ni «NaN» en pantalla.
//   D se compara con las mismas evidencias que usa generar_v12 (sin asociaciones ni mezclas: Atlas.pivot.cuenta).
// Además ejecuta una AUTOPRUEBA: inyecta una lectura de mecanismo.funciona_inactivada y exige que A la detecte.
// Uso: node tools/humo_pivote.cjs [URL_BASE] (por defecto http://localhost:8800/)
const fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright')); }
const BASE = process.argv[2] || 'http://localhost:8765/';
const ROOT = path.resolve(__dirname, '..');
const fallos = [];
const F = (k, m) => fallos.push(k + ' · ' + m);

// ---- A (estático) y B ----
const RX = [/mecanismo\s*(\?\.|\.)\s*funciona_inactivada/, /mecanismo\s*\[\s*["'`]funciona_inactivada/, /mecanismo[^;\n]{0,24}\)\s*(\?\.|\.)\s*funciona_inactivada/];
for (const f of fs.readdirSync(path.join(ROOT, 'js')).filter(x => x.endsWith('.js'))) {
  fs.readFileSync(path.join(ROOT, 'js', f), 'utf8').split('\n').forEach((l, i) => { if (RX.some(r => r.test(l))) F('A-estatico', `${f}:${i + 1} lee mecanismo.funciona_inactivada`); });
}
const MAT = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'matriz.json'), 'utf8'));
let nB = 0;
for (const [lin, cells] of Object.entries(MAT)) for (const [k, c] of Object.entries(cells))
  if (c && c.mecanismo && 'funciona_inactivada' in c.mecanismo) { nB++; if (nB <= 3) F('B-datos', `${lin}/${k} trae mecanismo.funciona_inactivada`); }
if (nB > 3) F('B-datos', `… ${nB} celdas en total`);

// Trampa: getter no enumerable en cada celda.mecanismo de matriz.json; registra cualquier lectura.
const TRAMPA = () => {
  window.__prohibidas = [];
  const of = window.fetch;
  window.fetch = async (...a) => {
    const r = await of(...a);
    if (String(a[0]).endsWith('matriz.json')) {
      const j = r.json.bind(r);
      r.json = async () => {
        const M = await j();
        Object.values(M).forEach(cs => Object.entries(cs).forEach(([k, c]) => {
          if (c && c.mecanismo && !('funciona_inactivada' in c.mecanismo))
            Object.defineProperty(c.mecanismo, 'funciona_inactivada', {enumerable: false, get() {
              window.__prohibidas.push(k + ' @ ' + location.hash + ' · ' + (new Error().stack || '').split('\n')[2]); return undefined; }});
        }));
        return M;
      };
    }
    return r;
  };
};
const INYECCION = () => {   // lector malo, solo en la autoprueba
  const t = setInterval(() => { try { const m = window.Atlas.data.raw.matriz.oral['ligilactobacillus-salivarius|s_mutans'].mecanismo;
    if (m) { void m.funciona_inactivada; clearInterval(t); } } catch (e) {} }, 20);
};

async function recorrer(b, inyectar) {
  const ctx = await b.newContext({viewport: {width: 1400, height: 900}});
  await ctx.addInitScript(TRAMPA);
  if (inyectar) await ctx.addInitScript(INYECCION);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(BASE + '#/lineas/oral', {waitUntil: 'networkidle'});
  const rutas = await p.evaluate(() => {
    const D = Atlas.data, out = [];
    D.lineas('producto').forEach(L => { out.push('#/lineas/' + L.id);
      L.resultados.forEach(R => { if (Atlas.pivot.rowsFor(L.id, R.id).length) out.push('#/lineas/' + L.id + '?res=' + R.id); }); });
    return out.concat(['#/lineas/oral?res=s_mutans&muerta=1', '#/lineas?gen=spxB', '#/lineas?mec=exclusion_patogeno', '#/lineas?q=coagregacion',
      '#/cepa/ligilactobacillus-salivarius.st-cect-5713', '#/cepa/lacticaseibacillus-paracasei.st-dsmz16671', '#/especie/ligilactobacillus-salivarius',
      '#/comparar?ids=ligilactobacillus-salivarius,streptococcus-salivarius', '#/inicio']);
  });
  for (const r of rutas) { await p.goto(BASE + r, {waitUntil: 'domcontentloaded'}); await p.waitForTimeout(60); }
  await p.waitForTimeout(200);
  const prohibidas = await p.evaluate(() => window.__prohibidas);
  return {ctx, p, errs, prohibidas, nRutas: rutas.length};
}

(async () => {
  const b = await chromium.launch({executablePath: '/opt/pw-browsers/chromium'}).catch(() => chromium.launch());
  // ---- A (ejecución) + C, D, E, F ----
  const R = await recorrer(b, false);
  R.prohibidas.slice(0, 5).forEach(x => F('A-ejecucion', x));
  R.errs.slice(0, 5).forEach(x => F('G-consola', x));
  await R.p.goto(BASE + '#/lineas/oral', {waitUntil: 'networkidle'});
  const res = await R.p.evaluate(() => {
    const P = Atlas.pivot, D = Atlas.data, o = {celdas: 0, color: 0, desconocida: 0, neg: 0, incohFam: [], incohMuerta: [], filasNo: [], filas: 0, muerta: {}, detUnk: 0};
    D.lineas('producto').forEach(L => L.resultados.forEach(Rr => {
      const rows = P.rowsFor(L.id, Rr.id); if (!rows.length) return;
      const bySp = {};
      rows.forEach(x => { o.filas++; o.muerta[x.muerta.k] = (o.muerta[x.muerta.k] || 0) + 1;
        if (/^No$/i.test(x.muerta.txt.trim())) o.filasNo.push(x.key);
        if (x.aFavor) { bySp[x.especie] = bySp[x.especie] || new Set(); x.familias.forEach(f => bySp[x.especie].add(f)); } });
      Object.entries(D.raw.matriz[L.id] || {}).filter(([k]) => k.endsWith('|' + Rr.id)).forEach(([k, c]) => {
        o.celdas++;
        const sp = k.split('|')[0], a = P.cellFamilies(c).sort().join(','), bb = [...(bySp[sp] || [])].sort().join(',');
        const neg = c.estado === 'via_cerrada_o_replantear' || c.estado === 'sin_resultado_a_favor' || !c.mejor_nivel;
        if (neg) o.neg++; else if (a) { o.color++; if ((P.cellMec(c) || {}).det === 'desconocido') o.detUnk++; } else o.desconocida++;
        if (!neg && a !== bb) o.incohFam.push(L.id + '/' + k + ' matriz=' + a + ' pivote=' + bb);
        if (c.funciona_inactivada) {
          const evs = (c.evidencias || []).map(id => D.raw.evidencias[id]).filter(Boolean).filter(P.cuenta);
          const js = P.muerta(evs);
          if (js.k !== c.funciona_inactivada.k || js.txt !== c.funciona_inactivada.texto)
            o.incohMuerta.push(L.id + '/' + k + ' py=' + c.funciona_inactivada.k + ' js=' + js.k);
        }
      });
    }));
    return o;
  });
  res.incohFam.forEach(x => F('C-familia', x));
  res.incohMuerta.forEach(x => F('D-muerta', x));
  res.filasNo.forEach(x => F('E-no', x));
  // F: rótulo en el DOM de cada línea
  let detDom = {ok: 0, mal: []};
  for (const L of await R.p.evaluate(() => Atlas.data.lineas('producto').map(l => l.id))) {
    await R.p.goto(BASE + '#/lineas/' + L, {waitUntil: 'domcontentloaded'}); await R.p.waitForTimeout(60);
    const d = await R.p.evaluate(lin => [...document.querySelectorAll('a.cell.cm')].map(a => {
      const u = new URL(a.href.replace('#/', 'x/'), location.href), q = new URLSearchParams(a.href.split('?')[1] || '');
      const c = Atlas.data.raw.matriz[lin][q.get('s') + '|' + q.get('res')];
      return [q.get('s') + '|' + q.get('res'), (Atlas.pivot.cellMec(c) || {}).det === 'desconocido', !!a.querySelector('.l3')];
    }), L);
    d.forEach(([k, unk, tiene]) => unk === tiene ? detDom.ok++ : detDom.mal.push(L + '/' + k));
  }
  detDom.mal.forEach(x => F('F-det', x));
  // G: 390 px, claro y oscuro; H: texto crudo en pantalla
  const anchos = {}, alturas = {};
  const R390 = ['#/lineas/oral', '#/lineas/oral?res=s_mutans', '#/lineas/oral?res=s_mutans&muerta=1', '#/lineas?gen=spxB',
    '#/lineas/salud_femenina?res=mastitis', '#/lineas/intestinal?res=ein', '#/lineas/oral?ataque=1', '#/cepa/ligilactobacillus-salivarius.st-cect-5713'];
  for (const esquema of ['light', 'dark']) {
    const mc = await b.newContext({viewport: {width: 390, height: 844}, colorScheme: esquema});
    const m = await mc.newPage(); const e390 = [];
    m.on('pageerror', e => e390.push(String(e))); m.on('console', x => { if (x.type() === 'error') e390.push(x.text()); });
    for (const r of R390) {
      await m.goto(BASE + r, {waitUntil: 'networkidle'}); await m.waitForTimeout(150);
      const [sw, iw, sh, crudo] = await m.evaluate(() => {
        const v = document.getElementById('view'), t = v.innerText;
        // amuc_1100 es un nombre de locus real (gen nombrado en la fuente), no un código interno
        const c = (t.match(/undefined|\[object|\bNaN\b|\b(?!amuc_)[a-z0-9]+_[a-z0-9_]+\b/g) || []);
        return [document.documentElement.scrollWidth, window.innerWidth, document.documentElement.scrollHeight, c.slice(0, 5)]; });
      anchos[esquema + ' ' + r] = sw + '/' + iw; alturas[r] = +(sh / 844).toFixed(2);
      if (sw > iw) F('G-390', esquema + ' ' + r + ' scrollWidth ' + sw + ' > ' + iw);
      if (r.startsWith('#/lineas') && crudo.length) F('H-crudo', esquema + ' ' + r + ' ' + crudo.join(', '));
    }
    e390.slice(0, 3).forEach(x => F('G-consola-390', esquema + ' ' + x));
    await mc.close();
  }
  if (alturas['#/lineas/oral?res=s_mutans&muerta=1'] > 3) F('H-altura', 's_mutans con muerta=1 ocupa ' + alturas['#/lineas/oral?res=s_mutans&muerta=1'] + ' pantallas a 390×844 (máx. 3)');

  // H: criterios de P1-03 en el DOM del pivote de s_mutans
  await R.p.goto(BASE + '#/lineas/oral?res=s_mutans', {waitUntil: 'domcontentloaded'}); await R.p.waitForTimeout(80);
  const H = await R.p.evaluate(() => {
    const filas = [...document.querySelectorAll('table.pv')][0].querySelectorAll('tbody tr');
    const txt = tr => tr.innerText.replace(/\s+/g, ' ');
    const fila = id => [...filas].find(tr => tr.id === 'pv-' + id.replace(/[^\w-]/g, '-'));
    const dsmz = fila('lacticaseibacillus-paracasei.st-dsmz16671'), cect = fila('ligilactobacillus-salivarius.st-cect-5713');
    const otros = dsmz && dsmz.querySelector('.pv-otros');
    return {
      si: [...filas].filter(tr => (tr.querySelector('td[data-k="¿Funciona muerta?"]') || {}).innerText?.includes('Sí, célula inactivada')).map(tr => tr.id),
      especieParacasei: [...filas].some(tr => tr.id.startsWith('pv-sp-lacticaseibacillus-paracasei')),
      cectExcl: !!cect && /exclusión \(determinante desconocido\)/.test(txt(cect)),
      dsmzMixto: !!otros && /Resultado mixto/.test(otros.innerText) && !!otros.querySelector('.ref, [data-ev], a, button'),
      dsmzMixtoSinColor: !!otros && !otros.querySelector('.fam'),
      lede: document.querySelector('.pv-lede').innerText,
    };
  });
  const smutSp = await R.p.evaluate(() => new Set(Atlas.pivot.rowsFor('oral', 's_mutans').filter(r => r.aFavor).map(r => r.especie)).size);
  if (smutSp !== 6) F('H-smutans', smutSp + ' especies a favor (se esperan 6)');
  const siEsp = ['pv-lacticaseibacillus-paracasei-st-dsmz16671', 'pv-ligilactobacillus-salivarius-st-cect-5713'];
  if (H.si.length !== 2 || !siEsp.every(x => H.si.includes(x))) F('H-smutans', 'filas «Sí, célula inactivada»: ' + H.si.join(', '));
  if (H.especieParacasei) F('H-smutans', 'aparece una fila de L. paracasei (especie)');
  if (!H.cectExcl) F('H-smutans', 'la fila de CECT 5713 no dice «exclusión (determinante desconocido)»');
  if (!H.dsmzMixto) F('H-smutans', 'la fila de DSMZ 16671 no cita ev010 como «Resultado mixto» con su fuente');
  if (!H.dsmzMixtoSinColor) F('H-smutans', 'el resultado mixto de DSMZ 16671 lleva color de familia');
  // H: asociación fuera de las filas de efecto (prausnitzii.ev004 en intestinal|ein); mezcla rotulada (ev015 en mastitis)
  const asoMz = await R.p.evaluate(() => {
    const ein = Atlas.pivot.rowsFor('intestinal', 'ein'), mas = Atlas.pivot.rowsFor('salud_femenina', 'mastitis');
    return {asoEnEfecto: ein.some(r => r.evs.some(e => e.relacion === 'asociacion')), asoAparte: ein.asociacion.length,
      mzEnEfecto: mas.some(r => r.evs.some(e => e.alcance === 'mezcla')), mz: mas.mezcla.map(r => r.etiquetaMezcla)};
  });
  if (asoMz.asoEnEfecto || !asoMz.asoAparte) F('H-asociacion', JSON.stringify(asoMz));
  if (asoMz.mzEnEfecto || !asoMz.mz.length || !asoMz.mz.every(x => /mezcla/.test(x))) F('H-mezcla', JSON.stringify(asoMz));
  // H: 1 clic desde la celda L. salivarius × S. mutans
  await R.p.goto(BASE + '#/lineas/oral', {waitUntil: 'domcontentloaded'}); await R.p.waitForTimeout(80);
  await R.p.click('a.cell[href*="res=s_mutans"][href*="s=ligilactobacillus-salivarius"]'); await R.p.waitForTimeout(150);
  const hashClic = await R.p.evaluate(() => decodeURIComponent(location.hash));
  if (hashClic !== '#/lineas/oral?res=s_mutans&s=ligilactobacillus-salivarius') F('H-clic', 'la celda lleva a ' + hashClic);
  const hlClic = await R.p.evaluate(() => document.querySelectorAll('tr.hl').length);
  if (!hlClic) F('H-clic', 'el pivote no resalta la fila de L. salivarius');
  // s_mutans: cifras de control (se imprimen, no se fijan: cambian cuando se cura)
  const smut = await R.p.evaluate(() => { const rows = Atlas.pivot.rowsFor('oral', 's_mutans').filter(r => r.aFavor);
    return {filas_a_favor: rows.length, especies: new Set(rows.map(r => r.especie)).size, cepa: rows.filter(r => r.cepa).length,
      muerta_si: rows.filter(r => r.muerta.k === 'si').map(r => r.cepa || r.especie + ' (especie)'),
      familias: rows.map(r => (r.cepa || r.especie) + ':' + (r.familias.join('+') || 'desconocido') + (r.det === 'desconocido' ? '/det?' : ''))}; });
  await R.ctx.close();

  // ---- AUTOPRUEBA: la trampa tiene que cazar una lectura inyectada ----
  const T = await recorrer(b, true);
  const autoprueba = T.prohibidas.length > 0;
  if (!autoprueba) F('AUTOPRUEBA', 'la trampa NO detectó la lectura inyectada de mecanismo.funciona_inactivada: la prueba A no protege');
  await T.ctx.close(); await b.close();

  console.log(JSON.stringify({base: BASE, rutas_recorridas: R.nRutas, lecturas_prohibidas: R.prohibidas.length,
    autoprueba_detecta_lectura_inyectada: autoprueba, lecturas_en_autoprueba: T.prohibidas.length,
    celdas: res.celdas, coloreadas: res.color, coloreadas_det_desconocido: res.detUnk, evidencia_mecanismo_desconocido: res.desconocida, nulas: res.neg,
    incoherencias_familia: res.incohFam.length, incoherencias_muerta_py_js: res.incohMuerta.length,
    filas_pivote: res.filas, funciona_muerta: res.muerta, rotulo_det_dom_ok: detDom.ok, ancho_390: anchos, pantallas_390x844: alturas,
    clic_celda_salivarius_smutans: hashClic, s_mutans_filas_si_dom: H.si, asociacion_y_mezcla: asoMz, s_mutans: smut}, null, 1));
  if (fallos.length) { console.log('\nFALLOS (' + fallos.length + '):\n' + fallos.join('\n')); process.exit(1); }
  console.log('\nOK · humo_pivote');
})();
