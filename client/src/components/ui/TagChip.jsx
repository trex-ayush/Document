/**
 * TagChip — colored chip for a document tag, using the tag's own color for
 * border/bg/text (outline variant) or bg/text (solid variant).
 *
 * Ported verbatim from apps/template/src/components/ui/TagChip.jsx. Our
 * `Document.tags` (docs/API.md) is currently a plain string array, not
 * `{ name, color }` objects — pass `tag={{ name: tagString }}` and it falls
 * back to a neutral gray (`color` is optional).
 *
 * Props:
 *  - tag       { name, color? } — color is any hex string
 *  - variant?  'outline' (default) | 'solid'
 *  - onClick?  optional click handler (e.g. filter by tag)
 *  - className?
 *
 * @example
 * <TagChip tag={{ name: 'tax-2025' }} onClick={() => setTagFilter('tax-2025')} />
 */
const TagChip = ({ tag, variant = 'outline', onClick, className = '' }) => {
  if (!tag) return null;
  const color = tag.color || '#78716C'; // falls back to our neutral-500

  const baseClass = `text-xs inline-flex items-center px-2 py-0.5 rounded-full truncate max-w-[120px] ${className}`;

  if (variant === 'solid') {
    const solidStyle = { backgroundColor: `${color}20`, color };
    if (onClick) {
      return (
        <button onClick={onClick} className={`${baseClass} hover:opacity-80 transition-opacity`} style={solidStyle} title={tag.name}>
          {tag.name}
        </button>
      );
    }
    return (
      <span className={baseClass} style={solidStyle} title={tag.name}>
        {tag.name}
      </span>
    );
  }

  const outlineStyle = { borderColor: `${color}60`, color, backgroundColor: `${color}15` };
  if (onClick) {
    return (
      <button
        onClick={onClick}
        className={`${baseClass} border transition-colors duration-150`}
        style={outlineStyle}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = color; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${color}60`; }}
        title={tag.name}
      >
        {tag.name}
      </button>
    );
  }
  return (
    <span className={`${baseClass} border`} style={outlineStyle} title={tag.name}>
      {tag.name}
    </span>
  );
};

export default TagChip;
