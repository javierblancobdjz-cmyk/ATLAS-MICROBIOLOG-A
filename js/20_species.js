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

/* ---------- «PARECIDAS A ESTA» (P1-06) ----------
   E1 calcula orden y ejes (vecinos_v12.py: 3 ejes, denominador = suma de todos los pesos, eje resultado solo con líneas de
   producto, genómica fuera del score). Aquí solo se pinta: sin número /100, sin botones de peso, sin barras. Tarjeta =
   nombre · «k/3 ejes con dato» · etiqueta · línea de ejes · chips de lo compartido con su fuente · frase (si E1 la da).
   Las que solo se parecen por taxonomía van en una lista compacta debajo (misma etiqueta, sin frase). El ANI va en Genoma. */
const EJES = [["funcional", "funcional"], ["resultado", "resultado"], ["taxonomica", "taxonomía"]];
const PIV = (lin, res, de) => Atlas.route.href("lineas", lin, {res, s: de});
const PIVQ = (k, v, de) => Atlas.route.href("lineas", null, {[k]: v, s: de});
const soloTax = v => (v.etiqueta || "").startsWith("solo") || (!v.frase && !(v.rasgos_compartidos || []).length);
const ordenVec = vs => [...vs].sort((a, b) => (a.orden ?? 1e9) - (b.orden ?? 1e9) || (b.score_combinado || 0) - (a.score_combinado || 0));
function vecinosPanel(id) {
  const vs = D.vecinos(id);
  if (!vs.length) return null;   // plegable vacío → no se pinta
  const ranked = ordenVec(vs);
  const fun = ranked.filter(v => !soloTax(v)), tax = ranked.filter(soloTax);
  const body = h("div", {class: "vecinos"});
  body.append(h("p", {class: "small muted"}, "Ordenadas por parecido en 3 ejes: funcional (mecanismo o rasgo con base causal u observada), resultado de producto y taxonomía. Un eje sin dato cuenta 0. Parecerse por taxonomía no transporta la actividad; el parentesco genómico (ANI) está en el bloque Genoma."));
  if (!fun.length) {
    const outs = outputsDe(id).filter(o => (D.linea(o.lin) || {}).tipo === "producto");
    body.append(h("div", {class: "flag flag-warn vec-none"}, icon("no"),
      h("span", {}, "Ninguna de estas " + vs.length + " comparte un mecanismo o un resultado con esta ficha: solo se parecen por taxonomía.",
        outs.length ? h("span", {}, " Para ver quién consigue lo mismo: ", ...outs.slice(0, 3).flatMap((o, i) => [i ? " · " : "", h("a", {href: PIV(o.lin, o.res, id)}, o.nombre + " →")])) : "")));
  } else {
    const listEl = h("div", {class: "vec-list"});
    fun.forEach(v => listEl.append(vecCard(v)));
    body.append(listEl);
  }
  if (tax.length) body.append(h("div", {class: "vec-tax"},
    h("p", {class: "sub"}, "Solo parecido taxonómico (" + tax.length + ")"),
    h("ul", {class: "vec-tax-list"}, tax.map(v => h("li", {"data-vec": v.id},
      h("a", {href: Atlas.route.href(v.tipo === "cepa" ? "cepa" : "especie", v.id)}, name(v.id)),
      h("span", {class: "chip vec-flag vec-warn"}, "solo parecido taxonómico"),
      h("span", {class: "small muted"}, kEjes(v) + "/3 ejes con dato · " + ejesLinea(v)))))));
  return fold("Parecidas a esta", vs.length + " · " + fun.length + " comparten mecanismo o resultado", body);
}
const kEjes = v => v.ejes_con_dato != null ? v.ejes_con_dato : EJES.filter(([x]) => ((v.desglose_por_eje || {})[x] || {}).disponible).length;
const ejesLinea = v => EJES.map(([x, l]) => { const a = (v.desglose_por_eje || {})[x] || {};
  return l + (a.disponible ? (a.nota ? " (" + a.nota + ")" : " ✓") : " sin dato"); }).join(" · ");
function vecCard(v) {
  const card = h("article", {class: "vec card", "data-vec": v.id});
  card.append(h("div", {class: "vec-head"},
    h("div", {class: "vec-name"}, h("a", {href: Atlas.route.href(v.tipo === "cepa" ? "cepa" : "especie", v.id)}, name(v.id)),
      v.tipo === "cepa" ? h("span", {class: "tag"}, "cepa") : ""),
    h("div", {class: "vec-score", title: "Ejes con dato comparable"}, h("small", {}, kEjes(v) + "/3 ejes con dato"))));
  card.append(h("div", {class: "vec-badges"},
    h("span", {class: "chip vec-flag is-ev"}, v.etiqueta || "comparten algo"),
    h("span", {class: "small muted vec-axes-line"}, ejesLinea(v))));
  if ((v.rasgos_compartidos || []).length) {
    const rc = h("ul", {class: "vec-traits"});
    v.rasgos_compartidos.forEach(r => rc.append(traitChip(r)));
    card.append(rc);
  }
  if (v.frase) card.append(h("p", {class: "vec-inf"}, v.frase));
  return card;
}
/** Resultados (línea|resultado) con evidencia a favor del sujeto, para enlazar al pivote */
function outputsDe(id) {
  const m = new Map();
  D.evidenceOf(id).filter(e => e.tipo !== "contexto" && e.linea && (e.direccion === "+" || e.direccion === "mixto") && e.relacion !== "asociacion").forEach(e => {
    const k = e.linea + "|" + e.resultado; if (m.has(k)) return;
    const r = D.resultado(e.linea, e.resultado); m.set(k, {k, lin: e.linea, res: e.resultado, nombre: r ? r.nombre_corto || r.nombre : String(e.resultado).replace(/_/g, " ")});
  });
  return [...m.values()];
}
const TIPO_RASGO = {mecanismo: "mecanismo", resultado: "resultado", rasgo: "output", gen: "gen"};
function traitChip(r) {
  const VR = (D.raw.catalogo.vocabulario_rasgos || {rasgos: {}}).rasgos;
  const cls = "chip vec-trait " + (r.tipo === "gen" ? "is-gen" : r.diana ? "is-diana" : r.tipo === "mecanismo" ? "is-mec" : r.tipo === "rasgo" ? "is-out" : "is-res");
  const label = r.tipo === "rasgo" ? ((VR[r.id] || {}).etiqueta || String(r.etiqueta || r.id).replace(/_/g, " "))
    : r.tipo === "gen" ? r.etiqueta : String(r.etiqueta || r.id).replace(/_/g, " ");
  const f1 = (r.fuentes || [])[0], f2 = (r.fuentes_vecino || [])[0];
  return h("li", {class: "vec-trait-wrap"}, h("span", {class: cls}, h("small", {}, (TIPO_RASGO[r.tipo] || "") + " "), label),
    f1 ? h("span", {class: "vec-src"}, h("small", {class: "muted"}, "aquí"), U.sourceChip(f1)) : "",
    f2 ? h("span", {class: "vec-src"}, h("small", {class: "muted"}, "allí"), U.sourceChip(f2)) : "");
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
      h("td", {}, String(s.grupo || "—").replace(/_/g, " ")),
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
    h("div", {class: "sp-acts"}, trayBtn(s.slug))));

  el.append(U.readingBox("especie",
    "Saber qué hace bien la especie, con qué solidez y para qué producto.",
    "Cada afirmación lleva su mejor nivel y cuántas cepas distintas la sostienen. Cepa no es especie.",
    "Toca una fuente para ver la cita. Las secciones de abajo se pliegan."));

  // E7: tira de formas arriba (responde «qué puedo vender y en qué forma» sin scroll), luego Qué hace bien + Cómo lo hace
  el.append(formaStrip(s.slug, s));
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
        U.sources(qb.evidence_ids),
        qb.linea && qb.resultado ? h("a", {class: "who-more", href: PIV(qb.linea, qb.resultado, s.slug)}, "Quién más →") : "")));
  });
  good.append(ul); grid.append(good);
  grid.append(comoLoHace(s.slug, s));
  el.append(grid);
  const grid2 = h("div", {class: "sp-good"});

  const util = h("div", {class: "card"}, h("h3", {}, "Utilidad para producto"));
  const uul = h("ul", {class: "use-list"});
  (s.utilidad || []).forEach(u => uul.append(h("li", {},
    h("b", {}, U.lineaName(u.linea)), h("span", {}, u.frase + (u.forma ? " (" + u.forma + ")" : "")))));
  if (!(s.utilidad || []).length) uul.append(h("li", {}, h("span", {class: "muted"}, "Sin utilidad de producto establecida.")));
  util.append(uul);
  // Lo demostrado
  util.append(demostrado(cont));
  grid2.append(util);
  el.append(grid2);

  // Secciones plegables
  const sec = h("div", {class: "sp-sections"});
  // E7: los plegables sin contenido no se pintan (Mercado, Posbiótico, Tecnología vacíos; Parecidas sin vecinos)
  [foldReg(reg), foldSeg(s.seguridad || {}, s), foldGenomaEspecie(s), foldTec(s.tecnologia || {}), foldPost(s), foldMercado(s.mercado || {}),
   ((s.subgrupos || []).length || (s.cepas || []).length) ? foldDentro(s) : null, vecinosPanel(s.slug), foldNoDemostrado(s)]
    .filter(Boolean).forEach(f => sec.append(f));
  el.append(sec);

  // E7 r2: tabla de evidencias plegada (cada afirmación ya está a un toque desde «Qué hace bien», «Cómo lo hace» y el pivote)
  const et = evidenceTable(s, r.query || {});
  el.append(h("div", {class: "sp-sections"}, fold("Todas las evidencias", (s.evidencias || []).length + " · tabla filtrable", et)));
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
  const formas = [];   // E7: ruta por forma → tira de formas bajo «Qué hace bien»
  if (formas.length) {
    const t = h("table", {class: "mini-table"}, h("thead", {}, h("tr", {}, h("th", {}, "Forma"), h("th", {}, "Ruta"), h("th", {}, "Detalle"))));
    const tb = h("tbody", {});
    formas.forEach(f => { const x = rpf[f]; tb.append(h("tr", {}, h("td", {}, f), h("td", {}, h("span", {class: "ruta ruta-" + (x.estado || "")}, x.estado || "—")), h("td", {class: "small"}, x.texto || "", " ", sourcesList(x.fuentes)))); });
    t.append(tb); body.append(h("p", {class: "sub"}, "Ruta por forma"), t);
  }
  const sum = (qps.estado === "qps" ? "QPS" : "No QPS") + " · " + (nf.estado ? nf.estado.replace(/_/g, " ") : "Novel Food ?");
  return fold("Regulación", sum, body, false);
}
/* Seguridad de especie (E6). El estado sale de puerta_cepa.json (regla S del script, no de la vista):
   a revisar si la curación lo marca, si EFSA la deja fuera de QPS o si hay virulencia registrada; si no, «sin bloqueo
   registrado», que NO es «cepa medida y limpia». El resumen nunca dice «sin señales» si el cuerpo tiene señales. */
function foldSeg(seg, s) {
  const body = h("div", {});
  const st = D.segEspecie(s.slug) || {estado: "desconocida", motivos: []};
  body.append(h("div", {class: "gates"}, U.gatePill("seguridad", "Seguridad de especie", st.estado)),
    h("p", {class: "k6-note"}, st.motivos.length ? "Motivo: " + st.motivos.join(" · ") + "." :
      "Sin bloqueo registrado en la curación de especie. No equivale a «cepa medida y limpia»: eso está en la ficha de cada cepa."));
  const vir = seg.virulencia || [];
  if (vir.length) body.append(h("p", {class: "sub"}, "Virulencia"), h("ul", {class: "mini-list"}, vir.map(v => h("li", {},
    (v.factor || v.gen_o_fenotipo || "") + (v.fuerza ? " · fuerza " + v.fuerza : "") + (v.base ? " · base: " + v.base : ""),
    v.nota ? h("div", {class: "small muted"}, v.nota) : "", " ", sourcesList(v.fuentes)))));
  const amr = seg.amr || [];
  const adq = amr.filter(a => a.origen === "adquirida"), intr = amr.filter(a => a.origen === "intrinseca");
  if (amr.length) {
    const t = h("table", {class: "mini-table"}, h("thead", {}, h("tr", {}, h("th", {}, "Gen / fenotipo"), h("th", {}, "Origen"), h("th", {}, "Móvil"), h("th", {}, "Fuerza"), h("th", {}, "Base"))));
    const tb = h("tbody", {});
    amr.forEach(a => tb.append(h("tr", {}, h("td", {}, a.gen_o_fenotipo), h("td", {}, a.origen || "—"),
      h("td", {}, a.movil === true ? "sí" : a.movil === false ? "no" : "?"), h("td", {}, a.fuerza || "—"),
      h("td", {class: "small"}, (a.herramienta || "") + (a.version ? " " + a.version : ""), " ", sourcesList(a.fuentes)))));
    t.append(tb); body.append(h("p", {class: "sub"}, "Resistencia a antimicrobianos (literatura, nivel especie)"), t);
  }
  // n/N medido en genomas públicos (genomica.json de E2, agregado por scripts/build_puerta_cepa.py)
  const ag = D.agregadosSeg(s.slug);
  if (ag.length) body.append(h("p", {class: "sub"}, "En genomas públicos (ABRicate 1.4.0)"),
    h("ul", {class: "mini-list"}, ag.map(x => h("li", {},
      h("b", {}, x.amr + "/" + x.N), " con AMR adquirida (ResFinder)" + (ag.length > 1 ? " · " + x.taxon : ""),
      Object.keys(x.genes_amr).length ? h("span", {class: "k6-genes"}, " · " + Object.entries(x.genes_amr).map(([g, n]) => g + " " + n).join(", ")) : "",
      x.colocalizados ? h("span", {class: "small"}, " · en " + x.colocalizados + " el gen comparte contig con un replicón de plásmido") : "",
      h("span", {class: "small muted"}, " · replicón de plásmido " + x.plasmido + "/" + x.N + " · VFDB " + x.vfdb + "/" + x.N)))),
    h("p", {class: "k6-note"}, "Resistencias intrínsecas de CARD (ileS, rpoB, lmrD) no cuentan como adquiridas. VFDB sin hits no certifica seguridad."));
  else body.append(h("p", {class: "k6-note"}, s.tipo_organismo === "levadura" ? "ResFinder, VFDB y PlasmidFinder no aplican a una levadura."
    : "Genomas públicos de esta especie con ABRicate: ninguno cargado (no medido)."));
  const extras = [];
  const hem = seg.hemolisis && (seg.hemolisis.estado || seg.hemolisis.resultado);
  if (hem && hem !== "desconocido") extras.push("Hemólisis: " + hem);
  if ((seg.aminas_biogenas || []).length) extras.push("Aminas biógenas: " + seg.aminas_biogenas.map(a => a.amina || a.gen_o_fenotipo || a.factor || "").join(", "));
  if (seg.consideracion_clinica) extras.push("Consideración clínica: " + seg.consideracion_clinica);
  if (seg.consideracion_regulatoria) extras.push("Consideración regulatoria: " + seg.consideracion_regulatoria);
  extras.forEach(x => body.append(h("p", {class: "small"}, x)));
  const rp = seg.riesgo_por_poblacion || [];
  if (rp.length) body.append(h("p", {class: "sub"}, "Riesgo por población"), h("ul", {class: "mini-list"}, rp.map(x => h("li", {}, (x.poblacion || "").replace(/_/g, " ") + ": " + (x.texto || x)))));
  const parts = [];
  if (st.estado === "a_revisar") parts.push("a revisar");
  if (st.fuera_qps) parts.push("fuera de QPS");
  if (vir.length) parts.push("virulencia " + vir.length);
  if (adq.length) parts.push("AMR adquirida " + adq.length);
  if (ag.length) parts.push("genomas: AMR " + ag.map(x => x.amr + "/" + x.N).join(" + "));
  if (!parts.length) parts.push(intr.length ? "solo AMR intrínseca" : "sin bloqueo registrado");
  return fold("Seguridad", parts.join(" · "), body);
}
function foldTec(tec) {
  const body = h("div", {});
  const kv = h("div", {class: "kvs"});
  const NADA = v => v == null || /^(desconocid[oa]|sin[_ ]datos?)$/.test(String(v));
  const filas = [["Cultivabilidad", tec.cultivabilidad], ["Medio", tec.medio], ["Aerotolerancia", tec.aerotolerancia],
   ["Esporas", tec.esporas === true ? "sí" : tec.esporas === false ? "no" : null], ["Estabilidad (secado)", tec.estabilidad_secado],
   ["Crecimiento en leche", tec.crecimiento_en_leche], ["Escalado", tec.escalado_industrial], ["Confianza del dato", tec.confianza]]
    .filter(([, v]) => !NADA(v));
  if (!filas.filter(([k]) => k !== "Confianza del dato").length) return null;
  filas.forEach(([k, v]) => kv.append(kvp(k, String(v).replace(/_/g, " "))));
  body.append(kv);
  const apt = tec.aptitud_por_forma;
  if (apt) body.append(h("p", {class: "small", style: "margin-top:10px"}, "Aptitud por forma (criterio de especie): " +
    ["vivo", "posbiotico", "fermentado"].filter(f => apt[f]).map(f => U.formaLabel(f) + " = " + apt[f]).join(" · ")));
  if (tec.nota_cepa_vs_especie) body.append(h("p", {class: "small muted"}, tec.nota_cepa_vs_especie));
  return fold("Tecnología", (tec.aerotolerancia || "").replace(/_/g, " "), body);
}
function foldPost(s) {
  const rows = s.posbiotico || [];
  const body = h("div", {});
  if (!rows.length) return null;
  const t = h("table", {class: "mini-table"}, h("thead", {}, h("tr", {}, h("th", {}, "Mecanismo"), h("th", {}, "Forma ensayada"), h("th", {}, "Inactivación"), h("th", {}, "¿Conserva?"), h("th", {}, "Cepa"), h("th", {}, "Fuente"))));
  const tb = h("tbody", {});
  rows.forEach(p => { const m = D.mecanismo(p.mecanismo); tb.append(h("tr", {},
    h("td", {}, m ? m.nombre : p.mecanismo), h("td", {}, p.forma_ensayada || "—"), h("td", {}, p.inactivacion_metodo || "—"),
    h("td", {}, String(p.se_conserva_inactivado || "?").replace(/_/g, " ")), h("td", {}, p.cepa ? name(p.cepa) : "—"), h("td", {}, sourcesList(p.evidence_ids)))); });
  t.append(tb); body.append(h("div", {class: "tbl-x"}, t));
  return fold("Posbiótico", rows.length + " entradas", body);
}
function foldMercado(mk) {
  const body = h("div", {});
  const prods = mk.productos || [];
  if (prods.length) {
    const t = h("table", {class: "mini-table"}, h("thead", {}, h("tr", {}, h("th", {}, "Producto"), h("th", {}, "Empresa"), h("th", {}, "Cepa"), h("th", {}, "Tipo"))));
    const tb = h("tbody", {});
    prods.forEach(p => tb.append(h("tr", {}, h("td", {}, p.nombre), h("td", {}, p.empresa || "—"), h("td", {}, p.cepa ? name(p.cepa) : "—"), h("td", {}, String(p.tipo_producto || "—").replace(/_/g, " ")))));
    t.append(tb); body.append(h("div", {class: "tbl-x"}, t));
  }
  if (mk.patentes) body.append(kvbox("Patentes", (mk.patentes.densidad || "—") + (mk.patentes.consulta ? " · " + mk.patentes.consulta : "")));
  if (mk.competencia) body.append(kvbox("Competencia", mk.competencia));
  if (mk.hueco) body.append(kvbox("Hueco", mk.hueco));
  if (!prods.length && !mk.hueco && !mk.competencia) return null;
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
  const evs = (s.evidencias || []).map(D.evidence).filter(e => e && e.tipo !== "contexto" && (e.direccion === "-" || e.direccion === "0"));
  const body = h("div", {});
  if (!evs.length) return null;   // plegable vacío → no se pinta
  const ul = h("ul", {class: "claims"});
  evs.forEach(e => ul.append(h("li", {}, h("p", {class: "txt"}, e.claim_es),
    h("div", {class: "meta"}, level(e.nivel), U.direction(e.direccion), U.scope(e), U.sources([e.id])))));
  body.append(ul);
  return fold("Lo que no se demostró", evs.length + " resultados nulos o en contra", body);
}

function evidenceTable(s, q) {
  const wrap = h("section", {class: "sp-evidence"});
  const evs = (s.evidencias || []).map(D.evidence).filter(Boolean);
  const lineas = [...new Set(evs.map(e => e.linea))].filter(Boolean);
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
    filt.append(chip("nivel", "alto", "Nivel ≥ animal"), chip("alcance", "cepa", "Solo cepa"), chip("alcance", "especie", "Solo especie"));
    lineas.forEach(l => filt.append(chip("linea", l, U.lineaName(l))));
    tblWrap.innerHTML = "";
    const rows = evs.filter(pass);
    const table = h("table", {}, h("thead", {}, h("tr", {},
      h("th", {class: "stick"}, "Afirmación"), h("th", {}, "Nivel"), h("th", {}, "Alcance"), h("th", {}, "Dirección"),
      h("th", {}, "Línea"), h("th", {}, "Forma"), h("th", {}, "Fuente"), h("th", {}, "Estado"))));
    const tb = h("tbody", {});
    rows.forEach(e => {
      const ver = e.verificacion || {};
      tb.append(h("tr", {},
        h("th", {class: "stick", scope: "row", style: "font-weight:400"}, U.truncate(e.claim_es, 90)),
        h("td", {}, e.tipo === "contexto" ? h("span", {class: "tag"}, "contexto") : level(e.nivel)), h("td", {}, scopeTag(e)),
        h("td", {}, e.direccion ? U.direction(e.direccion) : "—", e.relacion === "asociacion" ? h("span", {class: "tag tag-asoc"}, "asociación") : ""),
        h("td", {class: "small"}, e.linea ? U.lineaName(e.linea) : "contexto (sin línea)"), h("td", {}, formaTxt(e.forma)),
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

/* ---------- FICHA DE CEPA (P1-04) ----------
   Pantalla 1: tira «¿En qué forma?» con la puerta de cepa · «Quién más consigue lo mismo» · «Cómo lo hace» (+ «¿Dónde está
   la clave?») · «Qué produce y por qué vía» · «Lo demostrado» agrupado por resultado. Plegados y cerrados: Genoma (P1-05),
   Ficha técnica y Parecidas (P1-06). Los registros de contexto (sin línea ni resultado) no son evidencia de la cepa. */
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
    "Ver qué está demostrado de esta cepa concreta, en qué forma se puede vender y qué lleva en el genoma.",
    "Lo de la cepa no se hereda a la especie ni al revés. Una mezcla de cepas no cuenta para ninguna de ellas.",
    "Toca una forma para ver su puerta y el veredicto por línea; toca una fuente para ver la cita."));
  const kv = h("div", {class: "kvs"});
  kv.append(kvp("Designación", st.designacion || st.nombre_corto));
  if ((st.otros_nombres || []).length) kv.append(kvp("Otros nombres", st.otros_nombres.join(", ")));
  if ((st.depositos || []).length) kv.append(kvp("Depósitos", st.depositos.map(d => d.coleccion + " " + d.numero).join(" · ")));
  kv.append(kvp("Categoría", st.categoria || "—"));
  kv.append(kvp("Anillo", String(st.anillo || "—").replace(/_/g, " ")));
  { const vk = Atlas.genoma ? Atlas.genoma.vinculo(st) : {acc: st.genoma && st.genoma.accesion}, ac = vk.acc;
    kv.append(h("div", {class: "kv"}, h("small", {}, "Genoma"), h("span", {},
      ac && /^GC[AF]_/.test(ac) ? h("a", {href: "https://www.ncbi.nlm.nih.gov/datasets/genome/" + ac + "/", target: "_blank", rel: "noopener"}, ac)
        : U.gatePill("genoma", null, "NM", "no medido · sin accesión en el atlas"),
      vk.porNombre ? h("span", {class: "gn-pill gn-warn"}, vk.texto || "vinculada por nombre: verificar") : "",
      ac && st.genoma && st.genoma.nivel_ensamblado ? " · " + st.genoma.nivel_ensamblado : ""))); }
  if (st.origen) kv.append(kvp("Origen", st.origen));
  if (st.titular) kv.append(kvp("Titular", st.titular));
  const evs = D.evidenceOf(st.id).filter(e => e.tipo !== "contexto");
  el.append(formaStrip(st.id, s));
  // enlace inverso cepa → «quién más consigue esto» (uno por resultado de producto con evidencia a favor)
  const outs = outputsDe(st.id).filter(o => (D.linea(o.lin) || {}).tipo === "producto");
  if (outs.length) el.append(h("p", {class: "who-row"}, h("b", {}, "Quién más consigue lo mismo: "),
    ...outs.flatMap((o, i) => [i ? " · " : "", h("a", {class: "who-more", href: PIV(o.lin, o.res, st.id)}, o.nombre + " →")])));
  if (evs.length) { const g2 = h("div", {class: "sp-good"}); g2.append(comoLoHace(st.id, s)); el.append(g2); }
  el.append(demostradoCepa(st.id, evs));
  const sec = h("div", {class: "sp-sections"});
  [foldGenoma(st), fold("Ficha técnica", [(st.depositos || []).map(d => d.coleccion + " " + d.numero).join(" · "), st.categoria].filter(Boolean).join(" · "), kv),
   vecinosPanel(st.id)].filter(Boolean).forEach(f => sec.append(f));
  el.append(sec);
}});

/* ---------- utilidades de evidencia (mezcla, asociación, forma, mecanismo) ---------- */
const FORMA_TXT = {vivo: "vivo", inactivado: "inactivado", componente: "componente", fermentado: "fermentado", metabolito: "metabolito aislado"};
const formaTxt = f => f ? (FORMA_TXT[f] || String(f).replace(/_/g, " ")) : "forma no declarada";
const esMezcla = e => e.alcance === "mezcla";
const esAsoc = e => e.relacion === "asociacion";
function scopeTag(e) {
  if (esMezcla(e)) return h("span", {class: "tag tag-mezcla"}, e.etiqueta_mezcla || "mezcla de cepas");
  return U.scope(e);
}
const BASE_CORTA = {causal: "fenómeno demostrado (mutante o bloqueo)", observado: "fenómeno observado", inferencia: "inferido por los autores", prediccion_genomica: "predicción genómica"};
const claseCorta = c => U.claseLabel(c).split(" (")[0];
/** Línea legible del mecanismo de una evidencia: «Exclusión del patógeno · fenómeno observado · determinante desconocido · funciona inactivada».
    Vive en 00_core (Atlas.ui.mechLine) para que el panel de cita pinte exactamente la misma línea. */
const mechLine = e => U.mechLine(e);

/* «Lo demostrado de la cepa» agrupado por resultado: una fila por resultado (mejor nivel, n, formas, dirección) y las
   afirmaciones dentro con su línea de mecanismo. La mezcla se rotula («en mezcla con …») y no cuenta como logro de la cepa;
   la asociación se rotula y no suma dirección. Nada se oculta: un toque abre las citas. */
function demostradoCepa(id, evs) {
  const wrap = h("section", {class: "ld"}, h("h3", {}, "Lo demostrado de la cepa (" + evs.length + ")"));
  if (!evs.length) { wrap.append(h("p", {class: "muted"}, "Sin evidencia propia de cepa cargada.")); return wrap; }
  const by = new Map();
  evs.forEach(e => { const k = (e.linea || "") + "|" + (e.resultado || ""); if (!by.has(k)) by.set(k, []); by.get(k).push(e); });
  const DIR = {"+": "a favor", "0": "sin efecto", "-": "en contra", mixto: "mixto"};
  const prodFirst = k => (D.linea(k.split("|")[0]) || {}).tipo === "producto" ? 0 : 1;
  const rank = E => Math.min(...E.map(e => NIVORD.indexOf(genLabel(e.nivel))));
  [...by.entries()].sort((a, b) => prodFirst(a[0]) - prodFirst(b[0]) || rank(a[1]) - rank(b[1]))
    .forEach(([k, E]) => {
      const [lin, res] = k.split("|"), R = D.resultado(lin, res);
      const best = E.reduce((b, e) => NIVORD.indexOf(genLabel(e.nivel)) < NIVORD.indexOf(genLabel(b)) ? e.nivel : b, E[0].nivel);
      const cnt = {}; E.forEach(e => { const x = esMezcla(e) ? "en mezcla" : esAsoc(e) ? "asociación" : DIR[e.direccion] || "sin dirección"; cnt[x] = (cnt[x] || 0) + 1; });
      const formas = [...new Set(E.map(e => formaTxt(e.forma)))].join(", ");
      const d = h("details", {class: "ld-g"}, h("summary", {},
        h("b", {}, R ? R.nombre_corto || R.nombre : String(res || "sin resultado").replace(/_/g, " ")), level(best),
        h("span", {class: "small muted"}, Object.entries(cnt).map(([x, n]) => n + " " + x).join(" · ") + " · " + formas), icon("chev")),
        h("ul", {class: "claims"}, E.map(e => h("li", {}, h("p", {class: "txt"}, e.claim_es),
          h("div", {class: "meta"}, level(e.nivel), e.direccion ? U.direction(e.direccion) : "", h("span", {class: "tag"}, formaTxt(e.forma)),
            esMezcla(e) ? scopeTag(e) : "", esAsoc(e) ? h("span", {class: "tag tag-asoc", title: "asociación: se observa, no se interviene; no cuenta como efecto"}, "asociación") : "",
            U.sources([e.id])),
          mechLine(e)))));
      wrap.append(d);
    });
  return wrap;
}

/* ---------- «CÓMO LO HACE» (P1-02): una línea por clase de mecanismo ----------
   Sale del campo `mecanismo` de cada evidencia a favor (v1.2). No infiere nada nuevo: base, determinante y «¿funciona muerta?»
   (Atlas.pivot.muerta, misma regla que Python) por clase. Sin repetir el pivote: un enlace «Quién más →» por clase.
   Si la ficha toca un mecanismo del catálogo con candidatos (hoy M35), tarjeta plegable «¿Dónde está la clave?». */
const FAV = d => d === "+" || d === "mixto";
const BASE_ORD = ["causal", "observado", "inferencia", "prediccion_genomica"];
function comoLoHace(subj, sp) {
  const esCepa = D.resolve(subj).tipo === "cepa";
  const card = h("div", {class: "card how-card"}, h("h3", {}, "Cómo lo hace"));
  const evs = D.evidenceOf(subj).filter(e => e.tipo !== "contexto" && FAV(e.direccion) && !esAsoc(e) && !(esCepa && esMezcla(e)));
  const P = Atlas.pivot;
  if (!evs.some(e => e.mecanismo)) {
    card.append(h("p", {class: "muted small"}, "Mecanismo no curado en esta versión de los datos."));
  } else {
    const g = new Map(); let desc = 0;
    evs.forEach(e => {
      const cl = ((e.mecanismo || {}).clases || []).filter(c => c !== "no_aplica" && c !== "desconocido");
      if (!cl.length) { desc++; return; }
      cl.forEach(c => {
        if (!g.has(c)) g.set(c, {c, evs: [], genes: new Set(), cepas: new Set()});
        const x = g.get(c); x.evs.push(e); (e.mecanismo.genes || []).forEach(z => x.genes.add(z));
        if (e.cepa) x.cepas.add(e.cepa);
      });
    });
    const ul = h("ul", {class: "how-lines"});
    [...g.values()].sort((a, b) => b.evs.length - a.evs.length).forEach(x => {
      const best = x.evs.reduce((b, e) => (NIVORD.indexOf(genLabel(e.nivel)) < NIVORD.indexOf(genLabel(b)) ? e.nivel : b), x.evs[0].nivel);
      const bases = x.evs.map(e => e.mecanismo.base).filter(b => BASE_ORD.includes(b)).sort((a, b) => BASE_ORD.indexOf(a) - BASE_ORD.indexOf(b));
      const ident = x.evs.some(e => e.mecanismo.determinante === "identificado");
      const mu = P && P.muerta ? P.muerta(x.evs) : {k: "np"};
      const fam = (P && P.famOf && P.famOf(x.c)) || "unk";
      ul.append(h("li", {class: "how-l how-fam-" + fam + (ident ? "" : " how-det"), title: (P && P.FAM && P.FAM[fam] || {}).etq || "sin familia"},
        h("b", {}, claseCorta(x.c)),
        x.genes.size ? h("span", {class: "genes-in"}, ...[...x.genes].flatMap((z, i) => [i ? ", " : "", h("a", {class: "gene-link", href: PIVQ("gen", z, subj)}, h("i", {}, z))])) : "",
        level(best),
        h("span", {class: "small muted"}, [bases[0] ? BASE_CORTA[bases[0]] : null, ident ? "determinante identificado" : "determinante desconocido"].filter(Boolean).join(" · ")),
        mu.k === "si" ? h("span", {class: "muerta muerta-si"}, "funciona inactivada") : mu.k === "frac" ? h("span", {class: "muerta muerta-si"}, "funciona con fracción")
          : mu.k === "nulo" ? h("span", {class: "muerta"}, "probada inactivada: sin efecto") : "",
        !esCepa ? h("span", {class: "small muted"}, x.cepas.size ? [...x.cepas].map(c => (D.strain(c) || {}).nombre_corto || c).join(", ") : "sin cepa nombrada") : "",
        !esCepa ? U.sources(x.evs.map(e => e.id)) : "",
        h("a", {class: "who-more", href: PIVQ("mec", x.c, subj)}, "Quién más →")));
    });
    if (!g.size) ul.append(h("li", {class: "muted"}, "Ningún mecanismo descrito en la evidencia a favor."));
    card.append(ul);
    if (desc) card.append(h("p", {class: "small muted"}, desc + " evidencia" + (desc > 1 ? "s" : "") + " a favor sin mecanismo descrito (desconocido, no se rellena)."));
    // «¿Dónde está la clave?»: mecanismos del catálogo con candidatos tocados por esta ficha
    const ids = [...new Set(evs.flatMap(e => (e.mecanismo || {}).ids || []))];
    ids.map(D.mecanismo).filter(m => m && (m.candidatos || []).length).forEach(m => card.append(claveCard(m, subj)));
  }
  card.append(...queProduce(subj, sp, esCepa));
  return card;
}
const SOLIDEZ = {hipotesis: ["hip", "HIPÓTESIS"], evidencia: ["evi", "EVIDENCIA"], inferencia: ["inf", "INFERENCIA"]};
const BASE_DESC = {observado: "observado", inferencia: "inferencia", causal: "causal"};
/** Fuentes en texto libre del catálogo: ids de evidencia → chip; rutas de fuentes públicas → su descripción, sin guiones bajos */
function fuenteNodes(txt) {
  return String(txt || "").split(/\s*(?:\+|,)\s*(?=[a-z])/).filter(Boolean).flatMap(part => {
    const id = (part.match(/^([a-z]+(?:-[a-z]+)+\.ev\d+[a-z]?)/) || [])[1];
    if (id && D.evidence(id)) return [U.sourceChip(id)];
    const par = (part.match(/\(([^)]+)\)\s*$/) || [])[1];
    if (/\//.test(part)) return [h("span", {class: "small muted", title: part}, "datos públicos" + (par ? ": " + par : ""))];
    return [h("span", {class: "small muted"}, part.replace(/_/g, " "))];
  });
}
function claveCard(m, subj) {
  const des = m.descartadas || [], can = m.candidatos || [];
  const nHip = can.filter(c => c.base === "hipotesis").length;
  const body = h("div", {class: "clave-body"},
    h("p", {class: "clave-det"}, h("b", {}, "Determinante DESCONOCIDO. "), m.nota || ""),
    h("p", {class: "small muted"}, m.nombre));
  if (des.length) body.append(h("h4", {}, "Descartadas (" + des.length + ")"), h("ul", {class: "clave-list"}, des.map(d => h("li", {},
    h("b", {}, claseCorta(d.clase)), " ", h("span", {class: "tag"}, BASE_DESC[d.base] || String(d.base || "").replace(/_/g, " ")),
    h("p", {class: "small"}, d.motivo || ""), (d.fuentes || []).length ? U.sources(d.fuentes.filter(f => f !== "criterio_propio")) : ""))));
  if (can.length) body.append(h("h4", {}, "Candidatos (" + nHip + " hipótesis)"), h("ul", {class: "clave-list clave-cand"}, can.map(c => {
    const [k, t] = SOLIDEZ[c.base] || ["inf", String(c.base || "").toUpperCase()];
    return h("li", {class: "clave-c clave-" + k},
      h("div", {class: "clave-what"}, h("span", {class: "clave-tag clave-tag-" + k}, t), " ", h("b", {}, c.candidato.replace(/^HIPÓTESIS RIVAL:\s*/, "Rival: ")),
        h("p", {class: "small"}, c.dato || ""), h("div", {class: "clave-src"}, ...fuenteNodes(c.fuente))),
      c.lo_refutaria ? h("div", {class: "clave-ref"}, h("b", {}, "Lo refutaría: "), c.lo_refutaria) : "");
  })));
  body.append(h("a", {class: "who-more", href: PIVQ("mid", m.id, subj)}, "Quién más comparte este fenómeno →"));
  return h("details", {class: "clave"}, h("summary", {}, h("b", {}, "¿Dónde está la clave?"),
    h("span", {class: "small muted"}, " determinante desconocido · " + des.length + " descartadas · " + nHip + " hipótesis"), icon("chev")), body);
}
/* E5 · «Qué produce y por qué vía» (rasgos v1.2), una línea por output. El detalle genómico vive en el bloque Genoma (cepa)
   o en la tabla n/N (especie). Una cepa con evidencia en contra de un rasgo sale en rasgo.cepas_en_contra (rasgos_v12.py):
   se pinta «No: Bacteriocina (porta Abp118, no la produce)» con el chip de su evidencia; nunca como productora. */
function enContraTxt(subj, x) {
  const st = D.strain(subj), vk = st && Atlas.genoma ? Atlas.genoma.vinculo(st) : null, g = vk && vk.acc ? D.genome(vk.acc) : null;
  const G = D.raw.genomica;
  const hit = g && Object.entries(g.produccion || {}).find(([, p]) => p.estado === "porta_no_produce" && (p.evidencias || []).some(e => (x.evidencias || []).includes(e)));
  if (!hit) return "evidencia en contra";
  const nm = (((G && G.marcadores) || []).find(m => m.id === hit[0]) || {}).nombre || hit[0];
  return "porta " + nm.split(" (")[0].split(" ").pop() + ", no la produce";
}
function queProduce(subj, sp, esCepa) {
  const todos = (sp && sp.rasgos) || [];
  const ras = todos.filter(t => !esCepa || (t.cepas || []).includes(subj));
  const contra = esCepa ? todos.map(t => [t, (t.cepas_en_contra || []).find(x => x.cepa === subj)]).filter(([, x]) => x) : [];
  if (!ras.length && !contra.length) return [];
  const VR = (D.raw.catalogo.vocabulario_rasgos || {rasgos: {}}).rasgos;
  const prop = ras.filter(t => t.alcance === "criterio_propio"), rest = ras.filter(t => t.alcance !== "criterio_propio");
  const ul = h("ul", {class: "how-lines"});
  rest.forEach(t => {
    const fe = (t.fuentes || []).map(D.evidence).filter(Boolean);
    const propias = esCepa ? fe.filter(e => e.cepa === subj) : [];
    const no = t.presente === "no" || (esCepa && propias.length && !propias.some(e => FAV(e.direccion)));
    const via = t.via !== "desconocida" ? t.via_etiqueta + (t.via_en_fuente === "si" ? "" : " (la fuente no la nombra)")
      : "vía no identificada" + (t.via_candidata_etiqueta ? " (candidata: " + t.via_candidata_etiqueta + ")" : "");
    const gen = (t.genomica || []).map(x => esCepa ? (x.cepas_atlas && x.cepas_atlas[subj] ? x.marcador + ": " + x.cepas_atlas[subj].texto : null)
      : x.marcador + " " + x.taxones.map(z => (z.n != null && z.N ? z.n + "/" + z.N : z.texto)).join(" · ")).filter(Boolean);
    const np = ((VR[t.rasgo] || {}).productores || []).length;
    const enc = (t.cepas_en_contra || []);
    ul.append(h("li", {class: no ? "how-no" : ""},
      h("b", {}, (no ? "No: " : "") + t.etiqueta),
      h("span", {class: "small"}, via),
      (t.genes || []).length ? h("span", {class: "genes-in"}, ...t.genes.flatMap((g, j) => [j ? ", " : "", h("a", {class: "gene-link", href: PIVQ("gen", g.gen, subj)}, h("i", {}, g.gen))])) : "",
      !esCepa ? h("span", {class: "small muted"}, t.alcance === "cepa" ? (t.cepas || []).map(c => (D.strain(c) || {}).nombre_corto || c).join(", ") : String(t.alcance || "").replace(/_/g, " ")) : "",
      !esCepa && enc.length ? h("span", {class: "small"}, "en contra: " + enc.map(x => (D.strain(x.cepa) || {}).nombre_corto || x.cepa).join(", ")) : "",
      gen.length ? h("span", {class: "small muted"}, "genoma: " + gen.join(" · ")) : "",
      !esCepa && fe.length ? U.sources(fe.map(e => e.id)) : "",
      np > 1 && t.rasgo !== "bacteriocina" ? h("a", {class: "who-more", href: Atlas.route.href("lineas", null, {out: t.rasgo, s: subj})}, "¿Quién más? (" + np + ") →") : ""));
  });
  contra.forEach(([t, x]) => ul.append(h("li", {class: "how-no"},
    h("b", {}, "No: " + t.etiqueta + " (" + enContraTxt(subj, x) + ")"), U.sources(x.evidencias || []))));
  const out = [h("h4", {}, "Qué produce y por qué vía"), ul];
  if (prop.length) out.push(h("p", {class: "small muted"}, "Por criterio propio del atlas, sin fuente: " + prop.map(t => t.etiqueta).join(", ") + "."));
  return out;
}

/* ---------- TIRA DE FORMAS (P1-04; sustituye a la pestaña Modo pregunta) ----------
   Tres chips: vivo / posbiótico / fermentado. Cada uno: evidencias a favor EN ESA FORMA (sin asociaciones; en la cepa, sin
   mezclas) y la puerta de puerta_cepa.json (cepa) o la ruta de la especie (especie). La puerta posbiótica que sale de la regla
   de E6 («en forma no viable la AMR informa pero no decide») se rotula «criterio del atlas, no regulatorio».
   Al tocar un chip: razón + regla, ruta de la especie como contexto sin color y veredicto por línea o el motivo de que no lo haya. */
const FORMAS = ["vivo", "posbiotico", "fermentado"];
const esCriterio = x => !!x && (/criterio propio/.test(x.razon || x.texto || "") || (x.fuentes_ruta || x.fuentes || []).includes("criterio_propio"));
const CRIT_TXT = "criterio del atlas, no regulatorio";
const REGLA_TXT = {"R-especie": "hereda la ruta de la especie y comprueba el genoma de la cepa", "R-nomedido": "la condición QPS es de cepa y su genoma no está medido",
                   "R-cerrada": "ruta de la especie cerrada", "R-calif": "calificación QPS sin verificar"};
function formaStrip(subj, sp) {
  const esCepa = D.resolve(subj).tipo === "cepa";
  const evs = D.evidenceOf(subj).filter(e => e.tipo !== "contexto");
  const cuentaFav = e => e.direccion === "+" && !esAsoc(e) && !(esCepa && esMezcla(e));
  const rpf = (sp && sp.regulatorio && sp.regulatorio.ruta_por_forma) || {};
  const pc = esCepa ? D.puertaCepa(subj) : null;   // en ficha de cepa manda el estado de la cepa (incluye «no medido»)
  const wrap = h("section", {class: "forma-strip"}, h("h3", {}, "¿En qué forma? ", h("span", {class: "small muted"}, "inactivado y componente cuentan como posbiótico")));
  const row = h("div", {class: "fs-chips"});
  const detail = h("div", {class: "fs-detail", id: "fs-detail-" + subj.replace(/[^\w-]/g, "-")});
  let sel = null;
  FORMAS.forEach(f => {
    const ef = evs.filter(e => U.formaProducto(e.forma) === f), fav = ef.filter(cuentaFav);
    const x = pc ? pc.puerta_por_forma[f] : rpf[f] || null;
    const est = x ? x.estado : "desconocida";
    const b = h("button", {class: "fs-chip", type: "button", "aria-pressed": "false", "aria-controls": detail.id, "data-f": f, onclick: () => {
      sel = sel === f ? null : f;
      row.querySelectorAll(".fs-chip").forEach(z => z.setAttribute("aria-pressed", String(z.dataset.f === sel)));
      detail.innerHTML = ""; if (sel) detail.append(formaDetail(subj, sp, sel, evs, cuentaFav));
    }},
      h("b", {}, U.formaLabel(f)),
      h("span", {class: "fs-n" + (fav.length ? "" : " zero")}, fav.length ? fav.length + " a favor" + (ef.length > fav.length ? " de " + ef.length : "") : ef.length ? "0 a favor de " + ef.length : "sin evidencia"),
      U.gatePill("regulatorio", pc ? "cepa" : "ruta", est, x && x.regla === "R-calif" && est === "no_medido" ? "no medido (calificación QPS sin verificar)" : null),
      f === "posbiotico" && esCriterio(x) ? h("span", {class: "fs-crit"}, CRIT_TXT) : "");
    row.append(b);
  });
  wrap.append(row);
  const nNull = evs.filter(e => !e.forma).length, nMet = evs.filter(e => e.forma && !U.formaProducto(e.forma)).length;
  if (nNull || nMet) wrap.append(h("p", {class: "small muted fs-otras"}, [nNull ? nNull + " evidencia" + (nNull > 1 ? "s" : "") + " con forma no declarada" : null,
    nMet ? nMet + " con " + [...new Set(evs.filter(e => e.forma && !U.formaProducto(e.forma)).map(e => formaTxt(e.forma)))].join(", ") : null].filter(Boolean).join(" · ") + ": no cuentan en ninguna de las tres."));
  wrap.append(detail);
  return wrap;
}
function formaDetail(subj, sp, f, evs, cuentaFav) {
  const out = h("div", {class: "card"});
  const ruta = ((sp && sp.regulatorio && sp.regulatorio.ruta_por_forma) || {})[f];
  const pc = D.resolve(subj).tipo === "cepa" ? D.puertaCepa(subj) : null;
  if (pc) { const x = pc.puerta_por_forma[f];
    out.append(h("p", {class: "small k6-why"}, U.gatePill("regulatorio", "Esta cepa", x.estado), " ", x.razon + ".",
      h("span", {class: "muted"}, " Regla " + x.regla + (REGLA_TXT[x.regla] ? ": " + REGLA_TXT[x.regla] : "") + ".")));
    if (f === "posbiotico" && esCriterio(x)) out.append(h("p", {class: "fs-crit-note"}, h("b", {}, "Criterio del atlas, no regulatorio. "),
      "Ninguna norma dice todavía cómo se evalúa una cepa inactivada: el atlas la deja «condicionada» porque en forma no viable la AMR informa pero no decide. Es una regla propia, no una evaluación de EFSA ni de la Comisión."));
    if (x.estado === "no_medido" && pc.nota_origen) out.append(h("p", {class: "k6-note"},
      "Origen curado: " + pc.nota_origen + ". «Sin accesión en el atlas» no es «no existe genoma».")); }
  // con cepa, la ruta de especie es contexto (sin color), no la puerta: así no hay un verde de especie bajo un «no medido» de cepa
  if (ruta) out.append(h("p", {class: "small fs-ruta"}, pc ? h("b", {}, "Ruta de la especie (contexto): " + String(ruta.estado || "?").replace(/_/g, " ") + ". ")
    : U.gatePill("regulatorio", "Ruta", ruta.estado || "desconocida"), " ", ruta.texto || "", " ", sourcesList((ruta.fuentes || []).filter(x => x !== "criterio_propio"))));
  if (!pc && f === "posbiotico" && esCriterio(ruta)) out.append(h("p", {class: "fs-crit-note"}, h("b", {}, "Criterio del atlas, no regulatorio.")));
  const lineas = [...new Set(evs.map(e => e.linea))].filter(l => (D.linea(l) || {}).tipo === "producto");
  const ul = h("ul", {class: "claims fs-lines"});
  lineas.forEach(l => {
    const v = D.verdict(subj, l, f), st = D.verdictState(subj, l, f);
    const nf = evs.filter(e => e.linea === l && U.formaProducto(e.forma) === f);
    const otras = [...new Set(evs.filter(e => e.linea === l).map(e => U.formaProducto(e.forma)))].filter(x => x && x !== f);
    let li;
    if (v) {
      const det = h("details", {class: "fs-why"}, h("summary", {}, "Razones y fuentes"),
        ...[["A favor", v.a_favor], ["En contra", v.en_contra], ["Lo que falta", v.lo_que_falta]].map(([t, rs]) => h("div", {},
          h("p", {class: "sub"}, t), h("ul", {class: "mini-list"}, (rs || []).length ? rs.map(r => h("li", {}, U.reasonText(r, v), " ", (r.fuentes || []).length ? U.sources(r.fuentes) : "")) : h("li", {class: "muted"}, "—")))),
        v.puertas ? h("div", {class: "gates"}, U.gatePill("seguridad", "Seguridad", v.puertas.seguridad),
          // en una cepa, la puerta regulatoria es la de la cepa en esa forma (incluye «no medido»), no la ruta de especie
          U.gatePill("regulatorio", "Regulación", pc ? pc.puerta_por_forma[f].estado : v.puertas.regulatorio), U.gatePill("tecnologia", "Tecnología", v.puertas.tecnologia)) : "",
        h("p", {class: "small muted"}, "Regla " + (v.regla_aplicada || "—") + " · " + (v.autor === "estratega" ? "dossier del estratega" : "automático")));
      li = h("li", {}, h("p", {class: "txt"}, h("b", {}, U.lineaName(l)), " ", U.verdictBadge(v)), det);
    } else {
      const e = st && st.estado;
      const txt = (e === "sin_evidencia_en_forma" || (!st && !nf.length)) ? "Sin evidencia en esta forma" + (otras.length ? " (sí en " + otras.map(U.formaLabel).join(", ").toLowerCase() + ")" : "")
        : e === "sin_resultado_a_favor" || (nf.length && !nf.some(cuentaFav)) ? nf.length + " evidencia" + (nf.length > 1 ? "s" : "") + " en esta forma, ninguna a favor"
        : "No calculado: hay " + nf.length + " evidencia" + (nf.length > 1 ? "s" : "") + " en esta forma y aún no tiene veredicto";
      li = h("li", {class: "fs-nov"}, h("p", {class: "txt"}, h("b", {}, U.lineaName(l)), " ", h("span", {class: "small muted"}, txt)));
    }
    ul.append(li);
  });
  if (!lineas.length) ul.append(h("li", {class: "muted"}, "Sin evidencia de producto."));
  out.append(ul);
  return out;
}

/* ---------- Bloque «Genoma» (P1-05): lo pinta js/25_genoma.js (Atlas.genoma) desde genomica.json + puerta_cepa.json ---------- */
function foldGenoma(st) {
  if (!Atlas.genoma) return fold("Genoma", "capa genómica no cargada · no medido", h("p", {class: "k6-note"}, "No medido ≠ ausente."));
  const r = Atlas.genoma.cepa(st);
  return fold("Genoma", r.sum, r.body);
}
function foldGenomaEspecie(s) {
  if (!Atlas.genoma) return null;
  const r = Atlas.genoma.especie(s);
  return r ? fold("Genoma (genomas públicos)", r.sum, r.body) : null;
}

/* ---------- utilidades compartidas del paquete ---------- */
function kvp(k, v, fuentes) { return h("div", {class: "kv"}, h("small", {}, k), h("span", {}, v, " ", sourcesList(fuentes))); }
function kvbox(k, v) { return h("div", {class: "kvbox"}, h("b", {}, k + ". "), v); }
function wireScroll(tbl) { tbl.addEventListener("scroll", () => tbl.classList.toggle("scrolled", tbl.scrollLeft > 2), {passive: true}); }
})();

})();
