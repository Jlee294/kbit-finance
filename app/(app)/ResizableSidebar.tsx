'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'kbit:sidebar:width'
const DEFAULT_W = 224   // = w-56
const MIN_W = 180
const MAX_W = 360

/**
 * Cột menu CO GIÃN (KTT): kéo cạnh phải để chỉnh độ rộng, lưu vào localStorage.
 * Bọc toàn bộ nội dung sidebar (logo + nav + footer) làm children.
 */
export function ResizableSidebar({ children }: { children: React.ReactNode }) {
  const [width, setWidth] = useState<number>(DEFAULT_W)
  const [dragging, setDragging] = useState(false)
  const asideRef = useRef<HTMLElement>(null)

  // Nạp độ rộng đã lưu sau mount (tránh hydration mismatch).
  useEffect(() => {
    const saved = Number(localStorage.getItem(STORAGE_KEY))
    if (saved >= MIN_W && saved <= MAX_W) setWidth(saved)
  }, [])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => {
      const left = asideRef.current?.getBoundingClientRect().left ?? 0
      const w = Math.min(MAX_W, Math.max(MIN_W, e.clientX - left))
      setWidth(w)
    }
    const onUp = () => {
      setDragging(false)
      try { localStorage.setItem(STORAGE_KEY, String(width)) } catch {}
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [dragging, width])

  return (
    <aside
      ref={asideRef}
      style={{ width }}
      className="relative shrink-0 flex flex-col bg-white border-r border-gray-200 min-h-screen sticky top-0 h-screen shadow-sm"
    >
      {children}

      {/* Tay kéo co giãn — cạnh phải */}
      <div
        onMouseDown={onMouseDown}
        onDoubleClick={() => { setWidth(DEFAULT_W); try { localStorage.setItem(STORAGE_KEY, String(DEFAULT_W)) } catch {} }}
        title="Kéo để chỉnh độ rộng · nhấp đúp để về mặc định"
        className={`absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-brand-200/70 transition-colors ${dragging ? 'bg-brand-300' : 'bg-transparent'}`}
      />
    </aside>
  )
}
