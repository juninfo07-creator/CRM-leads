const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { ETAPAS } = require('../constants');
const { montarLinkWhatsapp, preencherTemplate } = require('../services/whatsapp');

const router = express.Router();

const criarLeadSchema = z.object({
  nome: z.string().trim().min(1, 'nome é obrigatório'),
  telefone: z.string().trim().min(8, 'telefone inválido'),
  produto_interesse: z.string().trim().optional().nullable(),
  etapa: z.enum(ETAPAS).optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
});

const atualizarLeadSchema = z.object({
  nome: z.string().trim().min(1).optional(),
  telefone: z.string().trim().min(8).optional(),
  produto_interesse: z.string().trim().optional().nullable(),
});

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

function buscarTagsDoLead(leadId) {
  return db
    .prepare(
      `SELECT tags.id, tags.nome
       FROM tags
       JOIN lead_tags ON lead_tags.tag_id = tags.id
       WHERE lead_tags.lead_id = ?
       ORDER BY tags.nome`
    )
    .all(leadId);
}

function buscarNotasDoLead(leadId) {
  return db
    .prepare('SELECT id, texto, created_at FROM lead_notas WHERE lead_id = ? ORDER BY created_at DESC')
    .all(leadId);
}

function comAlerta(lead) {
  const config = db.prepare('SELECT dias_alerta FROM etapas_config WHERE etapa = ?').get(lead.etapa);
  const diasAlerta = config ? config.dias_alerta : null;
  const msPorDia = 1000 * 60 * 60 * 24;
  const diasNaEtapa = Math.floor((Date.now() - new Date(lead.data_entrada_etapa).getTime()) / msPorDia);
  return {
    ...lead,
    dias_na_etapa: diasNaEtapa,
    atrasado: diasAlerta !== null && diasNaEtapa > diasAlerta,
  };
}

function serializarLead(lead, { comNotas = false } = {}) {
  const resultado = comAlerta(lead);
  resultado.tags = buscarTagsDoLead(lead.id);
  if (comNotas) {
    resultado.notas = buscarNotasDoLead(lead.id);
  }
  return resultado;
}

function buscarLeadOu404(req, res) {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) {
    res.status(404).json({ erro: 'Lead não encontrado' });
    return null;
  }
  return lead;
}

function vincularTagPorNome(leadId, nomeTag) {
  const nome = nomeTag.trim();
  if (!nome) return;
  db.prepare('INSERT OR IGNORE INTO tags (nome) VALUES (?)').run(nome);
  const tag = db.prepare('SELECT id FROM tags WHERE nome = ?').get(nome);
  db.prepare('INSERT OR IGNORE INTO lead_tags (lead_id, tag_id) VALUES (?, ?)').run(leadId, tag.id);
}

// GET /api/leads?etapa=&tag=&atrasado=true
router.get('/', (req, res) => {
  const { etapa, tag, atrasado } = req.query;

  let leads = db.prepare('SELECT * FROM leads ORDER BY data_ultima_interacao DESC').all();

  if (etapa) {
    if (!ETAPAS.includes(etapa)) {
      return res.status(400).json({ erro: `etapa inválida. Use uma de: ${ETAPAS.join(', ')}` });
    }
    leads = leads.filter((lead) => lead.etapa === etapa);
  }

  let serializados = leads.map((lead) => serializarLead(lead));

  if (tag) {
    serializados = serializados.filter((lead) => lead.tags.some((t) => String(t.id) === String(tag)));
  }

  if (atrasado === 'true') {
    serializados = serializados.filter((lead) => lead.atrasado);
  }

  res.json(serializados);
});

// GET /api/leads/:id
router.get('/:id', (req, res) => {
  const lead = buscarLeadOu404(req, res);
  if (!lead) return;
  res.json(serializarLead(lead, { comNotas: true }));
});

// POST /api/leads
router.post('/', (req, res) => {
  const parsed = criarLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0].message });
  }
  const { nome, telefone, produto_interesse, etapa, tags } = parsed.data;
  const timestamp = agora();

  const resultado = db
    .prepare(
      `INSERT INTO leads (nome, telefone, produto_interesse, etapa, data_entrada_etapa, data_ultima_interacao, created_at, updated_at)
       VALUES (@nome, @telefone, @produto_interesse, @etapa, @timestamp, @timestamp, @timestamp, @timestamp)`
    )
    .run({
      nome,
      telefone,
      produto_interesse: produto_interesse || null,
      etapa: etapa || 'lead_entrou',
      timestamp,
    });

  const leadId = resultado.lastInsertRowid;
  (tags || []).forEach((nomeTag) => vincularTagPorNome(leadId, nomeTag));

  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId);
  res.status(201).json(serializarLead(lead, { comNotas: true }));
});

// PUT /api/leads/:id
router.put('/:id', (req, res) => {
  const lead = buscarLeadOu404(req, res);
  if (!lead) return;

  const parsed = atualizarLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0].message });
  }

  const dados = {
    nome: parsed.data.nome ?? lead.nome,
    telefone: parsed.data.telefone ?? lead.telefone,
    produto_interesse:
      parsed.data.produto_interesse !== undefined ? parsed.data.produto_interesse : lead.produto_interesse,
    updated_at: agora(),
    id: lead.id,
  };

  db.prepare(
    `UPDATE leads SET nome = @nome, telefone = @telefone, produto_interesse = @produto_interesse, updated_at = @updated_at
     WHERE id = @id`
  ).run(dados);

  const atualizado = db.prepare('SELECT * FROM leads WHERE id = ?').get(lead.id);
  res.json(serializarLead(atualizado, { comNotas: true }));
});

// DELETE /api/leads/:id
router.delete('/:id', (req, res) => {
  const lead = buscarLeadOu404(req, res);
  if (!lead) return;
  db.prepare('DELETE FROM leads WHERE id = ?').run(lead.id);
  res.status(204).send();
});

// PATCH /api/leads/:id/etapa
router.patch('/:id/etapa', (req, res) => {
  const lead = buscarLeadOu404(req, res);
  if (!lead) return;

  const parsed = mudarEtapaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0].message });
  }
  const { etapa, motivo_perda } = parsed.data;
  const timestamp = agora();

  db.prepare(
    `UPDATE leads
     SET etapa = @etapa,
         data_entrada_etapa = @timestamp,
         data_ultima_interacao = @timestamp,
         motivo_perda = @motivo_perda,
         updated_at = @timestamp
     WHERE id = @id`
  ).run({
    etapa,
    motivo_perda: etapa === 'perdido' ? motivo_perda || null : null,
    timestamp,
    id: lead.id,
  });

  const atualizado = db.prepare('SELECT * FROM leads WHERE id = ?').get(lead.id);
  res.json(serializarLead(atualizado, { comNotas: true }));
});

// GET /api/leads/:id/notas
router.get('/:id/notas', (req, res) => {
  const lead = buscarLeadOu404(req, res);
  if (!lead) return;
  res.json(buscarNotasDoLead(lead.id));
});

// POST /api/leads/:id/notas
router.post('/:id/notas', (req, res) => {
  const lead = buscarLeadOu404(req, res);
  if (!lead) return;

  const parsed = notaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0].message });
  }
  const timestamp = agora();

  db.prepare('INSERT INTO lead_notas (lead_id, texto, created_at) VALUES (?, ?, ?)').run(
    lead.id,
    parsed.data.texto,
    timestamp
  );
  db.prepare('UPDATE leads SET data_ultima_interacao = ?, updated_at = ? WHERE id = ?').run(
    timestamp,
    timestamp,
    lead.id
  );

  res.status(201).json(buscarNotasDoLead(lead.id));
});

// POST /api/leads/:id/whatsapp — gera o link com o template da etapa atual e registra a interação
router.post('/:id/whatsapp', (req, res) => {
  const lead = buscarLeadOu404(req, res);
  if (!lead) return;

  const config = db.prepare('SELECT template_whatsapp FROM etapas_config WHERE etapa = ?').get(lead.etapa);
  const template = config ? config.template_whatsapp : '';
  const mensagem = preencherTemplate(template, lead);
  const link = montarLinkWhatsapp(lead.telefone, mensagem);

  const timestamp = agora();
  db.prepare('UPDATE leads SET data_ultima_interacao = ?, updated_at = ? WHERE id = ?').run(
    timestamp,
    timestamp,
    lead.id
  );

  res.json({ link, mensagem });
});

// POST /api/leads/:id/tags — body { nome }
router.post('/:id/tags', (req, res) => {
  const lead = buscarLeadOu404(req, res);
  if (!lead) return;

  const parsed = z.object({ nome: z.string().trim().min(1) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0].message });
  }

  vincularTagPorNome(lead.id, parsed.data.nome);
  res.status(201).json(buscarTagsDoLead(lead.id));
});

// DELETE /api/leads/:id/tags/:tagId
router.delete('/:id/tags/:tagId', (req, res) => {
  const lead = buscarLeadOu404(req, res);
  if (!lead) return;
  db.prepare('DELETE FROM lead_tags WHERE lead_id = ? AND tag_id = ?').run(lead.id, req.params.tagId);
  res.status(204).send();
});

module.exports = router;
