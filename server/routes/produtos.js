const express = require('express');
const { z } = require('zod');
const db = require('../db');

const router = express.Router();

const criarProdutoSchema = z.object({
  nome: z.string().trim().min(1, 'nome é obrigatório'),
  largura: z.string().trim().optional().nullable(),
  unidade: z.string().trim().optional().nullable(),
  preco_padrao: z.number().nonnegative().optional(),
  observacoes: z.string().trim().optional().nullable(),
});

const atualizarProdutoSchema = criarProdutoSchema.partial();

function agora() {
  return new Date().toISOString();
}

// GET /api/produtos?ativo=true
router.get('/', (req, res) => {
  let produtos = db.prepare('SELECT * FROM produtos ORDER BY nome').all();
  if (req.query.ativo === 'true') produtos = produtos.filter((p) => p.ativo);
  res.json(produtos.map((p) => ({ ...p, ativo: Boolean(p.ativo) })));
});

// GET /api/produtos/:id
router.get('/:id', (req, res) => {
  const produto = db.prepare('SELECT * FROM produtos WHERE id = ?').get(req.params.id);
  if (!produto) return res.status(404).json({ erro: 'Produto não encontrado' });
  res.json({ ...produto, ativo: Boolean(produto.ativo) });
});

// POST /api/produtos
router.post('/', (req, res) => {
  const parsed = criarProdutoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  const timestamp = agora();
  const resultado = db
    .prepare(
      `INSERT INTO produtos (nome, largura, unidade, preco_padrao, observacoes, created_at, updated_at)
       VALUES (@nome, @largura, @unidade, @preco_padrao, @observacoes, @timestamp, @timestamp)`
    )
    .run({
      nome: parsed.data.nome,
      largura: parsed.data.largura || null,
      unidade: parsed.data.unidade || null,
      preco_padrao: parsed.data.preco_padrao ?? 0,
      observacoes: parsed.data.observacoes || null,
      timestamp,
    });

  const produto = db.prepare('SELECT * FROM produtos WHERE id = ?').get(resultado.lastInsertRowid);
  res.status(201).json({ ...produto, ativo: Boolean(produto.ativo) });
});

// PUT /api/produtos/:id
router.put('/:id', (req, res) => {
  const produto = db.prepare('SELECT * FROM produtos WHERE id = ?').get(req.params.id);
  if (!produto) return res.status(404).json({ erro: 'Produto não encontrado' });

  const parsed = atualizarProdutoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  const campos = ['nome', 'largura', 'unidade', 'preco_padrao', 'observacoes'];
  const dados = { id: produto.id, updated_at: agora() };
  campos.forEach((campo) => {
    dados[campo] = parsed.data[campo] !== undefined ? parsed.data[campo] : produto[campo];
  });

  db.prepare(
    `UPDATE produtos SET nome = @nome, largura = @largura, unidade = @unidade,
       preco_padrao = @preco_padrao, observacoes = @observacoes, updated_at = @updated_at
     WHERE id = @id`
  ).run(dados);

  const atualizado = db.prepare('SELECT * FROM produtos WHERE id = ?').get(produto.id);
  res.json({ ...atualizado, ativo: Boolean(atualizado.ativo) });
});

// PATCH /api/produtos/:id/status  { ativo: true|false }
router.patch('/:id/status', (req, res) => {
  const produto = db.prepare('SELECT * FROM produtos WHERE id = ?').get(req.params.id);
  if (!produto) return res.status(404).json({ erro: 'Produto não encontrado' });

  const parsed = z.object({ ativo: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  db.prepare('UPDATE produtos SET ativo = ?, updated_at = ? WHERE id = ?').run(
    parsed.data.ativo ? 1 : 0,
    agora(),
    produto.id
  );
  const atualizado = db.prepare('SELECT * FROM produtos WHERE id = ?').get(produto.id);
  res.json({ ...atualizado, ativo: Boolean(atualizado.ativo) });
});

module.exports = router;
