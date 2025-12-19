export interface Template {
  id: string;
  name: string;
  metadata: {
    description: string;
    [key: string]: any;
  };
  owner_id: string;
  created_at: string;
}

import { ProjectMetadata } from "./project-metadata";

export interface Project {
  id: string;
  name: string;
  user_id: string;
  created_at: string;
  updated_at?: string;
  metadata: ProjectMetadata;
}

export interface Field {
  id: string;
  template_id: string;
  name: string; // This matches the database column
  description: string;
  sort_order: number;
  created_at: string;
  metadata: {
    type: "text" | "table" | "chart";
    dependencies?: string[]; // Array of field IDs this field depends on (default: all fields above)
    [key: string]: any;
  };
}

export interface Run {
  id: string;
  template_id: string;
  project_id: string;
  created_at: string;
  status: string;
  metadata?: {
    name?: string;
    description?: string;
    [key: string]: any;
  };
}

export interface Result {
  id: string;
  run_id: string;
  field_id: string;
  value: {
    text: Array<{
      line: string;
      tags: string[];
    }>;
    lineMap: Record<
      number,
      {
        text: string;
        filename: string;
        local_num: number;
      }
    >;
    file_map: Record<string, Record<number, { text: string }>>;
  };
  metadata: {
    chartConfig?: {
      type: "bar" | "line" | "pie" | "area";
      xAxis: string;
      yAxes: string[];
      showTable: boolean;
      advancedSettings?: {
        chartHeight: number;
        chartWidth: string;
        marginTop: number;
        marginRight: number;
        marginBottom: number;
        marginLeft: number;
        xAxisHeight: number;
        xAxisFontSize: number;
        xAxisAngle: number;
        showXAxisGrid: boolean;
        yAxisWidth: number;
        yAxisFontSize: number;
        showYAxisGrid: boolean;
        showLegend: boolean;
        legendPosition: "top" | "bottom" | "left" | "right";
        showGridLines: boolean;
        showTooltip: boolean;
        containerPadding: number;
        colorScheme: "default" | "monochrome" | "pastel";
      };
    };
    [key: string]: any;
  };
  created_at: string;
  status: string;
}

export interface File {
  id: string;
  created_at: string;
  user_id: string;
  file_name: string;
  file_path: string;
  file_hash: string;
  file_size: number;
  metadata: Record<string, any>;
  file_map: Record<
    number,
    {
      text: string;
      filename: string;
      local_num: number;
    }
  >;
  page_map: Record<number, number>;
  excel_file_map?: Record<string, any>;
  sheet_map?: Record<number, string>;
  processing_status?: string;
  projects?: Array<{
    id: string;
    name: string;
  }>;
}

export interface ProjectFile {
  added_at: string;
  project_id: string;
  file_id: string;
  added_by?: string;
}

export interface ProjectTemplate {
  added_at: string;
  project_id: string;
  template_id: string;
  added_by?: string;
}

// Project Sharing Types
export type ProjectRole = "owner" | "editor";

export interface ProjectPermission {
  id: string;
  project_id: string;
  user_id: string;
  role: ProjectRole;
  granted_by: string;
  granted_at: string;
  created_at: string;
}

// Extended Project interface with permission context
export interface ProjectWithPermissions extends Project {
  user_role: ProjectRole; // Current user's role on this project
  permissions?: ProjectPermission[]; // All permissions (for owners to manage)
  shared_with_count?: number; // Quick count for UI
  is_shared?: boolean; // Quick flag for UI
}

// User info for sharing UI
export interface ProjectMember {
  user_id: string;
  email: string;
  name?: string;
  avatar_url?: string;
  role: ProjectRole;
  granted_at: string;
  granted_by: string;
}

export interface ShareProjectRequest {
  project_id: string;
  user_email: string; // Invite by email
  role: ProjectRole;
}

// API Response Types
export interface ShareProjectResponse {
  success: boolean;
  permission?: ProjectPermission;
  error?: string;
}

export interface ProjectMembersResponse {
  members: ProjectMember[];
  total_count: number;
}

export interface UserProjectsResponse {
  owned_projects: Project[];
  shared_projects: ProjectWithPermissions[];
  total_owned: number;
  total_shared: number;
}

// Permission checking types
export type PermissionAction =
  | "view_project"
  | "edit_project"
  | "delete_project"
  | "manage_permissions"
  | "upload_files"
  | "run_templates"
  | "attach_templates";

export type PermissionMatrix = {
  [key in ProjectRole]: {
    [action in PermissionAction]: boolean;
  };
};

// Permission matrix for authorization checks
export const PERMISSIONS: PermissionMatrix = {
  owner: {
    view_project: true,
    edit_project: true,
    delete_project: true,
    manage_permissions: true,
    upload_files: true,
    run_templates: true,
    attach_templates: true,
  },
  editor: {
    view_project: true,
    edit_project: true,
    delete_project: false,
    manage_permissions: false,
    upload_files: true,
    run_templates: true,
    attach_templates: true,
  },
};
