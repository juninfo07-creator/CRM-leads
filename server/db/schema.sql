CREATE TABLE IF NOT EXISTS etapas_config (
  etapa TEXT PRIMARY KEY,
  ordem INTEGER NOT NULL,
  dias_alerta INTEGER NOT NULL DEFAULT 3,
  template_whatsapp TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  tipo_pessoa TEXT NOT NULL DEFAULT 'pf',
  documento TEXT,
  empresa TEXT,
  telefone TEXT NOT NULL,
  email TEXT,
  instagram TEXT,
  origem TEXT,
  observacoes TEXT,
  data_primeiro_contato TEXT NOT NULL,
  data_ultimo_contato TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oportunidades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  etapa TEXT NOT NULL DEFAULT 'novo_lead' REFERENCES etapas_config(etapa),
  produto_interesse TEXT,
  quantidade TEXT,
  valor_estimado REAL,
  valor_orcamento REAL,
  proxima_acao TEXT,
  data_proximo_followup TEXT,
  motivo_perda TEXT,
  data_entrada_etapa TEXT NOT NULL,
  data_ultima_interacao TEXT NOT NULL,
  data_prevista_fechamento TEXT,
  olist_pedido_id TEXT,
  situacao_pedido TEXT,
  codigo_rastreio TEXT,
  status_entrega TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oportunidade_notas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  oportunidade_id INTEGER NOT NULL REFERENCES oportunidades(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS cliente_tags (
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (cliente_id, tag_id)
);

CREATE TABLE IF NOT EXISTS tarefas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  oportunidade_id INTEGER NOT NULL REFERENCES oportunidades(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  data_agendada TEXT NOT NULL,
  concluida INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oportunidades_cliente_id ON oportunidades(cliente_id);
CREATE INDEX IF NOT EXISTS idx_oportunidades_etapa ON oportunidades(etapa);
CREATE INDEX IF NOT EXISTS idx_oportunidade_notas_oportunidade_id ON oportunidade_notas(oportunidade_id);
CREATE INDEX IF NOT EXISTS idx_cliente_tags_cliente_id ON cliente_tags(cliente_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_oportunidade_id ON tarefas(oportunidade_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_data_agendada ON tarefas(data_agendada);
