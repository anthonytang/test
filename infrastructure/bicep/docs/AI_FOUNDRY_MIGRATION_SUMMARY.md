# Azure AI Foundry Migration Summary

## Overview
This document summarizes the migration from Azure OpenAI Service to Azure AI Foundry Service in the Studio infrastructure deployment.

## What Changed

### 1. Service Type Migration
- **Before**: Traditional Azure OpenAI Service (`Microsoft.CognitiveServices/accounts@2023-05-01` with `kind: 'OpenAI'`)
- **After**: Azure AI Foundry Service (`Microsoft.CognitiveServices/accounts@2025-04-01-preview` with `kind: 'AIServices'`)

### 2. Model Deployments
The following 5 models are now deployed under Azure AI Foundry:

| Model | Version | SKU | Capacity |
|-------|---------|-----|----------|
| gpt-4o | 2024-11-20 | GlobalStandard | 1 |
| gpt-4o-mini | 2024-07-18 | GlobalStandard | 1 |
| gpt-5-chat | 2025-08-07 | GlobalStandard | 1 |
| o1 | 2024-12-17 | GlobalStandard | 1 |
| text-embedding-3-small | 1 | GlobalStandard | 1 |

### 3. New AI Foundry Features
- **Project Management**: `allowProjectManagement: true` enables project-based development
- **System-Assigned Identity**: Both the AI Foundry service and project have managed identities
- **Custom Subdomain**: Developer API endpoint via custom subdomain
- **Local Auth Disabled**: Enhanced security with `disableLocalAuth: true`

### 4. Project Structure
- **AI Foundry Service**: Main service container
- **AI Project**: Development project for organizing models and resources
- **Model Deployments**: Individual model instances under the service

## Files Modified

### Core Infrastructure
- `modules/openai.bicep` - Complete rewrite for AI Foundry
- `main.bicep` - Updated module call and removed unused parameters
- `parameters.*.json` - Removed OpenAI-specific parameters

### Documentation
- `README.md` - Updated service descriptions
- `MODULAR_DEPLOYMENT_GUIDE.md` - Updated service references
- `DEPLOYMENT_SESSION_DOCUMENTATION.md` - Updated service references

## Deployment Details

### Resource Naming
- **AI Foundry Service**: `{resourcePrefix}-aifoundry`
- **AI Project**: `{resourcePrefix}-aifoundry-proj`
- **Models**: Individual deployment names (gpt-4o, gpt-4o-mini, etc.)

### API Endpoints
- **Service Endpoint**: Available via `openai.outputs.endpoint`
- **API Key**: Available via `openai.outputs.apiKey`
- **Project ID**: Available via `openai.outputs.projectId`

## Benefits of Migration

1. **Latest Models**: Access to GPT-5, O1, and latest GPT-4o variants
2. **Project Management**: Better organization and RBAC for development teams
3. **Enhanced Security**: System-assigned identities and disabled local auth
4. **Future-Proof**: Uses latest API versions and service capabilities
5. **Cost Optimization**: GlobalStandard SKU with capacity-based pricing

## Deployment Commands

```bash
# Navigate to bicep directory
cd infrastructure/bicep

# Deploy using test parameters
./scripts/deploy.sh test-run

# Or deploy to specific environment
./scripts/deploy.sh dev
```

## Notes
- The module name remains `openai` for backward compatibility
- All existing outputs are preserved (endpoint, apiKey)
- New outputs added: projectId, projectName
- Resource group: `testrun-studio-dev-rg` (from test-run parameters)
