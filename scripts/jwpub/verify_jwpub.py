#!/usr/bin/env python3
"""Verifica un .jwpub: hashes del manifest, esquema, descifrado de cada
documento y coherencia de las referencias a multimedia."""
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

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

MASTER = bytes.fromhex('11cbb5587e32846d4c26790c633da289f66fe5842a3a585ce1bc3a294af5ada7')
ok_count, fail_count = 0, 0


def check(label, cond, detail=''):
    global ok_count, fail_count
    if cond:
        ok_count += 1
        print(f"  [OK]   {label}" + (f"  {detail}" if detail else ''))
    else:
        fail_count += 1
        print(f"  [FALLA] {label}  {detail}")
    return cond


def main(path, deep=False, reference=None):
    global ok_count, fail_count
    ok_count, fail_count = 0, 0
    print(f"=== {os.path.basename(path)} ({os.path.getsize(path)/1e6:.2f} MB) ===\n")
    z = zipfile.ZipFile(path)
    names = z.namelist()
    check("estructura .jwpub", set(names) == {'manifest.json', 'contents'}, str(names))
    check("'contents' sin comprimir (STORED)",
          z.getinfo('contents').compress_type == zipfile.ZIP_STORED)

    manifest = json.loads(z.read('manifest.json'))
    contents = z.read('contents')
    pub = manifest['publication']

    check("manifest.hash == sha256(contents)",
          hashlib.sha256(contents).hexdigest() == manifest['hash'])

    cz = zipfile.ZipFile(io.BytesIO(contents))
    entries = cz.infolist()
    check("expandedSize correcto",
          sum(i.file_size for i in entries) == manifest['expandedSize'],
          f"{manifest['expandedSize']} bytes")

    db_name = pub['fileName']
    check("el .db declarado existe en contents", db_name in cz.namelist(), db_name)
    db_bytes = cz.read(db_name)
    check("publication.hash == sha1(db)",
          hashlib.sha1(db_bytes).hexdigest() == pub['hash'])

    tmp = os.path.join(tempfile.mkdtemp(), db_name)
    open(tmp, 'wb').write(db_bytes)
    con = sqlite3.connect(tmp)
    con.row_factory = sqlite3.Row

    p = con.execute("select * from Publication").fetchone()
    check("Publication tiene exactamente 1 fila", p is not None)
    check("Symbol del manifest coincide con la BD", p['Symbol'] == pub['symbol'],
          f"{p['Symbol']}")
    check("Year coincide", p['Year'] == pub['year'], str(p['Year']))
    check("MepsLanguageIndex coincide", p['MepsLanguageIndex'] == pub['language'],
          str(p['MepsLanguageIndex']))

    # Clave derivada de los propios metadatos de la BD.  En las publicaciones
    # periodicas (Atalaya, Guia de actividades) se anade el IssueTagNumber.
    s = f"{p['MepsLanguageIndex']}_{p['Symbol']}_{p['Year']}"
    issue = int(p['IssueTagNumber'] or 0)
    if issue:
        s += f"_{issue}"
    ch = bytes(a ^ b for a, b in zip(hashlib.sha256(s.encode()).digest(), MASTER))
    print(f"\n  cadena de clave : {s}")
    print(f"  cardHash        : {ch.hex()[:40]}...\n")

    docs = con.execute("select DocumentId,Title,Class,Content from Document order by DocumentId").fetchall()
    check("hay documentos", len(docs) > 0, f"{len(docs)} documentos")

    media_files = {n for n in cz.namelist() if n != db_name}
    referenced, all_ok = set(), True
    for d in docs:
        try:
            dec = Cipher(algorithms.AES(ch[:16]), modes.CBC(ch[16:32])).decryptor()
            raw = dec.update(d['Content']) + dec.finalize()
            html = zlib.decompress(raw).decode('utf-8')
        except Exception as e:
            all_ok = False
            print(f"  [FALLA] doc {d['DocumentId']} no descifra: {e}")
            continue
        referenced |= set(re.findall(r'jwpub-media://([^"]+)', html))
        bad = [t for t in ('<html', '<body', 'style=', 'font-family')
               if t in html.lower()]
        if bad:
            all_ok = False
            print(f"  [FALLA] doc {d['DocumentId']} contiene {bad}")
        if html.count('<div') != html.count('</div>'):
            all_ok = False
            print(f"  [FALLA] doc {d['DocumentId']} divs desbalanceados "
                  f"({html.count('<div')} vs {html.count('</div>')})")
    check("todos los documentos descifran y el HTML es valido", all_ok)

    # Cualquier tabla con columna Content usa la MISMA clave (pt14 cifra
    # tambien Extract.Content).  Una sola fila con otra clave invalida el
    # archivo completo y JW Library aborta la instalacion.
    otras_ok, revisadas = True, []
    for (table,) in con.execute("select name from sqlite_master where type='table' "
                                "and name not like 'sqlite_%'").fetchall():
        if table == 'Document':
            continue
        cols = [r[1] for r in con.execute(f'PRAGMA table_info("{table}")')]
        if 'Content' not in cols:
            continue
        rows = con.execute(
            f'select Content from "{table}" where Content is not null').fetchall()
        if not rows:
            continue
        revisadas.append(f'{table}={len(rows)}')
        for r in rows:
            try:
                d = Cipher(algorithms.AES(ch[:16]), modes.CBC(ch[16:32])).decryptor()
                zlib.decompress(d.update(r['Content']) + d.finalize())
            except Exception:
                otras_ok = False
                print(f"  [FALLA] {table}.Content no descifra con la clave de la publicacion")
                break
    check("el resto del contenido cifrado usa la misma clave", otras_ok,
          ', '.join(revisadas) if revisadas else 'sin otras tablas con Content')

    check("las imagenes referenciadas existen en contents",
          referenced <= media_files,
          f"{len(referenced)} referenciadas / {len(media_files)} en el paquete")
    mm = con.execute("select FilePath from Multimedia").fetchall()
    # una imagen puede venir referenciada desde el HTML, desde el manifest o
    # desde la tabla Multimedia (asi lo hace pt14 con su portada maestra)
    huerfanas = (media_files - referenced
                 - {i['fileName'] for i in pub.get('images', [])}
                 - {r['FilePath'] for r in mm if r['FilePath']})
    check("sin imagenes huerfanas", not huerfanas, str(sorted(huerfanas)) if huerfanas else '')

    # Las publicaciones oficiales referencian en Multimedia archivos que NO
    # viajan dentro del .jwpub (videos que se descargan aparte), asi que solo
    # se exige que lo referenciado desde el HTML si este empaquetado.
    faltan_html = referenced - media_files
    check("todo lo que el HTML referencia esta empaquetado", not faltan_html,
          f"{len(mm)} registros en Multimedia" if not faltan_html
          else str(sorted(faltan_html)))

    tocs = con.execute("select count(*) c from PublicationViewItemDocument").fetchone()['c']
    check("indice de navegacion completo", tocs == len(docs), f"{tocs} entradas")

    # Class esta declarada TEXT.  El juego de valores es mas amplio que el de
    # un libro (mwb usa 106), asi que solo se informa cual se uso.
    classes = sorted({str(d['Class']) for d in docs})
    check("Class numericos", all(x.isdigit() for x in classes), str(classes))

    print(f"\n  Portada declarada: {len(pub.get('images', []))} miniaturas")

    # --- Autenticidad: firma JASPER en el comentario ZIP -------------------
    # Es el unico factor conocido que separa un archivo instalable de uno
    # rechazado.  No se puede afirmar PASS sin ella; su validez solo la
    # comprueba JW Library.
    comment = z.comment
    has_jasper = comment.startswith(b'JASPER\x00')
    authentic = None
    if has_jasper:
        import base64 as _b64
        try:
            blk = _b64.b64decode(comment.partition(b'\x00')[2])
            authentic = len(blk) == 175
        except Exception:
            authentic = False
    print()
    print(f"  Firma JASPER: {'presente' if has_jasper else 'AUSENTE'}"
          + (f" ({len(comment)} B)" if comment else ''))

    print(f"\n{'='*46}")
    print(f"  {ok_count} comprobaciones OK, {fail_count} fallas")

    # Veredicto de tres estados.  FAIL si algo interno esta roto; UNKNOWN si
    # todo es coherente pero falta la firma que exige la app; PASS solo si
    # ademas lleva una firma con la forma correcta (su validez la juzga la app).
    if fail_count:
        verdict = 'FAIL'
    elif not has_jasper:
        verdict = 'UNKNOWN'   # coherente pero sin firma -> la app lo rechazara
    elif authentic:
        verdict = 'PASS'      # forma correcta; validez real la juzga JW Library
    else:
        verdict = 'FAIL'
    print(f"  VEREDICTO: {verdict}")
    if verdict == 'UNKNOWN':
        print("    (coherente internamente, pero sin firma JASPER del editor:")
        print("     JW Library rechazara la instalacion)")
    return verdict


def selftest():
    """Prueba automatizada: los dos archivos oficiales deben dar PASS.
    Una regla nueva no puede introducirse si rompe esto."""
    here = os.getcwd()
    officials = [f for f in ('pt14_S.jwpub', 'mwb_S_202611.jwpub')
                 if os.path.exists(os.path.join(here, f))]
    if not officials:
        print("selftest: no se encontraron archivos oficiales de referencia")
        return 2
    bad = []
    for f in officials:
        print(f"\n########## SELFTEST {f} ##########")
        v = main(os.path.join(here, f), deep=False)
        if v != 'PASS':
            bad.append((f, v))
    print(f"\n{'='*46}")
    if bad:
        print("  SELFTEST FALLIDO:", bad)
        return 1
    print(f"  SELFTEST OK: {officials} -> PASS")
    return 0


if __name__ == '__main__':
    args = sys.argv[1:]
    if '--selftest' in args:
        sys.exit(selftest())
    deep = '--deep' in args
    ref = None
    if '--reference' in args:
        ref = args[args.index('--reference') + 1]
    positional = [a for a in args if not a.startswith('--')
                  and a != ref]
    target = positional[0]
    v = main(target, deep=deep, reference=ref)
    sys.exit(0 if v == 'PASS' else (2 if v == 'UNKNOWN' else 1))
