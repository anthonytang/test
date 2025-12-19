#!/bin/bash
# =============================================================================
# COSMOS MONGODB DEPLOYMENT
# =============================================================================
# Deploys Cosmos DB for MongoDB vCore (Vector Search)

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
DEPLOYMENT_NAME="studio-mongo-${ENVIRONMENT}-$(date +%Y%m%d-%H%M%S)"

log_header "COSMOS MONGODB DEPLOYMENT"
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
ENV=$(jq -r '.parameters.environment.value' "$PARAMETERS_FILE")
MONGO_PASSWORD=$(jq -r '.parameters.mongoPassword.value' "$PARAMETERS_FILE")

log_info "Resource Group: $RESOURCE_GROUP"
log_info "Location: $LOCATION"

# Create mongo.bicep template
cat > mongo-deploy.bicep << EOF
targetScope = 'resourceGroup'

param resourcePrefix string = '$RESOURCE_PREFIX'
param location string = '$LOCATION'
param environment string = '$ENV'
param administratorLoginPassword string = '$MONGO_PASSWORD'

var commonTags = {
  Environment: environment
  Project: 'studio'
  ManagedBy: 'bicep'
  DeployedBy: 'modular-deployment'
}

// Cosmos MongoDB
module cosmosMongo 'modules/cosmosMongo.bicep' = {
  name: 'cosmos-mongo-deployment'
  params: {
    resourcePrefix: resourcePrefix
    location: location
    environment: environment
    administratorLoginPassword: administratorLoginPassword
    tags: commonTags
  }
}

// Store connection string in Key Vault
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: '$KEY_VAULT_NAME'
}

resource mongoConnectionSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'cosmos-mongodb-connection'
  properties: {
    value: cosmosMongo.outputs.connectionString
  }
}

// Outputs
output connectionString string = cosmosMongo.outputs.connectionString
output clusterName string = cosmosMongo.outputs.clusterName
EOF

log_info "Deploying Cosmos MongoDB (Vector Search)..."
log_warning "This is expensive (~$165/month) and may take 15-20 minutes..."

# Confirm deployment
read -p "Continue with MongoDB vCore deployment? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_warning "MongoDB deployment cancelled"
    rm -f mongo-deploy.bicep
    exit 0
fi

# Deploy
az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$DEPLOYMENT_NAME" \
  --template-file mongo-deploy.bicep \
  --output table

if [[ $? -eq 0 ]]; then
    log_success "Cosmos MongoDB deployed successfully!"
    
    # Show vector index setup instructions
    echo ""
    log_info "📋 IMPORTANT: Set up vector index after deployment:"
    log_info "1. Go to Azure Portal → Your Cosmos MongoDB cluster"
    log_info "2. Use MongoDB shell to run:"
    echo "   use vectordb"
    echo "   db.runCommand({"
    echo "     createIndexes: \"documents\","
    echo "     indexes: [{"
    echo "       name: \"vector_index\","
    echo "       key: { embedding: \"cosmosSearch\" },"
    echo "       cosmosSearchOptions: {"
    echo "         kind: \"vector-ivf\","
    echo "         numLists: 100,"
    echo "         similarity: \"COS\","
    echo "         dimensions: 1536"
    echo "       }"
    echo "     }]"
    echo "   })"
    
else
    log_error "Cosmos MongoDB deployment failed!"
    log_info "Common issues:"
    log_info "- Region capacity limits"
    log_info "- Expensive resource quota limits"
    log_info "- Password complexity requirements"
    exit 1
fi

# Save outputs
log_info "Saving deployment outputs..."
az deployment group show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$DEPLOYMENT_NAME" \
  --query 'properties.outputs' \
  --output json > "outputs-mongo-${ENVIRONMENT}.json"

log_success "Outputs saved to: outputs-mongo-${ENVIRONMENT}.json"

# Clean up
rm -f mongo-deploy.bicep

log_success "Cosmos MongoDB deployment complete!"
echo "Next: Run ./deploy-appservice.sh $ENVIRONMENT"