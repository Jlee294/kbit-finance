import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// ─── Tool definitions ────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_companies',
    description: 'Lấy danh sách công ty / pháp nhân trong hệ thống',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'list_customers',
    description: 'Lấy danh sách khách hàng, có thể tìm kiếm theo tên hoặc mã',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Từ khóa tìm kiếm (tên hoặc mã khách hàng)' },
        limit: { type: 'number', description: 'Số lượng tối đa (mặc định 20)' },
      },
      required: [],
    },
  },
  {
    name: 'list_suppliers',
    description: 'Lấy danh sách nhà cung cấp',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Từ khóa tìm kiếm' },
      },
      required: [],
    },
  },
  {
    name: 'list_transactions',
    description: 'Lấy danh sách giao dịch thu tiền hoặc chi phí',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['income', 'expense'], description: 'Loại giao dịch: income = thu tiền, expense = chi phí' },
        company_code: { type: 'string', description: 'Mã công ty để lọc' },
        status: { type: 'string', enum: ['draft', 'confirmed', 'approved', 'void'], description: 'Trạng thái giao dịch' },
        limit: { type: 'number', description: 'Số lượng tối đa (mặc định 10)' },
      },
      required: ['type'],
    },
  },
  {
    name: 'get_summary_stats',
    description: 'Lấy thống kê tổng hợp: tổng thu, tổng chi, số đơn hàng, công nợ theo công ty và kỳ',
    input_schema: {
      type: 'object',
      properties: {
        company_code: { type: 'string', description: 'Mã công ty (bỏ trống = tất cả)' },
        year: { type: 'number', description: 'Năm (ví dụ: 2026). Bỏ trống = năm hiện tại' },
        month: { type: 'number', description: 'Tháng 1-12. Bỏ trống = cả năm' },
      },
      required: [],
    },
  },
  {
    name: 'list_tasks',
    description: 'Lấy danh sách công việc, lọc theo trạng thái',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['open', 'in_progress', 'done', 'overdue'], description: 'Trạng thái công việc' },
      },
      required: [],
    },
  },
  {
    name: 'list_projects',
    description: 'Lấy danh sách dự án',
    input_schema: {
      type: 'object',
      properties: {
        company_code: { type: 'string', description: 'Mã công ty để lọc' },
      },
      required: [],
    },
  },
  {
    name: 'create_customer',
    description: 'Thêm khách hàng mới vào hệ thống',
    input_schema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Mã khách hàng (duy nhất, ví dụ: KH001)' },
        name: { type: 'string', description: 'Tên khách hàng' },
        phone: { type: 'string', description: 'Số điện thoại (tùy chọn)' },
        note: { type: 'string', description: 'Ghi chú (tùy chọn)' },
      },
      required: ['code', 'name'],
    },
  },
  {
    name: 'create_task',
    description: 'Tạo công việc mới',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Tiêu đề công việc' },
        due_date: { type: 'string', description: 'Hạn hoàn thành (YYYY-MM-DD)' },
        note: { type: 'string', description: 'Ghi chú thêm' },
      },
      required: ['title'],
    },
  },
]

// ─── Tool execution ──────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string> {
  try {
    switch (name) {
      case 'list_companies': {
        const { data, error } = await supabase
          .from('companies').select('code, name, country, base_currency, is_active').order('code')
        if (error) return `Lỗi: ${error.message}`
        if (!data?.length) return 'Không có công ty nào trong hệ thống.'
        return JSON.stringify(data, null, 2)
      }

      case 'list_customers': {
        const { search, limit = 20 } = input as { search?: string; limit?: number }
        let q = supabase.from('customers').select('code, name, phone, note, is_active').order('name').limit(limit)
        if (search) q = q.or(`name.ilike.%${search}%,code.ilike.%${search}%`)
        const { data, error } = await q
        if (error) return `Lỗi: ${error.message}`
        if (!data?.length) return 'Không tìm thấy khách hàng nào.'
        return JSON.stringify(data, null, 2)
      }

      case 'list_suppliers': {
        const { search } = input as { search?: string }
        let q = supabase.from('suppliers').select('code, name, note, is_active').order('name').limit(20)
        if (search) q = q.or(`name.ilike.%${search}%,code.ilike.%${search}%`)
        const { data, error } = await q
        if (error) return `Lỗi: ${error.message}`
        if (!data?.length) return 'Không tìm thấy nhà cung cấp nào.'
        return JSON.stringify(data, null, 2)
      }

      case 'list_transactions': {
        const { type, company_code, status, limit = 10 } = input as {
          type: 'income' | 'expense'; company_code?: string; status?: string; limit?: number
        }
        const table = type === 'income' ? 'income_transactions' : 'expense_transactions'
        let q = supabase.from(table)
          .select('txn_date, amount, currency, status, note, companies!company_id(code, name)')
          .order('txn_date', { ascending: false })
          .limit(limit)
        if (status) q = q.eq('status', status)
        if (company_code) {
          // join filter qua company code
          const { data: co } = await supabase.from('companies').select('id').eq('code', company_code).single()
          if (co) q = q.eq('company_id', co.id)
        }
        const { data, error } = await q
        if (error) return `Lỗi: ${error.message}`
        if (!data?.length) return `Không có giao dịch ${type === 'income' ? 'thu' : 'chi'} nào.`
        return JSON.stringify(data, null, 2)
      }

      case 'get_summary_stats': {
        const { company_code, year = new Date().getFullYear(), month } = input as {
          company_code?: string; year?: number; month?: number
        }
        // Date range
        const from = month
          ? `${year}-${String(month).padStart(2, '0')}-01`
          : `${year}-01-01`
        const to = month
          ? new Date(year, month, 0).toISOString().split('T')[0]
          : `${year}-12-31`

        let companyId: string | undefined
        if (company_code) {
          const { data: co } = await supabase.from('companies').select('id').eq('code', company_code).single()
          companyId = co?.id
        }

        // Income
        let incQ = supabase.from('income_transactions')
          .select('amount_vnd, currency, amount, status')
          .gte('txn_date', from).lte('txn_date', to)
          .neq('status', 'void')
        if (companyId) incQ = incQ.eq('company_id', companyId)
        const { data: incomes } = await incQ

        // Expense
        let expQ = supabase.from('expense_transactions')
          .select('amount, currency, status')
          .gte('txn_date', from).lte('txn_date', to)
          .neq('status', 'void')
        if (companyId) expQ = expQ.eq('company_id', companyId)
        const { data: expenses } = await expQ

        // Tasks open
        const { count: openTasks } = await supabase
          .from('tasks').select('*', { count: 'exact', head: true })
          .in('status', ['open', 'in_progress'])

        const totalIncomeVnd = (incomes ?? []).reduce((s, r) => s + (r.amount_vnd ?? r.amount ?? 0), 0)
        const totalExpenseVnd = (expenses ?? []).reduce((s, r) => s + (r.amount ?? 0), 0)

        return JSON.stringify({
          period: month ? `${month}/${year}` : `Năm ${year}`,
          company: company_code ?? 'Tất cả',
          total_income_vnd: totalIncomeVnd,
          total_expense_vnd: totalExpenseVnd,
          net_vnd: totalIncomeVnd - totalExpenseVnd,
          income_count: incomes?.length ?? 0,
          expense_count: expenses?.length ?? 0,
          open_tasks: openTasks ?? 0,
        }, null, 2)
      }

      case 'list_tasks': {
        const { status } = input as { status?: string }
        let q = supabase.from('tasks')
          .select('title, status, due_date, auto_generated, note')
          .order('created_at', { ascending: false })
          .limit(20)
        if (status) q = q.eq('status', status)
        const { data, error } = await q
        if (error) return `Lỗi: ${error.message}`
        if (!data?.length) return 'Không có công việc nào.'
        return JSON.stringify(data, null, 2)
      }

      case 'list_projects': {
        const { company_code } = input as { company_code?: string }
        let q = supabase.from('projects')
          .select('code, name, is_active, companies!company_id(code, name)')
          .order('code')
        if (company_code) {
          const { data: co } = await supabase.from('companies').select('id').eq('code', company_code).single()
          if (co) q = q.eq('company_id', co.id)
        }
        const { data, error } = await q
        if (error) return `Lỗi: ${error.message}`
        if (!data?.length) return 'Không có dự án nào.'
        return JSON.stringify(data, null, 2)
      }

      case 'create_customer': {
        const { code, name, phone, note } = input as {
          code: string; name: string; phone?: string; note?: string
        }
        const { error } = await supabase.from('customers').insert({ code, name, phone, note })
        if (error) {
          if (error.code === '23505') return `Mã khách hàng "${code}" đã tồn tại.`
          return `Lỗi: ${error.message}`
        }
        return `✅ Đã thêm khách hàng "${name}" (mã: ${code}) thành công.`
      }

      case 'create_task': {
        const { title, due_date, note } = input as {
          title: string; due_date?: string; note?: string
        }
        const { error } = await supabase.from('tasks').insert({ title, due_date, note })
        if (error) return `Lỗi: ${error.message}`
        return `✅ Đã tạo công việc "${title}"${due_date ? ` (hạn: ${due_date})` : ''}.`
      }

      default:
        return `Tool "${name}" không tồn tại.`
    }
  } catch (err) {
    return `Lỗi thực thi: ${err instanceof Error ? err.message : String(err)}`
  }
}

// ─── System prompt ───────────────────────────────────────────────────────────

const SYSTEM = `Bạn là trợ lý AI của hệ thống tài chính nội bộ KBIT Holdings.
Nhiệm vụ: trả lời câu hỏi về dữ liệu tài chính, khách hàng, công ty, công việc — và thực hiện các thao tác đơn giản như thêm khách hàng, tạo công việc khi người dùng yêu cầu.

Nguyên tắc:
- Luôn dùng tools để lấy dữ liệu thực từ DB, không đoán mò số liệu.
- Trả lời ngắn gọn, rõ ràng bằng tiếng Việt.
- Với số tiền: format có dấu phân cách (1,000,000 VND).
- Khi thêm dữ liệu: xác nhận lại thông tin với người dùng trước khi gọi tool create nếu chưa đủ thông tin.
- Không hiển thị JSON thô — diễn giải thành câu văn dễ đọc.
- Hôm nay: ${new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`

// ─── Streaming route ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth check
  const me = await getCurrentUser()
  if (!me) return new Response('Unauthorized', { status: 401 })

  const supabase = await createClient()
  const { messages } = await req.json() as {
    messages: Anthropic.MessageParam[]
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: data })}\n\n`))
      }
      const sendDone = () => {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      }

      try {
        // Agentic loop — tối đa 5 vòng tool call
        let currentMessages = [...messages]

        for (let round = 0; round < 5; round++) {
          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-5',
            max_tokens: 1024,
            system: SYSTEM,
            tools: TOOLS,
            messages: currentMessages,
          })

          // Stream text blocks
          for (const block of response.content) {
            if (block.type === 'text') send(block.text)
          }

          // No tool use → done
          if (response.stop_reason !== 'tool_use') break

          // Process tool calls
          const toolUseBlocks = response.content.filter(b => b.type === 'tool_use')
          const toolResults: Anthropic.ToolResultBlockParam[] = []

          for (const block of toolUseBlocks) {
            if (block.type !== 'tool_use') continue
            send(`\n\n_⏳ Đang tra cứu: **${block.name}**..._\n\n`)
            const result = await executeTool(
              block.name,
              block.input as Record<string, unknown>,
              supabase,
            )
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: result,
            })
          }

          // Continue loop with tool results
          currentMessages = [
            ...currentMessages,
            { role: 'assistant', content: response.content },
            { role: 'user', content: toolResults },
          ]
        }
      } catch (err) {
        send(`\n\n❌ Lỗi: ${err instanceof Error ? err.message : String(err)}`)
      } finally {
        sendDone()
        controller.close()
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
