#!/bin/bash

# =============================================================================
# STUDIO INFRASTRUCTURE DEPLOYMENT SCRIPT
# =============================================================================
# Simple, beginner-friendly deployment script for Azure resources using Bicep
# 
# This script:
# 1. Validates prerequisites 
# 2. Authenticates to Azure
# 3. Creates deployment
# 4. Shows results
#
# Usage:
#   ./deploy.sh dev                    # Deploy development environment
#   ./deploy.sh prod                   # Deploy production environment
#   ./deploy.sh dev --no-confirm       # Deploy without confirmation prompts
# =============================================================================

# Color codes for pretty output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Helper functions
log_info() { echo -e "${CYAN}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_header() { echo -e "\n${BLUE}🚀 $1${NC}\n"; }

# Script variables
ENVIRONMENT=""
PARAMETERS_FILE=""
NO_CONFIRM=false
DEPLOYMENT_NAME=""
SUBSCRIPTION_ID=""
DEPLOYMENT_LOCATION="eastus"

# Show usage
show_usage() {
    echo "Usage: $0 <environment> [options]"
    echo ""
    echo "Environments:"
    echo "  dev      Deploy development environment (cheap, basic features)"
    echo "  prod     Deploy production environment (robust, all features)"
    echo ""
    echo "Options:"
    echo "  --no-confirm     Skip confirmation prompts (for automation)"
    echo "  --help          Show this help"
    echo ""
    echo "Examples:"
    echo "  $0 dev"
    echo "  $0 prod --no-confirm"
}

# Parse command line arguments
parse_args() {
    if [[ $# -eq 0 ]]; then
        log_error "Environment is required!"
        echo "Usage: $0 <environment>"
        echo "Examples: $0 dev, $0 prod, $0 test-run, $0 customer-name"
        exit 1
    fi

    ENVIRONMENT=$1

    # Remove the hardcoded validation - allow any environment name
    # The script will check if the corresponding parameters file exists
    
    PARAMETERS_FILE="parameters.${ENVIRONMENT}.json"
    DEPLOYMENT_NAME="studio-${ENVIRONMENT}-$(date +%Y%m%d-%H%M%S)"
}

# Check if required tools are installed
check_prerequisites() {
    log_header "Checking Prerequisites"
    
    # Check Azure CLI
    if ! command -v az &> /dev/null; then
        log_error "Azure CLI is not installed!"
        log_info "Install from: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
        exit 1
    fi
    log_success "Azure CLI is installed"
    
    # Check jq for JSON parsing
    if ! command -v jq &> /dev/null; then
        log_error "jq is not installed!"
        log_info "Install with: sudo apt install jq (Ubuntu) or brew install jq (Mac)"
        exit 1
    fi
    log_success "jq is installed"
    
    # Check parameters file exists
    if [[ ! -f "$PARAMETERS_FILE" ]]; then
        log_error "Parameters file not found: $PARAMETERS_FILE"
        log_info "Copy parameters.template.json to $PARAMETERS_FILE and customize it"
        exit 1
    fi
    log_success "Parameters file found: $PARAMETERS_FILE"
    
    # Check main.bicep exists
    if [[ ! -f "main.bicep" ]]; then
        log_error "main.bicep not found! Are you in the bicep directory?"
        exit 1
    fi
    log_success "main.bicep found"
}

# Authenticate to Azure and validate subscription
check_azure_auth() {
    log_header "Azure Authentication"
    
    # Check if logged in
    if ! az account show &> /dev/null; then
        log_warning "Not logged into Azure. Starting login..."
        az login
    fi
    
    # Get account info
    local account_info
    account_info=$(az account show --output json)
    
    local user_name
    user_name=$(echo "$account_info" | jq -r '.user.name')
    local subscription_name
    subscription_name=$(echo "$account_info" | jq -r '.name')
    SUBSCRIPTION_ID=$(echo "$account_info" | jq -r '.id')
    local state
    state=$(echo "$account_info" | jq -r '.state')
    
    log_success "Logged in as: $user_name"
    log_success "Subscription: $subscription_name"
    log_success "Subscription ID: $SUBSCRIPTION_ID"
    
    if [[ "$state" != "Enabled" ]]; then
        log_error "Subscription is not active. Current state: $state"
        exit 1
    fi
    
    # Show current Azure location for deployment
    log_info "Deployment location: $DEPLOYMENT_LOCATION"
}

# Show deployment preview
show_deployment_preview() {
    log_header "Deployment Preview"
    
    log_info "Environment: $ENVIRONMENT"
    log_info "Parameters file: $PARAMETERS_FILE"
    log_info "Deployment name: $DEPLOYMENT_NAME"
    
    # Extract some key parameters to show user
    log_info "Extracting parameters from $PARAMETERS_FILE..."
    
    # Test jq first
    if ! jq --version >/dev/null 2>&1; then
        log_error "jq is not working properly"
        exit 1
    fi
    
    # Test the file can be read
    if ! jq empty "$PARAMETERS_FILE" 2>/dev/null; then
        log_error "Cannot parse $PARAMETERS_FILE as JSON"
        exit 1
    fi
    
    local customer_prefix
    customer_prefix=$(jq -r '.parameters.customerPrefix.value' "$PARAMETERS_FILE" 2>/dev/null || echo "unknown")
    local location
    location=$(jq -r '.parameters.location.value' "$PARAMETERS_FILE" 2>/dev/null || echo "unknown")
    local app_sku
    app_sku=$(jq -r '.parameters.appServicePlanSku.value' "$PARAMETERS_FILE" 2>/dev/null || echo "unknown")
    
    log_info "Customer prefix: $customer_prefix"
    log_info "Azure region: $location"
    log_info "App Service SKU: $app_sku"
    
    # Check if sensitive values are still template placeholders
    local tenant_id
    tenant_id=$(jq -r '.parameters.tenantId.value' "$PARAMETERS_FILE" 2>/dev/null || echo "unknown")
    if [[ "$tenant_id" == "REPLACE_WITH_YOUR_TENANT_ID" ]] || [[ "$tenant_id" == "YOUR_TENANT_ID_HERE" ]]; then
        log_error "Please update the tenant ID in $PARAMETERS_FILE"
        exit 1
    fi
    
    # Show estimated monthly cost
    if [[ "$ENVIRONMENT" == "dev" ]]; then
        log_info "Estimated monthly cost: $50-100 USD"
    else
        log_info "Estimated monthly cost: $300-800 USD"
    fi
    
    # Confirm with user
    if [[ "$NO_CONFIRM" != true ]]; then
        echo ""
        REPLY=""
        read -p "Continue with deployment? (y/N): " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_warning "Deployment cancelled by user"
            exit 0
        fi
    fi
}

# Run the actual deployment
deploy_resources() {
    log_header "Starting Deployment"
    
    log_info "Creating Azure resources..."
    log_info "This will take 5-15 minutes depending on your configuration"
    
    # Run the deployment
    if ! az deployment sub create \
        --location "$DEPLOYMENT_LOCATION" \
        --name "$DEPLOYMENT_NAME" \
        --template-file main.bicep \
        --parameters "@$PARAMETERS_FILE" \
        --output table; then
        log_error "Deployment failed!"
        log_info "Check the Azure portal for error details: https://portal.azure.com"
        exit 1
    fi
    
    log_success "Deployment completed successfully!"
}

# Show deployment results
show_results() {
    log_header "Deployment Results"
    
    # Get deployment outputs
    local outputs
    outputs=$(az deployment sub show \
        --name "$DEPLOYMENT_NAME" \
        --query 'properties.outputs' \
        --output json)
    
    if [[ -z "$outputs" || "$outputs" == "null" ]]; then
        log_warning "No deployment outputs available"
        return
    fi
    
    # Show key URLs
    local frontend_url
    frontend_url=$(echo "$outputs" | jq -r '.frontendUrl.value // empty')
    if [[ -n "$frontend_url" ]]; then
        log_success "Frontend URL: $frontend_url"
    fi
    
    local backend_url
    backend_url=$(echo "$outputs" | jq -r '.backendUrl.value // empty')
    if [[ -n "$backend_url" ]]; then
        log_success "Backend API URL: $backend_url"
    fi
    
    local resource_group
    resource_group=$(echo "$outputs" | jq -r '.resourceGroupName.value // empty')
    if [[ -n "$resource_group" ]]; then
        log_success "Resource Group: $resource_group"
    fi
    
    # Show next steps
    echo ""
    log_info "NEXT STEPS:"
    log_info "1. Upload your application code to the frontend URL above"
    log_info "2. Configure Azure AD app registration with redirect URI: ${frontend_url}/auth/callback"
    log_info "3. Test the application endpoints"
    log_info "4. Set up CI/CD pipeline for code deployments"
    
    echo ""
    log_success "🎉 Deployment completed successfully!"
    log_info "View resources in Azure Portal: https://portal.azure.com"
}

# Main execution
main() {
    # Show header
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "    STUDIO INFRASTRUCTURE DEPLOYMENT"
    echo "    Simple Azure deployment using Bicep"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
    
    # Parse arguments and validate
    parse_args "$@"
    check_prerequisites
    check_azure_auth
    show_deployment_preview
    
    # Deploy resources
    deploy_resources
    
    # Show results
    show_results
}

# Handle interruption
trap 'log_error "Deployment interrupted"; exit 1' INT TERM

# Run main function
main "$@"