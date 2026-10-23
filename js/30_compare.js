;(function(){
/* 30_compare.js · P3. Comparador de 2-4 especies, subgrupos o cepas. */
(function () {
const U = Atlas.ui, D = new Proxy({}, {get: (_, k) => Atlas.data[k]}), h = U.h, icon = U.icon, level = U.level, name = U.name;
const PLINES = () => D.lineas("producto");
const LORD = {MA: 1, ECA: 2, OBS: 3, ANI: 4, CEL: 5, "GEN-v": 6, "GEN-p": 6, GEN: 6};
const genLabel = c => c && c.startsWith("GEN") ? "GEN" : c;

function bestLineLevel(subj, linea) {
  let best = null, bestN = 99, atk = false;
  (linea.resultados || []).forEach(res => {
    const c = D.cell(subj, linea.id, res.id);
    if (c && c.mejor_nivel && LORD[c.mejor_nivel] < bestN) { bestN = LORD[c.mejor_nivel]; best = c.mejor_nivel; }
    const m = D.raw.matriz[linea.id] && D.raw.matriz[linea.id][subj + "|" + res.id];
    if (m && m.estado === "linea_de_ataque") atk = true;
  });
  return {best, atk};
}
function levelCounts(subj) {
  const by = {MA: 0, ECA: 0, OBS: 0, ANI: 0, CEL: 0, GEN: 0};
  D.evidenceOf(subj).forEach(e => { const g = genLabel(e.nivel); if (g && by[g] != null) by[g]++; });
  return by;
}
function traitOf(subj, rasgo) {
  const r = D.resolve(subj); const sp = r && D.species(r.especie);
  const t = sp && (sp.rasgos || []).find(x => x.rasgo === rasgo);
  return t ? (t.presente === "si" ? "Sí" : t.presente === "no" ? "No" : t.presente === "variable_cepa" ? "Variable" : t.presente) : "—";
}

Atlas.registerView({route: "comparar", tab: "comparar", cssClass: "v-comparar", render(el, r) {
  const ids = (r.query.ids || "").split(",").map(s => s.trim()).filter(Boolean).slice(0, 4);
  el.append(h("h1", {}, "Comparador"),
    U.readingBox("comparar",
      "Elegir entre 2-4 especies, subgrupos o cepas para una línea o forma concreta.",
      "La aptitud es el mejor nivel por línea; el veredicto por forma está en la ficha de cada uno.",
      "Las barras pequeñas cuentan evidencias por nivel, de metaanálisis (izq.) a genómica (dcha.)."));

  el.append(addControl(ids, r.query.dif === "1"));

  if (ids.length < 2) {
    const tray = Atlas.tray.items;
    el.append(h("div", {class: "card empty"},
      h("p", {}, "Añade de 2 a 4 elementos con el selector de arriba, o elige una plantilla:"),
      h("div", {class: "bar"},
        tplBtn("Bifidobacterias de mayores", ["bifidobacterium-adolescentis", "bifidobacterium-longum", "bifidobacterium-bifidum"]),
        tplBtn("Nueva generación", ["akkermansia-muciniphila", "faecalibacterium-prausnitzii", "christensenella-minuta"]),
        tplBtn("BAL clásicas", ["lacticaseibacillus-rhamnosus", "lactiplantibacillus-plantarum", "ligilactobacillus-salivarius"])),
      tray.length ? h("p", {class: "small"}, "En tu bandeja: " + tray.length + " elementos. ",
        h("a", {href: Atlas.route.href("comparar", null, {ids: tray.join(",")})}, "Comparar los de la bandeja")) : ""));
    return;
  }

  const subs = ids.map(id => ({id, r: D.resolve(id)})).filter(x => x.r);
  const dif = r.query.dif === "1";
  const bar = h("div", {class: "filters bar"},
    h("button", {class: "switch", role: "switch", "aria-checked": String(dif), type: "button",
      onclick: () => Atlas.route.patch({dif: dif ? null : "1"})}, h("i", {}), "Solo diferencias"));
  el.append(bar);

  const wrap = h("div", {class: "tbl", "data-scroll": true});
  const table = h("table", {class: "cmp"});
  const thead = h("thead", {}, h("tr", {},
    h("th", {class: "stick"}, ""),
    ...subs.map(x => h("th", {class: "colh"}, h("span", {class: "bn"}, shortName(x.id)),
      h("small", {}, x.r.tipo + (x.r.tipo !== "especie" ? " · " + (D.species(x.r.especie)?.nombre_corto || "") : ""),
        " ", h("button", {class: "mini-x", type: "button", title: "Quitar", onclick: () => {
          const rest = ids.filter(i => i !== x.id); Atlas.route.go("comparar", null, {ids: rest.join(","), dif: dif ? "1" : null});
        }}, icon("x")))))));
  const tb = h("tbody", {});

  // Regulación
  grp(tb, "Regulación");
  row(tb, subs, "QPS", dif, x => {
    const sp = D.species(x.r.especie); const q = sp && sp.regulatorio && sp.regulatorio.qps;
    const yes = q && q.estado === "qps";
    return h("span", {class: "qps " + (yes ? "yes" : "nope")}, icon(yes ? "ok" : "minus"), yes ? "Sí" : "No");
  }, x => { const sp = D.species(x.r.especie); return sp && sp.regulatorio && sp.regulatorio.qps && sp.regulatorio.qps.estado; });
  row(tb, subs, "Novel Food", dif, x => {
    const sp = D.species(x.r.especie); const nf = sp && sp.regulatorio && sp.regulatorio.novel_food;
    return (nf && nf.estado ? nf.estado.replace(/_/g, " ") : "—");
  }, x => { const sp = D.species(x.r.especie); return sp && sp.regulatorio && sp.regulatorio.novel_food && sp.regulatorio.novel_food.estado; });

  // Aptitud por línea
  grp(tb, "Aptitud por línea (mejor nivel)");
  PLINES().forEach(l => {
    const vals = subs.map(x => bestLineLevel(x.id, l));
    if (dif && allEqual(vals.map(v => v.best))) return;
    const tr = h("tr", {}, h("th", {class: "stick", scope: "row"}, l.nombre));
    vals.forEach(v => tr.append(h("td", {}, v.best ? h("span", {}, level(v.best), v.atk ? h("span", {class: "mark atk", style: "margin-left:6px"}, icon("target"), "Ataque") : "") : h("span", {class: "muted"}, "—"))));
    tb.append(tr);
  });

  // Evidencia
  grp(tb, "Evidencia por nivel");
  const counts = subs.map(x => levelCounts(x.id));
  const gmax = Math.max(1, ...counts.flatMap(c => Object.values(c)));
  const tr = h("tr", {}, h("th", {class: "stick", scope: "row"}, "Distribución"));
  counts.forEach(c => {
    const mini = h("div", {class: "mini", role: "img", "aria-label": "MA " + c.MA + ", ECA " + c.ECA + ", OBS " + c.OBS + ", ANI " + c.ANI + ", CEL " + c.CEL + ", GEN " + c.GEN});
    ["MA", "ECA", "OBS", "ANI", "CEL", "GEN"].forEach(k => mini.append(h("i", {style: `height:${Math.round((c[k] || 0) / gmax * 46)}px`, title: k + ": " + (c[k] || 0)})));
    tr.append(h("td", {}, mini));
  });
  tb.append(tr);

  // Rasgos · E7: unión de los rasgos que declaran los comparados (antes: lista fija de 5, con «eps» vacío en las 26 especies).
  // Se muestran gen y nivel taxonómico; «rasgo» genérico «otro» se nombra por sus genes.
  // E5: rasgos v1.2 (vocabulario cerrado output × vía; «otro» ya no existe). Celda = presencia · vía · genes · alcance.
  const keyR = t => t.rasgo, labR = t => t.etiqueta || cap(String(t.rasgo).replace(/_/g, " "));
  const union = new Map();
  subs.forEach(x => { const sp = D.species(x.r.especie); (sp && sp.rasgos || []).filter(t => t.alcance !== "criterio_propio").forEach(t => { if (!union.has(keyR(t))) union.set(keyR(t), labR(t)); }); });
  if (union.size) grp(tb, "Qué produce y por qué vía");
  const PRES = {si: "Sí", no: "No", variable_cepa: "Varía entre cepas", sin_resolver: "Sin resolver"};
  union.forEach((lab, k) => {
    const vals = subs.map(x => { const sp = D.species(x.r.especie); const T = (sp && sp.rasgos || []).filter(t => keyR(t) === k);
      return T.length ? T.filter(t => x.r.tipo !== "cepa" || t.alcance !== "cepa" || (t.cepas || []).includes(x.id)) : null; });
    const keys = vals.map(T => T ? T.map(t => t.presente + t.via).join() : "—");
    if (dif && allEqual(keys)) return;
    const trr = h("tr", {}, h("th", {class: "stick", scope: "row"}, lab));
    vals.forEach(T => trr.append(h("td", {}, !T ? h("span", {class: "muted"}, "no declarado") : !T.length ? h("span", {class: "muted"}, "de otra cepa") :
      h("span", {}, ...T.flatMap((t, i) => [i ? h("br") : "", PRES[t.presente] || String(t.presente || "?"),
        h("small", {}, " · " + (t.via !== "desconocida" ? t.via_etiqueta : "vía no identificada")),
        (t.genes || []).length ? h("i", {class: "small"}, " " + t.genes.map(g => g.gen).join(", ")) : "",
        h("small", {class: "muted"}, " · " + (t.alcance === "cepa" ? (t.cepas || []).map(c => (D.strain(c) || {}).nombre_corto || c).join(", ") : t.alcance))])))));
    tb.append(trr);
  });

  // Seguridad y tecnología (resumen)
  grp(tb, "Seguridad y tecnología");
  row(tb, subs, "Señales AMR", dif, x => {
    const sp = D.species(x.r.especie); const n = (sp && sp.seguridad && sp.seguridad.amr || []).length;
    return n ? n + " registro" + (n > 1 ? "s" : "") : "—";
  }, x => { const sp = D.species(x.r.especie); return (sp && sp.seguridad && sp.seguridad.amr || []).length; });
  row(tb, subs, "Aerotolerancia", dif, x => {
    const sp = D.species(x.r.especie); return ((sp && sp.tecnologia && sp.tecnologia.aerotolerancia) || "—").replace(/_/g, " ");
  }, x => { const sp = D.species(x.r.especie); return sp && sp.tecnologia && sp.tecnologia.aerotolerancia; });
  // E7: fuera «Forma recomendada» heredada de la especie (decía «vivo» para CECT 5713); se pintan las formas realmente ensayadas
  const formasDe = x => [...new Set(D.evidenceOf(x.id).filter(e => e.direccion === "+" || e.direccion === "mixto").map(e => e.forma).filter(Boolean))].sort().join(", ") || "—";
  row(tb, subs, "Formas ensayadas con resultado a favor", dif, formasDe, formasDe);

  table.append(thead, tb); wrap.append(table); el.append(wrap);
  el.append(h("p", {class: "swipe"}, "Desliza para ver todas las columnas →"));
  el.querySelector(".tbl").addEventListener("scroll", e => e.currentTarget.classList.toggle("scrolled", e.currentTarget.scrollLeft > 2), {passive: true});
}});

function addControl(ids, dif) {
  const opts = [h("option", {value: ""}, ids.length >= 4 ? "— máximo 4 —" : "+ Añadir especie o cepa…")];
  D.allSpecies().sort((a, b) => a.nombre_actual.localeCompare(b.nombre_actual)).forEach(s => {
    if (!ids.includes(s.slug)) opts.push(h("option", {value: s.slug}, s.nombre_actual));
    (s.cepas || []).map(D.strain).filter(Boolean).forEach(st => { if (!ids.includes(st.id)) opts.push(h("option", {value: st.id}, "   " + s.nombre_corto + " " + (st.designacion || st.nombre_corto))); });
  });
  const sel = h("select", {class: "field-select add-sel", "aria-label": "Añadir al comparador", disabled: ids.length >= 4,
    onchange: e => { const v = e.target.value; if (v && ids.length < 4) Atlas.route.go("comparar", null, {ids: [...ids, v].join(","), dif: dif ? "1" : null}); }}, opts);
  return h("div", {class: "cmp-add"}, sel, h("span", {class: "small muted"}, ids.length + "/4 seleccionados"));
}
function shortName(id) { const r = D.resolve(id); if (!r) return id; const sp = D.species(r.especie); return r.tipo === "especie" ? sp.nombre_corto : (sp.nombre_corto + " " + (r.obj.designacion || r.obj.nombre)); }
function grp(tb, label) { tb.append(h("tr", {class: "grp"}, h("th", {class: "stick", colspan: 1, scope: "row"}, label), h("td", {colspan: 9}))); }
function row(tb, subs, label, dif, fn, keyFn) {
  const keys = subs.map(keyFn || fn);
  if (dif && allEqual(keys)) return;
  const tr = h("tr", {}, h("th", {class: "stick", scope: "row"}, label));
  subs.forEach(x => tr.append(h("td", {}, fn(x))));
  tb.append(tr);
}
function allEqual(a) { return a.every(x => String(x) === String(a[0])); }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function tplBtn(label, ids) { return h("a", {class: "chip", href: Atlas.route.href("comparar", null, {ids: ids.join(",")})}, label); }
})();

})();
