#!/usr/bin/env python3
"""Deriva data/genomica.json: FUENTE UNICA de llamadas genomicas por genoma para el Atlas.

Uso (paso 3 de scripts/datos/construir_datos.py):
    python3 -I scripts/datos/derivar_genomica.py --fuentes fuentes_publicas --data DIR_DATA \
        --salida-dir DIR_SALIDAS --fecha AAAA-MM-DD [--publicar DIR_DATA/genomica.json]

Escribe <salida-dir>/genomica_<AAAAMMDD>.json y, con --publicar, ese mismo contenido en la ruta indicada. Si falta
cualquier fichero de fuentes_publicas/ el script falla (código 1) y no escribe nada: el orquestador marca FAIL.

Fuentes (todas en el repo, públicas y saneadas):
  fuentes_publicas/drive/  análisis de Javier sobre 94 genomas públicos (Bakta, skani, CheckM2, ABRicate, BAGEL4)
  fuentes_publicas/ncbi/   ampliación NCBI (RefSeq): anotación PGAP, CheckM de NCBI, ANI pyskani, validación PGAP frente a Bakta

Lo consumen (y NO recalculan):
  E3  bacteriocinas  -> genomas[acc].produccion (estados) + restos_locus + bagel4
  E4  superficie     -> genomas[acc].superficie (longitud, copias, EPS partido, dlt, TA/LTA, WxL, GbpC) + refutado_en_ensayo
  E5  rasgos n/N     -> taxones[taxon].marcadores[id]
  E6  seguridad      -> marcadores AMR_ADQ y PLASMIDO por genoma + genomas[acc].seguridad

Reglas duras que aplica el script:
  * `parcial` NUNCA cuenta como presencia (esta por debajo del minimo de la propia regla).
  * Un genoma sin fila para un marcador es NM (no medido), nunca A (ausente).
  * La regla auditada solo ESTRECHA la original: nunca anade un gen que la llamada no listase.
  * Lo que la regla auditada no puede decidir (pseudogen, gen truncado, homologo de familia sin asignar) es I.
  * El fenotipo medido EN LA MISMA CEPA manda sobre el marcador (refutado_en_ensayo).
  * Ampliacion NCBI: una llamada PGAP entra SOLO si todos los marcadores de origen son `fiable` en
    ncbi_validacion_pgap_vs_bakta.csv. Si no, la llamada NO se publica: el marcador queda NM en genomas[acc].marcadores
    y el motivo va en genomas[acc].no_evaluable[id] («no evaluable con la anotacion de NCBI»), que no es ausencia y no
    entra en n/N. Si un genoma tiene llamada Bakta medida, manda Bakta. Cada llamada lleva su anotador REAL
    (genomas[acc].anotador[id]): Bakta, PGAP (NCBI) o ABRicate (AMR_ADQ y PLASMIDO salen de ABRicate, no de Bakta).
  * ANI difiere_en solo compara estados FIRMES (P y A): un indeterminado (I) no establece diferencia.
  * ANI: un par ausente solo es «por debajo del filtro de skani» si los dos genomas entraron en la misma ejecución
    (drive/ skani, ncbi/ pyskani o curado/ani_pares_complemento.csv, que cubre los cruces que faltaban; lo genera a mano
    scripts/datos/ani_complemento.py). Los pares del mismo género sin cruzar se declaran en ani.no_cruzados.
  * Toda fuente publica de fuentes_publicas/ esta en curado/fuentes_publicas_manifiesto.tsv: si falta cualquiera
    (la lea este script o no), FAIL. Su sha256 queda en fuentes_sha256.
  * Cepas del atlas: vinculo por accession de cepas.json (verificado) o por nombre/deposito/cepa tipo segun
    ncbi_genomas.csv («vinculada por nombre: verificar»).
  * Un taxon con un solo genoma medido no se lee como «constante de especie» (lectura un_genoma).
"""
import argparse
import csv
import hashlib
import json
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import date

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from superficie_k4 import construir as superficie_k4, lecturas as lecturas_k4  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--fuentes", required=True)
ap.add_argument("--data", required=True)
ap.add_argument("--salida-dir", required=True)
ap.add_argument("--publicar", default=None)
ap.add_argument("--fecha", required=True)
A = ap.parse_args()
FP, DATA = A.fuentes, A.data
FD, FN = os.path.join(FP, "drive"), os.path.join(FP, "ncbi")

FUENTES = ["drive/atlas_marcadores_llamadas_referencias.csv", "drive/atlas_marcadores_definicion.csv",
           "drive/ani_pares_referencias.csv", "drive/ani_matriz_referencias.csv", "drive/checkm2_referencias.csv", "drive/genomas_publicos.json",
           "drive/salivarius_bakta_hits_funcionales_referencias.csv", "drive/salivarius_bakta_inventario_referencias.csv",
           "drive/bagel4_referencias_bacteriocinas.csv", "drive/bagel4_referencias_ncbi.csv",
           "drive/abricate_hits_referencias.csv",
           "ncbi/ncbi_genomas.csv", "ncbi/ncbi_marcadores_llamadas.csv", "ncbi/ncbi_validacion_pgap_vs_bakta.csv",
           "ncbi/ncbi_ani_pares.csv"]
DATOS = ["cepas.json", "evidencias.json", "especies.json"]
MANIFIESTO = os.path.join(AQUI, "curado", "fuentes_publicas_manifiesto.tsv")
with open(MANIFIESTO, encoding="utf-8", newline="") as fh:
    MANIF = list(csv.DictReader(fh, delimiter="\t"))
no_manif = sorted(set(FUENTES) - {r["fichero"] for r in MANIF})
if no_manif:
    print("FAIL: fuentes leídas que no están en el manifiesto: " + ", ".join(no_manif), file=sys.stderr)
    sys.exit(1)
faltan = [r["fichero"] for r in MANIF if not os.path.isfile(os.path.join(FP, r["fichero"]))]
sin_declarar = sorted(os.path.relpath(os.path.join(d, f), FP).replace(os.sep, "/") for d, _, fs in os.walk(FP) for f in fs
                      if os.path.relpath(os.path.join(d, f), FP).replace(os.sep, "/") not in {r["fichero"] for r in MANIF})
if sin_declarar:
    print("FAIL: ficheros en fuentes_publicas/ sin declarar en curado/fuentes_publicas_manifiesto.tsv: " + ", ".join(sin_declarar), file=sys.stderr)
    sys.exit(1)
if faltan:
    print("FAIL: faltan fuentes públicas: " + ", ".join(faltan), file=sys.stderr)
    sys.exit(1)
BAKTA, PGAP, ABRICATE = "Bakta", "PGAP (NCBI)", "ABRicate"
SOLO_ABRICATE = "solo ABRicate (AMR y plásmidos)"
BAGEL4 = "BAGEL4"
SOLO_BAGEL4 = "solo BAGEL4 (bacteriocinas)"
TXT_NE = "no evaluable con la anotación de NCBI (PGAP): el marcador no es fiable sobre PGAP; no es ausencia"


def rd(name):
    with open(os.path.join(FP, name), newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def sha(path):
    with open(path, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def js(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def fnum(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


genomas = js(os.path.join(FD, "genomas_publicos.json"))["genomas"]
G = {g["accession"]: g for g in genomas}
llam = rd("drive/atlas_marcadores_llamadas_referencias.csv")
defs = {d["id_marcador"]: d for d in rd("drive/atlas_marcadores_definicion.csv")}
ani = rd("drive/ani_pares_referencias.csv")
checkm = {r["accession"]: r for r in rd("drive/checkm2_referencias.csv")}
bag_ncbi = rd("drive/bagel4_referencias_ncbi.csv")
bag_bac = rd("drive/bagel4_referencias_bacteriocinas.csv")
ncbi_gen = {r["accession"]: r for r in rd("ncbi/ncbi_genomas.csv")}
ncbi_llam = rd("ncbi/ncbi_marcadores_llamadas.csv")
ncbi_val = {r["id_marcador"]: r for r in rd("ncbi/ncbi_validacion_pgap_vs_bakta.csv")}
ncbi_ani = rd("ncbi/ncbi_ani_pares.csv")
# ANI complementario (curado/, calculado a mano con scripts/datos/ani_complemento.py): pares del mismo género que ninguna
# de las dos ejecuciones públicas cruzó. Lleva TODOS los pares calculados; ANI vacío = no supera el filtro de skani.
ANI_COMPL = os.path.join(AQUI, "curado", "ani_pares_complemento.csv")
with open(ANI_COMPL, newline="", encoding="utf-8") as fh:
    ani_compl = list(csv.DictReader(fh))
with open(os.path.join(FD, "ani_matriz_referencias.csv"), newline="", encoding="utf-8") as fh:
    U_ANI_DRIVE = {r[0] for i, r in enumerate(csv.reader(fh)) if i and r}  # universo de skani triangle (drive/)
cepas_atlas = js(os.path.join(DATA, "cepas.json"))
evid = js(os.path.join(DATA, "evidencias.json"))
evid = evid if isinstance(evid, dict) else {e["id"]: e for e in evid}
especies_atlas = js(os.path.join(DATA, "especies.json"))


def slug_de(taxon):
    base = " ".join(taxon.split()[:2]).lower().replace(" ", "-")
    return base if base in especies_atlas else None


# ============================================================ reglas auditadas
def items(evidencia, con_pseudo=False):
    """Parte 'gen: producto; producto; ...' en (gen, producto, es_pseudo_o_truncado)."""
    out = []
    for it in [x.strip() for x in (evidencia or "").split(";") if x.strip()]:
        ps = "(pseudo)" in it or "truncated" in it
        if ps and not con_pseudo:
            continue
        txt = it.replace("(pseudo) ", "")
        m = re.match(r"^([A-Za-z0-9_\-]+): (.*)$", txt)
        out.append((m.group(1), m.group(2), ps) if m else ("", txt, ps))
    return out


def fmt(g, p):
    return (g + ": " if g else "") + p


NO_ESTRUCTURAL = re.compile(r"immunity|transport|secretion|export|permease|ATP-binding|processing", re.I)


def r_bsh(it):  # SAL01*: solo BSH asignada por nombre
    return [fmt(g, p) for g, p, _ in it if g.lower() == "bsh" or re.search(r"bile salt hydrolase|conjugated bile acid hydrolase", p, re.I)]


def i_bsh(todos):  # homologo de familia CGH/PVA (yxeI, 'Choloylglycine hydrolase/NAAA...') sin asignar
    return [fmt(g, p) for g, p, _ in todos if re.search(r"choloylglycine hydrolase|penicillin V acylase|linear amide C-N hydrolase", p, re.I)]


def r_abp(it):  # BAC02: sin cambios
    return [fmt(g, p) for g, p, _ in it if g in ("salA", "salB") or re.search(r"salivaricin|abp118", p, re.I)]


def r_nis(it):  # BAC03*: nisB + nisC + nisT juntos (nisA no se anota nunca en estas tablas: no se exige)
    gs = {g for g, _, _ in it}
    return sorted(g for g in gs if g in ("nisA", "nisB", "nisC", "nisT")) if {"nisB", "nisC", "nisT"} <= gs else []


def restos_nis(todos):
    return [fmt(g, p) + (" (pseudo)" if ps else "") for g, p, ps in todos if re.match(r"nis[A-Z]$", g) or re.search(r"lantibiotic|LanC", p, re.I)]


def r_cl2(it):  # BAC04+BAC05*: peptido de clase II con familia; fuera entS, inmunidad, transporte
    return [fmt(g, p) for g, p, _ in it
            if g.lower() != "ents" and re.search(r"lactococcin|pediocin|enterocin|carnobacteriocin|leucocin|sakacin|garvicin", p, re.I)
            and not NO_ESTRUCTURAL.search(p)]


def restos_cl2(todos):  # inmunidad / transporte de una familia con nombre: resto de locus, no productor
    return [fmt(g, p) for g, p, _ in todos if g.lower() != "ents"
            and re.search(r"lactococcin|pediocin|enterocin|carnobacteriocin|leucocin|sakacin|garvicin", p, re.I)
            and NO_ESTRUCTURAL.search(p)]


def r_spxb(it):
    return [fmt(g, p) for g, p, _ in it if g == "spxB" or re.fullmatch(r"pyruvate oxidase", p, re.I)]


def r_lox(it):
    return [fmt(g, p) for g, p, _ in it if g == "lox" or re.search(r"L-lactate oxidase", p, re.I)]


def r_mub(it):
    return [fmt(g, p) for g, p, _ in it if g in ("mub", "mubA") or re.search(r"mucus-binding|MucBP|mucin-binding", p, re.I)]


def r_pil(it):
    return [fmt(g, p) for g, p, _ in it if re.match(r"spa[A-C]$", g) or re.search(r"SpaCBA|isopeptide-forming pilin|sortase-dependent pilin", p, re.I)]


def r_sia(it):  # HMO02*: sialidasa o endo-GalNAc-asa con nombre de enzima, gen no pseudo
    return [fmt(g, p) for g, p, _ in it
            if g in ("nanH", "engBF") or re.fullmatch(r"(exo-alpha-)?sialidase", p, re.I)
            or re.search(r"endo-alpha-N-acetylgalactosaminidase", p, re.I)]


def i_sia(todos):  # pseudogen de sialidasa o 'sialidase family protein' (asignacion solo de familia)
    return [fmt(g, p) + (" (pseudo)" if ps else "") for g, p, ps in todos
            if re.search(r"sialidase", p, re.I) and (ps or re.search(r"family protein", p, re.I))]


def r_lac(it):
    return [fmt(g, p) for g, p, _ in it if g in ("lacZ", "lacL", "lacM", "lacG") or re.search(r"beta-galactosidase", p, re.I)]


def i_lac(todos):
    return [fmt(g, p) + " (pseudo/truncado)" for g, p, ps in todos if ps and (g in ("lacZ", "lacL", "lacM", "lacG") or re.search(r"beta-galactosidase", p, re.I))]


def r_gad(it):
    return [fmt(g, p) for g, p, _ in it if g in ("gadA", "gadB") or re.search(r"glutamate decarboxylase", p, re.I)]


def r_ads(it):
    h = [fmt(g, p) for g, p, _ in it if g in ("arcA", "arcB", "arcC") or re.search(r"arginine deiminase|carbamate kinase|ornithine carbamoyltransferase, catabolic", p, re.I)]
    return h if len(h) >= 2 else []


def r_cas(it):
    h = [fmt(g, p) for g, p, _ in it if re.match(r"(cas[0-9]|csn[12]|cse[0-9])", g) or "CRISPR-associated" in p]
    return h if len(h) >= 2 else []


def r_abr(it):
    return [p for _, p, _ in it]


# Patrones de cruce con evidencias de la MISMA cepa. 'neg' = el claim afirma explicitamente
# la ausencia del fenotipo (manda aunque la evidencia global sea '+', p. ej. ev008).
M = [
    dict(id="BSH", origen="SAL01", nombre="Hidrolasa de sales biliares (BSH asignada)",
         pregunta="¿Desconjuga sales biliares esta cepa o solo tiene un homólogo de la familia?",
         regla="gen bsh o producto 'bile salt hydrolase'. yxeI y 'Choloylglycine hydrolase/NAAA' no cuentan como P: si son lo único que hay, el genoma es I (indeterminado), no A",
         cambio="SAL01 contaba yxeI (familia CGH/PVA que la propia nota de SAL02 dice que puede no ser BSH); sin el estado I, 2 L. salivarius pasaban de P a A, que es convertir una ambigüedad en un cero",
         fn=r_bsh, indet=i_bsh, pos=r"sales biliares|\bbilis\b|\bBSH\b|desconjug", neg=None),
    dict(id="ABP118", origen="BAC02", nombre="Salivaricina Abp118 (α/β)",
         pregunta="¿Lleva esta cepa el locus de la bacteriocina Abp118?",
         regla="salA|salB o producto salivaricin|abp118 (sin cambios)", cambio="ninguno en la regla; se añade estado de producción (porta ≠ produce)",
         fn=r_abp, pos=r"abp118|salivaricin|bacteriocin", neg=r"no se observ\w* biosintesis", bacteriocina=True),
    dict(id="NISINA", origen="BAC03", nombre="Nisina (operón nisBCT)",
         pregunta="¿Puede esta cepa fabricar y exportar nisina?",
         regla="nisB Y nisC Y nisT a la vez; nisA no se exige porque no aparece anotado en ninguna de las 3.466 llamadas (exigirlo daría un 0/10 falso)",
         cambio="BAC03 ('mínimo 1' sobre nis[A-Z]|lantibiotic) contaba restos nisEIKR/nisP sin maquinaria: esos genomas pasan a A con restos_locus",
         fn=r_nis, restos=restos_nis, pos=r"nisin", neg=None, bacteriocina=True),
    dict(id="BAC_CLII", origen="BAC04+BAC05", nombre="Bacteriocina de clase II con familia asignada",
         pregunta="¿Lleva un péptido de clase II de familia conocida (lactococcina, pediocina/leucocina, garvicina)?",
         regla="producto lactococcin|pediocin|enterocin|carnobacteriocin|leucocin|sakacin|garvicin sin immunity/transport/secretion/export; entS fuera",
         cambio="BAC04 capturaba entS (exportador de enterobactina) e inmunidades; BAC05 era 'Bacteriocin' sin familia y en L. salivarius repetía el locus Abp118",
         fn=r_cl2, restos=restos_cl2, pos=r"lactococcin|pediocin|enterocin|garvicin", neg=None, bacteriocina=True),
    dict(id="SPXB", origen="ANT01", nombre="Piruvato oxidasa (spxB, H2O2)",
         pregunta="¿Tiene la vía de H2O2 por piruvato oxidasa?", regla="spxB o producto exacto 'pyruvate oxidase'",
         cambio="ANT01 mezclaba spxB y lox", fn=r_spxb, pos=r"per[oó]xido de hidr[oó]geno|H2O2", neg=None),
    dict(id="LOX", origen="ANT01", nombre="L-lactato oxidasa (lox, H2O2)",
         pregunta="¿Tiene además la segunda vía de H2O2 (lactato oxidasa)?", regla="lox o producto 'L-lactate oxidase'",
         cambio="separado de spxB: es la parte que varía entre cepas", fn=r_lox, pos=r"per[oó]xido de hidr[oó]geno|H2O2", neg=None),
    dict(id="MUCBP", origen="ADH01", nombre="Proteína con dominio MucBP / unión a moco",
         pregunta="¿Es la unión a moco rasgo de la cepa o de la especie?", regla="mub|mubA o producto mucus-binding|MucBP|mucin-binding (sin cambios)",
         cambio="ninguno; la presencia no discrimina (17/17): la longitud del locus sí (genomas[acc].superficie)",
         fn=r_mub, pos=None, neg=None),
    dict(id="PILINA", origen="ADH03", nombre="Pilina con isopéptido tipo SpaA (1 gen)",
         pregunta="¿Tiene genes de pilina dependiente de sortasa?", regla="spaA-C o producto isopeptide-forming pilin (sin cambios)",
         cambio="RENOMBRADO: 'Pili tipo SpaCBA (LGG)' sobre-afirma; todas las llamadas son un único spaA, sin spaB/spaC ni sortasa C",
         fn=r_pil, pos=None, neg=None),
    dict(id="SIALIDASA", origen="HMO02", nombre="Sialidasa / endo-α-GalNAc-asa (degradación de mucina)",
         pregunta="¿Puede liberar ácido siálico o glicanos O de la mucina?",
         regla="nanH|engBF o producto exacto (exo-alpha-)sialidase o endo-alpha-N-acetylgalactosaminidase, gen no pseudo. Pseudogén o 'sialidase family protein' solos = I",
         cambio="HMO02 contaba '(pseudo) exo-alpha-sialidase; sialidase family protein' como degradación de mucina (CECT 5713, UCC118)",
         fn=r_sia, indet=i_sia, pos=r"sialid|degrad\w* (de )?(la )?mucina|mucin[oó]lis", neg=r"no degrad\w* (de )?(la )?mucina"),
    dict(id="LACTOSA", origen="LAC01", nombre="β-galactosidasa (lactosa)", pregunta="¿Digiere lactosa?",
         regla="lacZ|lacL|lacM|lacG o producto beta-galactosidase; si solo hay copias truncadas = I", cambio="genes truncados no cuentan como P",
         fn=r_lac, indet=i_lac, pos=r"lactosa", neg=None),
    dict(id="GAD", origen="ACI01", nombre="Glutamato descarboxilasa (GABA)", pregunta="¿Puede producir GABA?",
         regla="gadA|gadB o producto glutamate decarboxylase; el antiportador gadC solo no cuenta", cambio="ACI01 aceptaba el antiportador sin la enzima",
         fn=r_gad, pos=r"\bgaba\b", neg=None),
    dict(id="ADS", origen="ACI02", nombre="Arginina deiminasa (vía ADS, alcalinización)",
         pregunta="¿Puede alcalinizar con arginina (mecanismo ADS, relevante en caries)?", regla="≥2 de arcA/arcB/arcC (sin cambios)",
         cambio="ninguno; entra por ser mecanismo oral con nombre propio aunque sea constante de especie", fn=r_ads, pos=r"arginin|alcalin", neg=None),
    dict(id="CRISPR", origen="CRI01", nombre="Sistema CRISPR-Cas", pregunta="¿Tiene defensa CRISPR frente a fagos (estabilidad en fermentación)?",
         regla="≥2 genes cas no pseudogenes", cambio="pseudogenes fuera", fn=r_cas, pos=None, neg=None),
    dict(id="AMR_ADQ", origen="SEGR", nombre="Resistencia adquirida (ResFinder, ABRicate)",
         pregunta="¿Lleva genes de resistencia transferibles que bloquean la QPS?", regla="al menos un hit ResFinder (sin cambios)", cambio="ninguno",
         fn=r_abr, pos=None, neg=None, herramienta="ABRicate"),
    dict(id="PLASMIDO", origen="SEGP", nombre="Replicón de plásmido reconocido (PlasmidFinder)",
         pregunta="¿Tiene un replicón reconocido por PlasmidFinder?", regla="al menos un hit (sin cambios)",
         cambio="A se muestra 'sin replicón reconocido': PlasmidFinder cubre mal las BAL y A ≠ sin plásmidos", fn=r_abr, pos=None, neg=None,
         herramienta="ABRicate"),
]
assert len(M) <= 15

# ============================================================ llamadas por genoma
by = defaultdict(dict)
for r in llam:
    by[r["accession"]][r["id_marcador"]] = r
by_pgap = defaultdict(dict)
for r in ncbi_llam:
    by_pgap[r["accession"]][r["id_marcador"]] = r
FIABLE = {i: r["fiabilidad_pgap"] for i, r in ncbi_val.items()}
discrepa_fiab = sorted({r["id_marcador"] for r in ncbi_llam if r.get("fiabilidad_pgap") and FIABLE.get(r["id_marcador"]) and r["fiabilidad_pgap"] != FIABLE[r["id_marcador"]]})
if discrepa_fiab:
    print("FAIL: fiabilidad_pgap distinta entre llamadas y validación en " + ", ".join(discrepa_fiab), file=sys.stderr)
    sys.exit(1)


def pgap_fiable(m):
    return all(FIABLE.get(o) == "fiable" for o in m["origen"].split("+"))


def llamar(filas_por_id, m):
    """-> (estado P|A|I|NM, hits, homologos_indeterminados, restos_locus). parcial nunca es P."""
    filas = [filas_por_id.get(i) for i in m["origen"].split("+")]
    if all(f is None or f["estado"] in ("no_medido", "no_aplica") for f in filas):
        return "NM", [], [], []
    hits, ind, res = [], [], []
    for f in filas:
        if f is None or f["estado"] in ("no_medido", "ausente", "no_aplica"):
            continue
        todos = items(f["evidencia"], con_pseudo=True)
        if f["estado"] != "parcial":  # parcial: por debajo del minimo de la regla original
            hits += m["fn"](items(f["evidencia"]))
        if "indet" in m:
            ind += m["indet"](todos)
        if "restos" in m:
            res += m["restos"](todos)
    hits, ind, res = sorted(set(hits)), sorted(set(ind)), sorted(set(res))
    if hits:
        return "P", hits, [], []
    if ind:
        return "I", [], ind, []
    return "A", [], [], res


LEVADURA = {a for a, r in ncbi_gen.items() if r["slug_atlas"] and (especies_atlas.get(r["slug_atlas"]) or {}).get("tipo_organismo") == "levadura"}
acc_llam_bakta = sorted(by)
acc_pgap = sorted(a for a in by_pgap if a not in LEVADURA)
acc_bagel = sorted({r["accession"] for r in bag_ncbi})
acc_todos = sorted(set(acc_llam_bakta) | set(acc_bagel) | set(acc_pgap))
taxa_bakta = sorted({g["especie"] for g in genomas}, key=len, reverse=True)


TAXON_NOTA = {}


def taxon_de(acc):
    r = ncbi_gen.get(acc) or {}
    # NCBI (y drive/, que copia su nombre) a veces nombra solo la especie. La cepa TIPO de una especie es, por nomenclatura,
    # la cepa tipo de su subespecie nominal (p. ej. L. lactis ATCC 19435 = DSM 20481 -> subsp. lactis): se compara con esa
    # subespecie, con nota. Solo si NCBI la marca como material tipo.
    org = (G[acc]["especie"] if acc in G else r["organismo_ncbi"]).strip()
    partes = org.split()
    nominal = f"{org} subsp. {partes[1]}" if len(partes) == 2 else None
    if acc in G and not (nominal in taxa_bakta and r.get("material_tipo")):
        return G[acc]["especie"]
    if nominal in taxa_bakta and r.get("material_tipo"):
        TAXON_NOTA[acc] = (f"NCBI la registra como «{org}», sin subespecie; es la cepa tipo de la especie y, por nomenclatura, "
                           f"de la subespecie nominal: se compara con {nominal}")
        return nominal
    for t in taxa_bakta:  # p. ej. «Lactococcus lactis subsp. lactis»: misma fila de taxón que en drive/
        if r["organismo_ncbi"].startswith(t + " ") or r["organismo_ncbi"] == t:
            return t
    return r["especie_atlas"]


gen_out = {}
for acc in acc_todos:
    nr = ncbi_gen.get(acc)
    tx = taxon_de(acc)
    v = {"taxon": tx, "slug_atlas": slug_de(tx) or (nr or {}).get("slug_atlas") or None,
         "cepa_ncbi": (G[acc]["cepa"] if acc in G else (nr or {}).get("cepa")) or None,
         "checkm2": ({"completitud": float(checkm[acc]["completitud"]), "contaminacion": float(checkm[acc]["contaminacion"])}
                     if acc in checkm else None),
         "marcadores": {}, "anotador": {}, "genes": {}}
    if acc in TAXON_NOTA:
        v["taxon_nota"] = TAXON_NOTA[acc]
    if nr:
        v["ncbi"] = {"organismo": nr["organismo_ncbi"], "nivel_ensamblado": nr["nivel_ensamblado"] or None,
                     "material_tipo": bool(nr["material_tipo"]), "anotacion": (nr["anotacion"] + " " + nr["anotacion_version"]).strip() or None,
                     "motivo_seleccion": nr["motivo_seleccion"].split(";")}
        v["checkm_ncbi"] = {"completitud": fnum(nr["checkm_completitud_ncbi"]), "contaminacion": fnum(nr["checkm_contaminacion_ncbi"]),
                            "version": nr["checkm_version_ncbi"] or None} if nr["checkm_completitud_ncbi"] else None
    for m in M:
        est, hits, ind, res = llamar(by.get(acc, {}), m)
        anot = m.get("herramienta", BAKTA) if est != "NM" else None  # el anotador real de la llamada de drive/
        if est == "NM" and acc in by_pgap:
            if pgap_fiable(m):
                est, hits, ind, res = llamar(by_pgap[acc], m)
                anot = PGAP if est != "NM" else None
            elif any((by_pgap[acc].get(o) or {}).get("estado") not in (None, "no_medido", "no_aplica") for o in m["origen"].split("+")):
                # llamada PGAP poco fiable: no se publica (NM) y se declara por qué; nunca ausente
                v.setdefault("no_evaluable", {})[m["id"]] = TXT_NE
        v["marcadores"][m["id"]] = est
        if anot:
            v["anotador"][m["id"]] = anot
        if hits:
            v["genes"][m["id"]] = "; ".join(hits)
        if ind:
            v.setdefault("indeterminado", {})[m["id"]] = "; ".join(ind)
        if res:
            v.setdefault("restos_locus", {})[m["id"]] = "; ".join(res)
    t = sorted(set(re.findall(r"type (I{1,3}V?-?[A-Z]?)", v["genes"].get("CRISPR", ""))))
    if t:
        v["crispr_tipos"] = t
    anots = sorted({x for k, x in v["anotador"].items() if x != ABRICATE})  # anotación de los marcadores génicos
    v["anotacion"] = " + ".join(anots) if anots else (SOLO_ABRICATE if v["anotador"] else None)
    v["herramientas"] = sorted(set(v["anotador"].values()))
    gen_out[acc] = v
acc_llam = sorted(a for a, v in gen_out.items() if any(e in ("P", "A", "I") for e in v["marcadores"].values()))

# ============================================================ BAGEL4 (por genoma, tal cual; identidad baja = candidata)
bag_por = defaultdict(list)
for r in bag_bac:
    bag_por[r["accession"]].append({"bacteriocina": r["bacteriocina"], "clase": r["clase"],
                                    "identidad_pct": round(float(r["identidad_pct"]), 1) if r["identidad_pct"] else None, "novedad": r["novedad"] or None,
                                    "longitud_aa": int(r["longitud_aa"]) if r["longitud_aa"] else None})
for acc, v in gen_out.items():
    if acc in acc_bagel:
        v["bagel4"] = {"medido": True, "hits": sorted(bag_por.get(acc, []), key=lambda h: (-(h["identidad_pct"] or 0), h["bacteriocina"]))}
    else:
        v["bagel4"] = {"medido": False}
    if v["bagel4"]["medido"]:  # BAGEL4 es una herramienta más del genoma: visible aunque no haya marcadores génicos
        v["herramientas"] = sorted(set(v["herramientas"]) | {BAGEL4})
        if v["anotacion"] is None:
            v["anotacion"] = SOLO_BAGEL4

# ============================================================ superficie (K4 r2 de E4: un solo cálculo, importado)
MUCBP_CORTO_PB = 1041
inv_bk = {r["accession"] for r in rd("drive/salivarius_bakta_inventario_referencias.csv") if r["estado"] == "leido"}
sup_k4, sup_desc, _ = superficie_k4(FD)
NO_MEDIBLE = "repeticiones internas MucBP (requiere dominios Pfam PF06458) y cromosoma/plásmido (requiere assembly report NCBI)"
for acc in sorted(inv_bk):
    if acc not in gen_out or acc not in sup_k4:
        continue
    s = {k: x for k, x in sup_k4[acc].items() if k not in ("cepa_ncbi", "no_medible")}
    s["no_medible"] = NO_MEDIBLE
    s["no_medible_detalle"] = sup_k4[acc]["no_medible"]
    s["lectura"] = "predicción genómica (Bakta): no mide unión a moco ni EPS producido"
    gen_out[acc]["superficie"] = s

# ============================================================ ANI (skani de drive/ + pyskani de ncbi/)
pares, vec = [], defaultdict(list)
for r in ani:
    a, b, x = r["ref_accession"], r["query_accession"], float(r["ANI"])
    afa, afb = float(r["align_fraction_ref"]), float(r["align_fraction_query"])
    pares.append([a, b, x, afa, afb, "skani 0.3.1"])
vistos = {frozenset(p[:2]) for p in pares}
for r in ncbi_ani + [r for r in ani_compl if r["ANI"]]:
    a, b = r["ref_accession"], r["query_accession"]
    if frozenset((a, b)) in vistos:
        continue
    vistos.add(frozenset((a, b)))
    pares.append([a, b, float(r["ANI"]), float(r["align_fraction_ref"]), float(r["align_fraction_query"]), r["herramienta"]])
# Qué pares se MIDIERON (aunque no se informen): un par ausente solo significa «por debajo del filtro de skani» si los dos
# genomas entraron en la misma ejecución. drive/: todos los de ani_matriz_referencias.csv. ncbi/: dentro de cada género,
# los pares con al menos un genoma nuevo frente a los nuevos y a los 62 de drive/ con Bakta. complemento: los calculados.
U_ANI_NUEVOS = {a for a, r in ncbi_gen.items() if a not in LEVADURA and r["slug_atlas"] != "saccharomyces-cerevisiae"}
U_ANI_NCBI = U_ANI_NUEVOS | {g["accession"] for g in genomas if ((g.get("analisis") or {}).get("marcadores_atlas") or {}).get("tiene_bakta")}
ANI_COMPL_MEDIDOS = {frozenset((r["ref_accession"], r["query_accession"])) for r in ani_compl}


def ani_medido(a, b):
    if a in U_ANI_DRIVE and b in U_ANI_DRIVE:
        return True
    if a in U_ANI_NCBI and b in U_ANI_NCBI and (a in U_ANI_NUEVOS or b in U_ANI_NUEVOS):
        return True
    return frozenset((a, b)) in ANI_COMPL_MEDIDOS


def genero_de(acc):
    return (gen_out[acc]["taxon"] or "").split()[0] if acc in gen_out else ""


U_ANI = sorted(a for a in (U_ANI_DRIVE | U_ANI_NCBI) if a in gen_out)
ani_no_cruzados = [[a, b] for i, a in enumerate(U_ANI) for b in U_ANI[i + 1:] if genero_de(a) == genero_de(b) and not ani_medido(a, b)]
for a, b in ani_no_cruzados:
    gen_out[a].setdefault("ani_no_cruzado_con", []).append(b)
    gen_out[b].setdefault("ani_no_cruzado_con", []).append(a)
for a, b, x, afa, afb, h in pares:
    vec[a].append([b, x, afa, afb, h])
    vec[b].append([a, x, afb, afa, h])
MEDIDO = ("P", "A", "I")
FIRME = ("P", "A")  # difiere_en: un indeterminado no establece diferencia


def nombre_cepa_ncbi(acc):
    if acc in G:
        return G[acc]["cepa"] or None
    return (ncbi_gen.get(acc) or {}).get("cepa") or None


for acc, v in gen_out.items():
    vs = sorted(vec.get(acc, []), key=lambda t: (-t[1], t[0]))
    v["ani_n_pares"] = len(vs)
    v["ani_top3"] = [{"accession": b, "cepa_ncbi": nombre_cepa_ncbi(b), "taxon": gen_out[b]["taxon"] if b in gen_out else None,
                      "ani": x, "af_propia": fa, "af_vecina": fb, "herramienta": h,
                      "difiere_en": [m["id"] for m in M if v["marcadores"][m["id"]] in FIRME and gen_out[b]["marcadores"][m["id"]] in FIRME
                                     and v["marcadores"][m["id"]] != gen_out[b]["marcadores"][m["id"]]] if b in gen_out else None}
                     for b, x, fa, fb, h in vs[:3]]

# ============================================================ cepas del atlas
cep_idx = {}
for cid in sorted(cepas_atlas):
    a = ((cepas_atlas[cid].get("genoma") or {}).get("accesion") or "")
    for acc in gen_out:
        if a and acc.split(".")[0] == a.split(".")[0]:
            gen_out[acc]["cepa_atlas"] = cid
            gen_out[acc]["vinculo_cepa"] = "accesion"
            cep_idx[cid] = {"accesion": acc, "vinculo": "accesion", "texto": "accesión registrada en cepas.json"}
for acc, r in sorted(ncbi_gen.items()):
    cid = r["cepa_atlas"]
    if not cid or acc not in gen_out or cid in cep_idx or cid not in cepas_atlas:
        continue
    gen_out[acc]["cepa_atlas"] = cid
    gen_out[acc]["vinculo_cepa"] = "nombre"
    gen_out[acc]["vinculo_texto"] = "vinculada por nombre: verificar"
    cep_idx[cid] = {"accesion": acc, "vinculo": "nombre", "texto": "vinculada por nombre: verificar",
                    "motivo": [x for x in r["motivo_seleccion"].split(";") if x]}

# ============================================================ gen frente a fenotipo (misma cepa)
GEN_NIVELES = ("GEN-v", "GEN-p")
for acc, v in gen_out.items():
    cid = v.get("cepa_atlas")
    if not cid:
        continue
    evs = [e for e in sorted(evid.values(), key=lambda e: e["id"]) if e.get("cepa") == cid and e.get("tipo") == "evidencia"]
    cruces = []
    for m in M:
        mid, est = m["id"], v["marcadores"][m["id"]]
        if not m["pos"] or est not in MEDIDO:
            continue
        for e in evs:
            txt = " ".join([e.get("resultado") or "", e.get("claim_es") or ""])
            negativo = bool(m["neg"] and re.search(m["neg"], txt, re.I)) or (e.get("direccion") == "-" and re.search(m["pos"], txt, re.I))
            positivo = (not negativo) and bool(re.search(m["pos"], txt, re.I)) and e.get("direccion") == "+" and e.get("nivel") not in GEN_NIVELES
            if not (negativo or positivo):
                continue
            if est == "A" and positivo and any(m2["pos"] == m["pos"] and v["marcadores"][m2["id"]] == "P" for m2 in M):
                continue  # otro marcador de la misma via ya explica el fenotipo (spxB frente a lox)
            if est in ("P", "I") and negativo:
                lect = "porta_no_produce" if m.get("bacteriocina") else "anotado_refutado_en_ensayo"
            elif est == "P" and positivo:
                lect = "porta_y_fenotipo"
            elif est == "I" and positivo:
                lect = "indeterminado_con_fenotipo"
            elif est == "A" and positivo:
                lect = "fenotipo_sin_gen"
            else:
                continue  # A y fenotipo negativo: coherente, no se pinta
            cruces.append({"marcador": mid, "gen": est, "evidencia": e["id"], "nivel": e.get("nivel"), "direccion": e.get("direccion"),
                           "forma": e.get("forma"), "pmid": e.get("pmid"), "lectura": lect})
            if lect == "anotado_refutado_en_ensayo":
                v.setdefault("refutado_en_ensayo", {})[mid] = {"evidencia": e["id"], "pmid": e.get("pmid"), "forma": e.get("forma")}
    if cruces:
        v["gen_vs_fenotipo"] = cruces

# estado de produccion de bacteriocinas (para E3)
for acc, v in gen_out.items():
    for m in M:
        if not m.get("bacteriocina"):
            continue
        est = v["marcadores"][m["id"]]
        cr = [c for c in v.get("gen_vs_fenotipo", []) if c["marcador"] == m["id"]]
        if est == "NM":
            s = "no_medido"
        elif est != "P":
            s = "no_porta"
        elif any(c["lectura"] == "porta_no_produce" for c in cr):
            s = "porta_no_produce"
        elif any(c["lectura"] == "porta_y_fenotipo" for c in cr):
            s = "porta_y_produce"
        else:
            s = "porta_sin_ensayo"
        v.setdefault("produccion", {})[m["id"]] = {"estado": s, "evidencias": [c["evidencia"] for c in cr]}
        if m["id"] in v.get("no_evaluable", {}):
            v["produccion"][m["id"]]["motivo"] = "no evaluable con la anotación de NCBI (PGAP)"

# ============================================================ seguridad por genoma (parche E6 r2)
abr_hits = defaultdict(list)
for r in rd("drive/abricate_hits_referencias.csv"):
    abr_hits[r["accession"]].append(r)
for acc, v in gen_out.items():
    if acc not in G or G[acc]["analisis"].get("abricate") is None:
        v["seguridad"] = {"medido": False, "motivo": "genoma público sin ABRicate" if acc in G else "genoma NCBI (PGAP): ABRicate no corrido"}
        continue
    hs = abr_hits.get(acc, [])
    reps = {h["contig"] for h in hs if h["db"] == "plasmidfinder"}
    vf = sorted({h["gen"] for h in hs if h["db"] == "vfdb"})
    v["seguridad"] = {
        "medido": True, "herramienta": "ABRicate 1.4.0 (ResFinder, VFDB, PlasmidFinder)",
        "VFDB": "P" if vf else "A", "vfdb_genes": vf,
        "amr_en_contig_con_replicon": sorted({h["gen"] for h in hs if h["db"] == "resfinder" and h["contig"] in reps}),
    }

# ============================================================ n/N por taxon
tax_out = {}
for t in sorted({gen_out[a]["taxon"] for a in acc_llam}):
    accs = [a for a in acc_llam if gen_out[a]["taxon"] == t]
    d = {"slug_atlas": gen_out[accs[0]]["slug_atlas"], "genomas": len(accs),
         "genomas_por_anotador": dict(sorted(Counter(gen_out[a]["anotacion"] for a in accs).items())), "marcadores": {}}
    notas = sorted({gen_out[a]["taxon_nota"] for a in accs if gen_out[a].get("taxon_nota")})
    if notas:
        d["notas"] = notas
    for m in M:
        mid = m["id"]
        st = Counter(gen_out[a]["marcadores"][mid] for a in accs)
        n, i, a_ = st["P"], st["I"], st["A"]
        ne = sum(1 for a in accs if mid in gen_out[a].get("no_evaluable", {}))
        N = n + i + a_
        por = Counter(gen_out[a]["anotador"].get(mid) for a in accs if gen_out[a]["marcadores"][mid] in MEDIDO)
        if N == 0:
            lect, txt = ("no_evaluable", "no evaluable con la anotación de NCBI (PGAP): no es ausencia") if ne else ("no_medido", "no medido en este taxón")
        elif N == 1:
            lect, txt = "un_genoma", f"{n}/1 en un solo genoma público: no permite decir si es rasgo de especie"
        elif n and a_:
            lect, txt = "variable_cepa", f"varía entre cepas: {n}/{N}"
        elif i:
            lect, txt = "sin_resolver", f"{n}/{N} + {i} indeterminado{'s' if i > 1 else ''}: ni constante ni variable hasta el ensayo"
        elif n:
            lect, txt = "constante_presente", f"constante de especie: {n}/{N}"
        else:
            lect, txt = "constante_ausente", f"constante de especie (ausente): 0/{N}"
        if lect == "variable_cepa" and i:
            txt += f" + {i} indeterminado{'s' if i > 1 else ''}"
        if N and por.get(PGAP):
            txt += " (" + ", ".join(f"{k} {por[k]}" for k in (BAKTA, PGAP, ABRICATE) if por.get(k)) + ")"
        if N and ne:
            txt += f"; {ne} genoma{'s' if ne > 1 else ''} NCBI no evaluable{'s' if ne > 1 else ''}"
        e = {"n": n, "i": i, "N": N, "lectura": lect, "texto": txt, "por_anotador": {k: por[k] for k in (BAKTA, PGAP, ABRICATE) if por.get(k)}}
        if ne:
            e["no_evaluables"] = ne
        if lect in ("variable_cepa", "sin_resolver"):
            e["con"] = [x for x in accs if gen_out[x]["marcadores"][mid] == "P"]
        if i:
            e["indeterminados"] = [x for x in accs if gen_out[x]["marcadores"][mid] == "I"]
        d["marcadores"][mid] = e
    tax_out[t] = d
sup_tax = {gen_out[a]["taxon"] for a in sup_k4 if a in gen_out}
for t in sup_tax:
    tax_out[t]["superficie"] = {"lecturas": lecturas_k4({a: x for a, x in sup_k4.items() if a in gen_out and gen_out[a]["taxon"] == t}),
                                "descartes_declarados": dict(sup_desc)}

# ============================================================ cobertura (tabla oficial, recalculada)
especies_bact = {s for s, x in especies_atlas.items() if x.get("tipo_organismo") != "levadura"}
slugs = lambda accs: {gen_out[a]["slug_atlas"] for a in accs if a in gen_out} - {None}
acc_bk = [a for a in acc_llam if BAKTA in gen_out[a]["anotador"].values() and any(gen_out[a]["anotador"].get(m["id"]) == BAKTA
                                                                                  for m in M if m["id"] not in ("AMR_ADQ", "PLASMIDO"))]
acc_pg = [a for a in acc_llam if PGAP in gen_out[a]["anotador"].values()]
slugs_any = slugs(acc_todos)
slugs_llam = slugs(acc_llam)
slugs_bakta = slugs(acc_bk)
slugs_pgap_solo = slugs(acc_pg) - slugs_bakta
slugs_ani = {gen_out[p[0]]["slug_atlas"] for p in pares if p[0] in gen_out} - {None}
slugs_bagel = slugs(acc_bagel)
cep_acc = {cid for cid, c in cepas_atlas.items() if ((c.get("genoma") or {}).get("accesion"))}
cep_perfil = sorted(cid for cid, x in cep_idx.items() if x["accesion"] in acc_llam)
cep_nombre = sorted(cid for cid in cep_perfil if cep_idx[cid]["vinculo"] == "nombre")
cep_solo_bagel = sorted(cid for cid, x in cep_idx.items() if x["accesion"] not in acc_llam)
cep_sin = sorted(cep_acc - set(cep_idx))
cep_sin_genoma = sorted(set(cepas_atlas) - cep_acc - set(cep_idx))


def cnt(p):  # estado crudo del marcador p en TODOS los genomas con llamadas (drive/ Bakta y ncbi/ PGAP); sin fila = no_medido
    def est(a):
        r = by.get(a, {}).get(p) or by_pgap.get(a, {}).get(p) or {}
        e = r.get("estado") or "no_medido"
        return "no_medido" if e == "no_aplica" else e
    return dict(sorted(Counter(est(a) for a in acc_llam).items()))


F = lambda clave, que, valor, **kw: {"clave": clave, "que": que, "valor": valor, **kw}
inventario = sorted(set(G) | {a for a in ncbi_gen if a not in LEVADURA})
cobertura = {
    "tabla": [
        F("especies_atlas", "Especies del atlas", len(especies_atlas)),
        F("especies_con_analisis", "Especies del atlas con algún análisis genómico público", len(slugs_any), lista=sorted(slugs_any),
          detalle="S. cerevisiae (levadura): solo metadatos NCBI; los marcadores bacterianos no aplican"),
        F("especies_con_llamadas", "… con llamadas de marcadores (Bakta o PGAP)", len(slugs_llam), lista=sorted(slugs_llam)),
        F("especies_con_marcadores_bakta", "… con marcadores sobre anotación Bakta", len(slugs_bakta), lista=sorted(slugs_bakta)),
        F("especies_solo_pgap", "… solo con anotación PGAP de NCBI (marcadores poco fiables sobre PGAP = no evaluable)", len(slugs_pgap_solo), lista=sorted(slugs_pgap_solo)),
        F("especies_con_ani", "… con ANI medido (skani / pyskani)", len(slugs_ani), lista=sorted(slugs_ani)),
        F("especies_con_bagel4", "… con BAGEL4 en algún genoma", len(slugs_bagel), lista=sorted(slugs_bagel)),
        F("especies_con_superficie", "… con arquitectura de superficie (Bakta funcional completo)", len(slugs(sup_k4)), lista=sorted(slugs(sup_k4)),
          detalle=f"{len(sup_k4)} genomas"),
        F("genomas_inventario", "Genomas públicos bacterianos en el inventario (drive/ + ncbi/)", len(inventario)),
        F("genomas_con_llamadas", "… con llamadas de marcadores", len(acc_llam)),
        F("genomas_bakta", "… con marcadores Bakta", len(acc_bk)),
        F("genomas_pgap", "… con llamadas PGAP de NCBI", len(acc_pg)),
        F("genomas_abricate", "… con ABRicate (seguridad medida)", sum(1 for v in gen_out.values() if v["seguridad"]["medido"])),
        F("genomas_solo_bagel4", "… solo BAGEL4", len([a for a in acc_bagel if a not in acc_llam])),
        F("cepas_atlas", "Cepas del atlas", len(cepas_atlas)),
        F("cepas_con_accesion", "… con accession de genoma en cepas.json", len(cep_acc)),
        F("cepas_con_perfil", "… con perfil de marcadores", len(cep_perfil), lista=cep_perfil),
        F("cepas_vinculadas_por_nombre", "… de ellas, vinculadas por nombre, depósito o cepa tipo (verificar)", len(cep_nombre), lista=cep_nombre),
        F("cepas_solo_bagel4", "… solo con BAGEL4", len(cep_solo_bagel), lista=cep_solo_bagel),
        F("cepas_accesion_sin_analisis", "… con accession pero SIN ningún análisis", len(cep_sin), lista=cep_sin),
        F("cepas_sin_genoma", "… sin genoma localizado (ni accession ni vínculo por nombre)", len(cep_sin_genoma), lista=cep_sin_genoma),
    ],
    "conciliacion_dosier": (f"El dosier decía «6-9 de 26» mezclando taxones NCBI con especies del atlas. Cifra de este build, en especies del atlas: "
                            f"{len(slugs_any)} de {len(especies_atlas)} con algún análisis, {len(slugs_llam)} con llamadas de marcadores "
                            f"({len(slugs_bakta)} sobre Bakta, {len(slugs_pgap_solo)} solo sobre PGAP), {len(slugs(sup_k4))} con arquitectura de "
                            f"superficie; {len(cep_perfil)} de {len(cepas_atlas)} cepas con perfil ({len(cep_nombre)} vinculadas por nombre)."),
    "no_medido_en_publicos": [
        {"ids": [i for i in defs if i.startswith("IMM")], "estado_en_genomas_con_llamadas": cnt("IMM01"),
         "motivo": "cribado de inmunidad solo corrido sobre cepas propias"},
        {"ids": [i for i in defs if i.startswith("BGL")], "estado_en_genomas_con_llamadas": cnt("BGL1"),
         "motivo": f"BAGEL4 solo sobre {len(acc_bagel)} genomas públicos (ver genomas[acc].bagel4)"},
        {"ids": ["SEGR", "SEGV", "SEGP"], "estado_en_genomas_con_llamadas": dict(sorted(Counter("medido" if gen_out[a]["seguridad"]["medido"] else "no_medido" for a in acc_llam).items())),
         "motivo": "ABRicate (ResFinder, VFDB, PlasmidFinder) no corrido sobre los genomas de la ampliación NCBI"},
    ],
    "aviso_taxonomico": "El atlas agrupa L. lactis subsp. lactis y subsp. cremoris en una ficha; aquí se cuentan por separado (ANI entre ellas en ani_entre_subespecies).",
}
xs = [p[2] for p in pares if {gen_out.get(p[0], {}).get("taxon"), gen_out.get(p[1], {}).get("taxon")} == {"Lactococcus lactis subsp. lactis", "Lactococcus lactis subsp. cremoris"}]
if xs:
    cobertura["ani_entre_subespecies"] = {"pares": len(xs), "min": min(xs), "max": max(xs)}

# ============================================================ salida
out = {
    "version": A.fecha,
    "generado_por": "scripts/datos/derivar_genomica.py",
    "fuentes_sha256": {**{"fuentes_publicas/" + r["fichero"]: sha(os.path.join(FP, r["fichero"])) for r in MANIF},
                       "scripts/datos/curado/ani_pares_complemento.csv": sha(ANI_COMPL),
                       **{"data/" + f: sha(os.path.join(DATA, f)) for f in DATOS}},
    "fuentes_uso": {"fuentes_publicas/" + r["fichero"]: r["uso"] for r in MANIF},
    "estados_genoma": {
        "P": "lo lleva (regla auditada)",
        "A": "no lo lleva (medido)",
        "I": "indeterminado: hay un homólogo, pseudogén o gen truncado que la regla no puede decidir",
        "NM": "no medido: NO es ausencia (si genomas[acc].no_evaluable[id] existe: no evaluable con la anotación de NCBI)",
    },
    "no_evaluable_texto": TXT_NE,
    "anotadores": {
        BAKTA: "Bakta sobre genomas públicos NCBI (análisis de Javier, fuentes_publicas/drive)",
        PGAP: "anotación PGAP de RefSeq (fuentes_publicas/ncbi); solo marcadores fiables según la validación PGAP frente a Bakta",
        ABRICATE: "ABRicate 1.4.0 sobre genomas públicos (ResFinder, VFDB, PlasmidFinder; análisis de Javier, fuentes_publicas/drive): AMR_ADQ y PLASMIDO",
        SOLO_ABRICATE: "genoma con ABRicate y sin marcadores génicos (ni Bakta ni PGAP fiable)",
        BAGEL4: "BAGEL4 sobre genomas públicos (bacteriocinas; análisis de Javier, fuentes_publicas/drive): genomas[acc].bagel4",
        SOLO_BAGEL4: "genoma con BAGEL4 y sin marcadores génicos ni ABRicate",
    },
    "validacion_pgap": {m["id"]: {"origen": m["origen"], "fiable_sobre_pgap": pgap_fiable(m),
                                  "detalle": {o: {"fiabilidad": FIABLE.get(o), "concordancia_estado_pct": fnum(ncbi_val.get(o, {}).get("concordancia_estado_pct")),
                                                  "concordancia_positivos_pct": fnum(ncbi_val.get(o, {}).get("concordancia_positivos_pct"))}
                                              for o in m["origen"].split("+")}} for m in M},
    "regla_pantalla": "Si genomas[acc].refutado_en_ensayo[id] existe, se muestra «anotado, refutado en ensayo» con su PMID en lugar del estado genómico. Para bacteriocinas se muestra produccion[id].estado. Si genomas[acc].no_evaluable[id] existe, el marcador (NM) se muestra «no evaluable con la anotación de NCBI», nunca ausente. Cada llamada muestra su anotador real (genomas[acc].anotador[id]: Bakta, PGAP (NCBI) o ABRicate).",
    "estados_produccion": {
        "no_medido": "sin llamada para este genoma (con produccion[id].motivo si es no evaluable con la anotación de NCBI)",
        "no_porta": "el genoma no lleva el locus completo (ver restos_locus si hay restos)",
        "porta_sin_ensayo": "lleva el locus; no hay evidencia de producción de esta cepa en el atlas",
        "porta_y_produce": "lleva el locus y una evidencia fenotípica (no genómica) de esta cepa muestra producción o efecto",
        "porta_no_produce": "lleva el locus y una evidencia de esta cepa dice que NO lo produce",
    },
    "lecturas": {
        "constante_presente": "Lo llevan todos los genomas medidos del taxón: rasgo de especie, no distingue cepas.",
        "constante_ausente": "No lo lleva ningún genoma medido: rasgo de especie (ausencia), con N genomas.",
        "variable_cepa": "Lo llevan n de N: aquí elegir cepa importa.",
        "sin_resolver": "Todos los resueltos coinciden, pero hay indeterminados: no se puede llamar constante.",
        "un_genoma": "Un solo genoma medido: no permite decir si es rasgo de especie o de cepa.",
        "no_medido": "No hay llamada para ese taxón. NO es ausencia.",
        "no_evaluable": "Solo hay anotación PGAP y el marcador no es fiable sobre PGAP. NO es ausencia.",
        "aviso": "Porta el gen ≠ produce la molécula ≠ tiene la actividad. Cada marcador lleva su ensayo de confirmación.",
    },
    "lecturas_etiqueta": {"constante_presente": "constante de especie", "constante_ausente": "constante de especie (ausente)",
                          "variable_cepa": "varía entre cepas", "sin_resolver": "sin resolver", "un_genoma": "un solo genoma",
                          "no_medido": "no medido", "no_evaluable": "no evaluable con la anotación de NCBI"},
    "cobertura": cobertura,
    "marcadores": [
        {"id": m["id"], "origen": m["origen"], "nombre": m["nombre"], "pregunta": m["pregunta"],
         "regla_original": " + ".join(defs[o]["regla"] for o in m["origen"].split("+")),
         "regla_aplicada": m["regla"], "cambio_auditoria": m["cambio"], "fiable_sobre_pgap": pgap_fiable(m),
         "confirmar_con": " / ".join(sorted({defs[o]["confirmar_con"] for o in m["origen"].split("+") if defs[o]["confirmar_con"]})) or None}
        for m in M
    ],
    "taxones": tax_out,
    "genomas": gen_out,
    "cepas_atlas": dict(sorted(cep_idx.items())),
    "superficie_descartes_declarados": dict(sup_desc),
    "ani": {"metodo": "skani 0.3.1 triangle --sparse --full-matrix (drive/), pyskani 0.2.0 / skani 0.3.0 dentro de cada género (ncbi/) "
                      "y pyskani 0.2.0 en los pares del mismo género que ninguna de las dos ejecuciones cruzó (scripts/datos/curado/ani_pares_complemento.csv)",
            "nota": ("Parentesco genómico, no actividad. ANI delimita especie; no transporta rasgos. Se han calculado todos los pares del mismo género "
                     "entre los genomas con ANI: un par de ese tipo que no aparece está por debajo del filtro de skani (~80 %), no «sin medir». "
                     "Entre géneros distintos no se calcula." if not ani_no_cruzados else
                     f"Parentesco genómico, no actividad. ANI delimita especie; no transporta rasgos. Un par ausente solo está por debajo del filtro de skani (~80 %) "
                     f"si los dos genomas se cruzaron; {len(ani_no_cruzados)} pares del mismo género NO se han cruzado (ani.no_cruzados y genomas[acc].ani_no_cruzado_con): "
                     f"no medidos, no «distinta especie». Entre géneros distintos no se calcula."),
            "pares_calculados_complemento": len(ani_compl), "pares_informados_complemento": sum(1 for r in ani_compl if r["ANI"]),
            "no_cruzados": ani_no_cruzados,
            "columnas": ["ref", "query", "ani", "af_ref", "af_query", "herramienta"], "pares": pares},
}

os.makedirs(A.salida_dir, exist_ok=True)
dst = os.path.join(A.salida_dir, "genomica_" + A.fecha.replace("-", "") + ".json")
txt = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
with open(dst, "w", encoding="utf-8") as fh:
    fh.write(txt)
if A.publicar:
    with open(A.publicar, "w", encoding="utf-8") as fh:
        fh.write(txt)
print("ok", dst, len(txt.encode()), "bytes;", len(gen_out), "genomas;", len(acc_llam), "con llamadas;", len(M), "marcadores;",
      "publicado en " + A.publicar if A.publicar else "sin publicar")
