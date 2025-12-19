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
LOG_OUTPUTS="outputs-loganalytics-${ENVIRONMENT}.json"

if [[ ! -f "$CORE_OUTPUTS" ]]; then
  log_error "Core outputs file not found: ${CORE_OUTPUTS}"
  exit 1
fi

if [[ ! -f "$APP_OUTPUTS" ]]; then
  log_error "AppService outputs file not found: ${APP_OUTPUTS}"
  exit 1
fi

if [[ ! -f "$LOG_OUTPUTS" ]]; then
  log_error "Log Analytics outputs file not found: ${LOG_OUTPUTS}"
  exit 1
fi

# ----------------------------------------
# Extract values
# ----------------------------------------
RESOURCE_GROUP=$(jq -r '.resourceGroupName.value' "$CORE_OUTPUTS")
RESOURCE_PREFIX=$(jq -r '.resourcePrefix.value' "$CORE_OUTPUTS")

WORKSPACE_ID=$(jq -r '.logAnalyticsWorkspaceResourceId.value' "$LOG_OUTPUTS")

# Adjust these keys if your outputs-appservice JSON uses different names
BACKEND_APP_NAME=$(jq -r '.backendName.value' "$APP_OUTPUTS")
FRONTEND_APP_NAME=$(jq -r '.frontendName.value' "$APP_OUTPUTS")

if [[ -z "$RESOURCE_GROUP" || -z "$RESOURCE_PREFIX" || -z "$WORKSPACE_ID" ]]; then
  log_error "RESOURCE_GROUP, RESOURCE_PREFIX, or WORKSPACE_ID is empty"
  exit 1
fi

if [[ -z "$BACKEND_APP_NAME" || -z "$FRONTEND_APP_NAME" ]]; then
  log_error "BACKEND_APP_NAME or FRONTEND_APP_NAME is empty. Check outputs-appservice-${ENVIRONMENT}.json."
  exit 1
fi

log_header "Configuring App Service diagnostics to Log Analytics (${ENVIRONMENT})"
log_info "Resource group     : ${RESOURCE_GROUP}"
log_info "Workspace ID       : ${WORKSPACE_ID}"
log_info "Backend app name   : ${BACKEND_APP_NAME}"
log_info "Frontend app name  : ${FRONTEND_APP_NAME}"

# ----------------------------------------
# Helper to deploy diagnostics for a single site
# ----------------------------------------
deploy_diag_for_site () {
  local SITE_NAME="$1"
  local ROLE="$2"

  log_step "for ${ROLE}" "Attach diagnostics for App Service: ${SITE_NAME}"

  local DEPLOYMENT_NAME="${RESOURCE_PREFIX}-${ROLE}-diag-${ENVIRONMENT}-$(date +%Y%m%d-%H%M%S)"

  az deployment group create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$DEPLOYMENT_NAME" \
    --template-file modules/appservice.diagnostics.bicep \
    --parameters \
      siteName="$SITE_NAME" \
      workspaceId="$WORKSPACE_ID" \
    >/dev/null

  log_success "Diagnostics attached for ${ROLE} (${SITE_NAME})."
}

# ----------------------------------------
# STEP 1 – Backend diagnostics
# ----------------------------------------
deploy_diag_for_site "$BACKEND_APP_NAME" "backend"

# ----------------------------------------
# STEP 2 – Frontend diagnostics
# ----------------------------------------
deploy_diag_for_site "$FRONTEND_APP_NAME" "frontend"

echo
echo "App Service diagnostics configured for both backend and frontend."
