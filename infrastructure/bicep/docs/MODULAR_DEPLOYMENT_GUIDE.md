# 🚀 Modular Deployment Guide

This guide covers the new modular deployment approach that breaks down the infrastructure into manageable components, helping avoid the "content already consumed" Azure CLI error and providing better deployment control.

## 📋 Overview

The modular deployment system consists of 6 individual scripts plus a master orchestrator:

1. **`deploy-core.sh`** - Resource Group + Key Vault (foundation)
2. **`deploy-storage.sh`** - Azure Storage Account
3. **`deploy-openai.sh`** - Azure AI Foundry Service + Models
4. **`deploy-cosmos-postgres.sh`** - Cosmos DB PostgreSQL
5. **`deploy-cosmos-mongo.sh`** - Cosmos DB MongoDB vCore (Vector Search)
6. **`deploy-appservice.sh`** - App Service Plan + Web Apps
7. **`deploy-all.sh`** - Master orchestrator (runs all in order)

## 🎯 Quick Start

### Option 1: Full Deployment (Recommended)
```bash
cd /Users/omshewale/studio/infrastructure/bicep
./scripts/deploy-all.sh test-run
```

### Option 2: Step-by-Step Deployment
```bash
# Step 1: Core infrastructure
./scripts/deploy-core.sh test-run

# Step 2: Storage
./scripts/deploy-storage.sh test-run

# Step 3: OpenAI
./scripts/deploy-openai.sh test-run

# Step 4: PostgreSQL
./scripts/deploy-cosmos-postgres.sh test-run

# Step 5: MongoDB (for vector search)
./scripts/deploy-cosmos-mongo.sh test-run
NEED to setup a vector index after deployment 
ℹ️  1. Go to Azure Portal → Your Cosmos MongoDB cluster
ℹ️  2. Use MongoDB shell to run:
   use vectordb
   db.runCommand({
     createIndexes: "documents",
     indexes: [{
       name: "vector_index",
       key: { embedding: "cosmosSearch" },
       cosmosSearchOptions: {
         kind: "vector-ivf",
         numLists: 100,
         similarity: "COS",
         dimensions: 1536
       }
     }]
   })

# Step 6: App Services
./scripts/deploy-appservice.sh test-run
```

## 💡 Benefits of Modular Deployment

### ✅ **Advantages:**
- **Isolates Issues**: Each component deploys independently
- **Faster Debugging**: Pinpoint exactly which resource is failing  
- **Cost Control**: Skip expensive components (like MongoDB vCore)
- **Parallel Development**: Different team members can work on different modules
- **Incremental Updates**: Update only what changed
- **Better Error Messages**: Clear, specific failure points

### ⚠️ **Compared to Monolithic:**
- **More Steps**: 6 scripts vs 1 (but more reliable)
- **Output Files**: Creates multiple JSON output files (easier to track)
- **Dependencies**: Scripts must run in order (automated in deploy-all.sh)

## 📊 Cost Breakdown

| Component | Monthly Cost | Essential |
|-----------|-------------|-----------|
| Core (RG + Key Vault) | ~$5 | ✅ Required |
| Storage Account | ~$10-20 | ✅ Required |
| Azure AI Foundry | ~$50-100 | ✅ Required |
| Cosmos PostgreSQL | ~$100-200 | ✅ Required |
| Cosmos MongoDB vCore | ~$165 | ✅ Required |
| App Services (B1) | ~$15-30 | ✅ Required |
| **Total** | **~$330-495** | |

## ⏱️ Deployment Timeline

| Component | Time | Notes |
|-----------|------|--------|
| Core | 2-3 min | Fast, foundation setup |
| Storage | 1-2 min | Quick storage creation |
| OpenAI | 5-10 min | Model deployments take time |
| Cosmos PostgreSQL | 10-15 min | Database cluster provisioning |
| Cosmos MongoDB | 15-20 min | Most expensive, slowest |
| App Services | 5-10 min | Web app configuration |
| **Total** | **30-45 min** | Full stack deployment |

## 🔧 Troubleshooting

### Common Issues:

#### 1. "Parameters file not found"
```bash
# Copy template and customize
cp parameters.template.json parameters.test-run.json
# Edit with your values
```

#### 2. "Core outputs not found" 
```bash
# Run prerequisite deployments first
./scripts/deploy-core.sh test-run
```

#### 3. OpenAI deployment fails
- Check region availability: `az provider show --namespace Microsoft.CognitiveServices`
- Verify quota limits in Azure Portal
- Try different region (eastus, westus2, etc.)

#### 4. MongoDB deployment fails
- Very expensive resource (~$165/month)
- Limited regional availability
- High quota requirements
- Can be skipped for testing

#### 5. "Content already consumed" error
- **Fixed!** Modular deployment avoids this entirely
- Each script handles smaller, manageable deployments
- If it still occurs, wait 30 seconds and retry

## 📁 Output Files

Each deployment creates an output file with resource details:

```bash
outputs-core-test-run.json          # Resource Group, Key Vault
outputs-storage-test-run.json       # Storage Account details
outputs-openai-test-run.json        # OpenAI endpoint, keys
outputs-postgres-test-run.json      # PostgreSQL connection
outputs-mongo-test-run.json         # MongoDB connection
outputs-appservice-test-run.json    # Frontend/Backend URLs
```

These files are used by subsequent deployments and contain all the resource connection details.

## 🎛️ Advanced Usage

### Skip Confirmations (Automation)
```bash
./scripts/deploy-all.sh test-run --skip-confirm
```

### Deploy Only Specific Components
```bash
# Just the core infrastructure
./scripts/deploy-core.sh test-run

# Add storage later
./scripts/deploy-storage.sh test-run

# Deploy MongoDB for vector search
# Currently required for app functionality
```

### Different Environments
```bash
# Development (cheap)
./scripts/deploy-all.sh dev

# Production (full featured)
./scripts/deploy-all.sh prod
```

### Cleanup Individual Components
```bash
# Delete just the MongoDB cluster (save $165/month)
az group delete --name testrun-studio-test-mongo-rg

# Delete everything
az group delete --name testrun-studio-test-rg
```

## 🔄 Next Steps After Deployment

1. **Configure Azure AD**: Add redirect URI from output URLs
2. **Set up MongoDB Vector Index**: Follow instructions in mongo script output
3. **Deploy Application Code**: Use Azure DevOps or GitHub Actions
4. **Test Endpoints**: Verify frontend, backend, and API docs work
5. **Monitor Costs**: Set up budget alerts in Azure Portal

## 🎯 Production Recommendations

- Use `prod` environment with higher SKUs
- Enable private endpoints for security
- Set up Application Insights monitoring  
- Configure automated backups
- Implement CI/CD pipelines
- Set up budget alerts

---

**Ready to deploy?** Run `./scripts/deploy-all.sh test-run` and watch the magic happen! 🚀