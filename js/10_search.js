;(function(){
/* 10_search.js · P1-07. Buscador global con índice DERIVADO de data/ al arrancar (sin busqueda.json curado a mano).
   Fuentes del índice (una por grupo):
     Especies     ← especies.json (nombre actual, nombre corto, sinónimos y basónimos)
     Cepas        ← cepas.json (designación, nombre corto, otros nombres, depósitos)
     Resultados   ← catalogo.lineas[].resultados[] (con n_evidencias, cobertura y cola_curacion) y las líneas
     Outputs      ← catalogo.vocabulario_rasgos (output × vía, E5) y especies[].rasgos con vía identificada
     Mecanismos   ← catalogo.clases_mecanismo y catalogo.mecanismos (M…)
     Genes        ← evidencias[].mecanismo.genes, especies[].rasgos[].genes, vías del vocabulario y genes de M…
     Moléculas    ← especies[].moleculas y especies[].funciones
     última línea ← texto de las evidencias (claim_es) y de los rasgos: «X en N evidencias»
   Los marcadores genómicos de genomica.json NO se indexan (P3, hasta que exista la vista por marcador).
   Coincidencia: nombres y entidades por PRINCIPIO DE PALABRA; texto libre por palabra exacta o su plural. Nunca subcadena
   interior («candida» no encuentra «candidato» ni «candidiasis»).
   Contrato: Atlas.search(q) → [{t, id, label, sub, href, n?, fam?}] agrupados en el orden de GRUPOS; el último puede ser t=texto.
             Atlas.searchIndex() → {total, porGrupo, evidencias, rasgos} (lo usa «Sobre los datos»). */
const norm = s => (s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const words = s => norm(s).split(" ").filter(Boolean);
const plural = (n, uno, varios) => n + " " + (n === 1 ? uno : varios);
const sinGuion = s => String(s || "").replace(/_/g, " ");

const GRUPOS = [
  ["especie", "Especies"], ["cepa", "Cepas"], ["resultado", "Resultados · quién lo consigue"],
  ["output", "Outputs · quién lo produce y por qué vía"], ["mecanismo", "Mecanismos · quién actúa así"],
  ["gen", "Genes"], ["molecula", "Moléculas y funciones declaradas"]];
const ORD = Object.fromEntries(GRUPOS.map(([t], i) => [t, i]));
const POR_GRUPO = 5;          // sugerencias visibles por grupo (el resto se cuenta: «y n más»)

let IDX = null, EVW = null, RAW = null;

function build() {
  const R = Atlas.data.raw, H = Atlas.route.href.bind(Atlas.route), it = [];
  const evs = Object.values(R.evidencias).filter(e => (e.tipo || "evidencia") === "evidencia");
  const C = R.catalogo, VR = C.vocabulario_rasgos || {rasgos: {}, vias: {}};
  const spName = slug => (R.especies[slug] || {}).nombre_corto || slug;
  const clase = id => (C.clases_mecanismo || []).find(c => c.id === id);
  const famOf = id => (Atlas.pivot && Atlas.pivot.famOf) ? Atlas.pivot.famOf(id) : null;

  /* Especies */
  Object.values(R.especies).forEach(s => {
    const antes = (s.sinonimos || []).filter(x => x.tipo === "reclasificacion" || x.tipo === "basionimo").map(x => x.nombre);
    const nEv = evs.filter(e => e.especie === s.slug).length;
    it.push({t: "especie", id: s.slug, label: s.nombre_actual, bn: true, href: H("especie", s.slug),
      sub: [antes.length ? "antes " + antes.join(", ") : "", plural(nEv, "evidencia", "evidencias")].filter(Boolean).join(" · "),
      k: [s.nombre_actual, s.nombre_corto, ...(s.sinonimos || []).map(x => x.nombre)]});
  });
  const nQps = Object.values(R.especies).filter(s => s.regulatorio && s.regulatorio.qps && s.regulatorio.qps.estado === "qps").length;
  it.push({t: "especie", id: "filtro:qps", label: "Especies con QPS", sub: plural(nQps, "especie", "especies") + " · filtro del listado",
    href: H("especies", null, {qps: "si"}), k: ["QPS", "qualified presumption of safety"]});

  /* Cepas */
  Object.values(R.cepas).forEach(c => {
    const sp = R.especies[c.especie];
    const nEv = evs.filter(e => e.cepa === c.id).length;
    const otros = (c.otros_nombres || []).filter(x => x && x !== c.designacion);
    it.push({t: "cepa", id: c.id, label: (sp ? sp.nombre_corto + " " : "") + (c.designacion || c.nombre_corto), bnPre: sp ? sp.nombre_corto : "",
      href: H("cepa", c.id),
      sub: [otros.length ? "también " + otros.slice(0, 2).join(", ") : "", nEv ? plural(nEv, "evidencia", "evidencias") : "sin evidencia propia"].filter(Boolean).join(" · "),
      // H3: también la etiqueta que se muestra («L. salivarius CECT 5713»), el nombre completo con la designación y la grafía
      // compacta de cada depósito o designación («CECT5713», como la escriben los artículos)
      k: [c.designacion, c.nombre_corto, ...otros, ...(c.depositos || []).map(d => d.coleccion + " " + d.numero),
          ...(c.depositos || []).map(d => d.coleccion + d.numero), String(c.designacion || "").replace(/\s+/g, ""),
          sp ? sp.nombre_corto + " " + (c.designacion || c.nombre_corto) : "", sp ? sp.nombre_actual + " " + (c.designacion || c.nombre_corto) : ""]});
  });

  /* Resultados (cobertura y cola de PMID del catálogo: 0 se dice, no se esconde) y líneas */
  C.lineas.forEach(l => {
    const nRes = (l.resultados || []).length;
    it.push({t: "resultado", id: "linea:" + l.id, label: l.nombre + " (línea completa)", sub: plural(nRes, "resultado", "resultados") + " · matriz por mecanismo",
      href: H("lineas", l.id), k: [l.nombre]});
    (l.resultados || []).forEach(r => {
      const n = r.n_evidencias != null ? r.n_evidencias : evs.filter(e => e.linea === l.id && e.resultado === r.id).length;
      const cola = r.cola_curacion && (r.cola_curacion.pmids || []).length;
      const estado = n ? plural(n, "evidencia", "evidencias")
        : "sin evidencia curada" + (cola ? " · " + cola + " PMID en cola" : "");
      it.push({t: "resultado", id: l.id + "|" + r.id, label: r.nombre, sub: l.nombre + " · " + estado, nd: !n,
        href: H("lineas", l.id, {res: r.id}), k: [r.nombre, r.nombre_corto, sinGuion(r.id)]});
    });
  });

  /* Outputs: rasgo del vocabulario (convergencia) y, por especie, el rasgo con vía identificada */
  Object.entries(VR.rasgos || {}).filter(([, v]) => (v.productores || []).length).forEach(([id, v]) => {
    const vias = Object.entries(VR.vias || {}).filter(([vid, x]) => x.output === id && (v.vias_identificadas || []).includes(vid));
    const viaTxt = vias.length ? "vías: " + vias.map(([, x]) => x.etiqueta).join(", ") : "vía no identificada en las fuentes";
    // P1-03: las bacteriocinas no llevan enlace de convergencia de output → van a su clase de mecanismo
    const esBac = id === "bacteriocina" && clase("bacteriocina");
    it.push({t: "output", id, label: v.etiqueta, fam: famOf(v.clase_mecanismo),
      sub: plural(v.productores.length, "especie", "especies") + " · " + viaTxt,
      href: esBac ? H("lineas", null, {mec: "bacteriocina"}) : H("lineas", null, {out: id}),
      k: [v.etiqueta, sinGuion(id), ...vias.map(([, x]) => x.etiqueta)]});
  });
  Object.values(R.especies).forEach(s => (s.rasgos || []).filter(t => t.presente !== "no" && t.via && t.via !== "desconocida" && t.alcance !== "criterio_propio").forEach(t => {
    const esBac = t.rasgo === "bacteriocina";
    it.push({t: "output", id: s.slug + ":" + t.rasgo + ":" + t.via, label: s.nombre_corto + " · " + t.via_etiqueta, bnPre: s.nombre_corto,
      sub: "→ " + (t.etiqueta || "").toLowerCase() + (t.genes && t.genes.length ? " · " + t.genes.map(g => g.gen || g).join(", ") : ""),
      fam: famOf(t.clase_mecanismo),
      href: esBac ? H("especie", s.slug) : H("lineas", null, {out: t.rasgo, s: s.slug}),
      k: [t.via_etiqueta, sinGuion(t.via)]});
  }));

  /* Mecanismos: clases (familias de E8) y mecanismos concretos del catálogo */
  const nClase = {};
  evs.forEach(e => ((e.mecanismo && e.mecanismo.clases) || []).forEach(c => { nClase[c] = (nClase[c] || 0) + 1; }));
  (C.clases_mecanismo || []).filter(c => !["desconocido", "no_aplica", "otro"].includes(c.id)).forEach(c => {
    const n = nClase[c.id] || 0;
    it.push({t: "mecanismo", id: c.id, label: c.etiqueta, fam: famOf(c.id), nd: !n,
      sub: "clase · " + (n ? plural(n, "evidencia", "evidencias") : "sin evidencia curada"),
      href: H("lineas", null, {mec: c.id}), k: [c.etiqueta, sinGuion(c.id)]});
  });
  (C.mecanismos || []).forEach(m => {
    const n = (m.fuentes || []).length, cl = clase(m.clase);
    it.push({t: "mecanismo", id: m.id, label: m.nombre, code: m.id, fam: famOf(m.clase), nd: !n,
      sub: [cl ? cl.etiqueta.split(" (")[0] : "", m.determinante === "desconocido" ? "determinante desconocido" : "",
            n ? plural(n, "evidencia", "evidencias") : "sin evidencia curada"].filter(Boolean).join(" · "),
      href: H("lineas", null, {mid: m.id}), k: [m.nombre, m.molecula_o_componente, m.id, m.subclase]});
  });

  /* Genes: de la evidencia (lo nombra el ensayo), de los rasgos, de las vías y de los mecanismos del catálogo */
  const G = new Map();
  const gen = g => { const k = norm(g); if (!k) return null; if (!G.has(k)) G.set(k, {g, n: 0, out: null, outEtq: "", mid: null, sp: new Set()}); return G.get(k); };
  evs.forEach(e => ((e.mecanismo && e.mecanismo.genes) || []).forEach(g => { const x = gen(g); if (x) x.n++; }));
  Object.entries(VR.vias || {}).forEach(([, v]) => (v.genes_tipicos || []).forEach(g => { const x = gen(g);
    if (x && !x.out && v.output && v.output !== "*") { x.out = v.output; x.outEtq = v.etiqueta; } }));
  Object.values(R.especies).forEach(s => (s.rasgos || []).filter(t => t.alcance !== "criterio_propio").forEach(t => (t.genes || []).forEach(g => {
    const x = gen(g && g.gen || g); if (!x) return; x.sp.add(s.slug);
    if (!x.out && t.rasgo !== "bacteriocina" && VR.rasgos && VR.rasgos[t.rasgo] && (VR.rasgos[t.rasgo].productores || []).length) { x.out = t.rasgo; x.outEtq = t.etiqueta; }
  })));
  (C.mecanismos || []).forEach(m => (m.genes || []).forEach(g => { const x = gen(g); if (x && !x.mid) x.mid = m.id; }));
  G.forEach(x => {
    const href = x.n ? H("lineas", null, {gen: x.g}) : x.out ? H("lineas", null, {out: x.out})
      : x.mid ? H("lineas", null, {mid: x.mid}) : x.sp.size ? H("especie", [...x.sp][0]) : null;
    if (!href) return;
    const sub = [x.n ? plural(x.n, "evidencia lo nombra", "evidencias lo nombran") : "ninguna evidencia lo nombra",
      x.outEtq ? "vía " + x.outEtq : x.mid ? "mecanismo " + x.mid : x.sp.size ? "rasgo de " + [...x.sp].map(spName).join(", ") : ""].filter(Boolean).join(" · ");
    it.push({t: "gen", id: x.g, label: x.g, gene: true, sub, nd: !x.n, href, k: [x.g]});
  });

  /* Moléculas y funciones declaradas por cada especie → su ficha */
  Object.values(R.especies).forEach(s => {
    const vistos = new Set(), mols = [];
    [...(s.moleculas || []), ...(s.funciones || [])].forEach(m => { const k = norm(m); if (k && !vistos.has(k)) { vistos.add(k); mols.push(m); } });
    if (mols.length) it.push({t: "molecula", id: s.slug + ":mol", label: s.nombre_actual, bn: true, mols, href: H("especie", s.slug), k: mols});
  });

  it.forEach(x => { x.w = [...new Set(x.k.filter(Boolean).flatMap(words))]; x.phr = x.k.filter(Boolean).map(norm); });
  IDX = it;
  // texto de la evidencia = su afirmación + los genes que nombra el ensayo (así «spxB» no sale «en ninguna evidencia» cuando el grupo Genes dice 2)
  EVW = evs.map(e => ({id: e.id, w: new Set(words([e.claim_es, ...((e.mecanismo && e.mecanismo.genes) || [])].join(" ")))}));
  RAW = Object.values(R.especies).flatMap(s => (s.rasgos || []).map(t => ({w: new Set(words([t.etiqueta, t.via_etiqueta, t.via_candidata_etiqueta, t.detalle, t.nota_cepa_vs_especie].filter(Boolean).join(" ")))})));
}

/* texto libre: palabra exacta o su plural (-s, -es) */
const inflex = (x, w) => x === w || x === w + "s" || x === w + "es";

function score(it, q, qw) {
  if (it.phr.some(p => p === q)) return 4;
  if (it.phr.some(p => p.startsWith(q))) return 3;
  if (qw.every(w => it.w.includes(w))) return 2.5;
  if (qw.every(w => it.w.some(x => x.startsWith(w)))) return 2;
  return 0;
}

Atlas.search = function (raw) {
  const q = norm(raw), qw = words(raw);
  if (!qw.length || q.length < 2) return [];
  if (!IDX) build();
  const hits = IDX.map(it => [score(it, q, qw), it]).filter(([s]) => s > 0)
    .sort((a, b) => (ORD[a[1].t] - ORD[b[1].t]) || (b[0] - a[0]) || a[1].label.localeCompare(b[1].label, "es"));
  const out = [], cuenta = {};
  hits.forEach(([, it]) => {
    cuenta[it.t] = (cuenta[it.t] || 0) + 1; if (cuenta[it.t] > POR_GRUPO) return;
    // moléculas: una sugerencia por especie, con las moléculas o funciones que coinciden como subtítulo
    if (it.mols) { const m = it.mols.filter(x => qw.every(w => words(x).some(y => y.startsWith(w))));
      it = Object.assign({}, it, {sub: (m.length ? m : it.mols).slice(0, 3).join(" · ")}); }
    out.push(it);
  });
  GRUPOS.forEach(([t]) => { const i = out.map(x => x.t).lastIndexOf(t); if (i >= 0 && cuenta[t] > POR_GRUPO) out[i] = Object.assign({}, out[i], {mas: cuenta[t] - POR_GRUPO}); });
  // línea final: «X en N evidencias» (texto de las evidencias curadas; los rasgos se cuentan aparte)
  const nTxt = EVW.filter(e => qw.every(w => [...e.w].some(x => inflex(x, w)))).length;
  const nRas = RAW.filter(e => qw.every(w => [...e.w].some(x => inflex(x, w)))).length;
  if (nTxt || nRas) out.push({t: "texto", id: raw.trim(), n: nTxt,
    label: "«" + raw.trim() + "» en " + (nTxt ? plural(nTxt, "evidencia", "evidencias") : "ninguna evidencia"),
    sub: nRas ? "y en " + plural(nRas, "rasgo curado", "rasgos curados") : "texto y genes de las evidencias curadas",
    href: Atlas.route.href("lineas", null, {q: raw.trim()})});
  return out;
};

/** Términos del índice que comparten raíz con la consulta (solo como propuesta, nunca como resultado) */
function parecidos(raw) {
  const qw = words(raw); if (!qw.length || !IDX) return [];
  const w = qw[qw.length - 1]; if (w.length < 5) return [];
  const raiz = w.slice(0, Math.max(5, w.length - 2)), seen = new Map();
  IDX.forEach(it => it.k.filter(Boolean).forEach(k => words(k).forEach(x => {
    if (x !== w && x.startsWith(raiz) && !seen.has(x)) seen.set(x, k.split(/\s+/).find(p => norm(p) === x) || x);
  })));
  return [...seen.values()].slice(0, 4);
}

Atlas.searchIndex = function () {
  if (!IDX) build();
  const porGrupo = GRUPOS.map(([t, etq]) => ({t, etq: etq.split(" · ")[0], n: IDX.filter(x => x.t === t).length}));
  return {total: IDX.length, porGrupo, evidencias: EVW.length, rasgos: RAW.length};
};

/* resalta las palabras de la consulta dentro de la etiqueta (por principio de palabra) */
function marca(label, qw) {
  const h = Atlas.ui.h, out = [];
  let last = 0;
  String(label).replace(/[\p{L}\p{N}]+/gu, (tok, i) => {
    const t = norm(tok);
    if (qw.some(w => t.startsWith(w))) { if (i > last) out.push(label.slice(last, i)); out.push(h("mark", {}, tok)); last = i + tok.length; }
    return tok;
  });
  if (last < label.length) out.push(label.slice(last));
  return out;
}

Atlas.mountSearch = function (input, list) {
  const h = Atlas.ui.h;
  let sel = -1, items = [];
  if (!list.id) list.id = "sb-lista";
  input.setAttribute("role", "combobox"); input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", list.id); input.setAttribute("aria-expanded", "false");
  list.classList.add("sb-list");
  const show = on => { list.hidden = !on; input.setAttribute("aria-expanded", String(on)); };

  function option(it, i, qw) {
    const fam = it.fam ? h("i", {class: "sb-dot sb-fam-" + it.fam, "aria-hidden": "true"}) : null;
    let lab;
    if (it.bn) lab = h("i", {class: "bn"}, ...marca(it.label, qw));
    else if (it.bnPre && it.label.startsWith(it.bnPre)) lab = h("span", {}, h("i", {class: "bn"}, it.bnPre), ...marca(it.label.slice(it.bnPre.length), qw));
    else if (it.gene) lab = h("i", {class: "sb-gen"}, ...marca(it.label, qw));
    else lab = h("span", {}, ...marca(it.label, qw));
    return h("li", {role: "presentation"}, h("a", {role: "option", id: list.id + "-o" + i, "data-i": i, href: it.href, class: "sb-opt" + (it.t === "texto" ? " sb-texto" : ""),
      onclick: () => { show(false); }},
      h("span", {class: "sb-main"}, fam, it.code ? h("span", {class: "sb-code"}, it.code) : null, lab),
      it.sub ? h("small", {class: "sb-sub" + (it.nd ? " sb-nd" : "")}, it.sub) : null));
  }

  function paint() {
    list.innerHTML = ""; sel = -1; input.removeAttribute("aria-activedescendant");
    items = Atlas.search(input.value);
    const qw = words(input.value);
    if (!items.length) {
      if (norm(input.value).length >= 3) {
        const alt = parecidos(input.value);
        list.append(h("li", {class: "sb-vacio", role: "presentation"},
          h("p", {}, "Ningún nombre del atlas empieza así y ninguna evidencia curada contiene esa palabra."),
          h("p", {class: "small muted"}, "Que no aparezca no demuestra que no exista: puede ser un hueco de curación."),
          alt.length ? h("p", {class: "sb-alt"}, h("span", {class: "small muted"}, "Palabras del atlas con la misma raíz: "),
            ...alt.map(a => h("button", {type: "button", class: "chip sb-chip", onmousedown: ev => ev.preventDefault(),
              onclick: () => { input.value = a; paint(); input.focus(); }}, a))) : null));
        show(true);
      } else show(false);
      return;
    }
    let lastT = null;
    items.forEach((it, i) => {
      if (it.t !== lastT) {
        const g = GRUPOS.find(([t]) => t === it.t);
        list.append(h("li", {class: "suggest-h sb-h" + (it.t === "texto" ? " sb-h-texto" : ""), role: "presentation"}, g ? g[1] : "En el texto"));
        lastT = it.t;
      }
      list.append(option(it, i, qw));
      if (it.mas) list.append(h("li", {class: "sb-mas small muted", role: "presentation"}, "y " + it.mas + " más: afina la búsqueda"));
    });
    show(true);
  }
  function move(d) {
    const opts = [...list.querySelectorAll("a[role=option]")]; if (!opts.length) return;
    sel = (sel + d + opts.length) % opts.length;
    opts.forEach((a, i) => a.setAttribute("aria-selected", String(i === sel)));
    input.setAttribute("aria-activedescendant", opts[sel].id);
    opts[sel].scrollIntoView({block: "nearest"});
  }
  input.addEventListener("input", paint);
  input.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (list.hidden) paint(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter") { const opts = list.querySelectorAll("a[role=option]"); const o = opts[sel < 0 ? 0 : sel];
      if (o) { e.preventDefault(); location.hash = o.getAttribute("href"); show(false); input.blur(); } }
    else if (e.key === "Escape") { show(false); input.blur(); }
  });
  input.addEventListener("blur", () => setTimeout(() => show(false), 150));
  input.addEventListener("focus", () => { if (items.length) show(true); });
  /* índice derivado al arrancar: se construye en cuanto el navegador queda libre, no en la primera tecla */
  const pre = () => { try { if (!IDX) build(); } catch (err) { console.error(err); } };
  if (window.requestIdleCallback) requestIdleCallback(pre, {timeout: 1500}); else setTimeout(pre, 300);
};

})();
