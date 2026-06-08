import { createClient } from '@/lib/supabase/server'

export interface CashRow {
  id:                string
  ky_hieu:           string | null
  txn_date:          string
  doi_tac:           string | null
  ma_doi_tac:        string | null
  noi_dung:          string
  so_tien:           number
  direction:         'thu' | 'chi'
  ghi_chu:           string | null
  dinh_khoan_no:     string | null
  dinh_khoan_co:     string | null
  status:            string
  company_id:        string
  company_name:      string | null
  nhan_su_thuc_hien: string | null
  nhan_su_name:      string | null
  is_chi_ho:         boolean
  chi_ho_person:     string | null
  is_thu_ho:         boolean
  thu_ho_person:     string | null
  customer_id:       string | null
  supplier_id:       string | null
  party_name:        string | null
}

export async function listCashBook(opts: {
  companyId?: string
  direction?: string
  from?: string
  to?: string
  limit?: number
} = {}): Promise<CashRow[]> {
  const supabase = await createClient()
  // FULL kèm đối tượng công nợ (KH/NCC) — cần migration 0024 (cột customer_id/supplier_id).
  // BASIC bỏ phần đó để trang vẫn chạy khi DB CHƯA deploy 0024 (tự thích nghi).
  const FULL = `
      id, ky_hieu, txn_date, doi_tac, ma_doi_tac, noi_dung,
      so_tien, direction, ghi_chu, dinh_khoan_no, dinh_khoan_co, status,
      company_id, nhan_su_thuc_hien,
      is_chi_ho, chi_ho_person, is_thu_ho, thu_ho_person,
      customer_id, supplier_id,
      companies!company_id ( name ),
      users!nhan_su_thuc_hien ( full_name ),
      customers!customer_id ( name ),
      suppliers!supplier_id ( name )`
  const BASIC = `
      id, ky_hieu, txn_date, doi_tac, ma_doi_tac, noi_dung,
      so_tien, direction, ghi_chu, dinh_khoan_no, dinh_khoan_co, status,
      company_id, nhan_su_thuc_hien,
      is_chi_ho, chi_ho_person, is_thu_ho, thu_ho_person,
      companies!company_id ( name ),
      users!nhan_su_thuc_hien ( full_name )`

  const build = (sel: string) => {
    let q = supabase.from('cash_book').select(sel)
      .order('txn_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(opts.limit ?? 200)
    if (opts.companyId) q = q.eq('company_id', opts.companyId)
    if (opts.direction) q = q.eq('direction', opts.direction)
    if (opts.from)      q = q.gte('txn_date', opts.from)
    if (opts.to)        q = q.lte('txn_date', opts.to)
    return q
  }

  let { data, error } = await build(FULL)
  if (error && /relationship|schema cache|customer_id|supplier_id/i.test(error.message)) {
    const r = await build(BASIC)   // DB chưa có 0024 → bỏ gắn đối tượng công nợ
    data = r.data; error = r.error
  }
  if (error) { console.error('[listCashBook]', error.message); return [] }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id:                r.id,
    ky_hieu:           r.ky_hieu,
    txn_date:          r.txn_date,
    doi_tac:           r.doi_tac,
    ma_doi_tac:        r.ma_doi_tac,
    noi_dung:          r.noi_dung,
    so_tien:           Number(r.so_tien),
    direction:         r.direction,
    ghi_chu:           r.ghi_chu,
    dinh_khoan_no:     r.dinh_khoan_no,
    dinh_khoan_co:     r.dinh_khoan_co,
    status:            r.status,
    company_id:        r.company_id,
    company_name:      r.companies?.name ?? null,
    nhan_su_thuc_hien: r.nhan_su_thuc_hien,
    nhan_su_name:      r.users?.full_name ?? null,
    is_chi_ho:         !!r.is_chi_ho,
    chi_ho_person:     r.chi_ho_person,
    is_thu_ho:         !!r.is_thu_ho,
    thu_ho_person:     r.thu_ho_person,
    customer_id:       r.customer_id ?? null,
    supplier_id:       r.supplier_id ?? null,
    party_name:        r.customers?.name ?? r.suppliers?.name ?? null,
  }))
}
