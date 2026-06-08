/**
 * UI Tokens — class names dùng chung cho layout consistency.
 *
 * Dùng:
 *   import { PAGE_WRAPPER, FORM_SPACING } from '@/lib/ui-tokens'
 *   <div className={PAGE_WRAPPER}>...</div>
 */

/** Wrapper page mặc định (mọi trang trong app/(app)/) */
export const PAGE_WRAPPER = 'space-y-6 p-6'

/** Wrapper page có max width (forms, detail pages) */
export const PAGE_WRAPPER_NARROW = 'space-y-6 p-6 max-w-6xl mx-auto'

/** Khoảng cách giữa các block trong form */
export const FORM_SPACING = 'space-y-5'

/** Khoảng cách giữa các field trong cùng group */
export const FIELD_GAP = 'space-y-1.5'

/** Cell padding thống nhất trong tables */
export const TABLE_CELL = 'px-3 py-2.5'

/** Cell padding compact (cho bảng dày như bảng kê) */
export const TABLE_CELL_COMPACT = 'px-2 py-1.5'

/** Card wrapper standard */
export const CARD = 'rounded-xl border border-gray-200 bg-white shadow-sm'

/* ─────────────────────────────────────────────────────────────
 * DIALOG (form nhập liệu) — 3 cỡ chuẩn, đã kèm sẵn thanh cuộn.
 * Truyền vào className của <DialogContent>. tailwind-merge sẽ
 * tự ghi đè width mặc định (sm:max-w-sm = 384px) của dialog.tsx.
 *   S ~480px   → form 2–3 trường (1 cột)
 *   M ~640px   → chủ đạo, form danh mục 2 cột
 *   L ~1024px  → form lớn có bảng dòng hàng (đủ chứa bảng min-w-[900px] + padding)
 * ───────────────────────────────────────────────────────────── */
export const DIALOG_SM = 'sm:max-w-md max-h-[90vh] overflow-y-auto'
export const DIALOG_MD = 'sm:max-w-2xl max-h-[90vh] overflow-y-auto'
export const DIALOG_LG = 'sm:max-w-5xl max-h-[90vh] overflow-y-auto'

/** Map cỡ → class, dùng cho prop dialogSize */
export const DIALOG_SIZE = {
  sm: DIALOG_SM,
  md: DIALOG_MD,
  lg: DIALOG_LG,
} as const

export type DialogSize = keyof typeof DIALOG_SIZE

/** Lưới trường chuẩn trong form: 1 cột mobile → 2 cột desktop */
export const FORM_GRID = 'grid grid-cols-1 sm:grid-cols-2 gap-4'

/** Trường dài (tên, ghi chú, định khoản, MST) chiếm cả hàng */
export const FORM_COL_FULL = 'sm:col-span-2'

/* ─────────────────────────────────────────────────────────────
 * BẢNG DANH SÁCH (list view) — token dùng chung để mọi trang
 * danh sách trông GIỐNG NHAU (viền, nền header, hover, kẻ dòng).
 * Áp: wrapper <div>=LIST_WRAP, <thead>=LIST_THEAD, <tr> dữ liệu=LIST_ROW.
 * th/td giữ padding 'px-4 py-3' để chiều cao hàng thống nhất.
 * ───────────────────────────────────────────────────────────── */
export const LIST_WRAP  = 'overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm'
export const LIST_THEAD = 'border-b border-brand-100 bg-brand-50/60 text-brand-800 text-xs font-semibold tracking-wide'
export const LIST_ROW   = 'border-t border-gray-100 hover:bg-brand-50/40 transition-colors cursor-pointer'
