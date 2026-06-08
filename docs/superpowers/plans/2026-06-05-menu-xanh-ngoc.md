# Menu Xanh Ngọc + Đổi thương hiệu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đổi toàn app từ navy sang xanh ngọc (emerald) và viết lại sidebar menu thành: icon mỗi mục + nhóm gập/mở được + active có vạch trái.

**Architecture:** Đổi màu tại gốc (`globals.css` brand scale) để cả app ăn theo. Tách dữ liệu + logic menu ra `lib/nav.ts` (pure, test bằng vitest node). `Sidebar.tsx` chỉ ráp UI: client component dùng `useState`/`useEffect`, nhớ nhóm mở qua `localStorage`, đọc localStorage **chỉ sau mount** để tránh hydration mismatch.

**Tech Stack:** Next.js 16.2.6 (App Router), React 19, Tailwind v4 (`@theme` trong globals.css), lucide-react 1.17.0 (named imports, đã xác minh đủ 31 icon), vitest (environment `node`, KHÔNG có RTL → chỉ test logic thuần).

**Spec:** `docs/superpowers/specs/2026-06-05-menu-xanh-ngoc-design.md`

**Commit policy:** Anh Thịnh chưa yêu cầu commit. KHÔNG tự commit/push. Các bước "Commit" bên dưới chỉ chạy khi anh đồng ý; nếu commit thì tạo nhánh trước (đang ở `main`).

---

## File Structure

| File | Trách nhiệm | Thao tác |
|---|---|---|
| `app/globals.css` | Token màu gốc (brand scale, primary, ring, success) | Modify |
| `lib/nav.ts` | Dữ liệu menu (group/item/icon) + hàm thuần (active, quyền, open-state) | **Create** |
| `lib/nav.test.ts` | Test logic menu + regression quyền | **Create** |
| `app/(app)/Sidebar.tsx` | UI menu: icon + collapse + active vạch trái | Rewrite |
| `app/(app)/layout.tsx` | Logo gradient xanh ngọc | Modify (chỉ khối logo) |

---

## Task 1: Đổi token màu gốc → xanh ngọc (`app/globals.css`)

**Files:** Modify `app/globals.css`
**Lưu ý:** Không có test tự động cho CSS. Verify bằng build (Task 5) + mắt. Đây là thay đổi cô lập (chỉ giá trị màu), app vẫn chạy sau task này.

- [ ] **Step 1: Đổi thang `--color-brand-*`** (block `@theme`, hiện dòng 14–24). Thay nguyên 11 dòng:

```css
  --color-brand-50:  #ecfdf5;
  --color-brand-100: #d1fae5;
  --color-brand-200: #a7f3d0;
  --color-brand-300: #6ee7b7;
  --color-brand-400: #34d399;
  --color-brand-500: #10b981;
  --color-brand-600: #059669;  /* ★ Brand chính (xanh ngọc) */
  --color-brand-700: #047857;
  --color-brand-800: #065f46;
  --color-brand-900: #064e3b;
  --color-brand-950: #022c22;
```

- [ ] **Step 2: Cập nhật comment đầu block** (dòng 8–11) cho khỏi sai lệch: đổi mô tả `Brand: #201b51 (Navy KBIT)` → `Brand: #059669 (Xanh ngọc / Emerald KBIT)` và `quanh brand-800` → `quanh brand-600`.

- [ ] **Step 3: Tách `success` khỏi brand** (block `@theme`, dòng 27–29) — đổi sang green ngả vàng để phân biệt với brand emerald:

```css
  --color-success-50:  #f0fdf4;
  --color-success-500: #22c55e;
  --color-success-700: #15803d;
```

(`warning`/`danger`/`info` giữ nguyên.)

- [ ] **Step 4: Đổi `--primary` và `--ring` trong `:root`** (dòng 96 và 107). Đổi cả comment dòng 95:

```css
  /* Primary = KBIT brand xanh ngọc #059669 */
  --primary: #059669;
```
và
```css
  --ring: #059669;
```

(`.dark` KHÔNG đụng — ngoài phạm vi.)

- [ ] **Step 5: Verify nhanh** — `npx tsc --noEmit` không bắt buộc cho CSS; chỉ cần file lưu đúng. Kiểm mắt: không còn `#201b51` nào sót trong `globals.css`.

Run: `grep -n "201b51" app/globals.css`
Expected: không có dòng nào trả về.

---

## Task 2: Tách dữ liệu + logic menu (`lib/nav.ts`) — TDD

**Files:**
- Create: `lib/nav.ts`
- Test: `lib/nav.test.ts`

- [ ] **Step 1: Viết test trước** — tạo `lib/nav.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  isActive, canSeeItem, filterItemsByRole,
  activeGroupLabel, resolveOpenGroups, parseSaved, navGroups,
} from './nav'

describe('isActive', () => {
  it('khớp đúng route', () => expect(isActive('/kho', '/kho')).toBe(true))
  it('khớp route con', () => expect(isActive('/kho/nhap', '/kho')).toBe(true))
  it('KHÔNG khớp nhầm tiền tố', () => expect(isActive('/khoa', '/kho')).toBe(false))
  it('route khác hẳn', () => expect(isActive('/bao-cao', '/kho')).toBe(false))
})

describe('canSeeItem — quyền COST_ROUTES (Sản phẩm)', () => {
  it('admin xem được', () => expect(canSeeItem('/danh-muc/san-pham', 'admin')).toBe(true))
  it('ceo xem được', () => expect(canSeeItem('/danh-muc/san-pham', 'ceo')).toBe(true))
  it('chief_accountant KHÔNG xem', () => expect(canSeeItem('/danh-muc/san-pham', 'chief_accountant')).toBe(false))
  it('accountant KHÔNG xem', () => expect(canSeeItem('/danh-muc/san-pham', 'accountant')).toBe(false))
  it('route thường: ai cũng xem', () => expect(canSeeItem('/bao-cao', 'viewer')).toBe(true))
})

describe('filterItemsByRole — regression: ẩn Sản phẩm', () => {
  const danhMuc = navGroups.find((g) => g.label === 'Danh mục')!.items
  it('accountant không thấy Sản phẩm', () =>
    expect(filterItemsByRole(danhMuc, 'accountant').map((i) => i.href)).not.toContain('/danh-muc/san-pham'))
  it('admin thấy Sản phẩm', () =>
    expect(filterItemsByRole(danhMuc, 'admin').map((i) => i.href)).toContain('/danh-muc/san-pham'))
})

describe('activeGroupLabel', () => {
  it('trả nhóm chứa route active', () => expect(activeGroupLabel(navGroups, '/kho/nhap')).toBe('Kho hàng'))
  it('null khi không khớp', () => expect(activeGroupLabel(navGroups, '/khong-co')).toBe(null))
})

describe('resolveOpenGroups', () => {
  it('lần đầu (saved=null) → chỉ mở nhóm active', () =>
    expect([...resolveOpenGroups('Tổng quan', null)]).toEqual(['Tổng quan']))
  it('có saved → gộp saved và ép mở active', () => {
    const r = resolveOpenGroups('Tổng quan', ['Danh mục'])
    expect(r.has('Danh mục')).toBe(true)
    expect(r.has('Tổng quan')).toBe(true)
  })
  it('không có active → dùng đúng saved', () =>
    expect([...resolveOpenGroups(null, ['Kho hàng'])]).toEqual(['Kho hàng']))
  it('active luôn ép mở dù saved bỏ nó', () =>
    expect(resolveOpenGroups('Kho hàng', []).has('Kho hàng')).toBe(true))
})

describe('parseSaved', () => {
  it('null khi rỗng', () => expect(parseSaved(null)).toBe(null))
  it('parse mảng string', () => expect(parseSaved('["A","B"]')).toEqual(['A', 'B']))
  it('null khi JSON hỏng', () => expect(parseSaved('{hỏng')).toBe(null))
  it('lọc phần tử không phải string', () => expect(parseSaved('["A",1,null]')).toEqual(['A']))
})
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `npx vitest run lib/nav.test.ts`
Expected: FAIL — không tìm thấy module `./nav` / các export chưa tồn tại.

- [ ] **Step 3: Tạo `lib/nav.ts`** (dữ liệu + hàm thuần). Icon đã xác minh tồn tại trong lucide-react 1.17.0:

```ts
import type { LucideIcon } from 'lucide-react'
import {
  BarChart3, Wallet, ClipboardList, ClipboardCheck, Activity,
  ShoppingCart, Truck, Landmark, Files,
  Package, PackagePlus, PackageMinus, ArrowLeftRight, History,
  Lock, Paperclip, ListTodo, CalendarRange, FileType, BookOpen,
  Calculator, CalendarClock,
  Building2, FolderKanban, Users, Barcode, Factory, CreditCard, Box, ArrowRightLeft,
} from 'lucide-react'
import { canViewCosts, type UserRole } from '@/lib/auth'

export interface NavItem { href: string; label: string; icon: LucideIcon }
export interface NavGroup { label: string; items: NavItem[] }

export const navGroups: NavGroup[] = [
  { label: 'Tổng quan', items: [
    { href: '/bao-cao',         label: 'Báo cáo',         icon: BarChart3 },
    { href: '/cong-no',         label: 'Công nợ',         icon: Wallet },
    { href: '/bang-ke-ban-ra',  label: 'Bảng kê bán ra',  icon: ClipboardList },
    { href: '/bang-ke-mua-vao', label: 'Bảng kê mua vào', icon: ClipboardCheck },
    { href: '/rui-ro',          label: 'Sức khỏe',        icon: Activity },
  ]},
  { label: 'Giao dịch', items: [
    { href: '/don-hang',      label: 'Nhật ký bán ra',  icon: ShoppingCart },
    { href: '/nhap-khau',     label: 'Nhật ký mua vào', icon: Truck },
    { href: '/ngan-hang',     label: 'Ngân hàng',       icon: Landmark },
    { href: '/chung-tu-khac', label: 'Chứng từ khác',   icon: Files },
  ]},
  { label: 'Kho hàng', items: [
    { href: '/kho',             label: 'Tồn kho',     icon: Package },
    { href: '/kho/nhap',        label: 'Nhập kho',    icon: PackagePlus },
    { href: '/kho/xuat',        label: 'Xuất kho',    icon: PackageMinus },
    { href: '/kho/luan-chuyen', label: 'Luân chuyển', icon: ArrowLeftRight },
    { href: '/kho/lich-su',     label: 'Lịch sử',     icon: History },
  ]},
  { label: 'Kế toán', items: [
    { href: '/duyet-khoa-ky',               label: 'Duyệt & Khóa kỳ',   icon: Lock },
    { href: '/chung-tu',                    label: 'Tài liệu đính kèm', icon: Paperclip },
    { href: '/cong-viec',                   label: 'Công việc',         icon: ListTodo },
    { href: '/danh-muc/ky-ke-toan',         label: 'Kỳ kế toán',        icon: CalendarRange },
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
    { href: '/danh-muc/khach-hang',          label: 'Khách hàng',   icon: Users },
    { href: '/danh-muc/ma-hang',             label: 'Mã hàng',      icon: Barcode },
    { href: '/danh-muc/nha-cung-cap',        label: 'Nhà cung cấp', icon: Factory },
    { href: '/danh-muc/tai-khoan-ngan-hang', label: 'Tài khoản NH', icon: CreditCard },
    { href: '/danh-muc/san-pham',            label: 'Sản phẩm',     icon: Box },
    { href: '/danh-muc/ty-gia',              label: 'Tỷ giá',       icon: ArrowRightLeft },
  ]},
]

/** Route nhạy cảm giá vốn — chỉ admin/ceo (tái dùng canViewCosts của lib/auth). */
export const COST_ROUTES = new Set<string>(['/danh-muc/san-pham'])

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/')
}

export function canSeeItem(href: string, role: UserRole): boolean {
  if (COST_ROUTES.has(href)) return canViewCosts(role)
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
 * - saved = trạng thái người dùng lưu (null nếu chưa từng lưu).
 * - activeLabel (nếu có) LUÔN được ép mở.
 * Lần đầu (saved=null): chỉ mở nhóm active → menu gọn.
 */
export function resolveOpenGroups(activeLabel: string | null, saved: string[] | null): Set<string> {
  const open = new Set<string>(saved ?? [])
  if (activeLabel) open.add(activeLabel)
  return open
}

/** Parse an toàn mảng string từ localStorage; lỗi/hỏng → null. */
export function parseSaved(raw: string | null): string[] | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `npx vitest run lib/nav.test.ts`
Expected: PASS — tất cả describe xanh.

- [ ] **Step 5: (Chờ anh đồng ý) Commit** — `git add lib/nav.ts lib/nav.test.ts && git commit -m "feat(nav): tách dữ liệu + logic menu ra lib/nav, có test"`

---

## Task 3: Viết lại `Sidebar.tsx` — icon + collapse + active vạch trái

**Files:** Rewrite `app/(app)/Sidebar.tsx`
**Lưu ý:** Không test render (thiếu RTL). Logic đã test ở Task 2. Verify UI bằng build + chạy thật (Task 5). Hydration: `useState` khởi tạo KHÔNG đọc localStorage; chỉ đọc trong `useEffect` sau mount.

- [ ] **Step 1: Thay toàn bộ nội dung file** bằng:

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { UserRole } from '@/lib/auth'
import {
  navGroups, isActive, filterItemsByRole, activeGroupLabel,
  resolveOpenGroups, parseSaved,
} from '@/lib/nav'

const STORAGE_KEY = 'kbit:nav:openGroups'

export function Sidebar({ role }: { role: UserRole }) {
  const pathname = usePathname()
  const activeLabel = activeGroupLabel(navGroups, pathname)

  // Khởi tạo KHÔNG đọc localStorage → server & client render đầu giống nhau (tránh hydration mismatch).
  const [open, setOpen] = useState<Set<string>>(() => resolveOpenGroups(activeLabel, null))

  // Sau mount (và mỗi khi đổi nhóm active): nạp trạng thái đã lưu + ép mở nhóm active.
  useEffect(() => {
    const saved = parseSaved(localStorage.getItem(STORAGE_KEY))
    setOpen(resolveOpenGroups(activeLabel, saved))
  }, [activeLabel])

  function toggleGroup(label: string) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...next])) } catch {}
      return next
    })
  }

  return (
    <nav className="flex flex-col gap-0.5 px-3 py-4 flex-1 overflow-y-auto">
      {navGroups.map((group) => {
        const items = filterItemsByRole(group.items, role)
        if (items.length === 0) return null
        const isOpen = open.has(group.label)

        return (
          <div key={group.label}>
            <button
              type="button"
              onClick={() => toggleGroup(group.label)}
              className={`w-full flex items-center justify-between px-3 mt-3 mb-1 text-[11px] font-bold uppercase tracking-widest transition-colors
                ${isOpen ? 'text-brand-600' : 'text-gray-400 hover:text-brand-600'}`}
            >
              <span>{group.label}</span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`}
                strokeWidth={2.2}
              />
            </button>

            {isOpen && (
              <ul className="space-y-0.5">
                {items.map(({ href, label, icon: Icon }) => {
                  const active = isActive(pathname, href)
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        className={`group relative flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] transition-colors
                          ${active
                            ? 'bg-brand-50 text-brand-700 font-semibold'
                            : 'text-gray-700 hover:bg-brand-50/60 hover:text-brand-700'
                          }`}
                      >
                        {active && (
                          <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-brand-600" />
                        )}
                        <Icon
                          className={`h-4 w-4 shrink-0 ${active ? 'text-brand-600' : 'text-gray-400 group-hover:text-brand-600'}`}
                          strokeWidth={1.75}
                        />
                        <span>{label}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 2: Verify type + lint**

Run: `npx tsc --noEmit`
Expected: không lỗi liên quan `Sidebar.tsx` / `lib/nav.ts`.

- [ ] **Step 3: (Chờ anh đồng ý) Commit** — `git add "app/(app)/Sidebar.tsx" && git commit -m "feat(nav): menu icon + nhóm gập/mở + active vạch trái"`

---

## Task 4: Logo gradient xanh ngọc (`app/(app)/layout.tsx`)

**Files:** Modify `app/(app)/layout.tsx` (chỉ khối logo, dòng 33–41)

- [ ] **Step 1: Đổi khối logo.** Thay:

```tsx
        <div className="px-5 py-4 border-b border-gray-100 bg-brand-800 flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-white/10 flex items-center justify-center font-bold text-white text-xs">
            K
          </div>
```

thành:

```tsx
        <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-br from-brand-600 to-brand-500 flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-white/15 flex items-center justify-center font-bold text-white text-xs">
            K
          </div>
```

(Chỉ đổi `bg-brand-800` → `bg-gradient-to-br from-brand-600 to-brand-500` và `bg-white/10` → `bg-white/15`. Phần chữ "KBIT"/"Finance" giữ nguyên.)

- [ ] **Step 2: Verify** — `npx tsc --noEmit` không lỗi.

- [ ] **Step 3: (Chờ anh đồng ý) Commit** — `git add "app/(app)/layout.tsx" && git commit -m "style(nav): logo gradient xanh ngọc"`

---

## Task 5: Verification tổng (bằng chứng trước khi báo xong)

**Không báo "xong" nếu chưa chạy đủ các lệnh dưới và đọc kết quả thật.**

- [ ] **Step 1: Test logic xanh**

Run: `npx vitest run lib/nav.test.ts`
Expected: PASS toàn bộ.

- [ ] **Step 2: Build sạch**

Run: `npm run build`
Expected: exit 0, không lỗi type/hydration/lint.

- [ ] **Step 3: Chạy thật + xem mắt** (dev server)

Run: `npm run dev` (chạy nền), mở `http://localhost:3000`, đăng nhập.
Checklist quan sát:
- [ ] Menu tông xanh ngọc; tiêu đề nhóm đang mở màu xanh, nhóm đóng màu xám.
- [ ] Mỗi mục có icon đúng nghĩa; icon mảnh.
- [ ] Bấm tiêu đề nhóm → gập/mở; chevron xoay.
- [ ] Nhóm chứa trang đang xem **tự mở**; mục active có **nền xanh nhạt + vạch xanh trái + icon xanh**.
- [ ] Reload trang khác nhóm → nhóm đã mở trước đó vẫn nhớ; nhóm active mới tự mở.
- [ ] Phần thân: nút bấm, viền nhấn thẻ số liệu, link đều xanh ngọc; badge "đạt"/thành công vẫn xanh (hơi khác brand).
- [ ] Không có cảnh báo hydration trong console trình duyệt.

- [ ] **Step 4: Mời Anh Thịnh duyệt trên app thật.** Nếu cần chỉnh sắc/độ đậm/spacing → quay lại task tương ứng.

---

## Self-review (đã rà soát plan ↔ spec)
- Spec B1 (màu) → Task 1 ✓ · B2 (logo) → Task 4 ✓ · B3 (menu icon/collapse/active) → Task 2+3 ✓ · B4 (test) → Task 2 ✓ · B5 (verify) → Task 5 ✓.
- Không placeholder: mọi step có code/lệnh/kết quả mong đợi cụ thể.
- Nhất quán tên hàm: `isActive`, `canSeeItem`, `filterItemsByRole`, `activeGroupLabel`, `resolveOpenGroups`, `parseSaved` — trùng khớp giữa `nav.ts`, test, và `Sidebar.tsx`.
- Quyết định chốt: lần đầu chỉ mở nhóm active (gọn); nhóm active luôn ép mở; toggle lưu localStorage.
```
