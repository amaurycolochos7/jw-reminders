#!/usr/bin/env python3
"""
docx2jwpub - Convierte un .docx maquetado en una publicacion .jwpub nativa
para JW Library.

Formato verificado byte a byte contra pt14_S.jwpub:

  .jwpub                 ZIP { manifest.json (deflate), contents (stored) }
  contents               ZIP { <symbol>.db, *.png }
  Document.Content       AES-128-CBC( zlib.deflate( html ) )

  cardHash = SHA256("<MepsLanguageIndex>_<Symbol>_<Year>") XOR MASTER
             key = cardHash[:16]   iv = cardHash[16:32]

  manifest.hash          = SHA256(contents)
  publication.hash       = SHA1(<symbol>.db)
  manifest.expandedSize  = suma de tamanos sin comprimir dentro de contents

El HTML generado usa exclusivamente las clases de la hoja de estilos de
JW Library (contextTtl, bodyTxt, section, pGroup, boxTtl, boxContent,
blockTxt, north_center) para que la publicacion se vea nativa.
"""
import argparse
import hashlib
import io
import json
import os
import re
import sqlite3
import sys
import tempfile
import zipfile
import zlib
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
A = '{http://schemas.openxmlformats.org/drawingml/2006/main}'
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
RELNS = '{http://schemas.openxmlformats.org/package/2006/relationships}'
MASTER = bytes.fromhex('11cbb5587e32846d4c26790c633da289f66fe5842a3a585ce1bc3a294af5ada7')


# ────────────────────────────── cifrado ──────────────────────────────
def card_hash(lang, symbol, year, issue=0):
    s = f"{lang}_{symbol}_{year}" + (f"_{issue}" if issue else "")
    return bytes(a ^ b for a, b in zip(hashlib.sha256(s.encode()).digest(), MASTER))


def encrypt_html(html, ch):
    raw = zlib.compress(html.encode('utf-8'), 9)
    pad = 16 - (len(raw) % 16)                      # PKCS#7
    raw += bytes([pad]) * pad
    enc = Cipher(algorithms.AES(ch[:16]), modes.CBC(ch[16:32])).encryptor()
    return enc.update(raw) + enc.finalize()


def decrypt_html(blob, ch):
    dec = Cipher(algorithms.AES(ch[:16]), modes.CBC(ch[16:32])).decryptor()
    return zlib.decompress(dec.update(blob) + dec.finalize()).decode('utf-8')


# ─────────────────────────── lectura del .docx ───────────────────────────
def unspace(t):
    """'S E C C I O N   1' -> 'SECCION 1'.

    El Word separa las letras con espacios reales para lograr el efecto
    de tracking; dos o mas espacios marcan el corte de palabra."""
    out = []
    for part in re.split(r'\s{2,}', t.strip()):
        toks = part.split(' ')
        out.append(''.join(toks) if len(toks) > 2 and all(len(x) == 1 for x in toks) else part)
    return ' '.join(out)


def dedup(t):
    """La maquetacion en tablas repite algunos textos dos veces seguidas."""
    s = t.strip()
    if len(s) > 8 and len(s) % 2 == 0 and s[:len(s) // 2] == s[len(s) // 2:]:
        return s[:len(s) // 2]
    return t


def join_runs(rs):
    """Une los runs insertando ': ' cuando una etiqueta en versalitas queda
    pegada a su valor ('PERSONAL RECOMENDADOAmbos grupos...')."""
    parts = []
    for t, sz, *_ in rs:
        if not t:
            continue
        if parts:
            prev = ''.join(parts)
            if prev and not prev[-1].isspace() and not t[0].isspace():
                stripped = prev.strip()
                if len(stripped) > 3 and stripped.upper() == stripped and stripped[-1].isalpha():
                    parts.append(': ')
        parts.append(t)
    return ''.join(parts)


def parse_docx(path):
    z = zipfile.ZipFile(path)
    rels = {r.get('Id'): r.get('Target')
            for r in ET.fromstring(z.read('word/_rels/document.xml.rels')).iter(RELNS + 'Relationship')}
    root = ET.fromstring(z.read('word/document.xml'))

    def runs(p):
        out = []
        for r in p.iter(W + 'r'):
            t = ''.join(x.text or '' for x in r.findall(W + 't'))
            rp = r.find(W + 'rPr')
            sz, bold, color = 0, False, None
            if rp is not None:
                s = rp.find(W + 'sz')
                if s is not None:
                    sz = int(s.get(W + 'val')) // 2
                bold = rp.find(W + 'b') is not None
                c = rp.find(W + 'color')
                if c is not None:
                    color = c.get(W + 'val')
            imgs = [rels.get(b.get(R + 'embed')) for b in r.iter(A + 'blip') if b.get(R + 'embed')]
            out.append((t, sz, bold, color, [i for i in imgs if i]))
        return out

    def walk(node):
        for ch in node:
            if ch.tag == W + 'p':
                rs = runs(ch)
                txt = dedup(unspace(join_runs(rs)))
                imgs = [i for r in rs for i in r[4]]
                if not txt and not imgs:
                    continue
                yield dict(text=re.sub(r'\s+', ' ', txt).strip(),
                           size=max([r[1] for r in rs] or [0]),
                           bold=any(r[2] for r in rs if r[0].strip()),
                           color=next((r[3] for r in rs if r[0].strip() and r[3]), None),
                           imgs=[i.split('/')[-1] for i in imgs])
            elif len(ch):
                yield from walk(ch)

    media = {}
    for i in z.infolist():
        if i.filename.startswith('word/media/'):
            media[i.filename.split('/')[-1]] = z.read(i.filename)
    return list(walk(root.find(W + 'body'))), media


# ───────────────────────────── segmentacion ─────────────────────────────
NUMERAL = re.compile(r'[\d.\s]*')


def is_label(it):
    """Banner, numeral de seccion o etiqueta corta que precede a un titulo.

    Los numerales ("1", "1.2") van a 31-40pt en el Word, por eso no basta
    con filtrar por tamano pequeno.
    """
    if it['imgs']:
        return True
    if not it['bold'] or len(it['text']) >= 45:
        return False
    if NUMERAL.fullmatch(it['text']):
        return True
    return it['size'] <= 12


def segment(items):
    """Divide el documento en capitulos usando el tamano de fuente."""
    h1s = [i for i, it in enumerate(items)
           if it['size'] >= 20 and it['text'] and not re.fullmatch(r'[\d.\s]+', it['text'])]
    cover_ids = [i for i in h1s if items[i]['size'] >= 40]
    chapter_ids = [i for i in h1s if items[i]['size'] < 40]

    # el indice original (lo reconstruimos como TOC nativo)
    toc_i = next((i for i, it in enumerate(items)
                  if re.sub(r'\s+', '', it['text']).upper() == 'INDICE'
                  or re.sub(r'\s+', '', it['text']).upper() == 'ÍNDICE'), None)

    # retroceso: incluye banner/etiqueta previa al titulo
    starts = []
    floor_ = 0
    for s in chapter_ids:
        b = s
        while b - 1 >= floor_ and is_label(items[b - 1]):
            b -= 1
        starts.append(b)
        floor_ = s + 1

    first_chapter = starts[0] if starts else len(items)
    cover_end = toc_i if toc_i is not None else first_chapter

    docs = []
    cover_title = ' '.join(items[i]['text'] for i in cover_ids if i < cover_end).strip()
    docs.append(dict(kind='cover',
                     title=cover_title or 'Portada',
                     items=items[:cover_end]))
    if toc_i is not None:
        docs.append(dict(kind='toc', title='Contenido', items=[]))

    for n, b in enumerate(starts):
        end = starts[n + 1] if n + 1 < len(starts) else len(items)
        docs.append(dict(kind='chapter',
                         title=items[chapter_ids[n]]['text'],
                         h1=chapter_ids[n] - b,
                         items=items[b:end]))
    return docs


# ─────────────────────── generacion de HTML nativo ───────────────────────
class Pid:
    def __init__(self):
        self.n = 0

    def next(self):
        self.n += 1
        return self.n


def esc(t):
    return t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def figure(name, dims, idx):
    w, h = dims
    return (f'<div id="f{idx}" class="north_center"><figure>'
            f'<img src="jwpub-media://{name}" alt="" width="{w}" height="{h}" '
            f'class="north_center" /></figure></div>')


def build_chapter(doc, dims, pid):
    items, h1i = doc['items'], doc.get('h1', 0)
    out, figs = [], []

    # la etiqueta valida es la ultima no numerica antes del titulo
    eyebrow = next((it['text'] for it in reversed(items[:h1i])
                    if it['text'] and it['bold'] and not NUMERAL.fullmatch(it['text'])), None)
    banner = next((i for it in items[:h1i + 1] for i in it['imgs'] if i in dims), None)

    out.append('<header>')
    if eyebrow:
        out.append(f'<p class="contextTtl" id="p{pid.next()}" data-pid="{pid.n}">'
                   f'<strong>{esc(eyebrow)}</strong></p>')
    out.append(f'<h1 id="p{pid.next()}" data-pid="{pid.n}">'
               f'<strong>{esc(doc["title"])}</strong></h1>')
    out.append('</header>')

    if banner:
        figs.append(banner)
        out.append(figure(banner, dims[banner], len(figs)))

    out.append('<div class="bodyTxt">')
    state = dict(sec=0, in_sec=False, in_grp=False)

    def close_grp():
        if state['in_grp']:
            out.append('</div>')
            state['in_grp'] = False

    def close_sec():
        close_grp()
        if state['in_sec']:
            out.append('</div>')
            state['in_sec'] = False

    def open_sec():
        state['sec'] += 1
        out.append(f'<div id="section{state["sec"]}" class="section">')
        state['in_sec'] = True

    def open_grp():
        out.append('<div class="pGroup">')
        state['in_grp'] = True

    for it in items[h1i + 1:]:
        txt, sz, bold, color = it['text'], it['size'], it['bold'], it['color']

        # imagen suelta dentro del capitulo
        for im in it['imgs']:
            if im in dims and im != banner and dims[im][0] > 300:
                close_grp()
                figs.append(im)
                out.append(figure(im, dims[im], len(figs)))
        if not txt:
            continue

        # recuadro destacado (texto blanco sobre color en el Word)
        if color == 'FFFFFF' and bold and sz <= 10 and len(txt) > 25:
            close_sec()
            head, sep, rest = txt.partition(':')
            out.append('<div class="openingContent">')
            if sep and rest.strip():
                out.append(f'<div id="p{pid.next()}" data-pid="{pid.n}" class="boxTtl">'
                           f'<h2><strong>{esc(head.strip())}</strong></h2></div>')
                out.append(f'<div class="boxContent"><p id="p{pid.next()}" '
                           f'data-pid="{pid.n}">{esc(rest.strip())}</p></div>')
            else:
                out.append(f'<div class="boxContent"><p id="p{pid.next()}" '
                           f'data-pid="{pid.n}">{esc(txt)}</p></div>')
            out.append('</div>')
            continue

        # h2 = subtitulo de seccion
        if bold and sz >= 11:
            close_sec()
            open_sec()
            out.append(f'<h2 id="p{pid.next()}" data-pid="{pid.n}">'
                       f'<strong>{esc(txt)}</strong></h2>')
            open_grp()
            continue

        if not state['in_sec']:
            open_sec()
        if not state['in_grp']:
            open_grp()

        # h3 = nombre / codigo corto en negrita
        if bold and 8 <= sz <= 10 and len(txt) < 60:
            out.append(f'<h3 id="p{pid.next()}" data-pid="{pid.n}">'
                       f'<strong>{esc(txt)}</strong></h3>')
            continue

        # etiqueta en versalitas dentro del cuerpo
        if bold and 0 < sz <= 7 and len(txt) < 90 and txt.upper() == txt:
            out.append(f'<p class="contextTtl" id="p{pid.next()}" data-pid="{pid.n}">'
                       f'<strong>{esc(txt)}</strong></p>')
            continue

        cls = ' class="blockTxt"' if bold else ''
        out.append(f'<p{cls} id="p{pid.next()}" data-pid="{pid.n}">{esc(txt)}</p>')

    close_sec()
    out.append('</div>')
    return '\n'.join(out), figs


def build_cover(doc, dims, pid):
    out, figs = [], []
    img = next((i for it in doc['items'] for i in it['imgs'] if i in dims), None)
    if img:
        figs.append(img)
        out.append(figure(img, dims[img], 1))
    out.append('<header>')
    out.append(f'<h1 id="p{pid.next()}" data-pid="{pid.n}" class="coverTtl">'
               f'<strong>{esc(doc["title"])}</strong></h1>')
    out.append('</header>')
    out.append('<div class="bodyTxt"><div id="section1" class="section"><div class="pGroup">')
    for it in doc['items']:
        if it['size'] >= 40 or not it['text']:
            continue
        out.append(f'<p id="p{pid.next()}" data-pid="{pid.n}">{esc(it["text"])}</p>')
    out.append('</div></div></div>')
    return '\n'.join(out), figs


def build_toc(chapters, pid):
    out = ['<header>',
           f'<h1 id="p{pid.next()}" data-pid="{pid.n}"><strong>Contenido</strong></h1>',
           '</header>',
           '<div class="bodyTxt"><div id="section1" class="section"><div class="pGroup">']
    for c in chapters:
        out.append(f'<p id="p{pid.next()}" data-pid="{pid.n}">{esc(c["title"])}</p>')
    out.append('</div></div></div>')
    return '\n'.join(out), []


# ────────────────────────── base de datos ──────────────────────────
def build_db(db_path, schema_sql, meta, docs_html, media_used, dims):
    con = sqlite3.connect(db_path)
    con.executescript(schema_sql)
    cur = con.cursor()

    cur.execute("INSERT INTO android_metadata VALUES ('es_ES')")

    # Tipo y categoria: los unicos valores que JW Library reconoce son
    # Watchtower/Meeting Workbook/Book/Talk/Bible  (w/mwb/bk/talk/bi).
    # 'Manual/Guidelines' + 'manual' hacen fallar la instalacion.
    # El resto de los valores replica pt14, que instala correctamente.
    pub_cols = """(PublicationId,VersionNumber,Type,Title,RootSymbol,RootYear,
         RootMepsLanguageIndex,ShortTitle,DisplayTitle,ReferenceTitle,UndatedReferenceTitle,
         Symbol,UndatedSymbol,UniqueSymbol,EnglishSymbol,UniqueEnglishSymbol,IssueTagNumber,
         IssueNumber,Variation,Year,VolumeNumber,MepsLanguageIndex,PublicationType,
         PublicationCategorySymbol,BibleVersionForCitations,HasPublicationChapterNumbers,
         HasPublicationSectionNumbers,FirstDatedTextDateOffset,LastDatedTextDateOffset,
         MepsBuildNumber)
        VALUES (1,8,1,?,?,?,0,?,?,?,?,?,?,?,?,?,'0',0,'',?,0,?,
                'Book','bk','NWTR',1,0,19691231,19691231,13073)"""
    pub_vals = (meta['title'], meta['symbol'], meta['year'],
                meta['short'], meta['display'], meta['short'], meta['short'],
                meta['symbol'], meta['symbol'], meta['symbol'], meta['symbol'],
                meta['symbol'], meta['year'], meta['lang'])
    cur.execute("INSERT INTO Publication " + pub_cols, pub_vals)
    cur.execute("INSERT INTO RefPublication " + pub_cols.replace('PublicationId,', 'RefPublicationId,', 1),
                pub_vals)
    cur.execute("INSERT INTO PublicationCategory (PublicationId,Category) VALUES (1,'bk')")
    cur.execute("INSERT INTO PublicationYear (PublicationId,Year) VALUES (1,?)", (meta['year'],))
    for st, dt in ((0, 'name'), (1, 'text'), (1, 'name'), (1, 'location')):
        cur.execute("INSERT INTO PublicationViewSchema (SchemaType,DataType) VALUES (?,?)",
                    (st, dt))
    cur.execute("INSERT INTO PublicationView (PublicationViewId,Name,Symbol) "
                "VALUES (1,'JW App Publication','jwpub')")
    cur.execute("""INSERT INTO PublicationViewItem
        (PublicationViewItemId,PublicationViewId,ParentPublicationViewItemId,Title,
         SchemaType,ChildTemplateSchemaType,DefaultDocumentId)
        VALUES (1,1,-1,?,0,0,-1)""", (meta['title'],))

    # Documentos.  Class '13' (texto) para todos; el resto de las columnas
    # replica los valores de pt14.
    dp_id = 0
    for did, (title, html, _cls) in enumerate(docs_html):
        blob = encrypt_html(html, meta['ch'])
        paras = html.count('data-pid=')
        cur.execute("""INSERT INTO Document
            (DocumentId,PublicationId,MepsDocumentId,MepsLanguageIndex,Class,Type,
             SectionNumber,ChapterNumber,Title,TocTitle,ContextTitle,Content,
             ParagraphCount,HasMediaLinks,HasLinks,FirstPageNumber,LastPageNumber,
             ContentLength,HasPronunciationGuide)
            VALUES (?,1,?,?,'13',0,0,?,?,?,'',?,?,?,0,?,?,?,0)""",
                    (did, 1102900000 + did, meta['lang'], did, title, title,
                     blob, paras, 1 if did in media_used else 0,
                     did + 1, did + 1, len(blob)))

        # DocumentParagraph: posiciones de cada <p> dentro del HTML descifrado.
        # Ambas publicaciones oficiales la pueblan para todos sus documentos.
        raw = html.encode('utf-8')
        for idx, m in enumerate(re.finditer(rb'<p\b[^>]*>.*?</p>', raw, re.S), 1):
            dp_id += 1
            cur.execute("""INSERT INTO DocumentParagraph
                (DocumentParagraphId,DocumentId,ParagraphIndex,ParagraphNumberLabel,
                 BeginPosition,EndPosition) VALUES (?,?,?,NULL,?,?)""",
                        (dp_id, did, idx, m.start(), m.end()))
        cur.execute("INSERT INTO TextUnit (TextUnitId,Type,Id) VALUES (?,'Document',?)", (did, did))
        cur.execute("""INSERT INTO PublicationViewItem
            (PublicationViewItemId,PublicationViewId,ParentPublicationViewItemId,Title,
             SchemaType,DefaultDocumentId) VALUES (?,1,1,?,0,?)""", (did + 2, title, did))
        cur.execute("""INSERT INTO PublicationViewItemDocument
            (PublicationViewItemId,DocumentId) VALUES (?,?)""", (did + 2, did))
        cur.execute("""INSERT INTO PublicationViewItemField
            (PublicationViewItemId,Value,Type) VALUES (?,?,'name')""", (did + 2, title))

    # multimedia
    mid = 0
    for did, names in media_used.items():
        for name in names:
            mid += 1
            w, h = dims[name]
            cat = 15 if did == 0 else 9
            cur.execute("""INSERT INTO Multimedia
                (MultimediaId,DataType,MajorType,MinorType,Width,Height,MimeType,
                 Label,Caption,CategoryType,FilePath,MepsLanguageIndex,IssueTagNumber,SuppressZoom)
                VALUES (?,0,1,1,?,?,'image/jpeg','','',?,?,?,0,0)""",
                        (mid, w, h, cat, name, meta['lang']))
            cur.execute("""INSERT INTO DocumentMultimedia
                (DocumentId,MultimediaId,BeginParagraphOrdinal,EndParagraphOrdinal)
                VALUES (?,?,1,1)""", (did, mid))

    con.commit()
    # ANALYZE crea sqlite_stat1, presente en las dos publicaciones oficiales.
    con.execute("ANALYZE")
    con.commit()
    con.close()


def optimize_images(media, max_width=1400, quality=86):
    """Recomprime a JPEG como las publicaciones oficiales.

    Los PNG del Word pesan ~1 MB por banner; en JPEG bajan a decenas de KB
    sin diferencia visible, y JW Library los muestra igual.
    Devuelve (media_nueva, dims_nuevas, mapa_de_nombres).
    """
    from PIL import Image
    out, dims, rename = {}, {}, {}
    for name, data in media.items():
        with Image.open(io.BytesIO(data)) as im:
            im = im.convert('RGB')
            if im.width > max_width:
                im = im.resize((max_width, round(im.height * max_width / im.width)),
                               Image.LANCZOS)
            buf = io.BytesIO()
            im.save(buf, 'JPEG', quality=quality, optimize=True, progressive=True)
            new = os.path.splitext(name)[0] + '.jpg'
            out[new], dims[new], rename[name] = buf.getvalue(), im.size, new
    return out, dims, rename


def schema_from_reference(ref_db):
    """Copia el esquema exacto de una publicacion oficial."""
    con = sqlite3.connect(ref_db)
    rows = con.execute(
        "select sql from sqlite_master where sql is not null and name not like 'sqlite_%'"
    ).fetchall()
    con.close()
    return ';\n'.join(r[0] for r in rows) + ';'


# ───────────────────────────── empaquetado ─────────────────────────────
def build_jwpub(out_path, db_bytes, db_name, media, meta):
    entries = [(db_name, db_bytes)] + [(n, d) for n, d in media.items()]

    buf = tempfile.NamedTemporaryFile(delete=False, suffix='.zip')
    buf.close()
    with zipfile.ZipFile(buf.name, 'w', zipfile.ZIP_DEFLATED) as z:
        for name, data in entries:
            z.writestr(name, data)
    contents = open(buf.name, 'rb').read()
    os.unlink(buf.name)

    expanded = sum(len(d) for _, d in entries)
    manifest = {
        "name": os.path.basename(out_path),
        "hash": hashlib.sha256(contents).hexdigest(),
        "timestamp": datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        "version": 1,
        "expandedSize": expanded,
        "contentFormat": "z-a",
        "htmlValidated": False,
        "mepsPlatformVersion": 2.1,
        "mepsBuildNumber": 13073,
        "publication": {
            "fileName": db_name,
            "type": 1,
            "title": meta['title'],
            "shortTitle": meta['short'],
            "displayTitle": meta['display'],
            "referenceTitle": meta['short'],
            "undatedReferenceTitle": meta['short'],
            "titleRich": meta['title'],
            "displayTitleRich": meta['display'],
            "referenceTitleRich": meta['short'],
            "undatedReferenceTitleRich": meta['short'],
            "symbol": meta['symbol'],
            "uniqueEnglishSymbol": meta['symbol'],
            "uniqueSymbol": meta['symbol'],
            "undatedSymbol": meta['symbol'],
            "englishSymbol": meta['symbol'],
            "language": meta['lang'],
            "hash": hashlib.sha1(db_bytes).hexdigest(),
            "timestamp": datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
            "minPlatformVersion": 1,
            "schemaVersion": 8,
            "year": meta['year'],
            "issueId": 0,
            "issueNumber": 0,
            "variation": "",
            "publicationType": "Book",
            "rootSymbol": meta['symbol'],
            "rootYear": meta['year'],
            "rootLanguage": 0,
            "images": meta['images'],
            "categories": ["bk"],
            "attributes": [],
            # Ambas publicaciones oficiales traen estos dos campos.  Omitirlos
            # aborta la instalacion: el deserializador del manifest los exige.
            "issueAttributes": [],
            "issueProperties": {
                "title": "", "undatedTitle": "", "coverTitle": "",
                "titleRich": "", "undatedTitleRich": "", "coverTitleRich": "",
                "symbol": "", "undatedSymbol": "",
            },
        },
    }
    with zipfile.ZipFile(out_path, 'w') as z:
        z.writestr('manifest.json', json.dumps(manifest, ensure_ascii=False, indent=1),
                   zipfile.ZIP_DEFLATED)
        z.writestr('contents', contents, zipfile.ZIP_STORED)
    return manifest


# ──────────────────────────────── main ────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description='Convierte un .docx en una publicacion .jwpub')
    ap.add_argument('docx')
    ap.add_argument('--symbol', required=True, help='simbolo corto, ej. mlsalon')
    ap.add_argument('--year', type=int, required=True)
    ap.add_argument('--lang', type=int, default=1, help='MepsLanguageIndex (1 = espanol)')
    ap.add_argument('--title', required=True)
    ap.add_argument('--short', default=None)
    ap.add_argument('--reference', required=True, help='.db de una publicacion oficial (esquema)')
    ap.add_argument('-o', '--out', default=None)
    args = ap.parse_args()

    short = args.short or args.title
    out = args.out or f"{args.symbol}_S.jwpub"

    items, media = parse_docx(args.docx)
    print(f"  bloques leidos      : {len(items)}")
    print(f"  imagenes en el docx : {len(media)}")

    before = sum(len(d) for d in media.values())
    media, dims, rename = optimize_images(media)
    after = sum(len(d) for d in media.values())
    print(f"  imagenes            : {before/1e6:.1f} MB PNG -> {after/1e6:.2f} MB JPEG")
    for it in items:
        it['imgs'] = [rename.get(i, i) for i in it['imgs']]

    docs = segment(items)
    chapters = [d for d in docs if d['kind'] == 'chapter']
    print(f"  documentos          : {len(docs)}  ({len(chapters)} capitulos)")

    meta = dict(title=args.title, short=short, display=f"{short} ({args.symbol})",
                symbol=args.symbol, year=args.year, lang=args.lang,
                ch=card_hash(args.lang, args.symbol, args.year), images=[])

    pid = Pid()
    docs_html, media_used = [], {}
    for did, d in enumerate(docs):
        pid.n = 0
        if d['kind'] == 'cover':
            html, figs = build_cover(d, dims, pid)
            cls = 39
        elif d['kind'] == 'toc':
            html, figs = build_toc(chapters, pid)
            cls = 19
        else:
            html, figs = build_chapter(d, dims, pid)
            cls = 13
        docs_html.append((d['title'], html, cls))
        if figs:
            media_used[did] = figs
        print(f"    [{did}] {d['title'][:52]:54} {len(html):>6} chars  img={len(figs)}")

    keep = {n for names in media_used.values() for n in names}
    media = {n: d for n, d in media.items() if n in keep}

    # Miniaturas de portada, con el mismo patron que pt14: una sola firma
    # SHA1 (la del maestro de origen) compartida por los tres tamanos, con
    # el sufijo ':ancho:alto'.  La app solo la indexa, no la verifica.
    cover_src = next((n for n in media_used.get(0, [])), None)
    if cover_src:
        from PIL import Image as _Im
        master_sig = hashlib.sha1(media[cover_src]).hexdigest()
        for size in (120, 270, 600):
            with _Im.open(io.BytesIO(media[cover_src])) as im:
                sq = im.convert('RGB').resize((size, size), _Im.LANCZOS)
                b = io.BytesIO()
                sq.save(b, 'JPEG', quality=88, optimize=True)
            fn = f"{args.symbol}_univ_sqr-{size}x{size}.jpg"
            media[fn] = b.getvalue()
            meta['images'].append({
                "signature": f"{master_sig}:{size}:{size}",
                "fileName": fn, "type": "t", "attribute": "r",
                "width": size, "height": size})

    db_name = f"{args.symbol}_S.db"
    tmp_db = os.path.join(tempfile.mkdtemp(), db_name)
    build_db(tmp_db, schema_from_reference(args.reference), meta, docs_html, media_used, dims)
    db_bytes = open(tmp_db, 'rb').read()

    manifest = build_jwpub(out, db_bytes, db_name, media, meta)
    size = os.path.getsize(out)
    print(f"\n  -> {out}  ({size/1e6:.2f} MB)")
    print(f"     sha256(contents) = {manifest['hash'][:32]}...")
    print(f"     sha1(db)         = {manifest['publication']['hash']}")
    return out


if __name__ == '__main__':
    main()
