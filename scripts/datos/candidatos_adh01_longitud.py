#!/usr/bin/env python3
"""Candidatos (HIPÓTESIS) e inferencias de M35 calculados desde los genomas públicos de L. salivarius.

Uso: python3 -I scripts/datos/candidatos_adh01_longitud.py [RUTA/salivarius_bakta_hits_funcionales_referencias.csv]

Ayudante de curación (no es un paso del orquestador): reescribe SOLO las filas de M35 de
scripts/datos/curado/candidatos_mecanismo.tsv y conserva las de cualquier otro mecanismo. Todos los
números del texto salen del CSV (nada de recuentos escritos a mano). La prosa no lleva ids de evidencia ni de
mecanismo: las fuentes van en la columna «fuente», que la ficha pinta como chips:
  * ADH01 grande frente a MucBP corto: regla de producto de ADH01 (mucus-binding|MucBP|mucin-binding, gen
    mub|mubA); longitud = end-start+1 (pb). Igual que derivar_genomica.py (superficie).
  * Glicosiltransferasas de EPS (solo el término «glycosyltransferase», corrección r2 de E4) y operón dlt:
    la misma función que usa derivar_genomica.py (superficie_k4).
Filas de E4 (ronda 2): la forma activa (ev013a), lo descartado por inferencia, la hipótesis rival NO proteica
apoyada en PMID 20042742 (contexto lacticaseibacillus-paracasei.ev007) y el 2x2 de cepas públicas.
"""
import csv, re, statistics, sys
from collections import defaultdict
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
from superficie_k4 import construir as superficie  # noqa: E402

src = Path(sys.argv[1]) if len(sys.argv) > 1 else AQUI.parent.parent / "fuentes_publicas" / "drive" / "salivarius_bakta_hits_funcionales_referencias.csv"
pat = re.compile(r"mucus-binding|MucBP|mucin-binding", re.I)
best, cepa = defaultdict(int), {}
for r in csv.DictReader(src.open(encoding="utf-8")):
    cepa[r["accession"]] = r["cepa"]
    if pat.search(r["product"] or "") or re.fullmatch(r"mub|mubA", r["gene"] or ""):
        best[r["accession"]] = max(best[r["accession"]], abs(int(r["end"]) - int(r["start"])) + 1)
n = len(cepa)
grandes = sorted((a for a, L in best.items() if L > 3000), key=lambda a: -best[a])
cortos = sorted(a for a, L in best.items() if L <= 3000)
dato = (f"{len(best)}/{n} genomas públicos con hit ADH01 (no discrimina). Por longitud máxima del hit: {len(grandes)}/{n} con proteína grande "
        f"({', '.join(f'{cepa[a]} {best[a]} pb' for a in grandes)}) y {len(cortos)}/{n} solo con MucBP corto "
        f"({', '.join(sorted({str(best[a]) for a in cortos}))} pb: {', '.join(cepa[a] for a in cortos)}).")

sup, _, _ = superficie(src.parent)
gt = {a: v["eps_glicosiltransferasas_n"] for a, v in sup.items()}
gt_g = [gt[a] for a in sup if sup[a]["mucbp_grande_clase"] == "grande"]
gt_c = [gt[a] for a in sup if sup[a]["mucbp_grande_clase"] != "grande"]
dlt4 = sum(1 for v in sup.values() if v["dlt_n"] == 4)
fmt = lambda x: str(x).replace(".", ",")
FUENTE_CSV = "fuentes_publicas/drive/" + src.name + " (Bakta sobre genomas NCBI)"
filas = [
    ["M35", "Proteína grande de unión a moco (hit ADH01 de más de 3 kb) en la superficie de CECT 5713", "hipotesis", dato, FUENTE_CSV,
     "Si la célula inactivada tratada con proteinasa K sigue bloqueando la adhesión de S. mutans a hidroxiapatita, el determinante no es proteico; "
     "si una cepa con solo el MucBP corto (p. ej. AR809) bloquea igual que CECT 5713 en el mismo ensayo, la longitud no explica el efecto"],
    ["M35", "La forma activa es la célula inactivada por calor: el efecto no necesita célula viva", "evidencia",
     "CECT 5713 inactivada por calor bloquea la adhesión de S. mutans a hidroxiapatita (nivel CEL, PMID 28950179). La propiedad se ancla en ese ensayo con hidroxiapatita, no en el piloto en voluntarios.",
     "ligilactobacillus-salivarius.ev013a", ""],
    ["M35", "No es bacteriocina Abp118, ni H2O2, ni ADS, ni otro metabolito que exija metabolismo activo", "inferencia",
     "La preparación es célula inactivada por calor. CECT 5713 porta el locus de Abp118 y no lo produce (ver fuente); una bacteriocina preformada adsorbida "
     "a la célula se descarta con sobrenadante sin células más proteinasa K.",
     "ligilactobacillus-salivarius.ev011, ligilactobacillus-salivarius.ev013a",
     "Si el sobrenadante sin células de un cultivo bloquea igual que la célula inactivada, el determinante no está en la superficie celular"],
    ["M35", "HIPÓTESIS RIVAL: el determinante es un componente de superficie NO proteico (EPS, LTA o glicano de pared), no una adhesina", "hipotesis",
     "En 6 cepas NO nombradas de L. paracasei o L. rhamnosus (cribado de 624 lactobacilos, PMID 20042742, registrado en el atlas como contexto) "
     "la coagregación con mutans streptococci resiste autoclave y proteasa y depende de calcio; de L. paracasei DSMZ 16671 solo consta que coagrega también "
     f"tras inactivación por calor, sin ensayo de proteasa. En los {len(sup)} genomas públicos de L. salivarius con Bakta funcional: glicosiltransferasas de EPS "
     f"de {min(gt.values())} a {max(gt.values())} (varía entre cepas) y operón dlt completo (4 genes) en {dlt4}/{len(sup)} "
     f"({'constante de especie: si fuera LTA, ningún genoma público lo discrimina' if dlt4 in (0, len(sup)) else 'varía entre cepas'}).",
     "lacticaseibacillus-paracasei.ev007 (PMID 20042742) + lacticaseibacillus-paracasei.ev009 + " + FUENTE_CSV,
     "Si el bloqueo de la célula inactivada desaparece con proteinasa K, el determinante es proteico y esta hipótesis muere; si sobrevive a la proteasa, "
     "muere la de la adhesina grande. El mismo tubo decide entre las dos"],
    ["M35", "La longitud de la adhesina y la carga de EPS son variables independientes: un 2x2 de cepas públicas separa las dos hipótesis sin mutante",
     "inferencia",
     f"Mediana de glicosiltransferasas de EPS: {fmt(statistics.median(gt_g))} en los {len(gt_g)} genomas con proteína grande y "
     f"{fmt(statistics.median(gt_c))} en los {len(gt_c)} con solo MucBP corto, con rangos solapados ({min(gt_g)}-{max(gt_g)} frente a "
     f"{min(gt_c)}-{max(gt_c)}): no hay correlación que confunda los brazos.",
     FUENTE_CSV,
     "Si en más genomas la longitud de la adhesina y la carga de EPS aparecen correlacionadas, el 2x2 deja de separar las hipótesis"],
]
out = AQUI / "curado" / "candidatos_mecanismo.tsv"
cab = ["mecanismo", "candidato", "base", "dato", "fuente", "lo_refutaria"]
otras = []
if out.exists():
    with out.open(encoding="utf-8") as f:
        otras = [r for r in csv.DictReader(f, delimiter="\t", quoting=csv.QUOTE_NONE) if r["mecanismo"] != "M35"]
with out.open("w", encoding="utf-8", newline="") as f:
    w = csv.writer(f, delimiter="\t", lineterminator="\n", quoting=csv.QUOTE_NONE, escapechar="\\")
    w.writerow(cab)
    for r in otras:
        w.writerow([r[k] for k in cab])
    w.writerows(filas)
print(out, "|", len(filas), "filas de M35 |", dato)
