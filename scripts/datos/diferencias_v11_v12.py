#!/usr/bin/env python3
"""Tabla de diferencias celda a celda entre v1.1 y v1.2 (una fila por cambio, con regla y justificación).

Uso: python3 -I scripts/datos/diferencias_v11_v12.py DIR_V11 DIR_V12 SALIDA.tsv [RESUMEN.tsv]
(paso 6 de scripts/datos/construir_datos.py: DIR_V11 = scripts/datos/data_v1.1, DIR_V12 = el data/ construido)
Columnas: fichero, clave, campo, valor_v11, valor_v12, regla, justificacion.
El RESUMEN (opcional) cuenta filas por fichero y regla, y las cifras antes/después que pide el director.
"""
import csv, json, sys
from collections import Counter
from pathlib import Path

A, B, OUT = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
RES = Path(sys.argv[4]) if len(sys.argv) > 4 else None
ld = lambda d, k: json.loads((d / f"{k}.json").read_text(encoding="utf-8"))
j = lambda v: "" if v is None else (v if isinstance(v, str) else json.dumps(v, ensure_ascii=False, sort_keys=True))
filas, cifras = [], []
def fila(f, k, c, a, b, r, t): filas.append([f, k, c, j(a), j(b), r, t])

mb_meta = ld(B, "meta")
alias = mb_meta.get("ids_partidos", {})
partes = {p: k for k, v in alias.items() for p in v["partes"]}

# ---------------------------------------------------------------- evidencias
ea, eb = ld(A, "evidencias"), ld(B, "evidencias")
EXP = {"C": "patrón de clase en el claim", "V11": "enlace curado en v1.1", "P": "patrón del mecanismo en el claim",
       "NA": "no describe un efecto", "D": "efecto sin mecanismo nombrado en el claim", "EXC": "excepción curada (curado/excepciones_evidencia.tsv)"}
for k, v in alias.items():
    fila("evidencias.json", k, "(evidencia)", ea[k]["nivel"] + " · " + ea[k]["claim_es"], " + ".join(v["partes"]), "E-part", v["justificacion"])
for k in sorted(eb):
    y = eb[k]
    if y.get("tipo") == "contexto" and k not in ea:
        fila("evidencias.json", k, "(contexto)", None, f'contexto · {y.get("nivel")} · PMID {y["pmid"]}', "E-lote-contexto",
             f"Lote {y.get('lote')}: entra como contexto (sin línea, resultado ni dirección): no puntúa en celdas ni veredictos")
    if y.get("tipo") != "evidencia":
        continue
    if y.get("direccion_v11"):
        fila("evidencias.json", k, "direccion", y["direccion_v11"], y["direccion"], "E-dir",
             "Enum cerrado +/0/-/mixto: «nc» (no concluyente) de v1.1 pasa a «mixto»; las asociaciones se marcan con relacion, no con la dirección")
    if y.get("relacion_origen") == "curado" or (y.get("relacion") == "asociacion"):
        fila("evidencias.json", k, "relacion", None, y.get("relacion"), "E-rel",
             (y.get("relacion_justificacion") or "relacion del lote") + (" · no suma dirección en líneas de producto" if y.get("relacion") == "asociacion" else ""))
    if y.get("alcance") == "mezcla":
        fila("evidencias.json", k, "alcance", None, "mezcla", "E-mezcla", "Intervención con varias cepas: no cuenta como logro de ninguna ni en C1 (" + (y.get("etiqueta_mezcla") or "") + ")")
    if k not in ea and k not in partes:
        fila("evidencias.json", k, "(evidencia)", None, f'{y["nivel"]} {y["direccion"]} {y["forma"] or "forma no declarada"} · {y["linea"]}/{y["resultado"]} · PMID {y["pmid"]}',
             "E-lote", f"Lote {y.get('lote')} de E9; fragmento verificado literal en el abstract de PubMed ({y['verificacion'].get('quien')}, {y['verificacion'].get('fecha')})")
    if k in partes:
        x = ea[partes[k]]
        for c in ("nivel", "modelo", "condicion", "claim_es"):
            if x.get(c) != y.get(c):
                fila("evidencias.json", k, c, x.get(c), y.get(c), "E-part", f"Parte de {partes[k]} (partición)")
    for aj in y.get("ajustes_v12", []):
        v = y  # campo con ruta («nota_esceptica.texto»): ajustes de ortografía de curado/ajustes_tildes.tsv
        for c in aj["campo"].split("."):
            v = v[int(c)] if isinstance(v, list) else v[c]
        fila("evidencias.json", k, aj["campo"], aj["valor_v11"], v, "E-ajuste", f"{aj['autor']}: {aj['justificacion']}")
    m = y["mecanismo"]
    just = "; ".join(f"{r} ({EXP.get(r.split(':')[0], '')})" for r in m["reglas"])
    fila("evidencias.json", k, "mecanismo", None, {c: m[c] for c in ("clases", "subclases", "requiere_viabilidad", "genes", "ids", "base", "determinante")},
         "E-mec", just)
    if k in ea and (ea[k].get("mecanismos") or None) != (y.get("mecanismos") or None):
        fila("evidencias.json", k, "mecanismos", ea[k].get("mecanismos"), y.get("mecanismos"), "E-ret", "Se quitan ids retirados del catálogo (eran formas, no mecanismos)")

# ---------------------------------------------------------------- matriz
ESTADO = {
 ("hueco_sin_mecanismo", "preclinica_sin_mecanismo"): "v1.1 pintaba esta celda con n>0 igual que «sin evidencia»; v1.2 la nombra como lo que es: evidencia preclínica sin mecanismo identificado",
 ("hueco_sin_mecanismo", "linea_de_ataque"): "Evidencia a favor con mecanismo observado o causal (o propuesto por una línea de ataque): v1.1 la daba por hueco porque las evidencias no tenían campo mecanismo",
 ("hueco_sin_mecanismo", "sin_resultado_a_favor"): "Todas sus evidencias son nulas, en contra o no concluyentes: no es un hueco de mecanismo, es que no hay resultado a favor",
 ("con_evidencia", "sin_resultado_a_favor"): "No hay ninguna evidencia a favor (solo nc/0/-): v1.1 la contaba como evidencia",
 ("linea_de_ataque", "con_evidencia"): "Hay evidencia humana a favor: el estado es «con evidencia» y el mecanismo pasa a tiene_mecanismo, sin perderse",
 ("linea_de_ataque", "preclinica_sin_mecanismo"): "El mecanismo que la marcaba como ataque era una forma (M04/M10/M12) o solo predicción genómica; sin mecanismo observado",
 ("linea_de_ataque", "sin_resultado_a_favor"): "No hay ninguna evidencia a favor en la celda",
 ("con_evidencia", "linea_de_ataque"): "Sin evidencia humana a favor y con mecanismo observado",
}
ma, mb = ld(A, "matriz"), ld(B, "matriz")
for l in sorted(set(ma) | set(mb)):
    for k in sorted(set(ma.get(l, {})) | set(mb.get(l, {}))):
        x, y = ma.get(l, {}).get(k), mb.get(l, {}).get(k)
        key = f"{l}|{k}"
        if x is None or y is None:
            fila("matriz.json", key, "(celda)", x and x["estado"], y and y["estado"], "M-celda",
                 "Celda nueva por el lote E9" if x is None else "La celda se vacía: su única evidencia (ev008) se reubica en ecologia/rasgo_funcional (ajuste de E9)")
            continue
        cambia_ev = any(i in partes or i not in ea or eb[i].get("ajustes_v12") for i in y.get("evidencias", []))
        for c in ("mejor_nivel", "mejor_nivel_num", "n", "direcciones", "n_cepas_a_favor"):
            if x.get(c) != y.get(c):
                fila("matriz.json", key, c, x.get(c), y.get(c), "M-recalc",
                     "Cambia la evidencia de la celda (partición de ev013, lote E9 o reubicación de ev008)" if cambia_ev else "Discrepancia al recalcular (no esperada)")
        if x["estado"] != y["estado"]:
            t = ESTADO.get((x["estado"], y["estado"]))
            if l == "seguridad":
                t = "En seguridad «-» es señal de riesgo y «0» ausencia de riesgo: estados propios (senal_de_riesgo / sin_senal_de_riesgo)"
            fila("matriz.json", key, "estado", x["estado"], y["estado"], "M-estado", t or "Recalculado con la regla v1.2")
        for f in ("vivo", "posbiotico", "fermentado"):
            a_, b_ = (x.get("estado_por_forma") or {}).get(f), y["estado_por_forma"][f]
            if a_ != b_:
                t = ("No hay ninguna evidencia en esta forma (formas ensayadas: " + ", ".join(y["formas_ensayadas"]) + "): v1.1 copiaba el estado de la celda a las tres formas"
                     if b_ == "desconocido" else "Estado calculado solo con las evidencias de esta forma")
                fila("matriz.json", key, f"estado_por_forma.{f}", a_, b_, "M-forma", t)
        fi = y["funciona_inactivada"]
        if fi["k"] != "np":
            fila("matriz.json", key, "funciona_inactivada", None, fi["texto"], "M-muerta",
                 "Derivado de forma + dirección de las evidencias de la celda (" + ", ".join(fi["evidencias"]) + ")" if fi["evidencias"] else "Derivado de forma + dirección")
        if y.get("tiene_mecanismo"):
            m = y["mecanismo"]
            fila("matriz.json", key, "mecanismo", None, {c: m[c] for c in ("clases", "ids", "requiere_viabilidad", "mejor_base", "determinante", "origen")}, "M-mec",
                 f"Resumen de las evidencias a favor con mecanismo; requiere_viabilidad (no «funciona_inactivada») es lo que contiene")
n = sum(len(d) for d in mb.values())
fila("matriz.json", f"(las {n} celdas)", "formas_ensayadas / funciona_inactivada / tiene_mecanismo / evidencias", None, "nuevos", "M-nuevo",
     "Campos nuevos: formas realmente ensayadas, ¿funciona muerta? (5 valores, nunca «No»), con/sin mecanismo y lista de evidencias")
cifras += [("evidencias", "registros con relacion null", sum(1 for x in ea.values() if x.get("relacion") is None), sum(1 for x in eb.values() if x.get("relacion") is None)),
           ("evidencias", "direcciones fuera de {+,0,-,mixto} (tipo evidencia)", sum(1 for x in ea.values() if x.get("tipo") == "evidencia" and x.get("direccion") not in ("+", "0", "-", "mixto")),
            sum(1 for x in eb.values() if x.get("tipo") == "evidencia" and x.get("direccion") not in ("+", "0", "-", "mixto")))]
cifras += [("matriz", "celdas con las 3 formas iguales", sum(1 for d in ma.values() for c in d.values() if len(set((c.get("estado_por_forma") or {}).values())) == 1),
            sum(1 for d in mb.values() for c in d.values() if len(set(c["estado_por_forma"].values())) == 1)),
           ("matriz", "celdas «hueco_sin_mecanismo» con n>0", sum(1 for d in ma.values() for c in d.values() if c["estado"] == "hueco_sin_mecanismo" and c["n"] > 0), 0)]

# ---------------------------------------------------------------- celdas.json (misma derivación v1.1 sobre la evidencia curada)
ca_, cb_ = ld(A, "celdas"), ld(B, "celdas")
for k in sorted(set(ca_) | set(cb_)):
    x, y = ca_.get(k), cb_.get(k)
    if x is None or y is None:
        fila("celdas.json", k, "(celda)", x and x["soporte_texto"], y and y["soporte_texto"], "C-celda", "Aparece o desaparece por el lote E9, la partición de ev013 o la reubicación de ev008")
        continue
    for c in sorted(set(x) | set(y)):
        if x.get(c) != y.get(c):
            fila("celdas.json", k, c, x.get(c), y.get(c), "C-recalc", "Misma regla que v1.1 (celdas_v11.py, regresión 0/238 sobre v1.1) aplicada a la evidencia curada")

# ---------------------------------------------------------------- catálogo
cat_a, cat_b = ld(A, "catalogo"), ld(B, "catalogo")
ia, ib = {m["id"]: m for m in cat_a["mecanismos"]}, {m["id"]: m for m in cat_b["mecanismos"]}
ret = {r["id"]: r for r in cat_b.get("mecanismos_retirados", [])}
for i in sorted(set(ia) | set(ib)):
    if i not in ib:
        fila("catalogo.json", i, "(mecanismo)", ia[i]["nombre"], None, "K-ret", ret.get(i, {}).get("motivo", "retirado"))
    elif i not in ia:
        fila("catalogo.json", i, "(mecanismo)", None, ib[i]["nombre"], "K-new",
             f"Mecanismo con fuente en el atlas: {len(ib[i]['fuentes'])} evidencias a favor ({', '.join(ib[i]['fuentes']) or 'ninguna'})"
             + (f"; {len(ib[i]['fuentes_en_contra'])} en contra/nulas" if ib[i]["fuentes_en_contra"] else ""))
    else:
        for c in ("clase", "requiere_viabilidad"):
            if ia[i].get(c) != ib[i].get(c):
                fila("catalogo.json", i, c, ia[i].get(c), ib[i].get(c), "K-cls",
                     "Clase reasignada al vocabulario v1.2" if c == "clase" else f"Viabilidad recalculada: base {ib[i]['base_viabilidad']}")
    if i in ib and (ib[i].get("descartadas") or ib[i].get("candidatos")):
        fila("catalogo.json", i, "candidatos / descartadas / lo_refutaria", None,
             {"candidatos": len(ib[i].get("candidatos") or []), "descartadas": [d["clase"] for d in ib[i].get("descartadas") or []]}, "K-m35",
             "Hipótesis con su dato y su experimento de refutación; clases descartadas con base y fuente (curado/descartes_mecanismo.tsv)")
fila("catalogo.json", "clases_mecanismo", "(lista)", None, [c["id"] for c in cat_b["clases_mecanismo"]], "K-new",
     "Vocabulario de 14 clases: adhesión partida en exclusion_patogeno / adhesion_hospedador (familia «adhesion»), nueva interferencia_quorum, subclase de bacteriocina")
fila("catalogo.json", "bases_mecanismo / determinantes_mecanismo / funciona_inactivada_valores", "(listas)", None, "etiquetas", "K-new",
     "La base dice cómo se sabe el FENÓMENO; el determinante dice si se sabe CON QUÉ. Etiquetas para la UI (sin guion bajo)")

# ---------------------------------------------------------------- ataques
aa, ab = ld(A, "ataques"), ld(B, "ataques")
kk = lambda x: f"{x['especie']}|{x['linea']}|{x['resultado']}"
da = {kk(x): x for x in aa}
for y in ab:
    k = kk(y); x = da.get(k)
    if x is None:
        fila("ataques.json", k, "(fila)", None, {c: y[c] for c in ("mecanismo_ids", "mecanismo_clases", "mejor_nivel")}, "A-new",
             "Celda de línea de producto con mecanismo observado/causal y sin fila de ataque: fila automática con texto derivado del catálogo"); continue
    old = x.get("mecanismo_ids") or x.get("mecanismo_id")
    if old != y["mecanismo_ids"]:
        fila("ataques.json", k, "mecanismo_ids", old, y["mecanismo_ids"], "A-mec", "Derivado de los ids de mecanismo de sus fuentes_mecanismo con dirección +")
    fila("ataques.json", k, "mecanismo_clases", None, y["mecanismo_clases"], "A-mec", "Clases de las fuentes a favor; «desconocido» si ninguna nombra mecanismo")
    if y.get("mecanismo_ids_sin_fuente"):
        fila("ataques.json", k, "mecanismo_ids_sin_fuente", None, y["mecanismo_ids_sin_fuente"], "A-qa",
             "El texto curado nombra estos mecanismos pero ninguna de sus fuentes_mecanismo los sostiene: tarea de curación")
    if x.get("estado_por_forma") != y.get("estado_por_forma"):
        fila("ataques.json", k, "estado_por_forma", x.get("estado_por_forma"), y["estado_por_forma"], "A-forma", "Copiado de la celda v1.2: solo formas ensayadas")
    if y.get("funciona_inactivada") and y["funciona_inactivada"]["k"] != "np":
        fila("ataques.json", k, "funciona_inactivada / requiere_viabilidad", None, [y["funciona_inactivada"]["texto"], y["requiere_viabilidad"]], "A-muerta",
             "Copiados de la celda: ¿funciona muerta? (forma + dirección) y requiere_viabilidad (del mecanismo) son campos distintos")

# ---------------------------------------------------------------- veredictos
va, vb = ld(A, "veredictos"), ld(B, "veredictos")
for k in sorted(set(vb) - set(va)):
    fila("veredictos.json", k, "(veredicto)", None, vb[k]["veredicto"] + " · " + (vb[k]["subtitulo"] or ""), vb[k]["regla_aplicada"],
         "No calculado en v1.1 y con evidencia a favor en esta forma; pedido en curado/veredictos_a_generar.tsv")
for k in sorted(set(va) & set(vb)):
    x, y = va[k], vb[k]
    if y.get("reemplaza_v11"):
        fila("veredictos.json", k, "veredicto", f'{x["veredicto"]} · {x.get("subtitulo")}', f'{y["veredicto"]} · {y.get("subtitulo")}', y["regla_aplicada"],
             "Recalculado: el subtítulo v1.1 («una sola cepa») quedó falso con el lote E9 (ECA de una segunda cepa)")
    elif x["veredicto"] != y["veredicto"]:
        fila("veredictos.json", k, "veredicto", x["veredicto"], y["veredicto"], "V12-C1",
             f"C1: toda la evidencia a favor en esta forma es de una sola cepa ({y['c1']['cepa']}; {', '.join(y['c1']['fuentes'])}): la especie no hereda el veredicto de la cepa")
    sa_, sb_ = x["puertas"].get("seguridad"), y["puertas"].get("seguridad")
    if sa_ != sb_:
        fila("veredictos.json", k, "puertas.seguridad", sa_, sb_, "V-puerta",
             "Normalizada (regla E6): «si» y «no» del estratega significaban lo mismo" + (f"; motivos: {'; '.join(y['puertas']['seguridad_motivos'])}" if y["puertas"].get("seguridad_motivos") else ""))
    for i, (r1, r2) in enumerate(zip(x.get("a_favor", []), y.get("a_favor", []))):
        if r1 != r2 and r2.get("mecanismo_retirado"):
            fila("veredictos.json", k, f"a_favor[{i}]", r1, r2, "V-AF2", "La razón citaba un mecanismo retirado (era una forma): se reescribe como texto")
ve = ld(B, "veredictos_estado")
for est, nn in sorted(Counter(v["estado"] for v in ve.values()).items()):
    fila("veredictos_estado.json", f"(estado={est})", "n", None, nn, "V-est", "Distingue calculado / no calculado / sin evidencia en la forma / sin resultado a favor; clave ausente = sin evidencia en la línea")
cifras += [("veredictos", "veredictos de especie/subgrupo sólida o prometedora con una sola cepa (C1)",
            sum(1 for k, y in vb.items() if y.get("c1") and k in va), 0),
           ("veredictos", "valores de puertas.seguridad fuera de {sin_bloqueo,a_revisar,bloqueo,no_medido}",
            sum(1 for x in va.values() if x["puertas"].get("seguridad") not in ("sin_bloqueo", "a_revisar", "bloqueo", "no_medido")),
            sum(1 for x in vb.values() if x["puertas"].get("seguridad") not in ("sin_bloqueo", "a_revisar", "bloqueo", "no_medido")))]

# ---------------------------------------------------------------- especies, cepas, refs
sa, sb = ld(A, "especies"), ld(B, "especies")
for s in sorted(sb):
    for i, (p1, p2) in enumerate(zip(sa[s].get("posbiotico") or [], sb[s].get("posbiotico") or [])):
        if p1.get("mecanismo") != p2.get("mecanismo"):
            fila("especies.json", f"{s}.posbiotico[{i}]", "mecanismo", p1.get("mecanismo"), p2.get("mecanismo"), "S-ret", "Apuntaba a un mecanismo retirado (una forma): null con mecanismo_clase=desconocido")
    for c in ("evidencias", "cepas"):
        nuevos = [x for x in sb[s].get(c, []) if x not in sa[s].get(c, [])]
        if nuevos:
            fila("especies.json", s, c, None, nuevos, "S-lista", "Ids nuevos (lote E9 o partes de ev013) añadidos a la lista de la especie")
cpa, cpb = ld(A, "cepas"), ld(B, "cepas")
for k in sorted(set(cpb) - set(cpa)):
    fila("cepas.json", k, "(cepa)", None, cpb[k]["designacion"], "S-cepa", f"Cepa nueva del lote {cpb[k].get('lote')}; genoma público: {(cpb[k].get('genoma') or {}).get('accesion') or 'no localizado (NA)'}")
ra, rb = ld(A, "refs"), ld(B, "refs")
for k in sorted(set(rb) - set(ra)):
    fila("refs.json", k, "(referencia)", None, rb[k].get("cita_corta"), "S-ref", "Referencia del lote E9; metadatos de PubMed (curado/lotes/*_refs.json)")

# ---------------------------------------------------------------- vecinos
cat_lineas = {l["id"]: l for l in cat_a["lineas"]}
producto_nombres = {r.get("nombre_corto") or r["nombre"] for l in cat_a["lineas"] if l.get("tipo") == "producto" for r in l.get("resultados", [])} | \
                   {r["nombre"] for l in cat_a["lineas"] if l.get("tipo") == "producto" for r in l.get("resultados", [])}
vva, vvb = ld(A, "vecinos"), ld(B, "vecinos")
inflados = pero = 0
for s in sorted(set(vva) | set(vvb)):
    la = {n["id"]: n for n in vva.get(s, [])}
    lb = {n["id"]: n for n in vvb.get(s, [])}
    for o in sorted(set(la) | set(lb)):
        x, y = la.get(o), lb.get(o)
        if x:
            shared = [r["etiqueta"] for r in x["rasgos_compartidos"] if r["tipo"] == "resultado"]
            infl = x["desglose_por_eje"]["resultado"]["score"] > 0 and not any(e in producto_nombres for e in shared)
            inflados += infl
            pero += "pero esta act" in x["inferencia_1linea"]
        if x is None:
            fila("vecinos.json", f"{s} → {o}", "(par)", None, f'{y["orden"]} · {y["etiqueta"]}', "N-par", "Entra en los 12 primeros con la puntuación v1.2 (3 ejes, denominador completo)")
        elif y is None:
            fila("vecinos.json", f"{s} → {o}", "(par)", x["inferencia_1linea"], None, "N-par",
                 "Sale de los 12 primeros" + (": su parecido de resultado venía solo de líneas transversales (" + ", ".join(shared) + ")" if infl else ""))
        else:
            if x["inferencia_1linea"] != (y["frase"] or ""):
                t = ("Frase con el sujeto invertido («pero esta actúa») sustituida" if "pero esta act" in x["inferencia_1linea"]
                     else "Frase regenerada con sujetos explícitos")
                fila("vecinos.json", f"{s} → {o}", "frase", x["inferencia_1linea"], y["frase"], "N-frase",
                     t + ("; sin nada funcional compartido no se imprime frase (solo «solo parecido taxonómico»)" if not y["frase"] else ""))
            ra_, rb_ = x["desglose_por_eje"]["resultado"]["score"], y["desglose_por_eje"]["resultado"]["score"]
            if ra_ != rb_:
                fila("vecinos.json", f"{s} → {o}", "eje resultado", ra_, rb_, "N-res",
                     "Solo líneas de producto" + (" (en v1.1 lo inflaban: " + ", ".join(shared) + ")" if infl else ""))
cifras += [("vecinos", "pares con eje resultado > 0 solo por líneas transversales (ecologia/tecnologia/seguridad)", inflados,
            sum(1 for L in vvb.values() for n in L if n["desglose_por_eje"]["resultado"]["score"] > 0 and not any(r["tipo"] == "resultado" for r in n["rasgos_compartidos"]))),
           ("vecinos", "frases «pero esta actúa» (sujeto invertido)", pero, sum(1 for L in vvb.values() for n in L if "pero esta act" in (n["frase"] or ""))),
           ("vecinos", "pares con eje genómico en la puntuación", sum(1 for L in vva.values() for n in L if "genomica" in n["desglose_por_eje"]),
            sum(1 for L in vvb.values() for n in L if "genomica" in n["desglose_por_eje"])),
           ("vecinos", "pares con frase impresa sin nada funcional compartido", sum(1 for L in vva.values() for n in L if not n["rasgos_compartidos"] and n["inferencia_1linea"]),
            sum(1 for L in vvb.values() for n in L if not n["rasgos_compartidos"] and n["frase"]))]
fila("meta.json", "schema_version / revision", "", ld(A, "meta").get("schema_version"), f'{mb_meta.get("schema_version")} {mb_meta.get("revision")}', "meta", "Nuevo esquema")

with OUT.open("w", encoding="utf-8", newline="") as f:
    w = csv.writer(f, delimiter="\t", lineterminator="\n")
    w.writerow(["fichero", "clave", "campo", "valor_v11", "valor_v12", "regla", "justificacion"]); w.writerows(filas)
print(OUT, len(filas), "filas")
if RES:
    with RES.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter="\t", lineterminator="\n")
        w.writerow(["tipo", "fichero_o_cifra", "regla_o_v11", "n_o_v12"])
        for (fi, r), nn in sorted(Counter((x[0], x[5]) for x in filas).items()):
            w.writerow(["filas", fi, r, nn])
        for c in cifras:
            w.writerow(["cifra", c[0] + ": " + c[1], c[2], c[3]])
    print(RES.read_text(encoding="utf-8"))
