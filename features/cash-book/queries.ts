import { createClient } from '@/lib/supabase/server'

export interface CashRow {
  id:             string
  ky_hieu:        string | null
  txn_date:       string
  doi_tac:        string | null
  ma_doi_tac:     string | null
  noi_dung:       string
  so_tien:        number
  direction:      'thu' | 'chi'
  ghi_chu:        string | null
  dinh_khoan_no:  string | null
  dinh_khoan_co:  string | null
  status:         string
  company_id:     string
  company_name:   string | null
}

export async function listCashBook(opts: {
  companyId?: string
  direction?: string
  from?: string
  to?: string
  limit?: number
} = {}): Promise<CashRow[]> {
  const supabase = await createClient()
  let q = supabase
    .from('cash_book')
    .select(`
      id, ky_hieu, txn_date, doi_tac, ma_doi_tac, noi_dung,
      so_tien, direction, ghi_chu, dinh_khoan_no, dinh_khoan_co, status,
      company_id, companies!company_id ( name )
    `)
    .order('txn_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 200)

  if (opts.companyId) q = q.eq('company_id', opts.companyId)
  if (opts.direction) q = q.eq('direction', opts.direction)
  if (opts.from)      q = q.gte('txn_date', opts.from)
  if (opts.to)        q = q.lte('txn_date', opts.to)

  const { data, error } = await q
  if (error) { console.error('[listCashBook]', error.message); return [] }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id:             r.id,
    ky_hieu:        r.ky_hieu,
    txn_date:       r.txn_date,
    doi_tac:        r.doi_tac,
    ma_doi_tac:     r.ma_doi_tac,
    noi_dung:       r.noi_dung,
    so_tien:        Number(r.so_tien),
    direction:      r.direction,
    ghi_chu:        r.ghi_chu,
    dinh_khoan_no:  r.dinh_khoan_no,
    dinh_khoan_co:  r.dinh_khoan_co,
    status:         r.status,
    company_id:     r.company_id,
    company_name:   r.companies?.name ?? null,
  }))
}
