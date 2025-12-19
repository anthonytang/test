import { Template, Field } from "@studio/core";
import { ERROR_MESSAGES } from "./errorUtils";

/**
 * Validate template data
 */
export const validateTemplate = (template: Template): void => {
  if (!template.name?.trim()) {
    throw new Error(ERROR_MESSAGES.template_name_required);
  }
};

/**
 * Validate field data
 */
export const validateField = (field: Field): void => {
  if (!field.name?.trim()) {
    throw new Error(ERROR_MESSAGES.field_name_required);
  }
};
