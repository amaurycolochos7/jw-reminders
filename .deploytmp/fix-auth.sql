ALTER SYSTEM SET password_encryption = 'md5';
SELECT pg_reload_conf();
ALTER USER jw_admin WITH PASSWORD 'jw_local_pass';
