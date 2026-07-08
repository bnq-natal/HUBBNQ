/* ============================================================
   shared/api.js — Camada de acesso ao backend (Apps Script)
   v2: redirect:'follow' no fetch para evitar o echo redirect do GAS
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

  // redirect:'follow' é obrigatório — o Apps Script faz redirect antes de responder
  async function chamar(payload) {
    const c = cfg();
    if (!c.url) throw new Error('Backend não configurado');
    const resp = await fetch(c.url, {
      method: 'POST',
      redirect: 'follow',
      body: JSON.stringify({ ...payload, token: c.token })
    });
    const txt = await resp.text();
    try { return JSON.parse(txt); }
    catch (e) { throw new Error('Resposta inválida do backend: ' + txt.slice(0, 120)); }
  }

  function carregarLocal() {
    try { state = JSON.parse(localStorage.getItem(LS_STATE)) || null; } catch { state = null; }
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

  async function upsert(nomeTabela, registro) {
    const usuario = AUTH.usuarioAtual();
    const r = await chamar({ action: 'upsert', tabela: nomeTabela, registro, usuario });
    if (r.ok) await baixar();
    return r;
  }
  async function remover(nomeTabela, id) {
    const usuario = AUTH.usuarioAtual();
    const r = await chamar({ action: 'delete', tabela: nomeTabela, id, usuario });
    if (r.ok) await baixar();
    return r;
  }
  async function converterSaldo(payload) {
    const usuario = AUTH.usuarioAtual();
    const r = await chamar({ action: 'converter_saldo', payload, usuario });
    if (r.ok) await baixar();
    return r;
  }
  async function pagarEscala(ids) {
    const usuario = AUTH.usuarioAtual();
    const r = await chamar({ action: 'pagar_escala', ids, usuario });
    if (r.ok) await baixar();
    return r;
  }

  return { cfg, configurada, salvarConfig, chamar, carregarLocal, gravarLocal,
           get, tabela, baixar, enviar, agendarEnvio, upsert, remover,
           converterSaldo, pagarEscala };
})();
