# P4 - Investigacion de fuente oficial JW

Fecha de investigacion: 2026-06-25

## Decision

No implementar en P4 una integracion automatica que extraiga, copie, descargue masivamente, haga scraping o redistribuya contenido desde JW.ORG.

La opcion tecnicamente y legalmente mas prudente para esta version es:

- permitir carga manual de datos operativos del programa;
- permitir importacion CSV/Excel creada por el administrador;
- guardar solo datos necesarios para asignaciones internas;
- guardar enlaces de referencia a JW.ORG cuando haga falta;
- no almacenar ni redistribuir publicaciones, imagenes, audio, video o texto protegido dentro de la aplicacion.

## Fuentes revisadas

Fuentes oficiales consultadas:

- JW.ORG Terms of Use: https://www.jw.org/en/terms-of-use/
- Our Christian Life and Ministry Meeting Workbook: https://www.jw.org/en/library/jw-meeting-workbook/
- Life and Ministry Meeting Workbook July-August 2026: https://www.jw.org/en/library/jw-meeting-workbook/july-august-2026-mwb/

## Hallazgos

JW.ORG publica el cuaderno de la reunion Vida y Ministerio y permite ver, descargar e imprimir contenido para uso personal y no comercial, segun sus condiciones de uso.

Sin embargo, los terminos tambien restringen:

- publicar contenido de JW.ORG dentro de otra web o aplicacion;
- distribuir publicaciones, imagenes, musica, fotos, texto o videos como parte de una aplicacion;
- crear herramientas hechas para recopilar, copiar, extraer, cosechar o hacer scraping de datos, HTML, imagenes o texto del sitio;
- usar metodos de acceso no provistos explicitamente por el sitio.

No se encontro una API publica oficial documentada para consumir el programa Vida y Ministerio como fuente estructurada de datos para aplicaciones externas.

## Evaluacion tecnica

Opciones evaluadas:

| Opcion | Viabilidad tecnica | Riesgo | Decision |
| --- | --- | --- | --- |
| Scraping HTML de JW.ORG | Alta | Alto legal/operativo | Rechazada |
| Descargar y parsear PDF/EPUB/TXT automaticamente | Media | Alto si se redistribuye o automatiza extraccion | Rechazada |
| Consumir API oficial documentada | No encontrada | Bajo si existiera permiso oficial | Pendiente |
| Importacion manual por administrador | Alta | Bajo | Aprobada |
| Importacion CSV/Excel creada por administrador | Alta | Bajo | Aprobada |
| Guardar enlaces a paginas oficiales | Alta | Bajo | Aprobada |

## Alcance permitido para P4

P4 queda documentado como investigacion cerrada para esta entrega.

No se implementa integracion automatica con fuente JW porque:

1. No hay API oficial publica identificada.
2. El scraping/extraccion automatica entra en zona de riesgo segun los terminos oficiales.
3. El sistema puede cumplir su objetivo operativo sin copiar contenido protegido.

## Alcance recomendado futuro

Si en el futuro se desea reabrir P4, hacerlo solo con una de estas condiciones:

- permiso escrito o licencia aplicable;
- API oficial documentada para terceros;
- integracion estrictamente local/manual donde el usuario aporte sus propios datos sin redistribucion;
- revision legal previa.

## Implementacion recomendada en sustitucion

Para P2/P3, el sistema debe mantener:

- Programa mensual;
- Semanas;
- Asignaciones;
- titulos operativos editables por el administrador;
- referencias opcionales como texto corto o enlace;
- importacion manual/CSV como mejora futura segura.

El sistema no debe:

- copiar automaticamente contenido editorial de JW.ORG;
- almacenar publicaciones completas;
- mostrar contenido descargado de JW.ORG como si fuera parte propia del producto;
- ejecutar crawlers o jobs de extraccion contra JW.ORG.

