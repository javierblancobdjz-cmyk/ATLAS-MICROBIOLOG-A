;(function(){
/* 20_species.js · P2. Ficha de especie, ficha de cepa y lista de especies.
   Lee SOLO Atlas.data.* y pinta con Atlas.ui.*. Prefijo CSS .v-especie / .v-cepa / .v-especies. */
(function () {
const U = Atlas.ui, D = new Proxy({}, {get: (_, k) => Atlas.data[k]}), h = U.h, icon = U.icon, level = U.level, name = U.name;
const NIVORD = ["MA", "ECA", "OBS", "ANI", "CEL", "GEN"];
const genLabel = c => c === "GEN-v" ? "GEN" : c === "GEN-p" ? "GEN" : c;

function trayBtn(id) {
  const inTray = Atlas.tray.items.includes(id);
  return h("button", {class: "btn", type: "button", onclick: e => {
    if (Atlas.tray.items.includes(id)) Atlas.tray.remove(id); else Atlas.tray.add(id);
    e.currentTarget.replaceWith(trayBtn(id));
  }}, icon(inTray ? "x" : "plus"), inTray ? "En la bandeja" : "Comparar");
}

/* ---------- «PARECIDAS A ESTA» (buscador de vecinos por parecido, 4 ejes) ---------- */
const EJES = [["funcional", "Funcional"], ["resultado", "Resultado/diana"], ["taxonomica", "Taxonómica"], ["genomica", "Genómica"]];
function pesosVecinos(boost) {
  const base = Atlas.data.meta.pesos_vecinos || {funcional: .35, resultado: .35, taxonomica: .15, genomica: .15};
  if (!boost) return base;
  const w = {funcional: .1, resultado: .1, taxonomica: .1, genomica: .1}; w[boost] = .7; return w;
}
const DATA_AXES = ["funcional", "resultado", "genomica"];
function combinadoVec(ejes, pesos) {
  let num = 0, den = 0;
  for (const k in pesos) { const a = ejes[k]; if (a && a.disponible) { num += pesos[k] * a.score; den += pesos[k]; } }
  let score = den ? num / den : 0;
  // mismo descuento que el motor: parecido de solo-taxonomía = señal débil
  if (!DATA_AXES.some(k => (ejes[k] || {}).disponible)) score *= 0.5;
  return score;
}
function vecinosPanel(id) {
  const vs = D.vecinos(id);
  const body = h("div", {class: "vecinos"});
  if (!vs.length) { body.append(h("p", {class: "muted"}, "Sin vecinos con señal suficiente en los datos cargados.")); return fold("Parecidas a esta", "sin vecinos", body); }
  body.append(h("p", {class: "small muted"}, "Vecinos por parecido en 4 ejes (funcional, resultado/diana, taxonómica y genómica —proxy por genes, no ANI—). Da más peso a un eje para reordenar en vivo. La evidencia lleva su fuente; la inferencia va marcada."));
  const state = {boost: null};
  const sel = h("div", {class: "filters bar vec-weights"});
  const listEl = h("div", {class: "vec-list"});
  const wchip = (key, label) => h("button", {class: "chip", type: "button", "data-boost": key || "equilibrado",
    "aria-pressed": String(state.boost === key), onclick: () => { state.boost = state.boost === key ? null : key; redraw(); }}, label);
  function redraw() {
    sel.innerHTML = "";
    sel.append(h("span", {class: "small vec-sel-lab"}, "Más peso a:"), wchip(null, "Equilibrado"));
    EJES.forEach(([k, l]) => sel.append(wchip(k, l)));
    const pesos = pesosVecinos(state.boost);
    const ranked = vs.map(v => ({v, sc: combinadoVec(v.desglose_por_eje, pesos)}))
      .sort((a, b) => b.sc - a.sc || (a.v.id < b.v.id ? -1 : 1));
    listEl.innerHTML = "";
    ranked.forEach(({v, sc}) => listEl.append(vecCard(v, sc)));
  }
  redraw();
  body.append(sel, listEl);
  return fold("Parecidas a esta", vs.length + " vecinos", body);
}
function vecCard(v, sc) {
  const card = h("div", {class: "vec card" + (v.aviso_tax_no_funcional ? " vec-aviso" : ""), "data-vec": v.id});
  card.append(h("div", {class: "vec-head"},
    h("div", {class: "vec-name"}, h("a", {href: Atlas.route.href(v.tipo === "cepa" ? "cepa" : "especie", v.id)}, name(v.id)),
      v.tipo === "cepa" ? h("span", {class: "tag"}, "cepa") : ""),
    h("div", {class: "vec-score", title: "Parecido combinado (0–100)"}, h("b", {}, String(Math.round(sc * 100))), h("small", {}, "/100"))));
  const badges = h("div", {class: "vec-badges"});
  badges.append(h("span", {class: "chip vec-flag " + (v.es_inferencia_o_evidencia === "evidencia" ? "is-ev" : "is-inf")},
    v.es_inferencia_o_evidencia === "evidencia" ? "con evidencia" : "solo inferencia"));
  if (v.aviso_tax_no_funcional) badges.append(h("span", {class: "chip vec-warn", title: "Parecido taxonómico pero no funcional (la lección K12 vs M18)"}, icon("no"), " taxonómico, NO funcional"));
  card.append(badges);
  const dz = h("div", {class: "vec-axes"});
  EJES.forEach(([k, l]) => dz.append(axisBar(l, v.desglose_por_eje[k] || {}, k)));
  card.append(dz);
  if ((v.rasgos_compartidos || []).length) {
    const rc = h("div", {class: "vec-traits"});
    v.rasgos_compartidos.forEach(r => rc.append(traitChip(r)));
    card.append(h("p", {class: "vec-sub"}, "Comparten"), rc);
  }
  card.append(h("p", {class: "vec-inf"}, h("span", {class: "vec-inf-tag"}, "Inferencia"), " " + v.inferencia_1linea));
  card.append(h("div", {class: "vec-acts"},
    h("a", {class: "btn", href: Atlas.route.href(v.tipo === "cepa" ? "cepa" : "especie", v.id)}, "Ver ficha"),
    trayBtn(v.id)));
  return card;
}
const AXCOL = {funcional: 2, resultado: 1, taxonomica: 4, genomica: 5};
function axisBar(label, a, k) {
  const disp = !!a.disponible, pct = disp ? Math.round(a.score * 100) : 0;
  return h("div", {class: "vec-axis" + (disp ? "" : " off"), title: (a.nota ? a.nota + " · " : "") + (disp ? pct + "/100" : "sin dato comparable en este eje")},
    h("span", {class: "vec-axis-lab"}, label),
    h("span", {class: "track"}, h("span", {class: "fill", "data-l": AXCOL[k], style: "width:" + pct + "%"})),
    h("span", {class: "vec-axis-val"}, disp ? String(pct) : "—"));
}
function traitChip(r) {
  const fuente = r.fuentes && r.fuentes[0];
  const cls = "chip vec-trait " + (r.tipo === "gen" ? "is-gen" : r.diana ? "is-diana" : r.tipo === "mecanismo" ? "is-mec" : "is-res");
  const label = r.tipo === "gen" ? "gen " + r.etiqueta
    : r.tipo === "mecanismo" ? ((D.mecanismo(r.etiqueta) || {}).nombre || r.etiqueta) : r.etiqueta;
  const chip = h("span", {class: cls}, label, r.es_inferencia ? h("i", {class: "vec-inf-dot", title: "inferencia (derivado de genes, no de un ensayo)"}, " ≈") : "");
  if (fuente) return h("span", {class: "vec-trait-wrap"}, chip, U.sourceChip(fuente));
  return chip;
}

/* ---------- LISTA DE ESPECIES ---------- */
Atlas.registerView({route: "especies", tab: "especies", cssClass: "v-especies", render(el, r) {
  const q = r.query || {};
  el.append(h("h1", {}, "Especies"),
    U.readingBox("especies",
      "Encontrar la especie por grupo, estatus regulatorio, línea o nivel de ficha.",
      "Cada fila resume qué hace bien y con qué nivel máximo de evidencia.",
      "Filtra con los chips; toca una fila para abrir la ficha."));
  const all = D.allSpecies();
  const generos = [...new Set(all.map(s => s.genero))].sort();
  const bar = h("div", {class: "filters bar"});
  const chip = (k, val, label) => h("button", {class: "chip", type: "button", "aria-pressed": String(q[k] === val),
    onclick: () => Atlas.route.patch({[k]: q[k] === val ? null : val})}, label);
  bar.append(chip("qps", "si", "Solo QPS"), chip("n", "N2", "Solo dossier (N2)"));
  generos.forEach(g => bar.append(chip("g", g, g)));
  el.append(bar);
  const rows = all.filter(s => {
    if (q.g && s.genero !== q.g) return false;
    if (q.n && s.nivel_ficha !== q.n) return false;
    if (q.qps === "si" && !(s.regulatorio && s.regulatorio.qps && s.regulatorio.qps.estado === "qps")) return false;
    return true;
  }).sort((a, b) => a.nombre_actual.localeCompare(b.nombre_actual));
  const tbl = h("div", {class: "tbl", "data-scroll": true});
  const table = h("table", {}, h("thead", {}, h("tr", {},
    h("th", {class: "stick"}, "Especie"), h("th", {}, "Grupo"), h("th", {}, "QPS"),
    h("th", {}, "Nicho"), h("th", {}, "Mejor nivel"), h("th", {}, "Evidencias"))));
  const tb = h("tbody", {});
  rows.forEach(s => {
    const qps = s.regulatorio && s.regulatorio.qps && s.regulatorio.qps.estado === "qps";
    const best = U.bestLevelOf(s), nev = (s.conteos && s.conteos.n) || (s.evidencias || []).length;
    tb.append(h("tr", {class: "clickrow", onclick: () => Atlas.route.go("especie", s.slug)},
      h("th", {class: "stick", scope: "row"}, h("a", {href: Atlas.route.href("especie", s.slug)}, h("i", {class: "bn"}, s.nombre_actual)),
        s.nivel_ficha === "N2" ? h("span", {class: "tag", style: "margin-left:8px"}, "N2") : ""),
      h("td", {}, s.grupo || "—"),
      h("td", {}, h("span", {class: "qps " + (qps ? "yes" : "nope")}, icon(qps ? "ok" : "minus"), qps ? "QPS" : "No")),
      h("td", {class: "small"}, (s.nicho && s.nicho.corto) || "—"),
      h("td", {}, best ? level(best) : "—"),
      h("td", {}, String(nev))));
  });
  table.append(tb); tbl.append(table); el.append(tbl);
  el.append(h("p", {class: "swipe"}, "Desliza la tabla para ver más columnas →"));
  wireScroll(tbl);
}});

/* ---------- FICHA DE ESPECIE ---------- */
Atlas.registerView({route: "especie", tab: "especies", cssClass: "v-especie", render(el, r) {
  const s = D.species(r.param);
  if (!s) return U.stub(el, "Especie no encontrada: " + r.param, "P2");
  const reg = s.regulatorio || {}, qps = reg.qps || {}, isQps = qps.estado === "qps";
  const sinRe = (s.sinonimos || []).filter(x => x.tipo === "reclasificacion" || x.tipo === "basionimo");
  const cont = s.conteos || {};

  // Cabecera
  el.append(h("header", {class: "sp-head"},
    h("div", {},
      h("h1", {class: "bn"}, s.nombre_actual),
      sinRe.length ? h("p", {class: "formerly"}, "antes: " + sinRe.map(x => x.nombre).join(", ")) : "",
      h("p", {class: "muted small"}, (s.nicho && s.nicho.corto) || "")),
    h("div", {class: "sp-meta"},
      h("span", {class: "qps " + (isQps ? "yes" : "nope")}, icon(isQps ? "ok" : "minus"), isQps ? "QPS" : "No QPS"),
      h("span", {class: "tag"}, "Ficha " + (s.nivel_ficha || "N1")),
      (cont.nulos_en_contra ? h("span", {class: "tag tag-warn"}, "Nulos/en contra: " + cont.nulos_en_contra) : "")),
    h("div", {class: "sp-acts"}, trayBtn(s.slug),
      h("a", {class: "btn pri", href: Atlas.route.href("pregunta", null, {b: s.slug})}, icon("q"), "Preguntar por esta especie"))));

  el.append(U.readingBox("especie",
    "Saber qué hace bien la especie, con qué solidez y para qué producto.",
    "Cada afirmación lleva su mejor nivel y cuántas cepas distintas la sostienen. Cepa no es especie.",
    "Toca una fuente para ver la cita. Las secciones de abajo se pliegan."));

  // Qué hace bien + Utilidad
  const grid = h("div", {class: "sp-good"});
  const good = h("div", {class: "card"}, h("h3", {}, "Qué hace bien"));
  const qbs = s.que_hace_bien || [];
  if (!qbs.length) good.append(h("p", {class: "muted"}, "Sin afirmaciones demostradas por encima del umbral."));
  const ul = h("ul", {class: "claims"});
  qbs.forEach(qb => {
    ul.append(h("li", {},
      h("p", {class: "txt"}, qb.afirmacion),
      h("div", {class: "meta"},
        qb.nivel ? level(qb.nivel) : "",
        h("span", {class: "pips", title: qb.soporte_texto || ""}, pips(qb.cepas_que_sostienen ? qb.cepas_que_sostienen.length : 0),
          " ", qb.soporte_texto || (qb.alcance_mostrado === "especie" ? "nivel especie" : "")),
        U.sources(qb.evidence_ids))));
  });
  good.append(ul); grid.append(good);

  const util = h("div", {class: "card"}, h("h3", {}, "Utilidad para producto"));
  const uul = h("ul", {class: "use-list"});
  (s.utilidad || []).forEach(u => uul.append(h("li", {},
    h("b", {}, U.lineaName(u.linea)), h("span", {}, u.frase + (u.forma ? " (" + u.forma + ")" : "")))));
  if (!(s.utilidad || []).length) uul.append(h("li", {}, h("span", {class: "muted"}, "Sin utilidad de producto establecida.")));
  util.append(uul);
  // Lo demostrado
  util.append(demostrado(cont));
  grid.append(util);
  el.append(grid);

  // Secciones plegables
  const sec = h("div", {class: "sp-sections"});
  sec.append(foldReg(reg));
  sec.append(foldSeg(s.seguridad || {}));
  sec.append(foldTec(s.tecnologia || {}, s.forma_tecnologica_recomendada));
  sec.append(foldPost(s));
  sec.append(foldMercado(s.mercado || {}));
  if ((s.subgrupos || []).length || (s.cepas || []).length) sec.append(foldDentro(s));
  sec.append(vecinosPanel(s.slug));
  sec.append(foldNoDemostrado(s));
  el.append(sec);

  // Tabla de evidencias
  el.append(evidenceTable(s, r.query || {}));
}});

function pips(n) {
  const sp = h("span", {});
  for (let i = 0; i < 5; i++) sp.append(h("i", {class: i < n ? "" : "off"}));
  return sp;
}
function demostrado(cont) {
  const wrap = h("div", {class: "bars"}, h("h3", {style: "font-size:var(--fs-base)"}, "Lo demostrado, por nivel"));
  const byn = {}; Object.entries(cont.por_nivel || {}).forEach(([k, v]) => { const g = genLabel(k); byn[g] = (byn[g] || 0) + v; });
  const max = Math.max(1, ...Object.values(byn));
  const labels = {MA: "Metaanálisis", ECA: "ECA", OBS: "Observacional", ANI: "Animal", CEL: "Gusano / in vitro", GEN: "Genómica"};
  const hb = h("div", {class: "hbars"});
  NIVORD.forEach((code, i) => {
    const n = byn[code] || 0;
    hb.append(h("span", {class: "lab"}, level(code === "GEN" ? "GEN" : code), " " + labels[code]),
      h("span", {class: "track"}, h("span", {class: "fill", "data-l": i + 1, style: `width:${Math.round(n / max * 100)}%`}), h("span", {class: "val"}, String(n))));
  });
  wrap.append(hb);
  const al = cont.por_alcance || {}; const tot = (al.cepa || 0) + (al.especie || 0) + (al.extrapolada || 0) || 1;
  wrap.append(h("p", {class: "small muted", style: "margin-top:12px"}, "Alcance de las evidencias"),
    h("div", {class: "stack"},
      seg(al.cepa, tot, "var(--accent)"), seg(al.especie, tot, "var(--l5)"), seg(al.extrapolada, tot, "repeating-linear-gradient(45deg,var(--l6) 0 4px,var(--surface-2) 4px 8px)")),
    h("div", {class: "legend-row small"},
      lg("●", "Cepa", al.cepa || 0), lg("○", "Especie", al.especie || 0), lg("◌", "Extrapolada", al.extrapolada || 0)));
  return wrap;
}
function seg(n, tot, bg) { n = n || 0; if (!n) return ""; return h("i", {style: `width:${Math.round(n / tot * 100)}%;background:${bg}`}); }
function lg(sym, label, n) { return h("span", {class: "scope"}, sym + " " + label + " " + n); }

function fold(title, sum, body, open) {
  const d = h("details", {class: "fold"}, open ? "" : "");
  if (open) d.setAttribute("open", "");
  d.append(h("summary", {}, h("b", {}, title), h("span", {class: "sum"}, sum || ""), icon("chev")),
    h("div", {class: "fold-body"}, body));
  return d;
}
function sourcesList(ids) { return ids && ids.length ? U.sources(ids) : ""; }

function foldReg(reg) {
  const qps = reg.qps || {}, nf = reg.novel_food || {}, rpf = reg.ruta_por_forma || {};
  const body = h("div", {});
  const kv = h("div", {class: "kvs"});
  kv.append(kvp("QPS", (qps.estado === "qps" ? "Sí" : "No") + (qps.nombre_en_lista ? " · " + qps.nombre_en_lista : "") + (qps.actualizacion ? " · " + qps.actualizacion.fecha : ""), qps.fuentes));
  (qps.calificaciones || []).forEach(c => kv.append(kvp("Calificación", c.texto)));
  kv.append(kvp("Novel Food", nf.detalle || nf.estado || "—", nf.fuentes));
  if (reg.historia_uso) kv.append(kvp("Historia de uso (IDF)", reg.historia_uso.inventario_idf || "—"));
  body.append(kv);
  const formas = ["vivo", "posbiotico", "fermentado"].filter(f => rpf[f]);
  if (formas.length) {
    const t = h("table", {class: "mini-table"}, h("thead", {}, h("tr", {}, h("th", {}, "Forma"), h("th", {}, "Ruta"), h("th", {}, "Detalle"))));
    const tb = h("tbody", {});
    formas.forEach(f => { const x = rpf[f]; tb.append(h("tr", {}, h("td", {}, f), h("td", {}, h("span", {class: "ruta ruta-" + (x.estado || "")}, x.estado || "—")), h("td", {class: "small"}, x.texto || "", " ", sourcesList(x.fuentes)))); });
    t.append(tb); body.append(h("p", {class: "sub"}, "Ruta por forma"), t);
  }
  const sum = (qps.estado === "qps" ? "QPS" : "No QPS") + " · " + (nf.estado ? nf.estado.replace(/_/g, " ") : "Novel Food ?");
  return fold("Regulación", sum, body, true);
}
function foldSeg(seg) {
  const body = h("div", {});
  if (seg.bloqueo) body.append(h("p", {class: "flag flag-bad"}, icon("no"), " Puerta de seguridad: " + seg.bloqueo));
  const amr = seg.amr || [];
  if (amr.length) {
    const t = h("table", {class: "mini-table"}, h("thead", {}, h("tr", {}, h("th", {}, "Gen / fenotipo"), h("th", {}, "Origen"), h("th", {}, "Móvil"), h("th", {}, "Fuerza"), h("th", {}, "Base"))));
    const tb = h("tbody", {});
    amr.forEach(a => tb.append(h("tr", {}, h("td", {}, a.gen_o_fenotipo), h("td", {}, a.origen || "—"),
      h("td", {}, a.movil === true ? "sí" : a.movil === false ? "no" : "?"), h("td", {}, a.fuerza || "—"),
      h("td", {class: "small"}, (a.herramienta || "") + (a.version ? " " + a.version : ""), " ", sourcesList(a.fuentes)))));
    t.append(tb); body.append(h("p", {class: "sub"}, "Resistencia a antimicrobianos"), t);
  }
  const extras = [];
  if ((seg.virulencia || []).length) extras.push("Virulencia: " + seg.virulencia.map(v => v.gen_o_fenotipo || v).join(", "));
  if (seg.hemolisis) extras.push("Hemólisis: " + (seg.hemolisis.resultado || seg.hemolisis));
  if ((seg.aminas_biogenas || []).length) extras.push("Aminas biógenas: " + seg.aminas_biogenas.map(a => a.amina || a.gen_o_fenotipo || a).join(", "));
  if (seg.consideracion_clinica) extras.push("Consideración clínica: " + seg.consideracion_clinica);
  if (seg.consideracion_regulatoria) extras.push("Consideración regulatoria: " + seg.consideracion_regulatoria);
  extras.forEach(x => body.append(h("p", {class: "small"}, x)));
  const rp = seg.riesgo_por_poblacion || [];
  if (rp.length) body.append(h("p", {class: "sub"}, "Riesgo por población"), h("ul", {class: "mini-list"}, rp.map(x => h("li", {}, (x.poblacion || "") + ": " + (x.texto || x)))));
  if (!amr.length && !extras.length) body.append(h("p", {class: "muted"}, "Sin señales de seguridad registradas."));
  const sum = amr.length ? amr[0].gen_o_fenotipo + (amr.length > 1 ? " +" + (amr.length - 1) : "") : "sin señales";
  return fold("Seguridad", sum, body);
}
function foldTec(tec, recom) {
  const body = h("div", {});
  const forma = recom || tec.forma_tecnologica_recomendada;
  if (forma) body.append(h("p", {class: "flag"}, "Forma recomendada: ", h("b", {}, forma)));
  const kv = h("div", {class: "kvs"});
  [["Cultivabilidad", tec.cultivabilidad], ["Medio", tec.medio], ["Aerotolerancia", tec.aerotolerancia],
   ["Esporas", tec.esporas === true ? "sí" : tec.esporas === false ? "no" : null], ["Estabilidad (secado)", tec.estabilidad_secado],
   ["Crecimiento en leche", tec.crecimiento_en_leche], ["Escalado", tec.escalado_industrial], ["Confianza del dato", tec.confianza]]
    .filter(([, v]) => v != null).forEach(([k, v]) => kv.append(kvp(k, String(v).replace(/_/g, " "))));
  body.append(kv);
  const apt = tec.aptitud_por_forma;
  if (apt) body.append(h("p", {class: "small", style: "margin-top:10px"}, "Aptitud por forma: " +
    ["vivo", "posbiotico", "fermentado"].filter(f => apt[f]).map(f => f + " = " + apt[f]).join(" · ")));
  if (tec.nota_cepa_vs_especie) body.append(h("p", {class: "small muted"}, tec.nota_cepa_vs_especie));
  return fold("Tecnología", (forma ? "forma: " + forma + " · " : "") + (tec.aerotolerancia || "").replace(/_/g, " "), body);
}
function foldPost(s) {
  const rows = s.posbiotico || [];
  const body = h("div", {});
  if (!rows.length) { body.append(h("p", {class: "muted"}, "Sin datos de posbiótico.")); return fold("Posbiótico", "sin datos", body); }
  const t = h("table", {class: "mini-table"}, h("thead", {}, h("tr", {}, h("th", {}, "Mecanismo"), h("th", {}, "Forma ensayada"), h("th", {}, "Inactivación"), h("th", {}, "¿Conserva?"), h("th", {}, "Cepa"), h("th", {}, "Fuente"))));
  const tb = h("tbody", {});
  rows.forEach(p => { const m = D.mecanismo(p.mecanismo); tb.append(h("tr", {},
    h("td", {}, m ? m.nombre : p.mecanismo), h("td", {}, p.forma_ensayada || "—"), h("td", {}, p.inactivacion_metodo || "—"),
    h("td", {}, p.se_conserva_inactivado || "?"), h("td", {}, p.cepa ? name(p.cepa) : "—"), h("td", {}, sourcesList(p.evidence_ids)))); });
  t.append(tb); body.append(t);
  return fold("Posbiótico", rows.length + " entradas", body);
}
function foldMercado(mk) {
  const body = h("div", {});
  const prods = mk.productos || [];
  if (prods.length) {
    const t = h("table", {class: "mini-table"}, h("thead", {}, h("tr", {}, h("th", {}, "Producto"), h("th", {}, "Empresa"), h("th", {}, "Cepa"), h("th", {}, "Tipo"))));
    const tb = h("tbody", {});
    prods.forEach(p => tb.append(h("tr", {}, h("td", {}, p.nombre), h("td", {}, p.empresa || "—"), h("td", {}, p.cepa ? name(p.cepa) : "—"), h("td", {}, p.tipo_producto || "—"))));
    t.append(tb); body.append(t);
  }
  if (mk.patentes) body.append(kvbox("Patentes", (mk.patentes.densidad || "—") + (mk.patentes.consulta ? " · " + mk.patentes.consulta : "")));
  if (mk.competencia) body.append(kvbox("Competencia", mk.competencia));
  if (mk.hueco) body.append(kvbox("Hueco", mk.hueco));
  if (!prods.length && !mk.hueco) body.append(h("p", {class: "muted"}, "Sin datos de mercado."));
  return fold("Mercado", (prods.length ? prods.length + " productos" : "sin productos") + (mk.patentes ? " · patentes " + mk.patentes.densidad : ""), body);
}
function foldDentro(s) {
  const body = h("div", {});
  const sgs = (s.subgrupos || []).map(D.subgroup).filter(Boolean);
  if (sgs.length) {
    const g = h("div", {class: "subgroups"});
    sgs.forEach(sg => g.append(h("div", {class: "sg"},
      h("h4", {}, sg.nombre), h("p", {}, sg.rasgo_diferencial || ""),
      (sg.genes_marcadores || []).length ? h("span", {class: "gene"}, sg.genes_marcadores.join(", ")) : "",
      " ", h("span", {class: "small muted"}, "· " + nCepasSub(s, sg.id) + " cepas"))));
    body.append(h("p", {class: "sub"}, "Subgrupos"), g);
  }
  // matriz cepa × resultado
  body.append(strainMatrix(s));
  // anillos (placeholder)
  body.append(h("div", {class: "rings"}, icon("target"),
    h("span", {}, h("b", {}, "Anillos de cepa."), " Exterior: literatura · medio: genomas públicos · interior: tus cepas (no cargadas; confidenciales).")));
  return fold("Dentro de la especie", (sgs.length ? sgs.length + " subgrupos · " : "") + (s.cepas || []).length + " cepas", body);
}
function nCepasSub(s, sgId) { return (s.cepas || []).map(D.strain).filter(c => c && c.subgrupo === sgId).length; }
function strainMatrix(s) {
  const strains = (s.cepas || []).map(D.strain).filter(Boolean);
  // resultados con alguna celda por cepa
  const resSet = [];
  strains.forEach(st => D.lineas(null).forEach(l => (l.resultados || []).forEach(res => {
    if (D.cell(st.id, l.id, res.id)) { const key = l.id + "|" + res.id; if (!resSet.find(x => x.key === key)) resSet.push({key, linea: l.id, res: res.id, nombre: res.nombre_corto || res.nombre}); }
  })));
  if (!resSet.length || !strains.length) return h("p", {class: "small muted"}, "Sin matriz cepa × resultado todavía.");
  const wrap = h("div", {class: "tbl mx", "data-scroll": true});
  const thead = h("thead", {}, h("tr", {}, h("th", {class: "stick"}, "Cepa"), ...resSet.map(r => h("th", {}, r.nombre))));
  const tb = h("tbody", {});
  strains.forEach(st => {
    const tr = h("tr", {}, h("th", {class: "stick", scope: "row"},
      h("a", {href: Atlas.route.href("cepa", st.id)}, h("span", {class: "strain"}, st.nombre_corto || st.designacion,
        h("small", {}, depositLabel(st) + " · " + (st.categoria || ""))))));
    resSet.forEach(r => {
      const c = D.cell(st.id, r.linea, r.res);
      tr.append(h("td", {}, cellBtn(c)));
    });
    tb.append(tr);
  });
  wrap.append(h("table", {}, thead, tb));
  const out = h("div", {}, h("p", {class: "sub"}, "Matriz cepa × resultado"), wrap, h("p", {class: "swipe"}, "Desliza para ver más resultados →"));
  wireScroll(wrap);
  return out;
}
function cellBtn(c) {
  if (!c) return h("span", {class: "cell gap", "aria-label": "sin evidencia"}, "—");
  const neg = c.humano_nulo_o_contra || (c.direcciones && (c.direcciones["-"] || c.direcciones["0"]) && !c.direcciones["+"]);
  if (neg) return h("span", {class: "cell neg"}, icon("minus"), level(c.mejor_nivel));
  return h("span", {class: "cell", "data-l": lvlNum(c.mejor_nivel), title: c.soporte_texto || ""}, level(c.mejor_nivel),
    c.n ? h("span", {class: "n"}, "·" + c.n) : "");
}
function lvlNum(code) { return ({MA: 1, ECA: 2, OBS: 3, ANI: 4, CEL: 5, "GEN-v": 6, "GEN-p": 6, GEN: 6})[code] || 6; }
function depositLabel(st) {
  const d = (st.depositos || [])[0];
  return d ? d.coleccion + " " + d.numero : (st.otros_nombres && st.otros_nombres[0]) || "—";
}
function foldNoDemostrado(s) {
  // evidencias con dirección nula/en contra
  const evs = (s.evidencias || []).map(D.evidence).filter(e => e && (e.direccion === "-" || e.direccion === "0"));
  const body = h("div", {});
  if (!evs.length) { body.append(h("p", {class: "muted"}, "No hay resultados nulos o en contra registrados.")); return fold("Lo que no se demostró", "sin resultados nulos", body); }
  const ul = h("ul", {class: "claims"});
  evs.forEach(e => ul.append(h("li", {}, h("p", {class: "txt"}, e.claim_es),
    h("div", {class: "meta"}, level(e.nivel), U.direction(e.direccion), U.scope(e), U.sources([e.id])))));
  body.append(ul);
  return fold("Lo que no se demostró", evs.length + " resultados nulos o en contra", body);
}

function evidenceTable(s, q) {
  const wrap = h("section", {class: "sp-evidence"}, h("h3", {}, "Evidencias"));
  const evs = (s.evidencias || []).map(D.evidence).filter(Boolean);
  const lineas = [...new Set(evs.map(e => e.linea))];
  const state = {linea: null, nivel: null, alcance: null};
  const filt = h("div", {class: "filters bar"});
  const tblWrap = h("div", {class: "tbl", "data-scroll": true});
  wrap.append(filt, tblWrap);
  function pass(e) {
    if (state.linea && e.linea !== state.linea) return false;
    if (state.nivel === "alto" && !["MA", "ECA", "OBS", "ANI"].includes(e.nivel)) return false;
    if (state.alcance && e.alcance !== state.alcance) return false;
    return true;
  }
  function chip(k, val, label) {
    return h("button", {class: "chip", type: "button", "aria-pressed": String(state[k] === val),
      onclick: () => { state[k] = state[k] === val ? null : val; redraw(); }}, label);
  }
  function redraw() {
    filt.innerHTML = "";
    filt.append(chip("nivel", "alto", "Nivel >= animal"), chip("alcance", "cepa", "Solo cepa"), chip("alcance", "especie", "Solo especie"));
    lineas.forEach(l => filt.append(chip("linea", l, U.lineaName(l))));
    tblWrap.innerHTML = "";
    const rows = evs.filter(pass);
    const table = h("table", {}, h("thead", {}, h("tr", {},
      h("th", {class: "stick"}, "Afirmacion"), h("th", {}, "Nivel"), h("th", {}, "Alcance"), h("th", {}, "Direccion"),
      h("th", {}, "Linea"), h("th", {}, "Forma"), h("th", {}, "Fuente"), h("th", {}, "Estado"))));
    const tb = h("tbody", {});
    rows.forEach(e => {
      const ver = e.verificacion || {};
      tb.append(h("tr", {},
        h("th", {class: "stick", scope: "row", style: "font-weight:400"}, U.truncate(e.claim_es, 90)),
        h("td", {}, level(e.nivel)), h("td", {}, U.scope(e)), h("td", {}, U.direction(e.direccion)),
        h("td", {class: "small"}, U.lineaName(e.linea)), h("td", {}, e.forma || "-"),
        h("td", {}, U.sourceChip(e.id)),
        h("td", {}, h("span", {class: "mark " + (ver.estado === "verificada" ? "ok" : "pend")}, icon(ver.estado === "verificada" ? "ok" : "pend"), ver.estado === "verificada" ? "Verif." : "pend."))));
    });
    if (!rows.length) tb.append(h("tr", {}, h("td", {colspan: 8, class: "muted"}, "Ninguna evidencia con esos filtros.")));
    table.append(tb); tblWrap.append(table);
    wireScroll(tblWrap);
  }
  redraw();
  return wrap;
}

/* ---------- FICHA DE CEPA ---------- */
Atlas.registerView({route: "cepa", tab: "especies", cssClass: "v-cepa", render(el, r) {
  const st = D.strain(r.param);
  if (!st) return U.stub(el, "Cepa no encontrada: " + r.param, "P2");
  const s = D.species(st.especie);
  el.append(h("header", {class: "sp-head"},
    h("div", {},
      h("h1", {}, h("i", {class: "bn"}, s ? s.nombre_corto : ""), " " + (st.designacion || st.nombre_corto)),
      h("p", {class: "muted small"}, (st.categoria || "") + (st.subgrupo ? " · " + (D.subgroup(st.subgrupo)?.nombre || "") : ""))),
    h("div", {class: "sp-acts"}, trayBtn(st.id),
      s ? h("a", {class: "btn", href: Atlas.route.href("especie", s.slug)}, "Ir a la especie") : "")));
  el.append(U.readingBox("cepa",
    "Ver qué está demostrado de esta cepa concreta y su depósito y genoma.",
    "Lo de la cepa no se hereda a la especie ni al revés.",
    "La matriz muestra el mejor nivel por resultado de esta cepa."));
  const kv = h("div", {class: "card kvs"});
  kv.append(kvp("Designación", st.designacion || st.nombre_corto));
  if ((st.otros_nombres || []).length) kv.append(kvp("Otros nombres", st.otros_nombres.join(", ")));
  if ((st.depositos || []).length) kv.append(kvp("Depósitos", st.depositos.map(d => d.coleccion + " " + d.numero).join(" · ")));
  kv.append(kvp("Categoría", st.categoria || "—"));
  kv.append(kvp("Anillo", st.anillo || "—"));
  if (st.genoma) kv.append(kvp("Genoma", (st.genoma.accesion || "—") + (st.genoma.nivel_ensamblado ? " · " + st.genoma.nivel_ensamblado : "")));
  if (st.origen) kv.append(kvp("Origen", st.origen));
  if (st.titular) kv.append(kvp("Titular", st.titular));
  el.append(kv);
  // evidencias de la cepa
  const evs = D.evidenceOf(st.id);
  el.append(h("h3", {}, "Lo demostrado de la cepa"));
  if (!evs.length) el.append(h("p", {class: "muted"}, "Sin evidencia propia de cepa cargada."));
  const ul = h("ul", {class: "claims card"});
  evs.forEach(e => ul.append(h("li", {}, h("p", {class: "txt"}, e.claim_es),
    h("div", {class: "meta"}, level(e.nivel), U.direction(e.direccion), h("span", {class: "small"}, U.lineaName(e.linea)), U.sources([e.id])))));
  if (evs.length) el.append(ul);
  el.append(h("div", {class: "sp-sections"}, vecinosPanel(st.id)));
}});

/* ---------- utilidades compartidas del paquete ---------- */
function kvp(k, v, fuentes) { return h("div", {class: "kv"}, h("small", {}, k), h("span", {}, v, " ", sourcesList(fuentes))); }
function kvbox(k, v) { return h("div", {class: "kvbox"}, h("b", {}, k + ". "), v); }
function wireScroll(tbl) { tbl.addEventListener("scroll", () => tbl.classList.toggle("scrolled", tbl.scrollLeft > 2), {passive: true}); }
})();

})();
