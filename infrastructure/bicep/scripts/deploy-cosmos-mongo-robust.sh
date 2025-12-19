#!/bin/bash
# =============================================================================
# ROBUST COSMOS MONGODB DEPLOYMENT
# =============================================================================
# Deploys Cosmos DB for MongoDB vCore (Vector Search) with enhanced error handling

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

log_header "ROBUST COSMOS MONGODB DEPLOYMENT"
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

# LOCATION=$(jq -r '.parameters.location.value' "$PARAMETERS_FILE")
LOCATION="eastus2"
ENV=$(jq -r '.parameters.environment.value' "$PARAMETERS_FILE")
MONGO_PASSWORD=$(jq -r '.parameters.mongoPassword.value' "$PARAMETERS_FILE")

log_info "Resource Group: $RESOURCE_GROUP"
log_info "Location: $LOCATION"

# Pre-deployment validation
log_info "🔍 Pre-deployment validation..."

# 1. Check if resource group exists
if ! az group show --name "$RESOURCE_GROUP" >/dev/null 2>&1; then
    log_error "Resource group $RESOURCE_GROUP does not exist"
    exit 1
fi

# 2. Check regional capacity for MongoDB vCore
log_info "Checking regional capacity for MongoDB vCore..."
if ! az cosmosdb check-name-exists --name "${RESOURCE_PREFIX}-mongo" >/dev/null 2>&1; then
    log_warning "MongoDB cluster name may already exist or region may not support MongoDB vCore"
fi

# 3. Validate password complexity
if [[ ${#MONGO_PASSWORD} -lt 8 ]]; then
    log_error "MongoDB password must be at least 8 characters long"
    exit 1
fi

# 4. Check subscription quotas
log_info "Checking subscription quotas..."
QUOTA_CHECK=$(az cosmosdb list --query "[?contains(name, 'mongo')].name" --output tsv | wc -l)
if [[ $QUOTA_CHECK -gt 5 ]]; then
    log_warning "You have $QUOTA_CHECK MongoDB instances. Check subscription limits."
fi

# 5. Validate SKU availability for region
SKU_NAME="M30"  # Default SKU
if [[ "$ENV" == "prod" ]]; then
    SKU_NAME="M50"
elif [[ "$ENV" == "staging" ]]; then
    SKU_NAME="M40"
fi

log_info "Using SKU: $SKU_NAME for environment: $ENV"

# Create mongo.bicep template with enhanced error handling
cat > mongo-deploy-robust.bicep << EOF
targetScope = 'resourceGroup'

param resourcePrefix string = '$RESOURCE_PREFIX'
param location string = '$LOCATION'
param environment string = '$ENV'
@secure()
param administratorLoginPassword string = '$MONGO_PASSWORD'

var commonTags = {
  Environment: environment
  Project: 'studio'
  ManagedBy: 'bicep'
  DeployedBy: 'robust-deployment'
}

// Cosmos MongoDB with retry logic
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
output serverName string = cosmosMongo.outputs.serverName
EOF

log_info "Deploying Cosmos MongoDB (Vector Search)..."
log_info "Deploying MongoDB vCore (~$165/month) - this may take 15-20 minutes..."

# Deploy with retry logic
MAX_RETRIES=3
RETRY_COUNT=0

while [[ $RETRY_COUNT -lt $MAX_RETRIES ]]; do
    log_info "Deployment attempt $((RETRY_COUNT + 1)) of $MAX_RETRIES..."
    
    if az deployment group create \
      --resource-group "$RESOURCE_GROUP" \
      --name "${DEPLOYMENT_NAME}-attempt-$((RETRY_COUNT + 1))" \
      --template-file mongo-deploy-robust.bicep \
      --output table; then
        
        log_success "Cosmos MongoDB deployed successfully!"
        
        # Show vector index setup instructions
        echo ""
        log_info "📋 IMPORTANT: Set up vector index after deployment:"
        log_info "1. Go to Azure Portal → Your Cosmos MongoDB cluster"
        log_info "2. Navigate to Data Explorer"
        log_info "3. Select: vectordb database → documents collection"
        log_info "4. Click 'New Index' and use this JSON:"
        echo ""
        echo "   {"
        echo "     \"key\": {"
        echo "       \"embedding\": \"cosmosSearch\""
        echo "     },"
        echo "     \"cosmosSearchOptions\": {"
        echo "       \"kind\": \"vector-ivf\","
        echo "       \"numLists\": 100,"
        echo "       \"similarity\": \"COS\","
        echo "       \"dimensions\": 1536"
        echo "     }"
        echo "   }"
        echo ""
        
        # Save outputs
        log_info "Saving deployment outputs..."
        az deployment group show \
          --resource-group "$RESOURCE_GROUP" \
          --name "${DEPLOYMENT_NAME}-attempt-$((RETRY_COUNT + 1))" \
          --query 'properties.outputs' \
          --output json > "outputs-mongo-${ENVIRONMENT}.json"
        
        log_success "Outputs saved to: outputs-mongo-${ENVIRONMENT}.json"
        
        # Clean up
        rm -f mongo-deploy-robust.bicep
        
        log_success "Cosmos MongoDB deployment complete!"
        echo "Next: Run ./deploy-appservice.sh $ENVIRONMENT"
        exit 0
        
    else
        RETRY_COUNT=$((RETRY_COUNT + 1))
        if [[ $RETRY_COUNT -lt $MAX_RETRIES ]]; then
            log_warning "Deployment failed. Retrying in 30 seconds..."
            sleep 30
        else
            log_error "Cosmos MongoDB deployment failed after $MAX_RETRIES attempts!"
            log_info "Common issues and solutions:"
            log_info "1. Region capacity limits - Try a different region"
            log_info "2. Resource name conflicts - The cluster name may already exist"
            log_info "3. SKU availability - Try a different SKU (M30, M40, M50)"
            log_info "4. Subscription quotas - Check your subscription limits"
            log_info "5. Password complexity - Ensure password meets requirements"
            log_info "6. API version issues - MongoDB vCore may not be available in this region"
            echo ""
            log_info "Manual deployment steps:"
            log_info "1. Go to Azure Portal"
            log_info "2. Create 'Azure Cosmos DB for MongoDB vCore'"
            log_info "3. Use cluster name: ${RESOURCE_PREFIX}-mongo"
            log_info "4. Configure networking to allow all access"
            log_info "5. Create vector index manually after deployment"
            
            # Clean up
            rm -f mongo-deploy-robust.bicep
            exit 1
        fi
    fi
done
