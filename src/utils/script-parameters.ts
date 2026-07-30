const PARAMETER_PATTERN = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g

/** Extracts unique `${NAME}` placeholders in first-seen order. */
export function extractScriptParameters(content: string): string[] {
  const names = new Set<string>()
  for (const match of content.matchAll(PARAMETER_PATTERN)) names.add(match[1])
  return [...names].slice(0, 20)
}

/** Quotes values before substitution so parameter text is never interpreted as Shell syntax. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\"'\"'")}'`
}

export function renderScriptParameters(content: string, values: Record<string, string>): string {
  return content.replace(PARAMETER_PATTERN, (_match, name: string) => shellQuote(values[name] ?? ''))
}
