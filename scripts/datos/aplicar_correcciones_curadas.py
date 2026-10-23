#!/usr/bin/env python3
"""Aplica correcciones curadas (TSV) sobre data/especies.json. Nada se edita a mano en data/.

Cada fila del TSV: especie, ruta_json (a.b.c), valor_actual_esperado (JSON), valor_nuevo (JSON), fuentes,
justificacion, curador, fecha. Guarda: solo cambia si el valor actual es el esperado; si ya es el nuevo,
lo marca YA_APLICADA (relanzable); si es otro, FAIL y no escribe nada (alguien cambió la curación).
Es el paso 1 de scripts/datos/construir_datos.py: corre sobre la copia de trabajo de data_v1.1 ANTES de generar_v12.py.

Uso: python3 -I scripts/datos/aplicar_correcciones_curadas.py --tsv scripts/datos/curado/<f>.tsv --data DIR --salida-dir DIR --fecha AAAA-MM-DD [--publicar]
Salidas: salidas/especies_corregido_<AAAAMMDD>.json, salidas/correcciones_status_<AAAAMMDD>.tsv;
con --publicar copia el JSON corregido a data/especies.json.
"""
import argparse, json, os, sys
from datetime import date

ap = argparse.ArgumentParser()
ap.add_argument("--tsv", required=True); ap.add_argument("--data", required=True)
ap.add_argument("--salida-dir", required=True); ap.add_argument("--publicar", action="store_true")
ap.add_argument("--fecha", required=True)
A = ap.parse_args()
FALTA = object()

esp = json.load(open(os.path.join(A.data, "especies.json"), encoding="utf-8"))
lines = open(A.tsv, encoding="utf-8").read().splitlines()
cab = lines[0].split("\t")
status, fallos = [], 0
for ln in lines[1:]:
    if not ln.strip():
        continue
    r = dict(zip(cab, ln.split("\t")))
    esperado, nuevo = json.loads(r["valor_actual_esperado"]), json.loads(r["valor_nuevo"])
    keys = r["ruta_json"].split(".")
    node = esp.get(r["especie"])
    if node is None:
        status.append((r["especie"], r["ruta_json"], "FAIL", "especie inexistente")); fallos += 1; continue
    for k in keys[:-1]:
        node = node.setdefault(k, {})
    actual = node.get(keys[-1], None)
    if actual == nuevo:
        status.append((r["especie"], r["ruta_json"], "YA_APLICADA", ""))
    elif actual == esperado:
        node[keys[-1]] = nuevo
        status.append((r["especie"], r["ruta_json"], "OK", r["fuentes"]))
    else:
        status.append((r["especie"], r["ruta_json"], "FAIL", "valor actual distinto del esperado: " + json.dumps(actual, ensure_ascii=False)[:80])); fallos += 1

tag = A.fecha.replace("-", "")
os.makedirs(A.salida_dir, exist_ok=True)
with open(os.path.join(A.salida_dir, "correcciones_status_%s.tsv" % tag), "w", encoding="utf-8") as f:
    f.write("especie\truta_json\testado\tnota\n" + "".join("\t".join(s) + "\n" for s in status))
if fallos:
    print("FAIL: %d filas no aplicables; no se escribe especies.json" % fallos, file=sys.stderr); sys.exit(1)
out = os.path.join(A.salida_dir, "especies_corregido_%s.json" % tag)
txt = json.dumps(esp, ensure_ascii=False, separators=(",", ":"))
open(out, "w", encoding="utf-8").write(txt)
if A.publicar:
    open(os.path.join(A.data, "especies.json"), "w", encoding="utf-8").write(txt)
print("ok %s · %s" % (out, ", ".join("%s=%d" % (k, sum(1 for s in status if s[2] == k)) for k in ("OK", "YA_APLICADA", "FAIL"))), file=sys.stderr)
