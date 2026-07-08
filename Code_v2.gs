/************************************************************
 * BRINCAR NO QUINTAL — Backend v2 (Google Apps Script)
 * Plataforma modular. Banco: Google Sheets (18 abas).
 * Autenticação: token de app + usuário/role por módulo.
 *
 * ARQUITETURA:
 *  - _db (aba): estado JSON completo, fatiado (fonte da verdade p/ o app)
 *  - abas legíveis: regeneradas a cada save (consulta humana no Sheets)
 *  - Toda requisição valida TOKEN + (quando aplicável) permissão do usuário.
 *
 * SETUP: igual ao Folha Control —
 *  Planilha > Extensões > Apps Script > cole isto > troque TOKEN >
 *  Implantar > App da Web (Executar como: Eu | Acesso: Qualquer pessoa).
 ************************************************************/

const TOKEN = 'TROQUE-POR-UMA-CHAVE-LONGA-E-ALEATORIA';
const CHUNK = 45000;

// Tabelas do banco (chave = nome da aba de dados)
const TABELAS = ['responsaveis','criancas','fluxo_caixa','movimentos','conversoes_saldo',
                 'festinhas','agendamentos','brincantes','escalas','usuarios'];

// Prefixos dos códigos sequenciais por tabela
const COD_PREFIX = { responsaveis: 'RESP', brincantes: 'BRINC' };

/* ============================================================
   ROTEADOR
   ============================================================ */
function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); }
  catch (err) { return responder({ ok: false, erro: 'JSON inválido' }); }

  if (!req.token || req.token !== TOKEN) return responder({ ok: false, erro: 'não autorizado' });

  try {
    switch (req.action) {
      case 'ping':        return responder({ ok: true, msg: 'pong' });
      case 'login':       return responder(login(req.login, req.senha));
      case 'load':        return responder(loadAll(req));
      case 'save':        return responder(saveAll(req.state));      // grava estado inteiro
      case 'upsert':      return responder(upsert(req.tabela, req.registro, req.usuario));
      case 'delete':      return responder(remover(req.tabela, req.id, req.usuario));
      case 'converter_saldo': return responder(converterSaldo(req.payload, req.usuario));
      case 'pagar_escala':    return responder(pagarEscala(req.ids, req.usuario));
      case 'save_usuario':    return responder(saveUsuario(req.alvo, req.novaSenha, req.usuario));
      case 'delete_usuario':  return responder(deleteUsuario(req.login, req.usuario));
      default:            return responder({ ok: false, erro: 'action desconhecida' });
    }
  } catch (err) {
    return responder({ ok: false, erro: String(err) });
  }
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================
   PERSISTÊNCIA (estado JSON na aba _db, fatiado)
   ============================================================ */
function abaDb() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName('_db') || ss.insertSheet('_db');
}

function lerEstado() {
  const sh = abaDb();
  const ultima = sh.getLastRow();
  if (!ultima) return estadoVazio();
  const json = sh.getRange(1, 1, ultima, 1).getValues().map(v => v[0]).join('');
  try { const s = JSON.parse(json); return normalizar(s); } catch (e) { return estadoVazio(); }
}

function gravarEstado(state) {
  const sh = abaDb();
  sh.clearContents();
  const json = JSON.stringify(state);
  const linhas = [];
  for (let i = 0; i < json.length; i += CHUNK) linhas.push([json.slice(i, i + CHUNK)]);
  if (linhas.length) sh.getRange(1, 1, linhas.length, 1).setValues(linhas);
}

function estadoVazio() {
  const s = { _seq: {} };
  TABELAS.forEach(t => s[t] = []);
  return s;
}
function normalizar(s) {
  s._seq = s._seq || {};
  TABELAS.forEach(t => { if (!Array.isArray(s[t])) s[t] = []; });
  return s;
}

/* ============================================================
   AUTENTICAÇÃO / PERMISSÕES
   usuarios: { login, nome, role, modulos(csv), empresas(csv), ativo, senhaHash }
   ============================================================ */
function login(loginUser, senha) {
  const s = lerEstado();
  const u = (s.usuarios || []).find(x => x.login === loginUser && x.ativo !== 'nao');
  if (!u) return { ok: false, erro: 'usuário não encontrado' };
  if (u.senhaHash && u.senhaHash !== hash(senha)) return { ok: false, erro: 'senha inválida' };
  // devolve o perfil (sem hash) — o frontend guarda para exibir só os módulos permitidos
  return { ok: true, usuario: { login: u.login, nome: u.nome, role: u.role,
           modulos: (u.modulos || '').split(',').map(x => x.trim()).filter(Boolean),
           empresas: (u.empresas || '').split(',').map(x => x.trim()).filter(Boolean) } };
}

function hash(txt) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, txt || '');
  return bytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

// Verifica se o usuário pode escrever no módulo/tabela. Admin faz tudo.
function podeEscrever(usuario, tabela) {
  if (!usuario) return true; // chamadas sem contexto de usuário (setup inicial)
  if (usuario.role === 'admin') return true;
  if (usuario.role === 'leitor') return false;
  const modDaTabela = {
    responsaveis: 'cadastro', criancas: 'cadastro',
    fluxo_caixa: 'fluxo', movimentos: 'contraturno', conversoes_saldo: 'contraturno',
    festinhas: 'festinha', agendamentos: 'contraturno',
    brincantes: 'brincantes', escalas: 'brincantes', usuarios: 'admin'
  };
  return (usuario.modulos || []).includes(modDaTabela[tabela]);
}

/* ============================================================
   LOAD / SAVE (estado completo)
   ============================================================ */
function loadAll(req) {
  const s = lerEstado();
  // nunca devolve senhaHash ao frontend
  const out = JSON.parse(JSON.stringify(s));
  (out.usuarios || []).forEach(u => delete u.senhaHash);
  return { ok: true, state: out };
}

function saveAll(state) {
  const atual = lerEstado();
  const novo = normalizar(state || {});
  novo._seq = Object.assign(atual._seq || {}, novo._seq || {});
  // preserva senhaHash existente (frontend não envia hash)
  (novo.usuarios || []).forEach(u => {
    const antigo = (atual.usuarios || []).find(a => a.login === u.login);
    if (antigo && antigo.senhaHash && !u.senhaHash) u.senhaHash = antigo.senhaHash;
  });
  gravarEstado(novo);
  gerarAbasLegiveis(novo);
  return { ok: true, salvoEm: new Date().toISOString() };
}

/* ============================================================
   CRUD GENÉRICO (upsert / delete por registro)
   Gera COD sequencial para responsaveis e brincantes.
   ============================================================ */
function proximoCod(state, tabela) {
  const pref = COD_PREFIX[tabela];
  state._seq[tabela] = (state._seq[tabela] || 0) + 1;
  return pref + '-' + String(state._seq[tabela]).padStart(4, '0');
}

function upsert(tabela, registro, usuario) {
  if (!TABELAS.includes(tabela)) return { ok: false, erro: 'tabela inválida' };
  if (!podeEscrever(usuario, tabela)) return { ok: false, erro: 'sem permissão neste módulo' };

  const s = lerEstado();
  const arr = s[tabela];
  const chave = (tabela === 'responsaveis' || tabela === 'brincantes') ? 'cod' : 'id';

  if (!registro[chave]) {
    // novo registro
    registro[chave] = COD_PREFIX[tabela] ? proximoCod(s, tabela) : gerarId(tabela);
    arr.push(registro);
  } else {
    const i = arr.findIndex(x => x[chave] === registro[chave]);
    if (i >= 0) arr[i] = Object.assign(arr[i], registro); else arr.push(registro);
  }
  gravarEstado(s);
  return { ok: true, registro };
}

function remover(tabela, id, usuario) {
  if (!podeEscrever(usuario, tabela)) return { ok: false, erro: 'sem permissão' };
  const s = lerEstado();
  const chave = (tabela === 'responsaveis' || tabela === 'brincantes') ? 'cod' : 'id';
  s[tabela] = (s[tabela] || []).filter(x => x[chave] !== id);
  gravarEstado(s);
  return { ok: true };
}

function gerarId(tabela) {
  return tabela.slice(0, 3).toUpperCase() + '-' + new Date().getTime().toString(36) +
         Math.random().toString(36).slice(2, 5);
}

/* ============================================================
   REGRA: CONVERSÃO DE SALDO (Colônia turno 4h ↔ Contraturno hora)
   Proporcional ao PREÇO DE TABELA (param_pacotes vem do frontend em payload).
   Gera 2 movimentos ligados por id_conversao + 1 registro em conversoes_saldo.
   ============================================================ */
function converterSaldo(p, usuario) {
  // p = { cod_responsavel, origem, destino, qtde_origem,
  //       preco_unit_origem, preco_unit_destino }
  if (!podeEscrever(usuario, 'movimentos')) return { ok: false, erro: 'sem permissão' };
  if (!p.preco_unit_origem || !p.preco_unit_destino)
    return { ok: false, erro: 'preços unitários obrigatórios' };

  const valorReais = +(p.qtde_origem * p.preco_unit_origem).toFixed(2);
  const qtdeDestino = +(valorReais / p.preco_unit_destino).toFixed(2);
  const idConv = gerarId('conversoes_saldo');
  const hoje = new Date().toISOString().slice(0, 10);
  const s = lerEstado();

  // baixa na origem (movimento Realizado negativo = consumo do saldo convertido)
  s.movimentos.push({ id: gerarId('movimentos'), data: hoje, cod_responsavel: p.cod_responsavel,
    programa: p.origem, tipo_entrada: 'Realizado', qtde: -Math.abs(p.qtde_origem),
    valor: -valorReais, id_conversao: idConv, observacoes: 'Conversão → ' + p.destino });
  // crédito no destino (Contratado positivo)
  s.movimentos.push({ id: gerarId('movimentos'), data: hoje, cod_responsavel: p.cod_responsavel,
    programa: p.destino, tipo_entrada: 'Contratado', qtde: qtdeDestino,
    valor: valorReais, id_conversao: idConv, observacoes: 'Conversão ← ' + p.origem });
  // registro auditável da conversão
  s.conversoes_saldo.push({ id: idConv, data: hoje, cod_responsavel: p.cod_responsavel,
    programa_origem: p.origem, qtde_origem: p.qtde_origem,
    programa_destino: p.destino, qtde_destino: qtdeDestino, valor_reais: valorReais,
    preco_unit_origem: p.preco_unit_origem, preco_unit_destino: p.preco_unit_destino });

  gravarEstado(s); gerarAbasLegiveis(s);
  return { ok: true, id_conversao: idConv, qtde_destino: qtdeDestino, valor_reais: valorReais };
}

/* ============================================================
   REGRA: PAGAR ESCALA → gera Saída no fluxo_caixa
   ============================================================ */
function pagarEscala(ids, usuario) {
  if (!podeEscrever(usuario, 'escalas')) return { ok: false, erro: 'sem permissão' };
  const s = lerEstado();
  const hoje = new Date().toISOString().slice(0, 10);
  const porBrincante = {};

  (ids || []).forEach(id => {
    const esc = s.escalas.find(e => e.id === id);
    if (!esc || esc.status_pgto === 'Pago') return;
    esc.status_pgto = 'Pago'; esc.data_pgto = hoje;
    (porBrincante[esc.cod_brincante] = porBrincante[esc.cod_brincante] || { nome: esc.nome_brincante, itens: [], total: 0 });
    porBrincante[esc.cod_brincante].itens.push(esc);
    porBrincante[esc.cod_brincante].total += (+esc.valor || 0);
  });

  // um lançamento no fluxo por brincante pago
  Object.keys(porBrincante).forEach(cod => {
    const g = porBrincante[cod];
    const idFluxo = gerarId('fluxo_caixa');
    const resumo = g.itens.map(i => i.tipo_dia).reduce((a, d) => (a[d] = (a[d] || 0) + 1, a), {});
    const desc = Object.entries(resumo).map(([d, n]) => n + ' ' + d).join(' + ');
    s.fluxo_caixa.push({ id: idFluxo, data: hoje,
      mes: new Date().getMonth() + 1, ano: new Date().getFullYear(),
      fluxo: 'Saída', grupo: 'Despesa com Pessoal', conta_contabil: 'Brincantes/Escala',
      detalhamento: g.nome + ' — ' + desc, valor: +g.total.toFixed(2),
      cod_responsavel: '', observacoes: 'Pagamento de escala (brincante ' + cod + ')' });
    g.itens.forEach(i => i.id_fluxo = idFluxo);
  });

  gravarEstado(s); gerarAbasLegiveis(s);
  return { ok: true, brincantes_pagos: Object.keys(porBrincante).length };
}

/* ============================================================
   ABAS LEGÍVEIS (consulta humana; banco real é a _db)
   ============================================================ */
function gerarAbasLegiveis(s) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  escreverAba(ss, 'v_responsaveis',
    ['COD','CPF','Nome','Telefone','Cidade/UF','Status'],
    (s.responsaveis || []).map(r => [r.cod, r.cpf, r.nome, r.telefone,
      (r.cidade ? r.cidade + '/' + (r.uf || '') : ''), r.status]));

  escreverAba(ss, 'v_criancas',
    ['ID','Responsável (COD)','Nome','Nascimento','Escola','Turno'],
    (s.criancas || []).map(c => [c.id_crianca, c.cod_responsavel, c.nome, c.nascimento, c.escola, c.turno_escola]));

  // Saldo consolidado por responsável + programa
  const saldo = {};
  (s.movimentos || []).forEach(m => {
    const k = m.cod_responsavel + '|' + m.programa;
    saldo[k] = (saldo[k] || 0) + (+m.qtde || 0);
  });
  escreverAba(ss, 'v_saldos',
    ['Responsável (COD)','Programa','Saldo (h/turno)'],
    Object.keys(saldo).map(k => [k.split('|')[0], k.split('|')[1], +saldo[k].toFixed(2)]));

  escreverAba(ss, 'v_festinhas',
    ['Nº','Código','Status','Aniversariante','Data Festa','Turno','Modelo','Valor'],
    (s.festinhas || []).map(f => [f.festa_no, f.codigo_festa, f.status, f.aniversariante,
      f.data_festa, f.turno, f.modelo_festa, f.valor_total]));

  escreverAba(ss, 'v_escalas',
    ['Data','Tipo Dia','Brincante','Função','Valor','Status','Pago em'],
    (s.escalas || []).map(e => [e.data, e.tipo_dia, e.nome_brincante, e.funcao, e.valor, e.status_pgto, e.data_pgto]));

  escreverAba(ss, 'v_fluxo',
    ['Data','Fluxo','Grupo','Conta','Detalhamento','Valor','Conta Banc.'],
    (s.fluxo_caixa || []).slice(-500).map(f => [f.data, f.fluxo, f.grupo, f.conta_contabil,
      f.detalhamento, f.valor, f.conta]));
}

function escreverAba(ss, nome, cabecalho, linhas) {
  const sh = ss.getSheetByName(nome) || ss.insertSheet(nome);
  sh.clearContents();
  sh.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]).setFontWeight('bold');
  if (linhas.length) sh.getRange(2, 1, linhas.length, cabecalho.length).setValues(linhas);
}


/* ============================================================
   GESTÃO DE USUÁRIOS (via módulo Admin) — só admin
   ============================================================ */
function saveUsuario(alvo, novaSenha, usuario) {
  if (!usuario || usuario.role !== 'admin') return { ok: false, erro: 'só admin' };
  if (!alvo || !alvo.login) return { ok: false, erro: 'login obrigatório' };
  const s = lerEstado();
  let u = s.usuarios.find(x => x.login === alvo.login);
  if (!u) { u = { login: alvo.login }; s.usuarios.push(u); }
  u.nome = alvo.nome || u.nome || '';
  u.role = alvo.role || 'operador';
  u.modulos = alvo.modulos || '';
  u.ativo = alvo.ativo || 'sim';
  if (novaSenha) u.senhaHash = hash(novaSenha);
  gravarEstado(s);
  return { ok: true };
}

function deleteUsuario(login, usuario) {
  if (!usuario || usuario.role !== 'admin') return { ok: false, erro: 'só admin' };
  const s = lerEstado();
  s.usuarios = (s.usuarios || []).filter(x => x.login !== login);
  gravarEstado(s);
  return { ok: true };
}

/* ============================================================
   UTILITÁRIO DE SETUP — cria o admin inicial (rode uma vez no editor)
   Selecione "criarAdminInicial" no seletor de função e Executar.
   ============================================================ */
function criarAdminInicial() {
  const s = lerEstado();
  const login = 'roni';                 // troque
  const senha = 'MUDE_ESTA_SENHA_123';  // troque; será guardada como hash
  if (!s.usuarios.find(u => u.login === login)) {
    s.usuarios.push({ login: login, nome: 'Roni (Admin)', role: 'admin',
      modulos: 'cadastro,fluxo,contraturno,colonia,festinha,brincantes,folha,admin',
      empresas: '', ativo: 'sim', senhaHash: hash(senha) });
    gravarEstado(s);
    Logger.log('Admin criado: ' + login + ' | senha: ' + senha + ' (troque depois)');
  } else {
    Logger.log('Usuário já existe.');
  }
}
