const board = document.getElementById('board');
const boardProducao = document.getElementById('board-producao');
const tplColuna = document.getElementById('tpl-coluna');
const tplCard = document.getElementById('tpl-card');
const tplCardPedido = document.getElementById('tpl-card-pedido');
const toast = document.getElementById('toast');

let etapasConfig = [];
let oportunidades = [];
let oportunidadeAtualId = null;
let clienteAtualId = null;
let arrastandoId = null;
let produtos = [];
let itensOrcamentoBuilder = [];
let orcamentoContexto = { clienteId: null, oportunidadeId: null };
let pedidoAtualId = null;
let pedidos = [];
let clientes = [];
let clienteCadastroId = null;
let filtrosClientes = { busca: '', status: '', tag: '', estado: '' };

const ESTADOS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

const STATUS_LABEL = {
  lead: 'Lead',
  cliente: 'Cliente',
  cliente_recorrente: 'Cliente recorrente',
};

const STATUS_ORCAMENTO_LABEL = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  visualizado: 'Visualizado',
  em_negociacao: 'Em negociação',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
  expirado: 'Expirado',
};

const STATUS_COMERCIAL_LABEL = { novo: 'Novo', confirmado: 'Confirmado', cancelado: 'Cancelado' };

const STATUS_PRODUCAO_LABEL = {
  aguardando_arte: 'Aguardando arte',
  arte_aprovada: 'Arte aprovada',
  em_producao: 'Em produção',
  producao_concluida: 'Produção concluída',
  aguardando_expedicao: 'Aguardando expedição',
  enviado: 'Enviado',
  entregue: 'Entregue',
};

const STATUS_FISCAL_LABEL = { pendente: 'Pendente', nf_emitida: 'NF emitida', cancelada: 'Cancelada' };

const STATUS_LOGISTICO_LABEL = {
  aguardando_envio: 'Aguardando envio',
  enviado: 'Enviado',
  em_transito: 'Em trânsito',
  entregue: 'Entregue',
};

async function api(caminho, opcoes = {}) {
  const resposta = await fetch(caminho, {
    headers: { 'Content-Type': 'application/json' },
    ...opcoes,
  });
  if (resposta.status === 204) return null;
  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new Error((dados && dados.erro) || 'Erro inesperado');
  }
  return dados;
}

function mostrarToast(mensagem, erro = false) {
  toast.textContent = mensagem;
  toast.classList.toggle('erro', erro);
  toast.hidden = false;
  clearTimeout(mostrarToast._timer);
  mostrarToast._timer = setTimeout(() => { toast.hidden = true; }, 3000);
}

function abrirModal(id) { document.getElementById(id).hidden = false; }
function fecharModal(id) { document.getElementById(id).hidden = true; }

document.addEventListener('click', (e) => {
  if (e.target.matches('.modal-fechar')) fecharModal(e.target.dataset.fechar);
  if (e.target.classList.contains('modal-overlay')) e.target.hidden = true;
});

function escapeHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto == null ? '' : texto;
  return div.innerHTML;
}

function paraDataInput(isoString) {
  if (!isoString) return '';
  return String(isoString).slice(0, 10);
}

// ---------- Carregamento e board ----------

async function carregarTudo() {
  [etapasConfig, oportunidades] = await Promise.all([api('/api/etapas'), api('/api/oportunidades')]);
  renderBoard();
}

async function recarregarOportunidades() {
  oportunidades = await api('/api/oportunidades');
  renderBoard();
}

function renderBoard() {
  board.innerHTML = '';
  etapasConfig.forEach((etapa) => {
    const coluna = tplColuna.content.firstElementChild.cloneNode(true);
    coluna.dataset.etapa = etapa.etapa;
    coluna.querySelector('.coluna-titulo').textContent = etapa.label;

    const doEtapa = oportunidades.filter((o) => o.etapa === etapa.etapa);
    coluna.querySelector('.coluna-contagem').textContent = doEtapa.length;

    const container = coluna.querySelector('.coluna-cards');
    doEtapa.forEach((op) => container.appendChild(renderCard(op)));

    container.addEventListener('dragover', (e) => { e.preventDefault(); container.classList.add('drag-over'); });
    container.addEventListener('dragleave', () => container.classList.remove('drag-over'));
    container.addEventListener('drop', async (e) => {
      e.preventDefault();
      container.classList.remove('drag-over');
      if (!arrastandoId) return;
      await moverDeEtapa(arrastandoId, etapa.etapa);
    });

    board.appendChild(coluna);
  });
}

function renderCard(op) {
  const card = tplCard.content.firstElementChild.cloneNode(true);
  card.dataset.id = op.id;
  card.classList.toggle('card-atrasada', op.atrasado);
  card.querySelector('.card-nome').textContent = op.cliente.nome;
  card.querySelector('.card-empresa').textContent = op.cliente.empresa || '';
  card.querySelector('.card-produto').textContent = op.produto_interesse || '';
  card.querySelector('.card-atraso').hidden = !op.atrasado;
  card.querySelector('.card-dias').textContent =
    op.dias_na_etapa === 0 ? 'entrou hoje' : `há ${op.dias_na_etapa} dia${op.dias_na_etapa === 1 ? '' : 's'}`;

  const tagsEl = card.querySelector('.card-tags');
  (op.cliente.tags || []).forEach((tag) => {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.textContent = tag.nome;
    tagsEl.appendChild(pill);
  });

  card.addEventListener('dragstart', () => { arrastandoId = op.id; card.classList.add('dragging'); });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));
  card.addEventListener('click', () => abrirDetalheOportunidade(op.id));
  card.querySelector('.btn-whatsapp').addEventListener('click', (e) => {
    e.stopPropagation();
    abrirWhatsapp(op.id);
  });

  return card;
}

async function moverDeEtapa(oportunidadeId, novaEtapa) {
  const op = oportunidades.find((o) => o.id === oportunidadeId);
  if (!op || op.etapa === novaEtapa) return;

  let motivoPerda = null;
  if (novaEtapa === 'venda_perdida') {
    motivoPerda = window.prompt('Motivo da perda (opcional):') || '';
  }

  try {
    await api(`/api/oportunidades/${oportunidadeId}/etapa`, {
      method: 'PATCH',
      body: JSON.stringify({ etapa: novaEtapa, motivo_perda: motivoPerda }),
    });
    await recarregarOportunidades();
    mostrarToast('Oportunidade movida de etapa');
  } catch (err) {
    mostrarToast(err.message, true);
  }
}

async function abrirWhatsapp(oportunidadeId) {
  try {
    const { link } = await api(`/api/oportunidades/${oportunidadeId}/whatsapp`, { method: 'POST' });
    window.open(link, '_blank');
    await recarregarOportunidades();
  } catch (err) {
    mostrarToast(err.message, true);
  }
}

// ---------- Modal de detalhe ----------

function preencherSelectEtapas(select, etapaSelecionada) {
  select.innerHTML = '';
  etapasConfig.forEach((etapa) => {
    const option = document.createElement('option');
    option.value = etapa.etapa;
    option.textContent = etapa.label;
    option.selected = etapa.etapa === etapaSelecionada;
    select.appendChild(option);
  });
}

async function abrirDetalheOportunidade(oportunidadeId) {
  try {
    const op = await api(`/api/oportunidades/${oportunidadeId}`);
    const cliente = await api(`/api/clientes/${op.cliente_id}`);

    oportunidadeAtualId = op.id;
    clienteAtualId = cliente.id;

    document.getElementById('lead-titulo').textContent = cliente.nome;

    const badge = document.getElementById('lead-status-badge');
    badge.textContent = STATUS_LABEL[cliente.status];
    badge.className = `status-badge ${cliente.status}`;

    document.getElementById('cliente-nome').value = cliente.nome;
    document.getElementById('cliente-telefone').value = cliente.telefone;
    document.getElementById('cliente-tipo-pessoa').value = cliente.tipo_pessoa;
    document.getElementById('cliente-empresa').value = cliente.empresa || '';
    document.getElementById('cliente-email').value = cliente.email || '';
    document.getElementById('cliente-instagram').value = cliente.instagram || '';
    document.getElementById('cliente-origem').value = cliente.origem || '';
    document.getElementById('cliente-observacoes').value = cliente.observacoes || '';

    const resumo = document.getElementById('cliente-resumo-compras');
    resumo.textContent = cliente.quantidade_compras > 0
      ? `${cliente.quantidade_compras} venda(s) ganha(s) · R$ ${cliente.valor_total_vendas.toFixed(2)} no total · última em ${new Date(cliente.ultima_compra).toLocaleDateString('pt-BR')}`
      : 'Ainda sem vendas ganhas registradas.';

    preencherSelectEtapas(document.getElementById('lead-etapa'), op.etapa);
    const campoMotivo = document.getElementById('campo-motivo-perda');
    campoMotivo.hidden = op.etapa !== 'venda_perdida';
    document.getElementById('lead-motivo-perda').value = op.motivo_perda || '';
    document.getElementById('lead-etapa').onchange = (e) => {
      campoMotivo.hidden = e.target.value !== 'venda_perdida';
    };

    document.getElementById('lead-produto').value = op.produto_interesse || '';
    document.getElementById('op-quantidade').value = op.quantidade || '';
    document.getElementById('op-valor-estimado').value = op.valor_estimado ?? '';
    document.getElementById('op-valor-orcamento').value = op.valor_orcamento ?? '';
    document.getElementById('op-proxima-acao').value = op.proxima_acao || '';
    document.getElementById('op-data-followup').value = paraDataInput(op.data_proximo_followup);

    renderTagsDoCliente(cliente.tags);
    renderNotasDaOportunidade(op.notas);
    renderHistoricoCliente(cliente.oportunidades, op.id);
    await carregarTarefasDaOportunidade(op.id);
    await carregarOrcamentosDaOportunidade(op.id);

    abrirModal('modal-lead');
  } catch (err) {
    mostrarToast(err.message, true);
  }
}

function renderTagsDoCliente(tags) {
  const container = document.getElementById('lead-tags-lista');
  container.innerHTML = '';
  tags.forEach((tag) => {
    const pill = document.createElement('span');
    pill.className = 'tag-pill-removivel';
    pill.innerHTML = `<span>${escapeHtml(tag.nome)}</span>`;
    const btnRemover = document.createElement('button');
    btnRemover.textContent = '×';
    btnRemover.type = 'button';
    btnRemover.addEventListener('click', async () => {
      try {
        await api(`/api/clientes/${clienteAtualId}/tags/${tag.id}`, { method: 'DELETE' });
        const cliente = await api(`/api/clientes/${clienteAtualId}`);
        renderTagsDoCliente(cliente.tags);
        await recarregarOportunidades();
      } catch (err) {
        mostrarToast(err.message, true);
      }
    });
    pill.appendChild(btnRemover);
    container.appendChild(pill);
  });
}

function renderNotasDaOportunidade(notas) {
  const container = document.getElementById('lead-notas-lista');
  container.innerHTML = '';
  if (notas.length === 0) {
    container.innerHTML = '<p style="font-size:12.5px;color:var(--cinza-texto)">Nenhuma nota ainda.</p>';
    return;
  }
  notas.forEach((nota) => {
    const item = document.createElement('div');
    item.className = 'nota-item';
    const data = new Date(nota.created_at).toLocaleString('pt-BR');
    item.innerHTML = `<span>${escapeHtml(nota.texto)}</span><span class="nota-data">${data}</span>`;
    container.appendChild(item);
  });
}

function renderHistoricoCliente(todasOportunidades, oportunidadeAtualIdExcluir) {
  const container = document.getElementById('lead-historico-lista');
  container.innerHTML = '';
  const outras = todasOportunidades.filter((o) => o.id !== oportunidadeAtualIdExcluir);
  if (outras.length === 0) {
    container.innerHTML = '<p style="font-size:12.5px;color:var(--cinza-texto)">Nenhuma outra oportunidade ainda.</p>';
    return;
  }
  outras.forEach((o) => {
    const etapaInfo = etapasConfig.find((e) => e.etapa === o.etapa);
    const item = document.createElement('div');
    item.className = 'historico-item';
    const data = new Date(o.created_at).toLocaleDateString('pt-BR');
    item.textContent = `${o.produto_interesse || 'Sem produto'} — ${etapaInfo ? etapaInfo.label : o.etapa} (${data})`;
    container.appendChild(item);
  });
}

async function carregarTarefasDaOportunidade(oportunidadeId) {
  const tarefas = await api(`/api/tarefas?oportunidade_id=${oportunidadeId}`);
  renderTarefas(tarefas, 'lead-tarefas-lista', { comOportunidade: false });
}

function renderTarefas(tarefas, containerId, { comOportunidade }) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  if (tarefas.length === 0) {
    container.innerHTML = '<p style="font-size:12.5px;color:var(--cinza-texto)">Nenhuma tarefa.</p>';
    return;
  }
  const hoje = new Date().toISOString();
  tarefas.forEach((tarefa) => {
    const atrasada = !tarefa.concluida && tarefa.data_agendada < hoje;
    const item = document.createElement('div');
    item.className = `tarefa-item${atrasada ? ' tarefa-atrasada' : ''}`;
    const dataFormatada = new Date(tarefa.data_agendada).toLocaleDateString('pt-BR');
    const contexto = comOportunidade && tarefa.oportunidade
      ? `<small>${escapeHtml(tarefa.oportunidade.cliente_nome)} — ${escapeHtml(tarefa.oportunidade.produto_interesse || '')}</small>`
      : '';
    item.innerHTML = `
      <div>
        <span style="${tarefa.concluida ? 'text-decoration:line-through;color:var(--cinza-texto)' : ''}">${escapeHtml(tarefa.descricao)}</span>
        <small>${dataFormatada}</small>
        ${contexto}
      </div>
    `;
    if (!tarefa.concluida) {
      const btn = document.createElement('button');
      btn.textContent = 'Concluir';
      btn.type = 'button';
      btn.addEventListener('click', async () => {
        try {
          await api(`/api/tarefas/${tarefa.id}/concluir`, { method: 'PATCH' });
          if (oportunidadeAtualId) await carregarTarefasDaOportunidade(oportunidadeAtualId);
          if (!document.getElementById('modal-tarefas').hidden) await carregarTarefasPendentes();
        } catch (err) {
          mostrarToast(err.message, true);
        }
      });
      item.appendChild(btn);
    }
    container.appendChild(item);
  });
}

document.getElementById('btn-salvar-tudo').addEventListener('click', async () => {
  try {
    await api(`/api/clientes/${clienteAtualId}`, {
      method: 'PUT',
      body: JSON.stringify({
        nome: document.getElementById('cliente-nome').value.trim(),
        telefone: document.getElementById('cliente-telefone').value.trim(),
        tipo_pessoa: document.getElementById('cliente-tipo-pessoa').value,
        empresa: document.getElementById('cliente-empresa').value.trim(),
        email: document.getElementById('cliente-email').value.trim(),
        instagram: document.getElementById('cliente-instagram').value.trim(),
        origem: document.getElementById('cliente-origem').value.trim(),
        observacoes: document.getElementById('cliente-observacoes').value.trim(),
      }),
    });

    await api(`/api/oportunidades/${oportunidadeAtualId}`, {
      method: 'PUT',
      body: JSON.stringify({
        produto_interesse: document.getElementById('lead-produto').value.trim(),
        quantidade: document.getElementById('op-quantidade').value.trim(),
        valor_estimado: document.getElementById('op-valor-estimado').value ? Number(document.getElementById('op-valor-estimado').value) : null,
        valor_orcamento: document.getElementById('op-valor-orcamento').value ? Number(document.getElementById('op-valor-orcamento').value) : null,
        proxima_acao: document.getElementById('op-proxima-acao').value.trim(),
        data_proximo_followup: document.getElementById('op-data-followup').value || null,
      }),
    });

    const op = oportunidades.find((o) => o.id === oportunidadeAtualId);
    const novaEtapa = document.getElementById('lead-etapa').value;
    if (op && op.etapa !== novaEtapa) {
      const motivoPerda = document.getElementById('lead-motivo-perda').value.trim();
      await api(`/api/oportunidades/${oportunidadeAtualId}/etapa`, {
        method: 'PATCH',
        body: JSON.stringify({ etapa: novaEtapa, motivo_perda: motivoPerda }),
      });
    }

    fecharModal('modal-lead');
    await recarregarOportunidades();
    mostrarToast('Salvo com sucesso');
  } catch (err) {
    mostrarToast(err.message, true);
  }
});

document.getElementById('btn-whatsapp-lead').addEventListener('click', () => {
  if (oportunidadeAtualId) abrirWhatsapp(oportunidadeAtualId);
});

document.getElementById('btn-excluir-lead').addEventListener('click', async () => {
  if (!oportunidadeAtualId) return;
  if (!window.confirm('Excluir essa oportunidade? Essa ação não pode ser desfeita.')) return;
  try {
    await api(`/api/oportunidades/${oportunidadeAtualId}`, { method: 'DELETE' });
    fecharModal('modal-lead');
    await recarregarOportunidades();
    mostrarToast('Oportunidade excluída');
  } catch (err) {
    mostrarToast(err.message, true);
  }
});

document.getElementById('btn-nova-oportunidade').addEventListener('click', async () => {
  const produto = window.prompt('Produto de interesse desta nova oportunidade:');
  if (produto === null) return;
  try {
    await api('/api/oportunidades', {
      method: 'POST',
      body: JSON.stringify({ cliente_id: clienteAtualId, produto_interesse: produto.trim() }),
    });
    fecharModal('modal-lead');
    await recarregarOportunidades();
    mostrarToast('Nova oportunidade criada pra esse cliente');
  } catch (err) {
    mostrarToast(err.message, true);
  }
});

document.getElementById('form-tag').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('input-nova-tag');
  const nome = input.value.trim();
  if (!nome) return;
  try {
    await api(`/api/clientes/${clienteAtualId}/tags`, { method: 'POST', body: JSON.stringify({ nome }) });
    input.value = '';
    const cliente = await api(`/api/clientes/${clienteAtualId}`);
    renderTagsDoCliente(cliente.tags);
    await recarregarOportunidades();
  } catch (err) {
    mostrarToast(err.message, true);
  }
});

document.getElementById('form-nota').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('input-nova-nota');
  const texto = input.value.trim();
  if (!texto) return;
  try {
    const notas = await api(`/api/oportunidades/${oportunidadeAtualId}/notas`, {
      method: 'POST',
      body: JSON.stringify({ texto }),
    });
    input.value = '';
    renderNotasDaOportunidade(notas);
    await recarregarOportunidades();
  } catch (err) {
    mostrarToast(err.message, true);
  }
});

document.getElementById('form-tarefa').addEventListener('submit', async (e) => {
  e.preventDefault();
  const inputDescricao = document.getElementById('input-nova-tarefa');
  const inputData = document.getElementById('input-data-tarefa');
  const descricao = inputDescricao.value.trim();
  if (!descricao || !inputData.value) {
    mostrarToast('Preencha descrição e data da tarefa', true);
    return;
  }
  try {
    await api('/api/tarefas', {
      method: 'POST',
      body: JSON.stringify({ oportunidade_id: oportunidadeAtualId, descricao, data_agendada: inputData.value }),
    });
    inputDescricao.value = '';
    inputData.value = '';
    await carregarTarefasDaOportunidade(oportunidadeAtualId);
  } catch (err) {
    mostrarToast(err.message, true);
  }
});

// ---------- Modal de novo lead ----------

document.getElementById('btn-novo-lead').addEventListener('click', () => {
  document.getElementById('form-novo-lead').reset();
  abrirModal('modal-novo-lead');
});

document.getElementById('form-novo-lead').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nome = document.getElementById('novo-nome').value.trim();
  const telefone = document.getElementById('novo-telefone').value.trim();
  const tipo_pessoa = document.getElementById('novo-tipo-pessoa').value;
  const empresa = document.getElementById('novo-empresa').value.trim();
  const origem = document.getElementById('novo-origem').value.trim();
  const produto_interesse = document.getElementById('novo-produto').value.trim();
  const tags = document.getElementById('novo-tags').value.split(',').map((t) => t.trim()).filter(Boolean);

  try {
    const cliente = await api('/api/clientes', {
      method: 'POST',
      body: JSON.stringify({ nome, telefone, tipo_pessoa, empresa, origem, tags }),
    });
    await api('/api/oportunidades', {
      method: 'POST',
      body: JSON.stringify({ cliente_id: cliente.id, produto_interesse }),
    });
    fecharModal('modal-novo-lead');
    await recarregarOportunidades();
    if (!document.getElementById('tela-clientes').hidden) await carregarClientes();
    mostrarToast('Lead criado');
  } catch (err) {
    mostrarToast(err.message, true);
  }
});

// ---------- Modal de configuração de etapas ----------


function renderConfigEtapas() {
  const container = document.getElementById('config-etapas-lista');
  container.innerHTML = '';
  etapasConfig.forEach((etapa) => {
    const item = document.createElement('div');
    item.className = 'config-item';
    item.innerHTML = `
      <h4>${escapeHtml(etapa.label)}</h4>
      <label>Dias sem movimentação até alertar
        <input type="number" min="1" class="input-dias" value="${etapa.dias_alerta}" />
      </label>
      <label>Template do WhatsApp (use {nome} e {produto})
        <textarea class="input-template">${escapeHtml(etapa.template_whatsapp)}</textarea>
      </label>
      <button type="button" class="btn btn-primary">Salvar</button>
    `;
    item.querySelector('button').addEventListener('click', async () => {
      const dias_alerta = Number(item.querySelector('.input-dias').value);
      const template_whatsapp = item.querySelector('.input-template').value.trim();
      try {
        await api(`/api/etapas/${etapa.etapa}`, {
          method: 'PUT',
          body: JSON.stringify({ dias_alerta, template_whatsapp }),
        });
        mostrarToast(`Etapa "${etapa.label}" atualizada`);
        etapasConfig = await api('/api/etapas');
        await recarregarOportunidades();
      } catch (err) {
        mostrarToast(err.message, true);
      }
    });
    container.appendChild(item);
  });
}

// ---------- Modal de tarefas pendentes ----------

async function carregarTarefasPendentes() {
  const tarefas = await api('/api/tarefas?pendentes=true');
  renderTarefas(tarefas, 'tarefas-pendentes-lista', { comOportunidade: true });
}

// ---------- Produtos ----------

async function carregarProdutos() {
  produtos = await api('/api/produtos');
}

function renderProdutosLista() {
  const container = document.getElementById('produtos-lista');
  container.innerHTML = '';
  produtos.forEach((produto) => {
    const item = document.createElement('div');
    item.className = 'config-item';
    item.innerHTML = `
      <h4>${escapeHtml(produto.nome)} ${!produto.ativo ? '<span class="status-pill alerta">inativo</span>' : ''}</h4>
      <p style="font-size:12.5px;color:var(--cinza-texto);margin:0 0 8px">
        ${escapeHtml(produto.largura || '')} · ${escapeHtml(produto.unidade || '')} · R$ ${produto.preco_padrao.toFixed(2)}
      </p>
      <button type="button" class="btn btn-ghost">${produto.ativo ? 'Desativar' : 'Reativar'}</button>
    `;
    item.querySelector('button').addEventListener('click', async () => {
      try {
        await api(`/api/produtos/${produto.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ ativo: !produto.ativo }),
        });
        await carregarProdutos();
        renderProdutosLista();
      } catch (err) {
        mostrarToast(err.message, true);
      }
    });
    container.appendChild(item);
  });
}

document.getElementById('form-novo-produto').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/produtos', {
      method: 'POST',
      body: JSON.stringify({
        nome: document.getElementById('produto-nome').value.trim(),
        largura: document.getElementById('produto-largura').value.trim(),
        unidade: document.getElementById('produto-unidade').value.trim(),
        preco_padrao: Number(document.getElementById('produto-preco').value),
      }),
    });
    document.getElementById('form-novo-produto').reset();
    await carregarProdutos();
    renderProdutosLista();
    mostrarToast('Produto adicionado');
  } catch (err) {
    mostrarToast(err.message, true);
  }
});

// ---------- Criar orçamento ----------

document.getElementById('btn-criar-orcamento').addEventListener('click', async () => {
  if (produtos.length === 0) await carregarProdutos();
  orcamentoContexto = { clienteId: clienteAtualId, oportunidadeId: oportunidadeAtualId };
  itensOrcamentoBuilder = [{ produto_id: null, descricao: '', quantidade: 1, preco_unitario: 0 }];
  document.getElementById('form-novo-orcamento').reset();
  renderItensOrcamentoBuilder();
  fecharModal('modal-lead');
  abrirModal('modal-novo-orcamento');
});

function renderItensOrcamentoBuilder() {
  const container = document.getElementById('orcamento-itens-lista');
  container.innerHTML = '';
  itensOrcamentoBuilder.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'item-orcamento';
    const options = ['<option value="">Item avulso</option>']
      .concat(produtos.map((p) => `<option value="${p.id}" ${item.produto_id === p.id ? 'selected' : ''}>${escapeHtml(p.nome)}</option>`));
    row.innerHTML = `
      <select class="item-produto">${options.join('')}</select>
      <input type="text" class="item-descricao" placeholder="descrição" value="${escapeHtml(item.descricao)}" />
      <input type="number" step="0.01" min="0.01" class="item-quantidade" value="${item.quantidade}" placeholder="qtd" />
      <input type="number" step="0.01" min="0" class="item-preco" value="${item.preco_unitario}" placeholder="preço unit." />
      <button type="button" title="Remover">×</button>
    `;

    const selectProduto = row.querySelector('.item-produto');
    const inputDescricao = row.querySelector('.item-descricao');
    const inputQuantidade = row.querySelector('.item-quantidade');
    const inputPreco = row.querySelector('.item-preco');

    selectProduto.addEventListener('change', () => {
      const produtoId = selectProduto.value ? Number(selectProduto.value) : null;
      itensOrcamentoBuilder[index].produto_id = produtoId;
      if (produtoId) {
        const produto = produtos.find((p) => p.id === produtoId);
        itensOrcamentoBuilder[index].descricao = produto.nome;
        itensOrcamentoBuilder[index].preco_unitario = produto.preco_padrao;
        inputDescricao.value = produto.nome;
        inputPreco.value = produto.preco_padrao;
      }
      atualizarTotalOrcamentoPreview();
    });
    inputDescricao.addEventListener('input', () => {
      itensOrcamentoBuilder[index].descricao = inputDescricao.value;
    });
    inputQuantidade.addEventListener('input', () => {
      itensOrcamentoBuilder[index].quantidade = Number(inputQuantidade.value) || 0;
      atualizarTotalOrcamentoPreview();
    });
    inputPreco.addEventListener('input', () => {
      itensOrcamentoBuilder[index].preco_unitario = Number(inputPreco.value) || 0;
      atualizarTotalOrcamentoPreview();
    });
    row.querySelector('button').addEventListener('click', () => {
      itensOrcamentoBuilder.splice(index, 1);
      if (itensOrcamentoBuilder.length === 0) itensOrcamentoBuilder.push({ produto_id: null, descricao: '', quantidade: 1, preco_unitario: 0 });
      renderItensOrcamentoBuilder();
    });

    container.appendChild(row);
  });
  atualizarTotalOrcamentoPreview();
}

document.getElementById('btn-add-item-orcamento').addEventListener('click', () => {
  itensOrcamentoBuilder.push({ produto_id: null, descricao: '', quantidade: 1, preco_unitario: 0 });
  renderItensOrcamentoBuilder();
});

function atualizarTotalOrcamentoPreview() {
  const subtotal = itensOrcamentoBuilder.reduce((soma, i) => soma + i.quantidade * i.preco_unitario, 0);
  const desconto = Number(document.getElementById('orc-desconto').value) || 0;
  const frete = Number(document.getElementById('orc-frete').value) || 0;
  const total = Math.max(0, subtotal - desconto) + frete;
  document.getElementById('orc-total-preview').textContent = `Subtotal: R$ ${subtotal.toFixed(2)} · Total: R$ ${total.toFixed(2)}`;
}

document.getElementById('orc-desconto').addEventListener('input', atualizarTotalOrcamentoPreview);
document.getElementById('orc-frete').addEventListener('input', atualizarTotalOrcamentoPreview);

document.getElementById('form-novo-orcamento').addEventListener('submit', async (e) => {
  e.preventDefault();
  const itensValidos = itensOrcamentoBuilder.filter((i) => i.quantidade > 0 && (i.produto_id || i.descricao));
  if (itensValidos.length === 0) {
    mostrarToast('Adicione ao menos um item válido', true);
    return;
  }
  try {
    await api('/api/orcamentos', {
      method: 'POST',
      body: JSON.stringify({
        cliente_id: orcamentoContexto.clienteId,
        oportunidade_id: orcamentoContexto.oportunidadeId,
        itens: itensValidos.map((i) => ({
          produto_id: i.produto_id,
          descricao: i.descricao || undefined,
          quantidade: i.quantidade,
          preco_unitario: i.preco_unitario,
        })),
        valor_desconto: Number(document.getElementById('orc-desconto').value) || 0,
        valor_frete: Number(document.getElementById('orc-frete').value) || 0,
        prazo: document.getElementById('orc-prazo').value.trim(),
        condicoes_comerciais: document.getElementById('orc-condicoes').value.trim(),
        observacoes: document.getElementById('orc-observacoes').value.trim(),
      }),
    });
    fecharModal('modal-novo-orcamento');
    await recarregarOportunidades();
    mostrarToast('Orçamento criado');
  } catch (err) {
    mostrarToast(err.message, true);
  }
});

// ---------- Orçamentos (seção dentro da oportunidade + modal global) ----------

async function carregarOrcamentosDaOportunidade(oportunidadeId) {
  const orcamentos = await api(`/api/orcamentos?oportunidade_id=${oportunidadeId}`);
  renderListaOrcamentos(orcamentos, 'lead-orcamentos-lista', { comCliente: false, aoAtualizar: () => carregarOrcamentosDaOportunidade(oportunidadeId) });
}

async function recarregarListaOrcamentosGlobal() {
  const orcamentos = await api('/api/orcamentos');
  renderListaOrcamentos(orcamentos, 'orcamentos-lista', { comCliente: true, aoAtualizar: recarregarListaOrcamentosGlobal });
}


function renderListaOrcamentos(orcamentosLista, containerId, { comCliente, aoAtualizar }) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  if (orcamentosLista.length === 0) {
    container.innerHTML = '<p style="font-size:12.5px;color:var(--cinza-texto)">Nenhum orçamento ainda.</p>';
    return;
  }
  orcamentosLista.forEach((orc) => {
    const item = document.createElement('div');
    item.className = 'config-item';
    const podeConverter = orc.status !== 'recusado' && orc.status !== 'expirado';
    item.innerHTML = `
      <h4>${orc.numero}${comCliente ? ' — ' + escapeHtml(orc.cliente.nome) : ''}</h4>
      <p style="font-size:12.5px;color:var(--cinza-texto);margin:0 0 8px">
        R$ ${orc.valor_total.toFixed(2)} · ${orc.itens.length} item(ns) ${orc.prazo ? '· prazo: ' + escapeHtml(orc.prazo) : ''}
      </p>
      <label>Status
        <select class="orc-status-select"></select>
      </label>
      <div class="form-actions" style="margin-top:8px">
        ${podeConverter ? '<button type="button" class="btn btn-primary btn-converter">Converter em pedido</button>' : ''}
      </div>
    `;
    const select = item.querySelector('.orc-status-select');
    Object.keys(STATUS_ORCAMENTO_LABEL).forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = STATUS_ORCAMENTO_LABEL[s];
      opt.selected = s === orc.status;
      select.appendChild(opt);
    });
    select.addEventListener('change', async () => {
      try {
        await api(`/api/orcamentos/${orc.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: select.value }) });
        mostrarToast('Status do orçamento atualizado');
        if (aoAtualizar) await aoAtualizar();
      } catch (err) {
        mostrarToast(err.message, true);
      }
    });
    const btnConverter = item.querySelector('.btn-converter');
    if (btnConverter) {
      btnConverter.addEventListener('click', async () => {
        try {
          const pedido = await api(`/api/orcamentos/${orc.id}/converter-em-pedido`, { method: 'POST' });
          mostrarToast(`Pedido ${pedido.numero} criado`);
          if (aoAtualizar) await aoAtualizar();
          await recarregarOportunidades();
        } catch (err) {
          mostrarToast(err.message, true);
        }
      });
    }
    container.appendChild(item);
  });
}

// ---------- Pedidos (Kanban de produção) ----------

async function carregarPedidos() {
  pedidos = await api('/api/pedidos');
  renderBoardProducao();
}

function renderBoardProducao() {
  boardProducao.innerHTML = '';
  Object.keys(STATUS_PRODUCAO_LABEL).forEach((status) => {
    const coluna = tplColuna.content.firstElementChild.cloneNode(true);
    coluna.dataset.etapa = status;
    coluna.querySelector('.coluna-titulo').textContent = STATUS_PRODUCAO_LABEL[status];

    const doStatus = pedidos.filter((p) => p.status_producao === status);
    coluna.querySelector('.coluna-contagem').textContent = doStatus.length;

    const container = coluna.querySelector('.coluna-cards');
    doStatus.forEach((pedido) => container.appendChild(renderCardPedido(pedido)));

    container.addEventListener('dragover', (e) => { e.preventDefault(); container.classList.add('drag-over'); });
    container.addEventListener('dragleave', () => container.classList.remove('drag-over'));
    container.addEventListener('drop', async (e) => {
      e.preventDefault();
      container.classList.remove('drag-over');
      if (!arrastandoId) return;
      await moverPedidoDeStatusProducao(arrastandoId, status);
    });

    boardProducao.appendChild(coluna);
  });
}

function renderCardPedido(pedido) {
  const card = tplCardPedido.content.firstElementChild.cloneNode(true);
  card.dataset.id = pedido.id;
  card.querySelector('.card-nome').textContent = `${pedido.numero} — ${pedido.cliente.nome}`;
  card.querySelector('.card-empresa').textContent = pedido.cliente.empresa || '';
  card.querySelector('.card-produto').textContent =
    [pedido.tipo_fita, pedido.cor_fita, pedido.largura].filter(Boolean).join(' · ');
  card.querySelector('.card-dias').textContent = `R$ ${pedido.valor_total.toFixed(2)}`;

  const arteEl = card.querySelector('.card-arte');
  arteEl.textContent = pedido.arte_aprovada ? 'Arte aprovada' : 'Arte pendente';
  arteEl.classList.toggle('ok', pedido.arte_aprovada);
  arteEl.classList.toggle('alerta', !pedido.arte_aprovada);

  card.addEventListener('dragstart', () => { arrastandoId = pedido.id; card.classList.add('dragging'); });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));
  card.addEventListener('click', () => abrirDetalhePedido(pedido.id));

  return card;
}

async function moverPedidoDeStatusProducao(pedidoId, novoStatus) {
  const pedido = pedidos.find((p) => p.id === pedidoId);
  if (!pedido || pedido.status_producao === novoStatus) return;

  try {
    await api(`/api/pedidos/${pedidoId}/status-producao`, {
      method: 'PATCH',
      body: JSON.stringify({ valor: novoStatus }),
    });
    await carregarPedidos();
    mostrarToast('Status de produção atualizado');
  } catch (err) {
    mostrarToast(err.message, true);
  }
}

function preencherSelectStatus(select, labels, valorAtual) {
  select.innerHTML = '';
  Object.keys(labels).forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = labels[v];
    opt.selected = v === valorAtual;
    select.appendChild(opt);
  });
}

async function abrirDetalhePedido(pedidoId) {
  const pedido = await api(`/api/pedidos/${pedidoId}`);
  pedidoAtualId = pedido.id;

  document.getElementById('pedido-titulo').textContent = `${pedido.numero} — ${pedido.cliente.nome}`;
  document.getElementById('pedido-itens-resumo').innerHTML = pedido.itens
    .map((i) => `${escapeHtml(i.descricao)} — ${i.quantidade} × R$ ${i.preco_unitario.toFixed(2)} = R$ ${i.subtotal.toFixed(2)}`)
    .join('<br>') + `<br><strong>Total: R$ ${pedido.valor_total.toFixed(2)}</strong>`;

  preencherSelectStatus(document.getElementById('pedido-status-comercial'), STATUS_COMERCIAL_LABEL, pedido.status_comercial);
  preencherSelectStatus(document.getElementById('pedido-status-producao'), STATUS_PRODUCAO_LABEL, pedido.status_producao);
  preencherSelectStatus(document.getElementById('pedido-status-fiscal'), STATUS_FISCAL_LABEL, pedido.status_fiscal);
  preencherSelectStatus(document.getElementById('pedido-status-logistico'), STATUS_LOGISTICO_LABEL, pedido.status_logistico);

  document.getElementById('pedido-arte-aprovada').checked = pedido.arte_aprovada;
  document.getElementById('pedido-logo-arquivo').value = pedido.logo_arquivo || '';
  document.getElementById('pedido-cor-fita').value = pedido.cor_fita || '';
  document.getElementById('pedido-tipo-fita').value = pedido.tipo_fita || '';
  document.getElementById('pedido-largura').value = pedido.largura || '';
  document.getElementById('pedido-tipo-personalizacao').value = pedido.tipo_personalizacao || '';
  document.getElementById('pedido-observacoes-producao').value = pedido.observacoes_producao || '';
  document.getElementById('pedido-prazo-entrega').value = pedido.prazo_entrega || '';
  document.getElementById('pedido-nf-numero').value = pedido.nf_numero || '';
  document.getElementById('pedido-nf-url').value = pedido.nf_url || '';
  document.getElementById('pedido-etiqueta-codigo').value = pedido.etiqueta_codigo || '';
  document.getElementById('pedido-codigo-rastreio').value = pedido.codigo_rastreio || '';
  document.getElementById('pedido-link-rastreio').value = pedido.link_rastreio || '';

  renderEventosPedido(pedido.eventos);

  abrirModal('modal-pedido-detalhe');
}

function renderEventosPedido(eventos) {
  const container = document.getElementById('pedido-eventos-lista');
  container.innerHTML = '';
  eventos.forEach((evento) => {
    const item = document.createElement('div');
    item.className = 'nota-item';
    const data = new Date(evento.created_at).toLocaleString('pt-BR');
    item.innerHTML = `<span>${escapeHtml(evento.descricao)}</span><span class="nota-data">${data}</span>`;
    container.appendChild(item);
  });
}

async function mudarStatusPedido(campo, valor) {
  try {
    await api(`/api/pedidos/${pedidoAtualId}/status-${campo}`, { method: 'PATCH', body: JSON.stringify({ valor }) });
    const pedido = await api(`/api/pedidos/${pedidoAtualId}`);
    renderEventosPedido(pedido.eventos);
    await carregarPedidos();
    mostrarToast('Status atualizado');
  } catch (err) {
    mostrarToast(err.message, true);
  }
}

document.getElementById('pedido-status-comercial').addEventListener('change', (e) => mudarStatusPedido('comercial', e.target.value));
document.getElementById('pedido-status-producao').addEventListener('change', (e) => mudarStatusPedido('producao', e.target.value));
document.getElementById('pedido-status-fiscal').addEventListener('change', (e) => mudarStatusPedido('fiscal', e.target.value));
document.getElementById('pedido-status-logistico').addEventListener('change', (e) => mudarStatusPedido('logistico', e.target.value));

document.getElementById('btn-salvar-pedido').addEventListener('click', async () => {
  try {
    const pedido = await api(`/api/pedidos/${pedidoAtualId}`, {
      method: 'PUT',
      body: JSON.stringify({
        arte_aprovada: document.getElementById('pedido-arte-aprovada').checked,
        logo_arquivo: document.getElementById('pedido-logo-arquivo').value.trim(),
        cor_fita: document.getElementById('pedido-cor-fita').value.trim(),
        tipo_fita: document.getElementById('pedido-tipo-fita').value.trim(),
        largura: document.getElementById('pedido-largura').value.trim(),
        tipo_personalizacao: document.getElementById('pedido-tipo-personalizacao').value.trim(),
        observacoes_producao: document.getElementById('pedido-observacoes-producao').value.trim(),
        prazo_entrega: document.getElementById('pedido-prazo-entrega').value.trim(),
        nf_numero: document.getElementById('pedido-nf-numero').value.trim(),
        nf_url: document.getElementById('pedido-nf-url').value.trim(),
        etiqueta_codigo: document.getElementById('pedido-etiqueta-codigo').value.trim(),
        codigo_rastreio: document.getElementById('pedido-codigo-rastreio').value.trim(),
        link_rastreio: document.getElementById('pedido-link-rastreio').value.trim(),
      }),
    });
    renderEventosPedido(pedido.eventos);
    await carregarPedidos();
    mostrarToast('Dados do pedido salvos');
  } catch (err) {
    mostrarToast(err.message, true);
  }
});

// ---------- Clientes ----------

function preencherSelectEstados(select, incluirVazio) {
  select.innerHTML = '';
  if (incluirVazio) {
    const vazio = document.createElement('option');
    vazio.value = '';
    vazio.textContent = incluirVazio;
    select.appendChild(vazio);
  }
  ESTADOS.forEach((uf) => {
    const option = document.createElement('option');
    option.value = uf;
    option.textContent = uf;
    select.appendChild(option);
  });
}

function queryFiltrosClientes() {
  const params = new URLSearchParams();
  Object.entries(filtrosClientes).forEach(([chave, valor]) => {
    if (valor) params.set(chave, valor);
  });
  return params.toString();
}

async function carregarClientes() {
  const query = queryFiltrosClientes();
  clientes = await api(`/api/clientes${query ? `?${query}` : ''}`);
  renderTabelaClientes();
}

function renderTabelaClientes() {
  const corpo = document.getElementById('clientes-tabela-corpo');
  corpo.innerHTML = '';

  if (clientes.length === 0) {
    const linha = document.createElement('tr');
    linha.innerHTML = '<td class="celula-vazia" colspan="8">Nenhum cliente encontrado.</td>';
    corpo.appendChild(linha);
  }

  clientes.forEach((cliente) => {
    const linha = document.createElement('tr');
    const local = [cliente.cidade, cliente.estado].filter(Boolean).join('/');
    const ultima = cliente.data_ultimo_contato
      ? new Date(cliente.data_ultimo_contato).toLocaleDateString('pt-BR')
      : '';
    const tags = cliente.tags.map((t) => `<span class="tag-pill">${escapeHtml(t.nome)}</span>`).join(' ');

    linha.innerHTML = `
      <td class="celula-nome">${escapeHtml(cliente.nome)}</td>
      <td>${escapeHtml(cliente.empresa || '')}</td>
      <td>${escapeHtml(cliente.telefone || '')}</td>
      <td>${escapeHtml(local)}</td>
      <td><span class="status-pill">${STATUS_LABEL[cliente.status]}</span></td>
      <td>${cliente.quantidade_compras}</td>
      <td>${ultima}</td>
      <td>${tags}</td>
    `;
    linha.addEventListener('click', () => abrirCadastroCliente(cliente.id));
    corpo.appendChild(linha);
  });

  const total = clientes.length;
  document.getElementById('clientes-contagem').textContent =
    total === 1 ? '1 cliente' : `${total} clientes`;
}

async function atualizarFiltroTags() {
  const select = document.getElementById('clientes-filtro-tag');
  const selecionada = select.value;
  const tags = await api('/api/tags');
  select.innerHTML = '<option value="">Todas as tags</option>';
  tags.forEach((tag) => {
    const option = document.createElement('option');
    option.value = tag.id;
    option.textContent = tag.nome;
    option.selected = String(tag.id) === selecionada;
    select.appendChild(option);
  });
}

let debounceBusca = null;
document.getElementById('clientes-busca').addEventListener('input', (e) => {
  clearTimeout(debounceBusca);
  const valor = e.target.value;
  debounceBusca = setTimeout(() => {
    filtrosClientes.busca = valor.trim();
    carregarClientes().catch((err) => mostrarToast(err.message, true));
  }, 300);
});

['status', 'tag', 'estado'].forEach((filtro) => {
  document.getElementById(`clientes-filtro-${filtro}`).addEventListener('change', (e) => {
    filtrosClientes[filtro] = e.target.value;
    carregarClientes().catch((err) => mostrarToast(err.message, true));
  });
});

document.getElementById('btn-exportar-clientes').addEventListener('click', () => {
  const query = queryFiltrosClientes();
  window.location.href = `/api/clientes/exportar.csv${query ? `?${query}` : ''}`;
});

document.getElementById('btn-importar-clientes').addEventListener('click', () => {
  document.getElementById('input-importar-clientes').click();
});

document.getElementById('input-importar-clientes').addEventListener('change', async (e) => {
  const arquivo = e.target.files[0];
  if (!arquivo) return;
  try {
    const csv = await arquivo.text();
    const resultado = await api('/api/clientes/importar', {
      method: 'POST',
      body: JSON.stringify({ csv }),
    });
    await carregarClientes();
    await atualizarFiltroTags();
    const partes = [`${resultado.criados} criado(s)`, `${resultado.atualizados} atualizado(s)`];
    if (resultado.erros.length > 0) partes.push(`${resultado.erros.length} com erro`);
    mostrarToast(`Importação: ${partes.join(', ')}`, resultado.erros.length > 0);
    if (resultado.erros.length > 0) {
      console.warn('Linhas com erro na importação:', resultado.erros);
    }
  } catch (err) {
    mostrarToast(err.message, true);
  } finally {
    e.target.value = '';
  }
});

// ---------- Modal de cadastro do cliente ----------

async function abrirCadastroCliente(clienteId) {
  try {
    const cliente = await api(`/api/clientes/${clienteId}`);
    clienteCadastroId = cliente.id;

    document.getElementById('cad-titulo').textContent = cliente.nome;
    const badge = document.getElementById('cad-status-badge');
    badge.textContent = STATUS_LABEL[cliente.status];
    badge.className = `status-badge ${cliente.status}`;

    document.getElementById('cad-nome').value = cliente.nome;
    document.getElementById('cad-telefone').value = cliente.telefone;
    document.getElementById('cad-tipo-pessoa').value = cliente.tipo_pessoa;
    document.getElementById('cad-documento').value = cliente.documento || '';
    document.getElementById('cad-empresa').value = cliente.empresa || '';
    document.getElementById('cad-email').value = cliente.email || '';
    document.getElementById('cad-instagram').value = cliente.instagram || '';
    document.getElementById('cad-origem').value = cliente.origem || '';
    document.getElementById('cad-observacoes').value = cliente.observacoes || '';

    document.getElementById('cad-cep').value = cliente.cep || '';
    document.getElementById('cad-endereco').value = cliente.endereco || '';
    document.getElementById('cad-numero').value = cliente.numero || '';
    document.getElementById('cad-complemento').value = cliente.complemento || '';
    document.getElementById('cad-bairro').value = cliente.bairro || '';
    document.getElementById('cad-cidade').value = cliente.cidade || '';
    document.getElementById('cad-estado').value = cliente.estado || '';

    document.getElementById('cad-resumo-compras').textContent = cliente.quantidade_compras > 0
      ? `${cliente.quantidade_compras} venda(s) ganha(s) · R$ ${cliente.valor_total_vendas.toFixed(2)} no total · última em ${new Date(cliente.ultima_compra).toLocaleDateString('pt-BR')}`
      : 'Ainda sem vendas ganhas registradas.';

    renderTagsDoCadastro(cliente.tags);
    renderOportunidadesDoCadastro(cliente.oportunidades);

    fecharModal('modal-lead');
    abrirModal('modal-cliente');
  } catch (err) {
    mostrarToast(err.message, true);
  }
}

function renderTagsDoCadastro(tags) {
  const container = document.getElementById('cad-tags-lista');
  container.innerHTML = '';
  tags.forEach((tag) => {
    const pill = document.createElement('span');
    pill.className = 'tag-pill-removivel';
    pill.innerHTML = `<span>${escapeHtml(tag.nome)}</span>`;
    const btnRemover = document.createElement('button');
    btnRemover.textContent = '×';
    btnRemover.type = 'button';
    btnRemover.addEventListener('click', async () => {
      try {
        await api(`/api/clientes/${clienteCadastroId}/tags/${tag.id}`, { method: 'DELETE' });
        const cliente = await api(`/api/clientes/${clienteCadastroId}`);
        renderTagsDoCadastro(cliente.tags);
        await carregarClientes();
      } catch (err) {
        mostrarToast(err.message, true);
      }
    });
    pill.appendChild(btnRemover);
    container.appendChild(pill);
  });
}

function renderOportunidadesDoCadastro(oportunidadesDoCliente) {
  const container = document.getElementById('cad-oportunidades-lista');
  container.innerHTML = '';
  if (oportunidadesDoCliente.length === 0) {
    container.innerHTML = '<p style="font-size:12.5px;color:var(--cinza-texto)">Nenhuma oportunidade ainda.</p>';
    return;
  }
  oportunidadesDoCliente.forEach((op) => {
    const etapaInfo = etapasConfig.find((e) => e.etapa === op.etapa);
    const item = document.createElement('div');
    item.className = 'historico-item';
    item.style.cursor = 'pointer';
    const data = new Date(op.created_at).toLocaleDateString('pt-BR');
    item.textContent = `${op.produto_interesse || 'Sem produto'} — ${etapaInfo ? etapaInfo.label : op.etapa} (${data})`;
    item.addEventListener('click', () => {
      fecharModal('modal-cliente');
      abrirDetalheOportunidade(op.id);
    });
    container.appendChild(item);
  });
}

document.getElementById('btn-salvar-cliente').addEventListener('click', async () => {
  try {
    await api(`/api/clientes/${clienteCadastroId}`, {
      method: 'PUT',
      body: JSON.stringify({
        nome: document.getElementById('cad-nome').value.trim(),
        telefone: document.getElementById('cad-telefone').value.trim(),
        tipo_pessoa: document.getElementById('cad-tipo-pessoa').value,
        documento: document.getElementById('cad-documento').value.trim(),
        empresa: document.getElementById('cad-empresa').value.trim(),
        email: document.getElementById('cad-email').value.trim(),
        instagram: document.getElementById('cad-instagram').value.trim(),
        origem: document.getElementById('cad-origem').value.trim(),
        observacoes: document.getElementById('cad-observacoes').value.trim(),
        cep: document.getElementById('cad-cep').value.trim(),
        endereco: document.getElementById('cad-endereco').value.trim(),
        numero: document.getElementById('cad-numero').value.trim(),
        complemento: document.getElementById('cad-complemento').value.trim(),
        bairro: document.getElementById('cad-bairro').value.trim(),
        cidade: document.getElementById('cad-cidade').value.trim(),
        estado: document.getElementById('cad-estado').value,
      }),
    });
    fecharModal('modal-cliente');
    await carregarClientes();
    await recarregarOportunidades();
    mostrarToast('Cadastro salvo');
  } catch (err) {
    mostrarToast(err.message, true);
  }
});

document.getElementById('btn-excluir-cliente').addEventListener('click', async () => {
  if (!clienteCadastroId) return;
  if (!window.confirm('Excluir este cliente? Todas as oportunidades, notas e tarefas dele vão junto.')) return;
  try {
    await api(`/api/clientes/${clienteCadastroId}`, { method: 'DELETE' });
    fecharModal('modal-cliente');
    await carregarClientes();
    await recarregarOportunidades();
    mostrarToast('Cliente excluído');
  } catch (err) {
    mostrarToast(err.message, true);
  }
});

document.getElementById('form-cad-tag').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('input-cad-tag');
  const nome = input.value.trim();
  if (!nome) return;
  try {
    await api(`/api/clientes/${clienteCadastroId}/tags`, { method: 'POST', body: JSON.stringify({ nome }) });
    input.value = '';
    const cliente = await api(`/api/clientes/${clienteCadastroId}`);
    renderTagsDoCadastro(cliente.tags);
    await atualizarFiltroTags();
    await carregarClientes();
  } catch (err) {
    mostrarToast(err.message, true);
  }
});

document.getElementById('btn-nova-oportunidade-cliente').addEventListener('click', async () => {
  const produto = window.prompt('Produto de interesse desta nova oportunidade:');
  if (produto === null) return;
  try {
    await api('/api/oportunidades', {
      method: 'POST',
      body: JSON.stringify({ cliente_id: clienteCadastroId, produto_interesse: produto.trim() }),
    });
    const cliente = await api(`/api/clientes/${clienteCadastroId}`);
    renderOportunidadesDoCadastro(cliente.oportunidades);
    await recarregarOportunidades();
    mostrarToast('Oportunidade criada');
  } catch (err) {
    mostrarToast(err.message, true);
  }
});

document.getElementById('btn-ver-cadastro').addEventListener('click', () => {
  if (clienteAtualId) abrirCadastroCliente(clienteAtualId);
});

// ---------- Navegação (sidebar) ----------

const TITULOS_TELA = {
  dashboard: 'Dashboard',
  funil: 'Funil',
  clientes: 'Clientes',
  pedidos: 'Pedidos',
};

// Cada modal da sidebar precisa carregar seus dados antes de aparecer.
const PREPARAR_MODAL = {
  'modal-orcamentos': () => recarregarListaOrcamentosGlobal(),
  'modal-produtos': async () => {
    await carregarProdutos();
    renderProdutosLista();
  },
  'modal-tarefas': () => carregarTarefasPendentes(),
  'modal-config': async () => renderConfigEtapas(),
};

async function mostrarTela(nome) {
  document.querySelectorAll('.tela').forEach((tela) => {
    tela.hidden = tela.id !== `tela-${nome}`;
  });
  document.querySelectorAll('.nav-item[data-tela]').forEach((item) => {
    item.classList.toggle('ativo', item.dataset.tela === nome);
  });
  document.getElementById('titulo-tela').textContent = TITULOS_TELA[nome] || nome;

  if (nome === 'pedidos') await carregarPedidos();
  if (nome === 'clientes') {
    await atualizarFiltroTags();
    await carregarClientes();
  }
}

document.querySelector('.sidebar-nav').addEventListener('click', async (e) => {
  const item = e.target.closest('.nav-item');
  if (!item) return;
  try {
    if (item.dataset.tela) {
      await mostrarTela(item.dataset.tela);
    } else if (item.dataset.modal) {
      const preparar = PREPARAR_MODAL[item.dataset.modal];
      if (preparar) await preparar();
      abrirModal(item.dataset.modal);
    }
  } catch (err) {
    mostrarToast(err.message, true);
  }
});

preencherSelectEstados(document.getElementById('clientes-filtro-estado'), 'Todos os estados');
preencherSelectEstados(document.getElementById('cad-estado'), '—');

carregarTudo().catch((err) => mostrarToast(err.message, true));
