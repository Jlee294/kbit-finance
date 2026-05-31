import OpenAI from 'openai'
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'

const openai = new OpenAI({
  apiKey: process.env.NINE_ROUTER_API_KEY ?? 'sk-placeholder',
  baseURL: process.env.NINE_ROUTER_BASE_URL ?? 'http://34.177.99.4:20128/v1',
})

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

Hôm nay: ${new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}.`

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return new Response('Unauthorized', { status: 401 })

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
        let history: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          { role: 'system', content: SYSTEM },
          ...messages,
        ]

        for (let round = 0; round < 5; round++) {
          // Non-streaming call for tool detection
          const response = await openai.chat.completions.create({
            model: MODEL,
            messages: history,
            tools: TOOLS,
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
