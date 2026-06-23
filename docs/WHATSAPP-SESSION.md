# WhatsApp - Sesión y Procedimientos Operacionales

## Información del servicio

| Dato | Valor |
|---|---|
| Contenedor | `jw-reminders-whatsapp` |
| Puerto interno | 3010 |
| Volumen de sesión | `compose-back-up-open-source-firewall-2rmfv5_whatsapp_session` |
| Ruta del volumen en host | `/var/lib/docker/volumes/compose-back-up-open-source-firewall-2rmfv5_whatsapp_session/_data` |
| Ruta dentro del contenedor | `/app/apps/whatsapp/.wwebjs_auth` |
| Tecnología | whatsapp-web.js + Chromium headless |

---

## 1. Ver el código QR

```bash
ssh root@187.77.11.79
docker logs -f jw-reminders-whatsapp
```

El QR aparece como caracteres ASCII en el terminal. Escanear desde WhatsApp → Dispositivos vinculados → Vincular dispositivo.

Si el QR ya expiró, reiniciar el contenedor para generar uno nuevo:

```bash
docker restart jw-reminders-whatsapp
docker logs -f jw-reminders-whatsapp
```

---

## 2. Verificar si el estado es READY

```bash
# Opción 1: Leer los logs
docker logs jw-reminders-whatsapp --tail 5

# Opción 2: Consultar el endpoint de estado
curl http://jw-reminders-whatsapp:3010/status

# Opción 3: Desde fuera del VPS (si hay acceso por Traefik)
curl -sk https://localhost/api/whatsapp/status -H 'Host: jw-reminders.duckdns.org'
```

**Estados posibles:**

| Estado | Significado |
|---|---|
| `STARTING` | Inicializando Chromium |
| `QR_REQUIRED` | Esperando escaneo de QR |
| `AUTHENTICATED` | QR escaneado, cargando sesión |
| `READY` | Listo para enviar mensajes |
| `DISCONNECTED` | Sesión perdida o desconectada |
| `FAILED` | Error fatal |

---

## 3. Reiniciar solo el contenedor WhatsApp

```bash
ssh root@187.77.11.79
docker restart jw-reminders-whatsapp
```

Verificar que reinició correctamente:

```bash
docker logs jw-reminders-whatsapp --tail 10
```

Si estaba autenticado antes del reinicio, debería restaurar la sesión automáticamente (sin necesidad de QR nuevo).

---

## 4. Confirmar que la sesión persiste

```bash
# 1. Verificar que está READY
docker logs jw-reminders-whatsapp --tail 5
# Debería mostrar: [WhatsApp] READY

# 2. Reiniciar contenedor
docker restart jw-reminders-whatsapp

# 3. Esperar 15 segundos y verificar
sleep 15
docker logs jw-reminders-whatsapp --tail 5
# Si la sesión persiste, NO mostrará QR sino directamente AUTHENTICATED → READY
```

---

## 5. Dónde está el volumen de sesión

```bash
# Ver ubicación en disco del host
docker volume inspect compose-back-up-open-source-firewall-2rmfv5_whatsapp_session --format '{{.Mountpoint}}'
# Resultado: /var/lib/docker/volumes/compose-back-up-open-source-firewall-2rmfv5_whatsapp_session/_data

# Ver contenido
ls -la /var/lib/docker/volumes/compose-back-up-open-source-firewall-2rmfv5_whatsapp_session/_data/

# Verificar que existe la carpeta de sesión
ls -la /var/lib/docker/volumes/compose-back-up-open-source-firewall-2rmfv5_whatsapp_session/_data/session-default/
```

---

## 6. Qué hacer si se pierde la sesión

Si el WhatsApp muestra `QR_REQUIRED` después de un reinicio (la sesión no persistió):

### 6.1 Verificar que el volumen está montado

```bash
docker inspect jw-reminders-whatsapp --format '{{range .Mounts}}{{.Name}} -> {{.Destination}}{{println}}{{end}}'
# Debe mostrar: compose-back-up-open-source-firewall-2rmfv5_whatsapp_session -> /app/apps/whatsapp/.wwebjs_auth
```

### 6.2 Si el volumen existe pero la sesión se perdió

La sesión de WhatsApp Web puede expirar si:
- Se cerró la sesión desde el teléfono
- Pasaron más de 14 días sin actividad
- Se vinculó desde otro dispositivo

**Solución:** Simplemente escanear un nuevo QR:

```bash
docker restart jw-reminders-whatsapp
docker logs -f jw-reminders-whatsapp
# Escanear el QR que aparece
```

### 6.3 Si el volumen se corrompió

```bash
# Limpiar la sesión corrupta
docker stop jw-reminders-whatsapp
docker run --rm -v compose-back-up-open-source-firewall-2rmfv5_whatsapp_session:/data alpine sh -c "rm -rf /data/*"
docker start jw-reminders-whatsapp
docker logs -f jw-reminders-whatsapp
# Escanear nuevo QR
```

### 6.4 Si se eliminó el volumen por completo

Dokploy recreará el volumen al siguiente deploy, pero la sesión se habrá perdido. Escanear nuevo QR.

---

## 7. Troubleshooting

| Problema | Comando de diagnóstico | Solución |
|---|---|---|
| Container no inicia | `docker logs jw-reminders-whatsapp` | Verificar que Chromium se instala correctamente |
| QR no aparece | `docker logs -f jw-reminders-whatsapp` | Esperar 15-30 segundos después del inicio |
| DISCONNECTED constante | `docker restart jw-reminders-whatsapp` | Puede requerir nuevo escaneo QR |
| Error de DB | `docker logs jw-reminders-whatsapp` | Reiniciar después de que API aplique migraciones |
| Mensajes no se envían | Verificar estado READY | Si no está READY, escanear QR |
| Error "table does not exist" | Reiniciar WhatsApp | `docker restart jw-reminders-whatsapp` |

---

## 8. Comandos rápidos de referencia

```bash
# Conectar al VPS
ssh root@187.77.11.79

# Ver QR
docker logs -f jw-reminders-whatsapp

# Estado actual
docker logs jw-reminders-whatsapp --tail 3

# Reiniciar WhatsApp
docker restart jw-reminders-whatsapp

# Ver volumen
docker volume inspect compose-back-up-open-source-firewall-2rmfv5_whatsapp_session

# Limpiar sesión (forzar nuevo QR)
docker stop jw-reminders-whatsapp
docker run --rm -v compose-back-up-open-source-firewall-2rmfv5_whatsapp_session:/data alpine sh -c "rm -rf /data/*"
docker start jw-reminders-whatsapp
docker logs -f jw-reminders-whatsapp
```
