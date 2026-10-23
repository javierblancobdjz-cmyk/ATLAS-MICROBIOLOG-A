// Medida de las tareas de aceptación T1-T3 (P1-04) y de las alturas de ficha en el build servido, a 390×844.
// Porta el arnés de medida de E7 (cuenta clics, tecleos, vistas y la pantalla donde aparece el objetivo) y lo deja como
// herramienta del repo. No toca data/ ni js/: solo navega.
// Uso: node tools/medir_tareas.cjs [URL_BASE] [--fecha AAAA-MM-DD] [--salida DIR]
//   Escribe DIR/medidas_tareas_AAAAMMDD.json (por defecto tools/salidas/) y sale con código 1 si algún criterio no se cumple.
const path = require('path'), fs = require('fs');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');

const argv = process.argv.slice(2);
const opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const BASE = argv.find(a => /^https?:/.test(a)) || 'http://localhost:8765/';
const FECHA = opt('--fecha') || new Date().toISOString().slice(0, 10);
const SALIDA = opt('--salida') || path.join(__dirname, 'salidas');
const W = 390, H = 844;
const CEPA = 'ligilactobacillus-salivarius.st-cect-5713';

async function mk(browser) {
  const p = await browser.newPage({ viewport: { width: W, height: H } });
  const st = { clics: 0, tecleos: 0, vistas: new Set(), log: [], errores: [] };
  p.on('pageerror', e => st.errores.push(e.message));
  p.on('console', m => { if (m.type() === 'error') st.errores.push(m.text()); });
  const vista = () => new URL(p.url()).hash.split('?')[0].split('/').slice(0, 2).join('/') || '#/';
  return {
    p, st,
    async go(hash) { await p.goto(BASE + hash, { waitUntil: 'networkidle' }); await p.waitForTimeout(150); st.vistas.add(vista()); },
    async type(sel, txt) { st.tecleos++; await p.fill(sel, txt); await p.waitForTimeout(200); st.log.push('teclea «' + txt + '»'); },
    async click(loc, label) {
      st.clics++; await loc.first().click(); await p.waitForTimeout(300);
      st.vistas.add(vista()); st.log.push('clic ' + st.clics + ': ' + label + ' → ' + new URL(p.url()).hash);
    },
    /** pantalla (1 = visible sin desplazar) del primer nodo de texto visible de #view que contiene t */
    screenOf(t) {
      return p.evaluate(([t, H]) => {
        const w = document.createTreeWalker(document.querySelector('#view'), NodeFilter.SHOW_TEXT); let n;
        while ((n = w.nextNode())) {
          if (!n.textContent.includes(t)) continue;
          const el = n.parentElement; if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue;
          const r = el.getBoundingClientRect(); return { pantalla: Math.floor((r.top + scrollY) / H) + 1, y: Math.round(r.top + scrollY) };
        }
        return null;
      }, [t, H]);
    },
    pantallas() { return p.evaluate(H => +(document.documentElement.scrollHeight / H).toFixed(2), H); },
    ancho() { return p.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth })); },
    cerrar() { return p.close(); },
    resumen() { return { clics: st.clics, tecleos: st.tecleos, vistas: [...st.vistas], log: st.log, errores_consola: st.errores }; },
  };
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const out = { fecha: FECHA, base: BASE, viewport: W + 'x' + H, herramienta: 'tools/medir_tareas.cjs', tareas: {}, alturas: {}, criterios: [] };
  const crit = (id, texto, ok, valor) => out.criterios.push({ id, criterio: texto, estado: ok ? 'cumple' : 'no_cumple', valor });

  /* T1 · S. oligofermentans: qué hace bien y cómo, con lox visible */
  { const a = await mk(browser); await a.go('#/');
    await a.type('#topbar input', 'oligofermentans');
    await a.click(a.p.locator('.suggest a[role=option]', { hasText: 'oligofermentans' }), 'sugerencia S. oligofermentans');
    const lox = await a.p.evaluate(() => { const x = [...document.querySelectorAll('.how-card .gene-link, .gene-link')].find(g => g.innerText.trim() === 'lox');
      if (!x) return null; const r = x.getBoundingClientRect(); return r.height > 0 ? { pantalla: Math.floor((r.top + scrollY) / innerHeight) + 1, href: x.getAttribute('href') } : null; });
    const t = await a.p.innerText('#view');
    out.tareas.T1 = { ...a.resumen(), destino: new URL(a.p.url()).hash, que_hace_bien: await a.screenOf('Qué hace bien'), como_lo_hace: await a.screenOf('Cómo lo hace'), lox,
      ficha_pantallas: await a.pantallas() };
    crit('T1', 'S. oligofermentans: qué hace bien y cómo, con lox visible, ≤ 2 clics', a.st.clics <= 2 && /Qué hace bien/.test(t) && /Cómo lo hace/.test(t) && !!lox, a.st.clics + ' clics');
    await a.cerrar(); }

  /* T2 · desde CECT 5713, quién más actúa sobre S. mutans (+1 clic para el filtro de célula muerta) */
  { const a = await mk(browser); await a.go('#/');
    await a.type('#topbar input', '5713');
    await a.click(a.p.locator('.suggest a[role=option]', { hasText: '5713' }), 'sugerencia CECT 5713');
    const enlace = await a.screenOf('Quién más consigue lo mismo');
    await a.click(a.p.locator('.who-row a', { hasText: 'S. mutans' }), '«Quién más consigue lo mismo: S. mutans»');
    const destino = new URL(a.p.url()).hash, clicsSin = a.st.clics;
    const filas = await a.p.evaluate(() => [...(document.querySelector('table.pv') || document).querySelectorAll('tr.pv-row th')].map(x => x.innerText.split('\n')[0]));
    const resaltada = await a.p.evaluate(() => (document.querySelector('tr.hl th') || {}).innerText?.split('\n')[0] || null);
    await a.click(a.p.locator('a.switch', { hasText: 'célula muerta' }), 'interruptor «Solo lo que funciona con célula muerta»');
    const filasMuerta = await a.p.evaluate(() => [...(document.querySelector('table.pv') || document).querySelectorAll('tr.pv-row')].map(tr => tr.querySelector('th').innerText.split('\n')[0] + ' · ' + ((tr.querySelector('[data-k="¿Funciona muerta?"]') || {}).innerText || '').replace(/\n/g, ' ')));
    out.tareas.T2 = { ...a.resumen(), enlace_pantalla: enlace, destino, resaltada, filas_pivote: filas, clics_sin_filtro: clicsSin,
      con_filtro_muerta: { destino: new URL(a.p.url()).hash, filas: filasMuerta, pantallas: await a.pantallas() } };
    crit('T2', 'Desde CECT 5713, quién más actúa sobre S. mutans: ≤ 2 clics (+1 filtro de célula muerta)',
      clicsSin <= 2 && a.st.clics <= 3 && /res=s_mutans/.test(destino) && /muerta=1/.test(new URL(a.p.url()).hash), clicsSin + ' + ' + (a.st.clics - clicsSin) + ' clics');
    await a.cerrar(); }

  /* T3 · de buscar «5713» a «Posbiótico: cepa condicionada · Salud oral: Prometedora · ruta condicionada» */
  { const a = await mk(browser); await a.go('#/');
    await a.type('#topbar input', '5713');
    await a.click(a.p.locator('.suggest a[role=option]', { hasText: '5713' }), 'sugerencia CECT 5713');
    const tira = await a.screenOf('¿En qué forma?');
    const chips = await a.p.evaluate(() => [...document.querySelectorAll('.fs-chip')].map(c => c.innerText.replace(/\n/g, ' ')));
    await a.click(a.p.locator('.fs-chip[data-f=posbiotico]'), 'chip Posbiótico');
    const chip = (await a.p.innerText('.fs-chip[data-f=posbiotico]')).replace(/\n/g, ' ');
    const det = await a.p.innerText('.fs-detail');
    const ok = /cepa:\s*condicionada/.test(chip) && /Salud oral\s*Prometedora\s*·\s*ruta condicionada/.test(det);
    out.tareas.T3 = { ...a.resumen(), tira_pantalla: tira, chips, chip_posbiotico: chip, detalle: det.slice(0, 700),
      pestanas_visibles_390: await a.p.evaluate(() => [...document.querySelectorAll('#tabs a')].map(x => { const r = x.getBoundingClientRect(); return [x.innerText, r.right <= innerWidth + 1 && r.left >= 0]; })) };
    crit('T3', 'De buscar «5713» a «Posbiótico: cepa condicionada · Salud oral: Prometedora · ruta condicionada», ≤ 2 clics', a.st.clics <= 2 && ok, a.st.clics + ' clics');
    await a.cerrar(); }

  /* Alturas a 390×844 con los plegables cerrados (estado por defecto) y ancho sin scroll horizontal */
  const alturas = [
    ['#/cepa/' + CEPA, 'Ficha de CECT 5713', 5],
    ['#/especie/ligilactobacillus-salivarius', 'Ficha de L. salivarius', 8],
    ['#/lineas/oral?res=s_mutans&muerta=1', 'Pivote de S. mutans con muerta=1', 3],
  ];
  { const a = await mk(browser);
    for (const [hash, etq, max] of alturas) {
      await a.go(hash);
      const abiertos = await a.p.evaluate(() => [...document.querySelectorAll('#view details[open]')].map(d => (d.querySelector('summary') || {}).innerText || '').length);
      const pant = await a.pantallas(), anc = await a.ancho();
      out.alturas[hash] = { pantallas: pant, maximo: max, details_abiertos: abiertos, ...anc };
      crit('altura', etq + ' ≤ ' + max + ' pantallas a 390×844', pant <= max && anc.scrollW <= anc.clientW, pant + ' pantallas · ancho ' + anc.scrollW + '/' + anc.clientW);
    }
    const errs = a.resumen().errores_consola; if (errs.length) out.errores_alturas = errs;
    await a.cerrar(); }

  await browser.close();
  const errores = Object.values(out.tareas).flatMap(t => t.errores_consola).concat(out.errores_alturas || []);
  crit('consola', '0 errores de consola durante las medidas', errores.length === 0, errores.length + ' errores');
  fs.mkdirSync(SALIDA, { recursive: true });
  const f = path.join(SALIDA, 'medidas_tareas_' + FECHA.replace(/-/g, '') + '.json');
  fs.writeFileSync(f, JSON.stringify(out, null, 1) + '\n');
  out.criterios.forEach(c => console.log((c.estado === 'cumple' ? 'OK   ' : 'FALLA') + ' ' + c.criterio + ' → ' + c.valor));
  console.log('\nJSON: ' + path.relative(process.cwd(), f));
  process.exit(out.criterios.every(c => c.estado === 'cumple') ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
