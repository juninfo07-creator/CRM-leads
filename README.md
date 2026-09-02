# CRM — BSB Fitas

CRM + gestão comercial pra BSB Fitas. Backend em Node.js (Express) + SQLite
(`node:sqlite`, nativo do Node — sem dependência de compilação). Frontend
Kanban em HTML/CSS/JS puro, servido pelo próprio Express. Sistema de usuário
único (sem login).

Este é o produto sendo construído por fases (ver seção "Fases" abaixo).
Fases 1 e 2 do plano completo — CRM de clientes e funil de oportunidades —
estão prontas.

## Rodando

```
npm install
cp .env.example .env
npm run dev
```

Servidor sobe em `http://localhost:3333` (configurável via `.env`). O banco
SQLite é criado automaticamente em `data/crm.db` na primeira execução, já com
as 9 etapas do funil seedadas (`GET /api/etapas`).

## Conceito central

`clientes` — o registro persistente da pessoa/empresa (PF ou PJ), sobrevive
além de uma venda. `oportunidades` — cada passagem pelo funil comercial,
ligada a um cliente. Um cliente pode ter várias oportunidades ao longo do
tempo (recompra), sem perder o histórico das anteriores.

O status do cliente (`lead` / `cliente` / `cliente_recorrente`) é **calculado**
a partir de quantas oportunidades desse cliente já chegaram em `venda_ganha`
— não é um campo solto que pode ficar desatualizado.

## Etapas do funil

`novo_lead` → `primeiro_contato` → `qualificacao` → `interessado` →
`orcamento_enviado` → `follow_up` → `negociacao` → `venda_ganha` /
`venda_perdida`

Cada etapa tem `dias_alerta` (quando a oportunidade fica "atrasada" nela) e
`template_whatsapp` (mensagem pré-preenchida), ambos editáveis via
`PUT /api/etapas/:etapa`.

## API

**Clientes**
- `GET /api/clientes?busca=&tag=&status=` — lista (com tags, status e resumo de compras calculados)
- `GET /api/clientes/:id` — cliente completo, incluindo todas as suas oportunidades
- `POST /api/clientes` — cria cliente (`nome`, `telefone` obrigatórios)
- `PUT /api/clientes/:id` — atualiza cadastro
- `DELETE /api/clientes/:id` — remove cliente (cascade: oportunidades, notas, tarefas, tags)
- `POST /api/clientes/:id/tags` / `DELETE /api/clientes/:id/tags/:tagId`

**Oportunidades**
- `GET /api/oportunidades?etapa=&atrasado=true&cliente_id=` — lista (cada item traz um resumo do cliente)
- `GET /api/oportunidades/:id` — oportunidade + notas + resumo do cliente
- `POST /api/oportunidades` — cria (`cliente_id` obrigatório)
- `PUT /api/oportunidades/:id` — atualiza dados do negócio (produto, quantidade, valores, próxima ação)
- `PATCH /api/oportunidades/:id/etapa` — move de etapa (`motivo_perda` se `venda_perdida`) — reseta o contador de dias parado, atualiza `data_ultimo_contato` do cliente
- `GET /api/oportunidades/:id/notas` / `POST /api/oportunidades/:id/notas`
- `POST /api/oportunidades/:id/whatsapp` — monta o link `wa.me` com o template da etapa atual

**Tarefas / follow-ups**
- `GET /api/tarefas?pendentes=true&atrasadas=true&oportunidade_id=`
- `POST /api/tarefas` (`oportunidade_id`, `descricao`, `data_agendada`)
- `PATCH /api/tarefas/:id/concluir`
- `DELETE /api/tarefas/:id`

**Etapas e tags**
- `GET /api/etapas` / `PUT /api/etapas/:etapa`
- `GET /api/tags` / `POST /api/tags`

## Estrutura do banco

- `clientes` — PF ou PJ, com tipo_pessoa/documento/empresa/email/instagram/origem/observações
- `oportunidades` — etapa, produto, quantidade, valores, próxima ação, datas — ligada a `clientes`
- `oportunidade_notas` — histórico de texto por oportunidade
- `tags` / `cliente_tags` — tags many-to-many, no nível do cliente
- `etapas_config` — dias de alerta e template de WhatsApp por etapa
- `tarefas` — follow-ups agendados, ligados a uma oportunidade

Colunas reservadas em `oportunidades` para integrações futuras:
`olist_pedido_id`, `situacao_pedido`, `codigo_rastreio`, `status_entrega`.

## Fases do plano completo

1. **Fundação** — banco + CRM básico ✅
2. **CRM** — clientes, funil, oportunidades, histórico, tags, tarefas/follow-up ✅
3. Comercial — produtos, orçamentos, conversão em pedido, pedidos
4. Operação — produção, aprovação de arte, expedição
5. Olist — integração, NF, sincronização de pedidos
6. Melhor Envio — cotação, etiquetas, rastreio
7. Gestão — dashboard, relatórios, recompra automática

Sem autenticação/multiusuário por enquanto — sistema de usuário único.
