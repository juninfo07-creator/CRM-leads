function gerarNumero(db, tabela, prefixo) {
  const total = db.prepare(`SELECT COUNT(*) AS total FROM ${tabela}`).get().total;
  return `${prefixo}-${String(total + 1).padStart(4, '0')}`;
}

function calcularSubtotalItens(itens) {
  return itens.reduce((soma, item) => soma + item.quantidade * item.preco_unitario, 0);
}

function calcularValorTotal({ itens, valor_desconto = 0, valor_frete = 0 }) {
  const subtotal = calcularSubtotalItens(itens);
  return Math.max(0, subtotal - (valor_desconto || 0)) + (valor_frete || 0);
}

module.exports = { gerarNumero, calcularSubtotalItens, calcularValorTotal };
