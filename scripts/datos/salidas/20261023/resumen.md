# Build de datos del Atlas · 2026-10-23

Qué se corrió: `python3 -I scripts/datos/construir_datos.py --fecha 2026-10-23 --publicar`
sobre scripts/datos/data_v1.1 (congelada), scripts/datos/curado (incluido el lote E9_r2, que sustituye a E9_r1) y fuentes_publicas (drive + ncbi).

## Estado por paso

| paso | estado | s |
|---|---|---|
| 1_correcciones | OK | 0.0 |
| 2_generador | OK | 0.2 |
| 3_genomica | OK | 0.4 |
| 4_rasgos | OK | 0.1 |
| 5_vecinos | OK | 0.1 |
| 6_puerta_cepa | OK | 0.4 |
| 7_control_publico | OK | 17.2 |
| 8_tests | OK | 0.5 |

## Resultado global

- evidencias.json: 204 evidencias y 37 registros de contexto; lotes integrados: E9_r2_20261023 (sustituidos: E9_r1_20261023).
- matriz: 138 celdas · veredictos: 183 · vecinos: 1308 pares.
- genomica.json: 226 genomas con llamadas (62 Bakta, 160 PGAP); 25 de 26 especies con algún análisis; 50 de 83 cepas con perfil (16 vinculadas por nombre: verificar).
- puerta_cepa: 11 cepas con puerta «vivo» abierta.
- sha256 del build: bb853da9d3c8237831fd535f311b104c3433333bd03474c741c55787f7f102e8.
- data/ publicado en esta ejecución: sí.
- data/ del repositorio idéntico byte a byte a este build (sha256 de cada .json): sí.

## Limitaciones declaradas (meta.limitaciones)

- Cobertura de resultados: 35 de los 97 resultados del catálogo no tienen ninguna evidencia curada en este corte. No significa que ninguna bacteria lo consiga: significa que no se ha curado (hueco de curación, no ausencia demostrada). Con cola de PMID localizada en PubMed y sin leer: Candidiasis oral (8 PMID en cola, sin verificar).
- Cobertura genómica: 25 de 26 especies del atlas tienen algún análisis de genomas públicos (4 con los marcadores sobre anotación Bakta; 21 solo con la anotación PGAP de NCBI, donde los marcadores poco fiables sobre PGAP salen «no evaluable con la anotación de NCBI»). 226 genomas públicos con llamadas; 50 de 83 cepas del atlas con perfil de marcadores, de ellas 16 vinculadas por nombre o cepa tipo (verificar). Lo que no se corrió sobre genomas públicos (inmunidad, BAGEL4 fuera de sus genomas, ABRicate en los genomas NCBI) se muestra como no medido, nunca como ausente.
- Alcance de la cepa estrella: la búsqueda en PubMed de CECT 5713 devolvió 20 artículos indexados (E9, 2026-10-23); este corte usa 8 como evidencia.

## Incidencias

- Ninguna: 8 pasos OK.

## Rutas

- status.tsv, sha256.txt, diferencias_v11_v12.tsv, resumen_diferencias_v11_v12.tsv, traza_curacion.tsv, logs/ (este directorio)
- genomica_20261023.json, puerta_cepa_20261023.json, convergencias, diff_rasgos (este directorio)
- trabajo/data: el data/ construido (se copia a data/ solo con --publicar y 0 FAIL)
