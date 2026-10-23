# Especificación v2 del Atlas

Cerrada por el director tras dos rondas con nueve especialistas, a partir de seis consultores que usaron la app en casos reales. Es la entrada de la implementación.

## Por qué está conforme

Cierro la especificación, pero el prototipo integrado (proto_E7 / proto_E8_r2) NO se puede publicar tal cual. Lo he comprobado en los datos y todavía contiene los cuatro errores que rechacé en la ronda 1. Motivo: el lote r2 de E9 nunca llegó al generador, y cuando lo conecto, el generador se rompe.

**Qué está resuelto, verificado por mí en proto_E7/data:**
- La celda CECT 5713 × s_mutans da funciona_inactivada {k: si, «Sí, célula inactivada (calor)»} y mecanismo.requiere_viabilidad = no.
- Hay 0 celdas con mecanismo.funciona_inactivada.
- Celdas con las tres formas iguales: 0 de 138. Valores de funciona_inactivada: np 112 / si 13 / frac 7 / ferm 5 / nulo 1, y ningún «No».
- El estado hueco_sin_mecanismo ha desaparecido.
- Veredictos: 183, con la puerta de seguridad normalizada (sin_bloqueo 128 / a_revisar 55). Veredicto de CECT 5713 oral posbiótico: «prometedora». Veredicto de la especie: «especulativa · una sola cepa».
- vecinos.json: 0 frases «pero esta actúa». PS2 (0,279) queda por delante de DSM 20555 (0,15).
- test_contrato_v12.py: 0 fallos.
- genomica.json: CECT 5713 con BSH = I, SIALIDASA = I y refutado_en_ensayo (ev008), y ABP118 porta_no_produce. L. salivarius sale con BSH 15/17 + 2 I y LOX 9/17. 15 marcadores, sin VIT.
- puerta_cepa: en vivo, 11 abiertas = las 11 cepas medidas, 53 no_medido. DSMZ16671 sale sin_accesion.
- Medidas de E7 en el navegador: T1 de 4 a 1 clic, T2 de 7 a 2, T3 de 6 a 2.

**Qué NO está resuelto, también verificado:**

(1) **E9 · exigencia 6 (entrar por el pipeline).** E1 integró el lote E9_r1, así que en los datos integrados siguen estos errores:
- lacticaseibacillus-paracasei.ev007 es evidencia de ESPECIE (alcance especie_con_limite, +, CEL), y es la ÚNICA fuente del mecanismo de la celda paracasei|s_mutans y de M41.
- ev010 lleva forma «vivo» y dirección «0».
- ev015 lleva alcance «cepa», no «mezcla».
- streptococcus-dentisani.ev005 sigue con forma «vivo».
- relacion es null en 234 de 241 registros.
- meta.limitaciones está vacío.

Monté proto_director con el lote r2 y generar_v12.py falla con TypeError en celda(), por sorted({e["forma"]}) con forma = None. Además, el generador ignora `contexto_nuevo`, `relacion`, `relacion_obs.tsv`, `alcance = mezcla` y `sustituye_a`. El contenido del lote r2 es correcto y lo he revisado fila a fila. Lo que falta es el código que lo consume, y eso es P1-01.

(2) **E4 → E2.** Las tres correcciones de E4 no están en genomica.json. eps_glicosiltransferasas_n sigue en 11 (son 7 GT + 4 de polisacárido), y eps_polisacarido_n y dlt_n están en null.

(3) **E5.** El rasgo «bacteriocina» de L. salivarius pone a CECT 5713 en `cepas` apoyándose en ev011, cuya dirección es «-». E7 lo tapa en pantalla con un «No:», pero el dato es falso.

(4) **Parche de vecinos de E5.** No está integrado: siguen 37 «mismo rasgo» por el lactato de criterio propio. Además, la frase de E1 dice «CECT 5713 con mecanismo identificado (exclusión)» cuando el determinante es desconocido, lo que se contradice con la propia celda.

(5) **E4 · perfil_cepa.** Lo genera un TSV llamado «fusionado_demo». Ancla la propiedad a ev013b (OBS, piloto sin control) en vez de ev013a, y su prosa dice «1 de 197», que ya es falsa. Lo descarto como artefacto propio y su contenido pasa a la tarjeta M35 del catálogo.

(6) **E3.** Su TSV de reglas no existe en disco, por segunda ronda. No pasa nada, porque E2 ya implementa los 5 estados y los cuatro casos de prueba dan lo esperado (UCC118 porta_y_produce, CECT 5713 porta_no_produce, KF147 no_porta con restos, AR809 porta_sin_ensayo). Pero la regla de borde de contig y la nota «regulador no medido» no están implementadas, y quedan en P2.

(7) **integrar_datos.sh.** No es reproducible de punta a punta: el paso 2 copia una salida de E5 precalculada en vez de ejecutarla. Lo sustituye un orquestador único.

**Resumen por especialista:**
- E1: 6/7 resueltas (la subclase de bacteriocina queda como criterio propio, aceptado).
- E2: 4/5 (el traslado a scripts/ se hace en la integración).
- E3: aceptada en contenido; el entregable lo absorbe E2.
- E4: resuelta en su prototipo y no integrada.
- E5: 5/5 en su prototipo, con un error de datos y el parche de vecinos sin aplicar.
- E6: resuelta e integrada.
- E7: resuelta y medida.
- E8: resuelta, pero sus cifras de s_mutans (3 filas «muerta», la fila de especie L. paracasei) dependen de ev007 r1 y cambiarán a 2 filas.
- E9: contenido correcto, integración no hecha.

Nada de esto exige otra ronda de especialistas: son trabajos de integración con criterios comprobables, y van en P1.

## Principios

- Los datos se construyen fuera de la app y la app solo los lee. Un orquestador Python (solo biblioteca estándar) reconstruye todo data/ desde data_v1.1 congelado, curado/*.tsv, los lotes y fuentes_publicas/. Nada se edita a mano en data/. Si un dato no se puede regenerar, no entra.
- Una fuente por dato. El fenotipo vive en evidencias.json. Las llamadas genómicas por genoma, en genomica.json. Las reglas de venta por cepa × forma, en puerta_cepa.json. El mecanismo, en evidencia.mecanismo y catalogo.mecanismos. Ninguna vista recalcula lo que ya calcula un script, salvo muerta(), y su paridad con Python se prueba.
- La ignorancia nunca se pinta como un cero. NM (no medido), I (indeterminado), np (no probada), sin_curar, no_calculado y forma no declarada son estados con texto propio y estilo gris discontinuo. Ninguna columna dice «No» por falta de ensayo. `parcial` nunca cuenta como presencia.
- Cepa ≠ especie, con número. Ninguna evidencia de una cepa sube a la especie como logro: la regla C1 se aplica a todos los veredictos. Un rasgo genómico se dice con n/N + i sobre genomas públicos y su lectura (constante de especie / varía entre cepas / sin resolver / no medido). Una mezcla de cepas no cuenta para ninguna de ellas.
- El mecanismo es un campo. Cada evidencia lleva clase, base (causal / observado / inferencia / predicción genómica), determinante (identificado / desconocido) y requiere_viabilidad. Una celda o fila coloreada con determinante desconocido lo dice en el texto («det. ?»). Una hipótesis no se muestra sin su `lo_refutaria`.
- «¿Funciona muerta?» se deriva de forma + dirección con 5 valores: Sí célula inactivada / Sí fracción / probada sin efecto / solo fermentado / no probada. Es el eje de producto y va en la matriz, en el pivote y en la tira de formas.
- Una pregunta, un componente. Hay un solo pivote (#/lineas), una sola tira de formas por ficha (que sustituye al modo pregunta) y un solo bloque de genoma. No se abre ninguna pantalla nueva para nada que quepa como columna o como plegable.
- Repositorio público: solo literatura con PMID, colecciones públicas y genomas GCF_ de NCBI. Antes de publicar, el orquestador comprueba data/ y fuentes_publicas/ contra una lista local, no versionada, de códigos privados.
- Legible a 390 px: sin scroll horizontal, sin guiones bajos crudos, sin «[object», sin «undefined» y sin filas vacías en las 26 especies. Los colores salen de tokens de estado (verde / ámbar / rojo / gris discontinuo) y de una paleta de familias de mecanismo ya validada (E8).

## Qué se elimina o simplifica

- **Pestaña Modo pregunta (js/50_question.js, ruta #/pregunta)** → Se borra. Su función pasa a la tira de tres chips por forma en la pantalla 1 de la ficha. #/pregunta redirige a la ficha.
- **Botones de peso, número /100, barras y combinadoVec en «Parecidas»** → Se borran. Quedan el orden, «k/3 ejes con dato», la etiqueta, los chips con fuente y una frase con sujeto explícito.
- **45_quien.js y la ruta #/quien** → Se borran. #/quien redirige a #/lineas. Todas las entradas son parámetros del pivote único.
- **data/busqueda.json curado a mano** → Se retira. El índice se deriva al arrancar, con emparejamiento por palabra.
- **Lista fija de 5 rasgos y fila «Forma recomendada» del comparador** → Rasgos como unión de los declarados (sin criterio propio), con vía y gen. Las formas se derivan de las ensayadas.
- **9 «mecanismos» del catálogo que eran formas (M04, M10-M13, M16-M18, M22)** → Fuera, trazados en mecanismos_retirados.tsv. La forma vive en evidencia.forma.
- **Tarjeta «¿Vendible en qué forma?» de E6 como componente aparte** → Fundida en la tira de formas. Los chips de genoma van al plegable Genoma.
- **tools/integrar_datos.sh y tools/anadir_cola_curacion.py** → Los sustituye scripts/datos/construir_datos.py (pasos en orden, status.tsv). La cola de curación la emite generar_v12.py.
- **Plegables vacíos de la especie (Mercado 12/26, Posbiótico 21/26, Tecnología 12/26)** → Ocultos cuando no tienen contenido. La tabla de evidencias de la especie va plegada.
- **Enlace a la ficha de especie desde la celda de la matriz** → La celda enlaza al pivote del resultado con s= (la fila del sujeto resaltada).

## Alcance

### P1-01 · Orquestador único de datos + integración real del lote E9 r2 (P1)

**Pregunta del microbiólogo.** ¿Puedo fiarme de que lo que veo sale de la fuente y se puede regenerar?

Sustituye tools/integrar_datos.sh por un solo orquestador que ejecuta todos los generadores en orden y deja status.tsv. Integra el lote E9_r2 (que reemplaza al r1) y ajusta generar_v12.py para que soporte lo que hoy hace caer al generador o se ignora. Orden de pasos: (1) aplicar_correcciones_curadas (E6) sobre especies; (2) generar_v12 (E1): evidencias, celdas, matriz, catálogo, veredictos y ataques; (3) derivar_genomica (E2 + parche E6 + campos E4); (4) rasgos_v12 (E5); (5) vecinos_v12 (E1, que ahora lee los rasgos v1.2); (6) build_puerta_cepa (E6); (7) control de privacidad; (8) tests. Cambios obligatorios en generar_v12.py: (a) leer `contexto_nuevo` como tipo=contexto, sin línea ni resultado; (b) aceptar forma=null: formas_ensayadas excluye null y se añade `n_forma_no_declarada`, y muerta() lo trata como np; (c) dirección `mixto` en celda y pivote; (d) alcance `mezcla`: no cuenta en n_cepas_a_favor, ni en «Qué hace bien» de la cepa, ni en C1; (e) campo `relacion` en todas las evidencias, derivado por regla de modelo y nivel más curado/relacion_obs.tsv; las de relacion=asociacion no suman dirección en celdas ni en el pivote; (f) los 8 `nc` heredados de v1.1 pasan a `mixto` con direccion_v11=nc y su fila en la tabla de diferencias; (g) si un lote tiene `sustituye_a`, el lote sustituido no se lee; (h) fusionar ajustes_evidencia.tsv de E1 (inactivacion_metodo) y de E9 (dentisani ev005 → componente); (i) cola_de_curacion_no_verificada → catalogo.lineas[].resultados[].cola_curacion, y campo `cobertura` por resultado (con_evidencia / sin_curar / sin_curar_sin_cola), sustituyendo a tools/anadir_cola_curacion.py de E8; (j) meta.limitaciones con las tres entradas de E9, usando las cifras de cobertura de genomica.json y no el «6-9».

**Datos.** Entradas: scripts/datos/data_v1.1/*.json (la v1.1 actual del repo, congelada); scripts/datos/curado/ (ficheros de proto_E1/scripts/v12/curado más relacion_obs.tsv y ajustes de proto_E9/r2); curado/lotes/E9_r2_20261023.json + verificacion_E9_r2.tsv + E9_r2_20261023_refs.json (copia del _refs de r1: los PMID son los mismos) + metadatos_pubmed_E9_r2.json; fuentes_publicas/ (los 12 CSV/JSON que lee derivar_genomica, 2,6 MB, públicos y saneados, copiados al repo); scripts/datos/curado/correcciones_seguridad_regulatorio_20261023.tsv. Scripts en el repo: scripts/datos/{construir_datos.py (orquestador nuevo), generar_v12.py, celdas_v11.py, vecinos_v12.py, diferencias_v11_v12.py, candidatos_adh01_longitud.py, derivar_genomica.py, rasgos_v12.py, build_puerta_cepa.py, aplicar_correcciones_curadas.py, control_publico.py}. Salida: data/*.json (sin busqueda.json ni perfil_cepa.json); scripts/datos/salidas/AAAAMMDD/{status.tsv (paso, estado OK/FAIL, segundos), sha256.txt de entradas y salidas, diferencias_v11_v12.tsv, resumen.md}. Uso: `python3 -I scripts/datos/construir_datos.py --fecha 2026-10-23 [--publicar]`. Sin --publicar escribe en salidas/ y no toca data/. --publicar exige 0 FAIL, incluido control_publico, que lee la lista de códigos privados de la variable de entorno ATLAS_LISTA_PRIVADA y no está versionado.

**Interfaz.** Ninguna. «Sobre los datos» explica cómo se construyen los datos, con la fecha y el sha256 del build y las tres limitaciones de meta.limitaciones.

**Criterios de aceptación**

- Dos ejecuciones con la misma --fecha dan sha256 idénticos en todos los data/*.json.
- status.tsv tiene 8 pasos OK. Si se elimina un CSV de fuentes_publicas, el paso de genómica da FAIL y data/ no cambia.
- evidencias.json: 204 registros tipo evidencia y 37 de contexto. lacticaseibacillus-paracasei.ev007 es tipo contexto, sin línea ni resultado, y no aparece en ninguna celda ni en ningún veredicto.
- lacticaseibacillus-paracasei.ev010: forma null, dirección mixto. ligilactobacillus-salivarius.ev015: alcance mezcla. streptococcus-dentisani.ev005: forma componente.
- 0 evidencias con relacion null. faecalibacterium-prausnitzii.ev004 tiene relacion=asociacion y la celda prausnitzii|ein no la cuenta en direcciones.
- 0 evidencias con dirección fuera de {+,0,-,mixto}.
- Matriz oral lacticaseibacillus-paracasei|s_mutans: mecanismo.evidencias = [ev009], nunca ev007; funciona_inactivada.k = si con nivel ECA. M41.fuentes contiene ev009, y ev007 solo aparece como contexto.
- «Qué hace bien» de CECT 5713 en mastitis cuenta ev016 como logro de la cepa. ev015 se muestra con la etiqueta «en mezcla con L. gasseri CECT 5714».
- catalogo: el resultado candidiasis_oral tiene cobertura sin_curar y cola_curacion con 8 PMID, estado no_verificada. meta.limitaciones tiene 3 entradas.
- tools/test_contrato_v12.py ampliado con todo lo anterior: 0 fallos.
- No existe data/busqueda.json. grep sobre data/ de la lista privada: 0 coincidencias.

### P1-02 · Mecanismo y «¿funciona muerta?» en evidencia, matriz y catálogo (esquema E1 r2) (P1)

**Pregunta del microbiólogo.** ¿Dónde está la clave de este efecto y necesito la célula viva para venderlo?

Se adopta tal cual el esquema v1.2 r2 de E1: mecanismo {clases (14), subclases, base, determinante, lectura, requiere_viabilidad, base_viabilidad, genes, ids}; matriz.*.funciona_inactivada {k, texto, nivel, evidencias} con 5 valores; matriz.*.mecanismo.requiere_viabilidad; estado_por_forma calculado por forma. Catálogo saneado: 30 mecanismos, sin los 9 que eran formas; exclusion_patogeno separada de adhesion_hospedador; interferencia_quorum como clase; M20 pasa a «Producción de butirato» (E5); la BSH queda fuera hasta que haya fenotipo. M35 lleva descartadas (5, cada una con base), candidatos y lo_refutaria. Añadir a candidatos_mecanismo.tsv las 4 líneas de E4: la hipótesis rival no proteica, apoyada en PMID 20042742 (ya verificado y ahora en el atlas como contexto ev007), y la prueba ±proteinasa K como discriminante. Esto sustituye a perfil_cepa.json. Corregir el texto del generador de vecinos y del catálogo: con determinante desconocido se dice «mecanismo observado (exclusión del patógeno), determinante desconocido», nunca «mecanismo identificado».

**Datos.** Script: scripts/datos/generar_v12.py y los TSV de curado (mecanismos_v12.tsv con columna subclase, clases_mecanismo.tsv, descartes_mecanismo.tsv, candidatos_mecanismo.tsv con las filas de E4, excepciones_evidencia.tsv). Salida: evidencias.json, matriz.json, celdas.json, catalogo.json (mecanismos, clases_mecanismo, bases_mecanismo, determinantes_mecanismo, funciona_inactivada_valores) y ataques.json (requiere_viabilidad y funciona_inactivada copiados de su celda; mecanismo_id poblado).

**Interfaz.** Bajo cada evidencia (panel de cita F2), una línea legible: «Exclusión del patógeno · fenómeno observado · determinante desconocido · funciona inactivada». En la ficha de cepa, «Cómo lo hace» muestra una línea por clase y, cuando la cepa tiene un mecanismo del catálogo con candidatos (hoy solo M35), una tarjeta plegable «¿Dónde está la clave?». La tarjeta empieza por «Determinante DESCONOCIDO», sigue con las descartadas (cada una con su base: observado o inferencia), los candidatos etiquetados como HIPÓTESIS y, al lado de cada uno, «Lo refutaría: …».

**Criterios de aceptación**

- Test: la celda oral|ligilactobacillus-salivarius|s_mutans tiene funciona_inactivada.texto exactamente igual a «Sí, célula inactivada (calor)» y mecanismo.requiere_viabilidad = no.
- 0 celdas con mecanismo.funciona_inactivada. 0 celdas con estado hueco_sin_mecanismo. 0 celdas con las tres formas iguales cuando las evidencias tienen formas distintas.
- Ninguna celda tiene funciona_inactivada.k fuera de {si, frac, nulo, ferm, np}.
- Las 33 líneas de ataques llevan mecanismo_id (o «desconocido» explícito), requiere_viabilidad y funciona_inactivada.
- Test: en catalogo.json, toda línea de candidatos con base hipótesis tiene lo_refutaria no vacío. M35 tiene 5 descartadas y al menos 2 candidatos rivales: proteína ADH01 grande y componente no proteico.
- grep sobre data/ de «mecanismo identificado» donde determinante = desconocido: 0 coincidencias.

### P1-03 · Pivote único «este output lo comparten estos microorganismos» + matriz de 3 estados (P1)

**Pregunta del microbiólogo.** Este output, ¿qué microorganismos lo comparten, por qué mecanismos distintos y cuál funciona con célula muerta?

Motor Atlas.pivot de E8 (js/45_pivot.js) en una sola ruta #/lineas, con los parámetros res, out, gen, mec, mid, q, muerta=1 y s=<sujeto>. #/quien redirige a #/lineas. La tabla tiene las columnas Quién (cepa/especie) · Mejor nivel · Formas probadas · ¿Funciona muerta? · Mecanismo (familia + «determinante desconocido» + base + nivel al que se vio) · Genes · Fuentes. Cuando en la misma unidad hay un ensayo nulo o mixto, se muestra como texto con su fuente y sin color. La vía de E5 va agrupada por output, con un único enlace «¿quién más?». La matriz tiene 3 estados visuales (con evidencia coloreada por familia / evidencia sin mecanismo «mecanismo ?» / nulo o en contra) y «det. ?» con relleno pálido. Las columnas vacías llevan un pie con la cifra de la línea y la cola de PMID. La celda enlaza al pivote del resultado con s= (no a la ficha de especie). El modo ?out= de E5 se usa para los outputs con productores curados; las bacteriocinas no llevan enlace de convergencia.

**Datos.** No hay JSON nuevo. Lee evidencias.json (forma, dirección, relacion, nivel, inactivacion_metodo, mecanismo), matriz.json, catalogo.json (mecanismos, vocabulario_rasgos, cola_curacion, cobertura) y especies.json (rasgos v1.2). Código base: proto_E8_r2/js/{40_lines.js, 45_pivot.js}, proto_E8_r2/css/30_pivot.css, sobre el resto de proto_E8_r2 (instantánea de E7 + parche de E8). Adaptaciones obligatorias: muerta() trata forma null como np y dirección mixto como «resultado mixto»; las evidencias con relacion=asociacion no cuentan; las de alcance mezcla se rotulan «mezcla».

**Interfaz.** Cabecera con una frase de recuento (n microorganismos, cuántos a nivel de cepa, cuántos con mecanismo, cuántos probados con célula muerta). Debajo, la leyenda con recuentos por familia y el interruptor «Solo lo que funciona con célula muerta (n)». A 390 px cada fila es una tarjeta. Si el filtro deja cero filas: «no se ha probado o no funcionó», nunca «no funciona». Pie de matriz: «Salud oral: 6 de 11 resultados sin ninguna evidencia curada — … Es un hueco de curación, no una ausencia demostrada», con un plegable de la cola de PMID marcada «sin verificar».

**Criterios de aceptación**

- #/lineas/oral?res=s_mutans con los datos de P1-01 muestra 6 especies a favor y exactamente 2 filas «Sí, célula inactivada»: L. paracasei DSMZ 16671 (ECA) y L. salivarius CECT 5713. No aparece ninguna fila «L. paracasei (especie)».
- La fila de CECT 5713 dice «exclusión (determinante desconocido)». La fila de DSMZ 16671 muestra ev010 como «resultado mixto» con su fuente, sin colorear.
- tools/humo_pivote.cjs (de E8, movido a tools/) pasa con: 0 lecturas de mecanismo.funciona_inactivada (con autoprueba de lectura inyectada); 0 incoherencias de familia entre matriz y pivote; 0 discrepancias entre funciona_inactivada de Python y muerta() de JS; 0 filas «No».
- Ancho de página 390/390 en #/lineas/oral, en ?res=s_mutans, en ?res=s_mutans&muerta=1 y en ?gen=spxB; 0 errores de consola.
- Clic en la celda L. salivarius × S. mutans: lleva a #/lineas/oral?res=s_mutans&s=ligilactobacillus-salivarius (1 clic).
- Con muerta=1, el pivote de s_mutans ocupa ≤ 3 pantallas a 390×844.

### P1-04 · Ficha de cepa y de especie: tira de formas con puerta de cepa, «Lo demostrado», «Cómo lo hace», enlace inverso (P1)

**Pregunta del microbiólogo.** ¿Qué hace bien esta cepa, en qué forma, y puedo venderla en esa forma?

Se adopta la ficha de E7 r2 con estos elementos. En la pantalla 1 de la cepa, la tira «¿En qué forma?» con tres chips; cada chip muestra el nº de evidencias a favor en esa forma y la puerta de cepa de puerta_cepa.json. Al tocar un chip: la razón con su regla, la ruta de la especie como contexto sin color y el veredicto por línea o el motivo de que no lo haya (sin evidencia en la forma / no calculado / ninguna a favor). Debajo: «Quién más consigue lo mismo» (enlace al pivote con s=); «Cómo lo hace» (una línea por clase, sin repetir el pivote); «Qué produce y por qué vía» (E5); «Lo demostrado» agrupado por resultado. Plegados y cerrados: Genoma (P1-05), Ficha técnica y Parecidas (P1-06). En la especie, la tabla de evidencias va plegada y los plegables vacíos se ocultan. Se elimina la pestaña Modo pregunta (50_question.js) y la ruta #/pregunta redirige a la ficha. El mapa GATE vive en 00_core (Atlas.ui.gatePill), con «sin_bloqueo» = «sin bloqueo registrado».

**Datos.** veredictos.json + veredictos_estado.json (E1), puerta_cepa.json (E6, build_puerta_cepa.py v2), especies.json con las correcciones de E6 por TSV con guarda y los rasgos v1.2 de E5, y evidencias.json. Corrección obligatoria en rasgos_v12.py (E5): una cepa solo entra en rasgo.cepas si tiene al menos una evidencia de ese rasgo con dirección «+». Las de dirección «-» van a `cepas_en_contra`. Resultado esperado: CECT 5713 sale de las cepas del rasgo bacteriocina y entra en cepas_en_contra con ev011. Cuando E1 lo aplique en el generador, puertas.regulatorio de los veredictos de cepa toma el valor de puerta_cepa (R-nomedido).

**Interfaz.** Chips con píldora de estado: verde (abierta) / ámbar (condicionada) / rojo (cerrada o fuera de QPS por AMR adquirida) / gris discontinuo (no medido o desconocida). «Plausible» de tecnología en ámbar (lo propone E6, acepto). Con rasgo en contra se muestra «No: Bacteriocina (porta Abp118, no la produce)» con el chip de ev011.

**Criterios de aceptación**

- T3 (desde la búsqueda «5713» a ver «Posbiótico: cepa condicionada · Salud oral: Prometedora · ruta condicionada»): ≤ 2 clics, medido con tools/medir_tareas.cjs.
- T1 (S. oligofermentans: qué hace bien y cómo, con lox visible): ≤ 2 clics.
- T2 (desde CECT 5713, quién más actúa sobre S. mutans): ≤ 2 clics, más 1 para el filtro de célula muerta.
- Altura a 390×844: ficha de CECT 5713 ≤ 5 pantallas; ficha de L. salivarius ≤ 8; con los plegables cerrados.
- En vivo hay exactamente 11 cepas con píldora verde, las 11 con genoma medido. Ninguna cepa sin genoma sale en verde (P. freudenreichii ×3 y S. cerevisiae CNCM I-745 salen «no medido (calificación QPS sin verificar)»).
- especies.json: CECT 5713 no figura en rasgos[bacteriocina].cepas de L. salivarius.
- Humo en 108 rutas (82 cepas + 26 especies) a 390 px: 0 errores, 0 scroll horizontal, 0 «[object», 0 «undefined», 0 «Puerta de seguridad: no» en rojo.
- No existe js/50_question.js. #/pregunta y #/quien redirigen sin error.
- El comparador no tiene la lista fija de 5 rasgos ni la fila «Forma recomendada».

### P1-05 · Bloque «Genoma GCF_» por cepa y tabla n/N por especie desde genomica.json único (P1)

**Pregunta del microbiólogo.** De esta cepa, ¿qué lleva en el genoma, y eso es rasgo de su especie o la distingue de sus hermanas?

genomica.json de E2 es la única fuente de llamadas por genoma. Contiene: 15 marcadores auditados con estados P/A/I/NM; lecturas por taxón con n/N + i y texto ya redactado; produccion (5 estados) para ABP118, NISINA y BAC_CLII, con restos_locus; refutado_en_ensayo (regla estrecha de E4: misma cepa, fragmento verificado y fenotipo igual al confirmar_con); confirmar_con por marcador; superficie (K4) solo en L. salivarius; seguridad (parche de E6: VFDB, co-localización AMR/replicón y herramienta); ani_top3 con af y difiere_en; tabla de cobertura oficial. El ANI no entra en el score de vecinos. Integrar en derivar_genomica.py las tres correcciones de E4: eps_glicosiltransferasas_n (solo GT), eps_polisacarido_n, eps_hits_n, más dlt_n, ta_lta_n, wxl_n y gbpc_n, y descartes_declarados {lspA_falso_positivo: 17}. Se mantienen las discrepancias aprobadas: NISINA exige nisB+nisC+nisT sin nisA, y BAC01 queda fuera.

**Datos.** Script: scripts/datos/derivar_genomica.py (versión de proto_E6_r2/scripts, que incluye el parche de E6, más los campos de proto_E4/scripts/k4_columnas_superficie_r2.py importados como función). Entradas: fuentes_publicas/{atlas_marcadores_llamadas_referencias.csv, atlas_marcadores_definicion.csv, checkm2_referencias.csv, ani_pares_referencias.csv, genomas_publicos.json, salivarius_bakta_hits_funcionales_referencias.csv, salivarius_bakta_inventario_referencias.csv, bagel4_referencias_bacteriocinas.csv, bagel4_referencias_ncbi.csv, abricate_hits_referencias.csv}, más data/{cepas, evidencias, especies}.json. Salida: data/genomica.json (unos 190 KB) y salidas/AAAAMMDD/genomica_AAAAMMDD.json, con fuentes_sha256.

**Interfaz.** Plegable cerrado «Genoma GCF_000143435.1 · CheckM2 99,9 / 0,28 · AMR adquirida: sin hits · ANI más cercano: P1CEA3 99,13». Dentro: una fila por marcador con el estado de la cepa, la lectura de la especie (texto) y «confirmar con»; el chip de fenotipo cuando lo hay («porta y NO produce», «anotado, refutado en ensayo»); la fila de seguridad (AMR, VFDB, plásmidos; un replicón sin resistencia en ámbar); ANI top 3 con la frase fija «Parentesco genómico, no actividad»; superficie con la palabra «predicción» y la bandera de contig. En la ficha de especie, una tabla n/N y una banda de cobertura: «Análisis genómico público en 7 de 26 especies; 11 de 82 cepas con perfil; IMM y BAGEL4 no medidos en públicos». La accesión GCF_ enlaza a NCBI. Cepa sin genoma: «no medido (sin accesión en el atlas) ≠ ausente».

**Criterios de aceptación**

- genomas['GCF_000143435.1'].marcadores: BSH = I, SIALIDASA = I, ABP118 = P, LOX = A. produccion.ABP118.estado = porta_no_produce con ev011. refutado_en_ensayo.SIALIDASA.pmid = 16843562.
- taxones de L. salivarius: BSH {n: 15, i: 2, N: 17, lectura: sin_resolver}; ABP118 10/17 variable_cepa; NISINA en L. lactis subsp. lactis 3/10.
- Casos de prueba de E3 en el test: UCC118 porta_y_produce; CECT 5713 porta_no_produce; KF147 no_porta con restos_locus que contiene nisI; AR809 porta_sin_ensayo.
- superficie de CECT 5713: mucbp_grande_pb 8187, eps_glicosiltransferasas_n 7, eps_polisacarido_n 4, dlt_n 4. Comparación con k4_columnas_superficie_20261023.json de E4: 0 diferencias en 17 filas.
- 0 marcadores VIT, IMM o BGL entre los 15. 0 llamadas `parcial` contadas como P.
- DSMZ 16671 y PS2 muestran «no medido» en todo el bloque, nunca «ausente».
- El bloque cabe sin scroll horizontal a 390 px.

### P1-06 · «Parecidas a esta» con 3 ejes y frases con sujeto explícito (P1)

**Pregunta del microbiólogo.** ¿Quién se le parece por lo que HACE, y hasta dónde puedo extrapolar?

vecinos_v12.py de E1 con el parche de E5 aplicado. Tres ejes (funcional, resultado solo en líneas de producto, taxonómico) y el denominador con todos los pesos. El eje funcional solo cuenta base causal u observado, y lee los rasgos v1.2 de E5 sin los de criterio propio. «Mismo mecanismo» solo si comparten clase para el mismo resultado. Para las clases genéricas (inmunomodulación, metabolito) la etiqueta es «misma familia de efecto». La frase de «mismo output, misma u otra vía» solo afirma la vía si via_en_fuente = si. Sin frase cuando no se comparte nada funcional. Se quitan los botones de peso, el número /100 y las barras.

**Datos.** Script: scripts/datos/vecinos_v12.py (ejecutado tras rasgos_v12, paso 5 del orquestador). Salida: data/vecinos.json con orden, ejes_con_dato, etiqueta, frase, rasgos_compartidos (con fuentes) y score_combinado (solo para ordenar).

**Interfaz.** Tarjeta: nombre · «k/3 ejes con dato» · etiqueta · línea de ejes · chips de lo compartido, con fuente · frase si existe. Si ninguna vecina comparte nada funcional, aviso con enlace al pivote. El ANI no aparece aquí, sino en el plegable Genoma.

**Criterios de aceptación**

- 0 frases «pero esta actúa». 0 pares con frase sin nada funcional compartido. 0 pares con eje genómico.
- 0 etiquetas «mismo rasgo» que se apoyen en rasgos de criterio propio (hoy son 37: lactato/acetato).
- Vecinos de CECT 5713: DSM 20555, Ls-33 y UCC118 sin frase, con la etiqueta «solo parecido taxonómico». PS2 queda por delante de DSM 20555.
- Ninguna frase dice «mecanismo identificado» si el determinante es desconocido.
- No existen combinadoVec ni axisBar en js/.

### P1-07 · Buscador con índice derivado al arrancar (P1)

**Pregunta del microbiólogo.** Entro por el mecanismo, el gen o la propiedad («coagregación», «caries», «ureasa»), no por el nombre de la bacteria.

Índice construido en el navegador (js/10_search.js de E7). Fuentes: catálogo (líneas, resultados, clases, mecanismos M), vocabulario_rasgos de E5, especies (nombres, sinónimos, moléculas, rasgos), cepas y evidencias (claim_es, mecanismo.genes). Los nombres se buscan por principio de palabra y el texto libre por palabra exacta o plural, nunca por subcadena. Se retira busqueda.json. Los marcadores genómicos no se indexan hasta que haya vista por marcador (P3).

**Datos.** No hay fichero. Lee los JSON de data/.

**Interfaz.** Sugerencias agrupadas: Especies, Cepas, Resultados, Outputs (por qué vía), Mecanismos, Genes, Moléculas, y una línea final «X en N evidencias». Cada una lleva al pivote o a la ficha. En «Sobre los datos», la sección «Cómo se construye el buscador».

**Criterios de aceptación**

- «candida» no devuelve C. minuta. «candidiasis» devuelve el resultado con «sin evidencia curada · 8 PMID en cola».
- «coagregación» ≥ 1 resultado que lleva a M41 o al pivote de s_mutans. «hidroxiapatita» ≥ 2. «ureasa» no devuelve B. longum. «piruvato oxidasa» devuelve S. australis y S. oligofermentans.
- data/busqueda.json no existe y 00_core.js no lo pide.

### P2-01 · Experimento discriminante 2×2 en la tarjeta «¿Dónde está la clave?» de CECT 5713 (P2)

**Pregunta del microbiólogo.** ¿Qué perfil de bacteria busco para replicar una propiedad que funciona muerta, y qué ensayo barato separa las hipótesis?

Ampliar candidatos_adh01_longitud.py para emitir los brazos de cepas públicas: grande + EPS alto (SNK-6, B4311), grande + EPS bajo (UCC118, Y20), corto + EPS alto (D3-8), corto + EPS bajo (AR809, CICC 23174). El brazo «corto + EPS alto» se declara débil. Los controles salen de K8: autoclave, ±proteinasa K (prueba decisiva), ±EDTA, saliva entera, pH e hidroxiapatita recubierta de saliva. Se queda en P2 porque el contenido de E4 apuntaba a ev013b y tenía prosa estática; debe regenerarse desde los datos.

**Datos.** Entradas: fuentes_publicas/salivarius_bakta_hits_funcionales_referencias.csv y genomica.json (superficie). Salida: filas en curado/candidatos_mecanismo.tsv generadas por script, que se muestran en catalogo.mecanismos.M35.candidatos.

**Interfaz.** Dentro de la tarjeta M35, una tabla de 4 brazos con las cepas y la línea «ningún genoma predice un determinante LTA: dlt 17/17».

**Criterios de aceptación**

- La propiedad se ancla en ev013a (CEL, hidroxiapatita), nunca en ev013b.
- Ningún texto con recuentos escritos a mano («1 de 197»): todo número sale del cálculo.
- Test R1: una hipótesis sin lo_refutaria no se emite.

### P2-02 · BAGEL4 dirigido (10 genomas) + tabla panel frente a BAGEL4; ABRicate en 23 GCF_ pendientes (P2)

**Pregunta del microbiólogo.** Cuando el panel no ve bacteriocina o AMR, ¿es ausencia real o ceguera del método?

Lote A (D3-8, DJ-sa-01, LZZAY01, S01, ZSA5) y lote B (KF147, NCDO 2118, CV56, F44, IO-1) con BAGEL4. ABRicate 1.4.0, con las mismas bases, sobre las 23 GCF_ de abricate_pendiente_20261023.tsv; DSM 20555 va a la cabeza de P3. Los parsers se integran en derivar_genomica.py, no como scripts aparte. La clase III siempre como HIPÓTESIS, con identidad y longitud. Implementar las dos reglas de E3 que faltan: truncado a ≤ 5 pb del borde de contig = no_medido, y regulador abpK/abpR no anotado = nota «regulador no medido».

**Datos.** Requiere corridas nuevas de Javier sobre genomas públicos. Los CSV resultantes van a fuentes_publicas/ con fecha.

**Interfaz.** Una fila más en el bloque Genoma, sin vistas nuevas.

**Criterios de aceptación**

- La tabla panel frente a BAGEL4 pasa de 13 a 23 genomas.
- Ninguna cepa sin corrida sale «sin bacteriocina» ni «sin AMR».
- Las 23 cepas pasan de gris a medido sin tocar js/.

### P2-03 · Curación de huecos declarados: Candida (8 PMID) y texto completo de ev010 (P2)

**Pregunta del microbiólogo.** ¿Esta columna vacía es biología o falta de curación?

Verificar frase a frase los 8 PMID de candidiasis oral y meterlos como lote E9_r3 por el pipeline. Leer el texto completo de 23503788 para fijar la forma de ev010.

**Datos.** Lote nuevo en curado/lotes/ con verificacion_*.tsv.

**Interfaz.** Ninguna nueva.

**Criterios de aceptación**

- Solo entran filas con fragmento literal verificado.
- La columna pasa de sin_curar a con_evidencia sin edición manual.

### P3-01 · Vista por marcador genómico y su indexación en el buscador (P3)

**Pregunta del microbiólogo.** ¿Qué cepas del atlas llevan este gen y en cuáles se ha medido el fenotipo?

Pivote por marcador (n/N, cepas, chip de fenotipo). Se aplaza hasta que haya genomas de más especies: hoy cubre 5 taxones.

**Datos.** genomica.json.

**Interfaz.** Modo ?mk= del pivote único, sin pantalla nueva.

**Criterios de aceptación**

- Se reutiliza Atlas.pivot y la ruta #/lineas.

### P3-02 · Ampliar cobertura genómica: Bakta en 12 B. dentium y genomas de los estreptococos orales (P3)

**Pregunta del microbiólogo.** ¿Los genes antimicrobianos orales (arcABC, spxB, lox, sgc) son constantes o variables en sus especies?

Hoy no hay ni un genoma de los 4 estreptococos orales, y B. dentium solo tiene ABRicate.

**Datos.** Corridas de Javier sobre genomas públicos.

**Interfaz.** Ninguna nueva: se llenan los «no medido».

**Criterios de aceptación**

- La cobertura de genomica.json sube y la banda de cobertura lo refleja sin tocar js/.

## Descartado

- **perfil_cepa.json y su generador como artefacto propio (E4)** → Lo genera un TSV «fusionado_demo». Ancla la propiedad a ev013b (OBS) y no a ev013a, y lleva prosa estática ya falsa («1 de 197»). Su contenido válido (cadena de hipótesis, rival no proteica, ±proteinasa K) entra en catalogo.M35 y se pinta como la tarjeta «¿Dónde está la clave?»: un JSON y un script menos.
- **reglas_bacteriocinas_E3.tsv y parsear_bagel4.py como entregables de E3** → No existen en disco por segunda ronda. Las reglas ya están implementadas en derivar_genomica.py y los 4 casos de prueba dan lo esperado. Las dos reglas que faltan (borde de contig y regulador no medido) pasan a P2-02 dentro del script de E2.
- **El lote E9_r1 y todo lo que deriva de él en el prototipo integrado** → Contiene los 4 errores que rechacé (ev007 asignada a la especie, ev010 «vivo»/«0», ev015 sin «mezcla», dentisani ev005 «vivo»). Lo sustituye E9_r2 vía P1-01. Las cifras de E8 (3 filas «muerta» en s_mutans) y la vecina «DSMZ 16671 sin mecanismo» se recalculan.
- **Marcadores VIT01-04, EPS01, HMO01, FIB01/02/04, BAC01, BAC04 y BAC05 sueltos, SEG01-05, SEGQ y SEGV como columnas** → Las reglas están rotas o el marcador es constante o vacío, con evidencia literal (E2, E3, E5). Importarlos fabricaría B12, nisina, enterocinas o EPS donde no las hay.
- **IMM01-09 y BGL como presencia/ausencia** → No medidos en 72/94 y 59/94 genomas. Solo aparecen en la banda «no medido».
- **ANI como eje de vecinos** → Solo 19 de 1.036 pares ganarían valor. Va en el plegable Genoma como «parentesco, no actividad».
- **`mucina_union` como rasgo con fenotipo** → 0 de 14 evidencias de L. salivarius miden unión a moco. Queda como fila de predicción genómica (MucBP 17/17).
- **Recalcular por script los 28 veredictos no_calculado** → Las reglas de v1.1 no tienen código. Quedan como «no calculado» explícito, que ya se distingue de «sin evidencia».
- **Un valor de dirección «nc»** → Enum cerrado +/0/-/mixto. Las asociaciones se marcan con `relacion`, y los 8 «nc» heredados pasan a mixto con traza.
- **pivote.json precalculado o una segunda ruta de pivote** → Ya hay una duplicación (muerta en Python y en JS) vigilada por un test. Una tercera copia no aporta nada.

## Riesgos

- Con el lote r2, cambian las cifras que se vieron en la ronda 2: el pivote de s_mutans pasa de 3 a 2 filas «funciona muerta», la celda de L. paracasei toma el mecanismo de ev009 y no de ev007, y la vecina DSMZ 16671 cambia de frase. Hay que volver a pasar la prueba de humo de E8 y la medición de clics de E7 sobre el build final.
- La reverificación de fragmentos de E9 se hizo con la herramienta PubMed de la sesión. El curl a eutils da 403, así que la validación reproducible depende de la caché metadatos_pubmed_E9_r2.json, y el lote lo declara.
- control_publico solo es tan bueno como la lista local de códigos privados. Sin ATLAS_LISTA_PRIVADA, --publicar debe negarse.
- La lectura «varía entre cepas» se apoya en ≤ 17 genomas, no independientes: AR809 y CICC 23174 tienen un ANI de 99,99. Por eso el texto en pantalla dice «genomas públicos», no «cepas».
- Las subclases de bacteriocina, la ruta posbiótica, la extensión de B. dentium a «a revisar» y el reparto de las 27 OBS en `relacion` son criterio propio. Tienen que verse rotulados así en «Sobre los datos».

## Preguntas para Javier

- Mastitis animal: el catálogo solo tiene «Mastitis lactacional» (humana). ¿Creamos el resultado salud_animal|mastitis_animal? E9 tiene 4 PMID de L. lactis intramamaria en vacuno, sin leer. Si no, queda fuera y no se declara como hueco.
- Posbiótico: hoy la puerta de CECT 5713 en forma inactivada dice «condicionada · la AMR informa pero no decide», que es criterio propio de E6. ¿Lo validas como regla del atlas, o prefieres que en forma no viable la puerta salga «no evaluada» hasta tener una referencia regulatoria? Cambia el color del chip de todas las cepas en posbiótico.
- P2-02 depende de que tú corras 10 BAGEL4 y 23 ABRicate (más DSM 20555) sobre genomas públicos. ¿Lo haces en esta entrega o lo pasamos a P3? Si pasa a P3, esas 23 cepas siguen en gris («no medido»), incluida GG, que hoy tiene un veredicto «sólida».

## Nota para arquitectos

**Base de código.** Partid de /tmp/claude-0/-home-user/b1ba7fbd-1bf9-5bc3-ada1-892ef1b86893/scratchpad/proceso/proto_E8_r2/:
- js/ y css/ = la instantánea de E7 r2 más el parche de E8 (E8r2_parche_pivote.patch).
- Es la copia más integrada que existe. Copiadla al repo como una sola rama.
- No mezcléis ficheros sueltos de proto_E7 y proto_E8_r2. 45_pivot.js tiene un único dueño: el de E8 con los modos de E7 y E5.

**Datos.** No copiéis proto_E7/data: contiene el lote E9_r1 rechazado. Construid data/ con el orquestador de P1-01.

**Estructura del repo** (hoy solo tiene tools/; no existe scripts/):
- scripts/datos/: generadores Python solo con biblioteca estándar, curado/, data_v1.1/ y salidas/AAAAMMDD/.
- fuentes_publicas/: los CSV públicos saneados, 2,6 MB.
- tools/: pruebas: test_contrato_v12.py ampliado, humo_pivote.cjs, test_via_en_fuente.py, medir_tareas.cjs y el humo.mjs actual.

**Lenguaje.** Python stdlib en todo el build. Me aparto conscientemente de la preferencia por R: es el pipeline que ya funciona y es idempotente.

**Restricciones de publicación.**
- La app sigue siendo estática para GitHub Pages: sin build, sin servidor.
- Playwright y Node son herramientas de desarrollo y no se publican.

**Orden de los pasos y por qué.**
1. aplicar_correcciones_curadas.
2. generar_v12.
3. derivar_genomica.
4. rasgos_v12.
5. vecinos_v12.
6. build_puerta_cepa.
7. control_publico.
8. tests.

Vecinos va después de los rasgos porque los lee. Hoy está dentro de generar_v12: separadlo como paso propio, porque hoy usa los rasgos v1.1.

**Bugs verificados que hay que corregir.**
- generar_v12.py cae con forma = null (línea 386).
- No lee contexto_nuevo, relacion, relacion_obs.tsv, alcance «mezcla» ni sustituye_a.
- rasgos_v12.py mete en rasgo.cepas cepas cuya evidencia es «-» (CECT 5713 en bacteriocina, por ev011).
- genomica.json no tiene los campos EPS/dlt de E4: eps_glicosiltransferasas_n = 11 está mal etiquetado.
- vecinos dice «mecanismo identificado» con determinante desconocido.
- El parche de vecinos de E5 no está aplicado (37 «mismo rasgo» por lactato).
- La normalización de puertas.regulatorio por cepa (R-nomedido) debe hacerla el generador de veredictos, no la UI.

**Responsables de cada pieza.**

| Pieza | Responsable |
|---|---|
| Esquema, generador y vecinos | E1 |
| genomica.json | E2 |
| Vocabulario de rasgos y via_en_fuente | E5 |
| puerta_cepa y correcciones | E6 |
| Pivote y matriz | E8 |
| Ficha, buscador y medidas | E7 |
| Lotes | E9 |

**Diseño gráfico.**
- Tokens de estado en :root con modo oscuro: verde / ámbar / rojo / gris con borde discontinuo para no medido.
- Paleta de familias de mecanismo de E8, ya validada; no añadáis una 4.ª tonalidad.
- «det. ?» es un relleno al 50 % de la misma familia, no un estado nuevo.
- Ningún valor crudo con guion bajo: todas las etiquetas salen de catalogo.*_valores o de los textos ya redactados en genomica.json.

**Antes de dar por cerrada la entrega:**
- Volved a medir T1-T3 y las alturas de ficha en el build final, no en los prototipos.
- Guardad el JSON de medidas con fecha en tools/salidas/.

**Lo que no hice.** No he tocado /home/user/atlas-microbiolog-a. La prueba del lote r2 está en /tmp/claude-0/-home-user/b1ba7fbd-1bf9-5bc3-ada1-892ef1b86893/scratchpad/proceso/proto_director/. Intenté borrar ficheros de una copia y un control de seguridad lo impidió, así que esa carpeta conserva solo lo que copié.
