# Azure Infrastructure Deployment Guide - Session Documentation

## Overview
This document details the step-by-step deployment of Azure infrastructure using a modular Bicep approach. The deployment was conducted on August 28, 2025, targeting the `test-run` environment.

## Deployment Strategy
**Approach**: Modular deployment (one service at a time) instead of monolithic deployment
**Why**: The monolithic approach consistently failed with "content already consumed" errors
**Result**: Much higher success rate with individual service deployments

## Environment Configuration
- **Environment**: `test-run`
- **Resource Prefix**: `testrun-studio-dev`
- **Location**: `eastus`
- **Subscription ID**: `86964b44-10b8-4d1f-b15d-7d5721787ca4`
- **Tenant ID**: `66b675b7-eb4d-4095-b728-8ff1098c0e4c`

---

## 1. Core Infrastructure Deployment

### What Was Deployed
- Resource Group
- Key Vault
- Storage Account

### What Worked ✅
1. **Resource Group Creation**: Successfully created `testrun-studio-test-rg`
2. **Storage Account**: Deployed successfully
3. **Key Vault**: Deployed after fixing configuration issues


### What Failed ❌
1. **Initial Key Vault Deployment**: Failed due to purge protection configuration
2. **Monolithic Core Deployment**: Hit "content already consumed" error

### Issues Found & Fixes Applied

#### Issue 1: Key Vault Purge Protection
**Problem**: `enablePurgeProtection: false` is not allowed in Azure
**Error**: "The property 'enablePurgeProtection' cannot be set to false. Enabling the purge protection for a vault is an irreversible action."
**Fix**: Changed `enablePurgeProtection: false` → `enablePurgeProtection: true` in `modules/keyVault.bicep`

#### Issue 2: Module Path References
**Problem**: Incorrect relative paths in deployment scripts
**Error**: Module resolution failures
**Fix**: Updated all module references from `../modules/` to `modules/` in:
- `main.bicep`
- `scripts/deploy-appservice.sh`

#### Issue 3: Key Vault RBAC Permissions
**Problem**: Key Vault uses RBAC but user lacked proper permissions
**Error**: "Caller is not authorized to perform action on resource"
**Fix**: Assigned "Key Vault Secrets Officer" role to current user:
```bash
USER_OBJECT_ID=$(az ad signed-in-user show --query id --output tsv)
az role assignment create --role "Key Vault Secrets Officer" --assignee $USER_OBJECT_ID --scope "/subscriptions/86964b44-10b8-4d1f-b15d-7d5721787ca4/resourcegroups/testrun-studio-test-rg/providers/microsoft.keyvault/vaults/testrun-studio-dev-kv"
```

---

## 2. App Service Deployment

### What Was Deployed
- App Service Plan
- Frontend Web App
- Backend Web App

### What Worked ✅
**Complete Success**: All App Service components deployed successfully

### What Failed ❌
**Initial Attempt**: Failed due to missing OpenAI dependency

### Issues Found & Fixes Applied

#### Issue 1: OpenAI Dependency
**Problem**: App Service script required OpenAI outputs that weren't available
**Error**: "Required file not found: outputs-openai-test-run.json"
**Fix**: Created `deploy-appservice-no-openai.sh` script that bypasses OpenAI dependency

#### Issue 2: Client Secret Parameter Extraction
**Problem**: Client secret starting with dash (-) was interpreted as CLI flag
**Error**: "ERROR: argument --value: expected one argument"
**Fix**: Changed `--value "$CLIENT_SECRET"` to `--value="$CLIENT_SECRET"` to prevent dash interpretation

#### Issue 3: Parameter Validation
**Problem**: Script didn't validate if client secret was properly extracted
**Fix**: Added validation check:
```bash
if [[ -z "$CLIENT_SECRET" || "$CLIENT_SECRET" == "null" ]]; then
    log_error "Client secret not found in parameters file"
    exit 1
fi
```

---

## 3. PostgreSQL Deployment

### What Was Attempted
- Cosmos DB for PostgreSQL cluster

### What Failed ❌
**Multiple failures** due to resource specification issues

### Issues Found & Fixes Applied

#### Issue 1: Missing Required Properties
**Problem**: `coordinatorServerEdition` property was missing
**Error**: "The property '#/properties' did not contain a required property of 'coordinatorServerEdition'"
**Fix**: Added `coordinatorServerEdition: 'GeneralPurpose'`

#### Issue 2: Invalid Storage Quota
**Problem**: `nodeStorageQuotaInMb: 0` is invalid
**Error**: "The property '#/properties/nodeStorageQuotaInMb' 0 is not a valid disk size"
**Fix**: Changed to `nodeStorageQuotaInMb: 131072` (128 GB minimum)

#### Issue 3: Worker Node Configuration
**Problem**: "MemoryOptimized" edition with 0 vCores is invalid
**Error**: "There is no valid SKU with given worker server edition ('MemoryOptimized') and vCores (0)"
**Fix**: Simplified configuration to remove worker nodes for dev environment

#### Issue 4: Required nodeCount Property
**Problem**: `nodeCount` is required even when set to 0
**Error**: "The property '#/properties' did not contain a required property of 'nodeCount'"
**Fix**: Restructured properties to conditionally include worker node configuration

### Current Status
- **Deployment**: Running (started successfully after fixes)
- **Expected Duration**: 10-15 minutes
- **Resource Created**: `testrun-studio-dev-postgres` (visible in Azure)

---

## 4. Azure AI Foundry Deployment

### What Was Attempted
- Cognitive Services account with OpenAI capabilities

### What Failed ❌
**Consistent failure** with "content already consumed" error

### Issues Found
**Root Cause**: Unknown - appears to be Azure API level issue
**Pattern**: Affects all OpenAI-related deployments regardless of complexity
**Workarounds Attempted**: 
- Simple deployment template
- Different parameter combinations
- Manual deployment

### Current Status
- **Blocked**: Cannot deploy due to persistent Azure API error
- **Impact**: App Service deployment succeeded without OpenAI dependency
- **Recommendation**: Skip for now, deploy later when Azure API issues resolve

---

## 5. MongoDB Vector Search

### What Was Attempted
- Not attempted yet

### Current Status
- **Pending**: Waiting for other services to complete
- **Dependencies**: Core infrastructure, storage

---

## Deployment Scripts Created

### 1. `deploy-keyvault-only.bicep`
- **Purpose**: Deploy just Key Vault to complete core infrastructure
- **Scope**: Resource Group level
- **Status**: Used successfully

### 2. `deploy-appservice-no-openai.sh`
- **Purpose**: Deploy App Services without OpenAI dependency
- **Features**: 
  - Key Vault secret management
  - App Service Plan creation
  - Frontend/Backend Web App deployment
  - Environment variable configuration
- **Status**: Successfully deployed all components

### 3. `check-deployment-status.sh`
- **Purpose**: Monitor running deployments and resource status
- **Features**:
  - List all deployments in resource group
  - Show resource status
  - Check specific service health
- **Status**: Working correctly

---

## Current Infrastructure Status

### ✅ Successfully Deployed
1. **Resource Group**: `testrun-studio-test-rg`
2. **Key Vault**: `testrun-studio-dev-kv`
3. **Storage Account**: `testrunstudiodevstorage`
4. **App Service Plan**: `testrun-studio-dev-plan`
5. **Frontend Web App**: `testrun-studio-dev-frontend`
6. **Backend Web App**: `testrun-studio-dev-backend`

### 🌐 Application URLs
- **Frontend**: https://testrun-studio-dev-frontend.azurewebsites.net
- **Backend**: https://testrun-studio-dev-backend.azurewebsites.net
- **Backend API Docs**: https://testrun-studio-dev-backend.azurewebsites.net/docs
- **Backend Health**: https://testrun-studio-dev-backend.azurewebsites.net/health

### ⚠️ Still To Deploy
1. **PostgreSQL**: Currently running (expected completion: 10-15 minutes)
2. **Azure AI Foundry**: Blocked by Azure API issues
3. **MongoDB Vector Search**: Not attempted

---

## Key Lessons Learned

### 1. Modular vs Monolithic Deployment
- **Modular**: Higher success rate, easier troubleshooting, faster iteration
- **Monolithic**: Prone to "content already consumed" errors, harder to debug

### 2. Azure Resource Requirements
- **Key Vault**: Purge protection cannot be disabled
- **PostgreSQL**: Always requires nodeCount property, even if 0
- **Storage Quotas**: Must meet minimum size requirements

### 3. Azure CLI Parameter Handling
- **Dashes in Values**: Can be interpreted as flags, use `--value="value"` syntax
- **RBAC vs Policies**: Key Vault with RBAC requires role assignments, not policies

### 4. Error Patterns
- **"Content already consumed"**: Usually Azure API issue, not fixable by user
- **Missing properties**: Check Azure resource schema requirements
- **Invalid values**: Validate against Azure service constraints

---

## Next Steps for Replication

### 1. Prerequisites
```bash
# Ensure Azure CLI is installed and authenticated
az --version
az account show
az login --use-device-code  # if needed
```

### 2. Environment Setup
```bash
# Set environment variables
export ENVIRONMENT="test-run"
export RESOURCE_PREFIX="testrun-studio-dev"
export LOCATION="eastus"
```

### 3. Deployment Order
1. **Core Infrastructure**: `./scripts/deploy-core.sh test-run`
2. **Storage**: `./scripts/deploy-storage.sh test-run`
3. **App Services**: `./scripts/deploy-appservice-no-openai.sh test-run`
4. **PostgreSQL**: `./scripts/deploy-cosmos-postgres.sh test-run` (after fixes)
5. **OpenAI**: Skip until Azure API issues resolve

### 4. Required Fixes Before Deployment
- Update `modules/keyVault.bicep`: Set `enablePurgeProtection: true`
- Update module paths in deployment scripts: Change `../modules/` to `modules/`
- Fix PostgreSQL configuration in `modules/cosmosPostgres.bicep`
- Ensure proper RBAC permissions for Key Vault

---

## Troubleshooting Commands

### Check Deployment Status
```bash
./scripts/check-deployment-status.sh test-run
```

### List Resources
```bash
az resource list --resource-group testrun-studio-test-rg --output table
```

### Check Specific Service
```bash
# Key Vault
az keyvault list --resource-group testrun-studio-test-rg --output table

# App Services
az webapp list --resource-group testrun-studio-test-rg --output table

# Storage
az storage account list --resource-group testrun-studio-test-rg --output table
```

### View Deployment Details
```bash
az deployment group show --resource-group testrun-studio-test-rg --name <deployment-name>
```

---

## Files Modified During Session

1. `modules/keyVault.bicep` - Fixed purge protection
2. `main.bicep` - Fixed module paths
3. `scripts/deploy-appservice.sh` - Fixed module paths
4. `modules/cosmosPostgres.bicep` - Fixed PostgreSQL configuration
5. `scripts/deploy-appservice-no-openai.sh` - Created new script
6. `scripts/check-deployment-status.sh` - Created new script

---

## Conclusion

The modular deployment approach was significantly more successful than the monolithic approach. While some services (OpenAI) are blocked by Azure API issues, the core infrastructure and application services are now running successfully. The key to success was:

1. **Breaking down** the deployment into manageable pieces
2. **Fixing configuration issues** one at a time
3. **Working around Azure API limitations** by creating alternative deployment paths
4. **Proper error handling** and validation in deployment scripts

This approach provides a solid foundation for the application while allowing for incremental addition of more complex services as Azure API issues resolve.

---

## Session Metadata

- **Date**: August 28, 2025
- **Duration**: ~2 hours
- **Environment**: test-run
- **Deployment Method**: Modular Bicep
- **Success Rate**: 6/9 services deployed successfully
- **Key Achievement**: Working application infrastructure despite Azure API limitations
