;(function(){
/* 25_genoma.js · P1-05. Bloque «Genoma GCF_» de la ficha de cepa y tabla n/N + banda de cobertura de la ficha de especie.
   Única fuente: genomica.json (llamadas por genoma, lecturas por taxón ya redactadas, cobertura) y puerta_cepa.json
   (estado del genoma de la cepa para la seguridad). Aquí no se calcula ninguna llamada: solo se pinta.
   Reglas de pantalla: NM / no evaluable / no medido = gris discontinuo, nunca «ausente»; cada llamada lleva su anotador
   (Bakta, PGAP (NCBI), ABRicate); el ANI es «parentesco genómico, no actividad»; ningún código crudo con guion bajo.
   Expone Atlas.genoma = {cepa(st) -> {sum, body}, especie(s) -> {sum, body} | null, banda()}. Lo usa 20_species.js. */
const U = Atlas.ui, h = U.h;
const D = new Proxy({}, {get: (_, k) => Atlas.data[k]});
const G = () => D.raw.genomica || null;

/* ---------- utilidades ---------- */
const num = (x, d) => x == null ? "—" : (d != null ? Number(x).toFixed(d) : String(x)).replace(".", ",");
const miles = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
/** Identificadores de herramientas (réplicas, bacteriocinas de BAGEL4, contigs) sin guion bajo crudo */
const limpio = s => String(s == null ? "" : s).replace(/^(rep[\w.]*?)_\d+_rep\((.+)\)$/i, "$1 ($2)").replace(/_/g, " ");
const ncbi = acc => "https://www.ncbi.nlm.nih.gov/datasets/genome/" + acc + "/";
const accLink = (acc, txt) => /^GC[AF]_/.test(acc || "") ? h("a", {class: "gn-acc", href: ncbi(acc), target: "_blank", rel: "noopener"}, txt || acc) : (txt || acc || "");
/** Píldora de estado genómico: ok / warn / bad / nd (gris discontinuo) / neutra */
const pill = (cls, txt, title) => h("span", {class: "gn-pill gn-" + cls, title: title || null}, txt);
const marcadorNombre = id => ((G().marcadores || []).find(m => m.id === id) || {}).nombre || limpio(id);
const genomasTxt = n => n + (n === 1 ? " genoma público" : " genomas públicos");
const corto = id => marcadorNombre(id).split(" (")[0];
const lecturaEtq = k => (G().lecturas_etiqueta || {})[k] || limpio(k);
/** Nombre corto de un gen anotado: «spxB: pyruvate oxidase» → spxB; descripciones sin gen → primeras palabras */
const genesCortos = t => [...new Set(String(t || "").split(";").map(x => x.trim()).filter(Boolean)
  .map(x => x.includes(":") ? x.split(":")[0].trim() : x.split(" ").slice(0, 3).join(" ")))].map(limpio);

const GEST = {P: ["pres", "lo lleva"], A: ["aus", "no lo lleva (medido)"], I: ["warn", "indeterminado"], NM: ["nd", "no medido"]};
const PROD = {no_medido: ["nd", "producción no medida"], no_porta: ["aus", "no porta el locus completo"], porta_sin_ensayo: ["pres", "porta · producción sin ensayar"],
              porta_y_produce: ["ok", "porta y produce"], porta_no_produce: ["warn", "porta y NO produce"]};
const ANOT_CORTO = {"Bakta": "Bakta", "PGAP (NCBI)": "PGAP (NCBI)", "ABRicate": "ABRicate", "BAGEL4": "BAGEL4"};

/** Accesión y vínculo de una cepa del atlas: cepas.json manda; si no, el vínculo de genomica.json (por nombre/depósito/cepa tipo) */
function vinculo(st) {
  const g = G(), ca = (g && g.cepas_atlas || {})[st.id] || null, pc = D.puertaCepa(st.id) || {};
  const acc = (st.genoma && st.genoma.accesion) || (ca && ca.accesion) || pc.accesion || null;
  const v = (ca && ca.vinculo) || pc.vinculo_genoma || null;
  return {acc, porNombre: v === "nombre", texto: (ca && ca.texto) || pc.vinculo_texto || null, motivos: (ca && ca.motivo) || []};
}
function checkmTxt(g) {
  if (g.checkm2) return "CheckM2 " + num(g.checkm2.completitud) + " / " + num(g.checkm2.contaminacion);
  if (g.checkm_ncbi) return "CheckM (NCBI) " + num(g.checkm_ncbi.completitud) + " / " + num(g.checkm_ncbi.contaminacion);
  return null;
}

/* ---------- seguridad del genoma (E6): el estado sale de puerta_cepa.genoma, no de la vista ---------- */
function seguridad(g, pc) {
  const wrap = h("div", {class: "gn-sec"}, h("p", {class: "sub"}, "Seguridad del genoma"));
  const etqs = ["AMR adquirida", "Virulencia (VFDB)", "Plásmidos"];
  if (pc.genoma === "no_aplica") {
    wrap.append(h("div", {class: "gates"}, ...etqs.map(l => U.gatePill("genoma", l, "no_aplica"))), h("p", {class: "k6-note"}, (pc.motivo_genoma || "levadura: las bases bacterianas no aplican") + "."));
    return wrap;
  }
  if (pc.genoma !== "medido" || !g || !(g.seguridad || {}).medido) {
    wrap.append(h("div", {class: "gates"}, ...etqs.map(l => U.gatePill("genoma", l, "NM"))),
      h("p", {class: "k6-note"}, "No medido para esta cepa: " + (pc.motivo_genoma || (g && g.seguridad && g.seguridad.motivo) || "sin dato") +
        ". La calificación QPS «sin AMR adquirida» es de cepa: el QPS de la especie no la cubre."));
    return wrap;
  }
  const amr = g.marcadores.AMR_ADQ, pl = g.marcadores.PLASMIDO, vf = g.seguridad.VFDB;
  wrap.append(h("div", {class: "gates"},
    U.gatePill("genoma", "AMR adquirida", amr, amr === "P" ? genesCortos(g.genes.AMR_ADQ).join(", ") : null),
    U.gatePill("genoma", "Virulencia (VFDB)", vf, vf === "P" ? (g.seguridad.vfdb_genes || []).map(limpio).join(", ") : null),
    // un replicón sin resistencia informa, no bloquea: ámbar, no rojo
    h("span", {class: "gate-pill gate-" + (pl === "P" ? "warn" : U.gateClass("genoma", pl))}, h("b", {}, "Plásmidos: "),
      pl === "P" ? genesCortos(g.genes.PLASMIDO).join(", ") : pl === "A" ? "sin replicón reconocido" : "no medido")));
  const n = [(g.seguridad.herramienta || "ABRicate") + "."];
  if (pl === "P" && amr === "A") n.push("Replicón de plásmido sin genes de resistencia: informa, no bloquea.");
  if (pl === "A") n.push("«Sin replicón reconocido» no es «sin plásmidos»: PlasmidFinder cubre mal las BAL.");
  if ((g.seguridad.amr_en_contig_con_replicon || []).length) n.push("AMR en el mismo contig que un replicón (dato posicional, no prueba de plásmido): " + g.seguridad.amr_en_contig_con_replicon.map(limpio).join(", ") + ".");
  if (pc.qps_especie !== "qps") n.push("VFDB sin hits no certifica seguridad en una especie sin QPS.");
  n.forEach(x => wrap.append(h("p", {class: "k6-note"}, x)));
  return wrap;
}

/* ---------- marcadores de la cepa: estado + anotador · lectura de la especie · confirmar con ---------- */
function celdaCepa(g, m) {
  const est = g.marcadores[m.id], ref = (g.refutado_en_ensayo || {})[m.id], prod = (g.produccion || {})[m.id];
  const ne = (g.no_evaluable || {})[m.id], anot = (g.anotador || {})[m.id];
  const gvf = (g.gen_vs_fenotipo || []).find(x => x.marcador === m.id && x.lectura === "porta_y_fenotipo");
  const out = [];
  if (ref) out.push(pill("warn", "anotado, refutado en ensayo"), U.sourceChip(ref.evidencia));
  else if (prod && est !== "NM" && PROD[prod.estado]) {
    out.push(pill(...PROD[prod.estado]));
    (prod.evidencias || []).forEach(e => out.push(U.sourceChip(e)));
  } else if (est === "NM") out.push(pill("nd", ne ? "no evaluable con la anotación de NCBI" : "no medido", ne || "no medido: no es ausencia"));
  else out.push(pill(...(GEST[est] || ["nd", "sin dato"])));
  if (!ref && gvf) out.push(pill("ok", "fenotipo observado en esta cepa"), U.sourceChip(gvf.evidencia));
  const extra = [];
  if (est === "P" && (g.genes || {})[m.id]) extra.push(h("i", {}, genesCortos(g.genes[m.id]).slice(0, 3).join(", ")));
  if (est === "I" && (g.indeterminado || {})[m.id]) extra.push("homólogo: " + genesCortos(g.indeterminado[m.id]).slice(0, 2).join(", "));
  if ((g.restos_locus || {})[m.id]) extra.push("restos del locus: " + genesCortos(g.restos_locus[m.id]).join(", "));
  if (anot) extra.push(h("span", {class: "gn-anot", title: (G().anotadores || {})[anot] || ""}, ANOT_CORTO[anot] || anot));
  return [h("div", {class: "gn-est"}, ...out), extra.length ? h("div", {class: "gn-extra small muted"}, ...extra.flatMap((x, i) => [i ? " · " : "", x])) : ""];
}
function tablaMarcadores(g) {
  const tx = (G().taxones[g.taxon] || {marcadores: {}}).marcadores;
  const tb = h("tbody", {});
  G().marcadores.filter(m => !["AMR_ADQ", "PLASMIDO"].includes(m.id)).forEach(m => {
    if (g.marcadores[m.id] == null) return;
    const t = tx[m.id] || {};
    tb.append(h("tr", {class: "gn-row"},
      h("th", {scope: "row"}, h("b", {}, m.nombre)),
      h("td", {"data-l": "Esta cepa"}, ...celdaCepa(g, m)),
      h("td", {"data-l": "En su especie", class: "small"}, t.texto ? t.texto : h("span", {class: "muted"}, "no medido en el taxón")),
      m.confirmar_con ? h("td", {"data-l": "Confirmar con", class: "small muted"}, m.confirmar_con) : h("td", {class: "small muted gn-sin"}, "—")));
  });
  return h("div", {class: "gn-tblwrap"}, h("table", {class: "gn-tbl"},
    h("thead", {}, h("tr", {}, h("th", {}, "Marcador"), h("th", {}, "Esta cepa"), h("th", {}, "En su especie (genomas públicos)"), h("th", {}, "Confirmar con"))), tb));
}

/* ---------- BAGEL4, superficie (E4) y ANI ---------- */
function bagel(g) {
  const b = g.bagel4 || {};
  if (!b.medido) return null;
  const hits = b.hits || [];
  return [h("p", {class: "sub"}, "Bacteriocinas (BAGEL4)"),
    hits.length ? h("ul", {class: "mini-list gn-bagel"}, hits.map(x => h("li", {},
      h("b", {}, limpio(x.bacteriocina)), " · clase " + (x.clase || "?") + (x.identidad_pct != null ? " · identidad " + num(x.identidad_pct) + " %" : "") +
      (x.longitud_aa ? " · " + x.longitud_aa + " aa" : "") + (x.novedad ? " · " + x.novedad : ""),
      String(x.clase) === "III" ? h("span", {class: "gn-pill gn-warn"}, "HIPÓTESIS") : "")))
      : h("p", {class: "small"}, "BAGEL4 corrido: sin hits."),
    h("p", {class: "k6-note"}, "Predicción por homología: lleva el gen ≠ produce la bacteriocina.")];
}
const SUP = [["mucbp_grande_pb", "Proteína de unión a moco grande", v => v ? miles(v) + " pb" : "no"], ["mucbp_corto_1041pb", "MucBP corto (1.041 pb)", v => v ? "sí" : "no"],
  ["srtA", "Sortasa A (srtA)", v => v ? "sí" : "no"], ["lpxtg_ysirk_n", "Proteínas LPXTG/YSIRK", v => v], ["eps_glicosiltransferasas_n", "Glicosiltransferasas de EPS", v => v],
  ["eps_polisacarido_n", "Otros genes de polisacárido", v => v], ["dlt_n", "Operón dlt (LTA)", v => v + (v === 4 ? " de 4 (completo)" : " de 4")],
  ["ta_lta_n", "Ácidos teicoicos / LTA", v => v], ["wxl_n", "Proteínas WxL", v => v], ["gbpc_n", "Proteína de unión a glucano (GbpC)", v => v]];
function superficie(g) {
  const s = g.superficie; if (!s) return null;
  const kv = h("dl", {class: "gn-kv"});
  SUP.forEach(([k, l, f]) => { if (s[k] != null) kv.append(h("dt", {}, l), h("dd", {}, String(f(s[k])))); });
  const out = [h("p", {class: "sub"}, "Superficie · predicción genómica (Bakta)"), kv,
    h("p", {class: "k6-note"}, (s.lectura || "predicción genómica: no mide unión a moco ni EPS producido") + ".")];
  if (s.mucbp_grande_contig) out.push(h("p", {class: s.bandera_calidad ? "gn-flag" : "k6-note"},
    "Gen grande en el " + limpio(s.mucbp_grande_contig) + (s.bandera_calidad ? ": " + s.bandera_calidad + "." : " (contig principal).")));
  if (s.no_medible) out.push(h("p", {class: "k6-note"}, "No medible con estos datos: " + s.no_medible + "."));
  return out;
}
function ani(g) {
  const top = g.ani_top3 || [];
  const head = h("p", {class: "sub"}, "ANI: parientes más cercanos ", h("span", {class: "gn-pill gn-nd"}, "Parentesco genómico, no actividad"));
  if (!top.length) return [head, h("p", {class: "k6-note"}, "Sin pares ANI para este genoma (no medido entre géneros; ningún par del mismo género supera el filtro de skani).")];
  return [head, h("ul", {class: "mini-list gn-ani"}, top.map(a => {
    const atl = (G().genomas[a.accession] || {}).cepa_atlas;
    return h("li", {},
      atl ? U.link(atl) : h("b", {}, a.cepa_ncbi || a.accession), " ", accLink(a.accession, a.accession),
      h("span", {class: "gn-ani-n"}, " · ANI " + num(a.ani, 2) + " %"),
      h("span", {class: "small muted"}, " · fracción alineada " + num(Math.round(a.af_propia)) + " / " + num(Math.round(a.af_vecina)) + " % · " + (a.herramienta || "skani")),
      (a.difiere_en || []).length ? h("div", {class: "small"}, "Difiere en: " + a.difiere_en.map(corto).join(", ")) : h("div", {class: "small muted"}, "Mismos estados en los marcadores medidos"));
  })), h("p", {class: "k6-note"}, "ANI delimita especie; no transporta el rasgo: no extrapoles la actividad de esta cepa a sus vecinas por cercanía genómica." +
    (g.ani_n_pares ? " " + g.ani_n_pares + " pares calculados para este genoma." : ""))];
}

/* ---------- banda de cobertura (también en la ficha de especie) ---------- */
const GRUPO_NM = {IMM: "inmunidad (IMM)", BGL: "BAGEL4 (BGL)", SEG: "ABRicate (seguridad)"};
function noMedidos() {
  return (G().cobertura.no_medido_en_publicos || []).map(x => {
    const e = x.estado_en_genomas_con_llamadas || {}, tot = Object.values(e).reduce((a, b) => a + b, 0);
    const k = Object.keys(GRUPO_NM).find(p => x.ids[0].startsWith(p));
    return {txt: (k ? GRUPO_NM[k] : x.ids.map(limpio).join("/")) + " no medido en " + (e.no_medido || 0) + " de " + tot,
            motivo: String(x.motivo || "").replace(/\s*\(ver [^()]*\)/g, "").replace(/_/g, " ")};
  });
}
function banda() {
  const g = G(); if (!g) return null;
  const c = Object.fromEntries(g.cobertura.tabla.map(x => [x.clave, x]));
  const v = k => (c[k] || {}).valor;
  const el = h("div", {class: "gn-banda"},
    h("p", {}, h("b", {}, "Cobertura genómica del atlas. "),
      "Análisis genómico público en " + v("especies_con_analisis") + " de " + v("especies_atlas") + " especies (" + v("especies_con_marcadores_bakta") + " con Bakta, " +
      v("especies_solo_pgap") + " solo con PGAP de NCBI); " + v("cepas_con_perfil") + " de " + v("cepas_atlas") + " cepas con perfil (" + v("cepas_vinculadas_por_nombre") +
      " vinculadas por nombre: verificar); " + v("genomas_con_llamadas") + " de " + v("genomas_inventario") + " genomas públicos con llamadas."),
    h("p", {class: "small muted"}, noMedidos().map(x => x.txt).join(" · ") + " genomas con llamadas. No medido ≠ ausente."));
  return el;
}

/* ---------- ficha de cepa ---------- */
function cepa(st) {
  const g0 = G(), pc = D.puertaCepa(st.id) || {}, vk = vinculo(st), g = vk.acc ? D.genome(vk.acc) : null;
  const body = h("div", {class: "gn"});
  if (!g0) { body.append(h("p", {class: "k6-note"}, "Capa genómica no cargada: no medido ≠ ausente.")); return {sum: "no medido", body}; }
  // cabecera: accesión, vínculo, anotación y herramientas
  const head = h("div", {class: "gn-head"});
  head.append(vk.acc ? accLink(vk.acc) : pill("nd", "no medido · sin accesión en el atlas"));
  if (vk.porNombre) head.append(pill("warn", vk.texto || "vinculada por nombre: verificar",
    "El genoma se ha asociado a la cepa por nombre, depósito o cepa tipo, no por una accesión registrada en la fuente"));
  if (g) {
    head.append(h("span", {class: "small"}, "Anotación: ", h("b", {}, g.anotacion)), g.herramientas && g.herramientas.length ? h("span", {class: "small muted"}, "Herramientas: " + g.herramientas.join(", ")) : "");
    const ck = checkmTxt(g); if (ck) head.append(h("span", {class: "small muted"}, ck + " (completitud / contaminación, %)"));
    if (g.ncbi) head.append(h("span", {class: "small muted"}, (g.ncbi.organismo || "") + (g.ncbi.nivel_ensamblado ? " · " + g.ncbi.nivel_ensamblado : "") + (g.ncbi.material_tipo ? " · cepa tipo" : "")));
    if (g.taxon_nota) head.append(h("span", {class: "small muted"}, g.taxon_nota));
  }
  body.append(head);
  body.append(seguridad(g, pc));
  if (!g) {
    body.append(h("p", {class: "gn-nm"}, pill("nd", "no medido"), " ",
      vk.acc ? "Hay accesión, pero ningún análisis público cargado sobre ese genoma. No medido ≠ ausente."
        : "No medido (sin accesión en el atlas) ≠ ausente. Ningún marcador, ANI ni superficie de esta cepa se ha medido: no es un «no lo tiene»."));
    if (pc.nota_origen) body.append(h("p", {class: "k6-note"}, "Origen curado: " + pc.nota_origen + ". «Sin accesión en el atlas» no es «no existe genoma»."));
    return {sum: (vk.acc || "sin accesión") + " · no medido", body};
  }
  const conMarc = Object.values(g.anotador || {}).some(a => a === "Bakta" || a === "PGAP (NCBI)");
  if (conMarc) {
    body.append(h("p", {class: "sub"}, "Marcadores (" + g.taxon + ", " + genomasTxt((g0.taxones[g.taxon] || {}).genomas || 0) + ")"), tablaMarcadores(g));
    if (Object.keys(g.no_evaluable || {}).length) body.append(h("p", {class: "k6-note"}, "«No evaluable con la anotación de NCBI»: ese marcador no es fiable sobre PGAP (validación frente a Bakta); no es ausencia."));
    body.append(h("p", {class: "k6-note"}, (g0.lecturas || {}).aviso || ""));
  } else body.append(h("p", {class: "gn-nm"}, pill("nd", "marcadores no medidos"), " En este genoma solo hay " + g.anotacion + ": los marcadores génicos no están medidos (≠ ausentes)."));
  [bagel(g), superficie(g), ani(g)].filter(Boolean).forEach(x => body.append(...x));
  const nm = noMedidos();
  if (nm.length) body.append(h("p", {class: "k6-note"}, "No medidos en genomas públicos: " + nm.map(x => x.txt + " (" + x.motivo + ")").join(" · ") + "."));
  // resumen del plegable
  const amr = g.marcadores.AMR_ADQ;
  const amrTxt = pc.genoma === "no_aplica" ? "AMR: no aplica" : pc.genoma === "vinculo_sin_verificar" ? "AMR adquirida: no cuenta (vínculo sin verificar)"
    : pc.genoma !== "medido" ? "AMR adquirida: no medida" : amr === "P" ? "AMR adquirida: " + genesCortos(g.genes.AMR_ADQ).join(", ") : amr === "A" ? "AMR adquirida: sin hits" : "AMR adquirida: no medida";
  const t0 = (g.ani_top3 || [])[0];
  const sum = [vk.acc, vk.porNombre ? "vinculada por nombre: verificar" : null, checkmTxt(g), amrTxt,
    t0 ? "ANI más cercano: " + (t0.cepa_ncbi || t0.accession) + " " + num(t0.ani, 2) : null].filter(Boolean).join(" · ");
  return {sum, body};
}

/* ---------- ficha de especie: tabla n/N por marcador y taxón + banda ---------- */
const SUP_SP = {mucbp_grande: "Proteína de unión a moco grande", mucbp_corto_1041pb: "MucBP corto (1.041 pb)", srtA: "Sortasa A (srtA)", dlt_operon_completo_4: "Operón dlt completo"};
const LECT_SUP = {constante_de_especie: "constante de especie", variable_de_cepa: "varía entre cepas"};
function celdaTaxon(t) {
  if (!t) return h("span", {class: "gn-pill gn-nd"}, "no medido");
  const nd = t.lectura === "no_evaluable" || t.lectura === "no_medido";
  if (nd) return h("span", {class: "gn-pill gn-nd", title: t.texto || ""}, lecturaEtq(t.lectura));
  const cls = t.lectura === "variable_cepa" ? "gn-var" : t.lectura === "sin_resolver" || t.lectura === "un_genoma" ? "gn-warn" : "gn-const";
  return h("span", {class: "gn-nN", title: t.texto || ""}, h("b", {}, t.n + "/" + t.N), t.i ? h("span", {class: "small"}, " + " + t.i + " indet.") : "",
    " ", h("span", {class: "gn-pill " + cls}, lecturaEtq(t.lectura)), t.no_evaluables ? h("span", {class: "small muted"}, " · " + t.no_evaluables + " NCBI no evaluable" + (t.no_evaluables > 1 ? "s" : "")) : "");
}
function especie(s) {
  const g0 = G(); if (!g0) return null;
  const taxa = Object.entries(g0.taxones).filter(([, t]) => t.slug_atlas === s.slug);
  const body = h("div", {class: "gn"});
  body.append(banda());
  const ca = (s.cepas || []).filter(c => g0.cepas_atlas[c]);
  if (!taxa.length) {
    const det = (g0.cobertura.tabla.find(x => x.clave === "especies_con_analisis") || {}).detalle;
    body.append(h("p", {class: "gn-nm"}, pill("nd", "no medido"), " " + (s.tipo_organismo === "levadura" && det ? det : "Ningún genoma público de esta especie con llamadas de marcadores") + ". No medido ≠ ausente."));
    return {sum: "sin genomas públicos con marcadores · no medido", body};
  }
  const nG = taxa.reduce((a, [, t]) => a + (t.genomas || 0), 0);
  const anot = {}; taxa.forEach(([, t]) => Object.entries(t.genomas_por_anotador || {}).forEach(([k, n]) => { anot[k] = (anot[k] || 0) + n; }));
  body.append(h("p", {class: "small"}, h("b", {}, genomasTxt(nG)), " (" + Object.entries(anot).map(([k, n]) => k + " " + n).join(", ") + ") · " +
    ca.length + " de " + (s.cepas || []).length + " cepas del atlas con perfil" +
    (ca.some(c => g0.cepas_atlas[c].vinculo === "nombre") ? " (" + ca.filter(c => g0.cepas_atlas[c].vinculo === "nombre").length + " vinculadas por nombre: verificar)" : "") + "."));
  const multi = taxa.length > 1;
  const tb = h("tbody", {});
  g0.marcadores.forEach(m => {
    if (!taxa.some(([, t]) => t.marcadores[m.id])) return;
    tb.append(h("tr", {class: "gn-row"}, h("th", {scope: "row"}, h("b", {}, m.nombre)),
      ...taxa.map(([tn, t]) => h("td", {"data-l": multi ? tn : "Genomas públicos"}, celdaTaxon(t.marcadores[m.id]))),
      m.confirmar_con ? h("td", {"data-l": "Confirmar con", class: "small muted"}, m.confirmar_con) : h("td", {class: "small muted gn-sin"}, "—")));
  });
  body.append(h("p", {class: "sub"}, "Marcadores en genomas públicos (n/N)"),
    h("div", {class: "gn-tblwrap"}, h("table", {class: "gn-tbl gn-sp"}, h("thead", {}, h("tr", {}, h("th", {}, "Marcador"),
      ...taxa.map(([tn]) => h("th", {}, multi ? h("i", {}, tn) : "Genomas públicos")), h("th", {}, "Confirmar con"))), tb)),
    h("p", {class: "k6-note"}, "n/N = genomas públicos que lo llevan / genomas medidos; «indet.» = homólogo o pseudogén que la regla no decide. Son genomas públicos, no cepas independientes. " + ((g0.lecturas || {}).aviso || "")));
  // superficie por especie (predicción, solo donde hay Bakta funcional)
  taxa.forEach(([tn, t]) => {
    const L = (t.superficie || {}).lecturas; if (!L) return;
    const rows = Object.entries(SUP_SP).filter(([k]) => L[k]).map(([k, l]) => h("li", {}, h("b", {}, l), ": " + L[k].n + "/" + L[k].N + " · " + (LECT_SUP[L[k].lectura] || limpio(L[k].lectura))));
    const gt = L.eps_glicosiltransferasas_n;
    if (gt) rows.push(h("li", {}, h("b", {}, "Glicosiltransferasas de EPS"), ": de " + gt.min + " a " + gt.max + " por genoma · " + (LECT_SUP[gt.lectura] || limpio(gt.lectura))));
    if (rows.length) body.append(h("p", {class: "sub"}, "Superficie · predicción genómica (Bakta" + (multi ? ", " + tn : "") + ")"), h("ul", {class: "mini-list"}, rows));
  });
  const av = g0.cobertura.aviso_taxonomico, ae = g0.cobertura.ani_entre_subespecies;
  if (multi && av) body.append(h("p", {class: "k6-note"}, av.replace(/\s*\([^()]*_[^()]*\)/g, "").replace(/_/g, " ") +
    (ae && ae.pares ? " ANI entre ellas: de " + num(ae.min, 2) + " a " + num(ae.max, 2) + " % (" + ae.pares + " pares): parentesco genómico, no actividad." : "")));
  const sum = genomasTxt(nG) + " · " + Object.entries(anot).map(([k, n]) => k + " " + n).join(" · ") + " · tabla n/N";
  return {sum, body};
}

Atlas.genoma = {cepa, especie, banda, vinculo};
})();
