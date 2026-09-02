# CRM — BSB Fitas

CRM + gestão comercial pra BSB Fitas. Backend em Node.js (Express) + SQLite
(`node:sqlite`, nativo do Node — sem dependência de compilação). Frontend
Kanban em HTML/CSS/JS puro, servido pelo próprio Express. Sistema de usuário
único (sem login).

Este é o produto sendo construído por fases (ver seção "Fases" abaixo).
Fases 1, 2 e 3 do plano completo — CRM de clientes, funil de oportunidades,
produtos, orçamentos e pedidos — estão prontas.

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

**Produtos**
- `GET /api/produtos?ativo=true` / `GET /api/produtos/:id`
- `POST /api/produtos` / `PUT /api/produtos/:id`
- `PATCH /api/produtos/:id/status` (`{ ativo }`) — desativar em vez de excluir, preserva histórico

**Orçamentos**
- `GET /api/orcamentos?cliente_id=&oportunidade_id=&status=` — cada item traz um resumo do cliente
- `GET /api/orcamentos/:id` / `POST /api/orcamentos` (`cliente_id`, `itens[]` — cada item por `produto_id` ou `descricao` avulsa)
- `PUT /api/orcamentos/:id` — atualiza itens/desconto/frete/condições (substitui os itens)
- `PATCH /api/orcamentos/:id/status`
- `POST /api/orcamentos/:id/converter-em-pedido` — cria o pedido, copia os itens, marca a oportunidade ligada como `venda_ganha` e atualiza o cliente. Tudo numa transação (`BEGIN`/`COMMIT`/`ROLLBACK`) pra nunca deixar orçamento "aprovado" sem pedido criado.

**Pedidos**
- `GET /api/pedidos?cliente_id=&status_comercial=&status_producao=&status_logistico=`
- `GET /api/pedidos/:id` — itens + histórico de eventos
- `PUT /api/pedidos/:id` — dados de produção (arte aprovada, cor, tipo, largura, personalização) e campos fiscais/logísticos (preenchimento manual até a Fase 5/6)
- `PATCH /api/pedidos/:id/status-comercial` / `status-producao` / `status-fiscal` / `status-logistico` — cada mudança grava um evento no histórico
- Pedido só nasce via conversão de orçamento — não tem `POST /api/pedidos` direto, pra não duplicar cadastro

## Estrutura do banco

- `clientes` — PF ou PJ, com tipo_pessoa/documento/empresa/email/instagram/origem/observações
- `oportunidades` — etapa, produto, quantidade, valores, próxima ação, datas — ligada a `clientes`
- `oportunidade_notas` — histórico de texto por oportunidade
- `tags` / `cliente_tags` — tags many-to-many, no nível do cliente
- `etapas_config` — dias de alerta e template de WhatsApp por etapa
- `tarefas` — follow-ups agendados, ligados a uma oportunidade
- `produtos` — catálogo (seedado com as larguras/preços reais da BSB Fitas)
- `orcamentos` / `orcamento_itens` — numeração sequencial (`ORC-0001`), status, itens
- `pedidos` / `pedido_itens` / `pedido_eventos` — numeração sequencial (`PED-0001`), 4 dimensões de status independentes (comercial/produção/fiscal/logístico), histórico de eventos

Colunas reservadas em `pedidos` para integrações futuras: `olist_pedido_id`
(Fase 5), `nf_numero`/`nf_url` (Fase 5), `etiqueta_codigo`/`codigo_rastreio`/
`link_rastreio` (Fase 6).

## Fases do plano completo

1. **Fundação** — banco + CRM básico ✅
2. **CRM** — clientes, funil, oportunidades, histórico, tags, tarefas/follow-up ✅
3. **Comercial** — produtos, orçamentos, conversão em pedido, pedidos ✅
4. Operação — produção, aprovação de arte, expedição (parcialmente coberto pelos campos de produção do pedido — falta o fluxo dedicado)
5. Olist — integração, NF, sincronização de pedidos. **Escopo combinado**: só entra depois de "venda ganha" — o funil comercial pré-venda nunca é sincronizado com a Olist. Sync de cliente é bidirecional (precisa de `olist_cliente_id` pra evitar loop via webhook)
6. Melhor Envio — cotação, etiquetas, rastreio
7. Gestão — dashboard, relatórios, indicadores, recompra automática

Sem autenticação/multiusuário por enquanto — sistema de usuário único.
