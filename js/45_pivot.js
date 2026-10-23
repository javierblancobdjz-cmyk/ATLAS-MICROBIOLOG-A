;(function(){
/* 45_pivot.js · K2. Vista pivote por resultado: «este output lo comparten estos microorganismos».
   Todo se deriva en el navegador de evidencias.json (+ el campo `mecanismo` de v1.2 y la celda de matriz.json).
   No añade datos: si un campo no existe, se dice «sin curar», nunca se rellena.
   Expone Atlas.pivot = {FAM, famOf, cellFamilies, rowsFor, muerta, render}. Lo usan 40_lines.js y 20_species.js. */
const U = Atlas.ui, h = U.h, level = U.level, icon = U.icon;
const D = new Proxy({}, {get: (_, k) => Atlas.data[k]});

/* Familias de mecanismo: tres colores y nada más. La pregunta que responden: ¿actúa bloqueando al patógeno
   físicamente, atacándolo/alterando su entorno, o a través del hospedador? */
const FAM = {
  /* E8 r2: solo exclusion_patogeno. La clase v1.1 adhesion_coagregacion mezclaba exclusión del patógeno y adhesión al
     hospedador (Caco-2, moco): no se colorea; si apareciera, cae en «desconocido» en vez de pintarse como exclusión. */
  exclusion:   {etq: "Exclusión del patógeno", corto: "exclusión", clases: ["exclusion_patogeno"],
                que: "La bacteria (viva o muerta) impide que el patógeno se adhiera o lo coagrega"},
  antagonismo: {etq: "Antagonismo activo", corto: "antagonismo", clases: ["bacteriocina", "acido_h2o2", "enzima", "alcalinizacion_ads_ureasa", "interferencia_quorum"],
                que: "Bacteriocina, H2O2 o ácido, enzima sobre el patógeno o su señal, alcalinización (ADS/ureasa)"},
  hospedador:  {etq: "Vía del hospedador", corto: "hospedador", clases: ["inmunomodulacion", "senalizacion_hospedador", "metabolito", "uso_glicanos", "adhesion_hospedador"],
                que: "Inmunomodulación, señalización del hospedador, metabolito producido, uso de glicanos"},
  otro:        {etq: "Otro con nombre", corto: "otro", clases: ["otro"], que: "Mecanismo explícito fuera de las clases anteriores"},
};
const FAM_ORDEN = ["exclusion", "antagonismo", "hospedador", "otro"];
const famOf = clase => FAM_ORDEN.find(f => FAM[f].clases.includes(clase)) || null;
const clasesReales = cl => (cl || []).filter(c => famOf(c));
const claseEtq = c => ((D.raw.catalogo.clases_mecanismo || []).find(x => x.id === c) || {}).etiqueta || c;

const NIV_NUM = {MA: 1, ECA: 2, OBS: 3, ANI: 4, CEL: 5, "GEN-v": 6, "GEN-p": 7};
const nn = c => NIV_NUM[c] || 99;
const A_FAVOR = ["+", "mixto"];
const FORMA_ETQ = {vivo: "viva", inactivado: "inactivada", componente: "fracción celular", fermentado: "fermentado", metabolito: "metabolito aislado"};
const BASE_ETQ = {causal: "demostrado (mutante o bloqueo)", observado: "observado en el ensayo", inferencia: "inferido por los autores",
                  prediccion_genomica: "predicción genómica"};
const MUERTA = ["inactivado"], FRACCION = ["componente", "metabolito"];

/** ¿Funciona muerta? Derivado solo de `forma` + `direccion` de las evidencias de ESA fila. «No probada» ≠ «no funciona». */
function muerta(evs) {
  const fav = evs.filter(e => A_FAVOR.includes(e.direccion));
  const inact = fav.filter(e => MUERTA.includes(e.forma));
  if (inact.length) {
    const met = [...new Set(inact.map(e => e.inactivacion_metodo).filter(Boolean))];
    const best = inact.reduce((a, e) => nn(e.nivel) < nn(a.nivel) ? e : a);
    return {k: "si", txt: "Sí, célula inactivada" + (met.length ? " (" + met.join(", ") + ")" : ""), nivel: best.nivel, ev: inact.map(e => e.id)};
  }
  const frac = fav.filter(e => FRACCION.includes(e.forma));
  if (frac.length) {
    const best = frac.reduce((a, e) => nn(e.nivel) < nn(a.nivel) ? e : a);
    return {k: "frac", txt: "Sí, con " + [...new Set(frac.map(e => FORMA_ETQ[e.forma]))].join(" y ") + " (no célula entera)", nivel: best.nivel, ev: frac.map(e => e.id)};
  }
  const muertasSinEfecto = evs.filter(e => MUERTA.concat(FRACCION).includes(e.forma));
  if (muertasSinEfecto.length) return {k: "nulo", txt: "Probada inactivada: sin efecto", ev: muertasSinEfecto.map(e => e.id)};
  if (fav.some(e => e.forma === "fermentado")) return {k: "ferm", txt: "Solo fermentado (viabilidad no declarada)"};
  const exige = fav.some(e => e.mecanismo && e.mecanismo.requiere_viabilidad === "si");
  return {k: "np", txt: "No probada" + (exige ? " · su mecanismo exige célula viva (inferencia)" : "")};
}

/** Filas del pivote: una por unidad ensayada (cepa si el artículo la declara; si no, la especie). */
/* E7 r2: el motor agrupa CUALQUIER conjunto de evidencias de un mismo resultado; rowsFor(linea, res) es el caso de la matriz,
   y las entradas por gen, clase de mecanismo, mecanismo del catálogo o texto (renderQuery) usan el mismo motor. */
function rowsFor(linea, res) {
  return rowsFromEvs(Object.values(D.raw.evidencias).filter(e => e.tipo === "evidencia" && e.linea === linea && e.resultado === res), linea, res);
}
function rowsFromEvs(evs, linea, res) {
  const by = new Map();
  evs.forEach(e => {
    const k = e.cepa || ("sp:" + e.especie + ":" + e.alcance);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(e);
  });
  const mat = (D.raw.matriz[linea] || {});
  const ataques = D.attacks(linea).filter(a => a.resultado === res);
  const curado = evs.some(e => "mecanismo" in e);
  const rows = [...by.entries()].map(([k, E]) => {
    const fav = E.filter(e => A_FAVOR.includes(e.direccion));
    const ref = fav.length ? fav : E;
    const best = ref.reduce((a, e) => nn(e.nivel) < nn(a.nivel) ? e : a);
    const mecEv = fav.filter(e => e.direccion === "+" && e.mecanismo && clasesReales(e.mecanismo.clases).length);
    const clases = [...new Set(mecEv.flatMap(e => clasesReales(e.mecanismo.clases)))];
    const genes = [...new Set(mecEv.flatMap(e => e.mecanismo.genes || []))].sort();
    const bases = [...new Set(mecEv.map(e => e.mecanismo.base))];
    // E8 r2: el determinante (molécula o gen) y el nivel AL QUE SE VIO el mecanismo, que puede no ser el mejor nivel del efecto
    const det = mecEv.length ? (mecEv.some(e => e.mecanismo.determinante === "identificado") ? "identificado" : "desconocido") : null;
    const mecNivel = mecEv.length ? mecEv.reduce((a, e) => nn(e.nivel) < nn(a.nivel) ? e : a).nivel : null;
    // mecanismo estudiado en esta misma unidad con resultado nulo o en contra: se dice, no se colorea
    const nulEv = E.filter(e => !A_FAVOR.includes(e.direccion) && e.mecanismo && clasesReales(e.mecanismo.clases).length);
    const estudiadoNulo = nulEv.length ? {clases: [...new Set(nulEv.flatMap(e => clasesReales(e.mecanismo.clases)))],
      nivel: nulEv.reduce((a, e) => nn(e.nivel) < nn(a.nivel) ? e : a).nivel, ev: nulEv.map(e => e.id)} : null;
    // mecanismo que la celda hereda de una línea de ataque (inferencia), solo si la fila no tiene uno propio
    const celda = mat[E[0].especie + "|" + res];
    const propuesto = !clases.length && celda && celda.mecanismo && /ataque/.test(celda.mecanismo.origen || "") && fav.length
      ? {clases: clasesReales(celda.mecanismo.clases), texto: (ataques.find(a => a.especie === E[0].especie) || {}).mecanismo_texto || ""} : null;
    const dirs = {};
    E.forEach(e => { dirs[e.direccion] = (dirs[e.direccion] || 0) + 1; });
    const ids = new Set(E.map(e => e.id));
    const vias = ((D.species(E[0].especie) || {}).rasgos || []).filter(t => t.via && (t.fuentes || []).some(f => ids.has(f)));
    return {
      vias,
      key: k, especie: E[0].especie, cepa: E[0].cepa || null, alcance: E[0].alcance, evs: E, n: E.length,
      aFavor: fav.length > 0, nivel: best.nivel, dirs,
      formas: [...new Set(E.map(e => e.forma))],
      muerta: muerta(E),
      clases, genes, det, mecNivel, estudiadoNulo, base: bases.sort((a, b) => Object.keys(BASE_ETQ).indexOf(a) - Object.keys(BASE_ETQ).indexOf(b))[0] || null,
      propuesto, curado,
      familias: [...new Set((clases.length ? clases : (propuesto ? propuesto.clases : [])).map(famOf))],
    };
  });
  rows.sort((a, b) => (b.aFavor - a.aFavor) || (nn(a.nivel) - nn(b.nivel)) || (b.clases.length - a.clases.length) || (b.n - a.n));
  return rows;
}

/** Familias de una celda de la matriz (v1.2: celda.mecanismo; v1.1: no hay → []). Misma regla que el pivote. */
function cellFamilies(c) {
  if (!c || !c.mecanismo) return [];
  return [...new Set(clasesReales(c.mecanismo.clases).map(famOf))];
}

/** Determinante y nivel del mecanismo de una celda (v1.2). Misma regla que la fila: el color dice la familia, no que esté resuelto. */
function cellMec(c) {
  if (!c || !c.mecanismo) return null;
  const evs = (c.mecanismo.evidencias || []).map(id => D.raw.evidencias[id]).filter(Boolean);
  const nivel = evs.length ? evs.reduce((a, e) => nn(e.nivel) < nn(a.nivel) ? e : a).nivel : null;
  const ud = [...new Set(evs.map(e => e.cepa || "sp:" + e.especie))];
  return {det: c.mecanismo.determinante || null, nivel, unidades: ud};
}
const DET_TXT = "determinante desconocido";
function famDot(f, txt) {
  return h("span", {class: "fam fam-" + f}, h("i", {"aria-hidden": "true"}), txt != null ? txt : FAM[f].corto);
}
function quien(r) {
  if (r.cepa) {
    const st = D.strain(r.cepa), sp = D.species(r.especie);
    return h("span", {class: "pv-who"}, h("a", {href: Atlas.route.href("cepa", r.cepa)}, h("i", {class: "bn"}, sp ? sp.nombre_corto : ""), " ", st ? (st.designacion || st.nombre_corto) : r.cepa),
      h("span", {class: "pv-scope"}, "● cepa"));
  }
  return h("span", {class: "pv-who"}, h("a", {href: Atlas.route.href("especie", r.especie)}, U.name(r.especie)),
    h("span", {class: "pv-scope"}, r.alcance === "extrapolada" ? "◌ extrapolada" : "○ especie, sin cepa declarada"));
}
function dirTxt(d) {
  const m = {"+": "a favor", "0": "nulo", nc: "no concluyente", "-": "en contra", mixto: "mixto"};
  return Object.entries(d).map(([k, v]) => v + " " + (m[k] || k)).join(" · ");
}
/* E5 · vía (output × enzima) bajo el mecanismo, y enlace al pivote por output. Sale de especies.json rasgos v1.2. */
const VR = () => (D.raw.catalogo.vocabulario_rasgos || {rasgos: {}, vias: {}, tipos_convergencia: {}});
function viaTxt(t) {
  if (t.via !== "desconocida") return t.via_etiqueta + (t.via_en_fuente === "si" ? "" : " · la fuente no la nombra");
  return "vía no identificada en la fuente" + (t.via_candidata_etiqueta ? " (candidata: " + t.via_candidata_etiqueta + ")" : "");
}
function viaLines(r) {
  if (!r.vias || !r.vias.length) return "";
  const vs = r.vias.filter(t => t.rasgo !== "bacteriocina" && t.alcance !== "criterio_propio");  // la clase de bacteriocina es de E3
  if (!vs.length) return "";
  // E8 r2: una línea por OUTPUT (no por vía): las vías del mismo output se juntan y el enlace «¿quién más?» sale una vez
  const by = new Map(); vs.forEach(t => { if (!by.has(t.rasgo)) by.set(t.rasgo, []); by.get(t.rasgo).push(t); });
  return h("div", {class: "pv-via"}, [...by.values()].map(ts => {
    const t = ts[0], v = VR().rasgos[t.rasgo] || {}, np = (v.productores || []).length;
    return h("small", {}, h("b", {}, t.etiqueta), " · ", [...new Set(ts.map(viaTxt))].join("; "),
      np > 1 ? " · " : "", np > 1 ? h("a", {href: Atlas.route.href("lineas", null, {out: t.rasgo})}, "¿quién más? (" + np + " especies)") : "");
  }));
}
function mecCell(r) { const c = mecCell0(r), v = viaLines(r); return v ? h("div", {}, c, v) : c; }
function mecCell0(r) {
  if (r.clases.length) return h("div", {class: "pv-mec"},
    h("div", {class: "fams"}, r.familias.map(f => famDot(f, FAM[f].corto + (r.det === "desconocido" ? " (" + DET_TXT + ")" : "")))),
    h("span", {}, r.clases.map(claseEtq).join(" + ")),
    h("small", {class: "muted"}, [BASE_ETQ[r.base] || "", r.mecNivel ? "visto en " + r.mecNivel : "",
      r.det === "desconocido" ? "se sabe qué hace, no con qué molécula o gen" : ""].filter(Boolean).join(" · ")),
    nuloTxt(r));
  if (r.propuesto) return h("div", {class: "pv-mec"},
    h("div", {class: "fams"}, r.familias.map(f => famDot(f, ""))),
    h("span", {}, r.propuesto.clases.map(claseEtq).join(" + ")),
    h("small", {class: "muted"}, "propuesto en línea de ataque · sin evidencia de mecanismo en este resultado"));
  if (!r.curado) return h("span", {class: "muted"}, "sin curar");
  if (r.estudiadoNulo) return h("div", {class: "pv-mec"}, h("span", {class: "pv-unk"}, r.aFavor ? "Desconocido en el ensayo a favor" : "—"), nuloTxt(r));
  return h("span", {class: "pv-unk"}, r.aFavor ? "Desconocido" : "—");
}
/** «Estudiado sin efecto»: el mecanismo se midió en esta misma unidad y salió nulo o en contra. No se colorea. */
function nuloTxt(r) {
  const z = r.estudiadoNulo;
  if (!z || (r.clases.length && z.clases.every(c => r.clases.includes(c)) && r.aFavor)) return "";
  return h("small", {class: "pv-nul"}, "Estudiado en esta unidad sin efecto claro: ", z.clases.map(claseEtq).join(" + "), " (", z.nivel, ") ", U.sources(z.ev));
}
function muertaCell(m) {
  return h("span", {class: "mu mu-" + m.k}, m.k === "si" || m.k === "frac" ? icon("ok") : "", m.txt, m.nivel ? [" ", level(m.nivel)] : "");
}

/** Pinta el pivote. highlight = slug de especie a resaltar (viene de tocar una celda). */
function render(el, linea, res, highlight, soloMuerta) {
  const L = D.linea(linea), R = D.resultado(linea, res);
  const rows = rowsFor(linea, res);
  const pos0 = rows.filter(r => r.aFavor), neg = rows.filter(r => !r.aFavor);
  // E7: filtro «funciona con célula muerta» (observado: forma inactivada/fracción con efecto a favor; nunca inferido)
  const pos = soloMuerta ? pos0.filter(r => r.muerta.k === "si" || r.muerta.k === "frac") : pos0;

  el.append(h("nav", {class: "crumbs small"},
    h("a", {href: Atlas.route.href("lineas", linea)}, "← Matriz de " + (L ? L.nombre : linea))));
  el.append(h("h1", {class: "pv-title"}, (R ? R.nombre : res), h("span", {class: "muted"}, " · quién lo consigue")));
  if (highlight) { const who = D.resolve(highlight); if (who) el.append(h("p", {class: "small pv-from"}, "Vienes de ",
    h("a", {href: Atlas.route.href(who.tipo === "cepa" ? "cepa" : "especie", highlight)}, U.name(highlight)), ": su fila va resaltada.")); }

  // otros resultados de la línea (saltar de pivote a pivote: 1 toque)
  const resWith = (L ? L.resultados : []).filter(x => Object.values(D.raw.evidencias).some(e => e.tipo === "evidencia" && e.linea === linea && e.resultado === x.id));
  el.append(h("div", {class: "line-chips scroller pv-res"}, resWith.map(x =>
    h("a", {class: "chip", "aria-pressed": String(x.id === res), href: Atlas.route.href("lineas", linea, {res: x.id})}, x.nombre_corto || x.nombre))));

  if (!rows.length) { el.append(h("p", {class: "muted"}, "Ninguna evidencia curada para este resultado. No significa que nadie lo consiga: no está curado.")); return; }

  // resumen en una línea, solo con recuentos
  const nEsp = new Set(pos.map(r => r.especie)).size, nCepa = pos.filter(r => r.cepa).length;
  const conMec = pos.filter(r => r.clases.length).length, muertas = pos.filter(r => r.muerta.k === "si" || r.muerta.k === "frac").length;
  el.append(h("p", {class: "pv-lede"},
    h("b", {}, pos.length + (pos.length === 1 ? " microorganismo" : " microorganismos")), " con resultado a favor (",
    nCepa + " a nivel de cepa, " + (pos.length - nCepa) + " solo de especie; " + nEsp + (nEsp === 1 ? " especie" : " especies") + "). ",
    rows.some(r => r.curado) ? ["Mecanismo con evidencia en ", h("b", {}, String(conMec)), ". "] : "Mecanismo: sin curar en estos datos. ", "Probado con célula muerta o fracción en ", h("b", {}, String(muertas)), ".",
    neg.length ? " " + neg.length + " sin efecto o en contra." : ""));

  // leyenda de familias con recuento (solo las presentes + desconocido)
  const cnt = {}; pos.forEach(r => r.familias.forEach(f => { cnt[f] = (cnt[f] || 0) + 1; }));
  const unk = pos.filter(r => !r.familias.length).length;
  el.append(h("div", {class: "pv-legend"},
    FAM_ORDEN.filter(f => cnt[f]).map(f => h("span", {title: FAM[f].que}, famDot(f, FAM[f].etq + " · " + cnt[f]))),
    unk ? h("span", {class: "fam fam-unk"}, h("i", {"aria-hidden": "true"}), "Mecanismo desconocido · " + unk) : ""));

  const nMu = pos0.filter(r => r.muerta.k === "si" || r.muerta.k === "frac").length;
  el.append(h("div", {class: "filters bar"}, h("a", {class: "switch", role: "switch", "aria-checked": String(!!soloMuerta),
    href: Atlas.route.href("lineas", linea, {res, s: highlight, muerta: soloMuerta ? null : "1"})}, h("i", {}),
    "Solo lo que funciona con célula muerta (" + nMu + ")")));
  if (pos.length) el.append(table(pos, highlight, "A favor"));
  else el.append(h("p", {class: "muted"}, soloMuerta ? "Nadie con célula inactivada o fracción y resultado a favor en este resultado: no se ha probado o no funcionó (ver abajo)." : "Ningún resultado a favor curado."));
  if (neg.length) el.append(h("h3", {class: "pv-h3"}, "Probado sin efecto o en contra"), table(neg, highlight, "Sin efecto"));

  el.append(h("p", {class: "pv-foot small muted"},
    "Cada fila es la unidad que se ensayó: si el artículo no declara cepa, la fila es la especie y no se atribuye a ninguna cepa. ",
    "«¿Funciona muerta?» sale del campo forma de las evidencias de esa fila: «No probada» quiere decir que nadie la ensayó inactivada, no que no funcione. ",
    "El color dice la familia de mecanismo, no que esté resuelto: «determinante desconocido» = se ha visto cómo actúa (p. ej. impide la adhesión) pero no qué molécula o gen lo hace; «visto en CEL» = nivel del ensayo que muestra el mecanismo, que puede ser más bajo que el mejor nivel del efecto. ",
    "Orden: primero el mejor nivel a favor. Genes: solo los nombrados en la evidencia, no los del genoma. Ausencia aquí = no curado en el atlas (corte " + (D.meta.fecha_corte || "?") + "), no incapacidad demostrada."));
}

const isHl = (r, hl) => !!hl && (r.especie === hl || r.cepa === hl || r.key === hl);
function table(rows, highlight, cap) {
  const wrap = h("div", {class: "pv-wrap"});
  const t = h("table", {class: "pv"}, h("caption", {class: "sr"}, cap),
    h("thead", {}, h("tr", {}, ["Quién", "Mejor nivel", "Formas probadas", "¿Funciona muerta?", "Mecanismo", "Genes", "Fuentes"].map(x => h("th", {scope: "col"}, x)))));
  const tb = h("tbody", {});
  rows.forEach(r => {
    const fam = r.familias[0] || "unk";
    tb.append(h("tr", {class: "pv-row fam-row-" + fam + (isHl(r, highlight) ? " hl" : ""), id: "pv-" + r.key.replace(/[^\w-]/g, "_")},
      h("th", {scope: "row", "data-k": "Quién"}, quien(r)),
      h("td", {"data-k": "Mejor nivel"}, h("div", {class: "pv-lv"}, level(r.nivel), h("small", {class: "muted"}, dirTxt(r.dirs)))),
      h("td", {"data-k": "Formas probadas"}, r.formas.map(f => FORMA_ETQ[f] || f).join(", ")),
      h("td", {"data-k": "¿Funciona muerta?"}, muertaCell(r.muerta)),
      h("td", {"data-k": "Mecanismo"}, mecCell(r)),
      h("td", {"data-k": "Genes"}, r.genes.length ? h("span", {class: "genes"}, r.genes.map(g => h("i", {}, g))) : h("span", {class: "muted"}, "—")),
      h("td", {"data-k": "Fuentes"}, fuentes(r.evs))));
  });
  t.append(tb); wrap.append(t);
  return wrap;
}

/** Un chip por artículo (no por afirmación): «Huang 2016 ×4» abre la cita de la primera afirmación. */
function fuentes(evs) {
  const by = new Map();
  evs.forEach(e => { const k = e.ref || e.id; if (!by.has(k)) by.set(k, []); by.get(k).push(e.id); });
  return h("span", {class: "chips"}, [...by.values()].map(ids =>
    h("span", {class: "pv-src"}, U.sourceChip(ids[0]), ids.length > 1 ? h("small", {class: "muted", title: ids.length + " afirmaciones del mismo artículo"}, "×" + ids.length) : "")));
}

/** Recuento de OTROS sujetos con resultado a favor para el mismo resultado (para el enlace «¿quién más?») */
function othersCount(linea, res, isSelf) {
  return rowsFor(linea, res).filter(r => r.aFavor && !isSelf(r)).length;
}

/* ---------- E5 · pivote por OUTPUT: «este output (H2O2, alcalinización…) lo comparten estos microorganismos, por estas vías» ----------
   Filas = rasgos v1.2 de especies.json con ese output; columnas = las del pivote + vía y genoma público (genomica.json de E2,
   ya volcado en rasgos[].genomica por el script de E5). «presente: no» se pinta como dato, no se oculta. */
const ALC = {cepa: "● cepa", especie: "○ especie", subgrupo: "◐ subgrupo", criterio_propio: "criterio propio del atlas"};
const PRES = {si: "sí", no: "no (dato)", variable_cepa: "varía entre cepas", sin_resolver: "sin resolver (indeterminados)"};
const BASE2 = Object.assign({contexto: "contexto (revisión/cribado)", criterio_propio: "criterio propio"}, BASE_ETQ);
const RESP = {fuente: "nombrado en la fuente", enzima_en_fuente: "enzima nombrada en la fuente", genoma_E2: "en el genoma (E2)", pendiente_E3: "pendiente de E3"};
function genomaCell(t) {
  const g = t.genomica || [];
  if (!g.length) return h("span", {class: "muted"}, "sin marcador genómico para esta vía");
  return h("div", {class: "pv-gen"}, g.map(x => {
    const mine = Object.entries(x.cepas_atlas || {}).filter(([, d]) => d.es_cepa_del_rasgo);
    return h("small", {}, h("b", {}, x.marcador), " ", x.taxones.map(z => (z.taxon && x.taxones.length > 1 ? z.taxon.replace(/^.* subsp\. /, "subsp. ") + ": " : "") + z.texto).join(" · "),
      ...mine.flatMap(([c, d]) => [" · ", h("i", {}, (D.strain(c) || {}).nombre_corto || c), ": " + d.texto + (d.pmid ? " (PMID " + d.pmid + ")" : "")]));
  }));
}
function renderOutput(el, out, highlight) {
  const V = VR(), v = V.rasgos[out];
  const filas = [];
  Object.values(D.raw.especies).forEach(sp => (sp.rasgos || []).forEach(t => { if (t.rasgo === out) filas.push({sp, t}); }));
  el.append(h("nav", {class: "crumbs small"}, h("a", {href: Atlas.route.href("lineas")}, "← Matriz")));
  el.append(h("h1", {class: "pv-title"}, v ? v.etiqueta : out, h("span", {class: "muted"}, " · quién lo produce y por qué vía")));
  if (!filas.length) { el.append(h("p", {class: "muted"}, "Ningún rasgo curado con este output.")); return; }
  const otros = Object.entries(V.rasgos).filter(([k, x]) => (x.productores || []).length > 1 && k !== out && k !== "bacteriocina");
  el.append(h("div", {class: "line-chips scroller pv-res"}, [[out, v]].concat(otros).map(([k, x]) =>
    h("a", {class: "chip", "aria-pressed": String(k === out), href: Atlas.route.href("lineas", null, {out: k})}, x.etiqueta))));
  const vias = [...new Set(filas.filter(f => f.t.via !== "desconocida").map(f => f.t.via_etiqueta))];
  el.append(h("p", {class: "pv-lede"}, h("b", {}, V.tipos_convergencia[v && v.tipo_convergencia] || ""), ". ",
    filas.length + " filas en " + new Set(filas.map(f => f.sp.slug)).size + " especies; vías identificadas: " + (vias.length ? vias.join(", ") : "ninguna") + ". ",
    "Misma molécula ≠ mismo efecto: el resultado (p. ej. frente a S. mutans) está en la matriz."));
  filas.sort((a, b) => (a.t.presente === "no") - (b.t.presente === "no") || (a.t.via === "desconocida") - (b.t.via === "desconocida") || a.sp.slug.localeCompare(b.sp.slug));
  const wrap = h("div", {class: "pv-wrap"});
  const tb = h("tbody", {});
  filas.forEach(({sp, t}) => {
    const evs = (t.fuentes || []).map(id => D.raw.evidencias[id]).filter(Boolean);
    const who = h("span", {class: "pv-who"}, h("a", {href: Atlas.route.href("especie", sp.slug)}, U.name(sp.slug)),
      t.cepas.length ? h("span", {}, ...t.cepas.flatMap((c, i) => [i ? ", " : "", h("a", {href: Atlas.route.href("cepa", c)}, (D.strain(c) || {}).nombre_corto || c)])) : "",
      h("span", {class: "pv-scope"}, (ALC[t.alcance] || t.alcance) + " · " + (PRES[t.presente] || t.presente)));
    tb.append(h("tr", {class: "pv-row" + (highlight && sp.slug === highlight ? " hl" : "")},
      h("th", {scope: "row", "data-k": "Quién"}, who),
      h("td", {"data-k": "Vía"}, h("div", {class: "pv-mec"}, h("span", {}, viaTxt(t)), h("small", {class: "muted"}, BASE2[t.base] || t.base))),
      h("td", {"data-k": "Genes"}, t.genes.length ? h("span", {class: "genes"}, t.genes.map(g => h("i", {title: RESP[g.respaldo] || g.respaldo}, g.gen))) : h("span", {class: "muted"}, "—")),
      h("td", {"data-k": "Genoma público"}, genomaCell(t)),
      h("td", {"data-k": "¿Funciona muerta?"}, evs.length ? muertaCell(muerta(evs)) : h("span", {class: "muted"}, "sin evidencia")),
      h("td", {"data-k": "Fuentes"}, evs.length ? fuentes(evs) : h("span", {class: "muted"}, t.alcance === "criterio_propio" ? "criterio propio" : "—"))));
  });
  wrap.append(h("table", {class: "pv"}, h("thead", {}, h("tr", {}, ["Quién", "Vía", "Genes", "Genoma público", "¿Funciona muerta?", "Fuentes"].map(x => h("th", {scope: "col"}, x)))), tb));
  el.append(wrap);
  el.append(h("p", {class: "pv-foot small muted"}, "Vía «no identificada» = la fuente mide el output y no dice por qué enzima; la candidata no es un dato. ",
    "Genoma público: lecturas de genomica.json (E2): «constante de especie» no distingue cepas; «no medido» no es ausencia. Porta el gen ≠ produce la molécula."));
}

/* ---------- E7 r2 · entradas por gen, clase de mecanismo, mecanismo del catálogo o texto: MISMO motor y misma tabla ----------
   Agrupa las evidencias que cumplen la consulta por resultado y pinta una tabla de pivote por cada uno.
   gen: gen bacteriano nombrado en la evidencia (mecanismo.genes) · mec: clase · mid: mecanismo del catálogo · q: palabra del claim. */
const nrm = s => (s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const wds = s => nrm(s).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
const infl = (x, w) => x === w || x === w + "s" || x === w + "es";
function queryEvs(q) {
  const all = Object.values(D.raw.evidencias).filter(e => e.tipo === "evidencia");
  if (q.gen) return all.filter(e => e.mecanismo && (e.mecanismo.genes || []).some(g => nrm(g) === nrm(q.gen)));
  if (q.mec) return all.filter(e => e.mecanismo && (e.mecanismo.clases || []).includes(q.mec));
  if (q.mid) { const m = D.mecanismo(q.mid) || {}; const ids = new Set(m.fuentes || []);
    return all.filter(e => ids.has(e.id) || (e.mecanismo && (e.mecanismo.ids || []).includes(q.mid))); }
  if (q.q) { const qw = wds(q.q); return all.filter(e => { const w = wds(e.claim_es); return qw.every(x => w.some(y => infl(y, x))); }); }
  return [];
}
function renderQuery(el, q, highlight) {
  const evs = queryEvs(q);
  const tit = q.gen ? ["Gen ", h("i", {}, q.gen)] : q.mec ? ["Mecanismo: ", claseEtq(q.mec)]
    : q.mid ? [(D.mecanismo(q.mid) || {}).nombre || q.mid] : ["«" + q.q + "» en las evidencias"];
  el.append(h("nav", {class: "crumbs small"}, h("a", {href: Atlas.route.href("lineas")}, "← Matriz")));
  el.append(h("h1", {class: "pv-title"}, ...tit, h("span", {class: "muted"}, " · quién, en qué resultado")));
  if (highlight) { const who = D.resolve(highlight); if (who) el.append(h("p", {class: "small pv-from"}, "Vienes de ",
    h("a", {href: Atlas.route.href(who.tipo === "cepa" ? "cepa" : "especie", highlight)}, U.name(highlight)), ": su fila va resaltada.")); }
  if (q.mid) { const m = D.mecanismo(q.mid) || {};
    el.append(h("p", {class: "pv-lede"}, h("b", {}, "Determinante: "), m.determinante === "desconocido" ? "desconocido" : (m.molecula_o_componente || "—"),
      (m.genes || []).length ? [" · genes: ", h("span", {class: "genes"}, m.genes.map(g => h("i", {}, g)))] : "",
      m.requiere_viabilidad ? " · requiere célula viva: " + String(m.requiere_viabilidad).replace(/_/g, " ") : "")); }
  if (q.gen) el.append(h("p", {class: "small muted"}, "Solo evidencias que nombran el gen en el ensayo (no presencia en el genoma: eso está en el bloque Genoma de cada cepa)."));
  // E7 r2: en una consulta de texto, también los rasgos v1.2 (E5) cuyo texto la contiene (palabra exacta o plural)
  const ras = q.q ? Object.values(D.raw.especies).flatMap(sp => (sp.rasgos || []).filter(t => { const w = wds([t.etiqueta, t.via_etiqueta, t.via_candidata_etiqueta, t.detalle, t.nota_cepa_vs_especie].filter(Boolean).join(" "));
    return wds(q.q).every(x => w.some(y => infl(y, x))); }).map(t => ({sp, t}))) : [];
  if (ras.length) el.append(h("h3", {class: "pv-h3"}, "En rasgos curados (" + ras.length + ")"), h("ul", {class: "mini-list"}, ras.map(({sp, t}) => h("li", {},
    h("a", {href: Atlas.route.href("especie", sp.slug)}, U.name(sp.slug)), " · ", h("b", {}, t.etiqueta), " · " + (t.via !== "desconocida" ? t.via_etiqueta : "vía no identificada"),
    t.detalle ? h("div", {class: "small muted"}, t.detalle) : ""))));
  if (!evs.length) { if (ras.length) return; el.append(h("p", {class: "muted"}, "Ninguna evidencia curada lo nombra. No significa que no exista: no está curado (corte " + (D.meta.fecha_corte || "?") + ").")); return; }
  const by = new Map();
  evs.forEach(e => { const k = e.linea + "|" + e.resultado; if (!by.has(k)) by.set(k, []); by.get(k).push(e); });
  el.append(h("p", {class: "pv-lede"}, h("b", {}, evs.length + (evs.length === 1 ? " evidencia" : " evidencias")), " en " + by.size + (by.size === 1 ? " resultado" : " resultados") + " y " +
    new Set(evs.map(e => e.especie)).size + " especies. Cada tabla es el pivote de ese resultado restringido a esta consulta; «todos los que lo consiguen» abre el pivote completo."));
  [...by.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([k, E]) => {
    const [lin, res] = k.split("|"), R = D.resultado(lin, res), L = D.linea(lin);
    const rows = rowsFromEvs(E, lin, res);
    el.append(h("h3", {class: "pv-h3"}, (R ? R.nombre : res), h("span", {class: "muted small"}, " · " + (L ? L.nombre : lin) + " · "),
      h("a", {class: "small", href: Atlas.route.href("lineas", lin, {res, s: highlight})}, "todos los que lo consiguen →")));
    el.append(table(rows, highlight, R ? R.nombre : res));
  });
}

Atlas.pivot = {FAM, FAM_ORDEN, famOf, cellFamilies, cellMec, DET_TXT, rowsFor, rowsFromEvs, muerta, render, renderQuery, famDot, othersCount, renderOutput};
})();
