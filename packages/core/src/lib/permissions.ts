/**
 * Centralized permission checking system
 * This file is the single source of truth for all permission checks
 * Used by both frontend UI and backend API routes
 */

import { ProjectRole, PermissionAction } from "@studio/core";

// Permission matrix defining what each role can do
export const PERMISSION_MATRIX = {
  owner: {
    view_project: true,
    edit_project: true,
    delete_project: true,
    manage_permissions: true, // Can share/unshare users
    upload_files: true,
    run_templates: true,
    attach_templates: true,
  },
  editor: {
    view_project: true,
    edit_project: true,
    delete_project: false,
    manage_permissions: false, // Cannot share/unshare users
    upload_files: true,
    run_templates: true,
    attach_templates: true,
  },
} as const;

/**
 * Check if a user with a given role has permission to perform an action
 * @param userRole The user's role in the project
 * @param action The action to check permission for
 * @returns true if the user has permission, false otherwise
 */
export function hasPermission(
  userRole: ProjectRole | undefined | null,
  action: PermissionAction
): boolean {
  if (!userRole) return false;
  return PERMISSION_MATRIX[userRole]?.[action] || false;
}

/**
 * Check if a user role meets or exceeds a minimum required role
 * Used for simple role hierarchy checks
 * @param userRole The user's actual role
 * @param requiredRole The minimum required role
 * @returns true if user role meets or exceeds required role
 */
export function meetsRoleRequirement(
  userRole: ProjectRole | undefined | null,
  requiredRole: ProjectRole
): boolean {
  if (!userRole) return false;

  // Owner can do everything
  if (userRole === "owner") return true;

  // Editor can only meet editor requirement
  if (userRole === "editor" && requiredRole === "editor") return true;

  return false;
}

/**
 * Get all permissions for a given role
 * @param role The role to get permissions for
 * @returns Object with all permission actions and their boolean values
 */
export function getRolePermissions(role: ProjectRole) {
  return PERMISSION_MATRIX[role] || {};
}

/**
 * Check if a role can manage other users' permissions
 * This is a specific check for sharing functionality
 * @param userRole The user's role
 * @returns true if the user can manage permissions
 */
export function canManagePermissions(
  userRole: ProjectRole | undefined | null
): boolean {
  return hasPermission(userRole, "manage_permissions");
}

/**
 * Check if a role can modify the project
 * @param userRole The user's role
 * @returns true if the user can edit the project
 */
export function canEditProject(
  userRole: ProjectRole | undefined | null
): boolean {
  return hasPermission(userRole, "edit_project");
}

/**
 * Check if a role can delete the project
 * @param userRole The user's role
 * @returns true if the user can delete the project
 */
export function canDeleteProject(
  userRole: ProjectRole | undefined | null
): boolean {
  return hasPermission(userRole, "delete_project");
}

/**
 * Check if a role can view the project
 * @param userRole The user's role
 * @returns true if the user can view the project
 */
export function canViewProject(
  userRole: ProjectRole | undefined | null
): boolean {
  return hasPermission(userRole, "view_project");
}
