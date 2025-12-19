# Studio Infrastructure Deployment Guide

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Architecture](#architecture)
4. [Pre-deployment Setup](#pre-deployment-setup)
5. [Deployment Options](#deployment-options)
6. [Step-by-Step Deployment](#step-by-step-deployment)
7. [Post-Deployment Configuration](#post-deployment-configuration)
8. [Troubleshooting](#troubleshooting)
9. [Rollback Procedures](#rollback-procedures)
10. [Cost Optimization](#cost-optimization)
11. [Security Considerations](#security-considerations)
12. [Monitoring and Maintenance](#monitoring-and-maintenance)

## Overview

This guide provides comprehensive instructions for deploying the Studio infrastructure stack to Azure using Infrastructure as Code (IaC) with Terraform. The Studio platform is a full-stack investment banking analyst AI tool that includes:

- **Frontend**: NextJS application deployed as Azure App Service
- **Backend**: Python FastAPI deployed as Azure App Service
- **Databases**: Azure Cosmos DB for PostgreSQL and MongoDB vCore
- **Storage**: Azure Blob Storage for file management
- **AI Services**: Azure OpenAI for AI capabilities
- **Security**: Azure Key Vault and Managed Identities
- **Monitoring**: Application Insights and Log Analytics

## Prerequisites

### Required Tools

- **Azure CLI** (version 2.0.0 or higher)
- **Terraform** (version 1.0.0 or higher)
- **PowerShell 7.0+** (for Windows) or **Bash 4.0+** (for Linux/Mac)
- **jq** (for JSON parsing in Bash scripts)

### Required Azure Resources

- **Azure Subscription** with active billing
- **Azure AD Tenant** with administrative access
- **Resource Provider Registration** for required services

### Required Permissions

- **Contributor** or **Owner** role on the target subscription
- **Application Administrator** role for Azure AD app registration
- **Global Administrator** role (if creating new Azure AD applications)

### Azure Service Quotas

Ensure your subscription has sufficient quotas for:
- App Service Plans (Premium v3)
- Cosmos DB (PostgreSQL and MongoDB vCore)
- Storage Accounts (Premium)
- Container Registry (Premium)
- Key Vault (Standard)

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Azure Subscription                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   Frontend      │  │    Backend      │  │   Monitoring    │ │
│  │  (NextJS App)   │  │  (FastAPI App)  │  │ (App Insights)  │ │
│  │                 │  │                 │  │                 │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│           │                    │                    │           │
│           └────────────────────┼────────────────────┘           │
│                                │                                │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    Virtual Network                          │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │ │
│  │  │ App Service │  │ Private     │  │   Private DNS       │ │ │
│  │  │   Subnet    │  │ Endpoints   │  │     Zones           │ │ │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                │                                │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   Cosmos DB     │  │   Cosmos DB     │  │   Storage       │ │
│  │   PostgreSQL    │  │   MongoDB       │  │    Account      │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│           │                    │                    │           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   Container     │  │   Azure OpenAI  │  │   Key Vault     │ │
│  │   Registry      │  │                 │  │                 │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Network Architecture

- **Virtual Network**: 10.0.0.0/16
- **App Service Subnet**: 10.0.1.0/24
- **Private Endpoints Subnet**: 10.0.2.0/24
- **Database Subnet**: 10.0.3.0/24 (if private endpoints enabled)

### Security Architecture

- **Private Endpoints**: All Azure services accessible only through private network
- **Network Security Groups**: Restrict access to necessary ports only
- **Managed Identities**: Service-to-service authentication without secrets
- **Key Vault**: Centralized secret management with access policies

## Pre-deployment Setup

### 1. Azure AD Application Registration

Create an Azure AD application for authentication:

```bash
# Login to Azure
az login

# Create app registration
az ad app create \
  --display-name "Studio App" \
  --identifier-uris "https://studio-app" \
  --sign-in-audience "AzureADMyOrg"

# Get the app ID
APP_ID=$(az ad app list --display-name "Studio App" --query "[0].appId" -o tsv)

# Create service principal
az ad sp create --id $APP_ID

# Create client secret (valid for 1 year)
az ad app credential reset \
  --id $APP_ID \
  --append \
  --credential-description "Studio App Secret" \
  --end-date "2026-01-01"

# Get the secret value
SECRET_VALUE=$(az ad app credential list --id $APP_ID --query "[0].value" -o tsv)
```

### 2. Azure OpenAI Service

Create an Azure OpenAI service:

```bash
# Create resource group for OpenAI
az group create --name "studio-openai-rg" --location "eastus"

# Create OpenAI service
az cognitiveservices account create \
  --name "studio-openai" \
  --resource-group "studio-openai-rg" \
  --kind "OpenAI" \
  --sku "S0" \
  --location "eastus"

# Get the endpoint and key
ENDPOINT=$(az cognitiveservices account show \
  --name "studio-openai" \
  --resource-group "studio-openai-rg" \
  --query "properties.endpoint" -o tsv)

KEY=$(az cognitiveservices account keys list \
  --name "studio-openai" \
  --resource-group "studio-openai-rg" \
  --query "key1" -o tsv)
```

### 3. Prepare Terraform Variables

Copy the example variables file and update it:

```bash
# Navigate to the template directory
cd infrastructure/terraform/environments/template

# Copy the example file
cp terraform.tfvars.example terraform.tfvars

# Edit the file with your values
nano terraform.tfvars
```

Update the following required variables:

```hcl
# Customer and Project Configuration
customer_prefix = "yourcompany"
environment     = "dev"
location        = "eastus"

# Azure AD Configuration
tenant_id              = "your-tenant-id"
azure_ad_client_id     = "your-app-id"
azure_ad_client_secret = "your-client-secret"

# Azure OpenAI Configuration
azure_openai_api_key  = "your-openai-key"
azure_openai_endpoint = "https://your-openai-resource.openai.azure.com/"

# Database Passwords
cosmos_postgresql_password = "your-postgresql-password"
cosmos_postgresql_app_password = "your-app-password"
cosmos_mongodb_password = "your-mongodb-password"
```

## Deployment Options

### Option 1: Automated Scripts (Recommended)

#### PowerShell (Windows)

```powershell
# Navigate to the template directory
cd infrastructure/terraform/environments/template

# Run deployment
..\..\..\scripts\deploy.ps1 `
  -CustomerPrefix "yourcompany" `
  -Environment "dev" `
  -Location "eastus" `
  -AutoApprove
```

#### Bash (Linux/Mac)

```bash
# Navigate to the template directory
cd infrastructure/terraform/environments/template

# Make script executable
chmod +x ../../../scripts/deploy.sh

# Run deployment
../../../scripts/deploy.sh \
  -c "yourcompany" \
  -e "dev" \
  -l "eastus" \
  --auto-approve
```

### Option 2: Manual Terraform Commands

```bash
# Navigate to the template directory
cd infrastructure/terraform/environments/template

# Initialize Terraform
terraform init

# Plan the deployment
terraform plan -var-file="terraform.tfvars" -out="terraform.tfplan"

# Apply the configuration
terraform apply "terraform.tfplan"
```

### Option 3: CI/CD Pipeline

Create an Azure DevOps pipeline or GitHub Actions workflow using the provided scripts.

## Step-by-Step Deployment

### Phase 1: Infrastructure Foundation

1. **Resource Group Creation**
   - Creates the main resource group with proper tagging
   - Establishes the foundation for all other resources

2. **Network Infrastructure**
   - Virtual network with subnets
   - Network security groups
   - Private DNS zones (if private endpoints enabled)

3. **Security Setup**
   - Key Vault with access policies
   - Managed identities for App Services
   - RBAC role assignments

### Phase 2: Data Services

4. **Database Deployment**
   - Cosmos DB PostgreSQL cluster
   - Cosmos DB MongoDB vCore cluster
   - Private endpoints (if enabled)

5. **Storage Setup**
   - Storage account with containers
   - CORS configuration for frontend access
   - Lifecycle management policies

6. **Container Registry**
   - Azure Container Registry
   - Access policies and authentication

### Phase 3: AI Services

7. **Azure OpenAI**
   - Cognitive service account
   - Model deployments (GPT-4, GPT-3.5, Embeddings)
   - Private endpoints (if enabled)

### Phase 4: Application Services

8. **App Service Plan**
   - Premium v3 plan for production workloads
   - Auto-scaling configuration

9. **App Services**
   - Frontend (NextJS) with Node.js 20
   - Backend (FastAPI) with Python 3.11
   - Application settings from Key Vault
   - Staging slots (if enabled)

### Phase 5: Monitoring and Observability

10. **Application Insights**
    - Separate instances for frontend and backend
    - Custom metrics and dashboards

11. **Log Analytics**
    - Centralized logging workspace
    - Diagnostic settings for all resources

12. **Alerting**
    - Metric-based alerts for performance
    - Log-based alerts for errors
    - Cost management alerts

## Post-Deployment Configuration

### 1. Azure AD App Configuration

Update the Azure AD app registration with the deployed URLs:

```bash
# Get the frontend and backend URLs from Terraform outputs
FRONTEND_URL=$(terraform output -raw frontend_url)
BACKEND_URL=$(terraform output -raw backend_url)

# Update redirect URIs
az ad app update --id $APP_ID \
  --web-redirect-uris \
    "$FRONTEND_URL/auth/callback" \
    "$BACKEND_URL"
```

### 2. DNS Configuration

If using custom domains:

```bash
# Add custom domain to App Services
az webapp config hostname add \
  --webapp-name "yourcompany-studio-dev-frontend" \
  --resource-group "yourcompany-studio-dev-rg" \
  --hostname "app.yourcompany.com"

# Update DNS records to point to the App Service
```

### 3. SSL Certificate

Configure SSL certificates for custom domains:

```bash
# Upload SSL certificate to App Service
az webapp config ssl upload \
  --resource-group "yourcompany-studio-dev-rg" \
  --name "yourcompany-studio-dev-frontend" \
  --certificate-file "certificate.pfx" \
  --certificate-password "password"
```

### 4. CI/CD Pipeline Setup

Configure deployment pipelines:

```yaml
# Example Azure DevOps pipeline
trigger:
  - main

variables:
  - name: customerPrefix
    value: 'yourcompany'
  - name: environment
    value: 'dev'
  - name: location
    value: 'eastus'

stages:
- stage: Deploy
  jobs:
  - job: DeployInfrastructure
    steps:
    - script: |
        cd infrastructure/terraform/environments/template
        ../../../scripts/deploy.sh \
          -c "$(customerPrefix)" \
          -e "$(environment)" \
          -l "$(location)" \
          --auto-approve
```

## Troubleshooting

### Common Issues

#### 1. Terraform Init Fails

**Error**: `Failed to query available provider packages`

**Solution**:
```bash
# Clear Terraform cache
rm -rf .terraform .terraform.lock.hcl

# Reinitialize with specific provider versions
terraform init -upgrade
```

#### 2. Azure Authentication Issues

**Error**: `Failed to get existing workspaces`

**Solution**:
```bash
# Re-authenticate with Azure
az login

# Verify subscription access
az account show

# Set subscription if needed
az account set --subscription "your-subscription-id"
```

#### 3. Resource Creation Fails

**Error**: `The request is not allowed`

**Solution**:
- Verify user has Contributor or Owner role
- Check resource provider registration
- Verify service quotas and limits

#### 4. Private Endpoint Issues

**Error**: `Private endpoint connection failed`

**Solution**:
- Verify virtual network configuration
- Check private DNS zone links
- Ensure network policies are enabled

### Debug Commands

```bash
# Check Terraform state
terraform state list
terraform state show azurerm_resource_group.main

# Validate configuration
terraform validate

# Check plan details
terraform show terraform.tfplan

# Check Azure resources
az resource list --resource-group "yourcompany-studio-dev-rg"

# Check App Service logs
az webapp log tail --name "yourcompany-studio-dev-backend" --resource-group "yourcompany-studio-dev-rg"
```

## Rollback Procedures

### 1. Terraform Rollback

```bash
# Revert to previous state
terraform plan -var-file="terraform.tfvars" -out="rollback.tfplan"
terraform apply "rollback.tfplan"
```

### 2. Manual Resource Cleanup

```bash
# Delete specific resources
az resource delete --name "resource-name" --resource-group "rg-name" --resource-type "resource-type"

# Delete entire resource group (use with caution)
az group delete --name "yourcompany-studio-dev-rg" --yes --no-wait
```

### 3. Database Recovery

```bash
# Restore from backup (if available)
az cosmosdb restore \
  --resource-group "yourcompany-studio-dev-rg" \
  --account-name "yourcompany-studio-dev-mongodb" \
  --restore-timestamp "2024-01-01T00:00:00Z"
```

## Cost Optimization

### 1. Development Environment

- Use Basic App Service Plan (B1)
- Single-node databases
- Standard storage (LRS)
- Basic Container Registry

**Estimated Cost**: $50-100/month

### 2. Staging Environment

- Use Standard App Service Plan (S1)
- Multi-node databases
- Premium storage (ZRS)
- Standard Container Registry

**Estimated Cost**: $200-400/month

### 3. Production Environment

- Use Premium App Service Plan (P1v3)
- High-availability databases
- Premium storage with geo-replication
- Premium Container Registry

**Estimated Cost**: $800-1500/month

### 4. Cost Optimization Strategies

```bash
# Enable auto-shutdown for development resources
az webapp config set \
  --resource-group "yourcompany-studio-dev-rg" \
  --name "yourcompany-studio-dev-backend" \
  --generic-configurations '{"autoShutdown": {"enabled": true}}'

# Set up cost alerts
az monitor action-group create \
  --resource-group "yourcompany-studio-dev-rg" \
  --name "cost-alerts" \
  --short-name "cost"

# Configure budget alerts
az consumption budget create \
  --resource-group "yourcompany-studio-dev-rg" \
  --budget-name "monthly-budget" \
  --amount 100 \
  --time-grain "Monthly"
```

## Security Considerations

### 1. Network Security

- Private endpoints for all Azure services
- Network security groups with minimal access
- Virtual network isolation
- DDoS protection enabled

### 2. Identity and Access Management

- Managed identities for service authentication
- Key Vault access policies
- RBAC role assignments
- Azure AD conditional access

### 3. Data Protection

- Encryption at rest and in transit
- Customer-managed keys (if enabled)
- Backup and disaster recovery
- Compliance with regulatory requirements

### 4. Monitoring and Auditing

- Activity logs for all resources
- Diagnostic settings enabled
- Security alerts and notifications
- Regular security assessments

## Monitoring and Maintenance

### 1. Performance Monitoring

```bash
# Check App Service performance
az webapp log tail --name "yourcompany-studio-dev-backend" --resource-group "yourcompany-studio-dev-rg"

# Monitor database performance
az cosmosdb show --name "yourcompany-studio-dev-postgresql" --resource-group "yourcompany-studio-dev-rg"
```

### 2. Health Checks

- Application health endpoints
- Database connectivity tests
- Storage access verification
- AI service availability

### 3. Backup and Recovery

- Automated daily backups
- Point-in-time recovery
- Cross-region replication
- Disaster recovery testing

### 4. Updates and Maintenance

- Regular Terraform updates
- Security patches and updates
- Performance optimizations
- Capacity planning

## Support and Resources

### Documentation

- [Azure Terraform Provider Documentation](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs)
- [Azure Architecture Center](https://docs.microsoft.com/en-us/azure/architecture/)
- [Terraform Best Practices](https://www.terraform.io/docs/cloud/guides/recommended-practices/)

### Community Support

- [Terraform Community](https://discuss.hashicorp.com/)
- [Azure Community](https://docs.microsoft.com/en-us/answers/)
- [Stack Overflow](https://stackoverflow.com/questions/tagged/terraform+azure)

### Professional Support

- [HashiCorp Support](https://www.hashicorp.com/support)
- [Microsoft Azure Support](https://azure.microsoft.com/en-us/support/)
- [Azure DevOps Services](https://azure.microsoft.com/en-us/services/devops/)

---

**Note**: This deployment guide is designed for the Studio infrastructure stack. Customize the configuration and deployment steps based on your specific requirements and organizational policies.
