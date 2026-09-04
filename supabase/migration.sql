-- TripBalancing Supabase Migration SQL
-- Run this script in your Supabase SQL Editor (https://app.supabase.com -> Project -> SQL Editor)

-- 1. Create User Profiles Table
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  plan TEXT DEFAULT 'free',
  is_premium BOOLEAN DEFAULT FALSE,
  free_trips_used INT DEFAULT 0,
  paid_trips_balance INT DEFAULT 0,
  global_packing_checked JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on user_profiles
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any to allow safe re-running
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can delete own profile" ON public.user_profiles;

-- RLS Policies for user_profiles
CREATE POLICY "Users can view own profile" ON public.user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.user_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can delete own profile" ON public.user_profiles
  FOR DELETE USING (auth.uid() = id);


-- 2. Create Trips Table
CREATE TABLE IF NOT EXISTS public.trips (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  destination TEXT,
  start_date TEXT,
  end_date TEXT,
  budget_amount TEXT,
  travelers INT,
  travel_style TEXT,
  category TEXT,
  itinerary JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on trips
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any to allow safe re-running
DROP POLICY IF EXISTS "Users can view own trips" ON public.trips;
DROP POLICY IF EXISTS "Users can insert own trips" ON public.trips;
DROP POLICY IF EXISTS "Users can update own trips" ON public.trips;
DROP POLICY IF EXISTS "Users can delete own trips" ON public.trips;

-- RLS Policies for trips (user_id = auth.uid())
CREATE POLICY "Users can view own trips" ON public.trips
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trips" ON public.trips
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own trips" ON public.trips
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own trips" ON public.trips
  FOR DELETE USING (auth.uid() = user_id);


-- 3. Create Buddy Invitations Table
CREATE TABLE IF NOT EXISTS public.buddy_invitations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  trip_id TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  access_type TEXT NOT NULL DEFAULT 'read',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on buddy_invitations
ALTER TABLE public.buddy_invitations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any to allow safe re-running
DROP POLICY IF EXISTS "Users can view invitations they sent or received" ON public.buddy_invitations;
DROP POLICY IF EXISTS "Users can insert invitations" ON public.buddy_invitations;
DROP POLICY IF EXISTS "Users can update invitations they sent or received" ON public.buddy_invitations;

-- RLS Policies for buddy_invitations
CREATE POLICY "Users can view invitations they sent or received" ON public.buddy_invitations
  FOR SELECT USING (
    lower(recipient_email) = lower(auth.jwt() ->> 'email') OR lower(sender_email) = lower(auth.jwt() ->> 'email')
  );

CREATE POLICY "Users can insert invitations" ON public.buddy_invitations
  FOR INSERT WITH CHECK (
    lower(sender_email) = lower(auth.jwt() ->> 'email')
  );

CREATE POLICY "Users can update invitations they sent or received" ON public.buddy_invitations
  FOR UPDATE USING (
    lower(recipient_email) = lower(auth.jwt() ->> 'email') OR lower(sender_email) = lower(auth.jwt() ->> 'email')
  );

-- 4. Public trip experiences/reviews (written through the authenticated API)
CREATE TABLE IF NOT EXISTS public.trip_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id TEXT NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  destination TEXT NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT NOT NULL CHECK (char_length(review_text) BETWEEN 10 AND 3000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (trip_id, user_id)
);

ALTER TABLE public.trip_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own reviews" ON public.trip_reviews;
CREATE POLICY "Users can view own reviews" ON public.trip_reviews
  FOR SELECT USING (auth.uid() = user_id);

ALTER TABLE public.trip_reviews ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
