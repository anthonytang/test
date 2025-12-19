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

if [[ ! -f "$PARAMETERS_FILE" ]]; then
  log_error "Parameters file not found: ${PARAMETERS_FILE}"
  exit 1
fi

if [[ ! -f "$CORE_OUTPUTS" ]]; then
  log_error "Core outputs file not found: ${CORE_OUTPUTS}"
  exit 1
fi

# ----------------------------------------
# Extract values from existing outputs / params
# ----------------------------------------
RESOURCE_PREFIX=$(jq -r '.resourcePrefix.value' "$CORE_OUTPUTS")
RESOURCE_GROUP=$(jq -r '.resourceGroupName.value' "$CORE_OUTPUTS")
LOCATION=$(jq -r '.parameters.location.value' "$PARAMETERS_FILE")

if [[ -z "$RESOURCE_PREFIX" || -z "$RESOURCE_GROUP" || -z "$LOCATION" ]]; then
  log_error "One or more required values (RESOURCE_PREFIX, RESOURCE_GROUP, LOCATION) are empty"
  exit 1
fi

# Workspace name convention: <prefix>-logs
WORKSPACE_NAME="${RESOURCE_PREFIX}-logs"

log_header "Deploying Log Analytics workspace (${ENVIRONMENT})"
log_info "Resource group   : ${RESOURCE_GROUP}"
log_info "Location         : ${LOCATION}"
log_info "Workspace name   : ${WORKSPACE_NAME}"

# ----------------------------------------
# STEP 1 – Deploy Log Analytics workspace
# ----------------------------------------
log_step "1" "Deploy or update Log Analytics workspace"

DEPLOYMENT_NAME="${RESOURCE_PREFIX}-logs-${ENVIRONMENT}-$(date +%Y%m%d-%H%M%S)"

az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$DEPLOYMENT_NAME" \
  --template-file modules/loganalytics.bicep \
  --parameters \
    workspaceName="$WORKSPACE_NAME" \
    location="$LOCATION"

log_success "Log Analytics workspace '${WORKSPACE_NAME}' deployed."

# ----------------------------------------
# STEP 2 – Retrieve workspace ID + Shared Key (primary)
# ----------------------------------------
log_step "2" "Fetch workspace ID and shared keys"

# Workspace ID
WORKSPACE_ID=$(az monitor log-analytics workspace show \
  --resource-group "$RESOURCE_GROUP" \
  --workspace-name "$WORKSPACE_NAME" \
  --query customerId \
  -o tsv)

if [[ -z "$WORKSPACE_ID" ]]; then
  log_error "Failed to retrieve workspaceId"
  exit 1
fi

# Shared Key (primary)
PRIMARY_KEY=$(az monitor log-analytics workspace get-shared-keys \
  --resource-group "$RESOURCE_GROUP" \
  --workspace-name "$WORKSPACE_NAME" \
  --query primarySharedKey \
  -o tsv)

if [[ -z "$PRIMARY_KEY" ]]; then
  log_error "Failed to retrieve primarySharedKey"
  exit 1
fi

log_info "Workspace ID     : $WORKSPACE_ID"
log_info "Shared Key       : <hidden>"

# ----------------------------------------
# STEP 3 – Write outputs-loganalytics-${ENV}.json
# ----------------------------------------
# STEP 3 – Write outputs-loganalytics-${ENVIRONMENT}.json
log_step "3" "Write Log Analytics outputs to outputs-loganalytics-${ENVIRONMENT}.json"

# Workspace ARM resource ID
WORKSPACE_RESOURCE_ID=$(az monitor log-analytics workspace show \
  --resource-group "$RESOURCE_GROUP" \
  --workspace-name "$WORKSPACE_NAME" \
  --query id \
  -o tsv)

jq -n \
  --arg workspaceCustomerId "$WORKSPACE_ID" \
  --arg sharedKey "$PRIMARY_KEY" \
  --arg workspaceResourceId "$WORKSPACE_RESOURCE_ID" \
  '{
    logAnalyticsWorkspaceCustomerId: {
      type: "String",
      value: $workspaceCustomerId
    },
    logAnalyticsWorkspaceResourceId: {
      type: "String",
      value: $workspaceResourceId
    },
    logAnalyticsSharedKey: {
      type: "String",
      value: $sharedKey
    }
  }' > "outputs-loganalytics-${ENVIRONMENT}.json"

log_success "Log Analytics outputs saved to outputs-loganalytics-${ENVIRONMENT}.json"


echo
echo "Log Analytics deployment completed."
echo "Workspace name   : ${WORKSPACE_NAME}"
echo "Workspace ID     : ${WORKSPACE_ID}"
