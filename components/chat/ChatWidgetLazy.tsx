'use client'

import dynamic from 'next/dynamic'

/**
 * Lazy mount ChatWidget — JS + ReactMarkdown chunk chỉ tải sau khi page
 * interactive, không block initial paint. Server không render gì cho widget.
 */
export const ChatWidgetLazy = dynamic(
  () => import('./ChatWidget').then((m) => m.ChatWidget),
  { ssr: false, loading: () => null },
)
