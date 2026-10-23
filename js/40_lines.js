;(function(){
/* 40_lines.js · P4. Matriz de líneas de producto, huecos y líneas de ataque. */
(function () {
const U = Atlas.ui, D = new Proxy({}, {get: (_, k) => Atlas.data[k]}), h = U.h, icon = U.icon, level = U.level, name = U.name;
const etq = k => String(k == null ? "" : k).replace(/_/g, " ");
/* P1-02: requiere_viabilidad de la celda copiada en la línea de ataque; «desconocido» se dice, no se pinta como «no». */
const VIAB = {si: "su mecanismo exige célula viva", no: "no la exige (funciona inactivada o con fracción)", desconocido: "no se sabe si exige célula viva"};
/** mecanismo_id de la línea de ataque («M01,M02» o «desconocido» explícito) → enlaces al pivote por mecanismo del catálogo. */
function mecIds(v) {
  if (!v || v === "desconocido") return h("div", {class: "small muted"}, "Mecanismo del catálogo: desconocido");
  return h("div", {class: "small"}, "Catálogo: ", String(v).split(",").flatMap((id, i) => [i ? " · " : "",
    h("a", {href: Atlas.route.href("lineas", null, {mid: id})}, id + " " + ((D.mecanismo(id) || {}).nombre || ""))]));
}

Atlas.registerView({route: "lineas", tab: "lineas", cssClass: "v-lineas", render(el, r) {
  const lineas = D.lineas("producto");
  const active = r.param || (lineas[0] && lineas[0].id);
  const linea = D.linea(active) || lineas[0];
  const onlyAtk = r.query.ataque === "1";
  if (r.query.out && Atlas.pivot.renderOutput) {  // E5: pivote por output (molécula/rasgo), mismo componente
    Atlas.pivot.renderOutput(el, r.query.out, r.query.s || null);
    return;
  }
  // E7 r2: entradas por gen / clase de mecanismo / mecanismo del catálogo / texto → mismo motor (Atlas.pivot), misma ruta
  if (r.query.gen || r.query.mec || r.query.mid || r.query.q) {
    Atlas.pivot.renderQuery(el, r.query, r.query.s || null);
    if (r.query.s) requestAnimationFrame(() => { const x = el.querySelector("tr.hl"); if (x) x.scrollIntoView({block: "center"}); });
    return;
  }
  if (r.query.res && D.resultado(linea.id, r.query.res)) {
    Atlas.pivot.render(el, linea.id, r.query.res, r.query.s || null, r.query.muerta === "1");
    if (r.query.s) requestAnimationFrame(() => { const x = el.querySelector("tr.hl"); if (x) x.scrollIntoView({block: "center"}); });
    return;
  }
  el.append(h("h1", {}, "Líneas de producto"),
    U.readingBox("lineas",
      "Ver de un golpe qué bacterias consiguen cada resultado y por qué familia de mecanismo.",
      "Tres estados. Color = evidencia a favor con familia de mecanismo y fuente (relleno pálido y «det. ?» = se vio cómo actúa, no con qué molécula o gen). Borde gris discontinuo = evidencia a favor, mecanismo sin identificar («mecanismo ?»). Rosa = nulo o en contra. Un punto = nada curado: hueco de curación, no ausencia.",
      "Toca el nombre de un resultado para ver quién lo consigue, con qué forma, si funciona con la célula muerta y por qué mecanismo. Una celda abre ese mismo pivote con su fila resaltada."));

  // selector de línea
  const chips = h("div", {class: "line-chips scroller"});
  lineas.forEach(l => chips.append(h("a", {class: "chip", "aria-pressed": String(l.id === active),
    href: Atlas.route.href("lineas", l.id, onlyAtk ? {ataque: "1"} : null)}, l.nombre)));
  el.append(chips);

  const bar = h("div", {class: "filters bar"},
    h("a", {class: "switch", role: "switch", "aria-checked": String(onlyAtk),
      href: Atlas.route.href("lineas", active, onlyAtk ? null : {ataque: "1"})}, h("i", {}), "Solo líneas de ataque"));
  el.append(bar);

  const mat = D.raw.matriz[active] || {};
  const resultados = linea.resultados || [];
  // especies con alguna celda en la línea
  const especies = D.allSpecies().filter(s => resultados.some(res => mat[s.slug + "|" + res.id]))
    .sort((a, b) => a.nombre_actual.localeCompare(b.nombre_actual));

  if (onlyAtk) {
    const atks = D.attacks(active);
    const grid = h("div", {class: "attack-rows"});
    atks.forEach(a => {
      const res = D.resultado(a.linea, a.resultado);
      grid.append(h("div", {class: "atk-card"},
        h("h4", {}, h("a", {href: Atlas.route.href("lineas", a.linea, {res: a.resultado, s: a.especie})}, name(a.especie), " → ", res ? res.nombre_corto : etq(a.resultado))),
        h("dl", {},
          h("dt", {}, "Mecanismo"), h("dd", {}, a.mecanismo_texto, " ", Atlas.pivot.fuentesIds(a.fuentes_mecanismo), mecIds(a.mecanismo_id)),
          h("dt", {}, "¿Funciona muerta?"), h("dd", {}, a.funciona_inactivada ? Atlas.pivot.muertaCell(a.funciona_inactivada) : h("span", {class: "muted"}, "No probada")),
          h("dt", {}, "Célula viva"), h("dd", {}, VIAB[a.requiere_viabilidad] || VIAB.desconocido),
          h("dt", {}, "Mejor nivel"), h("dd", {}, a.mejor_nivel ? level(a.mejor_nivel) : "—"),
          h("dt", {}, "Qué falta"), h("dd", {}, a.que_falta || "—"),
          h("dt", {}, "Ruta"), h("dd", {}, a.ruta_regulatoria || "—"))));
    });
    if (!atks.length) grid.append(h("p", {class: "muted"}, "Sin líneas de ataque curadas en esta línea."));
    el.append(grid);
    return;
  }

  // Columnas: solo resultados con alguna celda; los vacíos se declaran en una línea (no se pintan 26 guiones)
  const conDato = resultados.filter(res => especies.some(s => mat[s.slug + "|" + res.id]));
  const vacios = resultados.filter(res => !conDato.includes(res));
  el.append(legend(linea));
  const wrap = h("div", {class: "tbl mx", "data-scroll": true});
  const thead = h("thead", {}, h("tr", {}, h("th", {class: "stick"}, "Bacteria"),
    ...conDato.map(res => h("th", {}, h("a", {class: "colhead", href: Atlas.route.href("lineas", active, {res: res.id}),
      title: "Quién consigue «" + res.nombre + "»"}, res.nombre_corto || res.nombre, " ", icon("chev"))))));
  const tb = h("tbody", {});
  especies.forEach(s => {
    const tr = h("tr", {}, h("th", {class: "stick", scope: "row"},
      h("a", {href: Atlas.route.href("especie", s.slug)}, h("i", {class: "bn"}, s.nombre_corto))));
    conDato.forEach(res => {
      const c = mat[s.slug + "|" + res.id];
      tr.append(h("td", {}, matCell(c, s.slug, active, res)));
    });
    tb.append(tr);
  });
  if (!especies.length) tb.append(h("tr", {}, h("td", {class: "muted"}, "Sin datos en esta línea.")));
  wrap.append(h("table", {}, thead, tb)); el.append(wrap);
  if (conDato.length > 3) el.append(h("p", {class: "swipe"}, "Desliza para ver más resultados →"));
  if (vacios.length) el.append(emptyCols(linea, resultados, vacios));
  wrap.addEventListener("scroll", e => e.currentTarget.classList.toggle("scrolled", e.currentTarget.scrollLeft > 2), {passive: true});
}});

/* E8 r2 · columnas sin curar (con E9): cifra de la línea + cola de PMID localizados y NO verificados, cuando la hay.
   La cola viene de catalogo.lineas[].resultados[].cola_curacion (tools/anadir_cola_curacion.py sobre el lote de E9). */
function emptyCols(linea, resultados, vacios) {
  const conCola = vacios.filter(v => v.cola_curacion && (v.cola_curacion.pmids || []).length);
  const box = h("div", {class: "small mx-empty"},
    h("p", {}, h("b", {}, linea.nombre + ": " + vacios.length + " de " + resultados.length + " resultados sin ninguna evidencia curada"), " — ",
      vacios.map(v => v.nombre_corto || v.nombre).join(", "), ". ",
      h("span", {class: "muted"}, "Es un hueco de curación, no una ausencia demostrada: no se pintan columnas de guiones.")));
  conCola.forEach(v => {
    const q = v.cola_curacion;
    box.append(h("details", {class: "mx-cola"}, h("summary", {}, (v.nombre_corto || v.nombre) + ": " + q.pmids.length + " PMID en cola de curación, sin verificar"),
      h("p", {class: "muted"}, "Localizados en PubMed (", q.lote || "lote", "), no leídos frase a frase: no son evidencia. Consulta: ", h("code", {}, q.consulta)),
      h("p", {}, q.pmids.flatMap((id, i) => [i ? " · " : "", h("a", {href: "https://pubmed.ncbi.nlm.nih.gov/" + id + "/", target: "_blank", rel: "noopener"}, id)]))));
  });
  return box;
}

/* Leyenda fija: los tres estados de evidencia (familia / «mecanismo ?» / nulo) + «det. ?» + lo que no cuenta.
   Nunca solo color: cada celda lleva texto. Las muestras usan las mismas clases que las celdas. */
function legend(linea) {
  const P = Atlas.pivot;
  const sw = (cls, txt, title) => h("span", title ? {title} : {}, h("span", {class: "sw " + cls, "aria-hidden": "true"}), txt);
  /* Seguridad: el eje es el riesgo, no el efecto a favor (ver matCell) */
  if (linea && linea.id === "seguridad") return h("div", {class: "mx-legend small", role: "note"},
    h("div", {class: "mx-leg-row"},
      sw("sw-neg", "Señal de riesgo («criterio propio»: solo por serie de casos asociada)"),
      sw("sw-aso", "Sin señal de riesgo registrada (no es «seguro»)"),
      sw("sw-none", "Nada curado")));
  return h("div", {class: "mx-legend small", role: "note"},
    h("div", {class: "mx-leg-row"},
      ...P.FAM_ORDEN.filter(f => f !== "otro").map(f => sw("sw-fam fam-bg-" + f, P.FAM[f].etq, P.FAM[f].que)),
      sw("sw-fam fam-bg-exclusion det-unk", "«det. ?»: molécula o gen desconocido")),
    h("div", {class: "mx-leg-row"},
      sw("sw-unk", "«mecanismo ?»: a favor, sin identificar"),
      sw("sw-neg", "Nulo o en contra"),
      sw("sw-aso", "Asociación o mezcla (no cuenta)"),
      sw("sw-none", "Nada curado")));
}

/* Estados que no son efecto del sujeto (generar_v12: solo_asociacion, solo_mezcla): gris discontinuo, rotulados, sin color. */
const NO_EFECTO = {solo_asociacion: ["asociación", "solo asociación (se observa, no se interviene): no cuenta como efecto"],
                   solo_mezcla: ["en mezcla", "solo en mezcla de cepas: no cuenta para ninguna"]};

/* Seguridad: una celda cuyo riesgo sale solo de series de casos asociadas (senal_por_asociacion, generar_v12) lo rotula como
   criterio propio del atlas: en las demás líneas una asociación no cuenta como efecto. */
function matCell(c, subj, linea, res) {
  /* Línea de seguridad: el eje no es «efecto a favor» sino riesgo. «señal de riesgo» va en rojo con texto; «sin señal de riesgo
     registrada» va en gris discontinuo (no es «seguro»), nunca como «sin efecto». Etiquetas de catalogo.estado_celda_valores. */
  if (c && (c.estado === "senal_de_riesgo" || c.estado === "sin_senal_de_riesgo")) {
    const EST = Object.fromEntries((Atlas.data.raw.catalogo.estado_celda_valores || []).map(x => [x.id, x.etiqueta]));
    const riesgo = c.estado === "senal_de_riesgo", n = c.n ? h("span", {class: "n"}, "·" + c.n) : "";
    const a = h("a", {class: "cell seg " + (riesgo ? "neg" : "cx"), href: Atlas.route.href("lineas", linea, {res: res.id, s: subj}),
      title: (EST[c.estado] || "") + " · " + (c.n || 0) + " evidencias" + (c.senal_por_asociacion ? " · por serie de casos asociada: criterio propio del atlas" : "")},
      h("span", {class: "l1"}, c.mejor_nivel ? level(c.mejor_nivel) : "", n), h("span", {class: "l2"}, riesgo ? "señal de riesgo" : "sin señal registrada"));
    if (c.senal_por_asociacion) a.append(h("span", {class: "l3"}, "criterio propio"));
    return a;
  }
  const a = matCell0(c, subj, linea, res);
  if (c && c.senal_por_asociacion && a.append) {
    a.append(h("span", {class: "l3"}, "criterio propio"));
    a.title = "Señal de riesgo por serie de casos asociada: criterio propio del atlas · " + (a.title || "");
  }
  return a;
}
function matCell0(c, subj, linea, res) {
  if (!c) return h("span", {class: "cell c0", "aria-label": "nada curado"});
  const href = Atlas.route.href("lineas", linea, {res: res.id, s: subj});
  const n = c.n ? h("span", {class: "n"}, "·" + c.n) : "";
  if (NO_EFECTO[c.estado]) {
    const [corto, largo] = NO_EFECTO[c.estado];
    return h("a", {class: "cell cx", href, title: largo + " · " + (c.n || 0) + " evidencias"},
      h("span", {class: "l1"}, c.mejor_nivel ? level(c.mejor_nivel) : "", n), h("span", {class: "l2"}, corto));
  }
  if (c.estado === "via_cerrada_o_replantear")
    return h("a", {class: "cell neg", href, title: "Hay un ECA o MA nulo o en contra · " + (c.n || 0) + " evidencias"},
      icon("minus"), c.mejor_nivel ? level(c.mejor_nivel) : "nulo", n);
  if (c.estado === "sin_resultado_a_favor" || !c.mejor_nivel)
    return h("a", {class: "cell neg", href, title: (c.n || 0) + " evidencias, ninguna a favor"}, h("span", {class: "l1"}, "sin efecto", n));
  const fams = Atlas.pivot.cellFamilies(c);
  const atk = c.estado === "linea_de_ataque" ? " · línea de ataque" : "";
  if (fams.length) {
    const inf = c.mecanismo && c.mecanismo.mejor_base === "inferencia";
    const mc = Atlas.pivot.cellMec(c) || {}, unk = mc.det === "desconocido";
    // el nivel al que se VIO el mecanismo, si no es el mejor nivel del efecto (p. ej. efecto ECA de una cepa, exclusión CEL de otra unidad)
    const otroNivel = mc.nivel && mc.nivel !== c.mejor_nivel ? mc.nivel : null;
    return h("a", {class: "cell cm fam-bg-" + fams[0] + (unk ? " det-unk" : ""), href,
      title: "Mecanismo: " + fams.map(f => Atlas.pivot.FAM[f].etq).join(" + ") + (inf ? " (inferido)" : "") +
        (unk ? " · " + Atlas.pivot.DET_TXT : " · determinante identificado") +
        (otroNivel ? " · el mecanismo se vio en " + otroNivel + (mc.unidades.length ? " (" + mc.unidades.map(u => u.startsWith("sp:") ? "especie, sin cepa" : U.name(u)).join(", ") + ")" : "") + ", el efecto llega a " + c.mejor_nivel : "") +
        atk + " · " + (c.n || 0) + " evidencias"},
      h("span", {class: "l1"}, level(c.mejor_nivel), n),
      h("span", {class: "l2"}, fams.map(f => Atlas.pivot.FAM[f].corto).join("+") + (inf ? " ?" : "") + (otroNivel ? " · " + otroNivel : "")),
      unk ? h("span", {class: "l3"}, "det. ?") : "");
  }
  return h("a", {class: "cell cu", href, title: "Evidencia a favor, mecanismo sin identificar" + atk + " · " + (c.n || 0) + " evidencias"},
    h("span", {class: "l1"}, level(c.mejor_nivel), n), h("span", {class: "l2"}, "mecanismo ?"));
}
})();

})();
