#!/usr/bin/env python3
"""Re-empaqueta un .jwpub oficial cambiandole el simbolo.

Sirve como CONTROL de diagnostico: el contenido, los indices de busqueda y
todas las tablas siguen siendo los originales; lo unico que cambia es la
identidad de la publicacion (y por tanto la clave de cifrado).

  - Si el archivo resultante SI instala -> JW Library acepta simbolos
    personalizados, y cualquier fallo esta en como generamos el nuestro.
  - Si NO instala -> la app rechaza publicaciones fuera de su catalogo.

Uso:
  python reseal_jwpub.py pt14_S.jwpub --symbol pt14z -o pt14z_S.jwpub
"""
import argparse
import hashlib
import io
import json
import os
import sqlite3
import tempfile
import zipfile
import zlib
from datetime import datetime, timezone

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

MASTER = bytes.fromhex('11cbb5587e32846d4c26790c633da289f66fe5842a3a585ce1bc3a294af5ada7')


def card_hash(lang, symbol, year, issue=0):
    s = f"{lang}_{symbol}_{year}" + (f"_{issue}" if issue else "")
    return bytes(a ^ b for a, b in zip(hashlib.sha256(s.encode()).digest(), MASTER))


def recrypt(blob, old, new):
    d = Cipher(algorithms.AES(old[:16]), modes.CBC(old[16:32])).decryptor()
    plain = d.update(blob) + d.finalize()          # sigue comprimido con zlib
    e = Cipher(algorithms.AES(new[:16]), modes.CBC(new[16:32])).encryptor()
    return e.update(plain) + e.finalize()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('--symbol', required=True)
    ap.add_argument('--title', default=None)
    ap.add_argument('-o', '--out', required=True)
    a = ap.parse_args()

    z = zipfile.ZipFile(a.src)
    man = json.loads(z.read('manifest.json'))
    contents = z.read('contents')
    cz = zipfile.ZipFile(io.BytesIO(contents))
    old_db_name = man['publication']['fileName']

    work = tempfile.mkdtemp()
    files = {}
    for n in cz.namelist():
        files[n] = cz.read(n)

    db_path = os.path.join(work, 'work.db')
    open(db_path, 'wb').write(files.pop(old_db_name))
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    pub = dict(con.execute("select * from Publication").fetchone())

    old_key = card_hash(pub['MepsLanguageIndex'], pub['Symbol'], pub['Year'],
                        int(pub['IssueTagNumber'] or 0))
    new_key = card_hash(pub['MepsLanguageIndex'], a.symbol, pub['Year'],
                        int(pub['IssueTagNumber'] or 0))
    print(f"  clave vieja: {pub['MepsLanguageIndex']}_{pub['Symbol']}_{pub['Year']}")
    print(f"  clave nueva: {pub['MepsLanguageIndex']}_{a.symbol}_{pub['Year']}")

    # Re-cifra TODO el contenido cifrado, no solo Document.Content.
    # pt14 tambien guarda 280 filas en Extract.Content con la misma clave;
    # dejarlas con la clave vieja produce un archivo inconsistente que
    # JW Library rechaza al instalar.
    total = 0
    for (table,) in con.execute(
            "select name from sqlite_master where type='table' "
            "and name not like 'sqlite_%'").fetchall():
        cols = [r[1] for r in con.execute(f'PRAGMA table_info("{table}")')]
        if 'Content' not in cols:
            continue
        pk = next((r[1] for r in con.execute(f'PRAGMA table_info("{table}")') if r[5]), None)
        if pk is None:
            continue
        rows = con.execute(
            f'select "{pk}" k, Content from "{table}" where Content is not null').fetchall()
        for r in rows:
            con.execute(f'update "{table}" set Content=? where "{pk}"=?',
                        (recrypt(r['Content'], old_key, new_key), r['k']))
        if rows:
            print(f"  re-cifradas {len(rows):>5} filas de {table}.Content")
            total += len(rows)
    print(f"  total re-cifrado: {total} filas")

    title = a.title or f"{pub['Title']} ({a.symbol})"
    for col in ('Symbol', 'UndatedSymbol', 'UniqueSymbol', 'EnglishSymbol',
                'UniqueEnglishSymbol', 'RootSymbol'):
        con.execute(f"update Publication set {col}=?", (a.symbol,))
    con.execute("update Publication set Title=?, ShortTitle=?, DisplayTitle=?,"
                " ReferenceTitle=?, UndatedReferenceTitle=?",
                (title, title, title, title, title))
    con.commit()
    con.execute("ANALYZE")
    con.commit()
    con.close()

    db_bytes = open(db_path, 'rb').read()
    new_db_name = f"{a.symbol}_S.db"
    entries = [(new_db_name, db_bytes)] + sorted(files.items())

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.zip')
    tmp.close()
    with zipfile.ZipFile(tmp.name, 'w', zipfile.ZIP_DEFLATED) as out:
        for name, data in entries:
            out.writestr(name, data)
    new_contents = open(tmp.name, 'rb').read()
    os.unlink(tmp.name)

    ts = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    man['name'] = os.path.basename(a.out)
    man['hash'] = hashlib.sha256(new_contents).hexdigest()
    man['timestamp'] = ts
    man['expandedSize'] = sum(len(d) for _, d in entries)
    p = man['publication']
    p['fileName'] = new_db_name
    p['hash'] = hashlib.sha1(db_bytes).hexdigest()
    p['timestamp'] = ts
    for k in ('symbol', 'uniqueSymbol', 'uniqueEnglishSymbol', 'undatedSymbol',
              'englishSymbol', 'rootSymbol'):
        p[k] = a.symbol
    for k in ('title', 'titleRich', 'shortTitle', 'displayTitle', 'displayTitleRich',
              'referenceTitle', 'referenceTitleRich', 'undatedReferenceTitle',
              'undatedReferenceTitleRich'):
        p[k] = title
    # 'images' se conserva tal cual: los archivos siguen en contents y la
    # firma es solo un identificador, no se verifica.

    with zipfile.ZipFile(a.out, 'w') as out:
        out.writestr('manifest.json', json.dumps(man, ensure_ascii=False, indent=1),
                     zipfile.ZIP_DEFLATED)
        out.writestr('contents', new_contents, zipfile.ZIP_STORED)
    print(f"  -> {a.out}  ({os.path.getsize(a.out)/1e6:.2f} MB)")


if __name__ == '__main__':
    main()
