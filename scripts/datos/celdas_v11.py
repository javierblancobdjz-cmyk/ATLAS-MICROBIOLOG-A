"""Reconstrucción de la derivación de celdas.json v1.1 (sujeto|línea|resultado). Comprobada: 0 diferencias en 238/238 celdas v1.1
(con producto=None, que desactiva las dos reglas v1.2 de abajo).

v1.2 (lote E9 r2, con producto != None): una evidencia con relacion = asociacion no suma dirección en NINGUNA línea
(va a `asociaciones`), y una de alcance «mezcla» no cuenta para ningún sujeto, ni cepa ni especie (va a `en_mezcla`):
ni dirección, ni nivel, ni n, ni n_eca. n = evidencias del sujeto (efecto + asociación); n_efecto = las que suman
dirección. Una celda sin efecto propio lleva el nivel de diseño de lo que tiene y `mejor_nivel_de`, nunca un cero."""
from collections import Counter, defaultdict
NN = {"MA": 1, "ECA": 2, "OBS": 3, "ANI": 4, "CEL": 5, "GEN-v": 6, "GEN-p": 7}
FAV, NUL = ("+", "mixto"), ("0", "-")

def corto(cid):
    s = cid.split(".st-", 1)[1] if cid and ".st-" in cid else ""
    return "cepa no declarada" if not s or s.startswith("nd-") else s

def celda(subj, l, r, E_todas, producto=None, nombre=None):
    v12 = producto is not None
    # v1.2: nombre legible de la cepa («CECT 5713», no el slug «cect-5713»); con producto=None se conserva v1.1 tal cual
    corto_ = nombre if (v12 and nombre) else corto
    A = [e for e in E_todas if v12 and e.get("relacion") == "asociacion"]
    M = [e for e in E_todas if v12 and e not in A and e.get("alcance") == "mezcla"]
    E = [e for e in E_todas if e not in A and e not in M]
    asoc = sorted(e["id"] for e in A)
    fav = [e for e in E if e["direccion"] in FAV]
    nul = [e for e in E if e["direccion"] in NUL]
    mn = min((NN.get(e["nivel"], 99) for e in fav), default=99)
    mejor = next((e["nivel"] for e in fav if NN.get(e["nivel"]) == mn), None)
    nivel_de = "efecto" if mejor else None
    if v12 and not E:
        resto = A or M
        mn = min(NN.get(e["nivel"], 99) for e in resto)
        mejor = next(e["nivel"] for e in resto if NN.get(e["nivel"]) == mn)
        nivel_de = "asociacion" if A else "mezcla"
    solo = fav
    cep = sorted({e["cepa"] for e in solo if e.get("cepa")})
    alto = sorted({e["cepa"] for e in solo if e.get("cepa") and e["nivel"] in ("MA", "ECA")})
    hum = [e for e in E if e["nivel"] in ("MA", "ECA", "OBS")]
    mas = [e for e in E if e["direccion"] == "+"]  # el texto de soporte cuenta solo «+» (mixto no), como v1.1
    esp = [e for e in mas if e.get("alcance") == "especie" and not e.get("cepa")]
    ecaf = [e for e in solo if e["nivel"] in ("MA", "ECA")]
    ce = {e.get("cepa") for e in ecaf}
    if esp and cep:
        txt = f"nivel especie + {len(cep)} cepa{'s' if len(cep) != 1 else ''} ({', '.join(corto_(x) for x in cep)})"
    elif esp:
        txt = "nivel especie"
    elif len(ecaf) >= 2 and len(ce) == 1 and None not in ce:
        txt = f"{len(ecaf)} de {len(ecaf)} ECA/MA son de {corto_(next(iter(ce)))}; no hay evidencia de otras cepas"
    else:
        txt = f"{len(cep)} cepa{'s' if len(cep) != 1 else ''}: {', '.join(corto_(x) for x in cep)}"
    if nul:
        txt += (f" · {len(mas)} a favor, {len(nul)} {'nulo o en contra' if len(nul) == 1 else 'nulos o en contra'}" if v12
                else f" · {len(mas)} a favor, {len(nul)} nulos/en contra")
    if v12 and not E:
        txt = ((f"señal de riesgo por asociación ({len(A)}): serie de casos, no ensayo; no suma dirección"
                if l == "seguridad" and any(e["direccion"] == "-" for e in A) else
                f"solo asociación ({len(A)}): se observa, no se interviene; no cuenta como efecto") if A
               else "solo en mezcla de cepas: no cuenta para este sujeto")
    elif v12 and A:
        txt += f" · {len(A)} asociación{'es' if len(A) != 1 else ''} aparte (no cuenta como efecto)"
    if v12 and E and M:
        txt += f" · {len(M)} en mezcla de cepas aparte (no cuenta)"
    out = {"sujeto": subj, "linea": l, "resultado": r, "n": len(E) + len(A), "mejor_nivel_num": mn, "mejor_nivel": mejor,
            "direcciones": dict(sorted(Counter(e["direccion"] for e in E).items())), "cepas_a_favor": cep, "n_cepas_a_favor": len(cep),
            "cepas_alto_nivel": alto, "n_eca": sum(e["nivel"] == "ECA" for e in fav), "n_ma": sum(e["nivel"] == "MA" for e in fav),
            "tiene_humano": bool(hum), "n_nulos": len(nul),
            "humano_nulo_o_contra": any(e["nivel"] in ("MA", "ECA") and (e["direccion"] == "0" or (e["direccion"] == "-" and l != "seguridad")) for e in E),
            "alcance_mostrado": "cepa" if len(cep) == 1 and not esp else "especie", "soporte_texto": txt,
            "evidencias": sorted(e["id"] for e in E_todas)}
    if v12:
        out["n_efecto"] = len(E)
        out["mejor_nivel_de"] = nivel_de
    if asoc:
        out["asociaciones"] = asoc
    mez = sorted(e["id"] for e in M)
    if mez:
        out["en_mezcla"] = mez
    return out

def celdas(E_all, producto=None, nombre=None):
    grp = defaultdict(list)
    for e in sorted(E_all, key=lambda e: e["id"]):
        if not e.get("linea") or not e.get("resultado"):
            continue
        grp[(e["especie"], e["linea"], e["resultado"])].append(e)
        if e.get("cepa"):
            grp[(e["cepa"], e["linea"], e["resultado"])].append(e)
    return {f"{s}|{l}|{r}": celda(s, l, r, E, producto, nombre) for (s, l, r), E in sorted(grp.items())}
