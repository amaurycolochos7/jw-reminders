#!/usr/bin/env python3
"""Genera variantes de prueba de una sola variable para aislar por que
JW Library rechaza un .jwpub.

Todas se construyen a nivel de bytes sobre una copia nueva del original: no
se reescribe el ZIP, asi que la unica diferencia es la declarada.
"""
import hashlib
import os
import struct
import sys

OUT = os.path.join('artifacts', 'jwpub-audit', 'variants')


def eocd_offset(data):
    i = data.rfind(b'PK\x05\x06')
    if i < 0:
        raise SystemExit('no se encontro el EOCD')
    return i


def get_comment(data):
    i = eocd_offset(data)
    clen = struct.unpack('<H', data[i + 20:i + 22])[0]
    return data[i + 22:i + 22 + clen]


def set_comment(data, comment):
    """Reescribe solo el campo comment del EOCD y la cola del archivo."""
    i = eocd_offset(data)
    head = data[:i + 20]
    return head + struct.pack('<H', len(comment)) + comment


def write(name, data, note):
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, name)
    open(p, 'wb').write(data)
    h = hashlib.sha256(data).hexdigest()
    print(f'  {name:34} {len(data):>9} bytes  sha256={h[:16]}...')
    print(f'      {note}')
    return p, h


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else 'pt14_S.jwpub'
    official = open(src, 'rb').read()
    comment = get_comment(official)
    print(f'origen: {src}  ({len(official)} bytes, comentario {len(comment)} bytes)\n')

    rows = []

    # 00 - copia bit a bit: valida que la ruta de importacion funciona
    rows.append(write('TEST-00-BITCOPY.jwpub', official,
                      'copia identica de la publicacion oficial; ninguna modificacion'))

    # 01 - LA PRUEBA DECISIVA: solo se elimina el comentario ZIP (la firma)
    rows.append(write('TEST-01-NOCOMMENT.jwpub', set_comment(official, b''),
                      'identico al oficial salvo que se quito la firma JASPER del comentario ZIP'))

    # 07 - comentario truncado: la marca sigue, pero la longitud es incorrecta
    rows.append(write('TEST-07-COMMENT-TRUNC.jwpub', set_comment(official, comment[:120]),
                      'firma JASPER truncada a 120 bytes (longitud incorrecta)'))

    import base64 as _b64
    magic, _, b64 = comment.partition(b'\x00')
    block = _b64.b64decode(b64) if b64 else b''

    # 02 - firma presente y del tamano correcto, pero con UN bit cambiado en el
    #      bloque decodificado.  Si se rechaza -> el contenido de la firma se
    #      valida (no solo su presencia).
    if block:
        flipped = bytearray(block)
        flipped[-1] ^= 0x01                      # ultimo byte del bloque de 64
        c2 = magic + b'\x00' + _b64.b64encode(bytes(flipped))
        rows.append(write('TEST-02-JASPER-BITFLIP.jwpub', set_comment(official, c2),
                          'firma JASPER intacta en forma, pero con 1 bit cambiado'))

    # 03 - se conservan la marca JASPER\\x00 y la longitud, pero el resto del
    #      bloque es aleatorio.  Distingue "solo comprueba presencia" de
    #      "verifica la firma".
    if block:
        rndblk = os.urandom(len(block))
        c3 = magic + b'\x00' + _b64.b64encode(rndblk)
        rows.append(write('TEST-03-JASPER-RANDOM.jwpub', set_comment(official, c3),
                          'marca JASPER y longitud correctas; bloque de firma aleatorio'))

    # 04 - se conserva el comentario ORIGINAL y se cambia un byte de contents,
    #      corrigiendo el CRC-32 del ZIP exterior para que el contenedor siga
    #      siendo valido.  Asi la unica inconsistencia es manifest.hash
    #      (= sha256(contents)): prueba limpiamente la CAPA DE HASH, no la firma.
    import zlib as _zlib
    i = official.find(b'PK\x03\x04')             # local header de manifest.json
    j = official.find(b'PK\x03\x04', i + 4)      # local header de contents
    namelen = struct.unpack('<H', official[j + 26:j + 28])[0]
    extralen = struct.unpack('<H', official[j + 28:j + 30])[0]
    compsize = struct.unpack('<I', official[j + 18:j + 22])[0]
    data0 = j + 30 + namelen + extralen          # inicio de los bytes de contents
    tampered = bytearray(official)
    tampered[data0 + 500] ^= 0x01                # un byte bien dentro de contents
    new_crc = _zlib.crc32(bytes(tampered[data0:data0 + compsize])) & 0xffffffff
    struct.pack_into('<I', tampered, j + 14, new_crc)          # CRC en local header
    # y en la entrada del directorio central de 'contents'
    k = official.rfind(b'PK\x01\x02')            # ultima entrada central = contents
    struct.pack_into('<I', tampered, k + 16, new_crc)
    rows.append(write('TEST-04-PAYLOAD-BITFLIP.jwpub', bytes(tampered),
                      '1 byte de contents cambiado + CRC ZIP corregido; solo '
                      'manifest.hash queda mal (prueba la capa de hash)'))

    # 06 - solo se cambia un byte de metadatos ZIP (timestamp DOS del local
    #      header), conservando payload y comentario.
    #      El offset 10-11 del local header son mod-time; se altera.
    meta = bytearray(official)
    meta[i + 10] ^= 0x01                          # bit del mod-time DOS
    rows.append(write('TEST-06-ZIP-METADATA.jwpub', bytes(meta),
                      'solo timestamp DOS del primer local header cambiado; '
                      'payload y comentario intactos'))

    # NOTA: deliberadamente no se genera ninguna variante que copie la firma
    # JASPER de una publicacion oficial a un archivo propio.  Seria falsificar
    # un control de integridad del editor, no diagnosticarlo.  Ademas, si el
    # bloque es una firma sobre el contenido, no existe estado "firma valida +
    # contenido cambiado": cualquier cambio la invalida y no podemos re-firmar.
    # Por eso TEST-05 (editar el manifest y re-firmar) es imposible sin la
    # clave privada del editor y no se incluye.

    log = os.path.join(OUT, 'variants.md')
    with open(log, 'w', encoding='utf-8') as f:
        f.write('# Variantes de prueba (una sola variable)\n\n')
        f.write(f'Origen: `{src}`\n\n')
        f.write('| Archivo | SHA-256 | Diferencia unica | Que demuestra | Resultado en JW Library |\n')
        f.write('|---|---|---|---|---|\n')
        expect = {
            'TEST-00': ('ninguna (SHA-256 = oficial)', 'instala = ruta de import OK'),
            'TEST-01': ('comentario JASPER eliminado', 'si falla -> firma obligatoria'),
            'TEST-07': ('firma truncada a 120 B', 'si falla -> se valida la longitud'),
            'TEST-02': ('firma con 1 bit cambiado', 'si falla -> se valida el contenido de la firma'),
            'TEST-03': ('bloque de firma aleatorio', 'si falla -> se verifica, no solo la marca'),
            'TEST-04': ('1 byte de contents (rompe manifest.hash)', 'prueba la capa de hash'),
            'TEST-06': ('timestamp DOS del ZIP', 'aisla si importan los metadatos ZIP'),
        }
        for p, h in rows:
            key = os.path.basename(p)[:7]
            diff, res = expect.get(key, ('', ''))
            f.write(f'| `{os.path.basename(p)}` | `{h[:32]}...` | {diff} | {res} | *pendiente* |\n')
    print(f'\n  registro -> {log}')


if __name__ == '__main__':
    main()
