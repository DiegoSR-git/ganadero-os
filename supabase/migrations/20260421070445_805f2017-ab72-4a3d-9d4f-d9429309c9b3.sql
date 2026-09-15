ALTER TABLE public.wa_messages ADD COLUMN IF NOT EXISTS pending_action jsonb;
CREATE INDEX IF NOT EXISTS idx_wa_messages_remitente_pending ON public.wa_messages(remitente, recibido_en DESC) WHERE pending_action IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_company_nombre ON public.clients(company_id, nombre);