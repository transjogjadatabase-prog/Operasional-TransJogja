// ============================================================
// supabase.js — Konfigurasi koneksi Supabase
// Ganti SUPABASE_URL dan SUPABASE_ANON_KEY dengan milik Anda
// ============================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL      = 'https://rzmeitgcbcpctisxsxpq.supabase.co';   // ← ganti
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6bWVpdGdjYmNwY3Rpc3hzeHBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMzU0NTIsImV4cCI6MjA4ODYxMTQ1Mn0.NJivuuKmq48in32Ruk5hcf5F3LbNa2jL8yjD8GVClj4'; // ← ganti

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
