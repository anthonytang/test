import { describe, it, expect } from 'vitest';
import { validateTemplate, validateField } from '../validationUtils';
import { Template, Field } from '../../types';
import { ERROR_MESSAGES } from '../errorUtils';

describe('validationUtils', () => {
  describe('validateTemplate', () => {
    it('should pass validation for valid template', () => {
      const template: Template = {
        id: '1',
        name: 'Test Template',
        metadata: { description: 'Test' },
        owner_id: 'user1',
        created_at: '2024-01-01',
      };

      expect(() => validateTemplate(template)).not.toThrow();
    });

    it('should throw error for template without name', () => {
      const template: Template = {
        id: '1',
        name: '',
        metadata: { description: 'Test' },
        owner_id: 'user1',
        created_at: '2024-01-01',
      };

      expect(() => validateTemplate(template)).toThrow(ERROR_MESSAGES.template_name_required);
    });

    it('should throw error for template with whitespace-only name', () => {
      const template: Template = {
        id: '1',
        name: '   ',
        metadata: { description: 'Test' },
        owner_id: 'user1',
        created_at: '2024-01-01',
      };

      expect(() => validateTemplate(template)).toThrow(ERROR_MESSAGES.template_name_required);
    });

    it('should throw error for template with null name', () => {
      const template = {
        id: '1',
        name: null as any,
        metadata: { description: 'Test' },
        owner_id: 'user1',
        created_at: '2024-01-01',
      };

      expect(() => validateTemplate(template)).toThrow(ERROR_MESSAGES.template_name_required);
    });

    it('should pass validation for template with trimmed name', () => {
      const template: Template = {
        id: '1',
        name: '  Test Template  ',
        metadata: { description: 'Test' },
        owner_id: 'user1',
        created_at: '2024-01-01',
      };

      // Should pass because trim() removes whitespace and leaves "Test Template"
      expect(() => validateTemplate(template)).not.toThrow();
    });
  });

  describe('validateField', () => {
    it('should pass validation for valid field', () => {
      const field: Field = {
        id: '1',
        template_id: 'template1',
        name: 'Test Field',
        description: 'Test description',
        sort_order: 0,
        created_at: '2024-01-01',
        metadata: { type: 'text' },
      };

      expect(() => validateField(field)).not.toThrow();
    });

    it('should throw error for field without name', () => {
      const field: Field = {
        id: '1',
        template_id: 'template1',
        name: '',
        description: 'Test description',
        sort_order: 0,
        created_at: '2024-01-01',
        metadata: { type: 'text' },
      };

      expect(() => validateField(field)).toThrow(ERROR_MESSAGES.field_name_required);
    });

    it('should throw error for field with whitespace-only name', () => {
      const field: Field = {
        id: '1',
        template_id: 'template1',
        name: '   ',
        description: 'Test description',
        sort_order: 0,
        created_at: '2024-01-01',
        metadata: { type: 'text' },
      };

      expect(() => validateField(field)).toThrow(ERROR_MESSAGES.field_name_required);
    });

    it('should throw error for field with null name', () => {
      const field = {
        id: '1',
        template_id: 'template1',
        name: null as any,
        description: 'Test description',
        sort_order: 0,
        created_at: '2024-01-01',
        metadata: { type: 'text' as const },
      };

      expect(() => validateField(field)).toThrow(ERROR_MESSAGES.field_name_required);
    });
  });
});

