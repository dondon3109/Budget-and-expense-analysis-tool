import { forwardRef, useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import "./PasswordField.css";

type PasswordFieldProps = Omit<ComponentProps<"input">, "id" | "type"> & {
  id: string;
  label: string;
};

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(function PasswordField(
  { id, label, disabled, ...inputProps },
  ref,
) {
  const [isVisible, setIsVisible] = useState(false);
  const fieldName = label.toLowerCase();
  const actionLabel = `${isVisible ? "Hide" : "Show"} ${fieldName}`;

  return (
    <div className="password-field">
      <label htmlFor={id}>
        <span>{label}</span>
      </label>
      <div className="password-field-control">
        <input ref={ref} id={id} type={isVisible ? "text" : "password"} disabled={disabled} {...inputProps} />
        <button
          className="password-visibility-toggle"
          type="button"
          aria-label={actionLabel}
          aria-pressed={isVisible}
          disabled={disabled}
          onClick={() => setIsVisible((visible) => !visible)}
        >
          {isVisible ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
        </button>
      </div>
    </div>
  );
});
