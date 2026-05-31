/**
 * lib/notify.ts — Push notifications: Telegram + Zalo OA
 *
 * Tất cả hàm là best-effort — không throw nếu chưa cấu hình.
 * Gọi với .catch(() => {}) để không ảnh hưởng luồng chính.
 *
 * Env vars:
 *   TELEGRAM_BOT_TOKEN   — Token bot Telegram (@BotFather)
 *   TELEGRAM_CHAT_ID     — Chat ID (group hoặc user)
 *   ZALO_OA_ACCESS_TOKEN — OA Access Token từ Zalo Developer
 */

// ─── Telegram ────────────────────────────────────────────────────────────────

/**
 * Gửi tin nhắn qua Telegram Bot.
 * Hỗ trợ HTML parse_mode: <b>bold</b>, <i>italic</i>, <code>code</code>.
 */
export async function sendTelegram(text: string): Promise<void> {
  const token  = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return // chưa cấu hình — bỏ qua

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error('[notify] Telegram lỗi:', body)
  }
}

// ─── Zalo OA ─────────────────────────────────────────────────────────────────

/**
 * Gửi tin nhắn CS (Customer Service) qua Zalo OA tới 1 user cụ thể.
 * Điều kiện: user phải đang follow OA (không phải broadcast).
 *
 * @param zaloUserId — ID người dùng Zalo (lấy từ webhook OA)
 * @param text       — Nội dung tin nhắn (plain text, tối đa 2000 ký tự)
 */
export async function sendZaloOA(zaloUserId: string, text: string): Promise<void> {
  const oaToken = process.env.ZALO_OA_ACCESS_TOKEN
  if (!oaToken) return // chưa cấu hình — bỏ qua

  const res = await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      access_token: oaToken,
    },
    body: JSON.stringify({
      recipient: { user_id: zaloUserId },
      message: { text },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error('[notify] Zalo OA lỗi:', body)
  }
}

// ─── Broadcast helpers ────────────────────────────────────────────────────────

/**
 * Gửi đồng thời đến Telegram + Zalo (nếu có zaloUserId).
 * Lỗi từng kênh được log riêng, không làm fail toàn bộ.
 */
export async function broadcast(opts: {
  text: string
  zaloUserId?: string
}): Promise<void> {
  await Promise.allSettled([
    sendTelegram(opts.text),
    opts.zaloUserId ? sendZaloOA(opts.zaloUserId, opts.text) : Promise.resolve(),
  ])
}
