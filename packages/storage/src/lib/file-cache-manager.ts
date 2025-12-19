import { File as DatabaseFile } from "@studio/core";

interface CacheEntry {
  data: DatabaseFile[];
  timestamp: number;
}

class FileCacheManager {
  private cache: Map<string, CacheEntry> = new Map();
  private refreshTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly REFRESH_INTERVAL = 30 * 1000; // 30 seconds

  getLibraryFiles(userId: string): DatabaseFile[] | null {
    const entry = this.cache.get(userId);
    return entry ? entry.data : null;
  }

  setLibraryFiles(userId: string, files: DatabaseFile[]): void {
    this.cache.set(userId, {
      data: files,
      timestamp: Date.now(),
    });
  }

  addLibraryFile(userId: string, file: DatabaseFile): void {
    const cached = this.cache.get(userId);
    const files = cached ? [file, ...cached.data] : [file];
    this.setLibraryFiles(userId, files);
  }

  updateLibraryFile(
    userId: string,
    fileId: string,
    updates: Partial<DatabaseFile>
  ): void {
    const cached = this.cache.get(userId);
    if (!cached) return;

    const updatedFiles = cached.data.map((file) =>
      file.id === fileId ? { ...file, ...updates } : file
    );
    this.setLibraryFiles(userId, updatedFiles);
  }

  removeLibraryFile(userId: string, fileId: string): void {
    const cached = this.cache.get(userId);
    if (!cached) return;

    const filteredFiles = cached.data.filter((file) => file.id !== fileId);
    this.setLibraryFiles(userId, filteredFiles);
  }

  startBackgroundRefresh(key: string, refreshFn: () => Promise<void>): void {
    this.stopBackgroundRefresh(key);

    const timer = setInterval(async () => {
      try {
        await refreshFn();
      } catch (err) {
        console.error(`Background refresh failed for ${key}:`, err);
      }
    }, this.REFRESH_INTERVAL);

    this.refreshTimers.set(key, timer);
  }

  stopBackgroundRefresh(key: string): void {
    const timer = this.refreshTimers.get(key);
    if (timer) {
      clearInterval(timer);
      this.refreshTimers.delete(key);
    }
  }
}

export const fileCacheManager = new FileCacheManager();
