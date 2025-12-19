import {
  BlobServiceClient,
  ContainerClient,
  BlobSASPermissions,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import { getServerConfig, type ServerConfig } from "./config/runtime-config";

class AzureBlobClient {
  private blobServiceClient?: BlobServiceClient;
  private containerClient?: ContainerClient;
  private sharedKeyCredential?: StorageSharedKeyCredential;
  private config?: ServerConfig["azureStorage"];
  private initialized = false;
  private initializationError?: Error;

  constructor() {
    // Lazy initialization - don't load config in constructor
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    // If we already tried and failed, throw the cached error
    if (this.initializationError) {
      throw this.initializationError;
    }

    try {
      // This will only work on the server side and will validate the config
      const serverConfig = getServerConfig();
      this.config = serverConfig.azureStorage;

      this.sharedKeyCredential = new StorageSharedKeyCredential(
        this.config.accountName,
        this.config.accountKey
      );

      this.blobServiceClient = new BlobServiceClient(
        this.config.endpoint,
        this.sharedKeyCredential
      );

      this.containerClient = this.blobServiceClient.getContainerClient(
        this.config.containerName
      );

      this.initialized = true;

      // Initialize container if it doesn't exist
      await this.initializeContainer();
    } catch (error) {
      // Cache the error to avoid repeated initialization attempts
      this.initializationError =
        error instanceof Error
          ? error
          : new Error("Failed to initialize Azure Blob Client");
      throw this.initializationError;
    }
  }

  private async initializeContainer(): Promise<void> {
    if (!this.containerClient || !this.config) return;

    try {
      // Check if container exists
      const exists = await this.containerClient.exists();

      if (!exists) {
        console.log(`Creating container: ${this.config.containerName}`);
        await this.containerClient.create({
          access: "container", // Public read access for blobs
        });
        console.log("Container created successfully");
      } else {
        console.log("Container already exists");
      }
    } catch (error) {
      console.error("Error checking/creating container:", error);
      // Don't throw here - container might exist but we can't check due to permissions
      // This is a non-critical error
    }
  }

  /**
   * Upload a file to Azure Blob Storage
   */
  async uploadFile(
    file: Blob,
    fileName: string
  ): Promise<{ fileName: string; url: string; size: number }> {
    await this.ensureInitialized();

    if (!this.containerClient) {
      throw new Error("Azure Blob Storage client not initialized");
    }

    try {
      const timestamp = Date.now();
      const uniqueFileName = `${timestamp}-${fileName}`;

      const blockBlobClient =
        this.containerClient.getBlockBlobClient(uniqueFileName);
      const arrayBuffer = await file.arrayBuffer();

      // Encode original filename to be header-safe
      const originalNameBase64 = Buffer.from(fileName, "utf8").toString(
        "base64"
      );

      const uploadResponse = await blockBlobClient.uploadData(arrayBuffer, {
        blobHTTPHeaders: {
          blobContentType: file.type || "application/octet-stream",
        },
        metadata: {
          originalname_b64: originalNameBase64,
          uploaddate: new Date().toISOString(),
        },
      });

      return {
        fileName: uniqueFileName,
        url: blockBlobClient.url,
        size: file.size,
      };
    } catch (error) {
      console.error("Error uploading file to Azure Blob Storage:", error);

      if (error instanceof Error) {
        if (error.message.includes("Invalid character in header content")) {
          throw new Error(
            "Failed to upload file: file name contains characters that cannot be stored in blob metadata."
          );
        }
        if (error.message.includes("SharedKeyCredential")) {
          throw new Error(
            "Azure Storage authentication failed. Please check your storage account credentials."
          );
        }
        if (error.message.includes("404")) {
          throw new Error(
            "Azure Storage container not found. Please ensure the container exists."
          );
        }
        if (error.message.includes("403")) {
          throw new Error(
            "Azure Storage access denied. Please check your storage account permissions."
          );
        }
        throw new Error(`Failed to upload file: ${error.message}`);
      }

      throw new Error("Failed to upload file to Azure Blob Storage");
    }
  }

  /**
   * Generate a download URL with SAS token for a file
   */
  async getDownloadUrl(
    fileName: string,
    expiresInHours: number = 1
  ): Promise<string> {
    await this.ensureInitialized();

    if (!this.containerClient || !this.sharedKeyCredential || !this.config) {
      throw new Error("Azure Blob Storage client not initialized");
    }

    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(fileName);

      // Generate SAS token for download
      const sasOptions = {
        containerName: this.config.containerName,
        blobName: fileName,
        permissions: BlobSASPermissions.parse("r"), // Read permission
        startsOn: new Date(),
        expiresOn: new Date(
          new Date().valueOf() + expiresInHours * 60 * 60 * 1000
        ),
      };

      const sasToken = generateBlobSASQueryParameters(
        sasOptions,
        this.sharedKeyCredential
      ).toString();

      return `${blockBlobClient.url}?${sasToken}`;
    } catch (error) {
      console.error("Error generating download URL:", error);
      throw new Error("Failed to generate download URL");
    }
  }

  /**
   * Delete a file from Azure Blob Storage
   */
  async deleteFile(fileName: string): Promise<void> {
    await this.ensureInitialized();

    if (!this.containerClient) {
      throw new Error("Azure Blob Storage client not initialized");
    }

    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(fileName);
      await blockBlobClient.deleteIfExists();
    } catch (error) {
      console.error("Error deleting file from Azure Blob Storage:", error);
      throw new Error("Failed to delete file from Azure Blob Storage");
    }
  }

  /**
   * Check if a file exists in Azure Blob Storage
   */
  async fileExists(fileName: string): Promise<boolean> {
    await this.ensureInitialized();

    if (!this.containerClient) {
      return false;
    }

    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(fileName);
      const response = await blockBlobClient.exists();
      return response;
    } catch (error) {
      console.error("Error checking file existence:", error);
      return false;
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(
    fileName: string
  ): Promise<Record<string, string> | null> {
    await this.ensureInitialized();

    if (!this.containerClient) {
      return null;
    }

    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(fileName);
      const properties = await blockBlobClient.getProperties();
      return properties.metadata || null;
    } catch (error) {
      console.error("Error getting file metadata:", error);
      return null;
    }
  }

  /**
   * List files in the container (with optional prefix filter)
   */
  async listFiles(
    prefix?: string
  ): Promise<Array<{ name: string; size: number; lastModified: Date }>> {
    await this.ensureInitialized();

    if (!this.containerClient) {
      return [];
    }

    try {
      const files: Array<{ name: string; size: number; lastModified: Date }> =
        [];

      for await (const blob of this.containerClient.listBlobsFlat({ prefix })) {
        files.push({
          name: blob.name,
          size: blob.properties.contentLength || 0,
          lastModified: blob.properties.lastModified || new Date(),
        });
      }

      return files;
    } catch (error) {
      console.error("Error listing files:", error);
      throw new Error("Failed to list files");
    }
  }
}

// Singleton instance - lazy loaded
let instance: AzureBlobClient | null = null;

export function getAzureBlobClient(): AzureBlobClient {
  if (!instance) {
    instance = new AzureBlobClient();
  }
  return instance;
}

// For backward compatibility
export const azureBlobClient = getAzureBlobClient();
export { AzureBlobClient };
