const express = require('express');
const { z } = require('zod');
const db = require('../db');

const router = express.Router();

// GET /api/tags
router.get('/', (req, res) => {
  res.json(db.prepare('SELECT id, nome FROM tags ORDER BY nome').all());
});

// POST /api/tags
router.post('/', (req, res) => {
  const parsed = z.object({ nome: z.string().trim().min(1) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0].message });
  }
  const info = db.prepare('INSERT OR IGNORE INTO tags (nome) VALUES (?)').run(parsed.data.nome);
  const tag = info.changes
    ? db.prepare('SELECT id, nome FROM tags WHERE id = ?').get(info.lastInsertRowid)
    : db.prepare('SELECT id, nome FROM tags WHERE nome = ?').get(parsed.data.nome);
  res.status(201).json(tag);
});

module.exports = router;
