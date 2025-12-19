import { Pool, PoolClient } from "pg";
import {
  Template,
  Field,
  File,
  Project,
  ProjectPermission,
  ProjectWithPermissions,
  ProjectMember,
  ShareProjectRequest,
  ShareProjectResponse,
  ProjectRole,
  ProcessedResults,
} from "@studio/core";
import {
  getServerConfig,
  getPublicConfig,
  type ServerConfig,
} from "../config/runtime-config";

export interface ProcessResponse {
  status: "success" | "error";
  message?: string;
  data?: {
    result: any[];
    lineMap: Record<number, any>;
  };
  error?: {
    code: string;
    message: string;
  };
}

export interface SaveResultsRequest {
  results: Record<string, ProcessedResults>;
  projectId: string;
  projectName: string;
}

class AzureDbClient {
  private pool?: Pool;
  private baseUrl?: string;
  private config?: ServerConfig;
  private publicConfig?: ReturnType<typeof getPublicConfig>;
  private connectionRetries = 3;
  private connectionRetryDelay = 1000;
  private isClosing = false;
  private initialized = false;
  private initializationError?: Error;

  constructor() {
    // Lazy initialization - don't create pool in constructor
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized && this.pool) return;

    // If we already tried and failed, throw the cached error
    if (this.initializationError) {
      throw this.initializationError;
    }

    try {
      // Load configuration
      this.config = getServerConfig();
      this.publicConfig = getPublicConfig();
      this.baseUrl = this.publicConfig.backendUrl;

      // Initialize PostgreSQL connection pool
      this.pool = new Pool({
        connectionString: this.config.database.url,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });

      // Handle pool errors
      this.pool.on("error", (err) => {
        console.error("Unexpected database pool error:", err);
      });

      // Graceful shutdown with proper handling
      if (typeof process !== "undefined") {
        const gracefulShutdown = async () => {
          await this.close();
          process.exit(0);
        };

        process.once("SIGTERM", gracefulShutdown);
        process.once("SIGINT", gracefulShutdown);
      }

      this.initialized = true;
    } catch (error) {
      // Cache the error to avoid repeated initialization attempts
      this.initializationError =
        error instanceof Error
          ? error
          : new Error("Failed to initialize database client");
      throw this.initializationError;
    }
  }

  // Helper method to execute queries with retry logic
  async query<T = any>(text: string, params?: any[]): Promise<T[]> {
    await this.ensureInitialized();

    if (!this.pool) {
      throw new Error("Database pool not initialized");
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.connectionRetries; attempt++) {
      try {
        const client: PoolClient = await this.pool.connect();
        try {
          // Set statement timeout for this query
          await client.query("SET statement_timeout = 30000"); // 30 seconds

          const result = await client.query(text, this.validateParams(params));
          return result.rows;
        } finally {
          client.release();
        }
      } catch (error) {
        lastError = error as Error;
        console.error(
          `Database query error (attempt ${attempt}/${this.connectionRetries}):`,
          error
        );

        // Don't retry on certain errors
        if (error instanceof Error) {
          const message = error.message.toLowerCase();
          if (
            message.includes("syntax error") ||
            message.includes("column") ||
            message.includes("relation") ||
            message.includes("constraint")
          ) {
            throw error; // Don't retry SQL syntax errors
          }
        }

        if (attempt < this.connectionRetries) {
          // Exponential backoff
          const delay = this.connectionRetryDelay * Math.pow(2, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error("Query failed after all retries");
  }

  // Helper method to execute single row queries
  private async queryOne<T = any>(
    text: string,
    params?: any[]
  ): Promise<T | null> {
    const rows = await this.query<T>(text, params);

    if (!rows[0]) {
      return null;
    }

    return rows.length > 0 ? rows[0] : null;
  }

  // Validate and sanitize parameters
  private validateParams(params?: any[]): any[] {
    if (!params) return [];

    return params.map((param) => {
      // Prevent SQL injection by ensuring params are properly typed
      if (param === null || param === undefined) return null;
      if (typeof param === "string") return param;
      if (typeof param === "number") return param;
      if (typeof param === "boolean") return param;
      if (param instanceof Date) return param;
      if (Buffer.isBuffer(param)) return param;

      // For objects, stringify them
      if (typeof param === "object") {
        return JSON.stringify(param);
      }

      // Reject functions or other types
      throw new Error(`Invalid parameter type: ${typeof param}`);
    });
  }

  // Helper method for simple execute queries
  private async execute(text: string, params?: any[]): Promise<void> {
    await this.query(text, params);
  }

  // Helper method for transactions
  private async transaction<T>(
    fn: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    await this.ensureInitialized();

    if (!this.pool) {
      throw new Error("Database pool not initialized");
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // Helper function to save template version
  async saveTemplateVersion(
    templateId: string,
    changeType: string,
    changeDescription: string
  ): Promise<void> {
    try {
      await this.query("SELECT save_template_version($1, $2, $3)", [
        templateId,
        changeType,
        changeDescription,
      ]);
    } catch (error) {
      console.error("Error saving template version:", error);
      // Don't throw - versioning failure shouldn't break the operation
    }
  }

  // Helper function to get template with fields snapshot
  async getTemplateSnapshot(templateId: string): Promise<any> {
    const [template] = await this.query<Template>(
      "SELECT * FROM templates WHERE id = $1",
      [templateId]
    );

    if (!template) {
      return null;
    }

    const fields = await this.query<Field>(
      "SELECT * FROM fields WHERE template_id = $1 ORDER BY sort_order",
      [templateId]
    );

    return {
      version: template.metadata?.current_version || 1,
      name: template.name,
      metadata: template.metadata,
      fields: fields.map((f) => ({
        id: f.id,
        name: f.name,
        description: f.description,
        sort_order: f.sort_order,
        metadata: f.metadata,
      })),
    };
  }

  // Get template version history
  async getTemplateHistory(templateId: string): Promise<
    Array<{
      version: number;
      created_at: string;
      change_type: string;
      change_description: string;
      field_count: number;
    }>
  > {
    try {
      const result = await this.query<{
        version: number;
        created_at: string;
        change_type: string;
        change_description: string;
        field_count: number;
      }>("SELECT * FROM get_template_history($1)", [templateId]);
      return result;
    } catch (error) {
      console.error("Error getting template history:", error);
      return [];
    }
  }

  // Get a specific template version
  async getTemplateVersion(
    templateId: string,
    versionNumber?: number
  ): Promise<any> {
    try {
      const [result] = await this.query(
        "SELECT get_template_version($1, $2) as version_data",
        [templateId, versionNumber || null]
      );
      return result?.version_data || null;
    } catch (error) {
      console.error("Error getting template version:", error);
      return null;
    }
  }

  // Restore template to a previous version
  async restoreTemplateVersion(
    templateId: string,
    versionNumber: number
  ): Promise<boolean> {
    try {
      const [result] = await this.query<{ restore_template_version: boolean }>(
        "SELECT restore_template_version($1, $2)",
        [templateId, versionNumber]
      );
      return result?.restore_template_version || false;
    } catch (error) {
      console.error("Error restoring template version:", error);
      throw error;
    }
  }

  // Template operations
  async getTemplates(): Promise<Template[]> {
    return await this.query<Template>(
      "SELECT * FROM templates ORDER BY created_at DESC"
    );
  }

  async getTemplatesForUser(userId: string): Promise<Template[]> {
    return await this.query<Template>(
      "SELECT * FROM templates WHERE owner_id = $1 ORDER BY created_at DESC",
      [userId]
    );
  }

  async getTemplate(id: string): Promise<Template | null> {
    return await this.queryOne<Template>(
      "SELECT * FROM templates WHERE id = $1",
      [id]
    );
  }

  async getTemplateWithFields(
    id: string
  ): Promise<(Template & { fields: Field[] }) | null> {
    const template = await this.queryOne<Template>(
      "SELECT * FROM templates WHERE id = $1",
      [id]
    );

    if (!template) return null;

    const fields = await this.query<Field>(
      "SELECT * FROM fields WHERE template_id = $1 ORDER BY sort_order",
      [id]
    );

    return { ...template, fields };
  }

  async createTemplate(
    template: Omit<Template, "id" | "created_at">
  ): Promise<Template> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    console.log("Creating template with:", {
      id,
      ...template,
      created_at: now,
    });

    try {
      const [newTemplate] = await this.query<Template>(
        `INSERT INTO templates (id, name, metadata, owner_id, created_at)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [id, template.name, template.metadata, template.owner_id, now]
      );

      if (!newTemplate) {
        throw new Error("Failed to create template");
      }

      // Save initial version after creation
      await this.saveTemplateVersion(
        newTemplate.id,
        "created",
        "Template created"
      );

      console.log("Template created successfully:", newTemplate);
      return newTemplate;
    } catch (error) {
      console.error("Error creating template in database:", error);
      throw error;
    }
  }

  async updateTemplate(id: string, updates: Partial<Template>): Promise<void> {
    // Get the current template to check what actually changed
    const [currentTemplate] = await this.query<Template>(
      "SELECT * FROM templates WHERE id = $1",
      [id]
    );

    if (!currentTemplate) {
      throw new Error("Template not found");
    }

    // Track what actually changed
    const actualChanges: Partial<Template> = {};
    let changeType = "updated";
    let changeDescription = "";

    // Check name change
    if (
      updates.name !== undefined &&
      updates.name.trim() !== currentTemplate.name.trim()
    ) {
      actualChanges.name = updates.name;
      changeType = "renamed";
      changeDescription = `Template renamed from "${currentTemplate.name}" to "${updates.name}"`;
    }

    // Check metadata change
    if (updates.metadata !== undefined) {
      // Deep comparison of metadata objects
      const metadataChanged =
        JSON.stringify(updates.metadata) !==
        JSON.stringify(currentTemplate.metadata);
      if (metadataChanged) {
        actualChanges.metadata = updates.metadata;
        if (!changeDescription) {
          changeType = "metadata_updated";
          // Check specifically for description change
          if (
            updates.metadata?.description !==
            currentTemplate.metadata?.description
          ) {
            changeDescription = "Template description updated";
          } else {
            changeDescription = "Template metadata updated";
          }
        }
      }
    }

    // If nothing actually changed, return early
    if (Object.keys(actualChanges).length === 0) {
      return;
    }

    // Build update query with only actual changes
    const setClause = Object.keys(actualChanges)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(", ");

    await this.query(`UPDATE templates SET ${setClause} WHERE id = $1`, [
      id,
      ...Object.values(actualChanges),
    ]);

    // Save version after update
    await this.saveTemplateVersion(id, changeType, changeDescription);
  }

  async deleteTemplate(id: string): Promise<void> {
    // First delete associated fields
    await this.query("DELETE FROM fields WHERE template_id = $1", [id]);
    // Then delete template
    await this.query("DELETE FROM templates WHERE id = $1", [id]);
  }

  // Field operations
  async getFields(templateId: string): Promise<Field[]> {
    return await this.query<Field>(
      "SELECT * FROM fields WHERE template_id = $1 ORDER BY sort_order",
      [templateId]
    );
  }

  async createField(field: Omit<Field, "id" | "created_at">): Promise<Field> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const [newField] = await this.query<Field>(
      `INSERT INTO fields (id, template_id, name, description, sort_order, created_at, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) RETURNING *`,
      [
        id,
        field.template_id,
        field.name,
        field.description,
        field.sort_order || 0,
        now,
        field.metadata || {},
      ]
    );

    // Save version after field creation
    await this.saveTemplateVersion(
      field.template_id,
      "field_added",
      `Added section "${field.name}"`
    );

    if (!newField) {
      throw new Error("Failed to create section");
    }

    return newField;
  }

  async updateField(id: string, updates: Partial<Field>): Promise<void> {
    // Get the field to know which template to version
    const [field] = await this.query<Field>(
      "SELECT * FROM fields WHERE id = $1",
      [id]
    );

    if (!field) {
      throw new Error("Section not found");
    }

    // Track what actually changed
    const actualChanges: Partial<Field> = {};
    const changeDescriptions: string[] = [];

    // Check name change
    if (
      updates.name !== undefined &&
      updates.name.trim() !== field.name.trim()
    ) {
      actualChanges.name = updates.name;
      changeDescriptions.push(
        `renamed from "${field.name}" to "${updates.name}"`
      );
    }

    // Check description change
    if (
      updates.description !== undefined &&
      updates.description.trim() !== field.description.trim()
    ) {
      actualChanges.description = updates.description;
      changeDescriptions.push("updated description");
    }

    // Check metadata changes (including type, chartConfig, etc.)
    if (updates.metadata !== undefined) {
      const metadataChanged =
        JSON.stringify(updates.metadata) !==
        JSON.stringify(field.metadata || {});
      if (metadataChanged) {
        actualChanges.metadata = updates.metadata;
        if (updates.metadata.type !== field.metadata.type) {
          changeDescriptions.push(`changed type to ${updates.metadata.type}`);
        } else {
          changeDescriptions.push("updated chart settings");
        }
      }
    }

    // Check sort_order change (reordering)
    if (
      updates.sort_order !== undefined &&
      updates.sort_order !== field.sort_order
    ) {
      actualChanges.sort_order = updates.sort_order;
      // Only mark as "reordered" if sort_order is the only change
      if (Object.keys(actualChanges).length === 1) {
        changeDescriptions.push("reordered");
      }
    }

    // If nothing actually changed, return early without saving version
    if (Object.keys(actualChanges).length === 0) {
      return;
    }

    // Build the update query with only the actual changes
    const setClause = Object.keys(actualChanges)
      .map((key, index) => {
        if (key === "metadata") {
          return `${key} = $${index + 2}::jsonb`;
        }
        return `${key} = $${index + 2}`;
      })
      .join(", ");

    await this.query(`UPDATE fields SET ${setClause} WHERE id = $1`, [
      id,
      ...Object.values(actualChanges),
    ]);

    // Generate appropriate version history message
    const fieldName = actualChanges.name || field.name;
    let changeDescription = "";
    let changeType = "field_updated";

    if (
      changeDescriptions.length === 1 &&
      changeDescriptions[0] === "reordered"
    ) {
      // Special case for reordering only
      changeDescription = `Reordered section "${fieldName}"`;
    } else if (changeDescriptions.length > 0) {
      // For actual field property changes
      if (changeDescriptions.includes("renamed from")) {
        // If renamed, show the rename message clearly
        const renameMsg = changeDescriptions.find((d) =>
          d.startsWith("renamed from")
        );
        const otherChanges = changeDescriptions.filter(
          (d) => !d.startsWith("renamed from")
        );
        if (otherChanges.length > 0) {
          changeDescription = `Updated section: ${renameMsg}${
            otherChanges.length > 0 ? " and " + otherChanges.join(", ") : ""
          }`;
        } else {
          changeDescription = `Updated section: ${renameMsg}`;
        }
      } else {
        // For other changes, be specific about what changed
        changeDescription = `Updated section "${fieldName}"${
          changeDescriptions.length > 0
            ? ": " + changeDescriptions.join(", ")
            : ""
        }`;
      }
    }

    // Save version history only if there was a meaningful change
    if (changeDescription) {
      await this.saveTemplateVersion(
        field.template_id,
        changeType,
        changeDescription
      );
    }
  }

  async deleteField(id: string): Promise<void> {
    // Get the field to know which template to version
    const [field] = await this.query<Field>(
      "SELECT * FROM fields WHERE id = $1",
      [id]
    );

    if (field) {
      await this.query("DELETE FROM fields WHERE id = $1", [id]);

      // Save version after field deletion
      await this.saveTemplateVersion(
        field.template_id,
        "field_deleted",
        `Deleted section "${field.name}"`
      );
    }
  }

  // User Files operations
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
  ): Promise<File[]> {
    let query = "SELECT * FROM files WHERE user_id = $1";
    const params: any[] = [userId];
    let paramIndex = 2;

    // Add search filter
    if (options?.search) {
      query += ` AND file_name ILIKE $${paramIndex}`;
      params.push(`%${options.search}%`);
      paramIndex++;
    }

    // Add source filter
    if (options?.source) {
      query += ` AND metadata->>'source' = $${paramIndex}`;
      params.push(options.source);
      paramIndex++;
    }

    // Add hash filter
    if (options?.hash) {
      query += ` AND file_hash = $${paramIndex}`;
      params.push(options.hash);
      paramIndex++;
    }

    // Add ordering
    query += " ORDER BY created_at DESC";

    // Add pagination
    if (options?.limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(options.limit);
      paramIndex++;
    }

    if (options?.offset) {
      query += ` OFFSET $${paramIndex}`;
      params.push(options.offset);
      paramIndex++;
    }

    let files = await this.query<File>(query, params);

    // Client-side tag filtering (since tags are in JSONB)
    if (options?.tags && options.tags.length > 0) {
      files = files.filter((file) => {
        const fileTags = file.metadata?.tags || [];
        return options.tags!.some((tag) => fileTags.includes(tag));
      });
    }

    return files;
  }

  async getFilesByHash(userId: string, hash: string): Promise<File[]> {
    return await this.query<File>(
      "SELECT * FROM files WHERE user_id = $1 AND file_hash = $2 ORDER BY created_at DESC",
      [userId, hash]
    );
  }

  async getFilesByIds(fileIds: string[]): Promise<File[]> {
    if (fileIds.length === 0) {
      return [];
    }

    // Create placeholders for the IN clause
    const placeholders = fileIds.map((_, index) => `$${index + 1}`).join(",");

    console.log("getFilesByIds called with fileIds:", fileIds);
    console.log("Generated SQL placeholders:", placeholders);

    const result = await this.query<File>(
      `SELECT * FROM files WHERE id IN (${placeholders}) ORDER BY created_at DESC`,
      fileIds
    );

    console.log("getFilesByIds result count:", result.length);
    return result;
  }

  async createFile(userFile: Omit<File, "id" | "created_at">): Promise<File> {
    // Fixed: using userFile parameter instead of file
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    console.log("Creating file in database with:", {
      id,
      user_id: userFile.user_id,
      file_name: userFile.file_name,
      file_size: userFile.file_size,
      file_size_type: typeof userFile.file_size,
    });

    try {
      const [newFile] = await this.query<File>(
        `INSERT INTO files (id, user_id, file_name, file_path, file_hash, file_size, metadata, file_map, page_map, processing_status, created_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [
          id,
          userFile.user_id,
          userFile.file_name,
          userFile.file_path,
          userFile.file_hash,
          userFile.file_size,
          JSON.stringify(userFile.metadata || {}),
          JSON.stringify(userFile.file_map || {}),
          JSON.stringify(userFile.page_map || {}),
          userFile.processing_status || "pending",
          now,
        ]
      );

      if (!newFile) {
        throw new Error("Failed to create file");
      }

      return newFile;
    } catch (error) {
      console.error("Database error in createFile:", error);
      throw error;
    }
  }

  async updateFile(
    fileId: string,
    updates: Partial<Pick<File, "file_name" | "metadata" | "processing_status">>
  ): Promise<void> {
    const setClause = Object.keys(updates)
      .map((key, index) => {
        if (key === "metadata") {
          return `${key} = $${index + 2}::jsonb`;
        }
        return `${key} = $${index + 2}`;
      })
      .join(", ");

    const values = Object.values(updates).map((value) =>
      typeof value === "object" ? JSON.stringify(value) : value
    );

    await this.query(`UPDATE files SET ${setClause} WHERE id = $1`, [
      fileId,
      ...values,
    ]);
  }

  async deleteFile(fileId: string): Promise<void> {
    // First remove from all projects
    await this.query("DELETE FROM project_files WHERE file_id = $1", [fileId]);
    // Then delete the file record
    await this.query("DELETE FROM files WHERE id = $1", [fileId]);
  }

  // Processing operations - delegate to backend API
  async processSingleField(
    field: string,
    description: string,
    fileIds: string[],
    projectMetadata: any = {}
  ): Promise<ProcessResponse> {
    await this.ensureInitialized();

    if (!this.baseUrl) {
      throw new Error("Backend URL not configured");
    }

    try {
      // Get access token from global variable
      const token =
        typeof window !== "undefined" && (window as any).__authToken
          ? (window as any).__authToken
          : null;

      const response = await fetch(`${this.baseUrl}/process`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({
          field_name: field,
          field_description: description,
          file_ids: fileIds,
          project_metadata: projectMetadata,
        }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        if (responseData.detail) {
          throw new Error(
            typeof responseData.detail === "string"
              ? responseData.detail
              : JSON.stringify(responseData.detail)
          );
        }
        throw new Error("Failed to process section");
      }

      return {
        status: "success",
        data: {
          result: responseData.response || [],
          lineMap: responseData.line_map || {},
        },
      };
    } catch (error) {
      console.error("Error in processSingleField:", error);
      throw error;
    }
  }

  // Results operations
  async getLatestResults(
    templateId: string,
    projectId: string
  ): Promise<Record<string, any>> {
    // STRICT: Get the latest run for this template filtered by project to prevent cross-project data leakage
    const latestRun = await this.queryOne(
      "SELECT * FROM runs WHERE template_id = $1 AND project_id = $2 ORDER BY created_at DESC LIMIT 1",
      [templateId, projectId]
    );

    if (!latestRun) return {};

    // Get all results for this run with field information
    const results = await this.query(
      `SELECT r.*, f.name as field_name 
       FROM results r 
       JOIN fields f ON r.field_id = f.id 
       WHERE r.run_id = $1`,
      [latestRun.id]
    );

    // Format results into expected structure
    const formattedResults: Record<string, any> = {};
    results.forEach((result) => {
      if (result.field_name) {
        formattedResults[result.field_name] = {
          text: result.value?.text || [],
          lineMap: result.value?.lineMap || {},
        };
      }
    });

    return formattedResults;
  }

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
    // Get template snapshot
    const templateSnapshot = await this.getTemplateSnapshot(
      runData.template_id
    );

    // Get available files for the project
    let availableFiles: any[] = [];
    if (runData.project_id) {
      const projectFiles = await this.query<{ file_id: string }>(
        "SELECT file_id FROM project_files WHERE project_id = $1",
        [runData.project_id]
      );

      if (projectFiles.length > 0) {
        const fileIds = projectFiles.map((pf) => pf.file_id);
        const files = await this.getFilesByIds(fileIds);
        availableFiles = files.map((f) => ({
          id: f.id,
          name: f.file_name,
          size: f.file_size,
          mime_type: f.metadata?.mimeType || "application/octet-stream",
          upload_status: f.metadata?.uploadStatus || "completed",
          processing_status: f.processing_status || "completed",
        }));
      }
    }

    // Get project metadata
    let projectMetadata = {};
    if (runData.project_id) {
      const [project] = await this.query<Project>(
        "SELECT name, metadata FROM projects WHERE id = $1",
        [runData.project_id]
      );
      if (project) {
        projectMetadata = {
          name: project.name,
          custom_instructions: project.metadata?.custom_instructions,
          ...project.metadata,
        };
      }
    }

    // Combine all metadata
    const enhancedMetadata = {
      ...runData.metadata,
      template_snapshot: templateSnapshot,
      available_files: availableFiles,
      project_metadata: projectMetadata,
    };

    const result = await this.query<{
      id: string;
      created_at: string;
      status: string;
      metadata?: { name?: string; description?: string; [key: string]: any };
    }>(
      "INSERT INTO runs (id, template_id, project_id, status, metadata) VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at, status, metadata",
      [
        runData.id,
        runData.template_id,
        runData.project_id,
        runData.status,
        JSON.stringify(enhancedMetadata),
      ]
    );

    // Update the template's active_run_id to point to this new run
    await this.query(
      `UPDATE templates
       SET metadata = jsonb_set(
         COALESCE(metadata, '{}')::jsonb,
         '{active_run_id}',
         $2::jsonb
       )
       WHERE id = $1`,
      [runData.template_id, JSON.stringify(runData.id)]
    );

    if (!result[0]) {
      throw new Error("Failed to create run");
    }

    return result[0];
  }

  async updateRun(
    runId: string,
    updates: {
      status?: string;
      metadata?: { name?: string; description?: string; [key: string]: any };
    }
  ): Promise<void> {
    const updateFields = [];
    const values = [runId];
    let paramIndex = 2;

    if (updates.status !== undefined) {
      updateFields.push(`status = $${paramIndex}`);
      values.push(updates.status);
      paramIndex++;
    }

    if (updates.metadata !== undefined) {
      updateFields.push(`metadata = $${paramIndex}`);
      values.push(JSON.stringify(updates.metadata));
      paramIndex++;
    }

    if (updateFields.length > 0) {
      await this.query(
        `UPDATE runs SET ${updateFields.join(", ")} WHERE id = $1`,
        values
      );
    }
  }

  async deleteRun(runId: string): Promise<void> {
    // Delete the run - results will be automatically deleted due to CASCADE constraint
    await this.query("DELETE FROM runs WHERE id = $1", [runId]);
  }

  async getResultsForRun(runId: string): Promise<any[]> {
    return await this.query(
      "SELECT * FROM results WHERE run_id = $1 ORDER BY created_at",
      [runId]
    );
  }

  async saveResult(resultData: {
    run_id: string;
    field_id: string;
    value: any;
    metadata: any;
    status: string;
  }): Promise<string> {
    // First, try to find existing result for this run_id + field_id
    const existing = await this.query(
      "SELECT id FROM results WHERE run_id = $1 AND field_id = $2 ORDER BY created_at DESC LIMIT 1",
      [resultData.run_id, resultData.field_id]
    );

    if (existing && existing.length > 0) {
      // Update existing result
      await this.query(
        "UPDATE results SET value = $1, metadata = $2, status = $3 WHERE id = $4",
        [
          JSON.stringify(resultData.value),
          JSON.stringify(resultData.metadata || {}),
          resultData.status,
          existing[0].id,
        ]
      );
      return existing[0].id;
    } else {
      // Insert new result
      const resultId = crypto.randomUUID();
      await this.query(
        "INSERT INTO results (id, run_id, field_id, value, metadata, status) VALUES ($1, $2, $3, $4, $5, $6)",
        [
          resultId,
          resultData.run_id,
          resultData.field_id,
          JSON.stringify(resultData.value),
          JSON.stringify(resultData.metadata || {}),
          resultData.status,
        ]
      );
      return resultId;
    }
  }

  async updateResultMetadata(resultId: string, metadata: any): Promise<void> {
    console.log("[DB] updateResultMetadata:", { resultId, metadata });
    const result = await this.query(
      "UPDATE results SET metadata = $1 WHERE id = $2",
      [JSON.stringify(metadata), resultId]
    );
    console.log("[DB] updateResultMetadata result:", result);
  }

  // Project Permissions operations
  async checkUserProjectPermission(
    userId: string,
    projectId: string,
    requiredRole: ProjectRole = "editor"
  ): Promise<boolean> {
    try {
      console.log("Permission check - inputs:", {
        userId,
        projectId,
        requiredRole,
      });

      const result = await this.queryOne<{ has_permission: boolean }>(
        "SELECT user_has_project_permission($1::uuid, $2::uuid, $3::text) as has_permission",
        [userId, projectId, requiredRole]
      );

      console.log("Permission check - DB result:", result);

      if (result?.has_permission) {
        return true;
      }

      // If function failed, try fallback checks
      console.log("Function returned false, trying fallback checks...");

      // Check if user owns the project directly
      const ownerCheck = await this.queryOne<{ user_id: string }>(
        "SELECT user_id FROM projects WHERE id = $1 AND user_id = $2",
        [projectId, userId]
      );

      if (ownerCheck) {
        console.log("User is project owner - granting permission");
        return true;
      }

      // Check if user has explicit permission
      const permissionCheck = await this.queryOne<{ role: string }>(
        "SELECT role FROM project_permissions WHERE project_id = $1 AND user_id = $2",
        [projectId, userId]
      );

      console.log("Permission table check:", permissionCheck);

      if (permissionCheck) {
        console.log("User has explicit permission - granting access");
        return true;
      }

      console.log("No permission found");
      return false;
    } catch (error) {
      console.error("Error checking permission:", error);
      return false;
    }
  }

  async getUserProjectRole(
    userId: string,
    projectId: string
  ): Promise<ProjectRole | null> {
    const result = await this.queryOne<{ role: ProjectRole }>(
      "SELECT get_user_project_role($1, $2) as role",
      [userId, projectId]
    );
    return result?.role || null;
  }

  async shareProject(
    request: ShareProjectRequest,
    grantedBy: string
  ): Promise<ShareProjectResponse> {
    try {
      console.log("Attempting to share project:", {
        project_id: request.project_id,
        user_email: request.user_email,
        role: request.role,
        grantedBy: grantedBy,
      });

      // Find user by email using database function
      const userResult = await this.queryOne<{
        azure_id: string;
        display_name: string;
        email: string;
        is_active: boolean;
      }>("SELECT * FROM find_user_by_email($1)", [request.user_email]);

      if (!userResult) {
        return {
          success: false,
          error: `User with email ${request.user_email} not found. They need to sign in to the platform first.`,
        };
      }

      if (!userResult.is_active) {
        return {
          success: false,
          error: `User account for ${request.user_email} is inactive.`,
        };
      }

      const permission = await this.queryOne<ProjectPermission>(
        `INSERT INTO project_permissions (project_id, user_id, role, granted_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (project_id, user_id) 
         DO UPDATE SET role = EXCLUDED.role, granted_by = EXCLUDED.granted_by, granted_at = NOW()
         RETURNING *`,
        [request.project_id, userResult.azure_id, request.role, grantedBy]
      );

      console.log(
        "Successfully shared project with user:",
        userResult.display_name || userResult.email
      );

      return {
        success: true,
        permission: permission || undefined,
      };
    } catch (error) {
      console.error("Error sharing project:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to share project.",
      };
    }
  }

  async getProjectMembers(projectId: string): Promise<ProjectMember[]> {
    try {
      // Use the database function to get all members with profile information
      const members = await this.query<{
        user_id: string;
        email: string;
        display_name: string;
        profile_picture_url: string;
        role: string;
        granted_at: string;
        granted_by: string;
      }>("SELECT * FROM get_project_members_with_profiles($1)", [projectId]);

      // Transform to ProjectMember format
      return members.map((member) => ({
        user_id: member.user_id,
        email: member.email,
        name: member.display_name,
        avatar_url: member.profile_picture_url,
        role: member.role as ProjectRole,
        granted_at: member.granted_at,
        granted_by: member.granted_by,
      }));
    } catch (error) {
      console.error("Error fetching project members:", error);
      // Fallback to basic implementation if user_profiles table doesn't exist yet
      return this.getProjectMembersLegacy(projectId);
    }
  }

  // Legacy implementation for backward compatibility
  private async getProjectMembersLegacy(
    projectId: string
  ): Promise<ProjectMember[]> {
    const owner = await this.queryOne<{ user_id: string; created_at: string }>(
      "SELECT user_id, created_at FROM projects WHERE id = $1",
      [projectId]
    );

    const members: ProjectMember[] = [];

    if (owner) {
      members.push({
        user_id: owner.user_id,
        email: `user-${owner.user_id.substring(0, 8)}@unknown.com`,
        role: "owner",
        granted_at: owner.created_at,
        granted_by: owner.user_id,
      });
    }

    const permissions = await this.query<ProjectPermission>(
      "SELECT * FROM project_permissions WHERE project_id = $1 ORDER BY granted_at DESC",
      [projectId]
    );

    for (const permission of permissions) {
      members.push({
        user_id: permission.user_id,
        email: `user-${permission.user_id.substring(0, 8)}@unknown.com`,
        role: permission.role,
        granted_at: permission.granted_at,
        granted_by: permission.granted_by,
      });
    }

    return members;
  }

  async removeProjectPermission(
    projectId: string,
    userId: string
  ): Promise<boolean> {
    try {
      await this.query(
        "DELETE FROM project_permissions WHERE project_id = $1 AND user_id = $2",
        [projectId, userId]
      );
      return true;
    } catch (error) {
      console.error("Error removing project permission:", error);
      return false;
    }
  }

  async updateProjectPermission(
    projectId: string,
    userId: string,
    newRole: ProjectRole,
    updatedBy: string
  ): Promise<boolean> {
    try {
      await this.query(
        `UPDATE project_permissions 
         SET role = $3, granted_by = $4, granted_at = NOW()
         WHERE project_id = $1 AND user_id = $2`,
        [projectId, userId, newRole, updatedBy]
      );
      return true;
    } catch (error) {
      console.error("Error updating project permission:", error);
      return false;
    }
  }

  // Project operations (updated with permission support)
  async getProjects(userId: string): Promise<Project[]> {
    return await this.query<Project>(
      "SELECT * FROM projects WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
  }

  async getProjectsWithPermissions(
    userId: string
  ): Promise<ProjectWithPermissions[]> {
    try {
      const query = `
        SELECT DISTINCT p.*, 
               CASE 
                 WHEN p.user_id = $1 THEN 'owner'
                 ELSE pp.role 
               END as user_role,
               CASE WHEN pp.project_id IS NOT NULL THEN true ELSE false END as is_shared
        FROM projects p
        LEFT JOIN project_permissions pp ON p.id = pp.project_id AND pp.user_id = $1
        WHERE p.user_id = $1 OR pp.user_id = $1
        ORDER BY p.created_at DESC
      `;

      const results = await this.query<ProjectWithPermissions>(query, [userId]);

      // Add shared_with_count for each project
      for (const project of results) {
        try {
          const countResult = await this.queryOne<{ count: number }>(
            "SELECT COUNT(*) as count FROM project_permissions WHERE project_id = $1",
            [project.id]
          );
          project.shared_with_count = countResult?.count || 0;
        } catch (error) {
          // If permission table doesn't exist, set to 0
          project.shared_with_count = 0;
        }
      }

      return results;
    } catch (error) {
      // If project_permissions table doesn't exist, fall back to basic projects
      console.warn(
        "Permission features not available, falling back to basic projects"
      );
      const basicProjects = await this.getProjects(userId);
      return basicProjects.map((project) => ({
        ...project,
        user_role: "owner" as const,
        shared_with_count: 0,
        is_shared: false,
      }));
    }
  }

  async createProject(
    name: string,
    metadata: any,
    userId: string
  ): Promise<Project> {
    const result = await this.query<Project>(
      `INSERT INTO projects (name, user_id, metadata) 
       VALUES ($1, $2, $3) 
       RETURNING *`,
      [name, userId, metadata]
    );

    if (!result[0]) {
      throw new Error("Failed to create project");
    }

    return result[0];
  }

  async updateProject(
    projectId: string,
    updates: { name?: string; metadata?: any }
  ): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.metadata !== undefined) {
      fields.push(`metadata = $${paramIndex++}`);
      values.push(updates.metadata);
    }

    if (fields.length === 0) return;

    values.push(projectId);

    await this.execute(
      `UPDATE projects SET ${fields.join(", ")} WHERE id = $${paramIndex}`,
      values
    );
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.transaction(async (client) => {
      // First delete all associations
      await client.query("DELETE FROM project_files WHERE project_id = $1", [
        projectId,
      ]);

      // Then delete the project
      await client.query("DELETE FROM projects WHERE id = $1", [projectId]);
    });
  }

  // Project Files operations (with permission checks)
  async getProjectFiles(
    projectId: string,
    userId?: string
  ): Promise<(File & { added_at: string })[]> {
    let query = `
      SELECT f.*, pf.added_at
      FROM files f
      JOIN project_files pf ON f.id = pf.file_id
      WHERE pf.project_id = $1
      ORDER BY pf.added_at DESC
    `;
    const params = [projectId];

    // If userId provided, verify access to project
    if (userId) {
      query = `
        SELECT f.*, pf.added_at
        FROM files f
        JOIN project_files pf ON f.id = pf.file_id
        JOIN projects p ON pf.project_id = p.id
        LEFT JOIN project_permissions pp ON p.id = pp.project_id AND pp.user_id = $2
        WHERE pf.project_id = $1 AND (p.user_id = $2 OR pp.user_id = $2)
        ORDER BY pf.added_at DESC
      `;
      params.push(userId);
    }

    return await this.query(query, params);
  }

  async addFilesToProject(
    projectId: string,
    fileIds: string[],
    userId: string
  ): Promise<void> {
    if (fileIds.length === 0) return;

    // Check for existing associations
    const placeholders = fileIds.map((_, index) => `$${index + 2}`).join(", ");
    const existingAssociations = await this.query(
      `SELECT file_id FROM project_files WHERE project_id = $1 AND file_id IN (${placeholders})`,
      [projectId, ...fileIds]
    );

    const existingFileIds = existingAssociations.map((row) => row.file_id);
    const newFileIds = fileIds.filter((id) => !existingFileIds.includes(id));

    if (newFileIds.length === 0) return;

    // Insert new associations
    const values = newFileIds
      .map(
        (_fileId, index) =>
          `($1, $${index + 2}, NOW(), $${newFileIds.length + 2})`
      )
      .join(", ");

    await this.query(
      `INSERT INTO project_files (project_id, file_id, added_at, added_by) VALUES ${values}`,
      [projectId, ...newFileIds, userId]
    );
  }

  async removeFilesFromProject(
    projectId: string,
    fileIds: string[]
  ): Promise<void> {
    if (fileIds.length === 0) return;

    const placeholders = fileIds.map((_, index) => `$${index + 2}`).join(", ");
    await this.query(
      `DELETE FROM project_files WHERE project_id = $1 AND file_id IN (${placeholders})`,
      [projectId, ...fileIds]
    );
  }

  async getProjectFileIds(projectId: string): Promise<string[]> {
    const results = await this.query(
      "SELECT file_id FROM project_files WHERE project_id = $1",
      [projectId]
    );
    return results.map((row) => row.file_id);
  }

  // Find projects that contain a specific file (by file path)
  async getProjectsContainingFile(filePath: string): Promise<string[]> {
    const query = `
      SELECT DISTINCT pf.project_id
      FROM project_files pf
      JOIN files f ON pf.file_id = f.id
      WHERE f.file_path = $1
    `;
    const results = await this.query(query, [filePath]);
    return results.map((row) => row.project_id);
  }

  // Check if user has access to a file through any project or direct ownership
  async checkUserFileAccess(
    userId: string,
    filePath: string
  ): Promise<boolean> {
    try {
      // First check if user owns the file directly
      const fileOwnerResult = await this.queryOne<{ user_id: string }>(
        "SELECT user_id FROM files WHERE file_path = $1",
        [filePath]
      );

      if (fileOwnerResult && fileOwnerResult.user_id === userId) {
        return true;
      }

      // Then check if user has access through project permissions
      const query = `
        SELECT DISTINCT pf.project_id
        FROM project_files pf
        JOIN files f ON pf.file_id = f.id
        JOIN projects p ON pf.project_id = p.id
        LEFT JOIN project_permissions pp ON p.id = pp.project_id
        WHERE f.file_path = $1 
        AND (p.user_id = $2 OR (pp.user_id = $2 AND pp.role IN ('owner', 'editor')))
      `;

      const results = await this.query(query, [filePath, userId]);
      return results.length > 0;
    } catch (error) {
      console.error("Error checking file access:", error);
      return false;
    }
  }

  async getProjectsForUser(userId: string): Promise<Project[]> {
    return this.getProjects(userId);
  }

  async getProject(projectId: string, userId?: string): Promise<Project> {
    let query = "SELECT * FROM projects WHERE id = $1";
    const params = [projectId];

    // If userId provided, check permissions
    if (userId) {
      query = `
        SELECT p.* FROM projects p
        LEFT JOIN project_permissions pp ON p.id = pp.project_id AND pp.user_id = $2
        WHERE p.id = $1 AND (p.user_id = $2 OR pp.user_id = $2)
      `;
      params.push(userId);
    }

    const [project] = await this.query<Project>(query, params);
    if (!project) {
      throw new Error("Project not found or access denied");
    }
    return project;
  }

  async getProjectWithPermissions(
    projectId: string,
    userId: string
  ): Promise<ProjectWithPermissions> {
    const query = `
      SELECT p.*, 
             CASE 
               WHEN p.user_id = $2 THEN 'owner'
               ELSE pp.role 
             END as user_role,
             CASE WHEN pp.project_id IS NOT NULL THEN true ELSE false END as is_shared
      FROM projects p
      LEFT JOIN project_permissions pp ON p.id = pp.project_id AND pp.user_id = $2
      WHERE p.id = $1 AND (p.user_id = $2 OR pp.user_id = $2)
    `;

    const [project] = await this.query<ProjectWithPermissions>(query, [
      projectId,
      userId,
    ]);
    if (!project) {
      throw new Error("Project not found or access denied");
    }

    // Add shared_with_count
    const countResult = await this.queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM project_permissions WHERE project_id = $1",
      [projectId]
    );
    project.shared_with_count = countResult?.count || 0;

    return project;
  }

  // Project Template operations
  async getTemplatesForProject(projectId: string): Promise<Template[]> {
    const query = `
      SELECT t.* FROM templates t
      JOIN project_templates st ON t.id = st.template_id
      WHERE st.project_id = $1
      ORDER BY t.created_at DESC
    `;
    return await this.query(query, [projectId]);
  }

  async addTemplatesToProject(
    projectId: string,
    templateIds: string[],
    userId: string
  ): Promise<void> {
    if (templateIds.length === 0) return;

    // First check which templates are already associated
    const placeholders = templateIds
      .map((_, index) => `$${index + 2}`)
      .join(", ");
    const existingAssociations = await this.query(
      `SELECT template_id FROM project_templates WHERE project_id = $1 AND template_id IN (${placeholders})`,
      [projectId, ...templateIds]
    );

    const existingTemplateIds = new Set(
      existingAssociations.map((row) => row.template_id)
    );
    const newTemplateIds = templateIds.filter(
      (id) => !existingTemplateIds.has(id)
    );

    if (newTemplateIds.length === 0) return;

    // Insert new associations
    const values = newTemplateIds
      .map(
        (_, index) =>
          `($1, $${index + 2}, now(), $${newTemplateIds.length + 2})`
      )
      .join(", ");

    await this.query(
      `INSERT INTO project_templates (project_id, template_id, added_at, added_by) VALUES ${values}`,
      [projectId, ...newTemplateIds, userId]
    );
  }

  async removeTemplatesFromProject(
    projectId: string,
    templateIds: string[]
  ): Promise<void> {
    if (templateIds.length === 0) return;

    const placeholders = templateIds
      .map((_, index) => `$${index + 2}`)
      .join(", ");
    await this.query(
      `DELETE FROM project_templates WHERE project_id = $1 AND template_id IN (${placeholders})`,
      [projectId, ...templateIds]
    );
  }

  async getProjectTemplateIds(projectId: string): Promise<string[]> {
    const results = await this.query(
      "SELECT template_id FROM project_templates WHERE project_id = $1",
      [projectId]
    );
    return results.map((row) => row.template_id);
  }

  // Run operations
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
    // STRICT: Always filter by both template_id AND project_id to prevent cross-project data leakage
    return await this.query(
      "SELECT id, created_at, status, metadata FROM runs WHERE template_id = $1 AND project_id = $2 ORDER BY created_at DESC",
      [templateId, projectId]
    );
  }

  async saveResults(
    templateId: string,
    request: SaveResultsRequest
  ): Promise<void> {
    await this.transaction(async (client) => {
      // Create a new run
      const runResult = await client.query(
        "INSERT INTO runs (template_id, project_id, status) VALUES ($1, $2, $3) RETURNING id",
        [templateId, request.projectId, "completed"]
      );
      const runId = runResult.rows[0].id;

      // Save each field result
      for (const [fieldName, result] of Object.entries(request.results)) {
        // Get the field ID from the field name
        const fieldResult = await client.query(
          "SELECT id FROM fields WHERE template_id = $1 AND name = $2",
          [templateId, fieldName]
        );

        if (fieldResult.rows.length > 0) {
          const fieldId = fieldResult.rows[0].id;

          await client.query(
            `INSERT INTO results (run_id, field_id, value, metadata, status)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              runId,
              fieldId,
              JSON.stringify({
                text: result.text,
                lineMap: result.lineMap,
              }),
              JSON.stringify({}),
              "completed",
            ]
          );
        }
      }
    });
  }

  // User Profile Management Functions
  async upsertUserProfile(userInfo: {
    azureId: string;
    email: string;
    displayName?: string;
    givenName?: string;
    surname?: string;
    jobTitle?: string;
    department?: string;
    companyName?: string;
    profilePictureUrl?: string;
  }): Promise<void> {
    try {
      await this.queryOne(
        `SELECT upsert_user_profile($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          userInfo.azureId,
          userInfo.email,
          userInfo.displayName,
          userInfo.givenName,
          userInfo.surname,
          userInfo.jobTitle,
          userInfo.department,
          userInfo.companyName,
          userInfo.profilePictureUrl,
        ]
      );
      console.log("User profile upserted successfully:", userInfo.email);
    } catch (error) {
      console.error("Error upserting user profile:", error);
      throw error;
    }
  }

  async findUserByEmail(email: string): Promise<{
    azure_id: string;
    display_name: string;
    email: string;
    is_active: boolean;
  } | null> {
    try {
      const result = await this.queryOne<{
        azure_id: string;
        display_name: string;
        email: string;
        is_active: boolean;
      }>("SELECT * FROM find_user_by_email($1)", [email]);
      return result;
    } catch (error) {
      console.error("Error finding user by email:", error);
      return null;
    }
  }

  async getUserProfile(azureId: string): Promise<{
    id: string;
    azure_id: string;
    email: string;
    display_name: string;
    given_name: string;
    surname: string;
    job_title: string;
    department: string;
    company_name: string;
    profile_picture_url: string;
    is_active: boolean;
    last_login_at: string;
    created_at: string;
    updated_at: string;
    metadata?: Record<string, any>;
  } | null> {
    try {
      const result = await this.queryOne<any>(
        "SELECT * FROM user_profiles WHERE azure_id = $1 AND is_active = true",
        [azureId]
      );
      return result;
    } catch (error) {
      console.error("Error getting user profile:", error);
      return null;
    }
  }

  // Close the connection pool when done
  async close(): Promise<void> {
    if (this.isClosing || !this.pool) {
      return; // Already closing or never initialized
    }

    this.isClosing = true;

    try {
      await this.pool.end();
      console.log("Database connection pool closed");
    } catch (error) {
      // Only log if it's not the "already closed" error
      if (
        error instanceof Error &&
        !error.message.includes("Called end on pool more than once")
      ) {
        console.error("Error closing database pool:", error);
      }
    }
  }
}

// Global singleton to prevent multiple instances during build
declare global {
  // eslint-disable-next-line no-var
  var __azureDbClient: AzureDbClient | undefined;
}

// Use globalThis for cross-environment compatibility (Node.js and browser)
const globalObj =
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof window !== "undefined"
    ? window
    : global;

// Export singleton instance
export const azureDbClient = (() => {
  if (!(globalObj as any).__azureDbClient) {
    (globalObj as any).__azureDbClient = new AzureDbClient();
  }
  return (globalObj as any).__azureDbClient;
})();

export { AzureDbClient };
