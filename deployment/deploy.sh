#!/usr/bin/env bash
# Deployment script that copies output files and runs the deployment
# Usage: ./deploy.sh <customer-prefix> <env>
# Example: ./deploy.sh lifesci prod
# Example: ./deploy.sh staging dev

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_info()    { echo -e "${BLUE}$1${NC}"; }
print_success() { echo -e "${GREEN}$1${NC}"; }
print_warning() { echo -e "${YELLOW}$1${NC}"; }
print_error()   { echo -e "${RED}$1${NC}"; }

# Check arguments
if [ $# -ne 2 ]; then
  print_error "Usage: $0 <customer-prefix> <env>"
  print_error "Example: $0 lifesci prod"
  print_error "Example: $0 staging dev"
  exit 1
fi

CUSTOMER_PREFIX="$1"
ENV="$2"

# Get the script directory (studio/deployment)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Get the studio root directory
STUDIO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# Path to infrastructure/bicep directory
BICEP_DIR="$STUDIO_ROOT/infrastructure/bicep"
# Source folder: outputs-{customer-prefix}-{env}
SOURCE_DIR="$BICEP_DIR/outputs-${CUSTOMER_PREFIX}-${ENV}"
# Target directory (same level as parameters.dev.json)
TARGET_DIR="$BICEP_DIR"
# Path to deploy-app.sh
DEPLOY_APP_SCRIPT="$BICEP_DIR/scripts/post-infra-deployment/deploy-app.sh"

# Validate source directory exists
if [ ! -d "$SOURCE_DIR" ]; then
  print_error "Source directory does not exist: $SOURCE_DIR"
  exit 1
fi

# Validate deploy-app.sh exists
if [ ! -f "$DEPLOY_APP_SCRIPT" ]; then
  print_error "Deployment script does not exist: $DEPLOY_APP_SCRIPT"
  exit 1
fi

print_info "========================================="
print_info "Deployment Script"
print_info "========================================="
print_info "Customer Prefix: $CUSTOMER_PREFIX"
print_info "Environment: $ENV"
print_info "Source Directory: $SOURCE_DIR"
print_info "Target Directory: $TARGET_DIR"
print_info ""

# Copy files from source to target
print_info "Copying files from $SOURCE_DIR to $TARGET_DIR..."

# Track copied files for cleanup
COPIED_FILES=()
while IFS= read -r file; do
  if [ -f "$SOURCE_DIR/$file" ]; then
    COPIED_FILES+=("$file")
  fi
done < <(ls -1 "$SOURCE_DIR" 2>/dev/null || true)

if [ ${#COPIED_FILES[@]} -eq 0 ]; then
  print_warning "No files found in source directory"
else
  if ! cp -f "$SOURCE_DIR"/* "$TARGET_DIR/"; then
    print_error "Failed to copy files from $SOURCE_DIR to $TARGET_DIR"
    exit 1
  fi
  print_success "Files copied successfully"
  
  # List copied files
  print_info "Copied files:"
  for file in "${COPIED_FILES[@]}"; do
    print_info "  - $file"
  done
fi

print_info ""

# Azure login
print_info "Logging in to Azure..."
if ! az login; then
  print_error "Azure login failed"
  exit 1
fi
print_success "Azure login successful"

print_info ""

# Change to deploy-app.sh directory and run it
print_info "Running deployment script: $DEPLOY_APP_SCRIPT"
print_info "Changing directory to: $(dirname "$DEPLOY_APP_SCRIPT")"
cd "$(dirname "$DEPLOY_APP_SCRIPT")"

if ! ./deploy-app.sh "$ENV"; then
  print_error "Deployment script failed"
  exit 1
fi

print_info ""

# Cleanup: Delete copied files from target directory
if [ ${#COPIED_FILES[@]} -gt 0 ]; then
  print_info "Cleaning up copied files from $TARGET_DIR..."
  for file in "${COPIED_FILES[@]}"; do
    if [ -f "$TARGET_DIR/$file" ]; then
      rm -f "$TARGET_DIR/$file"
      print_info "  Deleted: $file"
    fi
  done
  print_success "Cleanup completed"
fi

print_success "Deployment completed successfully!"
