#!/usr/bin/env python3
"""Test del contrato de datos v1.2/v2 sobre data/ (solo biblioteca estándar).

Uso: python3 -I tools/test_contrato_v12.py [DIR_DATA]      (por defecto, data/ del repo)
Lo ejecuta scripts/datos/construir_datos.py como paso 8 sobre el data/ construido. Sale con 1 si falla algo.
Cada comprobación nombra el criterio de aceptación de docs/ESPECIFICACION_v2.md que verifica (P1-01, P1-02, P1-04,
P1-05, P1-06) o la exigencia de rondas anteriores (E1·n, R1) que no se puede romper.
"""
import csv, json, re, sys
from collections import Counter
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
D = Path(sys.argv[1] if len(sys.argv) > 1 else RAIZ / "data")
sys.path.insert(0, str(RAIZ / "scripts" / "datos"))
L = lambda k: json.loads((D / f"{k}.json").read_text(encoding="utf-8"))
ev, mat, cat, ata, ver, vest, vec, meta, esp, cep, celdas, gen, pc = (L(k) for k in (
    "evidencias", "matriz", "catalogo", "ataques", "veredictos", "veredictos_estado", "vecinos", "meta", "especies", "cepas",
    "celdas", "genomica", "puerta_cepa"))
E = {k: e for k, e in ev.items() if e.get("tipo") == "evidencia"}
fallos = []


def ok(cond, msg):
    print(("OK   " if cond else "FALLA") + "  " + msg)
    if not cond:
        fallos.append(msg)


def todas_celdas():
    return [c for d in mat.values() for c in d.values()]


SAL, PAR = "ligilactobacillus-salivarius", "lacticaseibacillus-paracasei"
C5713, DSMZ = f"{SAL}.st-cect-5713", f"{PAR}.st-dsmz16671"

# ============================================================ P1-01 · orquestador y lote E9 r2
tipos = Counter(e.get("tipo") for e in ev.values())
ok(tipos["evidencia"] == 204 and tipos["contexto"] == 37, f"P1-01 evidencias.json: 204 evidencias y 37 de contexto (hay {tipos['evidencia']} y {tipos['contexto']})")
ok(meta.get("lotes_integrados") == ["E9_r2_20261023"] and "E9_r1_20261023" in (meta.get("lotes_sustituidos") or []),
   "P1-01 se integra E9_r2 y el lote sustituido E9_r1 no se lee")
e7 = ev.get(f"{PAR}.ev007") or {}
ok(e7.get("tipo") == "contexto" and e7.get("linea") is None and e7.get("resultado") is None, "P1-01 paracasei.ev007 es contexto, sin línea ni resultado")
txt_celdas = json.dumps([mat, celdas, ver, ata, [m.get("fuentes") for m in cat["mecanismos"]]])
ok(f"{PAR}.ev007" not in txt_celdas, "P1-01 ev007 no aparece en ninguna celda, veredicto, ataque ni fuente de mecanismo")
e10, e15, d5 = E.get(f"{PAR}.ev010", {}), E.get(f"{SAL}.ev015", {}), E.get("streptococcus-dentisani.ev005", {})
ok("forma" in e10 and e10["forma"] is None and e10.get("direccion") == "mixto", "P1-01 paracasei.ev010: forma null y dirección mixto")
ok(e15.get("alcance") == "mezcla", "P1-01 salivarius.ev015: alcance mezcla")
ok(d5.get("forma") == "componente", "P1-01 dentisani.ev005: forma componente")
ok(sum(1 for e in ev.values() if e.get("relacion") is None) == 0, "P1-01 0 registros con relacion null")
ok(all(e["relacion"] in ("intervencion", "asociacion", "in_vitro", "prediccion") for e in E.values()), "P1-01 relacion de las evidencias en {intervencion, asociacion, in_vitro, prediccion}")
fp4 = "faecalibacterium-prausnitzii.ev004"
cein = mat.get("intestinal", {}).get("faecalibacterium-prausnitzii|ein") or {}
cein2 = celdas.get("faecalibacterium-prausnitzii|intestinal|ein") or {}
ok(E.get(fp4, {}).get("relacion") == "asociacion" and fp4 in (cein.get("asociaciones") or []) and sum((cein.get("direcciones") or {}).values()) == cein.get("n_efecto") == 1
   and cein.get("n") == 2 and sum((cein2.get("direcciones") or {}).values()) == cein2.get("n_efecto") == 1,
   "P1-01 prausnitzii.ev004 = asociación y la celda prausnitzii|ein no la cuenta en direcciones (matriz y celdas)")


def no_suman(c):
    """Lo que suma dirección en una celda: ni asociaciones ni mezclas, en NINGUNA línea (P1-01 d/e, sin excepciones)."""
    cuentan = [i for i in c["evidencias"] if E[i].get("relacion") != "asociacion" and E[i].get("alcance") != "mezcla"]
    return sum((c.get("direcciones") or {}).values()) == len(cuentan) == c.get("n_efecto")


ok(all(no_suman(c) for c in todas_celdas()) and all(no_suman(c) for c in celdas.values()),
   "P1-01 e: ninguna asociación ni mezcla suma dirección en ninguna celda (matriz y celdas, todas las líneas)")
estados_etq = {x["id"] for x in cat.get("estado_celda_valores") or []}
ok(all(c["estado"] in estados_etq for c in todas_celdas()), "P1-01 todo estado de celda tiene etiqueta en catalogo.estado_celda_valores (nada crudo)")
ok(all(c.get("mejor_nivel") for c in todas_celdas() if c["estado"] in ("solo_asociacion", "solo_mezcla"))
   and all(c.get("mejor_nivel") for c in celdas.values() if not c.get("n_efecto")),
   "P1-01 una celda solo con asociaciones lleva su nivel de diseño, nunca un cero (matriz y celdas)")
fem = mat["salud_femenina"]
ok(all(fem[f"lactobacillus-iners|{r}"]["estado"] == "solo_asociacion" and fem[f"lactobacillus-iners|{r}"]["mejor_nivel"] == "OBS"
       for r in ("vaginosis", "colonizacion", "nugent_amsel")), "P1-01 L. iners en salud femenina: solo_asociacion con nivel OBS (no «0»)")
ok(all(e.get("direccion") in ("+", "0", "-", "mixto") for e in E.values()), "P1-01 0 evidencias con dirección fuera de {+, 0, -, mixto}")
nc = [k for k, e in E.items() if e.get("direccion_v11") == "nc"]
ok(len(nc) == 8 and all(E[k]["direccion"] == "mixto" for k in nc), f"P1-01 los 8 «nc» de v1.1 pasan a mixto con direccion_v11 = nc ({len(nc)})")
cp = mat["oral"].get(f"{PAR}|s_mutans") or {}
ok((cp.get("mecanismo") or {}).get("evidencias") == [f"{PAR}.ev009"], "P1-01 matriz oral paracasei|s_mutans: mecanismo.evidencias = [ev009]")
ok(cp.get("funciona_inactivada", {}).get("k") == "si" and cp["funciona_inactivada"].get("nivel") == "ECA", "P1-01 paracasei|s_mutans: funciona_inactivada si, nivel ECA")
m41 = next(m for m in cat["mecanismos"] if m["id"] == "M41")
ok(f"{PAR}.ev009" in m41["fuentes"] and f"{PAR}.ev007" not in m41["fuentes"] + m41["fuentes_en_contra"] and m41.get("contexto") == [f"{PAR}.ev007"],
   "P1-01 M41.fuentes contiene ev009; ev007 solo como contexto (M41.contexto)")
ok(not re.search(r"proteasa|calcio|autoclave", m41["nombre"] + " " + m41["molecula_o_componente"], re.I)
   and not re.search(r"DSMZ ?16671[^.;]*(resiste|depende de calcio)", json.dumps(cat, ensure_ascii=False)),
   "P1-01/P1-02 ancla anti-herencia: el catálogo no atribuye a DSMZ16671 la resistencia a proteasa/autoclave ni el calcio de ev007")
qhb = {(x["linea"], x["resultado"]): x for x in cep[C5713].get("que_hace_bien", [])}
mast = qhb.get(("salud_femenina", "mastitis")) or {}
ok(f"{SAL}.ev016" in mast.get("evidencias", []) and f"{SAL}.ev015" not in mast.get("evidencias", []),
   "P1-01 «Qué hace bien» de CECT 5713 en mastitis cuenta ev016 como logro de la cepa y no ev015")
ok(any(x["evidencia"] == f"{SAL}.ev015" and x["etiqueta"] == "en mezcla con L. gasseri CECT 5714" for x in mast.get("en_mezcla", [])),
   "P1-01 ev015 se muestra con la etiqueta «en mezcla con L. gasseri CECT 5714»")
cm = celdas.get(f"{C5713}|salud_femenina|mastitis") or {}
ok(cm.get("n_cepas_a_favor") == 1 and f"{SAL}.ev015" in (cm.get("en_mezcla") or []), "P1-01 la mezcla no cuenta en n_cepas_a_favor (celda CECT 5713 × mastitis)")
cme = celdas.get(f"{SAL}|salud_femenina|mastitis") or {}
ok((cm.get("n"), cm.get("n_eca"), cm.get("direcciones")) == (1, 1, {"+": 1}) and f"{SAL}.ev015" not in json.dumps(cm.get("direcciones"))
   and cme.get("n_eca") == sum(1 for e in E.values() if e["especie"] == SAL and e["linea"] == "salud_femenina" and e["resultado"] == "mastitis"
                               and e["nivel"] == "ECA" and e["direccion"] in ("+", "mixto") and e.get("alcance") != "mezcla"),
   "P1-01 d: la mezcla ev015 no suma n, n_eca ni dirección ni a CECT 5713 ni a la especie (celdas.json)")
res = {(l["id"], r["id"]): r for l in cat["lineas"] for r in l["resultados"]}
cand = res[("oral", "candidiasis_oral")]
ok(cand.get("cobertura") == "sin_curar" and len((cand.get("cola_curacion") or {}).get("pmids", [])) == 8 and cand["cola_curacion"].get("estado") == "no_verificada",
   "P1-01 candidiasis_oral: cobertura sin_curar y cola_curacion con 8 PMID no verificada")
ok(all(r.get("cobertura") in ("con_evidencia", "sin_curar", "sin_curar_sin_cola") for r in res.values()), "P1-01 cobertura en todos los resultados del catálogo")
ok(len(meta.get("limitaciones") or []) == 3 and all(x.get("texto") and "{" not in x["texto"] for x in meta["limitaciones"]), "P1-01 meta.limitaciones con 3 entradas redactadas")
ok("6-9" not in json.dumps(meta.get("limitaciones"), ensure_ascii=False), "P1-01 la limitación genómica usa las cifras de genomica.json, no el «6-9»")
ok(not (D / "busqueda.json").exists() and not (D / "perfil_cepa.json").exists(), "P1-01 no existen busqueda.json ni perfil_cepa.json")
ok(all(x["n_forma_no_declarada"] >= 0 for x in todas_celdas()) and cp.get("n_forma_no_declarada") == 1 and None not in cp.get("formas_ensayadas", []),
   "P1-01 forma null: formas_ensayadas la excluye y la cuenta n_forma_no_declarada")

# ============================================================ P1-02 · mecanismo y ¿funciona muerta?
c = mat["oral"][f"{SAL}|s_mutans"]
ok(c["funciona_inactivada"]["texto"] == "Sí, célula inactivada (calor)", "P1-02 oral|salivarius|s_mutans: funciona_inactivada.texto = «Sí, célula inactivada (calor)»")
ok(c["mecanismo"]["requiere_viabilidad"] == "no", "P1-02 oral|salivarius|s_mutans: mecanismo.requiere_viabilidad = no")
ok(not any("funciona_inactivada" in (x.get("mecanismo") or {}) for x in todas_celdas()), "P1-02 0 celdas con mecanismo.funciona_inactivada")
ok(not any(x["estado"] == "hueco_sin_mecanismo" for x in todas_celdas()), "P1-02 0 celdas con estado hueco_sin_mecanismo")
FP = {"vivo": "vivo", "inactivado": "posbiotico", "componente": "posbiotico", "metabolito": "posbiotico", "fermentado": "fermentado"}
ok(not any(len(set(x["estado_por_forma"].values())) == 1 and len({FP[f] for f in x["formas_ensayadas"]}) >= 2 for x in todas_celdas()),
   "P1-02 0 celdas con las tres formas iguales cuando las evidencias tienen formas distintas")
ok(not any(len(set(x["estado_por_forma"].values())) == 1 and set(x["estado_por_forma"].values()) != {"desconocido"} and len({FP[f] for f in x["formas_ensayadas"]}) < 3
           for x in todas_celdas()), "R1 estado_por_forma no copia el estado a formas no ensayadas")
ok(all(x["funciona_inactivada"]["k"] in ("si", "frac", "nulo", "ferm", "np") for x in todas_celdas()), "P1-02 funciona_inactivada.k solo en {si, frac, nulo, ferm, np}")
ok(not any(e["direccion"] == "mixto" and e.get("forma") in ("inactivado", "componente", "metabolito") for e in E.values()),
   "P1-02 ninguna evidencia mixta en forma no viva (la paridad muerta() JS/Python no depende de cómo se lea «mixto»)")
manuales = [x for x in ata if x.get("autor") != "automatico_v1.2"]
ok(len(manuales) == 33 and all(x.get("mecanismo_id") and x.get("requiere_viabilidad") and x.get("funciona_inactivada") for x in ata),
   f"P1-02 las 33 líneas de ataque (+{len(ata) - len(manuales)} automáticas) llevan mecanismo_id, requiere_viabilidad y funciona_inactivada")
mids = {m["id"] for m in cat["mecanismos"]}
ok(len(mids) == 30 and not mids & {"M04", "M10", "M11", "M12", "M13", "M16", "M17", "M18", "M22"}, "P1-02 catálogo: 30 mecanismos, sin los 9 que eran formas")
ok(next(m for m in cat["mecanismos"] if m["id"] == "M20")["nombre"] == "Producción de butirato" and "M42" not in mids, "P1-02 M20 «Producción de butirato»; BSH fuera del catálogo")
clases = {x["id"] for x in cat["clases_mecanismo"]}
ok("adhesion_coagregacion" not in clases and {"exclusion_patogeno", "adhesion_hospedador", "interferencia_quorum"} <= clases,
   "P1-02 exclusion_patogeno separada de adhesion_hospedador; interferencia_quorum como clase")
ok(all(k in cat for k in ("clases_mecanismo", "bases_mecanismo", "determinantes_mecanismo", "funciona_inactivada_valores")), "P1-02 catálogo con clases, bases, determinantes y valores de ¿funciona muerta?")
hip = [(m["id"], x) for m in cat["mecanismos"] for x in (m.get("candidatos") or []) if x["base"] in ("hipotesis", "hipótesis")]
ok(hip and all(x["lo_refutaria"].strip() for _, x in hip), "P1-02 toda línea de candidatos con base hipótesis tiene lo_refutaria")
m35 = next(m for m in cat["mecanismos"] if m["id"] == "M35")
h35 = [x["candidato"] for x in m35.get("candidatos") or [] if x["base"] == "hipotesis"]
ok(len(m35.get("descartadas") or []) == 5 and all(d.get("motivo") and d.get("fuentes") and d.get("veredicto") == "descartada"
                                                  and d.get("base") in ("observado", "inferencia") for d in m35["descartadas"]),
   "P1-02 M35 tiene 5 descartadas, cada una descartada de verdad, con base observado o inferencia, fuente y motivo")
ok(not any("no proteico" in d["clase"] or d["clase"] == m35["clase"] for d in m35["descartadas"]),
   "P1-02 ninguna descartada de M35 es a la vez su hipótesis rival (componente no proteico) ni su propia clase")
ok(len(h35) >= 2 and any("ADH01" in x for x in h35) and any("NO proteico" in x or "no proteico" in x for x in h35),
   "P1-02 M35 con 2 candidatos rivales: proteína ADH01 grande y componente no proteico")
ok("1 de 197" not in json.dumps(cat, ensure_ascii=False), "P1-02 sin recuentos escritos a mano («1 de 197») en el catálogo")
ok(E[f"{SAL}.ev013a"]["mecanismo"]["clases"] == ["exclusion_patogeno"] and E[f"{SAL}.ev013a"]["mecanismo"]["base"] == "observado"
   and E[f"{SAL}.ev013a"]["mecanismo"]["determinante"] == "desconocido", "E1·3 ev013a: exclusión del patógeno · fenómeno observado · determinante desconocido")
ok(c["mecanismo"]["evidencias"] == [f"{SAL}.ev013a"], "E1·3 el mecanismo de la celda CECT 5713 × S. mutans cuelga de ev013a")
ok(all(set(e["mecanismo"]["clases"]) <= clases for e in E.values()), "E1·2 todas las clases de evidencia están en el vocabulario")
ok(all(e["mecanismo"]["subclases"] for e in E.values() if "bacteriocina" in e["mecanismo"]["clases"]), "E1·6 toda evidencia de bacteriocina lleva subclase (o sin_clasificar)")


def det_desconocido_frases():
    """«mecanismo identificado» solo donde alguna evidencia a favor del resultado compartido tiene determinante identificado."""
    malas = 0
    for s, Lv in vec.items():
        for n in Lv:
            f = n.get("frase") or ""
            if "mecanismo identificado" not in f:
                continue
            rs = {r["id"] for r in n["rasgos_compartidos"] if r["tipo"] == "resultado"}
            dets = {e["mecanismo"]["determinante"] for e in E.values() if e["direccion"] == "+" and f'{e["linea"]}|{e["resultado"]}' in rs
                    and (e["especie"] in (s, n["id"]) or e.get("cepa") in (s, n["id"])) and e["mecanismo"]["base"] in ("causal", "observado")}
            malas += "identificado" not in dets
    return malas


txt_data = {p.name: p.read_text(encoding="utf-8") for p in sorted(D.glob("*.json"))}
ok(det_desconocido_frases() == 0 and "mecanismo identificado" not in txt_data["catalogo.json"],
   "P1-02/P1-06 0 «mecanismo identificado» con determinante desconocido (vecinos y catálogo)")

# ============================================================ P1-04 · rasgos, puerta de cepa y veredictos (datos)
bac = next(r for r in esp[SAL]["rasgos"] if r["rasgo"] == "bacteriocina")
ok(C5713 not in bac["cepas"], "P1-04 especies.json: CECT 5713 no figura en rasgos[bacteriocina].cepas de L. salivarius")
ok(any(x["cepa"] == C5713 and f"{SAL}.ev011" in x["evidencias"] for x in bac.get("cepas_en_contra", [])), "P1-04 CECT 5713 está en cepas_en_contra con ev011")
ok(all(any(E[f]["direccion"] == "+" for f in r.get("fuentes", []) if f in E and E[f].get("cepa") == cc)
       for s in esp.values() for r in s.get("rasgos") or [] for cc in r.get("cepas", [])), "P1-04 toda cepa de rasgo.cepas tiene al menos una evidencia «+» de ese rasgo")
RP = {"no": 0, "variable_cepa": 1, "si": 2}
gen_sube = [(sp, r["rasgo"]) for sp, s_ in esp.items() for r in s_.get("rasgos") or [] if (r.get("presente_origen") or "").startswith("genomica")
            and not (r.get("presente") in RP and r.get("presente_v11") in RP and RP[r["presente"]] < RP[r["presente_v11"]])]
gaba = {sp: next(r for r in esp[sp]["rasgos"] if r["rasgo"] == "gaba")["presente"] for sp in ("lactiplantibacillus-plantarum", "bifidobacterium-dentium")}
ok(not gen_sube and set(gaba.values()) == {"variable_cepa"},
   f"P1-04 rasgos: el genoma nunca sube ni sustituye el fenotipo curado (porta ≠ produce); GABA de L. plantarum y B. dentium sigue «variable_cepa» ({gen_sube})")
verdes = sorted(cid for cid, x in pc["cepas"].items() if x["puerta_por_forma"]["vivo"]["estado"] == "abierta")
medidas = sorted(cid for cid, x in pc["cepas"].items() if x["genoma"] == "medido")
ok(len(verdes) == 11 and set(verdes) <= set(medidas), f"P1-04 exactamente 11 cepas con puerta «vivo» abierta, todas con genoma medido ({len(verdes)})")
nm = [cid for cid in pc["cepas"] if cid.startswith("propionibacterium-freudenreichii.") or cid == "saccharomyces-cerevisiae.st-cncm-i-745"]
ok(len(nm) == 4 and all(pc["cepas"][x]["puerta_por_forma"]["vivo"]["estado"] == "no_medido" and pc["cepas"][x]["puerta_por_forma"]["vivo"]["regla"] == "R-calif" for x in nm),
   "P1-04 P. freudenreichii ×3 y S. cerevisiae CNCM I-745: no medido (calificación QPS sin verificar)")
ok(pc["cepas"][DSMZ]["genoma"] == "sin_accesion", "P1-04 DSMZ 16671: puerta de genoma sin_accesion")
vc = [v for v in ver.values() if v.get("tipo_objetivo") == "cepa" and v["objetivo"] in pc["cepas"]]
ok(vc and all(v["puertas"]["regulatorio"] == pc["cepas"][v["objetivo"]]["puerta_por_forma"][v["forma"]]["estado"] for v in vc),
   f"P1-04 puertas.regulatorio de los {len(vc)} veredictos de cepa = puerta_cepa (normalizado en el generador, no en la UI)")
v = ver.get(f"{C5713}|oral|posbiotico") or {}
ok(v.get("veredicto") == "prometedora" and f"{SAL}.ev013a" in json.dumps(v.get("a_favor")), "P1-04 veredicto CECT 5713 · oral · posbiótico = prometedora (sobre ev013a)")
ok(pc["cepas"][C5713]["puerta_por_forma"]["posbiotico"]["estado"] == "condicionada", "P1-04 CECT 5713 posbiótico: puerta de cepa condicionada")
vs = ver.get(f"{SAL}|oral|posbiotico") or {}
ok(vs.get("veredicto") == "especulativa" and "una sola cepa" in (vs.get("subtitulo") or ""), "P1-04 veredicto de la especie L. salivarius oral posbiótico: especulativa · una sola cepa")
ok(all(x["estado"] in ("calculado", "calculado_desactualizado", "calculado_v1.2", "no_calculado", "sin_evidencia_en_forma", "sin_resultado_a_favor") for x in vest.values()),
   "R1 veredictos_estado con vocabulario cerrado")
ok(all(v["puertas"]["seguridad"] in ("sin_bloqueo", "a_revisar", "bloqueo", "no_medido") for v in ver.values()), "E1·7 puertas.seguridad normalizada")


def una_cepa(v):
    obj = v["objetivo"]
    fp = {"vivo": ("vivo",), "posbiotico": ("inactivado", "componente", "metabolito"), "fermentado": ("fermentado",)}[v["forma"]]
    fav = [e for e in E.values() if e["linea"] == v["linea"] and e.get("forma") in fp and e["direccion"] == "+" and e.get("alcance") != "mezcla"
           and e.get("relacion") != "asociacion" and (e["especie"] == obj or e.get("subgrupo") == obj)]
    cs = {e.get("cepa") for e in fav}
    return bool(fav) and None not in cs and len(cs) == 1


viol = [k for k, v in ver.items() if ".st-" not in v["objetivo"] and v["veredicto"] in ("solida", "prometedora") and una_cepa(v)]
ok(not viol, f"E1·4 C1: ningún veredicto de especie/subgrupo sólido o prometedor con una sola cepa ({len(viol)})")

# ============================================================ P1-05 · genomica.json
G = gen["genomas"]
g = G["GCF_000143435.1"]
ok(g["marcadores"]["BSH"] == "I" and g["marcadores"]["SIALIDASA"] == "I" and g["marcadores"]["ABP118"] == "P" and g["marcadores"]["LOX"] == "A",
   "P1-05 CECT 5713: BSH = I, SIALIDASA = I, ABP118 = P, LOX = A")
ok(g["produccion"]["ABP118"] == {"estado": "porta_no_produce", "evidencias": [f"{SAL}.ev011"]}, "P1-05 CECT 5713: produccion.ABP118 = porta_no_produce con ev011")
ok((g.get("refutado_en_ensayo") or {}).get("SIALIDASA", {}).get("pmid") == "16843562", "P1-05 CECT 5713: refutado_en_ensayo.SIALIDASA.pmid = 16843562")
ts = gen["taxones"]["Ligilactobacillus salivarius"]["marcadores"]
ok({k: ts["BSH"][k] for k in ("n", "i", "N", "lectura")} == {"n": 15, "i": 2, "N": 17, "lectura": "sin_resolver"}, "P1-05 L. salivarius BSH {n: 15, i: 2, N: 17, sin_resolver}")
ok((ts["ABP118"]["n"], ts["ABP118"]["N"], ts["ABP118"]["lectura"]) == (10, 17, "variable_cepa"), "P1-05 L. salivarius ABP118 10/17 variable_cepa")
tn = gen["taxones"]["Lactococcus lactis subsp. lactis"]["marcadores"]["NISINA"]
ok((tn["n"], tn["N"]) == (3, 10), "P1-05 NISINA en L. lactis subsp. lactis 3/10")
porc = {v["cepa_ncbi"]: v for v in G.values() if v.get("cepa_ncbi")}
ok(porc["UCC118"]["produccion"]["ABP118"]["estado"] == "porta_y_produce", "P1-05 caso E3: UCC118 porta_y_produce")
ok(porc["KF147"]["produccion"]["NISINA"]["estado"] == "no_porta" and "nisI" in porc["KF147"].get("restos_locus", {}).get("NISINA", ""),
   "P1-05 caso E3: KF147 no_porta con restos_locus que contiene nisI")
ok(porc["AR809"]["produccion"]["ABP118"]["estado"] == "porta_sin_ensayo", "P1-05 caso E3: AR809 porta_sin_ensayo")
s = g["superficie"]
ok((s["mucbp_grande_pb"], s["eps_glicosiltransferasas_n"], s["eps_polisacarido_n"], s["dlt_n"]) == (8187, 7, 4, 4),
   "P1-05 superficie de CECT 5713: mucbp_grande_pb 8187, eps_glicosiltransferasas_n 7, eps_polisacarido_n 4, dlt_n 4")
ok(gen.get("superficie_descartes_declarados") == {"lspA_falso_positivo": 17}, "P1-05 descartes_declarados {lspA_falso_positivo: 17}")
from superficie_k4 import construir as k4  # noqa: E402
ref, _, _ = k4(RAIZ / "fuentes_publicas" / "drive")
campos = [k for k in next(iter(ref.values())) if k not in ("cepa_ncbi", "no_medible")]
dif = sum(1 for a, x in ref.items() for k in campos if G.get(a, {}).get("superficie", {}).get(k) != x[k])
ok(len(ref) == 17 and dif == 0, f"P1-05 superficie de genomica.json = K4 r2 de E4 recalculado: {dif} diferencias en {len(ref)} filas")
ids = [m["id"] for m in gen["marcadores"]]
ok(len(ids) == 15 and not any(re.match(r"VIT|IMM|BGL", m["origen"]) for m in gen["marcadores"]), "P1-05 15 marcadores, ninguno VIT, IMM o BGL")
parc = 0
for nombre in ("drive/atlas_marcadores_llamadas_referencias.csv", "ncbi/ncbi_marcadores_llamadas.csv"):
    with open(RAIZ / "fuentes_publicas" / nombre, encoding="utf-8") as f:
        crudo = {}
        for r in csv.DictReader(f):
            crudo.setdefault(r["accession"], {})[r["id_marcador"]] = r["estado"]
    for m in gen["marcadores"]:
        for a, est in crudo.items():
            o = [crudo[a].get(x) for x in m["origen"].split("+")]
            if all(x == "parcial" for x in o) and G.get(a, {}).get("marcadores", {}).get(m["id"]) == "P" \
                    and G[a]["anotador"].get(m["id"]) == ("Bakta" if nombre.startswith("drive") else "PGAP (NCBI)"):
                parc += 1
ok(parc == 0, f"P1-05 0 llamadas «parcial» contadas como P ({parc})")
ok(not any(gen["cepas_atlas"].get(x) for x in (DSMZ, f"{SAL}.st-ps2")) and not any(cep[x].get("genoma", {}) and cep[x]["genoma"].get("accesion") for x in (DSMZ, f"{SAL}.st-ps2")),
   "P1-05 DSMZ 16671 y PS2 sin genoma vinculado: el bloque dice «no medido», nunca «ausente»")
fiab = {m["id"]: m["fiable_sobre_pgap"] for m in gen["marcadores"]}
ok(all(fiab[mk] for v in G.values() for mk, an in v["anotador"].items() if an == "PGAP (NCBI)"),
   "P1-05 NCBI: las llamadas PGAP solo entran en marcadores fiables sobre PGAP")
ne = [(a, mk) for a, v in G.items() for mk in v.get("no_evaluable") or {}]
ok(ne and all(not fiab[mk] and G[a]["marcadores"][mk] == "NM" and mk not in G[a]["anotador"] for a, mk in ne)
   and not any(e not in ("P", "A", "I", "NM") for v in G.values() for e in v["marcadores"].values()),
   f"P1-05 NCBI: «no evaluable con la anotación de NCBI» ({len(ne)} llamadas) solo en marcadores poco fiables, publicado NM + no_evaluable (nunca ausente ni código crudo)")
ok(all(not (v.get("produccion") or {}).get(mk) or v["produccion"][mk]["estado"] == "no_medido" for a, v in G.items() for mk in v.get("no_evaluable") or {})
   and all(p["estado"] in gen["estados_produccion"] for v in G.values() for p in (v.get("produccion") or {}).values()),
   "P1-05 producción: estados con etiqueta en estados_produccion; no evaluable = no_medido con motivo")
abr = {"AMR_ADQ", "PLASMIDO"}
ok(all(an == "ABRicate" for v in G.values() for mk, an in v["anotador"].items() if mk in abr)
   and not any(an == "ABRicate" for v in G.values() for mk, an in v["anotador"].items() if mk not in abr),
   "P1-05 anotador real: AMR_ADQ y PLASMIDO = ABRicate, nunca «Bakta»")
ok(all((v["anotacion"] or "") == " + ".join(sorted({an for mk, an in v["anotador"].items() if mk not in abr})) or
       (v["anotacion"] == "solo ABRicate (AMR y plásmidos)" and set(v["anotador"]) <= abr) for v in G.values() if v["anotador"])
   and "Bakta" not in gen["taxones"]["Bifidobacterium dentium"]["genomas_por_anotador"],
   "P1-05 genomas[acc].anotacion = anotación real de los marcadores génicos (B. dentium sin «Bakta»)")
ok(not any(set(a["difiere_en"] or []) & {mk for mk in ids if v["marcadores"][mk] == "I" or G.get(a["accession"], {}).get("marcadores", {}).get(mk) == "I"}
           for v in G.values() for a in v.get("ani_top3", [])), "P1-05 ANI difiere_en: nunca sobre un indeterminado (I)")
ok(G["GCF_029023865.1"]["taxon"] == "Lactococcus lactis subsp. lactis" and G["GCF_029023865.1"].get("taxon_nota"),
   "P1-05 L. lactis ATCC 19435 = DSM 20481 (NCBI sin subespecie) se compara con subsp. lactis, con nota")
ok(all(t["N"] == t["n"] + t["i"] + sum(1 for a in gen["genomas"] if gen["genomas"][a]["taxon"] == tx and gen["genomas"][a]["marcadores"][mk] == "A")
       for tx, T in gen["taxones"].items() for mk, t in T["marcadores"].items()), "P1-05 n/N: NE y NM fuera del denominador")
nom = [cid for cid, x in gen["cepas_atlas"].items() if x["vinculo"] == "nombre"]
ok(len(nom) == 16 and all(G[gen["cepas_atlas"][c]["accesion"]].get("vinculo_texto") == "vinculada por nombre: verificar" for c in nom),
   f"P1-05 NCBI: 16 cepas vinculadas por nombre/depósito/cepa tipo con «vinculada por nombre: verificar» ({len(nom)})")
ok(all(pc["cepas"][c]["accesion"] == gen["cepas_atlas"][c]["accesion"] and pc["cepas"][c]["genoma"] != "sin_accesion"
       and pc["cepas"][c]["vinculo_genoma"] == "nombre" for c in nom),
   "P1-04/P1-05 una fuente por dato: las 16 cepas vinculadas por nombre llevan el mismo GCF_ en puerta_cepa y en genomica (no «sin accesión»)")
ok(any(a.get("herramienta", "").startswith("pyskani") for v in G.values() for a in v.get("ani_top3", [])) and "Parentesco genómico, no actividad" in gen["ani"]["nota"],
   "P1-05 ANI NCBI (pyskani) en ani_top3, con la nota «parentesco genómico, no actividad»")
tab = {x["clave"]: x for x in gen["cobertura"]["tabla"]}
ok(tab["especies_atlas"]["valor"] == len(esp) and tab["cepas_atlas"]["valor"] == len(cep)
   and f'{tab["especies_con_analisis"]["valor"]} de {len(esp)} con algún análisis' in gen["cobertura"]["conciliacion_dosier"]
   and f'{tab["cepas_con_perfil"]["valor"]} de {len(cep)} cepas con perfil' in gen["cobertura"]["conciliacion_dosier"],
   "P1-05 tabla de cobertura recalculada sobre este build")

# ============================================================ P1-06 · vecinos
pares = [n for Lv in vec.values() for n in Lv]
ok(not any("pero esta act" in (n.get("frase") or "") + n.get("inferencia_1linea", "") for n in pares), "P1-06 0 frases «pero esta actúa»")
ok(all(n["frase"] is None for n in pares if not n["rasgos_compartidos"]), "P1-06 0 pares con frase sin nada funcional compartido")
ok(all(set(n["desglose_por_eje"]) == {"funcional", "resultado", "taxonomica"} for n in pares), "P1-06 0 pares con eje genómico (3 ejes)")
ok(not any(n["etiqueta"] == "mismo rasgo" for n in pares), "P1-06 0 etiquetas «mismo rasgo» (lactato/acetato de criterio propio fuera)")
crit = {r["rasgo"] for s_ in esp.values() for r in s_.get("rasgos") or [] if r.get("alcance") == "criterio_propio"}
ok(not any(r["tipo"] == "rasgo" and r["id"] in crit and not any(r2["rasgo"] == r["id"] and r2.get("alcance") != "criterio_propio" for s_ in esp.values() for r2 in s_.get("rasgos") or [])
           for n in pares for r in n["rasgos_compartidos"]), "P1-06 ningún rasgo compartido de criterio propio")
v57 = {n["id"]: n for n in vec[C5713]}
trio = [f"{SAL}.st-dsm-20555", f"{SAL}.st-ls-33", f"{SAL}.st-ucc118"]
ok(all(x in v57 and v57[x]["frase"] is None and v57[x]["etiqueta"] == "solo parecido taxonómico" for x in trio),
   "P1-06 vecinos de CECT 5713: DSM 20555, Ls-33 y UCC118 sin frase, «solo parecido taxonómico»")
ok(v57[f"{SAL}.st-ps2"]["orden"] < v57[f"{SAL}.st-dsm-20555"]["orden"] and v57[f"{SAL}.st-ps2"]["score_combinado"] > v57[f"{SAL}.st-dsm-20555"]["score_combinado"],
   "P1-06 PS2 queda por delante de DSM 20555")
ok(not any(n["etiqueta"] in ("mismo mecanismo", "mismo resultado y mecanismo") and not any(
    r["tipo"] == "resultado" for r in n["rasgos_compartidos"]) for n in pares), "P1-06 «mismo mecanismo» solo si comparten clase para el mismo resultado")
ok(abs(meta["vecinos"]["denominador"] - 0.85) < 1e-9, "E1·5 denominador = suma de todos los pesos (0,85)")
ok(not any("_" in (n.get("frase") or "") for n in pares), "UX sin guion bajo en las frases de vecinos")

# ============================================================ vuelta de corrección 2 (V01-V07)
GG = gen["genomas"]
pares_ani = {frozenset(p[:2]) for p in gen["ani"]["pares"]}
con_ani = sorted(a for a, g in GG.items() if g.get("ani_n_pares"))
huecos = [(a, b) for i, a in enumerate(con_ani) for b in con_ani[i + 1:]
          if GG[a]["slug_atlas"] and GG[a]["slug_atlas"] == GG[b]["slug_atlas"] and frozenset((a, b)) not in pares_ani
          and [a, b] not in gen["ani"].get("no_cruzados", []) and [b, a] not in gen["ani"].get("no_cruzados", [])]
ok(not huecos, f"P1-05 ANI: todo par de la misma especie sin valor está declarado como no cruzado ({len(huecos)} sin declarar)")
ok(bool(gen["ani"].get("no_cruzados", [])) == ("NO se han cruzado" in gen["ani"]["nota"]), "P1-05 ANI: la nota dice si hay pares sin cruzar")
ok(all(("BAGEL4" in g["herramientas"]) == bool(g["bagel4"]["medido"]) for g in GG.values()), "P1-05 BAGEL4 visible en herramientas de todo genoma con BAGEL4")
ok(not any(g["anotacion"] is None and (g["herramientas"] or g["bagel4"]["medido"]) for g in GG.values()), "P1-05 ningún genoma con resultados sale sin anotación visible")
n_ll = next(x["valor"] for x in gen["cobertura"]["tabla"] if x["clave"] == "genomas_con_llamadas")
ok(all(sum(x["estado_en_genomas_con_llamadas"].values()) == n_ll for x in gen["cobertura"]["no_medido_en_publicos"]),
   f"P1-05 cobertura.no_medido_en_publicos suma {n_ll} genomas con llamadas en cada fila")
lect = {m["lectura"] for t in gen["taxones"].values() for m in t["marcadores"].values()}
ok(lect <= set(gen.get("lecturas_etiqueta", {})), "P1-05 toda lectura de taxón tiene etiqueta legible en lecturas_etiqueta")
ok(not any(x["vinculo_genoma"] == "nombre" and x["genoma"] == "medido" for x in pc["cepas"].values()),
   "P1-04 una cepa vinculada por nombre nunca cuenta su genoma como medido")
ok(all(x["accesion"] in (x["motivo_genoma"] or "") for x in pc["cepas"].values() if x["vinculo_genoma"] == "nombre"),
   "P1-04 el motivo de toda cepa vinculada por nombre nombra su GCF_")
ok(all("senal_de_riesgo" in c["estado_por_forma"].values() for c in mat.get("seguridad", {}).values() if c["estado"] == "senal_de_riesgo"),
   "P1-02 seguridad: toda celda con señal de riesgo la lleva en alguna forma (estado_por_forma coherente)")
base_rasgo = {(s, r["rasgo"]): r.get("base") for s, x in esp.items() for r in x.get("rasgos") or []}
mal_base = [(s, n["id"], r["id"]) for s, L_ in vec.items() for n in L_ for r in n["rasgos_compartidos"] if r["tipo"] == "rasgo"
            and (base_rasgo.get((s, r["id"].replace("rasgo:", ""))) not in ("causal", "observado")
                 or base_rasgo.get((n["id"], r["id"].replace("rasgo:", ""))) not in ("causal", "observado"))]
ok(not mal_base, f"P1-06 eje funcional: rasgos compartidos solo con base causal u observado en los dos lados ({len(mal_base)})")
ok(not any(ev.get(f, {}).get("tipo") == "contexto" for L_ in vec.values() for n in L_ for r in n["rasgos_compartidos"]
           for f in r.get("fuentes", []) + (r.get("fuentes_vecino") or [])), "P1-06 ningún chip de vecinos cita un registro de contexto")
ok(not any(re.search(r"\b[a-z0-9]+_[a-z0-9_]+\b", x.get("que_falta") or "") for x in ata), "UX «Qué falta» de ataques sin códigos crudos")

# ============================================================ P1-01 · robustez del build (privacidad y fuentes)
import os, shutil, subprocess, tempfile  # noqa: E402
SD = RAIZ / "scripts" / "datos"
FALSO = "ZZ" + "PRUEBA" + "999"  # código ficticio, compuesto para que este fichero no coincida consigo mismo
with tempfile.TemporaryDirectory() as td:
    td = Path(td)
    (td / "lista.txt").write_text(FALSO + "\n", encoding="utf-8")
    (td / "repo" / "scripts" / "datos" / "salidas" / "20990101").mkdir(parents=True)
    (td / "repo" / "scripts" / "datos" / "salidas" / "20990101" / "diferencias.tsv").write_text("cepa\t" + FALSO + "\n", encoding="utf-8")
    (td / "repo" / "data").mkdir()
    (td / "repo" / "data" / "meta.json").write_text("{}", encoding="utf-8")
    r = subprocess.run([sys.executable, "-I", str(SD / "control_publico.py"), "--data", str(td / "repo" / "data"), "--raiz", str(td / "repo")],
                       env={**os.environ, "ATLAS_LISTA_PRIVADA": str(td / "lista.txt")}, capture_output=True, text=True)
    ok(r.returncode == 1 and FALSO not in r.stdout + r.stderr,
       "P1-01 control_publico revisa TODO el repositorio (también salidas/ versionadas) y nunca imprime el código")
    shutil.copytree(RAIZ / "fuentes_publicas", td / "fp")
    (td / "fp" / "drive" / "bagel4_referencias_clusters.csv").unlink()  # un CSV que ningún paso lee
    r = subprocess.run([sys.executable, "-I", str(SD / "derivar_genomica.py"), "--fuentes", str(td / "fp"), "--data", str(D),
                        "--salida-dir", str(td / "sal"), "--fecha", "2099-01-01"], capture_output=True, text=True)
    ok(r.returncode == 1 and "bagel4_referencias_clusters.csv" in r.stderr and not (td / "sal").exists(),
       "P1-01 si falta cualquier CSV de fuentes_publicas (aunque ningún paso lo lea), genómica da FAIL y no escribe nada")

print(f"\n{len(fallos)} fallos")
sys.exit(1 if fallos else 0)
