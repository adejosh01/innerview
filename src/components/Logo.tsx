/**
 * Innerview mark: a head silhouette with a scan line passing through it.
 * Uses currentColor-free explicit brand tokens so it reads on any surface.
 */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="9" fill="var(--surface-2)" stroke="var(--border-strong)" />
      {/* head profile */}
      <path
        d="M16 6.5c-4.4 0-7.5 3.2-7.5 7.4 0 2.3.9 4.1 2.3 5.4v3.2c0 .9.7 1.6 1.6 1.6h7.2c.9 0 1.6-.7 1.6-1.6v-3.2c1.4-1.3 2.3-3.1 2.3-5.4 0-4.2-3.1-7.4-7.5-7.4Z"
        fill="none"
        stroke="var(--bone)"
        strokeOpacity=".9"
        strokeWidth="1.6"
      />
      {/* eye sockets */}
      <circle cx="13.2" cy="14.4" r="1.5" fill="var(--bone)" opacity=".85" />
      <circle cx="18.8" cy="14.4" r="1.5" fill="var(--bone)" opacity=".85" />
      {/* scan line */}
      <rect x="4" y="17.4" width="24" height="1.8" rx=".9" fill="var(--brand)" />
      <rect x="4" y="15.6" width="24" height="5.4" rx="2.7" fill="var(--brand)" opacity=".18" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="logo" aria-label="Innerview">
      <LogoMark />
      <span className="word">
        Inner<span>view</span>
      </span>
    </span>
  );
}
