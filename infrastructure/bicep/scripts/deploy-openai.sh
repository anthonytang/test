#!/bin/bash
# =============================================================================
# AZURE AI FOUNDRY DEPLOYMENT
# =============================================================================
# Deploys Azure AI Foundry Service with models and project

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
DEPLOYMENT_NAME="studio-aifoundry-${ENVIRONMENT}-$(date +%Y%m%d-%H%M%S)"

log_header "AZURE AI FOUNDRY DEPLOYMENT"
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

# Extract values
RESOURCE_GROUP=$(jq -r '.resourceGroupName.value' "$CORE_OUTPUTS")
KEY_VAULT_NAME=$(jq -r '.keyVaultName.value' "$CORE_OUTPUTS")
RESOURCE_PREFIX=$(jq -r '.resourcePrefix.value' "$CORE_OUTPUTS")

LOCATION=$(jq -r '.parameters.location.value' "$PARAMETERS_FILE")

log_info "Resource Group: $RESOURCE_GROUP"
log_info "Location: $LOCATION"
log_info "Resource Prefix: $RESOURCE_PREFIX"

# Create aifoundry-deploy.bicep template
cat > aifoundry-deploy.bicep << EOF
targetScope = 'resourceGroup'

param resourcePrefix string = '$RESOURCE_PREFIX'
param location string = '$LOCATION'

var commonTags = {
  Environment: '$ENVIRONMENT'
  Project: 'studio'
  ManagedBy: 'bicep'
  DeployedBy: 'modular-deployment'
}

// AI Foundry Service
module aifoundry 'modules/openai.bicep' = {
  name: 'aifoundry-deployment'
  params: {
    resourcePrefix: resourcePrefix
    location: location
    tags: commonTags
  }
}



// Outputs
output endpoint string = aifoundry.outputs.endpoint

output projectId string = aifoundry.outputs.projectId
output projectName string = aifoundry.outputs.projectName
output serviceName string = aifoundry.outputs.serviceName
EOF

log_info "Deploying Azure AI Foundry service..."
log_warning "This may take 10-15 minutes due to model deployments and project creation..."

# Deploy
# Deploy (async) – don't block until completion
az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$DEPLOYMENT_NAME" \
  --template-file aifoundry-deploy.bicep \
  --no-wait

log_info "Deployment started. Waiting for completion..."

# Poll deployment state ourselves to avoid long read timeouts inside a single request
MAX_WAIT_SECONDS=3600   # up to 60 minutes total
SLEEP_SECONDS=30
START_TIME=$(date +%s)

while true; do
  NOW=$(date +%s)
  ELAPSED=$((NOW - START_TIME))

  if (( ELAPSED > MAX_WAIT_SECONDS )); then
    log_error "Azure AI Foundry deployment did not finish within $MAX_WAIT_SECONDS seconds."
    exit 1
  fi

  # Get provisioningState; don't let transient errors break the loop
  STATE=$(az deployment group show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$DEPLOYMENT_NAME" \
    --query "properties.provisioningState" \
    -o tsv 2>/dev/null || echo "Unknown")

  if [[ "$STATE" == "Succeeded" ]]; then
    log_success "Azure AI Foundry deployed successfully!"
    break
  elif [[ "$STATE" == "Failed" ]]; then
    log_error "Azure AI Foundry deployment failed. Fetching error details..."
    az deployment group show \
      --resource-group "$RESOURCE_GROUP" \
      --name "$DEPLOYMENT_NAME" \
      --query "properties.error" \
      -o json
    exit 1
  else
    log_info "Current deployment state: $STATE (elapsed ${ELAPSED}s). Waiting ${SLEEP_SECONDS}s..."
    sleep "$SLEEP_SECONDS"
  fi
done


if [[ $? -eq 0 ]]; then
    log_success "Azure AI Foundry deployed successfully!"
else
    log_error "Azure AI Foundry deployment failed!"
    log_info "Common issues:"
    log_info "- AI Foundry service not available in region"
    log_info "- Quota limits reached"
    log_info "- Model deployment conflicts"
    log_info "- Insufficient permissions for project creation"
    exit 1
fi

# Save outputs
log_info "Saving deployment outputs..."
az deployment group show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$DEPLOYMENT_NAME" \
  --query 'properties.outputs' \
  --output json > "outputs-aifoundry-${ENVIRONMENT}.json"

log_success "Outputs saved to: outputs-aifoundry-${ENVIRONMENT}.json"

# Store secrets in Key Vault
log_info "Storing AI Foundry secrets in Key Vault..."

# Get the AI Foundry service name from outputs
AIFOUNDRY_SERVICE_NAME=$(jq -r '.serviceName.value' "outputs-aifoundry-${ENVIRONMENT}.json")
AIFOUNDRY_ENDPOINT=$(jq -r '.endpoint.value' "outputs-aifoundry-${ENVIRONMENT}.json")
AIFOUNDRY_PROJECT_ID=$(jq -r '.projectId.value' "outputs-aifoundry-${ENVIRONMENT}.json")

# Get the API key from the AI Foundry service
log_info "Retrieving API key from AI Foundry service..."
AIFOUNDRY_API_KEY=$(az cognitiveservices account keys list \
  --name "$AIFOUNDRY_SERVICE_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query 'key1' \
  --output tsv)

if [[ -z "$AIFOUNDRY_API_KEY" ]]; then
    log_error "Failed to retrieve API key from AI Foundry service"
    exit 1
fi

# Store secrets in Key Vault
log_info "Storing API key in Key Vault..."
az keyvault secret set \
  --vault-name "$KEY_VAULT_NAME" \
  --name "azure-aifoundry-api-key" \
  --value "$AIFOUNDRY_API_KEY" \
  --output none

log_info "Storing endpoint in Key Vault..."
az keyvault secret set \
  --vault-name "$KEY_VAULT_NAME" \
  --name "azure-aifoundry-endpoint" \
  --value "$AIFOUNDRY_ENDPOINT" \
  --output none

log_info "Storing project ID in Key Vault..."
az keyvault secret set \
  --vault-name "$KEY_VAULT_NAME" \
  --name "azure-aifoundry-project-id" \
  --value "$AIFOUNDRY_PROJECT_ID" \
  --output none

log_success "All secrets stored in Key Vault successfully!"

# Display deployment summary
log_header "DEPLOYMENT SUMMARY"
log_info "Service Name: $(jq -r '.serviceName.value' "outputs-aifoundry-${ENVIRONMENT}.json")"
log_info "Project Name: $(jq -r '.projectName.value' "outputs-aifoundry-${ENVIRONMENT}.json")"
log_info "Endpoint: $(jq -r '.endpoint.value' "outputs-aifoundry-${ENVIRONMENT}.json")"
log_info "Project ID: $(jq -r '.projectId.value' "outputs-aifoundry-${ENVIRONMENT}.json")"

# Clean up
rm -f aifoundry-deploy.bicep

log_success "Azure AI Foundry deployment complete!"
echo "Next: Run ./deploy-cosmos-postgres.sh $ENVIRONMENT"