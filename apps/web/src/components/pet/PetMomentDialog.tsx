import { useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";

import { eggArt, petFigureHealth, petMomentCopy, tombstoneArt } from "@zoption/shared";

import { useFocusTrap } from "../../hooks/useFocusTrap";
import { usePetMoment } from "../../hooks/usePetMoment";
import { useRootLock } from "../../hooks/useRootLock";
import type { AuthenticatedWorkspace } from "../../lib/workspace";
import { usePet } from "../../queries/pet";
import { PetFigure } from "./PetFigure";
import { PetSvg } from "./PetSvg";
import "./PetMomentDialog.css";

/** The pet pop-up in the workspace: the pet's picture and how it is doing, at most once per open. */
export function PetMomentDialog({ workspace }: { workspace: AuthenticatedWorkspace }) {
  const pet = usePet(workspace);
  const { shown, close } = usePetMoment(workspace.userId, pet.data);
  if (!shown) return null;
  return <PetMomentContent shown={shown} onClose={close} />;
}

function PetMomentContent({
  shown,
  onClose,
}: {
  shown: NonNullable<ReturnType<typeof usePetMoment>["shown"]>;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const { pet } = shown;
  const copy = petMomentCopy(shown.moment, pet);

  useRootLock(true);
  const handleKeyDown = useFocusTrap(dialogRef, { initialFocusRef: openRef, onEscape: onClose });

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
        className="form-modal pet-moment-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={handleKeyDown}
      >
        {pet.species === null ? (
          <PetSvg className="pet-moment-picture" art={tombstoneArt()} size={200} still />
        ) : pet.stage === "egg" ? (
          <PetSvg
            className="pet-moment-picture"
            art={eggArt(pet.species, pet.eggStreakDays, 0, pet.color ?? "original")}
            size={200}
            still
          />
        ) : (
          <PetFigure
            className="pet-moment-picture"
            species={pet.species}
            stage={pet.stage}
            health={petFigureHealth(pet)}
            color={pet.color}
            size={200}
          />
        )}
        <h2 id={titleId}>{copy.title}</h2>
        <p id={descriptionId} className="pet-moment-description">
          {copy.body}
        </p>
        <div className="pet-moment-actions">
          <button
            ref={openRef}
            className="button primary"
            type="button"
            onClick={() => {
              onClose();
              void navigate("/app/pet");
            }}
          >
            {pet.species === null ? "Choose a new egg" : "See my pet"}
          </button>
          <button className="button secondary" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
