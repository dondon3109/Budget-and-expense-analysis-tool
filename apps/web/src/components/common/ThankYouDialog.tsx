import { useId, useRef } from "react";
import { createPortal } from "react-dom";

import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useRootLock } from "../../hooks/useRootLock";
import { thankYouCopy, type ThankYouFlow } from "../../lib/thankYou";
import "./ThankYouDialog.css";

export function ThankYouDialog({ flow, onClose }: { flow: ThankYouFlow; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const { icon: Icon, eyebrow, title, description } = thankYouCopy[flow];

  useRootLock(true);

  const handleKeyDown = useFocusTrap(dialogRef, {
    initialFocusRef: closeRef,
    onEscape: onClose,
  });

  return createPortal(
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="form-modal thank-you-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={handleKeyDown}
      >
        <div className="thank-you-dialog-icon" aria-hidden="true">
          <Icon size={28} />
        </div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId} className="thank-you-dialog-description">
          {description}
        </p>
        <button ref={closeRef} className="button primary" type="button" onClick={onClose}>
          Continue
        </button>
      </section>
    </div>,
    document.body,
  );
}
