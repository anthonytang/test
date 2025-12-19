"use client";

import React from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Field } from "@studio/core";

interface DraggableFieldItemProps {
  id: string;
  children: React.ReactNode;
  isDragging?: boolean;
  isEditing?: boolean;
}

function DraggableFieldItem({
  id,
  children,
  isEditing,
}: DraggableFieldItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging ? 0 : 1,
    // Preserve the height during drag
    zIndex: isSortableDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={`relative ${isSortableDragging ? "shadow-lg" : ""}`}
    >
      {/* Drag handle - only visible when not editing */}
      {!isEditing && (
        <div
          ref={setActivatorNodeRef}
          {...listeners}
          className="absolute left-0 top-0 w-[140px] h-8 cursor-move z-10"
          aria-label="Drag handle"
        />
      )}
      {children}
    </div>
  );
}

interface DraggableFieldListProps {
  fields: Field[];
  onReorder: (fields: Field[]) => void;
  children: (field: Field, index: number) => React.ReactNode;
  editingFields?: number[];
}

export function DraggableFieldList({
  fields,
  onReorder,
  children,
  editingFields = [],
}: DraggableFieldListProps) {
  const [activeId, setActiveId] = React.useState<string | null>(null);

  // Check if any field is being edited
  const isAnyFieldEditing = editingFields.length > 0;

  // Custom modifier to prevent drag when focused on inputs
  const customPointerSensor = useSensor(PointerSensor, {
    activationConstraint: {
      distance: 8,
    },
  });

  const customKeyboardSensor = useSensor(KeyboardSensor, {
    coordinateGetter: (event, { active, currentCoordinates, context }) => {
      // Prevent keyboard drag if focused on input/textarea
      const activeElement = document.activeElement;
      if (
        activeElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA")
      ) {
        return undefined;
      }
      return sortableKeyboardCoordinates(event, {
        active,
        currentCoordinates,
        context,
      });
    },
  });

  const sensors = useSensors(customPointerSensor, customKeyboardSensor);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      const oldIndex = fields.findIndex((f) => f.id === active.id);
      const newIndex = fields.findIndex((f) => f.id === over.id);

      const newFields = arrayMove(fields, oldIndex, newIndex);
      // Update sort_order for all affected fields
      const updatedFields = newFields.map((field, index) => ({
        ...field,
        sort_order: index,
      }));

      onReorder(updatedFields);
    }
  };

  const activeField = activeId ? fields.find((f) => f.id === activeId) : null;
  const activeIndex = activeField ? fields.indexOf(activeField) : -1;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={fields.map((f) => f.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-6">
          {fields.map((field, index) => (
            <DraggableFieldItem
              key={field.id}
              id={field.id}
              isEditing={isAnyFieldEditing}
            >
              {children(field, index)}
            </DraggableFieldItem>
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeId && activeField ? (
          <div className="shadow-xl opacity-90 bg-white rounded-lg p-1">
            {children(activeField, activeIndex)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
