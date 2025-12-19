#!/bin/bash

# =============================================================================
# STUDIO INFRASTRUCTURE VALIDATION SCRIPT
# =============================================================================
# Simple validation script to check prerequisites and configuration
# Run this before deployment to catch issues early
#
# Usage:
#   ./validate.sh dev     # Validate development environment config
#   ./validate.sh prod    # Validate production environment config
# =============================================================================

set -euo pipefail

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Helper functions
log_info() { echo -e "${CYAN}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_header() { echo -e "\n${BLUE}🔍 $1${NC}\n"; }

# Variables
ENVIRONMENT=""
PARAMETERS_FILE=""
ERRORS=0
WARNINGS=0

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
}

# Check system prerequisites
check_system_prerequisites() {
    log_header "System Prerequisites"
    
    # Check Azure CLI
    if command -v az &> /dev/null; then
        local az_version
        az_version=$(az version --query '"azure-cli"' --output tsv 2>/dev/null || echo "unknown")
        log_success "Azure CLI installed (version: $az_version)"
    else
        log_error "Azure CLI is not installed"
        log_info "Install from: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
        ((ERRORS++))
    fi
    
    # Check jq
    if command -v jq &> /dev/null; then
        local jq_version
        jq_version=$(jq --version 2>/dev/null || echo "unknown")
        log_success "jq installed ($jq_version)"
    else
        log_error "jq is not installed"
        log_info "Install with: sudo apt install jq (Ubuntu) or brew install jq (Mac)"
        ((ERRORS++))
    fi
    
    # Check curl
    if command -v curl &> /dev/null; then
        log_success "curl available"
    else
        log_warning "curl not found (recommended for testing endpoints)"
        ((WARNINGS++))
    fi
}

# Check Azure authentication
check_azure_auth() {
    log_header "Azure Authentication"
    
    if az account show &> /dev/null; then
        local account_info
        account_info=$(az account show --output json)
        
        local user_name
        user_name=$(echo "$account_info" | jq -r '.user.name')
        local subscription_name
        subscription_name=$(echo "$account_info" | jq -r '.name')
        local subscription_id
        subscription_id=$(echo "$account_info" | jq -r '.id')
        local state
        state=$(echo "$account_info" | jq -r '.state')
        
        log_success "Authenticated as: $user_name"
        log_success "Subscription: $subscription_name"
        log_success "Subscription ID: $subscription_id"
        
        if [[ "$state" != "Enabled" ]]; then
            log_error "Subscription is not active (state: $state)"
            ((ERRORS++))
        else
            log_success "Subscription is active"
        fi
    else
        log_error "Not authenticated to Azure"
        log_info "Run: az login"
        ((ERRORS++))
    fi
}

# Check files
check_files() {
    log_header "Configuration Files"
    
    # Check main.bicep
    if [[ -f "main.bicep" ]]; then
        log_success "main.bicep exists"
    else
        log_error "main.bicep not found"
        ((ERRORS++))
    fi
    
    # Check parameters file
    if [[ -f "$PARAMETERS_FILE" ]]; then
        log_success "$PARAMETERS_FILE exists"
        
        # Check if it's valid JSON
        if jq empty "$PARAMETERS_FILE" 2>/dev/null; then
            log_success "$PARAMETERS_FILE is valid JSON"
        else
            log_error "$PARAMETERS_FILE is not valid JSON"
            ((ERRORS++))
        fi
    else
        log_error "$PARAMETERS_FILE not found"
        log_info "Copy parameters.template.json to $PARAMETERS_FILE and customize it"
        ((ERRORS++))
    fi
    
    # Check modules directory
    if [[ -d "modules" ]]; then
        local module_count
        module_count=$(find modules -name "*.bicep" | wc -l)
        log_success "modules directory exists ($module_count modules found)"
    else
        log_error "modules directory not found"
        ((ERRORS++))
    fi
}

# Validate parameters
validate_parameters() {
    log_header "Parameter Validation"
    
    if [[ ! -f "$PARAMETERS_FILE" ]]; then
        log_error "Cannot validate parameters - file not found"
        return
    fi
    
    # Extract parameters
    local params
    params=$(jq -r '.parameters' "$PARAMETERS_FILE" 2>/dev/null || echo "{}")
    
    if [[ "$params" == "{}" ]]; then
        log_error "Could not read parameters from $PARAMETERS_FILE"
        ((ERRORS++))
        return
    fi
    
    # Check customer prefix
    local customer_prefix
    customer_prefix=$(echo "$params" | jq -r '.customerPrefix.value // empty')
    if [[ -z "$customer_prefix" || "$customer_prefix" == "REPLACE_WITH_CUSTOMER_NAME" ]]; then
        log_error "Customer prefix not set in $PARAMETERS_FILE"
        ((ERRORS++))
    elif [[ ${#customer_prefix} -lt 3 || ${#customer_prefix} -gt 10 ]]; then
        log_error "Customer prefix must be 3-10 characters (current: ${#customer_prefix})"
        ((ERRORS++))
    elif [[ ! "$customer_prefix" =~ ^[a-zA-Z0-9]+$ ]]; then
        log_error "Customer prefix must be alphanumeric only"
        ((ERRORS++))
    else
        log_success "Customer prefix: $customer_prefix"
    fi
    
    # Check tenant ID
    local tenant_id
    tenant_id=$(echo "$params" | jq -r '.tenantId.value // empty')
    if [[ -z "$tenant_id" || "$tenant_id" == "REPLACE_WITH_YOUR_TENANT_ID" || "$tenant_id" == "YOUR_TENANT_ID_HERE" ]]; then
        log_error "Tenant ID not configured in $PARAMETERS_FILE"
        ((ERRORS++))
    else
        log_success "Tenant ID configured"
    fi
    
    # Check client ID
    local client_id
    client_id=$(echo "$params" | jq -r '.clientId.value // empty')
    if [[ -z "$client_id" || "$client_id" == "REPLACE_WITH_YOUR_CLIENT_ID" || "$client_id" == "YOUR_CLIENT_ID_HERE" ]]; then
        log_error "Client ID not configured in $PARAMETERS_FILE"
        ((ERRORS++))
    else
        log_success "Client ID configured"
    fi
    
    # Check passwords
    local postgres_password
    postgres_password=$(echo "$params" | jq -r '.postgresPassword.value // empty')
    if [[ -z "$postgres_password" || "$postgres_password" == "REPLACE_WITH_SECURE_PASSWORD" ]]; then
        log_error "PostgreSQL password not set in $PARAMETERS_FILE"
        ((ERRORS++))
    elif [[ ${#postgres_password} -lt 8 ]]; then
        log_warning "PostgreSQL password is quite short (recommended: 12+ characters)"
        ((WARNINGS++))
    else
        log_success "PostgreSQL password configured"
    fi
    
    # Check location
    local location
    location=$(echo "$params" | jq -r '.location.value // empty')
    if [[ -n "$location" ]]; then
        log_success "Azure location: $location"
    else
        log_warning "Azure location not specified, will use default"
        ((WARNINGS++))
    fi
    
    # Environment-specific checks
    local app_sku
    app_sku=$(echo "$params" | jq -r '.appServicePlanSku.value // empty')
    if [[ "$ENVIRONMENT" == "dev" && "$app_sku" != "B1" ]]; then
        log_warning "Consider using B1 SKU for development to save costs"
        ((WARNINGS++))
    elif [[ "$ENVIRONMENT" == "prod" && "$app_sku" == "B1" ]]; then
        log_warning "B1 SKU may not be suitable for production workloads"
        ((WARNINGS++))
    fi
    
    log_success "App Service SKU: $app_sku"
}

# Validate Bicep syntax
validate_bicep_syntax() {
    log_header "Bicep Syntax Validation"
    
    if ! command -v az &> /dev/null; then
        log_warning "Cannot validate Bicep syntax - Azure CLI not available"
        return
    fi
    
    log_info "Validating main.bicep syntax..."
    
    if az bicep build --file main.bicep --stdout > /dev/null 2>&1; then
        log_success "main.bicep syntax is valid"
    else
        log_error "main.bicep has syntax errors"
        log_info "Run: az bicep build --file main.bicep"
        ((ERRORS++))
    fi
}

# Check Azure resource providers
check_resource_providers() {
    log_header "Azure Resource Providers"
    
    if ! az account show &> /dev/null; then
        log_warning "Cannot check resource providers - not authenticated to Azure"
        return
    fi
    
    local required_providers=(
        "Microsoft.Web"
        "Microsoft.DocumentDB"
        "Microsoft.Storage"
        "Microsoft.KeyVault"
        "Microsoft.CognitiveServices"
        "Microsoft.Insights"
        "Microsoft.OperationalInsights"
        "Microsoft.Network"
    )
    
    for provider in "${required_providers[@]}"; do
        local state
        state=$(az provider show --namespace "$provider" --query 'registrationState' --output tsv 2>/dev/null || echo "Unknown")
        
        if [[ "$state" == "Registered" ]]; then
            log_success "$provider is registered"
        elif [[ "$state" == "Unknown" ]]; then
            log_warning "$provider status unknown"
            ((WARNINGS++))
        else
            log_error "$provider is not registered (state: $state)"
            log_info "Register with: az provider register --namespace $provider"
            ((ERRORS++))
        fi
    done
}

# Show summary
show_summary() {
    log_header "Validation Summary"
    
    if [[ $ERRORS -eq 0 && $WARNINGS -eq 0 ]]; then
        log_success "🎉 All checks passed! Ready for deployment"
        echo ""
        log_info "Deploy with: ./scripts/deploy.sh $ENVIRONMENT"
    elif [[ $ERRORS -eq 0 ]]; then
        log_warning "⚠️  Validation passed with $WARNINGS warning(s)"
        echo ""
        log_info "You can proceed with deployment, but consider addressing the warnings"
        log_info "Deploy with: ./scripts/deploy.sh $ENVIRONMENT"
    else
        log_error "❌ Validation failed with $ERRORS error(s) and $WARNINGS warning(s)"
        echo ""
        log_info "Please fix all errors before deployment"
    fi
    
    echo ""
    log_info "Errors: $ERRORS"
    log_info "Warnings: $WARNINGS"
}

# Main execution
main() {
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "    STUDIO INFRASTRUCTURE VALIDATION"
    echo "    Checking configuration and prerequisites"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
    
    parse_args "$@"
    
    check_system_prerequisites
    check_azure_auth
    check_files
    validate_parameters
    validate_bicep_syntax
    check_resource_providers
    
    show_summary
    
    # Exit with error code if there are errors
    if [[ $ERRORS -gt 0 ]]; then
        exit 1
    fi
}

main "$@"