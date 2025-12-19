#!/bin/bash
# =============================================================================
# COSMOS POSTGRESQL DEPLOYMENT
# =============================================================================
# Deploys Cosmos DB for PostgreSQL

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
DEPLOYMENT_NAME="studio-postgres-${ENVIRONMENT}-$(date +%Y%m%d-%H%M%S)"

log_header "COSMOS POSTGRESQL DEPLOYMENT"
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

# Also extract customer prefix for consistent naming
CUSTOMER_PREFIX=$(jq -r '.parameters.customerPrefix.value' "$PARAMETERS_FILE")

LOCATION=$(jq -r '.parameters.location.value' "$PARAMETERS_FILE")
ENV=$(jq -r '.parameters.environment.value' "$PARAMETERS_FILE")
POSTGRES_PASSWORD=$(jq -r '.parameters.postgresPassword.value' "$PARAMETERS_FILE")

log_info "Resource Group: $RESOURCE_GROUP"
log_info "Location: $LOCATION"

# Create postgres.bicep template
cat > postgres-deploy.bicep << EOF
targetScope = 'resourceGroup'

param resourcePrefix string = '$RESOURCE_PREFIX'
param location string = '$LOCATION'
param environment string = '$ENV'
param administratorLoginPassword string = '$POSTGRES_PASSWORD'
param databaseName string = 'studio'
param postgresqlVersion string = '16'
param enableGeoBackup bool = false

var commonTags = {
  Environment: environment
  Project: 'studio'
  ManagedBy: 'bicep'
  DeployedBy: 'modular-deployment'
}

// Cosmos PostgreSQL
module cosmosPostgres 'modules/cosmosPostgres.bicep' = {
  name: 'cosmos-postgres-deployment'
  params: {
    resourcePrefix: resourcePrefix
    location: location
    environment: environment
    administratorLoginPassword: administratorLoginPassword
    databaseName: databaseName
    postgresqlVersion: postgresqlVersion
    enableGeoBackup: enableGeoBackup
    tags: commonTags
  }
}

// Store connection string in Key Vault
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: '$KEY_VAULT_NAME'
}

resource postgresConnectionSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'cosmos-postgresql-connection'
  properties: {
    value: cosmosPostgres.outputs.connectionString
  }
}

// Outputs
output connectionString string = cosmosPostgres.outputs.connectionString
output clusterName string = cosmosPostgres.outputs.clusterName
EOF

log_info "Deploying Cosmos PostgreSQL..."
log_warning "This may take 10-15 minutes..."

# Deploy
az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$DEPLOYMENT_NAME" \
  --template-file postgres-deploy.bicep \
  --output table

if [[ $? -eq 0 ]]; then
    log_success "Cosmos PostgreSQL deployed successfully!"
else
    log_error "Cosmos PostgreSQL deployment failed!"
    log_info "Common issues:"
    log_info "- Region capacity limits"
    log_info "- Resource quota exceeded"
    log_info "- Password complexity requirements"
    exit 1
fi

# Save outputs
log_info "Saving deployment outputs..."
az deployment group show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$DEPLOYMENT_NAME" \
  --query 'properties.outputs' \
  --output json > "outputs-postgres-${ENVIRONMENT}.json"

log_success "Outputs saved to: outputs-postgres-${ENVIRONMENT}.json"

# Clean up
rm -f postgres-deploy.bicep

log_success "Cosmos PostgreSQL deployment complete!"
echo "Next: Run ./deploy-cosmos-mongo.sh $ENVIRONMENT"