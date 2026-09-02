const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { ETAPAS_PADRAO } = require('../constants');

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.cwd(), process.env.DB_PATH)
  : path.join(__dirname, '..', '..', 'data', 'crm.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

const totalEtapas = db.prepare('SELECT COUNT(*) AS total FROM etapas_config').get().total;
if (totalEtapas === 0) {
  const insert = db.prepare(`
    INSERT INTO etapas_config (etapa, ordem, dias_alerta, template_whatsapp)
    VALUES (@etapa, @ordem, @dias_alerta, @template_whatsapp)
  `);
  db.exec('BEGIN');
  try {
    for (const etapa of ETAPAS_PADRAO) insert.run(etapa);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = db;
