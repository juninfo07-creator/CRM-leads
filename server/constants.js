const ETAPAS = [
  'lead_entrou',
  'atendimento_inicial',
  'tabela_enviada',
  'negociacao',
  'vendido_enviado',
  'pos_venda',
  'perdido',
];

const ETAPAS_LABEL = {
  lead_entrou: 'Lead entrou',
  atendimento_inicial: 'Atendimento inicial',
  tabela_enviada: 'Tabela enviada',
  negociacao: 'Negociação',
  vendido_enviado: 'Vendido/Enviado',
  pos_venda: 'Pós-venda',
  perdido: 'Perdido',
};

const ETAPAS_PADRAO = [
  {
    etapa: 'lead_entrou',
    ordem: 1,
    dias_alerta: 1,
    template_whatsapp:
      'Olá {nome}, tudo bem?! Vi seu interesse em fitas personalizadas pra {produto}. ' +
      'Posso te ajudar a montar o orçamento certo — me conta rapidinho o que você precisa?',
  },
  {
    etapa: 'atendimento_inicial',
    ordem: 2,
    dias_alerta: 2,
    template_whatsapp:
      'Oi {nome}! Seguindo nosso atendimento sobre {produto} — já consegui separar as opções ' +
      'pra você. Posso te enviar a tabela de valores?',
  },
  {
    etapa: 'tabela_enviada',
    ordem: 3,
    dias_alerta: 3,
    template_whatsapp:
      'Oi {nome}, passando aqui pra saber se você já deu uma olhada na tabela que te enviei ' +
      'pra {produto}. Ficou alguma dúvida?',
  },
  {
    etapa: 'negociacao',
    ordem: 4,
    dias_alerta: 2,
    template_whatsapp:
      'Oi {nome}! Sobre o pedido de {produto}, conseguimos fechar as condições? Tô à ' +
      'disposição pra ajustar o que for preciso.',
  },
  {
    etapa: 'vendido_enviado',
    ordem: 5,
    dias_alerta: 5,
    template_whatsapp:
      'Oi {nome}! Seu pedido de {produto} já está a caminho. Qualquer coisa é só chamar por aqui 😉',
  },
  {
    etapa: 'pos_venda',
    ordem: 6,
    dias_alerta: 7,
    template_whatsapp:
      'Oi {nome}, tudo bem? Passando pra saber se o material de {produto} chegou certinho e ' +
      'se ficou satisfeito(a)!',
  },
  {
    etapa: 'perdido',
    ordem: 7,
    dias_alerta: 30,
    template_whatsapp:
      'Oi {nome}! Faz um tempo que a gente não fala. Se ainda tiver interesse em personalizar ' +
      '{produto}, tô à disposição pra retomar.',
  },
];

module.exports = { ETAPAS, ETAPAS_LABEL, ETAPAS_PADRAO };
