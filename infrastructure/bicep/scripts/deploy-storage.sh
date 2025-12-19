#!/bin/bash
# =============================================================================
# STORAGE DEPLOYMENT
# =============================================================================
# Deploys Azure Storage Account

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Helper functions
log_info() { echo -e "${CYAN}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_header() { echo -e "\n${BLUE}🚀 $1${NC}\n"; }

ENVIRONMENT=${1:-"test-run"}
PARAMETERS_FILE="parameters.${ENVIRONMENT}.json"
CORE_OUTPUTS="outputs-core-${ENVIRONMENT}.json"
DEPLOYMENT_NAME="studio-storage-${ENVIRONMENT}-$(date +%Y%m%d-%H%M%S)"

log_header "STORAGE DEPLOYMENT"
log_info "Environment: $ENVIRONMENT"

# Check prerequisites
if [[ ! -f "$PARAMETERS_FILE" ]]; then
    log_error "Parameters file not found: $PARAMETERS_FILE"
    exit 1
fi

if [[ ! -f "$CORE_OUTPUTS" ]]; then
    log_error "Core outputs not found: $CORE_OUTPUTS. Run deploy-core.sh first."
    exit 1
fi

# Extract values from core outputs
RESOURCE_GROUP=$(jq -r '.resourceGroupName.value' "$CORE_OUTPUTS")
KEY_VAULT_NAME=$(jq -r '.keyVaultName.value' "$CORE_OUTPUTS")
RESOURCE_PREFIX=$(jq -r '.resourcePrefix.value' "$CORE_OUTPUTS")

log_info "Resource Group: $RESOURCE_GROUP"
log_info "Key Vault: $KEY_VAULT_NAME"

# Extract location and environment from parameters
LOCATION=$(jq -r '.parameters.location.value' "$PARAMETERS_FILE")
ENV=$(jq -r '.parameters.environment.value' "$PARAMETERS_FILE")

# Create storage.bicep template
cat > storage-deploy.bicep << EOF
targetScope = 'resourceGroup'

param resourcePrefix string = '$RESOURCE_PREFIX'
param location string = '$LOCATION'
param environment string = '$ENV'

var commonTags = {
  Environment: environment
  Project: 'studio'
  ManagedBy: 'bicep'
  DeployedBy: 'modular-deployment'
}

// Storage Account
module storage 'modules/storage.bicep' = {
  name: 'storage-deployment'
  params: {
    resourcePrefix: resourcePrefix
    location: location
    environment: environment
    tags: commonTags
  }
}

// Store connection string in Key Vault
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: '$KEY_VAULT_NAME'
}

resource storageConnectionSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'storage-connection-string'
  properties: {
    value: storage.outputs.connectionString
  }
}

// Outputs
output storageAccountName string = storage.outputs.storageAccountName
output connectionString string = storage.outputs.connectionString
EOF

log_info "Deploying storage account..."

# Deploy
az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$DEPLOYMENT_NAME" \
  --template-file storage-deploy.bicep \
  --output table

log_success "Storage deployed successfully!"

# Save outputs
log_info "Saving deployment outputs..."
az deployment group show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$DEPLOYMENT_NAME" \
  --query 'properties.outputs' \
  --output json > "outputs-storage-${ENVIRONMENT}.json"

log_success "Outputs saved to: outputs-storage-${ENVIRONMENT}.json"

# Clean up
rm -f storage-deploy.bicep

log_success "Storage deployment complete!"
echo "Next: Run ./deploy-openai.sh $ENVIRONMENT"