#!/usr/bin/env python3
"""Vocabulario cerrado de rasgos metabólicos (output x vía) + convergencias (Atlas v1.2, E5, ronda 2).

Uso (paso 4 de scripts/datos/construir_datos.py):
  python3 -I scripts/datos/rasgos_v12.py --data <dir data/ v1.2> --genomica <dir data/>/genomica.json \
      --curado scripts/datos/curado --salida <dir salidas> --fecha AAAAMMDD [--en-sitio]

Lee data/especies.json, data/evidencias.json, data/cepas.json, data/catalogo.json y el genomica.json de E2.
Con --en-sitio reescribe data/especies.json y data/catalogo.json (lo que es de E5: rasgos, genes_marcadores,
vocabulario_rasgos); sin él los deja en --salida.

Corrección v2 (director, P1-04): una cepa solo entra en rasgo.cepas si tiene al menos UNA evidencia de ese rasgo con
dirección «+»; las de otra dirección van a rasgo.cepas_en_contra con sus evidencias (CECT 5713 sale de las cepas del
rasgo bacteriocina de L. salivarius y queda en contra con ev011: porta Abp118 y no la produce).
Ampliación NCBI: la lectura de genomica.json fija `presente` solo si el taxón tiene una lectura con N >= 2 genomas y
nunca contradice una presencia sostenida por evidencia observada «+» (en ese caso se marca presente_conflicto_genoma). NO recalcula ninguna llamada genómica: consume taxones[*].marcadores y genomas[*].marcadores
de E2 tal cual (incluido refutado_en_ensayo, que manda en pantalla sobre el estado genómico).
Escribe en --salida:
  especies.json                 especies.json con `rasgos` v1.2, `genes_marcadores` sin los genes retirados
  catalogo.json                 catalogo.json + bloque `vocabulario_rasgos` (rasgos, vías, tipo de convergencia)
  convergencias_<f>.tsv         auditoría: output x especie x vía, gen, respaldo, solidez, n/N de E2
  diff_rasgos_<f>.tsv           v1.1 -> v1.2 por fila
  catalogo_parche_E5_<f>.json   M20 sin ruta en el título y M42 (BSH) propuesto, en el formato de mecanismos_v12.tsv
Aborta si un rasgo o una vía no está en el vocabulario, o si la regex via_en_fuente discrepa de la
confirmación manual (curado/via_en_fuente_confirmado.tsv). Solo biblioteca estándar. Idempotente.
"""
import argparse, csv, json, os, re, collections, unicodedata, datetime

# Vía -> marcador de E2. «define_via»: el marcador ES la enzima de la vía (su lectura puede fijar `presente`).
# SIALIDASA no define «degrada mucina» (una sialidasa no basta para crecer en mucina): solo se muestra.
VIA_MARCADOR = {"piruvato_oxidasa": "SPXB", "lactato_oxidasa": "LOX", "arginina_deiminasa": "ADS",
                "glutamato_descarboxilasa": "GAD", "hidrolasa_sales_biliares": "BSH", "glicosidasas_mucina": "SIALIDASA"}
DEFINE_VIA = {"SPXB", "LOX", "ADS", "GAD", "BSH"}
GEN_CANONICO = {"SPXB": {"spxb", "pox"}, "LOX": {"lox"}, "ADS": {"arca", "arcb", "arcc"}, "GAD": {"gada", "gadb"}, "BSH": {"bsh", "cbh"}}
LECTURA_A_PRESENTE = {"constante_presente": "si", "constante_ausente": "no", "variable_cepa": "variable_cepa",
                      "sin_resolver": "sin_resolver"}
ESTADO_TXT = {"P": "lo lleva", "A": "no lo lleva (medido)", "I": "indeterminado", "NM": "no medido",
              "NE": "no evaluable con la anotación de NCBI"}  # NE: solo texto (genomica.json publica NM + no_evaluable[id])
LECTURA_NO_FIJA = ("no_medido", "no_evaluable", "un_genoma")
RANGO_PRESENTE = {"no": 0, "variable_cepa": 1, "si": 2}  # el genoma solo puede bajar el fenotipo curado, nunca subirlo

# Patrones que, sobre claim_es, indican que la fuente NOMBRA la enzima o el gen de la vía (no el sustrato ni el output).
VIA_EN_CLAIM = {
    "piruvato_oxidasa": [r"piruvato oxidasa", r"\bpox\b", r"\bspxb\b"],
    "lactato_oxidasa": [r"lactato oxidasa", r"\blox\b"],
    "aminoacido_oxidasa": [r"amino[aá]cido oxidasa", r"\baaoso\b", r"laao"],
    "arginina_deiminasa": [r"arginina.deiminasa", r"\bads\b"],
    "ureasa": [r"ureasa"],
    "glutamato_descarboxilasa": [r"\bgad\b", r"glutamato descarboxilasa"],
    "hidrolasa_sales_biliares": [r"hidrolasa de sales biliares", r"\bbsh\b"],
    "coa_transferasa_butirato": [r"coa.transferasa"],
    "ptb_buk": [r"butirato quinasa", r"\bbuk\b", r"\bptb\b"],
    "dextranasa": [r"dextranasa"],
    "proteasa_challisina": [r"challisina", r"\bsgc\b"],
    "glicosidasas_mucina": [r"mucinasa", r"sialidasa", r"glicosidasa"],
    "cluster_hmo": [r"regiones de utilizacion de hmo", r"glicosidasas y transportadores"],
}
NIVEL_GEN = {"GEN-v", "GEN-p"}
ORDEN_BASE = ["causal", "observado", "prediccion_genomica", "contexto", "criterio_propio", "sin_dato"]
TIPO_TXT = {
    "convergencia_de_output": "Convergencia de output: la misma molécula por enzimas distintas",
    "convergencia_por_curar": "Convergencia por curar: las vías distintas no están aún en las fuentes del atlas",
    "gen_compartido": "Mismo gen en varios géneros: no es convergencia",
    "via_generica": "Vía genérica: no permite decidir entre productores",
    "output_compartido_via_desconocida": "Varios productores, ninguno con vía identificada",
    "productor_unico": "Un solo productor en el atlas",
}


def tsv(path):
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f, delimiter="\t"))


def norm(s):
    return "".join(c for c in unicodedata.normalize("NFD", (s or "").lower()) if unicodedata.category(c) != "Mn")


def via_en_claim(via, claims):
    """Devuelve 'si'/'no' (o None si la vía no tiene patrones). Expuesta para tools/test_via_en_fuente.py."""
    pats = VIA_EN_CLAIM.get(via)
    if not pats:
        return None
    txt = " ".join(norm(c) for c in claims)
    return "si" if any(re.search(norm(p), txt) for p in pats) else "no"


def tipo_convergencia(filas):
    """filas: rasgos v1.2 de un mismo output con presente afirmativo. Regla única (la usa también la app)."""
    vias = {r["via"] for r in filas if r["via"] != "desconocida"}
    cand = {r["via_candidata"] for r in filas if r["via"] == "desconocida" and r["via_candidata"]}
    nsp = len({r["especie"] for r in filas})
    con_gen = len({r["especie"] for r in filas if r["genes"]})
    if len(vias) >= 2:
        return "convergencia_de_output"
    if len(vias | cand) >= 2:
        return "convergencia_por_curar"
    if len(vias) == 1 and con_gen >= 2:
        return "gen_compartido"
    if len(vias) == 1 and nsp >= 2:
        return "via_generica"
    if nsp >= 2:
        return "output_compartido_via_desconocida"
    return "productor_unico"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--genomica", required=True)
    ap.add_argument("--curado", required=True)
    ap.add_argument("--salida", required=True)
    ap.add_argument("--fecha", required=True)
    ap.add_argument("--en-sitio", action="store_true")
    a = ap.parse_args()
    os.makedirs(a.salida, exist_ok=True)
    J = lambda n: json.load(open(os.path.join(a.data, n), encoding="utf-8"))
    esp, ev, cep, cat = J("especies.json"), J("evidencias.json"), J("cepas.json"), J("catalogo.json")
    G = json.load(open(a.genomica, encoding="utf-8"))
    voc = {r["id"]: r for r in tsv(os.path.join(a.curado, "vocabulario_rasgos.tsv"))}
    mapeo = collections.defaultdict(list)
    for r in tsv(os.path.join(a.curado, "rasgos_mapeo_v11_a_v12.tsv")):
        mapeo[(r["especie"], int(r["idx"]))].append(r)
    conf = {(r["especie"], r["rasgo"], r["via"]): r for r in tsv(os.path.join(a.curado, "via_en_fuente_confirmado.tsv"))}
    marc_def = {m["id"]: m for m in G["marcadores"]}

    # ---- genómica de E2: solo lectura
    taxa_por_slug = collections.defaultdict(list)
    for taxon, t in G["taxones"].items():
        taxa_por_slug[t.get("slug_atlas")].append((taxon, t))
    acc_por_cepa = {g["cepa_atlas"]: acc for acc, g in sorted(G["genomas"].items()) if g.get("cepa_atlas")}

    def genomica(slug, vias, cepas_rasgo):
        out = []
        for via in vias:
            mk = VIA_MARCADOR[via]
            filas = [(tx, t["marcadores"].get(mk)) for tx, t in taxa_por_slug.get(slug, []) if t["marcadores"].get(mk)]
            taxa = [{"taxon": tx, "n": x["n"], "i": x["i"], "N": x["N"], "lectura": x["lectura"], "texto": x["texto"]} for tx, x in filas]
            if not taxa:
                taxa = [{"taxon": None, "n": None, "i": None, "N": 0, "lectura": "no_medido",
                         "texto": "sin genomas públicos analizados para esta especie: no medido, no ausencia"}]
            cepas = {}
            for cid in sorted(c for c, x in cep.items() if x.get("especie") == slug and c in acc_por_cepa):
                gg = G["genomas"][acc_por_cepa[cid]]
                ref = (gg.get("refutado_en_ensayo") or {}).get(mk)
                e = gg["marcadores"].get(mk, "NM")
                txt = ESTADO_TXT["NE"] if mk in (gg.get("no_evaluable") or {}) else ESTADO_TXT[e]
                d = {"accesion": acc_por_cepa[cid], "estado": e, "texto": txt, "gen": (gg.get("genes") or {}).get(mk),
                     "anotador": (gg.get("anotador") or {}).get(mk), "vinculo": gg.get("vinculo_cepa")}
                if ref:  # regla_pantalla de E2: el ensayo de la misma cepa manda sobre la anotación
                    d.update({"estado_pantalla": "refutado_en_ensayo", "texto": "anotado, refutado en ensayo",
                              "evidencia": ref.get("evidencia"), "pmid": ref.get("pmid")})
                d["es_cepa_del_rasgo"] = cid in cepas_rasgo
                cepas[cid] = d
            out.append({"marcador": mk, "via": via, "define_via": mk in DEFINE_VIA,
                        "confirmar_con": marc_def.get(mk, {}).get("confirmar_con"), "taxones": taxa, "cepas_atlas": cepas})
        return out

    def base_de(fuentes, via):
        bases = []
        for f in fuentes:
            if f == "criterio_propio":
                bases.append("criterio_propio"); continue
            e = ev.get(f)
            if not e:
                bases.append("sin_dato"); continue
            if e.get("tipo") != "evidencia" or not e.get("nivel"):
                bases.append("contexto"); continue
            if e["nivel"] in NIVEL_GEN:
                bases.append("prediccion_genomica"); continue
            if via != "desconocida" and re.search(r"mutante", norm(e["claim_es"])):
                bases.append("causal"); continue
            bases.append("observado")
        return min(bases, key=ORDEN_BASE.index) if bases else "sin_dato"

    nuevos, diff, usados_conf = {}, [], set()
    for slug, s in esp.items():
        out = []
        for i, r in enumerate(s.get("rasgos") or []):
            filas = mapeo.get((slug, i))
            if not filas:
                raise SystemExit(f"rasgo sin mapear: {slug}[{i}] {r['rasgo']}")
            for m in filas:
                rid, via = m["rasgo"], m["via"]
                if rid not in voc or voc[rid]["tipo"] != "rasgo":
                    raise SystemExit(f"rasgo fuera de vocabulario: {rid}")
                if via not in voc or voc[via]["tipo"] != "via":
                    raise SystemExit(f"vía fuera de vocabulario: {via}")
                fuentes = r.get("fuentes") or []
                claims = [ev[f]["claim_es"] for f in fuentes if f in ev]
                # P1-04: solo con dirección «+» se SOSTIENE el rasgo; el resto va a cepas_en_contra (no se pierde)
                cepas = sorted({ev[f]["cepa"] for f in fuentes if f in ev and ev[f].get("cepa") and ev[f].get("direccion") == "+"})
                contra = collections.defaultdict(list)
                for f in fuentes:
                    x = ev.get(f)
                    if x and x.get("cepa") and x.get("direccion") not in ("+", None) and x["cepa"] not in cepas:
                        contra[x["cepa"]].append(f)
                cepas_en_contra = [{"cepa": c, "evidencias": sorted(fs), "direcciones": sorted({ev[f]["direccion"] for f in fs})}
                                   for c, fs in sorted(contra.items())]
                if fuentes == ["criterio_propio"]:
                    alcance = "criterio_propio"
                elif fuentes and all(f in ev and ev[f].get("cepa") for f in fuentes):
                    alcance = "cepa"
                elif r.get("nivel_taxonomico") == "subgrupo":
                    alcance = "subgrupo"
                else:
                    alcance = "especie"
                # via_en_fuente: regex Y confirmación manual; si discrepan, se aborta
                vef = None
                if via != "desconocida":
                    rx = via_en_claim(via, claims)
                    c = conf.get((slug, rid, via))
                    if not c:
                        vef = "sin_confirmar"
                    elif rx != c["confirmado"]:
                        raise SystemExit(f"via_en_fuente: regex={rx} y confirmación={c['confirmado']} en {slug}/{rid}/{via}")
                    else:
                        vef = c["confirmado"]; usados_conf.add((slug, rid, via))
                # vías con marcador en E2: la identificada o, si es desconocida, todas las del output (candidatas)
                if via in VIA_MARCADOR:
                    vias_g = [via]
                elif via == "desconocida":
                    vias_g = [v for v, x in voc.items() if x["tipo"] == "via" and x["output_de"] == rid and v in VIA_MARCADOR]
                else:
                    vias_g = []
                gm = genomica(slug, vias_g, set(cepas))
                genes, retirados = [], []
                tipicos = {x.lower() for x in (voc[via]["genes_tipicos"] or "").split("|") if x}
                for g in (r.get("genes") or []):
                    gl = g.lower()
                    # respaldo genómico: el gen es el gen canónico de un marcador de E2 que DEFINE la vía y al menos un
                    # genoma de la especie tiene llamada P (E2 llama por gen o por producto; gadC solo no cuenta en E2)
                    lleva = any(x["define_via"] and gl in GEN_CANONICO[x["marcador"]] and
                                any(gg.get("slug_atlas") == slug and gg["marcadores"].get(x["marcador"]) == "P"
                                    for gg in G["genomas"].values()) for x in gm)
                    if rid == "bacteriocina":
                        genes.append({"gen": g, "respaldo": "pendiente_E3"})
                    elif re.search(r"\b" + re.escape(norm(g)) + r"\b", " ".join(norm(c) for c in claims)):
                        genes.append({"gen": g, "respaldo": "fuente"})
                    elif vef == "si" and gl in tipicos:
                        genes.append({"gen": g, "respaldo": "enzima_en_fuente"})
                    elif lleva:
                        genes.append({"gen": g, "respaldo": "genoma_E2"})
                    else:
                        retirados.append(g)
                # presente es FENOTIPO curado. El genoma solo puede BAJARLO por ausencia del gen (sin gen no hay vía):
                # si -> variable_cepa o no, variable_cepa -> no, y nunca contra una evidencia observada a favor.
                # Nunca lo SUBE: porta el gen ≠ produce la molécula (gad en 8/8 no convierte «variable» en «sí»).
                presente, origen, conflicto, nota_gen = r.get("presente"), "curado_v11", None, None
                if via in VIA_MARCADOR and VIA_MARCADOR[via] in DEFINE_VIA:
                    tx = [t for t in gm[0]["taxones"] if t["lectura"] not in LECTURA_NO_FIJA]
                    if len(tx) == 1:
                        nuevo = LECTURA_A_PRESENTE[tx[0]["lectura"]]
                        sostenida = any(ev.get(f, {}).get("direccion") == "+" and ev.get(f, {}).get("tipo") == "evidencia"
                                        and ev[f].get("nivel") not in NIVEL_GEN for f in fuentes)
                        cur = r.get("presente")
                        if nuevo == "no" and cur in ("si", "variable_cepa") and sostenida:
                            conflicto = f"el genoma ({tx[0]['texto']}) contradice la evidencia observada: manda la evidencia"
                        elif nuevo in RANGO_PRESENTE and cur in RANGO_PRESENTE and RANGO_PRESENTE[nuevo] < RANGO_PRESENTE[cur]:
                            presente, origen = nuevo, "genomica_E2:" + gm[0]["marcador"]
                        elif nuevo != cur:
                            nota_gen = (f"genoma: {tx[0]['texto']}. No cambia el fenotipo curado: porta el gen ≠ produce la molécula")
                nr = {
                    "rasgo": rid, "etiqueta": voc[rid]["etiqueta"], "grupo": voc[rid]["grupo"],
                    "clase_mecanismo": voc[rid]["clase_mecanismo"] or None,
                    "presente": presente, "presente_origen": origen, "presente_v11": r.get("presente"),
                    "alcance": alcance, "cepas": cepas, "cepas_en_contra": cepas_en_contra,
                    "via": via, "via_etiqueta": voc[via]["etiqueta"],
                    "mecanismo_id": (voc[via]["mecanismo_id"] or "").rstrip("*") or (
                        voc[rid]["mecanismo_id"].rstrip("*") if voc[rid]["mecanismo_id"] and "|" not in voc[rid]["mecanismo_id"] else None),
                    "via_en_fuente": vef,
                    "via_candidata": m["via_candidata"] or None,
                    "via_candidata_etiqueta": voc[m["via_candidata"]]["etiqueta"] if m["via_candidata"] else None,
                    "candidata_a_curar": m["candidata_a_curar"] or None,
                    "genes": genes, "genes_retirados": retirados,
                    "base": base_de(fuentes, via),
                    "genomica": gm,
                    "detalle": r.get("detalle"), "nota_cepa_vs_especie": r.get("nota_cepa_vs_especie"),
                    "fuentes": fuentes, "origen_v11": {"rasgo": r["rasgo"], "idx": i},
                }
                if conflicto:
                    nr["presente_conflicto_genoma"] = conflicto
                if nota_gen:
                    nr["presente_nota_genoma"] = nota_gen
                if rid == "h2o2" and r["rasgo"] == "acetato":
                    nr["detalle"] = "CECT 5713 produce H2O2 in vitro (ev009); la fuente no nombra la enzima"
                if rid == "acetato" and r["rasgo"] == "acetato":
                    nr["detalle"] = "CECT 5713 produce acetato (ev009)"
                out.append(nr)
                diff.append([slug, i, r["rasgo"], r.get("nivel_taxonomico") or "", r.get("presente") or "", "|".join(r.get("genes") or []),
                             rid, via, vef or "", alcance, presente or "", origen,
                             ",".join(c.split(".st-")[-1] for c in cepas),
                             "|".join(f"{g['gen']}({g['respaldo']})" for g in genes), "|".join(retirados),
                             nr["base"], m["justificacion"]])
        nuevos[slug] = out
    sobran = set(conf) - usados_conf
    if sobran:
        raise SystemExit(f"confirmaciones sin rasgo: {sorted(sobran)}")

    # ---- tipo de convergencia por output (literatura, presente afirmativo)
    por_out = collections.defaultdict(list)
    for slug, L in nuevos.items():
        for r in L:
            if r["presente"] in ("si", "variable_cepa", "sin_resolver") and r["alcance"] != "criterio_propio":
                por_out[r["rasgo"]].append(dict(r, especie=slug))
    tipo = {rid: tipo_convergencia(F) for rid, F in por_out.items()}

    # ---- auditoría TSV (columnas que consume el pivote por output)
    conv = []
    for slug, L in nuevos.items():
        for r in L:
            if r["alcance"] == "criterio_propio":
                continue
            gtxt = []
            for x in r["genomica"]:
                for t in x["taxones"]:
                    gtxt.append(f"{x['marcador']} {t['taxon'] or ''}: {t['texto']}".replace("  ", " "))
            ctxt = [f"{c.split('.st-')[-1]}={d.get('estado_pantalla') or d['estado']}({x['marcador']})"
                    for x in r["genomica"] for c, d in x["cepas_atlas"].items() if d["es_cepa_del_rasgo"]]
            conv.append([tipo.get(r["rasgo"], "sin_productor_afirmativo"), r["rasgo"], slug, r["alcance"],
                         ",".join(c.split(".st-")[-1] for c in r["cepas"]), r["via"], r["via_en_fuente"] or "",
                         r["via_candidata"] or "", "|".join(f"{g['gen']}({g['respaldo']})" for g in r["genes"]),
                         r["base"], r["presente"], r["presente_origen"], " ; ".join(gtxt), " ; ".join(ctxt),
                         r["candidata_a_curar"] or "", "|".join(r["fuentes"])])
    f = a.fecha
    with open(os.path.join(a.salida, f"convergencias_{f}.tsv"), "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh, delimiter="\t", lineterminator="\n")
        w.writerow(["tipo_convergencia", "output", "especie", "alcance", "cepas", "via", "via_en_fuente", "via_candidata",
                    "genes(respaldo)", "base", "presente", "presente_origen", "genomica_E2_especie", "genomica_E2_cepas_del_rasgo",
                    "a_curar", "fuentes"])
        for c in sorted(conv, key=lambda c: (c[1], c[2], c[5])):
            w.writerow(c)
    with open(os.path.join(a.salida, f"diff_rasgos_{f}.tsv"), "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh, delimiter="\t", lineterminator="\n")
        w.writerow(["especie", "idx", "rasgo_v11", "nivel_v11", "presente_v11", "genes_v11", "rasgo_v12", "via", "via_en_fuente",
                    "alcance_v12", "presente_v12", "presente_origen", "cepas", "genes_v12(respaldo)", "genes_retirados", "base", "justificacion"])
        w.writerows(diff)

    # ---- especies.json y catalogo.json v1.2 (solo cambia lo que es de E5)
    esp2 = json.loads(json.dumps(esp))
    for slug in esp2:
        esp2[slug]["rasgos"] = nuevos[slug]
        ret = {g for r in nuevos[slug] for g in r["genes_retirados"]}
        v11 = esp[slug].get("genes_marcadores") or []
        esp2[slug]["genes_marcadores"] = [g for g in v11 if g not in ret] + sorted(
            {g["gen"] for r in nuevos[slug] for g in r["genes"]} - set(v11))
        if ret & set(v11):
            esp2[slug]["genes_marcadores_retirados"] = sorted(ret & set(v11))
    dst = a.data if a.en_sitio else a.salida
    with open(os.path.join(dst, "especies.json"), "w", encoding="utf-8") as fh:
        json.dump(esp2, fh, ensure_ascii=False, separators=(",", ":"))
    cat2 = json.loads(json.dumps(cat))
    cat2["vocabulario_rasgos"] = {
        "generador": "scripts/rasgos_v12.py (E5)",
        "tipos_convergencia": TIPO_TXT,
        "rasgos": {k: {"etiqueta": v["etiqueta"], "grupo": v["grupo"], "clase_mecanismo": v["clase_mecanismo"] or None,
                       "que_mide": v["que_mide"] or None, "nota": v["nota"] or None,
                       "tipo_convergencia": tipo.get(k), "productores": sorted({x["especie"] for x in por_out.get(k, [])}),
                       "vias_identificadas": sorted({x["via"] for x in por_out.get(k, []) if x["via"] != "desconocida"})}
                   for k, v in voc.items() if v["tipo"] == "rasgo"},
        "vias": {k: {"etiqueta": v["etiqueta"], "output": v["output_de"] or None, "mecanismo_id": (v["mecanismo_id"] or "").rstrip("*") or None,
                     "genes_tipicos": [x for x in (v["genes_tipicos"] or "").split("|") if x],
                     "marcador_genomico": v["marcador_genomico_E2"] or None}
                 for k, v in voc.items() if v["tipo"] == "via"},
    }
    # M20 «Producción de butirato» ya viene de curado/mecanismos_v12.tsv (parche E5 integrado en el generador)
    with open(os.path.join(dst, "catalogo.json"), "w", encoding="utf-8") as fh:
        json.dump(cat2, fh, ensure_ascii=False, separators=(",", ":"))

    parche = {
        "mecanismos_v12.tsv": [
            {"id": "M20", "nombre_antes": "Produccion de butirato (via butiril-CoA:acetato CoA-transferasa)", "nombre": "Produccion de butirato",
             "motivo": "La unica fuente enlazada (clostridium-butyricum.ev001, PMID 35203691) dice 'produccion de butirato' sin ruta; en C. butyricum "
                       "la ruta descrita es ptb-buk. La ruta pasa a campo por especie (rasgos[].via / via_candidata), no al titulo.",
             "vias_candidatas": [{"via": "ptb_buk", "especies": ["clostridium-butyricum"], "estado": "a_curar (E9)", "fuente_candidata": "PMID 39892707 (CBM588)"},
                                 {"via": "coa_transferasa_butirato", "especies": ["faecalibacterium-prausnitzii", "faecalibacterium-duncaniae"],
                                  "estado": "a_curar (E9)", "fuente_candidata": "PMID 15028695; PMID 33729711"}]},
            {"id": "M42", "propuesto": True, "nombre": "Desconjugacion de sales biliares (BSH)", "clase": "enzima", "genes": "bsh",
             "nota": "M41 ya es la coagregacion; BSH no tiene mecanismo en el catalogo. requiere_viabilidad: desconocido (lo decide E1)"},
        ],
        "especies_por_rasgo_butirato": sorted(s for s, L in nuevos.items() if any(r["rasgo"] == "butirato" for r in L)),
    }
    with open(os.path.join(a.salida, f"catalogo_parche_E5_{f}.json"), "w", encoding="utf-8") as fh:
        json.dump(parche, fh, ensure_ascii=False, indent=1)

    cnt = collections.Counter
    allr = [r for L in nuevos.values() for r in L]
    print("rasgos v11:", sum(len(s.get("rasgos") or []) for s in esp.values()), "| v12:", len(allr),
          "| 'otro':", sum(r["rasgo"] == "otro" for r in allr))
    print("via_en_fuente:", dict(cnt(r["via_en_fuente"] for r in allr)))
    print("presente_origen:", dict(cnt(r["presente_origen"] for r in allr)))
    print("con genómica E2 medida:", sum(any(t["lectura"] != "no_medido" for x in r["genomica"] for t in x["taxones"]) for r in allr),
          "| con genómica no_medido:", sum(bool(r["genomica"]) and all(t["lectura"] == "no_medido" for x in r["genomica"] for t in x["taxones"]) for r in allr))
    print("tipos:", json.dumps(tipo, ensure_ascii=False))


if __name__ == "__main__":
    main()
