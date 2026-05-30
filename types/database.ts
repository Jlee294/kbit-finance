export type Database = {
  public: {
    Enums: {
      user_role: 'admin' | 'chief_accountant' | 'accountant' | 'viewer'
      country_code: 'VN' | 'KR'
      currency_code: 'VND' | 'KRW'
      fulfillment_status: 'draft' | 'confirmed' | 'awaiting_goods' | 'delivered'
      payment_status: 'unpaid' | 'partial' | 'paid'
      txn_status: 'draft' | 'confirmed' | 'approved' | 'void'
      expense_region: 'VN' | 'KR'
      expense_kind: 'goods' | 'service'
      supplier_order_type: 'domestic' | 'import'
      doc_entity_type: 'customer_order' | 'supplier_order' | 'income' | 'expense'
      period_status: 'open' | 'locked'
      receivable_status: 'outstanding' | 'collected'
      task_status: 'open' | 'in_progress' | 'done' | 'overdue'
      health_light: 'green' | 'yellow' | 'red'
    }
  }
}
