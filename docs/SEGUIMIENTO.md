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
| Especialistas, ronda 2 | En curso |
| Ampliación genómica a todo el atlas (NCBI) | En curso |
| Cierre del director (especificación) | Pendiente |
| Arquitectos y diseñadores implementan | Pendiente |

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
