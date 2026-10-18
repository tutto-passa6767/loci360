/**
 * Runs once in the server process. next.config only sees the root .env while the config is evaluated,
 * so route handlers (the revalidation hook) get it from here. Node-only code lives in its own module
 * to keep it out of the Edge bundle.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./instrumentation-node');
}
