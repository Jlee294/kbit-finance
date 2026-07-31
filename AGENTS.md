<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## KBIT accounting import operating memory

This section is mandatory operating memory for every AI or developer that imports
accounting data into KBIT. Read it completely before parsing, staging, posting,
repairing, or reconciling an accounting data set. This is a headless workflow;
do not add a general-purpose import screen or navigation item for it.

### Non-negotiable source rules

- For a Quyên-style source set, giữ nguyên chính xác mã hàng và mã công nợ từ file nguồn, including case, punctuation, and leading zeroes.
- If a required product or debt code is absent or ambiguous, dừng import và báo thiếu mapping. Never silently invent, normalize, or substitute a code.
- A synthetic test may use explicit deterministic fixture codes, but those codes must be declared in the test data.
- Source NXT and debt summary files are reconciliation references. Apart from their opening balances, không được chép số phát sinh hoặc số cuối kỳ from those files into operational ledgers.
- Never force a reconciliation by editing derived totals, locking source cost, or creating a residual entry. In particular, không tạo bút toán bù.
- Every posted row must retain source lineage through its import batch, source file, staging row, reconciliation key, and target record.

### Fixed import order

1. **Tồn kho và công nợ đầu kỳ**
   - Select the company, accounting period, and warehouse first.
   - Inventory opening is entered once per exact product code and warehouse with opening quantity and opening value/unit cost.
   - AR/AP opening is entered once per exact customer/supplier debt code with separate debit and credit values.
   - Bank and cash openings are declarations, not receipts or payments. Never create a fake money transaction to represent an opening balance.
2. **Bảng kê bán ra + Nhật ký bán hàng**
   - Import the pair together and reconcile by invoice number and invoice date.
   - Bảng kê bán ra contains every sales invoice, whether or not it affects inventory.
   - Nhật ký bán hàng contains only inventory lines and every line must carry an exact source product code.
3. **Bảng kê mua vào + Nhật ký mua hàng**
   - Import the pair together and reconcile by invoice number and invoice date.
   - Bảng kê mua vào contains every purchase invoice, whether inventory, service, expense, prepaid item, fixed asset, or CCDC.
   - Nhật ký mua hàng contains only inventory lines and every line must carry an exact source product code.
4. **SPNH và sổ tiền mặt**
   - Import actual bank and cash movements after invoices and opening balances.
   - A receipt linked to an exact customer code reduces receivables.
   - A payment linked to an exact supplier code reduces payables.
   - A money row that is not a 131/331 movement is still posted to money but must not create or attach to a fake debt party.
5. **Derive and reconcile**
   - Post only after the complete source set passes structural, code, invoice-subset, debt-flow, and inventory-flow checks.
   - Derive NXT, AR/AP, profit/loss, and closing balances from openings plus operational documents.
   - Compare the derived results to the source reference files; never reverse the direction and feed reference closing numbers into the app.

### Authoritative data flow

- Tồn kho đầu kỳ → Tồn đầu NXT.
- Nhật ký mua hàng → Nhập NXT.
- Nhật ký bán hàng → Xuất NXT.
- NXT closing quantity = opening quantity + receipt quantity - issue quantity.
- Cost of each issue is calculated by bình quân liên hoàn in chronological order; on the same date, receipts are processed before issues.
- Bảng kê bán ra → Phát sinh Nợ phải thu when the invoice creates receivables.
- Bank/cash receipt linked to a customer → Phát sinh Có phải thu.
- Bảng kê mua vào → Phát sinh Có phải trả when the invoice creates payables.
- Bank/cash payment linked to a supplier → Phát sinh Nợ phải trả.
- AR closing net = opening debit - opening credit + period debit - period credit.
- AP closing net = opening credit - opening debit + period credit - period debit.
- Revenue comes from sales listings except gift invoices.
- A gift invoice remains in the sales VAT listing. It creates no revenue and no customer debt; if product-coded, it still issues inventory and creates cost of goods sold.
- Non-inventory purchases flow to expense only according to their accounting classification. Inventory purchases are not expensed at purchase; their cost reaches profit/loss through inventory issues.
- Imported-goods inventory cost includes goods value, import duty, and directly attributable freight/service cost. Recoverable import VAT does not enter inventory cost.

### Opening-balance locations and current gap

- AR/AP opening: `/cong-no/so-du-dau-ky`, persisted in `debt_opening_balances`.
- Inventory opening: `/kho/so-du-dau-ky` for manual entry or `/kho/import` for the existing opening-stock Excel import; persisted as `warehouse_transactions.txn_type = 'opening'`.
- Cash opening: `/chung-tu-khac`, field `Khai báo tiền mặt đầu kỳ`, persisted in `cash_opening_balances`.
- Bank opening: `/ngan-hang`, section `Số dư đầu kỳ ngân hàng`, persisted per bank account and year in `bank_opening_balances`. When an SPNH source contains an opening balance, map that declared balance here; never manufacture an income/expense row. `bank_accounts.balance` remains deprecated and must not be used.

### Staging, posting, and acceptance

- Parsing and validation live in `features/import-staging/parser.ts`.
- Operational posting is performed by the approved SQL import functions in `supabase/migrations/0058_import_posting_and_rollback.sql`.
- Files may be prepared in phases, but operational ledgers must remain unchanged while data is incomplete. The complete validated batch is posted atomically; any posting error must leave no partial ledger.
- Required final checks are both totals and per-code/per-invoice checks: source code sets, listing counts, journal subsets, opening balances, NXT quantities, money mapping, AR/AP debit-credit movements, and closing balances.
- Delivery requires 0 failed checks and 0 chênh lệch chưa giải trình.
- A cost difference is acceptable only when the quantities and source movements match and the difference is demonstrably caused by the approved moving-average method. Record the explanation; do not overwrite the calculated cost.
