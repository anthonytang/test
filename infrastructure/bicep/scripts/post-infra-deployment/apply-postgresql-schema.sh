#!/usr/bin/env bash
# =============================================================================
# Apply schema to Azure Cosmos DB for PostgreSQL
# =============================================================================
# Usage Example:
#   ./apply-postgresql-schema.sh "postgres://user:password@host:5432/db?sslmode=require"
# =============================================================================

set -euo pipefail

SCHEMA_FILE="azure_schema.sql"
URL="${1:-}"

# --- Validate inputs ---------------------------------------------------------
if [[ -z "${URL}" ]]; then
  echo "❌ ERROR: Missing connection URL."
  echo "Usage: $0 \"postgres://user:password@host:5432/db?sslmode=require\""
  exit 1
fi

if [[ ! -f "${SCHEMA_FILE}" ]]; then
  echo "❌ ERROR: Schema file not found: ${SCHEMA_FILE}"
  exit 1
fi

# --- Redact password for display ---------------------------------------------
REDACTED_URL=$(echo "$URL" | sed -E 's#(://[^:]+:)[^@]+@#\1***@#')

echo "📄 Applying schema file: ${SCHEMA_FILE}"
echo "🔗 Connecting to: ${REDACTED_URL}"
echo ""

# --- Run schema ---------------------------------------------------------------
psql "$URL" -v ON_ERROR_STOP=1 -f "$SCHEMA_FILE"

echo ""
echo "✅ Schema applied successfully!"
