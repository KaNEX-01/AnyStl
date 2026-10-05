/**
 * The AnyStl mark as a loading animation: a bright arc sweeps round the lens,
 * the wireframe cube draws itself edge by edge like a toolpath, its mesh
 * lines flicker, and the whole glass circles a little as if searching.
 * Small sizes (`compact`) keep only the sweeping lens. Motion is replaced by
 * a gentle pulse for people who ask for reduced motion (see globals.css).
 *
 * Decorative only: pair it with visible or screen-reader text.
 */
export function LogoLoader({
  size = 72,
  color = "#FF7A1A",
  ink = "#F3EDE7",
  hole = "transparent",
  compact = size < 32,
  className = "",
}: {
  size?: number;
  /** Lens, handle and sweep colour. */
  color?: string;
  /** Cube colour. */
  ink?: string;
  /** Fill inside the lens. */
  hole?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={`anystl-loader ${className}`}
    >
      <g className={compact ? undefined : "anystl-loader-scan"}>
        <line x1="43" y1="43" x2="57" y2="57" stroke={color} strokeWidth="8" strokeLinecap="round" />
        <circle cx="27" cy="27" r="21" fill={hole} stroke={color} strokeOpacity="0.35" strokeWidth="6" />
        {/* The sweep: a quarter of the ring, spinning */}
        <circle
          className="anystl-loader-sweep"
          cx="27"
          cy="27"
          r="21"
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="26 74"
        />
        {!compact && (
          <>
            <polygon
              className="anystl-loader-edge"
              points="27,14 38,20.3 38,32.9 27,39.2 16,32.9 16,20.3"
              fill="none"
              stroke={ink}
              strokeWidth="2.2"
              strokeLinejoin="round"
              pathLength={100}
            />
            <polyline
              className="anystl-loader-edge"
              style={{ animationDelay: "0.25s" }}
              points="16,20.3 27,26.6 38,20.3"
              fill="none"
              stroke={ink}
              strokeWidth="2.2"
              strokeLinejoin="round"
              pathLength={100}
            />
            <line
              className="anystl-loader-edge"
              style={{ animationDelay: "0.45s" }}
              x1="27"
              y1="26.6"
              x2="27"
              y2="39.2"
              stroke={ink}
              strokeWidth="2.2"
              pathLength={100}
            />
            <line className="anystl-loader-mesh" x1="16" y1="20.3" x2="38" y2="20.3" stroke={ink} strokeWidth="1.4" />
            <line
              className="anystl-loader-mesh"
              style={{ animationDelay: "0.4s" }}
              x1="16"
              y1="20.3"
              x2="27"
              y2="39.2"
              stroke={ink}
              strokeWidth="1.4"
            />
            <line
              className="anystl-loader-mesh"
              style={{ animationDelay: "0.8s" }}
              x1="38"
              y1="20.3"
              x2="27"
              y2="39.2"
              stroke={ink}
              strokeWidth="1.4"
            />
          </>
        )}
      </g>
    </svg>
  );
}
