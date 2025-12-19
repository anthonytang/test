import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Template,
  Field,
  ERROR_MESSAGES,
  validateTemplate,
} from "@studio/core";
import { azureApiClient } from "@studio/api";
import { useAuthUser } from "@studio/auth";
import { v4 as uuidv4 } from "uuid";

interface UseTemplateReturn {
  template: Template | null;
  setTemplate: React.Dispatch<React.SetStateAction<Template | null>>;
  fields: Field[];
  setFields: React.Dispatch<React.SetStateAction<Field[]>>;
  isLoading: boolean;
  isEditingName: boolean;
  setIsEditingName: React.Dispatch<React.SetStateAction<boolean>>;
  editingName: string;
  setEditingName: React.Dispatch<React.SetStateAction<string>>;
  justStartedEditingName: boolean;
  setJustStartedEditingName: React.Dispatch<React.SetStateAction<boolean>>;
  isEditingDescription: boolean;
  setIsEditingDescription: React.Dispatch<React.SetStateAction<boolean>>;
  editingDescription: string;
  setEditingDescription: React.Dispatch<React.SetStateAction<string>>;
  editingMetadata: any;
  setEditingMetadata: React.Dispatch<React.SetStateAction<any>>;
  editingFields: number[];
  setEditingFields: React.Dispatch<React.SetStateAction<number[]>>;
  fieldOperations: {
    saving: number[];
    deleting: number[];
    adding: boolean;
  };
  setFieldOperations: React.Dispatch<
    React.SetStateAction<{
      saving: number[];
      deleting: number[];
      adding: boolean;
    }>
  >;
  fieldErrors: Record<string, string>;
  setFieldErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  // Methods
  handleUpdateTemplate: (updates: Partial<Template>) => Promise<void>;
  toggleFieldEdit: (index: number) => void;
  updateField: (index: number, updates: Partial<Field>) => void;
  handleSaveField: (index: number) => Promise<void>;
  addField: () => void;
  removeField: (index: number) => Promise<void>;
}

export const useTemplate = (
  templateId: string,
  showSuccess?: (message: string) => void,
  showError?: (title: string, message: string) => void,
  onTemplateCreated?: (template: Template) => void
): UseTemplateReturn => {
  const router = useRouter();
  const { getUserId } = useAuthUser();
  const [template, setTemplate] = useState<Template | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState("");
  const [justStartedEditingName, setJustStartedEditingName] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editingDescription, setEditingDescription] = useState("");
  const [editingMetadata, setEditingMetadata] = useState<any>({});
  const [editingFields, setEditingFields] = useState<number[]>([]);
  const [fieldOperations, setFieldOperations] = useState({
    saving: [] as number[],
    deleting: [] as number[],
    adding: false,
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Load template data
  useEffect(() => {
    const loadTemplate = async () => {
      try {
        setError(null);
        setIsLoading(true);

        if (templateId === "new") {
          const newTemplate = {
            id: uuidv4(),
            name: "New Template",
            metadata: { description: "" },
            owner_id: "",
            created_at: new Date().toISOString(),
          };
          setTemplate(newTemplate);
          setFields([]);
        } else {
          // Load template and fields directly from API
          const templateData = await azureApiClient.getTemplateWithFields(
            templateId
          );

          if (!templateData) {
            throw new Error(ERROR_MESSAGES.template_not_found);
          }

          // Use template data directly without restructuring
          setTemplate(templateData);

          // Sort fields by sort_order
          const sortedFields = templateData.fields.sort(
            (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
          );
          setFields(sortedFields);
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to load template";
        if (showError) {
          showError("Template Error", errorMessage);
        }
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    if (templateId) {
      loadTemplate();
    }
  }, [templateId]);

  // Update editing name and description when template changes
  useEffect(() => {
    if (template) {
      setEditingName(template.name);
      setEditingDescription(template.metadata?.description || "");
      setEditingMetadata(template.metadata || {});
    }
  }, [template?.id]);

  const handleUpdateTemplate = useCallback(
    async (updates: Partial<Template>) => {
      if (!template) return;

      // Check if anything actually changed
      const hasNameChange =
        updates.name !== undefined &&
        updates.name.trim() !== template.name.trim();
      const hasMetadataChange =
        updates.metadata !== undefined &&
        JSON.stringify(updates.metadata) !== JSON.stringify(template.metadata);

      if (!hasNameChange && !hasMetadataChange) {
        // No changes detected, just return without saving
        if (showSuccess) {
          showSuccess?.("No changes to save");
        }
        return;
      }

      try {
        validateTemplate({ ...template, ...updates });

        if (template.id === "new" || !template.id) {
          // Create new template using Azure API client
          const userId = getUserId();
          if (!userId) throw new Error("User not authenticated");

          const newTemplate = await azureApiClient.createTemplate({
            name: updates.name || template.name,
            metadata: updates.metadata ||
              template.metadata || { description: "" },
            owner_id: userId,
          });

          onTemplateCreated?.(newTemplate);

          setTemplate((prev) =>
            prev ? { ...prev, ...updates, id: newTemplate.id } : null
          );
          router.replace(`/templates/${newTemplate.id}`);
        } else {
          // Update existing template
          await azureApiClient.updateTemplate(template.id, updates);
          setTemplate((prev) => (prev ? { ...prev, ...updates } : null));

          if (showSuccess) {
            showSuccess?.("Template updated successfully");
          }
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : ERROR_MESSAGES.template_update_failed;
        if (showError) {
          showError("Update Failed", errorMessage);
        }
        setError(errorMessage);
      }
    },
    [template, router, getUserId, showSuccess, showError, onTemplateCreated]
  );

  const toggleFieldEdit = useCallback((index: number) => {
    setEditingFields((prev) => {
      if (prev.includes(index)) {
        return prev.filter((i: number) => i !== index);
      } else {
        return [...prev, index];
      }
    });
  }, []);

  const updateField = useCallback(
    async (index: number, updates: Partial<Field>) => {
      const currentField = fields[index];

      console.log("[updateField] Called with:", {
        fieldId: currentField?.id,
        fieldName: currentField?.name,
        updates,
        updatesMetadata: updates.metadata,
      });

      // Optimistically update local state
      setFields((prevFields) => {
        const newFields = [...prevFields];

        if (!currentField) {
          return newFields;
        }

        newFields[index] = {
          ...currentField,
          ...updates,
          id: currentField.id, // Preserve the field ID
        };
        return newFields;
      });

      // Persist to database if it's not a temporary field
      if (currentField && !currentField.id.startsWith("temp-")) {
        try {
          const payload = {
            ...currentField,
            ...updates,
          };
          console.log("[updateField] Saving to database:", {
            fieldId: currentField.id,
            payload,
            payloadMetadata: payload.metadata,
            chartConfig: payload.metadata?.chartConfig,
            advancedSettings: payload.metadata?.chartConfig?.advancedSettings,
          });

          await azureApiClient.updateField(currentField.id, payload);
          console.log("[updateField] Successfully saved to database");
        } catch (err) {
          console.error("[updateField] Failed to save to database:", err);
          const errorMessage =
            err instanceof Error
              ? err.message
              : ERROR_MESSAGES.field_update_failed;
          if (showError) {
            showError("Section Update Failed", errorMessage);
          }
          // Revert optimistic update on error
          setFields((prevFields) => {
            const newFields = [...prevFields];
            newFields[index] = currentField;
            return newFields;
          });
        }
      } else {
        console.log("[updateField] Skipped database save (temporary field)");
      }
    },
    [fields, showError]
  );

  const handleSaveField = useCallback(
    async (
      index: number,
      valuesToSave?: {
        name: string;
        description: string;
        type: "text" | "table" | "chart";
      }
    ) => {
      const field = fields[index];
      if (!template || !field) return;

      // Use provided values or fall back to current field values
      const saveData = valuesToSave || {
        name: field.name,
        description: field.description,
        type: field.metadata.type,
      };

      // Check if anything actually changed (skip for new fields)
      if (!field.id.startsWith("temp-")) {
        const hasChanges =
          saveData.name.trim() !== field.name.trim() ||
          saveData.description.trim() !== field.description.trim() ||
          saveData.type !== field.metadata.type;

        if (!hasChanges) {
          // No changes, just exit edit mode without saving
          setEditingFields((prev) => prev.filter((i) => i !== index));
          return;
        }
      }

      // Validate all required fields
      const errors: string[] = [];

      if (!saveData.name.trim()) {
        errors.push("name");
      }

      if (!saveData.description.trim()) {
        errors.push("description");
      }

      if (!saveData.type) {
        errors.push("type");
      }

      // If there are any validation errors, set them and return
      if (errors.length > 0) {
        setFieldErrors((prev) => ({
          ...prev,
          [`${field.id}_name`]: errors.includes("name")
            ? "Section name cannot be empty"
            : "",
          [`${field.id}_description`]: errors.includes("description")
            ? "Section description cannot be empty"
            : "",
          [`${field.id}_type`]: errors.includes("type")
            ? "Section type must be selected"
            : "",
        }));
        return;
      }

      // Clear any previous errors for this field
      setFieldErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[`${field.id}_name`];
        delete newErrors[`${field.id}_description`];
        delete newErrors[`${field.id}_type`];
        return newErrors;
      });

      setFieldOperations((prev) => ({
        ...prev,
        saving: [...prev.saving, index],
      }));

      // Optimistic update - update UI immediately
      if (!field.id.startsWith("temp-")) {
        setFields((prevFields) => {
          const newFields = [...prevFields];

          if (!newFields[index]) {
            return newFields;
          }

          newFields[index] = {
            ...newFields[index],
            name: saveData.name,
            description: saveData.description,
            metadata: {
              ...newFields[index].metadata,
              type: saveData.type,
            },
          };
          return newFields;
        });
      }

      // Exit edit mode immediately for better UX
      setEditingFields((prev) => prev.filter((i) => i !== index));

      try {
        // Check if this is a new field (has temporary ID)
        if (field.id.startsWith("temp-")) {
          // Create new field in database
          const newField = await azureApiClient.createField({
            template_id: template.id,
            name: saveData.name,
            description: saveData.description,
            sort_order: field.sort_order || index,
            metadata: { type: saveData.type || "text" },
          });

          // Update local state with the real field from database
          setFields((prevFields) => {
            const newFields = [...prevFields];
            newFields[index] = newField;
            return newFields;
          });
        } else {
          // Update existing field in database
          const updatedField = {
            name: saveData.name,
            description: saveData.description,
            sort_order: field.sort_order || index,
            metadata: {
              ...field.metadata,
              type: saveData.type,
            },
          };
          await azureApiClient.updateField(field.id, updatedField);
          // No need to update state again - already done optimistically
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : ERROR_MESSAGES.field_update_failed;
        if (showError) {
          showError("Section Update Failed", errorMessage);
        }
        setError(errorMessage);
      } finally {
        setFieldOperations((prev) => ({
          ...prev,
          saving: prev.saving.filter((i) => i !== index),
        }));
      }
    },
    [template, fields, setError, setEditingFields, setFieldErrors, showError]
  );

  const addField = useCallback(() => {
    if (!template) return;

    // Create a temporary field with a temporary ID
    const tempField: Field = {
      id: `temp-${Date.now()}`, // Temporary ID
      template_id: template.id,
      name: "",
      description: "",
      sort_order: fields.length,
      created_at: new Date().toISOString(),
      metadata: { type: "text" },
    };

    // Add to local state
    setFields((prevFields) => [...prevFields, tempField]);

    // Start editing the new field
    setEditingFields((prev) => [...prev, fields.length]);

    // Scroll to the new field after DOM update
    // Use a more robust approach with retries
    const scrollToNewField = (attempts = 0) => {
      const newFieldIndex = fields.length;
      const fieldElement = document.querySelector(
        `[data-field-index="${newFieldIndex}"]`
      ) as HTMLElement;

      if (fieldElement) {
        // Scroll the element into view
        fieldElement.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });

        // Focus the first textarea after a brief delay
        setTimeout(() => {
          const textareas = fieldElement.querySelectorAll("textarea");
          if (textareas.length > 0) {
            const textarea = textareas[0] as HTMLTextAreaElement;
            textarea.focus();
            // Place cursor at the end without selecting text
            textarea.setSelectionRange(
              textarea.value.length,
              textarea.value.length
            );
          }
        }, 300);
      } else if (attempts < 5) {
        // Retry after a short delay if element not found yet
        setTimeout(() => scrollToNewField(attempts + 1), 50);
      }
    };

    // Start scrolling after a brief delay to ensure render
    setTimeout(scrollToNewField, 50);
  }, [template, fields, setEditingFields]);

  const removeField = useCallback(
    async (index: number) => {
      const field = fields[index];
      if (!template || !field) return;

      setFieldOperations((prev) => ({
        ...prev,
        deleting: [...prev.deleting, index],
      }));

      // Optimistic delete - remove from UI immediately
      setFields((prevFields) => prevFields.filter((_, i) => i !== index));

      // Update editing fields indices immediately
      setEditingFields((prev) =>
        prev.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i))
      );

      try {
        // Only delete from database if it's not a temporary field
        if (!field.id.startsWith("temp-")) {
          await azureApiClient.deleteField(field.id);
        }
      } catch (err) {
        // On error, restore the field
        setFields((prevFields) => {
          const newFields = [...prevFields];
          newFields.splice(index, 0, field);
          return newFields;
        });
        const errorMessage =
          err instanceof Error
            ? err.message
            : ERROR_MESSAGES.field_delete_failed;
        if (showError) {
          showError("Delete Failed", errorMessage);
        }
        setError(errorMessage);
      } finally {
        setFieldOperations((prev) => ({
          ...prev,
          deleting: prev.deleting.filter((i) => i !== index),
        }));
      }
    },
    [template, fields, setError, showError]
  );

  return {
    template,
    setTemplate,
    fields,
    setFields,
    isLoading,
    isEditingName,
    setIsEditingName,
    editingName,
    setEditingName,
    justStartedEditingName,
    setJustStartedEditingName,
    isEditingDescription,
    setIsEditingDescription,
    editingDescription,
    setEditingDescription,
    editingMetadata,
    setEditingMetadata,
    editingFields,
    setEditingFields,
    fieldOperations,
    setFieldOperations,
    fieldErrors,
    setFieldErrors,
    error,
    setError,
    handleUpdateTemplate,
    toggleFieldEdit,
    updateField,
    handleSaveField,
    addField,
    removeField,
  };
};
