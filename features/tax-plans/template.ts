/**
 * KTT C1: Mẫu Kế hoạch thuế (16 chỉ tiêu cố định + sub-items mở rộng).
 *
 * Lưu trong tax_plans.plan_data jsonb với shape:
 *   { template: 'kht_v1', rows: TemplateRow[], meta: {...} }
 *
 * Formula tự tính: sửa số chỉ tiêu input → kéo theo recompute toàn bảng.
 */

export type RowKind = 'fixed' | 'sub'

export interface TemplateRow {
  id:        string         // số thứ tự hiển thị: "1", "6", "6.1", "6.bs1"...
  code:      string         // mã chuẩn cho fixed rows; tự sinh cho sub rows
  name:      string         // tên chỉ tiêu
  parent:    string | null  // null = root; "6" cho 6.x...
  amount:    number         // VND (có thể âm cho deductions)
  formula:   string | null  // null = input thủ công; xem FORMULA_HANDLERS
  kind:      RowKind        // 'fixed' (bôi đen, không xóa) | 'sub' (user thêm/bớt)
  operation_id?: string | null  // link Thư viện NV
  pct?:      number | null  // tỷ trọng/DT — auto-compute từ amount/doanh thu thuần
}

export interface TaxPlanTemplate {
  template: 'kht_v1'
  rows:     TemplateRow[]
  meta?: {
    from?:  string   // YYYY-MM-DD
    to?:    string
    notes?: string
  }
}

/** 16 chỉ tiêu cố định — match mẫu xlsx của KTT */
export const FIXED_TEMPLATE: TemplateRow[] = [
  { id: '1',  code: 'revenue_planned',     name: 'Doanh thu dự kiến',                parent: null, amount: 0, formula: null, kind: 'fixed' },
  { id: '2',  code: 'revenue_deductions',  name: 'Các khoản giảm trừ doanh thu',     parent: null, amount: 0, formula: null, kind: 'fixed' },
  { id: '3',  code: 'net_revenue',         name: 'Doanh thu thuần',                  parent: null, amount: 0, formula: 'subtract:1,2',     kind: 'fixed' },
  { id: '4',  code: 'cogs',                name: 'Giá vốn dự kiến',                  parent: null, amount: 0, formula: null, kind: 'fixed' },
  { id: '5',  code: 'gross_profit',        name: 'Lợi nhuận gộp',                    parent: null, amount: 0, formula: 'subtract:3,4',     kind: 'fixed' },
  { id: '6',  code: 'selling_expenses',    name: 'Chi phí bán hàng',                 parent: null, amount: 0, formula: 'sum_children:6',   kind: 'fixed' },
  { id: '7',  code: 'admin_expenses',      name: 'Chi phí quản lý',                  parent: null, amount: 0, formula: 'sum_children:7',   kind: 'fixed' },
  { id: '8',  code: 'financial_expenses',  name: 'Chi phí tài chính',                parent: null, amount: 0, formula: 'sum_children:8',   kind: 'fixed' },
  { id: '8.1',code: 'interest_expense',    name: 'Trong đó: Chi phí lãi vay',        parent: '8',  amount: 0, formula: null, kind: 'fixed' },
  { id: '9',  code: 'operating_profit',    name: 'Lợi nhuận thuần',                  parent: null, amount: 0, formula: 'subtract:5,6,7,8', kind: 'fixed' },
  { id: '10', code: 'other_revenue',       name: 'Doanh thu khác',                   parent: null, amount: 0, formula: null, kind: 'fixed' },
  { id: '11', code: 'other_expenses',      name: 'Chi phí khác',                     parent: null, amount: 0, formula: null, kind: 'fixed' },
  { id: '12', code: 'other_profit',        name: 'Lợi nhuận khác',                   parent: null, amount: 0, formula: 'subtract:10,11',   kind: 'fixed' },
  { id: '13', code: 'profit_before_tax',   name: 'Tổng lợi nhuận trước thuế',        parent: null, amount: 0, formula: 'add:9,12',         kind: 'fixed' },
  { id: '14', code: 'tax_rate',            name: 'Thuế suất',                        parent: null, amount: 0.20, formula: null, kind: 'fixed' },
  { id: '15', code: 'tax_amount',          name: 'Thuế TNDN phải nộp dự kiến',       parent: null, amount: 0, formula: 'mul:13,14',        kind: 'fixed' },
  { id: '16', code: 'profit_after_tax',    name: 'Lợi nhuận sau thuế dự kiến',       parent: null, amount: 0, formula: 'subtract:13,15',   kind: 'fixed' },
]

/**
 * Pure function — recompute toàn bộ formula rows từ input rows.
 * Tính theo thứ tự xuất hiện trong array; vì 1→16 cố định nên formula tham chiếu
 * id thấp hơn LUÔN có giá trị đã tính trước khi đến formula đó.
 *
 * Special:
 *   • 8.1 là sub-info-only (lãi vay trong chi phí tài chính), KHÔNG cộng vào parent 8
 *   • E3 (KTT): MỌI mục input (formula=null) đều cho thêm sub-items.
 *     Nếu mục có ≥1 sub thì amount = tổng các sub (auto-sum). Nếu không có sub
 *     thì giữ giá trị user nhập trực tiếp. Áp cho 1,2,4,6,7,8,10,11.
 */
export function recomputeTemplate(rows: TemplateRow[]): TemplateRow[] {
  const map = new Map<string, TemplateRow>()
  rows.forEach((r) => map.set(r.id, { ...r }))

  function rowAmount(id: string): number {
    return Number(map.get(id)?.amount ?? 0)
  }

  // Helper: sum các sub của 1 parent (loại trừ {parent}.1 = sub-info-only của 8)
  function sumChildren(parentId: string): { sum: number; hasSub: boolean } {
    const subs = rows.filter((x) => x.parent === parentId && x.kind === 'sub' && x.id !== `${parentId}.1`)
    return { sum: subs.reduce((s, x) => s + Number(x.amount), 0), hasSub: subs.length > 0 }
  }

  // PASS 1: với mục input thuần (formula=null, fixed, không có parent) — nếu có sub
  //   thì auto-sum (KTT E3). 8.1 là sub-info-only nên parent 8 chỉ tổng các sub khác
  //   (skip 8.1 — đã handle trong sumChildren). Mục 9/12/13/15/16 vẫn được tính từ
  //   các giá trị tổng hợp này ở PASS 2.
  const INPUT_PARENTS = new Set(['1', '2', '4', '6', '7', '8', '10', '11'])
  for (const r of rows) {
    if (r.kind !== 'fixed' || r.formula !== null) continue
    if (!INPUT_PARENTS.has(r.id)) continue
    const { sum, hasSub } = sumChildren(r.id)
    if (hasSub) map.set(r.id, { ...map.get(r.id)!, amount: round2(sum) })
    // không có sub → giữ giá trị user nhập (skip update)
  }

  // PASS 2: tính các formula rows
  for (const r of rows) {
    if (!r.formula) continue
    const [op, argStr] = r.formula.split(':')
    const args = argStr ? argStr.split(',') : []
    let val = 0
    switch (op) {
      case 'subtract': {                                  // a - b - c - ...
        val = rowAmount(args[0])
        for (let i = 1; i < args.length; i++) val -= rowAmount(args[i])
        break
      }
      case 'add': {
        val = args.reduce((s, x) => s + rowAmount(x), 0)
        break
      }
      case 'mul': {
        val = args.reduce((p, x) => p * rowAmount(x), 1)
        break
      }
      case 'sum_children': {
        // Legacy formula cho 6/7/8 (giờ đã chuyển sang PASS 1, formula vẫn giữ để
        // backward compat). Lấy lại tổng từ map đã update ở PASS 1.
        val = rowAmount(r.id)
        const { sum, hasSub } = sumChildren(args[0])
        if (hasSub) val = sum
        break
      }
      default: val = rowAmount(r.id)
    }
    map.set(r.id, { ...map.get(r.id)!, amount: round2(val) })
  }

  // Compute pct (tỷ trọng/DT) cho mọi row: amount / net_revenue (id=3) hoặc revenue (id=1) nếu net=0
  const netRev = map.get('3')?.amount || 0
  const refRev = netRev !== 0 ? netRev : (map.get('1')?.amount || 0)
  return rows.map((r) => {
    const updated = map.get(r.id)!
    return {
      ...updated,
      pct: refRev !== 0 ? round4(updated.amount / refRev) : null,
    }
  })
}

const round2 = (n: number) => Math.round(n * 100) / 100
const round4 = (n: number) => Math.round(n * 10000) / 10000

/** Tạo mẫu mới rỗng cho 1 công ty/dự án/năm */
export function newEmptyTemplate(): TaxPlanTemplate {
  return { template: 'kht_v1', rows: FIXED_TEMPLATE.map((r) => ({ ...r })) }
}

/** Sub row mới dưới parent 6/7/8 (không cho dưới 8.1) */
export function makeSubRow(parent: string, name: string, amount: number = 0): TemplateRow {
  return {
    id:     `${parent}.bs${Math.floor(Math.random() * 9000 + 1000)}`,   // bs = "bổ sung"
    code:   '',
    name,
    parent,
    amount,
    formula: null,
    kind:   'sub',
  }
}
