;(function(){
/* 30_compare.js · Comparador de 2-4 especies, subgrupos o cepas.
   v2 (P1-04/P1-07): sin lista fija de rasgos y sin fila «Forma recomendada».
   - «Qué produce y por qué vía» = UNIÓN de los rasgos v1.2 que declaran los comparados (sin los de criterio propio),
     cada celda con presencia, vía, genes, base y alcance; una cepa solo hereda lo que es de especie o de su subgrupo.
   - Las formas salen de las evidencias ENSAYADAS (forma × dirección), sin asociaciones ni mezclas, y «¿funciona muerta?»
     usa el mismo muerta() del pivote (Atlas.pivot), cuya paridad con Python vigila tools/humo_pivote.cjs.
   - Ningún hueco se pinta como «No»: lo no declarado o no medido va en gris discontinuo con su texto. */
(function () {
const U = Atlas.ui, D = new Proxy({}, {get: (_, k) => Atlas.data[k]}), h = U.h, icon = U.icon, level = U.level;
const PLINES = () => D.lineas("producto");
const LORD = {MA: 1, ECA: 2, OBS: 3, ANI: 4, CEL: 5, "GEN-v": 6, "GEN-p": 6, GEN: 6};
const NIVELES = ["MA", "ECA", "OBS", "ANI", "CEL", "GEN"];
const genLabel = c => c && c.startsWith("GEN") ? "GEN" : c;
const sinGuion = s => String(s == null ? "" : s).replace(/_/g, " ");
const nd = txt => h("span", {class: "cmp-nd"}, txt);
const pill = (cls, txt) => h("span", {class: "gate-pill gate-" + cls}, txt);

/* vocabularios de pantalla (los códigos nunca se pintan crudos) */
const QPS = {qps: ["ok", "QPS"], no_evaluada: ["nd", "no evaluada para QPS"], no_seguridad: ["bad", "no QPS (motivos de seguridad)"], excluida: ["bad", "excluida de la evaluación QPS"]};
const NOVEL = {autorizado: ["ok", "autorizado"], no_novel_historia_uso: ["ok", "no es novel (historia de uso)"], desconocido: ["nd", "desconocido"]};
const AERO = {anaerobia_facultativa: "anaerobia facultativa", anaerobia_aerotolerante: "anaerobia aerotolerante", anaerobia_estricta: "anaerobia estricta"};
const FORMAS = [["vivo", "Célula viva"], ["inactivado", "Célula inactivada"], ["componente", "Fracción celular"],
                ["metabolito", "Metabolito aislado"], ["fermentado", "Fermentado"], [null, "Forma no declarada en la fuente"]];
const PRES = {si: "lo produce", no: "no lo produce (curado)", variable_cepa: "varía entre cepas", sin_resolver: "sin resolver"};
const BASE = {causal: "demostrado", observado: "observado", inferencia: "inferido", prediccion_genomica: "predicción genómica", contexto: "contexto"};
const ALC = {especie: "de la especie", cepa: "de cepa", subgrupo: "de subgrupo"};
const PUERTA_FORMAS = [["vivo", "Vivo"], ["posbiotico", "Posbiótico"], ["fermentado", "Fermentado"]];

/* evidencias propias del sujeto (sin registros de contexto) */
const evsOf = id => D.evidenceOf(id).filter(e => (e.tipo || "evidencia") === "evidencia");
/* formas y «¿funciona muerta?» solo en líneas de producto: seguridad y tecnología no son un efecto a favor */
const esProducto = e => { const l = e.linea && D.linea(e.linea); return !!(l && l.tipo === "producto"); };
const evsProd = id => evsOf(id).filter(esProducto).filter(cuenta);
const cuenta = e => Atlas.pivot && Atlas.pivot.cuenta ? Atlas.pivot.cuenta(e) : (e.relacion !== "asociacion" && e.alcance !== "mezcla");

function bestLineLevel(subj, linea) {
  let best = null, bestN = 99, atk = false;
  (linea.resultados || []).forEach(res => {
    const c = D.cell(subj, linea.id, res.id);
    if (c && c.mejor_nivel && LORD[c.mejor_nivel] < bestN) { bestN = LORD[c.mejor_nivel]; best = c.mejor_nivel; }
    const m = D.matrixCell(linea.id, subj, res.id);
    if (m && m.estado === "linea_de_ataque") atk = true;
  });
  return {best, atk};
}
function levelCounts(subj) {
  const by = {}; NIVELES.forEach(k => { by[k] = 0; });
  evsOf(subj).forEach(e => { const g = genLabel(e.nivel); if (g && by[g] != null) by[g]++; });
  return by;
}
/* formas ensayadas: n con resultado a favor (+ o mixto) de n ensayadas, sin asociaciones ni mezclas */
function formasDe(subj) {
  const out = new Map();
  evsProd(subj).forEach(e => {
    const k = e.forma || null;
    if (!out.has(k)) out.set(k, {n: 0, fav: 0});
    const x = out.get(k); x.n++; if (e.direccion === "+" || e.direccion === "mixto") x.fav++;
  });
  return out;
}
/* rasgos que aplican al sujeto: la especie ve todos; la cepa, los de especie, los de su subgrupo y los suyos */
function rasgosDe(x, key) {
  const sp = D.species(x.r.especie);
  const T = ((sp && sp.rasgos) || []).filter(t => t.rasgo === key && t.alcance !== "criterio_propio");
  if (!T.length) return null;
  if (x.r.tipo === "especie") return T.map(t => ({t, como: t.alcance === "cepa" ? "cepas" : "propio"}));
  const sg = x.r.tipo === "subgrupo" ? x.id : (x.r.obj.subgrupo || null);
  return T.map(t => {
    const contra = (t.cepas_en_contra || []).find(c => c.cepa === x.id);
    if (contra) return {t, como: "contra", contra};
    if (t.alcance === "especie") return {t, como: "hereda"};
    if (t.alcance === "subgrupo") return {t, como: (t.cepas || []).length && x.r.tipo === "cepa" ? ((t.cepas || []).includes(x.id) ? "propio" : "otra") : "hereda", sg};
    if ((t.cepas || []).includes(x.id)) return {t, como: "propio"};
    if (x.r.tipo === "subgrupo" && (t.cepas || []).some(c => (D.strain(c) || {}).subgrupo === x.id)) return {t, como: "propio"};
    return {t, como: "otra"};
  });
}

Atlas.registerView({route: "comparar", tab: "comparar", cssClass: "v-comparar", render(el, r) {
  const ids = (r.query.ids || "").split(",").map(s => s.trim()).filter(Boolean).slice(0, 4);
  el.append(h("h1", {}, "Comparador"),
    U.readingBox("comparar",
      "Poner 2-4 especies, subgrupos o cepas lado a lado: qué consiguen, en qué forma se han probado y qué producen.",
      "La aptitud es el mejor nivel por línea. Las formas salen de los ensayos, no de una recomendación. Los rasgos son los que declara cada uno, sin criterio propio.",
      "Lo gris con borde discontinuo es «no declarado» o «no medido»: no significa que no lo haga."));

  el.append(addControl(ids, r.query.dif === "1"));

  if (ids.length < 2) {
    const tray = Atlas.tray.items;
    el.append(h("div", {class: "card empty"},
      h("p", {}, "Añade de 2 a 4 elementos con el selector de arriba, o elige una plantilla:"),
      h("div", {class: "bar cmp-tpl"},
        tplBtn("Bifidobacterias de mayores", ["bifidobacterium-adolescentis", "bifidobacterium-longum", "bifidobacterium-bifidum"]),
        tplBtn("Nueva generación", ["akkermansia-muciniphila", "faecalibacterium-prausnitzii", "christensenella-minuta"]),
        tplBtn("BAL clásicas", ["lacticaseibacillus-rhamnosus", "lactiplantibacillus-plantarum", "ligilactobacillus-salivarius"]),
        tplBtn("Estreptococos orales", ["streptococcus-salivarius", "streptococcus-australis", "streptococcus-oligofermentans"])),
      tray.length ? h("p", {class: "small"}, "En tu bandeja: " + tray.length + " elementos. ",
        h("a", {href: Atlas.route.href("comparar", null, {ids: tray.join(",")})}, "Comparar los de la bandeja")) : ""));
    return;
  }

  const subs = ids.map(id => ({id, r: D.resolve(id)})).filter(x => x.r);
  const dif = r.query.dif === "1";
  el.append(h("div", {class: "filters bar"},
    h("button", {class: "switch", role: "switch", "aria-checked": String(dif), type: "button",
      onclick: () => Atlas.route.patch({dif: dif ? null : "1"})}, h("i", {}), "Solo diferencias")));

  const wrap = h("div", {class: "tbl cmp-wrap", "data-scroll": true});
  const table = h("table", {class: "cmp"});
  const thead = h("thead", {}, h("tr", {},
    h("th", {class: "stick"}, ""),
    ...subs.map(x => h("th", {class: "colh"},
      h("a", {class: "bn", href: Atlas.route.href(x.r.tipo === "cepa" ? "cepa" : "especie", x.r.tipo === "subgrupo" ? x.r.especie : x.id)}, shortName(x.id)),
      h("small", {}, {especie: "especie", cepa: "cepa", subgrupo: "subgrupo"}[x.r.tipo] + (x.r.tipo !== "especie" ? " · " + (D.species(x.r.especie) || {}).nombre_corto : ""),
        " ", h("button", {class: "mini-x", type: "button", title: "Quitar", "aria-label": "Quitar " + shortName(x.id), onclick: () => {
          const rest = ids.filter(i => i !== x.id); Atlas.route.go("comparar", null, {ids: rest.join(","), dif: dif ? "1" : null});
        }}, icon("x")))))));
  const tb = h("tbody", {});

  /* --- Regulación y seguridad --- */
  grp(tb, "Regulación y seguridad");
  row(tb, subs, "QPS (EFSA)", dif, x => {
    const q = ((D.species(x.r.especie) || {}).regulatorio || {}).qps || {};
    const [c, t] = QPS[q.estado] || ["nd", q.estado ? sinGuion(q.estado) : "sin dato"];
    const cond = (q.calificaciones || []).some(k => k.codigo === "sin_amr_adquirida");
    return h("span", {}, pill(c, t), cond ? h("small", {class: "muted cmp-blk"}, "condición: sin AMR adquirida") : "");
  }, x => (((D.species(x.r.especie) || {}).regulatorio || {}).qps || {}).estado);
  row(tb, subs, "Novel Food", dif, x => {
    const nf = ((D.species(x.r.especie) || {}).regulatorio || {}).novel_food || {};
    const [c, t] = NOVEL[nf.estado] || ["nd", nf.estado ? sinGuion(nf.estado) : "sin dato"];
    return pill(c, t);
  }, x => ((((D.species(x.r.especie) || {}).regulatorio || {}).novel_food) || {}).estado);
  row(tb, subs, "Seguridad de la especie", dif, x => {
    const st = D.segEspecie(x.r.especie);
    if (!st) return nd("sin dato");
    return h("span", {}, U.gatePill("seguridad", "", st.estado), (st.motivos || [])[0] ? h("small", {class: "muted cmp-blk"}, st.motivos[0]) : "");
  }, x => (D.segEspecie(x.r.especie) || {}).estado);
  if (subs.some(x => x.r.tipo === "cepa")) {
    row(tb, subs, "Puerta de la cepa por forma", dif, x => {
      if (x.r.tipo !== "cepa") return nd("solo para cepas");
      const pc = D.puertaCepa(x.id);
      if (!pc) return nd("no calculada");
      return h("span", {class: "cmp-gates"}, PUERTA_FORMAS.map(([f, etq]) => {
        const p = (pc.puerta_por_forma || {})[f];
        return U.gatePill("regulatorio", etq, p ? p.estado : "desconocida");
      }));
    }, x => { const pc = x.r.tipo === "cepa" && D.puertaCepa(x.id); return pc ? PUERTA_FORMAS.map(([f]) => ((pc.puerta_por_forma || {})[f] || {}).estado).join() : x.r.tipo; });
  }
  row(tb, subs, "Resistencias curadas (AMR)", dif, x => {
    const n = (((D.species(x.r.especie) || {}).seguridad || {}).amr || []).length;
    return n ? h("span", {}, n + (n > 1 ? " registros" : " registro"), h("small", {class: "muted cmp-blk"}, "de la especie; el genoma de cada cepa, en su ficha")) : nd("sin registros curados");
  }, x => (((D.species(x.r.especie) || {}).seguridad || {}).amr || []).length);

  /* --- Aptitud por línea --- */
  grp(tb, "Aptitud por línea (mejor nivel)");
  const vacias = [];
  PLINES().forEach(l => {
    const vals = subs.map(x => bestLineLevel(x.id, l));
    if (vals.every(v => !v.best && !v.atk)) { vacias.push(l); return; }   // sin evidencia en ninguno: se cuenta abajo, no se repite fila a fila
    if (dif && allEqual(vals.map(v => v.best + "" + v.atk))) return;
    const tr = h("tr", {}, h("th", {class: "stick", scope: "row"}, h("a", {href: Atlas.route.href("lineas", l.id)}, l.nombre)));
    vals.forEach((v, i) => tr.append(h("td", {"data-k": shortName(subs[i].id)}, v.best ? h("span", {class: "cmp-lvl"}, level(v.best), v.atk ? h("span", {class: "mark atk"}, icon("target"), "Ataque") : "") : nd("sin evidencia"))));
    tb.append(tr);
  });
  if (vacias.length) tb.append(h("tr", {class: "cmp-foot"}, h("th", {class: "stick", scope: "row"}, "Sin evidencia en ninguno"),
    h("td", {colspan: subs.length, class: "small muted"}, vacias.map(l => l.nombre).join(", ") + ". Es falta de curación o de estudio, no ausencia demostrada.")));

  /* --- Evidencia por nivel (texto, sin barras) --- */
  grp(tb, "Evidencia por nivel");
  row(tb, subs, "Evidencias", dif, x => {
    const c = levelCounts(x.id), tot = NIVELES.reduce((a, k) => a + c[k], 0);
    if (!tot) return nd("sin evidencia propia");
    return h("span", {class: "cmp-lvls"}, NIVELES.filter(k => c[k]).map(k => h("span", {class: "cmp-lvlc"}, level(k), " " + c[k])));
  }, x => JSON.stringify(levelCounts(x.id)));

  /* --- Formas ensayadas (derivadas de las evidencias) --- */
  const formas = subs.map(x => formasDe(x.id));
  const usadas = FORMAS.filter(([f]) => formas.some(m => m.has(f)));
  grp(tb, "En qué forma se ha probado (líneas de producto)");
  usadas.forEach(([f, etq]) => {
    const keys = formas.map(m => m.has(f) ? m.get(f).fav + "/" + m.get(f).n : "—");
    if (dif && allEqual(keys)) return;
    const tr = h("tr", {}, h("th", {class: "stick", scope: "row"}, etq));
    formas.forEach((m, i) => { const v = m.get(f);
      tr.append(h("td", {"data-k": shortName(subs[i].id)}, !v ? nd("no ensayada") : h("span", {}, h("b", {}, String(v.fav)), " a favor de " + v.n + (v.n === 1 ? " ensayo" : " ensayos")))); });
    tb.append(tr);
  });
  if (!usadas.length) row(tb, subs, "Formas", dif, () => nd("sin ensayos en líneas de producto"), () => "—");
  if (Atlas.pivot && Atlas.pivot.muerta) {
    row(tb, subs, "¿Funciona con célula muerta?", dif, x => {
      const evs = evsProd(x.id);
      if (!evs.length) return nd("sin ensayos en líneas de producto");
      const m = Atlas.pivot.muerta(evs);
      const res = [...new Set((m.ev || []).map(id => (D.raw.evidencias[id] || {})).filter(e => e.linea).map(e => (D.resultado(e.linea, e.resultado) || {}).nombre_corto || sinGuion(e.resultado)))];
      return h("span", {}, Atlas.pivot.muertaCell ? Atlas.pivot.muertaCell(m) : m.txt,
        res.length && (m.k === "si" || m.k === "frac" || m.k === "nulo") ? h("small", {class: "muted cmp-blk"}, "en: " + res.join(", ")) : "");
    }, x => { const evs = evsProd(x.id); return evs.length ? Atlas.pivot.muerta(evs).k : "—"; });
  }

  /* --- Qué produce y por qué vía: unión de los rasgos declarados (sin criterio propio) --- */
  const union = new Map();
  subs.forEach(x => ((D.species(x.r.especie) || {}).rasgos || []).filter(t => t.alcance !== "criterio_propio")
    .forEach(t => { if (!union.has(t.rasgo)) union.set(t.rasgo, t.etiqueta || sinGuion(t.rasgo)); }));
  if (union.size) grp(tb, "Qué produce y por qué vía");
  union.forEach((lab, k) => {
    const vals = subs.map(x => rasgosDe(x, k));
    const keys = vals.map(T => T ? T.map(o => o.como + o.t.presente + o.t.via).join() : "—");
    if (dif && allEqual(keys)) return;
    const trr = h("tr", {}, h("th", {class: "stick", scope: "row"}, lab));
    vals.forEach((T, i) => trr.append(h("td", {"data-k": shortName(subs[i].id)}, !T ? nd("no declarado") : h("div", {class: "cmp-ras"},
      T.map(o => rasgoCelda(Object.assign({cepaId: subs[i].r.tipo === "cepa" ? subs[i].id : null, sgId: subs[i].r.tipo === "subgrupo" ? subs[i].id : null}, o)))))));
    tb.append(trr);
  });

  /* --- Tecnología --- */
  grp(tb, "Tecnología");
  row(tb, subs, "Aerotolerancia", dif, x => {
    const a = ((D.species(x.r.especie) || {}).tecnologia || {}).aerotolerancia;
    return a ? (AERO[a] || sinGuion(a)) : nd("no declarada");
  }, x => ((D.species(x.r.especie) || {}).tecnologia || {}).aerotolerancia);

  table.append(thead, tb); wrap.append(table); el.append(wrap);
  el.append(h("p", {class: "swipe"}, "Desliza para ver todas las columnas →"));
  wrap.addEventListener("scroll", e => e.currentTarget.classList.toggle("scrolled", e.currentTarget.scrollLeft > 2), {passive: true});
}});

function rasgoCelda(o) {
  const t = o.t;
  if (o.como === "contra") return h("div", {class: "cmp-r"},
    h("span", {class: "cmp-no"}, "No: " + (t.etiqueta || "").toLowerCase() + " (ensayo en contra)"), " ", U.sources(o.contra.evidencias || []));
  if (o.como === "otra") return h("div", {class: "cmp-r"}, nd("descrito en otra cepa"), h("small", {class: "muted cmp-blk"},
    (t.cepas || []).map(c => (D.strain(c) || {}).nombre_corto || c).join(", ")));
  const via = t.via && t.via !== "desconocida" ? t.via_etiqueta : null;
  const genes = (t.genes || []).map(g => g.gen || g).filter(Boolean);
  const alc = o.como === "hereda" ? (t.alcance === "subgrupo" ? "del subgrupo" : "de la especie")
    : o.como === "cepas" ? "en " + ((t.cepas || []).length ? (t.cepas || []).map(c => (D.strain(c) || {}).nombre_corto || c).join(", ") : "algunas cepas")
    : o.como === "propio" && o.cepaId ? "en esta cepa"
    : o.como === "propio" && o.sgId ? "en " + (t.cepas || []).filter(c => (D.strain(c) || {}).subgrupo === o.sgId).map(c => (D.strain(c) || {}).nombre_corto || c).join(", ")
    : (ALC[t.alcance] || "");
  return h("div", {class: "cmp-r"},
    h("span", {class: "cmp-pres cmp-pres-" + (t.presente || "nd")}, PRES[t.presente] || sinGuion(t.presente || "sin dato")),
    h("small", {class: "cmp-blk"}, via ? "vía: " + via : h("span", {class: "muted"}, "vía no identificada en la fuente")),
    genes.length ? h("small", {class: "cmp-blk"}, "gen ", h("i", {class: "cmp-gen"}, genes.join(", "))) : "",
    h("small", {class: "muted cmp-blk"}, [BASE[t.base] || "", alc].filter(Boolean).join(" · ")));
}

function addControl(ids, dif) {
  const opts = [h("option", {value: ""}, ids.length >= 4 ? "Máximo 4 seleccionados" : "+ Añadir especie, subgrupo o cepa…")];
  D.allSpecies().sort((a, b) => a.nombre_actual.localeCompare(b.nombre_actual)).forEach(s => {
    const g = h("optgroup", {label: s.nombre_actual});
    if (!ids.includes(s.slug)) g.append(h("option", {value: s.slug}, s.nombre_actual + " (especie)"));
    (s.subgrupos || []).map(D.subgroup).filter(Boolean).forEach(sg => { if (!ids.includes(sg.id)) g.append(h("option", {value: sg.id}, s.nombre_corto + " · " + (sg.nombre || sg.id))); });
    (s.cepas || []).map(D.strain).filter(Boolean).forEach(st => { if (!ids.includes(st.id)) g.append(h("option", {value: st.id}, s.nombre_corto + " " + (st.designacion || st.nombre_corto))); });
    if (g.children.length) opts.push(g);
  });
  const sel = h("select", {class: "field-select add-sel", "aria-label": "Añadir al comparador", disabled: ids.length >= 4,
    onchange: e => { const v = e.target.value; if (v && ids.length < 4) Atlas.route.go("comparar", null, {ids: [...ids, v].join(","), dif: dif ? "1" : null}); }}, opts);
  return h("div", {class: "cmp-add"}, sel, h("span", {class: "small muted"}, ids.length + "/4 seleccionados"));
}
function shortName(id) { const r = D.resolve(id); if (!r) return id; const sp = D.species(r.especie);
  return r.tipo === "especie" ? sp.nombre_corto : (sp.nombre_corto + " " + (r.obj.designacion || r.obj.nombre || r.obj.nombre_corto || "")); }
function grp(tb, label) { tb.append(h("tr", {class: "grp"}, h("th", {class: "stick", scope: "rowgroup"}, label), h("td", {colspan: 9}))); }
function row(tb, subs, label, dif, fn, keyFn) {
  const keys = subs.map(keyFn || fn);
  if (dif && allEqual(keys)) return;
  const tr = h("tr", {}, h("th", {class: "stick", scope: "row"}, label));
  subs.forEach(x => tr.append(h("td", {"data-k": shortName(x.id)}, fn(x))));
  tb.append(tr);
}
function allEqual(a) { return a.every(x => String(x) === String(a[0])); }
function tplBtn(label, ids) { return h("a", {class: "chip", href: Atlas.route.href("comparar", null, {ids: ids.join(",")})}, label); }
})();

})();
