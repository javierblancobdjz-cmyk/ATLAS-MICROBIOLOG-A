# Atlas de microbiota

App web estática para que un microbiólogo explore especies y cepas de la microbiota y de fermentados con uso o potencial de producto, y busque patrones entre ellas. Cada afirmación lleva su nivel de evidencia y su fuente.

## Cómo abrirla

- **En línea:** GitHub Pages, rama `main`, carpeta raíz.
- **En local:** desde la raíz del repo, `python3 -m http.server 8765` y abrir `http://localhost:8765/`.

## Estructura

| Carpeta | Qué contiene |
|---|---|
| `index.html` | Armazón de la página y símbolos SVG |
| `css/` | Tokens de diseño (`00_kit.css`) y estilos de la app |
| `js/` | Un módulo por vista; `00_core.js` expone `window.Atlas` |
| `data/` | Un JSON por bloque de datos; la app los carga al arrancar |
| `tools/` | Utilidades: troceado del artefacto original y prueba de humo |

## Regla de datos

Repositorio público. Solo entran cepas de literatura, colecciones públicas y genomas públicos (NCBI). Ninguna cepa propia de colecciones privadas.

## Prueba de humo

```
python3 -m http.server 8765 &
node tools/humo.mjs http://localhost:8765/
```
