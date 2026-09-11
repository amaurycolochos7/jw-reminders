ALTER SYSTEM SET log_connections = on;
ALTER SYSTEM SET log_disconnections = on;
SELECT pg_reload_conf();
