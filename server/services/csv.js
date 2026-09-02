// CSV sem dependência externa — segue o RFC 4180 no essencial: campo com
// vírgula, aspas ou quebra de linha vai entre aspas, e aspas viram aspas duplas.

function escaparCampo(valor) {
  const texto = valor == null ? '' : String(valor);
  if (/[",\r\n]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

function paraCsv(linhas, colunas) {
  const cabecalho = colunas.join(',');
  const corpo = linhas.map((linha) => colunas.map((coluna) => escaparCampo(linha[coluna])).join(','));
  return [cabecalho, ...corpo].join('\r\n');
}

function separarLinhaEmCampos(texto, inicio) {
  const campos = [];
  let campo = '';
  let dentroDeAspas = false;
  let i = inicio;

  while (i < texto.length) {
    const char = texto[i];

    if (dentroDeAspas) {
      if (char === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i += 2;
          continue;
        }
        dentroDeAspas = false;
        i += 1;
        continue;
      }
      campo += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      dentroDeAspas = true;
      i += 1;
      continue;
    }
    if (char === ',') {
      campos.push(campo);
      campo = '';
      i += 1;
      continue;
    }
    if (char === '\r' || char === '\n') {
      if (char === '\r' && texto[i + 1] === '\n') i += 1;
      i += 1;
      break;
    }

    campo += char;
    i += 1;
  }

  campos.push(campo);
  return { campos, proximo: i };
}

// Devolve um array de objetos, usando a primeira linha como cabeçalho.
function deCsv(texto) {
  const conteudo = texto.replace(/^﻿/, '');
  let posicao = 0;

  const primeira = separarLinhaEmCampos(conteudo, posicao);
  posicao = primeira.proximo;
  const colunas = primeira.campos.map((coluna) => coluna.trim());

  const linhas = [];
  while (posicao < conteudo.length) {
    const { campos, proximo } = separarLinhaEmCampos(conteudo, posicao);
    posicao = proximo;
    if (campos.every((campo) => campo.trim() === '')) continue;
    const linha = {};
    colunas.forEach((coluna, indice) => {
      linha[coluna] = (campos[indice] ?? '').trim();
    });
    linhas.push(linha);
  }

  return { colunas, linhas };
}

module.exports = { paraCsv, deCsv };
