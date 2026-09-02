const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { ETAPAS, ETAPAS_LABEL } = require('../constants');

const router = express.Router();

const atualizarEtapaSchema = z.object({
  dias_alerta: z.number().int().positive().optional(),
  template_whatsapp: z.string().trim().min(1).optional(),
});

// GET /api/etapas
router.get('/', (req, res) => {
  const etapas = db.prepare('SELECT * FROM etapas_config ORDER BY ordem').all();
  res.json(etapas.map((e) => ({ ...e, label: ETAPAS_LABEL[e.etapa] })));
});

// PUT /api/etapas/:etapa
router.put('/:etapa', (req, res) => {
  const { etapa } = req.params;
  if (!ETAPAS.includes(etapa)) {
    return res.status(404).json({ erro: 'etapa não encontrada' });
  }

  const parsed = atualizarEtapaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0].message });
  }
  if (Object.keys(parsed.data).length === 0) {
    return res.status(400).json({ erro: 'informe dias_alerta e/ou template_whatsapp' });
  }

  const atual = db.prepare('SELECT * FROM etapas_config WHERE etapa = ?').get(etapa);
  const dados = {
    dias_alerta: parsed.data.dias_alerta ?? atual.dias_alerta,
    template_whatsapp: parsed.data.template_whatsapp ?? atual.template_whatsapp,
    etapa,
  };

  db.prepare('UPDATE etapas_config SET dias_alerta = @dias_alerta, template_whatsapp = @template_whatsapp WHERE etapa = @etapa').run(
    dados
  );

  const atualizado = db.prepare('SELECT * FROM etapas_config WHERE etapa = ?').get(etapa);
  res.json({ ...atualizado, label: ETAPAS_LABEL[etapa] });
});

module.exports = router;
