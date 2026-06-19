'use client'

import { useEffect, useRef } from 'react'

/**
 * Đặt trong <FilterBar> (form GET) để TỰ ÁP DỤNG lọc khi đổi bất kỳ ô nào
 * (select/date) — KTT: không phải bấm nút Lọc. Ô text submit khi rời ô (blur).
 */
export function AutoSubmit() {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const form = ref.current?.closest('form')
    if (!form) return
    const onChange = () => form.requestSubmit()
    form.addEventListener('change', onChange)
    return () => form.removeEventListener('change', onChange)
  }, [])
  return <span ref={ref} className="hidden" aria-hidden />
}
