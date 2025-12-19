#!/usr/bin/env bash
# Complete End-to-End Deployment Script for Studio Dev (Secure + Key Vault)
# - Loads config from outputs-*-dev.json files
# - Stores secrets in Key Vault
# - Uses Key Vault references in App Service settings
# - Builds & deploys containers to App Service from ACR

set -euo pipefail

# ------------------------ Colors & Logging ------------------------
RED='\033[0;31m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; NC='\033[0m'
print_info()    { echo -e "${BLUE}$1${NC}"; }
print_success() { echo -e "${GREEN}$1${NC}"; }
print_warning() { echo -e "${YELLOW}$1${NC}"; }
print_error()   { echo -e "${RED}$1${NC}"; }

# ------------------------ Requirements ------------------------
require_cmd() { command -v "$1" >/dev/null 2>&1 || { print_error "Missing required command: $1"; exit 1; }; }
require_cmd az
require_cmd jq
if ! command -v openssl >/dev/null 2>&1; then
  print_warning "OpenSSL not found; will use a fallback random for NEXTAUTH_SECRET."
fi

# ------------------------ Environment ------------------------
ENVIRONMENT=${1:-"test-run"}
print_info "Environment: $ENVIRONMENT"

# ------------------------ Locate outputs JSONs (fixed filenames) ------------------------
AIFOUNDRY_OUTPUTS="../../outputs-aifoundry-${ENVIRONMENT}.json"
APPSERVICE_OUTPUTS="../../outputs-appservice-${ENVIRONMENT}.json"
ACR_OUTPUTS="../../outputs-container-registry-${ENVIRONMENT}.json"
CORE_OUTPUTS="../../outputs-core-${ENVIRONMENT}.json"
MONGO_OUTPUTS="../../outputs-mongo-${ENVIRONMENT}.json"
POSTGRES_OUTPUTS="../../outputs-postgres-${ENVIRONMENT}.json"
STORAGE_OUTPUTS="../../outputs-storage-${ENVIRONMENT}.json"
APIM_OUTPUTS="../../outputs-apim-${ENVIRONMENT}.json"
LOG_OUTPUTS="../../outputs-loganalytics-${ENVIRONMENT}.json"
PARAMS_FILE="../../parameters.${ENVIRONMENT}.json"

missing=0
for f in \
  "$AIFOUNDRY_OUTPUTS" \
  "$APPSERVICE_OUTPUTS" \
  "$ACR_OUTPUTS" \
  "$CORE_OUTPUTS" \
  "$MONGO_OUTPUTS" \
  "$POSTGRES_OUTPUTS" \
  "$STORAGE_OUTPUTS" \
  "$PARAMS_FILE" \
  "$APIM_OUTPUTS" \
  "$LOG_OUTPUTS"
do
  if [ ! -f "$f" ]; then
    print_error "Missing file: $f"
    missing=1
  fi
done
[ $missing -eq 1 ] && exit 1

# ------------------------ Read from parameters.json (fallbacks) ------------------------
PARAM_CUSTOMER_PREFIX=$(jq -r '.parameters.customerPrefix.value // empty' "$PARAMS_FILE")
PARAM_ENVIRONMENT=$(jq -r '.parameters.environment.value // empty' "$PARAMS_FILE")
PARAM_LOCATION=$(jq -r '.parameters.location.value // empty' "$PARAMS_FILE")
PARAM_APP_PLAN_SKU=$(jq -r '.parameters.appServicePlanSku.value // empty' "$PARAMS_FILE")

PARAM_TENANT_ID=$(jq -r '.parameters.tenantId.value // empty' "$PARAMS_FILE")
PARAM_CLIENT_ID=$(jq -r '.parameters.clientId.value // empty' "$PARAMS_FILE")
PARAM_CLIENT_SECRET=$(jq -r '.parameters.clientSecret.value // empty' "$PARAMS_FILE")
PARAM_POSTGRES_PASSWORD=$(jq -r '.parameters.postgresPassword.value // empty' "$PARAMS_FILE")
PARAM_MONGO_PASSWORD=$(jq -r '.parameters.mongoPassword.value // empty' "$PARAMS_FILE")

# ------------------------ Extract from outputs ------------------------
# CORE
TENANT_ID=$(jq -r '.tenantId.value // .tenantId // .tenantID // empty' "$CORE_OUTPUTS")
SUBSCRIPTION_ID=$(jq -r '.parameters.subscription_id.value // empty' "$PARAMS_FILE")
RESOURCE_GROUP=$(jq -r '.resourceGroupName.value // .resourceGroupName // empty' "$CORE_OUTPUTS")
KEY_VAULT_NAME=$(jq -r '.keyVaultName.value // .keyVaultName // empty' "$CORE_OUTPUTS")

# APPSERVICE
BACKEND_APP_NAME=$(jq -r '.backendName.value // .backendAppName // empty' "$APPSERVICE_OUTPUTS")
FRONTEND_APP_NAME=$(jq -r '.frontendName.value // .frontendAppName // empty' "$APPSERVICE_OUTPUTS")
# BACKEND_URL=$(jq -r '.backendUrl.value // .backendUrl // empty' "$APPSERVICE_OUTPUTS")
BACKEND_URL=$(jq -r '.gatewayUrl.value // empty' "$APIM_OUTPUTS")
FRONTEND_URL=$(jq -r '.frontendUrl.value // .frontendUrl // empty' "$APPSERVICE_OUTPUTS")
CLIENT_ID=$(jq -r '.clientId.value // empty' "$PARAMS_FILE")
CLIENT_SECRET=$(jq -r '.aadClientSecret.value // .aadClientSecret // .clientSecret // empty' "$APPSERVICE_OUTPUTS")
NEXTAUTH_SECRET_FROM_OUTPUTS=$(jq -r '.nextAuthSecret.value // .nextAuthSecret // .nextauthSecret // empty' "$APPSERVICE_OUTPUTS")

# APIM
APIM_BASE_URL=$(jq -r '.gatewayUrl.value // empty' "$APIM_OUTPUTS")
APIM_SUBSCRIPTION_KEY="$(jq -r '.subscriptionKey.value // empty' "$APIM_OUTPUTS")"
AZURE_AD_API_SCOPE="api://${PARAM_CUSTOMER_PREFIX}-studio-api/user_impersonation"

# Log Analytics
LOG_ANALYTICS_SHARED_KEY="$(jq -r '.logAnalyticsSharedKey.value // empty' "$LOG_OUTPUTS")"
LOG_ANALYTICS_WORKSPACE_ID="$(jq -r '.logAnalyticsWorkspaceCustomerId.value // empty' "$LOG_OUTPUTS")"

# ACR
ACR_NAME=$(jq -r '.registryName.value // .acrName // .containerRegistryName.value // .containerRegistryName // empty' "$ACR_OUTPUTS")

# ------------------------ AIFOUNDRY (Azure OpenAI) ------------------------
AZURE_OPENAI_ENDPOINT=$(jq -r '.endpoint.value // .endpoint // empty' "$AIFOUNDRY_OUTPUTS")
AIFOUNDRY_SERVICE_NAME=$(jq -r '.serviceName.value // .serviceName // empty' "$AIFOUNDRY_OUTPUTS")
AIFOUNDRY_PROJECT_ID=$(jq -r '.projectId.value // .projectId // empty' "$AIFOUNDRY_OUTPUTS")

if [ -n "$AIFOUNDRY_PROJECT_ID" ] && [ "$AIFOUNDRY_PROJECT_ID" != "null" ]; then
  AIFOUNDRY_RESOURCE_GROUP=$(echo "$AIFOUNDRY_PROJECT_ID" | awk -F'/resourceGroups/|/providers/' '{print $2}')
fi
[ -z "${AIFOUNDRY_RESOURCE_GROUP:-}" ] && AIFOUNDRY_RESOURCE_GROUP="$RESOURCE_GROUP"

AZURE_OPENAI_API_KEY="${AZURE_OPENAI_API_KEY:-}"

if [ -z "$AZURE_OPENAI_API_KEY" ] || [ "$AZURE_OPENAI_API_KEY" = "null" ]; then
  if [ -z "$AIFOUNDRY_SERVICE_NAME" ] || [ "$AIFOUNDRY_SERVICE_NAME" = "null" ]; then
    print_error "Azure OpenAI key missing and serviceName not present in outputs-aifoundry-${ENVIRONMENT}.json."
    print_error "Please add .serviceName to that outputs file, or inject the key via parameters/Key Vault."
    exit 1
  fi
  print_info "Fetching Azure OpenAI key via CLI from account: $AIFOUNDRY_SERVICE_NAME (rg: $AIFOUNDRY_RESOURCE_GROUP)"
  AZURE_OPENAI_API_KEY=$(az cognitiveservices account keys list \
    --name "$AIFOUNDRY_SERVICE_NAME" \
    --resource-group "$AIFOUNDRY_RESOURCE_GROUP" \
    --query key1 -o tsv 2>/dev/null || true)

  if [ -z "$AZURE_OPENAI_API_KEY" ]; then
    print_error "Failed to retrieve Azure OpenAI key. Ensure your identity has access and the account name/RG are correct."
    exit 1
  fi
  print_success "Retrieved Azure OpenAI key for $AIFOUNDRY_SERVICE_NAME."
fi

if [ -z "$AZURE_OPENAI_ENDPOINT" ] || [ "$AZURE_OPENAI_ENDPOINT" = "null" ]; then
  print_error "AZURE_OPENAI_ENDPOINT is empty (check outputs-aifoundry-${ENVIRONMENT}.json: .endpoint.value)."
  exit 1
fi

# ------------------------ POSTGRES ------------------------
POSTGRES_OUTPUTS="../../outputs-postgres-${ENVIRONMENT}.json"

PG_JSON=$(
  jq -r '
    (.connectionString.value // .connectionString) as $cs
    | ($cs | split(";") | map(select(length>0))
        | map( split("=") | {(.[0]): (.[1] // "")}) | add)
    ' "$POSTGRES_OUTPUTS"
)

export PGHOST=$(     jq -r '.host'      <<<"$PG_JSON")
export PGPORT=$(     jq -r '.port // "5432"' <<<"$PG_JSON")
export PGDATABASE=$( jq -r '.database'  <<<"$PG_JSON")
export PGUSER=$(     jq -r '.username // .user' <<<"$PG_JSON")
export PGPASSWORD=$( jq -r '.password'  <<<"$PG_JSON")
export PGSSLMODE=$(  jq -r '.sslmode // "require"' <<<"$PG_JSON")

ENC_PASSWORD=$(python3 - <<'PY'
import os, urllib.parse
print(urllib.parse.quote(os.environ["PGPASSWORD"]))
PY
)

# Build both forms
export DATABASE_URL="postgresql://${PGUSER}:${ENC_PASSWORD}@${PGHOST}:${PGPORT}/${PGDATABASE}?sslmode=${PGSSLMODE}"
export POSTGRESQL_URL="postgres://${PGUSER}:${ENC_PASSWORD}@${PGHOST}:${PGPORT}/${PGDATABASE}?sslmode=${PGSSLMODE}"

# Redacted echo
echo "PGHOST=${PGHOST}"
echo "PGPORT=${PGPORT}"
echo "PGDATABASE=${PGDATABASE}"
echo "PGUSER=${PGUSER}"
echo "PGSSLMODE=${PGSSLMODE}"
echo "DATABASE_URL=postgresql://${PGUSER}:***@${PGHOST}:${PGPORT}/${PGDATABASE}?sslmode=${PGSSLMODE}"
echo "POSTGRESQL_URL=postgres://${PGUSER}:***@${PGHOST}:${PGPORT}/${PGDATABASE}?sslmode=${PGSSLMODE}"

# ------------------------ MONGO CONFIG ------------------------
echo "🔹 Extracting MongoDB connection string..."
COSMOS_MONGODB_CONNECTION_STRING=$(jq -r '
  .serverName.value // .connectionString.value //
  .mongoConnectionString.value // .cosmosMongoConnectionString.value //
  empty
' "$MONGO_OUTPUTS")

MONGO_PASS=$(jq -r '.parameters.mongoPassword.value // empty' ../../parameters.${ENVIRONMENT}.json)
ENCODED_PASS=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$MONGO_PASS''', safe=''))")

COSMOS_MONGODB_CONNECTION_STRING=$(echo "$COSMOS_MONGODB_CONNECTION_STRING" | \
  sed -e "s|<user>|mongodbadmin|g" -e "s|<password>|$ENCODED_PASS|g")

if ! echo "$COSMOS_MONGODB_CONNECTION_STRING" | grep -q "authSource="; then
  COSMOS_MONGODB_CONNECTION_STRING="${COSMOS_MONGODB_CONNECTION_STRING}&authSource=admin"
fi

echo "✅ Final MongoDB connection string stored (redacted in logs)."

# ------------------------ STORAGE (from outputs) ------------------------
STORAGE_CONNECTION_STRING=$(jq -r '.connectionString.value // .connectionString // empty' "$STORAGE_OUTPUTS")
STORAGE_NAME=$(jq -r '.storageAccountName.value // .storageAccountName // empty' "$STORAGE_OUTPUTS")

STORAGE_KEY=""
if [ -n "$STORAGE_CONNECTION_STRING" ] && [ "$STORAGE_CONNECTION_STRING" != "null" ]; then
  STORAGE_KEY=$(printf '%s\n' "$STORAGE_CONNECTION_STRING" | sed -n 's/.*AccountKey=\([^;]*\).*/\1/p')
fi

if [ -z "$STORAGE_KEY" ] || [ "$STORAGE_KEY" = "null" ]; then
  if [ -n "$STORAGE_NAME" ] && [ -n "$RESOURCE_GROUP" ]; then
    print_info "Storage AccountKey not found in outputs; fetching via CLI for $STORAGE_NAME ..."
    STORAGE_KEY=$(az storage account keys list \
      --account-name "$STORAGE_NAME" \
      --resource-group "$RESOURCE_GROUP" \
      --query '[0].value' -o tsv 2>/dev/null || true)
  fi
fi

if [ -z "$STORAGE_NAME" ] || [ "$STORAGE_NAME" = "null" ]; then
  print_error "STORAGE_NAME is empty (check outputs-storage-${ENVIRONMENT}.json: .storageAccountName.value)."
  exit 1
fi
if [ -z "$STORAGE_CONNECTION_STRING" ] || [ "$STORAGE_CONNECTION_STRING" = "null" ]; then
  if [ -n "$STORAGE_KEY" ] && [ "$STORAGE_KEY" != "null" ]; then
    STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=https;AccountName=${STORAGE_NAME};AccountKey=${STORAGE_KEY};EndpointSuffix=core.windows.net"
  else
    print_error "STORAGE_CONNECTION_STRING is empty and could not fetch key; ensure outputs or permissions are correct."
    exit 1
  fi
fi

# ------------------------ Merge: outputs first, then parameters as fallback ------------------------
TENANT_ID=${TENANT_ID:-$PARAM_TENANT_ID}
CLIENT_ID=${CLIENT_ID:-$PARAM_CLIENT_ID}
CLIENT_SECRET=${CLIENT_SECRET:-$PARAM_CLIENT_SECRET}

PGPASSWORD=${PGPASSWORD:-$PARAM_POSTGRES_PASSWORD}
MONGO_PASSWORD="$PARAM_MONGO_PASSWORD"

ENVIRONMENT=${ENVIRONMENT:-$PARAM_ENVIRONMENT}
AZ_LOCATION="$PARAM_LOCATION"
APP_PLAN_SKU="$PARAM_APP_PLAN_SKU"
CUSTOMER_PREFIX="$PARAM_CUSTOMER_PREFIX"

[ -z "$BACKEND_URL" ]  && [ -n "$BACKEND_APP_NAME" ]  && BACKEND_URL="https://${BACKEND_APP_NAME}.azurewebsites.net"
[ -z "$FRONTEND_URL" ] && [ -n "$FRONTEND_APP_NAME" ] && FRONTEND_URL="https://${FRONTEND_APP_NAME}.azurewebsites.net"

if [ -n "$NEXTAUTH_SECRET_FROM_OUTPUTS" ] && [ "$NEXTAUTH_SECRET_FROM_OUTPUTS" != "null" ]; then
  NEXTAUTH_SECRET="$NEXTAUTH_SECRET_FROM_OUTPUTS"
else
  if command -v openssl >/dev/null 2>&1; then
    NEXTAUTH_SECRET="$(openssl rand -base64 32)"
  else
    NEXTAUTH_SECRET="$(head -c 48 /dev/urandom | base64 || true)"
  fi
fi

# ------------------------ Derived constants ------------------------
AZURE_OPENAI_API_VERSION="2024-07-01-preview"
MODEL_NAME="gpt-4o"
SMALL_MODEL_NAME="gpt-4o-mini"
EMBEDDING_MODEL_NAME="text-embedding-3-small"
AZURE_AD_AUTHORITY="https://login.microsoftonline.com/$TENANT_ID"
AZURE_AD_ISSUER="https://login.microsoftonline.com/$TENANT_ID/v2.0"
KV_SCOPE="/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.KeyVault/vaults/$KEY_VAULT_NAME"

# ------------------------ Validate required values ------------------------
required_vars=(
  TENANT_ID SUBSCRIPTION_ID RESOURCE_GROUP KEY_VAULT_NAME
  BACKEND_APP_NAME FRONTEND_APP_NAME
  ACR_NAME
  AZURE_OPENAI_ENDPOINT AZURE_OPENAI_API_KEY
  STORAGE_NAME STORAGE_KEY
  APIM_BASE_URL APIM_SUBSCRIPTION_KEY AZURE_AD_API_SCOPE
  LOG_ANALYTICS_SHARED_KEY LOG_ANALYTICS_WORKSPACE_ID
)
for v in "${required_vars[@]}"; do
  if [ -z "${!v:-}" ] || [ "${!v}" = "null" ]; then
    print_error "Required value $v is empty. Check your outputs/parameters files."
    exit 1
  fi
done

# ------------------------ Helpers: Key Vault & Identity ------------------------
kv_put() {
  local name="$1"; local value="${2:-}"
  if [ -z "$value" ] || [ "$value" = "null" ]; then
    print_warning "Secret $name is empty or null. Skipping."
    return 0
  fi
  az keyvault secret set --vault-name "$KEY_VAULT_NAME" --name "$name" --value "$value" >/dev/null
  print_success "Secret stored: $name"
}

kv_ref_uri() {
  local name="$1"
  echo "https://${KEY_VAULT_NAME}.vault.azure.net/secrets/${name}"
}

use_rbac=$(az keyvault show -n "$KEY_VAULT_NAME" -g "$RESOURCE_GROUP" --query 'properties.enableRbacAuthorization' -o tsv)
grant_kv_secret_rights() {
  local principal_id="$1"
  if [ "$use_rbac" = "true" ]; then
    az role assignment create \
      --assignee-object-id "$principal_id" \
      --role "Key Vault Secrets User" \
      --scope "$KV_SCOPE" >/dev/null || true
  else
    az keyvault set-policy \
      --name "$KEY_VAULT_NAME" \
      --object-id "$principal_id" \
      --secret-permissions get list >/dev/null || true
  fi
}

# ------------------------ Deployment Function ------------------------
deploy_studio_dev() {
  print_info "========================================="
  print_info "STUDIO Dev DEPLOYMENT (Secure + Key Vault)"
  print_info "========================================="

  # --- Azure Context ---
  print_info "Switching to subscription $SUBSCRIPTION_ID..."
  az account set --subscription "$SUBSCRIPTION_ID"

  # --- ACR Login & Builds ---
  print_info "Logging into ACR: $ACR_NAME"
  az acr login --name "$ACR_NAME"

  print_info "Building backend image..."
  az acr build \
    --registry "$ACR_NAME" \
    --image backend:latest \
    --image "backend:$(date +%Y%m%d-%H%M%S)" \
    --platform linux/amd64 \
    ../../../../backend

  print_info "Building frontend image..."
  pushd ../../../.. > /dev/null
  az acr build \
    --registry "$ACR_NAME" \
    --image frontend:latest \
    --image "frontend:$(date +%Y%m%d-%H%M%S)" \
    --platform linux/amd64 \
    --file frontend/Dockerfile \
    --build-arg NEXT_PUBLIC_BACKEND_SERVER_URL="$BACKEND_URL" \
    --build-arg NEXT_PUBLIC_SITE_URL="$FRONTEND_URL" \
    --build-arg NEXT_PUBLIC_AZURE_AD_CLIENT_ID="$CLIENT_ID" \
    --build-arg NEXT_PUBLIC_AZURE_AD_TENANT_ID="$TENANT_ID" \
    --build-arg NEXT_PUBLIC_AZURE_AD_REDIRECT_URI="$FRONTEND_URL/auth/callback" \
    --build-arg NEXT_PUBLIC_AZURE_AD_AUTHORITY="$AZURE_AD_AUTHORITY" \
    --build-arg NEXT_PUBLIC_AZURE_AD_API_SCOPE="$AZURE_AD_API_SCOPE" \
    .
  popd > /dev/null

  # --- Enable Managed Identity on App Services ---
  print_info "Enabling system-assigned managed identity on App Services..."
  be_identity_json=$(az webapp identity assign --name "$BACKEND_APP_NAME" --resource-group "$RESOURCE_GROUP")
  fe_identity_json=$(az webapp identity assign --name "$FRONTEND_APP_NAME" --resource-group "$RESOURCE_GROUP")
  BE_PRINCIPAL_ID=$(echo "$be_identity_json" | jq -r '.principalId')
  FE_PRINCIPAL_ID=$(echo "$fe_identity_json" | jq -r '.principalId')
  print_success "Backend MI principalId: $BE_PRINCIPAL_ID"
  print_success "Frontend MI principalId: $FE_PRINCIPAL_ID"

  print_info "Granting Key Vault secret read to both identities..."
  grant_kv_secret_rights "$BE_PRINCIPAL_ID"
  grant_kv_secret_rights "$FE_PRINCIPAL_ID"

  # --- Optional: grant AcrPull (if pulling private images via MI) ---
  print_info "Granting AcrPull on ACR to both identities (ok if already granted)..."
  ACR_ID=$(az acr show -n "$ACR_NAME" --query id -o tsv)
  az role assignment create --assignee-object-id "$BE_PRINCIPAL_ID" --role AcrPull --scope "$ACR_ID" >/dev/null || true
  az role assignment create --assignee-object-id "$FE_PRINCIPAL_ID" --role AcrPull --scope "$ACR_ID" >/dev/null || true

  # --- Store Secrets in Key Vault ---
  print_info "Storing secrets in Key Vault: $KEY_VAULT_NAME"
  kv_put "DATABASE-URL" "$DATABASE_URL"
  kv_put "POSTGRESQL-URL" "$POSTGRESQL_URL"
  kv_put "PGPASSWORD" "${PGPASSWORD:-}"
  kv_put "COSMOS-MONGODB-CONNECTION-STRING" "$COSMOS_MONGODB_CONNECTION_STRING"
  kv_put "AZURE-OPENAI-API-KEY" "$AZURE_OPENAI_API_KEY"
  kv_put "AZURE-AD-CLIENT-SECRET" "$CLIENT_SECRET"
  kv_put "AZURE-STORAGE-ACCOUNT-KEY" "$STORAGE_KEY"
  kv_put "AZURE-STORAGE-CONNECTION-STRING" "DefaultEndpointsProtocol=https;AccountName=${STORAGE_NAME};AccountKey=${STORAGE_KEY};EndpointSuffix=core.windows.net"
  kv_put "NEXTAUTH-SECRET" "$NEXTAUTH_SECRET"
  kv_put "APIM-BASE-URL" "$APIM_BASE_URL"
  kv_put "APIM-SUBSCRIPTION-KEY" "$APIM_SUBSCRIPTION_KEY"
  kv_put "AZURE-AD-API-SCOPE" "$AZURE_AD_API_SCOPE"
  kv_put "LOG-ANALYTICS-SHARED-KEY" "$LOG_ANALYTICS_SHARED_KEY"
  kv_put "LOG-ANALYTICS-WORKSPACE-ID" "$LOG_ANALYTICS_WORKSPACE_ID"
  kv_put "PERPLEXITY-API-KEY" ""
  kv_put "FIRECRAWL-API-KEY" "fc-71b40b5ada9745e394c5a75f7b510e2c"

  # --- Build Key Vault Reference URIs (versionless for auto-rotation) ---
  KVREF_DATABASE_URL=$(kv_ref_uri "DATABASE-URL")
  KVREF_POSTGRESQL_URL=$(kv_ref_uri "POSTGRESQL-URL")
  KVREF_PGPASSWORD=$(kv_ref_uri "PGPASSWORD")
  KVREF_COSMOS_CONN=$(kv_ref_uri "COSMOS-MONGODB-CONNECTION-STRING")
  KVREF_OPENAI_KEY=$(kv_ref_uri "AZURE-OPENAI-API-KEY")
  KVREF_AAD_CLIENT_SECRET=$(kv_ref_uri "AZURE-AD-CLIENT-SECRET")
  KVREF_STORAGE_KEY=$(kv_ref_uri "AZURE-STORAGE-ACCOUNT-KEY")
  KVREF_STORAGE_CONN=$(kv_ref_uri "AZURE-STORAGE-CONNECTION-STRING")
  KVREF_NEXTAUTH_SECRET=$(kv_ref_uri "NEXTAUTH-SECRET")
  APIM_BASE_URL=$(kv_ref_uri "APIM-BASE-URL")
  APIM_SUBSCRIPTION_KEY=$(kv_ref_uri "APIM-SUBSCRIPTION-KEY")
  AZURE_AD_API_SCOPE=$(kv_ref_uri "AZURE-AD-API-SCOPE")
  LOG_ANALYTICS_SHARED_KEY=$(kv_ref_uri "LOG-ANALYTICS-SHARED-KEY")
  LOG_ANALYTICS_WORKSPACE_ID=$(kv_ref_uri "LOG-ANALYTICS-WORKSPACE-ID")
  PERPLEXITY_API_KEY=$(kv_ref_uri "PERPLEXITY-API-KEY")
  FIRECRAWL_API_KEY=$(kv_ref_uri "FIRECRAWL-API-KEY")

  # --- Backend App Settings (Key Vault references for secrets) ---
  print_info "Updating backend app settings (Key Vault refs)..."
  az webapp config appsettings set \
    --name "$BACKEND_APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --settings \
    PYTHONPATH="/app" \
    PORT="8000" \
    WEBSITES_PORT="8000" \
    WEBSITE_DYNAMIC_CACHE="0" \
    DATABASE_URL="@Microsoft.KeyVault(SecretUri=$KVREF_DATABASE_URL)" \
    POSTGRESQL_URL="@Microsoft.KeyVault(SecretUri=$KVREF_POSTGRESQL_URL)" \
    COSMOS_MONGODB_CONNECTION_STRING="@Microsoft.KeyVault(SecretUri=$KVREF_COSMOS_CONN)" \
    COSMOS_DATABASE_NAME="vectordb" \
    COSMOS_COLLECTION_NAME="documents" \
    AZURE_OPENAI_ENDPOINT="$AZURE_OPENAI_ENDPOINT" \
    AZURE_OPENAI_API_KEY="@Microsoft.KeyVault(SecretUri=$KVREF_OPENAI_KEY)" \
    AZURE_OPENAI_API_VERSION="$AZURE_OPENAI_API_VERSION" \
    MODEL_NAME="$MODEL_NAME" \
    SMALL_MODEL_NAME="$SMALL_MODEL_NAME" \
    EMBEDDING_MODEL_NAME="$EMBEDDING_MODEL_NAME" \
    AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT="$AZURE_OPENAI_ENDPOINT" \
    AZURE_DOCUMENT_INTELLIGENCE_KEY="@Microsoft.KeyVault(SecretUri=$KVREF_OPENAI_KEY)" \
    AZURE_AD_CLIENT_ID="$CLIENT_ID" \
    AZURE_AD_CLIENT_SECRET="@Microsoft.KeyVault(SecretUri=$KVREF_AAD_CLIENT_SECRET)" \
    AZURE_AD_TENANT_ID="$TENANT_ID" \
    AZURE_AD_ISSUER="$AZURE_AD_ISSUER" \
    AZURE_STORAGE_ACCOUNT_NAME="$STORAGE_NAME" \
    AZURE_STORAGE_ACCOUNT_KEY="@Microsoft.KeyVault(SecretUri=$KVREF_STORAGE_KEY)" \
    AZURE_STORAGE_CONNECTION_STRING="@Microsoft.KeyVault(SecretUri=$KVREF_STORAGE_CONN)" \
    AZURE_STORAGE_CONTAINER_NAME="user-files" \
    AZURE_STORAGE_BLOB_ENDPOINT="https://$STORAGE_NAME.blob.core.windows.net/" \
    PGHOST="$PGHOST" \
    PGPORT="5432" \
    PGUSER="citus" \
    PGPASSWORD="@Microsoft.KeyVault(SecretUri=$KVREF_PGPASSWORD)" \
    PGDATABASE="studio" \
    PGSSLMODE="require" \
    CORS_ORIGINS="$FRONTEND_URL" \
    APIM_BASE_URL="@Microsoft.KeyVault(SecretUri=$APIM_BASE_URL)" \
    APIM_SUBSCRIPTION_KEY="@Microsoft.KeyVault(SecretUri=$APIM_SUBSCRIPTION_KEY)" \
    AZURE_AD_API_SCOPE="@Microsoft.KeyVault(SecretUri=$AZURE_AD_API_SCOPE)" \
    PERPLEXITY_API_KEY="@Microsoft.KeyVault(SecretUri=$PERPLEXITY_API_KEY)" \
    FIRECRAWL_API_KEY="@Microsoft.KeyVault(SecretUri=$FIRECRAWL_API_KEY)"

  # --- Frontend App Settings (Key Vault references for secrets) ---
  print_info "Updating frontend app settings (Key Vault refs)..."
  az webapp config appsettings set \
    --name "$FRONTEND_APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --settings \
    PORT="3000" \
    WEBSITES_PORT="3000" \
    NODE_ENV="$ENVIRONMENT" \
    WEBSITE_DYNAMIC_CACHE="0" \
    WEBSITE_BUFFERING_ENABLED="0" \
    SCM_DO_BUILD_DURING_DEPLOYMENT="false" \
    BACKEND_SERVER_URL="$BACKEND_URL" \
    NEXT_PUBLIC_BACKEND_SERVER_URL="$BACKEND_URL" \
    NEXT_PUBLIC_SITE_URL="$FRONTEND_URL" \
    DATABASE_URL="@Microsoft.KeyVault(SecretUri=$KVREF_DATABASE_URL)" \
    POSTGRESQL_URL="@Microsoft.KeyVault(SecretUri=$KVREF_POSTGRESQL_URL)" \
    AZURE_AD_CLIENT_ID="$CLIENT_ID" \
    AZURE_AD_CLIENT_SECRET="@Microsoft.KeyVault(SecretUri=$KVREF_AAD_CLIENT_SECRET)" \
    AZURE_AD_TENANT_ID="$TENANT_ID" \
    AZURE_AD_REDIRECT_URI="$FRONTEND_URL/auth/callback" \
    AZURE_AD_AUTHORITY="$AZURE_AD_AUTHORITY" \
    NEXT_PUBLIC_AZURE_AD_CLIENT_ID="$CLIENT_ID" \
    NEXT_PUBLIC_AZURE_AD_TENANT_ID="$TENANT_ID" \
    NEXT_PUBLIC_AZURE_AD_REDIRECT_URI="$FRONTEND_URL/auth/callback" \
    NEXT_PUBLIC_AZURE_AD_AUTHORITY="$AZURE_AD_AUTHORITY" \
    NEXTAUTH_URL="$FRONTEND_URL" \
    NEXTAUTH_SECRET="@Microsoft.KeyVault(SecretUri=$KVREF_NEXTAUTH_SECRET)" \
    AZURE_STORAGE_ACCOUNT_NAME="$STORAGE_NAME" \
    AZURE_STORAGE_ACCOUNT_KEY="@Microsoft.KeyVault(SecretUri=$KVREF_STORAGE_KEY)" \
    AZURE_STORAGE_CONNECTION_STRING="@Microsoft.KeyVault(SecretUri=$KVREF_STORAGE_CONN)" \
    AZURE_STORAGE_CONTAINER_NAME="user-files" \
    AZURE_STORAGE_BLOB_ENDPOINT="https://$STORAGE_NAME.blob.core.windows.net/" \
    PGHOST="$PGHOST" \
    PGPORT="5432" \
    PGUSER="citus" \
    PGPASSWORD="@Microsoft.KeyVault(SecretUri=$KVREF_PGPASSWORD)" \
    PGDATABASE="studio" \
    PGSSLMODE="require" \
    APIM_BASE_URL="@Microsoft.KeyVault(SecretUri=$APIM_BASE_URL)" \
    APIM_SUBSCRIPTION_KEY="@Microsoft.KeyVault(SecretUri=$APIM_SUBSCRIPTION_KEY)" \
    AZURE_AD_API_SCOPE="@Microsoft.KeyVault(SecretUri=$AZURE_AD_API_SCOPE)" \
    LOG_ANALYTICS_SHARED_KEY="@Microsoft.KeyVault(SecretUri=$LOG_ANALYTICS_SHARED_KEY)" \
    LOG_ANALYTICS_WORKSPACE_ID="@Microsoft.KeyVault(SecretUri=$LOG_ANALYTICS_WORKSPACE_ID)"

  # --- Update Container Images ---
  print_info "Updating container images..."
  az webapp config container set \
    --name "$BACKEND_APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --container-image-name "$ACR_NAME.azurecr.io/backend:latest" \
    --container-registry-url "https://$ACR_NAME.azurecr.io"

  az webapp config container set \
    --name "$FRONTEND_APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --container-image-name "$ACR_NAME.azurecr.io/frontend:latest" \
    --container-registry-url "https://$ACR_NAME.azurecr.io"

  # --- Disable ARR Affinity (required for SSE streaming) ---
  print_info "Disabling ARR affinity for SSE streaming support..."
  az webapp update \
    --name "$BACKEND_APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --client-affinity-enabled false
  
  az webapp update \
    --name "$FRONTEND_APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --client-affinity-enabled false

  # --- Enable HTTP/2 for better streaming support ---
  print_info "Enabling HTTP/2 for better streaming support..."
  az webapp config set \
    --name "$BACKEND_APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --http20-enabled true
  
  az webapp config set \
    --name "$FRONTEND_APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --http20-enabled true

  # --- Restart Apps ---
  print_info "Restarting applications..."
  az webapp restart --name "$BACKEND_APP_NAME" --resource-group "$RESOURCE_GROUP"
  az webapp restart --name "$FRONTEND_APP_NAME" --resource-group "$RESOURCE_GROUP"

  print_success "✓ Studio Dev deployment complete!"
  print_info "  Backend:  $BACKEND_URL"
  print_info "  Frontend: $FRONTEND_URL"
}

# ------------------------ Main ------------------------
print_info "==================================================="
print_info "COMPLETE DEPLOYMENT SCRIPT - Studio (Secure)"
print_info "==================================================="

# Azure login check
if ! az account show &>/dev/null; then
  print_warning "Not logged in to Azure. Logging in..."
  az login >/dev/null
fi

# Show subs (handy visual)
print_info "Available subscriptions:"
az account list --query "[].{Name:name, ID:id, Tenant:tenantId}" -o table

# Run deploy
deploy_studio_dev

# ------------------------ Post-Deploy Hints ------------------------
echo ""
print_info "==================================================="
print_success "ALL DEPLOYMENTS COMPLETE!"
print_info "==================================================="
echo ""
print_info "Verification commands:"
echo "  Health:  curl ${BACKEND_URL}/health || true"
echo ""
print_info "Monitor logs:"
echo "  Backend:  az webapp log tail --name ${BACKEND_APP_NAME} --resource-group ${RESOURCE_GROUP}"
echo "  Frontend: az webapp log tail --name ${FRONTEND_APP_NAME} --resource-group ${RESOURCE_GROUP}"
echo ""
print_success "Deployment successful! 🚀"