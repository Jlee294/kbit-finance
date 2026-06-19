import { FilterField, FILTER_CONTROL } from './FilterBar'

/**
 * Bộ lọc thời gian dùng chung. 3 cách lọc trong NĂM đã chọn ở thanh toàn cục:
 *   - Kỳ: Cả năm / Quý 1–4 / Tháng 1–12  (param `period`: '' | 'q1'..'q4' | '1'..'12')
 *   - Khoảng ngày: Từ ngày – Đến ngày    (param `from` / `to`, ưu tiên hơn kỳ)
 * Đặt trong <FilterBar> kèm <AutoSubmit/> → tự lọc khi chọn (không cần nút Lọc).
 */
export function PeriodFields({ period, from, to }: { period?: string; from?: string; to?: string }) {
  return (
    <>
      <FilterField label="Kỳ" hint="Cả năm / quý / tháng">
        <select name="period" defaultValue={period ?? ''} className={`${FILTER_CONTROL} min-w-[130px]`}>
          <option value="">Cả năm</option>
          <optgroup label="Theo quý">
            <option value="q1">Quý 1 (T1–T3)</option>
            <option value="q2">Quý 2 (T4–T6)</option>
            <option value="q3">Quý 3 (T7–T9)</option>
            <option value="q4">Quý 4 (T10–T12)</option>
          </optgroup>
          <optgroup label="Theo tháng">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>Tháng {m}</option>
            ))}
          </optgroup>
        </select>
      </FilterField>
      <FilterField label="Từ ngày" hint="(tùy chọn, ưu tiên hơn kỳ)">
        <input type="date" name="from" defaultValue={from ?? ''} className={FILTER_CONTROL} />
      </FilterField>
      <FilterField label="Đến ngày" hint="(tùy chọn)">
        <input type="date" name="to" defaultValue={to ?? ''} className={FILTER_CONTROL} />
      </FilterField>
    </>
  )
}
