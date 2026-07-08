/* ============================================================
   shared/ui.js — Helpers de interface compartilhados
   Formatação BR, cabeçalho padrão, toast, modal, status de sync.
   ============================================================ */
const UI = (() => {
  const fmtBRL = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtNum = v => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const esc = s => String(s ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const hoje = () => new Date().toISOString().slice(0, 10);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // Cabeçalho padrão com nome do módulo, usuário e status de sync
  function montarHeader(tituloModulo) {
    const u = AUTH.usuarioAtual();
    const el = document.createElement('header');
    el.className = 'bg-slate-900 text-white shadow';
    el.innerHTML = `
      <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-2">
        <div class="flex items-center gap-3">
          <a href="index.html" class="text-slate-300 hover:text-white text-sm">← Módulos</a>
          <div>
            <h1 class="text-lg font-bold tracking-tight">${esc(tituloModulo)}</h1>
            <p class="text-xs text-slate-400">Brincar no Quintal · <span id="syncStatus">☁ carregando…</span></p>
          </div>
        </div>
        <div class="flex items-center gap-3 text-sm">
          <span class="text-slate-300">${esc(u ? u.nome : '')}</span>
          <button onclick="AUTH.logout()" class="bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded text-xs">Sair</button>
        </div>
      </div>`;
    document.body.prepend(el);
  }

  function setSync(txt, cor) {
    const el = document.getElementById('syncStatus');
    if (el) { el.textContent = txt; el.className = cor || 'text-slate-400'; }
  }
  const syncOk   = () => setSync('☁ salvo ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), 'text-green-400');
  const syncBusy = () => setSync('⟳ sincronizando…', 'text-amber-300');
  const syncErr  = () => setSync('⚠ offline (dados locais)', 'text-red-400');

  // Toast simples
  function toast(msg, tipo = 'info') {
    const cores = { info: 'bg-slate-800', ok: 'bg-green-700', erro: 'bg-red-700' };
    const t = document.createElement('div');
    t.className = `fixed bottom-4 right-4 ${cores[tipo]} text-white px-4 py-2 rounded shadow-lg z-[60] text-sm`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  // Modal genérico (conteúdo HTML)
  function modal(html, maxW = 'max-w-2xl') {
    fecharModal();
    const wrap = document.createElement('div');
    wrap.id = 'uiModal';
    wrap.className = 'fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto';
    wrap.innerHTML = `<div class="bg-white rounded-lg shadow-xl w-full ${maxW} my-8">${html}</div>`;
    wrap.addEventListener('click', e => { if (e.target.id === 'uiModal') fecharModal(); });
    document.body.appendChild(wrap);
  }
  function fecharModal() { document.getElementById('uiModal')?.remove(); }

  // Helpers de <select> a partir de listas de parâmetros
  function opcoes(lista, selecionado) {
    return (lista || []).map(v => {
      const val = typeof v === 'object' ? (v.nome || v.formato || v.funcao) : v;
      return `<option value="${esc(val)}" ${val === selecionado ? 'selected' : ''}>${esc(val)}</option>`;
    }).join('');
  }

  return { fmtBRL, fmtNum, esc, hoje, uid, montarHeader, setSync,
           syncOk, syncBusy, syncErr, toast, modal, fecharModal, opcoes };
})();
