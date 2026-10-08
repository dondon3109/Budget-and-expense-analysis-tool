import { Brain, MoreHorizontal, Pencil } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { PlanUsageIndicator } from "../billing/PlanUsageIndicator";
import { ThemeToggle } from "../theme/ThemeToggle";

interface AssistantOptionsMenuProps {
  usage?: { used: number; limit: number | null };
  showUpgrade: boolean;
  onOpenMemory: () => void;
  onEditIdentity: () => void;
}

/** The chat header's "More options" popover: AI usage, theme, Memory, and assistant names. */
export function AssistantOptionsMenu({
  usage,
  showUpgrade,
  onOpenMemory,
  onEditIdentity,
}: AssistantOptionsMenuProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsidePress(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [open]);

  return (
    <div
      className="assistant-options"
      ref={wrapperRef}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="assistant-options-trigger"
        aria-label="More options"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
      {open && (
        <div id={panelId} className="assistant-options-panel" role="group" aria-label="Options">
          {usage && (
            <div className="assistant-chat-usage">
              <PlanUsageIndicator
                meter
                label="AI actions"
                used={usage.used}
                limit={usage.limit}
                showUpgrade={showUpgrade}
              />
            </div>
          )}
          <div className="assistant-options-row">
            <span>Theme</span>
            <ThemeToggle variant="segmented" />
          </div>
          <button
            type="button"
            className="assistant-options-item"
            onClick={() => {
              setOpen(false);
              onOpenMemory();
            }}
          >
            <Brain size={16} aria-hidden="true" />
            Memory
          </button>
          <button
            type="button"
            className="assistant-options-item"
            onClick={() => {
              setOpen(false);
              onEditIdentity();
            }}
          >
            <Pencil size={16} aria-hidden="true" />
            Edit assistant names
          </button>
        </div>
      )}
    </div>
  );
}
