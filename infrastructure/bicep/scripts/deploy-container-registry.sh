#!/bin/bash
# =============================================================================
# CONTAINER REGISTRY DEPLOYMENT
# =============================================================================
# Deploys Azure Container Registry

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
DEPLOYMENT_NAME="studio-container-registry-${ENVIRONMENT}-$(date +%Y%m%d-%H%M%S)"

log_header "CONTAINER REGISTRY DEPLOYMENT"
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

# Also extract customer prefix for consistent naming
CUSTOMER_PREFIX=$(jq -r '.parameters.customerPrefix.value' "$PARAMETERS_FILE")

log_info "Resource Group: $RESOURCE_GROUP"
log_info "Key Vault: $KEY_VAULT_NAME"

# Extract location and environment from parameters
LOCATION=$(jq -r '.parameters.location.value' "$PARAMETERS_FILE")
ENV=$(jq -r '.parameters.environment.value' "$PARAMETERS_FILE")

# Create container-registry-deploy.bicep template
cat > container-registry-deploy.bicep << EOF
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

// Container Registry
module containerRegistry 'modules/containerRegistry.bicep' = {
  name: 'container-registry-deployment'
  params: {
    resourcePrefix: resourcePrefix
    location: location
    environment: environment
    tags: commonTags
    enableAdminUser: true
    enablePrivateEndpoints: false
  }
}

// Outputs
output registryName string = containerRegistry.outputs.registryName
output loginServer string = containerRegistry.outputs.loginServer
output adminUserEnabled bool = containerRegistry.outputs.adminUserEnabled
EOF

log_info "Deploying container registry..."

# Deploy
az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$DEPLOYMENT_NAME" \
  --template-file container-registry-deploy.bicep \
  --output table

log_success "Container Registry deployed successfully!"

# Save outputs
log_info "Saving deployment outputs..."
az deployment group show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$DEPLOYMENT_NAME" \
  --query 'properties.outputs' \
  --output json > "outputs-container-registry-${ENVIRONMENT}.json"

log_success "Outputs saved to: outputs-container-registry-${ENVIRONMENT}.json"

# Get registry credentials and store in Key Vault
log_info "Storing registry credentials in Key Vault..."
REGISTRY_NAME=$(jq -r '.registryName.value' "outputs-container-registry-${ENVIRONMENT}.json")
LOGIN_SERVER=$(jq -r '.loginServer.value' "outputs-container-registry-${ENVIRONMENT}.json")

# Get admin credentials
CREDENTIALS=$(az acr credential show --name "$REGISTRY_NAME" --query '{username: username, password: passwords[0].value}' --output json)
USERNAME=$(echo "$CREDENTIALS" | jq -r '.username')
PASSWORD=$(echo "$CREDENTIALS" | jq -r '.password')

# Store in Key Vault
az keyvault secret set --vault-name "$KEY_VAULT_NAME" --name "acr-login-server" --value "$LOGIN_SERVER" --output none
az keyvault secret set --vault-name "$KEY_VAULT_NAME" --name "acr-username" --value "$USERNAME" --output none
az keyvault secret set --vault-name "$KEY_VAULT_NAME" --name "acr-password" --value "$PASSWORD" --output none

log_success "Registry credentials stored in Key Vault"

# Clean up
rm -f container-registry-deploy.bicep

# Display next steps
log_success "Container Registry deployment complete!"
echo ""
log_info "📋 Next Steps:"
log_info "1. Login to your container registry:"
echo "   az acr login --name $REGISTRY_NAME"
echo ""
log_info "2. Push your first image:"
echo "   docker tag your-image:tag $LOGIN_SERVER/your-image:tag"
echo "   docker push $LOGIN_SERVER/your-image:tag"
echo ""
log_info "3. Registry credentials are stored in Key Vault:"
echo "   - acr-login-server"
echo "   - acr-username" 
echo "   - acr-password"
echo ""
log_info "4. You can now deploy your containerized applications using this registry"
