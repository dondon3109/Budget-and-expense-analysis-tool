import { evaluatePassword, type PasswordEvaluation } from "../../auth/passwordPolicy";

function strengthLabel(strength: PasswordEvaluation["strength"]): string {
  if (strength === "strong") return "Strong";
  if (strength === "medium") return "Medium";
  if (strength === "weak") return "Weak";
  return "Not started";
}

export function PasswordGuidance({
  password,
  id,
  errorId,
  showError = false,
}: {
  password: string;
  id: string;
  errorId: string;
  showError?: boolean;
}) {
  const evaluation = evaluatePassword(password);
  const status = strengthLabel(evaluation.strength);

  return (
    <>
      <div id={id} className="password-guidance" aria-label="Password requirements">
        <div className="password-strength-header">
          <span>Password strength</span>
          <strong aria-live="polite">{status}</strong>
        </div>
        <div
          className={`password-strength-meter strength-${evaluation.strength}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={evaluation.maxScore}
          aria-valuenow={evaluation.score}
          aria-valuetext={`${status} password, ${evaluation.score} of ${evaluation.maxScore} requirements met`}
        >
          {evaluation.requirements.map((requirement) => (
            <span
              className={requirement.met ? "is-met" : undefined}
              key={requirement.id}
              aria-hidden="true"
            />
          ))}
        </div>
        <ul className="password-requirements">
          {evaluation.requirements.map((requirement) => (
            <li className={requirement.met ? "is-met" : undefined} key={requirement.id}>
              <span aria-hidden="true">{requirement.met ? "✓" : "○"}</span>
              {requirement.label}
            </li>
          ))}
        </ul>
      </div>
      {showError && (
        <small id={errorId} className="field-error">
          Use a password that meets every requirement.
        </small>
      )}
    </>
  );
}
