const express = require('express');
const { z } = require('zod');
const db = require('../db');

const router = express.Router();

const criarTarefaSchema = z.object({
  oportunidade_id: z.number().int().positive(),
  descricao: z.string().trim().min(1, 'descricao é obrigatória'),
  data_agendada: z.string().trim().min(1, 'data_agendada é obrigatória'),
});

function agora() {
  return new Date().toISOString();
}

function comOportunidade(tarefa) {
  const oportunidade = db
    .prepare(
      `SELECT o.id, o.produto_interesse, c.id as cliente_id, c.nome as cliente_nome
       FROM oportunidades o JOIN clientes c ON c.id = o.cliente_id
       WHERE o.id = ?`
    )
    .get(tarefa.oportunidade_id);
  return { ...tarefa, concluida: Boolean(tarefa.concluida), oportunidade };
}

// GET /api/tarefas?pendentes=true&atrasadas=true&oportunidade_id=
router.get('/', (req, res) => {
  const { pendentes, atrasadas, oportunidade_id } = req.query;
  let tarefas = db.prepare('SELECT * FROM tarefas ORDER BY data_agendada ASC').all();

  if (oportunidade_id) {
    tarefas = tarefas.filter((t) => String(t.oportunidade_id) === String(oportunidade_id));
  }
  if (pendentes === 'true') {
    tarefas = tarefas.filter((t) => !t.concluida);
  }
  if (atrasadas === 'true') {
    const hoje = new Date().toISOString();
    tarefas = tarefas.filter((t) => !t.concluida && t.data_agendada < hoje);
  }

  res.json(tarefas.map(comOportunidade));
});

// POST /api/tarefas
router.post('/', (req, res) => {
  const parsed = criarTarefaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0].message });
  }

  const oportunidade = db.prepare('SELECT id FROM oportunidades WHERE id = ?').get(parsed.data.oportunidade_id);
  if (!oportunidade) {
    return res.status(400).json({ erro: 'oportunidade_id não encontrada' });
  }

  const resultado = db
    .prepare('INSERT INTO tarefas (oportunidade_id, descricao, data_agendada, created_at) VALUES (?, ?, ?, ?)')
    .run(parsed.data.oportunidade_id, parsed.data.descricao, parsed.data.data_agendada, agora());

  const tarefa = db.prepare('SELECT * FROM tarefas WHERE id = ?').get(resultado.lastInsertRowid);
  res.status(201).json(comOportunidade(tarefa));
});

// PATCH /api/tarefas/:id/concluir
router.patch('/:id/concluir', (req, res) => {
  const tarefa = db.prepare('SELECT * FROM tarefas WHERE id = ?').get(req.params.id);
  if (!tarefa) return res.status(404).json({ erro: 'Tarefa não encontrada' });

  db.prepare('UPDATE tarefas SET concluida = 1 WHERE id = ?').run(tarefa.id);
  res.json(comOportunidade(db.prepare('SELECT * FROM tarefas WHERE id = ?').get(tarefa.id)));
});

// DELETE /api/tarefas/:id
router.delete('/:id', (req, res) => {
  const tarefa = db.prepare('SELECT * FROM tarefas WHERE id = ?').get(req.params.id);
  if (!tarefa) return res.status(404).json({ erro: 'Tarefa não encontrada' });
  db.prepare('DELETE FROM tarefas WHERE id = ?').run(tarefa.id);
  res.status(204).send();
});

module.exports = router;
