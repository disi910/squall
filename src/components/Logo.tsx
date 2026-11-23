/** Two wind lines and a fault bolt: the only place the logo uses the fault accent. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M6 12h13a4 4 0 1 0-4-4" stroke="var(--fg)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M6 18h17a4 4 0 1 1-4 4" stroke="var(--fg)" strokeWidth="2.4" strokeLinecap="round" />
      <path
        d="M12 21l-2.5 4h3L11 29"
        stroke="var(--fault)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
