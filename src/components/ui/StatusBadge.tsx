import React from 'react'
import { LucideIcon } from 'lucide-react'

export type StatusVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'brand'

interface StatusBadgeProps {
  label: string
  variant?: StatusVariant
  icon?: LucideIcon
  pulse?: boolean
  className?: string
}

const variantStyles: Record<StatusVariant, { bg: string; text: string; border: string; dot: string }> = {
  success: {
    bg: 'bg-emerald-500/10 dark:bg-emerald-500/15',
    text: 'text-emerald-700 dark:text-emerald-400',
    border: 'border-emerald-500/25 dark:border-emerald-500/30',
    dot: 'bg-emerald-500',
  },
  warning: {
    bg: 'bg-amber-500/10 dark:bg-amber-500/15',
    text: 'text-amber-700 dark:text-amber-400',
    border: 'border-amber-500/25 dark:border-amber-500/30',
    dot: 'bg-amber-500',
  },
  error: {
    bg: 'bg-rose-500/10 dark:bg-rose-500/15',
    text: 'text-rose-700 dark:text-rose-400',
    border: 'border-rose-500/25 dark:border-rose-500/30',
    dot: 'bg-rose-500',
  },
  info: {
    bg: 'bg-sky-500/10 dark:bg-sky-500/15',
    text: 'text-sky-700 dark:text-sky-400',
    border: 'border-sky-500/25 dark:border-sky-500/30',
    dot: 'bg-sky-500',
  },
  neutral: {
    bg: 'bg-slate-100 dark:bg-dark-800',
    text: 'text-slate-600 dark:text-dark-300',
    border: 'border-slate-200 dark:border-dark-700',
    dot: 'bg-slate-400',
  },
  brand: {
    bg: 'bg-brand-500/10 dark:bg-brand-500/15',
    text: 'text-brand-700 dark:text-brand-400',
    border: 'border-brand-500/25 dark:border-brand-500/30',
    dot: 'bg-brand-500',
  },
}

export function StatusBadge({
  label,
  variant = 'neutral',
  icon: Icon,
  pulse = false,
  className = '',
}: StatusBadgeProps) {
  const styles = variantStyles[variant]

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide border shadow-2xs transition-colors ${styles.bg} ${styles.text} ${styles.border} ${className}`}
    >
      {pulse ? (
        <span className="relative flex h-2 w-2">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${styles.dot}`} />
          <span className={`relative inline-flex rounded-full h-2 w-2 ${styles.dot}`} />
        </span>
      ) : Icon ? (
        <Icon size={12} className="flex-shrink-0" />
      ) : (
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${styles.dot}`} />
      )}
      <span>{label}</span>
    </span>
  )
}

export default StatusBadge
