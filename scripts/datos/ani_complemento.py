"""ANI complementario: pares del mismo género que ninguna de las dos fuentes públicas cruzó.

Por qué existe. El ANI publicado sale de dos ejecuciones distintas:
  * drive/ani_pares_referencias.csv: skani 0.3.1 (triangle --sparse) entre los genomas de drive/ani_matriz_referencias.csv.
  * ncbi/ncbi_ani_pares.csv: pyskani dentro de cada género, en los pares con al menos un genoma NUEVO de NCBI frente a
    los nuevos y a los 62 genomas de drive/ con Bakta (genomas_publicos.json: marcadores_atlas.tiene_bakta).
Los genomas de drive/ sin Bakta (p. ej. 4 B. dentium «solo ABRicate») nunca se cruzaron con los nuevos de NCBI de su
género. Un par así no está «por debajo del umbral»: no se ha medido. Este script calcula esos pares con la misma
herramienta que la ampliación NCBI (pyskani) y deja TODOS los pares calculados (también los que no superan el filtro de
skani, con ANI vacío) en curado/ani_pares_complemento.csv, para que derivar_genomica.py sepa qué se midió.

No es un paso del build (necesita red y pyskani): se ejecuta a mano y su salida queda versionada en curado/.
Uso:
  python3 -I scripts/datos/ani_complemento.py --cache DIR_FNA [--fecha 2026-10-23]
DIR_FNA es una caché local de FASTA (fuera del repo); lo que ya está no se vuelve a bajar.
"""
import argparse
import csv
import glob
import gzip
import json
import os
import re
import sys
import time
import urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(AQUI))
FP = os.path.join(REPO, "fuentes_publicas")
SALIDA = os.path.join(AQUI, "curado", "ani_pares_complemento.csv")
FTP = "https://ftp.ncbi.nlm.nih.gov/genomes/all"
UA = {"User-Agent": "atlas-microbiologia-ani-complemento/1.0 (python urllib)"}
COLS = ["ref_accession", "query_accession", "ANI", "align_fraction_ref", "align_fraction_query",
        "especie_ref", "especie_query", "misma_especie_atlas", "herramienta", "fecha"]


def rd(rel):
    with open(os.path.join(FP, rel), encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def universos():
    """Devuelve especie por genoma, universo drive (skani), universo NCBI (pyskani) y genomas nuevos de NCBI."""
    gp = {g["accession"]: g for g in json.load(open(os.path.join(FP, "drive", "genomas_publicos.json"), encoding="utf-8"))["genomas"]}
    with open(os.path.join(FP, "drive", "ani_matriz_referencias.csv"), encoding="utf-8", newline="") as fh:
        u_drive = {r[0] for i, r in enumerate(csv.reader(fh)) if i and r}
    nc = {r["accession"]: r for r in rd("ncbi/ncbi_genomas.csv")}
    nuevos = {a for a, r in nc.items() if r["slug_atlas"] != "saccharomyces-cerevisiae"}
    val = {a for a, g in gp.items() if ((g.get("analisis") or {}).get("marcadores_atlas") or {}).get("tiene_bakta")}
    esp = {a: " ".join(g["especie"].split()[:2]) for a, g in gp.items()}
    for a in nuevos:
        esp.setdefault(a, nc[a]["especie_atlas"])
    return esp, u_drive, nuevos | val, nuevos


def cubierto(a, b, u_drive, u_ncbi, nuevos):
    if a in u_drive and b in u_drive:
        return True
    return a in u_ncbi and b in u_ncbi and (a in nuevos or b in nuevos)


def pares_sin_cruzar():
    esp, u_drive, u_ncbi, nuevos = universos()
    todos = sorted(u_drive | u_ncbi)
    gen = {a: esp[a].split()[0] for a in todos}
    out = []
    for i, a in enumerate(todos):
        for b in todos[i + 1:]:
            if gen[a] == gen[b] and not cubierto(a, b, u_drive, u_ncbi, nuevos):
                out.append((a, b))
    return out, esp


def get(url, dest, intentos=4):
    for k in range(intentos):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300) as r:
                data = r.read()
            if dest is None:
                return data.decode("utf-8", "replace")
            with open(dest + ".part", "wb") as fh:
                fh.write(data)
            os.replace(dest + ".part", dest)
            return dest
        except Exception:  # noqa: BLE001
            if k == intentos - 1:
                raise
            time.sleep(2 * (k + 1))


def fna(acc, cache):
    d = os.path.join(cache, acc)
    hay = glob.glob(os.path.join(d, "*_genomic.fna.gz"))
    if hay and os.path.getsize(hay[0]) > 0:
        return hay[0]
    m = re.match(r"^(GC[AF])_(\d{3})(\d{3})(\d{3})\.\d+$", acc)
    base = f"{FTP}/{m.group(1)}/{m.group(2)}/{m.group(3)}/{m.group(4)}/"
    subs = sorted(set(re.findall(r'href="(' + re.escape(acc) + r'_[^"/]+)/?"', get(base, None))))
    if not subs:
        raise RuntimeError(f"sin directorio FTP para {acc}")
    os.makedirs(d, exist_ok=True)
    return get(f"{base}{subs[0]}/{subs[0]}_genomic.fna.gz", os.path.join(d, f"{acc}_genomic.fna.gz"))


def leer_fna(path):
    seqs, cur = [], []
    with gzip.open(path, "rt") as fh:
        for linea in fh:
            if linea.startswith(">"):
                if cur:
                    seqs.append("".join(cur).encode())
                cur = []
            else:
                cur.append(linea.strip())
    if cur:
        seqs.append("".join(cur).encode())
    return seqs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, help="carpeta local de FASTA (fuera del repo)")
    ap.add_argument("--fecha", default=time.strftime("%Y-%m-%d"))
    a = ap.parse_args()
    import pyskani  # solo aquí: el build no lo necesita

    pend, esp = pares_sin_cruzar()
    print("pares del mismo género sin cruzar:", len(pend))
    accs = sorted({x for p in pend for x in p})
    seqs = {acc: leer_fna(fna(acc, a.cache)) for acc in accs}
    db = pyskani.Database()
    for acc in accs:
        db.sketch(acc, *seqs[acc])
    objetivo = {tuple(sorted(p)) for p in pend}
    res = {}
    for acc in accs:
        for h in db.query(acc, *seqs[acc]):
            q, r = h.query_name, h.reference_name
            key = tuple(sorted((q, r)))
            if key not in objetivo or key in res:
                continue
            afr, afq = (h.query_fraction, h.reference_fraction) if q == key[0] else (h.reference_fraction, h.query_fraction)
            res[key] = (f"{h.identity * 100:.2f}", f"{afr * 100:.2f}", f"{afq * 100:.2f}")
    version = f"pyskani {pyskani.__version__} (skani {pyskani.SKANI_VERSION})"
    filas = []
    for p, q in sorted(objetivo):
        ani, afr, afq = res.get((p, q), ("", "", ""))
        filas.append({"ref_accession": p, "query_accession": q, "ANI": ani, "align_fraction_ref": afr,
                      "align_fraction_query": afq, "especie_ref": esp[p], "especie_query": esp[q],
                      "misma_especie_atlas": "si" if esp[p] == esp[q] else "no", "herramienta": version, "fecha": a.fecha})
    with open(SALIDA, "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, COLS, lineterminator="\n")
        w.writeheader()
        w.writerows(filas)
    inf = [f for f in filas if f["ANI"]]
    print(version, "calculados", len(filas), "informados (superan el filtro de skani)", len(inf),
          "misma especie", sum(1 for f in inf if f["misma_especie_atlas"] == "si"), "->", os.path.relpath(SALIDA, REPO))


if __name__ == "__main__":
    sys.exit(main())
