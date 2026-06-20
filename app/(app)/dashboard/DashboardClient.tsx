'use client'

import {
  ResponsiveContainer, ComposedChart, AreaChart, BarChart,
  Bar, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, PieChart, Pie,
} from 'recharts'
import type { DashboardData } from '@/features/reports/dashboard'

// ── Format ───────────────────────────────────────────────────────────────────
function fmtVND(v: number) {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.round(v)) + ' ₫'
}
function fmtShort(v: number) {
  const a = Math.abs(v)
  if (a >= 1e9) return (v / 1e9).toFixed(a >= 1e10 ? 0 : 1) + ' tỷ'
  if (a >= 1e6) return (v / 1e6).toFixed(0) + ' tr'
  if (a >= 1e3) return (v / 1e3).toFixed(0) + 'k'
  return String(Math.round(v))
}

const BRAND = '#0f1038'
const C = {
  revenue: '#0f1038',
  purchase: '#f59e0b',
  profit: '#16a34a',
  cashIn: '#2563eb',
  cashOut: '#ef4444',
  net: '#0f1038',
}
const PIE = ['#0f1038', '#3b3d91', '#6366f1', '#f59e0b', '#16a34a', '#0ea5e9', '#ec4899', '#64748b', '#a855f7', '#14b8a6']

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-md text-xs">
      {label && <p className="font-semibold text-gray-700 mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="text-gray-500">{p.name}:</span>
          <span className="font-medium text-gray-800">{fmtVND(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-gray-200 bg-white shadow-sm p-4 ${className}`}>{children}</div>
}

function Kpi({ label, value, accent, hint }: { label: string; value: number; accent: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm px-4 py-3 flex flex-col gap-0.5 border-t-4" style={{ borderTopColor: accent }}>
      <p className="text-[11px] text-gray-500 font-medium tracking-wide">{label}</p>
      <p className="text-lg font-semibold text-gray-900">{fmtVND(value)}</p>
      {hint && <p className="text-[10px] text-gray-400">{hint}</p>}
    </div>
  )
}

export function DashboardClient({ data, projectName }: { data: DashboardData; projectName?: string }) {
  const { kpis, months, byProject, byCompany, topCustomers, topProducts } = data
  const maxCust = Math.max(1, ...topCustomers.map(c => c.revenue))

  return (
    <div className="space-y-5">
      {projectName && (
        <div className="rounded-lg bg-brand-50 border border-brand-100 px-4 py-2 text-sm text-brand-800">
          Đang lọc theo dự án: <b>{projectName}</b> — mọi số liệu &amp; biểu đồ bên dưới chỉ tính cho dự án này.
        </div>
      )}

      {/* ── KPI ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Doanh thu (bán ra)" value={kpis.revenue}     accent={C.revenue}  hint={`${kpis.salesCount} đơn`} />
        <Kpi label="Chi phí (mua vào)"  value={kpis.purchase}    accent={C.purchase} hint={`${kpis.purchaseCount} hóa đơn`} />
        <Kpi label="Lãi gộp (đã chốt giá vốn)" value={kpis.grossProfit} accent={C.profit} hint={`Giá vốn ${fmtShort(kpis.cogs)}`} />
        <Kpi label="Doanh thu chưa VAT" value={kpis.revenueNet}  accent="#6366f1" />
        <Kpi label="Tiền đã thu"        value={kpis.cashIn}      accent={C.cashIn} />
        <Kpi label="Tiền đã chi"        value={kpis.cashOut}     accent={C.cashOut} />
        <Kpi label="Dòng tiền ròng"     value={kpis.netCash}     accent={BRAND} />
        <Kpi label="Phải thu − Phải trả" value={kpis.ar - kpis.ap} accent="#0ea5e9" hint={`Thu ${fmtShort(kpis.ar)} · Trả ${fmtShort(kpis.ap)}`} />
      </div>

      {/* ── Doanh thu / Chi phí / Lãi gộp theo tháng ──────── */}
      <Card>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700">Doanh thu · Chi phí · Lãi gộp theo tháng</h3>
          <span className="text-[11px] text-gray-400">12 tháng trong năm</span>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={months} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={48} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="revenue"  name="Doanh thu"  fill={C.revenue}  radius={[3, 3, 0, 0]} maxBarSize={26} />
            <Bar dataKey="purchase" name="Chi phí mua" fill={C.purchase} radius={[3, 3, 0, 0]} maxBarSize={26} />
            <Line dataKey="grossProfit" name="Lãi gộp" stroke={C.profit} strokeWidth={2.5} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      {/* ── Dòng tiền theo tháng ──────────────────────────── */}
      <Card>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Dòng tiền theo tháng (thực thu / thực chi)</h3>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={months} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={C.cashIn} stopOpacity={0.3} /><stop offset="95%" stopColor={C.cashIn} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={C.cashOut} stopOpacity={0.3} /><stop offset="95%" stopColor={C.cashOut} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={48} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area dataKey="cashIn"  name="Tiền thu" stroke={C.cashIn}  fill="url(#gIn)"  strokeWidth={2} />
            <Area dataKey="cashOut" name="Tiền chi" stroke={C.cashOut} fill="url(#gOut)" strokeWidth={2} />
            <Line dataKey="netCash" name="Dòng tiền ròng" stroke={BRAND} strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* ── Cơ cấu theo dự án + công ty ───────────────────── */}
      <div className="grid lg:grid-cols-2 gap-4">
        <DonutCard title="Cơ cấu doanh thu theo dự án" rows={byProject} empty="Chưa gán dự án cho đơn nào trong kỳ" />
        <DonutCard title="Cơ cấu doanh thu theo công ty" rows={byCompany} empty="Không có dữ liệu" />
      </div>

      {/* ── Top khách hàng + sản phẩm ─────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Top khách hàng (doanh thu)</h3>
          {topCustomers.length === 0 ? <Empty text="Không có dữ liệu" /> : (
            <div className="space-y-2">
              {topCustomers.map((c, i) => (
                <div key={c.id} className="flex items-center gap-2 text-xs">
                  <span className="w-5 text-gray-400 text-right">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between gap-2">
                      <span className="truncate text-gray-800">{c.name}</span>
                      <span className="font-medium text-gray-900 shrink-0">{fmtShort(c.revenue)}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(c.revenue / maxCust) * 100}%`, background: PIE[i % PIE.length] }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Top sản phẩm bán chạy</h3>
          {topProducts.length === 0 ? <Empty text="Không có dữ liệu" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-gray-500 border-b border-gray-100">
                  <tr>
                    <th className="text-left py-1.5 font-medium">Mã</th>
                    <th className="text-left py-1.5 font-medium">Tên hàng</th>
                    <th className="text-right py-1.5 font-medium">SL</th>
                    <th className="text-right py-1.5 font-medium">Doanh thu</th>
                    <th className="text-right py-1.5 font-medium">Lãi gộp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {topProducts.map(p => (
                    <tr key={p.id}>
                      <td className="py-1.5 font-mono text-gray-700">{p.code}</td>
                      <td className="py-1.5 text-gray-800 max-w-[160px] truncate" title={p.name}>{p.name}</td>
                      <td className="py-1.5 text-right text-gray-600">{(p.qty ?? 0).toLocaleString('vi-VN')}</td>
                      <td className="py-1.5 text-right text-gray-900">{fmtShort(p.revenue)}</td>
                      <td className={`py-1.5 text-right font-medium ${p.profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmtShort(p.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* ── Bảng chi tiết theo dự án ──────────────────────── */}
      {byProject.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Hiệu quả theo dự án</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-brand-100 bg-brand-50/60 text-brand-800 text-xs font-semibold tracking-wide">
                <tr>
                  <th className="px-3 py-2 text-left">Dự án</th>
                  <th className="px-3 py-2 text-right">Doanh thu</th>
                  <th className="px-3 py-2 text-right">Lãi gộp</th>
                  <th className="px-3 py-2 text-right">Biên LG</th>
                  <th className="px-3 py-2 text-right">% Doanh thu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {byProject.map(r => (
                  <tr key={r.id} className="hover:bg-brand-50/40">
                    <td className="px-3 py-2 text-gray-800">{r.name}</td>
                    <td className="px-3 py-2 text-right text-gray-900">{fmtVND(r.revenue)}</td>
                    <td className={`px-3 py-2 text-right font-medium ${r.profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmtVND(r.profit)}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{r.revenue > 0 ? Math.round(r.profit / r.revenue * 1000) / 10 : 0}%</td>
                    <td className="px-3 py-2 text-right text-gray-600">{r.share}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="text-center text-sm text-gray-400 py-8">{text}</p>
}

function DonutCard({ title, rows, empty }: { title: string; rows: { id: string; name: string; revenue: number; share: number }[]; empty: string }) {
  const data = rows.filter(r => r.revenue > 0).slice(0, 10)
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">{title}</h3>
      {data.length === 0 ? <Empty text={empty} /> : (
        <div className="flex items-center gap-3">
          <ResponsiveContainer width="50%" height={200}>
            <PieChart>
              <Pie data={data} dataKey="revenue" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={2}>
                {data.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <ul className="flex-1 space-y-1.5 text-xs min-w-0">
            {data.map((r, i) => (
              <li key={r.id} className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: PIE[i % PIE.length] }} />
                <span className="truncate text-gray-700 flex-1">{r.name}</span>
                <span className="text-gray-400 shrink-0">{r.share}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
