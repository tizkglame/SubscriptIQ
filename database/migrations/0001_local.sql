-- Native local accounts. Passwords and sessions are never exposed to app_user.
do $$ begin create role app_user nologin; exception when duplicate_object then null; end $$;
grant usage on schema public to app_user;
create schema private;
revoke all on schema private from public;
create table private.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  full_name text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);
create table private.sessions (
  token_hash text primary key,
  user_id uuid not null references private.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index sessions_user_idx on private.sessions(user_id);
create index sessions_expiry_idx on private.sessions(expires_at);
create function public.current_user_id() returns uuid language sql stable as
  $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;


-- ROLES
create type public.app_role as enum ('admin','staff','customer');
create type public.billing_period as enum ('daily','weekly','monthly','yearly');
create type public.subscription_status as enum ('draft','quotation','confirmed','active','closed','paused');
create type public.invoice_status as enum ('draft','confirmed','paid','cancelled','overdue');
create type public.discount_type as enum ('fixed','percentage');

create table public.profiles (
  id uuid primary key references private.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to app_user;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references private.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to app_user;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = public.current_user_id() and role in ('admin','staff'))
$$;

create policy "own role read" on public.user_roles for select to app_user using (user_id = public.current_user_id() or public.has_role(public.current_user_id(),'admin'));
create policy "own profile read" on public.profiles for select to app_user using (id = public.current_user_id() or public.is_staff());
create policy "own profile update" on public.profiles for update to app_user using (id = public.current_user_id());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.full_name)
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_local_user_created after insert on private.users for each row execute function public.handle_new_user();

-- CUSTOMERS
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  email text not null,
  phone text,
  company text,
  address text,
  user_id uuid unique,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.customers to app_user;
alter table public.customers enable row level security;
create policy "staff read customers" on public.customers for select to app_user using (public.is_staff() or user_id = public.current_user_id());
create policy "staff write customers" on public.customers for insert to app_user with check (public.is_staff());
create policy "staff update customers" on public.customers for update to app_user using (public.is_staff());
create policy "admin delete customers" on public.customers for delete to app_user using (public.has_role(public.current_user_id(),'admin'));

create or replace function public.my_customer_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select id from public.customers where user_id = public.current_user_id()
$$;

-- PRODUCTS
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  type text not null default 'service',
  sales_price numeric(12,2) not null default 0 check (sales_price >= 0),
  cost_price numeric(12,2) not null default 0 check (cost_price >= 0),
  created_at timestamptz not null default now()
);
create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  extra_price numeric(12,2) not null default 0
);
-- PLANS
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  billing_period billing_period not null default 'monthly',
  min_quantity int not null default 1 check (min_quantity >= 1),
  start_date date,
  end_date date,
  auto_close boolean not null default false,
  closable boolean not null default true,
  pausable boolean not null default true,
  renewable boolean not null default true,
  created_at timestamptz not null default now()
);
-- DISCOUNTS
create table public.discounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  type discount_type not null default 'percentage',
  value numeric(12,2) not null check (value > 0),
  expires_on date,
  usage_limit int,
  used_count int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['products','product_variants','plans','discounts'] loop
    execute format('grant select, insert, update, delete on public.%I to app_user', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "auth read %1$s" on public.%1$I for select to app_user using (true)', t);
    execute format('create policy "staff insert %1$s" on public.%1$I for insert to app_user with check (public.is_staff())', t);
    execute format('create policy "staff update %1$s" on public.%1$I for update to app_user using (public.is_staff())', t);
    execute format('create policy "admin delete %1$s" on public.%1$I for delete to app_user using (public.has_role(public.current_user_id(),''admin''))', t);
  end loop;
end $$;

-- SUBSCRIPTIONS
create sequence public.subscription_seq start 1001;
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default ('SUB-' || nextval('public.subscription_seq')::text),
  customer_id uuid not null references public.customers(id) on delete restrict,
  plan_id uuid not null references public.plans(id) on delete restrict,
  status subscription_status not null default 'draft',
  start_date date not null default current_date,
  expiry_date date,
  payment_terms_days int not null default 15 check (payment_terms_days >= 0),
  tax_rate numeric(5,2) not null default 18 check (tax_rate >= 0 and tax_rate <= 100),
  discount_id uuid references public.discounts(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  check (expiry_date is null or expiry_date >= start_date)
);
create table public.subscription_lines (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  variant_id uuid references public.product_variants(id) on delete set null,
  quantity int not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0)
);

-- INVOICES
create sequence public.invoice_seq start 5001;
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default ('INV-' || nextval('public.invoice_seq')::text),
  subscription_id uuid not null references public.subscriptions(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  issue_date date not null default current_date,
  due_date date not null,
  subtotal numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  status invoice_status not null default 'confirmed',
  created_at timestamptz not null default now(),
  unique (subscription_id, period_start)
);
create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  quantity int not null,
  unit_price numeric(12,2) not null,
  amount numeric(12,2) not null
);
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  method text not null default 'bank_transfer',
  paid_on date not null default current_date,
  notes text,
  is_demo boolean not null default true,
  created_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['subscriptions','subscription_lines','invoices','invoice_lines','payments'] loop
    execute format('grant select, insert, update, delete on public.%I to app_user', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "staff insert %1$s" on public.%1$I for insert to app_user with check (public.is_staff())', t);
    execute format('create policy "staff update %1$s" on public.%1$I for update to app_user using (public.is_staff())', t);
    execute format('create policy "admin delete %1$s" on public.%1$I for delete to app_user using (public.has_role(public.current_user_id(),''admin''))', t);
  end loop;
end $$;
create policy "read subscriptions" on public.subscriptions for select to app_user
  using (public.is_staff() or customer_id in (select public.my_customer_ids()));
create policy "read subscription_lines" on public.subscription_lines for select to app_user
  using (public.is_staff() or subscription_id in (select id from public.subscriptions where customer_id in (select public.my_customer_ids())));
create policy "read invoices" on public.invoices for select to app_user
  using (public.is_staff() or customer_id in (select public.my_customer_ids()));
create policy "read invoice_lines" on public.invoice_lines for select to app_user
  using (public.is_staff() or invoice_id in (select id from public.invoices where customer_id in (select public.my_customer_ids())));
create policy "read payments" on public.payments for select to app_user
  using (public.is_staff() or invoice_id in (select id from public.invoices where customer_id in (select public.my_customer_ids())));

-- payment validation + invoice status sync
create or replace function public.validate_payment()
returns trigger language plpgsql set search_path = public as $$
declare v_total numeric; v_paid numeric; v_status invoice_status;
begin
  select total, status into v_total, v_status from public.invoices where id = new.invoice_id;
  if v_status in ('cancelled','draft') then raise exception 'Cannot record payment on a % invoice', v_status; end if;
  select coalesce(sum(amount),0) into v_paid from public.payments where invoice_id = new.invoice_id and id <> new.id;
  if new.amount > (v_total - v_paid) + 0.001 then
    raise exception 'Payment exceeds outstanding balance of %', round(v_total - v_paid, 2);
  end if;
  return new;
end $$;
create trigger trg_validate_payment before insert or update on public.payments for each row execute function public.validate_payment();

create or replace function public.sync_invoice_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_inv uuid := coalesce(new.invoice_id, old.invoice_id); v_total numeric; v_paid numeric;
begin
  select total into v_total from public.invoices where id = v_inv;
  select coalesce(sum(amount),0) into v_paid from public.payments where invoice_id = v_inv;
  if v_paid >= v_total and v_total > 0 then
    update public.invoices set status = 'paid' where id = v_inv and status <> 'paid';
  else
    update public.invoices set status = 'confirmed' where id = v_inv and status = 'paid';
  end if;
  return null;
end $$;
create trigger trg_sync_invoice after insert or update or delete on public.payments for each row execute function public.sync_invoice_status();

-- BILLING
create or replace function public.period_interval(p billing_period)
returns interval language sql immutable as $$
  select case p when 'daily' then interval '1 day' when 'weekly' then interval '1 week'
    when 'monthly' then interval '1 month' else interval '1 year' end
$$;

create or replace function public._bill_subscription(_sub uuid, _ps date, _issue date)
returns uuid language plpgsql security definer set search_path = public as $$
declare s record; iv interval; v_sub numeric; v_disc numeric := 0; v_tax numeric; v_inv uuid; d record;
begin
  select su.*, p.billing_period into s from public.subscriptions su join public.plans p on p.id = su.plan_id where su.id = _sub;
  iv := public.period_interval(s.billing_period);
  select coalesce(sum(quantity * unit_price),0) into v_sub from public.subscription_lines where subscription_id = _sub;
  if v_sub <= 0 then return null; end if;
  if s.discount_id is not null then
    select * into d from public.discounts where id = s.discount_id;
    if d.active and (d.expires_on is null or d.expires_on >= _issue) and (d.usage_limit is null or d.used_count < d.usage_limit) then
      v_disc := case when d.type = 'fixed' then least(d.value, v_sub) else round(v_sub * d.value / 100, 2) end;
    end if;
  end if;
  v_tax := round((v_sub - v_disc) * s.tax_rate / 100, 2);
  insert into public.invoices (subscription_id, customer_id, period_start, period_end, issue_date, due_date, subtotal, discount_amount, tax_amount, total, status)
  values (_sub, s.customer_id, _ps, (_ps + iv - interval '1 day')::date, _issue, _issue + s.payment_terms_days, v_sub, v_disc, v_tax, v_sub - v_disc + v_tax, 'confirmed')
  on conflict (subscription_id, period_start) do nothing
  returning id into v_inv;
  if v_inv is null then return null; end if;
  insert into public.invoice_lines (invoice_id, description, quantity, unit_price, amount)
  select v_inv, pr.name || coalesce(' – ' || v.name, ''), l.quantity, l.unit_price, l.quantity * l.unit_price
  from public.subscription_lines l join public.products pr on pr.id = l.product_id
  left join public.product_variants v on v.id = l.variant_id where l.subscription_id = _sub;
  if v_disc > 0 then update public.discounts set used_count = used_count + 1 where id = s.discount_id; end if;
  return v_inv;
end $$;
revoke execute on function public._bill_subscription(uuid, date, date) from public, app_user;

create or replace function public.run_billing()
returns int language plpgsql security definer set search_path = public as $$
declare s record; iv interval; ps date; n int := 0; r uuid;
begin
  if not public.is_staff() then raise exception 'Not authorized'; end if;
  for s in select su.id, su.start_date, su.expiry_date, p.billing_period from public.subscriptions su
           join public.plans p on p.id = su.plan_id where su.status = 'active' and su.start_date <= current_date loop
    iv := public.period_interval(s.billing_period);
    ps := s.start_date;
    while (ps + iv)::date <= current_date loop ps := (ps + iv)::date; end loop;
    if s.expiry_date is not null and ps > s.expiry_date then continue; end if;
    r := public._bill_subscription(s.id, ps, current_date);
    if r is not null then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke execute on function public.run_billing() from public;
grant execute on function public.run_billing() to app_user;
