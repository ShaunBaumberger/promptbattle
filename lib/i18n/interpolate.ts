/**
 * Replace `{token}` placeholders in a dictionary string with values.
 * Lives in its own module (no "use client") so both server components and
 * client components can use it. Unknown tokens are left intact for debugging.
 *
 *   interpolate("Hi, {name}", { name: "Ada" })  // "Hi, Ada"
 */
export function interpolate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    key in vars ? String(vars[key]) : `{${key}}`,
  );
}
