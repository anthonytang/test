# 🚀 Studio Infrastructure Deployment

**Simple, beginner-friendly Azure deployment using Bicep**

This is your complete Infrastructure as Code (IaC) solution for deploying the Studio AI-powered document analysis platform to Azure. Designed for teams new to infrastructure automation, it provides a solid, production-ready foundation with room to grow.

## 📋 What This Deploys

Your complete Studio platform includes:

- **🌐 Web Applications**: Frontend (Next.js) and Backend (FastAPI) on Azure App Service
- **🤖 AI Services**: Azure AI Foundry with GPT-4o, GPT-5, O1, and embedding models  
- **🗄️ Databases**: PostgreSQL and MongoDB clusters for structured and document data
- **📁 File Storage**: Secure blob storage for user uploads and documents
- **🔐 Security**: Key Vault for secrets, managed identities for authentication
- **📊 Monitoring**: Application Insights and alerts for system health
- **🌐 Networking**: Optional private networking for enhanced security

**Estimated Monthly Costs:**
- **Development**: $50-100 USD (basic resources, single instances)
- **Production**: $300-800 USD (high availability, premium features)

## 🎯 Quick Start (15 minutes to deployment)

### 1. Prerequisites

You need these tools installed:
- **Azure CLI** - [Install here](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli)
- **jq** - JSON processor ([Install guide](https://stedolan.github.io/jq/download/))
- **Bash** - Command line (built-in on Mac/Linux, use WSL on Windows)

### 2. Clone and Setup

```bash
# Navigate to the bicep directory
cd infrastructure/bicep

# Copy the template parameters file
cp parameters.template.json parameters.dev.json
```

### 3. Configure Your Deployment

Edit `parameters.dev.json` and replace these values:

```json
{
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "customerPrefix": {
      "value": "yourcompany"  // 3-10 characters, your company name
    },  
    "environment": {  
      "value": "dev"          // Application Environment
    },  
    "location": { 
      "value": "eastus"       // Application location
    },  
    "appServicePlanSku": {  
      "value": "B1"           // Define compute resources
    },
    "tenantId": {
      "value": "your-azure-tenant-id"    // Get from Azure Portal
    },
    "clientId": {
      "value": "your-app-client-id"      // Azure AD app registration
    },
    "clientSecret": {
      "value": "your-client-secret"      // Azure AD app secret
    },
    "postgresPassword": {
      "value": "YourSecurePassword123!"  // Strong password for database
    },
    "mongoPassword": {
      "value": "YourSecurePassword123!"  // Strong password for database
    }
  }
}
```

### 4. Deploy to Azure

```bash
# Login to Azure
az login

# Deploy to development
./scripts/deploy-all.sh dev
```

The deployment process will take approximately 30 minutes. Once it’s complete, you’ll receive URLs for your applications.

Some errors may occur when redeploying certain components — just ensure that each component successfully deploys at least once, and the application should function properly.

To deploy a specific component, run the corresponding shell script using the command:
```sh
./scripts/deploy-<COMPONENT>.sh dev
```

### 5. Set up PostgreSQL & MongoDB
```bash
# Switch to the script folder
cd scripts/post-infra-deployment/

# Apply PostgreSQL Schema
./apply-postgresql-schema.sh '<POSTGRESQL_CONNECTION_STRING>'

# Set up MongoDB vector index
./create-mongo-vector.sh '<MONGODB_CONNECTION_STRING>'
# That's it! 🎉

```

### 6. Deploy docker app
```bash

# Deploy app to Azure Container Registry
./deploy-app.sh dev

# That's it! 🎉
```




## 📚 Detailed Setup Guide

### Azure AD App Registration

Before deployment, create an Azure AD app registration:

1. Go to **Azure Portal** > **Azure Active Directory (Microsoft Entra ID)** > **App registrations**
2. Click **New registration**
3. Name: "Studio-Dev"  
4. Account type: "Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)"
5. Click **Register**
6. Configure single-page application: 
  Redirect URIs: 
  (1) https://studio-dev-frontend.azurewebsites.net/auth/callback
  (2) http://localhost:3000/auth/callback
7. Select the tokens you would like to be issued by the authorization endpoint:
(1) Access tokens (used for implicit flows)
(2) ID tokens (used for implicit and hybrid flows)
7. Note down the **Application (client) ID** and **Directory (tenant) ID**
8. Go to **Certificates & secrets** > **New client secret**
9. Create a secret and note down the **Value** (not the ID!)

### Environment Configuration

We provide two pre-configured environments:

#### Development Environment (`parameters.dev.json`)
- **Purpose**: Testing, development, demos
- **Cost**: ~$50-100/month
- **Features**: Basic SKUs, single instances, no high availability
- **Security**: Public endpoints (simpler setup)

#### Production Environment (`parameters.prod.json`)  
- **Purpose**: Live customer deployments
- **Cost**: ~$300-800/month
- **Features**: Premium SKUs, high availability, auto-scaling
- **Security**: Private networking, enhanced monitoring

### Configuration Options

Key parameters you can customize:

| Parameter | Description | Dev Default | Prod Default |
|-----------|-------------|-------------|--------------|
| `customerPrefix` | Resource naming prefix | "demo" | "client" |
| `environment` | Environment type | "dev" | "prod" |
| `location` | Azure region | "eastus" | "eastus" |
| `appServicePlanSku` | App performance tier | "B1" | "P1v3" |
| `deployGpt4` | Include GPT-4 (expensive) | false | true |
| `enablePrivateNetworking` | Private endpoints | false | true |

## 🛠️ Available Scripts

All scripts are in the `scripts/` directory:

### `./scripts/validate.sh <environment>`
Checks your configuration before deployment
```bash
./scripts/validate.sh dev    # Validate development config
./scripts/validate.sh prod   # Validate production config
```

### `./scripts/deploy-all.sh <environment> [options]`
Deploys your infrastructure
```bash
./scripts/deploy-all.sh dev                 # Interactive deployment
./scripts/deploy-all.sh dev --no-confirm    # Automated deployment
./scripts/deploy-all.sh prod                # Production deployment
```

### `./scripts/cleanup.sh <environment> [options]`
Deletes all resources (careful!)
```bash
./scripts/cleanup.sh dev                # Delete development
./scripts/cleanup.sh prod --confirm     # Delete production (requires flag)
```

## 📁 File Structure

```
bicep/
├── main.bicep                            # Main deployment template
├── parameters.template.json              # Deployment config template
├── parameters.sallyport.json             # Sallyport Production configuration          
├── modules/                              # Reusable resource modules
│   ├── keyVault.bicep                    # Secure key storage
│   ├── storage.bicep                     # File storage
│   ├── openai.bicep                      # AI Foundry services
│   ├── cosmosPostgres.bicep              # PostgreSQL database
│   ├── cosmosMongo.bicep                 # MongoDB database
│   ├── appService.bicep                  # Web applications
│   ├── appInsights.bicep                 # Monitoring
│   ├── networking.bicep                  # Private networking (optional)
│   ├── secrets.bicep                     # Secret management
│   └── monitoring.bicep                  # Alerts and monitoring
└── scripts/            
    ├── deploy-all.sh                     # Deployment automation
    ├── validate.sh                       # Configuration validation
    └── cleanup.sh                        # Resource cleanup
    └── post-infra-deployment/            # Post infra deployment script
        ├── apply-postgresql-schema.sh    # PostgreSQL schema script
        ├── azure_schema.sql              # PostgreSQL schema
        ├── create-mongo-vector.sh        # MongoDB vector script
        └── deploy-app-dev.sh             # Deploy docker app script
```

## 🔧 Customization Guide

### Environment-Specific Customizations

**Development Environment:**
- Use cheaper SKUs (B1, Basic)
- Single instances only
- Public endpoints for easier development
- Minimal monitoring

**Production Environment:**
- Premium SKUs (P1v3, Standard+)
- High availability enabled
- Private networking for security
- Comprehensive monitoring and alerts

### Adding New Azure Services

To add new services, create a new module in `modules/`:

1. **Create module file** (e.g., `modules/newService.bicep`)
2. **Add parameters** to main.bicep and parameter files
3. **Reference module** in main.bicep:
   ```bicep
   module newService 'modules/newService.bicep' = {
     // module configuration
   }
   ```

## 🔐 Security Best Practices

### Secrets Management
- ✅ All secrets stored in Azure Key Vault
- ✅ Managed identities for service authentication
- ✅ No secrets in parameter files (use secure parameters)
- ✅ Key rotation supported through Azure

### Network Security
- ✅ Private endpoints for production (optional for dev)
- ✅ Network Security Groups with minimal access
- ✅ HTTPS enforced on all endpoints
- ✅ TLS 1.2+ required

### Access Control
- ✅ Azure AD integration
- ✅ Role-based access control (RBAC)
- ✅ Least privilege principle
- ✅ Service-to-service authentication via managed identities

## 📊 Monitoring and Maintenance

### What's Monitored
- **Application Performance**: Response times, errors, availability
- **Resource Usage**: CPU, memory, storage utilization  
- **Cost Management**: Budget alerts and spending tracking
- **Security**: Failed logins, suspicious activity

### Alerts Configured
- High CPU/memory usage (>80%)
- HTTP 5xx errors (>5 in 15 minutes)
- Application downtime
- Monthly budget exceeded (90% threshold)

### Maintenance Tasks
- **Weekly**: Review Application Insights for performance issues
- **Monthly**: Check cost optimization opportunities
- **Quarterly**: Review and rotate secrets if needed
- **As needed**: Scale resources based on usage patterns

## 💡 Tips for Success

### For Development
- Use `parameters.dev.json` for testing
- Keep costs low with basic SKUs
- Use `--no-confirm` flag for automation
- Clean up resources when not needed

### For Production  
- Always validate before deploying: `./scripts/validate.sh prod`
- Use strong, unique passwords
- Enable private networking for security
- Set up proper monitoring and alerting
- Document your configuration

### For Teams New to IaC
- Start with development environment
- Make small, incremental changes
- Use version control for all configuration files
- Test deployments thoroughly before production
- Keep parameter files secure (don't commit secrets)

---

##  🆘 Need Help? Who do I talk to <a name = "author"></a>
- Jeffrey Wang (zw4484@nyu.edu)