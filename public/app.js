const board = document.getElementById('board');
const tplColuna = document.getElementById('tpl-coluna');
const tplCard = document.getElementById('tpl-card');
const toast = document.getElementById('toast');

let etapasConfig = [];
let oportunidades = [];
let oportunidadeAtualId = null;
let clienteAtualId = null;
let arrastandoId = null;

const STATUS_LABEL = {
  lead: 'Lead',
  cliente: 'Cliente',
  cliente_recorrente: 'Cliente recorrente',
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
    mostrarToast('Lead criado');
  } catch (err) {
    mostrarToast(err.message, true);
  }
});

// ---------- Modal de configuração de etapas ----------

document.getElementById('btn-config').addEventListener('click', () => {
  renderConfigEtapas();
  abrirModal('modal-config');
});

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

document.getElementById('btn-tarefas').addEventListener('click', async () => {
  await carregarTarefasPendentes();
  abrirModal('modal-tarefas');
});

async function carregarTarefasPendentes() {
  const tarefas = await api('/api/tarefas?pendentes=true');
  renderTarefas(tarefas, 'tarefas-pendentes-lista', { comOportunidade: true });
}

carregarTudo().catch((err) => mostrarToast(err.message, true));
