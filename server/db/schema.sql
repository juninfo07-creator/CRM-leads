CREATE TABLE IF NOT EXISTS etapas_config (
  etapa TEXT PRIMARY KEY,
  ordem INTEGER NOT NULL,
  dias_alerta INTEGER NOT NULL DEFAULT 3,
  template_whatsapp TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  produto_interesse TEXT,
  etapa TEXT NOT NULL DEFAULT 'lead_entrou' REFERENCES etapas_config(etapa),
  data_entrada_etapa TEXT NOT NULL,
  data_ultima_interacao TEXT NOT NULL,
  motivo_perda TEXT,
  olist_pedido_id TEXT,
  situacao_pedido TEXT,
  codigo_rastreio TEXT,
  status_entrega TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lead_notas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS lead_tags (
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (lead_id, tag_id)
);

CREATE TABLE IF NOT EXISTS tarefas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  data_agendada TEXT NOT NULL,
  concluida INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leads_etapa ON leads(etapa);
CREATE INDEX IF NOT EXISTS idx_lead_notas_lead_id ON lead_notas(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_tags_lead_id ON lead_tags(lead_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_lead_id ON tarefas(lead_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_data_agendada ON tarefas(data_agendada);
