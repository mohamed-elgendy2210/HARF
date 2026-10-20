import type { InputHTMLAttributes } from "react";

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
}

export function FormField({ label, hint, id, ...inputProps }: FormFieldProps) {
  const fieldId = id ?? inputProps.name;
  return (
    <div className="form-field">
      <label htmlFor={fieldId}>{label}</label>
      <input id={fieldId} {...inputProps} />
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}
