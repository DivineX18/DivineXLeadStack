"use client";

import { useMemo } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, GripVertical, Trash2 } from "lucide-react";
import type { FunnelDoc, FunnelSection, FunnelSectionType } from "@/types/funnels";
import type { LeadForm } from "@/types/forms";
import { PublicFunnelView } from "@/components/funnels/public-funnel-view";

/**
 * VISUAL CANVAS — the real page, made selectable.
 *
 * The single most important property here is that this is NOT a second
 * renderer. It renders PublicFunnelView — the exact component the public page
 * uses — once per section, and layers selection/drag chrome on top. So "what I
 * edit" and "what gets published" are the same code path by construction,
 * rather than by two implementations being kept in sync by hand.
 *
 * Rendering one section at a time (a single-section funnel per wrapper) is
 * deliberate: it keeps the section's own canvas/background treatment intact,
 * which a bespoke per-section renderer would have had to reimplement.
 *
 * `previewMode` is passed through so nothing on the canvas can capture a real
 * lead or fire automation while someone is editing.
 *
 * Reorder uses @dnd-kit, already a dependency (the pipeline Kanban uses it) —
 * no new drag library, no hand-rolled drag physics. Movement is restricted to
 * the vertical axis because sections stack; there is no free positioning here
 * and deliberately never will be.
 */

/** Sections stack, so horizontal movement is meaningless — lock the drag to
 *  the vertical axis. Written inline rather than pulling in
 *  @dnd-kit/modifiers for this single line. */
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

export interface CanvasProps {
  funnel: FunnelDoc;
  forms: Record<string, LeadForm>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (sections: FunnelSection[]) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  /** Narrow the canvas to a phone width — same page, same components. */
  viewport: "desktop" | "mobile";
  labels: Record<FunnelSectionType, string>;
}

export function VisualCanvas({
  funnel,
  forms,
  selectedId,
  onSelect,
  onReorder,
  onDuplicate,
  onDelete,
  viewport,
  labels,
}: CanvasProps) {
  const sensors = useSensors(
    // A small distance threshold so clicking to SELECT a section isn't
    // swallowed as the start of a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = useMemo(() => funnel.sections.map((s) => s.id), [funnel.sections]);

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    // arrayMove preserves each section object wholesale, so argumentRole,
    // servesBelief and canvas travel with it. Reorder must never be a rebuild.
    onReorder(arrayMove(funnel.sections, from, to));
  }

  return (
    <div className="flex justify-center">
      <div
        className="w-full transition-[max-width] duration-200"
        style={{ maxWidth: viewport === "mobile" ? 420 : "100%" }}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[verticalOnly]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            {funnel.sections.map((section) => (
              <SortableSection
                key={section.id}
                section={section}
                funnel={funnel}
                forms={forms}
                selected={selectedId === section.id}
                onSelect={onSelect}
                onDuplicate={onDuplicate}
                onDelete={onDelete}
                label={labels[section.type] ?? section.type}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}

function SortableSection({
  section,
  funnel,
  forms,
  selected,
  onSelect,
  onDuplicate,
  onDelete,
  label,
}: {
  section: FunnelSection;
  funnel: FunnelDoc;
  forms: Record<string, LeadForm>;
  selected: boolean;
  onSelect: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  label: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  });

  // One-section funnel: PublicFunnelView renders this section exactly as the
  // live page would, including its canvas treatment.
  const single = useMemo<FunnelDoc>(
    () => ({ ...funnel, sections: [section] }),
    [funnel, section],
  );

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="relative"
      data-section-id={section.id}
    >
      {/* The click target sits ABOVE the rendered page so a section can be
          selected without its real buttons/forms activating. */}
      <button
        type="button"
        onClick={() => onSelect(section.id)}
        aria-label={`Select ${label} section`}
        aria-pressed={selected}
        className="absolute inset-0 z-10 cursor-pointer outline-none"
        style={{
          boxShadow: selected
            ? "inset 0 0 0 2px var(--dx-primary)"
            : "inset 0 0 0 1px transparent",
        }}
      />
      {/* Hover/selected affordances live above the click layer. */}
      <div
        className={`absolute left-2 top-2 z-20 flex items-center gap-1 rounded-md border px-1.5 py-1 text-[11px] shadow-sm transition-opacity ${
          selected ? "opacity-100" : "opacity-0 focus-within:opacity-100 hover:opacity-100"
        }`}
        style={{ backgroundColor: "var(--dx-elevated)", borderColor: "var(--dx-border)" }}
      >
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab rounded p-0.5 text-[var(--dx-text-muted)] outline-none hover:text-[var(--dx-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--dx-focus)] active:cursor-grabbing"
          aria-label={`Reorder ${label} section`}
          role="button"
          tabIndex={0}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
        <span className="px-1 font-medium text-[var(--dx-text-secondary)]">{label}</span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDuplicate(section.id); }}
          aria-label={`Duplicate ${label} section`}
          className="rounded p-0.5 text-[var(--dx-text-muted)] outline-none hover:text-[var(--dx-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--dx-focus)]"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(section.id); }}
          aria-label={`Delete ${label} section`}
          className="rounded p-0.5 text-[var(--dx-text-muted)] outline-none hover:text-[var(--dx-destructive)] focus-visible:ring-2 focus-visible:ring-[var(--dx-focus)]"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="pointer-events-none">
        <PublicFunnelView funnel={single} forms={forms} previewMode />
      </div>
    </div>
  );
}
