/** Shared creation/reset policy; the authentication provider validates recovery links. */
export function passwordRequirements(password: string) {
  return [
    { label: "At least 8 characters", met: password.length >= 8 },
    { label: "Uppercase letter", met: /[A-Z]/.test(password) },
    { label: "Lowercase letter", met: /[a-z]/.test(password) },
    { label: "Number", met: /[0-9]/.test(password) },
    { label: "Special character", met: /[^A-Za-z0-9\s]/.test(password) },
  ];
}

export function passwordStrength(password: string) {
  const count = passwordRequirements(password).filter((rule) => rule.met).length;
  const level = count <= 2 ? 1 : count === 3 ? 2 : count === 4 ? 3 : 4;
  const label = (["Weak", "Fair", "Good", "Strong"] as const)[level - 1] ?? "Weak";
  return { level, label };
}

export function validateRecoveryPassword(password: string, confirmation: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!passwordRequirements(password).every((rule) => rule.met))
    return "Include an uppercase letter, lowercase letter, number and special character.";
  if (password !== confirmation) return "Passwords do not match.";
  return null;
}