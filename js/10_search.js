;(function(){
/* 10_search.js · P1 núcleo + E7 (K7). Buscador global con índice DERIVADO de los datos al arrancar (no curado a mano):
   especies y cepas por sus nombres, sinónimos y depósitos; resultados, clases de mecanismo y genes (llevan al pivote
   «quién más»); y, como último recurso, el texto de las evidencias. Coincidencia por PRINCIPIO DE PALABRA, nunca por
   subcadena interior (antes «candida» encontraba «xla1 candidato clinico» de C. minuta).
   Contrato: Atlas.search(q) → [{t, id, label, href, antes?, n?}] máx. 9, agrupados por tipo. */
const norm = s => (s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const words = s => norm(s).split(" ").filter(Boolean);
let IDX = null, EVW = null, RAW = null;

function build() {
  const D = Atlas.data, R = D.raw, H = Atlas.route.href.bind(Atlas.route), it = [];
  const evs = Object.values(R.evidencias).filter(e => (e.tipo || "evidencia") === "evidencia");
  // especies y cepas: solo nombres (no las listas descriptivas de palabras clave)
  Object.values(R.especies).forEach(s => it.push({t: "especie", id: s.slug, label: s.nombre_actual, href: H("especie", s.slug),
    antes: (s.sinonimos || []).filter(x => x.tipo === "reclasificacion" || x.tipo === "basionimo").map(x => x.nombre),
    k: [s.nombre_actual, s.nombre_corto, ...(s.sinonimos || []).map(x => x.nombre)]}));
  Object.values(R.cepas).forEach(c => { const sp = R.especies[c.especie];
    it.push({t: "cepa", id: c.id, label: (sp ? sp.nombre_corto + " " : "") + (c.designacion || c.nombre_corto), href: H("cepa", c.id),
      k: [c.designacion, c.nombre_corto, ...(c.otros_nombres || []), ...(c.depositos || []).map(d => d.coleccion + " " + d.numero)]}); });
  // resultados (con nº de evidencias: 0 se dice, no se esconde)
  const nRes = {}; evs.forEach(e => { const k = e.linea + "|" + e.resultado; nRes[k] = (nRes[k] || 0) + 1; });
  R.catalogo.lineas.forEach(l => {
    it.push({t: "linea", id: l.id, label: l.nombre, href: H("lineas", l.id), k: [l.nombre]});
    (l.resultados || []).forEach(r => { const k = l.id + "|" + r.id;
      it.push({t: "resultado", id: k, label: r.nombre + " · " + l.nombre, n: nRes[k] || 0, href: H("lineas", l.id, {res: r.id}), k: [r.nombre, r.nombre_corto, r.id.replace(/_/g, " ")]}); });
  });
  // clases de mecanismo (v1.2)
  (R.catalogo.clases_mecanismo || []).filter(c => !["desconocido", "no_aplica", "otro"].includes(c.id)).forEach(c => {
    const n = evs.filter(e => e.mecanismo && (e.mecanismo.clases || []).includes(c.id)).length;
    it.push({t: "mecanismo", id: c.id, label: c.etiqueta, n, href: H("lineas", null, {mec: c.id}), k: [c.etiqueta, c.id.replace(/_/g, " ")]});
  });
  // E7 r2: mecanismos concretos del catálogo (M41 coagregación, M35 anti-adhesión con célula inactivada…) → pivote ?mid=
  (R.catalogo.mecanismos || []).forEach(m => it.push({t: "mecanismo", id: m.id, label: m.id + " · " + m.nombre, n: (m.fuentes || []).length,
    href: H("lineas", null, {mid: m.id}), k: [m.nombre, m.molecula_o_componente]}));
  // genes: de la evidencia (v1.2), de los rasgos y de los marcadores de especie
  const genes = new Map();
  const addG = g => { if (!g) return; const k = norm(g); if (!genes.has(k)) genes.set(k, g); };
  evs.forEach(e => ((e.mecanismo && e.mecanismo.genes) || []).forEach(addG));
  Object.values(R.especies).forEach(s => { (s.genes_marcadores || []).forEach(addG); (s.rasgos || []).forEach(r => (r.genes || []).forEach(g => addG(g && g.gen || g))); });
  genes.forEach(g => it.push({t: "gen", id: g, label: g, href: H("lineas", null, {gen: g}), k: [g]}));
  // E5 · outputs (rasgos v1.2) con su vía: «ureasa», «piruvato oxidasa», «peróxido» → quién lo produce y por qué vía
  const VR = R.catalogo.vocabulario_rasgos;
  if (VR) {
    Object.entries(VR.rasgos).filter(([, v]) => (v.productores || []).length).forEach(([id, v]) => {
      const vias = Object.entries(VR.vias).filter(([vid, x]) => x.output === id && (v.vias_identificadas || []).includes(vid)).map(([, x]) => x.etiqueta);
      it.push({t: "rasgo", id, label: v.etiqueta + (vias.length ? " · " + vias.join(", ") : ""), n: v.productores.length,
        href: H("lineas", null, {out: id}), k: [v.etiqueta, id.replace(/_/g, " "), ...vias]});
    });
    // por especie, solo cuando la vía está identificada (el output ya lo cubre el item «rasgo» y las moléculas declaradas)
    Object.values(R.especies).forEach(s => (s.rasgos || []).filter(t => t.presente !== "no" && t.via !== "desconocida").forEach(t =>
      it.push({t: "molecula", id: s.slug + ":" + t.rasgo + ":" + t.via, href: H("especie", s.slug),
        label: s.nombre_corto + " · " + t.via_etiqueta + " → " + t.etiqueta.toLowerCase(), k: [t.via_etiqueta]})));
  }
  // moléculas y funciones declaradas por cada especie (derivado de especies.json) → ficha de la especie
  Object.values(R.especies).forEach(s => [...(s.moleculas || []), ...(s.funciones || [])].forEach(m =>
    it.push({t: "molecula", id: s.slug + ":" + m, label: s.nombre_corto + " · " + m, href: H("especie", s.slug), k: [m]})));
  // filtros con nombre propio
  it.push({t: "filtro", id: "qps", label: "Especies con QPS", href: H("especies", null, {qps: "si"}), k: ["QPS", "qualified presumption of safety"]});
  it.forEach(x => { x.w = [...new Set(x.k.filter(Boolean).flatMap(words))]; x.phr = x.k.filter(Boolean).map(norm); });
  IDX = it;
  EVW = evs.map(e => ({id: e.id, w: new Set(words(e.claim_es))}));
  // E7 r2: texto libre de los rasgos v1.2 de E5 (etiqueta, vía, vía candidata, detalle, nota cepa/especie) → misma consulta ?q=
  RAW = Object.values(R.especies).flatMap(s => (s.rasgos || []).map(t => ({w: new Set(words([t.etiqueta, t.via_etiqueta, t.via_candidata_etiqueta, t.detalle, t.nota_cepa_vs_especie].filter(Boolean).join(" ")))})));
}

Atlas.search = function (q) {
  const qw = words(q); if (!qw.length || norm(q).length < 2) return [];
  if (!IDX) build();
  const score = it => {
    if (it.phr.some(p => p === norm(q))) return 4;
    if (it.phr.some(p => p.startsWith(norm(q)))) return 3;
    if (qw.every(w => it.w.some(x => x === w))) return 2.5;
    if (qw.every(w => it.w.some(x => x.startsWith(w)))) return 2;
    return 0;
  };
  const ORD = {especie: 0, cepa: 1, resultado: 2, rasgo: 2.5, mecanismo: 3, gen: 4, molecula: 5, linea: 6, filtro: 7};
  const hits = IDX.map(it => [score(it), it]).filter(([s]) => s > 0)
    .sort((a, b) => b[0] - a[0] || (ORD[a[1].t] - ORD[b[1].t]) || a[1].label.localeCompare(b[1].label)).slice(0, 8).map(([, it]) => it);
  // último recurso, siempre visible si hay coincidencias: el texto de las evidencias
  // en texto libre solo palabra exacta o su plural (-s, -es): «candida» ya no encuentra «candidata»
  const inflex = (x, w) => x === w || x === w + "s" || x === w + "es";
  const nTxt = EVW.filter(e => qw.every(w => [...e.w].some(x => inflex(x, w)))).length;
  const nRas = RAW.filter(e => qw.every(w => [...e.w].some(x => inflex(x, w)))).length;
  if (nTxt || nRas) hits.push({t: "texto", id: q, label: "«" + q.trim() + "» en " + [nTxt ? nTxt + " evidencia" + (nTxt > 1 ? "s" : "") : "", nRas ? nRas + " rasgo" + (nRas > 1 ? "s" : "") : ""].filter(Boolean).join(" y "),
    href: Atlas.route.href("lineas", null, {q: q.trim()})});
  return hits.sort((a, b) => (ORD[a.t] ?? 9) - (ORD[b.t] ?? 9));
};
const TLABEL = {especie: "Especies", cepa: "Cepas", resultado: "Resultados · quién lo consigue", rasgo: "Outputs · quién lo produce y por qué vía", mecanismo: "Mecanismos · quién lo hace así",
                gen: "Genes · evidencias que lo nombran", molecula: "Moléculas y funciones declaradas", linea: "Líneas de producto", filtro: "Filtros", texto: "Texto de evidencias y rasgos"};
Atlas.mountSearch = function (input, list) {
  let sel = -1, items = [];
  function paint() {
    list.innerHTML = ""; sel = -1;
    items = Atlas.search(input.value);
    if (!items.length) {
      if (norm(input.value).length >= 3) { list.hidden = false; list.append(Atlas.ui.h("li", {class: "suggest-h", role: "presentation"}, "Nada con ese nombre ni en el texto de las evidencias curadas.")); }
      else list.hidden = true;
      return;
    }
    list.hidden = false;
    let lastT = null;
    items.forEach((it, i) => {
      if (it.t !== lastT) { list.append(Atlas.ui.h("li", {class: "suggest-h", role: "presentation"}, TLABEL[it.t] || it.t)); lastT = it.t; }
      list.append(Atlas.ui.h("li", {role: "presentation"}, Atlas.ui.h("a", {role: "option", "data-i": i, href: it.href,
        onclick: () => { list.hidden = true; }},
        it.t === "cepa" || it.t === "especie" ? Atlas.ui.h("i", {class: "bn"}, it.label) : it.label,
        it.n != null ? Atlas.ui.h("small", {}, " · " + (it.t === "rasgo" ? it.n + " especies" : it.n ? it.n + " evid." : "sin evidencia curada")) : "",
        it.antes && it.antes.length ? Atlas.ui.h("small", {}, " antes: " + it.antes.join(", ")) : "")));
    });
  }
  function move(d) {
    const opts = [...list.querySelectorAll("a[role=option]")]; if (!opts.length) return;
    sel = (sel + d + opts.length) % opts.length;
    opts.forEach((a, i) => a.setAttribute("aria-selected", i === sel));
    opts[sel].scrollIntoView({block: "nearest"});
  }
  input.addEventListener("input", paint);
  input.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter") { const opts = list.querySelectorAll("a[role=option]"); if (opts[sel < 0 ? 0 : sel]) { location.hash = opts[sel < 0 ? 0 : sel].getAttribute("href"); list.hidden = true; input.blur(); } }
    else if (e.key === "Escape") { list.hidden = true; input.blur(); }
  });
  input.addEventListener("blur", () => setTimeout(() => { list.hidden = true; }, 150));
  input.addEventListener("focus", () => { if (items.length) list.hidden = false; });
};

})();
