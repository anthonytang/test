#!/usr/bin/env python3

import psycopg2

# Database connection parameters
conn_params = {
    'host': 'c-studio.ddoe24dmhrcsku.postgres.cosmos.azure.com',
    'port': 5432,
    'database': 'citus',
    'user': 'citus',
    'password': 'Y2003assin!',
    'sslmode': 'require'
}

try:
    conn = psycopg2.connect(**conn_params)
    cur = conn.cursor()
    
    # Check templates table schema
    cur.execute("""
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'templates'
        ORDER BY ordinal_position;
    """)
    
    print("Templates table columns:")
    for col in cur.fetchall():
        print(f"  - {col[0]}: {col[1]}")
    
    cur.close()
    conn.close()
    
except Exception as e:
    print(f"Error: {e}")