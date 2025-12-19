import { ProjectWithPermissions } from "@studio/core";

interface CacheEntry {
  data: ProjectWithPermissions[];
  timestamp: number;
}

class ProjectCacheManager {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly STORAGE_KEY = "studio_projects_cache";

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    if (typeof window === "undefined") return;

    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        this.cache = new Map(Object.entries(data));
      }
    } catch (err) {
      console.error("Failed to load projects cache from storage:", err);
    }
  }

  private saveToStorage(): void {
    if (typeof window === "undefined") return;

    try {
      const data = Object.fromEntries(this.cache);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.error("Failed to save projects cache to storage:", err);
    }
  }

  getProjects(userId: string): ProjectWithPermissions[] | null {
    const entry = this.cache.get(userId);
    return entry ? entry.data : null;
  }

  shouldRefresh(userId: string): boolean {
    const entry = this.cache.get(userId);
    if (!entry) return true;
    return Date.now() - entry.timestamp > this.CACHE_TTL;
  }

  setProjects(userId: string, projects: ProjectWithPermissions[]): void {
    this.cache.set(userId, {
      data: projects,
      timestamp: Date.now(),
    });
    this.saveToStorage();
  }

  addProject(userId: string, project: ProjectWithPermissions): void {
    const cached = this.cache.get(userId);
    const projects = cached ? [project, ...cached.data] : [project];
    this.setProjects(userId, projects);
  }

  updateProject(
    userId: string,
    projectId: string,
    updates: Partial<ProjectWithPermissions>
  ): void {
    const cached = this.cache.get(userId);
    if (!cached) return;

    const updated = cached.data.map((p) =>
      p.id === projectId ? { ...p, ...updates } : p
    );
    this.setProjects(userId, updated);
  }

  removeProject(userId: string, projectId: string): void {
    const cached = this.cache.get(userId);
    if (!cached) return;

    const filtered = cached.data.filter((p) => p.id !== projectId);
    this.setProjects(userId, filtered);
  }
}

export const projectCacheManager = new ProjectCacheManager();
