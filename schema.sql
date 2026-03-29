-- ===================================================
-- ChauBondi - Schema SQL
-- Ejecutar en: Supabase > SQL Editor > New Query
-- ===================================================

-- 1. TABLA DE PERFILES (datos extra del usuario)
CREATE TABLE IF NOT EXISTS profiles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nombre       TEXT NOT NULL,
  apellido     TEXT NOT NULL,
  whatsapp     TEXT NOT NULL,
  rating_promedio NUMERIC(3,2) DEFAULT 5.0,
  rating_count INT DEFAULT 0,
  activo       BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TABLA DE VIAJES
CREATE TABLE IF NOT EXISTS viajes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_creador        UUID NOT NULL REFERENCES profiles(id),
  tipo              TEXT NOT NULL CHECK (tipo IN ('IDA', 'VUELTA')),
  zona_comun        TEXT NOT NULL,
  barrio            TEXT NOT NULL,
  fecha_hora        TIMESTAMPTZ NOT NULL,
  cupos_disponibles INT NOT NULL DEFAULT 3 CHECK (cupos_disponibles >= 0 AND cupos_disponibles <= 3),
  activo            BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABLA DE PARTICIPANTES
CREATE TABLE IF NOT EXISTS participantes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_viaje         UUID NOT NULL REFERENCES viajes(id),
  id_usuario       UUID NOT NULL REFERENCES profiles(id),
  estado_pago      BOOLEAN DEFAULT false,
  mp_preference_id TEXT,
  mp_payment_id    TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(id_viaje, id_usuario)
);

-- 4. TABLA DE RATINGS
CREATE TABLE IF NOT EXISTS ratings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_viaje       UUID NOT NULL REFERENCES viajes(id),
  id_calificador UUID NOT NULL REFERENCES profiles(id),
  id_calificado  UUID NOT NULL REFERENCES profiles(id),
  puntuacion     INT NOT NULL CHECK (puntuacion >= 1 AND puntuacion <= 5),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(id_viaje, id_calificador, id_calificado)
);

-- 5. INDEXES PARA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_viajes_tipo ON viajes(tipo);
CREATE INDEX IF NOT EXISTS idx_viajes_zona ON viajes(zona_comun);
CREATE INDEX IF NOT EXISTS idx_viajes_fecha ON viajes(fecha_hora);
CREATE INDEX IF NOT EXISTS idx_viajes_activo ON viajes(activo);
CREATE INDEX IF NOT EXISTS idx_participantes_viaje ON participantes(id_viaje);
CREATE INDEX IF NOT EXISTS idx_participantes_usuario ON participantes(id_usuario);

-- ===================================================
-- Listo! El schema está creado.
-- ===================================================

-- 6. FUNCIÓN para incrementar cupos (usada cuando un pasajero sale)
CREATE OR REPLACE FUNCTION increment_cupos(viaje_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE viajes
  SET cupos_disponibles = LEAST(cupos_disponibles + 1, 3)
  WHERE id = viaje_id AND activo = true;
END;
$$ LANGUAGE plpgsql;
