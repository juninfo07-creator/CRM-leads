const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { TIPOS_PESSOA, ETAPAS_GANHAS } = require('../constants');

const router = express.Router();

const criarClienteSchema = z.object({
  nome: z.string().trim().min(1, 'nome é obrigatório'),
  telefone: z.string().trim().min(8, 'telefone inválido'),
  tipo_pessoa: z.enum(TIPOS_PESSOA).optional(),
  documento: z.string().trim().optional().nullable(),
  empresa: z.string().trim().optional().nullable(),
  email: z.string().trim().optional().nullable(),
  instagram: z.string().trim().optional().nullable(),
  origem: z.string().trim().optional().nullable(),
  observacoes: z.string().trim().optional().nullable(),
  tags: z.array(z.string().trim().min(1)).optional(),
});

const atualizarClienteSchema = criarClienteSchema.partial();

function agora() {
  return new Date().toISOString();
}

function buscarTagsDoCliente(clienteId) {
  return db
    .prepare(
      `SELECT tags.id, tags.nome
       FROM tags
       JOIN cliente_tags ON cliente_tags.tag_id = tags.id
       WHERE cliente_tags.cliente_id = ?
       ORDER BY tags.nome`
    )
    .all(clienteId);
}

function vincularTagPorNome(clienteId, nomeTag) {
  const nome = nomeTag.trim();
  if (!nome) return;
  db.prepare('INSERT OR IGNORE INTO tags (nome) VALUES (?)').run(nome);
  const tag = db.prepare('SELECT id FROM tags WHERE nome = ?').get(nome);
  db.prepare('INSERT OR IGNORE INTO cliente_tags (cliente_id, tag_id) VALUES (?, ?)').run(clienteId, tag.id);
}

function calcularResumoCompras(clienteId) {
  const placeholders = ETAPAS_GANHAS.map(() => '?').join(',');
  const ganhas = db
    .prepare(
      `SELECT valor_orcamento, valor_estimado, data_entrada_etapa
       FROM oportunidades
       WHERE cliente_id = ? AND etapa IN (${placeholders})
       ORDER BY data_entrada_etapa DESC`
    )
    .all(clienteId, ...ETAPAS_GANHAS);

  const quantidade_compras = ganhas.length;
  const valor_total_vendas = ganhas.reduce((soma, o) => soma + (o.valor_orcamento ?? o.valor_estimado ?? 0), 0);
  const ultima_compra = ganhas[0] ? ganhas[0].data_entrada_etapa : null;

  let status = 'lead';
  if (quantidade_compras === 1) status = 'cliente';
  if (quantidade_compras > 1) status = 'cliente_recorrente';

  return { status, quantidade_compras, valor_total_vendas, ultima_compra };
}

function serializarCliente(cliente, { comOportunidades = false } = {}) {
  const resultado = { ...cliente, tags: buscarTagsDoCliente(cliente.id), ...calcularResumoCompras(cliente.id) };
  if (comOportunidades) {
    resultado.oportunidades = db
      .prepare('SELECT * FROM oportunidades WHERE cliente_id = ? ORDER BY created_at DESC')
      .all(cliente.id);
  }
  return resultado;
}

function buscarClienteOu404(req, res) {
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  if (!cliente) {
    res.status(404).json({ erro: 'Cliente não encontrado' });
    return null;
  }
  return cliente;
}

// GET /api/clientes?busca=&tag=&status=
router.get('/', (req, res) => {
  const { busca, tag, status } = req.query;
  let clientes = db.prepare('SELECT * FROM clientes ORDER BY data_ultimo_contato DESC').all();

  if (busca) {
    const termo = busca.toLowerCase();
    clientes = clientes.filter(
      (c) =>
        c.nome.toLowerCase().includes(termo) ||
        (c.telefone || '').includes(termo) ||
        (c.empresa || '').toLowerCase().includes(termo)
    );
  }

  let serializados = clientes.map((c) => serializarCliente(c));

  if (tag) {
    serializados = serializados.filter((c) => c.tags.some((t) => String(t.id) === String(tag)));
  }
  if (status) {
    serializados = serializados.filter((c) => c.status === status);
  }

  res.json(serializados);
});

// GET /api/clientes/:id
router.get('/:id', (req, res) => {
  const cliente = buscarClienteOu404(req, res);
  if (!cliente) return;
  res.json(serializarCliente(cliente, { comOportunidades: true }));
});

// POST /api/clientes
router.post('/', (req, res) => {
  const parsed = criarClienteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0].message });
  }
  const { nome, telefone, tipo_pessoa, documento, empresa, email, instagram, origem, observacoes, tags } =
    parsed.data;
  const timestamp = agora();

  const resultado = db
    .prepare(
      `INSERT INTO clientes
        (nome, telefone, tipo_pessoa, documento, empresa, email, instagram, origem, observacoes,
         data_primeiro_contato, data_ultimo_contato, created_at, updated_at)
       VALUES
        (@nome, @telefone, @tipo_pessoa, @documento, @empresa, @email, @instagram, @origem, @observacoes,
         @timestamp, @timestamp, @timestamp, @timestamp)`
    )
    .run({
      nome,
      telefone,
      tipo_pessoa: tipo_pessoa || 'pf',
      documento: documento || null,
      empresa: empresa || null,
      email: email || null,
      instagram: instagram || null,
      origem: origem || null,
      observacoes: observacoes || null,
      timestamp,
    });

  const clienteId = resultado.lastInsertRowid;
  (tags || []).forEach((nomeTag) => vincularTagPorNome(clienteId, nomeTag));

  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(clienteId);
  res.status(201).json(serializarCliente(cliente, { comOportunidades: true }));
});

// PUT /api/clientes/:id
router.put('/:id', (req, res) => {
  const cliente = buscarClienteOu404(req, res);
  if (!cliente) return;

  const parsed = atualizarClienteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0].message });
  }

  const campos = ['nome', 'telefone', 'tipo_pessoa', 'documento', 'empresa', 'email', 'instagram', 'origem', 'observacoes'];
  const dados = { id: cliente.id, updated_at: agora() };
  campos.forEach((campo) => {
    dados[campo] = parsed.data[campo] !== undefined ? parsed.data[campo] : cliente[campo];
  });

  db.prepare(
    `UPDATE clientes SET
       nome = @nome, telefone = @telefone, tipo_pessoa = @tipo_pessoa, documento = @documento,
       empresa = @empresa, email = @email, instagram = @instagram, origem = @origem,
       observacoes = @observacoes, updated_at = @updated_at
     WHERE id = @id`
  ).run(dados);

  const atualizado = db.prepare('SELECT * FROM clientes WHERE id = ?').get(cliente.id);
  res.json(serializarCliente(atualizado, { comOportunidades: true }));
});

// DELETE /api/clientes/:id
router.delete('/:id', (req, res) => {
  const cliente = buscarClienteOu404(req, res);
  if (!cliente) return;
  db.prepare('DELETE FROM clientes WHERE id = ?').run(cliente.id);
  res.status(204).send();
});

// POST /api/clientes/:id/tags
router.post('/:id/tags', (req, res) => {
  const cliente = buscarClienteOu404(req, res);
  if (!cliente) return;

  const parsed = z.object({ nome: z.string().trim().min(1) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0].message });
  }

  vincularTagPorNome(cliente.id, parsed.data.nome);
  res.status(201).json(buscarTagsDoCliente(cliente.id));
});

// DELETE /api/clientes/:id/tags/:tagId
router.delete('/:id/tags/:tagId', (req, res) => {
  const cliente = buscarClienteOu404(req, res);
  if (!cliente) return;
  db.prepare('DELETE FROM cliente_tags WHERE cliente_id = ? AND tag_id = ?').run(cliente.id, req.params.tagId);
  res.status(204).send();
});

module.exports = router;
