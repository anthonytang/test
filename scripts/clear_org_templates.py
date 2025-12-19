"""Clear all organization templates from the database"""

import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

conn = psycopg2.connect(
    host=os.getenv("PGHOST"),
    port=int(os.getenv("PGPORT", 5432)),
    database=os.getenv("PGDATABASE"),
    user=os.getenv("PGUSER"),
    password=os.getenv("PGPASSWORD"),
    sslmode="require",
)
conn.autocommit = True
cursor = conn.cursor()

cursor.execute("DELETE FROM organization_template_fields")
cursor.execute("DELETE FROM organization_templates")

print("Organization templates cleared")
cursor.close()
conn.close()
