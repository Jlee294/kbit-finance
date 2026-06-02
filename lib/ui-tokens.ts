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
