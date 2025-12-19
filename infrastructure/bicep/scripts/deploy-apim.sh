#!/usr/bin/env bash

# ----------------------------------------
# Colored logging helpers
# ----------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
PURPLE='\033[0;35m'
NC='\033[0m'

log_info()    { echo -e "${CYAN}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error()   { echo -e "${RED}❌ $1${NC}"; }
log_header()  { echo -e "\n${BLUE}🚀 $1${NC}\n"; }
log_step()    { echo -e "\n${PURPLE}📋 STEP $1: $2${NC}\n"; }

set -euo pipefail

# ----------------------------------------
# Inputs / environment
# ----------------------------------------
ENVIRONMENT="${1:-dev}"

PARAMETERS_FILE="parameters.${ENVIRONMENT}.json"
CORE_OUTPUTS="outputs-core-${ENVIRONMENT}.json"
APP_OUTPUTS="outputs-appservice-${ENVIRONMENT}.json"

if [[ ! -f "$PARAMETERS_FILE" ]]; then
  log_error "Parameters file not found: $PARAMETERS_FILE"
  exit 1
fi

if [[ ! -f "$CORE_OUTPUTS" ]]; then
  log_error "Core outputs file not found: $CORE_OUTPUTS"
  exit 1
fi

if [[ ! -f "$APP_OUTPUTS" ]]; then
  log_error "AppService outputs file not found: $APP_OUTPUTS"
  exit 1
fi

# ----------------------------------------
# Extract values from outputs / params
# ----------------------------------------
RESOURCE_PREFIX=$(jq -r '.resourcePrefix.value' "$CORE_OUTPUTS")
RESOURCE_GROUP=$(jq -r '.resourceGroupName.value' "$CORE_OUTPUTS")
LOCATION=$(jq -r '.parameters.location.value' "$PARAMETERS_FILE")
BACKEND_HOST=$(jq -r '.backendUrl.value' "$APP_OUTPUTS")
TENANT_ID=$(jq -r '.parameters.tenantId.value' "$PARAMETERS_FILE")
CLIENT_ID=$(jq -r '.parameters.clientId.value' "$PARAMETERS_FILE")
CUSTOMER_PREFIX=$(jq -r '.parameters.customerPrefix.value' "$PARAMETERS_FILE")

if [[ -z "$RESOURCE_PREFIX" || -z "$RESOURCE_GROUP" || -z "$BACKEND_HOST" || -z "$TENANT_ID" || -z "$CLIENT_ID" ]]; then
  log_error "One or more required values (RESOURCE_PREFIX, RESOURCE_GROUP, BACKEND_HOST, TENANT_ID, CLIENT_ID) are empty"
  exit 1
fi

APIM_NAME="${RESOURCE_PREFIX}-apim"
API_ID="${RESOURCE_PREFIX}-api"
API_PATH="studio"
DISPLAY_NAME="Studio Backend"
AUDIENCE="api://${CUSTOMER_PREFIX}-studio-api"

log_header "Deploying APIM API (${ENVIRONMENT})"
log_info "Resource group : ${RESOURCE_GROUP}"
log_info "Location       : ${LOCATION}"
log_info "APIM name      : ${APIM_NAME}"
log_info "API ID         : ${API_ID}"
log_info "Backend URL    : ${BACKEND_HOST}"
log_info "Tenant ID      : ${TENANT_ID}"
log_info "Client ID      : ${CLIENT_ID}"
log_info "Audience       : ${AUDIENCE}"

# ----------------------------------------
# STEP 0 – Ensure APIM service + products exist
# ----------------------------------------
log_step "0" "Deploy or update APIM service and products"

az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --name "apim" \
  --template-file modules/apim.bicep \
  --parameters \
    apimName="$APIM_NAME" \
    location="$LOCATION" \
    publisherEmail="platform@yourorg.com" \
    publisherName="Your Org Platform"

log_success "APIM service '${APIM_NAME}' ensured in resource group '${RESOURCE_GROUP}'."

# ----------------------------------------
# STEP 1 – Deploy API + JWT policy into APIM
# ----------------------------------------
log_step "1" "Deploy API + policy into APIM"

az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --name "apim.api" \
  --template-file modules/apim.api.bicep \
  --parameters \
    apimName="$APIM_NAME" \
    apiId="$API_ID" \
    path="$API_PATH" \
    displayName="$DISPLAY_NAME" \
    serviceUrl="$BACKEND_HOST" \
    tenantId="$TENANT_ID" \
    audience="$AUDIENCE" \
    clientId="$CLIENT_ID"

log_success "API '$API_ID' deployed to APIM '$APIM_NAME'."

# ----------------------------------------
# STEP 2 – Fetch gateway hostname, outbound IPs, and ensure product subscription
# ----------------------------------------
log_step "2" "Fetch APIM gateway hostname, outbound IPs, and ensure product subscription"

# 2a. Gateway hostname (proxy)
HOSTNAME=$(az apim show \
  --name "$APIM_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "hostnameConfigurations[?type=='Proxy'].hostName | [0]" \
  -o tsv)

if [[ -z "$HOSTNAME" ]]; then
  log_error "Failed to resolve APIM proxy hostname"
  exit 1
fi

# 2b. Subscription ID (current account)
SUBSCRIPTION_ID=$(az account show --query id -o tsv)

if [[ -z "$SUBSCRIPTION_ID" ]]; then
  log_error "Could not determine Azure subscription ID. Run 'az login' and/or 'az account set'."
  exit 1
fi

# 2c. Outbound IPs for APIM (used for backend access restrictions)
# Note: outboundIpAddresses/publicIpAddresses are often comma-separated strings.
OUTBOUND_IPS_RAW=$(az apim show \
  --name "$APIM_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "outboundIpAddresses" \
  -o tsv 2>/dev/null || echo "")

if [[ -z "$OUTBOUND_IPS_RAW" || "$OUTBOUND_IPS_RAW" == "null" ]]; then
  # Try publicIpAddresses as a fallback (depending on APIM SKU/ARM version)
  OUTBOUND_IPS_RAW=$(az apim show \
    --name "$APIM_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query "publicIpAddresses" \
    -o tsv 2>/dev/null || echo "")
fi

if [[ -z "$OUTBOUND_IPS_RAW" || "$OUTBOUND_IPS_RAW" == "null" ]]; then
  log_warning "APIM outbound IP addresses could not be retrieved."
  OUTBOUND_IPS_JSON='[]'
else
  # OUTBOUND_IPS_RAW is a comma-separated list like "1.2.3.4,5.6.7.8"
  OUTBOUND_IPS_JSON=$(jq -nc --arg ips "$OUTBOUND_IPS_RAW" '$ips | split(",")')
  log_info "APIM outbound IPs : $(echo "$OUTBOUND_IPS_JSON" | jq -r '.[]')"
fi

# 2d. Ensure there is a subscription for the 'unlimited' product and get its primaryKey
PRODUCT_ID="unlimited"
SCOPE="/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.ApiManagement/service/${APIM_NAME}/products/${PRODUCT_ID}"

log_info "Using product ID   : ${PRODUCT_ID}"
log_info "Product scope      : ${SCOPE}"

# Try to find an existing subscription for this product
PRODUCT_SUB_NAME=$(az rest \
  --method get \
  --url "https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.ApiManagement/service/${APIM_NAME}/subscriptions?api-version=2022-08-01" \
  --query "value[?properties.scope=='${SCOPE}'].name | [0]" \
  -o tsv) || PRODUCT_SUB_NAME=""

if [[ -z "$PRODUCT_SUB_NAME" ]]; then
  # No subscription yet for this product: create one
  PRODUCT_SUB_NAME="${RESOURCE_PREFIX}-${PRODUCT_ID}-sub"
  log_info "No existing subscription for product '${PRODUCT_ID}'. Creating '${PRODUCT_SUB_NAME}'..."

  SUB_BODY=$(jq -n \
    --arg scope "$SCOPE" \
    --arg display "Studio ${ENVIRONMENT} Unlimited Subscription" \
    '{
      properties: {
        displayName: $display,
        scope: $scope,
        state: "active",
        primaryKey: null,
        secondaryKey: null
      }
    }')

  az rest \
    --method put \
    --url "https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.ApiManagement/service/${APIM_NAME}/subscriptions/${PRODUCT_SUB_NAME}?api-version=2022-08-01" \
    --body "${SUB_BODY}" >/dev/null

  log_success "Created subscription '${PRODUCT_SUB_NAME}' for product '${PRODUCT_ID}'."
else
  log_info "Found existing subscription for product '${PRODUCT_ID}': ${PRODUCT_SUB_NAME}"
fi

# Regenerate keys (if needed) and read primaryKey from PATCH response
APIM_KEY=$(az rest \
  --method patch \
  --url "https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.ApiManagement/service/${APIM_NAME}/subscriptions/${PRODUCT_SUB_NAME}?api-version=2022-08-01" \
  --body '{
    "properties": {
      "primaryKey": null,
      "secondaryKey": null
    }
  }' \
  --query "properties.primaryKey" \
  -o tsv)

if [[ -z "$APIM_KEY" ]]; then
  log_warning "Subscription '${PRODUCT_SUB_NAME}' has no primaryKey. 'subscriptionKey' output will be empty."
else
  log_info "APIM subscription key retrieved."
fi

log_info "Gateway host      : ${HOSTNAME}"
log_info "Subscription name : ${PRODUCT_SUB_NAME}"

# ----------------------------------------
# STEP 3 – Write outputs-apim-${ENVIRONMENT}.json
# ----------------------------------------
log_step "3" "Write APIM outputs to outputs-apim-${ENVIRONMENT}.json"

jq -n \
  --arg gateway "$HOSTNAME" \
  --arg key "$APIM_KEY" \
  --argjson outbound "$OUTBOUND_IPS_JSON" \
'{
  gatewayUrl: {
    type: "String",
    value: ("https://" + $gateway)
  },
  subscriptionKey: {
    type: "String",
    value: $key
  },
  apimOutboundIps: {
    type: "Array",
    value: $outbound
  }
}' > "outputs-apim-${ENVIRONMENT}.json"

log_success "APIM outputs saved to: outputs-apim-${ENVIRONMENT}.json"

echo
echo "APIM deployment completed."
echo "Gateway URL     : https://${HOSTNAME}"
echo "API base path   : /${API_PATH}"
echo "Example health  : https://${HOSTNAME}/${API_PATH}/health"
