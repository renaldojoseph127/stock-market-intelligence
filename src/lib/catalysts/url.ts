export function safeExternalUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function securityTypeCatalystLimitation(value: unknown) {
  const type = String(value ?? "").trim();
  return ["ETF", "ETN", "fund", "warrant", "unit"].includes(type)
    ? `${type} catalyst research may have limited issuer-level coverage. SEC evidence is retained without applying operating-company assumptions.`
    : null;
}
