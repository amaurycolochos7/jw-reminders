# Auditoría forense JWPUB — por qué JW Library rechaza los archivos generados

Fecha: 2026-09-03 · Equipo: Windows 11, JW Library **15.9.36.0**
(`WatchtowerBibleandTractSo.45909CDBADF3C_5rz59y55nfz3e`)

---

## 0. Estado — CERRADO

**Causa raíz confirmada por A/B limpio: JW Library 15.9.36.0 verifica
criptográficamente una firma del editor (bloque `JASPER`) al importar. Sin la
clave privada de Watchtower no es posible generar un `.jwpub` instalable.**

Cadena de pruebas, todas con `pt14` desinstalado (sin confound de duplicado):

| Prueba | Comentario JASPER | Resultado |
|---|---|---|
| `TEST-00-BITCOPY` | firma real y válida | **instala** |
| `TEST-01-NOCOMMENT` | ausente | falla |
| `TEST-03-JASPER-RANDOM` | marca + longitud correctas, bloque aleatorio | **falla** |

`TEST-01` demuestra que la firma es **obligatoria**; `TEST-03` demuestra que su
contenido se **verifica** (no basta la presencia ni la forma). Es la misma
causa por la que `pt14z` y `mlsalon` son rechazados: no llevan firma válida.
No hay parámetro, tabla ni metadato que lo sustituya.

---

## 0-bis. Estado histórico (superado)

**Mecanismo `JASPER` identificado; su función exacta está pendiente de una
prueba negativa limpia.** No se declara causa raíz.

**Causa raíz demostrada por A/B limpio:** el comentario `JASPER` es
**obligatorio** para instalar.

| Prueba | Diferencia con el oficial | Estado de `pt14` en la app | Resultado |
|---|---|---|---|
| `TEST-00-BITCOPY` | ninguna (SHA-256 = oficial) | desinstalado | **instala** |
| `TEST-01-NOCOMMENT` | solo se quitó el comentario JASPER | desinstalado | **"No se pudo completar la instalación"** |

Dos archivos byte a byte idénticos salvo por los 243 bytes del comentario;
ambos con ZIP válido (`unzip -t` OK) y `manifest.hash` correcto. El único
factor que cambia el resultado es la presencia de la firma JASPER. Es la misma
causa por la que `pt14z` y `mlsalon` (que tampoco la llevan) son rechazados.

Lo que **todavía no** está demostrado: si la app solo comprueba la *presencia*
y forma del bloque, o si *verifica criptográficamente* su contenido. Lo decide
`TEST-03-JASPER-RANDOM` (sección 8):

- si `TEST-03` **instala** → basta un bloque con la marca y la longitud
  correctas → **sería viable forjar el comentario** y generar `.jwpub`
  instalables.
- si `TEST-03` **falla** → se verifica la firma → **no** es posible sin la
  clave privada del editor.

Hallazgo derivado (de la prueba inconclusa previa): **la detección de
duplicados por identidad/versión ocurre antes que la verificación de firma.**

---

## 1. Resumen ejecutivo

Los dos `.jwpub` oficiales disponibles llevan, al final del ZIP exterior, un
**comentario de 243 bytes** que empieza por la marca `JASPER\x00` seguida de
175 bytes en base64. Ninguno de los archivos que generamos tiene comentario.

Análisis estático de solo lectura de `JWLibrary.dll` (15.9.36.0) muestra, en
el mismo binario, las cadenas: `JASPER`, **`Ed25519`**, `ECDSA`, `PublicKey`,
`SignatureVerif…`, `VerifySignature`, `InvalidSignature`. El último segmento
del bloque JASPER mide **64 bytes**, el tamaño exacto de una firma Ed25519.

Esto vuelve **plausible con alto respaldo** que el bloque sea una firma del
editor que la app verifica al importar. Pero la correlación observada
(comentario presente ↔ instala) proviene de **solo 2 archivos oficiales**, y
la presencia de código de verificación en la DLL **no** prueba por sí sola que
la ruta de importación lo exija. Ambas cosas se dirimen con las pruebas A/B.

---

## 2. Alcance y límites de la evidencia

- **Solo existen 2 `.jwpub` oficiales** en el equipo: `pt14_S.jwpub` y
  `mwb_S_202611.jwpub` (el de `Documents\` es copia byte a byte del primero).
  No es posible la comparación entre 10 publicaciones que pediría un análisis
  robusto de la firma; las conclusiones sobre su estructura se basan en n=2.
- Las publicaciones ya instaladas viven **extraídas** en `LocalState\
  Publications\` (sin el envoltorio `.jwpub`), así que no aportan comentarios
  adicionales.
- El catálogo `catalog.db` guarda una columna `Signature`, pero es un **SHA-1
  de 40 hex** (hash de recurso), no el bloque JASPER.
- **No se puede probar la importación desde este entorno.** Requiere acción
  del usuario en la app. Todas las pruebas A/B quedan como protocolo.

---

## 3. Línea de tiempo de intentos

| # | Cambio | Resultado |
|---|---|---|
| 1 | `Book`/`bk`, miniaturas con firma inventada, `RootMepsLanguageIndex=1` | rechazado |
| 2 | `Manual/Guidelines`/`manual`, sin `issueProperties`, `images: []` | rechazado |
| 3 | `Book`/`bk`, manifest completo, `DocumentParagraph`, `ANALYZE` | rechazado |
| 4 | `pt14z` = clon de `pt14` solo con símbolo distinto | rechazado |
| 5 | `pt14z` corregido (319 filas re-cifradas: `Document` + `Extract`) | rechazado |

Ninguna de las variables tocadas cambió el resultado. Común a los 5: **ningún
archivo generado llevaba comentario ZIP**.

---

## 4. El bloque JASPER

Comentario ZIP: `JASPER` + `\x00` + 236 chars base64 → **175 bytes**.
Estructura idéntica en pt14 y mwb (n=2):

| Offset | Tam | Entropía | Contenido |
|---|---|---|---|
| `0x00` | 1 | — | `ab` |
| `0x01–0x04` | 4 | 0.81 | `00 00 00 02` (entero BE = 2, ¿versión?) |
| `0x05–0x64` | 96 | 6.3 | bloque A (alta entropía: cifrado o hash) |
| `0x65–0x6E` | 10 | 0.0 | ceros, **fijos en ambos** |
| `0x6F–0xAE` | 64 | 5.7 | bloque B (**tamaño de firma Ed25519 / ECDSA-P256 r‖s**) |

No es ASN.1/DER (no empieza por `0x30`). Con n=2 no se puede afirmar el
formato exacto (COSE, protobuf, estructura propietaria…): solo que hay un
prefijo constante, un contador de versión, un bloque de 96 B de alta entropía,
un relleno de 10 ceros y un bloque final de 64 B compatible con una firma.

### Evidencia estática en `JWLibrary.dll` (solo lectura)

```
ASCII : JASPER x1 · Ed25519 x2 · RSA x9 · PublicKey x9 · SignatureVerif x1 · VerifySignature x1 · curve x9
UTF-16: ECDSA x9 · PublicKey x29 · Signature x22 · InvalidSignature x3
```

La app **contiene** verificación de firmas y referencia Ed25519. Esto no
prueba que la importación de `.jwpub` la invoque; lo hace verosímil.

---

## 5. Hechos confirmados y descartes

**Transporte descartado.** Copias en Escritorio con SHA-256 idéntico al del
proyecto.

**El catálogo no interviene.** `pt14` y `S-34` **no** figuran en `catalog.db`
(341.178 publicaciones) y ambos están instalados. La pertenencia al catálogo
no condiciona la instalación.

**Matriz de hipótesis:**

| Hipótesis | Estado | Evidencia |
|---|---|---|
| Corrupción en transferencia | descartada | SHA-256 coincide |
| Validación contra `catalog.db` | descartada | `pt14`/`S-34` ausentes del catálogo y sí instalados |
| `publicationType`/categoría | descartada | intento 3 usó `Book`/`bk` y falló |
| Contenido cifrado inconsistente | descartada | intento 5 re-cifró 319 filas y falló |
| Restricción `NOT NULL` / índice único | descartada | `KeySymbol`←`UndatedSymbol`, sin colisión |
| Codificación del manifest | descartada | oficiales en UTF-8 crudo igual que los nuestros |
| Tablas de búsqueda vacías | pendiente | `pt14z` las conserva y aun así falla → improbable, no probado |
| **Firma `JASPER` ausente** | **principal, no probada** | correlación n=2 + código de verificación en la DLL |

---

## 6. Errores de análisis previos (registrados)

1. `pt14z` v1 no era control válido: conservaba 280 filas de `Extract.Content`
   con la clave anterior.
2. Se dieron por buenos `Manual/Guidelines`/`manual` (de `html2jwpub`); el
   registro solo reconoce `Watchtower/Meeting Workbook/Book/Talk/Bible`.
3. El verificador rechazaba `Class=106`, presente en un oficial.
4. Exigía archivo local para todo `Multimedia`; `mwb` descarga vídeos aparte.
5. No incluía `IssueTagNumber` en la clave (`mwb` = `1_mwb26_2026_20261100`).
6. **Las 18 comprobaciones nunca fueron evidencia de aceptación**: medían
   coherencia interna, no autenticidad.

---

## 7. Contenido cifrado: mapa completo

Toda columna `Content` usa la **misma** clave AES-128-CBC:

```
cardHash = SHA256("<Lang>_<Symbol>_<Year>[_<IssueTagNumber>]")
           XOR 11cbb5587e32846d4c26790c633da289f66fe5842a3a585ce1bc3a294af5ada7
key = cardHash[0:16]   iv = cardHash[16:32]
```

| Tabla | pt14 | mwb |
|---|---|---|
| `Document.Content` | 39 | 10 |
| `Extract.Content` | 280 | 103 |
| `DatedText.Content` | — | 9 |

`SearchIndexDocument` / `SearchTextRangeDocument` / `Word`: BLOBs **no**
cifrados, empaquetado propietario (bit alto como marcador).

---

## 8. Protocolo A/B — pendiente de ejecutar en instalación limpia

**Estado inicial obligatorio:** JW Library 15.9.36.0 con `pt14` **no**
instalado. No vale que `pt14` ya aparezca en la biblioteca: hay que importarlo
desde archivo. Entre pruebas, restaurar exactamente el mismo estado limpio.

Antes de nada: confirmar `SHA-256(pt14_S.jwpub) == SHA-256(TEST-00-BITCOPY)`
(ya verificado: `f19fc396…`).

Variantes en `artifacts\jwpub-audit\variants\`, todas desde `pt14_S.jwpub`,
una sola variable:

**Confound descubierto:** todas las variantes 01–07 comparten la identidad
`pt14` versión 8. Si una ya está instalada (p. ej. `TEST-00`), importar otra
dispara *"Ya tiene instalada la misma versión o una anterior"* y **nunca** se
llega a JASPER. Cada prueba negativa exige partir de un estado con `pt14`
desinstalado.

| Archivo | Única diferencia | Qué demuestra si **falla** | Import |
|---|---|---|---|
| `TEST-00-BITCOPY` | ninguna (SHA-256 = oficial) | ruta de import rota → experimento inválido | ✅ **instala** |
| `TEST-01-NOCOMMENT` | comentario JASPER eliminado | **la firma es obligatoria** | ❌ **falla (limpio)** |
| `TEST-07-COMMENT-TRUNC` | firma truncada a 120 B | se valida la longitud del bloque | ⬜ |
| `TEST-02-JASPER-BITFLIP` | 1 bit cambiado en la firma | se valida el **contenido** de la firma | ⬜ |
| `TEST-03-JASPER-RANDOM` | bloque de firma aleatorio (marca+longitud OK) | se **verifica**, no solo la presencia | ⬜ |
| `TEST-04-PAYLOAD-BITFLIP` | 1 byte de `contents` + CRC ZIP corregido → solo `manifest.hash` mal | prueba la **capa de hash** (independiente de JASPER) | ⬜ |
| `TEST-06-ZIP-METADATA` | 1 bit de timestamp DOS | aísla si importan los metadatos ZIP | ⬜ |

**Procedimiento de cada prueba negativa (01–07):** desinstalar todo `pt14`
(incluido `TEST-00` si quedó instalado) → importar la variante → si instala,
desinstalarla antes de la siguiente. De lo contrario chocan con la detección
de duplicados y el resultado es inválido.

**Interpretación:**

- `TEST-00` **instaló** (confirmado con `pt14` desinstalado): ruta de import y
  control OK.
- Con `pt14` desinstalado, `TEST-01` **falla** → **el comentario JASPER es
  necesario**. Todavía no que sea una firma ligada al contenido.
- Con `pt14` desinstalado, `TEST-01` **instala** → la firma no es obligatoria
  para importar, y el rechazo de `pt14z`/`mlsalon` se debe a otra cosa.
- `TEST-02`/`TEST-03` fallan → se valida el **contenido** del bloque, no solo
  su presencia → es una verificación real (firma o MAC).
- `TEST-07` distingue "comprueba longitud" de "comprueba solo la marca".
- `TEST-04` prueba la capa de hash por separado. Nota: si JASPER es una firma
  sobre el contenido, **no existe** un estado "firma válida + contenido
  cambiado" (cualquier cambio la invalida y no podemos re-firmar sin la clave
  privada); por eso no hay variante que edite el manifest y re-firme.

**No** se incluye ninguna variante que copie la firma de un oficial a un
archivo propio: sería falsificar el control, no diagnosticarlo.

---

## 9. `html2jwpub` (evidencia fechada)

Repo `darioragusa/html2jwpub`, último commit **2025-07-24** (`a71411d`). Su
código de empaquetado (`jwpubCreator.swift`, ZIPFoundation) **no escribe
comentario ZIP ni ninguna firma**; la única aparición de "signature" es
`mimeTypeSignatures` (bytes mágicos para detectar MIME).

Por tanto, un `.jwpub` recién hecho con esa versión **no** llevaría bloque
JASPER. Si la hipótesis de la sección 8 se confirma, ese archivo también sería
rechazado por 15.9.36.0. **No verificado directamente**: compilar
`html2jwpub` requiere macOS/Xcode, no disponible aquí. No se afirma que
"pertenece a una versión anterior"; solo que su fuente fechada no firma.

---

## 10. Reproducir

```bash
python -c "import zipfile;print(zipfile.ZipFile('pt14_S.jwpub').comment[:40])"
zipinfo -v pt14_S.jwpub | grep -i comment
python scripts/jwpub/make_variants.py pt14_S.jwpub
python scripts/jwpub/verify_jwpub.py mlsalon_S.jwpub --reference pt14_S.jwpub --deep
```

```powershell
$d="C:\Program Files\WindowsApps\WatchtowerBibleandTractSo.45909CDBADF3C_15.9.36.0_x64__5rz59y55nfz3e"
Get-ChildItem $d -Recurse -Include *.dll | ForEach-Object {
  if([Text.Encoding]::ASCII.GetString([IO.File]::ReadAllBytes($_.FullName)) -match "JASPER"){ $_.Name } }
```

---

## 11. Conclusión provisional

La hipótesis con más respaldo es que **el bloque `JASPER` es una firma del
editor verificada al importar**, apoyada por (a) la correlación presencia↔éxito
en n=2 y (b) la existencia de `Ed25519`/`VerifySignature`/`InvalidSignature` y
un bloque final de 64 B en el binario. **Aún no está demostrada.**

Progreso de las pruebas:

- `TEST-00` (control) **instala**.
- `TEST-01` (solo sin firma), con `pt14` desinstalado, **falla** con "No se
  pudo completar la instalación". **Prueba negativa limpia superada.**

**Conclusión:** el comentario `JASPER` es un requisito de instalación. Dado el
código de verificación de firmas de la DLL (`Ed25519`/`VerifySignature`/
`InvalidSignature`) y el bloque de 64 B, la interpretación de firma del editor
es la más probable.

Queda un único punto abierto, con consecuencia práctica directa: `TEST-03`
decide si el bloque se **verifica** (no viable sin la clave privada) o solo se
**comprueba en forma** (forjar sería viable).
