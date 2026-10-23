;(function(){
/* 10_search.js · P1 núcleo. Buscador global (especie, sinónimo, cepa, depósito, función, molécula, gen, línea).
   Contrato: Atlas.search(q) → [{t, id, label, antes?}] máx. 8, agrupados por tipo. */
const norm = s => (s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").trim();
Atlas.search = function (q) {
  const n = norm(q); if (n.length < 2) return [];
  const idx = Atlas.data.raw.busqueda;
  const lineas = Atlas.data.lineas().map(l => ({t: "linea", id: l.id, label: l.nombre, k: [norm(l.nombre)]}));
  const score = it => { let best = 0; for (const k of it.k) { if (k.startsWith(n)) best = Math.max(best, 3); else if (k.split(" ").some(w => w.startsWith(n))) best = Math.max(best, 2); else if (k.includes(n)) best = Math.max(best, 1); } return best; };
  return [...idx, ...lineas].map(it => [score(it), it]).filter(([s]) => s > 0)
    .sort((a, b) => b[0] - a[0] || a[1].label.localeCompare(b[1].label)).slice(0, 8).map(([, it]) => it);
};
const TLABEL = {especie: "Especies", cepa: "Cepas", linea: "Líneas de producto"};
Atlas.mountSearch = function (input, list) {
  let sel = -1, items = [];
  const hrefOf = it => it.t === "linea" ? Atlas.route.href("lineas", it.id) : Atlas.route.href(it.t, it.id);
  function paint() {
    list.innerHTML = ""; sel = -1;
    items = Atlas.search(input.value);
    if (!items.length) { list.hidden = true; return; }
    list.hidden = false;
    let lastT = null;
    items.forEach((it, i) => {
      if (it.t !== lastT) { list.append(Atlas.ui.h("li", {class: "suggest-h", role: "presentation"}, TLABEL[it.t] || it.t)); lastT = it.t; }
      list.append(Atlas.ui.h("li", {role: "presentation"}, Atlas.ui.h("a", {role: "option", "data-i": i, href: hrefOf(it),
        onclick: () => { list.hidden = true; }},
        it.t === "cepa" || it.t === "especie" ? Atlas.ui.h("i", {class: "bn"}, it.label) : it.label,
        it.antes && it.antes.length ? Atlas.ui.h("small", {}, " antes: " + it.antes.join(", ")) : "")));
    });
  }
  function move(d) {
    const opts = [...list.querySelectorAll("a[role=option]")]; if (!opts.length) return;
    sel = (sel + d + opts.length) % opts.length;
    opts.forEach((a, i) => a.setAttribute("aria-selected", i === sel));
    opts[sel].scrollIntoView({block: "nearest"});
  }
  input.addEventListener("input", paint);
  input.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter") { const opts = list.querySelectorAll("a[role=option]"); if (opts[sel < 0 ? 0 : sel]) { location.hash = opts[sel < 0 ? 0 : sel].getAttribute("href"); list.hidden = true; input.blur(); } }
    else if (e.key === "Escape") { list.hidden = true; input.blur(); }
  });
  input.addEventListener("blur", () => setTimeout(() => { list.hidden = true; }, 150));
  input.addEventListener("focus", () => { if (items.length) list.hidden = false; });
};

})();
