const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { ETAPAS } = require('../constants');
const { montarLinkWhatsapp, preencherTemplate } = require('../services/whatsapp');

const router = express.Router();

const criarOportunidadeSchema = z.object({
  cliente_id: z.number().int().positive(),
  etapa: z.enum(ETAPAS).optional(),
  produto_interesse: z.string().trim().optional().nullable(),
  quantidade: z.string().trim().optional().nullable(),
  valor_estimado: z.number().optional().nullable(),
  valor_orcamento: z.number().optional().nullable(),
  proxima_acao: z.string().trim().optional().nullable(),
  data_proximo_followup: z.string().trim().optional().nullable(),
  data_prevista_fechamento: z.string().trim().optional().nullable(),
});

const atualizarOportunidadeSchema = criarOportunidadeSchema.omit({ cliente_id: true, etapa: true }).partial();

const mudarEtapaSchema = z.object({
  etapa: z.enum(ETAPAS),
  motivo_perda: z.string().trim().optional().nullable(),
});

const notaSchema = z.object({
  texto: z.string().trim().min(1, 'texto é obrigatório'),
});

function agora() {
  return new Date().toISOString();
}

function tocarCliente(clienteId, timestamp) {
  db.prepare('UPDATE clientes SET data_ultimo_contato = ?, updated_at = ? WHERE id = ?').run(
    timestamp,
    timestamp,
    clienteId
  );
}

function buscarNotas(oportunidadeId) {
  return db
    .prepare('SELECT id, texto, created_at FROM oportunidade_notas WHERE oportunidade_id = ? ORDER BY created_at DESC')
    .all(oportunidadeId);
}

function buscarClienteResumo(clienteId) {
  const cliente = db.prepare('SELECT id, nome, telefone, empresa FROM clientes WHERE id = ?').get(clienteId);
  if (!cliente) return null;
  cliente.tags = db
    .prepare(
      `SELECT tags.id, tags.nome FROM tags
       JOIN cliente_tags ON cliente_tags.tag_id = tags.id
       WHERE cliente_tags.cliente_id = ?
       ORDER BY tags.nome`
    )
    .all(clienteId);
  return cliente;
}

function comAlerta(oportunidade) {
  const config = db.prepare('SELECT dias_alerta FROM etapas_config WHERE etapa = ?').get(oportunidade.etapa);
  const diasAlerta = config ? config.dias_alerta : null;
  const msPorDia = 1000 * 60 * 60 * 24;
  const diasNaEtapa = Math.floor((Date.now() - new Date(oportunidade.data_entrada_etapa).getTime()) / msPorDia);
  return {
    ...oportunidade,
    dias_na_etapa: diasNaEtapa,
    atrasado: diasAlerta !== null && diasNaEtapa > diasAlerta,
  };
}

function serializar(oportunidade, { comNotas = false } = {}) {
  const resultado = comAlerta(oportunidade);
  resultado.cliente = buscarClienteResumo(oportunidade.cliente_id);
  if (comNotas) {
    resultado.notas = buscarNotas(oportunidade.id);
  }
  return resultado;
}

function buscarOportunidadeOu404(req, res) {
  const oportunidade = db.prepare('SELECT * FROM oportunidades WHERE id = ?').get(req.params.id);
  if (!oportunidade) {
    res.status(404).json({ erro: 'Oportunidade não encontrada' });
    return null;
  }
  return oportunidade;
}

// GET /api/oportunidades?etapa=&atrasado=true&cliente_id=
router.get('/', (req, res) => {
  const { etapa, atrasado, cliente_id } = req.query;
  let oportunidades = db.prepare('SELECT * FROM oportunidades ORDER BY data_ultima_interacao DESC').all();

  if (etapa) {
    if (!ETAPAS.includes(etapa)) {
      return res.status(400).json({ erro: `etapa inválida. Use uma de: ${ETAPAS.join(', ')}` });
    }
    oportunidades = oportunidades.filter((o) => o.etapa === etapa);
  }
  if (cliente_id) {
    oportunidades = oportunidades.filter((o) => String(o.cliente_id) === String(cliente_id));
  }

  let serializadas = oportunidades.map((o) => serializar(o));

  if (atrasado === 'true') {
    serializadas = serializadas.filter((o) => o.atrasado);
  }

  res.json(serializadas);
});

// GET /api/oportunidades/:id
router.get('/:id', (req, res) => {
  const oportunidade = buscarOportunidadeOu404(req, res);
  if (!oportunidade) return;
  res.json(serializar(oportunidade, { comNotas: true }));
});

// POST /api/oportunidades
router.post('/', (req, res) => {
  const parsed = criarOportunidadeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0].message });
  }
  const cliente = db.prepare('SELECT id FROM clientes WHERE id = ?').get(parsed.data.cliente_id);
  if (!cliente) {
    return res.status(400).json({ erro: 'cliente_id não encontrado' });
  }

  const timestamp = agora();
  const dados = { ...parsed.data };
  delete dados.cliente_id;

  const resultado = db
    .prepare(
      `INSERT INTO oportunidades
        (cliente_id, etapa, produto_interesse, quantidade, valor_estimado, valor_orcamento,
         proxima_acao, data_proximo_followup, data_prevista_fechamento,
         data_entrada_etapa, data_ultima_interacao, created_at, updated_at)
       VALUES
        (@cliente_id, @etapa, @produto_interesse, @quantidade, @valor_estimado, @valor_orcamento,
         @proxima_acao, @data_proximo_followup, @data_prevista_fechamento,
         @timestamp, @timestamp, @timestamp, @timestamp)`
    )
    .run({
      cliente_id: parsed.data.cliente_id,
      etapa: dados.etapa || 'novo_lead',
      produto_interesse: dados.produto_interesse || null,
      quantidade: dados.quantidade || null,
      valor_estimado: dados.valor_estimado ?? null,
      valor_orcamento: dados.valor_orcamento ?? null,
      proxima_acao: dados.proxima_acao || null,
      data_proximo_followup: dados.data_proximo_followup || null,
      data_prevista_fechamento: dados.data_prevista_fechamento || null,
      timestamp,
    });

  tocarCliente(parsed.data.cliente_id, timestamp);

  const oportunidade = db.prepare('SELECT * FROM oportunidades WHERE id = ?').get(resultado.lastInsertRowid);
  res.status(201).json(serializar(oportunidade, { comNotas: true }));
});

// PUT /api/oportunidades/:id
router.put('/:id', (req, res) => {
  const oportunidade = buscarOportunidadeOu404(req, res);
  if (!oportunidade) return;

  const parsed = atualizarOportunidadeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0].message });
  }

  const campos = [
    'produto_interesse',
    'quantidade',
    'valor_estimado',
    'valor_orcamento',
    'proxima_acao',
    'data_proximo_followup',
    'data_prevista_fechamento',
  ];
  const dados = { id: oportunidade.id, updated_at: agora() };
  campos.forEach((campo) => {
    dados[campo] = parsed.data[campo] !== undefined ? parsed.data[campo] : oportunidade[campo];
  });

  db.prepare(
    `UPDATE oportunidades SET
       produto_interesse = @produto_interesse, quantidade = @quantidade,
       valor_estimado = @valor_estimado, valor_orcamento = @valor_orcamento,
       proxima_acao = @proxima_acao, data_proximo_followup = @data_proximo_followup,
       data_prevista_fechamento = @data_prevista_fechamento, updated_at = @updated_at
     WHERE id = @id`
  ).run(dados);

  const atualizada = db.prepare('SELECT * FROM oportunidades WHERE id = ?').get(oportunidade.id);
  res.json(serializar(atualizada, { comNotas: true }));
});

// DELETE /api/oportunidades/:id
router.delete('/:id', (req, res) => {
  const oportunidade = buscarOportunidadeOu404(req, res);
  if (!oportunidade) return;
  db.prepare('DELETE FROM oportunidades WHERE id = ?').run(oportunidade.id);
  res.status(204).send();
});

// PATCH /api/oportunidades/:id/etapa
router.patch('/:id/etapa', (req, res) => {
  const oportunidade = buscarOportunidadeOu404(req, res);
  if (!oportunidade) return;

  const parsed = mudarEtapaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0].message });
  }
  const { etapa, motivo_perda } = parsed.data;
  const timestamp = agora();

  db.prepare(
    `UPDATE oportunidades
     SET etapa = @etapa, data_entrada_etapa = @timestamp, data_ultima_interacao = @timestamp,
         motivo_perda = @motivo_perda, updated_at = @timestamp
     WHERE id = @id`
  ).run({
    etapa,
    motivo_perda: etapa === 'venda_perdida' ? motivo_perda || null : null,
    timestamp,
    id: oportunidade.id,
  });

  tocarCliente(oportunidade.cliente_id, timestamp);

  const atualizada = db.prepare('SELECT * FROM oportunidades WHERE id = ?').get(oportunidade.id);
  res.json(serializar(atualizada, { comNotas: true }));
});

// GET /api/oportunidades/:id/notas
router.get('/:id/notas', (req, res) => {
  const oportunidade = buscarOportunidadeOu404(req, res);
  if (!oportunidade) return;
  res.json(buscarNotas(oportunidade.id));
});

// POST /api/oportunidades/:id/notas
router.post('/:id/notas', (req, res) => {
  const oportunidade = buscarOportunidadeOu404(req, res);
  if (!oportunidade) return;

  const parsed = notaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0].message });
  }
  const timestamp = agora();

  db.prepare('INSERT INTO oportunidade_notas (oportunidade_id, texto, created_at) VALUES (?, ?, ?)').run(
    oportunidade.id,
    parsed.data.texto,
    timestamp
  );
  db.prepare('UPDATE oportunidades SET data_ultima_interacao = ?, updated_at = ? WHERE id = ?').run(
    timestamp,
    timestamp,
    oportunidade.id
  );
  tocarCliente(oportunidade.cliente_id, timestamp);

  res.status(201).json(buscarNotas(oportunidade.id));
});

// POST /api/oportunidades/:id/whatsapp
router.post('/:id/whatsapp', (req, res) => {
  const oportunidade = buscarOportunidadeOu404(req, res);
  if (!oportunidade) return;

  const cliente = buscarClienteResumo(oportunidade.cliente_id);
  const config = db.prepare('SELECT template_whatsapp FROM etapas_config WHERE etapa = ?').get(oportunidade.etapa);
  const template = config ? config.template_whatsapp : '';
  const mensagem = preencherTemplate(template, {
    nome: cliente.nome,
    produto_interesse: oportunidade.produto_interesse,
  });
  const link = montarLinkWhatsapp(cliente.telefone, mensagem);

  const timestamp = agora();
  db.prepare('UPDATE oportunidades SET data_ultima_interacao = ?, updated_at = ? WHERE id = ?').run(
    timestamp,
    timestamp,
    oportunidade.id
  );
  tocarCliente(oportunidade.cliente_id, timestamp);

  res.json({ link, mensagem });
});

module.exports = router;
