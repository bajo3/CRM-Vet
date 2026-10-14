-- Tabla de latido para el keepalive diario (Supabase free pausa proyectos sin escrituras).
CREATE TABLE IF NOT EXISTS "Heartbeat" (
    "id" TEXT NOT NULL,
    "beatAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Heartbeat_pkey" PRIMARY KEY ("id")
);
