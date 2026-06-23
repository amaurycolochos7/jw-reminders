# WhatsApp - Sesión y Configuración

## Resumen

El servicio WhatsApp usa `whatsapp-web.js` con autenticación local (`LocalAuth`).
La sesión se persiste en un volumen Docker para sobrevivir reinicios.

## Estados del bot

| Estado | Descripción |
|---|---|
| STARTING | Inicializando cliente |
| QR_REQUIRED | Esperando escaneo de QR |
| AUTHENTICATED | Sesión autenticada (cargando) |
| READY | Listo para enviar mensajes |
| DISCONNECTED | Desconectado |
| FAILED | Error fatal |

## Primer inicio (obtener QR)

1. Iniciar el servicio WhatsApp
2. Ver logs: `docker logs -f jw-reminders-whatsapp`
3. El QR aparecerá en los logs del terminal
4. Escanear con WhatsApp en el teléfono
5. Esperar estado `READY`

## Verificar estado

```bash
curl http://localhost:3010/status
# o en producción:
curl http://jw-reminders-whatsapp:3010/status
```

## Sesión persiste tras reinicio

La sesión se almacena en `/app/.wwebjs_auth` (volumen `whatsapp_session`).
Al reiniciar el contenedor, la sesión se restaura automáticamente sin necesidad de QR.

## Si la sesión se pierde

1. Detener el contenedor
2. Eliminar volumen: `docker volume rm jw-reminders_whatsapp_session`
3. Reiniciar contenedor
4. Escanear nuevo QR desde logs

## Problemas comunes

| Problema | Solución |
|---|---|
| QR no aparece | Verificar que Chromium se instala correctamente |
| Sesión se pierde | Verificar que el volumen está montado |
| FAILED después de desconexión | Reiniciar contenedor |
| Mensajes no se envían | Verificar estado READY + formato de teléfono |

## Formato de teléfono

El sistema acepta números en formato:
- `9611234567` (10 dígitos) → se convierte a `5219611234567@c.us`
- `529611234567` (12 dígitos) → se convierte a `5219611234567@c.us`
- `5219611234567` (13 dígitos) → se usa directo
