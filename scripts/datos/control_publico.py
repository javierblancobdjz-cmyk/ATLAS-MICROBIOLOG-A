#!/usr/bin/env python3
"""Control de privacidad antes de publicar (paso 7 de scripts/datos/construir_datos.py).

Uso: ATLAS_LISTA_PRIVADA=/ruta/local/lista.txt python3 -I scripts/datos/control_publico.py --data DIR_DATA [--raiz REPO]

La lista de códigos privados (una por línea; # comenta) vive FUERA del repositorio y no se versiona. Sin ella el
control falla: el orquestador no publica. Busca cada código como palabra completa (sin distinguir mayúsculas) en:
  * DIR_DATA/*.json (lo que se va a publicar),
  * TODO el repositorio: cualquier fichero de texto bajo REPO (data/, fuentes_publicas/, scripts/ con salidas/ incluidas,
    tools/, js/, css/, docs/, index.html...), salvo .git/, node_modules/ y __pycache__/.
Un fichero binario (imagen, fuente, pdf) no se puede revisar como texto: se lista como aviso. Cualquier otro fichero que
no sea UTF-8 válido cuenta como fallo (no se publica lo que no se ha podido revisar).
Además exige que no exista busqueda.json ni perfil_cepa.json en DIR_DATA (retirados en v2).
Nunca escribe ni imprime los códigos: solo fichero, línea y número de coincidencias. Sale con 1 si hay alguna.
"""
import argparse, os, re, sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
BINARIO = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".woff", ".woff2", ".ttf", ".otf", ".pyc"}
EXCLUIR = {".git", "node_modules", "__pycache__"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--raiz", default=str(AQUI.parent.parent))
    a = ap.parse_args()
    ruta = os.environ.get("ATLAS_LISTA_PRIVADA")
    if not ruta or not os.path.isfile(ruta):
        print("FAIL: falta ATLAS_LISTA_PRIVADA (lista local de códigos privados): no se puede publicar sin control", file=sys.stderr)
        return 1
    with open(ruta, encoding="utf-8") as f:
        codigos = sorted({l.strip() for l in f if l.strip() and not l.lstrip().startswith("#")}, key=len, reverse=True)
    if not codigos:
        print("FAIL: la lista de códigos privados está vacía", file=sys.stderr)
        return 1
    pat = re.compile("|".join(r"(?<![A-Za-z0-9])" + re.escape(c) + r"(?![A-Za-z0-9])" for c in codigos), re.I)
    raiz, data = Path(a.raiz).resolve(), Path(a.data).resolve()
    ficheros, vistos, binarios = [], set(), []
    for p in sorted(data.glob("*.json")) + sorted(raiz.rglob("*")):
        if not p.is_file() or EXCLUIR & set(p.relative_to(raiz).parts if p.is_relative_to(raiz) else p.parts):
            continue
        rp = p.resolve()
        if rp in vistos:
            continue
        vistos.add(rp)
        if p.suffix.lower() in BINARIO:
            binarios.append(p)
        else:
            ficheros.append(p)
    fallos = 0
    for p in ficheros:
        try:
            lineas = p.read_text(encoding="utf-8").splitlines()
        except (OSError, UnicodeDecodeError) as ex:
            print(f"FAIL: no se pudo revisar como texto {p}: {type(ex).__name__}", file=sys.stderr)
            fallos += 1
            continue
        for i, l in enumerate(lineas, 1):
            n = len(pat.findall(l))
            if n:
                fallos += n
                print(f"COINCIDENCIA: {p} línea {i}: {n} código(s) privado(s)", file=sys.stderr)
    for retirado in ("busqueda.json", "perfil_cepa.json"):
        if (data / retirado).exists():
            print(f"FAIL: {retirado} no debe publicarse (retirado en v2)", file=sys.stderr)
            fallos += 1
    for p in binarios:
        print(f"AVISO: binario no revisable como texto: {p.relative_to(raiz) if p.is_relative_to(raiz) else p}")
    print(f"control_publico: {len(codigos)} códigos, {len(ficheros)} ficheros de texto revisados (todo el repositorio y {data}), "
          f"{len(binarios)} binarios listados, {fallos} coincidencias o fallos")
    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(main())
