# Checklist de Pruebas

## Pruebas Locales (Docker)

### Build
- [ ] Build frontend exitoso
- [ ] Build API exitoso
- [ ] Build worker exitoso
- [ ] Build WhatsApp exitoso

### Infraestructura
- [ ] Conexión a PostgreSQL
- [ ] Migraciones aplicadas
- [ ] Seed ejecutado (admin + plantillas)

### Funcionales
- [ ] Login admin (admin / dorian123)
- [ ] Crear publicador
- [ ] Editar publicador
- [ ] Desactivar publicador
- [ ] Crear semana
- [ ] Crear asignación Lectura de la Biblia
- [ ] Crear asignación con acompañante
- [ ] Generar recordatorios automáticamente
- [ ] Worker procesa recordatorios
- [ ] Enviar mensaje de prueba (TEST_MODE)
- [ ] Logs registrados correctamente
- [ ] Sin duplicados (constraint único)
- [ ] Cancelar asignación cancela recordatorios

## Pruebas en Producción

### Infraestructura
- [ ] `https://jw-reminders.duckdns.org` carga
- [ ] SSL activo
- [ ] API responde `/api/health`
- [ ] Base de datos conectada
- [ ] Migraciones aplicadas

### Auth
- [ ] Login admin funciona

### WhatsApp
- [ ] Servicio levanta
- [ ] QR generado
- [ ] Estado READY
- [ ] Sesión persiste tras reinicio

### Funcionales
- [ ] Crear publicador
- [ ] Crear semana y asignación
- [ ] Enviar mensaje de prueba
- [ ] Log del mensaje registrado
- [ ] Sin duplicados

### Seguridad
- [ ] Sistra no fue modificado
- [ ] TEST_MODE activo antes de producción real
