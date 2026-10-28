'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'

interface AutoRefresherProps {
  intervalSeconds?: number
  label?: string
}

export function AutoRefresher({ intervalSeconds = 8, label = 'Live Sync' }: AutoRefresherProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isSpinning, setIsSpinning] = useState(false)

  const handleManualRefresh = () => {
    setIsSpinning(true)
    startTransition(() => {
      router.refresh()
    })
    setTimeout(() => setIsSpinning(false), 800)
  }

  useEffect(() => {
    const timer = setInterval(() => {
      startTransition(() => {
        router.refresh()
      })
    }, intervalSeconds * 1000)

    const onFocus = () => {
      startTransition(() => {
        router.refresh()
      })
    }
    window.addEventListener('focus', onFocus)

    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [router, intervalSeconds])

  return (
    <div className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 bg-slate-100/90 border border-slate-200 px-3 py-1.5 rounded-full shadow-xs">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
      </span>
      <span>{label}</span>
      <span className="text-slate-400 text-[10px]">({intervalSeconds}s)</span>
      <button
        type="button"
        onClick={handleManualRefresh}
        title="Refresh now"
        className="ml-1 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${isSpinning || isPending ? 'animate-spin text-indigo-600' : ''}`} />
      </button>
    </div>
  )
}
