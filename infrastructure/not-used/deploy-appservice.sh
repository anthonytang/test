#!/bin/bash
# =============================================================================
# APP SERVICE DEPLOYMENT
# =============================================================================
# Deploys App Service Plan and Web Apps (Frontend + Backend)

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
STORAGE_OUTPUTS="outputs-storage-${ENVIRONMENT}.json"
AIFOUNDRY_OUTPUTS="outputs-aifoundry-${ENVIRONMENT}.json"
DEPLOYMENT_NAME="studio-appservice-${ENVIRONMENT}-$(date +%Y%m%d-%H%M%S)"

log_header "APP SERVICE DEPLOYMENT"
log_info "Environment: $ENVIRONMENT"

# Check prerequisites
for file in "$PARAMETERS_FILE" "$CORE_OUTPUTS" "$STORAGE_OUTPUTS"; do
    if [[ ! -f "$file" ]]; then
        log_error "Required file not found: $file"
        log_info "Run the prerequisite deployment scripts first"
        exit 1
    fi
done

# Skip AI Foundry for now to avoid API issues
log_warning "Deploying without AI Foundry integration to avoid Azure API issues"
AIFOUNDRY_ENDPOINT="https://placeholder-aifoundry.cognitiveservices.azure.com/"
HAS_AI_FOUNDRY=false

# Extract values from outputs
RESOURCE_GROUP=$(jq -r '.resourceGroupName.value' "$CORE_OUTPUTS")
KEY_VAULT_NAME=$(jq -r '.keyVaultName.value' "$CORE_OUTPUTS")
RESOURCE_PREFIX=$(jq -r '.resourcePrefix.value' "$CORE_OUTPUTS")
STORAGE_ACCOUNT_NAME=$(jq -r '.storageAccountName.value' "$STORAGE_OUTPUTS")

# Extract from parameters
LOCATION=$(jq -r '.parameters.location.value' "$PARAMETERS_FILE")
APP_SERVICE_SKU=$(jq -r '.parameters.appServicePlanSku.value' "$PARAMETERS_FILE")
TENANT_ID=$(jq -r '.parameters.tenantId.value' "$PARAMETERS_FILE")
CLIENT_ID=$(jq -r '.parameters.clientId.value' "$PARAMETERS_FILE")

log_info "Resource Group: $RESOURCE_GROUP"
log_info "Storage Account: $STORAGE_ACCOUNT_NAME"
log_warning "AI Foundry: Disabled to avoid Azure API conflicts"

# Store client secret in Key Vault first
log_info "Storing Azure AD client secret in Key Vault..."
CLIENT_SECRET=$(jq -r '.parameters.clientSecret.value' "$PARAMETERS_FILE")

# Validate client secret was extracted
if [[ -z "$CLIENT_SECRET" || "$CLIENT_SECRET" == "null" ]]; then
    log_error "Client secret not found in parameters file"
    exit 1
fi

az keyvault secret set \
  --vault-name "$KEY_VAULT_NAME" \
  --name "azure-ad-client-secret" \
  --value="$CLIENT_SECRET" \
  --output none

log_info "Deploying App Service Plan and Web Apps..."
log_warning "This may take 5-10 minutes..."

# Deploy directly using the module to avoid template generation issues
az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$DEPLOYMENT_NAME" \
  --template-file modules/appService.bicep \
  --parameters \
    resourcePrefix="$RESOURCE_PREFIX" \
    location="$LOCATION" \
    appServicePlanSku="$APP_SERVICE_SKU" \
    keyVaultName="$KEY_VAULT_NAME" \
    storageAccountName="$STORAGE_ACCOUNT_NAME" \
    openaiEndpoint="$AIFOUNDRY_ENDPOINT" \
    tenantId="$TENANT_ID" \
    clientId="$CLIENT_ID" \
    appInsightsInstrumentationKey="" \
    appInsightsConnectionString="" \
    hasAifoundry=false \
  --output table

if [[ $? -eq 0 ]]; then
    log_success "App Service deployed successfully!"
    
    # Get URLs from deployment
    FRONTEND_URL=$(az deployment group show --resource-group "$RESOURCE_GROUP" --name "$DEPLOYMENT_NAME" --query 'properties.outputs.frontendUrl.value' --output tsv)
    BACKEND_URL=$(az deployment group show --resource-group "$RESOURCE_GROUP" --name "$DEPLOYMENT_NAME" --query 'properties.outputs.backendUrl.value' --output tsv)
    
    echo ""
    log_success "🌐 Application URLs:"
    log_success "Frontend: $FRONTEND_URL"
    log_success "Backend:  $BACKEND_URL"
    
    echo ""
    log_info "📋 Next Steps:"
    log_info "1. Configure Azure AD redirect URI: $FRONTEND_URL/auth/callback"
    log_info "2. Upload application code using containers or deployment center"
    log_info "3. Test endpoints:"
    log_info "   - Frontend: $FRONTEND_URL"
    log_info "   - Backend health: $BACKEND_URL/health"
    log_info "   - Backend API docs: $BACKEND_URL/docs"
    
else
    log_error "App Service deployment failed!"
    exit 1
fi

# Save outputs
log_info "Saving deployment outputs..."
az deployment group show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$DEPLOYMENT_NAME" \
  --query 'properties.outputs' \
  --output json > "outputs-appservice-${ENVIRONMENT}.json"

log_success "Outputs saved to: outputs-appservice-${ENVIRONMENT}.json"


log_success "App Service deployment complete!"
echo ""
echo "🎉 All core infrastructure deployed!"
echo "Use ./deploy-all.sh $ENVIRONMENT for full orchestrated deployment next time."