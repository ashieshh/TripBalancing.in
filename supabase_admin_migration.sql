-- ==============================================================================
-- TripBalancing Admin Dashboard & Security Migration
-- Target Platform: Supabase PostgreSQL
-- ==============================================================================

-- 1. Create admin_users table
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security (RLS) on admin_users
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only read their own admin record
CREATE POLICY "Users can read own admin status" ON public.admin_users
  FOR SELECT USING (auth.uid() = user_id);

-- Restrict INSERT, UPDATE, DELETE on admin_users to service role or existing super admins
-- Normal authenticated users have NO access to insert/update/delete on admin_users.


-- 2. Create user_profiles table (if not exists)
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  trips_count INT NOT NULL DEFAULT 0,
  paid_trip_credits INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on user_profiles
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_profiles
CREATE POLICY "Users can read own profile" ON public.user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.user_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);


-- 3. Create payments table
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT NOT NULL,
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT NOT NULL,
  plan_purchased TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  payment_status TEXT NOT NULL DEFAULT 'captured',
  is_test_mode BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on payments
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can read their own payments
CREATE POLICY "Users can read own payments" ON public.payments
  FOR SELECT USING (auth.uid() = user_id OR auth.jwt() ->> 'email' = user_email);


-- 4. Create subscriptions table
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  current_plan TEXT NOT NULL DEFAULT 'free',
  purchase_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expiry_date TIMESTAMPTZ,
  remaining_trip_credits INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on subscriptions
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can read their own subscription
CREATE POLICY "Users can read own subscription" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id OR auth.jwt() ->> 'email' = user_email);


-- 5. Create support_tickets table
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_ref TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  razorpay_payment_id TEXT,
  status TEXT NOT NULL DEFAULT 'open', -- 'open', 'in_progress', 'resolved'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on support_tickets
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Anyone authenticated or guest can log a support ticket
CREATE POLICY "Users can create support tickets" ON public.support_tickets
  FOR INSERT WITH CHECK (true);

-- RLS Policy: Users can read their own support tickets
CREATE POLICY "Users can read own support tickets" ON public.support_tickets
  FOR SELECT USING (auth.uid() = user_id OR auth.jwt() ->> 'email' = user_email);


-- 6. Create refund_requests table
CREATE TABLE IF NOT EXISTS public.refund_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT NOT NULL,
  razorpay_payment_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  purchase_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trips_used_since_purchase INT NOT NULL DEFAULT 0,
  refund_eligible BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on refund_requests
ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Anyone can submit a refund request
CREATE POLICY "Users can create refund requests" ON public.refund_requests
  FOR INSERT WITH CHECK (true);

-- RLS Policy: Users can view their own refund requests
CREATE POLICY "Users can read own refund requests" ON public.refund_requests
  FOR SELECT USING (auth.uid() = user_id OR auth.jwt() ->> 'email' = user_email);


-- 7. Create failed_admin_access_logs table
CREATE TABLE IF NOT EXISTS public.failed_admin_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempted_user_id TEXT,
  attempted_email TEXT,
  ip_address TEXT,
  user_agent TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on failed_admin_access_logs (No direct public access)
ALTER TABLE public.failed_admin_access_logs ENABLE ROW LEVEL SECURITY;


-- ==============================================================================
-- Instructions for Adding the First Admin User Safely
-- ==============================================================================
-- To promote an existing user to an Admin, find their user ID in auth.users
-- and insert it into admin_users using SQL Editor or Service Role:
--
-- INSERT INTO public.admin_users (user_id, role)
-- VALUES ('<YOUR_USER_UUID_FROM_AUTH_USERS>', 'admin')
-- ON CONFLICT (user_id) DO NOTHING;
-- ==============================================================================
