#!/bin/bash
# =============================================================================
# DEPLOYMENT STATUS CHECKER
# =============================================================================
# Check the status of running deployments

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${CYAN}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_header() { echo -e "\n${BLUE}🚀 $1${NC}\n"; }

ENVIRONMENT=${1:-"test-run"}
RESOURCE_GROUP="testrun-studio-test-rg"

log_header "DEPLOYMENT STATUS CHECK"
log_info "Environment: $ENVIRONMENT"
log_info "Resource Group: $RESOURCE_GROUP"

echo ""
log_info "📊 All Deployments:"
az deployment group list --resource-group "$RESOURCE_GROUP" \
  --query '[].{Name:name, State:properties.provisioningState, Timestamp:properties.timestamp}' \
  --output table

echo ""
log_info "🏃 Running Deployments:"
RUNNING=$(az deployment group list --resource-group "$RESOURCE_GROUP" \
  --query "[?properties.provisioningState=='Running'].name" \
  --output tsv)

if [[ -z "$RUNNING" ]]; then
    log_success "No deployments currently running"
else
    for deployment in $RUNNING; do
        log_warning "Still running: $deployment"
        
        # Get more details about the running deployment
        STARTED=$(az deployment group show --resource-group "$RESOURCE_GROUP" \
          --name "$deployment" \
          --query 'properties.timestamp' \
          --output tsv)
        log_info "Started at: $STARTED"
    done
fi

echo ""
log_info "❌ Failed Deployments:"
FAILED=$(az deployment group list --resource-group "$RESOURCE_GROUP" \
  --query "[?properties.provisioningState=='Failed'].name" \
  --output tsv)

if [[ -z "$FAILED" ]]; then
    log_success "No failed deployments"
else
    for deployment in $FAILED; do
        log_error "Failed: $deployment"
    done
fi

echo ""
log_info "✅ Successful Deployments:"
az deployment group list --resource-group "$RESOURCE_GROUP" \
  --query "[?properties.provisioningState=='Succeeded'].{Name:name, Timestamp:properties.timestamp}" \
  --output table

echo ""
log_info "📋 Current Resources in Resource Group:"
az resource list --resource-group "$RESOURCE_GROUP" \
  --query '[].{Name:name, Type:type, Location:location}' \
  --output table

echo ""
echo "Use: ./check-deployment-status.sh to check again"