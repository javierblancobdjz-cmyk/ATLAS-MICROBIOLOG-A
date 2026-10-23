;(function(){
/* 90_boot.js · P1 núcleo. Monta barra superior, pestañas, Inicio, panel de cita (hoja/lateral) y bandeja; arranca el router. */
const {h, icon, level, sources, link, name, esc} = Atlas.ui;
/* Cuatro pestañas caben a 390 px; Biblioteca y Sobre los datos bajan al pie. v2: no hay pestaña Pregunta (la tira de formas de la ficha la sustituye). */
const TABS = [["inicio", "Inicio"], ["especies", "Especies"], ["comparar", "Comparar"], ["lineas", "Líneas"]];
const FOOT = [["biblioteca", "Biblioteca"], ["datos", "Sobre los datos"]];

/* v2 · «Qué se elimina»: el modo pregunta (50_question.js) ya no existe. Los enlaces antiguos #/pregunta?b=…&f=… van a la
   ficha de la especie o cepa, cuya tira «¿En qué forma?» responde lo mismo; sin sujeto, a la lista de especies. Sin pantalla propia. */
Atlas.registerView({route: "pregunta", tab: "especies", render(el, r) {
  const b = r.query.b || r.param, res = b && Atlas.data.resolve(b);
  location.replace(res ? Atlas.route.href(res.tipo === "cepa" ? "cepa" : "especie", res.tipo === "subgrupo" ? res.especie : b) : Atlas.route.href("especies"));
}});

/* v2: el pivote es uno (Atlas.pivot, ruta #/lineas). #/quien (45_quien.js retirado) redirige a #/lineas con sus parámetros. */
Atlas.registerView({route: "quien", tab: "lineas", render(el, r) {
  const q = Object.assign({}, r.query); delete q.de; if (r.query.de) q.s = r.query.de;
  let lin = null; if (r.param && r.param.includes("|")) { const [l, res] = r.param.split("|"); lin = l; q.res = res; }
  location.replace(Atlas.route.href("lineas", lin, q));
}});

/* ---------- Inicio ---------- */
Atlas.registerView({route: "inicio", tab: "inicio", cssClass: "v-home", render(el) {
  const m = Atlas.data.meta, t = m.totales;
  el.append(
    h("div", {class: "home-head"},
      h("h1", {}, "Atlas de microbiota para producto"),
      h("p", {class: "lede"}, "Consulta rápida y defendible sobre bacterias de la microbiota y de fermentados con uso o potencial de producto. Cada afirmación lleva su nivel de evidencia y su fuente a un toque.")),
    Atlas.ui.readingBox("home",
      "Responder en segundos qué hace bien una bacteria, en qué se diferencian sus cepas y dónde hay hueco de producto.",
      "Todo dato lleva nivel de evidencia (pictograma + texto) y distingue cepa de especie. Nada se generaliza sin decirlo.",
      "Empieza por el buscador, por un patrón o por una de las tres puertas. Los números son del corte indicado."));

  // Puertas rápidas
  const puertas = h("div", {class: "home-gates"},
    gate("lineas", "Quién consigue cada resultado", "Matriz bacteria × resultado coloreada por mecanismo; toca una celda para ver quién lo comparte, con qué cepa, forma y si funciona muerta.", "target"),
    gate("comparar", "Comparar", "2–4 especies, subgrupos o cepas en paralelo.", "plus"),
    gate("especies", "Explorar especies", `${t.especies} especies, ${t.n2} con dossier completo.`, "search"));
  el.append(patrones(), puertas);   // el patrón primero: es la puerta de «encontrar patrones» y a 390 px quedaba en la 2.ª pantalla

  // Estado de los datos
  el.append(h("div", {class: "home-stats card"},
    stat(t.especies, `especies (${t.n2} dossier)`),
    stat(t.cepas, "cepas de referencia"),
    stat(t.evidencias, "evidencias"),
    stat(m.pct_verificadas + " %", "verificadas · corte " + m.fecha_corte)));

  // Líneas de ataque destacadas
  const destacadas = Atlas.data.attacks().filter(a => a.destacada).slice(0, 5);
  const lista = (destacadas.length ? destacadas : Atlas.data.attacks().slice(0, 5));
  el.append(h("section", {class: "home-attacks"},
    h("h2", {}, icon("target"), " Líneas de ataque destacadas"),
    h("ul", {class: "attack-list"}, lista.map(a => {
      const res = Atlas.data.resultado(a.linea, a.resultado);
      return h("li", {},
        h("a", {class: "what", href: Atlas.route.href("lineas", a.linea, {res: a.resultado})},
          h("b", {}, lineaName(a.linea)), " · ", (res ? res.nombre_corto : a.resultado), " · ", name(a.especie)),
        a.mejor_nivel ? level(a.mejor_nivel) : "",
        h("p", {class: "why"}, a.mecanismo_texto));
    }))));

  // Dossiers N2
  const n2 = Atlas.data.allSpecies().filter(s => s.nivel_ficha === "N2");
  el.append(h("section", {class: "home-dossiers"},
    h("h2", {}, "Especies con dossier"),
    h("div", {class: "dossiers"}, n2.map(s => dossierCard(s)))));
}});

/* Entradas por patrón (sin pantalla nueva: todas van al pivote único #/lineas). Se derivan de data/, nada escrito a mano:
   - outputs con ≥ 2 productores curados (vocabulario_rasgos de E5), sin bacteriocinas, que no llevan enlace de convergencia;
   - clases de mecanismo y genes nombrados en las evidencias. El recuento es EXACTAMENTE el que muestra el pivote al que lleva
     (Atlas.pivot.renderQuery: toda evidencia curada, de cualquier línea), para que la cifra de la ficha y la del pivote coincidan. */
function patrones() {
  const D = Atlas.data, cat = D.raw.catalogo, voc = (cat.vocabulario_rasgos || {}).rasgos || {};
  const evs = Object.values(D.raw.evidencias).filter(e => e.tipo === "evidencia" && e.mecanismo);
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, n);
  const outs = Object.entries(voc).filter(([, v]) => (v.productores || []).length >= 2 && v.tipo_convergencia && v.clase_mecanismo !== "bacteriocina")
    .sort((a, b) => b[1].productores.length - a[1].productores.length || a[1].etiqueta.localeCompare(b[1].etiqueta)).slice(0, 6);
  const cls = new Map(), genes = new Map();
  evs.forEach(e => {
    (e.mecanismo.clases || []).filter(c => c !== "no_aplica" && c !== "desconocido").forEach(c => cls.set(c, (cls.get(c) || 0) + 1));
    (e.mecanismo.genes || []).forEach(g => genes.set(g, (genes.get(g) || 0) + 1));
  });
  const chip = (href, label, n, title) => h("a", {class: "chip pat-chip", href, title}, label, n != null ? h("small", {class: "pat-n"}, n) : "");
  const row = (titulo, kids) => kids.length ? h("div", {class: "pat-row"}, h("b", {class: "pat-h"}, titulo), h("span", {class: "chips"}, kids)) : "";
  const P = Atlas.pivot, dot = c => { const f = P && P.famOf && P.famOf(c); return f ? P.famDot(f, "") : ""; };
  return h("section", {class: "home-pat card"},
    h("h2", {}, "Bucea por patrón"),
    h("p", {class: "small muted"}, "Un output, un mecanismo o un gen: quién lo comparte, por qué vía y si funciona con célula muerta. Cada entrada abre el pivote de Líneas."),
    row("Un output, varios productores (n.º de productores)", outs.map(([id, v]) => chip(Atlas.route.href("lineas", null, {out: id}), v.etiqueta, String(v.productores.length),
      (cat.vocabulario_rasgos.tipos_convergencia || {})[v.tipo_convergencia] || ""))),
    row("Por mecanismo (n.º de evidencias)", top(cls, 6).map(([c, n]) => chip(Atlas.route.href("lineas", null, {mec: c}), [dot(c), Atlas.ui.claseLabel(c).split(" (")[0]], String(n), n + " evidencias curadas con esta clase de mecanismo"))),
    row("Por gen nombrado en el ensayo (n.º de evidencias)", top(genes, 6).map(([g, n]) => chip(Atlas.route.href("lineas", null, {gen: g}), h("i", {}, g), String(n), n + " evidencias nombran el gen en el ensayo (no es presencia en el genoma)"))),
    h("p", {class: "small muted pat-tip"}, "¿Otro? Escribe en el buscador un gen, una molécula o un mecanismo (atajo: tecla /)."));
}

function gate(route, title, desc, ic) {
  return h("a", {class: "gate", href: Atlas.route.href(route)},
    h("span", {class: "gate-ic"}, icon(ic)),
    h("span", {}, h("b", {}, title), h("span", {class: "gate-desc"}, desc)));
}
function stat(n, label) { return h("div", {class: "stat"}, h("b", {}, String(n)), h("span", {}, label)); }
function lineaName(id) { const l = Atlas.data.linea(id); return l ? l.nombre : id; }
function qbText(s) {
  const qb = (s.que_hace_bien || [])[0];
  return qb ? qb.afirmacion : (s.nicho && s.nicho.corto) || "";
}
function dossierCard(s) {
  const q = s.regulatorio && s.regulatorio.qps, qps = q && q.estado === "qps";
  const best = bestLevelOf(s);
  return h("a", {class: "dossier", href: Atlas.route.href("especie", s.slug)},
    h("i", {class: "bn"}, s.nombre_actual),
    h("p", {}, truncate(qbText(s), 120)),
    h("div", {class: "row-gap"},
      h("span", {class: "qps " + (qps ? "yes" : "nope")}, icon(qps ? "ok" : "minus"), qps ? "QPS" : "No QPS"),
      best ? level(best) : ""));
}
function bestLevelOf(s) {
  const order = ["MA", "ECA", "OBS", "ANI", "CEL", "GEN-v", "GEN-p", "GEN"];
  const have = Object.keys((s.conteos && s.conteos.por_nivel) || {});
  for (const c of order) if (have.includes(c)) return c;
  return null;
}
function truncate(t, n) { t = t || ""; return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t; }
Atlas.ui.lineaName = lineaName;
Atlas.ui.bestLevelOf = bestLevelOf;
Atlas.ui.truncate = truncate;

/* ---------- panel de cita (hoja inferior en móvil, lateral en escritorio) ---------- */
let citeScrim, lastFocus;
Atlas.bus.addEventListener("citation:open", ev => {
  const e = Atlas.data.evidence(ev.detail);
  if (!e) return;
  const r = Atlas.data.ref(e.ref), p = document.getElementById("panel");
  lastFocus = document.activeElement;
  p.innerHTML = "";
  const v = e.verificacion || {};
  const ctx = e.tipo === "contexto";
  const REL = Object.fromEntries(((Atlas.data.raw.catalogo.relacion_valores) || []).map(x => [x.k || x.id, x.etiqueta || x.texto]));
  const rel = e.relacion && e.relacion !== "no_aplica" ? (REL[e.relacion] || String(e.relacion).replace(/_/g, " ")) : null;
  const forma = Atlas.ui.formaLabel(e.forma).toLowerCase() + (e.inactivacion_metodo ? " (" + String(e.inactivacion_metodo).replace(/_/g, " ") + ")" : "");
  const dl = h("dl", {},
    dt("Nivel"), dd(ctx ? h("span", {class: "tag"}, "contexto") : level(e.nivel)),
    dt("Alcance"), dd(Atlas.ui.scope(e), e.alcance === "mezcla" ? h("span", {class: "small muted"}, " · no cuenta para ninguna de las cepas") : ""),
    ...(ctx ? [dt("Tipo"), dd("Contexto (revisión o cribado): no cuenta como evidencia de efecto")]
            : [dt("Dirección"), dd(Atlas.ui.direction(e.direccion)),
               dt("Forma"), dd(e.forma ? forma : h("span", {class: "nd-txt"}, "forma no declarada")),
               rel ? dt("Relación") : "", rel ? dd(rel) : ""]),
    dt("Modelo"), dd([lbl(MODELO, e.modelo), lbl(POB, e.poblacion), e.n && "n=" + e.n, e.dosis, e.duracion, lbl(VIA, e.via)].filter(Boolean).join(" · ") || "—"),
    dt("Verificación"), dd(h("span", {class: "mark " + (v.estado === "verificada" ? "ok" : "pend")},
      icon(v.estado === "verificada" ? "ok" : "pend"), v.estado === "verificada" ? "Verificada" : (v.estado || "pendiente")),
      v.coincidencia != null ? " · coincidencia " + v.coincidencia : "", e.auditada ? " · auditada" : ""));
  const biblio = r ? h("div", {class: "biblio"},
    h("span", {class: "small muted"}, (r.autores || []).join(", ") + (r.anio ? " (" + r.anio + ")" : "")),
    h("p", {class: "t"}, r.titulo || ""),
    h("span", {class: "small"}, [r.revista, r.anio, r.pmid && "PMID " + r.pmid, (r.doi && !r.doi_dudoso) && "DOI " + r.doi].filter(Boolean).join(" · "))) : "";
  const frag = e.fragmento && e.fragmento.url;
  p.append(
    h("button", {type: "button", class: "btn cite-close", onclick: closeCite}, icon("x"), "Cerrar"),
    h("p", {class: "claim"}, e.claim_es),
    Atlas.ui.mechLine(e),
    dl, biblio,
    h("div", {class: "acts"},
      frag ? h("a", {class: "btn pri", href: e.fragmento.url, target: "_blank", rel: "noopener"}, icon("ext"), "Ver la frase en PubMed")
           : (r && r.pmid ? h("a", {class: "btn pri", href: "https://pubmed.ncbi.nlm.nih.gov/" + r.pmid + "/", target: "_blank", rel: "noopener"}, icon("ext"), "Ver en PubMed") : ""),
      h("button", {type: "button", class: "btn", onclick: () => Atlas.route.go("biblioteca", null, {ref: e.ref})}, "Ver en Biblioteca")),
    e.fragmento ? h("p", {class: "note"}, `La app no reproduce el resumen. PubMed abre con la frase resaltada; si tu navegador no la resalta, búscala: empieza por «${esc(e.fragmento.inicio)}…».`) : "");
  p.hidden = false; p.classList.add("on");
  if (!citeScrim) { citeScrim = h("div", {class: "cite-scrim", onclick: closeCite}); document.body.append(citeScrim); }
  citeScrim.hidden = false;
  p.setAttribute("role", "dialog"); p.setAttribute("aria-modal", "true");
  const c = p.querySelector(".cite-close"); c && c.focus();
});
/* Vocabularios del panel: ningún código crudo en pantalla («no_aplica» no se pinta) */
const MODELO = {humano: "humanos", in_silico: "in silico", bioquimico: "ensayo bioquímico", fermentacion_in_vitro: "fermentación in vitro",
                raton: "ratón", rata: "rata", celulas: "células", c_elegans: "C. elegans", animal_produccion: "animal de producción"};
const POB = {enferma_adulta: "adultos con enfermedad", sana_adulta: "adultos sanos", mayores: "mayores", ninos: "niños", mixta: "población mixta",
             lactantes: "lactantes", embarazo_lactancia: "embarazo o lactancia", prematuros: "prematuros", uci_critica: "pacientes críticos (UCI)"};
const VIA = {oral: "vía oral", vaginal: "vía vaginal", bucal: "vía bucal"};
function lbl(map, k) { return !k || k === "no_aplica" ? null : (map[k] || String(k).replace(/_/g, " ")); }
function dt(t) { return h("dt", {}, t); }
function dd(...k) { return h("dd", {}, ...k); }
function closeCite() {
  const p = document.getElementById("panel");
  p.hidden = true; p.classList.remove("on");
  if (citeScrim) citeScrim.hidden = true;
  if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) {}
}
document.addEventListener("keydown", e => { if (e.key === "Escape") closeCite(); });
/* Delegación global: cualquier chip de fuente abre la cita, se cree donde se cree. */
document.addEventListener("click", e => {
  const c = e.target.closest && e.target.closest("[data-ev]");
  if (c) { e.preventDefault(); Atlas.ui.openCitation(c.getAttribute("data-ev")); }
});

/* ---------- arranque ---------- */
(async function boot() {
  Atlas.initData(await Atlas.loadData());
  Atlas.tray._load();
  const top = document.getElementById("topbar");
  const input = h("input", {type: "search", placeholder: "Gen, molécula, mecanismo, cepa…", "aria-label": "Buscar especie, cepa, resultado, mecanismo, gen o molécula", autocomplete: "off"});
  const list = h("ul", {class: "suggest", role: "listbox", hidden: true});
  top.append(
    h("a", {href: "#/", class: "brand"}, "Atlas"),
    h("div", {class: "search"}, icon("search"), input, list),
    h("button", {type: "button", class: "theme icon-btn", "aria-label": "Cambiar tema", onclick: () => {
      // parte del tema que SE VE (sin data-theme manda el sistema): el primer clic siempre cambia algo
      const d = document.documentElement, oscuro = d.dataset.theme ? d.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
      d.dataset.theme = oscuro ? "light" : "dark"; Atlas.prefs.set("theme", d.dataset.theme);
    }}, icon("moon")));
  const th = Atlas.prefs.get("theme", null); if (th) document.documentElement.dataset.theme = th;
  Atlas.mountSearch(input, list);
  document.addEventListener("keydown", e => { if (e.key === "/" && document.activeElement !== input && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) { e.preventDefault(); input.focus(); } });
  document.getElementById("tabs").append(...TABS.map(([id, label, cls]) => h("a", {href: Atlas.route.href(id), "data-tab": id, class: cls || ""}, label)));
  const foot = document.getElementById("foot");
  if (foot) foot.append(...FOOT.flatMap(([id, label], i) => [i ? " · " : "", h("a", {href: Atlas.route.href(id), "data-tab": id}, label)]),
    h("span", {class: "muted"}, " · corte " + Atlas.data.meta.fecha_corte));

  // bandeja de comparar persistente
  const tray = document.getElementById("tray");
  function renderTray() {
    const items = Atlas.tray.items;
    tray.innerHTML = ""; tray.hidden = items.length === 0;
    if (!items.length) return;
    tray.append(h("span", {class: "small"}, "Para comparar"),
      ...items.map(id => h("button", {class: "chip", type: "button", onclick: () => Atlas.tray.remove(id)}, name(id), icon("x"))),
      h("a", {class: "btn pri", href: Atlas.route.href("comparar", null, {ids: items.join(",")})}, "Abrir comparador"));
  }
  Atlas.bus.addEventListener("tray:change", renderTray); renderTray();

  window.addEventListener("hashchange", () => { closeCite(); Atlas.render(); window.scrollTo(0, 0); });
  Atlas.render();
})();

})();
