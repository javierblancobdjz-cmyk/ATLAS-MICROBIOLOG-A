# Inventario de tablas saneadas: genomas públicos NCBI

Generado el 2026-10-23 a partir de ficheros del Google Drive del autor. Solo contiene
genomas con accession público de NCBI RefSeq (`GCF_`) y tablas de referencia públicas
(UniProt, material tipo de NCBI). Las cepas de colecciones privadas se han eliminado por
fila y por columna, junto con todo lo que se deriva de ellas: comparaciones contra esas
cepas, columnas `*_presente` y `*_num_hits` referidas a ellas, interpretaciones derivadas,
rutas locales, nombres de máquina, identificadores internos de job, run, release y genoma,
y datos de donantes. Si un valor no figura en la fuente, aparece vacío en los CSV y `null`
en el JSON. No se ha añadido ningún dato externo.

**Total: 94 genomas públicos** (ver `genomas_publicos.json`).

| Especie | Genomas |
|---|---|
| *Ligilactobacillus salivarius* | 20 |
| *Bifidobacterium adolescentis* | 16 |
| *Bifidobacterium bifidum* | 14 |
| *Bifidobacterium dentium* | 12 |
| *Lactococcus lactis* subsp. *lactis* | 10 |
| *Lactococcus lactis* subsp. *cremoris* | 8 |
| *Lactococcus lactis* (sin subespecie en la fuente) | 4 |
| *Lactiplantibacillus plantarum* | 5 |
| *Lacticaseibacillus paracasei* | 5 |

**Colisiones de nombre.** En dos genomas públicos (GCF_017743215.1 y GCF_026013725.1),
el nombre de cepa de NCBI coincide con un código interno de una colección privada. Para
que la comprobación automática de códigos internos no dé falsos positivos, se mantienen
todos sus datos, pero el campo `cepa` queda vacío con una nota. El nombre real se puede
consultar en NCBI con el accession.

## Ficheros

### `genomas_publicos.json`
- **Fuente:** consolidado de todas las tablas de abajo.
- **Contenido:** un registro por genoma con `accession`, `especie`, `cepa`,
  `coleccion_deposito` (solo si el nombre de la cepa empieza por un acrónimo de colección
  pública: ATCC, DSM, JCM, LMG, CECT, NCDO, CICC, CNCM…), `nota_nombre` y `fuentes`. El
  bloque `analisis` contiene:
  - `marcadores_atlas`
  - `bagel4`
  - `ani`
  - `checkm2`
  - `abricate`
  - `bakta_marcadores_funcionales_salivarius`
  - `inmunidad_bagel4_contexto`
  - `adhesion_adolescentis`
  - `metadatos_biosample`
  - `priorizacion_salivarius`

  Un bloque es `null` cuando ese análisis no consta para el genoma. En `abricate`, una
  lista vacía significa que el atlas declara la búsqueda hecha y sin hits. El JSON
  también lleva `definiciones_marcadores_atlas`.
- **Genomas:** 94.

### `atlas_marcadores_definicion.csv`
- **Fuente:** `curado_panel.json` (sección `atlas.definicion`).
- **Contenido:** 53 marcadores con sus reglas de detección sobre la anotación Bakta,
  BAGEL4 y seguridad (ABRicate/QPS).
- **Columnas:** id_marcador, origen, grupo, tipo, marcador, que_indica, regla,
  confirmar_con, nota.
- **Eliminado:**
  - Los 11 marcadores de origen "medido": son ensayos de laboratorio hechos solo sobre
    cepas propias y nombran estudios internos.
  - De las notas: una referencia a una cepa propia, el nombre de una persona y un código
    interno de decisión.

### `atlas_marcadores_llamadas_referencias.csv`
- **Fuente:** `curado_panel.json` (`atlas.llamadas`).
- **Contenido:** llamada por genoma y marcador, con estado (completo, parcial, ausente,
  presente o no_medido), valor tal cual en la fuente, evidencia (genes y productos) y
  locus_tags.
- **Genomas:** 72.
- **Columnas:** accession, id_marcador, grupo, estado, valor, evidencia, locus_tags.
- **Eliminado:**
  - Las 26 cepas propias.
  - Los ids internos de genoma.
  - Las secciones de pasaporte, alias, taxonomía, runs, incidencias, diccionarios (con
    rutas), activos y donantes.
- **Nota:** en las referencias, los marcadores BGL e IMM aparecen como `no_medido`, o como
  ausente en algunos BGL.

### `ani_pares_referencias.csv` y `ani_matriz_referencias.csv`
- **Fuente:** `ani_pares.tsv` y `ani_matriz.tsv`. Según los metadatos de runs del curado,
  se calcularon con skani 0.3.1 `triangle --sparse --full-matrix`, que solo informa de los
  pares por encima de umbral. Un 0.00 en la matriz significa par no informado.
- **Pares:** 505 entre genomas públicos.
- **Matriz:** 72 × 72.
- **Columnas de pares:** ref_accession, query_accession, ANI, align_fraction_ref,
  align_fraction_query.
- **Eliminado:**
  - Los 18 genomas propios, con todos sus pares y sus filas y columnas de la matriz.
  - Las rutas locales de los ficheros.
  - Los nombres de secuencia (contigs de ensamblajes propios y descripciones).

### `checkm2_referencias.csv`
- **Fuente:** `checkm2_resumen.csv`, CheckM2 1.1.0.
- **Genomas:** 72.
- **Columnas:** accession, completitud, contaminacion, modelo.
- **Eliminado:** las filas de cepas propias y la columna `fuente`, que contenía un
  identificador interno de job.

### `abricate_hits_referencias.csv`
- **Fuente:** `abricate_hits.csv`. ABRicate 1.4.0 con las bases CARD, ResFinder, VFDB y
  PlasmidFinder.
- **Filas:** 203 hits de 318 en total. El resto pertenece a cepas propias y se eliminó.
- **Columnas:** accession, db, gen, cobertura, identidad, producto, resistencia, contig,
  inicio, fin.

### `bagel4_referencias_ncbi.csv`
- **Fuente:** `REFERENCIAS_NCBI_usadas.csv`.
- **Contenido:** los 35 genomas completos de NCBI elegidos como referencias para BAGEL4.
- **Columnas:** especie, accession, cepa, coleccion_deposito, fuente, descargado, nota.
- **Eliminado:** nada, salvo el nombre de cepa de un genoma con colisión.
- **Nota:** GCF_002162055.1 está en la lista, pero no tiene resultados en las tablas
  BAGEL4.

### `bagel4_referencias_clusters.csv`
- **Fuente:** `BAGEL4_referencias_resumen.csv`. BAGEL4 v1.2 sobre contigs de 5 kb o más.
- **Contenido:** 41 áreas de interés en 25 genomas.
- **Columnas:** accession, especie, contig_AOI, inicio_en_contig, fin_en_contig, hebra,
  tamano_AOI_bp, tamano_contig_bp, mejor_coincidencia, clase, identidad_%, e_value,
  bacteriocinas_en_el_cluster, n_genes_AOI, n_genes_con_asignacion.
- **Eliminado:** la columna `carpeta`. La columna `cepa` se ha sustituido por accession y
  especie.

### `bagel4_referencias_bacteriocinas.csv`
- **Fuente:** `panel_arsenal_datos.json`.
- **Contenido:** 76 péptidos o bacteriocinas detectados en los genomas de referencia, con
  clase, identidad, novedad (conocida, variante, divergente o candidata nueva), longitud y
  coordenadas.
- **Genomas:** 25 con algún péptido, de los 34 de referencia analizados.
- **Columnas:** accession, especie, bacteriocina, clase, identidad_pct, novedad,
  longitud_aa, aoi, inicio, fin.
- **Eliminado:** las 14 cepas propias, la sección de rescate (solo cepas propias) y los
  metadatos con recuentos de propias.

### `bagel4_genes_cluster_referencias.csv`
- **Fuente:** `bagel4_cluster_gene.parquet`.
- **Contenido:** 392 genes en clústeres BAGEL4 de 7 genomas públicos.
- **Columnas:** accession, aoi, contig, gen, inicio, fin, hebra, bacteriocina, anotacion,
  longitud_aa.
- **Eliminado:**
  - Las filas de 14 cepas propias.
  - Las columnas de id interno de clúster, genoma, run y release.

### `inmunidad_proteinas_referencia_uniprot.csv`
- **Fuente:** `INMUNIDAD_referencias_usadas.tsv`.
- **Contenido:** base de 373 proteínas de referencia (UniProt y contexto BAGEL4) usada en
  el cribado de inmunidad y resistencia a péptidos con Prodigal y BLASTP.
- **Genomas:** no aplica; es una base de proteínas. Ese cribado solo se ejecutó sobre
  cepas propias, así que no hay resultados de inmunidad para los genomas públicos.
- **Eliminado:** 4 entradas de inmunidad a colicinas de *E. coli* y *Shigella*. Sus nombres
  contienen un token idéntico a un código interno; son falsos positivos de la comprobación
  y se retiran para que quede limpia.

### `salivarius_bakta_inventario_referencias.csv`
- **Fuente:** `inventario_bakta_salivarius_referencias_y_C*.csv`. Bakta v1.12.0 con la
  base de datos v6.0 full.
- **Genomas:** 17 de *L. salivarius*.
- **Columnas:** accession, cepa, num_features, estado.
- **Eliminado:** la fila de la cepa propia y la columna de rutas locales (unidad de Drive y
  WSL).

### `salivarius_bakta_hits_funcionales_referencias.csv`
- **Fuente:** `tabla_hits_funcionales_bakta_*_vs_referencias.csv`.
- **Contenido:** 2970 hits de anotación Bakta por término del diccionario funcional
  (adhesión, mucina, LPXTG, EPS, pared, bacteriocinas, estrés y carbohidratos).
- **Genomas:** 17.
- **Columnas:** accession, cepa, grupo_funcional, termino_buscado, campo_match, locus_tag,
  gene, product, feature_type, contig, start, end, strand, db_xrefs, prioridad,
  evidencia_literatura, comentario.
- **Eliminado:**
  - Las filas de la cepa propia (160).
  - La columna tipo_cepa.
  - 1 hit de oppA en GCF_014841055.1. Su producto contiene una clasificación TC con un
    token idéntico a un código interno; es un falso positivo y se retira.

### `salivarius_bakta_matriz_presencia_referencias.csv`
- **Fuente:** `matriz_presencia_ausencia_funcional_*_vs_referencias.csv`.
- **Genomas:** 17.
- **Contenido:** una columna por grupo y término. Los valores 0, 1 y 2 se copian tal cual:
  **la codificación no está documentada en la fuente** y no siempre coincide con los
  recuentos de la tabla de hits.
- **Eliminado:** la fila de la cepa propia y las columnas `cepa` y `tipo_cepa`.

### `salivarius_bakta_prevalencia_referencias.csv`
- **Fuente:** `comparativa_*_vs_referencias_clave_funcionalidad.csv`.
- **Contenido:** 79 marcadores con su presencia en 5 referencias clave (CECT 5713, UCC118,
  AR809, IBB3154 y Y20), la prevalencia en las 17 referencias, las cepas con hit y si
  requiere revisión manual.
- **Eliminado:** las columnas de presencia y número de hits de la cepa propia, y
  `interpretacion_preliminar`, que se derivaba de ella.

### `salivarius_diccionario_funcional_nivel1.csv`
- **Fuente:** `diccionario_funcional_literatura_salivarius_nivel1.csv`.
- **Contenido:** 79 términos de búsqueda, sin datos de cepas.
- **Eliminado:** nada.

### `salivarius_genomas_priorizados.csv`
- **Fuente:** `manifest_genomas_priorizados_salivarius.csv`.
- **Contenido:** 17 genomas de *L. salivarius* con su grupo de evidencia y una nota de
  origen o uso.
- **Eliminado:** las columnas redundantes strain_safe y accession_core.

### `adolescentis_metadatos_biosample.csv`
- **Fuente:** `referencias_adolescentis_metadatos.csv`.
- **Contenido:** metadatos BioSample de 15 genomas de *B. adolescentis*.
- **Eliminado:** nada.

### `adolescentis_adhesion_conteos.csv`
- **Fuente:** `adhesion_adolescentis.csv`.
- **Contenido:** recuento de genes de superficie y adhesión (LPXTG, sortasa, Tad/Flp,
  pili) en 15 genomas públicos.
- **Eliminado:** 3 filas de cepas propias.

### `referencias_material_tipo_ncbi.csv`
- **Fuente:** `referencias_tipo.tsv`.
- **Contenido:** 38 ensamblajes de material tipo de NCBI de *Lacticaseibacillus*,
  *Lactiplantibacillus* y *Ligilactobacillus*, usados como referencia para asignar especie
  por ANI. Solo es la lista: no hay resultados por genoma para ellos y no se cuentan en
  los 94.
- **Eliminado:** nada.

## Fuentes revisadas y descartadas
- `identidad_vs_referencias.csv`: identidad tef1 de muestras propias de *Talaromyces*
  frente a secuencias tipo de GenBank. Todos los resultados son de muestras propias y las
  referencias son secuencias marcadoras, no genomas.
- `strain_intelligence.duckdb`: no se pudo descargar porque el conector de Drive falló por
  tamaño.
- Otras tablas encontradas en Drive (resúmenes de cepas propias, ficheros FASTA y
  sesiones BAGEL4 comprimidas) no se bajaron. Son de cepas propias, son datos pesados o
  repiten las tablas de arriba.
