import type { LucideIcon } from 'lucide-react'
import {
  BarChart3, Wallet, ClipboardList, ClipboardCheck, Activity,
  ShoppingCart, Truck, Landmark, Files,
  Package, History,
  Lock, Paperclip, ListTodo, FileType, BookOpen,
  Calculator, CalendarClock,
  Building2, FolderKanban, Users, Barcode, CreditCard, Box, ArrowRightLeft, ShieldCheck,
  Boxes, TrendingUp, Warehouse,
} from 'lucide-react'
import type { UserRole } from '@/lib/auth'

export interface NavItem { href: string; label: string; icon: LucideIcon }
export interface NavGroup { label: string; items: NavItem[] }

export const navGroups: NavGroup[] = [
  { label: 'Tổng quan', items: [
    { href: '/bao-cao',         label: 'Báo cáo',         icon: BarChart3 },
    { href: '/cong-no',         label: 'Công nợ',         icon: Wallet },
    { href: '/bang-ke-ban-ra',  label: 'Bảng kê bán ra',  icon: ClipboardList },
    { href: '/bang-ke-mua-vao', label: 'Bảng kê mua vào', icon: ClipboardCheck },
    { href: '/rui-ro',          label: 'Sức khỏe',        icon: Activity },
    { href: '/bao-cao/lai-gop', label: 'Lãi gộp',         icon: TrendingUp },
  ]},
  { label: 'Giao dịch', items: [
    { href: '/don-hang',      label: 'Nhật ký bán ra',  icon: ShoppingCart },
    { href: '/nhap-khau',     label: 'Nhật ký mua vào', icon: Truck },
    { href: '/ngan-hang',     label: 'Ngân hàng',       icon: Landmark },
    { href: '/chung-tu-khac', label: 'Chứng từ khác',   icon: Files },
  ]},
  { label: 'Kho hàng', items: [
    { href: '/kho',              label: 'Tồn kho',      icon: Package },
    { href: '/kho/lich-su',      label: 'Lịch sử',      icon: History },
    { href: '/kho/so-du-dau-ky', label: 'Số dư đầu kỳ', icon: Boxes },
  ]},
  { label: 'Kế toán', items: [
    { href: '/duyet-khoa-ky',               label: 'Duyệt & Khóa kỳ',   icon: Lock },
    { href: '/chung-tu',                    label: 'Tài liệu đính kèm', icon: Paperclip },
    { href: '/cong-viec',                   label: 'Công việc',         icon: ListTodo },
    { href: '/danh-muc/loai-chung-tu',      label: 'Loại chứng từ',     icon: FileType },
    { href: '/danh-muc/thu-vien-nghiep-vu', label: 'Thư viện NV',       icon: BookOpen },
  ]},
  { label: 'Tài chính', items: [
    { href: '/ke-hoach-thue', label: 'Kế hoạch thuế', icon: Calculator },
    { href: '/lich-thue',     label: 'Lịch thuế',     icon: CalendarClock },
  ]},
  { label: 'Danh mục', items: [
    { href: '/danh-muc/cong-ty',             label: 'Công ty',      icon: Building2 },
    { href: '/danh-muc/du-an',               label: 'Dự án',        icon: FolderKanban },
    { href: '/danh-muc/doi-tac',             label: 'Đối tác',      icon: Users },
    { href: '/danh-muc/ma-hang',             label: 'Mã hàng',      icon: Barcode },
    { href: '/danh-muc/tai-khoan-ngan-hang', label: 'Tài khoản NH', icon: CreditCard },
    { href: '/danh-muc/san-pham',            label: 'Sản phẩm',     icon: Box },
    { href: '/danh-muc/kho',                 label: 'Kho',          icon: Warehouse },
    { href: '/danh-muc/ty-gia',              label: 'Tỷ giá',       icon: ArrowRightLeft },
    { href: '/danh-muc/phan-quyen-cong-ty',  label: 'Người dùng & Phân quyền', icon: ShieldCheck },
  ]},
]

/** Route nhạy cảm giá vốn — chỉ admin/ceo thấy trong menu. */
export const COST_ROUTES = new Set<string>(['/danh-muc/san-pham'])

/** Route chỉ admin thấy trong menu. */
export const ADMIN_ROUTES = new Set<string>(['/danh-muc/phan-quyen-cong-ty'])

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/')
}

export function canSeeItem(href: string, role: UserRole): boolean {
  // Quy tắc HIỂN THỊ menu cho route nhạy cảm giá vốn.
  // Phải giữ ĐỒNG BỘ với canViewCosts() trong lib/auth.ts (admin/ceo).
  // KHÔNG import canViewCosts ở đây: lib/auth kéo theo next/headers (server-only),
  // sẽ vỡ build khi Sidebar (client component) nạp file này.
  if (COST_ROUTES.has(href)) return role === 'admin' || role === 'ceo'
  if (ADMIN_ROUTES.has(href)) return role === 'admin'
  return true
}

export function filterItemsByRole(items: NavItem[], role: UserRole): NavItem[] {
  return items.filter((it) => canSeeItem(it.href, role))
}

export function activeGroupLabel(groups: NavGroup[], pathname: string): string | null {
  const g = groups.find((grp) => grp.items.some((it) => isActive(pathname, it.href)))
  return g ? g.label : null
}

/**
 * Nhóm nào đang mở:
 * - saved = trạng thái người dùng đã lưu (null nếu chưa từng lưu).
 * - activeLabel (nếu có) LUÔN được ép mở.
 * Lần đầu (saved=null): chỉ mở nhóm active → menu gọn.
 */
export function resolveOpenGroups(activeLabel: string | null, saved: string[] | null): Set<string> {
  const open = new Set<string>(saved ?? [])
  if (activeLabel) open.add(activeLabel)
  return open
}

/** Parse an toàn mảng string từ localStorage; rỗng/hỏng → null. */
export function parseSaved(raw: string | null): string[] | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null
  } catch {
    return null
  }
}
