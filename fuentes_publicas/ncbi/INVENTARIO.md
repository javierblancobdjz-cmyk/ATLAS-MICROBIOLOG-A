# Inventario: capa genómica NCBI (PGAP) del atlas

Generado el 2026-10-23 con datos públicos de NCBI: la API Datasets v2 (`dataset_report`) y los
ficheros `*_genomic.gff.gz` (anotación PGAP de RefSeq) y `*_genomic.fna.gz` del FTP.

Amplía las tablas de `fuentes_drive/publico/`, donde 94 genomas tienen anotación Bakta,
a las 26 especies del atlas. Solo contiene genomas RefSeq públicos (`GCF_`). No incluye
ninguna cepa de colecciones privadas.

Este trabajo no incluye AMR, BAGEL4 ni CheckM2 propios. La completitud y la contaminación
son las de CheckM que publica NCBI.

## Ficheros

| Fichero | Filas | Contenido |
|---|---|---|
| `ncbi_genomas.csv` | 161 genomas | Metadatos por genoma: especie del atlas, organismo y cepa en NCBI, cepa del atlas vinculada, motivo de la selección, depósitos en colección, material tipo, nivel, tamaño, GC, contigs, N50, genes, pseudogenes, CheckM de NCBI, comprobación ANI de NCBI y versión y fecha de PGAP. |
| `ncbi_marcadores_llamadas.csv` | 8.533 (161 × 53) | Mismo esquema que `atlas_marcadores_llamadas_referencias.csv` más `anotacion` (`PGAP (NCBI)`) y `fiabilidad_pgap`. En esta tabla `locus_tags` sí va relleno (locus PGAP). |
| `ncbi_validacion_pgap_vs_bakta.csv` | 35 marcadores | Concordancia entre la llamada sobre PGAP y la llamada Bakta en 62 genomas. |
| `ncbi_ani_pares.csv` | 708 pares | ANI con pyskani 0.2.0 (skani 0.3.0) dentro de cada género. |

## Qué se bajó (en `ncbi/descargas/`, que no se publica)

- Informes JSON de la API, cacheados.
- GFF y FNA de 271 ensamblajes (284 MB):
  - Los 160 genomas bacterianos seleccionados.
  - Los 62 genomas con llamada Bakta en `publico/`, para validar.
  - 49 genomas del taxón *S. cristatus*, solo para el cribado ANI de *S. oligofermentans*.
- De *S. cerevisiae* solo se leyeron metadatos.

Los scripts están en `ncbi/scripts/`. `ejecutar_todo.sh` encadena los pasos 01 a 06. Todo
se ejecuta con `python3 -I` y es reejecutable: lo que ya se bajó o calculó se reutiliza.

## Selección de genomas

Para cada especie se aplicó este orden:

1. Las cepas del atlas con accession.
2. La cepa tipo, como material tipo en RefSeq.
3. El genoma de referencia de RefSeq.
4. Las cepas del atlas sin accession encontradas por nombre o depósito en RefSeq. Van
   marcadas con * en la tabla y con `cepa_atlas_por_nombre` en el CSV. El emparejamiento es
   por nombre: hay que verificarlo.
5. Relleno hasta 8 genomas con RefSeq *Complete Genome* o *Chromosome*:
   - Primero las cepas con depósito en colección pública.
   - Después, por CheckM de NCBI (completitud de al menos 90 % y contaminación de 5 % como
     máximo).
   - Se excluyen la misma cepa repetida y los genomas con taxonomía ANI de NCBI distinta de
     OK.

Si no había bastantes candidatos, se usaron borradores. Los que no pasan CheckM llevan
`relleno_refseq_checkm_bajo`.

En *B. adolescentis*, *B. bifidum*, *L. lactis* y *L. salivarius*, que ya tenían 62
genomas Bakta en `publico/`, solo se añadieron las cepas del atlas que faltaban.

| Especie | Nuevos | Completos o cromosoma | Cepas del atlas incluidas | Cepa tipo | Ya en `publico/` | RefSeq (total) |
|---|---|---|---|---|---|---|
| *Akkermansia muciniphila* | 8 | 7 | MucT, GP01, 139 | sí | 0 | 231 |
| *Bifidobacterium adolescentis* | 1 | 0 | HD17T2H | ya en publico/ | 16 | 432 |
| *Bifidobacterium animalis* | 8 | 8 | BB-12\*, HN019\* | sí | 0 | 245 |
| *Bifidobacterium bifidum* | 0 | 0 | ya estaban las 3 (Bakta) | ya en publico/ | 14 | 365 |
| *Bifidobacterium breve* | 8 | 8 | ninguna localizada | sí | 0 | 340 |
| *Bifidobacterium dentium* | 8 | 8 | Bd1\* | sí | 12 | 75 |
| *Bifidobacterium longum* | 8 | 8 | JCM 1217, 35624, BB536, ATCC 15697 | sí | 0 | 916 |
| *Christensenella minuta* | 7 | 4 | DSM 22607\* | sí | 0 | 12 |
| *Clostridium butyricum* | 8 | 8 | MIYAIRI 588\* | sí | 0 | 369 |
| *Enterococcus faecium* | 8 | 8 | ninguna (SF68 no localizada) | sí | 0 | 5.946 |
| *Faecalibacterium duncaniae* | 8 | 2 | A2-165 | sí | 0 | 25 |
| *Faecalibacterium prausnitzii* | 6 | 5 | ATCC 27768, M21/2, SL3/3 | sí | 0 | 149 |
| *Lacticaseibacillus paracasei* | 8 | 8 | ninguna localizada | sí | 5 | 613 |
| *Lacticaseibacillus rhamnosus* | 8 | 7 | ATCC 7469, GG, HN001, GR-1, Lc705, R0011\* | sí | 0 | 458 |
| *Lactiplantibacillus plantarum* | 8 | 6 | ATCC 14917, WCFS1, 299v | sí | 5 | 1.661 |
| *Lactobacillus crispatus* | 8 | 8 | ATCC 33820\* | sí | 0 | 653 |
| *Lactobacillus iners* | 8 | 7 | ninguna en el atlas | sí | 0 | 157 |
| *Lactococcus lactis* | 2 | 1 | ATCC 19435, ATCC 11454 | sí | 22 | 643 |
| *Ligilactobacillus salivarius* | 1 | 0 | DSM 20555 | sí | 20 | 348 |
| *Limosilactobacillus reuteri* | 8 | 8 | DSM 17938\*, ATCC PTA 6475\* (MM4-1A) | sí | 0 | 530 |
| *Propionibacterium freudenreichii* | 8 | 7 | DSM 20271\* (20271T), CIRM-BIA 129\* (ITG P20) | sí | 0 | 144 |
| *Saccharomyces cerevisiae* | 1 | 1 | ninguna (CNCM I-745 no está en RefSeq) | no aplica | 0 | 1 |
| *Streptococcus australis* | 8 | 3 | A12\* («Streptococcus sp. A12» en NCBI) | sí | 0 | 45 |
| *Streptococcus dentisani* | 6 | 0 | 7747\*, 7746\* | sí | 0 | 18 |
| *Streptococcus oligofermentans* | 1 | 1 | ninguna en el atlas | sí (AS 1.3089) | 0 | 50 (taxón *S. cristatus*) |
| *Streptococcus salivarius* | 8 | 6 | K12\*, M18\* | sí | 0 | 412 |

**Cobertura.**
- Las 25 especies bacterianas tienen al menos un genoma, sumando esta capa y `publico/`.
- Este trabajo vincula 39 cepas del atlas: 23 por su accession y 16 por nombre o por ser la
  cepa tipo.
- 32 cepas del atlas siguen sin genoma en RefSeq, ni aquí ni en `publico/`. Entre ellas
  están BB68, 1714, EVC001, M-16V, Shirota, F19, SF68, CTV-05, PS2, Ls-33 y CNCM I-745. La
  lista sale de cruzar `ncbi_genomas.csv` con `cepas.json`.

**Pocos genomas.**
- *S. oligofermentans* tiene 1 genoma.
  - NCBI la agrupa como sinónimo heterotípico de *S. cristatus* (taxid 45634).
  - Se midió el ANI de su cepa tipo AS 1.3089 frente a los otros 49 genomas RefSeq del taxón.
  - 46 dan de 88,3 a 94,4 %, por debajo del 95 %, y uno no supera el filtro de skani (ANI aproximado < 80 %).
    Ninguno de ellos se usó como relleno.
  - Los dos restantes (NCTC 13807 y NBRC 106105) dan 99,97 y 99,98 %: son depósitos de la
    misma cepa tipo y no se repiten.
- *S. dentisani* tiene 6 genomas. NCBI la registra como *S. oralis* subsp. *dentisani*; los
  candidatos con ANI de NCBI «Inconclusive» no se usaron, salvo la cepa 7746 del atlas.
- *F. prausnitzii* tiene 6.
- *C. minuta* tiene 7.

**CheckM bajo.**
- En *F. duncaniae*, NCBI da en torno a un 88 % de completitud a todos los genomas, también
  a la cepa tipo. Se usaron borradores, marcados `relleno_refseq_checkm_bajo`.
- En *S. australis*, 5 genomas de relleno tienen una completitud de 85 a 89 %.
- K12 de *S. salivarius* tiene una contaminación del 8,6 % según NCBI.

## Marcadores

**Semántica.** Se reconstruyó desde las llamadas Bakta existentes y está documentada en
`scripts/marcadores.py`. El mismo código, aplicado a la evidencia Bakta, reproduce estado,
valor y evidencia en 2.170 de 2.170 llamadas.

- Un CDS casa si su gen casa entero con `genes:` o si su producto contiene `producto:` (sin
  distinguir mayúsculas).
- Los pseudogenes cuentan y se marcan `(pseudo)`.
- `valor` = nº de genes distintos. Si un CDS no tiene nombre de gen, cuenta su producto.
- Estado:
  - `completo` si `valor` ≥ mínimo.
  - `parcial` si `valor` está entre 0 y el mínimo.
  - `ausente` si no hay ninguno.
- En «Bacteriocinas», inmunidad, transporte y regulación no suman, aunque dejan el
  marcador en `parcial`. El patrón exacto no está en la fuente; el reconstruido reproduce 84
  de 84 llamadas.
- Los marcadores BGL, IMM y SEGR/V/P/Q quedan `no_medido`, porque no se corrieron BAGEL4,
  ABRicate ni QPS.
- En *S. cerevisiae* los 53 marcadores son `no_aplica`.

**Sinónimos PGAP añadidos.** Solo se añadieron 3, porque la validación los justifica. En
los tres casos es el mismo nombre escrito de otra forma, o la familia GH que nombra el
propio marcador:

| Marcador | Sinónimo | Concordancia |
|---|---|---|
| SEG03 | `^putative ornithine decarboxylase$` | de 72,6 a 100 % |
| FIB01 | `glycoside hydrolase family 32` | de 59,7 a 83,9 % |
| FIB03 | `alpha amylase` | de 67,7 a 95,2 % |

Se probaron y se descartaron:
- LAC01 con `glycoside hydrolase family 2`: la GH2 no es específica de la lactosa.
- HMO01 con `family 20 glycosylhydrolase`: añade un falso positivo.

## Fiabilidad de cada marcador sobre PGAP

La validación se hizo en 62 genomas: 17 *L. salivarius*, 15 *B. adolescentis*, 12
*B. bifidum* y 18 *L. lactis*. Un marcador es `poco_fiable` en dos casos:
- La concordancia de estado es menor del 80 %.
- Hay al menos 3 genomas positivos y, entre ellos, la concordancia de positivos es menor del
  80 %.

**Fiables (16).** ACI01, ACI02, BAC04, BAC05, ANT01, ADH01, VIT02, VIT03, LAC01, FIB02,
FIB03, FIB04, HMO02, CRI01, SEG03 y SEG04. BAC04 queda en el límite,
con un 81 % en positivos. La concordancia de estado de los fiables va de 90,3 a 100 %.

**No evaluables (5).** LIP01, OXA01, TAN01, SEG01 y SEG02 concuerdan al 100 %, pero no hay
ningún positivo en ninguna de las dos anotaciones.

**Poco fiables (14).** Se deben a nombres distintos entre los dos anotadores:

| Marcador | Concordancia | Causa |
|---|---|---|
| SAL01 | 71 % | PGAP llama «choloylglycine hydrolase family protein» a la PVA que Bakta llama `yxeI`. Esto da BSH en las 18 *L. lactis*. Concuerda al 100 % en bífidos y *L. salivarius*. |
| SAL02 | 57 % | PGAP no usa `yxeI` ni «penicillin acylase». |
| BAC01 | 73 % | PlnI aparece como «CPBP family intramembrane glutamic endopeptidase». |
| BAC02 | 84 %, 0 % en positivos | Abp118 aparece como «Blp family class II bacteriocin» (ese péptido lo recoge BAC05). |
| BAC03 | 50 % en positivos | «class III lanthionine synthetase LanKC» en 7 *L. lactis*. |
| ADH02 | 74 % | «Rqc2 family fibronectin-binding protein» en *L. lactis*. |
| ADH03 | 39 % | «SpaA isopeptide-forming pilin-related protein» en 38 genomas. |
| ADH04 | 76 % | «COG1361 S-layer family protein» en *B. adolescentis*. |
| EPS01 | 65 % | PGAP pone menos nombres de gen (`cps`, `eps`). |
| VIT01 | 76 % | Solo difiere en `parcial`: Bakta tiene `ribD` aislado. En `completo` concuerda al 100 %. |
| VIT04 | 42 % | Bakta casa «Cobalamin-independent…» y PGAP no. |
| FIB01 | 79 % en positivos | Con el sinónimo GH32 sigue fallando en *B. bifidum*. |
| HMO01 | 52 % en positivos | `chb: Lacto-N-biosidase` de Bakta en *L. lactis* sale como «family 20 glycosylhydrolase» en PGAP. |
| SEG05 | 0 % en positivos | PGAP llama `dld: D-lactate dehydrogenase` a la deshidrogenasa FAD en *L. lactis*. |

La columna `concordancia_por_especie` del CSV muestra en qué especie falla cada marcador.
Por otro lado, una auditoría previa del atlas (E2) ya consideró varias reglas defectuosas
incluso sobre Bakta (VIT01/02/04, EPS01, BAC01/03/04, HMO01, FIB01/02/04): `fiable` aquí
solo significa que PGAP y Bakta coinciden.

## ANI

- **Herramienta.** pyskani 0.2.0, que lleva skani 0.3.0 y se instaló con pip.
- **Control.** Se recalcularon 460 pares de `ani_pares_referencias.csv` (skani 0.3.1). La
  diferencia media es 0,000, es decir, valores idénticos.
- **Pares calculados.** Todos los pares dentro de un género en los que entra al menos un
  genoma nuevo.
- **Resultado.**
  - 708 pares informados: 596 de la misma especie del atlas y 112 entre especies del mismo
    género.
  - 1.538 pares quedan sin informar porque no superan el filtro de skani (~80 %), igual que
    en `--sparse`.
- **Pares de la misma especie por debajo del 95 %.**
  - *S. australis* A12 frente al resto: de 93,6 a 94,6 %. Encaja con la nota del atlas de
    «posible especie nueva».
  - *S. dentisani*: de 91,7 a 96,8 %.
  - *S. salivarius* K12: de 94,0 a 95,0 %.
  - *B. longum* subsp. *infantis* frente a subsp. *longum*: de 94,8 a 94,9 %.
  - *E. faecium* ENCfa-68: de 94,5 a 95,0 %.
  - Dentro de *L. lactis* sale 87,6 % entre *lactis* y *cremoris*; NCBI ya las separa como
    especies.

## Límites

- Las llamadas PGAP **no son intercambiables** con las Bakta en los 14 marcadores poco
  fiables. Hay que usar `fiabilidad_pgap`.
- La presencia de un gen no demuestra la función.
- El emparejamiento por nombre de las cepas marcadas con \* no está verificado contra
  `cepas.json`.
- La selección de relleno es eficiente, no representativa de la diversidad de cada especie.
- PGAP varía entre versiones (6.7 a 6.11).

**Privacidad.**
El grep de códigos internos de colecciones privadas (la misma lista de palabras que se usó
en `publico/`) no devuelve nada sobre esta carpeta. El patrón no se copia aquí para que el
propio inventario no lo dispare. Ningún nombre de cepa NCBI de la selección coincide con
esos códigos, así que no hubo que vaciar ningún campo `cepa`; el script lo haría y lo
anotaría en `nota_nombre`.
