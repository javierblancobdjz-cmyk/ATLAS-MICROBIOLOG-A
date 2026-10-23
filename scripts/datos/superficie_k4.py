#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""K4 r2 (E4) - columnas de arquitectura de superficie para el genomica.json de E2.

Copiado de proto_E4/scripts/k4_columnas_superficie_r2.py. derivar_genomica.py importa construir() para que
haya UN solo calculo de superficie (genomas[acc].superficie). Este modulo no escribe genomica.json.

NO escribe genomica.json: emite SOLO el bloque `superficie` por accession, para que
el script unico de E2 (scripts/derivar_genomica.py) lo incruste. Un solo JSON, un solo
script de salida; esto es una funcion importable + un volcado auditable.

Cambios r2 (exigencia 5 del director + correccion propia):
  - `eps_glicosiltransferasas_n` pasaba a contar tambien los hits del termino
    'polysaccharide biosynthesis'. Se parte en tres campos explicitos.
  - Se anaden las variables NO PROTEICAS que exige la hipotesis rival
    (autoclave+proteasa resistente, Ca-dependiente): dlt_n, ta_lta_n, wxl_n, gbpc_n.
  - Bandera de contiguidad por fila (ya estaba) + lectura obligatoria por campo.

Uso (auditoria): python3 -I scripts/datos/superficie_k4.py <dir fuentes_publicas/drive> <dir_salida>
"""
import csv, json, os, sys
from collections import defaultdict, Counter
from datetime import date

TERMINOS_MUCINA_VALIDOS = {"MucBP", "mucin-binding"}
TERMINO_FALSO_POSITIVO = "lspA"   # signal peptidase II, 447 pb, 17/17: NO es union a moco
MUCBP_CORTO_PB = 1041

def leer(p):
    with open(p, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))

def largo(r):
    return int(r["end"]) - int(r["start"]) + 1

def construir(dir_fp):
    hits = leer(os.path.join(dir_fp, "salivarius_bakta_hits_funcionales_referencias.csv"))
    inv  = leer(os.path.join(dir_fp, "salivarius_bakta_inventario_referencias.csv"))
    # dedup: un mismo locus lo capturan varios terminos
    vistos, filas = set(), []
    for r in hits:
        k = (r["accession"], r["locus_tag"], r["grupo_funcional"])
        if k in vistos: continue
        vistos.add(k); filas.append(r)
    por_acc = defaultdict(list)
    for r in filas: por_acc[r["accession"]].append(r)

    salida, descartes = {}, Counter()
    for acc, rs in por_acc.items():
        cepa = rs[0]["cepa"]
        muc = [r for r in rs if r["grupo_funcional"] == "mucina_moco"]
        descartes["lspA_falso_positivo"] += sum(1 for r in muc if r["termino_buscado"] == TERMINO_FALSO_POSITIVO)
        muc = [r for r in muc if r["termino_buscado"] in TERMINOS_MUCINA_VALIDOS]
        longs = sorted((largo(r) for r in muc), reverse=True)
        grandes = [r for r in muc if largo(r) > MUCBP_CORTO_PB]
        g = max(grandes, key=largo) if grandes else None
        eps = [r for r in rs if r["grupo_funcional"] == "eps_biofilm"]
        gt  = [r for r in eps if r["termino_buscado"] == "glycosyltransferase"]
        pol = [r for r in eps if r["termino_buscado"] == "polysaccharide biosynthesis"]
        pared = [r for r in rs if r["grupo_funcional"] == "pared_carga"]
        dlt = [r for r in pared if r["termino_buscado"].startswith("dlt")]
        ta  = [r for r in pared if r["termino_buscado"] in ("teichoic acid", "lipoteichoic acid")]
        mat = [r for r in rs if r["grupo_funcional"] == "matriz_fibronectina_glucanos"]
        lpx = [r for r in rs if r["grupo_funcional"] == "lpxtg_superficie"]
        sor = [r for r in rs if r["grupo_funcional"] == "adhesion_sortasa"]
        # bandera de contiguidad: el gen grande en contig no principal
        bandera = None
        if g and g["contig"] != "contig_1":
            mismos = [r for r in rs if r["contig"] == g["contig"]]
            margen = max(int(r["end"]) for r in mismos) - int(g["end"])
            bandera = ("gen grande al borde de un contig secundario sin hits posteriores: "
                       "la longitud puede estar truncada; comprobar en el assembly report de NCBI"
                       if margen <= 0 else
                       f"gen grande en contig secundario (posible plásmido; {margen} pb hasta el último hit "
                       "del contig); comprobar cromosoma/plásmido en el assembly report de NCBI")
        salida[acc] = {
            "cepa_ncbi": cepa,
            "mucbp_corto_1041pb": any(l == MUCBP_CORTO_PB for l in longs),
            "mucbp_grande_pb": largo(g) if g else 0,
            "mucbp_grande_clase": "grande" if g else "solo_corto",
            "mucbp_grande_contig": g["contig"] if g else None,
            "mucina_loci_n": len(muc),
            "mucina_longitudes_pb": longs,
            "srtA": any(r["termino_buscado"] == "srtA" for r in sor),
            "sortasas_n": len(sor),
            "lpxtg_ysirk_n": len(lpx),
            "lpxtg_max_pb": max((largo(r) for r in lpx), default=0),
            # --- EPS partido (correccion r2) ---
            "eps_glicosiltransferasas_n": len(gt),
            "eps_polisacarido_n": len(pol),
            "eps_hits_n": len(eps),
            # --- variables no proteicas (hipotesis rival) ---
            "dlt_n": len(dlt),
            "ta_lta_n": len(ta),
            "wxl_n": sum(1 for r in mat if r["termino_buscado"] == "WxL"),
            "gbpc_n": sum(1 for r in mat if r["termino_buscado"] == "GbpC"),
            "bandera_calidad": bandera,
            "no_medible": {
                "repeticiones_internas_mucbp": None,
                "fichero_que_haria_falta": "InterProScan/hmmscan o el .tsv de Bakta con Pfam PF06458",
                "cromosoma_o_plasmido": None,
                "fichero_que_haria_falta_2": "assembly report de NCBI (público)",
            },
        }
    n_pub = len(inv)
    return salida, descartes, n_pub

def lecturas(bloque):
    """n/N por campo: CONSTANTE DE ESPECIE / VARIABLE DE CEPA / rango."""
    N = len(bloque)
    def nN(f, pred): return {"n": sum(1 for v in bloque.values() if pred(v)), "N": N}
    def lec(d): return ("constante_de_especie" if d["n"] in (0, d["N"]) else "variable_de_cepa")
    out = {}
    for campo, pred in [("mucbp_corto_1041pb", lambda v: v["mucbp_corto_1041pb"]),
                        ("mucbp_grande", lambda v: v["mucbp_grande_clase"] == "grande"),
                        ("srtA", lambda v: v["srtA"]),
                        ("dlt_operon_completo_4", lambda v: v["dlt_n"] == 4)]:
        d = nN(campo, pred); d["lectura"] = lec(d); out[campo] = d
    for campo in ["mucbp_grande_pb", "eps_glicosiltransferasas_n", "eps_hits_n", "ta_lta_n", "wxl_n", "gbpc_n", "lpxtg_max_pb"]:
        vals = sorted(v[campo] for v in bloque.values())
        nz = [x for x in vals if x]
        out[campo] = {"min": vals[0], "max": vals[-1], "rango_no_cero": [min(nz), max(nz)] if nz else None,
                      "lectura": "variable_de_cepa" if len(set(vals)) > 1 else "constante_de_especie"}
    return out

if __name__ == "__main__":
    dir_fp, dir_out = sys.argv[1], sys.argv[2]
    bloque, descartes, n_pub = construir(dir_fp)
    doc = {
        "version": date.today().isoformat(),
        "destino": "genomas[<accession>].superficie de genomica.json (lo incrusta el script unico de E2)",
        "generado_por": "scripts/k4_columnas_superficie_r2.py",
        "cobertura_en_pantalla": {
            "especies_del_atlas_con_esta_capa": 1,
            "especies_del_atlas": 26,
            "texto": "Arquitectura de superficie medida: 1 de 26 especies (Ligilactobacillus salivarius). "
                     f"{len(bloque)} de {n_pub} genomas públicos de la especie tienen Bakta funcional; "
                     f"los otros {n_pub - len(bloque)} son NO MEDIDO, no ausencia.",
        },
        "descartes_declarados": dict(descartes),
        "lecturas_nN": lecturas(bloque),
        "genomas": bloque,
    }
    f = os.path.join(dir_out, f"k4_columnas_superficie_{date.today().strftime('%Y%m%d')}.json")
    with open(f, "w", encoding="utf-8") as fh: json.dump(doc, fh, ensure_ascii=False, indent=1)
    print("escrito:", f)
    print(json.dumps(doc["cobertura_en_pantalla"], ensure_ascii=False, indent=1))
    print(json.dumps(doc["lecturas_nN"], ensure_ascii=False, indent=1))
    print("descartes:", doc["descartes_declarados"])
