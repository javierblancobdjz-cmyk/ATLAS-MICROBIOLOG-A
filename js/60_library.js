;(function(){
/* 60_library.js · P6. Biblioteca y Sobre los datos. */
(function () {
const U = Atlas.ui, D = new Proxy({}, {get: (_, k) => Atlas.data[k]}), h = U.h, icon = U.icon, name = U.name;

/* ---------- BIBLIOTECA ---------- */
Atlas.registerView({route: "biblioteca", tab: "biblioteca", cssClass: "v-biblioteca", render(el, r) {
  el.append(h("h1", {}, "Biblioteca"),
    U.readingBox("biblioteca",
      "Ver todas las referencias y su estado de verificación.",
      "Cada referencia dice cuántas afirmaciones sostiene y si está verificada.",
      "Filtra por estado; toca una fila para abrir la cita con el enlace a PubMed."));
  const refs = Object.values(D.raw.refs);
  const state = {estado: r.query.estado || null, q: ""};
  const bar = h("div", {class: "filters bar"});
  const input = h("input", {type: "search", class: "lib-search", placeholder: "Filtrar por autor, título o PMID", "aria-label": "Filtrar referencias",
    oninput: e => { state.q = e.target.value.toLowerCase(); redraw(); }});
  const tblWrap = h("div", {class: "tbl", "data-scroll": true});
  el.append(bar, input, tblWrap);
  function chip(val, label) { return h("button", {class: "chip", type: "button", "aria-pressed": String(state.estado === val),
    onclick: () => { state.estado = state.estado === val ? null : val; redraw(); }}, label); }
  function pass(rf) {
    const ver = (rf.verificacion && rf.verificacion.estado) || "pendiente";
    if (state.estado === "verif" && ver !== "verificada") return false;
    if (state.estado === "retr" && !rf.retractada) return false;
    if (state.q) { const hay = (rf.autores || []).join(" ") + " " + rf.titulo + " " + (rf.pmid || ""); if (!hay.toLowerCase().includes(state.q)) return false; }
    return true;
  }
  function redraw() {
    bar.innerHTML = ""; bar.append(chip("verif", "Solo verificadas"), chip("retr", "Retractadas"));
    tblWrap.innerHTML = "";
    const rows = refs.filter(pass).sort((a, b) => (b.anio || 0) - (a.anio || 0));
    const table = h("table", {}, h("thead", {}, h("tr", {},
      h("th", {class: "stick"}, "Referencia"), h("th", {}, "Año"), h("th", {}, "Revista"), h("th", {}, "Afirmaciones"), h("th", {}, "Estado"))));
    const tb = h("tbody", {});
    rows.forEach(rf => {
      const ver = (rf.verificacion && rf.verificacion.estado) || "pendiente";
      const ev0 = (rf.evidencias || [])[0];
      tb.append(h("tr", {class: ev0 ? "clickrow" : "", onclick: ev0 ? () => U.openCitation(ev0) : null},
        h("th", {class: "stick", scope: "row", style: "font-weight:400"}, (rf.autores || []).slice(0, 3).join(", "), ". ", h("span", {class: "small"}, rf.titulo)),
        h("td", {}, String(rf.anio || "—")), h("td", {class: "small"}, rf.revista || "—"),
        h("td", {}, String((rf.evidencias || []).length)),
        h("td", {}, rf.retractada ? h("span", {class: "mark no"}, icon("retr"), "Retractada") : h("span", {class: "mark " + (ver === "verificada" ? "ok" : "pend")}, icon(ver === "verificada" ? "ok" : "pend"), ver === "verificada" ? "Verificada" : "Pendiente"))));
    });
    if (!rows.length) tb.append(h("tr", {}, h("td", {colspan: 5, class: "muted"}, "Sin referencias con ese filtro.")));
    table.append(tb); tblWrap.append(table);
    tblWrap.addEventListener("scroll", () => tblWrap.classList.toggle("scrolled", tblWrap.scrollLeft > 2), {passive: true});
  }
  redraw();
  if (r.query.ref) { const rf = D.ref(r.query.ref); const ev0 = rf && (rf.evidencias || [])[0]; if (ev0) U.openCitation(ev0); }
}});

/* ---------- SOBRE LOS DATOS ---------- */
Atlas.registerView({route: "datos", tab: "datos", cssClass: "v-datos", render(el) {
  const m = D.meta, t = m.totales;
  el.append(h("h1", {}, "Sobre los datos"),
    U.readingBox("datos",
      "Saber de dónde salen los datos y cómo se han verificado.",
      "Cada afirmación lleva fuente verificable; nada no verificado cuenta en los agregados.",
      "Aquí están la fecha de corte, el método, la verificación y las limitaciones."));
  el.append(h("div", {class: "home-stats card"},
    stat(t.especies, "especies"), stat(t.cepas, "cepas"), stat(t.evidencias, "evidencias"),
    stat(t.referencias, "referencias"), stat(m.pct_verificadas + " %", "verificadas")));

  el.append(sect("Fecha y versión", h("p", {}, `Corte de datos: ${m.fecha_corte}. Build ${m.build}, esquema ${m.schema_version}, catálogo ${m.catalogo_v}. Generado ${m.generado}.`)));

  el.append(sect("Método de verificación",
    h("p", {}, "Toda referencia pasa un script que comprueba PMID/DOI (título, año y revista) y que la frase clave aparece en el resumen de PubMed. La frase literal solo vive en la caché local de verificación: la app no reproduce resúmenes."),
    h("p", {}, `Modo de datos no verificados: ${m.modo_no_verificadas}. ` + (m.modo_no_verificadas === "drop" ? "Lo no verificado se descarta y, en cascada, lo que dependía de ello." : "Lo no verificado se marca pero no cuenta en agregados."))));

  const desc = m.descartadas || [];
  el.append(sect("Verificación y auditoría",
    h("p", {}, `Referencias verificadas: ${m.pct_verificadas} %. Avisos de validación (no bloquean): ${m.avisos_validacion}.`),
    desc.length ? h("div", {}, h("p", {class: "sub"}, "Descartado por no verificado o auditoría"), h("ul", {class: "mini-list"}, desc.map(d => h("li", {}, typeof d === "string" ? d : JSON.stringify(d))))) : h("p", {class: "muted"}, "Nada descartado en este corte.")));

  const dev = m.devoluciones || [];
  el.append(sect("Devoluciones del director",
    dev.length ? h("ul", {class: "mini-list"}, dev.map(d => h("li", {}, (d.agente ? d.agente + " (ronda " + (d.ronda || "?") + "): " : "") + (d.motivo || d.resolucion || JSON.stringify(d))))) : h("p", {class: "muted"}, "Sin devoluciones registradas en los datos de este corte.")));

  const lim = m.limitaciones || [];
  const limBase = [
    "Catálogo de resultados provisional: puede cambiar antes de ampliar los datos.",
    "Algunos DOI de la caché están marcados dudosos (error conocido del verificador); el enlace usa PMID cuando existe.",
    "Cobertura: 14 especies con dossier completo; el resto, por llegar.",
  ];
  el.append(sect("Limitaciones", h("ul", {class: "mini-list"}, [...lim, ...limBase].map(x => h("li", {}, typeof x === "string" ? x : (x.texto || JSON.stringify(x)))))));

  el.append(sect("Cómo ampliar",
    h("p", {}, "Añadir una especie o una cepa: copiar el ejemplo, validar, verificar las referencias, reconstruir y republicar. Las cepas propias van aparte y nunca se publican. Detalle en docs/ACTUALIZAR.md.")));
}});

function stat(n, label) { return h("div", {class: "stat"}, h("b", {}, String(n)), h("span", {}, label)); }
function sect(title, ...body) { return h("section", {class: "about-sec card"}, h("h2", {}, title), ...body); }
})();

})();
