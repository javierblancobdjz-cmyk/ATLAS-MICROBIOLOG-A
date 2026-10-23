#!/usr/bin/env python3
"""Orquestador único de datos del Atlas (P1-01). Sustituye a tools/integrar_datos.sh.

Uso:
    ATLAS_LISTA_PRIVADA=/ruta/local/lista.txt python3 -I scripts/datos/construir_datos.py --fecha AAAA-MM-DD [--publicar]

Reconstruye TODO data/ desde lo versionado, sin pasos manuales:
    scripts/datos/data_v1.1/   (v1.1 congelada, intocable)
    scripts/datos/curado/      (TSV/JSON de curación, lotes verificados de E9, correcciones de E6, vocabulario de E5)
    fuentes_publicas/          (drive/: análisis de Javier sobre genomas públicos; ncbi/: ampliación RefSeq/PGAP)

Pasos, en este orden (cada uno con su log; status.tsv con paso, estado OK/FAIL/SALTADO y segundos):
    1. correcciones   aplicar_correcciones_curadas.py (E6) sobre especies de la copia de trabajo de data_v1.1
    2. generador      generar_v12.py (E1 + lote E9 r2): evidencias, celdas, matriz, catálogo, veredictos, ataques
    3. genomica       derivar_genomica.py (E2 + parche E6 + campos E4 + ampliación NCBI) -> genomica.json
    4. rasgos         rasgos_v12.py (E5, con cepas_en_contra) -> especies.rasgos y catalogo.vocabulario_rasgos
    5. vecinos        vecinos_v12.py (E1 + parche E5), que ya lee los rasgos v1.2
    6. puerta_cepa    build_puerta_cepa.py (E6) + cierre del generador (puerta de cepa en veredictos, meta.limitaciones)
                      + tabla de diferencias v1.1 -> v1.2 + sha256 del build en meta
    7. control        control_publico.py (lista local de códigos privados; sin ella, FAIL)
    8. tests          tools/test_contrato_v12.py y tools/test_via_en_fuente.py sobre el data/ construido

Salidas: scripts/datos/salidas/AAAAMMDD/{status.tsv, sha256.txt, diferencias_v11_v12.tsv, resumen.md, logs/, ...} y la
copia de trabajo en salidas/AAAAMMDD/trabajo/data. Sin --publicar, data/ no se toca. Con --publicar, data/ se reemplaza
por el build SOLO si los 8 pasos dan OK (los .json que el build no produce, p. ej. busqueda.json, se retiran de data/).
Determinista: dos ejecuciones con la misma --fecha dan data/*.json idénticos byte a byte.
"""
import argparse, hashlib, json, os, shutil, subprocess, sys, time
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent.parent
PY = [sys.executable, "-I"]


def sha_fichero(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 16), b""):
            h.update(b)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fecha", required=True, help="AAAA-MM-DD: fecha del build (no se toma del reloj)")
    ap.add_argument("--publicar", action="store_true")
    a = ap.parse_args()
    tag = a.fecha.replace("-", "")
    SAL = AQUI / "salidas" / tag
    TRAB = SAL / "trabajo"
    ENT, DAT, LOG = TRAB / "entrada", TRAB / "data", SAL / "logs"
    if TRAB.exists():
        shutil.rmtree(TRAB)
    for d in (ENT, DAT, LOG):
        d.mkdir(parents=True, exist_ok=True)
    for p in sorted((AQUI / "data_v1.1").glob("*.json")):
        shutil.copyfile(p, ENT / p.name)

    def cierre():
        # puerta de cepa en los veredictos de cepa + meta.limitaciones (cifras de genomica.json y catalogo.json)
        r = [PY + [str(AQUI / "generar_v12.py"), "--cierre", str(DAT)],
             PY + [str(AQUI / "diferencias_v11_v12.py"), str(AQUI / "data_v1.1"), str(DAT), str(SAL / "diferencias_v11_v12.tsv"),
                   str(SAL / "resumen_diferencias_v11_v12.tsv")]]
        return r

    pasos = [
        ("1_correcciones", [PY + [str(AQUI / "aplicar_correcciones_curadas.py"), "--tsv", str(AQUI / "curado" / "correcciones_seguridad_regulatorio_20261023.tsv"),
                                  "--data", str(ENT), "--salida-dir", str(SAL), "--fecha", a.fecha, "--publicar"]]),
        ("2_generador", [PY + [str(AQUI / "generar_v12.py"), "--entrada", str(ENT), "--salida", str(DAT), "--hoy", a.fecha, "--trazas", str(SAL)]]),
        ("3_genomica", [PY + [str(AQUI / "derivar_genomica.py"), "--fuentes", str(RAIZ / "fuentes_publicas"), "--data", str(DAT),
                              "--salida-dir", str(SAL), "--fecha", a.fecha, "--publicar", str(DAT / "genomica.json")]]),
        ("4_rasgos", [PY + [str(AQUI / "rasgos_v12.py"), "--data", str(DAT), "--genomica", str(DAT / "genomica.json"),
                            "--curado", str(AQUI / "curado"), "--salida", str(SAL), "--fecha", tag, "--en-sitio"]]),
        ("5_vecinos", [PY + [str(AQUI / "vecinos_v12.py"), "--data", str(DAT)]]),
        ("6_puerta_cepa", [PY + [str(AQUI / "build_puerta_cepa.py"), "--data", str(DAT), "--salida-dir", str(SAL), "--fecha", a.fecha]] + cierre()),
        ("7_control_publico", [PY + [str(AQUI / "control_publico.py"), "--data", str(DAT), "--raiz", str(RAIZ)]]),
        ("8_tests", [PY + [str(RAIZ / "tools" / "test_contrato_v12.py"), str(DAT)],
                     PY + [str(RAIZ / "tools" / "test_via_en_fuente.py"), "--data", str(DAT), "--curado", str(AQUI / "curado")]]),
    ]
    status, fallo = [], False
    for nombre, cmds in pasos:
        if fallo:
            status.append((nombre, "SALTADO", "0.0"))
            continue
        t0 = time.time()
        ok = True
        with open(LOG / f"{nombre}.log", "w", encoding="utf-8") as lg:
            for c in cmds:
                lg.write("$ " + " ".join(os.path.relpath(x, RAIZ) if x.startswith(str(RAIZ)) else x for x in c[2:]) + "\n")
                lg.flush()
                r = subprocess.run(c, cwd=str(RAIZ), stdout=lg, stderr=subprocess.STDOUT, env=os.environ.copy())
                if r.returncode != 0:
                    ok = False
                    lg.write(f"\n[código de salida {r.returncode}]\n")
                    break
            if ok and nombre == "6_puerta_cepa":
                sello_build(DAT, a.fecha, lg)
        status.append((nombre, "OK" if ok else "FAIL", f"{time.time() - t0:.1f}"))
        print(f"{nombre:20s} {'OK' if ok else 'FAIL'}")
        if not ok:
            fallo = True
            print(open(LOG / f"{nombre}.log", encoding="utf-8").read()[-3000:], file=sys.stderr)

    with open(SAL / "status.tsv", "w", encoding="utf-8") as f:
        f.write("paso\testado\tsegundos\n" + "".join("\t".join(s) + "\n" for s in status))
    n_fail = sum(1 for s in status if s[1] != "OK")
    salida_json = sorted(DAT.glob("*.json"))
    escribir_sha(SAL, salida_json)
    publicado = False
    if a.publicar:
        if n_fail:
            print(f"NO se publica: {n_fail} pasos sin OK. data/ queda como estaba.", file=sys.stderr)
        else:
            dst = RAIZ / "data"
            nuevos = {p.name for p in salida_json}
            for p in sorted(dst.glob("*.json")):
                if p.name not in nuevos:
                    p.unlink()
            for p in salida_json:
                shutil.copyfile(p, dst / p.name)
            publicado = True
    escribir_resumen(SAL, a.fecha, status, DAT, publicado, a.publicar)
    print(f"status: {sum(1 for s in status if s[1] == 'OK')}/8 OK · publicado: {'sí' if publicado else 'no'} · {SAL.relative_to(RAIZ)}")
    return 1 if n_fail else 0


def sello_build(DAT, fecha, lg):
    """meta.construccion: fecha, orquestador, pasos y sha256 del build (sobre todos los data/*.json salvo meta)."""
    mp = DAT / "meta.json"
    meta = json.loads(mp.read_text(encoding="utf-8"))
    h = hashlib.sha256()
    for p in sorted(DAT.glob("*.json")):
        if p.name != "meta.json":
            h.update(p.name.encode() + b"\0" + sha_fichero(p).encode() + b"\n")
    meta["construccion"] = {
        "fecha": fecha, "orquestador": "scripts/datos/construir_datos.py",
        "pasos": ["aplicar_correcciones_curadas", "generar_v12", "derivar_genomica", "rasgos_v12", "vecinos_v12",
                  "build_puerta_cepa + cierre", "control_publico", "tests"],
        "entradas": ["scripts/datos/data_v1.1", "scripts/datos/curado", "fuentes_publicas"],
        "sha256_build": h.hexdigest(),
        "sha256_que_es": "sha256 de la lista (nombre, sha256) de todos los data/*.json salvo meta.json",
    }
    mp.write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    lg.write(f"sha256_build {meta['construccion']['sha256_build']}\n")


def escribir_sha(SAL, salida_json):
    entradas = []
    for base in (AQUI / "data_v1.1", AQUI / "curado", RAIZ / "fuentes_publicas"):
        entradas += [p for p in sorted(base.rglob("*")) if p.is_file()]
    entradas += sorted(p for p in AQUI.glob("*.py"))
    entradas += [RAIZ / "tools" / "test_contrato_v12.py", RAIZ / "tools" / "test_via_en_fuente.py"]
    with open(SAL / "sha256.txt", "w", encoding="utf-8") as f:
        f.write("# entradas\n")
        for p in entradas:
            f.write(f"{sha_fichero(p)}  {p.relative_to(RAIZ)}\n")
        f.write("# salidas (data/)\n")
        for p in salida_json:
            f.write(f"{sha_fichero(p)}  data/{p.name}\n")


def data_coincide(DAT):
    """¿data/ del repositorio es exactamente este build? (mismo conjunto de .json y mismo sha256 en cada uno)."""
    dst = RAIZ / "data"
    a = {p.name: sha_fichero(p) for p in sorted(DAT.glob("*.json"))}
    b = {p.name: sha_fichero(p) for p in sorted(dst.glob("*.json"))}
    return a == b


def escribir_resumen(SAL, fecha, status, DAT, publicado, pidio_publicar):
    L = [f"# Build de datos del Atlas · {fecha}", "",
         "Qué se corrió: `python3 -I scripts/datos/construir_datos.py --fecha " + fecha + (" --publicar`" if pidio_publicar else "`"),
         "sobre scripts/datos/data_v1.1 (congelada), scripts/datos/curado (incluido el lote E9_r2, que sustituye a E9_r1) y fuentes_publicas (drive + ncbi).", "",
         "## Estado por paso", "", "| paso | estado | s |", "|---|---|---|"]
    L += [f"| {a} | {b} | {c} |" for a, b, c in status]
    try:
        J = lambda k: json.loads((DAT / f"{k}.json").read_text(encoding="utf-8"))
        meta, ev, mat, ver, g, pc, vec = J("meta"), J("evidencias"), J("matriz"), J("veredictos"), J("genomica"), J("puerta_cepa"), J("vecinos")
        from collections import Counter
        tipo = Counter(e.get("tipo") for e in ev.values())
        tab = {x["clave"]: x["valor"] for x in g["cobertura"]["tabla"]}
        verdes = sum(1 for c in pc["cepas"].values() if c["puerta_por_forma"]["vivo"]["estado"] == "abierta")
        L += ["", "## Resultado global", "",
              f"- evidencias.json: {tipo['evidencia']} evidencias y {tipo['contexto']} registros de contexto; lotes integrados: {', '.join(meta.get('lotes_integrados') or [])}"
              f" (sustituidos: {', '.join(meta.get('lotes_sustituidos') or []) or 'ninguno'}).",
              f"- matriz: {sum(len(d) for d in mat.values())} celdas · veredictos: {len(ver)} · vecinos: {sum(len(x) for x in vec.values())} pares.",
              f"- genomica.json: {tab.get('genomas_con_llamadas')} genomas con llamadas ({tab.get('genomas_bakta')} Bakta, {tab.get('genomas_pgap')} PGAP); "
              f"{tab.get('especies_con_analisis')} de {tab.get('especies_atlas')} especies con algún análisis; {tab.get('cepas_con_perfil')} de {tab.get('cepas_atlas')} cepas con perfil "
              f"({tab.get('cepas_vinculadas_por_nombre')} vinculadas por nombre: verificar).",
              f"- puerta_cepa: {verdes} cepas con puerta «vivo» abierta.",
              f"- sha256 del build: {(meta.get('construccion') or {}).get('sha256_build')}.",
              f"- data/ publicado en esta ejecución: {'sí' if publicado else 'no'}"
              + ("" if publicado or not pidio_publicar else " (se pidió --publicar y hubo pasos sin OK)") + ".",
              f"- data/ del repositorio idéntico byte a byte a este build (sha256 de cada .json): {'sí' if data_coincide(DAT) else 'NO'}."]
        L += ["", "## Limitaciones declaradas (meta.limitaciones)", ""] + [f"- {x['texto']}" for x in meta.get("limitaciones") or []]
    except Exception as ex:  # el resumen nunca oculta un FAIL: si el build no llegó al final, lo dice
        L += ["", f"Resumen parcial: el build no llegó al final ({type(ex).__name__})."]
    L += ["", "## Incidencias", ""]
    fallos = [s for s in status if s[1] != "OK"]
    L += [f"- {a}: {b} (ver logs/{a}.log)" for a, b, _ in fallos] or ["- Ninguna: 8 pasos OK."]
    L += ["", "## Rutas", "", "- status.tsv, sha256.txt, diferencias_v11_v12.tsv, resumen_diferencias_v11_v12.tsv, traza_curacion.tsv, logs/ (este directorio)",
          "- genomica_" + fecha.replace("-", "") + ".json, puerta_cepa_" + fecha.replace("-", "") + ".json, convergencias, diff_rasgos (este directorio)",
          "- trabajo/data: el data/ construido (se copia a data/ solo con --publicar y 0 FAIL)"]
    (SAL / "resumen.md").write_text("\n".join(L) + "\n", encoding="utf-8")


if __name__ == "__main__":
    sys.exit(main())
