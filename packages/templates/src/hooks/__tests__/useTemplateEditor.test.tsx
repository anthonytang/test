import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useTemplateEditor } from '../useTemplateEditor';
import { azureApiClient } from '@studio/api';
import type { Template, Field } from '@studio/core';

// Mock dependencies
vi.mock('@studio/api');

describe('useTemplateEditor', () => {
  const mockTemplate: Template = {
    id: 'template1',
    name: 'Template 1',
    metadata: { description: 'Description 1' },
    owner_id: 'user1',
    created_at: '2024-01-01T00:00:00Z',
    fields: [],
  };

  const mockField: Field = {
    id: 'field1',
    template_id: 'template1',
    name: 'Field 1',
    description: 'Description 1',
    sort_order: 0,
    created_at: '2024-01-01T00:00:00Z',
    metadata: { type: 'text' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should load template and fields', async () => {
      (azureApiClient.getTemplateWithFields as any).mockResolvedValue({
        ...mockTemplate,
        fields: [mockField],
      });

      const { result } = renderHook(() => useTemplateEditor('template1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(azureApiClient.getTemplateWithFields).toHaveBeenCalledWith(
        'template1'
      );
      expect(result.current.template).toEqual({
        ...mockTemplate,
        fields: [mockField],
      });
      expect(result.current.fields).toEqual([mockField]);
    });

    it('should handle new template', () => {
      const { result } = renderHook(() => useTemplateEditor('new'));

      expect(result.current.isLoading).toBe(false);
      expect(result.current.template).toBeNull();
      expect(result.current.fields).toEqual([]);
    });

    it('should handle loading error', async () => {
      (azureApiClient.getTemplateWithFields as any).mockRejectedValue(
        new Error('Not found')
      );

      const { result } = renderHook(() => useTemplateEditor('template1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe('Not found');
    });
  });

  describe('updateTemplate', () => {
    it('should update template with optimistic update', async () => {
      (azureApiClient.getTemplateWithFields as any).mockResolvedValue(
        mockTemplate
      );
      (azureApiClient.updateTemplate as any).mockResolvedValue(undefined);

      const { result } = renderHook(() => useTemplateEditor('template1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.updateTemplate({ name: 'Updated Template' });
      });

      expect(azureApiClient.updateTemplate).toHaveBeenCalledWith(
        'template1',
        { name: 'Updated Template' }
      );
      expect(result.current.template?.name).toBe('Updated Template');
    });

    it('should rollback on update error', async () => {
      (azureApiClient.getTemplateWithFields as any).mockResolvedValue(
        mockTemplate
      );
      (azureApiClient.updateTemplate as any).mockRejectedValue(
        new Error('Update failed')
      );

      const { result } = renderHook(() => useTemplateEditor('template1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await expect(
          result.current.updateTemplate({ name: 'Updated Template' })
        ).rejects.toThrow();
      });

      expect(result.current.template?.name).toBe('Template 1');
    });
  });

  describe('updateField', () => {
    it('should update field with optimistic update', async () => {
      (azureApiClient.getTemplateWithFields as any).mockResolvedValue({
        ...mockTemplate,
        fields: [mockField],
      });
      (azureApiClient.updateField as any).mockResolvedValue(undefined);

      const { result } = renderHook(() => useTemplateEditor('template1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.updateField('field1', { name: 'Updated Field' });
      });

      expect(azureApiClient.updateField).toHaveBeenCalledWith('field1', {
        name: 'Updated Field',
      });
      expect(result.current.fields[0].name).toBe('Updated Field');
    });

    it('should rollback on update error', async () => {
      (azureApiClient.getTemplateWithFields as any).mockResolvedValue({
        ...mockTemplate,
        fields: [mockField],
      });
      (azureApiClient.updateField as any).mockRejectedValue(
        new Error('Update failed')
      );

      const { result } = renderHook(() => useTemplateEditor('template1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await expect(
          result.current.updateField('field1', { name: 'Updated Field' })
        ).rejects.toThrow();
      });

      expect(result.current.fields[0].name).toBe('Field 1');
    });
  });

  describe('addField', () => {
    it('should create new field', async () => {
      (azureApiClient.getTemplateWithFields as any).mockResolvedValue(
        mockTemplate
      );
      const newField: Field = {
        ...mockField,
        id: 'field2',
        name: 'New Field',
      };
      (azureApiClient.createField as any).mockResolvedValue(newField);

      const { result } = renderHook(() => useTemplateEditor('template1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.addField();
      });

      expect(azureApiClient.createField).toHaveBeenCalled();
      expect(result.current.fields).toContainEqual(newField);
    });
  });

  describe('deleteField', () => {
    it('should delete field with optimistic update', async () => {
      (azureApiClient.getTemplateWithFields as any).mockResolvedValue({
        ...mockTemplate,
        fields: [mockField],
      });
      (azureApiClient.deleteField as any).mockResolvedValue(undefined);

      const { result } = renderHook(() => useTemplateEditor('template1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.deleteField('field1');
      });

      expect(azureApiClient.deleteField).toHaveBeenCalledWith('field1');
      expect(result.current.fields).not.toContainEqual(
        expect.objectContaining({ id: 'field1' })
      );
    });

    it('should rollback on delete error', async () => {
      (azureApiClient.getTemplateWithFields as any).mockResolvedValue({
        ...mockTemplate,
        fields: [mockField],
      });
      (azureApiClient.deleteField as any).mockRejectedValue(
        new Error('Delete failed')
      );

      const { result } = renderHook(() => useTemplateEditor('template1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await expect(
          result.current.deleteField('field1')
        ).rejects.toThrow();
      });

      expect(result.current.fields).toContainEqual(mockField);
    });
  });

  describe('reorderFields', () => {
    it('should reorder fields locally', async () => {
      const field2: Field = {
        ...mockField,
        id: 'field2',
        name: 'Field 2',
        sort_order: 1,
      };

      (azureApiClient.getTemplateWithFields as any).mockResolvedValue({
        ...mockTemplate,
        fields: [mockField, field2],
      });

      const { result } = renderHook(() => useTemplateEditor('template1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.reorderFields([field2, mockField]);
      });

      expect(result.current.fields[0].id).toBe('field2');
      expect(result.current.fields[1].id).toBe('field1');
    });
  });
});

