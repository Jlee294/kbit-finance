/**
 * Hàm thuần tính tiền KR — KHÔNG chạm DB.
 * Test dễ, hiển thị client-side tức thì trước khi submit.
 * Số thật ghi trong RPC bằng SQL round(...) cùng công thức.
 */

/**
 * Quy đổi chi KR: amount_vnd = round(amount_krw × exchange_rate)
 * VND không dùng phần lẻ → làm tròn về số nguyên đồng.
 */
export function krwToVnd(amountKrw: number, rate: number): number {
  if (!(amountKrw > 0)) throw new Error('amount_krw phải > 0')
  if (!(rate > 0)) throw new Error('exchange_rate phải > 0')
  return Math.round(amountKrw * rate)
}

/**
 * Chênh lệch tỷ giá khi trả công nợ NCC ngoại tệ.
 * Quy ước dấu theo schema fx_gain_loss.gain_loss_vnd: dương=LÃI, âm=LỖ.
 *
 * gain_loss_vnd = amount_fc × (rate_booked − rate_settled)
 *   rate_settled > rate_booked → trả nhiều VNĐ hơn → LỖ (âm)
 *   rate_settled < rate_booked → trả ít VNĐ hơn  → LÃI (dương)
 *
 * Ví dụ: ghi nợ 1.000.000 KRW @18, trả @18,5
 *   = 1.000.000 × (18 − 18,5) = −500.000 → lỗ 500.000đ ✔
 */
export function fxGainLoss(amountFc: number, rateBooked: number, rateSettled: number): number {
  if (!(amountFc > 0)) throw new Error('amount_fc phải > 0')
  if (!(rateBooked > 0) || !(rateSettled > 0)) throw new Error('tỷ giá phải > 0')
  return Math.round(amountFc * (rateBooked - rateSettled))
}
