import { Template } from "@studio/core";

interface CacheEntry {
  data: Template[];
  timestamp: number;
}

class TemplateCacheManager {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  getTemplates(userId: string): Template[] | null {
    const entry = this.cache.get(userId);
    return entry ? entry.data : null;
  }

  shouldRefresh(userId: string): boolean {
    const entry = this.cache.get(userId);
    if (!entry) return true;
    return Date.now() - entry.timestamp > this.CACHE_TTL;
  }

  setTemplates(userId: string, templates: Template[]): void {
    this.cache.set(userId, {
      data: templates,
      timestamp: Date.now(),
    });
  }

  addTemplate(userId: string, template: Template): void {
    const cached = this.cache.get(userId);
    const templates = cached ? [template, ...cached.data] : [template];
    this.setTemplates(userId, templates);
  }

  removeTemplate(userId: string, templateId: string): void {
    const cached = this.cache.get(userId);
    if (!cached) return;

    const filtered = cached.data.filter((t) => t.id !== templateId);
    this.setTemplates(userId, filtered);
  }
}

export const templateCacheManager = new TemplateCacheManager();
