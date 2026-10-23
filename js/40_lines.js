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
  el.append(h("h1", {}, "Líneas de producto"),
    U.readingBox("lineas",
      "Encontrar huecos con potencial de producto en una línea.",
      "Línea de ataque = mecanismo plausible con fuente, mejor nivel ≤ animal y sin nulo humano.",
      "Diana ámbar = línea de ataque. Punteado = hueco. Rosa = vía cerrada (hay un ECA/MA nulo o en contra)."));

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

  const wrap = h("div", {class: "tbl mx", "data-scroll": true});
  const thead = h("thead", {}, h("tr", {}, h("th", {class: "stick"}, "Bacteria"),
    ...resultados.map(res => h("th", {}, res.nombre_corto || res.nombre))));
  const tb = h("tbody", {});
  especies.forEach(s => {
    const tr = h("tr", {}, h("th", {class: "stick", scope: "row"},
      h("a", {href: Atlas.route.href("especie", s.slug)}, h("i", {class: "bn"}, s.nombre_corto))));
    resultados.forEach(res => {
      const c = mat[s.slug + "|" + res.id];
      tr.append(h("td", {}, matCell(c, s.slug, active, res.id)));
    });
    tb.append(tr);
  });
  if (!especies.length) tb.append(h("tr", {}, h("td", {class: "muted"}, "Sin datos en esta línea.")));
  wrap.append(h("table", {}, thead, tb)); el.append(wrap);
  el.append(h("p", {class: "swipe"}, "Desliza para ver más resultados →"));
  wrap.addEventListener("scroll", e => e.currentTarget.classList.toggle("scrolled", e.currentTarget.scrollLeft > 2), {passive: true});
}});

function matCell(c, subj, linea, res) {
  if (!c) return h("span", {class: "cell gap", "aria-label": "sin evidencia"}, "—");
  if (c.estado === "linea_de_ataque")
    return h("a", {class: "cell atk", href: Atlas.route.href("lineas", linea, {ataque: "1"}), title: "Línea de ataque"}, icon("target"), "Ataque · " + (c.mejor_nivel || ""));
  if (c.estado === "via_cerrada_o_replantear")
    return h("span", {class: "cell neg", title: "Hay un ECA o MA nulo o en contra"}, icon("minus"), level(c.mejor_nivel));
  if (c.estado === "hueco_sin_mecanismo")
    return h("span", {class: "cell gap", title: "Hueco sin mecanismo conocido", "aria-label": "hueco"}, "—");
  return h("a", {class: "cell", "data-l": lvlNum(c.mejor_nivel), href: Atlas.route.href("especie", subj),
    title: (c.n || 0) + " evidencias"}, level(c.mejor_nivel), c.n ? h("span", {class: "n"}, "·" + c.n) : "");
}
})();

})();
