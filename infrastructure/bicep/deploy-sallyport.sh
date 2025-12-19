#!/bin/bash

# Sallyport Client Deployment Script
# This script deploys the complete infrastructure for Sallyport client

set -e  # Exit on error

CLIENT_NAME="sallyport"
PARAMETERS_FILE="parameters.sallyport.json"

echo "========================================="
echo "SALLYPORT CLIENT DEPLOYMENT"
echo "========================================="
echo "Client: $CLIENT_NAME"
echo "Parameters: $PARAMETERS_FILE"
echo ""

# Verify parameters file exists
if [ ! -f "$PARAMETERS_FILE" ]; then
    echo "❌ Error: Parameters file $PARAMETERS_FILE not found!"
    exit 1
fi

echo "✅ Parameters file found: $PARAMETERS_FILE"
echo ""

# Step 1: Deploy Core Infrastructure
echo "Step 1: Deploying Core Infrastructure..."
echo "-----------------------------------------"
./scripts/deploy-core.sh $CLIENT_NAME

# Step 2: Deploy Storage
echo ""
echo "Step 2: Deploying Storage..."
echo "-----------------------------------------"
./scripts/deploy-storage.sh $CLIENT_NAME

# Step 3: Deploy OpenAI Services
echo ""
echo "Step 3: Deploying OpenAI Services..."
echo "-----------------------------------------"
./scripts/deploy-openai.sh $CLIENT_NAME

# Step 4: Deploy Cosmos MongoDB
echo ""
echo "Step 4: Deploying Cosmos MongoDB..."
echo "-----------------------------------------"
./scripts/deploy-cosmos-mongo-robust.sh $CLIENT_NAME

# Step 5: Deploy App Services
echo ""
echo "Step 5: Deploying App Services..."
echo "-----------------------------------------"
./scripts/deploy-appservice-no-openai.sh $CLIENT_NAME

# Step 6: Deploy Container Registry
echo ""
echo "Step 6: Deploying Container Registry..."
echo "-----------------------------------------"
./scripts/deploy-container-registry.sh $CLIENT_NAME

echo ""
echo "========================================="
echo "SALLYPORT INFRASTRUCTURE DEPLOYMENT COMPLETE!"
echo "========================================="
echo ""
echo "Next Steps:"
echo "1. Configure Azure AD redirect URI: https://sallyport-prod-frontend.azurewebsites.net/auth/callback"
echo "2. Deploy PostgreSQL manually (script has issues)"
echo "3. Create vector index in Cosmos DB"
echo "4. Build and deploy application containers"
echo "5. Configure environment variables"
echo ""
echo "Resource Group: sallyport-prod-rg"
echo "Location: eastus"
