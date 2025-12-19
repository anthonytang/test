# 🚀 Quick Start - Studio Infrastructure Deployment

**Get your Studio platform running in Azure in 15 minutes!**

## ⚡ Super Quick Setup (For Deployment Next Week)

### Step 1: Prerequisites (5 minutes)
```bash
# Install Azure CLI (if not already installed)
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash  # Linux
# OR
brew install azure-cli  # Mac

# Install jq (JSON processor)
sudo apt install jq  # Linux  
# OR
brew install jq  # Mac

# Login to Azure
az login
```

### Step 2: Configure (5 minutes)
```bash
cd infrastructure/bicep

# Copy template for your customer
cp parameters.template.json parameters.customer-dev.json

# Edit the file - replace these values:
nano parameters.customer-dev.json
```

**Replace these placeholders:**
```json
{
  "parameters": {
    "customerPrefix": { "value": "acme" },              // Customer name (3-10 chars)
    "tenantId": { "value": "your-tenant-id-here" },     // From Azure Portal
    "clientId": { "value": "your-client-id-here" },     // Azure AD app
    "clientSecret": { "value": "your-secret-here" },    // Azure AD secret
    "postgresPassword": { "value": "SecurePass123!" },  // Strong password
    "mongoPassword": { "value": "SecurePass123!" },     // Strong password
    "alertEmail": { "value": "admin@yourcompany.com" }  // Your email
  }
}
```

### Step 3: Deploy (5 minutes)
```bash
# Validate configuration first
./scripts/validate.sh customer-dev

# Deploy to Azure
./scripts/deploy.sh customer-dev

# Wait for completion...
# You'll get URLs when done! 🎉
```

## 🎯 For Customer Deployment

### Production Deployment Checklist

**Before the meeting:**
- [ ] Test with `parameters.dev.json` first
- [ ] Get customer's Azure AD tenant ID
- [ ] Create Azure AD app registration for customer
- [ ] Choose strong, unique passwords
- [ ] Select appropriate Azure region

**For the customer deployment:**
```bash
# Copy production template
cp parameters.prod.json parameters.customer-prod.json

# Update with customer-specific values:
# - customerPrefix: "customername"
# - tenantId: their tenant ID
# - clientId: their Azure AD app
# - strong passwords
# - their email for alerts

# Deploy
./scripts/validate.sh customer-prod
./scripts/deploy.sh customer-prod
```

**Estimated deployment time:** 10-15 minutes
**Estimated monthly cost:** $300-800 USD for production

## 🛟 Emergency Help

If something goes wrong:

```bash
# Check what went wrong
./scripts/validate.sh <environment>

# Clean up and start over
./scripts/cleanup.sh <environment>

# Try again
./scripts/deploy.sh <environment>
```

**Most common issues:**
1. **Not logged into Azure**: Run `az login`
2. **Wrong tenant/client IDs**: Check Azure Portal > Azure AD
3. **Weak passwords**: Use 12+ characters with symbols
4. **Missing permissions**: Ensure Contributor role on subscription

## 📞 Day-of-Deployment Commands

**Quick reference**

```bash
# Navigate to deployment directory
cd infrastructure/bicep

# Final validation
./scripts/validate.sh customer-prod

# Deploy with customer watching
./scripts/deploy.sh customer-prod

# If issues occur
./scripts/cleanup.sh customer-prod
./scripts/deploy.sh customer-prod

# Show customer the results
# URLs will be displayed at the end!
```

**Show the customer:**
- Frontend URL (their web app)
- Backend API URL (for developers)  
- Azure Portal resource group
- Monthly cost estimate

## 🎉 Success Indicators

✅ **Deployment completed** message  
✅ **Frontend URL** loads (might show placeholder)  
✅ **Backend URL** shows API documentation  
✅ **All resources** visible in Azure Portal  
✅ **No error alerts** in first 10 minutes  

---

**That's it! You're ready for deployment** 🚀
