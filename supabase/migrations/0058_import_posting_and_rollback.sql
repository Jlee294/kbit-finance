-- =============================================================================
-- 0058 — DUYỆT, GHI SỔ NGUYÊN TỬ VÀ HOÀN TÁC LÔ IMPORT
-- =============================================================================

alter table debt_opening_balances
  add column if not exists import_batch_id uuid references import_batches(id);

alter table supplier_orders
  add column if not exists creates_payable boolean not null default true,
  add column if not exists purchase_nature text not null default 'other',
  add column if not exists source_partner_name text;

alter table customer_orders
  add column if not exists source_partner_name text;

alter table income_transactions
  add column if not exists source_partner_name text;

alter table expense_transactions
  add column if not exists source_partner_name text;

-- Quà tặng, hóa đơn thay thế bằng 0 và dòng tiền không qua 131/331 không được
-- tạo một mã công nợ giả chỉ để thỏa khóa ngoại.
alter table customer_orders alter column customer_id drop not null;
alter table supplier_orders alter column supplier_id drop not null;
alter table income_transactions alter column customer_id drop not null;

-- Giá đơn vị cần đủ độ chính xác để tổng giá trị NXT khớp file nguồn đến 0,01 đồng.
-- Màn hình vẫn định dạng tiền theo quy ước hiển thị, nhưng sổ kho không làm tròn sớm.
alter table supplier_order_items alter column unit_cost type numeric(24,8);
alter table customer_order_items alter column cost_price type numeric(24,8);
alter table warehouse_transactions alter column unit_cost type numeric(24,8);
alter table product_moving_cost alter column avg_cost type numeric(24,8);
alter table supplier_order_items add column if not exists source_line_amount numeric(18,2);
alter table customer_order_items add column if not exists source_line_amount numeric(18,2);
alter table income_transactions add column if not exists affects_debt boolean not null default true;
alter table expense_transactions add column if not exists affects_debt boolean not null default true;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'supplier_orders_purchase_nature'
  ) then
    alter table supplier_orders
      add constraint supplier_orders_purchase_nature
      check (purchase_nature in ('goods','import_duty','import_vat','freight','service','other'));
  end if;
end $$;

create table if not exists debt_adjustments (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  partner_type    text not null check (partner_type in ('customer','supplier')),
  partner_id      uuid not null,
  txn_date        date not null,
  debit_amount    numeric(18,2) not null default 0 check (debit_amount >= 0),
  credit_amount   numeric(18,2) not null default 0 check (credit_amount >= 0),
  note            text not null,
  import_batch_id uuid references import_batches(id),
  created_by      uuid references users(id),
  created_at      timestamptz not null default now(),
  check (debit_amount > 0 or credit_amount > 0),
  check (not (debit_amount > 0 and credit_amount > 0))
);

create index if not exists idx_debt_adjustments_partner
  on debt_adjustments(company_id, partner_type, partner_id, txn_date);

alter table debt_adjustments enable row level security;
create policy debt_adjustments_sel on debt_adjustments
  for select using (kbit_role() is not null and kbit_can_access_company(company_id));
create policy debt_adjustments_ins on debt_adjustments
  for insert with check (kbit_can_edit() and kbit_can_access_company(company_id));
create policy debt_adjustments_upd on debt_adjustments
  for update using (kbit_can_edit() and kbit_can_access_company(company_id))
  with check (kbit_can_edit() and kbit_can_access_company(company_id));
create policy debt_adjustments_del on debt_adjustments
  for delete using (kbit_can_approve() and kbit_can_access_company(company_id));

create or replace function kbit_mc_receive(
  p_company_id uuid,
  p_product_id uuid,
  p_qty numeric,
  p_unit_cost numeric
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qty numeric := 0;
  v_avg numeric := 0;
  v_u numeric;
  v_newqty numeric;
  v_newavg numeric;
begin
  select qty_on_hand, avg_cost into v_qty, v_avg
    from product_moving_cost
   where company_id = p_company_id and product_id = p_product_id;
  if not found then v_qty := 0; v_avg := 0; end if;
  v_u := coalesce(p_unit_cost, v_avg);
  v_newqty := v_qty + p_qty;
  v_newavg := case
    when v_qty > 0 and v_newqty <> 0
      then round((v_qty*v_avg + p_qty*v_u)/v_newqty, 8)
    else round(v_u, 8)
  end;
  insert into product_moving_cost(company_id,product_id,qty_on_hand,avg_cost,updated_at)
  values(p_company_id,p_product_id,v_newqty,v_newavg,now())
  on conflict(company_id,product_id) do update set
    qty_on_hand=excluded.qty_on_hand,
    avg_cost=excluded.avg_cost,
    updated_at=now();
  return round(v_u, 8);
end;
$$;

create or replace function kbit_mc_issue(
  p_company_id uuid,
  p_product_id uuid,
  p_qty numeric
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qty numeric := 0;
  v_avg numeric := 0;
begin
  select qty_on_hand,avg_cost into v_qty,v_avg
    from product_moving_cost
   where company_id=p_company_id and product_id=p_product_id;
  if not found then v_qty:=0; v_avg:=0; end if;
  insert into product_moving_cost(company_id,product_id,qty_on_hand,avg_cost,updated_at)
  values(p_company_id,p_product_id,v_qty-p_qty,v_avg,now())
  on conflict(company_id,product_id) do update set
    qty_on_hand=excluded.qty_on_hand,
    updated_at=now();
  return round(v_avg,8);
end;
$$;

create or replace function kbit_import_customer(
  p_source_code text,
  p_name text,
  p_tax_code text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_code text := nullif(btrim(p_source_code), '');
  v_tax text := nullif(btrim(p_tax_code), '');
  v_name text := coalesce(nullif(btrim(p_name), ''), v_code);
begin
  if v_code is null then raise exception 'MISSING_SOURCE_CUSTOMER_CODE'; end if;
  select id into v_id from customers where code = v_code order by created_at limit 1;
  if v_id is not null then return v_id; end if;

  insert into customers(code, name, tax_code) values (v_code, v_name, v_tax)
    returning id into v_id;
  return v_id;
exception when unique_violation then
  select id into v_id from customers where code = v_code order by created_at limit 1;
  return v_id;
end;
$$;

create or replace function kbit_import_supplier(
  p_source_code text,
  p_name text,
  p_tax_code text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_code text := nullif(btrim(p_source_code), '');
  v_tax text := nullif(btrim(p_tax_code), '');
  v_name text := coalesce(nullif(btrim(p_name), ''), v_code);
begin
  if v_code is null then raise exception 'MISSING_SOURCE_SUPPLIER_CODE'; end if;
  select id into v_id from suppliers where code = v_code order by created_at limit 1;
  if v_id is not null then return v_id; end if;

  insert into suppliers(code, name, country, tax_code) values (v_code, v_name, 'VN', v_tax)
    returning id into v_id;
  return v_id;
exception when unique_violation then
  select id into v_id from suppliers where code = v_code order by created_at limit 1;
  return v_id;
end;
$$;

create or replace function kbit_import_product(p_code text, p_name text, p_unit text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_code text := nullif(btrim(p_code), '');
begin
  if v_code is null then raise exception 'MISSING_SOURCE_PRODUCT_CODE'; end if;
  select id into v_id from products where code = v_code limit 1;
  if v_id is not null then return v_id; end if;
  insert into products(code, name, unit)
  values (
    v_code,
    coalesce(nullif(btrim(p_name), ''), v_code),
    coalesce(nullif(btrim(p_unit), ''), 'cái')
  ) returning id into v_id;
  return v_id;
exception when unique_violation then
  select id into v_id from products where code = v_code limit 1;
  return v_id;
end;
$$;

revoke all on function kbit_import_customer(text,text,text) from public;
revoke all on function kbit_import_supplier(text,text,text) from public;
revoke all on function kbit_import_product(text,text,text) from public;

create or replace function kbit_approve_import_batch(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_status text;
begin
  if not kbit_can_approve() then raise exception 'KHONG_DU_QUYEN_DUYET'; end if;
  select company_id, status into v_company, v_status
    from import_batches where id = p_batch_id for update;
  if not found then raise exception 'KHONG_TIM_THAY_LO_IMPORT'; end if;
  if not kbit_can_access_company(v_company) then raise exception 'KHONG_CO_QUYEN_CONG_TY'; end if;
  if v_status <> 'validated' then raise exception 'LO_CHUA_DUOC_KIEM_TRA_100_PHAN_TRAM'; end if;
  if exists (
    select 1 from import_checks
    where batch_id = p_batch_id
      and (status not in ('passed','explained') or (status = 'explained' and nullif(btrim(explanation),'') is null))
  ) then
    raise exception 'CON_KIEM_TRA_CHUA_DAT_HOAC_CHUA_CO_GIAI_TRINH';
  end if;
  update import_batches
     set status = 'approved', approved_by = (select id from users where auth_id = auth.uid()),
         updated_at = now()
   where id = p_batch_id;
end;
$$;

create or replace function kbit_explain_import_check(
  p_check_id uuid,
  p_explanation text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_company uuid;
begin
  if not kbit_can_approve() then raise exception 'KHONG_DU_QUYEN_DUYET_GIAI_TRINH'; end if;
  if length(btrim(coalesce(p_explanation, ''))) < 10 then
    raise exception 'GIAI_TRINH_QUA_NGAN';
  end if;

  select c.batch_id, b.company_id
    into v_batch_id, v_company
    from import_checks c
    join import_batches b on b.id = c.batch_id
   where c.id = p_check_id
   for update of c, b;
  if not found then raise exception 'KHONG_TIM_THAY_KIEM_TRA'; end if;
  if not kbit_can_access_company(v_company) then raise exception 'KHONG_CO_QUYEN_CONG_TY'; end if;

  update import_checks
     set status = 'explained', explanation = btrim(p_explanation), updated_at = now()
   where id = p_check_id;

  update import_batches
     set status = case when exists (
       select 1 from import_checks
        where batch_id = v_batch_id
          and status not in ('passed','explained')
     ) then 'needs_review' else 'validated' end,
     updated_at = now()
   where id = v_batch_id
     and status in ('draft','parsed','needs_review','validated');
end;
$$;

create or replace function kbit_post_import_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch import_batches%rowtype;
  v_user uuid;
  v_warehouse uuid;
  v_bank uuid;
  v_period text;
  v_year int;
  v_customer uuid;
  v_supplier uuid;
  v_product uuid;
  v_order uuid;
  v_item uuid;
  v_category uuid;
  v_key text;
  v_items jsonb;
  v_has_items boolean;
  v_is_gift boolean;
  v_order_type text;
  v_purchase_nature text;
  v_declaration_no text;
  v_customs_supplier uuid;
  v_duty_amount numeric;
  v_import_vat_amount numeric;
  v_total_line_value numeric;
  v_capitalizable_extra numeric;
  v_affects_debt boolean;
  v_actual_debit numeric;
  v_actual_credit numeric;
  v_expected_debit numeric;
  v_expected_credit numeric;
  v_residual numeric;
  r record;
  line record;
  evt record;
begin
  if not kbit_can_approve() then raise exception 'KHONG_DU_QUYEN_GHI_SO'; end if;
  select * into v_batch from import_batches where id = p_batch_id for update;
  if not found then raise exception 'KHONG_TIM_THAY_LO_IMPORT'; end if;
  if v_batch.status <> 'approved' then raise exception 'LO_CHUA_DUOC_DUYET'; end if;
  if not kbit_can_access_company(v_batch.company_id) then raise exception 'KHONG_CO_QUYEN_CONG_TY'; end if;

  perform pg_advisory_xact_lock(hashtext(v_batch.company_id::text));
  select id into v_user from users where auth_id = auth.uid();
  if v_user is null then raise exception 'KHONG_TIM_THAY_NGUOI_DUNG_NOI_BO'; end if;
  v_period := to_char(v_batch.period_from, 'YYYY-MM');
  v_year := extract(year from v_batch.period_from)::int;

  select id into v_warehouse from warehouses
   where company_id = v_batch.company_id
   order by is_default desc nulls last, created_at limit 1;
  if v_warehouse is null then
    insert into warehouses(company_id, code, name, is_default)
    values (v_batch.company_id, 'KHO-IMPORT', 'Kho nhập dữ liệu', true)
    returning id into v_warehouse;
  end if;

  select id into v_bank from bank_accounts
   where company_id = v_batch.company_id and currency = 'VND' and is_active
   order by created_at limit 1;
  if v_bank is null then
    insert into bank_accounts(company_id, name, currency, account_no)
    values (v_batch.company_id, 'Tài khoản ngân hàng nhập dữ liệu', 'VND', null)
    returning id into v_bank;
  end if;

  -- 1. Tạo danh mục mã hàng trước.
  for r in
    select normalized_data
      from import_staging_rows
     where batch_id = p_batch_id
       and row_kind in ('inventory','sales_journal','purchase_journal')
  loop
    if nullif(btrim(r.normalized_data->>'product_code'),'') is not null then
      perform kbit_import_product(
        r.normalized_data->>'product_code',
        r.normalized_data->>'product_name',
        r.normalized_data->>'unit'
      );
    end if;
  end loop;

  -- 2. Tồn đầu kỳ phải ghi trước mọi nhập/xuất trong kỳ.
  for r in
    select id, normalized_data
      from import_staging_rows
     where batch_id = p_batch_id and row_kind = 'inventory'
     order by row_number
  loop
    v_product := kbit_import_product(
      r.normalized_data->>'product_code',
      r.normalized_data->>'product_name',
      r.normalized_data->>'unit'
    );
    if exists (
      select 1 from warehouse_transactions
       where company_id=v_batch.company_id
         and warehouse_id=v_warehouse
         and product_id=v_product
         and txn_type='opening'
         and txn_date=to_date(v_period || '-01','YYYY-MM-DD')
    ) then
      raise exception 'TON_DAU_KY_DA_TON_TAI: %',r.normalized_data->>'product_code';
    end if;
    perform kbit_set_opening_stock(
      v_product,
      v_warehouse,
      v_period,
      coalesce((r.normalized_data->>'opening_quantity')::numeric, 0),
      case when coalesce((r.normalized_data->>'opening_quantity')::numeric, 0) <> 0
        then round(
          coalesce((r.normalized_data->>'opening_value')::numeric, 0)
          / (r.normalized_data->>'opening_quantity')::numeric,
          8
        )
        else 0 end
    );
    update warehouse_transactions
       set import_batch_id = p_batch_id
     where company_id = v_batch.company_id
       and warehouse_id = v_warehouse
       and product_id = v_product
       and txn_type = 'opening'
       and txn_date = to_date(v_period || '-01', 'YYYY-MM-DD');
    update import_staging_rows
       set mapping_status = 'created', target_table = 'products', target_id = v_product
     where id = r.id;
  end loop;

  select id into v_category from accounting_categories
   where company_id is null and code = 'CHI_PHI' limit 1;

  -- 3. Bảng kê mua vào tạo toàn bộ hóa đơn; nhật ký chỉ cung cấp dòng có mã hàng.
  for r in
    select *
      from import_staging_rows
     where batch_id = p_batch_id and row_kind = 'purchase_listing'
     order by (normalized_data->>'invoice_date')::date, row_number
  loop
    v_key := r.reconciliation_key;
    v_order_type := coalesce(nullif(r.normalized_data->>'order_type',''), 'domestic');
    v_purchase_nature := coalesce(nullif(r.normalized_data->>'purchase_nature',''), 'other');
    v_affects_debt := coalesce((r.normalized_data->>'affects_debt')::boolean, false);
    if v_affects_debt then
      v_supplier := kbit_import_supplier(
        r.normalized_data->>'partner_code',
        r.normalized_data->>'partner_name',
        r.normalized_data->>'tax_code'
      );
    else
      v_supplier := null;
    end if;
    insert into supplier_orders(
      company_id, supplier_id, order_code, order_type, order_date, currency,
      goods_value, vat_amount, invoice_template, invoice_symbol, invoice_no,
      invoice_date, supplier_tax_code, warehouse_id, stock_added, created_by,
      landed_cost_vnd, recoverable_import_vat_vnd, import_batch_id, source_fingerprint,
      creates_payable, purchase_nature, source_partner_name
    ) values (
      v_batch.company_id, v_supplier,
      'IMP-M-' || left(replace(p_batch_id::text,'-',''), 8) || '-' || r.row_number,
      case
        when v_purchase_nature in ('freight','service','other') and v_affects_debt
          then 'domestic'::supplier_order_type
        else v_order_type::supplier_order_type
      end,
      (r.normalized_data->>'invoice_date')::date, 'VND',
      coalesce((r.normalized_data->>'subtotal')::numeric, 0),
      coalesce((r.normalized_data->>'vat_amount')::numeric, 0),
      r.normalized_data->>'invoice_template', r.normalized_data->>'invoice_symbol',
      r.normalized_data->>'invoice_no', (r.normalized_data->>'invoice_date')::date,
      r.normalized_data->>'tax_code', v_warehouse, false, v_user,
      coalesce((r.normalized_data->>'subtotal')::numeric, 0), 0,
      p_batch_id, 'purchase:' || p_batch_id::text || ':' || v_key,
      v_affects_debt,
      v_purchase_nature,
      r.normalized_data->>'partner_name'
    ) returning id into v_order;

    v_has_items := false;
    for line in
      select *
        from import_staging_rows
       where batch_id = p_batch_id
         and row_kind = 'purchase_journal'
         and reconciliation_key = v_key
       order by row_number
    loop
      v_product := kbit_import_product(
        line.normalized_data->>'product_code',
        line.normalized_data->>'product_name',
        line.normalized_data->>'unit'
      );
      insert into supplier_order_items(
        order_id, product_id, description, qty, unit_price, unit_cost,
        accounting_treatment, accounting_category_id, source_line_amount
      ) values (
        v_order, v_product, line.normalized_data->>'product_name',
        coalesce((line.normalized_data->>'quantity')::numeric, 0),
        coalesce((line.normalized_data->>'unit_price')::numeric, 0),
        case
          when coalesce((line.normalized_data->>'quantity')::numeric, 0) <> 0
            then round(
              coalesce((line.normalized_data->>'amount')::numeric, 0)
              / (line.normalized_data->>'quantity')::numeric,
              8
            )
          else coalesce((line.normalized_data->>'unit_price')::numeric, 0)
        end,
        'inventory', null, coalesce((line.normalized_data->>'amount')::numeric,0)
      ) returning id into v_item;
      update import_staging_rows
         set mapping_status = 'created', target_table = 'supplier_order_items', target_id = v_item
       where id = line.id;
      v_has_items := true;
    end loop;
    if not v_has_items
       and not (
         v_order_type = 'import'
         and (
           v_purchase_nature in ('goods','import_duty','import_vat')
           or (
             nullif(r.normalized_data->>'customs_declaration_no','') is not null
             and v_purchase_nature in ('freight','service','other')
           )
         )
       ) then
      insert into supplier_order_items(
        order_id, product_id, description, qty, unit_price, unit_cost,
        accounting_treatment, accounting_category_id, source_line_amount
      ) values (
        v_order, null, coalesce(nullif(r.normalized_data->>'content',''), 'Mua hàng/dịch vụ'),
        1, coalesce((r.normalized_data->>'subtotal')::numeric, 0), null,
        'expense', v_category, coalesce((r.normalized_data->>'subtotal')::numeric,0)
      );
    end if;
    update import_staging_rows
       set mapping_status = 'created', target_table = 'supplier_orders', target_id = v_order
     where id = r.id;
  end loop;

  -- 4. Tách công nợ nhập khẩu theo đúng chủ nợ; thuế nhập khẩu vào giá,
  --    VAT nhập khẩu theo dõi khấu trừ và không vào giá.
  for r in
    select *
      from import_staging_rows
     where batch_id = p_batch_id
       and row_kind = 'purchase_listing'
       and normalized_data->>'order_type' = 'import'
       and coalesce(normalized_data->>'purchase_nature','goods') = 'goods'
  loop
    v_order := r.target_id;
    v_declaration_no := r.normalized_data->>'customs_declaration_no';
    select supplier_id into v_supplier from supplier_orders where id = v_order;
    insert into import_cost_components(
      company_id,supplier_order_id,kind,creditor_type,creditor_supplier_id,
      currency,amount,exchange_rate,capitalizable,document_date,document_no,
      description,source_fingerprint
    ) values (
      v_batch.company_id,v_order,'goods','supplier',v_supplier,
      'VND',coalesce((r.normalized_data->>'subtotal')::numeric,0),1,true,
      (r.normalized_data->>'invoice_date')::date,r.normalized_data->>'invoice_no',
      'Tiền hàng nhập khẩu','import-component:goods:' || p_batch_id::text || ':' || r.id::text
    );

    select coalesce(sum((d.normalized_data->>'subtotal')::numeric),0)
      into v_duty_amount
      from import_staging_rows d
     where d.batch_id=p_batch_id
       and d.row_kind='purchase_listing'
       and d.normalized_data->>'purchase_nature'='import_duty'
       and nullif(d.normalized_data->>'customs_declaration_no','') = nullif(v_declaration_no,'');
    v_import_vat_amount := coalesce((r.normalized_data->>'vat_amount')::numeric,0);

    if v_duty_amount > 0 then
      insert into import_cost_components(
        company_id,supplier_order_id,kind,creditor_type,creditor_supplier_id,
        currency,amount,exchange_rate,capitalizable,document_date,document_no,
        description,source_fingerprint
      ) values (
        v_batch.company_id,v_order,'import_duty','tax_authority',null,
        'VND',v_duty_amount,1,true,(r.normalized_data->>'invoice_date')::date,
        r.normalized_data->>'invoice_no','Thuế nhập khẩu cộng vào giá nhập kho',
        'import-component:duty:' || p_batch_id::text || ':' || r.id::text
      );
    end if;

    -- Phí vận chuyển/dịch vụ có cùng số tờ khai là cấu phần giá nhập kho.
    -- Công nợ nằm ở đúng đơn vị cung cấp dịch vụ thông qua cấu phần này;
    -- supplier_order nguồn đã được đặt creates_payable=false để không ghi trùng.
    for line in
      select d.*
        from import_staging_rows d
       where d.batch_id=p_batch_id
         and d.row_kind='purchase_listing'
         and d.normalized_data->>'purchase_nature' in ('freight','service','other')
         and nullif(d.normalized_data->>'customs_declaration_no','') = nullif(v_declaration_no,'')
    loop
      select supplier_id into v_supplier
        from supplier_orders
       where id=line.target_id;
      insert into import_cost_components(
        company_id,supplier_order_id,kind,creditor_type,creditor_supplier_id,
        currency,amount,exchange_rate,capitalizable,document_date,document_no,
        description,source_fingerprint
      ) values (
        v_batch.company_id,v_order,line.normalized_data->>'purchase_nature',
        'service_provider',v_supplier,
        'VND',coalesce((line.normalized_data->>'subtotal')::numeric,0),1,true,
        (line.normalized_data->>'invoice_date')::date,line.normalized_data->>'invoice_no',
        coalesce(nullif(line.normalized_data->>'content',''),'Chi phí liên quan lô nhập khẩu'),
        'import-component:service:' || p_batch_id::text || ':' || line.id::text
      )
      on conflict do nothing;
    end loop;

    if v_import_vat_amount > 0 then
      insert into import_cost_components(
        company_id,supplier_order_id,kind,creditor_type,creditor_supplier_id,
        currency,amount,exchange_rate,capitalizable,document_date,document_no,
        description,source_fingerprint
      ) values (
        v_batch.company_id,v_order,'import_vat','tax_authority',null,
        'VND',v_import_vat_amount,1,false,(r.normalized_data->>'invoice_date')::date,
        r.normalized_data->>'invoice_no','VAT nhập khẩu được khấu trừ, không vào giá vốn',
        'import-component:vat:' || p_batch_id::text || ':' || r.id::text
      );
    end if;

    select coalesce(sum(amount_vnd),0)
      into v_duty_amount
      from import_cost_components
     where supplier_order_id=v_order
       and capitalizable;
    update supplier_orders set
      landed_cost_vnd=v_duty_amount,
      recoverable_import_vat_vnd=v_import_vat_amount
    where id=v_order;
  end loop;

  -- Phân bổ thuế nhập khẩu và phí trực tiếp vào từng dòng hàng trước khi nhập kho.
  -- VAT nhập khẩu không capitalizable nên không đi vào đơn giá kho.
  for r in
    select id, landed_cost_vnd
      from supplier_orders
     where import_batch_id=p_batch_id
       and order_type='import'
       and purchase_nature='goods'
  loop
    select coalesce(sum(source_line_amount),0)
      into v_total_line_value
      from supplier_order_items
     where order_id=r.id and product_id is not null;
    v_capitalizable_extra := r.landed_cost_vnd - v_total_line_value;
    if v_total_line_value > 0 and abs(v_capitalizable_extra) > 0.01 then
      update supplier_order_items
         set unit_cost = round(
           (
             source_line_amount
             + v_capitalizable_extra * source_line_amount / v_total_line_value
           ) / qty,
           8
         )
       where order_id=r.id
         and product_id is not null
         and qty <> 0;
    end if;
  end loop;

  -- 5. Bảng kê bán ra tạo toàn bộ hóa đơn; quà tặng không tạo doanh thu/công nợ.
  for r in
    select *
      from import_staging_rows
     where batch_id = p_batch_id and row_kind = 'sales_listing'
     order by (normalized_data->>'invoice_date')::date, row_number
  loop
    v_key := r.reconciliation_key;
    v_is_gift := coalesce((r.normalized_data->>'is_gift')::boolean, false);
    v_affects_debt := coalesce((r.normalized_data->>'affects_debt')::boolean, false);
    if v_affects_debt then
      v_customer := kbit_import_customer(
        r.normalized_data->>'partner_code',
        r.normalized_data->>'partner_name',
        r.normalized_data->>'tax_code'
      );
    else
      v_customer := null;
    end if;
    insert into customer_orders(
      company_id, customer_id, order_code, order_date, grand_total,
      fulfillment_status, payment_status, warehouse_id, stock_deducted,
      invoice_template, invoice_symbol, invoice_no, invoice_date, customer_tax_code,
      vat_amount, is_gift, recognize_revenue, creates_receivable, created_by,
      import_batch_id, source_fingerprint, source_partner_name
    ) values (
      v_batch.company_id, v_customer,
      'IMP-B-' || left(replace(p_batch_id::text,'-',''), 8) || '-' || r.row_number,
      (r.normalized_data->>'invoice_date')::date,
      coalesce((r.normalized_data->>'grand_total')::numeric, 0),
      'delivered', 'unpaid', v_warehouse, false,
      r.normalized_data->>'invoice_template', r.normalized_data->>'invoice_symbol',
      r.normalized_data->>'invoice_no', (r.normalized_data->>'invoice_date')::date,
      r.normalized_data->>'tax_code', coalesce((r.normalized_data->>'vat_amount')::numeric, 0),
      v_is_gift, not v_is_gift, v_affects_debt, v_user,
      p_batch_id, 'sales:' || p_batch_id::text || ':' || v_key,
      r.normalized_data->>'partner_name'
    ) returning id into v_order;

    v_has_items := false;
    for line in
      select *
        from import_staging_rows
       where batch_id = p_batch_id
         and row_kind = 'sales_journal'
         and reconciliation_key = v_key
       order by row_number
    loop
      v_product := kbit_import_product(
        line.normalized_data->>'product_code',
        line.normalized_data->>'product_name',
        line.normalized_data->>'unit'
      );
      insert into customer_order_items(
        order_id, product_id, description, qty, unit_price, source_line_amount
      )
      values (
        v_order, v_product, line.normalized_data->>'product_name',
        coalesce((line.normalized_data->>'quantity')::numeric, 0),
        coalesce((line.normalized_data->>'unit_price')::numeric, 0),
        coalesce((line.normalized_data->>'amount')::numeric,0)
      ) returning id into v_item;
      update import_staging_rows
         set mapping_status = 'created', target_table = 'customer_order_items', target_id = v_item
       where id = line.id;
      v_has_items := true;
    end loop;
    if not v_has_items then
      insert into customer_order_items(
        order_id, product_id, description, qty, unit_price, source_line_amount
      )
      values (
        v_order, null, coalesce(nullif(r.normalized_data->>'content',''), 'Bán hàng/dịch vụ'),
        1, coalesce((r.normalized_data->>'subtotal')::numeric, 0),
        coalesce((r.normalized_data->>'subtotal')::numeric,0)
      );
    end if;
    update import_staging_rows
       set mapping_status = 'created', target_table = 'customer_orders', target_id = v_order
     where id = r.id;
  end loop;

  -- 6. Ghi kho đúng thời gian: nhập trước xuất nếu cùng ngày.
  for evt in
    select id, order_date as txn_date, 1 as priority, 'receipt' as kind
      from supplier_orders where import_batch_id = p_batch_id and exists (
        select 1 from supplier_order_items where order_id = supplier_orders.id and product_id is not null
      )
    union all
    select id, order_date as txn_date, 2 as priority, 'issue' as kind
      from customer_orders where import_batch_id = p_batch_id and exists (
        select 1 from customer_order_items where order_id = customer_orders.id and product_id is not null
      )
    order by txn_date, priority, id
  loop
    if evt.kind = 'receipt' then
      select jsonb_agg(jsonb_build_object(
        'product_id', product_id, 'qty', qty, 'unit_cost', unit_cost
      ) order by id) into v_items
        from supplier_order_items where order_id = evt.id and product_id is not null;
      perform kbit_receive_stock_batch(
        v_warehouse, v_items, evt.txn_date,
        'Import batch ' || p_batch_id::text || ' purchase ' || evt.id::text,
        v_user
      );
      update warehouse_transactions
         set import_batch_id = p_batch_id
       where company_id = v_batch.company_id
         and txn_date = evt.txn_date
         and note = 'Import batch ' || p_batch_id::text || ' purchase ' || evt.id::text;
      update supplier_orders set stock_added = true where id = evt.id;
    else
      select jsonb_agg(jsonb_build_object(
        'product_id', product_id, 'qty', qty
      ) order by id) into v_items
        from customer_order_items where order_id = evt.id and product_id is not null;
      perform kbit_deduct_order_batch(v_warehouse, evt.id, v_items, v_user, evt.txn_date);
      update warehouse_transactions
         set import_batch_id = p_batch_id
       where ref_order_id = evt.id;
      update customer_orders set stock_deducted = true where id = evt.id;
    end if;
  end loop;

  -- NXT nguồn chỉ dùng để đối chiếu. Giá xuất và tồn cuối ở app giữ nguyên
  -- kết quả bình quân liên hoàn đã hình thành từ tồn đầu + nhập + xuất ở trên.

  -- 7. Công nợ đầu kỳ.
  for r in
    select *
      from import_staging_rows
     where batch_id = p_batch_id
       and row_kind in ('receivable_opening','payable_opening')
       and coalesce(normalized_data->>'record_type','summary') = 'summary'
    order by row_kind, row_number
  loop
    if r.row_kind = 'receivable_opening' then
      v_customer := kbit_import_customer(
        r.normalized_data->>'partner_code',
        r.normalized_data->>'partner_name',
        r.normalized_data->>'tax_code'
      );
      if exists (
        select 1 from debt_opening_balances
         where company_id=v_batch.company_id and partner_type='customer'
           and partner_id=v_customer and year=v_year
      ) then
        raise exception 'CONG_NO_DAU_KY_KH_DA_TON_TAI: %',r.normalized_data->>'partner_code';
      end if;
      insert into debt_opening_balances(
        company_id, partner_type, partner_id, year, debit_amount, credit_amount,
        note, created_by, import_batch_id
      ) values (
        v_batch.company_id, 'customer', v_customer, v_year,
        coalesce((r.normalized_data->>'opening_debit')::numeric, 0),
        coalesce((r.normalized_data->>'opening_credit')::numeric, 0),
        'Import batch ' || p_batch_id::text, auth.uid(), p_batch_id
      ) on conflict(company_id,partner_type,partner_id,year) do update set
        debit_amount = excluded.debit_amount,
        credit_amount = excluded.credit_amount,
        note = excluded.note,
        import_batch_id = excluded.import_batch_id,
        updated_at = now();
      update import_staging_rows set mapping_status='created',target_table='customers',target_id=v_customer where id=r.id;
    else
      v_supplier := kbit_import_supplier(
        r.normalized_data->>'partner_code',
        r.normalized_data->>'partner_name',
        r.normalized_data->>'tax_code'
      );
      if exists (
        select 1 from debt_opening_balances
         where company_id=v_batch.company_id and partner_type='supplier'
           and partner_id=v_supplier and year=v_year
      ) then
        raise exception 'CONG_NO_DAU_KY_NCC_DA_TON_TAI: %',r.normalized_data->>'partner_code';
      end if;
      insert into debt_opening_balances(
        company_id, partner_type, partner_id, year, debit_amount, credit_amount,
        note, created_by, import_batch_id
      ) values (
        v_batch.company_id, 'supplier', v_supplier, v_year,
        coalesce((r.normalized_data->>'opening_debit')::numeric, 0),
        coalesce((r.normalized_data->>'opening_credit')::numeric, 0),
        'Import batch ' || p_batch_id::text, auth.uid(), p_batch_id
      ) on conflict(company_id,partner_type,partner_id,year) do update set
        debit_amount = excluded.debit_amount,
        credit_amount = excluded.credit_amount,
        note = excluded.note,
        import_batch_id = excluded.import_batch_id,
        updated_at = now();
      update import_staging_rows set mapping_status='created',target_table='suppliers',target_id=v_supplier where id=r.id;
    end if;
  end loop;

  -- 8. Chỉ file SPNH độc lập mới tạo giao dịch ngân hàng. Chi tiết công nợ
  -- là tài liệu đối chiếu/mapping, tuyệt đối không được biến thành dòng tiền.
  -- Chỉ dòng khớp đối tác trong file công nợ mới tự giảm nợ;
  -- dòng còn lại vẫn vào dòng tiền nhưng không tạo công nợ âm giả.
  for r in
    select * from import_staging_rows
     where batch_id=p_batch_id and row_kind='bank'
     order by (normalized_data->>'txn_date')::date,row_number
  loop
    v_affects_debt := coalesce((r.normalized_data->>'affects_debt')::boolean,false);
    if r.normalized_data->>'direction'='thu' then
      v_customer := case when v_affects_debt then
        kbit_import_customer(
          r.normalized_data->>'partner_code',
          r.normalized_data->>'partner_name',
          r.normalized_data->>'tax_code'
        )
        else null end;
      insert into income_transactions(
        company_id,bank_account_id,customer_id,amount,amount_vnd,txn_date,
        is_unassigned,note,status,created_by,import_batch_id,source_fingerprint,affects_debt
        ,source_partner_name
      ) values (
        v_batch.company_id,v_bank,v_customer,
        (r.normalized_data->>'amount')::numeric,(r.normalized_data->>'amount')::numeric,
        (r.normalized_data->>'txn_date')::date,not v_affects_debt,
        coalesce(r.normalized_data->>'content','Thu theo SPNH'),
        'confirmed',v_user,p_batch_id,'bank:'||p_batch_id::text||':'||r.id::text,v_affects_debt,
        r.normalized_data->>'partner_name'
      ) returning id into v_item;
    else
      if v_affects_debt then
        v_supplier := kbit_import_supplier(
          r.normalized_data->>'partner_code',
          r.normalized_data->>'partner_name',
          r.normalized_data->>'tax_code'
        );
      else
        v_supplier := null;
      end if;
      insert into expense_transactions(
        company_id,bank_account_id,supplier_id,region,txn_date,note,amount_vnd,
        status,created_by,import_batch_id,source_fingerprint,affects_debt,source_partner_name
      ) values (
        v_batch.company_id,v_bank,v_supplier,'VN',(r.normalized_data->>'txn_date')::date,
        coalesce(r.normalized_data->>'content','Chi theo SPNH'),
        (r.normalized_data->>'amount')::numeric,'confirmed',v_user,p_batch_id,
        'bank:'||p_batch_id::text||':'||r.id::text,v_affects_debt,
        r.normalized_data->>'partner_name'
      ) returning id into v_item;
    end if;
    update import_staging_rows set
      mapping_status='created',
      target_table=case when normalized_data->>'direction'='thu' then 'income_transactions' else 'expense_transactions' end,
      target_id=v_item
    where id=r.id;
  end loop;

  -- 9. File tiền mặt độc lập, nếu có.
  for r in
    select * from import_staging_rows
     where batch_id = p_batch_id and row_kind = 'cash'
     order by (normalized_data->>'txn_date')::date, row_number
  loop
    v_affects_debt := coalesce((r.normalized_data->>'affects_debt')::boolean,false);
    if r.normalized_data->>'direction' = 'thu' then
      v_customer := case when v_affects_debt then
        kbit_import_customer(
          r.normalized_data->>'partner_code',
          r.normalized_data->>'partner_name',
          r.normalized_data->>'tax_code'
        )
        else null end;
      v_supplier := null;
    else
      v_supplier := case when v_affects_debt then
        kbit_import_supplier(
          r.normalized_data->>'partner_code',
          r.normalized_data->>'partner_name',
          r.normalized_data->>'tax_code'
        )
        else null end;
      v_customer := null;
    end if;
    insert into cash_book(
      company_id, txn_date, doi_tac, noi_dung, so_tien, direction, status,
      customer_id, supplier_id, created_by, import_batch_id, source_fingerprint
    ) values (
      v_batch.company_id, (r.normalized_data->>'txn_date')::date,
      r.normalized_data->>'partner_name', coalesce(r.normalized_data->>'content','Nhập sổ quỹ'),
      (r.normalized_data->>'amount')::numeric, r.normalized_data->>'direction',
      'confirmed', v_customer, v_supplier, v_user, p_batch_id,
      'cash:' || p_batch_id::text || ':' || r.id::text
    ) returning id into v_item;
    update import_staging_rows set mapping_status='created',target_table='cash_book',target_id=v_item where id=r.id;
  end loop;

  -- 10. Đối chiếu công nợ hình thành tự nhiên. Không tạo dòng bù.
  for r in
    select *
      from import_staging_rows
     where batch_id = p_batch_id
       and row_kind = 'receivable_opening'
       and coalesce(normalized_data->>'record_type','summary') = 'summary'
  loop
    v_customer := kbit_import_customer(
      r.normalized_data->>'partner_code',
      r.normalized_data->>'partner_name',
      r.normalized_data->>'tax_code'
    );
    v_expected_debit := coalesce((r.normalized_data->>'period_debit')::numeric,0);
    v_expected_credit := coalesce((r.normalized_data->>'period_credit')::numeric,0);
    select coalesce(sum(grand_total),0) into v_actual_debit
      from customer_orders where import_batch_id=p_batch_id and customer_id=v_customer and creates_receivable;
    select
      coalesce((select sum(amount) from income_transactions
                 where import_batch_id=p_batch_id and customer_id=v_customer and affects_debt),0)
      + coalesce((select sum(so_tien) from cash_book where import_batch_id=p_batch_id and customer_id=v_customer and direction='thu'),0)
      into v_actual_credit;
    if abs(v_actual_debit-v_expected_debit)>1 or abs(v_actual_credit-v_expected_credit)>1 then
      raise exception 'POST_AR_LECH: %, no app/nguon=%/%, co app/nguon=%/%',
        r.normalized_data->>'partner_code',
        v_actual_debit,v_expected_debit,v_actual_credit,v_expected_credit;
    end if;
    insert into import_checks(batch_id,check_code,status,expected_value,actual_value,source_ref)
    values
      (p_batch_id,'POST_AR_DEBIT','passed',v_expected_debit,v_actual_debit,r.normalized_data->>'partner_code'),
      (p_batch_id,'POST_AR_CREDIT','passed',v_expected_credit,v_actual_credit,r.normalized_data->>'partner_code')
    on conflict(batch_id,check_code,source_ref) do update set
      status='passed',expected_value=excluded.expected_value,actual_value=excluded.actual_value,updated_at=now();
  end loop;

  for r in
    select *
      from import_staging_rows
     where batch_id = p_batch_id
       and row_kind = 'payable_opening'
       and coalesce(normalized_data->>'record_type','summary') = 'summary'
  loop
    v_supplier := kbit_import_supplier(
      r.normalized_data->>'partner_code',
      r.normalized_data->>'partner_name',
      r.normalized_data->>'tax_code'
    );
    v_expected_debit := coalesce((r.normalized_data->>'period_debit')::numeric,0);
    v_expected_credit := coalesce((r.normalized_data->>'period_credit')::numeric,0);
    select
      coalesce((select sum(amount_vnd) from expense_transactions
                 where import_batch_id=p_batch_id and supplier_id=v_supplier and affects_debt),0)
      + coalesce((select sum(so_tien) from cash_book where import_batch_id=p_batch_id and supplier_id=v_supplier and direction='chi'),0)
      into v_actual_debit;
    select coalesce(sum(payable_total),0) into v_actual_credit
      from supplier_orders
     where import_batch_id=p_batch_id and supplier_id=v_supplier and creates_payable;
    if abs(v_actual_debit-v_expected_debit)>1 or abs(v_actual_credit-v_expected_credit)>1 then
      raise exception 'POST_AP_LECH: %, no app/nguon=%/%, co app/nguon=%/%',
        r.normalized_data->>'partner_code',
        v_actual_debit,v_expected_debit,v_actual_credit,v_expected_credit;
    end if;
    insert into import_checks(batch_id,check_code,status,expected_value,actual_value,source_ref)
    values
      (p_batch_id,'POST_AP_DEBIT','passed',v_expected_debit,v_actual_debit,r.normalized_data->>'partner_code'),
      (p_batch_id,'POST_AP_CREDIT','passed',v_expected_credit,v_actual_credit,r.normalized_data->>'partner_code')
    on conflict(batch_id,check_code,source_ref) do update set
      status='passed',expected_value=excluded.expected_value,actual_value=excluded.actual_value,updated_at=now();
  end loop;

  -- 11. Cổng hậu kiểm sau ghi sổ. Chỉ cần một chỉ tiêu khác nguồn thì
  -- toàn bộ transaction bị hủy, không để lô nửa đúng nửa sai.
  select count(*) into v_expected_debit
    from import_staging_rows where batch_id=p_batch_id and row_kind='sales_listing';
  select count(*) into v_actual_debit
    from customer_orders where import_batch_id=p_batch_id;
  if v_actual_debit <> v_expected_debit then
    raise exception 'POST_SALES_COUNT_LECH: app/source=%/%',v_actual_debit,v_expected_debit;
  end if;
  insert into import_checks(batch_id,check_code,status,expected_value,actual_value,source_ref)
  values(p_batch_id,'POST_SALES_COUNT','passed',v_expected_debit,v_actual_debit,'Bảng kê bán ra sau ghi sổ')
  on conflict(batch_id,check_code,source_ref) do update set
    status='passed',expected_value=excluded.expected_value,actual_value=excluded.actual_value,updated_at=now();

  select coalesce(sum((normalized_data->>'grand_total')::numeric),0) into v_expected_debit
    from import_staging_rows where batch_id=p_batch_id and row_kind='sales_listing';
  select coalesce(sum(grand_total),0) into v_actual_debit
    from customer_orders where import_batch_id=p_batch_id;
  if abs(v_actual_debit-v_expected_debit) > 0.01 then
    raise exception 'POST_SALES_TOTAL_LECH: app/source=%/%',v_actual_debit,v_expected_debit;
  end if;
  insert into import_checks(batch_id,check_code,status,expected_value,actual_value,source_ref)
  values(p_batch_id,'POST_SALES_TOTAL','passed',v_expected_debit,v_actual_debit,'Tổng tiền bảng kê bán ra sau ghi sổ')
  on conflict(batch_id,check_code,source_ref) do update set
    status='passed',expected_value=excluded.expected_value,actual_value=excluded.actual_value,updated_at=now();

  select count(*) into v_expected_debit
    from import_staging_rows where batch_id=p_batch_id and row_kind='purchase_listing';
  select count(*) into v_actual_debit
    from supplier_orders where import_batch_id=p_batch_id;
  if v_actual_debit <> v_expected_debit then
    raise exception 'POST_PURCHASE_COUNT_LECH: app/source=%/%',v_actual_debit,v_expected_debit;
  end if;
  insert into import_checks(batch_id,check_code,status,expected_value,actual_value,source_ref)
  values(p_batch_id,'POST_PURCHASE_COUNT','passed',v_expected_debit,v_actual_debit,'Bảng kê mua vào sau ghi sổ')
  on conflict(batch_id,check_code,source_ref) do update set
    status='passed',expected_value=excluded.expected_value,actual_value=excluded.actual_value,updated_at=now();

  select coalesce(sum((normalized_data->>'grand_total')::numeric),0) into v_expected_debit
    from import_staging_rows where batch_id=p_batch_id and row_kind='purchase_listing';
  select coalesce(sum(goods_value+coalesce(vat_amount,0)),0) into v_actual_debit
    from supplier_orders where import_batch_id=p_batch_id;
  if abs(v_actual_debit-v_expected_debit) > 0.01 then
    raise exception 'POST_PURCHASE_TOTAL_LECH: app/source=%/%',v_actual_debit,v_expected_debit;
  end if;
  insert into import_checks(batch_id,check_code,status,expected_value,actual_value,source_ref)
  values(p_batch_id,'POST_PURCHASE_TOTAL','passed',v_expected_debit,v_actual_debit,'Tổng tiền bảng kê mua vào sau ghi sổ')
  on conflict(batch_id,check_code,source_ref) do update set
    status='passed',expected_value=excluded.expected_value,actual_value=excluded.actual_value,updated_at=now();

  select count(*) into v_expected_debit
    from import_staging_rows where batch_id=p_batch_id and row_kind='sales_journal';
  select count(*) into v_actual_debit
    from customer_order_items coi
    join customer_orders co on co.id=coi.order_id
   where co.import_batch_id=p_batch_id and coi.product_id is not null;
  if v_actual_debit <> v_expected_debit then
    raise exception 'POST_SALES_JOURNAL_COUNT_LECH: app/source=%/%',v_actual_debit,v_expected_debit;
  end if;
  insert into import_checks(batch_id,check_code,status,expected_value,actual_value,source_ref)
  values(p_batch_id,'POST_SALES_JOURNAL_COUNT','passed',v_expected_debit,v_actual_debit,'Nhật ký bán sau ghi sổ')
  on conflict(batch_id,check_code,source_ref) do update set
    status='passed',expected_value=excluded.expected_value,actual_value=excluded.actual_value,updated_at=now();

  select coalesce(sum((normalized_data->>'amount')::numeric),0) into v_expected_debit
    from import_staging_rows where batch_id=p_batch_id and row_kind='sales_journal';
  select coalesce(sum(coi.source_line_amount),0) into v_actual_debit
    from customer_order_items coi
    join customer_orders co on co.id=coi.order_id
   where co.import_batch_id=p_batch_id and coi.product_id is not null;
  if abs(v_actual_debit-v_expected_debit) > 0.01 then
    raise exception 'POST_SALES_JOURNAL_TOTAL_LECH: app/source=%/%',v_actual_debit,v_expected_debit;
  end if;
  insert into import_checks(batch_id,check_code,status,expected_value,actual_value,source_ref)
  values(p_batch_id,'POST_SALES_JOURNAL_TOTAL','passed',v_expected_debit,v_actual_debit,'Tổng tiền nhật ký bán sau ghi sổ')
  on conflict(batch_id,check_code,source_ref) do update set
    status='passed',expected_value=excluded.expected_value,actual_value=excluded.actual_value,updated_at=now();

  select count(*) into v_expected_debit
    from import_staging_rows where batch_id=p_batch_id and row_kind='purchase_journal';
  select count(*) into v_actual_debit
    from supplier_order_items soi
    join supplier_orders so on so.id=soi.order_id
   where so.import_batch_id=p_batch_id and soi.product_id is not null;
  if v_actual_debit <> v_expected_debit then
    raise exception 'POST_PURCHASE_JOURNAL_COUNT_LECH: app/source=%/%',v_actual_debit,v_expected_debit;
  end if;
  insert into import_checks(batch_id,check_code,status,expected_value,actual_value,source_ref)
  values(p_batch_id,'POST_PURCHASE_JOURNAL_COUNT','passed',v_expected_debit,v_actual_debit,'Nhật ký mua sau ghi sổ')
  on conflict(batch_id,check_code,source_ref) do update set
    status='passed',expected_value=excluded.expected_value,actual_value=excluded.actual_value,updated_at=now();

  select coalesce(sum((normalized_data->>'amount')::numeric),0) into v_expected_debit
    from import_staging_rows where batch_id=p_batch_id and row_kind='purchase_journal';
  select coalesce(sum(soi.source_line_amount),0) into v_actual_debit
    from supplier_order_items soi
    join supplier_orders so on so.id=soi.order_id
   where so.import_batch_id=p_batch_id and soi.product_id is not null;
  if abs(v_actual_debit-v_expected_debit) > 0.01 then
    raise exception 'POST_PURCHASE_JOURNAL_TOTAL_LECH: app/source=%/%',v_actual_debit,v_expected_debit;
  end if;
  insert into import_checks(batch_id,check_code,status,expected_value,actual_value,source_ref)
  values(p_batch_id,'POST_PURCHASE_JOURNAL_TOTAL','passed',v_expected_debit,v_actual_debit,'Tổng tiền nhật ký mua sau ghi sổ')
  on conflict(batch_id,check_code,source_ref) do update set
    status='passed',expected_value=excluded.expected_value,actual_value=excluded.actual_value,updated_at=now();

  for r in
    select * from (values
      ('POST_AR_OPENING_DEBIT','Phải thu đầu kỳ bên Nợ','receivable_opening','customer','opening_debit','debit_amount'),
      ('POST_AR_OPENING_CREDIT','Phải thu đầu kỳ bên Có','receivable_opening','customer','opening_credit','credit_amount'),
      ('POST_AP_OPENING_DEBIT','Phải trả đầu kỳ bên Nợ','payable_opening','supplier','opening_debit','debit_amount'),
      ('POST_AP_OPENING_CREDIT','Phải trả đầu kỳ bên Có','payable_opening','supplier','opening_credit','credit_amount')
    ) as x(check_code,source_label,row_kind,party_kind,source_field,target_field)
  loop
    execute format(
      'select coalesce(sum((normalized_data->>%L)::numeric),0)
         from import_staging_rows
        where batch_id=$1 and row_kind=%L
          and coalesce(normalized_data->>''record_type'',''summary'')=''summary''',
      r.source_field,r.row_kind
    ) into v_expected_debit using p_batch_id;
    execute format(
      'select coalesce(sum(%I),0)
         from debt_opening_balances
        where import_batch_id=$1 and partner_type=%L',
      r.target_field,r.party_kind
    ) into v_actual_debit using p_batch_id;
    if abs(v_actual_debit-v_expected_debit) > 0.01 then
      raise exception '%_LECH: app/source=%/%',r.check_code,v_actual_debit,v_expected_debit;
    end if;
    insert into import_checks(batch_id,check_code,status,expected_value,actual_value,source_ref)
    values(p_batch_id,r.check_code,'passed',v_expected_debit,v_actual_debit,r.source_label)
    on conflict(batch_id,check_code,source_ref) do update set
      status='passed',expected_value=excluded.expected_value,actual_value=excluded.actual_value,updated_at=now();
  end loop;

  for r in
    select * from (values
      ('POST_NXT_OPENING_QTY','Số lượng tồn đầu kỳ','opening','opening_quantity'),
      ('POST_NXT_RECEIPT_QTY','Số lượng nhập kho','receipt','receipt_quantity'),
      ('POST_NXT_ISSUE_QTY','Số lượng xuất kho','order_deduction','issue_quantity')
    ) as x(check_code,source_label,txn_kind,source_field)
  loop
    execute format(
      'select coalesce(sum((normalized_data->>%L)::numeric),0)
         from import_staging_rows where batch_id=$1 and row_kind=''inventory''',
      r.source_field
    ) into v_expected_debit using p_batch_id;
    select coalesce(sum(qty),0) into v_actual_debit
      from warehouse_transactions
     where import_batch_id=p_batch_id and txn_type::text=r.txn_kind;
    if abs(v_actual_debit-v_expected_debit) > 0.00001 then
      raise exception '%_LECH: app/source=%/%',r.check_code,v_actual_debit,v_expected_debit;
    end if;
    insert into import_checks(batch_id,check_code,status,expected_value,actual_value,source_ref)
    values(p_batch_id,r.check_code,'passed',v_expected_debit,v_actual_debit,r.source_label)
    on conflict(batch_id,check_code,source_ref) do update set
      status='passed',expected_value=excluded.expected_value,actual_value=excluded.actual_value,updated_at=now();
  end loop;

  select coalesce(sum((normalized_data->>'closing_quantity')::numeric),0)
    into v_expected_debit
    from import_staging_rows where batch_id=p_batch_id and row_kind='inventory';
  select coalesce(sum(qty_on_hand),0)
    into v_actual_debit
    from warehouse_stock where warehouse_id=v_warehouse;
  if abs(v_actual_debit-v_expected_debit) > 0.00001 then
    raise exception 'POST_NXT_CLOSING_QTY_LECH: app/source=%/%',v_actual_debit,v_expected_debit;
  end if;
  insert into import_checks(batch_id,check_code,status,expected_value,actual_value,source_ref)
  values(p_batch_id,'POST_NXT_CLOSING_QTY','passed',v_expected_debit,v_actual_debit,'Số lượng tồn cuối kỳ')
  on conflict(batch_id,check_code,source_ref) do update set
    status='passed',expected_value=excluded.expected_value,actual_value=excluded.actual_value,updated_at=now();

  for r in
    select * from (values
      ('POST_NXT_OPENING_VALUE','Giá trị đầu kỳ NXT','opening','opening_value'),
      ('POST_NXT_RECEIPT_VALUE','Giá trị nhập NXT','receipt','receipt_value'),
      ('POST_NXT_ISSUE_VALUE','Giá vốn xuất NXT','order_deduction','issue_value')
    ) as x(check_code,source_label,txn_kind,source_field)
  loop
    execute format(
      'select coalesce(sum((normalized_data->>%L)::numeric),0)
         from import_staging_rows where batch_id=$1 and row_kind=''inventory''',
      r.source_field
    ) into v_expected_debit using p_batch_id;
    select coalesce(sum(qty*coalesce(unit_cost,0)),0) into v_actual_debit
      from warehouse_transactions
     where import_batch_id=p_batch_id and txn_type::text=r.txn_kind;
    if r.txn_kind = 'opening'
       and abs(v_actual_debit-v_expected_debit) > 0.01 then
      raise exception '%_LECH: app/source=%/%',r.check_code,v_actual_debit,v_expected_debit;
    end if;
    insert into import_checks(
      batch_id,check_code,status,expected_value,actual_value,source_ref,explanation
    )
    values(
      p_batch_id,r.check_code,
      case when abs(v_actual_debit-v_expected_debit) <= 0.01 then 'passed' else 'explained' end,
      v_expected_debit,v_actual_debit,r.source_label,
      case when abs(v_actual_debit-v_expected_debit) <= 0.01 then null
        when r.txn_kind = 'receipt'
          then 'App cộng chi phí trực tiếp và thuế nhập khẩu vào giá nhập kho theo quy tắc đã chốt; NXT nguồn chưa cộng đủ các cấu phần này.'
        else 'Chênh lệch do app tính bình quân liên hoàn từ chứng từ; NXT nguồn chỉ dùng đối chiếu, không khóa giá vốn.' end
    )
    on conflict(batch_id,check_code,source_ref) do update set
      status=excluded.status,expected_value=excluded.expected_value,
      actual_value=excluded.actual_value,explanation=excluded.explanation,updated_at=now();
  end loop;

  select coalesce(sum((normalized_data->>'closing_value')::numeric),0)
    into v_expected_debit
    from import_staging_rows where batch_id=p_batch_id and row_kind='inventory';
  select
    coalesce(sum(case
      when txn_type in ('opening','receipt','transfer_in') then qty*coalesce(unit_cost,0)
      when txn_type in ('issue','order_deduction','transfer_out') then -qty*coalesce(unit_cost,0)
      else 0 end),0)
    into v_actual_debit
    from warehouse_transactions where import_batch_id=p_batch_id;
  insert into import_checks(
    batch_id,check_code,status,expected_value,actual_value,source_ref,explanation
  )
  values(
    p_batch_id,'POST_NXT_CLOSING_VALUE',
    case when abs(v_actual_debit-v_expected_debit) <= 0.01 then 'passed' else 'explained' end,
    v_expected_debit,v_actual_debit,'Giá trị cuối kỳ NXT',
    case when abs(v_actual_debit-v_expected_debit) <= 0.01 then null
      else 'Chênh lệch tồn giá trị là hệ quả trực tiếp của giá vốn bình quân liên hoàn; số lượng vẫn phải khớp tuyệt đối.' end
  )
  on conflict(batch_id,check_code,source_ref) do update set
    status=excluded.status,expected_value=excluded.expected_value,
    actual_value=excluded.actual_value,explanation=excluded.explanation,updated_at=now();

  update import_batches
     set status='posted', posted_at=now(), updated_at=now()
   where id=p_batch_id;

  return jsonb_build_object(
    'batch_id', p_batch_id,
    'sales_orders', (select count(*) from customer_orders where import_batch_id=p_batch_id),
    'purchase_orders', (select count(*) from supplier_orders where import_batch_id=p_batch_id),
    'warehouse_rows', (select count(*) from warehouse_transactions where import_batch_id=p_batch_id),
    'debt_adjustments', (select count(*) from debt_adjustments where import_batch_id=p_batch_id)
  );
end;
$$;

create or replace function kbit_rebuild_inventory_company(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_qty numeric;
  v_avg numeric;
  v_new_qty numeric;
  v_new_avg numeric;
  v_sign numeric;
begin
  delete from warehouse_stock ws using warehouses w
   where ws.warehouse_id=w.id and w.company_id=p_company_id;
  insert into warehouse_stock(warehouse_id,product_id,qty_on_hand)
  select warehouse_id, product_id,
    sum(case when txn_type in ('receipt','transfer_in','opening') then qty else -qty end)
  from warehouse_transactions where company_id=p_company_id
  group by warehouse_id,product_id;

  delete from product_moving_cost where company_id=p_company_id;
  for r in
    select * from warehouse_transactions
     where company_id=p_company_id
     order by txn_date,
       case when txn_type='opening' then 0
            when txn_type in ('receipt','transfer_in') then 1
            when txn_type in ('issue','order_deduction','transfer_out') then 2
            else 3 end,
       created_at,id
  loop
    select qty_on_hand,avg_cost into v_qty,v_avg from product_moving_cost
     where company_id=p_company_id and product_id=r.product_id;
    if not found then v_qty:=0; v_avg:=0; end if;
    if r.txn_type in ('receipt','transfer_in','opening') then
      v_new_qty:=v_qty+r.qty;
      v_new_avg:=case when v_qty>0 and v_new_qty<>0
        then round((v_qty*v_avg+r.qty*coalesce(r.unit_cost,v_avg))/v_new_qty,8)
        else round(coalesce(r.unit_cost,v_avg),8) end;
    else
      v_new_qty:=v_qty-r.qty;
      v_new_avg:=v_avg;
    end if;
    insert into product_moving_cost(company_id,product_id,qty_on_hand,avg_cost,updated_at)
    values(p_company_id,r.product_id,v_new_qty,v_new_avg,now())
    on conflict(company_id,product_id) do update set
      qty_on_hand=excluded.qty_on_hand,avg_cost=excluded.avg_cost,updated_at=now();
  end loop;
end;
$$;

create or replace function kbit_rollback_import_batch(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_status text;
begin
  if not kbit_can_approve() then raise exception 'KHONG_DU_QUYEN_HOAN_TAC'; end if;
  select company_id,status into v_company,v_status from import_batches where id=p_batch_id for update;
  if not found then raise exception 'KHONG_TIM_THAY_LO_IMPORT'; end if;
  if v_status <> 'posted' then raise exception 'CHI_HOAN_TAC_LO_DA_GHI_SO'; end if;
  if not kbit_can_access_company(v_company) then raise exception 'KHONG_CO_QUYEN_CONG_TY'; end if;
  perform pg_advisory_xact_lock(hashtext(v_company::text));

  delete from warehouse_transactions where import_batch_id=p_batch_id;
  delete from income_transactions where import_batch_id=p_batch_id;
  delete from expense_transactions where import_batch_id=p_batch_id;
  delete from cash_book where import_batch_id=p_batch_id;
  delete from debt_adjustments where import_batch_id=p_batch_id;
  delete from debt_opening_balances where import_batch_id=p_batch_id;
  delete from customer_orders where import_batch_id=p_batch_id;
  delete from supplier_orders where import_batch_id=p_batch_id;
  perform kbit_rebuild_inventory_company(v_company);

  update import_staging_rows
     set mapping_status='pending',target_table=null,target_id=null
   where batch_id=p_batch_id;
  update import_batches set status='rolled_back',updated_at=now() where id=p_batch_id;
end;
$$;

revoke all on function kbit_approve_import_batch(uuid) from public;
revoke all on function kbit_explain_import_check(uuid,text) from public;
revoke all on function kbit_post_import_batch(uuid) from public;
revoke all on function kbit_rollback_import_batch(uuid) from public;
revoke all on function kbit_rebuild_inventory_company(uuid) from public;
grant execute on function kbit_approve_import_batch(uuid) to authenticated;
grant execute on function kbit_explain_import_check(uuid,text) to authenticated;
grant execute on function kbit_post_import_batch(uuid) to authenticated;
grant execute on function kbit_rollback_import_batch(uuid) to authenticated;

comment on function kbit_post_import_batch(uuid) is
  'Ghi sổ toàn bộ staging trong một transaction; tồn đầu kỳ -> nhập -> xuất, cùng ngày nhập trước xuất.';
comment on table debt_adjustments is
  'Phát sinh công nợ ngoài hóa đơn/ngân hàng/tiền mặt; bắt buộc có giải thích và nguồn lô import.';
