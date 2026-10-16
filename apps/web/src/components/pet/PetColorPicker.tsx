import { useId, type ReactNode } from "react";

import { petColorLabels, petColors, petColorSwatch, type PetColor } from "@zoption/shared";

import "./PetColorPicker.css";

/**
 * The pet colors as a radio row. Each option is a color dot, or `preview` draws it (the pet itself
 * in that color). `value` is null while nothing is picked yet.
 */
export function PetColorPicker({
  legend,
  value,
  disabled,
  onChange,
  preview,
}: {
  legend: string;
  value: PetColor | null;
  disabled?: boolean;
  onChange: (color: PetColor) => void;
  preview?: (color: PetColor) => ReactNode;
}) {
  const name = useId();
  return (
    <fieldset className="pet-color-picker" data-preview={preview ? true : undefined}>
      <legend>{legend}</legend>
      {petColors.map((color) => (
        <label key={color} className="pet-color-option">
          <input
            type="radio"
            name={name}
            value={color}
            checked={value === color}
            disabled={disabled}
            onChange={() => onChange(color)}
          />
          {preview ? (
            preview(color)
          ) : (
            <span
              className="pet-color-dot"
              aria-hidden="true"
              style={{ background: petColorSwatch(color, "var(--surface)") }}
            />
          )}
          <span>{petColorLabels[color]}</span>
        </label>
      ))}
    </fieldset>
  );
}
