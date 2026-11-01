-- Audited billing, permissions and transactional editors.
alter table public.discounts add constraint discount_percentage_range
  check (type <> 'percentage' or value <= 100);
alter table public.discounts add constraint discount_usage_range
  check ((usage_limit is null or usage_limit > 0) and used_count >= 0);
alter table public.plans add constraint plan_date_range
  check (end_date is null or start_date is null or end_date >= start_date);
alter table public.product_variants add constraint variant_price_range check (extra_price >= 0);
alter table public.invoices add constraint invoice_amounts
  check (subtotal >= 0 and discount_amount between 0 and subtotal and tax_amount >= 0
    and total = subtotal - discount_amount + tax_amount);
alter table public.invoices add constraint invoice_dates
  check (period_end >= period_start and due_date >= issue_date);
alter table public.payments alter column is_demo set default false;
alter table public.payments add constraint payment_method
  check (method in ('card', 'bank_transfer', 'upi', 'paypal', 'cash'));

-- Role lookup is private to the current user (or an administrator).
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select (_user_id = public.current_user_id() or exists
    (select 1 from public.user_roles where user_id = public.current_user_id() and role = 'admin'))
    and exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
revoke execute on function public.has_role(uuid, app_role) from public;
grant execute on function public.has_role(uuid, app_role) to app_user;

-- Customers can inspect catalog records only for their own subscriptions.
drop policy "auth read products" on public.products;
create policy "read products" on public.products for select to app_user using
  (public.is_staff() or id in (select product_id from public.subscription_lines));
drop policy "auth read product_variants" on public.product_variants;
create policy "read product_variants" on public.product_variants for select to app_user using
  (public.is_staff() or id in (select variant_id from public.subscription_lines));
drop policy "auth read plans" on public.plans;
create policy "read plans" on public.plans for select to app_user using
  (public.is_staff() or id in (select plan_id from public.subscriptions));
drop policy "auth read discounts" on public.discounts;
create policy "read discounts" on public.discounts for select to app_user using
  (public.is_staff() or id in (select discount_id from public.subscriptions));

-- RLS controls rows, not columns. Product costs require a separate staff RPC.
revoke select on public.products from app_user;
grant select(id, name, type, sales_price, created_at) on public.products to app_user;
create or replace function public.list_products()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Not authorized'; end if;
  return coalesce((select jsonb_agg(row_data order by created_at desc) from
    (select p.created_at, to_jsonb(p) || jsonb_build_object('product_variants',
      coalesce((select jsonb_agg(v) from public.product_variants v where v.product_id = p.id), '[]'::jsonb)) as row_data
      from public.products p) catalog), '[]'::jsonb);
end $$;
revoke execute on function public.list_products() from public;
grant execute on function public.list_products() to app_user;

-- Defaults based on sequences need explicit privileges on a fresh local database.
grant usage on sequence public.subscription_seq, public.invoice_seq to app_user;

create index if not exists subscriptions_customer_idx on public.subscriptions(customer_id);
create index if not exists subscription_lines_subscription_idx on public.subscription_lines(subscription_id);
create index if not exists invoices_customer_idx on public.invoices(customer_id);
create index if not exists payments_invoice_idx on public.payments(invoice_id);
create index if not exists invoice_lines_invoice_idx on public.invoice_lines(invoice_id);

-- Lock the parent invoice before reading its balance. Concurrent payments must see
-- the preceding committed payment, rather than both accepting the same balance.
create or replace function public.validate_payment()
returns trigger language plpgsql set search_path = public as $$
declare v_total numeric; v_paid numeric; v_status invoice_status;
begin
  if tg_op = 'UPDATE' and new.invoice_id <> old.invoice_id then
    raise exception 'A payment cannot be moved to another invoice';
  end if;
  select total, status into v_total, v_status from public.invoices
    where id = case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end for update;
  if tg_op = 'DELETE' then return old; end if;
  if not found then raise exception 'Invoice not found'; end if;
  if v_status in ('cancelled','draft') then
    raise exception 'Cannot record payment on a % invoice', v_status;
  end if;
  select coalesce(sum(amount),0) into v_paid from public.payments
    where invoice_id = new.invoice_id and id <> new.id;
  if new.amount > v_total - v_paid then
    raise exception 'Payment exceeds outstanding balance of %', round(v_total - v_paid, 2);
  end if;
  return new;
end $$;
drop trigger trg_validate_payment on public.payments;
create trigger trg_validate_payment before insert or update or delete on public.payments
  for each row execute function public.validate_payment();

create or replace function public.validate_invoice()
returns trigger language plpgsql set search_path = public as $$
declare v_paid numeric;
begin
  select coalesce(sum(amount),0) into v_paid from public.payments where invoice_id = new.id;
  if v_paid > 0 and (new.status in ('draft','cancelled') or new.total < v_paid
      or new.customer_id <> old.customer_id or new.subscription_id <> old.subscription_id) then
    raise exception 'Invoice has recorded payments; reverse them before changing its billing details';
  end if;
  if new.status = 'paid' and v_paid < new.total then
    raise exception 'An invoice is paid only when its balance is settled';
  end if;
  if new.total > 0 and v_paid >= new.total then new.status := 'paid';
  elsif new.status = 'paid' then new.status := 'confirmed'; end if;
  return new;
end $$;
create trigger trg_validate_invoice before update on public.invoices
  for each row execute function public.validate_invoice();

-- Composite writes are a single transaction. Staff can replace their line items
-- here without receiving broad DELETE privileges on accounting tables.
create or replace function public.save_subscription(_id uuid, _data jsonb, _lines jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare sid uuid; s public.subscriptions; min_qty int; line record; previous public.subscriptions; p public.plans;
begin
  if not public.is_staff() then raise exception 'Not authorized'; end if;
  if jsonb_typeof(_lines) is distinct from 'array' or jsonb_array_length(_lines) = 0 then
    raise exception 'Add at least one line item';
  end if;
  s := jsonb_populate_record(null::public.subscriptions, _data);
  select * into p from public.plans where id = s.plan_id for share;
  if not found then raise exception 'Choose a valid plan'; end if;
  min_qty := p.min_quantity;
  if _id is not null then
    select * into previous from public.subscriptions where id = _id for update;
    if not found then raise exception 'Subscription not found'; end if;
    if previous.status <> 'paused' and s.status = 'paused' and not p.pausable then
      raise exception 'This plan cannot be paused';
    end if;
    if previous.status <> 'closed' and s.status = 'closed' and not p.closable then
      raise exception 'This plan cannot be closed';
    end if;
    if previous.status = 'closed' and s.status <> 'closed' and not p.renewable then
      raise exception 'This plan cannot be renewed';
    end if;
    if exists (select 1 from public.invoices where subscription_id = _id) and
       (s.customer_id <> previous.customer_id or s.start_date <> previous.start_date or s.plan_id <> previous.plan_id) then
      raise exception 'Customer, plan and start date cannot change after invoicing';
    end if;
  end if;
  if (p.start_date is not null and s.start_date < p.start_date)
    or (p.end_date is not null and s.start_date > p.end_date) then
    raise exception 'Subscription start must be within the plan dates';
  end if;
  for line in select * from jsonb_to_recordset(_lines)
    as l(product_id uuid, variant_id uuid, quantity int, unit_price numeric) loop
    if line.quantity is null or line.quantity < min_qty or line.unit_price is null or line.unit_price < 0 then
      raise exception 'Invalid line quantity or price';
    end if;
    if line.variant_id is not null and not exists
      (select 1 from public.product_variants where id = line.variant_id and product_id = line.product_id) then
      raise exception 'Variant does not belong to the selected product';
    end if;
  end loop;
  if _id is null then
    insert into public.subscriptions(customer_id, plan_id, status, start_date, expiry_date,
      payment_terms_days, tax_rate, discount_id, notes)
    values (s.customer_id, s.plan_id, s.status, s.start_date, s.expiry_date,
      s.payment_terms_days, s.tax_rate, s.discount_id, s.notes) returning id into sid;
  else
    sid := _id;
    update public.subscriptions set customer_id = s.customer_id, plan_id = s.plan_id,
      status = s.status, start_date = s.start_date, expiry_date = s.expiry_date,
      payment_terms_days = s.payment_terms_days, tax_rate = s.tax_rate,
      discount_id = s.discount_id, notes = s.notes where id = sid;
    delete from public.subscription_lines where subscription_id = sid;
  end if;
  insert into public.subscription_lines(subscription_id, product_id, variant_id, quantity, unit_price)
    select sid, l.product_id, l.variant_id, l.quantity, l.unit_price from jsonb_to_recordset(_lines)
      as l(product_id uuid, variant_id uuid, quantity int, unit_price numeric);
  return sid;
end $$;
revoke all on function public.save_subscription(uuid, jsonb, jsonb) from public;
grant execute on function public.save_subscription(uuid, jsonb, jsonb) to app_user;

create or replace function public.save_product(_id uuid, _data jsonb, _variants jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare pid uuid; p public.products; v record;
begin
  if not public.is_staff() then raise exception 'Not authorized'; end if;
  if jsonb_typeof(_variants) is distinct from 'array' then raise exception 'Invalid variants'; end if;
  p := jsonb_populate_record(null::public.products, _data);
  if _id is null then
    insert into public.products(name, type, sales_price, cost_price)
      values (p.name, p.type, p.sales_price, p.cost_price) returning id into pid;
  else
    pid := _id;
    perform 1 from public.products where id = pid for update;
    if not found then raise exception 'Product not found'; end if;
    update public.products set name = p.name, type = p.type,
      sales_price = p.sales_price, cost_price = p.cost_price where id = pid;
  end if;
  delete from public.product_variants where product_id = pid and id not in
    (select x.id from jsonb_to_recordset(_variants) as x(id uuid) where x.id is not null);
  for v in select * from jsonb_to_recordset(_variants) as x(id uuid, name text, extra_price numeric) loop
    if length(trim(v.name)) = 0 or v.name is null then raise exception 'Each variant needs a name'; end if;
    if v.id is not null then
      update public.product_variants set name = trim(v.name), extra_price = v.extra_price
        where id = v.id and product_id = pid;
      if not found then raise exception 'Variant does not belong to this product'; end if;
    else
      insert into public.product_variants(product_id, name, extra_price)
        values (pid, trim(v.name), v.extra_price);
    end if;
  end loop;
  return pid;
end $$;
revoke all on function public.save_product(uuid, jsonb, jsonb) from public;
grant execute on function public.save_product(uuid, jsonb, jsonb) to app_user;

-- Derive each boundary from the original start date. Repeatedly adding a month
-- to Jan 31 drifts to the 28th; anchored boundaries recover March 31 instead.
create or replace function public.billing_boundary(_start date, _period billing_period, _index int)
returns date language sql immutable set search_path = public as $$
  select (_start + public.period_interval(_period) * _index)::date
$$;

create or replace function public._bill_subscription(_sub uuid, _ps date, _issue date)
returns uuid language plpgsql security definer set search_path = public as $$
declare s record; v_sub numeric; v_disc numeric := 0; v_tax numeric; v_inv uuid; d record; n int := 0; next_ps date;
begin
  select su.*, p.billing_period into s from public.subscriptions su join public.plans p on p.id = su.plan_id
    where su.id = _sub for update of su;
  if not found then raise exception 'Subscription not found'; end if;
  n := case s.billing_period
    when 'daily' then _ps - s.start_date
    when 'weekly' then (_ps - s.start_date) / 7
    when 'monthly' then (extract(year from _ps)::int - extract(year from s.start_date)::int) * 12
      + extract(month from _ps)::int - extract(month from s.start_date)::int
    else extract(year from _ps)::int - extract(year from s.start_date)::int end;
  if n < 0 or public.billing_boundary(s.start_date, s.billing_period, n) <> _ps then
    raise exception 'Invalid billing boundary';
  end if;
  next_ps := public.billing_boundary(s.start_date, s.billing_period, n + 1);
  if exists (select 1 from public.invoices where subscription_id = _sub and period_start = _ps) then
    return null;
  end if;
  -- Legacy invoices may already use drifted boundaries. Do not create a second
  -- charge over the same dates when switching back to an anchored schedule.
  if exists (select 1 from public.invoices where subscription_id = _sub
      and period_start < next_ps and period_end >= _ps) then
    raise exception 'Existing invoice periods overlap the billing period starting %. Reconcile historical invoices before billing this subscription.', _ps;
  end if;
  select coalesce(sum(quantity * unit_price),0) into v_sub from public.subscription_lines where subscription_id = _sub;
  if v_sub <= 0 then return null; end if;
  if s.discount_id is not null then
    select * into d from public.discounts where id = s.discount_id for update;
    if d.active and (d.expires_on is null or d.expires_on >= _issue)
       and (d.usage_limit is null or d.used_count < d.usage_limit) then
      v_disc := case when d.type = 'fixed' then least(d.value, v_sub)
        else least(v_sub, round(v_sub * d.value / 100, 2)) end;
    end if;
  end if;
  v_tax := round((v_sub - v_disc) * s.tax_rate / 100, 2);
  insert into public.invoices(subscription_id, customer_id, period_start, period_end, issue_date, due_date,
    subtotal, discount_amount, tax_amount, total, status)
    values (_sub, s.customer_id, _ps, next_ps - 1, _issue, _issue + s.payment_terms_days,
      v_sub, v_disc, v_tax, v_sub - v_disc + v_tax, 'confirmed')
    on conflict (subscription_id, period_start) do nothing returning id into v_inv;
  if v_inv is null then return null; end if;
  insert into public.invoice_lines(invoice_id, description, quantity, unit_price, amount)
    select v_inv, pr.name || coalesce(' – ' || v.name, ''), l.quantity, l.unit_price, l.quantity * l.unit_price
    from public.subscription_lines l join public.products pr on pr.id = l.product_id
    left join public.product_variants v on v.id = l.variant_id where l.subscription_id = _sub;
  if v_disc > 0 then update public.discounts set used_count = used_count + 1 where id = s.discount_id; end if;
  return v_inv;
end $$;

create or replace function public.run_billing()
returns int language plpgsql security definer set search_path = public as $$
declare s record; ps date; n int := 0; r uuid; period_index int;
begin
  if not public.is_staff() then raise exception 'Not authorized'; end if;
  -- Serialize billing runs (including shared discount usage) without deadlocks.
  perform pg_advisory_xact_lock(7190031);
  for s in select su.id, su.start_date, su.expiry_date, p.billing_period, p.auto_close
      from public.subscriptions su join public.plans p on p.id = su.plan_id
      where su.status = 'active' and su.start_date <= current_date order by su.id for update of su loop
    period_index := 0;
    loop
      ps := public.billing_boundary(s.start_date, s.billing_period, period_index);
      exit when ps > current_date or (s.expiry_date is not null and ps > s.expiry_date);
      if not exists (select 1 from public.invoices where subscription_id = s.id and period_start = ps) then
        r := public._bill_subscription(s.id, ps, ps);
        if r is not null then n := n + 1; end if;
      end if;
      period_index := period_index + 1;
    end loop;
    if s.auto_close and s.expiry_date < current_date then
      update public.subscriptions set status = 'closed' where id = s.id;
    end if;
  end loop;
  return n;
end $$;

-- Internal helpers and triggers are never RPC entry points.
revoke execute on function public.validate_payment(), public.validate_invoice(),
  public.sync_invoice_status(), public.handle_new_user(),
  public._bill_subscription(uuid, date, date) from public, app_user;

-- Keep composite writes on the validated transactional RPC path.
revoke insert, update on public.products, public.product_variants, public.subscriptions from app_user;
revoke insert, update, delete on public.subscription_lines from app_user;
-- Invoices and their line snapshots are generated by the billing function.
revoke insert, update on public.invoices from app_user;
grant update(status) on public.invoices to app_user;
revoke insert, update, delete on public.invoice_lines from app_user;
