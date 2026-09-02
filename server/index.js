require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const leadsRouter = require('./routes/leads');
const etapasRouter = require('./routes/etapas');
const tagsRouter = require('./routes/tags');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/leads', leadsRouter);
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
