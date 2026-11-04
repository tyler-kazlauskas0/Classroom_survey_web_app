import { Bar, BarChart, LabelList, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import type { QuestionResult } from '../lib/types'

/** Horizontal bar chart; every bar is labelled with count and percentage. */
export function ResultsChart({ question }: { question: QuestionResult }) {
  const data = question.choices.map((c) => ({
    name: c.choice_text.length > 40 ? `${c.choice_text.slice(0, 38)}…` : c.choice_text,
    count: c.count,
    label: `${c.count} (${c.percentage.toFixed(1)}%)`,
  }))
  const height = Math.max(120, data.length * 52)
  const narrow = typeof window !== 'undefined' && window.innerWidth < 640
  return (
    <div className="mt-4" aria-hidden="true">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: narrow ? 80 : 100, bottom: 0, left: 0 }}
        >
          <XAxis type="number" hide allowDecimals={false} domain={[0, 'dataMax']} />
          <YAxis
            type="category"
            dataKey="name"
            width={narrow ? 96 : 180}
            tick={{ fill: '#1e293b', fontSize: narrow ? 12 : 14 }}
            tickLine={false}
            axisLine={false}
          />
          <Bar
            dataKey="count"
            fill="#1d4ed8"
            radius={[0, 4, 4, 0]}
            barSize={28}
            isAnimationActive={false}
          >
            <LabelList dataKey="label" position="right" fill="#0f172a" fontSize={14} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
