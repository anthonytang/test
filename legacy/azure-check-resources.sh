#!/bin/bash

# Azure Resource Discovery Script
# This script helps identify existing Azure resources for the Studio project

set -e

echo "========================================="
echo "AZURE RESOURCE DISCOVERY"
echo "========================================="
echo ""

# First, ensure we're logged in
echo "Step 1: Checking Azure Login Status"
echo "-----------------------------------------"
az account show || (echo "Not logged in. Running 'az login'..." && az login)

echo ""
echo "Step 2: Current Subscription"
echo "-----------------------------------------"
az account show --query "[name, id]" -o table

echo ""
echo "Step 3: List All Subscriptions"
echo "-----------------------------------------"
az account list --query "[].{Name:name, ID:id, State:state}" -o table

echo ""
echo "Step 4: Set Active Subscription (if needed)"
echo "-----------------------------------------"
echo "Current subscription:"
az account show --query name -o tsv

# Uncomment and modify if you need to switch subscriptions
# az account set --subscription "YOUR_SUBSCRIPTION_NAME_OR_ID"

echo ""
echo "Step 5: List All Resource Groups"
echo "-----------------------------------------"
az group list --query "[].{Name:name, Location:location}" -o table

echo ""
echo "Step 6: List Container Registries"
echo "-----------------------------------------"
echo "Searching for container registries in all resource groups..."
az acr list --query "[].{Name:name, ResourceGroup:resourceGroup, Location:location, LoginServer:loginServer}" -o table 2>/dev/null || echo "No container registries found"

echo ""
echo "Step 7: List App Services (Web Apps)"
echo "-----------------------------------------"
az webapp list --query "[].{Name:name, ResourceGroup:resourceGroup, State:state, URL:defaultHostName}" -o table

echo ""
echo "Step 8: List PostgreSQL Servers"
echo "-----------------------------------------"
echo "Checking for Azure Database for PostgreSQL servers..."
az postgres server list --query "[].{Name:name, ResourceGroup:resourceGroup, Location:location, Version:version}" -o table 2>/dev/null || echo "No PostgreSQL servers found"

echo ""
echo "Checking for Cosmos DB PostgreSQL clusters..."
az cosmosdb list --query "[?kind=='GlobalDocumentDB' || contains(kind, 'Postgres')].{Name:name, ResourceGroup:resourceGroup, Location:location}" -o table 2>/dev/null || echo "No Cosmos DB instances found"

echo ""
echo "Step 9: List Storage Accounts"
echo "-----------------------------------------"
az storage account list --query "[].{Name:name, ResourceGroup:resourceGroup, Location:location}" -o table

echo ""
echo "Step 10: List Cosmos DB Accounts (MongoDB)"
echo "-----------------------------------------"
az cosmosdb list --query "[?kind=='MongoDB'].{Name:name, ResourceGroup:resourceGroup, Location:location}" -o table 2>/dev/null || echo "No MongoDB Cosmos DB found"

echo ""
echo "Step 11: List AI/Cognitive Services"
echo "-----------------------------------------"
az cognitiveservices account list --query "[].{Name:name, ResourceGroup:resourceGroup, Kind:kind, Location:location}" -o table 2>/dev/null || echo "No Cognitive Services found"

echo ""
echo "Step 12: Search for Studio-Related Resources"
echo "-----------------------------------------"
echo "Searching for resources with 'studio' in the name..."
az resource list --query "[?contains(name, 'studio')].{Name:name, Type:type, ResourceGroup:resourceGroup}" -o table

echo ""
echo "========================================="
echo "RESOURCE DISCOVERY COMPLETE"
echo "========================================="
echo ""
echo "Next Steps:"
echo "1. Review the resources listed above"
echo "2. Update the deployment script with correct resource names"
echo "3. Ensure you're using the correct subscription"
echo ""
echo "To switch subscriptions, use:"
echo "  az account set --subscription 'SUBSCRIPTION_NAME_OR_ID'"
echo ""
echo "To create missing resources:"
echo "  Container Registry: az acr create --name YOUR_ACR_NAME --resource-group YOUR_RG --sku Basic"
echo "  App Service Plan: az appservice plan create --name YOUR_PLAN --resource-group YOUR_RG --sku B1 --is-linux"
echo ""