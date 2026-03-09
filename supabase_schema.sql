-- ============================================================
-- SCHEMA SUPABASE - Operasional TransJogja
-- Jalankan di Supabase > SQL Editor
-- ============================================================

-- Tabel Data Bus
CREATE TABLE IF NOT EXISTS bus (
  id          TEXT PRIMARY KEY DEFAULT 'B' || substr(extract(epoch from now())::text, 7),
  lambung     TEXT NOT NULL UNIQUE,
  nopol       TEXT NOT NULL,
  jalur       TEXT NOT NULL,
  tipe        TEXT,
  karoseri    TEXT,
  warna       TEXT,
  ket         TEXT,
  foto_url    TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Tabel Data SPBU
CREATE TABLE IF NOT EXISTS spbu (
  id          TEXT PRIMARY KEY DEFAULT 'S' || substr(extract(epoch from now())::text, 7),
  nama        TEXT NOT NULL,
  alamat      TEXT,
  hp          TEXT,
  aktif       BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Tabel Input BBM
CREATE TABLE IF NOT EXISTS bbm (
  id          TEXT PRIMARY KEY DEFAULT 'BBM' || substr(extract(epoch from now())::text, 7),
  tgl         DATE NOT NULL,
  lambung     TEXT NOT NULL REFERENCES bus(lambung) ON UPDATE CASCADE,
  jalur       TEXT,
  nopol       TEXT,
  waktu       TIME,
  nominal     NUMERIC NOT NULL DEFAULT 0,
  spbu        TEXT,
  halte       TEXT,
  jam_halte   TIME,
  ket         TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Tabel Input Operasional
CREATE TABLE IF NOT EXISTS operasional (
  id              TEXT PRIMARY KEY DEFAULT 'OPS' || substr(extract(epoch from now())::text, 7),
  tgl             DATE NOT NULL,
  lambung         TEXT NOT NULL REFERENCES bus(lambung) ON UPDATE CASCADE,
  jalur           TEXT,
  nopol           TEXT,
  jam_mulai       TIME,
  jam_akhir       TIME,
  km_awal_pool    NUMERIC,
  km_akhir_pool   NUMERIC,
  km_awal_halte   NUMERIC,
  km_akhir_halte  NUMERIC,
  bbm_rp          NUMERIC DEFAULT 0,
  rit             INTEGER DEFAULT 0,
  km_tempuh       NUMERIC,
  ratio           NUMERIC,
  ket             TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) - aktifkan akses publik untuk demo
-- Untuk produksi, ganti dengan autentikasi user
-- ============================================================

ALTER TABLE bus          ENABLE ROW LEVEL SECURITY;
ALTER TABLE spbu         ENABLE ROW LEVEL SECURITY;
ALTER TABLE bbm          ENABLE ROW LEVEL SECURITY;
ALTER TABLE operasional  ENABLE ROW LEVEL SECURITY;

-- Policy: izinkan semua operasi untuk anon key (demo/internal)
CREATE POLICY "allow_all_bus"         ON bus         FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_spbu"        ON spbu        FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_bbm"         ON bbm         FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_operasional" ON operasional FOR ALL TO anon USING (true) WITH CHECK (true);
