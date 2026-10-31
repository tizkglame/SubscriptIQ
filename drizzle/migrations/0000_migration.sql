
-- ROLES
create type public.app_role as enum ('admin','staff','customer');
create type public.billing_period as enum ('daily','weekly','monthly','yearly');
create type public.subscription_status as enum ('draft','quotation','confirmed','active','closed','paused');
create type public.invoice_status as enum ('draft','confirmed','paid','cancelled','overdue');
create type public.discount_type as enum ('fixed','percentage');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('admin','staff'))
$$;

create policy "own role read" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid() or public.is_staff());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

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
grant select, insert, update, delete on public.customers to authenticated;
grant all on public.customers to service_role;
alter table public.customers enable row level security;
create policy "staff read customers" on public.customers for select to authenticated using (public.is_staff() or user_id = auth.uid());
create policy "staff write customers" on public.customers for insert to authenticated with check (public.is_staff());
create policy "staff update customers" on public.customers for update to authenticated using (public.is_staff());
create policy "admin delete customers" on public.customers for delete to authenticated using (public.has_role(auth.uid(),'admin'));

create or replace function public.my_customer_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select id from public.customers where user_id = auth.uid()
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
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "auth read %1$s" on public.%1$I for select to authenticated using (true)', t);
    execute format('create policy "staff insert %1$s" on public.%1$I for insert to authenticated with check (public.is_staff())', t);
    execute format('create policy "staff update %1$s" on public.%1$I for update to authenticated using (public.is_staff())', t);
    execute format('create policy "admin delete %1$s" on public.%1$I for delete to authenticated using (public.has_role(auth.uid(),''admin''))', t);
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
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "staff insert %1$s" on public.%1$I for insert to authenticated with check (public.is_staff())', t);
    execute format('create policy "staff update %1$s" on public.%1$I for update to authenticated using (public.is_staff())', t);
    execute format('create policy "admin delete %1$s" on public.%1$I for delete to authenticated using (public.has_role(auth.uid(),''admin''))', t);
  end loop;
end $$;
create policy "read subscriptions" on public.subscriptions for select to authenticated
  using (public.is_staff() or customer_id in (select public.my_customer_ids()));
create policy "read subscription_lines" on public.subscription_lines for select to authenticated
  using (public.is_staff() or subscription_id in (select id from public.subscriptions where customer_id in (select public.my_customer_ids())));
create policy "read invoices" on public.invoices for select to authenticated
  using (public.is_staff() or customer_id in (select public.my_customer_ids()));
create policy "read invoice_lines" on public.invoice_lines for select to authenticated
  using (public.is_staff() or invoice_id in (select id from public.invoices where customer_id in (select public.my_customer_ids())));
create policy "read payments" on public.payments for select to authenticated
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
revoke execute on function public._bill_subscription(uuid, date, date) from public, anon, authenticated;

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
revoke execute on function public.run_billing() from public, anon;
grant execute on function public.run_billing() to authenticated;

-- ===== SEED =====
insert into public.customers (name, email, phone, company, address) values
 ('Demo Customer','customer@brightloop.demo','+1 555 0100','Northwind Labs','12 Harbor St, Boston'),
 ('Aarav Mehta','aarav@finlytic.io','+91 98200 11223','Finlytic','Bandra, Mumbai'),
 ('Sofia Rossi','sofia@lumenarch.it','+39 02 5551 2233','Lumen Architects','Milan, Italy'),
 ('Liam Carter','liam@peakfit.co','+1 555 0144','PeakFit','Denver, CO'),
 ('Hana Sato','hana@kumo.jp','+81 3 5550 1212','Kumo Studio','Shibuya, Tokyo'),
 ('Noah Fischer','noah@fischerlogistik.de','+49 30 555 7788','Fischer Logistik','Berlin'),
 ('Emma Dubois','emma@verdant.fr','+33 1 55 66 77','Verdant Foods','Lyon, France'),
 ('Oliver Grant','oliver@grantlaw.co.uk','+44 20 5555 0101','Grant & Co Legal','London'),
 ('Priya Nair','priya@medisync.health','+91 99000 44556','MediSync','Bengaluru'),
 ('Lucas Silva','lucas@ondamarket.br','+55 11 5555 3030','Onda Market','São Paulo');

insert into public.products (name, type, sales_price, cost_price) values
 ('Brightloop CRM','software',49,8),('Analytics Suite','software',99,15),('Cloud Storage','service',19,4),
 ('Priority Support','service',29,10),('Onboarding Package','service',199,60),('API Access','software',59,9);
insert into public.product_variants (product_id, name, extra_price)
select id, v.n, v.p from public.products pr cross join lateral (values ('Standard',0::numeric),('Pro',30::numeric),('Enterprise',90::numeric)) v(n,p)
where pr.name in ('Brightloop CRM','Analytics Suite');
insert into public.product_variants (product_id, name, extra_price)
select id, v.n, v.p from public.products pr cross join lateral (values ('100 GB',0::numeric),('1 TB',25::numeric)) v(n,p) where pr.name = 'Cloud Storage';

insert into public.plans (name, billing_period, min_quantity, start_date, auto_close, closable, pausable, renewable) values
 ('Starter Monthly','monthly',1,'2025-01-01',false,true,true,true),
 ('Growth Monthly','monthly',5,'2025-01-01',false,true,true,true),
 ('Enterprise Annual','yearly',10,'2025-01-01',false,false,false,true),
 ('Weekly Flex','weekly',1,'2025-06-01',true,true,true,false);

insert into public.discounts (code, name, type, value, expires_on, usage_limit) values
 ('WELCOME10','Welcome 10%','percentage',10,current_date + 120, 50),
 ('LOYAL50','Loyalty $50 off','fixed',50,current_date + 365, 100),
 ('SPRING20','Spring promo 20%','percentage',20,current_date - 10, 20);

do $$
declare
  c uuid[]; pl record; sid uuid; i int; st subscription_status; sd date; plan_names text[] := array['Starter Monthly','Growth Monthly','Starter Monthly','Enterprise Annual','Growth Monthly','Starter Monthly','Weekly Flex','Growth Monthly','Starter Monthly','Growth Monthly','Starter Monthly','Enterprise Annual','Starter Monthly','Growth Monthly'];
  statuses subscription_status[] := array['active','active','active','active','active','active','active','active','paused','closed','quotation','confirmed','draft','active']::subscription_status[];
  months int[] := array[7,6,6,5,5,4,1,3,5,7,0,0,0,2];
  prod record; qty int;
begin
  select array_agg(id order by created_at, name) into c from public.customers;
  for i in 1..14 loop
    select * into pl from public.plans where name = plan_names[i];
    st := statuses[i];
    sd := (date_trunc('month', current_date) - make_interval(months => months[i]))::date + ((i % 5));
    if pl.billing_period = 'weekly' then sd := current_date - 28; end if;
    insert into public.subscriptions (customer_id, plan_id, status, start_date, expiry_date, payment_terms_days, tax_rate, discount_id)
    values (c[((i-1) % 10) + 1], pl.id, st, sd, case when st = 'closed' then current_date - 20 else sd + 365 * 2 end,
            case when i % 3 = 0 then 30 else 15 end, 18,
            case when i in (2,8) then (select id from public.discounts where code='WELCOME10') when i = 5 then (select id from public.discounts where code='LOYAL50') end)
    returning id into sid;
    qty := greatest(pl.min_quantity, (i % 4) + 1);
    for prod in select p.id, p.sales_price, (select v.id from public.product_variants v where v.product_id = p.id order by v.extra_price desc limit 1 offset (i % 2)) as vid
                from public.products p where p.name in (case when i % 2 = 0 then 'Analytics Suite' else 'Brightloop CRM' end, 'Priority Support') loop
      insert into public.subscription_lines (subscription_id, product_id, variant_id, quantity, unit_price)
      values (sid, prod.id, prod.vid, qty, prod.sales_price + coalesce((select extra_price from public.product_variants where id = prod.vid),0));
    end loop;
  end loop;
end $$;

-- historical invoices
do $$
declare s record; iv interval; ps date; lim date;
begin
  for s in select su.*, p.billing_period from public.subscriptions su join public.plans p on p.id = su.plan_id where su.status in ('active','paused','closed') loop
    iv := public.period_interval(s.billing_period);
    ps := s.start_date;
    lim := case when s.status = 'active' then current_date - 1 else least(coalesce(s.expiry_date, current_date), current_date - 40) end;
    while ps <= lim and (ps + iv)::date <= current_date + 0 loop
      perform public._bill_subscription(s.id, ps, ps);
      ps := (ps + iv)::date;
    end loop;
  end loop;
end $$;

-- historical payments (simulated)
insert into public.payments (invoice_id, amount, method, paid_on, notes, is_demo)
select id, total, (array['card','bank_transfer','upi','paypal'])[1 + (abs(hashtext(number)) % 4)], least(issue_date + 7, current_date), 'Seeded demo payment', true
from public.invoices where due_date < current_date - 20 and abs(hashtext(number)) % 7 <> 0;
insert into public.payments (invoice_id, amount, method, paid_on, notes, is_demo)
select id, round(total / 2, 2), 'card', current_date - 2, 'Partial demo payment', true
from public.invoices i where due_date >= current_date - 20 and abs(hashtext(number)) % 3 = 0
and not exists (select 1 from public.payments p where p.invoice_id = i.id);
