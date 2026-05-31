/**
 * features/integrations/alerts.ts — Alert rules engine
 *
 * Dispatch event → format message → gửi đến các kênh đã cấu hình.
 * Tất cả best-effort: lỗi kênh không ảnh hưởng luồng chính.
 *
 * Kênh hỗ trợ:
 *   - Telegram (sendTelegram)
 *   - Email (sendEmail + templates)
 *   - Zalo OA (sendZaloOA — cần zaloUserId của người nhận)
 */

import { sendTelegram } from '@/lib/notify'
import { sendEmail, txnApprovedHtml, taxDueSoonHtml } from '@/lib/email'

// ─── Event types ──────────────────────────────────────────────────────────────

export type AlertEvent =
  | TxnApprovedEvent
  | TaxDueSoonEvent
  | RiskRedEvent
  | SheetsyncDoneEvent

export interface TxnApprovedEvent {
  type: 'txn_approved'
  kind: 'income' | 'expense'
  companyName: string
  amount: number
  currency?: string
  txnDate: string
  note?: string | null
}

export interface TaxDueSoonEvent {
  type: 'tax_due_soon'
  companyName: string
  items: { tax_type: string; period: string; due_date: string }[]
}

export interface RiskRedEvent {
  type: 'risk_red'
  companyName: string
  indicators: string[]   // label của các chỉ tiêu đỏ
}

export interface SheetsyncDoneEvent {
  type: 'sheetsync_done'
  incomeCount: number
  expenseCount: number
}

// ─── Format message ───────────────────────────────────────────────────────────

function formatText(event: AlertEvent): string {
  switch (event.type) {
    case 'txn_approved': {
      const label = event.kind === 'income' ? 'Thu tiền' : 'Chi phí'
      const fmt   = new Intl.NumberFormat('vi-VN')
      return (
        `✅ <b>${label} đã duyệt</b>\n` +
        `Công ty: ${event.companyName}\n` +
        `Ngày: ${event.txnDate}\n` +
        `Số tiền: ${fmt.format(event.amount)} ${event.currency ?? 'VND'}` +
        (event.note ? `\nGhi chú: ${event.note}` : '')
      )
    }
    case 'tax_due_soon': {
      const list = event.items.map((i: { tax_type: string; period: string; due_date: string }) =>
        `• ${i.tax_type} (${i.period}): hạn <b>${i.due_date}</b>`
      ).join('\n')
      return `⚠️ <b>Thuế đến hạn sớm</b> — ${event.companyName}\n${list}`
    }
    case 'risk_red': {
      const list = event.indicators.map((i: string) => `• ${i}`).join('\n')
      return `🔴 <b>Cảnh báo rủi ro tài chính</b> — ${event.companyName}\n${list}`
    }
    case 'sheetsync_done': {
      return (
        `📊 <b>Google Sheets đã đồng bộ</b>\n` +
        `Thu tiền: ${event.incomeCount} dòng\n` +
        `Chi phí: ${event.expenseCount} dòng`
      )
    }
    default: {
      const _exhaustive: never = event
      return String(_exhaustive)
    }
  }
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

/**
 * Dispatch alert đến các kênh đã cấu hình.
 * Không throw — mọi lỗi được catch + log riêng.
 */
export async function dispatchAlert(event: AlertEvent): Promise<void> {
  const text = formatText(event)
  const recipients = process.env.ALERT_EMAIL_RECIPIENTS?.split(',').map(s => s.trim()).filter(Boolean) ?? []

  await Promise.allSettled([
    // Telegram — gửi nếu có BOT_TOKEN + CHAT_ID
    sendTelegram(text).catch(e => console.error('[alerts] Telegram:', e)),

    // Email — chỉ gửi cho txn_approved và tax_due_soon
    (() => {
      if (recipients.length === 0) return Promise.resolve()

      if (event.type === 'txn_approved') {
        return sendEmail({
          to: recipients,
          subject: `[KBIT] ${event.kind === 'income' ? 'Thu tiền' : 'Chi phí'} đã duyệt — ${event.companyName}`,
          html: txnApprovedHtml({ ...event, note: event.note ?? undefined }),
        }).catch(e => console.error('[alerts] Email txn:', e))
      }

      if (event.type === 'tax_due_soon') {
        return sendEmail({
          to: recipients,
          subject: `[KBIT] Thuế đến hạn — ${event.companyName}`,
          html: taxDueSoonHtml(event),
        }).catch(e => console.error('[alerts] Email tax:', e))
      }

      return Promise.resolve()
    })(),
  ])
}
