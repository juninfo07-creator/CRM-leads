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
  cep TEXT,
  endereco TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  estado TEXT,
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

CREATE TABLE IF NOT EXISTS produtos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  largura TEXT,
  unidade TEXT,
  preco_padrao REAL NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1,
  observacoes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orcamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT NOT NULL UNIQUE,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  oportunidade_id INTEGER REFERENCES oportunidades(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'rascunho',
  valor_desconto REAL NOT NULL DEFAULT 0,
  valor_frete REAL NOT NULL DEFAULT 0,
  valor_total REAL NOT NULL DEFAULT 0,
  prazo TEXT,
  condicoes_comerciais TEXT,
  observacoes TEXT,
  data_validade TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orcamento_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orcamento_id INTEGER NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
  produto_id INTEGER REFERENCES produtos(id) ON DELETE SET NULL,
  descricao TEXT NOT NULL,
  quantidade REAL NOT NULL DEFAULT 1,
  preco_unitario REAL NOT NULL DEFAULT 0,
  subtotal REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pedidos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT NOT NULL UNIQUE,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  oportunidade_id INTEGER REFERENCES oportunidades(id) ON DELETE SET NULL,
  orcamento_id INTEGER REFERENCES orcamentos(id) ON DELETE SET NULL,
  status_comercial TEXT NOT NULL DEFAULT 'novo',
  status_producao TEXT NOT NULL DEFAULT 'aguardando_arte',
  status_fiscal TEXT NOT NULL DEFAULT 'pendente',
  status_logistico TEXT NOT NULL DEFAULT 'aguardando_envio',
  valor_desconto REAL NOT NULL DEFAULT 0,
  valor_frete REAL NOT NULL DEFAULT 0,
  valor_total REAL NOT NULL DEFAULT 0,
  data_pedido TEXT NOT NULL,
  prazo_entrega TEXT,
  arte_aprovada INTEGER NOT NULL DEFAULT 0,
  logo_arquivo TEXT,
  cor_fita TEXT,
  tipo_fita TEXT,
  largura TEXT,
  tipo_personalizacao TEXT,
  observacoes_producao TEXT,
  nf_numero TEXT,
  nf_url TEXT,
  etiqueta_codigo TEXT,
  codigo_rastreio TEXT,
  link_rastreio TEXT,
  olist_pedido_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pedido_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id INTEGER REFERENCES produtos(id) ON DELETE SET NULL,
  descricao TEXT NOT NULL,
  quantidade REAL NOT NULL DEFAULT 1,
  preco_unitario REAL NOT NULL DEFAULT 0,
  subtotal REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pedido_eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oportunidades_cliente_id ON oportunidades(cliente_id);
CREATE INDEX IF NOT EXISTS idx_oportunidades_etapa ON oportunidades(etapa);
CREATE INDEX IF NOT EXISTS idx_oportunidade_notas_oportunidade_id ON oportunidade_notas(oportunidade_id);
CREATE INDEX IF NOT EXISTS idx_cliente_tags_cliente_id ON cliente_tags(cliente_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_oportunidade_id ON tarefas(oportunidade_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_data_agendada ON tarefas(data_agendada);
CREATE INDEX IF NOT EXISTS idx_orcamentos_cliente_id ON orcamentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_orcamentos_status ON orcamentos(status);
CREATE INDEX IF NOT EXISTS idx_orcamento_itens_orcamento_id ON orcamento_itens(orcamento_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente_id ON pedidos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pedido_itens_pedido_id ON pedido_itens(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedido_eventos_pedido_id ON pedido_eventos(pedido_id);
