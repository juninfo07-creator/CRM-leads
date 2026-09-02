const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { STATUS_ORCAMENTO, STATUS_ORCAMENTO_LABEL } = require('../constants');
const { gerarNumero, calcularValorTotal } = require('../services/numeracao');

const router = express.Router();

const itemSchema = z.object({
  produto_id: z.number().int().positive().optional().nullable(),
  descricao: z.string().trim().optional(),
  quantidade: z.number().positive(),
  preco_unitario: z.number().nonnegative().optional(),
});

const criarOrcamentoSchema = z.object({
  cliente_id: z.number().int().positive(),
  oportunidade_id: z.number().int().positive().optional().nullable(),
  itens: z.array(itemSchema).min(1, 'inclua ao menos um item'),
  valor_desconto: z.number().nonnegative().optional(),
  valor_frete: z.number().nonnegative().optional(),
  prazo: z.string().trim().optional().nullable(),
  condicoes_comerciais: z.string().trim().optional().nullable(),
  observacoes: z.string().trim().optional().nullable(),
  data_validade: z.string().trim().optional().nullable(),
});

const atualizarOrcamentoSchema = criarOrcamentoSchema.omit({ cliente_id: true });

const statusSchema = z.object({ status: z.enum(STATUS_ORCAMENTO) });

function agora() {
  return new Date().toISOString();
}

function resolverItens(itensBrutos) {
  return itensBrutos.map((item) => {
    let descricao = item.descricao;
    let preco_unitario = item.preco_unitario;

    if (item.produto_id) {
      const produto = db.prepare('SELECT * FROM produtos WHERE id = ?').get(item.produto_id);
      if (!produto) throw new Error(`produto_id ${item.produto_id} não encontrado`);
      descricao = descricao || produto.nome;
      preco_unitario = preco_unitario ?? produto.preco_padrao;
    }

    if (!descricao) throw new Error('cada item precisa de descricao (ou produto_id válido)');
    if (preco_unitario === undefined) throw new Error('cada item precisa de preco_unitario (ou produto_id com preço padrão)');

    return {
      produto_id: item.produto_id || null,
      descricao,
      quantidade: item.quantidade,
      preco_unitario,
      subtotal: item.quantidade * preco_unitario,
    };
  });
}

function buscarItens(orcamentoId) {
  return db.prepare('SELECT * FROM orcamento_itens WHERE orcamento_id = ?').all(orcamentoId);
}

function serializar(orcamento) {
  return {
    ...orcamento,
    status_label: STATUS_ORCAMENTO_LABEL[orcamento.status],
    itens: buscarItens(orcamento.id),
    cliente: db.prepare('SELECT id, nome, telefone, empresa FROM clientes WHERE id = ?').get(orcamento.cliente_id),
  };
}

function buscarOrcamentoOu404(req, res) {
  const orcamento = db.prepare('SELECT * FROM orcamentos WHERE id = ?').get(req.params.id);
  if (!orcamento) {
    res.status(404).json({ erro: 'Orçamento não encontrado' });
    return null;
  }
  return orcamento;
}

function salvarItens(orcamentoId, itensResolvidos) {
  db.prepare('DELETE FROM orcamento_itens WHERE orcamento_id = ?').run(orcamentoId);
  const insert = db.prepare(
    `INSERT INTO orcamento_itens (orcamento_id, produto_id, descricao, quantidade, preco_unitario, subtotal)
     VALUES (@orcamento_id, @produto_id, @descricao, @quantidade, @preco_unitario, @subtotal)`
  );
  itensResolvidos.forEach((item) => insert.run({ ...item, orcamento_id: orcamentoId }));
}

// GET /api/orcamentos?cliente_id=&oportunidade_id=&status=
router.get('/', (req, res) => {
  const { cliente_id, oportunidade_id, status } = req.query;
  let orcamentos = db.prepare('SELECT * FROM orcamentos ORDER BY created_at DESC').all();
  if (cliente_id) orcamentos = orcamentos.filter((o) => String(o.cliente_id) === String(cliente_id));
  if (oportunidade_id) orcamentos = orcamentos.filter((o) => String(o.oportunidade_id) === String(oportunidade_id));
  if (status) orcamentos = orcamentos.filter((o) => o.status === status);
  res.json(orcamentos.map(serializar));
});

// GET /api/orcamentos/:id
router.get('/:id', (req, res) => {
  const orcamento = buscarOrcamentoOu404(req, res);
  if (!orcamento) return;
  res.json(serializar(orcamento));
});

// POST /api/orcamentos
router.post('/', (req, res) => {
  const parsed = criarOrcamentoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  const cliente = db.prepare('SELECT id FROM clientes WHERE id = ?').get(parsed.data.cliente_id);
  if (!cliente) return res.status(400).json({ erro: 'cliente_id não encontrado' });

  let itensResolvidos;
  try {
    itensResolvidos = resolverItens(parsed.data.itens);
  } catch (err) {
    return res.status(400).json({ erro: err.message });
  }

  const timestamp = agora();
  const valor_desconto = parsed.data.valor_desconto || 0;
  const valor_frete = parsed.data.valor_frete || 0;
  const valor_total = calcularValorTotal({ itens: itensResolvidos, valor_desconto, valor_frete });
  const numero = gerarNumero(db, 'orcamentos', 'ORC');

  const resultado = db
    .prepare(
      `INSERT INTO orcamentos
        (numero, cliente_id, oportunidade_id, status, valor_desconto, valor_frete, valor_total,
         prazo, condicoes_comerciais, observacoes, data_validade, created_at, updated_at)
       VALUES
        (@numero, @cliente_id, @oportunidade_id, 'rascunho', @valor_desconto, @valor_frete, @valor_total,
         @prazo, @condicoes_comerciais, @observacoes, @data_validade, @timestamp, @timestamp)`
    )
    .run({
      numero,
      cliente_id: parsed.data.cliente_id,
      oportunidade_id: parsed.data.oportunidade_id || null,
      valor_desconto,
      valor_frete,
      valor_total,
      prazo: parsed.data.prazo || null,
      condicoes_comerciais: parsed.data.condicoes_comerciais || null,
      observacoes: parsed.data.observacoes || null,
      data_validade: parsed.data.data_validade || null,
      timestamp,
    });

  salvarItens(resultado.lastInsertRowid, itensResolvidos);

  const orcamento = db.prepare('SELECT * FROM orcamentos WHERE id = ?').get(resultado.lastInsertRowid);
  res.status(201).json(serializar(orcamento));
});

// PUT /api/orcamentos/:id
router.put('/:id', (req, res) => {
  const orcamento = buscarOrcamentoOu404(req, res);
  if (!orcamento) return;

  const parsed = atualizarOrcamentoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  let itensResolvidos;
  try {
    itensResolvidos = resolverItens(parsed.data.itens);
  } catch (err) {
    return res.status(400).json({ erro: err.message });
  }

  const valor_desconto = parsed.data.valor_desconto ?? orcamento.valor_desconto;
  const valor_frete = parsed.data.valor_frete ?? orcamento.valor_frete;
  const valor_total = calcularValorTotal({ itens: itensResolvidos, valor_desconto, valor_frete });

  db.prepare(
    `UPDATE orcamentos SET
       valor_desconto = @valor_desconto, valor_frete = @valor_frete, valor_total = @valor_total,
       prazo = @prazo, condicoes_comerciais = @condicoes_comerciais, observacoes = @observacoes,
       data_validade = @data_validade, updated_at = @updated_at
     WHERE id = @id`
  ).run({
    id: orcamento.id,
    valor_desconto,
    valor_frete,
    valor_total,
    prazo: parsed.data.prazo !== undefined ? parsed.data.prazo : orcamento.prazo,
    condicoes_comerciais:
      parsed.data.condicoes_comerciais !== undefined ? parsed.data.condicoes_comerciais : orcamento.condicoes_comerciais,
    observacoes: parsed.data.observacoes !== undefined ? parsed.data.observacoes : orcamento.observacoes,
    data_validade: parsed.data.data_validade !== undefined ? parsed.data.data_validade : orcamento.data_validade,
    updated_at: agora(),
  });

  salvarItens(orcamento.id, itensResolvidos);

  const atualizado = db.prepare('SELECT * FROM orcamentos WHERE id = ?').get(orcamento.id);
  res.json(serializar(atualizado));
});

// PATCH /api/orcamentos/:id/status
router.patch('/:id/status', (req, res) => {
  const orcamento = buscarOrcamentoOu404(req, res);
  if (!orcamento) return;

  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  db.prepare('UPDATE orcamentos SET status = ?, updated_at = ? WHERE id = ?').run(
    parsed.data.status,
    agora(),
    orcamento.id
  );
  const atualizado = db.prepare('SELECT * FROM orcamentos WHERE id = ?').get(orcamento.id);
  res.json(serializar(atualizado));
});

// DELETE /api/orcamentos/:id
router.delete('/:id', (req, res) => {
  const orcamento = buscarOrcamentoOu404(req, res);
  if (!orcamento) return;
  db.prepare('DELETE FROM orcamentos WHERE id = ?').run(orcamento.id);
  res.status(204).send();
});

// POST /api/orcamentos/:id/converter-em-pedido
router.post('/:id/converter-em-pedido', (req, res) => {
  const orcamento = buscarOrcamentoOu404(req, res);
  if (!orcamento) return;

  if (orcamento.status === 'recusado' || orcamento.status === 'expirado') {
    return res.status(400).json({ erro: `orçamento está "${STATUS_ORCAMENTO_LABEL[orcamento.status]}" e não pode virar pedido` });
  }

  const itens = buscarItens(orcamento.id);
  const timestamp = agora();

  db.exec('BEGIN');
  let pedidoId;
  try {
    if (orcamento.status !== 'aprovado') {
      db.prepare('UPDATE orcamentos SET status = ?, updated_at = ? WHERE id = ?').run('aprovado', timestamp, orcamento.id);
    }

    const numero = gerarNumero(db, 'pedidos', 'PED');
    const resultadoPedido = db
      .prepare(
        `INSERT INTO pedidos
          (numero, cliente_id, oportunidade_id, orcamento_id, valor_desconto, valor_frete, valor_total,
           data_pedido, created_at, updated_at)
         VALUES
          (@numero, @cliente_id, @oportunidade_id, @orcamento_id, @valor_desconto, @valor_frete, @valor_total,
           @timestamp, @timestamp, @timestamp)`
      )
      .run({
        numero,
        cliente_id: orcamento.cliente_id,
        oportunidade_id: orcamento.oportunidade_id,
        orcamento_id: orcamento.id,
        valor_desconto: orcamento.valor_desconto,
        valor_frete: orcamento.valor_frete,
        valor_total: orcamento.valor_total,
        timestamp,
      });

    pedidoId = resultadoPedido.lastInsertRowid;

    const insertItem = db.prepare(
      `INSERT INTO pedido_itens (pedido_id, produto_id, descricao, quantidade, preco_unitario, subtotal)
       VALUES (@pedido_id, @produto_id, @descricao, @quantidade, @preco_unitario, @subtotal)`
    );
    itens.forEach((item) =>
      insertItem.run({
        pedido_id: pedidoId,
        produto_id: item.produto_id,
        descricao: item.descricao,
        quantidade: item.quantidade,
        preco_unitario: item.preco_unitario,
        subtotal: item.subtotal,
      })
    );

    db.prepare('INSERT INTO pedido_eventos (pedido_id, descricao, created_at) VALUES (?, ?, ?)').run(
      pedidoId,
      `Pedido criado a partir do orçamento ${orcamento.numero}`,
      timestamp
    );

    if (orcamento.oportunidade_id) {
      db.prepare(
        `UPDATE oportunidades
         SET etapa = 'venda_ganha', valor_orcamento = ?, data_entrada_etapa = ?, data_ultima_interacao = ?, updated_at = ?
         WHERE id = ?`
      ).run(orcamento.valor_total, timestamp, timestamp, timestamp, orcamento.oportunidade_id);

      const oportunidade = db.prepare('SELECT cliente_id FROM oportunidades WHERE id = ?').get(orcamento.oportunidade_id);
      if (oportunidade) {
        db.prepare('UPDATE clientes SET data_ultimo_contato = ?, updated_at = ? WHERE id = ?').run(
          timestamp,
          timestamp,
          oportunidade.cliente_id
        );
      }
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedidoId);
  res.status(201).json({
    ...pedido,
    itens: db.prepare('SELECT * FROM pedido_itens WHERE pedido_id = ?').all(pedidoId),
  });
});

module.exports = router;
