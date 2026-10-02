-- ==============================================================================
-- Migration: 20261002_audit_chat_logs.sql
-- Description: Criação da tabela de auditoria imutável, métricas e rastreamento de custos USD
-- ==============================================================================

CREATE TABLE IF NOT EXISTS audit_chat_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    user_email TEXT NOT NULL,
    ip_address TEXT,
    session_id TEXT,
    user_prompt TEXT NOT NULL,
    model_response TEXT NOT NULL,
    model_name TEXT NOT NULL,
    prompt_tokens INT NOT NULL DEFAULT 0,
    completion_tokens INT NOT NULL DEFAULT 0,
    total_tokens INT NOT NULL DEFAULT 0,
    cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0.000000,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices essenciais para consultas do painel administrativo
CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_chat_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_chat_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_model_name ON audit_chat_logs(model_name);

COMMENT ON TABLE audit_chat_logs IS 'Tabela imutável de telemetria, auditoria de conversas e rastreamento de custos em dólar.';
