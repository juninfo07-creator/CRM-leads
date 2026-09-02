const TIPOS_PESSOA = ['pf', 'pj'];

const ETAPAS = [
  'novo_lead',
  'primeiro_contato',
  'qualificacao',
  'interessado',
  'orcamento_enviado',
  'follow_up',
  'negociacao',
  'venda_ganha',
  'venda_perdida',
];

const ETAPAS_GANHAS = ['venda_ganha'];
const ETAPAS_PERDIDAS = ['venda_perdida'];

const ETAPAS_LABEL = {
  novo_lead: 'Novo lead',
  primeiro_contato: 'Primeiro contato',
  qualificacao: 'Qualificação',
  interessado: 'Interessado',
  orcamento_enviado: 'Orçamento enviado',
  follow_up: 'Follow-up',
  negociacao: 'Pedido em negociação',
  venda_ganha: 'Venda ganha',
  venda_perdida: 'Venda perdida',
};

const ETAPAS_PADRAO = [
  {
    etapa: 'novo_lead',
    ordem: 1,
    dias_alerta: 1,
    template_whatsapp:
      'Olá {nome}, tudo bem?! Vi seu interesse em fitas personalizadas pra {produto}. ' +
      'Posso te ajudar a montar o orçamento certo — me conta rapidinho o que você precisa?',
  },
  {
    etapa: 'primeiro_contato',
    ordem: 2,
    dias_alerta: 1,
    template_whatsapp:
      'Oi {nome}! Aqui é da BSB Fitas. Vi seu contato sobre {produto} — pra eu montar a proposta ' +
      'certa, me conta rapidinho o que você precisa?',
  },
  {
    etapa: 'qualificacao',
    ordem: 3,
    dias_alerta: 2,
    template_whatsapp:
      'Oi {nome}! Só confirmando alguns detalhes do seu pedido de {produto} — quantidade, cor e ' +
      'prazo — pra eu já te mandar a tabela certa.',
  },
  {
    etapa: 'interessado',
    ordem: 4,
    dias_alerta: 2,
    template_whatsapp:
      'Oi {nome}! Seguindo nosso papo sobre {produto} — já consegui separar as opções pra você. ' +
      'Posso te enviar a tabela de valores?',
  },
  {
    etapa: 'orcamento_enviado',
    ordem: 5,
    dias_alerta: 3,
    template_whatsapp:
      'Oi {nome}, passando aqui pra saber se você já deu uma olhada no orçamento que te enviei ' +
      'pra {produto}. Ficou alguma dúvida?',
  },
  {
    etapa: 'follow_up',
    ordem: 6,
    dias_alerta: 3,
    template_whatsapp:
      'Oi {nome}! Tudo bem? Tô retomando nosso contato sobre {produto} — ainda faz sentido pra você?',
  },
  {
    etapa: 'negociacao',
    ordem: 7,
    dias_alerta: 2,
    template_whatsapp:
      'Oi {nome}! Sobre o pedido de {produto}, conseguimos fechar as condições? Tô à ' +
      'disposição pra ajustar o que for preciso.',
  },
  {
    etapa: 'venda_ganha',
    ordem: 8,
    dias_alerta: 5,
    template_whatsapp:
      'Oi {nome}! Seu pedido de {produto} já está a caminho. Qualquer coisa é só chamar por aqui 😉',
  },
  {
    etapa: 'venda_perdida',
    ordem: 9,
    dias_alerta: 30,
    template_whatsapp:
      'Oi {nome}! Faz um tempo que a gente não fala. Se ainda tiver interesse em personalizar ' +
      '{produto}, tô à disposição pra retomar.',
  },
];

module.exports = {
  TIPOS_PESSOA,
  ETAPAS,
  ETAPAS_GANHAS,
  ETAPAS_PERDIDAS,
  ETAPAS_LABEL,
  ETAPAS_PADRAO,
};
