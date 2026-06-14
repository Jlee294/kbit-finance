import OpenAI from 'openai'
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, canEdit, canViewCosts } from '@/lib/auth'
import { SCHEMA_DOC } from './schema-doc'

const NINE_API_KEY = process.env.NINE_ROUTER_API_KEY
const NINE_BASE_URL = process.env.NINE_ROUTER_BASE_URL

function getOpenAIClient() {
  if (!NINE_API_KEY || !NINE_BASE_URL) {
    throw new Error('NINE_ROUTER_API_KEY and NINE_ROUTER_BASE_URL must be configured')
  }
  return new OpenAI({ apiKey: NINE_API_KEY, baseURL: NINE_BASE_URL })
}

const WRITE_TOOLS = new Set(['create_customer', 'create_task'])

const MODEL = process.env.NINE_ROUTER_MODEL ?? 'Chatbot'

// ─── Tool definitions (OpenAI format) ────────────────────────────────────────

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'list_companies',
      description: 'Lấy danh sách công ty / pháp nhân trong hệ thống',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_customers',
      description: 'Lấy danh sách khách hàng, có thể tìm kiếm theo tên hoặc mã',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Từ khóa tìm kiếm (tên hoặc mã)' },
          limit: { type: 'number', description: 'Số lượng tối đa (mặc định 20)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_suppliers',
      description: 'Lấy danh sách nhà cung cấp',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Từ khóa tìm kiếm' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_transactions',
      description: 'Lấy danh sách giao dịch thu tiền hoặc chi phí',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['income', 'expense'], description: 'income = thu tiền, expense = chi phí' },
          status: { type: 'string', enum: ['draft', 'confirmed', 'approved', 'void'] },
          limit: { type: 'number', description: 'Số lượng (mặc định 10)' },
        },
        required: ['type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_summary_stats',
      description: 'Thống kê tổng hợp: tổng thu, tổng chi, số giao dịch',
      parameters: {
        type: 'object',
        properties: {
          year: { type: 'number', description: 'Năm (mặc định năm hiện tại)' },
          month: { type: 'number', description: 'Tháng 1-12 (bỏ trống = cả năm)' },
          company_code: { type: 'string', description: 'Mã công ty (bỏ trống = tất cả)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_tasks',
      description: 'Lấy danh sách công việc',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['open', 'in_progress', 'done', 'overdue'] },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_projects',
      description: 'Lấy danh sách dự án',
      parameters: {
        type: 'object',
        properties: {
          company_code: { type: 'string', description: 'Mã công ty để lọc' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_customer',
      description: 'Thêm khách hàng mới vào hệ thống',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Mã khách hàng (duy nhất)' },
          name: { type: 'string', description: 'Tên khách hàng' },
          phone: { type: 'string', description: 'Số điện thoại (tùy chọn)' },
          note: { type: 'string', description: 'Ghi chú (tùy chọn)' },
        },
        required: ['code', 'name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: 'Tạo công việc mới',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Tiêu đề công việc' },
          due_date: { type: 'string', description: 'Hạn hoàn thành (YYYY-MM-DD)' },
          note: { type: 'string', description: 'Ghi chú' },
        },
        required: ['title'],
      },
    },
  },
  // KTT G: query HSD — hàng tồn kho + hàng đã bán
  {
    type: 'function',
    function: {
      name: 'list_expiring_stock',
      description: 'Liệt kê các lô hàng đang tồn kho có HSD (hạn sử dụng) sắp hết. Trả về sản phẩm + số lô + HSD + số lượng tồn + kho. Dùng cho câu hỏi "sản phẩm/lô nào sắp hết HSD trong N ngày/tháng/năm".',
      parameters: {
        type: 'object',
        properties: {
          within_days: { type: 'number', description: 'Số ngày tính từ hôm nay (mặc định 365 = 1 năm). VD: 90 = 3 tháng, 30 = 1 tháng.' },
          include_expired: { type: 'boolean', description: 'true = bao gồm lô đã hết HSD (mặc định false — chỉ chưa hết)' },
          limit: { type: 'number', description: 'Số dòng trả về tối đa (mặc định 50)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_expiring_sold',
      description: 'Liệt kê các dòng đã bán cho khách có HSD sắp hết (theo customer_order_items.expiry_date). Hữu ích khi tra cứu trách nhiệm bảo hành/đổi trả gần hết HSD.',
      parameters: {
        type: 'object',
        properties: {
          within_days: { type: 'number', description: 'Số ngày tính từ hôm nay (mặc định 365)' },
          limit: { type: 'number', description: 'Số dòng trả về tối đa (mặc định 50)' },
        },
      },
    },
  },
  // KTT Cách B: query toàn bộ DB bằng SELECT — lưới đỡ cho mọi câu hỏi chưa có tool riêng
  {
    type: 'function',
    function: {
      name: 'query_database',
      description:
        'Chạy 1 câu SQL SELECT read-only trên database để trả lời câu hỏi về dữ liệu hệ thống ' +
        '(đơn hàng, tồn kho, công nợ, doanh thu, lịch thuế, hóa đơn, dòng tiền...). ' +
        'CHỈ dùng khi KHÔNG có tool chuyên dụng phù hợp. Viết SQL theo đúng SCHEMA trong system prompt — ' +
        'tuân thủ QUY ƯỚC NGHIỆP VỤ (lọc status, quy đổi tỷ giá). Max 200 dòng, timeout 5s. ' +
        'Chỉ SELECT — mọi lệnh ghi sẽ bị từ chối.',
      parameters: {
        type: 'object',
        properties: {
          sql: {
            type: 'string',
            description: 'Câu SELECT duy nhất (không chấm phẩy, không comment). Luôn đặt LIMIT. Alias cột bằng tiếng Việt không dấu nếu giúp dễ đọc.',
          },
          purpose: {
            type: 'string',
            description: 'Mô tả ngắn 1 câu: query này trả lời ý gì của người dùng',
          },
        },
        required: ['sql'],
      },
    },
  },
]

// ─── Tool execution ───────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string> {
  try {
    switch (name) {
      case 'list_companies': {
        const { data, error } = await supabase
          .from('companies').select('code, name, country, base_currency, is_active').order('code')
        if (error) return `Lỗi: ${error.message}`
        return data?.length ? JSON.stringify(data) : 'Không có công ty nào.'
      }

      case 'list_customers': {
        const { search, limit = 20 } = args as { search?: string; limit?: number }
        let q = supabase.from('customers').select('code, name, phone, note, is_active').order('name').limit(limit)
        if (search) q = q.or(`name.ilike.%${search}%,code.ilike.%${search}%`)
        const { data, error } = await q
        if (error) return `Lỗi: ${error.message}`
        return data?.length ? JSON.stringify(data) : 'Không có khách hàng.'
      }

      case 'list_suppliers': {
        const { search } = args as { search?: string }
        let q = supabase.from('suppliers').select('code, name, note, is_active').order('name').limit(20)
        if (search) q = q.or(`name.ilike.%${search}%,code.ilike.%${search}%`)
        const { data, error } = await q
        if (error) return `Lỗi: ${error.message}`
        return data?.length ? JSON.stringify(data) : 'Không có nhà cung cấp.'
      }

      case 'list_transactions': {
        const { type, status, limit = 10 } = args as { type: 'income' | 'expense'; status?: string; limit?: number }
        const table = type === 'income' ? 'income_transactions' : 'expense_transactions'
        let q = supabase.from(table)
          .select('txn_date, amount, currency, status, note, companies!company_id(code, name)')
          .order('txn_date', { ascending: false }).limit(limit)
        if (status) q = q.eq('status', status)
        const { data, error } = await q
        if (error) return `Lỗi: ${error.message}`
        return data?.length ? JSON.stringify(data) : `Không có giao dịch ${type === 'income' ? 'thu' : 'chi'}.`
      }

      case 'get_summary_stats': {
        const { year = new Date().getFullYear(), month, company_code } = args as {
          year?: number; month?: number; company_code?: string
        }
        const from = month ? `${year}-${String(month).padStart(2, '0')}-01` : `${year}-01-01`
        const to = month ? new Date(year, month, 0).toISOString().split('T')[0] : `${year}-12-31`

        let companyId: string | undefined
        if (company_code) {
          const { data: co } = await supabase.from('companies').select('id').eq('code', company_code).single()
          companyId = co?.id
        }

        let incQ = supabase.from('income_transactions')
          .select('amount_vnd, amount, status').gte('txn_date', from).lte('txn_date', to).neq('status', 'void')
        if (companyId) incQ = incQ.eq('company_id', companyId)
        const { data: incomes } = await incQ

        let expQ = supabase.from('expense_transactions')
          .select('amount, status').gte('txn_date', from).lte('txn_date', to).neq('status', 'void')
        if (companyId) expQ = expQ.eq('company_id', companyId)
        const { data: expenses } = await expQ

        const { count: openTasks } = await supabase
          .from('tasks').select('*', { count: 'exact', head: true }).in('status', ['open', 'in_progress'])

        const totalIncome = (incomes ?? []).reduce((s, r) => s + (r.amount_vnd ?? r.amount ?? 0), 0)
        const totalExpense = (expenses ?? []).reduce((s, r) => s + (r.amount ?? 0), 0)

        return JSON.stringify({
          period: month ? `${month}/${year}` : `Năm ${year}`,
          company: company_code ?? 'Tất cả',
          total_income_vnd: totalIncome,
          total_expense_vnd: totalExpense,
          net_vnd: totalIncome - totalExpense,
          income_transactions: incomes?.length ?? 0,
          expense_transactions: expenses?.length ?? 0,
          open_tasks: openTasks ?? 0,
        })
      }

      case 'list_tasks': {
        const { status } = args as { status?: string }
        let q = supabase.from('tasks')
          .select('title, status, due_date, note').order('created_at', { ascending: false }).limit(20)
        if (status) q = q.eq('status', status)
        const { data, error } = await q
        if (error) return `Lỗi: ${error.message}`
        return data?.length ? JSON.stringify(data) : 'Không có công việc nào.'
      }

      case 'list_projects': {
        const { company_code } = args as { company_code?: string }
        let q = supabase.from('projects')
          .select('code, name, is_active, companies!company_id(code, name)').order('code')
        if (company_code) {
          const { data: co } = await supabase.from('companies').select('id').eq('code', company_code).single()
          if (co) q = q.eq('company_id', co.id)
        }
        const { data, error } = await q
        if (error) return `Lỗi: ${error.message}`
        return data?.length ? JSON.stringify(data) : 'Không có dự án nào.'
      }

      case 'create_customer': {
        const { code, name, phone, note } = args as { code: string; name: string; phone?: string; note?: string }
        const { error } = await supabase.from('customers').insert({ code, name, phone, note })
        if (error) return error.code === '23505' ? `Mã "${code}" đã tồn tại.` : `Lỗi: ${error.message}`
        return `✅ Đã thêm khách hàng "${name}" (mã: ${code}) thành công.`
      }

      case 'create_task': {
        const { title, due_date, note } = args as { title: string; due_date?: string; note?: string }
        const { error } = await supabase.from('tasks').insert({ title, due_date, note })
        if (error) return `Lỗi: ${error.message}`
        return `✅ Đã tạo công việc "${title}"${due_date ? ` (hạn: ${due_date})` : ''}.`
      }

      // KTT G: HSD lô đang tồn kho
      case 'list_expiring_stock': {
        const { within_days = 365, include_expired = false, limit = 50 } = args as {
          within_days?: number; include_expired?: boolean; limit?: number
        }
        const today = new Date().toISOString().slice(0, 10)
        const cutoff = new Date(Date.now() + within_days * 86_400_000).toISOString().slice(0, 10)
        let q = supabase
          .from('kbit_stock_by_lot')
          .select('product_id, lot_no, expiry_date, warehouse_id, qty_on_hand, products!product_id(code, name, unit), warehouses!warehouse_id(name)')
          .not('expiry_date', 'is', null)
          .lte('expiry_date', cutoff)
          .order('expiry_date', { ascending: true })
          .limit(limit)
        if (!include_expired) q = q.gte('expiry_date', today)
        const { data, error } = await q
        if (error) return `Lỗi: ${error.message}. (Cần đã chạy migration 0045 — có view kbit_stock_by_lot)`
        if (!data?.length) return `Không có lô nào sắp hết HSD trong ${within_days} ngày tới.`
        const rows = (data as any[]).map((r) => ({
          product:    r.products ? `[${r.products.code}] ${r.products.name}` : r.product_id,
          unit:       r.products?.unit ?? null,
          lot_no:     r.lot_no,
          expiry:     r.expiry_date,
          days_left:  Math.round((new Date(r.expiry_date).getTime() - Date.now()) / 86_400_000),
          qty:        Number(r.qty_on_hand),
          warehouse:  r.warehouses?.name ?? r.warehouse_id,
        }))
        return JSON.stringify({ count: rows.length, within_days, items: rows })
      }

      // KTT Cách B: SQL read-only — lưới đỡ cho mọi câu hỏi
      case 'query_database': {
        const { sql } = args as { sql: string; purpose?: string }
        if (!sql?.trim()) return 'Lỗi: SQL rỗng.'
        const { data, error } = await supabase.rpc('kbit_run_readonly_query', { p_sql: sql })
        if (error) {
          // Trả lỗi DB nguyên văn để model tự sửa SQL và thử lại
          return `Lỗi query: ${error.message}\nSQL đã chạy: ${sql}\nGợi ý: kiểm tra tên bảng/cột theo SCHEMA trong system prompt, rồi thử lại với SQL đã sửa.`
        }
        const rows = Array.isArray(data) ? data : []
        return JSON.stringify({
          sql,
          row_count: rows.length,
          truncated: rows.length >= 200,   // chạm trần 200 → có thể còn dữ liệu
          rows,
        })
      }

      // KTT G: HSD hàng ĐÃ BÁN — customer_order_items
      case 'list_expiring_sold': {
        const { within_days = 365, limit = 50 } = args as { within_days?: number; limit?: number }
        const today  = new Date().toISOString().slice(0, 10)
        const cutoff = new Date(Date.now() + within_days * 86_400_000).toISOString().slice(0, 10)
        const { data, error } = await supabase
          .from('customer_order_items')
          .select('qty, lot_no, expiry_date, products!product_id(code, name), customer_orders!order_id(order_code, order_date, customers!customer_id(name))')
          .not('expiry_date', 'is', null)
          .gte('expiry_date', today)
          .lte('expiry_date', cutoff)
          .order('expiry_date', { ascending: true })
          .limit(limit)
        if (error) return `Lỗi: ${error.message}`
        if (!data?.length) return `Không có dòng đã bán nào có HSD trong ${within_days} ngày tới.`
        const rows = (data as any[]).map((r) => ({
          product:     r.products ? `[${r.products.code}] ${r.products.name}` : '—',
          lot_no:      r.lot_no,
          expiry:      r.expiry_date,
          days_left:   Math.round((new Date(r.expiry_date).getTime() - Date.now()) / 86_400_000),
          qty:         Number(r.qty),
          order:       r.customer_orders?.order_code,
          order_date:  r.customer_orders?.order_date,
          customer:    r.customer_orders?.customers?.name ?? '—',
        }))
        return JSON.stringify({ count: rows.length, within_days, items: rows })
      }

      default:
        return `Tool "${name}" không tồn tại.`
    }
  } catch (err) {
    return `Lỗi thực thi: ${err instanceof Error ? err.message : String(err)}`
  }
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM = `Bạn là trợ lý AI nội bộ của KBIT Holdings. Trả lời bằng tiếng Việt.

QUY TẮC QUAN TRỌNG — LUÔN TUÂN THỦ:
1. Trả lời ĐÚNG trọng tâm câu hỏi, KHÔNG thêm thông tin thừa.
2. Tối đa 3-5 dòng cho câu trả lời thông thường. Dùng bullet nếu liệt kê nhiều hơn 3 mục.
3. KHÔNG giải thích cách bạn làm, KHÔNG nói "Tôi đã tra cứu...", KHÔNG lặp lại câu hỏi.
4. Số tiền: 1,500,000 VND (có dấu phân cách). Ngày: DD/MM/YYYY.
5. Nếu danh sách dài (>5 mục): chỉ hiện 5 mục đầu + ghi "(còn X mục khác)".
6. Khi thêm dữ liệu: chỉ xác nhận 1 lần nếu thiếu thông tin bắt buộc, sau đó thực hiện ngay.
7. Luôn dùng tool để lấy dữ liệu thực — không đoán số liệu.

QUY TẮC DÙNG query_database (SQL):
8. ƯU TIÊN tool chuyên dụng trước (get_summary_stats, list_expiring_stock, list_customers...) —
   chúng tính đúng công thức nghiệp vụ. CHỈ dùng query_database khi không có tool phù hợp.
9. Viết SQL theo đúng SCHEMA + QUY ƯỚC NGHIỆP VỤ bên dưới (lọc status, quy đổi KRW...).
10. Câu hỏi mơ hồ về phạm vi (kỳ nào? công ty nào? đã duyệt hay cả nháp?) → hỏi lại NGẮN GỌN 1 lần
    trước khi query. Nếu người dùng không nói rõ, mặc định: năm hiện tại, tất cả công ty, loại trừ void/draft.
11. Nếu query lỗi → đọc thông báo lỗi, SỬA SQL rồi thử lại (tối đa 3 lần). Không trả lỗi thô cho người dùng.
12. Sau câu trả lời dùng query_database, LUÔN thêm dòng cuối (để người dùng kiểm chứng):
    📋 SQL: \`<câu SQL đã chạy>\`
13. Với số liệu QUAN TRỌNG (công nợ chốt sổ, số thuế phải nộp, số liệu khóa kỳ) → thêm 1 dòng:
    "⚠ Số tham khảo — đối chiếu màn hình báo cáo trước khi sử dụng chính thức."
14. Kết quả có truncated=true nghĩa là bị cắt ở 200 dòng — nói rõ "hiển thị 200 dòng đầu" và
    gợi ý thu hẹp điều kiện lọc.
${SCHEMA_DOC}
Hôm nay: ${new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}.`

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return new Response('Unauthorized', { status: 401 })

  let openai: OpenAI
  try {
    openai = getOpenAIClient()
  } catch {
    return new Response('AI service not configured', { status: 503 })
  }

  const userCanEdit = canEdit(me.role)
  const tools = userCanEdit
    ? TOOLS
    : TOOLS.filter(t => t.type !== 'function' || !WRITE_TOOLS.has(t.function.name))

  const supabase = await createClient()
  const { messages } = await req.json() as { messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (text: string) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
      const done = () => {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      }

      try {
        // ── Agentic loop ─────────────────────────────────────────────────────
        // C1 (security 0048): nếu user KHÔNG được xem giá vốn → thêm chỉ thị cấm
        // tiết lộ cột giá vốn. Đây là lớp mềm; lớp cứng là RPC kbit_run_readonly_query
        // tự raise khi SQL chạm cột giá vốn (không phụ thuộc LLM tự giác).
        const costGuard = canViewCosts(me.role)
          ? ''
          : '\n\nQUAN TRỌNG — QUYỀN HẠN: Người dùng này KHÔNG được xem GIÁ VỐN. ' +
            'TUYỆT ĐỐI không truy vấn / hiển thị các cột: unit_cost, cost_price, avg_cost, ' +
            'avg_unit_cost, value_open/in/out/close, cost_total, hay bảng product_moving_cost, ' +
            'inventory_cost_periods. Nếu được hỏi về giá vốn / biên lợi nhuận, trả lời: ' +
            '"Bạn không có quyền xem dữ liệu giá vốn."'
        let history: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          { role: 'system', content: SYSTEM + costGuard },
          ...messages,
        ]

        for (let round = 0; round < 5; round++) {
          // Non-streaming call for tool detection
          const response = await openai.chat.completions.create({
            model: MODEL,
            messages: history,
            tools,
            tool_choice: 'auto',
            stream: false,
          })

          const choice = response.choices[0]
          const msg = choice.message

          // If model called tools
          if (choice.finish_reason === 'tool_calls' && msg.tool_calls?.length) {
            // Add assistant message with tool calls to history
            history.push(msg)

            // Execute each tool
            const toolResults: OpenAI.Chat.Completions.ChatCompletionToolMessageParam[] = []
            for (const tc of msg.tool_calls) {
              if (tc.type !== 'function') continue
              send(`\n_⏳ Đang tra cứu: **${tc.function.name}**..._\n`)
              let args: Record<string, unknown> = {}
              try { args = JSON.parse(tc.function.arguments) } catch { /* empty args */ }
              const result = await executeTool(tc.function.name, args, supabase)
              toolResults.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: result,
              })
            }

            // Add tool results and loop
            history = [...history, ...toolResults]
            continue
          }

          // No more tool calls — stream the final text response
          if (msg.content) {
            // Stream word by word for nicer UX
            const words = msg.content.split(/(?<=\s)/)
            for (const word of words) {
              send(word)
              await new Promise(r => setTimeout(r, 8))
            }
          }

          break
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        send(`\n❌ Lỗi kết nối AI: ${msg}`)
      } finally {
        done()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
