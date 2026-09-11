ALTER SYSTEM RESET password_encryption;
SELECT pg_reload_conf();
