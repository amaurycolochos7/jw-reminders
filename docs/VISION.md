# VISION — JW-REMINDERS

> Documento de **producto**. No describe arquitectura ni tecnologia (para eso ver `docs/SYSTEM-ARCHITECTURE-v1.md` y los demas documentos de `docs/`).
> Responde una sola cosa: que es JW-REMINDERS como producto, por que existe y hacia donde va.

---

## 1. Por que existe JW-REMINDERS

En cada congregacion, la reunion de entre semana ("Vida y Ministerio") tiene asignaciones que se reparten entre publicadores: la Lectura de la Biblia y las partes de "Seamos mejores maestros". Coordinar esas asignaciones y **avisar a tiempo** a cada persona (y a su acompanante) es un trabajo recurrente, manual y facil de olvidar: se hace por mensajes sueltos, papelitos o memoria.

JW-REMINDERS existe para que **nadie llegue sin saber que tiene una asignacion** y para que **quien coordina no tenga que perseguir a nadie**. Convierte un proceso manual, disperso y propenso a errores en un flujo claro, ordenado y confiable, sin quitarle al coordinador el control ni el criterio.

---

## 2. Que problema resuelve

Antes de JW-REMINDERS, el responsable de la reunion enfrenta:

- **Avisos manuales repetitivos**: escribir uno por uno a cada asignado y acompanante, varias veces (al asignar, dias antes, el mismo dia).
- **Olvidos**: personas que no recuerdan su parte porque el aviso se perdio o nunca llego.
- **Cambios de ultima hora**: reasignaciones y cancelaciones que obligan a re-avisar a mano.
- **Falta de visibilidad**: nadie sabe de un vistazo que esta listo, que falta, que fallo o que sigue.
- **Distribucion desbalanceada**: las mismas personas terminan con muchas partes y otras con pocas, sin una forma facil de equilibrar.
- **Perdida de historial**: no queda registro claro de quien fue asignado, a que, ni si se le aviso.

JW-REMINDERS resuelve cada uno de esos puntos: planifica el mes, propone asignaciones equilibradas, envia los recordatorios automaticamente en el momento correcto, reacciona a los cambios y deja todo registrado.

---

## 3. Quien lo usa (usuario objetivo)

El producto sirve a quienes organizan la reunion de entre semana en una congregacion. Perfiles tipicos:

- **Coordinador de la reunion Vida y Ministerio**: planifica el mes, decide y revisa las asignaciones. Es el usuario central.
- **Secretario**: apoya con datos de los publicadores y el seguimiento.
- **Ancianos / responsables**: supervisan que todo este al dia.
- **Administrador del sistema**: configura la herramienta (zona horaria, hora de envio, sesion de WhatsApp, modo prueba).

Hoy todos operan bajo un unico acceso administrador. El producto esta pensado para que **una sola persona pueda llevar toda la operacion**, y para crecer hacia varios responsables o varias congregaciones cuando haga falta (ver seccion 7).

> Nota: a nivel tecnico existe un solo rol "admin"; los perfiles de arriba son perfiles de **uso**, no cuentas separadas todavia.

---

## 4. Como deberia sentirse usarlo

JW-REMINDERS deberia sentirse como un **asistente operativo tranquilo**, no como una hoja de calculo ni como una app de mensajeria.

- **Claro**: al entrar, el usuario sabe en segundos que hacer hoy, que falta, que fallo, que ya termino y que requiere atencion. Nunca se pregunta "y ahora que sigue".
- **Guiado**: cada pantalla deja claro donde esta, que puede hacer y cual es el siguiente paso. El sistema sugiere el camino; el usuario decide.
- **Confiable**: cuando dice que un recordatorio saldra, sale; cuando algo falla, lo muestra y permite reintentar. Sin sorpresas silenciosas.
- **Reversible y seguro**: nada definitivo ocurre sin aprobacion. Se puede revisar y corregir antes de que salga un solo mensaje.
- **Sobrio**: una sola experiencia visual, calmada y profesional; sin ruido, sin adornos, sin gritos de color (ver `DESIGN.md`).

La sensacion objetivo: **"esto piensa por mi en lo repetitivo, pero yo sigo al mando de lo importante."**

---

## 5. Filosofia del producto

1. **Propuesta antes que accion.** El sistema propone; la persona aprueba. Nada se vuelve definitivo ni se envia sin una decision humana.
2. **El coordinador manda.** La automatizacion reduce el trabajo manual, no reemplaza el criterio de quien organiza la reunion.
3. **Una sola pantalla para operar.** El dia a dia se entiende y se gestiona desde el Centro Operativo, sin saltar entre modulos.
4. **Equilibrio y justicia.** Repartir las asignaciones de forma pareja en el tiempo es un objetivo del producto, no un extra.
5. **Memoria que no se pierde.** Lo que paso queda registrado; el historial es sagrado y nunca se borra para "limpiar".
6. **Respeto.** El producto trata con cuidado a las personas (datos minimos, mensajes claros) y respeta el contenido y las reglas de las fuentes externas.
7. **Calma sobre novedad.** Estabilidad, claridad y consistencia valen mas que funciones llamativas.

---

## 6. Que diferencia a JW-REMINDERS de una simple app de recordatorios

Una app de recordatorios envia un mensaje en una hora. JW-REMINDERS entiende **el proceso completo de la reunion**:

- Conoce el **dominio**: programas, semanas, partes, asignados y acompanantes, no solo "eventos".
- **Planifica el mes** y **propone** una distribucion equilibrada considerando el historial y la elegibilidad de cada publicador.
- Maneja **roles** (asignado vs acompanante) y **multiples avisos** por asignacion (al asignar, 7/3/1 dias antes, el mismo dia).
- **Reacciona a cambios**: si se reasigna o cancela, regenera o cancela los avisos y notifica el cambio, sin trabajo manual.
- Da una **vision operativa** (que falta, que fallo, que sigue) y un **historial auditable** de cada mensaje.
- Mantiene **separados** los conceptos (estructura, propuesta, asignacion, automatizacion, mensaje) para que cada cosa tenga reglas claras.

En resumen: no es un temporizador de mensajes; es un **sistema de coordinacion de asignaciones** que ademas recuerda.

---

## 7. Como deberia evolucionar

Direccion de producto (el "como" tecnico vive en `docs/SCALABILITY.md`):

- **Corto plazo (consolidacion v1):** que una congregacion opere todo el mes sin fricciones; pulir la experiencia del Centro Operativo y de la propuesta de asignaciones.
- **Mediano plazo:** soporte para **varios responsables** (roles y permisos) y para **varias congregaciones** desde una misma instancia; importacion mas asistida del programa.
- **Largo plazo:** **multi-pais y multi-idioma**; **mas canales** de aviso ademas de WhatsApp (segun preferencia de cada persona); integracion mas directa con la fuente oficial del programa cuando sea viable y legal.

La evolucion siempre prioriza: primero confiabilidad y claridad para una congregacion; luego amplitud.

---

## 8. Principios que nunca cambiaran

- Ningun mensaje sale sin que exista un proceso claro detras (plan, programacion, registro). **Nunca se envia "a mano y a ciegas".**
- **Nada definitivo sin aprobacion humana.**
- **El historial nunca se borra** para ocultar o limpiar.
- **No se trata a las personas como datos descartables**: datos minimos, mensajes respetuosos.
- **Se respetan las fuentes externas**: no se copia ni redistribuye contenido protegido (ver `docs/P4-JW-SOURCE-RESEARCH.md`).
- **Una sola experiencia**: clara, sobria y consistente; el usuario nunca queda sin saber que sigue.

---

## 9. Modulos que existiran cuando este terminado

Vision de las piezas de producto (su detalle tecnico esta en los docs de arquitectura):

- **Centro Operativo**: la pantalla principal; estado, pendientes, alertas y siguiente paso.
- **Publicadores**: las personas, su disponibilidad y permisos (puede recibir asignaciones, puede acompanar).
- **Programas mensuales**: el plan del mes y su estado.
- **Semanas**: cada reunion con su fecha, hora y partes.
- **Importacion de programas**: traer la estructura del mes desde una fuente preparada por el responsable.
- **Plantillas de asignaciones**: las partes de cada semana, sin personas todavia.
- **Propuesta de asignaciones**: una reparticion equilibrada, revisable y editable antes de aprobar.
- **Automatizaciones / Recordatorios**: los avisos programados por asignacion y rol.
- **Centro de Automatizaciones**: supervision y control de lo que saldra, salio o fallo.
- **Historial**: el registro de todo lo enviado.
- **WhatsApp**: el canal de envio (y, a futuro, otros canales).
- **Configuracion**: zona horaria, hora de envio, modo prueba, sesion del canal.

---

## 10. Que cosas nunca hara el sistema

- **No** enviara mensajes sin que el responsable haya aprobado las asignaciones.
- **No** sera una aplicacion de mensajeria general ni un chat.
- **No** tomara decisiones doctrinales ni reemplazara el criterio del coordinador o de los ancianos.
- **No** hara scraping ni copiara/redistribuira contenido protegido de fuentes oficiales.
- **No** borrara el historial operativo.
- **No** enviara a destinatarios reales cuando este en modo prueba.
- **No** usara avisos intrusivos, emojis ni una experiencia ruidosa o inconsistente.
- **No** expondra datos personales mas alla de lo necesario para coordinar y avisar.

---

## 11. Como deberia verse dentro de cinco anos

Dentro de cinco anos, JW-REMINDERS deberia ser el **estandar tranquilo** para coordinar la reunion de entre semana:

- Una congregacion lo abre, **importa o crea su programa**, revisa una **propuesta ya equilibrada**, aprueba con un par de clics, y **se olvida**: los recordatorios salen solos, en el idioma y canal que cada persona prefiere, y los cambios se reflejan sin trabajo manual.
- Varios responsables y varias congregaciones conviven en la misma herramienta con permisos claros, cada una con su configuracion.
- El responsable entra al **Centro Operativo** y, en una sola mirada, sabe que el mes esta bajo control.
- El producto sigue sintiendose **sobrio, claro y confiable**: ha crecido en alcance sin perder la calma ni la simplicidad que lo definen.

La medida del exito a cinco anos no es cuantas funciones tiene, sino que **el coordinador confie tanto en el sistema que deje de preocuparse por los avisos** — y que esa confianza nunca se rompa.

---

## Donde esta cubierto el resto (referencias, sin duplicar)

| Tema | Documento |
|---|---|
| Como funciona por dentro | `docs/SYSTEM-ARCHITECTURE-v1.md` |
| Flujo operativo + secuencias | `docs/PROVIDERS-ARCHITECTURE.md` |
| Escalado tecnico | `docs/SCALABILITY.md` |
| Disciplina de ingenieria / proceso | `docs/MASTER-PROJECT-DIRECTIVE.md` |
| Diseno visual | `DESIGN.md`, `docs/DESIGN-SYSTEM-JW-REMINDERS.md` |
| Fuentes externas y limites legales | `docs/P4-JW-SOURCE-RESEARCH.md` |
| Deuda y auditoria | `docs/TECHNICAL-DEBT.md` |
