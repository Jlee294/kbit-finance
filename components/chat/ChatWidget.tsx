'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import ReactMarkdown from 'react-markdown'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const SUGGESTIONS = [
  'Danh sách công ty hiện có?',
  'Tổng thu chi tháng này?',
  'Công việc đang mở?',
  'Thêm khách hàng mới',
]

export function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100)
  }, [open])

  async function send(text: string) {
    if (!text.trim() || streaming) return
    const userMsg: Message = { role: 'user', content: text }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setStreaming(true)

    // Add empty assistant message to stream into
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      })

      if (!res.ok) {
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', content: '❌ Lỗi kết nối. Vui lòng thử lại.' }
          return updated
        })
        return
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') break
          try {
            const { text } = JSON.parse(data) as { text: string }
            startTransition(() => {
              setMessages(prev => {
                const updated = [...prev]
                updated[updated.length - 1] = {
                  role: 'assistant',
                  content: updated[updated.length - 1].content + text,
                }
                return updated
              })
            })
          } catch { /* ignore parse errors */ }
        }
      }
    } catch {
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', content: '❌ Lỗi kết nối. Vui lòng thử lại.' }
        return updated
      })
    } finally {
      setStreaming(false)
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  function clearChat() {
    setMessages([])
    setInput('')
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`fixed bottom-5 right-5 z-50 flex items-center justify-center w-12 h-12 rounded-full shadow-lg transition-all ${
          open ? 'bg-gray-700 rotate-45' : 'bg-brand-800 hover:bg-brand-700'
        }`}
        title="Trợ lý AI KBIT"
        aria-label="Mở chatbot"
      >
        {open ? (
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-20 right-5 z-50 w-[380px] max-w-[calc(100vw-1.5rem)] h-[520px] flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-brand-800 text-white">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold">K</div>
              <div>
                <p className="text-sm font-semibold leading-tight">Trợ lý KBIT AI</p>
                <p className="text-[10px] text-blue-100">Hỏi về dữ liệu tài chính</p>
              </div>
            </div>
            <button onClick={clearChat} title="Xóa lịch sử" className="text-blue-100 hover:text-white text-xs">
              Xóa chat
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-gray-50">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-xs text-gray-400 text-center">Xin chào! Tôi có thể giúp bạn tra cứu và quản lý dữ liệu KBIT.</p>
                <div className="grid grid-cols-2 gap-2">
                  {SUGGESTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="text-xs text-left px-3 py-2 rounded-lg border border-brand-100 bg-white text-brand-700 hover:bg-brand-50 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-brand-800 text-white rounded-tr-sm'
                      : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0">
                      <ReactMarkdown>{msg.content || '▌'}</ReactMarkdown>
                    </div>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}

            {streaming && messages[messages.length - 1]?.content === '' && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-3 border-t bg-white">
            <div className="flex gap-2 items-center">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Hỏi hoặc yêu cầu thao tác..."
                disabled={streaming}
                className="flex-1 text-sm px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-gray-50 disabled:text-gray-400"
              />
              <button
                onClick={() => send(input)}
                disabled={!input.trim() || streaming}
                className="flex-shrink-0 w-9 h-9 rounded-xl bg-brand-800 text-white flex items-center justify-center hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
            <p className="text-[10px] text-gray-300 text-center mt-1.5">Powered by Claude AI · KBIT Finance</p>
          </div>
        </div>
      )}
    </>
  )
}
