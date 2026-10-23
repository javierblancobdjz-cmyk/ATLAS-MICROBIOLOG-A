;(function(){
/* 40_lines.js · P4. Matriz de líneas de producto, huecos y líneas de ataque. */
(function () {
const U = Atlas.ui, D = new Proxy({}, {get: (_, k) => Atlas.data[k]}), h = U.h, icon = U.icon, level = U.level, name = U.name;
const lvlNum = c => ({MA: 1, ECA: 2, OBS: 3, ANI: 4, CEL: 5, "GEN-v": 6, "GEN-p": 6, GEN: 6})[c] || 6;

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
      "Celda vacía = nada curado. Borde gris = hay evidencia pero no se sabe cómo lo hace. Color = familia de mecanismo con fuente. Rosa = nulo o en contra.",
      "Toca el nombre de un resultado (o una celda) para ver quién lo consigue, con qué forma, si funciona con la célula muerta y por qué mecanismo."));

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
        h("h4", {}, name(a.especie), " → ", res ? res.nombre_corto : a.resultado),
        h("dl", {},
          h("dt", {}, "Mecanismo"), h("dd", {}, a.mecanismo_texto, " ", U.sources(a.fuentes_mecanismo)),
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
  el.append(legend());
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

/* Leyenda fija: tres estados de evidencia + familias de mecanismo + nulo. Nunca solo color: cada celda lleva texto. */
function legend() {
  const P = Atlas.pivot;
  return h("div", {class: "mx-legend small", role: "note"},
    h("span", {}, h("span", {class: "sw sw-none"}), "Sin evidencia"),
    h("span", {}, h("span", {class: "sw sw-unk"}), "Evidencia, mecanismo desconocido"),
    ...P.FAM_ORDEN.filter(f => f !== "otro").map(f => h("span", {title: P.FAM[f].que}, h("span", {class: "sw sw-" + f}), "Mecanismo: " + P.FAM[f].corto)),
    h("span", {}, h("span", {class: "sw sw-neg"}), "Nulo o en contra"),
    h("span", {class: "muted"}, "«det. ?» = familia vista, molécula o gen desconocido"));
}

function matCell(c, subj, linea, res) {
  if (!c) return h("span", {class: "cell c0", "aria-label": "sin evidencia"});
  const href = Atlas.route.href("lineas", linea, {res: res.id, s: subj});
  const n = c.n ? h("span", {class: "n"}, "·" + c.n) : "";
  if (c.estado === "via_cerrada_o_replantear")
    return h("a", {class: "cell neg", href, title: "Hay un ECA o MA nulo o en contra · " + (c.n || 0) + " evidencias"},
      icon("minus"), c.mejor_nivel ? level(c.mejor_nivel) : "nulo", n);
  if (c.estado === "sin_resultado_a_favor" || !c.mejor_nivel)   // v1.1: «hueco» sin ningún resultado a favor
    return h("a", {class: "cell neg", href, title: (c.n || 0) + " evidencias, ninguna a favor"}, "0", n);
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
  return h("a", {class: "cell cu", href, title: "Evidencia sin mecanismo identificado" + atk + " · " + (c.n || 0) + " evidencias"},
    h("span", {class: "l1"}, level(c.mejor_nivel), n), h("span", {class: "l2"}, "tiene_mecanismo" in c ? "mecanismo ?" : "mecanismo sin curar"));
}
})();

})();
