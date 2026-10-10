/**
 * Client error reports that are noise, not CASI bugs, and should not be
 * relayed to ERROR_WEBHOOK_URL (Discord).
 *
 * Headless-browser automation (Puppeteer `waitForFunction` / Playwright
 * `evaluate` with a string predicate) runs `eval` inside our pages. Our CSP
 * has no 'unsafe-eval', so that throws an EvalError, which surfaces as an
 * unhandledrejection that ClientErrorReporter dutifully posts. The stack
 * names the injected frames (`eval at evaluate`, `__puppeteer_evaluation_script__`,
 * `__playwright_evaluation_script__`); our own bundle never produces them.
 */
const AUTOMATION_STACK_MARKERS = [
  'eval at evaluate',
  '__puppeteer_evaluation_script__',
  '__playwright_evaluation_script__',
];

export function isIgnorableClientError(message: string, stack?: string | null): boolean {
  const s = stack ?? '';
  if (AUTOMATION_STACK_MARKERS.some((m) => s.includes(m))) return true;
  // Some reporters put the injected stack in the message itself.
  return AUTOMATION_STACK_MARKERS.some((m) => message.includes(m));
}
