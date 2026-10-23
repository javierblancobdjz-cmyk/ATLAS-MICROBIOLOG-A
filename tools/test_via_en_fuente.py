#!/usr/bin/env python3
"""Test de via_en_fuente (E5): una «la fuente nombra la vía» falsa sería un dato inventado con pinta de real.

Uso: python3 -I tools/test_via_en_fuente.py --data data --curado scripts/datos/curado

Comprueba sobre TODAS las filas de rasgos (40 en v1.2):
 1. Toda fila con vía identificada tiene confirmación manual en curado/via_en_fuente_confirmado.tsv.
 2. La regex del script (rasgos_v12.via_en_claim) da exactamente lo confirmado a mano.
 3. Si confirmado = si, la cita literal está, carácter a carácter, en el claim_es de alguna fuente del rasgo.
    Si confirmado = no, no hay cita.
 4. En filas con vía desconocida, ningún patrón de las vías de ESE output encuentra nada en sus fuentes
    (si lo encontrara, la curación se habría dejado una vía que la fuente sí nombra).
 5. Regresión: el patrón de la ronda 1 «gl[ui]canos.*mucina» daba «sí» en B. bifidum (nombra el sustrato, no la enzima).
Sale con código 1 al primer fallo de cualquier tipo, listándolos todos.
"""
import argparse, csv, json, os, re, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(AQUI, "..", "scripts", "datos"))
import rasgos_v12 as R  # noqa: E402


def tsv(p):
    with open(p, encoding="utf-8") as f:
        return list(csv.DictReader(f, delimiter="\t"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=os.path.join(AQUI, "..", "data"))
    ap.add_argument("--curado", default=os.path.join(AQUI, "..", "scripts", "datos", "curado"))
    a = ap.parse_args()
    esp = json.load(open(os.path.join(a.data, "especies.json"), encoding="utf-8"))
    ev = json.load(open(os.path.join(a.data, "evidencias.json"), encoding="utf-8"))
    voc = {r["id"]: r for r in tsv(os.path.join(a.curado, "vocabulario_rasgos.tsv"))}
    conf = {(r["especie"], r["rasgo"], r["via"]): r for r in tsv(os.path.join(a.curado, "via_en_fuente_confirmado.tsv"))}
    mapeo = {}
    for r in tsv(os.path.join(a.curado, "rasgos_mapeo_v11_a_v12.tsv")):
        mapeo.setdefault((r["especie"], int(r["idx"])), []).append(r)

    fallos, filas, si, no, desc = [], 0, 0, 0, 0
    for slug, s in esp.items():
        rasgos = s.get("rasgos") or []
        for i, r in enumerate(rasgos):
            # acepta especies.json v1.1 (rasgo v11 + mapeo) o v1.2 (rasgo ya mapeado)
            if "origen_v11" in r:
                pares = [(r["rasgo"], r["via"], r.get("fuentes") or [])]
            else:
                pares = [(m["rasgo"], m["via"], r.get("fuentes") or []) for m in mapeo[(slug, i)]]
            for rid, via, fuentes in pares:
                filas += 1
                claims = [ev[f]["claim_es"] for f in fuentes if f in ev]
                if via == "desconocida":
                    desc += 1
                    for v, x in voc.items():
                        if x["tipo"] == "via" and x["output_de"] == rid and R.via_en_claim(v, claims) == "si":
                            fallos.append(f"[4] {slug}/{rid}: vía desconocida pero la fuente nombra {v}")
                    continue
                c = conf.get((slug, rid, via))
                if not c:
                    fallos.append(f"[1] {slug}/{rid}/{via}: sin confirmación manual"); continue
                rx = R.via_en_claim(via, claims)
                if rx != c["confirmado"]:
                    fallos.append(f"[2] {slug}/{rid}/{via}: regex={rx} confirmado={c['confirmado']}")
                if c["confirmado"] == "si":
                    si += 1
                    if not c["cita_literal_claim_es"] or not any(c["cita_literal_claim_es"] in t for t in claims):
                        fallos.append(f"[3] {slug}/{rid}/{via}: la cita «{c['cita_literal_claim_es']}» no está en el claim")
                else:
                    no += 1
                    if c["cita_literal_claim_es"]:
                        fallos.append(f"[3] {slug}/{rid}/{via}: confirmado=no con cita")
    # 5. regresión del falso positivo de la ronda 1
    bif = ev["bifidobacterium-bifidum.ev003"]["claim_es"]
    if not re.search(R.norm(r"gl[ui]canos.*mucina"), R.norm(bif)):
        fallos.append("[5] la regresión ya no reproduce el falso positivo: revisar el caso")
    if R.via_en_claim("glicosidasas_mucina", [bif]) != "no":
        fallos.append("[5] B. bifidum ev003 vuelve a dar «la fuente nombra la vía»")

    print(f"filas de rasgo: {filas} | vía identificada: {si + no} (sí confirmadas: {si}, no: {no}) | vía desconocida: {desc}")
    if fallos:
        print("FALLOS:"); [print("  " + x) for x in fallos]
        sys.exit(1)
    print("OK")


if __name__ == "__main__":
    main()
