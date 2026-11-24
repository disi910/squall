import type { ComponentProps, ReactNode } from 'react'
import ReportContent from '../content/report.mdx'
import { REPORT_SECTIONS, slug } from '../content/report-sections.ts'
import { PageTitle } from './PageTitle.tsx'

const textOf = (node: ReactNode): string =>
  typeof node === 'string' ? node : Array.isArray(node) ? node.map(textOf).join('') : ''

/** How MDX elements render: the site's prose styles, plus ids on headings for the table of contents. */
const components = {
  h2: ({ children }: ComponentProps<'h2'>) => (
    <h2 id={slug(textOf(children))} className="mt-6 scroll-mt-32 text-[22px]">
      {children}
    </h2>
  ),
  p: (props: ComponentProps<'p'>) => <p className="text-muted" {...props} />,
  ul: (props: ComponentProps<'ul'>) => (
    <ul className="flex list-disc flex-col gap-1.5 pl-5 text-muted" {...props} />
  ),
  strong: (props: ComponentProps<'strong'>) => (
    <strong className="font-medium text-fg" {...props} />
  ),
  pre: (props: ComponentProps<'pre'>) => (
    <pre
      className="m-0 overflow-x-auto rounded-md border border-line bg-surface px-3 py-2.5 font-mono text-[13px] text-fg"
      {...props}
    />
  ),
  Finding: ({ n, children }: { n: number; children: ReactNode }) => (
    <div className="flex flex-col gap-1 rounded-md border border-l-[3px] border-line border-l-muted bg-surface px-3.5 py-3">
      <span className="eyebrow">Example finding {n}</span>
      <span>{children}</span>
    </div>
  ),
}

export function Report() {
  return (
    <div className="flex flex-col gap-7">
      <PageTitle title="Report" />
      <div className="flex max-w-[760px] flex-col gap-2">
        <span className="eyebrow">Write-up · skeleton</span>
        <h1 className="text-3xl">Robustness of tool-using agents under injected faults</h1>
        <p className="text-muted">
          A skeleton for the future study. The structure and methods are real; every number comes
          from simulated data and is a placeholder.
        </p>
      </div>
      <div className="grid items-start gap-10 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav
          aria-label="Report sections"
          className="flex flex-wrap gap-3 text-[13.5px] lg:sticky lg:top-32 lg:flex-col lg:gap-1.5"
        >
          {REPORT_SECTIONS.map((s) => (
            <a key={s} href={`#${slug(s)}`} className="text-muted hover:text-fg">
              {s}
            </a>
          ))}
        </nav>
        <article className="flex max-w-[70ch] flex-col gap-3.5">
          <ReportContent components={components} />
        </article>
      </div>
    </div>
  )
}
