;(function(){
/* 60_library.js · Biblioteca y «Sobre los datos».
   v2 (P1-01, P1-05, P1-07): «Sobre los datos» lee meta.construccion (fecha y sha256 del build), meta.limitaciones,
   genomica.cobertura (cifras reales tras la ampliación NCBI) y el índice del buscador (Atlas.searchIndex).
   Ningún número se escribe a mano en este fichero: todo sale de data/. */
(function () {
const U = Atlas.ui, D = new Proxy({}, {get: (_, k) => Atlas.data[k]}), h = U.h, icon = U.icon;
const sinGuion = s => String(s == null ? "" : s).replace(/_/g, " ");
/* textos redactados en los datos que citan ficheros o campos: el identificador va en <code>, no como prosa con guion bajo */
const tecnico = txt => String(txt == null ? "" : txt).split(/([\w./\-\[\]]*_[\w./\-\[\]]*)/).map((t, i) => i % 2 ? Atlas.ui.h("code", {}, t) : t);
const fmt = n => typeof n === "number" ? n.toLocaleString("es-ES") : String(n == null ? "—" : n);

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
  tblWrap.addEventListener("scroll", () => tblWrap.classList.toggle("scrolled", tblWrap.scrollLeft > 2), {passive: true});
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
  }
  redraw();
  if (r.query.ref) { const rf = D.ref(r.query.ref); const ev0 = rf && (rf.evidencias || [])[0]; if (ev0) U.openCitation(ev0); }
}});

/* ---------- SOBRE LOS DATOS ---------- */
/* qué hace cada paso del orquestador (texto de pantalla; el nombre del paso y su orden salen de meta.construccion.pasos) */
const PASO = {
  aplicar_correcciones_curadas: ["Correcciones curadas", "seguridad y regulatorio de las especies, desde un TSV con guarda (si el texto de partida no coincide, el paso falla)"],
  generar_v12: ["Evidencias y derivados", "evidencias, celdas, matriz, catálogo, veredictos y líneas de ataque, desde la versión 1.1 congelada y los lotes de curación"],
  derivar_genomica: ["Genómica", "llamadas por genoma (genomica.json) desde los CSV de fuentes públicas: análisis de Javier sobre genomas NCBI y ampliación RefSeq"],
  rasgos_v12: ["Rasgos", "qué produce cada especie y por qué vía (output × vía), sin rasgos de criterio propio en los cálculos"],
  vecinos_v12: ["Parecidas", "tres ejes (funcional, resultado, taxonómico); lee los rasgos del paso anterior"],
  "build_puerta_cepa + cierre": ["Puerta por cepa y cierre", "reglas de venta por cepa × forma (puerta_cepa.json) y cierre de meta"],
  build_puerta_cepa: ["Puerta por cepa", "reglas de venta por cepa × forma (puerta_cepa.json)"],
  control_publico: ["Control de privacidad", "data/ y las fuentes públicas se comparan con una lista local, no versionada, de códigos privados; con una coincidencia no se publica"],
  tests: ["Pruebas", "pruebas de contrato sobre los datos generados"],
};
const ESTADO_GEN = {medido: ["ok", "medido"], ausente: ["ok", "ausente (medido)"], no_medido: ["nd", "no medido"]};

Atlas.registerView({route: "datos", tab: "datos", cssClass: "v-datos", render(el) {
  const m = D.meta, t = m.totales || {}, G = D.raw.genomica, B = m.construccion || {};
  el.append(h("h1", {}, "Sobre los datos"),
    U.readingBox("datos",
      "Saber de dónde sale cada dato, cómo se reconstruye y qué no se ha medido.",
      "Cada afirmación lleva fuente verificable; lo no medido se dice como tal y nunca cuenta como ausencia.",
      "Arriba, las cifras del corte. Debajo: cómo se construye, limitaciones, cobertura genómica, buscador y criterios propios."));
  el.append(h("div", {class: "home-stats card sd-stats"},
    stat(t.especies, "especies"), stat(t.cepas, "cepas"), stat(t.evidencias, "evidencias"),
    stat(t.contexto, "registros de contexto (no cuentan)"), stat(t.referencias, "referencias"), stat(m.pct_verificadas + " %", "verificadas")));

  const secciones = [];
  const add = (id, titulo, ...body) => { const s = sect(id, titulo, ...body); secciones.push([id, titulo]); return s; };
  const cuerpo = [];

  /* 1 · Cómo se construyen los datos */
  const pasos = B.pasos || [];
  const carpeta = B.fecha ? "scripts/datos/salidas/" + B.fecha.replace(/-/g, "") + "/" : null;
  cuerpo.push(add("sd-build", "Cómo se construyen los datos",
    h("p", {}, "Nada se edita a mano en data/. Un orquestador en Python, solo con la biblioteca estándar, reconstruye todos los ficheros desde la versión 1.1 congelada, las tablas curadas, los lotes de curación y las fuentes públicas. La app solo lee el resultado: no recalcula nada salvo «¿funciona muerta?», cuya paridad con Python se prueba."),
    pasos.length ? h("ol", {class: "sd-pasos"}, pasos.map(p => { const [t1, t2] = PASO[p] || [sinGuion(p), ""];
      return h("li", {}, h("b", {}, t1), t2 ? h("span", {}, ": ", ...tecnico(t2), ".") : ""); })) : h("p", {class: "muted"}, "Pasos no declarados en este corte."),
    h("dl", {class: "sd-dl"},
      dtdd("Build", B.fecha ? "del " + B.fecha + " · versión " + (m.build || "—") + " · esquema " + (m.schema_version || "—") + (m.revision ? " · revisión " + m.revision : "") : h("span", {class: "muted"}, "fecha no declarada")),
      dtdd("Corte de la literatura", m.fecha_corte || "—"),
      dtdd("sha256 del build", B.sha256_build ? h("span", {}, h("code", {class: "sd-sha"}, B.sha256_build), B.sha256_que_es ? h("small", {class: "muted sd-blk"}, B.sha256_que_es + ". Dos ejecuciones con la misma fecha dan el mismo valor.") : "") : h("span", {class: "muted"}, "no declarado")),
      (m.lotes_integrados || []).length ? dtdd("Lotes de curación", h("span", {}, ...(m.lotes_integrados || []).map(l => h("code", {}, l)),
        (m.lotes_sustituidos || []).length ? h("span", {}, " sustituye a ", ...m.lotes_sustituidos.map(l => h("code", {}, l)), ", que ya no se lee") : "")) : null,
      dtdd("Regenerar", h("code", {class: "sd-cmd"}, "python3 -I " + (B.orquestador || "scripts/datos/construir_datos.py") + " --fecha " + (B.fecha || "AAAA-MM-DD") + " --publicar")),
      carpeta ? dtdd("Registro del build", h("span", {}, h("code", {}, carpeta), h("small", {class: "muted sd-blk"}, "estado de cada paso, sha256 de entradas y salidas, diferencias con la versión 1.1 y resumen"))) : null)));

  /* 2 · Limitaciones (meta.limitaciones) */
  const lim = m.limitaciones || [];
  cuerpo.push(add("sd-lim", "Limitaciones de este corte",
    lim.length ? h("ul", {class: "sd-lim"}, lim.map(x => h("li", {},
      h("p", {}, ...tecnico(typeof x === "string" ? x : x.texto)),
      x.fuente ? h("p", {class: "small muted"}, "Cifra calculada de: ", h("code", {}, x.fuente)) : ""))) : h("p", {class: "muted"}, "Sin limitaciones declaradas en meta.json.")));

  /* 2b · Cómo se lee la matriz (leyenda de 3 estados; qué no cuenta como efecto). Recuentos calculados de matriz.json. */
  {
    const MX = D.raw.matriz || {}, EST = Object.fromEntries((D.raw.catalogo.estado_celda_valores || []).map(x => [x.id, x.etiqueta]));
    const n = {}, lin = {};
    Object.entries(MX).forEach(([l, cells]) => Object.values(cells).forEach(c => { n[c.estado] = (n[c.estado] || 0) + 1; if (!lin[c.estado]) lin[c.estado] = l; }));
    const ej = lin.solo_mezcla || lin.solo_asociacion;
    cuerpo.push(add("sd-mx", "Cómo se lee la matriz",
      h("p", {}, "Cada celda cruza una especie con un resultado y tiene uno de tres estados visuales, siempre con texto además del color:"),
      h("ul", {class: "mini-list"},
        h("li", {}, h("b", {}, "Color de familia de mecanismo"), " (exclusión del patógeno, antagonismo activo, vía del hospedador): hay evidencia a favor y un mecanismo con nombre. Si la molécula o el gen se desconocen, el relleno es pálido y la celda dice «det. ?»."),
        h("li", {}, h("b", {}, "«mecanismo ?»"), " en gris discontinuo: hay evidencia a favor, pero ningún ensayo identificó cómo actúa."),
        h("li", {}, h("b", {}, "Nulo o en contra"), " en rosa: se probó y no salió a favor («sin efecto»); si fue un ECA o un metaanálisis, la vía queda cerrada o a replantear.")),
      h("p", {}, "No cuentan como efecto, y van en gris discontinuo con su rótulo: ", h("b", {}, "asociación"), " (", EST.solo_asociacion || "se observa, no se interviene", "; " + fmt(n.solo_asociacion || 0) + " celdas) y ",
        h("b", {}, "en mezcla"), " (", EST.solo_mezcla || "solo en mezcla de cepas", "; " + fmt(n.solo_mezcla || 0) + " celdas). Tampoco suman en el pivote: salen en secciones aparte.",
        ej ? h("span", {}, " Ejemplo: ", h("a", {href: Atlas.route.href("lineas", ej)}, (D.linea(ej) || {}).nombre || ej), ".") : ""),
      h("p", {class: "small muted"}, "Toda celda lleva al pivote de su resultado con la fila de la especie resaltada. Una columna sin celdas es un hueco de curación, no una ausencia demostrada.")));
  }

  /* 3 · Cobertura genómica real (genomica.json) */
  if (G && G.cobertura) cuerpo.push(add("sd-gen", "Cobertura genómica", ...coberturaGenomica(G)));

  /* 4 · Cómo se construye el buscador */
  const S = Atlas.searchIndex ? Atlas.searchIndex() : null;
  cuerpo.push(add("sd-busq", "Cómo se construye el buscador",
    h("p", {}, "No hay fichero de búsqueda mantenido a mano. Al arrancar, el navegador deriva el índice de los mismos datos que ves en las fichas:"),
    h("ul", {class: "mini-list"},
      h("li", {}, h("b", {}, "Especies y cepas"), ": nombre actual, nombre corto, sinónimos y basónimos; designación, otros nombres y depósitos de colección."),
      h("li", {}, h("b", {}, "Resultados"), ": los del catálogo, con su número de evidencias o, si no hay, «sin evidencia curada» y los PMID en cola."),
      h("li", {}, h("b", {}, "Outputs"), ": qué produce cada especie y por qué vía (vocabulario de rasgos); llevan al pivote «quién lo produce»."),
      h("li", {}, h("b", {}, "Mecanismos"), ": clases de mecanismo y mecanismos concretos del catálogo; llevan al pivote «quién actúa así»."),
      h("li", {}, h("b", {}, "Genes"), ": los que nombra el ensayo de una evidencia, los de los rasgos y los típicos de cada vía."),
      h("li", {}, h("b", {}, "Moléculas"), ": moléculas y funciones declaradas en cada especie."),
      h("li", {}, h("b", {}, "Texto"), ": la última línea cuenta en cuántas evidencias curadas aparece la palabra («X en N evidencias»).")),
    h("p", {}, "Los nombres se buscan por principio de palabra y el texto por palabra exacta o su plural, nunca por un trozo interior: «candida» no encuentra «candidato» ni «candidiasis»; si no hay nada, el buscador propone las palabras del atlas con la misma raíz. Los marcadores genómicos todavía no se indexan: llegarán con la vista por marcador."),
    S ? h("p", {class: "small muted"}, "Índice de esta sesión: " + fmt(S.total) + " entradas (" + S.porGrupo.map(g => g.etq.toLowerCase() + " " + fmt(g.n)).join(", ") + ") y el texto de " + fmt(S.evidencias) + " evidencias y " + fmt(S.rasgos) + " rasgos.") : "",
    h("p", {class: "small"}, "Que un término no aparezca no demuestra que no exista: significa que ningún dato curado lo nombra (hueco de curación, no ausencia demostrada).")));

  /* 5 · Criterio propio del atlas (calculado de los datos) */
  cuerpo.push(add("sd-cp", "Lo que es criterio propio del atlas", ...criterioPropio()));

  /* 6 · Verificación */
  const desc = m.descartadas || [];
  cuerpo.push(add("sd-ver", "Método de verificación",
    h("p", {}, "Toda referencia pasa un script que comprueba PMID o DOI (título, año y revista) y que la frase clave aparece en el resumen de PubMed. La frase literal solo vive en la caché local de verificación: la app no reproduce resúmenes."),
    h("p", {}, "Modo de datos no verificados: " + (m.modo_no_verificadas === "drop" ? "se descartan, y en cascada lo que dependía de ellos." : "se marcan pero no cuentan en los agregados.")),
    h("p", {}, "Referencias verificadas: " + m.pct_verificadas + " %. Avisos de validación (no bloquean): " + fmt(m.avisos_validacion) + "."),
    desc.length ? h("div", {}, h("p", {class: "sub"}, "Descartado por no verificado o por auditoría"),
      h("ul", {class: "mini-list"}, desc.map(d => h("li", {}, typeof d === "string" ? d : (d.texto || d.motivo || d.id || "registro descartado"))))) : h("p", {class: "muted"}, "Nada descartado en este corte.")));

  cuerpo.push(add("sd-amp", "Cómo ampliar",
    h("p", {}, "Una evidencia nueva entra como lote de curación (con su verificación frase a frase) y una corrida genómica nueva como CSV en fuentes públicas; después se vuelve a ejecutar el orquestador. Las cepas propias nunca se publican: el control de privacidad lo impide.")));

  el.append(h("nav", {class: "sd-toc", "aria-label": "Secciones de la página"}, secciones.map(([id, titulo]) =>
    h("button", {type: "button", class: "chip", onclick: () => { const s = document.getElementById(id); if (s) s.scrollIntoView({behavior: "smooth", block: "start"}); }}, titulo))));
  cuerpo.forEach(s => el.append(s));
}});

function coberturaGenomica(G) {
  const C = G.cobertura, tab = C.tabla || [];
  const v = k => (tab.find(x => x.clave === k) || {}).valor;
  const filas = (pref, extra = []) => tab.filter(x => x.clave.startsWith(pref) || extra.includes(x.clave));
  const tabla = rows => h("table", {class: "mini-table sd-cob"}, h("tbody", {}, rows.map(x => {
    const sub = /^…/.test(x.que);
    return h("tr", {class: sub ? "sd-sub" : ""}, h("th", {scope: "row"}, x.que.replace(/^…\s*/, sub ? "… " : ""),
      x.detalle ? h("small", {class: "muted sd-blk"}, x.detalle) : ""), h("td", {class: "sd-num"}, fmt(x.valor)));
  })));
  const out = [];
  out.push(h("p", {}, "Los análisis genómicos se hicieron sobre genomas públicos de NCBI: el análisis de Javier (marcadores con anotación Bakta, BAGEL4, ABRicate) y una ampliación con genomas RefSeq anotados por NCBI (PGAP). ",
    h("b", {}, fmt(v("especies_con_analisis")) + " de " + fmt(v("especies_atlas")) + " especies"), " tienen algún análisis; ",
    h("b", {}, fmt(v("genomas_con_llamadas")) + " genomas"), " tienen llamadas de marcadores; ",
    h("b", {}, fmt(v("cepas_con_perfil")) + " de " + fmt(v("cepas_atlas")) + " cepas"), " del atlas tienen perfil, " + fmt(v("cepas_vinculadas_por_nombre")) + " de ellas vinculadas por nombre (verificar)."));
  out.push(h("div", {class: "sd-cols"},
    h("div", {}, h("h3", {}, "Especies"), tabla(filas("especies_"))),
    h("div", {}, h("h3", {}, "Genomas públicos"), tabla(filas("genomas_"))),
    h("div", {}, h("h3", {}, "Cepas del atlas"), tabla(filas("cepas_")))));
  /* lo que no se corrió sobre públicos: barra por grupo, el gris discontinuo es «no medido», nunca «ausente» */
  const nm = C.no_medido_en_publicos || [];
  if (nm.length) {
    const tot = v("genomas_con_llamadas");
    out.push(h("h3", {}, "Lo que no se corrió sobre los " + fmt(tot) + " genomas con llamadas"),
      h("div", {class: "sd-bars"}, nm.map(x => {
        const est = x.estado_en_genomas_con_llamadas || {}, n = Object.values(est).reduce((a, b) => a + b, 0) || 1;
        const ids = x.ids || [], idsTxt = ids.length > 5 ? ids[0] + " a " + ids[ids.length - 1] : ids.join(", ");
        return h("div", {class: "sd-bar-row"},
          h("p", {class: "sd-bar-lab"}, h("b", {}, idsTxt), h("span", {class: "small muted"}, " · " + (x.motivo || ""))),
          h("div", {class: "sd-bar", role: "img", "aria-label": Object.entries(est).map(([k, c]) => (ESTADO_GEN[k] || ["", sinGuion(k)])[1] + " " + c).join(", ")},
            Object.entries(est).map(([k, c]) => h("span", {class: "sd-seg sd-seg-" + ((ESTADO_GEN[k] || ["nd"])[0]), style: "flex-grow:" + c}))),
          h("p", {class: "small sd-bar-leg"}, Object.entries(est).flatMap(([k, c], i) => [i ? " · " : "", h("b", {}, fmt(c)), " " + (ESTADO_GEN[k] || ["", sinGuion(k)])[1]])));
      })));
  }
  /* anotadores y fiabilidad de PGAP frente a Bakta */
  const an = G.anotadores || {};
  if (Object.keys(an).length) out.push(h("h3", {}, "Quién hizo cada llamada"),
    h("dl", {class: "sd-dl"}, Object.entries(an).map(([k, txt]) => dtdd(k, h("span", {}, ...tecnico(txt))))));
  const VP = G.validacion_pgap || {}, nombre = id => ((G.marcadores || []).find(x => x.id === id) || {}).nombre || sinGuion(id);
  const fiable = [], poco = [], noap = [];
  Object.entries(VP).forEach(([id, x]) => {
    const det = Object.values(x.detalle || {}), conc = det.map(d => d.concordancia_estado_pct).filter(c => c != null);
    const txt = nombre(id) + (conc.length ? " (" + conc.map(c => String(c).replace(".", ",") + " %").join(" / ") + ")" : "");
    if (det.every(d => d.fiabilidad == null)) noap.push(nombre(id)); else (x.fiable_sobre_pgap ? fiable : poco).push(txt);
  });
  if (fiable.length || poco.length) out.push(h("h3", {}, "Fiabilidad de la anotación de NCBI (PGAP) frente a Bakta"),
    h("p", {class: "small"}, "Concordancia de estado entre las dos anotaciones en los genomas que tienen ambas. Un marcador poco fiable sobre PGAP sale «no evaluable con la anotación de NCBI», nunca ausente."),
    h("ul", {class: "mini-list"},
      fiable.length ? h("li", {}, h("b", {}, "Fiables, entran en la ficha: "), fiable.join("; ")) : "",
      poco.length ? h("li", {}, h("b", {}, "Poco fiables, no evaluables con PGAP: "), poco.join("; ")) : "",
      noap.length ? h("li", {}, h("b", {}, "No dependen de la anotación (ABRicate): "), noap.join("; ")) : ""));
  if (G.ani) out.push(h("h3", {}, "Parentesco genómico (ANI)"),
    h("p", {class: "small"}, ...tecnico(G.ani.nota || "")), G.ani.metodo ? h("p", {class: "small muted"}, "Método: ", ...tecnico(G.ani.metodo), ".") : "");
  if (C.aviso_taxonomico) out.push(h("p", {class: "small muted"}, ...tecnico(C.aviso_taxonomico)));
  out.push(h("p", {class: "small muted"}, "Generado por ", h("code", {}, G.generado_por || "—"), " (" + (G.version || "—") + ")."));
  return out;
}

function criterioPropio() {
  const R = D.raw, evs = Object.values(R.evidencias).filter(e => (e.tipo || "evidencia") === "evidencia");
  const relCur = evs.filter(e => e.relacion_origen === "curado");
  const porRel = {}; relCur.forEach(e => { porRel[e.relacion] = (porRel[e.relacion] || 0) + 1; });
  const relEtq = id => (((R.catalogo.relacion_valores || []).find(x => x.id === id) || {}).etiqueta || sinGuion(id)).split(" (")[0];
  const subcl = evs.filter(e => e.mecanismo && (e.mecanismo.subclases || []).length).length;
  const pc = (R.puerta_cepa && R.puerta_cepa.cepas) || {};
  const posbCP = Object.values(pc).filter(c => { const p = (c.puerta_por_forma || {}).posbiotico; return p && /criterio propio/.test(p.razon || ""); }).length;
  const segE = (R.puerta_cepa && R.puerta_cepa.seguridad_especie) || {};
  /* «a revisar» sin decisión de EFSA detrás (ni no-recomendación ni exclusión de QPS): es juicio del atlas */
  const aRevisar = Object.entries(segE).filter(([, s]) => s.estado === "a_revisar" && !(s.motivos || []).some(x => /EFSA|excluida de la evaluaci/.test(x)))
    .map(([slug, s]) => ((D.species(slug) || {}).nombre_corto || slug) + " (" + String((s.motivos || [])[0] || "sin motivo declarado").replace(/[.;].*$/, "").replace(/\s*\(criterio propio[^)]*\)/, "").trim().toLowerCase() + ")");
  const rasCP = Object.values(R.especies).flatMap(s => (s.rasgos || []).filter(t => t.alcance === "criterio_propio"));
  const rasEtq = [...new Set(rasCP.map(t => (t.etiqueta || "").toLowerCase()))];
  const items = [];
  if (relCur.length) items.push(["Tipo de relación asignado por curación", relCur.length + " evidencias (" + Object.entries(porRel).map(([k, n]) => n + " " + relEtq(k)).join(", ") + "). Las asociaciones no suman dirección en la matriz ni en el pivote."]);
  if (subcl) items.push(["Subclase de bacteriocina", subcl + " evidencias llevan subclase (clase I, IIb…) asignada por el atlas."]);
  if (posbCP) items.push(["Puerta en forma posbiótica", posbCP + " cepas: en forma no viable la resistencia adquirida informa pero no decide. Es criterio del atlas, no regulatorio."]);
  if (aRevisar.length) items.push(["Seguridad «a revisar» sin decisión de EFSA", aRevisar.length + " especies: " + aRevisar.join("; ") + "."]);
  if (rasCP.length) items.push(["Rasgos de clasificación", rasCP.length + " rasgos (" + rasEtq.join(", ") + ") son criterio de clasificación: no cuentan en Parecidas ni en el comparador."]);
  return [h("p", {}, "Estas decisiones no salen de una fuente ni de una norma: las tomó el atlas y se muestran rotuladas así allí donde se usan."),
    items.length ? h("dl", {class: "sd-dl"}, items.map(([a, b]) => dtdd(a, b))) : h("p", {class: "muted"}, "Ninguna en este corte.")];
}

function stat(n, label) { return h("div", {class: "stat"}, h("b", {}, n == null ? "—" : String(n)), h("span", {}, label)); }
function dtdd(a, b) { return h("div", {class: "sd-row"}, h("dt", {}, a), h("dd", {}, b)); }
function sect(id, title, ...body) { return h("section", {class: "about-sec card", id}, h("h2", {}, title), ...body); }
})();

})();
