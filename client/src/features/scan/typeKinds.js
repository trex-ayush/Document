/**
 * Mapping a family's (editable) DocumentType templates to the kinds this
 * scanner understands. Kept separate from detectType.js (and its pattern
 * matchers) so the upload form can use it without pulling the parsers into
 * its own chunk — those only load with the lazy scan engine.
 */

export const DOC_KINDS = ['aadhaar', 'pan', 'passport', 'drivingLicence', 'voterId', 'bank'];

/**
 * Which scanner kind a DocumentType template corresponds to, by its (user-
 * editable) name. Returns null for types the scanner has no parser for.
 */
export function kindFromTypeName(name) {
  const n = String(name || '').toLowerCase();
  if (/aadhaa?r|आधार/.test(n)) return 'aadhaar';
  if (/\bpan\b|permanent account|पैन/.test(n)) return 'pan';
  if (/passport|पासपोर्ट/.test(n)) return 'passport';
  if (/driv(ing|er)|licen[cs]e|\bdl\b|लाइसेंस/.test(n)) return 'drivingLicence';
  if (/voter|epic|election|मतदाता/.test(n)) return 'voterId';
  if (/bank|passbook|cheque|बैंक/.test(n)) return 'bank';
  return null;
}

/** First DocumentType in `types` whose name maps to `kind`, or null. */
export function findTypeForKind(types, kind) {
  if (!kind) return null;
  return (types || []).find((t) => kindFromTypeName(t.name) === kind) || null;
}
