#!/bin/sh
# Replace the last trust line with scram-sha-256 and reload
sed -i 's/^host all all all trust$/host all all all scram-sha-256/' /var/lib/postgresql/data/pg_hba.conf
# Also change 127.0.0.1 and ::1 to scram-sha-256
sed -i 's/^host    all             all             127.0.0.1\/32            trust$/host    all             all             127.0.0.1\/32            scram-sha-256/' /var/lib/postgresql/data/pg_hba.conf
sed -i 's/^host    all             all             ::1\/128                 trust$/host    all             all             ::1\/128                 scram-sha-256/' /var/lib/postgresql/data/pg_hba.conf
pg_ctl reload -D /var/lib/postgresql/data
echo "pg_hba.conf updated to scram-sha-256, reloaded."
