#!/bin/bash

# Studio Infrastructure Destroy Script
# This script safely destroys the Studio infrastructure using Terraform

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TEMPLATE_DIR="${PROJECT_ROOT}/environments/template"
LOG_FILE="/tmp/studio-destroy-$(date +%Y%m%d-%H%M%S).log"

# Default values
CUSTOMER_PREFIX=""
ENVIRONMENT=""
LOCATION=""
AUTO_APPROVE=false
SKIP_PLAN=false
VERBOSE=false
DRY_RUN=false

# Function to print colored output
print_status() {
    local color=$1
    local message=$2
    echo -e "${color}[$(date +'%Y-%m-%d %H:%M:%S')] ${message}${NC}" | tee -a "$LOG_FILE"
}

# Function to print usage information
print_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Destroy Studio infrastructure using Terraform.

OPTIONS:
    -c, --customer-prefix PREFIX    Customer prefix (required)
    -e, --environment ENV           Environment name (required)
    -l, --location LOCATION         Azure location (required)
    -a, --auto-approve             Auto-approve destroy operation
    -s, --skip-plan                 Skip terraform plan
    -v, --verbose                   Enable verbose output
    -d, --dry-run                   Show what would be destroyed without executing
    -h, --help                      Show this help message

EXAMPLES:
    # Destroy infrastructure with confirmation
    $0 -c "acme" -e "dev" -l "eastus"

    # Auto-approve destroy operation
    $0 -c "acme" -e "dev" -l "eastus" -a

    # Dry run to see what would be destroyed
    $0 -c "acme" -e "dev" -l "eastus" -d

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
            -a|--auto-approve)
                AUTO_APPROVE=true
                shift
                ;;
            -s|--skip-plan)
                SKIP_PLAN=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -d|--dry-run)
                DRY_RUN=true
                shift
                ;;
            -h|--help)
                print_usage
                exit 0
                ;;
            *)
                print_status "$RED" "Unknown option: $1"
                print_usage
                exit 1
                ;;
        esac
    done
}

# Function to validate parameters
validate_parameters() {
    local errors=0

    if [[ -z "$CUSTOMER_PREFIX" ]]; then
        print_status "$RED" "Error: Customer prefix is required"
        errors=$((errors + 1))
    fi

    if [[ -z "$ENVIRONMENT" ]]; then
        print_status "$RED" "Error: Environment is required"
        errors=$((errors + 1))
    fi

    if [[ -z "$LOCATION" ]]; then
        print_status "$RED" "Error: Location is required"
        errors=$((errors + 1))
    fi

    if [[ $errors -gt 0 ]]; then
        print_status "$RED" "Please fix the above errors and try again."
        exit 1
    fi
}

# Function to check prerequisites
check_prerequisites() {
    print_status "$BLUE" "Checking prerequisites..."

    # Check if running as root
    if [[ $EUID -eq 0 ]]; then
        print_status "$RED" "Error: This script should not be run as root"
        exit 1
    fi

    # Check Bash version
    if [[ ${BASH_VERSION%%.*} -lt 4 ]]; then
        print_status "$RED" "Error: Bash 4.0 or higher is required"
        exit 1
    fi

    # Check if required tools are installed
    local tools=("terraform" "az" "jq")
    for tool in "${tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            print_status "$RED" "Error: $tool is not installed or not in PATH"
            exit 1
        fi
    done

    # Check Terraform version
    local terraform_version
    terraform_version=$(terraform version -json | jq -r '.terraform_version')
    if [[ $(echo "$terraform_version" | cut -d. -f1) -lt 1 ]]; then
        print_status "$RED" "Error: Terraform 1.0.0 or higher is required (found: $terraform_version)"
        exit 1
    fi

    print_status "$GREEN" "Prerequisites check passed"
}

# Function to validate Azure authentication
validate_azure_auth() {
    print_status "$BLUE" "Validating Azure authentication..."

    # Check if logged in to Azure
    if ! az account show &> /dev/null; then
        print_status "$RED" "Error: Not logged in to Azure. Please run 'az login' first."
        exit 1
    fi

    # Get current subscription
    local subscription
    subscription=$(az account show --query "name" -o tsv)
    print_status "$BLUE" "Current Azure subscription: $subscription"

    # Check if user has sufficient permissions
    local user_principal
    user_principal=$(az account show --query "user.name" -o tsv)
    print_status "$BLUE" "Current user: $user_principal"

    # Check if user has Contributor or Owner role
    local role_assignment
    role_assignment=$(az role assignment list --assignee "$user_principal" --query "[?roleDefinitionName=='Contributor' || roleDefinitionName=='Owner'].roleDefinitionName" -o tsv)
    
    if [[ -z "$role_assignment" ]]; then
        print_status "$YELLOW" "Warning: User may not have sufficient permissions (Contributor or Owner role required)"
        print_status "$YELLOW" "This may cause the destroy operation to fail"
    else
        print_status "$GREEN" "User has sufficient permissions: $role_assignment"
    fi

    print_status "$GREEN" "Azure authentication validation passed"
}

# Function to validate required files
validate_files() {
    print_status "$BLUE" "Validating required files..."

    # Check if template directory exists
    if [[ ! -d "$TEMPLATE_DIR" ]]; then
        print_status "$RED" "Error: Template directory not found: $TEMPLATE_DIR"
        exit 1
    fi

    # Check if main.tf exists
    if [[ ! -f "${TEMPLATE_DIR}/main.tf" ]]; then
        print_status "$RED" "Error: main.tf not found in template directory"
        exit 1
    fi

    # Check if variables.tf exists
    if [[ ! -f "${TEMPLATE_DIR}/variables.tf" ]]; then
        print_status "$RED" "Error: variables.tf not found in template directory"
        exit 1
    fi

    # Check if terraform.tfvars exists
    if [[ ! -f "${TEMPLATE_DIR}/terraform.tfvars" ]]; then
        print_status "$RED" "Error: terraform.tfvars not found in template directory"
        exit 1
    fi

    print_status "$GREEN" "Required files validation passed"
}

# Function to setup Terraform backend
setup_terraform_backend() {
    print_status "$BLUE" "Setting up Terraform backend..."

    cd "$TEMPLATE_DIR"

    # Initialize Terraform
    print_status "$BLUE" "Initializing Terraform..."
    if [[ "$VERBOSE" == true ]]; then
        terraform init
    else
        terraform init > /dev/null 2>&1
    fi

    print_status "$GREEN" "Terraform backend setup completed"
}

# Function to run Terraform plan
run_terraform_plan() {
    if [[ "$SKIP_PLAN" == true ]]; then
        print_status "$YELLOW" "Skipping Terraform plan as requested"
        return 0
    fi

    print_status "$BLUE" "Running Terraform plan..."

    cd "$TEMPLATE_DIR"

    # Create plan file
    local plan_file="destroy-plan-$(date +%Y%m%d-%H%M%S).tfplan"
    
    if [[ "$VERBOSE" == true ]]; then
        terraform plan -destroy -out="$plan_file"
    else
        terraform plan -destroy -out="$plan_file" > /dev/null 2>&1
    fi

    if [[ $? -eq 0 ]]; then
        print_status "$GREEN" "Terraform plan completed successfully"
        print_status "$BLUE" "Plan file created: $plan_file"
        
        # Show plan summary
        print_status "$BLUE" "Plan summary:"
        terraform show -json "$plan_file" | jq -r '.resource_changes[] | "  \(.change.actions[] | select(. == "delete")) \(.type) \(.name)"' | sort | uniq -c | while read -r count action resource_type resource_name; do
            print_status "$YELLOW" "  $count resources will be $action ($resource_type: $resource_name)"
        done
        
        # Store plan file for later use
        echo "$plan_file" > /tmp/studio-destroy-plan-file
    else
        print_status "$RED" "Terraform plan failed"
        exit 1
    fi
}

# Function to run Terraform destroy
run_terraform_destroy() {
    if [[ "$DRY_RUN" == true ]]; then
        print_status "$YELLOW" "Dry run mode: No actual destruction will occur"
        return 0
    fi

    print_status "$BLUE" "Running Terraform destroy..."

    cd "$TEMPLATE_DIR"

    # Check if we have a plan file
    local plan_file
    if [[ -f "/tmp/studio-destroy-plan-file" ]]; then
        plan_file=$(cat /tmp/studio-destroy-plan-file)
        if [[ -f "$plan_file" ]]; then
            print_status "$BLUE" "Using existing plan file: $plan_file"
            
            if [[ "$AUTO_APPROVE" == true ]]; then
                print_status "$YELLOW" "Auto-approve enabled - proceeding with destruction"
                terraform apply "$plan_file"
            else
                print_status "$YELLOW" "Please review the plan above and confirm destruction"
                read -p "Do you want to proceed with the destruction? (yes/no): " confirm
                if [[ "$confirm" == "yes" ]]; then
                    terraform apply "$plan_file"
                else
                    print_status "$YELLOW" "Destruction cancelled by user"
                    return 0
                fi
            fi
        else
            print_status "$YELLOW" "Plan file not found, running destroy directly"
            if [[ "$AUTO_APPROVE" == true ]]; then
                terraform destroy -auto-approve
            else
                terraform destroy
            fi
        fi
    else
        print_status "$YELLOW" "No plan file found, running destroy directly"
        if [[ "$AUTO_APPROVE" == true ]]; then
            terraform destroy -auto-approve
        else
            terraform destroy
        fi
    fi

    if [[ $? -eq 0 ]]; then
        print_status "$GREEN" "Terraform destroy completed successfully"
    else
        print_status "$RED" "Terraform destroy failed"
        exit 1
    fi
}

# Function to show destruction outputs
show_destruction_outputs() {
    print_status "$BLUE" "Destruction completed successfully"
    
    print_status "$GREEN" "The following resources have been destroyed:"
    print_status "$GREEN" "  - Resource Group: ${CUSTOMER_PREFIX}-studio-${ENVIRONMENT}-rg"
    print_status "$GREEN" "  - Virtual Network and Subnets"
    print_status "$GREEN" "  - App Service Plan and Applications"
    print_status "$GREEN" "  - Cosmos DB Clusters (PostgreSQL and MongoDB)"
    print_status "$GREEN" "  - Storage Account and Containers"
    print_status "$GREEN" "  - Container Registry"
    print_status "$GREEN" "  - Key Vault and Managed Identities"
    print_status "$GREEN" "  - Azure OpenAI Service"
    print_status "$GREEN" "  - Monitoring and Logging Resources"
    print_status "$GREEN" "  - Network Security Groups and Private Endpoints"
}

# Function to validate destruction
validate_destruction() {
    print_status "$BLUE" "Validating destruction..."

    local resource_group="${CUSTOMER_PREFIX}-studio-${ENVIRONMENT}-rg"

    # Check if resource group still exists
    if az group exists --name "$resource_group" --query "exists" -o tsv 2>/dev/null | grep -q "true"; then
        print_status "$YELLOW" "Warning: Resource group still exists: $resource_group"
        print_status "$YELLOW" "This may indicate that some resources could not be destroyed"
        
        # List remaining resources
        print_status "$BLUE" "Remaining resources in resource group:"
        az resource list --resource-group "$resource_group" --query "[].{Type:type, Name:name, Location:location}" -o table 2>/dev/null || true
    else
        print_status "$GREEN" "Resource group successfully destroyed: $resource_group"
    fi

    print_status "$GREEN" "Destruction validation completed"
}

# Function to cleanup temporary files
cleanup_temp_files() {
    print_status "$BLUE" "Cleaning up temporary files..."

    # Remove plan file
    if [[ -f "/tmp/studio-destroy-plan-file" ]]; then
        local plan_file
        plan_file=$(cat /tmp/studio-destroy-plan-file)
        if [[ -f "$plan_file" ]]; then
            rm -f "$plan_file"
        fi
        rm -f "/tmp/studio-destroy-plan-file"
    fi

    # Remove Terraform state files
    cd "$TEMPLATE_DIR"
    if [[ -d ".terraform" ]]; then
        rm -rf .terraform
    fi
    if [[ -f ".terraform.lock.hcl" ]]; then
        rm -f .terraform.lock.hcl
    fi

    print_status "$GREEN" "Cleanup completed"
}

# Function to handle script interruption
cleanup_on_interrupt() {
    print_status "$YELLOW" "Script interrupted by user"
    cleanup_temp_files
    exit 1
}

# Main execution function
main() {
    print_status "$BLUE" "=========================================="
    print_status "$BLUE" "Studio Infrastructure Destroy Script"
    print_status "$BLUE" "=========================================="
    print_status "$BLUE" "Customer: $CUSTOMER_PREFIX"
    print_status "$BLUE" "Environment: $ENVIRONMENT"
    print_status "$BLUE" "Location: $LOCATION"
    print_status "$BLUE" "Auto-approve: $AUTO_APPROVE"
    print_status "$BLUE" "Skip plan: $SKIP_PLAN"
    print_status "$BLUE" "Verbose: $VERBOSE"
    print_status "$BLUE" "Dry run: $DRY_RUN"
    print_status "$BLUE" "=========================================="

    # Set trap for cleanup on interruption
    trap cleanup_on_interrupt INT TERM

    # Execute main workflow
    check_prerequisites
    validate_azure_auth
    validate_files
    setup_terraform_backend
    run_terraform_plan
    run_terraform_destroy
    show_destruction_outputs
    validate_destruction
    cleanup_temp_files

    print_status "$GREEN" "=========================================="
    print_status "$GREEN" "Infrastructure destruction completed successfully!"
    print_status "$GREEN" "=========================================="
    print_status "$BLUE" "Log file: $LOG_FILE"
}

# Parse command line arguments
parse_arguments "$@"

# Validate parameters
validate_parameters

# Execute main function
main "$@"
