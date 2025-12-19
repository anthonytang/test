**Starting the deployment from scratch**
RUN ALL SCRIPTS FROM BICEP DIRECTORY

Need to create an app registration to get client id and client secret for parameters file
- run deploy-core.sh $name
- run deploy-storage.sh $name
    1. the connection string is output.json file 

- run ./scripts/deploy-openai.sh $name
    1. if you run into access error run this with your params
    ```bash
    az role assignment create --role "Key Vault Secrets Officer" --assignee {User Object ID} --scope
      "/subscriptions/86964b44-10b8-4d1f-b15d-7d5721787ca4/resourcegroups/testrun-studio-test-rg/providers/microsoft.keyvault/vaults/testrun-studio-test-kv"
    ```
    2. Role assignment now happens automatically during Key Vault creation (fixed after inital failure)
    3. the keys and endpoints are stored in the keyvault
    4. 3 models are deployed using this script (embedding and o3 need to be manually deployed)
    5. - Azure AI user role 
    6. Under the resource do this to enable api auth (FIXED IN THE SCRIPT NO NEED FOR THIS STEP)
  ```bash
      az resource update --ids "/subscriptions/86964b44-10b8-4d1f-b15d-7d5721787ca4/resourceGroups/testrun-studio-test-rg/providers/Microsoft.CognitiveServices/accounts/testrun-studio-test-aifoundry" --set properties.disableLocalAuth=false  
  ```

    7. Need to confirm the TPM is high like 250K
- DO POSTGRES DEPLOYMENT MANUALLY (USING SCRIPT GIVES ERROR, DONT HAVE TIME TO TINKER WITH THE SCRIPT)
    - will need to add upsert_user_profile.sql to the db
    - will need to add 2 columns, the working table is in studio/frontend/working_files_table.txt
    - set authentication to postgres only
- run ./scripts/deploy-cosmos-mongo.sh $name
    1. In the networking tab, allow access all
    2. To create a vector index run  /Users/omshewale/studio/create_vector_index_rest.py


- run ./scripts/deploy-appservice-no-openai.sh $name

    ℹ️  📋 Next Steps:
    ℹ️  1. Configure Azure AD redirect URI: https://testrun-studio-test-frontend.azurewebsites.net/auth/callback

- run ./scripts/deploy-container-registry.sh $name 
    1. This deploys container regsitry with premium SKU, need to go in and change it to basic or standard 
    2. Run this command to disable retention policy if cant change SKU    
    az acr config retention update --registry <YourRegistryName> --status disabled --type UntaggedManifests

## Docker Containerization and Deployment

After completing the infrastructure deployment, containerize and deploy the application:

### 1. Update Deployment Script Configuration
Update `/Users/omshewale/studio/azure-deploy-studio.sh` with test-run specific values:
- Resource group: `testrun-studio-test-rg`  
- Container registry: `testrunstudiotestacr`
- App service names: `testrun-studio-test-backend` and `testrun-studio-test-frontend`
- Update all environment variables with test-run resource values


For entra ID, you need to create the NEXT_AUTH_SECRET

### 2. Build and Push Backend Docker Image
```bash
az acr build \
  --registry testrunstudiotestacr \
  --image backend:latest \
  --image backend:$(date +%Y%m%d-%H%M%S) \
  --platform linux/amd64 \
  ./backend
```

### 3. Build and Push Frontend Docker Image
```bash
az acr build \
  --registry testrunstudiotestacr \
  --image frontend:latest \
  --image frontend:$(date +%Y%m%d-%H%M%S) \
  --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_BACKEND_SERVER_URL="https://testrun-studio-test-backend.azurewebsites.net" \
  --build-arg NEXT_PUBLIC_SITE_URL="https://testrun-studio-test-frontend.azurewebsites.net" \
  --build-arg NEXT_PUBLIC_AZURE_AD_CLIENT_ID="00330653-b10d-4f3a-9c28-4d42d06b090f" \
  --build-arg NEXT_PUBLIC_AZURE_AD_TENANT_ID="66b675b7-eb4d-4095-b728-8ff1098c0e4c" \
  --build-arg NEXT_PUBLIC_AZURE_AD_REDIRECT_URI="https://testrun-studio-test-frontend.azurewebsites.net/auth/callback" \
  --build-arg NEXT_PUBLIC_AZURE_AD_AUTHORITY="https://login.microsoftonline.com/66b675b7-eb4d-4095-b728-8ff1098c0e4c" \
  ./frontend
```

### 4. Verify Container Images
```bash
az acr repository list --name testrunstudiotestacr --output table
az acr repository show-tags --name testrunstudiotestacr --repository backend --output table  
az acr repository show-tags --name testrunstudiotestacr --repository frontend --output table
```

### 5. Deploy Container Images to App Services

#### Configure Backend App Service:
```bash
az webapp config container set \
  --name testrun-studio-test-backend \
  --resource-group testrun-studio-test-rg \
  --docker-custom-image-name testrunstudiotestacr.azurecr.io/backend:latest \
  --docker-registry-server-url https://testrunstudiotestacr.azurecr.io
```

#### Configure Frontend App Service:
```bash
az webapp config container set \
  --name testrun-studio-test-frontend \
  --resource-group testrun-studio-test-rg \
  --docker-custom-image-name testrunstudiotestacr.azurecr.io/frontend:latest \
  --docker-registry-server-url https://testrunstudiotestacr.azurecr.io
```

### 6. Restart Applications
```bash
az webapp restart --name testrun-studio-test-backend --resource-group testrun-studio-test-rg
az webapp restart --name testrun-studio-test-frontend --resource-group testrun-studio-test-rg
```

### 7. Verification
Test the deployed services:
- Backend health: https://testrun-studio-test-backend.azurewebsites.net/health
- Backend API docs: https://testrun-studio-test-backend.azurewebsites.net/docs  
- Frontend: https://testrun-studio-test-frontend.azurewebsites.net
- Authentication: https://testrun-studio-test-frontend.azurewebsites.net/auth/signin

### Notes:
- Docker images are built using Azure Container Registry build service (no local Docker required)
- Backend image includes Python dependencies and FastAPI application
- Frontend image includes Next.js build with production environment variables baked in
- Both images are tagged with latest and timestamped versions for rollback capability
- App services automatically pull container images from ACR with managed identity authentication
