const board = document.getElementById('board');
const tplColuna = document.getElementById('tpl-coluna');
const tplCard = document.getElementById('tpl-card');
const toast = document.getElementById('toast');

let etapasConfig = [];
let leads = [];
let leadAtualId = null;
let leadArrastandoId = null;

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

function abrirModal(id) {
  document.getElementById(id).hidden = false;
}

function fecharModal(id) {
  document.getElementById(id).hidden = true;
}

document.addEventListener('click', (e) => {
  if (e.target.matches('.modal-fechar')) {
    fecharModal(e.target.dataset.fechar);
  }
  if (e.target.classList.contains('modal-overlay')) {
    e.target.hidden = true;
  }
});

async function carregarTudo() {
  [etapasConfig, leads] = await Promise.all([api('/api/etapas'), api('/api/leads')]);
  renderBoard();
}

async function recarregarLeads() {
  leads = await api('/api/leads');
  renderBoard();
}

function renderBoard() {
  board.innerHTML = '';
  etapasConfig.forEach((etapa) => {
    const coluna = tplColuna.content.firstElementChild.cloneNode(true);
    coluna.dataset.etapa = etapa.etapa;
    coluna.querySelector('.coluna-titulo').textContent = etapa.label;

    const leadsDaEtapa = leads.filter((l) => l.etapa === etapa.etapa);
    coluna.querySelector('.coluna-contagem').textContent = leadsDaEtapa.length;

    const container = coluna.querySelector('.coluna-cards');
    leadsDaEtapa.forEach((lead) => container.appendChild(renderCard(lead)));

    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      container.classList.add('drag-over');
    });
    container.addEventListener('dragleave', () => container.classList.remove('drag-over'));
    container.addEventListener('drop', async (e) => {
      e.preventDefault();
      container.classList.remove('drag-over');
      if (!leadArrastandoId) return;
      await moverLeadDeEtapa(leadArrastandoId, etapa.etapa);
    });

    board.appendChild(coluna);
  });
}

function renderCard(lead) {
  const card = tplCard.content.firstElementChild.cloneNode(true);
  card.dataset.id = lead.id;
  card.classList.toggle('card-atrasada', lead.atrasado);
  card.querySelector('.card-nome').textContent = lead.nome;
  card.querySelector('.card-produto').textContent = lead.produto_interesse || '';
  card.querySelector('.card-atraso').hidden = !lead.atrasado;
  card.querySelector('.card-dias').textContent =
    lead.dias_na_etapa === 0 ? 'entrou hoje' : `há ${lead.dias_na_etapa} dia${lead.dias_na_etapa === 1 ? '' : 's'}`;

  const tagsEl = card.querySelector('.card-tags');
  lead.tags.forEach((tag) => {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.textContent = tag.nome;
    tagsEl.appendChild(pill);
  });

  card.addEventListener('dragstart', () => {
    leadArrastandoId = lead.id;
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));

  card.addEventListener('click', () => abrirDetalheLead(lead.id));

  card.querySelector('.btn-whatsapp').addEventListener('click', (e) => {
    e.stopPropagation();
    abrirWhatsapp(lead.id);
  });

  return card;
}

async function moverLeadDeEtapa(leadId, novaEtapa) {
  const lead = leads.find((l) => l.id === leadId);
  if (!lead || lead.etapa === novaEtapa) return;

  let motivoPerda = null;
  if (novaEtapa === 'perdido') {
    motivoPerda = window.prompt('Motivo da perda (opcional):') || '';
  }

  try {
    await api(`/api/leads/${leadId}/etapa`, {
      method: 'PATCH',
      body: JSON.stringify({ etapa: novaEtapa, motivo_perda: motivoPerda }),
    });
    await recarregarLeads();
    mostrarToast('Lead movido de etapa');
  } catch (err) {
    mostrarToast(err.message, true);
  }
}

async function abrirWhatsapp(leadId) {
  try {
    const { link } = await api(`/api/leads/${leadId}/whatsapp`, { method: 'POST' });
    window.open(link, '_blank');
    await recarregarLeads();
  } catch (err) {
    mostrarToast(err.message, true);
  }
}

// ---------- Modal de detalhe do lead ----------

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

async function abrirDetalheLead(leadId) {
  try {
    const lead = await api(`/api/leads/${leadId}`);
    leadAtualId = lead.id;

    document.getElementById('lead-titulo').textContent = lead.nome;
    document.getElementById('lead-nome').value = lead.nome;
    document.getElementById('lead-telefone').value = lead.telefone;
    document.getElementById('lead-produto').value = lead.produto_interesse || '';
    preencherSelectEtapas(document.getElementById('lead-etapa'), lead.etapa);

    const campoMotivo = document.getElementById('campo-motivo-perda');
    const inputMotivo = document.getElementById('lead-motivo-perda');
    campoMotivo.hidden = lead.etapa !== 'perdido';
    inputMotivo.value = lead.motivo_perda || '';

    document.getElementById('lead-etapa').onchange = (e) => {
      campoMotivo.hidden = e.target.value !== 'perdido';
    };

    renderTagsDoLead(lead.tags);
    renderNotasDoLead(lead.notas);

    abrirModal('modal-lead');
  } catch (err) {
    mostrarToast(err.message, true);
  }
}

function renderTagsDoLead(tags) {
  const container = document.getElementById('lead-tags-lista');
  container.innerHTML = '';
  tags.forEach((tag) => {
    const pill = document.createElement('span');
    pill.className = 'tag-pill-removivel';
    pill.innerHTML = `<span>${tag.nome}</span>`;
    const btnRemover = document.createElement('button');
    btnRemover.textContent = '×';
    btnRemover.type = 'button';
    btnRemover.addEventListener('click', async () => {
      try {
        await api(`/api/leads/${leadAtualId}/tags/${tag.id}`, { method: 'DELETE' });
        const lead = await api(`/api/leads/${leadAtualId}`);
        renderTagsDoLead(lead.tags);
        await recarregarLeads();
      } catch (err) {
        mostrarToast(err.message, true);
      }
    });
    pill.appendChild(btnRemover);
    container.appendChild(pill);
  });
}

function renderNotasDoLead(notas) {
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

function escapeHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

document.getElementById('form-lead').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nome = document.getElementById('lead-nome').value.trim();
  const telefone = document.getElementById('lead-telefone').value.trim();
  const produto_interesse = document.getElementById('lead-produto').value.trim();
  const novaEtapa = document.getElementById('lead-etapa').value;
  const motivoPerda = document.getElementById('lead-motivo-perda').value.trim();

  try {
    await api(`/api/leads/${leadAtualId}`, {
      method: 'PUT',
      body: JSON.stringify({ nome, telefone, produto_interesse }),
    });

    const leadAtual = leads.find((l) => l.id === leadAtualId);
    if (leadAtual && leadAtual.etapa !== novaEtapa) {
      await api(`/api/leads/${leadAtualId}/etapa`, {
        method: 'PATCH',
        body: JSON.stringify({ etapa: novaEtapa, motivo_perda: motivoPerda }),
      });
    }

    fecharModal('modal-lead');
    await recarregarLeads();
    mostrarToast('Lead atualizado');
  } catch (err) {
    mostrarToast(err.message, true);
  }
});

document.getElementById('btn-whatsapp-lead').addEventListener('click', () => {
  if (leadAtualId) abrirWhatsapp(leadAtualId);
});

document.getElementById('btn-excluir-lead').addEventListener('click', async () => {
  if (!leadAtualId) return;
  if (!window.confirm('Excluir esse lead? Essa ação não pode ser desfeita.')) return;
  try {
    await api(`/api/leads/${leadAtualId}`, { method: 'DELETE' });
    fecharModal('modal-lead');
    await recarregarLeads();
    mostrarToast('Lead excluído');
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
    await api(`/api/leads/${leadAtualId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ nome }),
    });
    input.value = '';
    const lead = await api(`/api/leads/${leadAtualId}`);
    renderTagsDoLead(lead.tags);
    await recarregarLeads();
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
    const notas = await api(`/api/leads/${leadAtualId}/notas`, {
      method: 'POST',
      body: JSON.stringify({ texto }),
    });
    input.value = '';
    renderNotasDoLead(notas);
    await recarregarLeads();
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
  const produto_interesse = document.getElementById('novo-produto').value.trim();
  const tags = document.getElementById('novo-tags').value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  try {
    await api('/api/leads', {
      method: 'POST',
      body: JSON.stringify({ nome, telefone, produto_interesse, tags }),
    });
    fecharModal('modal-novo-lead');
    await recarregarLeads();
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
      <h4>${etapa.label}</h4>
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
        await recarregarLeads();
      } catch (err) {
        mostrarToast(err.message, true);
      }
    });
    container.appendChild(item);
  });
}

carregarTudo().catch((err) => mostrarToast(err.message, true));
