#!/usr/bin/env python3
"""Trocea el artefacto monolítico del atlas (HTML único) en la estructura de la app.

Uso: python3 tools/trocear_artefacto.py RUTA_ARTEFACTO.html

Escribe index.html, css/*.css, js/*.js y data/*.json en la raíz del repo.
Solo se usa para la migración inicial desde el artefacto; después la app se edita por ficheros.
"""
import json, re, sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
src = Path(sys.argv[1]).read_text(encoding="utf-8")
lineas = src.split("\n")

# El artefacto publicado envuelve el documento en un esqueleto propio: nos quedamos con el documento interior.
ini = next(i for i, l in enumerate(lineas) if l.strip() == "<!doctype html>")
fin = max(i for i, l in enumerate(lineas) if l.strip() == "</html>" )
doc = lineas[ini:fin + 1]
txt = "\n".join(doc)

# CSS por bloques marcados con /* ==== nombre ==== */
css = re.search(r"<style>\n(.*?)\n</style>", txt, re.S).group(1)
trozos = re.split(r"^/\* ==== (.+?) ==== \*/$", css, flags=re.M)
nombres_css = []
for i in range(1, len(trozos), 2):
    nombre = trozos[i].strip()
    if not nombre.startswith("css/"):
        nombre = "css/20_vecinos.css"  # bloque «Parecidas a esta»
        cuerpo = "/* «Parecidas a esta» (vecinos por parecido · P2) */" + trozos[i + 1]
    else:
        cuerpo = trozos[i + 1]
    (RAIZ / nombre).parent.mkdir(parents=True, exist_ok=True)
    (RAIZ / nombre).write_text(cuerpo.strip("\n") + "\n", encoding="utf-8")
    nombres_css.append(nombre)

# Datos
m = re.search(r'<script type="application/json" id="atlas-data">(.*?)</script>', txt, re.S)
datos = json.loads(m.group(1))
(RAIZ / "data").mkdir(exist_ok=True)
for k, v in datos.items():
    (RAIZ / "data" / f"{k}.json").write_text(json.dumps(v, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

# JS por bloques marcados con // ==== js/nombre ====
js = re.search(r"<script>\n(.*?)\n</script>", txt[m.end():], re.S).group(1)
trozos = re.split(r"^// ==== (js/.+?) ====$", js, flags=re.M)
nombres_js = []
for i in range(1, len(trozos), 2):
    nombre = trozos[i].strip()
    (RAIZ / nombre).parent.mkdir(parents=True, exist_ok=True)
    (RAIZ / nombre).write_text(trozos[i + 1].strip("\n") + "\n", encoding="utf-8")
    nombres_js.append(nombre)

# index.html: cabecera + símbolos + armazón, enlazando ficheros
cab = re.search(r"(<head>.*?)<style>", txt, re.S).group(1)
cuerpo = re.search(r"<body>\n(.*?)\n<script type=\"application/json\"", txt, re.S).group(1)
links = "\n".join(f'<link rel="stylesheet" href="{n}">' for n in nombres_css)
scripts = "\n".join(f'<script src="{n}" defer></script>' for n in nombres_js)
index = f"""<!doctype html>
<html lang="es">
{cab.rstrip()}
{links}
</head>
<body>
{cuerpo}
{scripts}
</body>
</html>
"""
(RAIZ / "index.html").write_text(index, encoding="utf-8")
print("css:", nombres_css)
print("js:", nombres_js)
print("data:", sorted(datos))
