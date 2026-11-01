-- M03: Shared platform database schema slices
-- Scope: shared customer identity, staff roles, file vault metadata,
-- business orders and employment applications as SEPARATE entities.
-- No payments, notifications or module-specific tables yet (later milestones).

-- 1. Staff roles (separate table per security rules; never on profiles)
create type public.app_role as enum (
  'admin',
  'front_desk',
  'designer',
  'print_operator',
  'career_support',
  'finance',
  'employer',
  'customer'
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.user_roles enable row level security;

-- Security-definer role check (bypasses RLS to avoid recursive policies)
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  )
$$;

create policy "Users can read their own roles"
  on public.user_roles for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Admins can manage all roles"
  on public.user_roles for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- 2. Shared customer identity (registered accounts AND walk-in guests)
--    Guest minimum: full name + phone. Email optional. No ID number.
create table public.customer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid, -- plain uuid; links to the auth account when a guest registers later
  full_name text not null,
  phone text not null,
  email text,
  is_guest boolean not null default true,
  consent_to_store boolean not null default false,
  consent_recorded_at timestamptz,
  created_by uuid, -- staff member who created a guest record
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guest_minimum_details check (length(trim(full_name)) > 0 and length(trim(phone)) > 0),
  constraint registered_account_unique unique (user_id)
);

grant select, insert, update on public.customer_profiles to authenticated;
grant all on public.customer_profiles to service_role;

alter table public.customer_profiles enable row level security;

create policy "Customers can read their own profile"
  on public.customer_profiles for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Customers can update their own profile"
  on public.customer_profiles for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Staff can read all customer profiles"
  on public.customer_profiles for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'front_desk')
    or public.has_role(auth.uid(), 'career_support')
    or public.has_role(auth.uid(), 'finance')
  );

create policy "Front desk and admins can create customer profiles"
  on public.customer_profiles for insert
  to authenticated
  with check (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'front_desk')
  );

create policy "Front desk and admins can update customer profiles"
  on public.customer_profiles for update
  to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'front_desk')
  );

-- 3. Shared file vault metadata (one record per uploaded file,
--    reused across authorised modules — never duplicated)
create type public.file_category as enum (
  'personal',
  'career',
  'design_asset',
  'approved_artwork',
  'deliverable',
  'internal'
);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  category public.file_category not null,
  purpose text not null, -- why this file may be accessed (purpose-based permissions)
  storage_path text not null unique, -- location in private object storage
  original_name text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.files to authenticated;
grant all on public.files to service_role;

alter table public.files enable row level security;

create policy "Customers can read their own files"
  on public.files for select
  to authenticated
  using (
    exists (
      select 1 from public.customer_profiles cp
      where cp.id = files.customer_id and cp.user_id = auth.uid()
    )
  );

create policy "Authorised staff can read files"
  on public.files for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'front_desk')
    or public.has_role(auth.uid(), 'designer')
    or public.has_role(auth.uid(), 'print_operator')
    or public.has_role(auth.uid(), 'career_support')
  );

create policy "Authorised staff can add files"
  on public.files for insert
  to authenticated
  with check (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'front_desk')
    or public.has_role(auth.uid(), 'designer')
    or public.has_role(auth.uid(), 'career_support')
  );

-- 4. Business service orders (SEPARATE from employment applications)
create type public.order_status as enum (
  'received',
  'quoted',
  'approved',
  'in_production',
  'ready_for_collection',
  'completed',
  'cancelled'
);

create type public.payment_method as enum (
  'online',
  'cash_on_collection',
  'cash',
  'eft'
);

create type public.payment_status as enum (
  'unpaid',
  'pending_cash_on_collection',
  'paid',
  'refunded'
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid not null references public.customer_profiles(id),
  service_type text not null,
  status public.order_status not null default 'received',
  payment_method public.payment_method,
  payment_status public.payment_status not null default 'unpaid',
  collected_at_centre boolean not null default true, -- physical orders are centre collection only
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Cash on Collection is only valid for orders collected at the centre
  constraint cash_on_collection_requires_centre_collection
    check (payment_method is distinct from 'cash_on_collection' or collected_at_centre),
  -- 'Pending – Cash on Collection' is only valid with the cash_on_collection method
  constraint pending_cash_requires_coc_method
    check (payment_status is distinct from 'pending_cash_on_collection' or payment_method = 'cash_on_collection'),
  -- An order can only be marked paid once a payment method is set
  constraint paid_requires_method
    check (payment_status is distinct from 'paid' or payment_method is not null)
);

grant select, insert, update on public.orders to authenticated;
grant all on public.orders to service_role;

alter table public.orders enable row level security;

create policy "Customers can read their own orders"
  on public.orders for select
  to authenticated
  using (
    exists (
      select 1 from public.customer_profiles cp
      where cp.id = orders.customer_id and cp.user_id = auth.uid()
    )
  );

create policy "Staff can read all orders"
  on public.orders for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'front_desk')
    or public.has_role(auth.uid(), 'designer')
    or public.has_role(auth.uid(), 'print_operator')
    or public.has_role(auth.uid(), 'finance')
  );

create policy "Front desk and admins can create orders"
  on public.orders for insert
  to authenticated
  with check (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'front_desk')
  );

create policy "Staff can update orders"
  on public.orders for update
  to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'front_desk')
    or public.has_role(auth.uid(), 'designer')
    or public.has_role(auth.uid(), 'print_operator')
    or public.has_role(auth.uid(), 'finance')
  );

-- 5. Employment applications (SEPARATE entity, separate workflow.
--    No foreign key to orders and none back — they must never merge.)
create type public.application_status as enum (
  'draft',
  'preparing',
  'submitted',
  'interview',
  'outcome_received',
  'withdrawn'
);

create table public.employment_applications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id),
  job_title text not null,
  employer_name text,
  status public.application_status not null default 'draft',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update on public.employment_applications to authenticated;
grant all on public.employment_applications to service_role;

alter table public.employment_applications enable row level security;

create policy "Customers can read their own applications"
  on public.employment_applications for select
  to authenticated
  using (
    exists (
      select 1 from public.customer_profiles cp
      where cp.id = employment_applications.customer_id and cp.user_id = auth.uid()
    )
  );

create policy "Career staff and admins can read all applications"
  on public.employment_applications for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'career_support')
  );

create policy "Career staff and admins can create applications"
  on public.employment_applications for insert
  to authenticated
  with check (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'career_support')
  );

create policy "Career staff and admins can update applications"
  on public.employment_applications for update
  to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'career_support')
  );

-- 6. Indexes for the shared access paths
create index idx_user_roles_user_id on public.user_roles (user_id);
create index idx_customer_profiles_user_id on public.customer_profiles (user_id);
create index idx_customer_profiles_phone on public.customer_profiles (phone);
create index idx_files_customer_id on public.files (customer_id);
create index idx_files_category on public.files (category);
create index idx_orders_customer_id on public.orders (customer_id);
create index idx_orders_status on public.orders (status);
create index idx_employment_applications_customer_id on public.employment_applications (customer_id);
create index idx_employment_applications_status on public.employment_applications (status);