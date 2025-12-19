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

CORE_OUTPUTS="outputs-core-${ENVIRONMENT}.json"
APP_OUTPUTS="outputs-appservice-${ENVIRONMENT}.json"
APIM_OUTPUTS="outputs-apim-${ENVIRONMENT}.json"

if [[ ! -f "$CORE_OUTPUTS" ]]; then
  log_error "Core outputs file not found: ${CORE_OUTPUTS}"
  exit 1
fi

if [[ ! -f "$APP_OUTPUTS" ]]; then
  log_error "AppService outputs file not found: ${APP_OUTPUTS}"
  exit 1
fi

if [[ ! -f "$APIM_OUTPUTS" ]]; then
  log_error "APIM outputs file not found: ${APIM_OUTPUTS}"
  exit 1
fi

# ----------------------------------------
# Extract values
# ----------------------------------------
RESOURCE_GROUP=$(jq -r '.resourceGroupName.value' "$CORE_OUTPUTS")
BACKEND_APP_NAME=$(jq -r '.backendName.value' "$APP_OUTPUTS")

if [[ -z "$RESOURCE_GROUP" || -z "$BACKEND_APP_NAME" ]]; then
  log_error "RESOURCE_GROUP or BACKEND_APP_NAME is empty. Check outputs-core/appservice JSON."
  exit 1
fi

APIM_OUTBOUND_IPS=$(jq -r '.apimOutboundIps.value[]?' "$APIM_OUTPUTS" || true)

if [[ -z "$APIM_OUTBOUND_IPS" ]]; then
  log_warning "No APIM outbound IPs found in ${APIM_OUTPUTS}. Nothing to configure."
  exit 0
fi

log_header "Configuring backend App Service access restrictions (${ENVIRONMENT})"
log_info "Resource group    : ${RESOURCE_GROUP}"
log_info "Backend app name  : ${BACKEND_APP_NAME}"
log_info "APIM outbound IPs :"
echo "$APIM_OUTBOUND_IPS" | sed 's/^/  - /'

# STEP 1 – Add allow rules for APIM outbound IPs
log_step "1" "Add allow rules for APIM outbound IPs"

while IFS= read -r ip; do
  [[ -z "$ip" ]] && continue

  RULE_NAME="Allow-APIM"

  log_info "Adding rule ${RULE_NAME} for ${ip}/32"

  az webapp config access-restriction add \
    --resource-group "$RESOURCE_GROUP" \
    --name "$BACKEND_APP_NAME" \
    --rule-name "$RULE_NAME" \
    --priority 100 \
    --action Allow \
    --ip-address "${ip}/32"

done <<< "$APIM_OUTBOUND_IPS"

log_step "2" "Ensure a Deny-All rule (optional, be careful!)"

az webapp config access-restriction add \
  --resource-group "$RESOURCE_GROUP" \
  --name "$BACKEND_APP_NAME" \
  --rule-name "Deny-All" \
  --priority 200 \
  --action Deny \
  --ip-address "0.0.0.0/0" \
  --description "Deny all other traffic" \
  >/dev/null

log_warning "Deny-All rule added. Only allowed IPs (APIM + any existing 'Allow' rules) can reach the backend now."

# ----------------------------------------
log_step "3" "Show current access restrictions for backend"

az webapp config access-restriction show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$BACKEND_APP_NAME" \
  -o table

log_success "Backend access restriction configuration completed."
