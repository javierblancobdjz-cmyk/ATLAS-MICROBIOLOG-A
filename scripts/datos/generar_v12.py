#!/usr/bin/env python3
"""Atlas · generador del esquema v1.2 (revisión r2 + integración del lote E9 r2): mecanismo, forma y estados honestos.

Uso (lo llama scripts/datos/construir_datos.py, paso 2 y paso 6):
    python3 -I scripts/datos/generar_v12.py --entrada DIR_V11_CORREGIDO --salida DIR_TRABAJO [--hoy AAAA-MM-DD] [--trazas DIR]
    python3 -I scripts/datos/generar_v12.py --cierre DIR_TRABAJO     (paso 6: puerta de cepa en veredictos + meta.limitaciones)

Lee la versión congelada v1.1 (scripts/datos/data_v1.1, con las correcciones curadas de E6 ya aplicadas por el paso 1) y
la curación de scripts/datos/curado/, y escribe un data/ completo en --salida (nunca sobre la entrada). Determinista:
dos ejecuciones con el mismo --hoy dan ficheros idénticos byte a byte. Nada se edita a mano en data/.

Pasos:
  0. Curación de evidencias como datos:
       a. lotes verificados (curado/lotes/*.json + verificacion_*.tsv + *_refs.json). Un lote con `sustituye_a` hace que
          el lote sustituido NO se lea (E9_r2 sustituye a E9_r1). `contexto_nuevo` entra como tipo=contexto, sin línea ni
          resultado (lacticaseibacillus-paracasei.ev007).
       b. particiones (curado/particiones_evidencia.json; ev013 -> ev013a/ev013b)
       c. ajustes de campo con autor (curado/ajustes_evidencia.tsv: E1 inactivacion_metodo + E9 ev008 y dentisani ev005)
          y ortografía curada (curado/ajustes_tildes.tsv vía ajustes_tildes.py: solo tildes/eñes/diéresis, si el texto
          coincide con su origen: v1.1, curado/*.tsv al leerlo o el lote al cargarlo)
       d. dirección: enum cerrado {+, 0, -, mixto}; los «nc» heredados de v1.1 pasan a «mixto» con direccion_v11 = nc
       e. `relacion` en TODOS los registros: regla por modelo y nivel; las OBS, de curado/relacion_obs.tsv; el lote manda
          si la trae. relacion = asociacion NO suma dirección en ninguna celda (especificación P1-01 e, sin excepciones):
          va a `asociaciones`. Única salvedad, rotulada como criterio propio en catalogo.estado_celda_valores: en la
          línea de seguridad una serie de casos asociada (bacteriemias) marca el ESTADO senal_de_riesgo, sin sumar dirección.
  1. evidencias.json  -> objeto `mecanismo` en cada evidencia (tipo=evidencia).
  2. catalogo.json    -> mecanismos saneados, clases, bases, descartes y candidatos (M35); por resultado `cobertura`
                         (con_evidencia / sin_curar / sin_curar_sin_cola) y `cola_curacion` del lote (no verificada).
  3. matriz.json      -> estado, estado_por_forma (solo formas ensayadas), funciona_inactivada (forma + dirección; forma
                         null = no probada), mecanismo.requiere_viabilidad, n_forma_no_declarada, asociaciones aparte.
     celdas.json      -> derivación v1.1 (celdas_v11.py) sobre la evidencia curada.
  4. ataques.json     -> mecanismo_ids/clases derivados; estado por forma, funciona_inactivada y requiere_viabilidad de su celda.
  5. veredictos.json  -> puerta de seguridad normalizada, C1 a todos, veredictos pedidos; alcance «mezcla» no cuenta
                         como logro de ninguna cepa ni en C1. veredictos_estado.json.
  6. especies/cepas/refs -> ids nuevos; cepas.json[*].que_hace_bien derivado (logros de la cepa en solitario y, aparte,
                         lo demostrado en mezcla con su etiqueta).
  7. meta.json        -> build 1.2, revisión, totales, ids partidos, lotes integrados y sustituidos.
  (vecinos.json lo construye vecinos_v12.py como paso propio, DESPUÉS de los rasgos v1.2.)
Cierre (--cierre, paso 6 del orquestador): puertas.regulatorio de los veredictos de CEPA = puerta_cepa.json (regla de E6,
p. ej. R-nomedido) y meta.limitaciones con las cifras de catalogo.json, genomica.json y evidencias.json.
Solo biblioteca estándar.
"""
import argparse, copy, csv, json, re, shutil, sys
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import quote

AQUI = Path(__file__).resolve().parent
CUR = AQUI / "curado"
sys.path.insert(0, str(AQUI))
import celdas_v11  # noqa: E402
import ajustes_tildes  # noqa: E402
TRAZA_TILDES = []  # ortografía aplicada al leer curado/*.tsv (se vuelca en traza_curacion.tsv)

REVISION = "r2"
FORMAS = ("vivo", "posbiotico", "fermentado")
FORMA_PRODUCTO = {"vivo": "vivo", "inactivado": "posbiotico", "componente": "posbiotico", "metabolito": "posbiotico",
                  "fermentado": "fermentado"}
HUMANO = ("MA", "ECA", "OBS")
A_FAVOR = ("+", "mixto")            # igual que v1.1 para mejor_nivel
NULO = ("0", "-")
DIRECCIONES = ("+", "0", "-", "mixto")
RELACIONES = ("intervencion", "asociacion", "in_vitro", "prediccion")
CLASES_REALES = ("exclusion_patogeno", "adhesion_hospedador", "bacteriocina", "acido_h2o2", "alcalinizacion_ads_ureasa",
                 "interferencia_quorum", "enzima", "inmunomodulacion", "senalizacion_hospedador", "metabolito",
                 "uso_glicanos", "otro")
BASE_ORDEN = ("causal", "observado", "inferencia", "prediccion_genomica")
BASES = [{"id": "causal", "etiqueta": "fenómeno demostrado (mutante, deleción o bloqueo)"},
         {"id": "observado", "etiqueta": "fenómeno observado en el ensayo"},
         {"id": "inferencia", "etiqueta": "fenómeno inferido por los autores"},
         {"id": "prediccion_genomica", "etiqueta": "predicción genómica (porta ≠ produce)"},
         {"id": "sin_dato", "etiqueta": "sin mecanismo descrito"}]
DETERMINANTES = [{"id": "identificado", "etiqueta": "determinante identificado"},
                 {"id": "desconocido", "etiqueta": "determinante desconocido"},
                 {"id": "no_aplica", "etiqueta": "no aplica"}]
RELACION_VALORES = [{"id": "intervencion", "etiqueta": "intervención (se administra y se mide)"},
                    {"id": "asociacion", "etiqueta": "asociación (se observa, no se interviene): no cuenta como efecto"},
                    {"id": "in_vitro", "etiqueta": "ensayo in vitro"},
                    {"id": "prediccion", "etiqueta": "predicción in silico"},
                    {"id": "no_aplica", "etiqueta": "contexto sin diseño de estudio"}]
DIRECCION_VALORES = [{"id": "+", "etiqueta": "a favor"}, {"id": "0", "etiqueta": "sin efecto"}, {"id": "-", "etiqueta": "en contra"},
                     {"id": "mixto", "etiqueta": "resultado mixto"}]
ESTADO_CELDA_VALORES = [
    {"id": "con_evidencia", "etiqueta": "con evidencia en humanos a favor"},
    {"id": "linea_de_ataque", "etiqueta": "línea de ataque: efecto preclínico con mecanismo observado"},
    {"id": "preclinica_sin_mecanismo", "etiqueta": "efecto preclínico, mecanismo sin identificar"},
    {"id": "via_cerrada_o_replantear", "etiqueta": "ECA o MA nulo o en contra: vía cerrada o a replantear"},
    {"id": "sin_resultado_a_favor", "etiqueta": "probado: ningún resultado a favor"},
    {"id": "solo_asociacion", "etiqueta": "solo asociación (se observa, no se interviene): no cuenta como efecto"},
    {"id": "solo_mezcla", "etiqueta": "solo en mezcla de cepas: no cuenta para ninguna"},
    {"id": "senal_de_riesgo", "etiqueta": "señal de riesgo (en seguridad cuenta también una serie de casos asociada; criterio del atlas)"},
    {"id": "sin_senal_de_riesgo", "etiqueta": "sin señal de riesgo registrada (no es «seguro»)"},
]
MOLECULA_DESCONOCIDA = re.compile(r"desconocid|^n/a|no caracterizad", re.I)
HEDGE = re.compile(r"probablemente|posible|posiblemente|podr[ií]a|sugiere|plantean", re.I)
NO_APLICA_TIPOS = ("taxonomico", "seguridad")
NO_APLICA_RES = ("prevalencia", "edad", "nicho", "taxonomia", "colonizacion", "nugent_amsel", "indice_fragilidad",
                 "viabilidad_matriz")
NN = {"MA": 1, "ECA": 2, "OBS": 3, "ANI": 4, "CEL": 5, "GEN-v": 6, "GEN-p": 7}
# ¿funciona muerta? Derivado de forma + dirección (los 5 valores de E8; nunca «No»). Forma null = no declarada = np.
MUERTA, FRACCION = ("inactivado",), ("componente", "metabolito")
FORMA_ETQ = {"vivo": "viva", "inactivado": "inactivada", "componente": "fracción celular", "fermentado": "fermentado",
             "metabolito": "metabolito aislado"}
MODELO_IN_VITRO = ("celulas", "bioquimico", "fermentacion_in_vitro")
MODELO_ANIMAL = ("raton", "rata", "c_elegans", "animal_produccion")


def nivel_num(n):
    return NN.get(n, 99)


def tsv(nombre):
    """Lee un TSV de curado/ con la ortografía curada de ajustes_tildes.tsv (fichero = curado/<nombre>) ya aplicada."""
    with open(CUR / nombre, encoding="utf-8") as f:
        filas = list(csv.DictReader(f, delimiter="\t", quoting=csv.QUOTE_NONE))
    t = []
    ajustes_tildes.aplicar_tsv(nombre, filas, t)
    TRAZA_TILDES.extend(x for x in t if x not in TRAZA_TILDES)
    return filas


def cargar(d, k):
    return json.loads((d / f"{k}.json").read_text(encoding="utf-8"))


def guardar(d, k, obj):
    (d / f"{k}.json").write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def url_fragmento(pmid, frag):
    q = lambda s: quote(s, safe="")
    return f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/#:~:text={q(frag['inicio'])},{q(frag['fin'])}"


def clausula(texto, m):
    """Cláusula (entre ; : . o paréntesis) que contiene la coincidencia m."""
    ini = max(texto.rfind(c, 0, m.start()) for c in ";:.(")
    fins = [texto.find(c, m.end()) for c in ";:.)"]
    fin = min([f for f in fins if f >= 0] or [len(texto)])
    return texto[ini + 1:fin]


def expandir_ids(obj, alias):
    """Sustituye cada id partido por sus partes: en listas se expande, en valores sueltos va a la principal."""
    if isinstance(obj, dict):
        return {k: expandir_ids(v, alias) for k, v in obj.items()}
    if isinstance(obj, list):
        out = []
        for x in obj:
            if isinstance(x, str) and x in alias:
                out += [p for p in alias[x]["partes"] if p not in out]
            else:
                out.append(expandir_ids(x, alias))
        return out
    if isinstance(obj, str) and obj in alias:
        return alias[obj]["principal"]
    return obj


def cuenta_direccion(e, producto=None):
    """Una asociación no suma dirección en ninguna celda ni en el pivote (no es un efecto). Sin excepciones por línea
    (especificación P1-01 e). `producto` se conserva en la firma por compatibilidad y no se usa."""
    return e.get("relacion") != "asociacion"


def en_solitario(e):
    """Alcance «mezcla»: la intervención combina varias cepas; no es logro de ninguna de ellas."""
    return e.get("alcance") != "mezcla"


# ---------------------------------------------------------------- 0. curación de evidencias como datos
def lotes_a_leer(traza):
    """Lotes de curado/lotes/*.json, sin los sustituidos por otro (`sustituye_a`)."""
    todos = {}
    for p in sorted(CUR.glob("lotes/*.json")):
        if p.name.endswith("_refs.json") or p.name.startswith("metadatos_"):
            continue
        L = json.loads(p.read_text(encoding="utf-8"))
        ajustes_tildes.aplicar(str(p.relative_to(AQUI)), L, traza, marcar=False)  # ortografía curada del lote (id «-»)
        todos[L.get("lote") or p.stem] = (p, L)
    sustituidos = {L["sustituye_a"]: lid for lid, (p, L) in todos.items() if L.get("sustituye_a")}
    out = []
    for lid, (p, L) in sorted(todos.items()):
        if lid in sustituidos:
            traza.append(("lote_sustituido", lid, f"no se lee: lo sustituye {sustituidos[lid]}"))
            continue
        out.append((lid, p, L))
    return out, sorted(sustituidos)


def ingerir_lotes(ev, cepas, refs, traza):
    """Lotes de evidencias nuevas ya verificadas (formato de E9). Se normalizan al esquema de evidencias.json;
    el mecanismo que trae el lote NO se usa: se recalcula con las mismas reglas que el resto (queda como
    mecanismo_propuesto_lote para trazar la discrepancia)."""
    rt = defaultdict(Counter)
    for e in ev.values():
        if e.get("linea") and e.get("resultado_tipo"):
            rt[(e["linea"], e["resultado"])][e["resultado_tipo"]] += 1
    verif = {}
    for p in sorted(CUR.glob("lotes/verificacion_*.tsv")):
        with p.open(encoding="utf-8") as f:
            for r in csv.DictReader(f, delimiter="\t", quoting=csv.QUOTE_NONE):
                verif[r["evidencia"]] = r
    lotes, colas = [], []
    leidos, sustituidos = lotes_a_leer(traza)
    for lid, p, L in leidos:
        rp = p.with_name(p.stem + "_refs.json")
        R = json.loads(rp.read_text(encoding="utf-8")) if rp.exists() else {}
        lotes.append(lid)
        regs = [(x, "evidencia") for x in L.get("evidencias_nuevas", [])] + [(x, "contexto") for x in L.get("contexto_nuevo", [])]
        for x, tipo in regs:
            v = verif.get(x["id"])
            if not v or v["fragmento_inicio_literal"] != "si" or v["fragmento_fin_literal"] != "si":
                traza.append(("lote_rechazada", x["id"], "sin verificación literal registrada"))
                continue
            fuera = ("mecanismo", "mecanismo_propuesto_lote", "por_que_importa", "nota_seguridad", "nota_tipo")
            e = {k: x[k] for k in x if k not in fuera}
            if tipo == "evidencia":
                e.update({"resultado_tipo": rt[(x["linea"], x["resultado"])].most_common(1)[0][0] if rt[(x["linea"], x["resultado"])] else "clinico",
                          "nivel_num": nivel_num(x["nivel"])})
            else:  # contexto: sin línea, resultado, dirección ni nivel numérico que puntúe
                e.update({"linea": None, "resultado": None, "direccion": None, "nivel_num": None,
                          "resultado_tipo": x.get("resultado_tipo") or "mecanistico"})
            e.update({"tipo": tipo, "subgrupo": x.get("subgrupo"), "asignacion": x.get("asignacion", "declarada"),
                      "ref": "pmid:" + x["pmid"], "auditada": None, "lote": lid,
                      "verificacion": {"estado": "verificada", "coincidencia": 1.0, "problemas": [], "metodo": v["metodo"],
                                       "fecha": v["fecha"], "quien": v["quien"]},
                      "mecanismo_propuesto_lote": x.get("mecanismo_propuesto_lote") or x.get("mecanismo")})
            if "relacion" in x:
                e["relacion_origen"] = "lote"
            for fk in ("fragmento", "fragmento_2"):
                if x.get(fk):
                    e[fk] = {**x[fk], "url": url_fragmento(x["pmid"], x[fk])}
            notas = {k: x[k] for k in ("por_que_importa", "nota_seguridad", "nota_tipo") if x.get(k)}
            if notas:
                e["notas_lote"] = notas
            ev[e["id"]] = e
            traza.append(("lote_" + tipo, e["id"], lid))
            ref = refs.setdefault(e["ref"], {"id": e["ref"], "pmid": x["pmid"], "doi_dudoso": False, "retractada": None,
                                             "evidencias": [], "especies": [],
                                             "verificacion": {"estado": "verificada", "fecha": v["fecha"], "script": "PubMed MCP (E9)"},
                                             **{k: R.get(e["ref"], {}).get(k) for k in ("doi", "autores", "titulo", "revista", "anio", "tipos_publicacion", "cita_corta")}})
            ref["evidencias"] = sorted(set(ref["evidencias"]) | {e["id"]})
            ref["especies"] = sorted(set(ref["especies"]) | {e["especie"]})
        for c in L.get("cepas_nuevas", []):
            sp, sfx = c["id"].split(".st-")
            dep = c.get("deposito") or ""
            col, _, num = dep.partition(" ")
            cepas[c["id"]] = {"id": c["id"], "designacion": c["designacion"], "nombre_corto": c["designacion"],
                              "subgrupo": None, "categoria": c.get("categoria"),
                              "anillo": "genoma_publico" if (c.get("genoma") or {}).get("accesion") else "literatura",
                              "fuentes": sorted(e["id"] for e in ev.values() if e.get("cepa") == c["id"]), "especie": sp,
                              "origen": c.get("origen"), "depositos": [{"coleccion": col, "numero": num}] if num else [],
                              "otros_nombres": c.get("sinonimos") or [], "genoma": c.get("genoma"), "titular": c.get("titular"),
                              "lote": lid}
            traza.append(("lote_cepa", c["id"], lid))
        cola = L.get("cola_de_curacion_no_verificada")
        if isinstance(cola, dict):
            colas.append((lid, cola))
    return lotes, sustituidos, colas


def partir(ev, traza):
    P = json.loads((CUR / "particiones_evidencia.json").read_text(encoding="utf-8"))
    alias = {}
    for vid, spec in P.items():
        if vid.startswith("_") or vid not in ev:
            continue
        base = ev.pop(vid)
        for parte in spec["partes"]:
            e = copy.deepcopy(base)
            e.update({k: v for k, v in parte.items()})
            for fk in ("fragmento", "fragmento_2"):
                if fk in parte:
                    e[fk] = {**parte[fk], "url": url_fragmento(base["pmid"], parte[fk])}
            e["particion_de"] = vid
            e["verificacion"] = {"estado": "verificada", "coincidencia": 1.0, "problemas": [],
                                 "metodo": "PubMed MCP get_article_metadata: fragmento literal en el abstract", "fecha": "2026-10-23",
                                 "quien": "E1 (partición propuesta por E9)"}
            ev[e["id"]] = e
        alias[vid] = {"principal": spec["principal"], "partes": [p["id"] for p in spec["partes"]],
                      "justificacion": spec["justificacion"]}
        traza.append(("particion", vid, alias[vid]["partes"]))
    return alias


def ajustar(ev, traza):
    for r in tsv("ajustes_evidencia.tsv"):
        e = ev.get(r["evidencia"])
        if e is None:
            traza.append(("ajuste_sin_evidencia", r["evidencia"], r["campo"]))
            continue
        old, nuevo = e.get(r["campo"]), json.loads(r["valor_nuevo"])
        if old == nuevo:  # el lote ya lo trae así: se traza, no se registra como cambio
            traza.append(("ajuste_ya_en_fuente", r["evidencia"], r["campo"]))
            continue
        e[r["campo"]] = nuevo
        e.setdefault("ajustes_v12", []).append({"campo": r["campo"], "valor_v11": old, "autor": r["autor"],
                                               "justificacion": r["justificacion"]})
        traza.append(("ajuste", r["evidencia"], r["campo"]))


def normalizar_direccion(ev, traza):
    """Enum cerrado +/0/-/mixto. Los «nc» (no concluyente) heredados de v1.1 pasan a «mixto» con traza."""
    for k in sorted(ev):
        e = ev[k]
        if e.get("tipo") == "evidencia" and e.get("direccion") == "nc":
            e["direccion_v11"] = "nc"
            e["direccion"] = "mixto"
            traza.append(("direccion_nc_a_mixto", k, "nc -> mixto"))


def asignar_relacion(ev, traza):
    """relacion por regla (modelo y nivel); las OBS a mano (curado/relacion_obs.tsv); el lote manda si la trae."""
    obs = {r["evidencia"]: r for r in tsv("relacion_obs.tsv")}
    for k in sorted(ev):
        e = ev[k]
        if e.get("relacion_origen") == "lote" and e.get("relacion"):
            continue
        m, n = e.get("modelo"), e.get("nivel")
        if k in obs:
            e["relacion"], e["relacion_origen"] = obs[k]["relacion"], "curado"
            e["relacion_justificacion"] = obs[k]["justificacion"]
        elif m == "in_silico":
            e["relacion"], e["relacion_origen"] = "prediccion", "regla"
        elif m in MODELO_IN_VITRO:
            e["relacion"], e["relacion_origen"] = "in_vitro", "regla"
        elif m in MODELO_ANIMAL or n in ("MA", "ECA", "ANI"):
            e["relacion"], e["relacion_origen"] = "intervencion", "regla"
        elif e.get("tipo") != "evidencia":
            e["relacion"], e["relacion_origen"] = "no_aplica", "regla"
        else:  # una OBS sin decisión curada: se deja null y el test lo detecta (no se inventa)
            e["relacion"], e["relacion_origen"] = None, "pendiente"
            traza.append(("relacion_pendiente", k, f"{m}/{n}"))


# ---------------------------------------------------------------- 1. mecanismo por evidencia
def mecanismo_de(e, CL, GEN, MEC, EXC):
    claim = e.get("claim_es") or ""
    reglas, clases, bases = [], [], []
    for c in CL:
        if not c["patron_claim"]:
            continue
        for m in re.finditer(c["patron_claim"], claim, re.I):
            if c["clase"] not in clases:
                clases.append(c["clase"])
                reglas.append("C:" + c["clase"])
                bases.append("inferencia" if HEDGE.search(clausula(claim, m)) else "observado")
            break
    ids = [i for i in (e.get("mecanismos") or []) if i in MEC]
    if ids:
        reglas.append("V11:" + ",".join(ids))
    for mid, mec in MEC.items():
        if not mec["patron_claim"] or mid in ids:
            continue
        esp = [s for s in mec["especies"].split(",") if s]
        if esp and e["especie"] not in esp:
            continue
        if re.search(mec["patron_claim"], claim, re.I):
            ids.append(mid)
            reglas.append("P:" + mid)
    genes = []
    for g in GEN:
        if re.search(g["patron_claim"], claim, re.I) and g["gen"] not in genes:
            genes.append(g["gen"])
    for mid in ids:
        for g in filter(None, MEC[mid]["genes"].split(",")):
            if g not in genes and re.search(re.escape(g.split(" ")[0]), claim, re.I):
                genes.append(g)
    if e.get("linea") == "seguridad":  # en seguridad no hay efecto que explicar: el «mecanismo» sería el del riesgo
        clases, ids, reglas = [], [], reglas + ["NA:linea_seguridad"]
    out = {"clases": clases, "ids": ids, "genes": genes, "reglas": reglas}
    for x in EXC.get(e["id"], []):  # excepciones curadas, con justificación en el TSV
        out[x["campo"]] = json.loads(x["valor"])
        out["reglas"] = out["reglas"] + ["EXC:" + x["campo"]]
    clases, ids, genes, reglas = out["clases"], out["ids"], out["genes"], out["reglas"]
    for mid in ids:  # la clase del id manda si el patrón de clase no la vio
        cl = MEC[mid]["clase"]
        if cl in CLASES_REALES and cl not in clases:
            clases.append(cl)
            bases.append("observado")
    if not clases:
        if e.get("resultado_tipo") in NO_APLICA_TIPOS or e.get("linea") == "seguridad" or e.get("resultado") in NO_APLICA_RES:
            clases, reglas = ["no_aplica"], reglas + ["NA:tipo_resultado"]
        else:
            clases, reglas = ["desconocido"], reglas + ["D:sin_patron"]
    if "base" in out and isinstance(out["base"], str) and any(x["campo"] == "base" for x in EXC.get(e["id"], [])):
        base = out["base"]
    elif clases[0] in ("no_aplica", "desconocido"):
        base = "sin_dato"
    elif str(e.get("nivel", "")).startswith("GEN"):
        base = "prediccion_genomica"
    elif e.get("mecanismo_causal") is True:
        base = "causal"
    else:
        base = min(bases or ["observado"], key=BASE_ORDEN.index)
    # determinante: ¿se sabe CON QUÉ (molécula o gen bacteriano)?
    if clases == ["no_aplica"]:
        det = "no_aplica"
    elif clases == ["desconocido"]:
        det = "desconocido"
    elif genes or any(not MOLECULA_DESCONOCIDA.search(MEC[i]["molecula_o_componente"] or "desconocido") for i in ids):
        det = "identificado"
    else:
        det = "desconocido"
    subclases = sorted({MEC[i]["subclase"] for i in ids if MEC[i].get("subclase")})
    if "bacteriocina" in clases and not subclases:
        subclases = ["sin_clasificar"]
    forma, d = e.get("forma"), e.get("direccion")
    if clases == ["no_aplica"]:
        rv, bv = "no_aplica", "sin_dato"
    elif forma in ("inactivado", "componente", "metabolito") and d == "+":
        rv, bv = "no", "observado"
    elif any(MEC[i]["requiere_viabilidad"] == "si" for i in ids):
        rv, bv = "si", "inferencia"
    else:
        rv, bv = "desconocido", "sin_dato"
    be = {b["id"]: b["etiqueta"] for b in BASES}
    de = {x["id"]: x["etiqueta"] for x in DETERMINANTES}
    lectura = None if base == "sin_dato" else f"{be[base]} · {de[det]}"
    return {"clases": clases, "subclases": subclases, "requiere_viabilidad": rv, "genes": genes, "ids": ids,
            "base": base, "determinante": det, "lectura": lectura, "base_viabilidad": bv, "reglas": reglas}


# ---------------------------------------------------------------- 3. matriz
def estado_de(E, linea):
    if not E:
        return "desconocido"
    if linea == "seguridad":  # en seguridad «-» es una señal de riesgo, no un resultado en contra
        return "senal_de_riesgo" if any(e["direccion"] == "-" for e in E) else "sin_senal_de_riesgo"
    if any(e["nivel"] in ("MA", "ECA") and e["direccion"] in NULO for e in E):
        return "via_cerrada_o_replantear"
    fav = [e for e in E if e["direccion"] in A_FAVOR]
    if not fav:
        return "sin_resultado_a_favor"
    if any(e["nivel"] in HUMANO for e in fav):
        return "con_evidencia"
    if any(e["direccion"] == "+" and e["mecanismo"]["base"] in ("causal", "observado")
           and set(e["mecanismo"]["clases"]) & set(CLASES_REALES) for e in fav):
        return "linea_de_ataque"
    return "preclinica_sin_mecanismo"


def funciona_inactivada(E):
    """«¿Funciona muerta?» con los 5 valores de E8, solo desde forma + dirección. «No probada» ≠ «no funciona».
    Forma null (no declarada en la fuente) no alimenta ningún valor: cuenta como no probada."""
    fav = [e for e in E if e["direccion"] in A_FAVOR]
    inact = [e for e in fav if e.get("forma") in MUERTA]
    if inact:
        met = sorted({e["inactivacion_metodo"] for e in inact if e.get("inactivacion_metodo")})
        best = min(inact, key=lambda e: (nivel_num(e["nivel"]), e["id"]))
        return {"k": "si", "texto": "Sí, célula inactivada" + (f" ({', '.join(met)})" if met else ""),
                "nivel": best["nivel"], "evidencias": sorted(e["id"] for e in inact)}
    frac = [e for e in fav if e.get("forma") in FRACCION]
    if frac:
        best = min(frac, key=lambda e: (nivel_num(e["nivel"]), e["id"]))
        return {"k": "frac", "texto": "Sí, con " + " y ".join(sorted({FORMA_ETQ[e["forma"]] for e in frac})) + " (no célula entera)",
                "nivel": best["nivel"], "evidencias": sorted(e["id"] for e in frac)}
    muertas = [e for e in E if e.get("forma") in MUERTA + FRACCION]
    if muertas:
        return {"k": "nulo", "texto": "Probada inactivada: sin efecto", "nivel": None, "evidencias": sorted(e["id"] for e in muertas)}
    if any(e.get("forma") == "fermentado" for e in fav):
        return {"k": "ferm", "texto": "Solo fermentado (viabilidad no declarada)", "nivel": None, "evidencias": []}
    exige = any(e["mecanismo"]["requiere_viabilidad"] == "si" for e in fav)
    return {"k": "np", "texto": "No probada" + (" · su mecanismo exige célula viva (inferencia)" if exige else ""),
            "nivel": None, "evidencias": []}


def resumen_mecanismo(E):
    fav = [e for e in E if e["direccion"] == "+" and set(e["mecanismo"]["clases"]) & set(CLASES_REALES)]
    if not fav:
        return None
    rv = [e["mecanismo"]["requiere_viabilidad"] for e in E if e["direccion"] == "+"]
    return {"clases": sorted({c for e in fav for c in e["mecanismo"]["clases"] if c in CLASES_REALES}),
            "subclases": sorted({s for e in fav for s in e["mecanismo"]["subclases"]}),
            "ids": sorted({i for e in fav for i in e["mecanismo"]["ids"]}),
            "genes": sorted({g for e in fav for g in e["mecanismo"]["genes"]}),
            "mejor_base": min((e["mecanismo"]["base"] for e in fav), key=BASE_ORDEN.index),
            "determinante": "identificado" if any(e["mecanismo"]["determinante"] == "identificado" for e in fav) else "desconocido",
            "origen": "evidencia",
            "requiere_viabilidad": "no" if "no" in rv else ("si" if rv and all(v == "si" for v in rv) else "desconocido"),
            "evidencias": sorted(e["id"] for e in fav)}


def celda(E_todas, linea, ataque_ids, clase_de, producto):
    """Celda especie × resultado. Cuentan (dirección, nivel, estado, formas, ¿funciona muerta?, mecanismo) solo las
    evidencias que son efecto del sujeto: ni asociaciones (van a `asociaciones`) ni mezclas de cepas (van a `en_mezcla`).
    n = evidencias del sujeto en la celda (efecto + asociación; una mezcla no es del sujeto); n_efecto = las que suman
    dirección. Una celda solo con asociaciones lleva estado solo_asociacion y su nivel de diseño (OBS), nunca un cero."""
    E = [e for e in E_todas if cuenta_direccion(e) and en_solitario(e)]
    A = [e for e in E_todas if not cuenta_direccion(e)]
    asoc = sorted(e["id"] for e in A)
    mez = sorted(e["id"] for e in E_todas if cuenta_direccion(e) and not en_solitario(e))
    fav = [e for e in E if e["direccion"] in A_FAVOR]
    mn = min((nivel_num(e["nivel"]) for e in fav), default=99)
    mejor = next((e["nivel"] for e in fav if nivel_num(e["nivel"]) == mn), None)
    cepas = sorted({e["cepa"] for e in fav if e.get("cepa")})
    nivel_de = "efecto" if mejor else None
    if E:
        est = estado_de(E, linea)
    elif A:
        # seguridad: una serie de casos asociada es señal de riesgo (criterio propio, rotulado); no suma dirección
        est = "senal_de_riesgo" if linea == "seguridad" and any(e["direccion"] == "-" for e in A) else "solo_asociacion"
    else:
        est = "solo_mezcla"
    if not E:  # sin efecto propio: el nivel mostrado es el del diseño de lo que hay (asociación o mezcla), rotulado
        resto = A or [e for e in E_todas if not en_solitario(e)]
        mn = min(nivel_num(e["nivel"]) for e in resto)
        mejor = next(e["nivel"] for e in resto if nivel_num(e["nivel"]) == mn)
        nivel_de = "asociacion" if A else "mezcla"
    if linea == "seguridad":
        # en seguridad el eje es el riesgo: el nivel que se muestra es el de la señal («-», incluida una serie de casos
        # asociada) y, sin señal, el mejor nivel de lo registrado. Sin él la celda quedaba sin nivel en 14 de 19 casos.
        pool = E + A
        riesgo = [e for e in pool if e["direccion"] == "-"]
        ref = riesgo or pool
        if ref:
            mn = min(nivel_num(e["nivel"]) for e in ref)
            mejor = next(e["nivel"] for e in sorted(ref, key=lambda e: e["id"]) if nivel_num(e["nivel"]) == mn)
            nivel_de = "senal_de_riesgo" if riesgo else "registro_sin_senal"
    por_forma = {f: estado_de([e for e in E if FORMA_PRODUCTO.get(e.get("forma")) == f], linea) for f in FORMAS}
    senal_asoc = bool(not E and A and est == "senal_de_riesgo")
    if senal_asoc:  # la misma salvedad, forma a forma: la señal está en la forma de los casos asociados, no en las tres
        por_forma = {f: estado_de([e for e in A if FORMA_PRODUCTO.get(e.get("forma")) == f], linea) for f in FORMAS}
    mec = resumen_mecanismo(E)
    if est == "preclinica_sin_mecanismo" and ataque_ids:
        est = "linea_de_ataque"  # mecanismo propuesto por una fila de ataque con evidencia de OTRO resultado: inferencia
        if mec is None:
            mec = {"clases": sorted({clase_de[i] for i in ataque_ids}), "subclases": [], "ids": sorted(ataque_ids), "genes": [],
                   "mejor_base": "inferencia", "determinante": "desconocido", "origen": "ataque",
                   "requiere_viabilidad": "desconocido", "evidencias": []}
        else:
            mec["origen"] = "evidencia+ataque"
    out = {"mejor_nivel": mejor, "mejor_nivel_num": mn, "mejor_nivel_de": nivel_de, "n": len(E) + len(A), "n_efecto": len(E),
           "direcciones": dict(sorted(Counter(e["direccion"] for e in E).items())),
           "n_cepas_a_favor": len(cepas), "estado": est, "estado_por_forma": por_forma,
           "formas_ensayadas": sorted({e["forma"] for e in E if e.get("forma")}),
           "n_forma_no_declarada": sum(1 for e in E if not e.get("forma")),
           "funciona_inactivada": funciona_inactivada(E),
           "tiene_mecanismo": mec is not None, "mecanismo": mec, "ataque_mecanismo_ids": ataque_ids or [],
           "evidencias": [e["id"] for e in E_todas]}
    if senal_asoc:
        out["senal_por_asociacion"] = True  # criterio propio (seguridad): series de casos sin efecto propio
    if asoc:
        out["asociaciones"] = asoc  # en la celda, pero sin dirección: observación, no efecto
    if mez:
        out["en_mezcla"] = mez  # mezcla de cepas: no cuenta para ningún sujeto (ni dirección, ni nivel, ni n)
    return out


# ---------------------------------------------------------------- 5. veredictos
def puerta_seguridad(esp):
    """sin_bloqueo / a_revisar / bloqueo / no_medido, con la regla de E6. «sin_bloqueo» = nada registrado, no «medido y limpio»."""
    seg = esp.get("seguridad")
    if not seg:
        return "no_medido", ["la especie no tiene ficha de seguridad"]
    if seg.get("bloqueo") == "si":
        return "bloqueo", ["bloqueo marcado en la curación"]
    q = ((esp.get("regulatorio") or {}).get("qps") or {}).get("estado") or ""
    mot = []
    if seg.get("bloqueo") == "a_revisar":
        mot.append(seg.get("motivo") or "marcada a revisar en la curación")
    if q == "no_seguridad" and not seg.get("motivo"):
        mot.append("EFSA no la recomienda para QPS por seguridad")
    if q == "excluida" and not seg.get("motivo"):
        mot.append("excluida de la evaluación QPS")
    if seg.get("virulencia"):
        mot.append(f"{len(seg['virulencia'])} señal(es) de virulencia registradas")
    return ("a_revisar" if mot else "sin_bloqueo"), mot


def veredicto_v12(subj, tipo, linea, forma, E_all, E_f, esp, MEC, nombre_cepa):
    seg, _ = puerta_seguridad(esp)
    rpf = ((esp.get("regulatorio") or {}).get("ruta_por_forma") or {}).get(forma) or {}
    reg = rpf.get("estado") or "desconocida"
    tec = ((esp.get("tecnologia") or {}).get("aptitud_por_forma") or {}).get(forma) or "desconocida"
    af, ec, lf, sub = [], [], [], []
    fav = [e for e in E_f if e["direccion"] == "+" and en_solitario(e)]
    mezcla = sorted(e["id"] for e in E_f if e["direccion"] == "+" and not en_solitario(e))
    for e in sorted(fav, key=lambda e: (nivel_num(e["nivel"]), e["id"])):
        af.append({"codigo": "AF1", "fuentes": [e["id"]]})
    for e in sorted(E_all, key=lambda e: e["id"]):
        if e not in E_f and e["direccion"] == "+" and en_solitario(e):
            af.append({"codigo": "AF1", "otra_forma": e.get("forma"), "fuentes": [e["id"]]})
    for mid in sorted({i for e in fav for i in e["mecanismo"]["ids"]}):
        af.append({"codigo": "AF2", "mecanismo": mid, "fuentes": [e["id"] for e in fav if mid in e["mecanismo"]["ids"]]})
    nulos = [e for e in E_f if e["nivel"] in ("MA", "ECA") and e["direccion"] in NULO]
    for e in nulos:
        ec.append({"codigo": "EC1", "fuentes": [e["id"]]})
    cepas = sorted({e["cepa"] for e in fav if e.get("cepa")})
    una_cepa = tipo != "cepa" and len(cepas) == 1 and fav and all(e.get("cepa") for e in fav)
    if una_cepa:
        ec.append({"codigo": "EC2", "fuentes": [e["id"] for e in fav]})
        sub.append(f"una sola cepa ({nombre_cepa(cepas[0])})")
        lf.append({"codigo": "LF5", "fuentes": []})
    if reg != "abierta":
        ec.append({"codigo": "EC6", "ruta": reg, "fuentes": rpf.get("fuentes") or []})
        if reg == "condicionada":
            sub.append("ruta condicionada")
    mn = min((nivel_num(e["nivel"]) for e in fav), default=99)
    if not any(e["nivel"] in ("MA", "ECA") and e["direccion"] == "+" and e.get("objetivo_primario") for e in fav):
        lf.append({"codigo": "LF1", "fuentes": []})
    if forma == "vivo" and not any(FORMA_PRODUCTO.get(e.get("forma")) == "posbiotico" and e["direccion"] == "+" for e in E_all):
        lf.append({"codigo": "LF3", "fuentes": []})
    if any(e["mecanismo"]["determinante"] == "desconocido" for e in fav if set(e["mecanismo"]["clases"]) & set(CLASES_REALES)) \
            or not any(set(e["mecanismo"]["clases"]) & set(CLASES_REALES) for e in fav):
        lf.append({"codigo": "LF6", "fuentes": []})
    if mn <= 2 and not any(e["nivel"] in ("MA", "ECA") and e.get("objetivo_primario") for e in fav):
        sub.append("solo ensayos piloto o sin objetivo primario confirmado")  # como v1.1 (R2b)
    lim = [e["id"] for e in fav if e.get("limite_declarado")]
    if lim:
        sub.append(f"límite declarado en {len(lim)} de {len(fav)} evidencias")
    if reg == "cerrada" or seg == "bloqueo":
        v, regla, sub = "desaconsejada", "V12-R0", ["por seguridad o regulación"]
    elif nulos and not any(e["nivel"] in ("MA", "ECA") for e in fav):
        v, regla, sub = "desaconsejada", "V12-R1", ["por evidencia en contra"]
    elif mn <= 2:
        if tec == "desconocida":
            v, regla, sub = "especulativa", "V12-R2c", sub + ["forma no viable hoy"]
        elif not sub and not nulos:
            v, regla = "solida", "V12-R2"
        else:
            v, regla = "prometedora", "V12-R2b"
            if nulos:
                sub.append("nulo que empata")
    elif mn == 3:
        v, regla = "prometedora", "V12-R3o"
        sub.append("solo observacional sin grupo control" if any("sin grupo control" in (e.get("condicion") or "") + (e.get("efecto_texto") or "") for e in fav) else "solo observacional")
    elif mn == 4:
        v, regla = "prometedora", "V12-R3"
        sub.append("solo animal")
    elif mn < 99:
        v, regla = "especulativa", "V12-R4"
    else:
        v, regla = "especulativa", "V12-R4n"
        sub.append("sin resultado a favor en esta forma")
    out = {"objetivo": subj, "tipo_objetivo": tipo, "linea": linea, "forma": forma, "veredicto": v,
           "subtitulo": " · ".join(sub) or None, "regla_aplicada": regla,
           "a_favor": af, "en_contra": ec, "lo_que_falta": lf,
           "puertas": {"seguridad": seg, "regulatorio": reg, "tecnologia": tec},
           "ruta_regulatoria": rpf.get("texto"), "asterisco": bool(sub), "ataque": False,
           "autor": "automatico_v1.2", "_una_cepa": cepas[0] if una_cepa else None}
    if mezcla:
        out["en_mezcla"] = mezcla  # a favor, pero en mezcla de cepas: no es logro de esta cepa ni cuenta en C1
    return out


def tipo_de(obj):
    return "cepa" if ".st-" in obj else ("subgrupo" if ".sg-" in obj else "especie")


def aplicar_c1(v, E, nombre_cepa, producto):
    """V12-C1: un veredicto de especie o subgrupo no pasa de especulativa si toda su evidencia a favor EN ESA FORMA
    es de una sola cepa declarada. La mezcla no cuenta para ninguna cepa; la asociación no es efecto. Devuelve la cepa."""
    if tipo_de(v["objetivo"]) == "cepa" or v["veredicto"] not in ("solida", "prometedora"):
        return None
    obj = v["objetivo"]
    fav = [e for e in E if e["linea"] == v["linea"] and FORMA_PRODUCTO.get(e.get("forma")) == v["forma"] and e["direccion"] == "+"
           and (e["especie"] == obj or e.get("subgrupo") == obj) and en_solitario(e) and cuenta_direccion(e, producto)]
    cepas = {e.get("cepa") for e in fav}
    if not fav or None in cepas or len(cepas) != 1:
        return None
    cepa = next(iter(cepas))
    v["veredicto_v11"] = v["veredicto"]
    v["veredicto"] = "especulativa"
    v["regla_aplicada"] = (v.get("regla_aplicada") or "") + "·C1"
    etq = f"una sola cepa ({nombre_cepa(cepa)})"
    sub = [s for s in (v.get("subtitulo") or "").split(" · ") if s and s != "una sola cepa"]
    v["subtitulo"] = " · ".join([etq] + sub)
    v["asterisco"] = True
    if not any(r.get("codigo") == "EC2" for r in v.get("en_contra", [])):
        v.setdefault("en_contra", []).append({"codigo": "EC2", "fuentes": sorted(e["id"] for e in fav)})
    if not any(r.get("codigo") == "LF5" for r in v.get("lo_que_falta", [])):
        v.setdefault("lo_que_falta", []).append({"codigo": "LF5", "fuentes": []})
    v["c1"] = {"cepa": cepa, "fuentes": sorted(e["id"] for e in fav)}
    return cepa


# ---------------------------------------------------------------- 2b. cobertura por resultado
def cobertura_catalogo(cat, E, colas, traza):
    con_ev = Counter((e["linea"], e["resultado"]) for e in E.values() if e.get("linea") and e.get("resultado"))
    idx = defaultdict(list)
    for l in cat["lineas"]:
        for r in l.get("resultados", []):
            r.pop("cola_curacion", None)
            idx[r["id"]].append((l["id"], r))
    for lote, cola in colas:
        nota = cola.get("nota")
        for k in sorted(cola):
            v = cola[k]
            if k == "nota" or not isinstance(v, dict):
                continue
            if k not in idx:  # p. ej. mastitis animal: el resultado no existe en el catálogo; no se mapea a mano ni se declara hueco
                traza.append(("cola_huerfana", k, f"{lote}: la clave no es un id de resultado del catálogo"))
                continue
            for lin, r in idx[k]:
                if con_ev[(lin, k)]:
                    traza.append(("cola_omitida", f"{lin}|{k}", f"{lote}: el resultado ya tiene evidencia curada"))
                    continue
                r["cola_curacion"] = {"consulta": v.get("consulta"), "n_resultados": v.get("n_resultados"),
                                      "pmids": list(v.get("pmids") or []), "lote": lote, "nota": nota, "estado": "no_verificada"}
                traza.append(("cola", f"{lin}|{k}", f"{lote}: {len(v.get('pmids') or [])} PMID"))
    for l in cat["lineas"]:
        for r in l.get("resultados", []):
            n = con_ev[(l["id"], r["id"])]
            r["n_evidencias"] = n
            r["cobertura"] = "con_evidencia" if n else ("sin_curar" if r.get("cola_curacion") else "sin_curar_sin_cola")
    cat["cobertura_valores"] = [{"id": "con_evidencia", "etiqueta": "con evidencia curada"},
                                {"id": "sin_curar", "etiqueta": "sin evidencia curada · PMID localizados en cola, sin verificar"},
                                {"id": "sin_curar_sin_cola", "etiqueta": "sin evidencia curada (hueco de curación, no ausencia demostrada)"}]


# ---------------------------------------------------------------- 6b. «qué hace bien» de cada cepa (derivado)
def que_hace_bien_cepas(cep, E, producto, nombre_cepa):
    """Por cepa: lo que la cepa consigue EN SOLITARIO (dirección +, alcance cepa, sin asociación) y, aparte, lo demostrado
    en mezcla con otras cepas, con su etiqueta. Agrupado por (línea, resultado). No redacta afirmaciones nuevas."""
    por = defaultdict(lambda: defaultdict(lambda: {"logros": [], "en_mezcla": []}))
    for e in sorted(E.values(), key=lambda e: e["id"]):
        c = e.get("cepa")
        if not c or c not in cep or e["direccion"] != "+" or not e.get("linea") or not cuenta_direccion(e, producto):
            continue
        g = por[c][(e["linea"], e["resultado"])]
        if en_solitario(e):
            g["logros"].append(e["id"])
        else:
            g["en_mezcla"].append({"evidencia": e["id"], "etiqueta": e.get("etiqueta_mezcla") or "en mezcla con otras cepas"})
    for c, grupos in por.items():
        filas = []
        for (l, r), g in sorted(grupos.items()):
            ids = g["logros"]
            mn = min((nivel_num(E[i]["nivel"]) for i in ids), default=99)
            filas.append({"linea": l, "resultado": r, "evidencias": ids, "mejor_nivel": next((E[i]["nivel"] for i in ids if nivel_num(E[i]["nivel"]) == mn), None),
                          "formas": sorted({E[i]["forma"] for i in ids if E[i].get("forma")}), "en_mezcla": g["en_mezcla"],
                          "logro_de_la_cepa": bool(ids)})
        cep[c]["que_hace_bien"] = filas


def que_hace_bien_especies(esp, E, nombre_cepa):
    """«Qué hace bien» de la especie: la afirmación es de v1.1 (no se redacta), pero nivel, cepas, nulos y soporte_texto se
    recalculan SOLO desde sus evidence_ids y las de esas mismas cepas en el mismo resultado (antes se heredaban del texto
    v1.1 con slugs crudos, «1 cepa: cect-5713», y con nulos de otra cepa). Cepa ≠ especie: un nulo de una cepa no se
    atribuye a otra; una mezcla no sostiene a ninguna cepa; una asociación no suma dirección."""
    por_res = defaultdict(list)
    for e in E.values():
        if e.get("linea") and e.get("resultado") and cuenta_direccion(e) and en_solitario(e):
            por_res[(e["especie"], e["linea"], e["resultado"])].append(e)
    for slug, s in esp.items():
        for qb in s.get("que_hace_bien") or []:
            evs = [E[i] for i in qb.get("evidence_ids", []) if i in E and cuenta_direccion(E[i]) and en_solitario(E[i])]
            if not evs:
                continue
            fav = [e for e in evs if e["direccion"] == "+"] or [e for e in evs if e["direccion"] in A_FAVOR]
            ref = fav or evs
            mn = min(nivel_num(e["nivel"]) for e in ref)
            qb["nivel"] = next(e["nivel"] for e in sorted(ref, key=lambda e: e["id"]) if nivel_num(e["nivel"]) == mn)
            cepas = sorted({e["cepa"] for e in fav if e.get("cepa")})
            de_esp = [e for e in fav if not e.get("cepa")]
            mismo = por_res.get((slug, qb.get("linea"), qb.get("resultado")), [])
            # nulos y en contra de la MISMA unidad: de esas cepas, o de la especie sin cepa si la afirmación es de especie
            unidad = (lambda e: e.get("cepa") in cepas) if cepas and not de_esp else (lambda e: not e.get("cepa") or e.get("cepa") in cepas)
            nul = [e for e in mismo if e["direccion"] in NULO and unidad(e)]
            n_fav = len([e for e in mismo if e["direccion"] == "+" and unidad(e)])
            nombres = ", ".join(nombre_cepa(c) for c in cepas)
            ecaf = [e for e in fav if e["nivel"] in ("MA", "ECA")]
            if de_esp and cepas:
                txt = f"nivel especie + {len(cepas)} cepa{'s' if len(cepas) != 1 else ''} ({nombres})"
            elif de_esp:
                txt = "nivel especie"
            elif len(ecaf) >= 2 and len(cepas) == 1:
                txt = f"{len(ecaf)} ECA/MA, todos de {nombres}"
            else:
                txt = f"{len(cepas)} cepa{'s' if len(cepas) != 1 else ''}: {nombres}"
            if nul:
                txt += f" · {n_fav} a favor, {len(nul)} {'nulo o en contra' if len(nul) == 1 else 'nulos o en contra'}"
            qb["soporte_texto"] = txt
            qb["cepas_que_sostienen"] = cepas
            qb["nulos"] = len(nul)
            qb["alcance_mostrado"] = "cepa" if len(cepas) == 1 and not de_esp else "especie"


# ---------------------------------------------------------------- generador
def main_generar(a):
    DI, DO = Path(a.entrada), Path(a.salida)
    if DI.resolve() == DO.resolve():
        sys.exit("La entrada v1.1 es intocable: --salida tiene que ser otro directorio")
    DO.mkdir(parents=True, exist_ok=True)
    for p in sorted(DI.glob("*.json")):
        if p.name in ("busqueda.json", "perfil_cepa.json"):  # retirados en v2: el índice se deriva al arrancar
            continue
        shutil.copyfile(p, DO / p.name)
    K = ("meta", "catalogo", "especies", "evidencias", "ataques", "veredictos", "cepas", "refs", "subgrupos")
    meta, cat, esp, ev, ata, ver, cep, refs, subg = (cargar(DI, k) for k in K)
    ev11 = set(k for k, e in ev.items() if e.get("tipo") == "evidencia")
    traza = []
    producto = {l["id"] for l in cat["lineas"] if l.get("tipo") == "producto"}

    # 0. curación de evidencias
    lotes, sustituidos, colas = ingerir_lotes(ev, cep, refs, traza)
    alias = partir(ev, traza)
    ajustar(ev, traza)
    # ortografía curada de los textos heredados de v1.1 (solo tildes/eñes/diéresis; curado/ajustes_tildes.tsv)
    web = cargar(DI, "web") if (DI / "web.json").exists() else {}
    for k, o in (("evidencias", ev), ("ataques", ata), ("especies", esp), ("cepas", cep), ("catalogo", cat),
                 ("veredictos", ver), ("subgrupos", subg), ("meta", meta)):
        ajustes_tildes.aplicar(k, o, traza)
    if ajustes_tildes.aplicar("web", web, traza):  # web.json no lo reescribe nadie más: se guarda solo si cambia
        guardar(DO, "web", web)
    normalizar_direccion(ev, traza)
    asignar_relacion(ev, traza)
    esp, cep, refs, ver, ata, subg = (expandir_ids(x, alias) for x in (esp, cep, refs, ver, ata, subg))
    nuevas = {k for k, e in ev.items() if e.get("tipo") == "evidencia" and k not in ev11 and not e.get("particion_de")}

    CL, GEN = tsv("clases_mecanismo.tsv"), tsv("genes_bacterianos.tsv")
    RET = {r["id"]: r for r in tsv("mecanismos_retirados.tsv")}
    EXC = defaultdict(list)
    for r in tsv("excepciones_evidencia.tsv"):
        EXC[r["evidencia"]].append(r)
    viejos = {m["id"]: m for m in cat["mecanismos"]}
    MEC = {}
    for r in tsv("mecanismos_v12.tsv"):
        v = viejos.get(r["id"], {})
        rv11 = v.get("requiere_viabilidad") if v else None
        MEC[r["id"]] = {**r, "requiere_viabilidad": rv11 or "desconocido", "requiere_viabilidad_v11": rv11,
                        "clase_v11": v.get("clase") if v else None}

    meta.setdefault("plantillas_razones", {})["LF6"] = "Identificar la molécula o el gen responsable: se sabe qué hace, no con qué"
    # 1. evidencias
    E = {k: e for k, e in ev.items() if e.get("tipo") == "evidencia"}
    for k, e in E.items():
        if e.get("mecanismos"):
            e["mecanismos"] = [i for i in e["mecanismos"] if i not in RET] or None
        e["mecanismo"] = mecanismo_de(e, CL, GEN, MEC, EXC)
    ev = {k: ev[k] for k in sorted(ev)}

    # 2. catálogo
    cand, desc, sin_eval = defaultdict(list), defaultdict(list), defaultdict(list)
    for r in tsv("candidatos_mecanismo.tsv"):
        cand[r["mecanismo"]].append({k: r[k].replace("\\,", ",") for k in ("candidato", "base", "dato", "fuente", "lo_refutaria")})
    for r in tsv("descartes_mecanismo.tsv"):
        d = {"clase": r["clase_descartada"], "veredicto": r["veredicto"], "base": r["base"].strip() or None,
             "fuentes": [x for x in r["fuentes"].strip().split(",") if x], "motivo": r["motivo"]}
        if d["veredicto"] == "descartada":
            if d["base"] not in ("observado", "inferencia") or not d["fuentes"]:
                sys.exit(f"descartes_mecanismo.tsv: {r['mecanismo']}/{d['clase']} descartada sin base observado/inferencia o sin fuente")
            desc[r["mecanismo"]].append(d)
        else:  # ni se descarta ni se apoya: no es una descartada (no se cuenta como tal)
            sin_eval[r["mecanismo"]].append({k: d[k] for k in ("clase", "fuentes", "motivo")})
    nuevos = []
    for mid, r in MEC.items():
        fav = [e for e in E.values() if mid in e["mecanismo"]["ids"] and e["direccion"] == "+"]
        todos = [e for e in E.values() if mid in e["mecanismo"]["ids"]]
        if any(e["mecanismo"]["requiere_viabilidad"] == "no" for e in fav):
            rv, bv = "no", "observado"
        elif r["requiere_viabilidad_v11"]:
            rv, bv = r["requiere_viabilidad_v11"], "catalogo_v1.1"
        else:
            rv, bv = "desconocido", "sin_dato"
        m = {"id": mid, "nombre": r["nombre"], "clase": r["clase"], "subclase": r.get("subclase") or None, "clase_v11": r["clase_v11"],
             "molecula_o_componente": r["molecula_o_componente"], "genes": [g for g in r["genes"].split(",") if g],
             "determinante": "desconocido" if MOLECULA_DESCONOCIDA.search(r["molecula_o_componente"] or "desconocido") else "identificado",
             "requiere_viabilidad": rv, "base_viabilidad": bv, "requiere_viabilidad_v11": r["requiere_viabilidad_v11"],
             "lineas": sorted({e["linea"] for e in todos} | set(viejos.get(mid, {}).get("lineas", []))),
             "especies": sorted({e["especie"] for e in todos}), "cepas": sorted({e["cepa"] for e in todos if e.get("cepa")}),
             "fuentes": sorted(e["id"] for e in fav), "fuentes_en_contra": sorted(e["id"] for e in todos if e["direccion"] != "+"),
             "nota": r["nota"] or None, "candidatos": cand.get(mid) or None, "descartadas": desc.get(mid) or None,
             "sin_evaluar": sin_eval.get(mid) or None,
             "contexto": [x.strip() for x in (r.get("contexto") or "").split(",") if x.strip()] or None,
             "lo_refutaria": " / ".join(c["lo_refutaria"] for c in cand.get(mid, []) if c["lo_refutaria"]) or None}
        nuevos.append(m)
    cat["mecanismos"] = nuevos
    cat["mecanismos_retirados"] = [{"id": i, "nombre_v11": r["nombre_v11"], "motivo": r["motivo"], "sustituto": r["sustituto"]}
                                   for i, r in RET.items()]
    cat["clases_mecanismo"] = [{"id": c["clase"], "familia": c["familia"], "etiqueta": c["etiqueta"], "que_incluye": c["que_incluye"]} for c in CL]
    cat["bases_mecanismo"] = BASES
    cat["determinantes_mecanismo"] = DETERMINANTES
    cat["relacion_valores"] = RELACION_VALORES
    cat["direccion_valores"] = DIRECCION_VALORES
    cat["estado_celda_valores"] = ESTADO_CELDA_VALORES
    cat["funciona_inactivada_valores"] = [{"k": "si", "etiqueta": "Sí, célula inactivada"}, {"k": "frac", "etiqueta": "Sí, con fracción o metabolito"},
                                         {"k": "nulo", "etiqueta": "Probada inactivada: sin efecto"},
                                         {"k": "ferm", "etiqueta": "Solo fermentado (viabilidad no declarada)"},
                                         {"k": "np", "etiqueta": "No probada (≠ no funciona)"}]
    cobertura_catalogo(cat, E, colas, traza)
    MEC_IDS = {m["id"] for m in nuevos}
    clase_de = {m["id"]: m["clase"] for m in nuevos}

    # 4a. mecanismo de cada ataque (antes de la matriz, que lo cita)
    ata[:] = [x for x in ata if x.get("autor") != "automatico_v1.2"]
    # ajustes de redacción curados (curado/ajustes_ataques.tsv): solo si el texto de v1.1 coincide; si no, FAIL
    for r in tsv("ajustes_ataques.tsv"):
        fila = [x for x in ata if (x["especie"], x["linea"], x["resultado"]) == (r["especie"], r["linea"], r["resultado"])]
        if len(fila) != 1 or fila[0].get(r["campo"]) != r["valor_v11"]:
            sys.exit(f"FAIL ajustes_ataques.tsv: {r['especie']}|{r['linea']}|{r['resultado']}.{r['campo']} no coincide con v1.1")
        fila[0][r["campo"]] = r["valor_nuevo"]
        fila[0].setdefault("ajustes_v12", []).append({"campo": r["campo"], "valor_v11": r["valor_v11"], "autor": r["autor"],
                                                      "justificacion": r["justificacion"]})
    for x in ata:
        fu = [E[i] for i in x.get("fuentes_mecanismo", []) if i in E]
        fav = [e for e in fu if e["direccion"] == "+"]
        x["mecanismo_ids"] = sorted({i for e in fav for i in e["mecanismo"]["ids"]})
        x["mecanismo_clases"] = sorted({c for e in fav for c in e["mecanismo"]["clases"] if c in CLASES_REALES}) or ["desconocido"]
        x["fuentes_no_evidencia"] = [i for i in x.get("fuentes_mecanismo", []) if i not in E] or None
        texto = x.get("mecanismo_texto") or ""
        en_texto = sorted(mid for mid, r in MEC.items() if r["patron_claim"] and re.search(r["patron_claim"], texto, re.I)
                          and (not r["especies"] or x["especie"] in r["especies"].split(",")))
        x["mecanismo_ids_sin_fuente"] = sorted(set(en_texto) - set(x["mecanismo_ids"])) or None
    atk_idx = defaultdict(list)
    for x in ata:
        atk_idx[(x["especie"], x["linea"], x["resultado"])] += x["mecanismo_ids"]

    # 3. matriz y celdas
    por_celda = defaultdict(list)
    for e in E.values():
        if e.get("linea") and e.get("resultado"):
            por_celda[(e["linea"], e["especie"], e["resultado"])].append(e)
    mat = {}
    for (l, s, r), lista in sorted(por_celda.items()):
        lista.sort(key=lambda e: e["id"])
        mat.setdefault(l, {})[f"{s}|{r}"] = celda(lista, l, sorted(set(atk_idx.get((s, l, r), []))), clase_de, producto)
    celdas = celdas_v11.celdas(list(E.values()), producto,
                               nombre=lambda cid: (cep.get(cid) or {}).get("nombre_corto") or celdas_v11.corto(cid))

    # 4c. fila automática para cada celda de línea de producto con mecanismo observado/causal y sin fila
    plt = meta.get("plantillas_razones", {})
    tiene_fila = {(x["especie"], x["linea"], x["resultado"]) for x in ata}
    nombre_m = {m["id"]: m for m in nuevos}
    etiqueta = {c["clase"]: c["etiqueta"] for c in CL}
    for l in [l["id"] for l in cat["lineas"] if l.get("tipo") == "producto"]:
        for k, c in sorted(mat.get(l, {}).items()):
            s_, r_ = k.split("|")
            m = c["mecanismo"]
            if (s_, l, r_) in tiene_fila or not m or m["origen"] != "evidencia" or c["estado"] == "via_cerrada_o_replantear" \
                    or m["mejor_base"] not in ("causal", "observado"):
                continue
            falta = []
            if c["funciona_inactivada"]["k"] not in ("si", "frac"):
                falta.append(plt.get("LF3"))
            if c["n_cepas_a_favor"] <= 1:
                falta.append(plt.get("LF5"))
            if c["mejor_nivel"] not in ("MA", "ECA"):
                falta.append(plt.get("LF1"))
            if m["determinante"] == "desconocido":
                falta.append(plt.get("LF6"))
            ata.append({"especie": s_, "linea": l, "resultado": r_, "autor": "automatico_v1.2", "mejor_nivel": c["mejor_nivel"],
                        "mecanismo_texto": "; ".join([nombre_m[i]["nombre"] for i in m["ids"]] or
                                                      [" / ".join(etiqueta[x] for x in m["clases"]) + " (determinante no identificado)"]),
                        "fuentes_mecanismo": m["evidencias"], "mecanismo_ids": m["ids"], "mecanismo_clases": m["clases"],
                        "que_falta": " · ".join(filter(None, falta)) or None, "ruta_regulatoria": None, "destacada": False})
    # 4b. estado por forma, ¿funciona muerta?, requiere_viabilidad y mecanismo_id de cada ataque = los de su celda
    for x in ata:
        c = mat.get(x["linea"], {}).get(f'{x["especie"]}|{x["resultado"]}')
        x["estado_por_forma"] = c["estado_por_forma"] if c else {f: "desconocido" for f in FORMAS}
        x["funciona_inactivada"] = c["funciona_inactivada"] if c else {"k": "np", "texto": "No probada", "nivel": None, "evidencias": []}
        x["requiere_viabilidad"] = (c["mecanismo"] or {}).get("requiere_viabilidad") if c and c["mecanismo"] else "desconocido"
        x["mecanismo_id"] = x["mecanismo_ids"][0] if len(x["mecanismo_ids"]) == 1 else (
            ",".join(x["mecanismo_ids"]) if x["mecanismo_ids"] else "desconocido")

    # 5. veredictos
    nombre_cepa = lambda cid: (cep.get(cid) or {}).get("nombre_corto") or cid.split(".st-")[-1]
    for v in ver.values():
        v.setdefault("tipo_objetivo", tipo_de(v["objetivo"]))
        for r in v.get("a_favor", []):
            if r.get("mecanismo") and r["mecanismo"] not in MEC_IDS:
                old = r.pop("mecanismo")
                r["codigo"] = "AF2"
                r["texto"] = ("Sin mecanismo molecular identificado: lo demostrado es la forma ensayada "
                              f"(en v1.1 figuraba como «{RET[old]['nombre_v11']}», que es una forma y no un mecanismo).")
                r["mecanismo_retirado"] = old
        sp = v["objetivo"].split(".")[0]
        seg, mot = puerta_seguridad(esp.get(sp, {}))
        p = v["puertas"]
        if "seguridad_v11" not in p:
            p["seguridad_v11"] = p.get("seguridad")
        p["seguridad"], p["seguridad_motivos"] = seg, mot
    gen = tsv("veredictos_a_generar.tsv")
    generar = {(r["sujeto"], r["linea"]) for r in gen}
    reemplazar = {(r["sujeto"], r["linea"]) for r in gen if r["reemplazar_v11"] == "si"}
    reemplazados = {}
    for k in list(ver):
        v = ver[k]
        if (v["objetivo"], v["linea"]) in reemplazar:
            reemplazados[k] = ver.pop(k)
    sujetos = defaultdict(list)
    for e in E.values():
        sujetos[(e["especie"], "especie")].append(e)
        if e.get("cepa"):
            sujetos[(e["cepa"], "cepa")].append(e)
        if e.get("subgrupo"):
            sujetos[(e["subgrupo"], "subgrupo")].append(e)
    estado_v = {}
    efecto = lambda e: e["mecanismo"]["clases"] != ["no_aplica"] and cuenta_direccion(e, producto)
    for (subj, tipo), lista in sorted(sujetos.items()):
        sp = subj.split(".")[0]
        for l in [l["id"] for l in cat["lineas"] if l.get("tipo") == "producto"]:
            E_l = [e for e in lista if e["linea"] == l]
            for f in FORMAS:
                key = f"{subj}|{l}|{f}"
                if not E_l and key not in ver:
                    continue
                E_f = [e for e in E_l if FORMA_PRODUCTO.get(e.get("forma")) == f]
                fav_f = [e for e in E_f if efecto(e) and e["direccion"] == "+" and (tipo != "cepa" or en_solitario(e))]
                nuevas_f = sorted(e["id"] for e in E_f if e["id"] in nuevas)
                if key in ver:
                    est = "calculado_desactualizado" if nuevas_f else "calculado"
                elif not E_f:
                    est = "sin_evidencia_en_forma"
                elif not fav_f:
                    est = "sin_resultado_a_favor"
                elif (subj, l) in generar:
                    v = veredicto_v12(subj, tipo, l, f, [e for e in E_l if efecto(e)], [e for e in E_f if efecto(e)], esp[sp], MEC, nombre_cepa)
                    una = v.pop("_una_cepa")
                    if una and v["veredicto"] in ("solida", "prometedora"):  # C1 también en los generados
                        v["veredicto_sin_c1"], v["veredicto"], v["regla_aplicada"] = v["veredicto"], "especulativa", v["regla_aplicada"] + "·C1"
                        v["c1"] = {"cepa": una, "fuentes": sorted(e["id"] for e in fav_f if en_solitario(e))}
                    if key in reemplazados:
                        o = reemplazados[key]
                        v["reemplaza_v11"] = {"veredicto": o["veredicto"], "subtitulo": o.get("subtitulo"), "regla": o.get("regla_aplicada"),
                                              "autor": o.get("autor")}
                    ver[key] = v
                    est = "calculado_v1.2"
                else:
                    est = "no_calculado"
                estado_v[key] = {"estado": est, "n_linea": len(E_l), "n_forma": len(E_f),
                                 "formas_con_evidencia": sorted({FORMA_PRODUCTO[e["forma"]] for e in E_l if e.get("forma") in FORMA_PRODUCTO})}
                nd = sum(1 for e in E_l if not e.get("forma"))
                if nd:
                    estado_v[key]["n_forma_no_declarada"] = nd
                if nuevas_f and est.startswith("calculado"):
                    estado_v[key]["evidencias_nuevas"] = nuevas_f
    for key in reemplazados:  # reemplazado pero sin evidencia a favor en esa forma: el v1.1 se conserva
        if key not in ver:
            ver[key] = reemplazados[key]
    # C1 a TODOS los veredictos (decisión del director, ronda 2)
    c1 = {}
    for k in sorted(ver):
        v = ver[k]
        if v.get("autor") == "automatico_v1.2":
            continue
        cepa = aplicar_c1(v, list(E.values()), nombre_cepa, producto)
        if cepa:
            c1[k] = cepa
    for key in ver:  # veredictos de líneas transversales o sin evidencia en la línea: existen, luego calculados
        estado_v.setdefault(key, {"estado": "calculado", "n_linea": 0, "n_forma": 0, "formas_con_evidencia": []})
    ver = {k: ver[k] for k in sorted(ver)}
    estado_v = {k: estado_v[k] for k in sorted(estado_v)}

    # 6. especies, cepas, refs
    for s in esp.values():
        for p in s.get("posbiotico") or []:
            if p.get("mecanismo") in RET:
                p["mecanismo_retirado"] = p["mecanismo"]
                p["mecanismo"] = None
            if p.get("mecanismo_retirado"):
                p["mecanismo_clase"] = "desconocido"
    for e in sorted(ev.values(), key=lambda e: e["id"]):
        if e.get("tipo") not in ("evidencia", "contexto"):
            continue
        s = esp.get(e["especie"])
        nueva = e["id"] in nuevas or (e.get("lote") and e["id"] not in ev11)
        if s is not None and nueva and e["id"] not in s.get("evidencias", []):  # como v1.1: la lista lleva también el contexto
            s.setdefault("evidencias", []).append(e["id"])
        if e.get("cepa") and s is not None and e["cepa"] not in s.get("cepas", []):
            s.setdefault("cepas", []).append(e["cepa"])
        c = cep.get(e.get("cepa") or "")
        if c is not None and e["id"] not in c["fuentes"]:
            c["fuentes"].append(e["id"])
    que_hace_bien_cepas(cep, E, producto, nombre_cepa)
    que_hace_bien_especies(esp, E, nombre_cepa)
    cep = {k: cep[k] for k in sorted(cep)}
    # cita corta con el apellido completo cuando lleva partícula o es compuesto («do Carmo 2018», «van der Ark 2018», «Di Pierro
    # 2015»): antes se cortaba en la primera palabra («do 2018»). Solo cambia cuando el autor declara un apellido de varias palabras.
    for r in refs.values():
        a0, cc = (r.get("autores") or [None])[0], r.get("cita_corta") or ""
        if not a0 and cc.startswith("?") and re.match(r"EFSA\b", r.get("revista") or ""):
            r["cita_corta"] = "EFSA " + cc.split(" ", 1)[-1]  # autoría corporativa: el panel de EFSA, no «? 2023»
            continue
        if not a0 or " " not in cc:
            continue
        w = a0.split()
        ape = w[:-1] if len(w) > 1 and re.fullmatch(r"[A-Z]{1,4}", w[-1]) else w
        if len(ape) > 1 and cc.split(" ")[0] == ape[0]:
            r["cita_corta"] = " ".join(ape) + " " + cc.rsplit(" ", 1)[1]
    refs = {k: refs[k] for k in sorted(refs)}

    # 7. meta
    tot = meta.setdefault("totales", {})
    tot.update({"evidencias": len(E), "contexto": sum(1 for e in ev.values() if e.get("tipo") == "contexto"),
                "cepas": len(cep), "referencias": len(refs)})
    meta.update({"build": "1.2", "schema_version": "1.2", "revision": REVISION, "generado": a.hoy,
                 "ids_partidos": alias, "lotes_integrados": lotes, "lotes_sustituidos": sustituidos})
    meta.pop("pesos_vecinos", None)
    meta.pop("vecinos", None)
    meta["generadores"] = {**{k: v for k, v in (meta.get("generadores") or {}).items() if k != "v1.2"},
                           "v1.2": "scripts/datos/generar_v12.py", "orquestador": "scripts/datos/construir_datos.py"}

    for k, o in (("meta", meta), ("catalogo", cat), ("especies", esp), ("evidencias", ev), ("ataques", ata),
                 ("veredictos", ver), ("matriz", mat), ("celdas", celdas), ("veredictos_estado", estado_v), ("cepas", cep),
                 ("refs", refs), ("subgrupos", subg)):
        guardar(DO, k, o)
    if a.trazas:
        Path(a.trazas).mkdir(parents=True, exist_ok=True)
        with (Path(a.trazas) / "traza_curacion.tsv").open("w", encoding="utf-8", newline="") as f:
            w = csv.writer(f, delimiter="\t", lineterminator="\n")
            w.writerow(["accion", "id", "detalle"])
            traza.extend(TRAZA_TILDES)
            for t in traza:
                w.writerow([t[0], t[1], json.dumps(t[2], ensure_ascii=False) if not isinstance(t[2], str) else t[2]])
    print("evidencias:", len(E), "· contexto:", tot["contexto"], "· con mecanismo:",
          sum(1 for e in E.values() if set(e["mecanismo"]["clases"]) & set(CLASES_REALES)))
    print("celdas matriz:", sum(len(d) for d in mat.values()), dict(Counter(c["estado"] for d in mat.values() for c in d.values())))
    print("veredictos:", len(ver), dict(Counter(v["estado"] for v in estado_v.values())), "· C1 aplicada a", len(c1))
    print("lotes:", lotes, "· sustituidos:", sustituidos)


# ---------------------------------------------------------------- cierre (paso 6 del orquestador)
def main_cierre(DO):
    """puertas.regulatorio de los veredictos de cepa = puerta_cepa.json (E6) y meta.limitaciones con cifras calculadas."""
    DO = Path(DO)
    ver, meta, cat, ev, pc, gj, cep = (cargar(DO, k) for k in ("veredictos", "meta", "catalogo", "evidencias", "puerta_cepa", "genomica", "cepas"))
    n = 0
    for k in sorted(ver):
        v = ver[k]
        if tipo_de(v["objetivo"]) != "cepa":
            continue
        x = (pc["cepas"].get(v["objetivo"]) or {}).get("puerta_por_forma", {}).get(v["forma"])
        if not x:
            continue
        p = v["puertas"]
        p.setdefault("regulatorio_especie", p.get("regulatorio"))
        p["regulatorio"], p["regulatorio_regla"], p["regulatorio_razon"] = x["estado"], x["regla"], x["razon"]
        p["regulatorio_fuente"] = "puerta_cepa.json"
        n += 1
    # meta.limitaciones (E9): cifras de este build, nunca escritas a mano
    res = [r for l in cat["lineas"] for r in l.get("resultados", [])]
    vacios = [r for r in res if r.get("cobertura") != "con_evidencia"]
    cola = [(l, r) for l in cat["lineas"] for r in l.get("resultados", []) if r.get("cola_curacion")]
    tab = {x["que"]: x for x in gj["cobertura"]["tabla"]}
    T = {k: x for x in gj["cobertura"]["tabla"] for k in [x.get("clave")] if k}
    lim_tsv = {r["id"]: r for r in tsv("limitaciones.tsv")}
    E = [e for e in ev.values() if e.get("tipo") == "evidencia"]
    estrella = lim_tsv["cepa_estrella"]
    pm_estrella = sorted({e["pmid"] for e in E if e.get("cepa") == estrella["cepa"]})
    valores = {
        "n_res": len(res), "n_vacios": len(vacios),
        "cola": "; ".join(f"{r.get('nombre_corto') or r['nombre']} ({len(r['cola_curacion']['pmids'])} PMID en cola, sin verificar)" for l, r in cola) or "ninguna",
        "esp_genomica": T["especies_con_analisis"]["valor"], "esp_total": T["especies_atlas"]["valor"],
        "esp_bakta": T["especies_con_marcadores_bakta"]["valor"], "esp_pgap": T["especies_solo_pgap"]["valor"],
        "cep_perfil": T["cepas_con_perfil"]["valor"], "cep_total": T["cepas_atlas"]["valor"],
        "cep_nombre": T["cepas_vinculadas_por_nombre"]["valor"], "genomas": T["genomas_con_llamadas"]["valor"],
        "n_indexados": estrella["dato_externo"], "n_usados": len(pm_estrella), "cepa_estrella": estrella["etiqueta"],
    }
    meta["limitaciones"] = [{"id": r["id"], "texto": r["plantilla"].format(**valores), "fuente": r["fuente"]}
                            for r in sorted(lim_tsv.values(), key=lambda r: r["orden"])]
    guardar(DO, "veredictos", ver)
    guardar(DO, "meta", meta)
    print("cierre: puertas de cepa en", n, "veredictos ·", len(meta["limitaciones"]), "limitaciones")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--entrada", default=str(AQUI / "data_v1.1"))
    ap.add_argument("--salida")
    ap.add_argument("--hoy")
    ap.add_argument("--trazas")
    ap.add_argument("--cierre")
    a = ap.parse_args()
    if a.cierre:
        return main_cierre(a.cierre)
    if not a.salida or not a.hoy:
        sys.exit("--salida y --hoy son obligatorios (el build es determinista: la fecha no se toma del reloj)")
    main_generar(a)


if __name__ == "__main__":
    main()
