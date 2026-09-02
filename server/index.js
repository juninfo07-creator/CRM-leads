require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const clientesRouter = require('./routes/clientes');
const oportunidadesRouter = require('./routes/oportunidades');
const tarefasRouter = require('./routes/tarefas');
const etapasRouter = require('./routes/etapas');
const tagsRouter = require('./routes/tags');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/clientes', clientesRouter);
app.use('/api/oportunidades', oportunidadesRouter);
app.use('/api/tarefas', tarefasRouter);
app.use('/api/etapas', etapasRouter);
app.use('/api/tags', tagsRouter);

app.use((req, res) => {
  res.status(404).json({ erro: 'Rota não encontrada' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ erro: 'Erro interno' });
});

const PORT = process.env.PORT || 3333;
app.listen(PORT, () => {
  console.log(`CRM Leads rodando em http://localhost:${PORT}`);
});
