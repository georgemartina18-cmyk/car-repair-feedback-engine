#!/bin/bash
# Creates a separate database for n8n's own data next to the feedback database.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "CREATE DATABASE n8n OWNER \"$POSTGRES_USER\";"
