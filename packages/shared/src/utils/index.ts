/**
 * Renders a template string replacing {{variables}} with values.
 * Removes lines where all variables are empty.
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value || "");
  }
  // Remove lines that only contain empty variable placeholders or are blank after substitution
  const lines = result.split("\n");
  const filtered = lines.filter((line) => {
    const trimmed = line.trim();
    if (trimmed === "") return true; // Keep intentional blank lines
    // Remove lines that had variables but are now just label + empty
    return !(/^[^:]+:\s*$/.test(trimmed) && trimmed.includes(":"));
  });
  return filtered.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Format date for display in Spanish
 */
export function formatDateSpanish(date: Date): string {
  return date.toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
