#!/bin/bash

# =============================================================================
# Terraform Validation Script
# =============================================================================
# This script validates Terraform code for quality, security, and best practices.
# It includes format checking, validation, linting, security scanning, and cost estimation.
#
# Requirements:
# - Terraform
# - tflint
# - tfsec
# - jq
# - Bash 4.0+
#
# Usage:
#   ./validate.sh [OPTIONS]
#   ./validate.sh --all
#   ./validate.sh --format --validate --lint
# =============================================================================

set -euo pipefail

# Script configuration
SCRIPT_VERSION="1.0.0"
TERRAFORM_DIR="."

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
RUN_FORMAT=false
RUN_VALIDATE=false
RUN_LINT=false
RUN_SECURITY=false
RUN_COST=false
RUN_ALL=false
VERBOSE=false
FIX_FORMAT=false

# Function to display usage
show_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Options:
  -f, --format              Run terraform fmt check
  -v, --validate            Run terraform validate
  -l, --lint                Run tflint
  -s, --security            Run tfsec security scan
  -c, --cost                Run terraform cost estimation
  -a, --all                 Run all validations
  --fix-format              Fix formatting issues automatically
  --verbose                 Enable verbose output
  -h, --help                Show this help message

Examples:
  $0 --all                  # Run all validations
  $0 --format --validate   # Run format and validation only
  $0 --fix-format          # Fix formatting issues
  $0 --verbose --all       # Run all validations with verbose output

EOF
}

# Function to parse command line arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -f|--format)
                RUN_FORMAT=true
                shift
                ;;
            -v|--validate)
                RUN_VALIDATE=true
                shift
                ;;
            -l|--lint)
                RUN_LINT=true
                shift
                ;;
            -s|--security)
                RUN_SECURITY=true
                shift
                ;;
            -c|--cost)
                RUN_COST=true
                shift
                ;;
            -a|--all)
                RUN_ALL=true
                shift
                ;;
            --fix-format)
                FIX_FORMAT=true
                RUN_FORMAT=true
                shift
                ;;
            --verbose)
                VERBOSE=true
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
    
    # If no specific options provided, run all
    if [[ "$RUN_FORMAT" == false && "$RUN_VALIDATE" == false && "$RUN_LINT" == false && "$RUN_SECURITY" == false && "$RUN_COST" == false ]]; then
        RUN_ALL=true
    fi
}

# Function to check prerequisites
check_prerequisites() {
    print_info "Checking prerequisites..."
    
    local missing_tools=()
    
    # Check Terraform
    if ! command -v terraform &> /dev/null; then
        missing_tools+=("terraform")
    fi
    
    # Check tflint
    if ! command -v tflint &> /dev/null; then
        missing_tools+=("tflint")
    fi
    
    # Check tfsec
    if ! command -v tfsec &> /dev/null; then
        missing_tools+=("tfsec")
    fi
    
    # Check jq
    if ! command -v jq &> /dev/null; then
        missing_tools+=("jq")
    fi
    
    if [[ ${#missing_tools[@]} -gt 0 ]]; then
        print_error "Missing required tools:"
        for tool in "${missing_tools[@]}"; do
            print_error "  - $tool"
        done
        print_info "Please install the missing tools and try again."
        exit 1
    fi
    
    print_success "All prerequisites are satisfied!"
}

# Function to check if we're in a Terraform directory
check_terraform_directory() {
    if [[ ! -f "$TERRAFORM_DIR/main.tf" ]] && [[ ! -f "$TERRAFORM_DIR/main.tf.json" ]]; then
        print_error "No main.tf or main.tf.json file found in current directory"
        print_info "Please run this script from a Terraform project directory"
        exit 1
    fi
    
    print_success "Terraform project directory confirmed"
}

# Function to run terraform fmt
run_format_check() {
    if [[ "$RUN_FORMAT" != true ]]; then
        return
    fi
    
    print_info "Running Terraform format check..."
    
    if [[ "$FIX_FORMAT" == true ]]; then
        print_info "Fixing formatting issues..."
        if terraform fmt -recursive -write; then
            print_success "Formatting issues fixed successfully"
        else
            print_error "Failed to fix formatting issues"
            return 1
        fi
    else
        # Check formatting without fixing
        local format_check
        format_check=$(terraform fmt -recursive -check -diff)
        
        if [[ $? -eq 0 ]]; then
            print_success "All Terraform files are properly formatted"
        else
            print_warning "Formatting issues found:"
            echo "$format_check"
            print_info "Run with --fix-format to automatically fix these issues"
            return 1
        fi
    fi
}

# Function to run terraform validate
run_validation() {
    if [[ "$RUN_VALIDATE" != true ]]; then
        return
    fi
    
    print_info "Running Terraform validation..."
    
    # Initialize Terraform if needed
    if [[ ! -d ".terraform" ]]; then
        print_info "Initializing Terraform..."
        if ! terraform init -backend=false; then
            print_error "Failed to initialize Terraform"
            return 1
        fi
    fi
    
    # Validate configuration
    if terraform validate; then
        print_success "Terraform configuration is valid"
    else
        print_error "Terraform validation failed"
        return 1
    fi
}

# Function to run tflint
run_linting() {
    if [[ "$RUN_LINT" != true ]]; then
        return
    fi
    
    print_info "Running TFLint..."
    
    # Check if .tflint.hcl exists, create default if not
    if [[ ! -f ".tflint.hcl" ]]; then
        print_info "Creating default .tflint.hcl configuration..."
        cat > .tflint.hcl << EOF
plugin "azurerm" {
  enabled = true
  version = "0.24.0"
  source  = "github.com/terraform-linters/tflint-ruleset-azurerm"
}

config {
  module = true
  force  = false
}
EOF
    fi
    
    # Run tflint
    if tflint --init; then
        if tflint; then
            print_success "TFLint validation passed"
        else
            print_warning "TFLint found issues (see above for details)"
            return 1
        fi
    else
        print_error "Failed to initialize TFLint"
        return 1
    fi
}

# Function to run security scan
run_security_scan() {
    if [[ "$RUN_SECURITY" != true ]]; then
        return
    fi
    
    print_info "Running security scan with tfsec..."
    
    # Run tfsec
    local security_output
    security_output=$(tfsec --format json --out tfsec-results.json 2>/dev/null || true)
    
    # Parse results
    if [[ -f "tfsec-results.json" ]]; then
        local results
        results=$(cat tfsec-results.json)
        
        local critical_count
        critical_count=$(echo "$results" | jq -r '.results[] | select(.severity == "CRITICAL") | .rule_id' | wc -l)
        local high_count
        high_count=$(echo "$results" | jq -r '.results[] | select(.severity == "HIGH") | .rule_id' | wc -l)
        local medium_count
        medium_count=$(echo "$results" | jq -r '.results[] | select(.severity == "MEDIUM") | .rule_id' | wc -l)
        local low_count
        low_count=$(echo "$results" | jq -r '.results[] | select(.severity == "LOW") | .rule_id' | wc -l)
        
        print_info "Security scan results:"
        print_info "  Critical: $critical_count"
        print_info "  High: $high_count"
        print_info "  Medium: $medium_count"
        print_info "  Low: $low_count"
        
        # Show critical and high issues
        if [[ $critical_count -gt 0 || $high_count -gt 0 ]]; then
            print_warning "Critical and High severity issues found:"
            echo "$results" | jq -r '.results[] | select(.severity == "CRITICAL" or .severity == "HIGH") | "  \(.severity): \(.rule_id) - \(.description)"'
            print_info "Review these issues and fix them before deployment"
            return 1
        fi
        
        if [[ $medium_count -gt 0 || $low_count -gt 0 ]]; then
            print_warning "Medium and Low severity issues found (review recommended)"
        fi
        
        print_success "Security scan completed"
    else
        print_warning "No security scan results found"
    fi
    
    # Clean up
    rm -f tfsec-results.json
}

# Function to run cost estimation
run_cost_estimation() {
    if [[ "$RUN_COST" != true ]]; then
        return
    fi
    
    print_info "Running cost estimation..."
    
    # Check if terraform plan exists
    if [[ ! -f "terraform.tfplan" ]]; then
        print_warning "No terraform.tfplan found. Run 'terraform plan' first to generate cost estimation."
        return 0
    fi
    
    # Try to get cost estimation from plan
    if command -v terraform-cost-estimation &> /dev/null; then
        print_info "Using terraform-cost-estimation tool..."
        if terraform-cost-estimation terraform.tfplan; then
            print_success "Cost estimation completed"
        else
            print_warning "Cost estimation failed"
        fi
    else
        print_info "terraform-cost-estimation tool not found. Install it for detailed cost analysis."
        print_info "Alternative: Use 'terraform show -json terraform.tfplan | jq' to analyze resources manually"
    fi
}

# Function to generate summary report
generate_summary_report() {
    print_header "=================================================================="
    print_header "VALIDATION SUMMARY REPORT"
    print_header "=================================================================="
    
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    print_info "Validation completed at: $timestamp"
    
    # Count Terraform files
    local tf_files
    tf_files=$(find . -name "*.tf" -o -name "*.tf.json" | wc -l)
    print_info "Terraform files found: $tf_files"
    
    # Show validation status
    print_info "Validation Status:"
    if [[ "$RUN_FORMAT" == true ]]; then
        print_success "  ✓ Format check completed"
    fi
    if [[ "$RUN_VALIDATE" == true ]]; then
        print_success "  ✓ Configuration validation completed"
    fi
    if [[ "$RUN_LINT" == true ]]; then
        print_success "  ✓ Linting completed"
    fi
    if [[ "$RUN_SECURITY" == true ]]; then
        print_success "  ✓ Security scan completed"
    fi
    if [[ "$RUN_COST" == true ]]; then
        print_success "  ✓ Cost estimation completed"
    fi
    
    print_header "=================================================================="
}

# Function to display script header
show_header() {
    print_header "=================================================================="
    print_header "Terraform Validation Script"
    print_header "Version: $SCRIPT_VERSION"
    print_header "Directory: $TERRAFORM_DIR"
    print_header "=================================================================="
    echo
}

# Main execution
main() {
    # Parse command line arguments
    parse_arguments "$@"
    
    # Show header
    show_header
    
    # Check prerequisites
    check_prerequisites
    
    # Check if we're in a Terraform directory
    check_terraform_directory
    
    # Run validations
    local exit_code=0
    
    if [[ "$RUN_FORMAT" == true || "$RUN_ALL" == true ]]; then
        if ! run_format_check; then
            exit_code=1
        fi
    fi
    
    if [[ "$RUN_VALIDATE" == true || "$RUN_ALL" == true ]]; then
        if ! run_validation; then
            exit_code=1
        fi
    fi
    
    if [[ "$RUN_LINT" == true || "$RUN_ALL" == true ]]; then
        if ! run_linting; then
            exit_code=1
        fi
    fi
    
    if [[ "$RUN_SECURITY" == true || "$RUN_ALL" == true ]]; then
        if ! run_security_scan; then
            exit_code=1
        fi
    fi
    
    if [[ "$RUN_COST" == true || "$RUN_ALL" == true ]]; then
        if ! run_cost_estimation; then
            exit_code=1
        fi
    fi
    
    # Generate summary report
    generate_summary_report
    
    # Exit with appropriate code
    if [[ $exit_code -eq 0 ]]; then
        print_success "All validations passed successfully!"
        exit 0
    else
        print_warning "Some validations failed. Please review the issues above."
        exit 1
    fi
}

# Trap to handle script exit
trap 'print_error "Script interrupted"; exit 1' INT TERM

# Run main function with all arguments
main "$@"
