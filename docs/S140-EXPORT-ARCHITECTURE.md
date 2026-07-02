# S-140 Export Architecture — Auditoría Técnica Completa

## 1. Auditoría del DOCX (S-140.docx)

### 1.1 Estructura General del Documento

| Propiedad | Valor |
|-----------|-------|
| Tamaño de página | Letter (12240 × 15840 twips = 8.5" × 11") |
| Márgenes | Top: 1009tw (~0.70"), Right: 1140tw (~0.79"), Bottom: 720tw (~0.50"), Left: 1140tw (~0.79") |
| Orientación | Vertical (Portrait) |
| Columnas | 1 sola columna |
| Idioma base | en-US (con contenido en español) |
| Grid de línea | 360 twips |
| Headers/Footers | Even/Odd + First Page diferenciados |

### 1.2 Tipografía

| Elemento | Fuente | Tamaño |
|----------|--------|--------|
| Default body | Calibri (minorHAnsi theme) | 11pt (22 half-points) |
| Título "Programa para la reunión..." | Cambria (majorHAnsi theme) | 16.5pt (33hp), spacing -4 |
| Nombre de congregación | Calibri Bold | 11pt |
| Etiquetas (Presidente:, Oración:) | Calibri Bold | 8pt (16hp), color #575A5D |
| Tiempos (0:00) | Calibri Bold | 9pt (18hp), color #575A5D |
| Encabezados de sección | Calibri Bold | 10pt (20hp), blanco sobre fondo |
| Partes del programa | Calibri Regular | 11pt |
| Duración "(10 mins.)" | Calibri Regular | 10pt (20hp) |
| Pie de página (S-140-S) | Calibri Regular | 10pt (20hp) |
| Texto auxiliar "Auditorio principal" | Calibri Bold | 8pt (16hp), color #575A5D |
| Viñetas de lista | Symbol | 11pt (22hp) |

### 1.3 Colores del Documento

| Uso | Color Hex | Descripción |
|-----|-----------|-------------|
| Borde inferior del encabezado | #575A5D | Gris oscuro oficial |
| Fondo "TESOROS DE LA BIBLIA" | #575A5D | Gris oscuro |
| Fondo "SEAMOS MEJORES MAESTROS" | #BE8900 | Dorado/ámbar |
| Fondo "NUESTRA VIDA CRISTIANA" | #7E0024 | Rojo oscuro/granate |
| Texto de secciones sobre fondo | #FFFFFF | Blanco |
| Etiquetas grises | #575A5D | Gris oscuro |
| Viñetas bullet (numId=1) | #575A5D | Gris (sección Tesoros) |
| Viñetas bullet (numId=3) | #BE8900 | Dorado (sección SMM) |
| Viñetas bullet (numId=0/3) | #7E0024 | Granate (sección NVC) |

### 1.4 Estructura de Tablas

El documento completo es **una sola tabla** (no hay párrafos sueltos fuera de ella).

- **Estilo base:** `Tablaconcuadrcula1` (Table Grid personalizado)
- **Ancho total:** 14,830 twips (~26.1 cm, cubre márgenes reducidos en Letter)
- **Grid de columnas:** 15 columnas irregulares con gridSpan extensivo
  - Columna 1 (617tw): Tiempos "0:00"
  - Columna 2 (15tw): Micro-separador
  - Columna 3 (2638tw): Contenido principal izquierdo
  - Columnas 4-12: Variables con gridSpan para crear layouts
  - Columna 13 (2339tw): Etiquetas derecha
  - Columna 14 (2442tw): Nombres de asignados
  - Columna 15 (4870tw): gridAfter (no visible, ajuste de ancho)

- **Bordes:** Todos `nil` excepto borde inferior principal (`thinThickSmallGap`, 18pt, #A6A6A6)
- **Celdas sombreadas:** Solo los encabezados de sección (TESOROS, SEAMOS, NUESTRA VIDA)
- **Filas separadoras:** Filas de altura exacta 126-144 twips (invisible, solo espaciado)
- **Alturas de fila:** 288 twips estándar para filas de contenido

### 1.5 Layout por Semana (Patrón Repetitivo)

Cada semana sigue este patrón exacto de filas:

```
1. [ENCABEZADO] Congregación | Título "Programa para la reunión..."
2. [SEPARADOR] Fila vacía 144tw
3. [SEMANA] "16-22 DE MARZO | ISAÍAS 45-47" + Presidente: Nombre
4. [ORACIÓN] Vacío | Oración: Nombre
5. [SEPARADOR] Fila vacía 144tw
6. [CANCIÓN] 0:00 | Canción XXX
7. [INTRODUCCIÓN] 0:00 | Palabras de introducción (1 min.)
8. [SEPARADOR] Fila vacía 126tw
9. [SECCIÓN] ████ TESOROS DE LA BIBLIA ████ | "Auditorio principal"
10. [PARTE1] 0:00 | 1. "Título del discurso" (10 mins.) | Nombre
11. [PARTE2] 0:00 | 2. Busquemos perlas escondidas (10 mins.) | Nombre
12. [PARTE3] 0:00 | 3. Lectura de la Biblia (4 mins.) | Nombre
13. [SEPARADOR] Fila vacía 126tw
14. [SECCIÓN] ████ SEAMOS MEJORES MAESTROS ████ | "Auditorio principal"
15. [PARTE4] 0:00 | 4. Parte SMM (X mins.) (ref.) | Est/Ayudante: Nombres
16. [PARTE5] 0:00 | 5. Parte SMM (X mins.) (ref.) | Est/Ayudante: Nombres
17. [PARTE6] 0:00 | 6. Parte SMM (X mins.) (ref.) | Est/Ayudante: Nombres
18. [SECCIÓN] ████ NUESTRA VIDA CRISTIANA ████
19. [CANCIÓN] 0:00 | Canción XXX
20. [PARTE7] 0:00 | 7. Parte NVC (X mins.) | Nombre
21. [PARTE8] 0:00 | 8. Parte NVC (X mins.) | Nombre  ← O EBC
22. [EBC] 0:00 | Estudio bíblico de la congregación (30 min.) | Conductor/Lector
23. [CONCLUSIÓN] 0:00 | Palabras de conclusión (3 mins.)
24. [CANCIÓN FINAL] Canción XXX | Oración: Nombre
```

**NOTA:** La Semana 2 NO repite el encabezado de congregación. Solo contiene desde la fila de semana en adelante.

### 1.6 Elementos Especiales

- **No hay bookmarks** ni content controls en el documento
- **No hay placeholders** con sintaxis tipo `{{variable}}`
- **No hay imágenes** ni diagramas
- **Footer:** "S-140-S  11/23" (código de formulario + fecha de revisión)
- **Headers:** Vacíos (solo espaciado configurado)
- **Numeración:** 4 listas abstractas de viñetas (bullets coloreados por sección)
- **No hay saltos de página explícitos** — el contenido fluye naturalmente

---

## 2. Inventario Completo de Datos Variables

### 2.1 Datos de Encabezado (una vez por documento)

| # | Dato Variable | Ejemplo en Plantilla | Entidad del Sistema | Campo |
|---|---------------|---------------------|---------------------|-------|
| 1 | Nombre de congregación | "LA PLAZA NUEVO LEON" | AppConfig | `key: "congregation_name"` |

### 2.2 Datos por Semana (se repiten N veces)

| # | Dato Variable | Ejemplo | Entidad | Campo(s) |
|---|---------------|---------|---------|----------|
| 2 | Rango de fechas | "16-22 DE MARZO" | JwMeetingWeek | `weekStartDate` (calculado) |
| 3 | Lectura bíblica semanal | "ISAÍAS 45-47" | MeetingProgramItem | `title` (sección OPENING, sortOrder bajo) |
| 4 | Presidente | "Gabriel de la T" | JwAssignment | `assigned.displayName` where `assignmentType = CHAIRMAN` |
| 5 | Oración inicial | "-" | JwAssignment | `assigned.displayName` where `assignmentType = OPENING_PRAYER` |
| 6 | Canción inicial (número) | "120" | MeetingProgramItem | `title` where `assignmentType = SONG`, sortOrder 1 |
| 7 | Canción intermedia (número) | "38" | MeetingProgramItem | `title` where `assignmentType = SONG`, sortOrder 2 |
| 8 | Canción final (número) | "148" | MeetingProgramItem | `title` where `assignmentType = SONG`, sortOrder 3 |

### 2.3 Sección TESOROS DE LA BIBLIA

| # | Dato Variable | Ejemplo | Entidad | Campo(s) |
|---|---------------|---------|---------|----------|
| 9 | Título discurso Tesoros | ""Yo soy Dios, y no hay nadie como yo"" | MeetingProgramItem | `title` where `assignmentType = TREASURES_TALK` |
| 10 | Duración Tesoros | "10 mins." | MeetingProgramItem | `durationMinutes` |
| 11 | Asignado Tesoros | "Javier V" | JwAssignment | `assigned.displayName` where `assignmentType = TREASURES_TALK` |
| 12 | Asignado Perlas | "Julio Díaz" | JwAssignment | `assigned.displayName` where `assignmentType = SPIRITUAL_GEMS` |
| 13 | Duración Perlas | "10 mins." | MeetingProgramItem | `durationMinutes` |
| 14 | Asignado Lectura | "Amaury Gordillo" | JwAssignment | `assigned.displayName` where `assignmentType = BIBLE_READING` |
| 15 | Duración Lectura | "4 mins." | MeetingProgramItem | `durationMinutes` |

### 2.4 Sección SEAMOS MEJORES MAESTROS (Variable: 2-4 partes)

| # | Dato Variable | Ejemplo | Entidad | Campo(s) |
|---|---------------|---------|---------|----------|
| 16 | Título parte N | "Empiece conversaciones" | MeetingProgramItem | `title` where section = `APPLY_YOURSELF` |
| 17 | Duración parte N | "3 mins." | MeetingProgramItem | `durationMinutes` |
| 18 | Referencia parte N | "(lmd Lec 5 punto 3)" | MeetingProgramItem | `reference` |
| 19 | Estudiante parte N | "Ninive V" | JwAssignment | `assigned.displayName` where section = `APPLY_YOURSELF` |
| 20 | Ayudante parte N | "Emili Espinoza" | JwAssignment | `companion.displayName` |

**Multiplicador:** Típicamente 3 partes (4, 5, 6) pero puede variar entre 2-4.

### 2.5 Sección NUESTRA VIDA CRISTIANA (Variable: 1-3 partes + EBC)

| # | Dato Variable | Ejemplo | Entidad | Campo(s) |
|---|---------------|---------|---------|----------|
| 21 | Título parte NVC N | "Jehová es el único que siempre nos puede ayudar" | MeetingProgramItem | `title` where section = `LIVING_AS_CHRISTIANS` |
| 22 | Duración parte NVC N | "7 mins." | MeetingProgramItem | `durationMinutes` |
| 23 | Asignado parte NVC N | "Gabriel de la T" | JwAssignment | `assigned.displayName` |
| 24 | Conductor EBC | "Alejando M" | JwAssignment | `assigned.displayName` where `assignmentType = CONGREGATION_BIBLE_STUDY_CONDUCTOR` |
| 25 | Lector EBC | "Julio Diaz" | JwAssignment | `assigned.displayName` where `assignmentType = CONGREGATION_BIBLE_STUDY_READER` |
| 26 | Duración EBC | "30 min." | MeetingProgramItem | `durationMinutes` |

### 2.6 Sección de CIERRE

| # | Dato Variable | Ejemplo | Entidad | Campo(s) |
|---|---------------|---------|---------|----------|
| 27 | Oración final | "Alejandro M" | JwAssignment | `assigned.displayName` where `assignmentType = CLOSING_PRAYER` |

### 2.7 Resumen del Inventario

**Total de datos variables por semana: ~25-30** (dependiendo de la cantidad de partes SMM y NVC).
**Total para un documento de 2 semanas: ~50-60 reemplazos.**
**Total máximo (5 semanas): ~125-150 reemplazos.**

---

## 3. Arquitectura Propuesta

### 3.1 Decisión Técnica: Opción A — Template-Based (RECOMENDADA)

#### Justificación

| Criterio | Opción A (Template) | Opción B (Generar desde cero) |
|----------|--------------------|-----------------------------|
| Fidelidad visual | 100% — XML idéntico | ~95% — siempre hay discrepancias |
| Complejidad de implementación | Media | Muy Alta |
| Mantenibilidad | Alta (actualizar plantilla = actualizar output) | Baja (cualquier cambio requiere código) |
| Riesgo de regresiones | Bajo | Alto |
| Adaptabilidad a cambios del formulario | Solo reemplazar archivo plantilla | Reescribir generador completo |
| Dependencias externas | Librería ZIP + XML parser | docx-lib pesada (python-docx, docx4j, etc.) |

**VEREDICTO: Opción A — usar S-140.docx como plantilla viva.**

Pero NO como "buscar y reemplazar texto plano" — sino con una estrategia híbrida:

### 3.2 Estrategia Híbrida: Template Cloning + Row Replication

La plantilla S-140.docx contiene 2 semanas de ejemplo. La estrategia es:

1. **Abrir el DOCX como ZIP** y parsear `word/document.xml`
2. **Identificar las filas (w:tr)** de la tabla que corresponden a cada "bloque semana"
3. **Clonar el bloque de filas** tantas veces como semanas se necesiten (1-5)
4. **Reemplazar los textos** dentro de cada clon con los datos reales
5. **Eliminar las filas sobrantes** si se piden menos semanas que las existentes
6. **Re-empaquetar como ZIP** y servir como .docx

### 3.3 Arquitectura de Componentes

```
┌─────────────────────────────────────────────────────┐
│                   Frontend (React)                     │
│   Botón "Descargar S-140" → GET /api/export/s140     │
└────────────────────────┬────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────┐
│              API Endpoint (Express)                    │
│   GET /api/export/s140?monthlyScheduleId=XXX          │
│   GET /api/export/s140?weekIds=id1,id2,...             │
│   GET /api/export/s140?year=2025&month=3              │
└────────────────────────┬────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────┐
│           S140 Export Service                          │
│                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │ Data Fetcher │  │ Template     │  │ Row       │  │
│  │ (Prisma)     │  │ Engine       │  │ Replicator│  │
│  └──────┬───────┘  └──────┬───────┘  └─────┬─────┘  │
│         │                  │                │        │
│         ▼                  ▼                ▼        │
│  ┌─────────────────────────────────────────────────┐ │
│  │              DOCX Assembler                      │ │
│  │  1. Unzip template                              │ │
│  │  2. Parse document.xml                          │ │
│  │  3. Clone week blocks                           │ │
│  │  4. Replace text nodes                          │ │
│  │  5. Adjust row count                            │ │
│  │  6. Repackage as DOCX                           │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────┐
│              Template Storage                          │
│   /templates/S-140.docx (archivo oficial)             │
└─────────────────────────────────────────────────────┘
```

---

## 4. Estrategia de Reemplazo

### 4.1 Identificación de Bloques (Row Mapping)

El document.xml es una tabla con filas `<w:tr>`. Cada semana es un bloque identificable por:

1. **Fila de rango de fecha:** Contiene un run con texto tipo "16-22 DE MARZO | ISAÍAS 45-47"
2. **Fila de sección TESOROS:** Celda con `shd fill="575A5D"` y texto "TESOROS DE LA BIBLIA"
3. **Fila de sección SMM:** Celda con `shd fill="BE8900"` y texto "SEAMOS MEJORES MAESTROS"
4. **Fila de sección NVC:** Celda con `shd fill="7E0024"` y texto "NUESTRA VIDA CRISTIANA"
5. **Fila final de semana:** Contiene "Oración:" seguido del nombre de la oración final

### 4.2 Algoritmo de Reemplazo por Posición

**Estrategia: Navegación por posición relativa dentro de cada bloque.**

Para cada bloque de semana, las filas se identifican por su posición ordinal:

```
Bloque Semana[i]:
  Fila 0: Fecha + Lectura semanal + Presidente
  Fila 1: Oración inicial  
  Fila 2: (separador)
  Fila 3: Canción inicial
  Fila 4: Palabras de introducción
  Fila 5: (separador)
  Fila 6: === TESOROS DE LA BIBLIA ===
  Fila 7: Punto 1 - Tesoros (título + nombre)
  Fila 8: Punto 2 - Perlas (título + nombre)
  Fila 9: Punto 3 - Lectura (título + nombre)
  Fila 10: (separador)
  Fila 11: === SEAMOS MEJORES MAESTROS ===
  Fila 12..N: Partes SMM (VARIABLE, 2-4 filas)
  Fila N+1: === NUESTRA VIDA CRISTIANA ===
  Fila N+2: Canción intermedia
  Fila N+3..M: Partes NVC (VARIABLE, 1-3 filas)
  Fila M+1: Estudio bíblico / parte variable
  Fila M+2: Palabras de conclusión
  Fila M+3: Canción final + Oración final
```

### 4.3 Mecanismo de Reemplazo de Texto

El reemplazo NO es "find & replace" de texto plano. Es **sustitución por posición en el DOM XML**:

1. Localizar el `<w:tc>` (celda) correcta por posición de fila + columna
2. Dentro de la celda, encontrar los nodos `<w:r>` con `<w:t>` que contienen el texto
3. **Preservar todo el formato** (los `<w:rPr>` existentes) — solo cambiar el contenido de `<w:t>`
4. Si hay múltiples `<w:r>` con diferente formato (ej: título + duración), respetar la fragmentación

**Caso especial - Partes SMM con estudiante/ayudante:**
- La celda de nombre tiene formato: "Ninive V / Emili Espinoza"
- Se reemplaza como string completo en el nodo `<w:t>`

### 4.4 Manejo de Filas Variables (SMM y NVC)

Las secciones SMM y NVC tienen número variable de partes:
- **SMM:** 2, 3 o 4 partes (lo típico son 3)
- **NVC:** 1, 2 o 3 partes antes del EBC

**Estrategia:**
1. La plantilla tiene N filas de ejemplo para cada sección
2. Si se necesitan MÁS filas → **clonar** la última fila del tipo y rellenar
3. Si se necesitan MENOS filas → **eliminar** filas sobrantes del XML
4. Clonar preserva todo: gridSpan, formato, bullets, colores

---

## 5. Escalabilidad (1-5 semanas)

### 5.1 Diseño Multi-Semana

La plantilla contiene 2 semanas. El sistema debe soportar:

| Semanas | Estrategia |
|---------|-----------|
| 1 semana | Eliminar bloque semana 2 |
| 2 semanas | Usar plantilla tal cual, solo reemplazar datos |
| 3 semanas | Clonar bloque semana 2, agregar semana 3 |
| 4 semanas | Clonar 2 veces adicionales |
| 5 semanas | Clonar 3 veces adicionales |

### 5.2 Paginación

- Con márgenes actuales (0.70" top, 0.50" bottom), **2 semanas caben en 1 página**
- 3+ semanas fluyen naturalmente a página 2 (Word maneja paginación automática)
- No se necesitan saltos de página manuales — el contenido fluye dentro de la tabla

### 5.3 Encabezado de Congregación

El encabezado con el nombre de congregación y título oficial solo aparece **una vez** en la primera fila del documento. Se mantiene siempre, independientemente del número de semanas.

---

## 6. Riesgos Identificados

### 6.1 Riesgos de Formato

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|-----------|
| Texto demasiado largo en celda | Alta | Medio | Truncar nombres a N caracteres; validar longitudes |
| Nombres con caracteres especiales (acentos, ñ) | Alta | Bajo | Usar UTF-8 correcto en XML, escapar &, <, > |
| Desbordamiento de tabla al agregar filas SMM extra | Media | Alto | Clonar fila exacta preservando gridSpan; no inventar nuevas filas |
| Inconsistencia de IDs de filas/párrafos (w14:paraId) | Alta | Bajo | Generar IDs únicos (hex 8 chars) para cada fila clonada |
| Problema con rsid (revision session IDs) | Media | Bajo | Eliminar rsid de filas clonadas o usar un rsid fijo nuevo |

### 6.2 Riesgos de Datos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|-----------|
| Semana sin programa importado (importStatus != READY) | Media | Alto | Validar antes de exportar; mostrar error claro al usuario |
| Asignación sin persona asignada (vacante) | Media | Medio | Mostrar "—" o texto configurable en el espacio |
| Parte sin duración | Baja | Bajo | Omitir "(X mins.)" si no hay dato |
| EBC integrado como parte NVC (no separado) | Media | Medio | Detectar por assignmentType, no por posición |
| Canción sin número | Baja | Bajo | Mostrar "Canción —" |

### 6.3 Riesgos de Mantenimiento

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|-----------|
| JW.org actualiza el formulario S-140 | Baja (cada ~2 años) | Alto | Solo reemplazar `/templates/S-140.docx` con nueva versión |
| Cambio en número de secciones (nuevo bloque) | Muy Baja | Alto | Refactorizar block parser |
| Formato diferente entre idiomas | N/A | N/A | Solo español; si se internacionaliza, plantilla por idioma |
| Conflicto con rsid tracking en Word | Baja | Bajo | Strip rsid attributes de elementos clonados |

### 6.4 Riesgos de Escalabilidad

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|-----------|
| 5 semanas no caben en 1 hoja | Seguro | Bajo | Fluye a segunda hoja naturalmente (aceptable) |
| Partes NVC extra + partes SMM extra = demasiado contenido | Baja | Medio | El layout es flexible, pero monitorear |

---

## 7. Recomendaciones

### 7.1 Stack Tecnológico

| Componente | Recomendación | Justificación |
|-----------|---------------|---------------|
| ZIP handling | `jszip` (npm) | Maduro, ligero, ya en el ecosistema Node/TS |
| XML parsing | `fast-xml-parser` o manipulación string/regex | El XML es predecible; no se necesita DOM pesado |
| Template storage | `/templates/S-140.docx` en filesystem | Simple, versionable, reemplazable |
| API response | `Content-Disposition: attachment; filename="S-140_Marzo_2025.docx"` | Descarga directa |

### 7.2 Buenas Prácticas

1. **No generar el DOCX desde cero** — siempre partir de la plantilla oficial
2. **Validar TODOS los datos antes de generar** — no producir un documento con vacíos
3. **Nombres:** usar `displayName` cuando existe, fallback a `fullName`
4. **Truncado inteligente:** Si un nombre supera 25 caracteres, usar iniciales del apellido
5. **Preservar siempre** los nodos `<w:rPr>` (formato de run) al reemplazar texto
6. **Generar paraIds únicos** para evitar corrupción del documento
7. **Test de regresión:** abrir el DOCX generado en Word y verificar que no muestre errores

---

## 8. Plan de Implementación por Fases

### Fase 1: Infraestructura Base (Complejidad: Media)
- [ ] Copiar plantilla a `/templates/S-140.docx` ✅ (ya hecho)
- [ ] Crear servicio `S140ExportService` con método `generate(weekIds: string[])`
- [ ] Implementar la apertura del DOCX como ZIP y parseo del document.xml
- [ ] Implementar el block parser que identifica filas por semana
- [ ] Test: abrir plantilla → cerrar como ZIP → verificar que sigue abriéndose en Word

### Fase 2: Data Fetching (Complejidad: Baja)
- [ ] Crear query Prisma que obtenga toda la data necesaria para N semanas
- [ ] Include: `MeetingProgramItem` + `JwAssignment` + relaciones
- [ ] Mapear datos a un DTO intermedio `S140WeekData`
- [ ] Validar completitud de datos antes de generar

### Fase 3: Reemplazo de Datos (Complejidad: Alta)
- [ ] Implementar el reemplazo de texto por posición en cada bloque
- [ ] Manejar el caso de múltiples `<w:r>` por celda (formato mixto)
- [ ] Reemplazar nombre de congregación en fila 1
- [ ] Reemplazar todos los datos por semana (iterando bloques)
- [ ] Generar IDs únicos para filas clonadas

### Fase 4: Replicación de Filas (Complejidad: Alta)
- [ ] Implementar clonación de bloque semana para 3, 4, 5 semanas
- [ ] Implementar eliminación de bloque sobrante (para 1 semana)
- [ ] Implementar adición/eliminación de filas SMM (partes variables)
- [ ] Implementar adición/eliminación de filas NVC (partes variables)
- [ ] Verificar que gridSpan se preserva correctamente

### Fase 5: API Endpoint (Complejidad: Baja)
- [ ] Crear ruta `GET /api/export/s140`
- [ ] Parámetros: `monthlyScheduleId` O `weekIds[]` O `year+month`
- [ ] Response: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- [ ] Headers de descarga con nombre dinámico

### Fase 6: Frontend (Complejidad: Baja)
- [ ] Agregar botón "Descargar S-140" en la vista de programación mensual
- [ ] Trigger: abrir diálogo para seleccionar semanas o descargar todo el mes
- [ ] Loading state durante generación
- [ ] Manejo de errores (semanas sin datos, etc.)

### Fase 7: Testing y Pulido (Complejidad: Media)
- [ ] Test unitario del block parser
- [ ] Test de generación con 1, 2, 3, 4, 5 semanas
- [ ] Test con partes SMM variables (2, 3, 4)
- [ ] Test con nombres largos
- [ ] Test con datos faltantes (graceful fallback)
- [ ] Validación visual en Word, LibreOffice, Google Docs

---

## 9. Estimación de Complejidad

| Fase | Estimación | Dependencias |
|------|-----------|-------------|
| Fase 1: Infraestructura | 3-4 horas | jszip (instalar) |
| Fase 2: Data Fetching | 1-2 horas | Schema existente (listo) |
| Fase 3: Reemplazo | 4-6 horas | Fase 1 + 2 |
| Fase 4: Replicación | 4-6 horas | Fase 3 |
| Fase 5: API Endpoint | 1 hora | Fase 4 |
| Fase 6: Frontend | 2 horas | Fase 5 |
| Fase 7: Testing | 3-4 horas | Todo lo anterior |
| **TOTAL** | **18-25 horas** | — |

---

## 9. Conclusión Técnica

### Decisión Final

**Usar la Opción A (Template-Based)** con la estrategia de **Row Cloning + Positional Text Replacement**.

### Razones clave:

1. **Fidelidad 100%:** Al partir del archivo oficial, heredamos automáticamente todos los estilos, colores, fuentes, márgenes, bordes y espaciados sin tener que recrearlos programáticamente.

2. **Mantenibilidad a 5+ años:** Si JW.org actualiza el formulario S-140, solo hay que reemplazar el archivo `/templates/S-140.docx` con la nueva versión. El código de reemplazo se adapta si la estructura de filas no cambia drásticamente.

3. **Independencia del backend:** El servicio de exportación es un módulo aislado. Recibe un DTO con datos y produce un Buffer. Si mañana se migra de Prisma a otro ORM, o se cambia de PostgreSQL a otro motor, el exportador no se modifica.

4. **No se depende de librerías DOCX pesadas:** Solo se necesita `jszip` para manipular el ZIP y manipulación directa del XML. No hay dependencia en `docx` (npm), `python-docx`, ni `officegen` que agregan abstracción innecesaria y frecuentemente pierden formato.

5. **Escalabilidad natural:** El mecanismo de clonación de filas permite generar 1-5 semanas sin modificar la plantilla ni el algoritmo core.

### Archivo de plantilla oficial

```
/templates/S-140.docx  ← Fuente de verdad del formato oficial
```

Este archivo NO debe editarse manualmente para agregar placeholders.
Se usa tal cual como base, y el sistema navega por posición para reemplazar datos.
