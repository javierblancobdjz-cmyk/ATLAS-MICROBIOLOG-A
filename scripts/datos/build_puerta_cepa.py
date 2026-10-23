#!/usr/bin/env python3
"""build_puerta_cepa.py (v2, 2026-10-23) · K6: puerta de seguridad y regulatoria por CEPA y por FORMA.

v2: ya NO lee fuentes_publicas/. Las llamadas por genoma (AMR_ADQ=SEGR/ResFinder, PLASMIDO=SEGP/PlasmidFinder,
seguridad.VFDB=SEGV, co-localización AMR/replicón, CheckM2) se leen de data/genomica.json, que genera
scripts/derivar_genomica.py (E2, con el parche de seguridad de E6). Aquí solo se guardan REGLAS DERIVADAS y
AGREGADOS: un único sitio para cada llamada.

Entradas (todas en data/):
  cepas.json       accesión GCF_ de la cepa (o ninguna) y origen curado
  especies.json    QPS (estado + calificaciones), Novel Food, historia de uso, ruta_por_forma, tipo_organismo,
                   seguridad de especie (ya corregida por scripts/aplicar_correcciones_curadas.py)
  evidencias.json  formas realmente ensayadas por cepa
  genomica.json    llamadas por genoma (E2)

Salidas:
  data/puerta_cepa.json            reglas derivadas por cepa x forma + estado de seguridad de especie + n/N
  salidas/puerta_cepa_<AAAAMMDD>.json  copia versionada
  salidas/abricate_pendiente_<AAAAMMDD>.tsv  cepas del atlas con GCF_ sin perfil ABRicate, priorizadas

Reglas por forma (visibles en el JSON, campo "regla"):
  R-cerrada     ruta de especie cerrada para esa forma                                  -> cerrada
  R-amr         QPS con calificación «sin AMR adquirida», forma viable, AMR_ADQ = P      -> bloqueada_qps
  R-nomedido    igual, pero el genoma de la cepa no está medido                         -> no_medido
  R-calif       QPS SIN calificación registrada en especies.json, forma viable, cepa no medida
                -> no_medido («calificación QPS sin verificar»); nunca verde por defecto
  R-noqps       especie SIN QPS con ruta abierta (autorización de cepa o de forma) y genoma de la cepa no medido -> no_medido
  R-especie     resto: la ruta de especie; AMR/VFDB/plásmidos informan
  En posbiótico la AMR informa pero no decide (criterio propio: la calificación QPS es de cepas viables).
  Levadura: ResFinder/VFDB/PlasmidFinder no aplican -> genoma «no_aplica», nunca «ausente».
Seguridad de especie (regla S):
  a_revisar si bloqueo curado = a_revisar, o QPS ∈ {no_seguridad, excluida}, o hay virulencia registrada;
  si no, sin_bloqueo (que NO es «cepa medida y limpia»).

Uso (paso 6 de scripts/datos/construir_datos.py):
  python3 -I scripts/datos/build_puerta_cepa.py --data DIR_DATA --salida-dir DIR_SALIDAS --fecha AAAA-MM-DD
Ampliación NCBI: los genomas PGAP no tienen ABRicate (seguridad.medido = false): su cepa sigue en no_medido, nunca en verde.
"""
import argparse, collections, datetime, json, os, sys

FORMAS = ["vivo", "posbiotico", "fermentado"]
VIABLE = {"vivo", "fermentado"}
POSB = {"inactivado", "posbiotico", "componente"}
ORD_NIVEL = {"MA": 6, "ECA": 5, "OBS": 4, "ANI": 3, "CEL": 2, "GEN-v": 1, "GEN-p": 1}


def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def gen_name(g):  # 'erm(C)_12' -> 'erm(C)' (alelo ResFinder fuera)
    return g.rsplit("_", 1)[0] if "_" in g and g.rsplit("_", 1)[1].isdigit() else g


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--salida-dir", required=True)
    ap.add_argument("--fecha", required=True)
    a = ap.parse_args()

    cepas = load(os.path.join(a.data, "cepas.json"))
    especies = load(os.path.join(a.data, "especies.json"))
    evid = load(os.path.join(a.data, "evidencias.json"))
    gj = load(os.path.join(a.data, "genomica.json"))
    GEN = gj["genomas"]

    # ---------------- seguridad de especie (regla S) ----------------
    seg_esp = {}
    for slug, sp in especies.items():
        seg = sp.get("seguridad") or {}
        q = ((sp.get("regulatorio") or {}).get("qps") or {}).get("estado")
        mot = []
        if seg.get("bloqueo") == "a_revisar":  # el motivo curado (TSV) sustituye al genérico
            mot.append(seg.get("motivo") or "marcada a revisar en la curación")
        if q == "no_seguridad" and not seg.get("motivo"):
            mot.append("EFSA no la recomienda para QPS por seguridad")
        if q == "excluida" and not seg.get("motivo"):
            mot.append("excluida de la evaluación QPS")
        vir = seg.get("virulencia") or []
        if vir:
            mot.append("%d señal%s de virulencia" % (len(vir), "es" if len(vir) > 1 else ""))
        seg_esp[slug] = {"estado": "a_revisar" if mot else "sin_bloqueo", "motivos": mot, "regla": "S",
                         "fuera_qps": q in ("no_seguridad", "excluida"), "n_virulencia": len(vir)}

    # ---------------- agregados n/N por taxón (de genomica.json) ----------------
    agg = {}
    for acc, g in GEN.items():
        s = g.get("seguridad") or {}
        if not s.get("medido"):
            continue
        x = agg.setdefault(g["taxon"], {"slug_atlas": g["slug_atlas"], "N": 0, "amr": 0, "plasmido": 0, "vfdb": 0,
                                        "colocalizados": 0, "genes_amr": collections.Counter()})
        x["N"] += 1
        x["amr"] += g["marcadores"].get("AMR_ADQ") == "P"
        x["plasmido"] += g["marcadores"].get("PLASMIDO") == "P"
        x["vfdb"] += s.get("VFDB") == "P"
        x["colocalizados"] += bool(s.get("amr_en_contig_con_replicon"))
        for gn in sorted({gen_name(t.strip().split(":")[0]) for t in (g["genes"].get("AMR_ADQ") or "").split(";") if t.strip()}):
            x["genes_amr"][gn] += 1
    agregados = {k: {**{kk: vv for kk, vv in v.items() if kk != "genes_amr"}, "genes_amr": dict(sorted(v["genes_amr"].items(), key=lambda kv: (-kv[1], kv[0])))}
                 for k, v in sorted(agg.items())}

    # ---------------- evidencias por cepa ----------------
    ev_by = collections.defaultdict(list)
    for e in evid.values():
        if e.get("tipo") == "evidencia" and e.get("cepa"):
            ev_by[e["cepa"]].append(e)

    # ---------------- puerta por cepa x forma ----------------
    out_cepas = {}
    for cid, st in sorted(cepas.items()):
        sp = especies.get(st["especie"], {})
        reg = sp.get("regulatorio") or {}
        qps = reg.get("qps") or {}
        cal = [c.get("codigo") for c in qps.get("calificaciones") or []]
        es_qps = qps.get("estado") == "qps"
        calif = "sin_amr_adquirida" if "sin_amr_adquirida" in cal else ("sin_verificar" if es_qps else "no_aplica")
        levadura = sp.get("tipo_organismo") == "levadura"
        rpf = reg.get("ruta_por_forma") or {}
        acc = (st.get("genoma") or {}).get("accesion")
        # una fuente por dato: el vínculo cepa -> genoma vive en genomica.json (cepas_atlas), incluido el vínculo por nombre
        vin = gj.get("cepas_atlas", {}).get(cid) or {}
        vinculo = "accesion" if acc else (vin.get("vinculo") if vin.get("accesion") else None)
        if not acc and vin.get("accesion"):
            acc = vin["accesion"]
        g = GEN.get(acc) if acc else None
        if levadura:
            genoma, motivo = "no_aplica", "ResFinder, VFDB y PlasmidFinder son bases bacterianas: no aplican a una levadura"
        elif not acc:
            genoma, motivo = "sin_accesion", "sin accesión de genoma en el atlas"
        elif vinculo == "nombre" and not ((g or {}).get("seguridad") or {}).get("medido"):
            genoma = "gcf_sin_abricate"
            motivo = (f"genoma {acc} vinculado por nombre, depósito o cepa tipo (verificar); "
                      + ((g or {}).get("seguridad") or {}).get("motivo", "ABRicate no corrido"))
        elif vinculo == "nombre":
            # ABRicate sí está corrido sobre ese GCF_, pero el vínculo GCF_ -> cepa es por nombre: no cuenta como dato de la cepa
            a_ = (g or {}).get("marcadores", {}).get("AMR_ADQ")
            genoma = "vinculo_sin_verificar"
            motivo = (f"genoma {acc} vinculado por nombre, depósito o cepa tipo (verificar); ABRicate sí medido en ese genoma "
                      f"(AMR adquirida: {'con hits' if a_ == 'P' else 'sin hits' if a_ == 'A' else 'no medida'}), "
                      "pero no cuenta para la cepa hasta verificar el vínculo")
        elif not g:
            genoma, motivo = "gcf_sin_abricate", "genoma público no analizado (fuera de fuentes_publicas)"
        elif not (g.get("seguridad") or {}).get("medido"):
            genoma, motivo = "gcf_sin_abricate", (g.get("seguridad") or {}).get("motivo") or "genoma público sin ABRicate"
        else:
            genoma, motivo = "medido", None
        amr = g["marcadores"].get("AMR_ADQ") if genoma == "medido" else "NM"
        amr_genes = sorted({gen_name(t.strip().split(":")[0]) for t in (g["genes"].get("AMR_ADQ") or "").split(";") if t.strip()}) if amr == "P" else []
        puerta = {}
        for f in FORMAS:
            ruta = (rpf.get(f) or {}).get("estado") or "desconocida"
            viable = f in VIABLE
            if ruta == "cerrada":
                est, regla, razon = "cerrada", "R-cerrada", "ruta de especie cerrada para esta forma"
            elif es_qps and viable and calif == "sin_amr_adquirida" and amr == "P":
                est, regla = "bloqueada_qps", "R-amr"
                razon = "AMR adquirida en el genoma (" + ", ".join(amr_genes) + "): no cumple la calificación QPS «sin AMR adquirida»"
            elif es_qps and viable and calif == "sin_amr_adquirida" and genoma != "medido":
                est, regla = "no_medido", "R-nomedido"
                razon = "especie %s; la calificación QPS «sin AMR adquirida» es de cepa y no está medida (%s)" % (ruta, motivo)
            elif es_qps and viable and calif == "sin_verificar" and genoma != "medido":
                est, regla = "no_medido", "R-calif"
                razon = ("especie %s; calificación QPS sin verificar (especies.json no la registra; comprobar en la lista EFSA)"
                         % ruta) + ("; " + motivo if genoma == "no_aplica" else "; genoma de la cepa: " + motivo)
            elif es_qps and viable and calif == "sin_verificar" and amr == "P":
                est, regla = "no_medido", "R-calif"
                razon = "AMR adquirida en el genoma (" + ", ".join(amr_genes) + ") y calificación QPS sin verificar"
            elif not es_qps and ruta == "abierta" and genoma not in ("medido", "no_aplica"):
                # especie SIN QPS con la ruta abierta por una autorización (p. ej. nuevo alimento de una cepa concreta):
                # esa autorización no se hereda a otra cepa, y una cepa sin genoma medido nunca sale en verde
                est, regla = "no_medido", "R-noqps"
                razon = ("especie: abierta por una autorización que no es QPS (la especie no tiene QPS) y que no se hereda; "
                         "genoma de la cepa no medido (%s)" % motivo)
            else:
                est, regla = ruta, "R-especie"
                razon = "especie: %s" % ruta
                if es_qps and viable and amr == "A":
                    razon += "; condición QPS «sin AMR adquirida» cumplida en el genoma (ResFinder sin hits)"
                if not viable and es_qps:
                    razon += "; en forma no viable la AMR informa pero no decide (criterio propio)"
                if not es_qps and genoma not in ("medido", "no_aplica"):
                    razon += "; genoma de la cepa no medido (%s)" % motivo
            puerta[f] = {"estado": est, "ruta_especie": ruta, "regla": regla, "razon": razon,
                         "fuentes_ruta": (rpf.get(f) or {}).get("fuentes", [])}
        evs = ev_by.get(cid, [])
        fe = sorted({e.get("forma") for e in evs if e.get("forma")})
        out_cepas[cid] = {
            "especie": st["especie"], "accesion": acc, "vinculo_genoma": vinculo,
            "vinculo_texto": vin.get("texto") if vinculo == "nombre" else None, "genoma": genoma, "motivo_genoma": motivo,
            "calificacion_qps": calif, "qps_especie": qps.get("estado"),
            "novel_food_especie": (reg.get("novel_food") or {}).get("estado"),
            "historia_uso_idf": (reg.get("historia_uso") or {}).get("inventario_idf"),
            "puerta_por_forma": puerta,
            "formas_con_evidencia": sorted({("posbiotico" if x in POSB else x) for x in fe}),
            "n_evidencias": len(evs),
            "mejor_nivel": max((e["nivel"] for e in evs), key=lambda n: ORD_NIVEL.get(n, 0), default=None),
            "nota_origen": st.get("origen") if genoma in ("sin_accesion",) else None,
        }

    meta = {
        "generado": a.fecha, "script": "scripts/datos/build_puerta_cepa.py (v2)",
        "fuentes": ["data/cepas.json", "data/especies.json", "data/evidencias.json", "data/genomica.json"],
        "genomica_version": gj.get("version"),
        "estados_genoma": {"medido": "ABRicate corrido sobre el genoma de la cepa (vínculo por accesión)",
                           "gcf_sin_abricate": "hay GCF_ pero ABRicate no está corrido sobre él: no medido",
                           "vinculo_sin_verificar": "ABRicate corrido sobre un GCF_ vinculado por nombre, depósito o cepa tipo: no cuenta para la cepa hasta verificar el vínculo",
                           "sin_accesion": "sin genoma en el atlas: no medido", "no_aplica": "levadura: bases bacterianas no aplican"},
        "nota": "Las llamadas por genoma viven en genomica.json (E2); aquí solo reglas y agregados. "
                "AMR adquirida = ResFinder; CARD intrínseco (ileS, rpoB, lmrD) no cuenta. VFDB sin hits no certifica "
                "seguridad. no_medido y no_aplica nunca se pintan como ausente ni en verde.",
    }
    doc = {"meta": meta, "seguridad_especie": seg_esp, "agregados_taxon": agregados, "cepas": out_cepas}
    tag = a.fecha.replace("-", "")
    os.makedirs(a.salida_dir, exist_ok=True)
    txt = json.dumps(doc, ensure_ascii=False, separators=(",", ":"))
    for p in (os.path.join(a.salida_dir, "puerta_cepa_%s.json" % tag), os.path.join(a.data, "puerta_cepa.json")):
        with open(p, "w", encoding="utf-8") as f:
            f.write(txt)

    # ---------------- ABRicate pendiente, priorizado ----------------
    def prio(c):
        x, st = out_cepas[c], cepas[c]
        clin = ORD_NIVEL.get(x["mejor_nivel"] or "", 0) >= 5
        if x["calificacion_qps"] == "sin_amr_adquirida" and (clin or st.get("categoria") == "comercial"):
            p = 1  # el verde de su puerta «vivo» depende de este genoma
        elif x["qps_especie"] != "qps" and x["n_evidencias"]:
            p = 2  # especie sin QPS con evidencia: la seguridad se decide por cepa
        elif st.get("categoria") in ("tipo", "referencia"):
            p = 3  # ancla de especie (n/N, vecinos)
        else:
            p = 4
        return (p, -ORD_NIVEL.get(x["mejor_nivel"] or "", 0), -x["n_evidencias"], c)
    pend = sorted((c for c, x in out_cepas.items() if x["genoma"] == "gcf_sin_abricate"), key=prio)
    with open(os.path.join(a.salida_dir, "abricate_pendiente_%s.tsv" % tag), "w", encoding="utf-8") as f:
        f.write("prioridad\tcepa\taccesion\tcategoria\tqps_especie\tmejor_nivel\tn_evidencias\tmotivo\n")
        for c in pend:
            x = out_cepas[c]
            f.write("\t".join(map(str, [prio(c)[0], c, x["accesion"], cepas[c].get("categoria"), x["qps_especie"],
                                        x["mejor_nivel"] or "-", x["n_evidencias"], x["motivo_genoma"]])) + "\n")

    n = collections.Counter(x["genoma"] for x in out_cepas.values())
    celdas = collections.Counter(x["puerta_por_forma"][f]["estado"] for x in out_cepas.values() for f in FORMAS)
    vivo = collections.Counter(x["puerta_por_forma"]["vivo"]["estado"] for x in out_cepas.values())
    se = collections.Counter(v["estado"] for v in seg_esp.values())
    print("cepas:", dict(n), "| celdas:", dict(celdas), "| vivo:", dict(vivo), "| seguridad especie:", dict(se),
          "| pendientes ABRicate:", len(pend), file=sys.stderr)


if __name__ == "__main__":
    main()
