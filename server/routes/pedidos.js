const express = require('express');
const { z } = require('zod');
const db = require('../db');
const {
  STATUS_COMERCIAL_PEDIDO,
  STATUS_PRODUCAO,
  STATUS_PRODUCAO_LABEL,
  STATUS_FISCAL,
  STATUS_LOGISTICO,
} = require('../constants');

const router = express.Router();

const atualizarPedidoSchema = z.object({
  prazo_entrega: z.string().trim().optional().nullable(),
  arte_aprovada: z.boolean().optional(),
  logo_arquivo: z.string().trim().optional().nullable(),
  cor_fita: z.string().trim().optional().nullable(),
  tipo_fita: z.string().trim().optional().nullable(),
  largura: z.string().trim().optional().nullable(),
  tipo_personalizacao: z.string().trim().optional().nullable(),
  observacoes_producao: z.string().trim().optional().nullable(),
  nf_numero: z.string().trim().optional().nullable(),
  nf_url: z.string().trim().optional().nullable(),
  etiqueta_codigo: z.string().trim().optional().nullable(),
  codigo_rastreio: z.string().trim().optional().nullable(),
  link_rastreio: z.string().trim().optional().nullable(),
});

function agora() {
  return new Date().toISOString();
}

function registrarEvento(pedidoId, descricao, timestamp) {
  db.prepare('INSERT INTO pedido_eventos (pedido_id, descricao, created_at) VALUES (?, ?, ?)').run(
    pedidoId,
    descricao,
    timestamp
  );
}

function serializar(pedido, { comDetalhes = false } = {}) {
  const resultado = {
    ...pedido,
    arte_aprovada: Boolean(pedido.arte_aprovada),
    cliente: db.prepare('SELECT id, nome, telefone, empresa FROM clientes WHERE id = ?').get(pedido.cliente_id),
  };
  if (comDetalhes) {
    resultado.itens = db.prepare('SELECT * FROM pedido_itens WHERE pedido_id = ?').all(pedido.id);
    resultado.eventos = db
      .prepare('SELECT * FROM pedido_eventos WHERE pedido_id = ? ORDER BY created_at DESC')
      .all(pedido.id);
  }
  return resultado;
}

function buscarPedidoOu404(req, res) {
  const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
  if (!pedido) {
    res.status(404).json({ erro: 'Pedido não encontrado' });
    return null;
  }
  return pedido;
}

// GET /api/pedidos?cliente_id=&status_comercial=&status_producao=&status_logistico=
router.get('/', (req, res) => {
  const { cliente_id, status_comercial, status_producao, status_logistico } = req.query;
  let pedidos = db.prepare('SELECT * FROM pedidos ORDER BY created_at DESC').all();
  if (cliente_id) pedidos = pedidos.filter((p) => String(p.cliente_id) === String(cliente_id));
  if (status_comercial) pedidos = pedidos.filter((p) => p.status_comercial === status_comercial);
  if (status_producao) pedidos = pedidos.filter((p) => p.status_producao === status_producao);
  if (status_logistico) pedidos = pedidos.filter((p) => p.status_logistico === status_logistico);
  res.json(pedidos.map((p) => serializar(p)));
});

// GET /api/pedidos/:id
router.get('/:id', (req, res) => {
  const pedido = buscarPedidoOu404(req, res);
  if (!pedido) return;
  res.json(serializar(pedido, { comDetalhes: true }));
});

// PUT /api/pedidos/:id — dados de produção/fiscal/logística que não têm rota de status própria
router.put('/:id', (req, res) => {
  const pedido = buscarPedidoOu404(req, res);
  if (!pedido) return;

  const parsed = atualizarPedidoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  const campos = [
    'prazo_entrega', 'arte_aprovada', 'logo_arquivo', 'cor_fita', 'tipo_fita', 'largura',
    'tipo_personalizacao', 'observacoes_producao', 'nf_numero', 'nf_url', 'etiqueta_codigo',
    'codigo_rastreio', 'link_rastreio',
  ];
  const dados = { id: pedido.id, updated_at: agora() };
  campos.forEach((campo) => {
    let valor = parsed.data[campo] !== undefined ? parsed.data[campo] : pedido[campo];
    if (campo === 'arte_aprovada') valor = valor ? 1 : 0;
    dados[campo] = valor;
  });

  db.prepare(
    `UPDATE pedidos SET
       prazo_entrega = @prazo_entrega, arte_aprovada = @arte_aprovada, logo_arquivo = @logo_arquivo,
       cor_fita = @cor_fita, tipo_fita = @tipo_fita, largura = @largura,
       tipo_personalizacao = @tipo_personalizacao, observacoes_producao = @observacoes_producao,
       nf_numero = @nf_numero, nf_url = @nf_url, etiqueta_codigo = @etiqueta_codigo,
       codigo_rastreio = @codigo_rastreio, link_rastreio = @link_rastreio, updated_at = @updated_at
     WHERE id = @id`
  ).run(dados);

  if (parsed.data.arte_aprovada === true && !pedido.arte_aprovada) {
    registrarEvento(pedido.id, 'Arte aprovada pelo cliente', agora());
  }

  const atualizado = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedido.id);
  res.json(serializar(atualizado, { comDetalhes: true }));
});

function criarRotaStatus(campo, valoresValidos, labels) {
  router.patch(`/:id/${campo.replace('status_', 'status-')}`, (req, res) => {
    const pedido = buscarPedidoOu404(req, res);
    if (!pedido) return;

    const parsed = z.object({ valor: z.enum(valoresValidos) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

    const timestamp = agora();
    db.prepare(`UPDATE pedidos SET ${campo} = ?, updated_at = ? WHERE id = ?`).run(
      parsed.data.valor,
      timestamp,
      pedido.id
    );

    const label = labels ? labels[parsed.data.valor] : parsed.data.valor;
    registrarEvento(pedido.id, `${campo} → ${label}`, timestamp);

    const atualizado = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedido.id);
    res.json(serializar(atualizado, { comDetalhes: true }));
  });
}

criarRotaStatus('status_comercial', STATUS_COMERCIAL_PEDIDO);
criarRotaStatus('status_producao', STATUS_PRODUCAO, STATUS_PRODUCAO_LABEL);
criarRotaStatus('status_fiscal', STATUS_FISCAL);
criarRotaStatus('status_logistico', STATUS_LOGISTICO);

// DELETE /api/pedidos/:id
router.delete('/:id', (req, res) => {
  const pedido = buscarPedidoOu404(req, res);
  if (!pedido) return;
  db.prepare('DELETE FROM pedidos WHERE id = ?').run(pedido.id);
  res.status(204).send();
});

module.exports = router;
