import { FilterField, FILTER_CONTROL } from './FilterBar'

/**
 * Bộ lọc thời gian dùng chung trong FilterBar: chọn THÁNG (Cả năm / 1–12)
 * hoặc nhập KHOẢNG NGÀY (từ–đến) tùy ý. Lọc bên trong NĂM đã chọn ở thanh toàn cục.
 * Đặt trong <FilterBar> (form GET) → submit reload với ?month / ?from / ?to.
 */
export function MonthRangeFields({ month, from, to }: { month?: string; from?: string; to?: string }) {
  return (
    <>
      <FilterField label="Tháng" hint="Cả năm hoặc 1 tháng">
        <select name="month" defaultValue={month ?? ''} className={`${FILTER_CONTROL} min-w-[110px]`}>
          <option value="">Cả năm</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>Tháng {m}</option>
          ))}
        </select>
      </FilterField>
      <FilterField label="Từ ngày" hint="(tùy chọn, ưu tiên hơn tháng)">
        <input type="date" name="from" defaultValue={from ?? ''} className={FILTER_CONTROL} />
      </FilterField>
      <FilterField label="Đến ngày" hint="(tùy chọn)">
        <input type="date" name="to" defaultValue={to ?? ''} className={FILTER_CONTROL} />
      </FilterField>
    </>
  )
}
