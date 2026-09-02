function normalizarTelefone(telefone) {
  const digitos = telefone.replace(/\D/g, '');
  return digitos.startsWith('55') ? digitos : `55${digitos}`;
}

function preencherTemplate(template, lead) {
  return template
    .replace(/\{nome\}/g, lead.nome || '')
    .replace(/\{produto\}/g, lead.produto_interesse || 'o produto');
}

function montarLinkWhatsapp(telefone, mensagem) {
  const numero = normalizarTelefone(telefone);
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}

module.exports = { normalizarTelefone, preencherTemplate, montarLinkWhatsapp };
