#!/bin/bash

# =============================================================================
# STUDIO INFRASTRUCTURE CLEANUP SCRIPT
# =============================================================================
# Simple cleanup script to delete all Azure resources
# CAREFUL: This will delete EVERYTHING for the environment
#
# Usage:
#   ./cleanup.sh dev              # Delete development environment
#   ./cleanup.sh prod --confirm   # Delete production (requires --confirm)
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
log_header() { echo -e "\n${BLUE}🗑️  $1${NC}\n"; }

# Variables
ENVIRONMENT=""
CONFIRM_FLAG=false
RESOURCE_GROUP_NAME=""
CUSTOMER_PREFIX=""

# Parse arguments
parse_args() {
    if [[ $# -eq 0 ]]; then
        log_error "Environment is required!"
        echo ""
        echo "Usage: $0 <environment> [--confirm]"
        echo ""
        echo "Environments:"
        echo "  dev      Delete development environment"
        echo "  prod     Delete production environment (requires --confirm)"
        echo ""
        echo "Options:"
        echo "  --confirm    Required for production environment deletion"
        echo ""
        exit 1
    fi

    ENVIRONMENT=$1
    shift

    while [[ $# -gt 0 ]]; do
        case $1 in
            --confirm)
                CONFIRM_FLAG=true
                shift
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done

    # Validate environment - allow any environment name
    # if [[ "$ENVIRONMENT" != "dev" && "$ENVIRONMENT" != "prod" ]]; then
    #     log_error "Environment must be 'dev' or 'prod'"
    #     exit 1
    # fi

    PARAMETERS_FILE="parameters.${ENVIRONMENT}.json"
}

# Check Azure authentication
check_azure_auth() {
    log_header "Azure Authentication Check"
    
    if ! az account show &> /dev/null; then
        log_error "Not authenticated to Azure"
        log_info "Run: az login"
        exit 1
    fi
    
    local account_info
    account_info=$(az account show --output json)
    
    local user_name
    user_name=$(echo "$account_info" | jq -r '.user.name')
    local subscription_name
    subscription_name=$(echo "$account_info" | jq -r '.name')
    
    log_success "Authenticated as: $user_name"
    log_success "Subscription: $subscription_name"
}

# Find resource group to delete
find_resource_group() {
    log_header "Finding Resources to Delete"
    
    # Try to read customer prefix from parameters file
    local parameters_file="parameters.${ENVIRONMENT}.json"
    if [[ -f "$parameters_file" ]]; then
        CUSTOMER_PREFIX=$(jq -r '.parameters.customerPrefix.value // empty' "$parameters_file" 2>/dev/null)
        if [[ "$CUSTOMER_PREFIX" == "null" || "$CUSTOMER_PREFIX" == "" ]]; then
            CUSTOMER_PREFIX=""
        fi
    fi
    
    if [[ -z "$CUSTOMER_PREFIX" ]]; then
        log_warning "Could not determine customer prefix from $parameters_file"
        echo ""
        read -p "Enter customer prefix (3-10 characters): " -r CUSTOMER_PREFIX
        
        if [[ -z "$CUSTOMER_PREFIX" || ${#CUSTOMER_PREFIX} -lt 3 || ${#CUSTOMER_PREFIX} -gt 10 ]]; then
            log_error "Invalid customer prefix"
            exit 1
        fi
    fi
    
    # Handle studio vs client naming convention
    if [[ "$CUSTOMER_PREFIX" == "studio" ]]; then
        RESOURCE_GROUP_NAME="studio-${ENVIRONMENT}-rg"
    else
        RESOURCE_GROUP_NAME="${CUSTOMER_PREFIX}-studio-${ENVIRONMENT}-rg"
    fi
    
    # Check if resource group exists
    if az group exists --name "$RESOURCE_GROUP_NAME" --output tsv | grep -q "true"; then
        log_success "Found resource group: $RESOURCE_GROUP_NAME"
    else
        log_warning "Resource group not found: $RESOURCE_GROUP_NAME"
        log_info "Nothing to delete"
        exit 0
    fi
}

# Show what will be deleted
show_deletion_preview() {
    log_header "Deletion Preview"
    
    log_warning "⚠️  DANGER ZONE ⚠️"
    log_warning "This will DELETE ALL resources in:"
    log_warning "Resource Group: $RESOURCE_GROUP_NAME"
    echo ""
    
    # List resources that will be deleted
    log_info "Resources to be deleted:"
    
    local resources
    resources=$(az resource list --resource-group "$RESOURCE_GROUP_NAME" --output table 2>/dev/null || echo "Could not list resources")
    
    if [[ "$resources" != "Could not list resources" ]]; then
        echo "$resources"
    else
        log_warning "Could not list resources (they may already be gone)"
    fi
    
    echo ""
    log_warning "This action CANNOT be undone!"
    log_warning "All data, configurations, and deployments will be lost!"
    
    # Show estimated cost savings
    if [[ "$ENVIRONMENT" == "dev" ]]; then
        log_info "This will stop ~\$50-100/month in Azure charges"
    else
        log_info "This will stop ~\$300-800/month in Azure charges"
    fi
    
    echo ""
}

# Confirm deletion
confirm_deletion() {
    if [[ "$ENVIRONMENT" == "prod" ]]; then
        log_warning "🚨 PRODUCTION ENVIRONMENT DELETION 🚨"
        echo ""
        echo "This will delete your PRODUCTION environment!"
        echo "All customer data and configurations will be lost!"
        echo ""
        read -p "Type 'DELETE PRODUCTION' to confirm: " -r confirmation
        
        if [[ "$confirmation" != "DELETE PRODUCTION" ]]; then
            log_info "Deletion cancelled - confirmation text did not match"
            exit 0
        fi
    else
        read -p "Type 'yes' to confirm deletion: " -r confirmation
        
        if [[ "$confirmation" != "yes" ]]; then
            log_info "Deletion cancelled"
            exit 0
        fi
    fi
}

# Delete the resources
delete_resources() {
    log_header "Deleting Resources"
    
    log_warning "Starting deletion of $RESOURCE_GROUP_NAME..."
    log_info "This may take 5-10 minutes..."
    
    # Delete the resource group (this deletes all resources inside it)
    if az group delete \
        --name "$RESOURCE_GROUP_NAME" \
        --yes \
        --no-wait; then
        
        log_success "Deletion initiated successfully"
        log_info "Resources are being deleted in the background"
        log_info "You can check progress in the Azure portal"
    else
        log_error "Failed to initiate deletion"
        log_info "Check the Azure portal for error details"
        exit 1
    fi
}

# Show cleanup results
show_cleanup_results() {
    log_header "Cleanup Summary"
    
    log_success "🧹 Cleanup completed successfully!"
    echo ""
    log_info "What happened:"
    log_info "✓ Resource group deletion initiated: $RESOURCE_GROUP_NAME"
    log_info "✓ All resources in the group will be deleted"
    log_info "✓ Monthly Azure charges will stop"
    echo ""
    log_info "Note: Deletion happens in the background and may take a few minutes"
    log_info "Check the Azure portal to monitor progress: https://portal.azure.com"
    echo ""
    
    if [[ "$ENVIRONMENT" == "dev" ]]; then
        log_info "💡 To redeploy: ./scripts/deploy.sh dev"
    else
        log_info "💡 To redeploy: ./scripts/deploy.sh prod"
    fi
}

# Main execution
main() {
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "    STUDIO INFRASTRUCTURE CLEANUP"
    echo "    ⚠️  DESTRUCTIVE OPERATION - DELETES ALL RESOURCES ⚠️"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
    
    parse_args "$@"
    check_azure_auth
    find_resource_group
    show_deletion_preview
    confirm_deletion
    delete_resources
    show_cleanup_results
}

# Handle interruption
trap 'log_error "Cleanup interrupted"; exit 1' INT TERM

main "$@"