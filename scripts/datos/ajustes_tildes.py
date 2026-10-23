#!/usr/bin/env python3
"""Atlas · ortografía curada (curado/ajustes_tildes.tsv): solo tildes, eñes y diéresis en textos que lee el usuario.

Contrato (el mismo de curado/ajustes_ataques.tsv, generalizado a cualquier fuente):
  - cada fila nombra la fuente (`fichero`), el registro (`id`) y el campo (`campo`, ruta con puntos; los números son
    índices de lista) y trae el texto de origen (`valor_origen`) y el corregido (`valor_nuevo`);
  - se aplica SOLO si el texto actual coincide con `valor_origen`; si no coincide o el campo no existe: FAIL;
  - `valor_nuevo` y `valor_origen` tienen que ser idénticos letra a letra al quitarles tildes, eñes y diéresis: si la
    corrección cambia cualquier otra cosa, FAIL (no puede tocar el sentido, ni nombres, ni códigos);
  - deja traza: en traza_curacion.tsv (quien lo llame) y, si el registro es un objeto con id, en su lista `ajustes_v12`.

`fichero` admite:
  - un JSON de data_v1.1 que lee el generador (evidencias, ataques, especies, cepas, catalogo, veredictos, subgrupos,
    meta, web): `id` es la clave del registro; en ataques, «especie|linea|resultado»; «-» = la raíz del fichero;
  - genomica: el genomica.json que escribe derivar_genomica.py (texto de fuentes_publicas, que no se toca);
  - curado/<nombre>.tsv: `id` = valor de la primera columna de la fila y `campo` = nombre de la columna;
  - curado/lotes/<lote>.json: `id` = «-» y `campo` = ruta dentro del lote.
Solo biblioteca estándar.
"""
import csv, sys, unicodedata
from pathlib import Path

TSV = Path(__file__).resolve().parent / "curado" / "ajustes_tildes.tsv"
_CACHE = None


def quitar_tildes(s):
    """Quita tildes, virgulilla de la eñe y diéresis (NFD sin marcas combinantes): «niño» -> «nino», «pingüino» -> «pinguino»."""
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def filas(fichero):
    global _CACHE
    if _CACHE is None:
        with open(TSV, encoding="utf-8") as f:
            _CACHE = list(csv.DictReader(f, delimiter="\t", quoting=csv.QUOTE_NONE))
        for r in _CACHE:
            if quitar_tildes(r["valor_nuevo"]) != quitar_tildes(r["valor_origen"]) or r["valor_nuevo"] == r["valor_origen"]:
                sys.exit(f"FAIL ajustes_tildes.tsv: {r['fichero']}:{r['id']}.{r['campo']} cambia algo más que tildes/eñes/diéresis (o nada)")
    return [r for r in _CACHE if r["fichero"] == fichero]


def _clave(r):
    return f"{r['fichero']}:{r['id']}.{r['campo']}"


def _registro(obj, r):
    if r["id"] == "-":
        return obj
    if isinstance(obj, dict):
        return obj.get(r["id"])
    if isinstance(obj, list):  # ataques: especie|linea|resultado
        m = [x for x in obj if isinstance(x, dict) and "|".join(str(x.get(k)) for k in ("especie", "linea", "resultado")) == r["id"]]
        return m[0] if len(m) == 1 else None
    return None


def _poner(reg, ruta, r):
    partes = ruta.split(".")
    padre = reg
    for p in partes[:-1]:
        if isinstance(padre, list) and p.isdigit() and int(p) < len(padre):
            padre = padre[int(p)]
        elif isinstance(padre, dict):
            padre = padre.get(p)
        else:
            padre = None
    hoja = partes[-1]
    if isinstance(padre, list) and hoja.isdigit() and int(hoja) < len(padre):
        hoja = int(hoja)
    elif not isinstance(padre, dict):
        sys.exit(f"FAIL ajustes_tildes.tsv: {_clave(r)} no existe")
    actual = padre[hoja] if isinstance(padre, list) else padre.get(hoja)
    if actual != r["valor_origen"]:
        sys.exit(f"FAIL ajustes_tildes.tsv: {_clave(r)} no coincide con el texto de origen")
    padre[hoja] = r["valor_nuevo"]


def aplicar(fichero, obj, traza=None, marcar=True):
    """Aplica las filas de `fichero` sobre `obj` (en sitio). Devuelve cuántas aplicó."""
    n = 0
    for r in filas(fichero):
        reg = _registro(obj, r)
        if reg is None:
            sys.exit(f"FAIL ajustes_tildes.tsv: {_clave(r)}: registro no encontrado")
        _poner(reg, r["campo"], r)
        if marcar and r["id"] != "-" and isinstance(reg, dict):
            reg.setdefault("ajustes_v12", []).append({"campo": r["campo"], "valor_anterior": r["valor_origen"], "origen": fichero,
                                                     "autor": r["autor"], "justificacion": r["justificacion"]})
        if traza is not None:
            traza.append(("ajuste_tildes", f"{fichero}:{r['id']}", r["campo"]))
        n += 1
    return n


def aplicar_tsv(nombre, filas_tsv, traza=None):
    """Filas de un TSV de curado/ (lista de dicts de DictReader): `id` = valor de la primera columna."""
    rs = filas("curado/" + nombre)
    if not rs:
        return filas_tsv
    col0 = next(iter(filas_tsv[0])) if filas_tsv else None
    for r in rs:
        m = [x for x in filas_tsv if x.get(col0) == r["id"]]
        if len(m) != 1 or r["campo"] not in m[0]:
            sys.exit(f"FAIL ajustes_tildes.tsv: {_clave(r)}: fila o columna no encontrada (o ambigua)")
        if m[0][r["campo"]] != r["valor_origen"]:
            sys.exit(f"FAIL ajustes_tildes.tsv: {_clave(r)} no coincide con el texto de origen")
        m[0][r["campo"]] = r["valor_nuevo"]
        if traza is not None:
            traza.append(("ajuste_tildes", f"curado/{nombre}:{r['id']}", r["campo"]))
    return filas_tsv
