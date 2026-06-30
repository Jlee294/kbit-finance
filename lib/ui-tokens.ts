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
 * DIALOG (form nhập liệu) — 4 cỡ chuẩn, đã kèm sẵn thanh cuộn.
 * Truyền vào className của <DialogContent>. tailwind-merge sẽ
 * tự ghi đè width mặc định (sm:max-w-sm = 384px) của dialog.tsx.
 *
 * KTT (E6): đã NỚI rộng dialog để fields hiển thị thoáng — trước đây
 *           dialog quá hẹp, fields wrap dồn xuống không thấy hết.
 *
 *   S  ~560px   → form 2–3 trường (1 cột) — confirm, quick action
 *   M  ~896px   → form danh mục 2 cột, đối tác, kế hoạch
 *   L  ~1280px  → form đơn hàng/mua vào có bảng dòng hàng
 *   XL ~95vw    → grid lớn (KHT 16 chỉ tiêu, bảng kê nhiều cột)
 *
 * 'w-[calc(100vw-2rem)]' đảm bảo dialog dùng gần hết viewport ở mọi
 * breakpoint trước khi max-w cap lại — không bị stuck ở 384px nữa.
 * ───────────────────────────────────────────────────────────── */
// KTT H1+I1: dùng ! modifier để force override + full-width cho form lớn (LG/XL)
// Bỏ luôn sm:max-w-sm trong dialog.tsx (mig kèm) → các token này là 1 nguồn sự thật.
//
// LG + XL: KTT yêu cầu 'to ngang hết màn hình mà không phải kéo sang ngang'
//   → dùng calc(100vw - margin) cho cả w VÀ max-w để KHÔNG bị cap ở size cố định.
//   → dialog luôn fill viewport, không có khoảng thừa bên phải.
export const DIALOG_SM = '!w-[calc(100vw-2rem)] sm:!max-w-xl  max-h-[92vh] overflow-y-auto'
export const DIALOG_MD = '!w-[calc(100vw-2rem)] sm:!max-w-5xl max-h-[92vh] overflow-y-auto'
export const DIALOG_LG = '!w-[calc(100vw-2rem)] !max-w-[calc(100vw-2rem)] max-h-[92vh] overflow-y-auto'
export const DIALOG_XL = '!w-[calc(100vw-1rem)] !max-w-[calc(100vw-1rem)] max-h-[95vh] overflow-y-auto'

/** Map cỡ → class, dùng cho prop dialogSize */
export const DIALOG_SIZE = {
  sm: DIALOG_SM,
  md: DIALOG_MD,
  lg: DIALOG_LG,
  xl: DIALOG_XL,
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
export const LIST_WRAP  = 'overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm'
export const LIST_THEAD = 'bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-semibold uppercase tracking-wider font-montserrat'
export const LIST_ROW   = 'border-t border-slate-100 hover:bg-primary-50/60 transition-colors cursor-pointer'
