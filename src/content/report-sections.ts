/** Heading text → URL fragment: "Metrics and uncertainty" → "metrics-and-uncertainty". */
export const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

/** The report's table of contents. Must match the h2 headings in report.mdx; a test checks every link has a target. */
export const REPORT_SECTIONS = [
  'Question',
  'Methodology',
  'Metrics and uncertainty',
  'Example findings',
  'Limitations',
  'Next steps',
]
