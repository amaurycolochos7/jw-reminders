# docx2jwpub

Convierte un `.docx` maquetado en una publicación `.jwpub` que JW Library abre
de forma nativa.

## Uso

```bash
python scripts/jwpub/docx2jwpub.py "mi-documento.docx" \
  --symbol mlsalon \
  --year 2026 \
  --lang 1 \
  --title "Manual de limpieza y cuidado del salon" \
  --short "Manual de limpieza" \
  --reference pt14_S_extracted/contents_db/pt14_S.db \
  -o mlsalon_S.jwpub

python scripts/jwpub/verify_jwpub.py mlsalon_S.jwpub
```

`--reference` apunta al `.db` de una publicación oficial: de ahí se copia el
esquema SQLite exacto, para no depender de una transcripción a mano.

`--symbol`, `--year` y `--lang` **forman la clave de cifrado**. Si los cambias,
cambia la clave: hay que regenerar el archivo completo, no se puede editar.

## El formato

Verificado byte a byte contra `pt14_S.jwpub`.

```
.jwpub                    ZIP  { manifest.json (deflate), contents (STORED) }
contents                  ZIP  { <symbol>_S.db, *.jpg }
Document.Content          AES-128-CBC( zlib.deflate( html ) )
```

**`Document.Content` no es la única columna cifrada.** Toda columna `Content`
de la base usa la *misma* clave:

| Tabla | pt14 | mwb |
|---|---|---|
| `Document.Content` | 39 | 10 |
| `Extract.Content` | 280 | 103 |
| `DatedText.Content` | — | 9 |

Una sola fila cifrada con otra clave invalida el archivo completo y JW Library
aborta la instalación sin más detalle. Al re-sellar una publicación hay que
recorrer *todas* las tablas que tengan columna `Content`.

Derivación de la clave:

```
pubString = "<MepsLanguageIndex>_<Symbol>_<Year>"      # + "_<IssueTagNumber>" si != 0
cardHash  = SHA256(pubString) XOR
            11cbb5587e32846d4c26790c633da289f66fe5842a3a585ce1bc3a294af5ada7
key = cardHash[0:16]     iv = cardHash[16:32]
```

Integridad que valida la app:

| Campo | Valor |
|---|---|
| `manifest.hash` | SHA256 del archivo `contents` |
| `publication.hash` | SHA1 del `.db` |
| `manifest.expandedSize` | suma de tamaños sin comprimir dentro de `contents` |

## Metadatos: qué acepta JW Library

El registro interno de la app está en

```
%LOCALAPPDATA%\Packages\WatchtowerBibleandTractSo.45909CDBADF3C_5rz59y55nfz3e
  \LocalState\Data\pub_collections.db
```

Su tabla `Publication` lista lo que se instaló con éxito, y de ahí salen los
**únicos** valores válidos observados:

| `PublicationType` | categoría |
|---|---|
| `Watchtower` | `w` |
| `Meeting Workbook` | `mwb` |
| `Book` | `bk` |
| `Talk` | `talk` |
| `Bible` | `bi` |

`Manual/Guidelines` y `manual` **no** están reconocidos y hacen fallar la
instalación, aunque `html2jwpub` los use. El generador emite `Book` / `bk`.

Otros detalles del registro, útiles para depurar:

- `KeySymbol` se deriva de `UndatedSymbol`, y hay un índice **único** en
  `(KeySymbol, LanguageIndex, IssueTagNumber)`: dos publicaciones con el mismo
  símbolo, idioma y número chocan.
- `ExpandedSize` se guarda tal cual viene de `manifest.expandedSize`.
- La tabla `Image` solo **indexa** el campo `Signature`; no lo verifica. La
  firma es `SHA1(imagen maestra):ancho:alto`, y los tres tamaños de `pt14`
  comparten el mismo SHA1.
- `manifest.publication` debe traer `issueAttributes` e `issueProperties`
  (con sus 8 claves, vacías si la publicación no es periódica). Omitirlos
  aborta la instalación.
- `Document.Class` está declarada `TEXT`. Se usa `13` en todos los
  documentos; `39` (portada) y `19` (índice) aparecen en `pt14`, y `mwb` usa
  `106`. El juego de valores es más amplio que el de un libro.
- El catálogo oficial (`Catalog/Production/catalog.db`, 341.178
  publicaciones) **no** condiciona la instalación: ni `pt14` ni `S-34` están
  en él y ambos están instalados. La publicación no necesita existir en el
  catálogo.

## Limitación conocida: búsqueda

Las tablas `SearchIndexDocument`, `Word` y `SearchTextRangeDocument` quedan
vacías. Sus BLOBs usan un empaquetado propietario de MEPS (bytes con el bit
alto como marcador) que no está reproducido aquí.

Consecuencia: la publicación se instala y se lee con normalidad, pero **no
aparece en los resultados de búsqueda global** de JW Library. La navegación
por el índice, los marcadores y las notas sí funcionan.

## reseal_jwpub.py — control de diagnóstico

Re-empaqueta una publicación oficial cambiándole solo el símbolo (y
re-cifrando el contenido con la clave nueva). Todo lo demás —índices de
búsqueda incluidos— sigue siendo el original.

```bash
python scripts/jwpub/reseal_jwpub.py pt14_S.jwpub --symbol pt14z -o pt14z_S.jwpub
```

- Si **sí** instala → la app acepta símbolos propios; cualquier fallo está en
  cómo generamos el nuestro.
- Si **no** instala → la app rechaza publicaciones ajenas a su catálogo, y la
  vía del `.jwpub` propio no es viable.

## Sobre el diseño

JW Library aplica **su propia hoja de estilos** y no admite CSS externo: el
`contents` solo acepta la base de datos y las imágenes. Un `.jwpub` oficial no
contiene ni un `style=`, ni un color hexadecimal, ni un `font-family`.

Por eso el generador no intenta reproducir la maquetación del Word. Emite
únicamente las clases que la app ya sabe estilizar:

`contextTtl` · `bodyTxt` · `section` · `pGroup` · `boxTtl` · `boxContent` ·
`blockTxt` · `north_center` · `coverTtl`

Los banners de sección sí se conservan como imágenes, así que la identidad
visual del documento sobrevive por esa vía.

## Heurísticas de conversión

El documento de origen no usa estilos de encabezado — todo es "Normal" con
formato directo. La estructura se infiere del tamaño de fuente:

| Origen | Salida |
|---|---|
| ≥ 40 pt | título de portada |
| 20–39 pt, no numérico | `<h1>`, inicia capítulo |
| numeral a 31–40 pt (`1`, `1.2`) | etiqueta de sección, se absorbe en el encabezado |
| ≥ 11 pt en negrita | `<h2>`, inicia `<section>` |
| 8–10 pt en negrita, < 60 car. | `<h3>` |
| ≤ 7 pt en negrita, versalitas | `contextTtl` |
| texto blanco en negrita sobre color | recuadro `boxTtl` + `boxContent` |
| resto | `<p>` |

Limpiezas aplicadas al texto del Word:

- `unspace()` — `"S E C C I Ó N   1"` → `"SECCIÓN 1"` (el tracking está hecho
  con espacios reales; dos o más espacios marcan corte de palabra).
- `join_runs()` — inserta `": "` cuando una etiqueta en versalitas queda pegada
  a su valor (`"PERSONAL RECOMENDADOAmbos grupos"`).
- `dedup()` — la maquetación en tablas repite algunos textos dos veces.

Las tablas del Word se desarman: en este documento el 98 % del texto vivía
dentro de tablas usadas como rejilla de posicionamiento, no como datos.

Las imágenes se recomprimen a JPEG (máx. 1400 px de ancho), como las
publicaciones oficiales: 7.9 MB de PNG → 0.61 MB.

## Instalar en JW Library

Android / Windows: abrir el `.jwpub` con la app, o *Publicaciones → Importar
JWPUB*. iOS: compartir el archivo y elegir JW Library.
