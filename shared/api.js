/* ============================================================
   shared/api.js — Camada de acesso ao backend (Apps Script)
   Usada por TODOS os módulos. Concentra: config nuvem, token,
   chamadas, e cache local (localStorage) com sincronização.
   ============================================================ */
const API = (() => {
  const LS_STATE = 'bq_state';       // cache do banco
  const LS_URL   = 'bq_apiUrl';      // URL do Web App (por dispositivo)
  const LS_TOKEN = 'bq_appToken';    // token de app (por dispositivo)

  let state = null;                  // banco em memória
  let syncTimer = null;

  const cfg = () => ({ url: localStorage.getItem(LS_URL) || '',
                       token: localStorage.getItem(LS_TOKEN) || '' });
  const configurada = () => { const c = cfg(); return !!(c.url && c.token); };

  function salvarConfig(url, token) {
    localStorage.setItem(LS_URL, url.trim());
    localStorage.setItem(LS_TOKEN, token.trim());
  }

  // POST texto simples (evita preflight CORS no Apps Script)
  async function chamar(payload) {
    const c = cfg();
    if (!c.url) throw new Error('Backend não configurado');
    const resp = await fetch(c.url, { method: 'POST',
      body: JSON.stringify({ ...payload, token: c.token }) });
    return resp.json();
  }

  // ---- Estado local (cache) ----
  function carregarLocal() {
    try { state = JSON.parse(localStorage.getItem(LS_STATE)) || null; } catch { state = null; }
    return state;
  }
  function gravarLocal() { localStorage.setItem(LS_STATE, JSON.stringify(state)); }
  function get() { return state; }
  function tabela(nome) { return (state && state[nome]) || []; }

  // ---- Sincronização ----
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

  // Debounce: várias edições viram 1 gravação
  function agendarEnvio(cb) {
    gravarLocal();
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      try { await enviar(); cb && cb(true); }
      catch (e) { cb && cb(false, e.message); }
    }, 1200);
  }

  // ---- Operações de alto nível (usadas pelos módulos) ----
  // upsert local + sincroniza; o backend gera COD para responsaveis/brincantes
  async function upsert(nomeTabela, registro) {
    const usuario = AUTH.usuarioAtual();
    const r = await chamar({ action: 'upsert', tabela: nomeTabela, registro, usuario });
    if (r.ok) { await baixar(); }   // recarrega p/ pegar COD gerado
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
