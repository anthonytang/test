#!/bin/bash
# =============================================================================
# CORE INFRASTRUCTURE DEPLOYMENT
# =============================================================================
# Deploys Resource Group and Key Vault (foundation for other resources)

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Helper functions
log_info() { echo -e "${CYAN}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_header() { echo -e "\n${BLUE}🚀 $1${NC}\n"; }

ENVIRONMENT=${1:-"test-run"}
PARAMETERS_FILE="parameters.${ENVIRONMENT}.json"
DEPLOYMENT_NAME="studio-core-${ENVIRONMENT}-$(date +%Y%m%d-%H%M%S)"

log_header "CORE INFRASTRUCTURE DEPLOYMENT"
log_info "Environment: $ENVIRONMENT"
log_info "Parameters: $PARAMETERS_FILE"

# Check if parameters file exists
if [[ ! -f "$PARAMETERS_FILE" ]]; then
    log_error "Parameters file not found: $PARAMETERS_FILE"
    exit 1
fi

# Check if core.bicep exists
if [[ ! -f "core.bicep" ]]; then
    log_error "core.bicep file not found in current directory"
    exit 1
fi

log_info "Deploying core infrastructure in two phases..."
log_info "Phase 1: Create Resource Group"
log_info "Phase 2: Create Key Vault in the resource group"

# Extract parameters for deployment
CUSTOMER_PREFIX=$(jq -r '.parameters.customerPrefix.value' "$PARAMETERS_FILE")
ENVIRONMENT_VALUE=$(jq -r '.parameters.environment.value' "$PARAMETERS_FILE")
LOCATION=$(jq -r '.parameters.location.value' "$PARAMETERS_FILE")
TENANT_ID=$(jq -r '.parameters.tenantId.value' "$PARAMETERS_FILE")

# Handle studio vs client naming convention
if [[ "$CUSTOMER_PREFIX" == "studio" ]]; then
  RESOURCE_GROUP_NAME="studio-${ENVIRONMENT_VALUE}-rg"
  RESOURCE_PREFIX="studio-${ENVIRONMENT_VALUE}"
else
  RESOURCE_GROUP_NAME="${CUSTOMER_PREFIX}-studio-${ENVIRONMENT_VALUE}-rg"
  RESOURCE_PREFIX="${CUSTOMER_PREFIX}-studio-${ENVIRONMENT_VALUE}"
fi

log_info "Creating Resource Group: $RESOURCE_GROUP_NAME"

# Phase 1: Create Resource Group
az group create \
  --name "$RESOURCE_GROUP_NAME" \
  --location "$LOCATION" \
  --tags Environment="$ENVIRONMENT_VALUE" Customer="$CUSTOMER_PREFIX" Project="studio" ManagedBy="bicep"

if [[ $? -ne 0 ]]; then
    log_error "Resource Group creation failed!"
    exit 1
fi

log_success "Resource Group created successfully!"

# Phase 2: Deploy Key Vault
log_info "Deploying Key Vault to Resource Group..."

# Get current user's object ID for automatic RBAC assignment
DEPLOYER_OBJECT_ID=$(az ad signed-in-user show --query id --output tsv)
log_info "Setting up Key Vault access for user: $DEPLOYER_OBJECT_ID"

az deployment group create \
  --resource-group "$RESOURCE_GROUP_NAME" \
  --name "keyvault-${DEPLOYMENT_NAME}" \
  --template-file modules/keyVault.bicep \
  --parameters resourcePrefix="$RESOURCE_PREFIX" location="$LOCATION" tenantId="$TENANT_ID" deployerObjectId="$DEPLOYER_OBJECT_ID" \
  --output table

if [[ $? -eq 0 ]]; then
    log_success "Core infrastructure deployed successfully!"
else
    log_error "Core deployment failed!"
    log_info "Common issues:"
    log_info "- Invalid parameters in $PARAMETERS_FILE"
    log_info "- Insufficient permissions"
    log_info "- Resource group already exists"
    exit 1
fi

# Save outputs to file
log_info "Saving deployment outputs..."

# Get Key Vault outputs
az deployment group show \
  --resource-group "$RESOURCE_GROUP_NAME" \
  --name "keyvault-${DEPLOYMENT_NAME}" \
  --query 'properties.outputs' \
  --output json > temp-keyvault-outputs.json

# Create consolidated outputs
KEY_VAULT_NAME=$(jq -r '.keyVaultName.value' temp-keyvault-outputs.json)

cat > "outputs-core-${ENVIRONMENT}.json" << EOF
{
  "resourceGroupName": {
    "value": "$RESOURCE_GROUP_NAME"
  },
  "keyVaultName": {
    "value": "$KEY_VAULT_NAME"
  },
  "resourcePrefix": {
    "value": "$RESOURCE_PREFIX"
  }
}
EOF

rm temp-keyvault-outputs.json

log_success "Outputs saved to: outputs-core-${ENVIRONMENT}.json"

# Display deployment summary
log_header "DEPLOYMENT SUMMARY"
log_info "Resource Group: $RESOURCE_GROUP_NAME"
log_info "Key Vault: $KEY_VAULT_NAME"
log_info "Resource Prefix: $RESOURCE_PREFIX"

log_success "Core deployment complete!"
echo "Next: Run ./deploy-storage.sh $ENVIRONMENT"