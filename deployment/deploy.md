# Deployment Script Documentation

## Overview

The `deploy.sh` script automates the deployment process by copying infrastructure output files from customer-specific folders and executing the application deployment script. It handles the entire deployment workflow from file preparation to cleanup.

## Purpose

This script streamlines the deployment process by:
1. Copying output files from customer-specific output folders to the infrastructure directory
2. Authenticating with Azure
3. Running the application deployment script
4. Cleaning up temporary files after deployment

## Prerequisites

- **Azure CLI**: Must be installed and configured
- **Bash**: Script requires bash shell (tested on macOS/Linux)
- **Output Files**: The customer-specific output folder must exist with all required files
- **Deployment Script**: `deploy-app.sh` must exist at the expected location

## Usage

```bash
./deploy.sh <customer-prefix> <env>
```

### Arguments

- **`customer-prefix`**: The customer identifier (e.g., `lifesci`, `staging`)
- **`env`**: The environment name (e.g., `prod`, `dev`)

### Examples

```bash
# Deploy lifesci production environment
./deploy.sh lifesci prod

# Deploy staging development environment
./deploy.sh staging dev
```

## How It Works

### 1. File Copying Phase
- **Source**: `studio/infrastructure/bicep/outputs-{customer-prefix}-{env}/`
- **Target**: `studio/infrastructure/bicep/` (same level as `parameters.dev.json`)
- The script copies all files from the source directory to the target directory, overwriting any existing files with the same names.

### 2. Azure Authentication
- Executes `az login` to authenticate with Azure
- Required for subsequent Azure CLI operations

### 3. Application Deployment
- Changes directory to `studio/infrastructure/bicep/scripts/post-infra-deployment/`
- Executes `./deploy-app.sh {env}` with the provided environment parameter
- The deployment script handles:
  - Building and pushing container images to ACR
  - Configuring App Service settings
  - Setting up Key Vault references
  - Deploying backend and frontend applications

### 4. Cleanup Phase
- Removes all files that were copied from the outputs folder
- Only deletes files in the target directory (original files in outputs folder remain untouched)
- Ensures the target directory is clean after deployment

## File Structure

```
studio/
├── deployment/
│   ├── deploy.sh          # This deployment script
│   └── deploy.md          # This documentation
└── infrastructure/
    └── bicep/
        ├── outputs-lifesci-prod/    # Example: customer-specific outputs
        │   ├── outputs-aifoundry-prod.json
        │   ├── outputs-apim-prod.json
        │   ├── outputs-appservice-prod.json
        │   ├── outputs-container-registry-prod.json
        │   ├── outputs-core-prod.json
        │   ├── outputs-loganalytics-prod.json
        │   ├── outputs-mongo-prod.json
        │   ├── outputs-postgres-prod.json
        │   ├── outputs-storage-prod.json
        │   └── parameters.prod.json
        ├── outputs-staging-dev/     # Example: another customer environment
        │   └── ...
        ├── parameters.dev.json      # Target location (same level)
        └── scripts/
            └── post-infra-deployment/
                └── deploy-app.sh    # Application deployment script
```

## Expected Output Files

The script expects the following files in the source output folder:
- `outputs-aifoundry-{env}.json`
- `outputs-apim-{env}.json`
- `outputs-appservice-{env}.json`
- `outputs-container-registry-{env}.json`
- `outputs-core-{env}.json`
- `outputs-loganalytics-{env}.json`
- `outputs-mongo-{env}.json`
- `outputs-postgres-{env}.json`
- `outputs-storage-{env}.json`
- `parameters.{env}.json`

## Error Handling

The script includes comprehensive error handling:
- Validates that the source directory exists
- Validates that `deploy-app.sh` exists
- Exits on any failure with clear error messages
- Uses `set -euo pipefail` for strict error handling

## Output

The script provides colored output for better readability:
- **Blue**: Informational messages
- **Green**: Success messages
- **Yellow**: Warnings
- **Red**: Errors

## Notes

- The script does **not** delete files from the source output folder
- Only temporary copies in the target directory are removed
- The script must be run from the `studio/deployment/` directory or with the correct path
- Azure login may require interactive authentication (browser or device code)

## Troubleshooting

### "Source directory does not exist"
- Verify the customer prefix and environment are correct
- Ensure the output folder exists at: `studio/infrastructure/bicep/outputs-{customer-prefix}-{env}/`

### "Deployment script does not exist"
- Verify `deploy-app.sh` exists at: `studio/infrastructure/bicep/scripts/post-infra-deployment/deploy-app.sh`

### "Azure login failed"
- Ensure Azure CLI is installed: `az --version`
- Check network connectivity
- Verify you have valid Azure credentials

### Files not being deleted
- Check file permissions in the target directory
- Verify the script completed successfully (files are only deleted after successful deployment)

### Author
- Jeffrey Wang (jeffrey@whyaitech.com)