import type { SurveyStatus } from '../lib/types'

const STYLES: Record<SurveyStatus, { label: string; icon: string; className: string }> = {
  draft: { label: 'Draft', icon: '✎', className: 'bg-slate-100 text-slate-800 border-slate-300' },
  active: { label: 'Active', icon: '●', className: 'bg-green-100 text-green-900 border-green-400' },
  closed: { label: 'Closed', icon: '■', className: 'bg-amber-100 text-amber-900 border-amber-400' },
  archived: {
    label: 'Archived',
    icon: '▣',
    className: 'bg-violet-100 text-violet-900 border-violet-300',
  },
}

// eslint-disable-next-line react-refresh/only-export-components
export const STATUS_LABELS: Record<SurveyStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  closed: 'Closed',
  archived: 'Archived',
}

/** Status shown with text and icon, never color alone. */
export function StatusBadge({ status }: { status: SurveyStatus }) {
  const s = STYLES[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${s.className}`}
    >
      <span aria-hidden="true">{s.icon}</span>
      {s.label}
    </span>
  )
}
