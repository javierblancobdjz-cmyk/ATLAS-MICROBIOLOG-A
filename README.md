# Atlas de microbiota

App web estática para que un microbiólogo explore especies y cepas de la microbiota y de fermentados con uso o potencial de producto, y encuentre patrones entre ellas: qué output comparten, por qué mecanismo, si funciona con la célula muerta y qué llevan en el genoma. Cada afirmación lleva su nivel de evidencia y su fuente.

## Cómo abrirla

- **En línea:** GitHub Pages, rama `main`, carpeta raíz.
- **En local:** desde la raíz del repo, `python3 -m http.server 8765` y abrir `http://localhost:8765/`.

## Qué hay dentro

| Carpeta | Qué contiene |
|---|---|
| `index.html`, `css/`, `js/` | La app. Un módulo por vista; `js/00_core.js` expone `window.Atlas` |
| `data/` | Los JSON que lee la app. Se generan; no se editan a mano |
| `scripts/datos/` | Orquestador y generadores (Python, solo biblioteca estándar), datos curados y la v1.1 congelada |
| `fuentes_publicas/` | Análisis genómicos sobre genomas públicos de NCBI: `drive/` (Bakta, BAGEL4, ABRicate, CheckM2, skani) y `ncbi/` (anotación PGAP de NCBI y ANI con pyskani) |
| `tools/` | Pruebas: contrato de datos, humo de la app y del pivote, medidas de tareas |
| `docs/` | Especificación v2 y seguimiento del proceso |

## Regenerar los datos

```
ATLAS_LISTA_PRIVADA=/ruta/local/lista_privada.txt \
  python3 -I scripts/datos/construir_datos.py --fecha AAAA-MM-DD --publicar
```

Sin `--publicar` construye en `scripts/datos/salidas/AAAAMMDD/` y no toca `data/`. Con `--publicar` exige 0 fallos, incluido el control de privacidad, que lee una lista local de códigos de cepas privadas que nunca se versiona.

## Pruebas

```
python3 -I tools/test_contrato_v12.py
python3 -I tools/test_via_en_fuente.py
python3 -m http.server 8765 &
node tools/humo.mjs http://localhost:8765/
node tools/humo_pivote.cjs
node tools/medir_tareas.cjs
```

## Regla de datos

Repositorio público. Solo entran literatura con PMID, cepas de colecciones públicas y genomas públicos de NCBI. Ninguna cepa propia de colecciones privadas. Lo no medido se muestra como no medido, nunca como ausente.
