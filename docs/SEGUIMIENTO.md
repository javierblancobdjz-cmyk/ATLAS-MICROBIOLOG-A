# Seguimiento de la mejora del Atlas

Se actualiza en cada cambio de fase.

## Estado

| Fase | Estado |
|---|---|
| Base de la app en GitHub y web publicada | Hecho · 23-10 |
| Datos de 94 genomas públicos (NCBI), sin cepas propias | Hecho · 23-10 |
| Seis consultores con casos reales | Hecho · 23-10 |
| Encargo del director | Hecho · 23-10 |
| Especialistas, ronda 1 | Hecho · 23-10 |
| Evaluación del director, ronda 1 | Hecho · 23-10 (2 aceptadas, 7 a mejorar) |
| Especialistas, ronda 2 | Hecho · 23-10 |
| Ampliación genómica a todo el atlas (NCBI) | Hecho · 23-10 (161 genomas nuevos) |
| Cierre del director (especificación) | Hecho · 23-10 (conforme) |
| Arquitectos y diseñadores implementan | En curso, rama `mejora-v2` |

## Diagnóstico de los consultores

El atlas cuenta bien **qué está demostrado** pero no **cómo funciona**: no hay mecanismo por evidencia, los genes y rasgos están en los datos pero no se pintan, y no se puede buscar por gen, molécula o mecanismo.

- **CECT 5713:** el artículo de anti-adhesión de *S. mutans* es un posbiótico (células inactivadas por calor), nivel observacional, alcance de cepa. El modo pregunta responde «sin datos» y «parecidas» falla porque el eje genómico está vacío.
- **Patrones que destapan los genomas públicos:** BSH en 17/17 genomas de *L. salivarius* y 0/18 de *L. lactis*; GABA (gadB/gadC) en 18/18 de *L. lactis*, no recogido en la app.
- **Errores que confunden:** 50 celdas con evidencia pintadas como vacías; la puerta de seguridad «sin bloqueo» sale en rojo.

## Encargo del director

Nueve especialistas: modelo de datos, genómica comparativa, bacteriocinas, adhesión y superficie, metabolismo, seguridad y regulación, arquitectura de información, visualización, curación de evidencia.

Capas nuevas: mecanismo por evidencia · vista por output (qué organismos comparten un resultado y con qué genes) · perfil genómico por cepa con accesión NCBI · arquitectura de superficie · ANI real como eje de parecido · puerta de seguridad por cepa · índice de búsqueda por resultado, gen y molécula · ensayo de confirmación junto a cada marcador.

Simplificaciones: la pestaña Pregunta pasa a tira dentro de la ficha; fuera los botones de pesos de «parecidas»; fuera los marcadores genómicos poco fiables (vitaminas, inmunidad no medida).

## Evaluación del director, ronda 1

Aceptadas: seguridad y regulación (E6), visualización y pivote (E8). A mejorar: las otras siete, con 5–7 exigencias cada una.

Errores cazados: CECT 5713 no puede salir con BSH confirmada (su gen es un homólogo de la familia PVA); una evidencia de *L. paracasei* asignada a especie cuando el artículo no nombra cepas; scripts citados que no existen.

Orden de integración que fija: primero el modelo de datos, después **una sola** fuente genómica (`genomica.json`) que consumen todos, y al final **un solo** pivote y un solo buscador.

## Ampliación genómica

Con NCBI abierto, se aplican las mismas 53 reglas de marcadores a la anotación oficial de NCBI (PGAP) de las cepas del atlas con genoma y de genomas de referencia de las especies que no lo tenían, validando la concordancia contra las llamadas Bakta existentes.

### Resultado de la ampliación

- **161 genomas RefSeq nuevos.** Ninguna especie bacteriana del atlas queda sin genoma; hasta 8 por especie, priorizando cepa tipo y cepas con depósito público. *S. oligofermentans* solo tiene uno.
- **39 cepas del atlas vinculadas a su genoma**: 23 por accesión y 16 por nombre, depósito o cepa tipo (estas 16, por verificar). 32 cepas del atlas no tienen genoma en RefSeq (p. ej. CNCM I-745, SF68, Shirota).
- **Fiabilidad de cada marcador sobre la anotación de NCBI**, validada contra Bakta en 62 genomas: 16 fiables (entre ellos GAD, ADI, adhesión ADH01, lactato, fibra, coagregación), 14 poco fiables porque los anotadores nombran distinto los mismos genes (entre ellos BSH, bacteriocinas BAC01–03, mucina, EPS), 5 sin positivos para validar. La app tiene que enseñar esa diferencia.
- **ANI real** con pyskani (skani 0.3.0): 708 pares dentro de cada género; los 460 pares que ya existían salen idénticos.
- Comprobación de privacidad: sin cepas propias.

## Cierre del director

Conforme. La especificación completa está en la rama `mejora-v2`, en `docs/ESPECIFICACION_v2.md`. Esta entrega implementa siete piezas:

1. **Datos reconstruibles:** un único script regenera todos los datos desde sus fuentes y comprueba que no entra ninguna cepa privada.
2. **Mecanismo en cada evidencia** y la pregunta «¿funciona con la célula muerta?» como eje de producto.
3. **Vista por output:** «este output lo comparten estos microorganismos», con su mecanismo y si funciona inactivado.
4. **Ficha de cepa y especie:** formas vendibles, lo demostrado, cómo lo hace y «¿dónde está la clave?».
5. **Bloque de genoma por cepa** y tabla de presencia por especie, ahora con la ampliación de NCBI.
6. **«Parecidas a esta»** con frases que dicen qué se comparte y hasta dónde extrapolar.
7. **Buscador por gen, molécula, mecanismo o propiedad.**

Se elimina la pestaña Pregunta (pasa a la ficha), los pesos de «parecidas» y los marcadores genómicos poco fiables.

**Decisiones por defecto sobre las preguntas del director**, reversibles:
- Mastitis animal: fuera de esta entrega.
- Forma posbiótica: puerta «condicionada», rotulada como criterio del atlas y no regulatorio.
- BAGEL4 y ABRicate pendientes: a P3; esas cepas quedan en gris «no medido».
