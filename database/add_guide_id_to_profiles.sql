-- ===================================================
-- Migration: Add guide_id to profiles table
-- Run this in Supabase SQL Editor
-- ===================================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS guide_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_guide_id ON public.profiles(guide_id);
