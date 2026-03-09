# 🚌 Panduan Deploy TransJogja — Supabase + GitHub + Vercel

---

## 📁 Struktur File

```
transjogja/
├── index.html          ← Halaman utama
├── style.css           ← Semua styling
├── app.js              ← Logika JavaScript (Supabase)
├── supabase.js         ← Konfigurasi koneksi Supabase  ← EDIT INI
└── supabase_schema.sql ← SQL untuk membuat tabel di Supabase
```

---

## 🔷 LANGKAH 1 — Setup Supabase

### 1.1 Buat Project

1. Buka **https://supabase.com** → klik **Start your project**
2. Login dengan GitHub
3. Klik **New project**
4. Isi:
   - **Name**: `transjogja`
   - **Database Password**: buat password kuat, **simpan baik-baik**
   - **Region**: Southeast Asia (Singapore)
5. Klik **Create new project** → tunggu ±2 menit

### 1.2 Buat Tabel (SQL Editor)

1. Di sidebar kiri, klik **SQL Editor**
2. Klik **New query**
3. Buka file `supabase_schema.sql`, copy semua isinya
4. Paste ke SQL Editor
5. Klik **Run** (atau tekan `Ctrl+Enter`)
6. Pastikan muncul pesan `Success. No rows returned`

### 1.3 Buat Storage Bucket (untuk foto bus)

1. Di sidebar kiri, klik **Storage**
2. Klik **New bucket**
3. Isi **Name**: `foto-bus`
4. Centang **Public bucket** → klik **Save**

### 1.4 Ambil API Keys

1. Di sidebar kiri, klik **Project Settings** (ikon ⚙️)
2. Klik **API**
3. Salin dua nilai ini:
   - **Project URL** → contoh: `https://abcdefghij.supabase.co`
   - **anon / public key** → string panjang dimulai `eyJ...`

### 1.5 Edit file supabase.js

Buka file `supabase.js`, ganti baris berikut:

```javascript
const SUPABASE_URL      = 'https://XXXXXXXXXXXX.supabase.co';   // ← ganti
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // ← ganti
```

Dengan URL dan key yang Anda salin tadi. Contoh:

```javascript
const SUPABASE_URL      = 'https://abcdefghij.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSI...';
```

---

## 🐙 LANGKAH 2 — Upload ke GitHub

### 2.1 Buat Repository

1. Buka **https://github.com** → login
2. Klik **+** di pojok kanan atas → **New repository**
3. Isi:
   - **Repository name**: `transjogja-operasional`
   - **Visibility**: Private (direkomendasikan) atau Public
4. Klik **Create repository**

### 2.2 Upload File

**Cara A — Lewat Browser (mudah):**

1. Di halaman repository yang baru dibuat, klik **Add file** → **Upload files**
2. Drag & drop semua file:
   - `index.html`
   - `style.css`
   - `app.js`
   - `supabase.js` (yang sudah diisi URL & key)
   - `supabase_schema.sql`
3. Tulis commit message: `Initial commit TransJogja`
4. Klik **Commit changes**

**Cara B — Lewat Terminal (Git):**

```bash
# Di folder project Anda
git init
git add .
git commit -m "Initial commit TransJogja"
git branch -M main
git remote add origin https://github.com/USERNAME/transjogja-operasional.git
git push -u origin main
```

---

## ▲ LANGKAH 3 — Deploy ke Vercel

### 3.1 Hubungkan GitHub ke Vercel

1. Buka **https://vercel.com** → klik **Sign Up**
2. Pilih **Continue with GitHub** → authorize Vercel
3. Klik **Add New Project**

### 3.2 Import Repository

1. Cari repository `transjogja-operasional` → klik **Import**
2. Di halaman konfigurasi:
   - **Framework Preset**: pilih **Other**
   - **Root Directory**: biarkan `/` (default)
   - **Build Command**: kosongkan
   - **Output Directory**: kosongkan
3. Klik **Deploy**
4. Tunggu ±1 menit → akan muncul URL seperti:
   `https://transjogja-operasional.vercel.app`

### 3.3 Akses Website

Klik URL yang diberikan Vercel → website TransJogja Anda sudah online! ✅

---

## 🔄 Update Kode (setelah deploy)

Setiap kali Anda mengubah file dan push ke GitHub, Vercel akan **otomatis** re-deploy:

```bash
git add .
git commit -m "Update fitur"
git push
```

Vercel akan detect perubahan dan deploy ulang dalam ~30 detik.

---

## 🌐 Custom Domain (Opsional)

1. Di Vercel → pilih project → klik **Settings** → **Domains**
2. Klik **Add Domain**
3. Masukkan domain Anda, contoh: `transjogja.dishub.jogja.go.id`
4. Ikuti instruksi untuk update DNS di registrar domain Anda

---

## 🔒 Keamanan (Rekomendasi Produksi)

Saat ini RLS (Row Level Security) dibuat terbuka untuk demo.
Untuk produksi, pertimbangkan:

### Tambah Login Sederhana (Supabase Auth)

Di `supabase.js`, tambahkan:

```javascript
// Login
export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// Logout
export async function logout() {
  await supabase.auth.signOut();
}

// Cek session
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}
```

Lalu update RLS policy di Supabase SQL Editor:
```sql
-- Hapus policy lama
DROP POLICY IF EXISTS "allow_all_bus" ON bus;

-- Buat policy baru (hanya user terautentikasi)
CREATE POLICY "authenticated_only_bus" ON bus
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
```

---

## ❓ Troubleshooting

| Masalah | Solusi |
|---------|--------|
| `Failed to fetch` | Cek URL dan key Supabase di `supabase.js` |
| `violates row-level security policy` | Pastikan policy RLS sudah dibuat (jalankan SQL schema) |
| Data tidak tersimpan | Cek console browser (F12) untuk pesan error |
| Foto tidak terupload | Pastikan bucket `foto-bus` sudah dibuat dan Public |
| Website error 404 di Vercel | Pastikan `index.html` ada di root folder |

---

## 📞 Ringkasan Alur

```
Edit supabase.js  →  Push ke GitHub  →  Vercel auto-deploy  →  Website Live
       ↑                                        ↓
  Isi URL & Key                         https://xxx.vercel.app
  dari Supabase
```
