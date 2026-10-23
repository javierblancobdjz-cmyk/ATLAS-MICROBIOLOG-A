;(function(){
/* 00_core.js · P1 núcleo. Contrato público: window.Atlas (ver docs/CONTRATO_MODULOS en 12_arquitectura.md §4).
   Ningún módulo toca el DOM de otro ni lee ATLAS_DATA directamente: todo pasa por Atlas.data y Atlas.ui. */
const Atlas = window.Atlas = {views: {}, bus: new EventTarget(), state: {}};

/* ---------- datos (solo lectura) ---------- */
Atlas.loadData = async function () {
  const tag = document.getElementById("atlas-data");
  if (tag) return JSON.parse(tag.textContent);
  const base = window.ATLAS_DATA_URL || "data/";
  const keys = ["meta", "catalogo", "especies", "subgrupos", "cepas", "evidencias", "refs", "web",
                "celdas", "matriz", "ataques", "veredictos", "busqueda", "vecinos"];
  const parts = await Promise.all(keys.map(k => fetch(base + k + ".json").then(r => r.json())));
  return Object.fromEntries(keys.map((k, i) => [k, parts[i]]));
};

Atlas.initData = function (D) {
  const deepFreeze = o => { Object.values(o).forEach(v => v && typeof v === "object" && deepFreeze(v)); return Object.freeze(o); };
  const res = {};
  D.catalogo.lineas.forEach(l => l.resultados.forEach(r => { res[l.id + "|" + r.id] = {...r, linea: l.id}; }));
  Atlas.data = deepFreeze({
    raw: D, meta: D.meta,
    species: id => D.especies[id] || null,
    strain: id => D.cepas[id] || null,
    subgroup: id => D.subgrupos[id] || null,
    evidence: id => D.evidencias[id] || null,
    ref: id => D.refs[id] || null,
    web: id => D.web[id] || null,
    lineas: (tipo = "producto") => D.catalogo.lineas.filter(l => !tipo || l.tipo === tipo),
    linea: id => D.catalogo.lineas.find(l => l.id === id) || null,
    resultado: (lin, r) => res[lin + "|" + r] || null,
    mecanismo: id => D.catalogo.mecanismos.find(m => m.id === id) || null,
    cell: (subj, lin, r) => D.celdas[`${subj}|${lin}|${r}`] || null,
    verdict: (subj, lin, forma) => D.veredictos[`${subj}|${lin}|${forma}`] || null,
    evidenceOf: (subj, filt = {}) => Object.values(D.evidencias).filter(e =>
      (e.especie === subj || e.cepa === subj || e.subgrupo === subj) &&
      Object.entries(filt).every(([k, v]) => v == null || (Array.isArray(v) ? v.includes(e[k]) : e[k] === v))),
    strainsOf: sp => (D.especies[sp]?.cepas || []).map(id => D.cepas[id]),
    attacks: (lin) => D.ataques.filter(a => !lin || a.linea === lin),
    vecinos: id => (D.vecinos && D.vecinos[id]) || [],
    allSpecies: () => Object.values(D.especies),
    /** Resuelve cualquier id (especie, cepa, subgrupo) a {tipo, obj, especie} */
    resolve: id => D.especies[id] ? {tipo: "especie", obj: D.especies[id], especie: id}
      : D.cepas[id] ? {tipo: "cepa", obj: D.cepas[id], especie: D.cepas[id].especie}
      : D.subgrupos[id] ? {tipo: "subgrupo", obj: D.subgrupos[id], especie: D.subgrupos[id].especie} : null,
  });
};

/* ---------- router: estado en la URL (#/ruta/param?k=v) ---------- */
Atlas.route = {
  parse(h = location.hash) {
    const [path, qs] = (h.replace(/^#/, "") || "/").split("?");
    const parts = path.split("/").filter(Boolean);
    return {name: parts[0] || "inicio", param: parts[1] ? decodeURIComponent(parts[1]) : null,
            query: Object.fromEntries(new URLSearchParams(qs || ""))};
  },
  href(name, param, query) {
    const q = query ? Object.entries(query).filter(([, v]) => v != null && v !== "" && v !== false) : [];
    return "#/" + (name === "inicio" ? "" : name) + (param ? "/" + encodeURIComponent(param) : "") +
      (q.length ? "?" + new URLSearchParams(q).toString() : "");
  },
  go(name, param, query) { location.hash = this.href(name, param, query); },
  /** Cambia la query de la vista actual sin crear entrada de historial (filtros al tocar) */
  patch(query) {
    const r = this.parse();
    history.replaceState(null, "", this.href(r.name, r.param, {...r.query, ...query}));
    Atlas.bus.dispatchEvent(new CustomEvent("route:query", {detail: this.parse()}));
  },
};

/** Registro de vistas: cada módulo llama Atlas.registerView({...}). Rutas reservadas en 12_arquitectura.md §4. */
Atlas.registerView = function (v) {
  if (!v.route || typeof v.render !== "function") throw new Error("vista sin route/render");
  if (Atlas.views[v.route]) throw new Error("ruta duplicada: " + v.route);
  Atlas.views[v.route] = v;
};

Atlas.render = function () {
  const r = Atlas.route.parse();
  const v = Atlas.views[r.name] || Atlas.views["inicio"];
  const el = document.getElementById("view");
  if (Atlas.state.view && Atlas.state.view.destroy) Atlas.state.view.destroy();
  el.className = v.cssClass || "";
  el.innerHTML = "";
  Atlas.state.view = v;
  try { v.render(el, r); }
  catch (e) { console.error(e); el.innerHTML = `<div class="stub">Error en la vista ${Atlas.ui.esc(r.name)}: ${Atlas.ui.esc(e.message)}</div>`; }
  Atlas.ui.markTab(v.tab || r.name);
  Atlas.bus.dispatchEvent(new CustomEvent("route:change", {detail: r}));
};
/* Los filtros «al tocar» usan Atlas.route.patch(), que cambia la query sin hashchange.
   Re-renderizamos la vista actual para que la selección surta efecto (Pregunta, Especies, Comparador). */
Atlas.bus.addEventListener("route:query", () => Atlas.render());

/* ---------- bandeja de comparar (persistente entre vistas) ---------- */
Atlas.tray = {
  items: [],
  add(id) { if (!this.items.includes(id) && this.items.length < 4) { this.items.push(id); this._save(); } },
  remove(id) { this.items = this.items.filter(x => x !== id); this._save(); },
  clear() { this.items = []; this._save(); },
  _save() {
    try { sessionStorage.setItem("atlas.tray", JSON.stringify(this.items)); } catch (e) { /* sin almacenamiento: no pasa nada */ }
    Atlas.bus.dispatchEvent(new CustomEvent("tray:change", {detail: [...this.items]}));
  },
  _load() { try { this.items = JSON.parse(sessionStorage.getItem("atlas.tray") || "[]"); } catch (e) { this.items = []; } },
};

/* ---------- preferencias por espectador (solo comodidad; fallo silencioso) ---------- */
Atlas.prefs = {
  get(k, d) { try { const v = localStorage.getItem("atlas." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("atlas." + k, JSON.stringify(v)); } catch (e) { /* ignorar */ } },
};

/* ---------- componentes compartidos (los únicos que pintan insignias, chips y panel) ---------- */
const NIV = {MA: [1, "Metaanálisis de ECA"], ECA: [2, "Ensayo clínico aleatorizado"], OBS: [3, "Observacional en humanos"],
             ANI: [4, "Animal in vivo"], CEL: [5, "C. elegans o in vitro"], GEN: [6, "Predicción genómica"],
             "GEN-v": [6, "Predicción genómica (célula viva)"], "GEN-p": [6, "Predicción genómica (posbiótico/inactivado)"]};
const VEREDICTO = {solida: "Sólida", prometedora: "Prometedora", especulativa: "Especulativa",
                   desaconsejada: "Desaconsejada", sin_datos: "Sin datos suficientes"};
Atlas.ui = {
  esc: s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c])),
  h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else if (v != null && v !== false) el.setAttribute(k, v);
    }
    kids.flat().forEach(c => el.append(c instanceof Node ? c : document.createTextNode(c ?? "")));
    return el;
  },
  /** Insignia de nivel: pictograma + código + texto largo accesible. Nunca solo color. */
  level(code) {
    if (!code) return Atlas.ui.h("span", {class: "badge badge-gap", "aria-label": "sin evidencia"}, "—");
    const [n, long] = NIV[code] || [6, code];
    return Atlas.ui.h("span", {class: `badge lvl lvl-${n}`, "data-l": n, title: long, "aria-label": `Nivel ${long}`},
      Atlas.ui.icon("lvl" + n), " " + code);
  },
  scope(e) {
    const s = e.alcance, name = e.cepa ? (Atlas.data.strain(e.cepa)?.nombre_corto || "") : "";
    const txt = s === "cepa" ? "Cepa " + name : s === "especie" ? "Especie" : s === "extrapolada" ? "Extrapolada de " + (e.extrapolada_desde || "") : "General";
    return Atlas.ui.h("span", {class: "scope scope-" + s}, ({cepa: "●", especie: "○", extrapolada: "◌", general: "·"})[s] + " " + txt);
  },
  direction(d) {
    const m = {"+": ["+", "a favor"], "0": ["0", "nulo"], nc: ["?", "no concluyente"], "-": ["−", "en contra"], mixto: ["±", "mixto"]}[d] || ["", ""];
    return Atlas.ui.h("span", {class: "dir dir-" + (d === "-" ? "neg" : d === "+" ? "pos" : "nul")}, m[0] + " " + m[1]);
  },
  verdictBadge(v) { return Atlas.ui.h("span", {class: "vbadge vbadge-" + v.veredicto, title: "Regla " + (v.regla_aplicada || "")}, VEREDICTO[v.veredicto] + (v.subtitulo ? " · " + v.subtitulo : "") + (v.asterisco ? " *" : "")); },
  verdictLabel: v => VEREDICTO[v] || v,
  icon(name) { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("class", "ic"); s.setAttribute("aria-hidden", "true");
    const u = document.createElementNS("http://www.w3.org/2000/svg", "use"); u.setAttribute("href", "#i-" + name); s.append(u); return s; },
  /** Chip de fuente: «Autor año» + nivel; al tocar abre el panel de cita */
  sourceChip(id) {
    const e = Atlas.data.evidence(id), w = !e && Atlas.data.web(id);
    if (id === "criterio_propio") return Atlas.ui.h("span", {class: "chip chip-cp"}, "criterio propio");
    if (w) return Atlas.ui.h("a", {class: "chip chip-web", href: w.url, target: "_blank", rel: "noopener"}, w.what.slice(0, 40));
    if (!e) return Atlas.ui.h("span", {class: "chip chip-missing"}, "fuente retirada");
    const r = Atlas.data.ref(e.ref);
    return Atlas.ui.h("button", {class: "chip chip-src", type: "button", "data-ev": id, onclick: () => Atlas.ui.openCitation(id)},
      (r?.cita_corta || "ref") + " ", Atlas.ui.level(e.nivel), (e.verificacion && e.verificacion.estado) !== "verificada" ? " !" : "");
  },
  sources(ids) { return Atlas.ui.h("span", {class: "chips"}, (ids || []).map(Atlas.ui.sourceChip)); },
  /** Texto de una razón de veredicto: usa el `texto` del estratega o rellena la plantilla del código. */
  reasonText(r, v) {
    if (r.texto) return r.texto;
    const tpl = (Atlas.data.meta.plantillas_razones || {})[r.codigo] || r.codigo || "";
    const e0 = (r.fuentes || []).map(Atlas.data.evidence).find(Boolean);
    const mec = r.mecanismo && Atlas.data.mecanismo(r.mecanismo);
    const vals = {
      nivel: e0 ? e0.nivel : "", claim: e0 ? e0.claim_es : "",
      mecanismo: mec ? mec.nombre : (r.mecanismo || ""),
      viabilidad: mec ? mec.requiere_viabilidad : "", forma: v?.forma || "",
      otra_forma: r.otra_forma || "", ruta: r.ruta || v?.ruta_regulatoria || "",
      k: r.k || r.n_cepas || "", direccion: e0 ? ({"+": "a favor", "-": "en contra", "0": "nulo", nc: "no concluyente"}[e0.direccion] || e0.direccion) : "",
    };
    return tpl.replace(/\{(\w+)\}/g, (_, k) => vals[k] != null ? vals[k] : "");
  },
  /** Panel de cita (P1 lo implementa entero; las vistas solo llaman a esta función) */
  openCitation(evId) { Atlas.bus.dispatchEvent(new CustomEvent("citation:open", {detail: evId})); },
  /** Recuadro «Objetivo / Qué significa / Cómo se lee», con recuerdo de plegado por vista */
  readingBox(key, objetivo, significa, comoSeLee) {
    const open = Atlas.prefs.get("rb." + key, true);
    const d = Atlas.ui.h("details", {class: "reading-box", open,
      ontoggle: ev => Atlas.prefs.set("rb." + key, ev.target.open)},
      Atlas.ui.h("summary", {}, "Objetivo · Qué significa · Cómo se lee"),
      Atlas.ui.h("div", {class: "rb-cols"},
        Atlas.ui.h("p", {}, Atlas.ui.h("b", {}, "Objetivo. "), objetivo),
        Atlas.ui.h("p", {}, Atlas.ui.h("b", {}, "Qué significa. "), significa),
        Atlas.ui.h("p", {}, Atlas.ui.h("b", {}, "Cómo se lee. "), comoSeLee)));
    return d;
  },
  /** Nombre científico en cursiva serif; acepta especie o cepa */
  name(id) {
    const r = Atlas.data.resolve(id); if (!r) return document.createTextNode(id);
    const sp = Atlas.data.species(r.especie);
    if (r.tipo === "especie") return Atlas.ui.h("i", {class: "binomial"}, sp.nombre_actual);
    return Atlas.ui.h("span", {}, Atlas.ui.h("i", {class: "binomial"}, sp.nombre_corto), " " + (r.obj.designacion || r.obj.nombre));
  },
  link(id, child) {
    const r = Atlas.data.resolve(id);
    const route = r?.tipo === "cepa" ? "cepa" : "especie";
    return Atlas.ui.h("a", {href: Atlas.route.href(route, r?.tipo === "subgrupo" ? r.especie : id)}, child || Atlas.ui.name(id));
  },
  markTab(name) { document.querySelectorAll("#tabs a").forEach(a => a.toggleAttribute("aria-current", a.dataset.tab === name)); },
  stub(el, titulo, paquete) { el.append(Atlas.ui.h("div", {class: "stub"}, `${titulo} · pendiente del paquete ${paquete}`)); },
};

})();
