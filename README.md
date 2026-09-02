# CRM Leads — BSB Fitas

CRM simples para gerenciar leads de vendas via WhatsApp. Backend em Node.js
(Express) + SQLite. Frontend ainda não implementado.

## Rodando

```
npm install
cp .env.example .env
npm run dev
```

Servidor sobe em `http://localhost:3333` (configurável via `.env`). O banco
SQLite é criado automaticamente em `data/crm.db` na primeira execução, já com
as 7 etapas seedadas (`GET /api/etapas`).

## Etapas do funil

`lead_entrou` → `atendimento_inicial` → `tabela_enviada` → `negociacao` →
`vendido_enviado` → `pos_venda` → `perdido`

Cada etapa tem `dias_alerta` (quando o lead fica "atrasado" nela) e
`template_whatsapp` (mensagem pré-preenchida), ambos editáveis via
`PUT /api/etapas/:etapa`.

## API

- `GET /api/leads` — lista leads (filtros: `?etapa=`, `?tag=`, `?atrasado=true`)
- `GET /api/leads/:id` — lead com notas e tags
- `POST /api/leads` — cria lead (`nome`, `telefone` obrigatórios; `produto_interesse`, `etapa`, `tags[]` opcionais)
- `PUT /api/leads/:id` — atualiza dados cadastrais
- `DELETE /api/leads/:id` — remove lead
- `PATCH /api/leads/:id/etapa` — move de etapa (`etapa`, `motivo_perda` se `perdido`) — reseta o contador de dias na etapa
- `GET /api/leads/:id/notas` / `POST /api/leads/:id/notas` — histórico de notas
- `POST /api/leads/:id/whatsapp` — monta o link `wa.me` com o template da etapa atual preenchido, e registra a interação
- `POST /api/leads/:id/tags` / `DELETE /api/leads/:id/tags/:tagId` — tags do lead
- `GET /api/etapas` / `PUT /api/etapas/:etapa` — configuração de alerta e template por etapa
- `GET /api/tags` / `POST /api/tags` — tags globais

## Estrutura do banco

- `leads` — dados do lead + `data_entrada_etapa` (base do alerta) e `data_ultima_interacao`
- `lead_notas` — histórico de texto por lead
- `tags` / `lead_tags` — tags many-to-many
- `etapas_config` — dias de alerta e template de WhatsApp por etapa
- `tarefas` — estrutura pronta para tarefas agendadas por lead (ainda sem rotas)

Colunas já reservadas em `leads` para integrações futuras: `olist_pedido_id`,
`situacao_pedido`, `codigo_rastreio`, `status_entrega` (Olist ERP e Melhor
Envio ainda não implementados).

## Próximos passos

1. Frontend (Kanban)
2. Rotas de `tarefas`
3. Integração Olist ERP
4. Integração Melhor Envio
