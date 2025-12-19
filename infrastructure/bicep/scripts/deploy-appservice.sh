#!/bin/bash
# =============================================================================
# APP SERVICE DEPLOYMENT (WITHOUT AI FOUNDRY)
# =============================================================================
# Deploys App Service Plan and Web Apps (Frontend + Backend) without AI Foundry dependency

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
DEPLOYMENT_NAME="studio-appservice-${ENVIRONMENT}-$(date +%Y%m%d-%H%M%S)"

log_header "APP SERVICE DEPLOYMENT (NO AI FOUNDRY)"
log_info "Environment: $ENVIRONMENT"

# Check prerequisites
for file in "$PARAMETERS_FILE" "$CORE_OUTPUTS" "$STORAGE_OUTPUTS"; do
    if [[ ! -f "$file" ]]; then
        log_error "Required file not found: $file"
        log_info "Run the prerequisite deployment scripts first"
        exit 1
    fi
done

# Extract values from outputs
RESOURCE_GROUP=$(jq -r '.resourceGroupName.value' "$CORE_OUTPUTS")
KEY_VAULT_NAME=$(jq -r '.keyVaultName.value' "$CORE_OUTPUTS")
RESOURCE_PREFIX=$(jq -r '.resourcePrefix.value' "$CORE_OUTPUTS")
STORAGE_ACCOUNT_NAME=$(jq -r '.storageAccountName.value' "$STORAGE_OUTPUTS")

# Also extract customer prefix for consistent naming
CUSTOMER_PREFIX=$(jq -r '.parameters.customerPrefix.value' "$PARAMETERS_FILE")

# Extract from parameters
LOCATION=$(jq -r '.parameters.location.value' "$PARAMETERS_FILE")
APP_SERVICE_SKU=$(jq -r '.parameters.appServicePlanSku.value' "$PARAMETERS_FILE")
TENANT_ID=$(jq -r '.parameters.tenantId.value' "$PARAMETERS_FILE")
CLIENT_ID=$(jq -r '.parameters.clientId.value' "$PARAMETERS_FILE")

log_info "Resource Group: $RESOURCE_GROUP"
log_info "Storage Account: $STORAGE_ACCOUNT_NAME"
log_warning "AI Foundry: Using placeholder (deploy AI Foundry separately later)"

# Store client secret in Key Vault first
log_info "Storing Azure AD client secret in Key Vault..."
CLIENT_SECRET=$(jq -r '.parameters.clientSecret.value' "$PARAMETERS_FILE")

if [[ -z "$CLIENT_SECRET" || "$CLIENT_SECRET" == "null" ]]; then
    log_error "Client secret not found in parameters file"
    exit 1
fi

az keyvault secret set \
  --vault-name "$KEY_VAULT_NAME" \
  --name "azure-ad-client-secret" \
  --value="$CLIENT_SECRET" \
  --output none

# Create appservice.bicep template
cat > appservice-no-openai.bicep << EOF
targetScope = 'resourceGroup'

param resourcePrefix string = '$RESOURCE_PREFIX'
param location string = '$LOCATION'
param appServicePlanSku string = '$APP_SERVICE_SKU'
param keyVaultName string = '$KEY_VAULT_NAME'
param storageAccountName string = '$STORAGE_ACCOUNT_NAME'
param tenantId string = '$TENANT_ID'
param clientId string = '$CLIENT_ID'

var commonTags = {
  Environment: 'test'
  Project: 'studio'
  ManagedBy: 'bicep'
  DeployedBy: 'modular-deployment-no-aifoundry'
}

// App Service Plan
resource appServicePlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: '\${resourcePrefix}-plan'
  location: location
  tags: commonTags
  sku: {
    name: appServicePlanSku
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

// Frontend Web App (Next.js)
resource frontendApp 'Microsoft.Web/sites@2023-01-01' = {
  name: '\${resourcePrefix}-frontend'
  location: location
  tags: commonTags
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    clientAffinityEnabled: false
    publicNetworkAccess: 'Enabled'
    siteConfig: {
      linuxFxVersion: 'NODE|18-lts'
      alwaysOn: appServicePlanSku != 'B1'
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      httpLoggingEnabled: true
      detailedErrorLoggingEnabled: true
      requestTracingEnabled: true
      appSettings: [
        {
          name: 'NEXT_PUBLIC_AZURE_AD_CLIENT_ID'
          value: clientId
        }
        {
          name: 'NEXT_PUBLIC_AZURE_AD_TENANT_ID'
          value: tenantId
        }
        {
          name: 'NEXT_PUBLIC_AZURE_AD_AUTHORITY'
          value: '\${az.environment().authentication.loginEndpoint}\${tenantId}'
        }
        {
          name: 'NODE_ENV'
          value: 'production'
        }
        {
          name: 'WEBSITES_PORT'
          value: '3000'
        }
        {
          name: 'PORT'
          value: '3000'
        }
      ]
    }
  }
  identity: {
    type: 'SystemAssigned'
  }
}

// Backend Web App (FastAPI/Python)
resource backendApp 'Microsoft.Web/sites@2023-01-01' = {
  name: '\${resourcePrefix}-backend'
  location: location
  tags: commonTags
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    clientAffinityEnabled: false
    publicNetworkAccess: 'Enabled'
    siteConfig: {
      linuxFxVersion: 'PYTHON|3.11'
      alwaysOn: appServicePlanSku != 'B1'
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      httpLoggingEnabled: true
      detailedErrorLoggingEnabled: true
      requestTracingEnabled: true
      cors: {
        allowedOrigins: [
          'https://\${resourcePrefix}-frontend.azurewebsites.net'
        ]
        supportCredentials: true
      }
      appSettings: [
        {
          name: 'AZURE_STORAGE_ACCOUNT_NAME'
          value: storageAccountName
        }
        {
          name: 'AZURE_STORAGE_CONNECTION_STRING'
          value: '@Microsoft.KeyVault(VaultName=\${keyVaultName};SecretName=storage-connection-string)'
        }
        {
          name: 'AZURE_AD_TENANT_ID'
          value: tenantId
        }
        {
          name: 'AZURE_AD_CLIENT_ID'
          value: clientId
        }
        {
          name: 'AZURE_AD_CLIENT_SECRET'
          value: '@Microsoft.KeyVault(VaultName=\${keyVaultName};SecretName=azure-ad-client-secret)'
        }
        {
          name: 'PORT'
          value: '8000'
        }
        {
          name: 'WEBSITES_PORT'
          value: '8000'
        }
        {
          name: 'PYTHONPATH'
          value: '/app'
        }
        {
          name: 'PYTHONUNBUFFERED'
          value: '1'
        }
      ]
      appCommandLine: 'uvicorn server:app --host 0.0.0.0 --port 8000'
    }
  }
  identity: {
    type: 'SystemAssigned'
  }
}

// Outputs
output frontendUrl string = 'https://\${frontendApp.name}.azurewebsites.net'
output backendUrl string = 'https://\${backendApp.name}.azurewebsites.net'
output appServicePlanName string = appServicePlan.name
output frontendName string = frontendApp.name
output backendName string = backendApp.name
EOF

log_info "Deploying App Service Plan and Web Apps..."
log_warning "This may take 5-10 minutes..."

# Deploy
az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$DEPLOYMENT_NAME" \
  --template-file appservice-no-openai.bicep \
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
    log_info "2. Deploy AI Foundry service separately when ready"
    log_info "3. Upload application code using containers or deployment center"
    log_info "4. Test endpoints:"
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

# Clean up
rm -f appservice-no-openai.bicep

log_success "App Service deployment complete!"
echo ""
echo "🎉 Core infrastructure ready for your application!"
echo "Deploy AI Foundry separately when the API issues are resolved."