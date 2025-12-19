import { describe, it, expect } from 'vitest';
import {
  PERMISSION_MATRIX,
  hasPermission,
  meetsRoleRequirement,
  getRolePermissions,
  canManagePermissions,
  canEditProject,
  canDeleteProject,
  canViewProject,
} from '../permissions';
import type { ProjectRole, PermissionAction } from '../../types';

describe('permissions', () => {
  describe('PERMISSION_MATRIX', () => {
    it('should have owner role with all permissions', () => {
      const ownerPerms = PERMISSION_MATRIX.owner;
      expect(ownerPerms.view_project).toBe(true);
      expect(ownerPerms.edit_project).toBe(true);
      expect(ownerPerms.delete_project).toBe(true);
      expect(ownerPerms.manage_permissions).toBe(true);
      expect(ownerPerms.upload_files).toBe(true);
      expect(ownerPerms.run_templates).toBe(true);
      expect(ownerPerms.attach_templates).toBe(true);
    });

    it('should have editor role with limited permissions', () => {
      const editorPerms = PERMISSION_MATRIX.editor;
      expect(editorPerms.view_project).toBe(true);
      expect(editorPerms.edit_project).toBe(true);
      expect(editorPerms.delete_project).toBe(false);
      expect(editorPerms.manage_permissions).toBe(false);
      expect(editorPerms.upload_files).toBe(true);
      expect(editorPerms.run_templates).toBe(true);
      expect(editorPerms.attach_templates).toBe(true);
    });
  });

  describe('hasPermission', () => {
    it('should return true for owner with any permission', () => {
      expect(hasPermission('owner', 'view_project')).toBe(true);
      expect(hasPermission('owner', 'edit_project')).toBe(true);
      expect(hasPermission('owner', 'delete_project')).toBe(true);
      expect(hasPermission('owner', 'manage_permissions')).toBe(true);
    });

    it('should return true for editor with allowed permissions', () => {
      expect(hasPermission('editor', 'view_project')).toBe(true);
      expect(hasPermission('editor', 'edit_project')).toBe(true);
      expect(hasPermission('editor', 'upload_files')).toBe(true);
    });

    it('should return false for editor with restricted permissions', () => {
      expect(hasPermission('editor', 'delete_project')).toBe(false);
      expect(hasPermission('editor', 'manage_permissions')).toBe(false);
    });

    it('should return false for null/undefined role', () => {
      expect(hasPermission(null, 'view_project')).toBe(false);
      expect(hasPermission(undefined, 'view_project')).toBe(false);
    });

    it('should return false for invalid role', () => {
      expect(hasPermission('invalid' as ProjectRole, 'view_project')).toBe(false);
    });
  });

  describe('meetsRoleRequirement', () => {
    it('should return true when owner meets any requirement', () => {
      expect(meetsRoleRequirement('owner', 'owner')).toBe(true);
      expect(meetsRoleRequirement('owner', 'editor')).toBe(true);
    });

    it('should return true when editor meets editor requirement', () => {
      expect(meetsRoleRequirement('editor', 'editor')).toBe(true);
    });

    it('should return false when editor does not meet owner requirement', () => {
      expect(meetsRoleRequirement('editor', 'owner')).toBe(false);
    });

    it('should return false for null/undefined role', () => {
      expect(meetsRoleRequirement(null, 'editor')).toBe(false);
      expect(meetsRoleRequirement(undefined, 'editor')).toBe(false);
    });
  });

  describe('getRolePermissions', () => {
    it('should return all permissions for owner', () => {
      const perms = getRolePermissions('owner');
      expect(perms.view_project).toBe(true);
      expect(perms.edit_project).toBe(true);
      expect(perms.delete_project).toBe(true);
    });

    it('should return permissions for editor', () => {
      const perms = getRolePermissions('editor');
      expect(perms.view_project).toBe(true);
      expect(perms.delete_project).toBe(false);
    });

    it('should return empty object for invalid role', () => {
      const perms = getRolePermissions('invalid' as ProjectRole);
      expect(perms).toEqual({});
    });
  });

  describe('canManagePermissions', () => {
    it('should return true for owner', () => {
      expect(canManagePermissions('owner')).toBe(true);
    });

    it('should return false for editor', () => {
      expect(canManagePermissions('editor')).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(canManagePermissions(null)).toBe(false);
      expect(canManagePermissions(undefined)).toBe(false);
    });
  });

  describe('canEditProject', () => {
    it('should return true for owner', () => {
      expect(canEditProject('owner')).toBe(true);
    });

    it('should return true for editor', () => {
      expect(canEditProject('editor')).toBe(true);
    });

    it('should return false for null/undefined', () => {
      expect(canEditProject(null)).toBe(false);
      expect(canEditProject(undefined)).toBe(false);
    });
  });

  describe('canDeleteProject', () => {
    it('should return true for owner', () => {
      expect(canDeleteProject('owner')).toBe(true);
    });

    it('should return false for editor', () => {
      expect(canDeleteProject('editor')).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(canDeleteProject(null)).toBe(false);
      expect(canDeleteProject(undefined)).toBe(false);
    });
  });

  describe('canViewProject', () => {
    it('should return true for owner', () => {
      expect(canViewProject('owner')).toBe(true);
    });

    it('should return true for editor', () => {
      expect(canViewProject('editor')).toBe(true);
    });

    it('should return false for null/undefined', () => {
      expect(canViewProject(null)).toBe(false);
      expect(canViewProject(undefined)).toBe(false);
    });
  });
});

