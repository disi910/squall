/** React 19 hoists <title> into <head>, so each page can set its own without a helmet library. */
export function PageTitle({ title }: { title?: string }) {
  return (
    <title>{title ? `${title} · Squall` : 'Squall: fault-injection testing for AI agents'}</title>
  )
}
