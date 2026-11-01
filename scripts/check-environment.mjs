import { pathToFileURL } from "node:url";

// Deployment-tooling only; never imported into the application server/browser.
export function checkEnvironment(env) {
  const errors = [];
  if (env.VITE_APP_URL) {
    try {
      const url = new URL(env.VITE_APP_URL);
      if (!["http:", "https:"].includes(url.protocol)) errors.push("App URL must use HTTP or HTTPS.");
      if (url.username || url.password) errors.push("App URL must not contain credentials.");
    } catch {
      errors.push("App URL must be a valid absolute URL.");
    }
  }
  for (const key of Object.keys(env)) {
    if (key.startsWith("VITE_") && /SECRET|PASSWORD|SERVICE_ROLE|PRIVATE_KEY|WEBHOOK/i.test(key)) {
      errors.push(`Private configuration must not be browser-visible: ${key}`);
    }
  }
  if (Boolean(env.VITE_SUPABASE_URL) !== Boolean(env.VITE_SUPABASE_PUBLISHABLE_KEY)) {
    errors.push("Future Cloud public URL and publishable key must be supplied together.");
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = checkEnvironment(process.env);
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Environment check passed. M02 needs no connected services or credentials.");
  }
}