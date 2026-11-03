import { useState } from "react";
import { Check, Circle, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { passwordRequirements, passwordStrength } from "@/lib/password-recovery";

export function PasswordInput({ id, value, onChange, autoComplete, descriptionId }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  descriptionId?: string;
}) {
  const [show, setShow] = useState(false);
  const action = show ? "Hide password" : "Show password";
  return <div className="relative">
    <Input id={id} type={show ? "text" : "password"} value={value}
      onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete}
      aria-describedby={descriptionId} required className="pr-12" />
    <Button type="button" variant="ghost" size="icon" title={action}
      aria-label={action} aria-controls={id} aria-pressed={show}
      onClick={() => setShow((current) => !current)}
      className="absolute right-0 top-1/2 -translate-y-1/2 text-muted-foreground">
      {show ? <EyeOff /> : <Eye />}
    </Button>
  </div>;
}

export function PasswordChecklist({ id, password, confirmation }: {
  id: string; password: string; confirmation: string;
}) {
  const { level, label } = passwordStrength(password);
  const tone = level === 1 ? "bg-destructive" : level === 2 ? "bg-password-fair" : level === 3 ? "bg-password-good" : "bg-primary";
  return <div id={id} className="flex flex-col gap-3 text-sm">
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">Password strength</span>
      <span aria-live="polite" className="font-medium">{label}</span>
    </div>
    <div role="meter" aria-label="Password strength" aria-valuemin={0} aria-valuemax={4}
      aria-valuenow={password ? level : 0} aria-valuetext={label} className="grid h-1.5 grid-cols-4 gap-1">
      {[1, 2, 3, 4].map((segment) => <span key={segment} className={`rounded-sm ${password && segment <= level ? tone : "bg-muted"}`} />)}
    </div>
    <ul className="flex flex-col gap-1.5">
      {[...passwordRequirements(password), { label: "Passwords match", met: password.length > 0 && password === confirmation }].map((rule) =>
        <li key={rule.label} className={`flex items-center gap-2 ${rule.met ? "text-primary" : "text-muted-foreground"}`}>
          {rule.met ? <Check aria-hidden="true" className="size-4 shrink-0" /> : <Circle aria-hidden="true" className="size-4 shrink-0" />}
          <span className="sr-only">{rule.met ? "Met: " : "Not met: "}</span>{rule.label}
        </li>)}
    </ul>
  </div>;
}