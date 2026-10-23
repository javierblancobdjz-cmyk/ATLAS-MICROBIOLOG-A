#!/usr/bin/env python3
"""Atlas · vecinos.json v1.2 («parecidas a esta»), reconstruido por script (en v1.1 no había generador en el repo).

Uso (paso 5 de scripts/datos/construir_datos.py, DESPUÉS de rasgos_v12.py porque lee los rasgos v1.2):
    python3 -I scripts/datos/vecinos_v12.py --data DIR_DATA
Lee especies, cepas, evidencias y catalogo de DIR_DATA; escribe DIR_DATA/vecinos.json y meta.vecinos/pesos_vecinos.

Integrado el parche de E5 (rasgos v1.2 sin criterio propio; vía solo si via_en_fuente = si) y las correcciones v2:
  * «Mismo mecanismo» solo si comparten clase PARA EL MISMO RESULTADO; clase compartida en resultados distintos =
    «misma clase, otro resultado». En clases genéricas (inmunomodulación, metabolito) la etiqueta es «misma familia de efecto».
  * Con determinante desconocido la frase dice «mecanismo observado (X), determinante desconocido», nunca «identificado».
  * Una asociación (relacion = asociacion) no cuenta como resultado a favor; una evidencia en mezcla no es de la cepa.

Decisión del director (ronda 2):
  * 3 ejes: funcional 0.35, resultado 0.35, taxonómica 0.15. Sale el genómico (era un «proxy por genes, no ANI»
    vacío en 928/1036 pares; el ANI real va en el bloque genómico de E2, no como barra puntuable).
  * Denominador = suma de TODOS los pesos (0.85): un eje sin dato cuenta 0, igual que un cero medido.
    En v1.1 el eje sin dato salía del denominador y la ignorancia puntuaba más que un cero medido.
  * Eje resultado SOLO con líneas de producto (fuera ecologia, tecnologia y seguridad: «Taxonomía», «Rasgo
    funcional» o «Bacteriemia» no son resultados que se vendan y en v1.1 inflaban 139 pares).
  * Sin número /100 en pantalla: orden + «k/3 ejes con dato».
  * Frase con sujetos explícitos («mismo mecanismo / mismo resultado, otra vía»); si no se comparte nada funcional
    NO hay frase, solo la etiqueta «solo parecido taxonómico» (en v1.1 la frase invertía el sujeto: «pero esta actúa»).

Ejes (cepa ≠ especie: una cepa no hereda los rasgos de su especie):
  funcional = Jaccard de clases de mecanismo con evidencia a favor (base causal/observado; ni la inferencia de los
              autores ni la predicción genómica cuentan: porta ≠ hace) + en especies, rasgos declarados presentes
              (si / variable_cepa / sin_resolver) con base causal u observado y fuente que no sea de contexto.
              disponible solo si ambos sujetos tienen al menos un elemento.
  resultado = Jaccard de (línea, resultado) con evidencia «+» en líneas de producto. disponible si ambos tienen
              evidencia (de cualquier dirección) en líneas de producto: un cero aquí es un cero medido.
  taxonomica = mismo subgrupo 1.0 · misma especie 0.85 · mismo género 0.6 · misma familia 0.4 · otra 0.1 (como v1.1).
"""
import argparse, json, re, sys
from collections import defaultdict
from pathlib import Path

PESOS = {"funcional": 0.35, "resultado": 0.35, "taxonomica": 0.15}
N_VECINOS = 12
BASES_HACE = ("causal", "observado")  # «hace»: ni la inferencia de los autores ni la predicción genómica
REALES = ("exclusion_patogeno", "adhesion_hospedador", "bacteriocina", "acido_h2o2", "alcalinizacion_ads_ureasa",
          "interferencia_quorum", "enzima", "inmunomodulacion", "senalizacion_hospedador", "metabolito", "uso_glicanos", "otro")
GENERICAS = ("inmunomodulacion", "metabolito")


def _jaccard(a, b):
    u = a | b
    return round(len(a & b) / len(u), 4) if u else 0.0


def construir(esp, cep, E, cat):
    producto = {l["id"] for l in cat["lineas"] if l.get("tipo") == "producto"}
    res_nombre = {(l["id"], r["id"]): r.get("nombre_corto") or r["nombre"] for l in cat["lineas"] for r in l.get("resultados", [])}
    import re as _re
    def _corta(t):
        t = _re.sub(r" \(.*\)$", "", t)
        return t if len(t) > 1 and t[1].isupper() else t[0].lower() + t[1:]
    cls_etq = {c["id"]: _corta(c["etiqueta"]) for c in cat["clases_mecanismo"]}

    def nombre(s):
        return (cep[s].get("nombre_corto") if s in cep else esp[s].get("nombre_corto")) or s

    def mec_txt(det_set, cs):
        """«mecanismo identificado (X)» solo si alguna evidencia nombra el determinante; si no, observado + desconocido."""
        j = " / ".join(cls_etq.get(c, c) for c in sorted(cs))
        return f"mecanismo identificado ({j})" if "identificado" in det_set else f"mecanismo observado ({j}), determinante desconocido"

    sujetos = [(s, "especie") for s in sorted(esp)] + [(c, "cepa") for c in sorted(cep)]
    evs = defaultdict(list)
    for e in E.values():
        evs[e["especie"]].append(e)
        if e.get("cepa"):
            evs[e["cepa"]].append(e)
    perfil = {}
    for s, t in sujetos:
        L = evs.get(s, [])
        res = defaultdict(list)       # (linea, resultado) -> fuentes «+»
        cls = defaultdict(list)       # clase -> fuentes
        cls_por_res = defaultdict(set)
        det_por_res = defaultdict(set)
        for e in L:
            if t == "cepa" and e.get("alcance") == "mezcla":  # la mezcla no es logro de la cepa
                continue
            if e.get("linea") in producto and e.get("relacion") == "asociacion":  # asociación: no es efecto
                continue
            if e.get("linea") in producto and e["direccion"] == "+":
                res[(e["linea"], e["resultado"])].append(e["id"])
            m = e["mecanismo"]
            if e["direccion"] == "+" and m["base"] in BASES_HACE:
                for c in m["clases"]:
                    if c in REALES:
                        cls[c].append(e["id"])
                        if e.get("linea") in producto:
                            cls_por_res[(e["linea"], e["resultado"])].add(c)
                            det_por_res[(e["linea"], e["resultado"])].add(m["determinante"])
        rasgos, vias = {}, defaultdict(set)
        if t == "especie":
            for r in esp[s].get("rasgos") or []:
                # E5: vocabulario v1.2 (sin «otro»); fuera el criterio propio (lactato/acetato no discriminan) y «presente: no».
                # La vía cuenta solo si la fuente la nombra (via_en_fuente = si): una vía del genoma o candidata no es «misma vía».
                # Eje funcional: solo base causal u observado (especificación P1-06). Fuera la predicción genómica (porta ≠ hace)
                # y el contexto (cribados y revisiones); como fuente del chip solo valen registros que no son de contexto.
                fu = [f for f in (r.get("fuentes") or []) if (E.get(f) or {}).get("tipo") != "contexto"]
                if r.get("presente") in ("si", "variable_cepa", "sin_resolver") and r.get("alcance") != "criterio_propio" \
                        and r.get("base") in BASES_HACE and fu:
                    rasgos["rasgo:" + r["rasgo"]] = (rasgos.get("rasgo:" + r["rasgo"]) or []) + fu
                    vias["rasgo:" + r["rasgo"]].add(r.get("via_etiqueta") if r.get("via_en_fuente") == "si" else None)
        perfil[s] = {"tipo": t, "res": res, "cls": cls, "cls_por_res": cls_por_res, "det_por_res": det_por_res, "rasgos": rasgos, "vias": vias,
                     "con_producto": any(e.get("linea") in producto for e in L)}

    def tax(a, b, ta):
        if ta == "cepa":
            ca, cb = cep[a], cep[b]
            if ca.get("subgrupo") and ca.get("subgrupo") == cb.get("subgrupo"):
                return 1.0, "mismo subgrupo"
            sa, sb = ca["especie"], cb["especie"]
        else:
            sa, sb = a, b
        if sa == sb:
            return 0.85, "misma especie"
        if esp[sa].get("genero") == esp[sb].get("genero"):
            return 0.6, "mismo género"
        if esp[sa].get("familia") == esp[sb].get("familia"):
            return 0.4, "misma familia"
        return 0.1, "distinta familia"

    # minúscula solo en la inicial y nunca en siglas («GABA», «H2O2»): «Comparten output: GABA», no «gaba»
    minus = lambda t: t if len(t) > 1 and (t[1].isupper() or t[1].isdigit()) else t[:1].lower() + t[1:]
    et = lambda x: minus((cat.get("vocabulario_rasgos", {}).get("rasgos", {}).get(x[6:], {}) or {}).get("etiqueta", x[6:].replace("_", " ")))
    out, n_pares, total = {}, 0, sum(PESOS.values())
    for s, t in sujetos:
        A = perfil[s]
        fa = set(A["cls"]) | set(A["rasgos"])
        cands = []
        for o, to in sujetos:
            if to != t or o == s:
                continue
            B = perfil[o]
            fb = set(B["cls"]) | set(B["rasgos"])
            f_disp = bool(fa and fb)
            r_disp = A["con_producto"] and B["con_producto"]
            ts, tn = tax(s, o, t)
            ejes = {"funcional": {"score": _jaccard(fa, fb) if f_disp else 0.0, "disponible": f_disp},
                    "resultado": {"score": _jaccard(set(A["res"]), set(B["res"])) if r_disp else 0.0, "disponible": r_disp},
                    "taxonomica": {"score": ts, "disponible": True, "nota": tn}}
            if not f_disp:
                ejes["funcional"]["nota"] = "sin mecanismo ni rasgo declarado en " + (
                    "ninguna de las dos" if not fa and not fb else nombre(s if not fa else o))
            if not r_disp:
                ejes["resultado"]["nota"] = "sin evidencia de producto en " + (
                    "ninguna de las dos" if not A["con_producto"] and not B["con_producto"] else nombre(s if not A["con_producto"] else o))
            sc = round(sum(PESOS[k] * ejes[k]["score"] for k in PESOS) / total, 4)
            k_dato = sum(1 for k in PESOS if ejes[k]["disponible"])
            s_res = sorted(set(A["res"]) & set(B["res"]))
            s_cls = sorted(set(A["cls"]) & set(B["cls"]))
            s_ras = sorted(set(A["rasgos"]) & set(B["rasgos"]))
            comp = ([{"tipo": "mecanismo", "id": c, "etiqueta": cls_etq.get(c, c), "fuentes": A["cls"][c], "fuentes_vecino": B["cls"][c]} for c in s_cls]
                    + [{"tipo": "resultado", "id": f"{l}|{r}", "etiqueta": res_nombre.get((l, r), r), "fuentes": A["res"][(l, r)],
                        "fuentes_vecino": B["res"][(l, r)]} for l, r in s_res]
                    + [{"tipo": "rasgo", "id": x[6:], "etiqueta": et(x), "fuentes": A["rasgos"][x], "fuentes_vecino": B["rasgos"][x]} for x in s_ras])
            # sin nada funcional compartido: «solo parecido taxonómico» solo si hay parentesco (misma familia o más cerca);
            # de distinta familia no hay parecido que extrapolar y la etiqueta lo dice
            frase, etiqueta = None, ("solo parecido taxonómico" if ts >= 0.4 else "nada en común (distinta familia)")
            # E5: mismo output, ¿misma vía? «otra vía» solo si las dos vías están nombradas en la fuente y no se solapan
            partes, r_mismo, r_otra = [], False, False
            for x in s_ras:
                va, vb = A["vias"][x] - {None}, B["vias"][x] - {None}
                if va & vb:
                    partes.append(f"{et(x)} por la misma vía ({', '.join(sorted(va & vb))})"); r_mismo = True
                elif va and vb:
                    partes.append(f"{et(x)} por otra vía ({nombre(s)}: {', '.join(sorted(va))}; {nombre(o)}: {', '.join(sorted(vb))})"); r_otra = True
                else:
                    partes.append(f"{et(x)} (vía no identificada en la fuente de " + ("ninguna de las dos" if not va and not vb else nombre(o if va else s)) + ")")
            cola_r = (" Comparten output: " + "; ".join(partes) + ".") if partes else ""
            rn = ", ".join(res_nombre.get(x, x[1]) for x in s_res)
            cn = ", ".join(cls_etq.get(c, c) for c in s_cls)
            # mecanismo común PARA el mismo resultado (no basta con compartir clase en resultados distintos)
            mismo = sorted({c for x in s_res for c in A["cls_por_res"].get(x, set()) & B["cls_por_res"].get(x, set())})
            otros = [c for c in s_cls if c not in mismo]
            cola = (" Además comparten " + ", ".join(cls_etq.get(c, c) for c in otros) + " en otros resultados.") if otros and s_res else ""
            if mismo:
                rm = ", ".join(res_nombre.get(x, x[1]) for x in s_res if A["cls_por_res"].get(x, set()) & B["cls_por_res"].get(x, set()))
                generica = all(c in GENERICAS for c in mismo)
                det = set().union(*(A["det_por_res"].get(x, set()) | B["det_por_res"].get(x, set()) for x in s_res))
                cm = ", ".join(cls_etq.get(c, c) for c in mismo)
                if generica:
                    frase = f"Mismo resultado ({rm}) y misma familia de efecto ({cm}); no prueba la misma molécula." + cola
                    etiqueta = "misma familia de efecto"
                else:
                    frase = (f"Mismo resultado ({rm}) por el mismo mecanismo ({cm})"
                             + ("" if "identificado" in det else ", determinante desconocido") + "." + cola)
                    etiqueta = "mismo resultado y mecanismo"
            elif s_res:
                # resultado a resultado (antes solo el primero, y la frase negaba el mecanismo de la vecina en el segundo):
                # los resultados con la misma lectura se agrupan en una sola oración
                j = lambda cs: " / ".join(cls_etq.get(c, c) for c in sorted(cs))
                grupos = {}
                for x in s_res:
                    ca, cb = A["cls_por_res"].get(x, set()), B["cls_por_res"].get(x, set())
                    if ca and cb:
                        txt = f"{nombre(s)} por {j(ca)}; {nombre(o)} por {j(cb)} (otra vía)"
                    elif ca or cb:
                        quien = A if ca else B
                        txt = (f"{nombre(s if ca else o)} con {mec_txt(quien['det_por_res'].get(x, set()), ca or cb)}; "
                               f"{nombre(o if ca else s)} sin mecanismo descrito")
                    else:
                        txt = "sin mecanismo descrito en ninguna de las dos"
                    grupos.setdefault(txt, []).append(res_nombre.get(x, x[1]))
                if len(grupos) == 1:
                    frase = f"Mismo resultado ({rn}); {next(iter(grupos))}."
                else:
                    frase = f"Mismo resultado ({rn}). " + " ".join(f"En {', '.join(rs)}: {t}." for t, rs in grupos.items())
                frase += cola
                etiqueta = "mismo resultado"
            elif s_cls:
                if all(c in GENERICAS for c in s_cls):
                    frase, etiqueta = f"Misma familia de efecto ({cn}) en resultados distintos; no prueba la misma molécula.", "misma familia de efecto"
                else:
                    frase, etiqueta = f"Comparten clase de mecanismo ({cn}) pero para resultados distintos.", "misma clase, otro resultado"
            elif s_ras:
                frase = "Sin resultado de producto en común." + cola_r
                etiqueta = "mismo output y vía" if r_mismo else "mismo output, otra vía" if r_otra else "mismo output"
            if frase and s_ras and (s_res or s_cls):
                frase += cola_r
            cands.append({"id": o, "tipo": to, "score_combinado": sc, "ejes_con_dato": k_dato, "desglose_por_eje": ejes,
                          "rasgos_compartidos": comp, "etiqueta": etiqueta, "frase": frase,
                          "inferencia_1linea": frase or "",
                          "es_inferencia_o_evidencia": "evidencia" if comp else "solo_taxonomia",
                          "aviso_tax_no_funcional": ts >= 0.6 and not comp, "dianas_compartidas": []})
        cands.sort(key=lambda v: (-v["score_combinado"], -v["ejes_con_dato"], v["id"]))
        top = cands[:N_VECINOS]
        for i, v in enumerate(top, 1):
            v["orden"] = i
        out[s] = top
        n_pares += len(top)
    meta = {"generador": "scripts/datos/vecinos_v12.py", "pesos": PESOS, "denominador": round(total, 2),
            "ejes": list(PESOS), "n_vecinos_max": N_VECINOS, "n_sujetos": len(out), "n_pares": n_pares,
            "nota": "Denominador = suma de todos los pesos: un eje sin dato cuenta 0. Eje resultado solo con líneas de producto. "
                    "El genómico sale de la puntuación (ANI real en el bloque genómico, no como barra)."}
    return out, meta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    a = ap.parse_args()
    D = Path(a.data)
    J = lambda k: json.loads((D / f"{k}.json").read_text(encoding="utf-8"))
    esp, cep, ev, cat, meta = J("especies"), J("cepas"), J("evidencias"), J("catalogo"), J("meta")
    E = {k: e for k, e in ev.items() if e.get("tipo") == "evidencia"}
    vec, vm = construir(esp, cep, E, cat)
    (D / "vecinos.json").write_text(json.dumps(vec, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    meta["pesos_vecinos"], meta["vecinos"] = vm["pesos"], vm
    (D / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    from collections import Counter
    print("vecinos:", vm["n_sujetos"], "sujetos,", vm["n_pares"], "pares ·", dict(Counter(n["etiqueta"] for L in vec.values() for n in L)))


if __name__ == "__main__":
    main()
