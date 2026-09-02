export function getSafeExternalReferences(references = []) {
  if (!Array.isArray(references)) return [];

  const seenUrls = new Set();

  return references.flatMap((reference) => {
    if (!reference || typeof reference.label !== "string" || typeof reference.url !== "string") return [];

    const label = reference.label.trim();
    const url = reference.url.trim();
    if (!label || !url || /^https?:\/\//i.test(label)) return [];

    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password || seenUrls.has(url)) return [];
    } catch {
      return [];
    }

    seenUrls.add(url);
    return [{ ...reference, label, url }];
  });
}
