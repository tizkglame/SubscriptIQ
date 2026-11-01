-- Synthetic local demonstration data; seeded only once per database.

insert into public.customers (name, email, phone, company, address) values
 ('Demo Customer','customer@subscriptiq.local','+1 555 0100','Northwind Labs','12 Harbor St, Boston'),
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
