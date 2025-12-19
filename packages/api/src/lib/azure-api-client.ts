import {
  Template,
  Field,
  File as DatabaseFile,
  Project,
  ProjectWithPermissions,
} from "@studio/core";

export interface ApiResponse<T = any> {
  data?: T;
  error?: any;
}

/**
 * Azure API Client for interacting with the backend API
 * Handles authentication, file operations, project management, and template processing
 */
class AzureApiClient {
  private baseUrl = "/api";

  /**
   * Get authentication token from global context
   */
  private async getToken(): Promise<string | null> {
    if (typeof window === "undefined") return null;

    // Get token from global variable set by auth provider
    const token = (window as any).__authToken;
    return token || null;
  }

  /**
   * Fetch wrapper with automatic authentication
   */
  private async fetchWithAuth(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const token = await this.getToken();

    const headers = new Headers(options.headers || {});
    headers.set("Content-Type", "application/json");

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    return fetch(url, {
      ...options,
      headers,
    });
  }

  // Template operations
  async getTemplates(): Promise<Template[]> {
    const response = await this.fetchWithAuth(`${this.baseUrl}/templates`);
    if (!response.ok) {
      throw new Error("Failed to fetch templates");
    }
    return await response.json();
  }

  async getTemplatesForUser(userId: string): Promise<Template[]> {
    const response = await this.fetchWithAuth(
      `${this.baseUrl}/templates?userId=${encodeURIComponent(userId)}`
    );
    if (!response.ok) {
      throw new Error("Failed to fetch templates");
    }
    return await response.json();
  }

  async getTemplate(templateId: string): Promise<Template | null> {
    const response = await this.fetchWithAuth(
      `${this.baseUrl}/templates/${templateId}`
    );
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error("Failed to fetch template");
    }
    return await response.json();
  }

  async getTemplateWithFields(
    templateId: string
  ): Promise<(Template & { fields: Field[] }) | null> {
    const response = await this.fetchWithAuth(
      `${this.baseUrl}/templates/${templateId}/fields`
    );
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error("Failed to fetch template with sections");
    }
    return await response.json();
  }

  async createTemplate(template: {
    name: string;
    owner_id: string;
    metadata?: { description?: string; [key: string]: any };
  }): Promise<Template> {
    const response = await this.fetchWithAuth(`${this.baseUrl}/templates`, {
      method: "POST",
      body: JSON.stringify(template),
    });
    if (!response.ok) {
      throw new Error("Failed to create template");
    }
    return await response.json();
  }

  async updateTemplate(
    templateId: string,
    updates: Partial<Pick<Template, "name" | "metadata">>
  ): Promise<void> {
    const response = await this.fetchWithAuth(
      `${this.baseUrl}/templates/${templateId}`,
      {
        method: "PUT",
        body: JSON.stringify(updates),
      }
    );
    if (!response.ok) {
      throw new Error("Failed to update template");
    }
  }

  async deleteTemplate(templateId: string): Promise<void> {
    const response = await this.fetchWithAuth(
      `${this.baseUrl}/templates/${templateId}`,
      {
        method: "DELETE",
      }
    );
    if (!response.ok) {
      throw new Error("Failed to delete template");
    }
  }

  // Field operations
  async getFields(templateId: string): Promise<Field[]> {
    const response = await this.fetchWithAuth(
      `${this.baseUrl}/templates/${templateId}/fields`
    );
    if (!response.ok) {
      throw new Error("Failed to fetch sections");
    }
    return await response.json();
  }

  async createField(field: Omit<Field, "id" | "created_at">): Promise<Field> {
    const response = await this.fetchWithAuth(`${this.baseUrl}/fields`, {
      method: "POST",
      body: JSON.stringify(field),
    });
    if (!response.ok) {
      throw new Error("Failed to create section");
    }
    return await response.json();
  }

  async updateField(
    fieldId: string,
    updates: Partial<
      Pick<Field, "name" | "description" | "sort_order" | "metadata">
    >
  ): Promise<void> {
    const response = await this.fetchWithAuth(
      `${this.baseUrl}/fields/${fieldId}`,
      {
        method: "PUT",
        body: JSON.stringify(updates),
      }
    );
    if (!response.ok) {
      throw new Error("Failed to update section");
    }
  }

  async deleteField(fieldId: string): Promise<void> {
    const response = await this.fetchWithAuth(
      `${this.baseUrl}/fields/${fieldId}`,
      {
        method: "DELETE",
      }
    );
    if (!response.ok) {
      throw new Error("Failed to delete section");
    }
  }

  // File operations
  async uploadFile(
    file: File,
    userId: string,
    _onProgress?: (progress: number) => void
  ): Promise<DatabaseFile> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("userId", userId);

    const token = await this.getToken();
    const headers = new Headers();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const response = await fetch(`${this.baseUrl}/files/upload`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ error: "Unknown error" }));
      throw new Error(errorData.error || "Failed to upload file");
    }

    return await response.json();
  }

  async uploadMultipleFiles(
    files: File[],
    userId: string,
    onProgress?: (fileName: string, progress: number) => void
  ): Promise<DatabaseFile[]> {
    const uploadPromises = files.map((file) =>
      this.uploadFile(file, userId, (progress) => {
        if (onProgress) {
          onProgress(file.name, progress);
        }
      })
    );

    return await Promise.all(uploadPromises);
  }

  async getFiles(
    userId: string,
    options?: {
      search?: string;
      tags?: string[];
      source?: string;
      limit?: number;
      offset?: number;
      hash?: string;
    }
  ): Promise<DatabaseFile[]> {
    const params = new URLSearchParams();
    if (options?.search) params.append("search", options.search);
    if (options?.source) params.append("source", options.source);
    if (options?.hash) params.append("hash", options.hash);
    if (options?.limit) params.append("limit", options.limit.toString());
    if (options?.offset) params.append("offset", options.offset.toString());
    if (options?.tags?.length) params.append("tags", options.tags.join(","));

    const queryString = params.toString();
    const url = queryString
      ? `${this.baseUrl}/users/${userId}/files?${queryString}`
      : `${this.baseUrl}/users/${userId}/files`;

    const response = await this.fetchWithAuth(url);
    if (!response.ok) {
      throw new Error("Failed to fetch user files");
    }
    return await response.json();
  }

  async getFilesWithProjects(userId: string): Promise<DatabaseFile[]> {
    // Just use the regular getFiles method
    return this.getFiles(userId);
  }

  async getFilesByIds(fileIds: string[]): Promise<DatabaseFile[]> {
    if (!fileIds || fileIds.length === 0) {
      return [];
    }

    const response = await this.fetchWithAuth(`${this.baseUrl}/files/by-ids`, {
      method: "POST",
      body: JSON.stringify({ fileIds }),
    });
    if (!response.ok) {
      throw new Error("Failed to fetch files by IDs");
    }
    const data = await response.json();
    return data.files || [];
  }

  async getFileDownloadUrl(filePath: string): Promise<string> {
    const response = await this.fetchWithAuth(
      `${this.baseUrl}/files/download-url`,
      {
        method: "POST",
        body: JSON.stringify({ filePath }),
      }
    );
    if (!response.ok) {
      throw new Error("Failed to get file download URL");
    }
    const result = await response.json();
    return result.downloadUrl;
  }

  async createFile(fileData: {
    user_id: string;
    file_name: string;
    file_path: string;
    file_hash: string;
    file_size: number;
    metadata?: any;
    file_map?: any;
    page_map?: any;
    processing_status?: string | null;
  }): Promise<DatabaseFile> {
    const response = await this.fetchWithAuth(
      `${this.baseUrl}/users/${fileData.user_id}/files`,
      {
        method: "POST",
        body: JSON.stringify(fileData),
      }
    );

    if (!response.ok) {
      throw new Error("Failed to create file");
    }

    const file = await response.json();

    // Note: File processing is handled separately via SSE, not through this endpoint
    // The process endpoint no longer exists as processing is triggered automatically
    // by the backend when it detects new files

    return file;
  }

  async deleteFileComplete(fileId: string, userId: string): Promise<void> {
    const response = await this.fetchWithAuth(
      `${this.baseUrl}/users/${userId}/files?fileId=${fileId}`,
      {
        method: "DELETE",
      }
    );

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ error: "Unknown error" }));
      throw new Error(errorData.error || "Failed to delete file");
    }
  }

  async abortFileProcessing(fileId: string, userId: string): Promise<void> {
    const response = await this.fetchWithAuth(
      `${this.baseUrl}/users/${userId}/files`,
      {
        method: "PATCH",
        body: JSON.stringify({ action: "abort", fileId }),
      }
    );

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ error: "Unknown error" }));
      throw new Error(errorData.error || "Failed to abort file processing");
    }
  }

  // Project operations
  async getProjects(userId: string): Promise<Project[]> {
    const response = await this.fetchWithAuth(
      `${this.baseUrl}/projects?userId=${userId}`
    );
    if (!response.ok) {
      throw new Error("Failed to fetch projects");
    }
    return await response.json();
  }

  async getProjectsForUser(userId: string): Promise<Project[]> {
    // Use the users endpoint for getting projects
    const response = await this.fetchWithAuth(
      `${this.baseUrl}/users/${userId}/projects`
    );
    if (!response.ok) {
      throw new Error("Failed to fetch user projects");
    }
    return await response.json();
  }

  async getProject(projectId: string): Promise<Project> {
    const response = await this.fetchWithAuth(
      `${this.baseUrl}/projects/${projectId}`
    );
    if (!response.ok) {
      throw new Error("Failed to fetch project");
    }
    return await response.json();
  }

  async getProjectWithPermissions(
    projectId: string,
    userId: string
  ): Promise<ProjectWithPermissions> {
    const response = await this.fetchWithAuth(
      `${this.baseUrl}/projects/${projectId}?userId=${userId}&includePermissions=true`
    );
    if (!response.ok) {
      throw new Error("Failed to fetch project with permissions");
    }
    return await response.json();
  }

  async createProject(
    name: string,
    metadata: any,
    userId: string
  ): Promise<Project> {
    const response = await this.fetchWithAuth(`${this.baseUrl}/projects`, {
      method: "POST",
      body: JSON.stringify({ name, metadata, userId }),
    });
    if (!response.ok) {
      throw new Error("Failed to create project");
    }
    return await response.json();
  }

  async updateProject(
    projectId: string,
    updates: { name?: string; metadata?: any },
    userId: string
  ): Promise<void> {
    const response = await this.fetchWithAuth(
      `${this.baseUrl}/projects/${projectId}`,
      {
        method: "PUT",
        body: JSON.stringify({ ...updates, userId }),
      }
    );
    if (!response.ok) {
      throw new Error("Failed to update project");
    }
  }

  async deleteProject(projectId: string, userId: string): Promise<void> {
    const response = await this.fetchWithAuth(
      `${this.baseUrl}/projects/${projectId}?userId=${encodeURIComponent(userId)}`,
      {
        method: "DELETE",
      }
    );
    if (!response.ok) {
      throw new Error("Failed to delete project");
    }
  }

  async getProjectFiles(projectId: string): Promise<
    Array<{
      userFile: DatabaseFile;
      projectFile: {
        added_at: string;
        added_by: string;
      };
    }>
  > {
    const response = await this.fetchWithAuth(
      `${this.baseUrl}/projects/${projectId}/files`
    );
    if (!response.ok) {
      throw new Error("Failed to fetch project files");
    }
    const files = await response.json();

    // Transform the response to match what ProjectFilesModal expects
    // If the API returns flat files with added_at, transform them
    if (Array.isArray(files) && files.length > 0 && files[0].added_at) {
      return files.map((file) => ({
        userFile: {
          id: file.id,
          file_name: file.file_name,
          file_path: file.file_path,
          file_size: file.file_size,
          created_at: file.created_at,
          user_id: file.user_id,
          file_hash: file.file_hash,
          metadata: file.metadata,
          file_map: file.file_map || {},
          page_map: file.page_map || {},
          processing_status: file.processing_status,
        } as DatabaseFile,
        projectFile: {
          added_at: file.added_at,
          added_by: file.added_by,
        },
      }));
    }

    // Return empty array if no transformation needed
    return [];
  }

  async addFilesToProject(
    projectId: string,
    fileIds: string[],
    userId: string
  ): Promise<void> {
    const response = await this.fetchWithAuth(
      `${this.baseUrl}/projects/${projectId}/files`,
      {
        method: "POST",
        body: JSON.stringify({ fileIds, userId }),
      }
    );
    if (!response.ok) {
      throw new Error("Failed to add files to project");
    }
  }

  async addFileToProject(
    projectId: string,
    fileId: string,
    userId: string
  ): Promise<void> {
    return this.addFilesToProject(projectId, [fileId], userId);
  }

  async removeFilesFromProject(
    projectId: string,
    fileIds: string[]
  ): Promise<void> {
    const response = await this.fetchWithAuth(
      `${this.baseUrl}/projects/${projectId}/files`,
      {
        method: "DELETE",
        body: JSON.stringify({ fileIds }),
      }
    );
    if (!response.ok) {
      throw new Error("Failed to remove files from project");
    }
  }

  async removeFileFromProject(
    projectId: string,
    fileId: string
  ): Promise<void> {
    return this.removeFilesFromProject(projectId, [fileId]);
  }

  // Project Template operations
  async getTemplatesForProject(projectId: string): Promise<Template[]> {
    const response = await this.fetchWithAuth(
      `${this.baseUrl}/projects/${projectId}/templates`
    );
    if (!response.ok) {
      throw new Error("Failed to fetch project templates");
    }
    return await response.json();
  }

  async addTemplatesToProject(
    projectId: string,
    templateIds: string[],
    userId: string
  ): Promise<void> {
    const response = await this.fetchWithAuth(
      `${this.baseUrl}/projects/${projectId}/templates`,
      {
        method: "POST",
        body: JSON.stringify({ templateIds, userId }),
      }
    );
    if (!response.ok) {
      throw new Error("Failed to add templates to project");
    }
  }

  async removeTemplatesFromProject(
    projectId: string,
    templateIds: string[]
  ): Promise<void> {
    const response = await this.fetchWithAuth(
      `${this.baseUrl}/projects/${projectId}/templates`,
      {
        method: "DELETE",
        body: JSON.stringify({ templateIds }),
      }
    );
    if (!response.ok) {
      throw new Error("Failed to remove templates from project");
    }
  }

  // Processing operations
  async processSingleField(
    field: string,
    description: string,
    fileIds: string[],
    projectMetadata: any,
    templateMetadata: any,
    outputFormat: "text" | "table" | "chart" = "text",
    executionMode: "both" | "response_only" | "analysis_only" = "both"
  ): Promise<{
    data?: {
      result?: any[];
      lineMap?: Record<number, any>;
      evidenceAnalysis?: Record<string, any>;
      executionMode?: string;
    };
    error?: any;
  }> {
    const response = await this.fetchWithAuth(`${this.baseUrl}/process/field`, {
      method: "POST",
      body: JSON.stringify({
        fieldName: field,
        fieldDescription: description,
        fileIds,
        projectMetadata,
        templateMetadata,
        outputFormat: outputFormat,
        executionMode: executionMode,
      }),
    });

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ error: "Unknown error" }));
      console.error("=== CLIENT ERROR DETAILS ===");
      console.error("Response status:", response.status);
      console.error("Response statusText:", response.statusText);
      console.error("Error data:", errorData);
      console.error("=== END CLIENT ERROR ===");
      throw new Error(
        errorData?.error?.message ||
          errorData?.error ||
          "Failed to process section"
      );
    }

    return await response.json();
  }

  // Run operations
  async createRun(runData: {
    id: string;
    template_id: string;
    project_id: string;
    status: string;
    metadata?: { name?: string; description?: string; [key: string]: any };
  }): Promise<{
    id: string;
    created_at: string;
    status: string;
    metadata?: { name?: string; description?: string; [key: string]: any };
  }> {
    const response = await this.fetchWithAuth(`${this.baseUrl}/runs`, {
      method: "POST",
      body: JSON.stringify(runData),
    });
    if (!response.ok) {
      throw new Error("Failed to create run");
    }
    return await response.json();
  }

  async getRunsForTemplate(
    templateId: string,
    projectId: string
  ): Promise<
    Array<{
      id: string;
      created_at: string;
      status: string;
      metadata?: { name?: string; description?: string; [key: string]: any };
    }>
  > {
    // STRICT: Always include projectId in query params to filter runs by project
    const url = `${this.baseUrl}/templates/${templateId}/runs?projectId=${projectId}`;

    const response = await this.fetchWithAuth(url);
    if (!response.ok) {
      throw new Error("Failed to fetch runs");
    }
    return await response.json();
  }

  async updateRun(
    runId: string,
    updates: {
      status?: string;
      metadata?: { name?: string; description?: string; [key: string]: any };
    }
  ): Promise<void> {
    const response = await this.fetchWithAuth(`${this.baseUrl}/runs/${runId}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      throw new Error("Failed to update run");
    }
  }

  async deleteRun(runId: string): Promise<void> {
    const response = await this.fetchWithAuth(`${this.baseUrl}/runs/${runId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      throw new Error("Failed to delete run");
    }
  }

  // Result operations
  async saveResult(resultData: {
    run_id: string;
    field_id: string;
    value: any;
    metadata: any;
    status: string;
  }): Promise<string> {
    const response = await this.fetchWithAuth(`/api/results`, {
      method: "POST",
      body: JSON.stringify(resultData),
    });
    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ error: "Unknown error" }));
      console.error("Save result error response:", errorData);
      throw new Error(
        errorData.details || errorData.error || "Failed to save result"
      );
    }
    const data = await response.json();
    return data.resultId;
  }

  async getResultsForRun(runId: string): Promise<
    Array<{
      id: string;
      run_id: string;
      field_id: string;
      value: any;
      metadata: any;
      status: string;
      created_at: string;
    }>
  > {
    const response = await this.fetchWithAuth(
      `${this.baseUrl}/runs/${runId}/results`
    );
    if (!response.ok) {
      throw new Error("Failed to fetch results");
    }
    return await response.json();
  }

  async updateResultMetadata(resultId: string, metadata: any): Promise<void> {
    console.log("[API] updateResultMetadata called:", { resultId, metadata });
    const response = await this.fetchWithAuth(
      `${this.baseUrl}/results/${resultId}/metadata`,
      {
        method: "PATCH",
        body: JSON.stringify(metadata),
      }
    );
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[API] updateResultMetadata failed:", errorText);
      throw new Error("Failed to update result metadata");
    }
    console.log("[API] updateResultMetadata succeeded");
  }

  // Utility methods for backward compatibility
  async put<T>(url: string, data: T): Promise<ApiResponse<T>> {
    const response = await this.fetchWithAuth(`${this.baseUrl}${url}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ message: "Failed to parse error response" }));
      return { error };
    }

    const result = await response.json().catch(() => null);
    return { data: result || undefined };
  }
}

export const azureApiClient = new AzureApiClient();
export { AzureApiClient };
