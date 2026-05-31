/**
 * lib/email.ts — Transactional email via Resend API
 *
 * Dùng raw fetch — không cần install thư viện resend.
 * (Nếu muốn dùng SDK: npm install resend, rồi: new Resend(key).emails.send(...))
 *
 * Env vars:
 *   RESEND_API_KEY  — API key từ resend.com
 *   EMAIL_FROM      — Địa chỉ gửi, VD: KBIT Finance <noreply@kbitassociation.com>
 *                     Phải là domain đã verify trên Resend.
 *   ALERT_EMAIL_RECIPIENTS — Danh sách email nhận cảnh báo, cách nhau bởi dấu phẩy
 */

export interface SendEmailOpts {
  to: string | string[]
  subject: string
  html: string
  from?: string   // override EMAIL_FROM
  replyTo?: string
}

/**
 * Gửi email transactional qua Resend.
 * Best-effort: lỗi được log, không throw để không ảnh hưởng luồng chính.
 */
export async function sendEmail(opts: SendEmailOpts): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY chưa cấu hình — bỏ qua gửi email')
    return
  }

  const from = opts.from
    ?? process.env.EMAIL_FROM
    ?? 'KBIT Finance <noreply@kbitassociation.com>'

  const to = Array.isArray(opts.to) ? opts.to : [opts.to]

  const body: Record<string, unknown> = { from, to, subject: opts.subject, html: opts.html }
  if (opts.replyTo) body.reply_to = opts.replyTo

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[email] Resend lỗi:', err)
    // Không throw — email là best-effort
  }
}

// ─── Email templates ──────────────────────────────────────────────────────────

/** Template cảnh báo giao dịch được duyệt */
export function txnApprovedHtml(opts: {
  kind: 'income' | 'expense'
  companyName: string
  amount: number
  currency?: string
  txnDate: string
  note?: string
}): string {
  const kindLabel = opts.kind === 'income' ? 'Thu tiền' : 'Chi phí'
  const fmt = new Intl.NumberFormat('vi-VN')
  const amt = fmt.format(opts.amount)
  const cur = opts.currency ?? 'VND'

  return `
<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto">
  <h2 style="color:#16a34a">✅ ${kindLabel} đã được duyệt</h2>
  <table style="width:100%;border-collapse:collapse">
    <tr><td style="padding:6px 0;color:#6b7280">Công ty</td><td><b>${opts.companyName}</b></td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Ngày GD</td><td>${opts.txnDate}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Số tiền</td><td><b>${amt} ${cur}</b></td></tr>
    ${opts.note ? `<tr><td style="padding:6px 0;color:#6b7280">Ghi chú</td><td>${opts.note}</td></tr>` : ''}
  </table>
  <hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb">
  <p style="font-size:12px;color:#9ca3af">Email tự động từ KBIT Finance System</p>
</div>
  `.trim()
}

/** Template cảnh báo thuế đến hạn */
export function taxDueSoonHtml(opts: {
  companyName: string
  items: { tax_type: string; period: string; due_date: string }[]
}): string {
  const rows = opts.items.map(i =>
    `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6">${i.tax_type}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6">${i.period}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;color:#dc2626"><b>${i.due_date}</b></td>
    </tr>`
  ).join('')

  return `
<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto">
  <h2 style="color:#d97706">⚠️ Thuế đến hạn sớm — ${opts.companyName}</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <thead>
      <tr style="background:#f9fafb">
        <th style="padding:6px 8px;text-align:left">Loại thuế</th>
        <th style="padding:6px 8px;text-align:left">Kỳ</th>
        <th style="padding:6px 8px;text-align:left">Hạn nộp</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb">
  <p style="font-size:12px;color:#9ca3af">Email tự động từ KBIT Finance System</p>
</div>
  `.trim()
}
