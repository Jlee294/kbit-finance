'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { verifyDocument, unverifyDocument } from '../actions'

interface Props {
  documentId: string
  isVerified: boolean
  canApprove: boolean
}

export function VerifyDocButton({ documentId, isVerified, canApprove }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!canApprove) {
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full ${isVerified ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
        {isVerified ? '✓ Đã xác nhận' : 'Chờ xác nhận'}
      </span>
    )
  }

  async function handle() {
    setLoading(true)
    setError('')
    try {
      if (isVerified) {
        await unverifyDocument(documentId)
      } else {
        await verifyDocument(documentId)
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={handle}
        disabled={loading}
        className={`text-xs px-2 py-0.5 rounded-full cursor-pointer transition-colors
          ${isVerified
            ? 'bg-green-100 text-green-700 hover:bg-green-200'
            : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
          }`}
      >
        {loading ? '...' : isVerified ? '✓ Đã xác nhận' : 'Xác nhận'}
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  )
}
