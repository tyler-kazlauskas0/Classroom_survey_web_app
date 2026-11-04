import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { friendlyMessage } from '../lib/errors'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 min-h-11 text-sm font-semibold ' +
  'transition-colors disabled:cursor-not-allowed disabled:opacity-60 ' +
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600'

const variants: Record<Variant, string> = {
  primary: 'bg-blue-700 text-white hover:bg-blue-800',
  secondary: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50',
  danger: 'bg-red-700 text-white hover:bg-red-800',
  ghost: 'text-slate-700 hover:bg-slate-100',
}

// eslint-disable-next-line react-refresh/only-export-components
export function buttonClass(variant: Variant = 'secondary', extra = ''): string {
  return `${base} ${variants[variant]} ${extra}`
}

export function Button({
  variant = 'secondary',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type={type} className={buttonClass(variant, className)} {...props} />
}

export function ButtonLink({
  variant = 'secondary',
  className = '',
  ...props
}: LinkProps & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...props} />
}

export function Spinner({ label = 'Loading...' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-3 py-12 text-slate-600"
    >
      <span
        aria-hidden="true"
        className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-700"
      />
      <span>{label}</span>
    </div>
  )
}

export function ErrorMessage({
  error,
  message,
  onRetry,
}: {
  error?: unknown
  message?: string
  onRetry?: () => void
}) {
  return (
    <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">
      <p>{message ?? friendlyMessage(error)}</p>
      {onRetry && (
        <Button className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <p className="text-lg font-semibold text-slate-800">{title}</p>
      {children && <div className="mt-3 text-slate-600">{children}</div>}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  )
}

export const inputClass =
  'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 ' +
  'placeholder:text-slate-400 focus:border-blue-600 focus:outline-2 focus:outline-blue-600 ' +
  'aria-[invalid=true]:border-red-600'

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="mt-1 text-sm font-medium text-red-700">
      {message}
    </p>
  )
}
