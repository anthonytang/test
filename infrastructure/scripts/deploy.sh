#!/bin/bash

# =============================================================================
# Studio Infrastructure Deployment Script
# =============================================================================
# This script deploys the complete Studio infrastructure stack to Azure using Terraform.
# It includes parameter validation, Azure authentication, Terraform operations, and post-deployment validation.
#
# Requirements:
# - Azure CLI
# - Terraform
# - Bash 4.0+
#
# Usage:
#   ./deploy.sh -c "acme" -e "dev" -l "eastus"
#   ./deploy.sh -c "contoso" -e "prod" -l "westus2" --auto-approve
# =============================================================================

set -euo pipefail

# Script configuration
SCRIPT_VERSION="1.0.0"
REQUIRED_TERRAFORM_VERSION="1.0.0"
REQUIRED_AZ_CLI_VERSION="2.0.0"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Color functions
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_info() { echo -e "${CYAN}ℹ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }
print_header() { echo -e "${BLUE}$1${NC}"; }

# Default values
CUSTOMER_PREFIX=""
ENVIRONMENT=""
LOCATION=""
TERRAFORM_VARS_FILE="terraform.tfvars"
TERRAFORM_BACKEND_CONFIG=""
SKIP_PLAN=false
AUTO_APPROVE=false
DESTROY=false

# Function to display usage
show_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Required Options:
  -c, --customer-prefix PREFIX    Customer prefix for resource naming (3-10 alphanumeric chars)
  -e, --environment ENV           Environment name (dev, staging, prod)
  -l, --location LOCATION        Azure region for resources

Optional Options:
  -f, --vars-file FILE           Terraform variables file (default: terraform.tfvars)
  -b, --backend-config FILE      Terraform backend configuration file
  -s, --skip-plan                Skip terraform plan step
  -a, --auto-approve             Automatically approve terraform apply
  -d, --destroy                  Destroy infrastructure instead of creating
  -h, --help                     Show this help message

Examples:
  $0 -c "acme" -e "dev" -l "eastus"
  $0 -c "contoso" -e "prod" -l "westus2" --auto-approve
  $0 -c "fabrikam" -e "staging" -l "westeurope" --destroy

EOF
}

# Function to parse command line arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -c|--customer-prefix)
                CUSTOMER_PREFIX="$2"
                shift 2
                ;;
            -e|--environment)
                ENVIRONMENT="$2"
                shift 2
                ;;
            -l|--location)
                LOCATION="$2"
                shift 2
                ;;
            -f|--vars-file)
                TERRAFORM_VARS_FILE="$2"
                shift 2
                ;;
            -b|--backend-config)
                TERRAFORM_BACKEND_CONFIG="$2"
                shift 2
                ;;
            -s|--skip-plan)
                SKIP_PLAN=true
                shift
                ;;
            -a|--auto-approve)
                AUTO_APPROVE=true
                shift
                ;;
            -d|--destroy)
                DESTROY=true
                shift
                ;;
            -h|--help)
                show_usage
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
}

# Function to validate required parameters
validate_parameters() {
    local errors=()
    
    if [[ -z "$CUSTOMER_PREFIX" ]]; then
        errors+=("Customer prefix is required")
    elif [[ ! "$CUSTOMER_PREFIX" =~ ^[a-zA-Z0-9]{3,10}$ ]]; then
        errors+=("Customer prefix must be 3-10 alphanumeric characters")
    fi
    
    if [[ -z "$ENVIRONMENT" ]]; then
        errors+=("Environment is required")
    elif [[ ! "$ENVIRONMENT" =~ ^(dev|staging|prod)$ ]]; then
        errors+=("Environment must be dev, staging, or prod")
    fi
    
    if [[ -z "$LOCATION" ]]; then
        errors+=("Location is required")
    fi
    
    if [[ ${#errors[@]} -gt 0 ]]; then
        print_error "Parameter validation failed:"
        for error in "${errors[@]}"; do
            print_error "  - $error"
        done
        exit 1
    fi
}

# Function to check prerequisites
check_prerequisites() {
    print_info "Checking prerequisites..."
    
    # Check Bash version
    if [[ ${BASH_VERSION%%.*} -lt 4 ]]; then
        print_error "Bash 4.0 or higher is required. Current version: $BASH_VERSION"
        exit 1
    fi
    print_success "Bash version: $BASH_VERSION"
    
    # Check Azure CLI
    if ! command -v az &> /dev/null; then
        print_error "Azure CLI is not installed. Please install Azure CLI and try again."
        exit 1
    fi
    
    local az_version
    az_version=$(az version --query '"azure-cli"' --output tsv)
    if [[ $(echo "$az_version $REQUIRED_AZ_CLI_VERSION" | tr ' ' '\n' | sort -V | head -n1) != "$REQUIRED_AZ_CLI_VERSION" ]]; then
        print_error "Azure CLI version $REQUIRED_AZ_CLI_VERSION or higher is required. Current version: $az_version"
        exit 1
    fi
    print_success "Azure CLI version: $az_version"
    
    # Check Terraform
    if ! command -v terraform &> /dev/null; then
        print_error "Terraform is not installed. Please install Terraform and try again."
        exit 1
    fi
    
    local tf_version
    tf_version=$(terraform version -json | jq -r '.terraform_version')
    if [[ $(echo "$tf_version $REQUIRED_TERRAFORM_VERSION" | tr ' ' '\n' | sort -V | head -n1) != "$REQUIRED_TERRAFORM_VERSION" ]]; then
        print_error "Terraform version $REQUIRED_TERRAFORM_VERSION or higher is required. Current version: $tf_version"
        exit 1
    fi
    print_success "Terraform version: $tf_version"
    
    # Check jq for JSON parsing
    if ! command -v jq &> /dev/null; then
        print_error "jq is not installed. Please install jq for JSON parsing."
        exit 1
    fi
    print_success "jq is available"
    
    print_success "All prerequisites are satisfied!"
}

# Function to validate Azure authentication
validate_azure_auth() {
    print_info "Validating Azure authentication..."
    
    if ! az account show &> /dev/null; then
        print_error "Azure authentication failed. Please run 'az login' and try again."
        exit 1
    fi
    
    local account_info
    account_info=$(az account show --output json)
    
    local user_name
    user_name=$(echo "$account_info" | jq -r '.user.name')
    local subscription_name
    subscription_name=$(echo "$account_info" | jq -r '.name')
    local subscription_id
    subscription_id=$(echo "$account_info" | jq -r '.id')
    local tenant_id
    tenant_id=$(echo "$account_info" | jq -r '.tenantId')
    local state
    state=$(echo "$account_info" | jq -r '.state')
    
    print_success "Authenticated as: $user_name"
    print_success "Subscription: $subscription_name ($subscription_id)"
    print_success "Tenant: $tenant_id"
    
    if [[ "$state" != "Enabled" ]]; then
        print_error "Subscription is not active. Current state: $state"
        exit 1
    fi
    
    # Check permissions
    local role_assignments
    role_assignments=$(az role assignment list --assignee "$user_name" --scope "/subscriptions/$subscription_id" --output json)
    local has_permission
    has_permission=$(echo "$role_assignments" | jq -r '.[] | select(.roleDefinitionName | IN("Contributor", "Owner")) | .roleDefinitionName' | head -n1)
    
    if [[ -z "$has_permission" ]]; then
        print_warning "Warning: User may not have sufficient permissions. Contributor or Owner role is recommended."
    else
        print_success "User has sufficient permissions: $has_permission"
    fi
}

# Function to validate files
validate_files() {
    print_info "Validating files..."
    
    if [[ ! -f "$TERRAFORM_VARS_FILE" ]]; then
        print_error "Terraform variables file not found: $TERRAFORM_VARS_FILE"
        exit 1
    fi
    print_success "Terraform variables file: $TERRAFORM_VARS_FILE"
    
    if [[ -n "$TERRAFORM_BACKEND_CONFIG" ]] && [[ ! -f "$TERRAFORM_BACKEND_CONFIG" ]]; then
        print_error "Terraform backend config file not found: $TERRAFORM_BACKEND_CONFIG"
        exit 1
    fi
    if [[ -n "$TERRAFORM_BACKEND_CONFIG" ]]; then
        print_success "Terraform backend config: $TERRAFORM_BACKEND_CONFIG"
    fi
    
    print_success "All files are valid!"
}

# Function to set up Terraform backend
setup_terraform_backend() {
    if [[ -n "$TERRAFORM_BACKEND_CONFIG" ]]; then
        print_info "Setting up Terraform backend..."
        if ! terraform init -backend-config="$TERRAFORM_BACKEND_CONFIG"; then
            print_error "Failed to configure Terraform backend"
            exit 1
        fi
        print_success "Terraform backend configured successfully"
    else
        print_info "Initializing Terraform..."
        if ! terraform init; then
            print_error "Failed to initialize Terraform"
            exit 1
        fi
        print_success "Terraform initialized successfully"
    fi
}

# Function to run Terraform plan
run_terraform_plan() {
    if [[ "$SKIP_PLAN" == true ]]; then
        print_warning "Skipping Terraform plan as requested"
        return
    fi
    
    print_info "Running Terraform plan..."
    
    if ! terraform plan -var-file="$TERRAFORM_VARS_FILE" -out="terraform.tfplan"; then
        print_error "Terraform plan failed"
        exit 1
    fi
    
    print_success "Terraform plan completed successfully"
    
    # Show plan summary
    local plan_summary
    plan_summary=$(terraform show -json terraform.tfplan)
    
    local resources_to_add
    resources_to_add=$(echo "$plan_summary" | jq -r '.resource_changes[] | select(.change.actions[] | contains("create")) | .change.actions[] | select(contains("create"))' | wc -l)
    local resources_to_change
    resources_to_change=$(echo "$plan_summary" | jq -r '.resource_changes[] | select(.change.actions[] | contains("update")) | .change.actions[] | select(contains("update"))' | wc -l)
    local resources_to_destroy
    resources_to_destroy=$(echo "$plan_summary" | jq -r '.resource_changes[] | select(.change.actions[] | contains("delete")) | .change.actions[] | select(contains("delete"))' | wc -l)
    
    print_info "Plan Summary:"
    print_info "  Resources to add: $resources_to_add"
    print_info "  Resources to change: $resources_to_change"
    print_info "  Resources to destroy: $resources_to_destroy"
    
    # Ask for confirmation if not auto-approving
    if [[ "$AUTO_APPROVE" != true ]]; then
        echo
        read -p "Do you want to proceed with the deployment? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_warning "Deployment cancelled by user"
            exit 0
        fi
    fi
}

# Function to run Terraform apply
run_terraform_apply() {
    print_info "Applying Terraform configuration..."
    
    if [[ "$DESTROY" == true ]]; then
        print_warning "DESTROYING INFRASTRUCTURE - This action cannot be undone!"
        if [[ "$AUTO_APPROVE" != true ]]; then
            echo
            read -p "Are you sure you want to destroy the infrastructure? Type 'yes' to confirm: " -r
            if [[ "$REPLY" != "yes" ]]; then
                print_warning "Destroy operation cancelled by user"
                exit 0
            fi
        fi
        if ! terraform destroy -var-file="$TERRAFORM_VARS_FILE" -auto-approve; then
            print_error "Terraform destroy failed"
            exit 1
        fi
        print_success "Infrastructure destroyed successfully"
    else
        if [[ "$SKIP_PLAN" == true ]]; then
            if ! terraform apply -var-file="$TERRAFORM_VARS_FILE" -auto-approve; then
                print_error "Terraform apply failed"
                exit 1
            fi
        else
            if ! terraform apply "terraform.tfplan"; then
                print_error "Terraform apply failed"
                exit 1
            fi
        fi
        print_success "Infrastructure deployed successfully"
    fi
}

# Function to show deployment outputs
show_deployment_outputs() {
    if [[ "$DESTROY" == true ]]; then
        print_info "Infrastructure destroyed - no outputs to show"
        return
    fi
    
    print_info "Retrieving deployment outputs..."
    
    if ! terraform output -json > /dev/null 2>&1; then
        print_warning "Could not retrieve deployment outputs"
        return
    fi
    
    local outputs
    outputs=$(terraform output -json)
    
    print_header "=================================================================="
    print_header "DEPLOYMENT OUTPUTS"
    print_header "=================================================================="
    
    # Display key outputs
    local frontend_url
    frontend_url=$(echo "$outputs" | jq -r '.frontend_url.value // empty')
    if [[ -n "$frontend_url" ]]; then
        print_success "Frontend URL: $frontend_url"
    fi
    
    local backend_url
    backend_url=$(echo "$outputs" | jq -r '.backend_url.value // empty')
    if [[ -n "$backend_url" ]]; then
        print_success "Backend URL: $backend_url"
    fi
    
    local resource_group_name
    resource_group_name=$(echo "$outputs" | jq -r '.resource_group_name.value // empty')
    if [[ -n "$resource_group_name" ]]; then
        print_success "Resource Group: $resource_group_name"
    fi
    
    # Show next steps
    local next_steps
    next_steps=$(echo "$outputs" | jq -r '.next_steps.value[]? // empty')
    if [[ -n "$next_steps" ]]; then
        echo
        print_info "NEXT STEPS:"
        echo "$next_steps" | while IFS= read -r step; do
            if [[ -n "$step" ]]; then
                print_info "  $step"
            fi
        done
    fi
    
    print_header "=================================================================="
}

# Function to validate deployment
validate_deployment() {
    if [[ "$DESTROY" == true ]]; then
        print_info "Skipping deployment validation for destroy operation"
        return
    fi
    
    print_info "Validating deployment..."
    
    # Get resource group name from outputs
    local resource_group_name
    resource_group_name=$(terraform output -raw resource_group_name 2>/dev/null || echo "")
    
    if [[ -z "$resource_group_name" ]]; then
        print_warning "Could not retrieve resource group name for validation"
        return
    fi
    
    # Check if resource group exists
    if ! az group exists --name "$resource_group_name" --output tsv | grep -q "true"; then
        print_error "Resource group not found: $resource_group_name"
        return
    fi
    print_success "Resource group exists: $resource_group_name"
    
    # Check if key resources exist
    local resource_types=(
        "Microsoft.Web/serverFarms"
        "Microsoft.Web/sites"
        "Microsoft.DocumentDB/databaseAccounts"
        "Microsoft.Storage/storageAccounts"
        "Microsoft.ContainerRegistry/registries"
        "Microsoft.KeyVault/vaults"
    )
    
    for resource_type in "${resource_types[@]}"; do
        local resource_list
        resource_list=$(az resource list --resource-group "$resource_group_name" --resource-type "$resource_type" --output json)
        local count
        count=$(echo "$resource_list" | jq '. | length')
        if [[ "$count" -gt 0 ]]; then
            print_success "$resource_type resources found: $count"
        else
            print_warning "No $resource_type resources found"
        fi
    done
    
    print_success "Deployment validation completed"
}

# Function to clean up temporary files
cleanup_temp_files() {
    print_info "Cleaning up temporary files..."
    
    local temp_files=("terraform.tfplan" ".terraform.lock.hcl")
    
    for file in "${temp_files[@]}"; do
        if [[ -f "$file" ]]; then
            rm -f "$file"
            print_success "Removed: $file"
        fi
    done
}

# Function to display script header
show_header() {
    print_header "=================================================================="
    print_header "Studio Infrastructure Deployment Script"
    print_header "Version: $SCRIPT_VERSION"
    print_header "Customer: $CUSTOMER_PREFIX"
    print_header "Environment: $ENVIRONMENT"
    print_header "Location: $LOCATION"
    print_header "=================================================================="
    echo
}

# Main execution
main() {
    # Parse command line arguments
    parse_arguments "$@"
    
    # Validate required parameters
    validate_parameters
    
    # Show header
    show_header
    
    # Check prerequisites
    check_prerequisites
    
    # Validate files
    validate_files
    
    # Validate Azure authentication
    validate_azure_auth
    
    # Set up Terraform backend
    setup_terraform_backend
    
    # Run Terraform plan (unless skipped)
    run_terraform_plan
    
    # Run Terraform apply
    run_terraform_apply
    
    # Show deployment outputs
    show_deployment_outputs
    
    # Validate deployment
    validate_deployment
    
    # Clean up
    cleanup_temp_files
    
    echo
    print_header "=================================================================="
    if [[ "$DESTROY" == true ]]; then
        print_success "INFRASTRUCTURE DESTROYED SUCCESSFULLY"
    else
        print_success "INFRASTRUCTURE DEPLOYED SUCCESSFULLY"
    fi
    print_header "=================================================================="
}

# Trap to handle script exit
trap 'print_error "Script interrupted"; cleanup_temp_files; exit 1' INT TERM

# Run main function with all arguments
main "$@"
