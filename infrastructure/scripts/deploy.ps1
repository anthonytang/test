#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Deploy Studio Infrastructure to Azure using Terraform

.DESCRIPTION
    This script deploys the complete Studio infrastructure stack to Azure using Terraform.
    It includes parameter validation, Azure authentication, Terraform operations, and post-deployment validation.

.PARAMETER CustomerPrefix
    Customer prefix for resource naming (3-10 characters, alphanumeric)

.PARAMETER Environment
    Environment name (dev, staging, prod)

.PARAMETER Location
    Azure region for resources

.PARAMETER TerraformVarsFile
    Path to terraform.tfvars file

.PARAMETER TerraformBackendConfig
    Terraform backend configuration file

.PARAMETER SkipPlan
    Skip the terraform plan step and apply directly

.PARAMETER AutoApprove
    Automatically approve terraform apply without prompting

.PARAMETER Destroy
    Destroy the infrastructure instead of creating it

.EXAMPLE
    .\deploy.ps1 -CustomerPrefix "acme" -Environment "dev" -Location "eastus"

.EXAMPLE
    .\deploy.ps1 -CustomerPrefix "contoso" -Environment "prod" -Location "westus2" -AutoApprove

.NOTES
    Requires:
    - Azure CLI
    - Terraform
    - PowerShell 7.0+
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern("^[a-zA-Z0-9]{3,10}$")]
    [string]$CustomerPrefix,
    
    [Parameter(Mandatory = $true)]
    [ValidateSet("dev", "staging", "prod")]
    [string]$Environment,
    
    [Parameter(Mandatory = $true)]
    [string]$Location,
    
    [Parameter(Mandatory = $false)]
    [string]$TerraformVarsFile = "terraform.tfvars",
    
    [Parameter(Mandatory = $false)]
    [string]$TerraformBackendConfig = "",
    
    [Parameter(Mandatory = $false)]
    [switch]$SkipPlan,
    
    [Parameter(Mandatory = $false)]
    [switch]$AutoApprove,
    
    [Parameter(Mandatory = $false)]
    [switch]$Destroy
)

# Set error action preference
$ErrorActionPreference = "Stop"

# Script configuration
$ScriptVersion = "1.0.0"
$RequiredTerraformVersion = "1.0.0"
$RequiredAzCliVersion = "2.0.0"

# Color functions for output
function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

function Write-Success { param([string]$Message) Write-ColorOutput $Message "Green" }
function Write-Info { param([string]$Message) Write-ColorOutput $Message "Cyan" }
function Write-Warning { param([string]$Message) Write-ColorOutput $Message "Yellow" }
function Write-Error { param([string]$Message) Write-ColorOutput $Message "Red" }

# Script header
Write-Info "=================================================================="
Write-Info "Studio Infrastructure Deployment Script"
Write-Info "Version: $ScriptVersion"
Write-Info "Customer: $CustomerPrefix"
Write-Info "Environment: $Environment"
Write-Info "Location: $Location"
Write-Info "=================================================================="
Write-Host ""

# Function to check prerequisites
function Test-Prerequisites {
    Write-Info "Checking prerequisites..."
    
    # Check PowerShell version
    if ($PSVersionTable.PSVersion.Major -lt 7) {
        throw "PowerShell 7.0 or higher is required. Current version: $($PSVersionTable.PSVersion)"
    }
    Write-Success "✓ PowerShell version: $($PSVersionTable.PSVersion)"
    
    # Check Azure CLI
    try {
        $azVersion = az version --output json | ConvertFrom-Json
        $azCliVersion = $azVersion."azure-cli"
        if ([version]$azCliVersion -lt [version]$RequiredAzCliVersion) {
            throw "Azure CLI version $RequiredAzCliVersion or higher is required. Current version: $azCliVersion"
        }
        Write-Success "✓ Azure CLI version: $azCliVersion"
    }
    catch {
        throw "Azure CLI is not installed or not accessible. Please install Azure CLI and try again."
    }
    
    # Check Terraform
    try {
        $tfVersion = terraform version -json | ConvertFrom-Json
        $terraformVersion = $tfVersion.terraform_version
        if ([version]$terraformVersion -lt [version]$RequiredTerraformVersion) {
            throw "Terraform version $RequiredTerraformVersion or higher is required. Current version: $terraformVersion"
        }
        Write-Success "✓ Terraform version: $terraformVersion"
    }
    catch {
        throw "Terraform is not installed or not accessible. Please install Terraform and try again."
    }
    
    Write-Success "All prerequisites are satisfied!"
}

# Function to validate Azure authentication
function Test-AzureAuthentication {
    Write-Info "Validating Azure authentication..."
    
    try {
        $account = az account show --output json | ConvertFrom-Json
        Write-Success "✓ Authenticated as: $($account.user.name)"
        Write-Success "✓ Subscription: $($account.name) ($($account.id))"
        Write-Success "✓ Tenant: $($account.tenantId)"
        
        # Check if subscription is active
        if ($account.state -ne "Enabled") {
            throw "Subscription is not active. Current state: $($account.state)"
        }
        
        # Check if user has Contributor or Owner role
        $roleAssignments = az role assignment list --assignee $account.user.name --scope "/subscriptions/$($account.id)" --output json | ConvertFrom-Json
        $hasPermission = $roleAssignments | Where-Object { $_.roleDefinitionName -in @("Contributor", "Owner") }
        
        if (-not $hasPermission) {
            Write-Warning "Warning: User may not have sufficient permissions. Contributor or Owner role is recommended."
        } else {
            Write-Success "✓ User has sufficient permissions"
        }
    }
    catch {
        throw "Azure authentication failed. Please run 'az login' and try again."
    }
}

# Function to validate parameters
function Test-Parameters {
    Write-Info "Validating parameters..."
    
    # Check if terraform.tfvars file exists
    if (-not (Test-Path $TerraformVarsFile)) {
        throw "Terraform variables file not found: $TerraformVarsFile"
    }
    Write-Success "✓ Terraform variables file: $TerraformVarsFile"
    
    # Check if backend config file exists (if specified)
    if ($TerraformBackendConfig -and -not (Test-Path $TerraformBackendConfig)) {
        throw "Terraform backend config file not found: $TerraformBackendConfig"
    }
    if ($TerraformBackendConfig) {
        Write-Success "✓ Terraform backend config: $TerraformBackendConfig"
    }
    
    # Validate customer prefix format
    if ($CustomerPrefix -notmatch "^[a-zA-Z0-9]{3,10}$") {
        throw "Customer prefix must be 3-10 alphanumeric characters. Current value: $CustomerPrefix"
    }
    
    # Validate environment
    if ($Environment -notin @("dev", "staging", "prod")) {
        throw "Environment must be one of: dev, staging, prod. Current value: $Environment"
    }
    
    # Validate location
    $validLocations = @(
        "eastus", "eastus2", "southcentralus", "westus2", "westus3",
        "australiaeast", "southeastasia", "northeurope", "swedencentral", "uksouth",
        "westeurope", "centralus", "northcentralus", "westcentralus", "canadacentral",
        "canadaeast", "brazilsouth", "centralindia", "japaneast", "koreacentral"
    )
    if ($Location -notin $validLocations) {
        throw "Location must be a valid Azure region. Current value: $Location"
    }
    
    Write-Success "✓ All parameters are valid!"
}

# Function to set up Terraform backend
function Set-TerraformBackend {
    if ($TerraformBackendConfig) {
        Write-Info "Setting up Terraform backend..."
        try {
            terraform init -backend-config="$TerraformBackendConfig"
            Write-Success "✓ Terraform backend configured successfully"
        }
        catch {
            throw "Failed to configure Terraform backend: $_"
        }
    } else {
        Write-Info "Initializing Terraform..."
        try {
            terraform init
            Write-Success "✓ Terraform initialized successfully"
        }
        catch {
            throw "Failed to initialize Terraform: $_"
        }
    }
}

# Function to run Terraform plan
function Invoke-TerraformPlan {
    if ($SkipPlan) {
        Write-Warning "Skipping Terraform plan as requested"
        return
    }
    
    Write-Info "Running Terraform plan..."
    try {
        $planOutput = terraform plan -var-file="$TerraformVarsFile" -out="terraform.tfplan"
        
        if ($LASTEXITCODE -ne 0) {
            throw "Terraform plan failed with exit code: $LASTEXITCODE"
        }
        
        Write-Success "✓ Terraform plan completed successfully"
        
        # Show plan summary
        $planSummary = terraform show -json terraform.tfplan | ConvertFrom-Json
        $resourceChanges = $planSummary.resource_changes
        
        Write-Info "Plan Summary:"
        Write-Info "  Resources to add: $($resourceChanges | Where-Object { $_.change.actions -contains 'create' } | Measure-Object | Select-Object -ExpandProperty Count)"
        Write-Info "  Resources to change: $($resourceChanges | Where-Object { $_.change.actions -contains 'update' } | Measure-Object | Select-Object -ExpandProperty Count)"
        Write-Info "  Resources to destroy: $($resourceChanges | Where-Object { $_.change.actions -contains 'delete' } | Measure-Object | Select-Object -ExpandProperty Count)"
        
        # Ask for confirmation if not auto-approving
        if (-not $AutoApprove) {
            $confirmation = Read-Host "Do you want to proceed with the deployment? (y/N)"
            if ($confirmation -ne "y" -and $confirmation -ne "Y") {
                Write-Warning "Deployment cancelled by user"
                exit 0
            }
        }
    }
    catch {
        throw "Terraform plan failed: $_"
    }
}

# Function to run Terraform apply
function Invoke-TerraformApply {
    Write-Info "Applying Terraform configuration..."
    try {
        if ($Destroy) {
            Write-Warning "DESTROYING INFRASTRUCTURE - This action cannot be undone!"
            if (-not $AutoApprove) {
                $confirmation = Read-Host "Are you sure you want to destroy the infrastructure? Type 'yes' to confirm"
                if ($confirmation -ne "yes") {
                    Write-Warning "Destroy operation cancelled by user"
                    exit 0
                }
            }
            terraform destroy -var-file="$TerraformVarsFile" -auto-approve
        } else {
            if ($SkipPlan) {
                terraform apply -var-file="$TerraformVarsFile" -auto-approve
            } else {
                terraform apply "terraform.tfplan"
            }
        }
        
        if ($LASTEXITCODE -ne 0) {
            throw "Terraform apply failed with exit code: $LASTEXITCODE"
        }
        
        if ($Destroy) {
            Write-Success "✓ Infrastructure destroyed successfully"
        } else {
            Write-Success "✓ Infrastructure deployed successfully"
        }
    }
    catch {
        throw "Terraform apply failed: $_"
    }
}

# Function to show deployment outputs
function Show-DeploymentOutputs {
    if ($Destroy) {
        Write-Info "Infrastructure destroyed - no outputs to show"
        return
    }
    
    Write-Info "Retrieving deployment outputs..."
    try {
        $outputs = terraform output -json | ConvertFrom-Json
        
        Write-Info "=================================================================="
        Write-Info "DEPLOYMENT OUTPUTS"
        Write-Info "=================================================================="
        
        # Display key outputs
        if ($outputs.frontend_url) {
            Write-Success "Frontend URL: $($outputs.frontend_url.value)"
        }
        if ($outputs.backend_url) {
            Write-Success "Backend URL: $($outputs.backend_url.value)"
        }
        if ($outputs.resource_group_name) {
            Write-Success "Resource Group: $($outputs.resource_group_name.value)"
        }
        
        # Show next steps
        if ($outputs.next_steps) {
            Write-Info ""
            Write-Info "NEXT STEPS:"
            foreach ($step in $outputs.next_steps.value) {
                Write-Info "  $step"
            }
        }
        
        Write-Info "=================================================================="
    }
    catch {
        Write-Warning "Could not retrieve deployment outputs: $_"
    }
}

# Function to validate deployment
function Test-Deployment {
    if ($Destroy) {
        Write-Info "Skipping deployment validation for destroy operation"
        return
    }
    
    Write-Info "Validating deployment..."
    
    try {
        # Get resource group name from outputs
        $resourceGroupName = terraform output -raw resource_group_name
        
        # Check if resource group exists
        $rgExists = az group exists --name $resourceGroupName
        if ($rgExists -eq "false") {
            throw "Resource group not found: $resourceGroupName"
        }
        Write-Success "✓ Resource group exists: $resourceGroupName"
        
        # Check if key resources exist
        $resources = @(
            "Microsoft.Web/serverFarms",
            "Microsoft.Web/sites",
            "Microsoft.DocumentDB/databaseAccounts",
            "Microsoft.Storage/storageAccounts",
            "Microsoft.ContainerRegistry/registries",
            "Microsoft.KeyVault/vaults"
        )
        
        foreach ($resourceType in $resources) {
            $resourceList = az resource list --resource-group $resourceGroupName --resource-type $resourceType --output json | ConvertFrom-Json
            if ($resourceList.Count -gt 0) {
                Write-Success "✓ $resourceType resources found: $($resourceList.Count)"
            } else {
                Write-Warning "⚠ No $resourceType resources found"
            }
        }
        
        Write-Success "✓ Deployment validation completed"
    }
    catch {
        Write-Warning "Deployment validation failed: $_"
    }
}

# Function to clean up temporary files
function Remove-TemporaryFiles {
    Write-Info "Cleaning up temporary files..."
    
    $tempFiles = @(
        "terraform.tfplan",
        ".terraform.lock.hcl"
    )
    
    foreach ($file in $tempFiles) {
        if (Test-Path $file) {
            Remove-Item $file -Force
            Write-Success "✓ Removed: $file"
        }
    }
}

# Main execution
try {
    # Check prerequisites
    Test-Prerequisites
    
    # Validate parameters
    Test-Parameters
    
    # Validate Azure authentication
    Test-AzureAuthentication
    
    # Set up Terraform backend
    Set-TerraformBackend
    
    # Run Terraform plan (unless skipped)
    Invoke-TerraformPlan
    
    # Run Terraform apply
    Invoke-TerraformApply
    
    # Show deployment outputs
    Show-DeploymentOutputs
    
    # Validate deployment
    Test-Deployment
    
    # Clean up
    Remove-TemporaryFiles
    
    Write-Success ""
    Write-Success "=================================================================="
    if ($Destroy) {
        Write-Success "INFRASTRUCTURE DESTROYED SUCCESSFULLY"
    } else {
        Write-Success "INFRASTRUCTURE DEPLOYED SUCCESSFULLY"
    }
    Write-Success "=================================================================="
}
catch {
    Write-Error ""
    Write-Error "=================================================================="
    Write-Error "DEPLOYMENT FAILED"
    Write-Error "=================================================================="
    Write-Error "Error: $_"
    Write-Error ""
    Write-Error "Please check the error details above and try again."
    Write-Error "If the issue persists, contact your DevOps team."
    
    # Clean up on failure
    Remove-TemporaryFiles
    
    exit 1
}
finally {
    # Always show final status
    Write-Host ""
    Write-Info "Deployment script completed at: $(Get-Date)"
}
