/**
 * The AnyStl mark: a magnifying glass around a wireframe cube cut into
 * triangles (an STL mesh). `hole` fills the lens so the mark sits on any
 * background; `ink` draws the cube.
 */
export function LogoMark({
  size = 36,
  ink = "#F3EDE7",
  hole = "#1F1B18",
  className,
}: {
  size?: number;
  ink?: string;
  hole?: string;
  className?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <line x1="43" y1="43" x2="57" y2="57" stroke="#FF7A1A" strokeWidth="8" strokeLinecap="round" />
      <circle cx="27" cy="27" r="21" fill={hole} stroke="#FF7A1A" strokeWidth="6" />
      <polygon
        points="27,14 38,20.3 38,32.9 27,39.2 16,32.9 16,20.3"
        fill="none"
        stroke={ink}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <polyline points="16,20.3 27,26.6 38,20.3" fill="none" stroke={ink} strokeWidth="2.2" strokeLinejoin="round" />
      <line x1="27" y1="26.6" x2="27" y2="39.2" stroke={ink} strokeWidth="2.2" />
      <line x1="16" y1="20.3" x2="38" y2="20.3" stroke={ink} strokeOpacity="0.45" strokeWidth="1.4" />
      <line x1="16" y1="20.3" x2="27" y2="39.2" stroke={ink} strokeOpacity="0.45" strokeWidth="1.4" />
      <line x1="38" y1="20.3" x2="27" y2="39.2" stroke={ink} strokeOpacity="0.45" strokeWidth="1.4" />
    </svg>
  );
}
