/* ============================================================
   shared/api.js — Camada de acesso ao backend (Apps Script)
   v3: upsert otimizado (sem baixar() redundante). Atualiza o
   state local com o registro devolvido pelo backend. Rápido.
   ============================================================ */
const API = (() => {
  const LS_STATE = 'bq_state';
  const LS_URL   = 'bq_apiUrl';
  const LS_TOKEN = 'bq_appToken';

  let state = null;
  let syncTimer = null;

  const cfg = () => ({ url: localStorage.getItem(LS_URL) || '',
                       token: localStorage.getItem(LS_TOKEN) || '' });
  const configurada = () => { const c = cfg(); return !!(c.url && c.token); };

  function salvarConfig(url, token) {
    localStorage.setItem(LS_URL, url.trim());
    localStorage.setItem(LS_TOKEN, token.trim());
  }

  async function chamar(payload) {
    const c = cfg();
    if (!c.url) throw new Error('Backend não configurado');
    const resp = await fetch(c.url, {
      method: 'POST', redirect: 'follow',
      body: JSON.stringify({ ...payload, token: c.token })
    });
    const txt = await resp.text();
    try { return JSON.parse(txt); }
    catch (e) { throw new Error('Resposta inválida do backend: ' + txt.slice(0, 120)); }
  }

  function carregarLocal() {
    try { state = JSON.parse(localStorage.getItem(LS_STATE)) || null; } catch { state = null; }
    if (!state) state = {};
    return state;
  }
  function gravarLocal() { localStorage.setItem(LS_STATE, JSON.stringify(state)); }
  function get() { return state; }
  function tabela(nome) { return (state && state[nome]) || []; }

  async function baixar() {
    const r = await chamar({ action: 'load' });
    if (r.ok && r.state) { state = r.state; gravarLocal(); return state; }
    if (r.ok && !r.state) { state = state || {}; return state; }
    throw new Error(r.erro || 'falha ao carregar');
  }

  async function enviar() {
    if (!configurada() || !state) return;
    const usuario = AUTH.usuarioAtual();
    const r = await chamar({ action: 'save', state, usuario });
    if (!r.ok) throw new Error(r.erro || 'falha ao salvar');
    return r;
  }

  function agendarEnvio(cb) {
    gravarLocal();
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      try { await enviar(); cb && cb(true); }
      catch (e) { cb && cb(false, e.message); }
    }, 1200);
  }

  // aplica o registro devolvido pelo backend direto no state local (sem baixar tudo)
  function aplicarLocal(nomeTabela, registro) {
    if (!state[nomeTabela]) state[nomeTabela] = [];
    const arr = state[nomeTabela];
    const chave = (nomeTabela === 'responsaveis' || nomeTabela === 'brincantes') ? 'cod' : 'id';
    const i = arr.findIndex(x => x[chave] === registro[chave]);
    if (i >= 0) arr[i] = { ...arr[i], ...registro }; else arr.push(registro);
    gravarLocal();
  }

  async function upsert(nomeTabela, registro) {
    const usuario = AUTH.usuarioAtual();
    const r = await chamar({ action: 'upsert', tabela: nomeTabela, registro, usuario });
    if (r.ok && r.registro) aplicarLocal(nomeTabela, r.registro); // 1 viagem só
    return r;
  }
  async function remover(nomeTabela, id) {
    const usuario = AUTH.usuarioAtual();
    const r = await chamar({ action: 'delete', tabela: nomeTabela, id, usuario });
    if (r.ok) {
      const chave = (nomeTabela === 'responsaveis' || nomeTabela === 'brincantes') ? 'cod' : 'id';
      state[nomeTabela] = (state[nomeTabela] || []).filter(x => x[chave] !== id);
      gravarLocal();
    }
    return r;
  }
  async function converterSaldo(payload) {
    const usuario = AUTH.usuarioAtual();
    const r = await chamar({ action: 'converter_saldo', payload, usuario });
    if (r.ok) await baixar(); // conversão mexe em vários registros: recarrega
    return r;
  }
  async function pagarEscala(ids) {
    const usuario = AUTH.usuarioAtual();
    const r = await chamar({ action: 'pagar_escala', ids, usuario });
    if (r.ok) await baixar(); // pagamento gera fluxo + marca escalas: recarrega
    return r;
  }


  // cache-first: devolve o estado local imediatamente e sincroniza em segundo plano
  async function abrirRapido(aoAtualizar) {
    carregarLocal();               // instantâneo (localStorage)
    // sincroniza atrás sem travar a tela
    baixar().then(() => aoAtualizar && aoAtualizar(true))
            .catch(() => aoAtualizar && aoAtualizar(false));
    return state;
  }

  return { cfg, configurada, salvarConfig, chamar, carregarLocal, gravarLocal,
           get, tabela, baixar, enviar, agendarEnvio, aplicarLocal, upsert, remover,
           converterSaldo, pagarEscala, abrirRapido };
})();
