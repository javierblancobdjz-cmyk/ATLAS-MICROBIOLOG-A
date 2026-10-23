;(function(){
/* 50_question.js · P5. Modo pregunta: bacteria/cepa + línea + forma (+ población) → veredicto razonado. */
(function () {
const U = Atlas.ui, D = new Proxy({}, {get: (_, k) => Atlas.data[k]}), h = U.h, icon = U.icon, level = U.level, name = U.name;
const FORMAS = [["vivo", "Vivo"], ["posbiotico", "Posbiótico"], ["fermentado", "Fermentado"]];
const VIC = {solida: "ok", prometedora: "target", especulativa: "q", desaconsejada: "no", sin_datos: "pend"};
const SCALE = [["solida", "Sólida"], ["prometedora", "Prometedora"], ["especulativa", "Especulativa"], ["desaconsejada", "Desaconsejada"], ["sin_datos", "Sin datos suficientes"]];

Atlas.registerView({route: "pregunta", tab: "pregunta", cssClass: "v-pregunta", render(el, r) {
  const q = r.query;
  const b = q.b || null, l = q.l || null, f = q.f || "vivo", pob = q.p || null;
  const POB = (D.raw.catalogo.chip_poblacion) || ["sano_general", "con_la_condicion", "mayor_o_fragil", "pediatrico_lactante", "embarazo_lactancia", "inmunodeprimido_o_cateter"];
  const POBLAB = {sano_general: "Sano general", con_la_condicion: "Con la condición", mayor_o_fragil: "Mayor o frágil", pediatrico_lactante: "Pediátrico/lactante", embarazo_lactancia: "Embarazo/lactancia", inmunodeprimido_o_cateter: "Inmunodeprimido/catéter"};
  el.append(h("h1", {}, "Modo pregunta"),
    U.readingBox("pregunta",
      "¿Sirve esta bacteria para este producto, con esta forma?",
      "Veredicto en 5 categorías con la regla aplicada visible; cada razón lleva su fuente.",
      "Elige bacteria, línea y forma. El veredicto se calcula sobre lo demostrado, nunca con una puntuación sin razones."));

  // Selectores
  const sel = h("div", {class: "q-selectors"});
  // bacteria
  const opts = [h("option", {value: ""}, "— elige bacteria o cepa —")];
  D.allSpecies().sort((a, b) => a.nombre_actual.localeCompare(b.nombre_actual)).forEach(s => {
    opts.push(h("option", {value: s.slug, selected: s.slug === b}, s.nombre_actual));
    (s.cepas || []).map(D.strain).filter(Boolean).forEach(st => opts.push(h("option", {value: st.id, selected: st.id === b}, "   " + s.nombre_corto + " " + (st.designacion || st.nombre_corto))));
  });
  const bsel = h("select", {class: "field-select", "aria-label": "Bacteria o cepa", onchange: e => Atlas.route.patch({b: e.target.value || null})}, opts);
  sel.append(h("div", {class: "q-field"}, h("label", {}, "Bacteria o cepa"), bsel));
  // línea
  const lineaChips = h("div", {class: "seg scroller"});
  D.lineas("producto").forEach(ln => lineaChips.append(h("button", {class: "chip", type: "button", "aria-pressed": String(ln.id === l),
    onclick: () => Atlas.route.patch({l: ln.id})}, ln.nombre)));
  sel.append(h("div", {class: "q-field"}, h("label", {}, "Línea"), lineaChips));
  // forma
  const formaChips = h("div", {class: "seg"});
  FORMAS.forEach(([id, lab]) => formaChips.append(h("button", {class: "chip", type: "button", "aria-pressed": String(id === f),
    onclick: () => Atlas.route.patch({f: id})}, lab)));
  sel.append(h("div", {class: "q-field"}, h("label", {}, "Forma"), formaChips));
  el.append(sel);

  // población (6 clases del contrato); informativa: afina el encuadre del veredicto
  const pobRow = h("div", {class: "q-field q-pob"}, h("label", {}, "Población"), h("div", {class: "seg scroller"},
    POB.map(pb => h("button", {class: "chip", type: "button", "aria-pressed": String(pb === pob),
      onclick: () => Atlas.route.patch({p: pb === pob ? null : pb})}, POBLAB[pb] || pb))));
  el.append(pobRow);

  if (!b || !l) { el.append(h("div", {class: "card empty"}, h("p", {}, "Elige una bacteria y una línea para ver el veredicto."))); return; }

  const v = D.verdict(b, l, f);
  if (!v) {
    el.append(renderVerdict({veredicto: "sin_datos", subtitulo: "esa combinación no tiene datos", a_favor: [], en_contra: [], lo_que_falta: [], regla_aplicada: "—"}, b, l, f, pob));
    return;
  }
  el.append(renderVerdict(v, b, l, f, pob));
  if (pob) {
    const mapa = (D.raw.catalogo.mapa_chip || {})[pob];
    const clases = mapa && mapa.poblacion_clase || [];
    const match = v.poblacion && clases.includes(v.poblacion);
    el.append(h("p", {class: "small muted", style: "margin-top:12px"},
      "Población elegida: " + (POBLAB[pob] || pob) + ". " +
      (v.poblacion ? (match ? "El dossier razona sobre esta misma población." : "Aviso: el dossier razona sobre «" + String(v.poblacion).replace(/_/g, " ") + "»; ajusta la lectura a tu población.") : "El veredicto es de especie/cepa, no específico de población.")));
  }
}});

function renderVerdict(v, b, l, f) {
  const out = h("div", {});
  const block = h("div", {class: "verdict", "data-v": v.veredicto},
    h("div", {class: "v-ic"}, icon(VIC[v.veredicto] || "q")),
    h("div", {},
      h("h3", {}, U.verdictLabel(v.veredicto) + (v.subtitulo ? ", " + v.subtitulo : "")),
      v.poblacion ? h("p", {class: "small muted"}, "Población: " + String(v.poblacion).replace(/_/g, " ")) : "",
      h("ol", {class: "scale", "aria-label": "Escala de veredicto"},
        SCALE.map(([id, lab]) => h("li", {"aria-current": String(id === v.veredicto)}, lab)))));
  out.append(block);

  // puertas
  if (v.puertas) {
    const g = v.puertas;
    out.append(h("div", {class: "gates"},
      gate("Seguridad", g.seguridad), gate("Regulación", g.regulatorio), gate("Tecnología", g.tecnologia)));
  }

  // tres columnas
  const cols = h("div", {class: "cols3"},
    colBlock("A favor", "pro", "plus", v.a_favor, v),
    colBlock("En contra", "con", "minus", v.en_contra, v),
    colBlock("Lo que falta", "gap", "q", v.lo_que_falta, v));
  out.append(cols);

  // ruta + regla
  out.append(h("div", {class: "how"},
    v.ruta_regulatoria ? h("span", {}, h("b", {}, "Ruta probable: "), v.ruta_regulatoria) : "",
    h("span", {}, h("b", {}, "Cómo se ha decidido: "), "regla " + (v.regla_aplicada || "—") + " · " + (v.autor === "estratega" ? "dossier del estratega" : "automático")),
    v.ataque ? h("span", {class: "mark atk"}, icon("target"), "Línea de ataque") : ""));
  return out;
}
function gate(label, estado) {
  const cls = estado === "no" || estado === "cerrada" || estado === "problematica" ? "bad" : estado === "condicionada" ? "warn" : "ok";
  return h("span", {class: "gate-pill gate-" + cls}, h("b", {}, label + ": "), (estado || "—").replace(/_/g, " "));
}
function colBlock(title, cls, ic, reasons, v) {
  const col = h("div", {class: "col col-" + cls}, h("h4", {}, icon(ic), " " + title));
  const ul = h("ul", {});
  (reasons || []).forEach(r => {
    ul.append(h("li", {}, h("p", {}, U.reasonText(r, v)),
      (r.fuentes && r.fuentes.length) ? h("div", {class: "tags"}, U.sources(r.fuentes)) : ""));
  });
  if (!(reasons || []).length) ul.append(h("li", {class: "muted"}, "—"));
  col.append(ul);
  return col;
}
})();

})();
