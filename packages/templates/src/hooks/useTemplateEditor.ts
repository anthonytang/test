/**
 * useTemplateEditor - Simplified hook for template and field CRUD operations
 *
 * This hook ONLY handles template editing - no runs, results, or processing.
 * Single responsibility: Template and Field management
 */

import { useState, useEffect, useCallback } from "react";
import { Template, Field } from "@studio/core";
import { azureApiClient } from "@studio/api";

interface UseTemplateEditorReturn {
  // Data
  template: Template | null;
  fields: Field[];
  isLoading: boolean;
  error: string | null;

  // Template actions
  updateTemplate: (updates: Partial<Template>) => Promise<void>;

  // Field actions
  updateField: (fieldId: string, updates: Partial<Field>) => Promise<void>;
  addField: () => Promise<void>;
  deleteField: (fieldId: string) => Promise<void>;
  reorderFields: (fields: Field[]) => void;
}

export const useTemplateEditor = (
  templateId: string
): UseTemplateEditorReturn => {
  const [template, setTemplate] = useState<Template | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load template and fields
  useEffect(() => {
    if (!templateId || templateId === "new") {
      setIsLoading(false);
      return;
    }

    const loadTemplate = async () => {
      try {
        setError(null);
        setIsLoading(true);

        const data = await azureApiClient.getTemplateWithFields(templateId);
        if (!data) {
          throw new Error("Template not found");
        }

        setTemplate(data);
        setFields(
          data.fields.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        );
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load template"
        );
      } finally {
        setIsLoading(false);
      }
    };

    loadTemplate();
  }, [templateId]);

  // Update template metadata
  const updateTemplate = useCallback(
    async (updates: Partial<Template>) => {
      if (!template) return;

      try {
        // Optimistic update
        setTemplate((prev) => (prev ? { ...prev, ...updates } : null));

        await azureApiClient.updateTemplate(template.id, updates);
      } catch (err) {
        // Rollback on error
        setTemplate(template);
        throw err;
      }
    },
    [template]
  );

  // Update field
  const updateField = useCallback(
    async (fieldId: string, updates: Partial<Field>) => {
      const field = fields.find((f) => f.id === fieldId);
      if (!field) return;

      try {
        // Optimistic update
        setFields((prev) =>
          prev.map((f) => (f.id === fieldId ? { ...f, ...updates } : f))
        );

        await azureApiClient.updateField(fieldId, updates);
      } catch (err) {
        // Rollback on error
        setFields(fields);
        throw err;
      }
    },
    [fields]
  );

  // Add new field
  const addField = useCallback(async () => {
    if (!template) return;

    const newField: Omit<Field, "id" | "created_at"> = {
      template_id: template.id,
      name: "New Field",
      description: "",
      sort_order: fields.length,
      metadata: { type: "text" },
    };

    try {
      const created = await azureApiClient.createField(newField);
      setFields((prev) => [...prev, created]);
    } catch (err) {
      throw err;
    }
  }, [template, fields.length]);

  // Delete field
  const deleteField = useCallback(
    async (fieldId: string) => {
      try {
        // Optimistic update
        setFields((prev) => prev.filter((f) => f.id !== fieldId));

        await azureApiClient.deleteField(fieldId);
      } catch (err) {
        // Rollback on error
        setFields(fields);
        throw err;
      }
    },
    [fields]
  );

  // Reorder fields (local only, save on drag end)
  const reorderFields = useCallback((reorderedFields: Field[]) => {
    setFields(reorderedFields);
  }, []);

  return {
    template,
    fields,
    isLoading,
    error,
    updateTemplate,
    updateField,
    addField,
    deleteField,
    reorderFields,
  };
};
