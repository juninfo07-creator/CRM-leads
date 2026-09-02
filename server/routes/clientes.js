const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { TIPOS_PESSOA, ESTADOS, ETAPAS_GANHAS } = require('../constants');
const { paraCsv, deCsv } = require('../services/csv');

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
  cep: z.string().trim().optional().nullable(),
  endereco: z.string().trim().optional().nullable(),
  numero: z.string().trim().optional().nullable(),
  complemento: z.string().trim().optional().nullable(),
  bairro: z.string().trim().optional().nullable(),
  cidade: z.string().trim().optional().nullable(),
  estado: z
    .string()
    .trim()
    .toUpperCase()
    .refine((valor) => valor === '' || ESTADOS.includes(valor), 'estado inválido (use a sigla, ex: DF)')
    .optional()
    .nullable(),
  tags: z.array(z.string().trim().min(1)).optional(),
});

const atualizarClienteSchema = criarClienteSchema.partial();

// Campos gravados no banco, na ordem em que aparecem no INSERT/UPDATE e no CSV.
const CAMPOS_CLIENTE = [
  'nome', 'telefone', 'tipo_pessoa', 'documento', 'empresa', 'email', 'instagram', 'origem',
  'cep', 'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'estado', 'observacoes',
];

function agora() {
  return new Date().toISOString();
}

function somenteDigitos(texto) {
  return String(texto || '').replace(/\D/g, '');
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

// Versão em lote do serializarCliente: duas queries no total em vez de duas por
// cliente. Usada na listagem, que pode ter centenas de registros vindos do CSV.
function serializarClientes(clientes) {
  if (clientes.length === 0) return [];

  const tagsPorCliente = new Map();
  db.prepare(
    `SELECT cliente_tags.cliente_id, tags.id, tags.nome
     FROM tags
     JOIN cliente_tags ON cliente_tags.tag_id = tags.id
     ORDER BY tags.nome`
  )
    .all()
    .forEach(({ cliente_id, id, nome }) => {
      if (!tagsPorCliente.has(cliente_id)) tagsPorCliente.set(cliente_id, []);
      tagsPorCliente.get(cliente_id).push({ id, nome });
    });

  const placeholders = ETAPAS_GANHAS.map(() => '?').join(',');
  const resumoPorCliente = new Map();
  db.prepare(
    `SELECT cliente_id,
            COUNT(*) AS quantidade_compras,
            SUM(COALESCE(valor_orcamento, valor_estimado, 0)) AS valor_total_vendas,
            MAX(data_entrada_etapa) AS ultima_compra
     FROM oportunidades
     WHERE etapa IN (${placeholders})
     GROUP BY cliente_id`
  )
    .all(...ETAPAS_GANHAS)
    .forEach((linha) => resumoPorCliente.set(linha.cliente_id, linha));

  return clientes.map((cliente) => {
    const resumo = resumoPorCliente.get(cliente.id);
    const quantidade_compras = resumo ? resumo.quantidade_compras : 0;
    let status = 'lead';
    if (quantidade_compras === 1) status = 'cliente';
    if (quantidade_compras > 1) status = 'cliente_recorrente';

    return {
      ...cliente,
      tags: tagsPorCliente.get(cliente.id) || [],
      status,
      quantidade_compras,
      valor_total_vendas: resumo ? resumo.valor_total_vendas : 0,
      ultima_compra: resumo ? resumo.ultima_compra : null,
    };
  });
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

function listarClientesFiltrados({ busca, tag, status, estado }) {
  let clientes = db.prepare('SELECT * FROM clientes ORDER BY data_ultimo_contato DESC').all();

  if (busca) {
    const termo = String(busca).toLowerCase();
    const digitos = somenteDigitos(busca);
    clientes = clientes.filter(
      (c) =>
        c.nome.toLowerCase().includes(termo) ||
        (c.empresa || '').toLowerCase().includes(termo) ||
        (c.email || '').toLowerCase().includes(termo) ||
        (c.cidade || '').toLowerCase().includes(termo) ||
        somenteDigitos(c.documento).includes(termo) ||
        (digitos !== '' && somenteDigitos(c.telefone).includes(digitos))
    );
  }

  if (estado) {
    clientes = clientes.filter((c) => (c.estado || '') === String(estado).toUpperCase());
  }

  let serializados = serializarClientes(clientes);

  if (tag) {
    serializados = serializados.filter((c) => c.tags.some((t) => String(t.id) === String(tag)));
  }
  if (status) {
    serializados = serializados.filter((c) => c.status === status);
  }

  return serializados;
}

// GET /api/clientes?busca=&tag=&status=&estado=
router.get('/', (req, res) => {
  res.json(listarClientesFiltrados(req.query));
});

// GET /api/clientes/exportar.csv?busca=&tag=&status=&estado=
// Precisa vir antes de GET /:id, senão o Express casa "exportar.csv" com :id.
router.get('/exportar.csv', (req, res) => {
  const clientes = listarClientesFiltrados(req.query);
  const colunas = [...CAMPOS_CLIENTE, 'tags', 'status', 'quantidade_compras', 'valor_total_vendas'];

  const linhas = clientes.map((cliente) => ({
    ...cliente,
    tags: cliente.tags.map((t) => t.nome).join(';'),
  }));

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="clientes.csv"');
  // BOM pro Excel não quebrar os acentos.
  res.send(`﻿${paraCsv(linhas, colunas)}`);
});

// POST /api/clientes/importar — { csv }
router.post('/importar', (req, res) => {
  const parsed = z.object({ csv: z.string().min(1, 'csv vazio') }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0].message });
  }

  let linhas;
  try {
    ({ linhas } = deCsv(parsed.data.csv));
  } catch (err) {
    return res.status(400).json({ erro: 'Não consegui ler o CSV' });
  }
  if (linhas.length === 0) {
    return res.status(400).json({ erro: 'O CSV não tem nenhuma linha de dados' });
  }

  // Índice de telefone (só dígitos) → id, pra decidir entre criar e atualizar.
  const porTelefone = new Map();
  db.prepare('SELECT id, telefone FROM clientes')
    .all()
    .forEach((c) => porTelefone.set(somenteDigitos(c.telefone), c.id));

  const erros = [];
  let criados = 0;
  let atualizados = 0;

  const insert = db.prepare(
    `INSERT INTO clientes
       (nome, telefone, tipo_pessoa, documento, empresa, email, instagram, origem,
        cep, endereco, numero, complemento, bairro, cidade, estado, observacoes,
        data_primeiro_contato, data_ultimo_contato, created_at, updated_at)
     VALUES
       (@nome, @telefone, @tipo_pessoa, @documento, @empresa, @email, @instagram, @origem,
        @cep, @endereco, @numero, @complemento, @bairro, @cidade, @estado, @observacoes,
        @timestamp, @timestamp, @timestamp, @timestamp)`
  );

  db.exec('BEGIN');
  try {
    linhas.forEach((linha, indice) => {
      // +2: linha 1 é o cabeçalho e a contagem começa em 1.
      const numeroLinha = indice + 2;
      const validado = criarClienteSchema.safeParse({
        ...linha,
        tags: undefined,
      });
      if (!validado.success) {
        erros.push({ linha: numeroLinha, motivo: validado.error.issues[0].message });
        return;
      }

      const timestamp = agora();
      const dados = { timestamp };
      CAMPOS_CLIENTE.forEach((campo) => {
        dados[campo] = validado.data[campo] || null;
      });
      dados.tipo_pessoa = validado.data.tipo_pessoa || 'pf';
      dados.nome = validado.data.nome;
      dados.telefone = validado.data.telefone;

      const telefoneNormalizado = somenteDigitos(validado.data.telefone);
      const existenteId = porTelefone.get(telefoneNormalizado);

      if (existenteId) {
        db.prepare(
          `UPDATE clientes SET
             nome = @nome, telefone = @telefone, tipo_pessoa = @tipo_pessoa, documento = @documento,
             empresa = @empresa, email = @email, instagram = @instagram, origem = @origem,
             cep = @cep, endereco = @endereco, numero = @numero, complemento = @complemento,
             bairro = @bairro, cidade = @cidade, estado = @estado, observacoes = @observacoes,
             updated_at = @timestamp
           WHERE id = @id`
        ).run({ ...dados, id: existenteId });
        atualizados += 1;
      } else {
        const resultado = insert.run(dados);
        porTelefone.set(telefoneNormalizado, resultado.lastInsertRowid);
        criados += 1;
      }

      const clienteId = existenteId || porTelefone.get(telefoneNormalizado);
      (linha.tags || '')
        .split(';')
        .map((t) => t.trim())
        .filter(Boolean)
        .forEach((nomeTag) => vincularTagPorNome(clienteId, nomeTag));
    });
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ erro: 'Falha ao importar — nenhuma linha foi gravada' });
  }

  res.json({ criados, atualizados, erros });
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
  const timestamp = agora();
  const dados = { timestamp };
  CAMPOS_CLIENTE.forEach((campo) => {
    dados[campo] = parsed.data[campo] || null;
  });
  dados.tipo_pessoa = parsed.data.tipo_pessoa || 'pf';

  const resultado = db
    .prepare(
      `INSERT INTO clientes
        (nome, telefone, tipo_pessoa, documento, empresa, email, instagram, origem,
         cep, endereco, numero, complemento, bairro, cidade, estado, observacoes,
         data_primeiro_contato, data_ultimo_contato, created_at, updated_at)
       VALUES
        (@nome, @telefone, @tipo_pessoa, @documento, @empresa, @email, @instagram, @origem,
         @cep, @endereco, @numero, @complemento, @bairro, @cidade, @estado, @observacoes,
         @timestamp, @timestamp, @timestamp, @timestamp)`
    )
    .run(dados);

  const { tags } = parsed.data;

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

  const dados = { id: cliente.id, updated_at: agora() };
  CAMPOS_CLIENTE.forEach((campo) => {
    dados[campo] = parsed.data[campo] !== undefined ? parsed.data[campo] : cliente[campo];
  });

  db.prepare(
    `UPDATE clientes SET
       nome = @nome, telefone = @telefone, tipo_pessoa = @tipo_pessoa, documento = @documento,
       empresa = @empresa, email = @email, instagram = @instagram, origem = @origem,
       cep = @cep, endereco = @endereco, numero = @numero, complemento = @complemento,
       bairro = @bairro, cidade = @cidade, estado = @estado, observacoes = @observacoes,
       updated_at = @updated_at
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
