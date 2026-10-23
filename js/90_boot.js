;(function(){
/* 90_boot.js · P1 núcleo. Monta barra superior, pestañas, Inicio, panel de cita (hoja/lateral) y bandeja; arranca el router. */
const {h, icon, level, sources, link, name, esc} = Atlas.ui;
const TABS = [["inicio", "Inicio"], ["especies", "Especies"], ["comparar", "Comparar"], ["lineas", "Líneas"],
              ["pregunta", "Pregunta"], ["biblioteca", "Biblioteca", "minor"], ["datos", "Sobre los datos", "minor"]];

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
      "Empieza por el buscador o por una de las cuatro puertas. Los números son del corte indicado."));

  // Puertas rápidas
  const puertas = h("div", {class: "home-gates"},
    gate("pregunta", "Hacer una pregunta de producto", "Bacteria + línea + forma → veredicto con razones y fuente.", "q"),
    gate("comparar", "Comparar", "2–4 especies, subgrupos o cepas en paralelo.", "plus"),
    gate("lineas", "Líneas de producto", "Matriz bacteria × resultado, huecos y líneas de ataque.", "target"),
    gate("especies", "Explorar especies", `${t.especies} especies, ${t.n2} con dossier completo.`, "search"));
  el.append(puertas);

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
  const dl = h("dl", {},
    dt("Nivel"), dd(level(e.nivel)),
    dt("Alcance"), dd(Atlas.ui.scope(e)),
    dt("Dirección"), dd(Atlas.ui.direction(e.direccion)),
    dt("Modelo"), dd([e.modelo, e.poblacion, e.n && "n=" + e.n, e.dosis, e.duracion, e.via].filter(Boolean).join(" · ") || "—"),
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
  const input = h("input", {type: "search", placeholder: "Especie, sinónimo, cepa, molécula, gen o línea", "aria-label": "Buscar", autocomplete: "off"});
  const list = h("ul", {class: "suggest", role: "listbox", hidden: true});
  top.append(
    h("a", {href: "#/", class: "brand"}, "Atlas"),
    h("div", {class: "search"}, icon("search"), input, list),
    h("button", {type: "button", class: "theme icon-btn", "aria-label": "Cambiar tema", onclick: () => {
      const d = document.documentElement; d.dataset.theme = d.dataset.theme === "dark" ? "light" : "dark"; Atlas.prefs.set("theme", d.dataset.theme);
    }}, icon("moon")));
  const th = Atlas.prefs.get("theme", null); if (th) document.documentElement.dataset.theme = th;
  Atlas.mountSearch(input, list);
  document.addEventListener("keydown", e => { if (e.key === "/" && document.activeElement !== input && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) { e.preventDefault(); input.focus(); } });
  document.getElementById("tabs").append(...TABS.map(([id, label, cls]) => h("a", {href: Atlas.route.href(id), "data-tab": id, class: cls || ""}, label)));

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
