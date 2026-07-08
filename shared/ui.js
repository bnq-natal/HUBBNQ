/* ============================================================
   shared/ui.js — Helpers de interface compartilhados
   v2: header com MENU FIXO (navegação entre módulos sem voltar
   ao index) + autocomplete de pessoas.
   ============================================================ */
const UI = (() => {
  const fmtBRL = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtNum = v => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const esc = s => String(s ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const hoje = () => new Date().toISOString().slice(0, 10);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // Cabeçalho com MENU FIXO de módulos (troca de módulo sem passar pelo index)
  function montarHeader(tituloModulo) {
    const u = AUTH.usuarioAtual();
    const mods = AUTH.modulosPermitidos();
    const arqAtual = location.pathname.split('/').pop();
    const links = mods.map(m => {
      const ativo = m.arquivo === arqAtual;
      return `<a href="${m.arquivo}" class="px-2.5 py-1.5 rounded text-xs whitespace-nowrap ${ativo ? 'bg-blue-700 text-white' : 'text-slate-300 hover:bg-slate-700'}">${m.icone} ${m.nome}</a>`;
    }).join('');
    const el = document.createElement('header');
    el.className = 'bg-slate-900 text-white shadow sticky top-0 z-40';
    el.innerHTML = `
      <div class="max-w-7xl mx-auto px-4 py-2">
        <div class="flex items-center justify-between gap-2">
          <h1 class="text-base font-bold tracking-tight whitespace-nowrap">${esc(tituloModulo)}</h1>
          <div class="flex items-center gap-3 text-sm">
            <span id="syncStatus" class="text-xs text-slate-400">☁</span>
            <span class="text-slate-300 text-xs hidden sm:inline">${esc(u ? u.nome : '')}</span>
            <button onclick="AUTH.logout()" class="bg-slate-700 hover:bg-slate-600 px-2.5 py-1 rounded text-xs">Sair</button>
          </div>
        </div>
        <nav class="flex gap-1 mt-1.5 overflow-x-auto pb-1">${links}</nav>
      </div>`;
    document.body.prepend(el);
  }

  function setSync(txt, cor) {
    const el = document.getElementById('syncStatus');
    if (el) { el.textContent = txt; el.className = 'text-xs ' + (cor || 'text-slate-400'); }
  }
  const syncOk   = () => setSync('☁ salvo ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), 'text-green-400');
  const syncBusy = () => setSync('⟳ sincronizando…', 'text-amber-300');
  const syncErr  = () => setSync('⚠ offline (local)', 'text-red-400');

  function toast(msg, tipo = 'info') {
    const cores = { info: 'bg-slate-800', ok: 'bg-green-700', erro: 'bg-red-700' };
    const t = document.createElement('div');
    t.className = `fixed bottom-4 right-4 ${cores[tipo]} text-white px-4 py-2 rounded shadow-lg z-[60] text-sm`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  function modal(html, maxW = 'max-w-2xl') {
    fecharModal();
    const wrap = document.createElement('div');
    wrap.id = 'uiModal';
    wrap.className = 'fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto';
    wrap.innerHTML = `<div class="bg-white rounded-lg shadow-xl w-full ${maxW} my-8">${html}</div>`;
    wrap.addEventListener('click', e => { if (e.target.id === 'uiModal') fecharModal(); });
    document.body.appendChild(wrap);
  }
  function fecharModal() { const m = document.getElementById('uiModal'); if (m) m.remove(); }

  function opcoes(lista, selecionado) {
    return (lista || []).map(v => {
      const val = typeof v === 'object' ? (v.nome || v.formato || v.funcao) : v;
      return `<option value="${esc(val)}" ${val === selecionado ? 'selected' : ''}>${esc(val)}</option>`;
    }).join('');
  }

  /* ---------- AUTOCOMPLETE de pessoas (criança/responsável) ----------
     Cria um campo de busca que filtra conforme digita e devolve o item
     escolhido via callback. Uso:
       UI.autocomplete(containerEl, itens, {
         placeholder:'buscar criança…',
         label: it => it.nome,
         sub:   it => it.cod,
         onPick: it => { ... }
       });
  ------------------------------------------------------------------- */
  function autocomplete(container, itens, opts) {
    const ph = opts.placeholder || 'buscar…';
    const label = opts.label || (x => x.nome || '');
    const sub = opts.sub || (() => '');
    container.innerHTML = `
      <input type="text" class="fld ac-input" placeholder="${esc(ph)}" autocomplete="off">
      <div class="ac-list border border-slate-200 rounded mt-1 bg-white shadow max-h-52 overflow-y-auto hidden"></div>`;
    const input = container.querySelector('.ac-input');
    const list = container.querySelector('.ac-list');
    let escolhido = null;

    function filtra() {
      const q = input.value.toLowerCase().trim();
      if (!q) { list.classList.add('hidden'); return; }
      const res = itens.filter(it => label(it).toLowerCase().includes(q) || String(sub(it)).toLowerCase().includes(q)).slice(0, 30);
      list.innerHTML = res.length ? res.map((it, i) =>
        `<div class="ac-item px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer border-b border-slate-50" data-i="${i}">
           <b>${esc(label(it))}</b> <span class="text-xs text-slate-400">${esc(sub(it))}</span></div>`
      ).join('') : '<div class="px-3 py-2 text-sm text-slate-400">nenhum resultado</div>';
      list.classList.remove('hidden');
      list.querySelectorAll('.ac-item').forEach(el => el.onclick = () => {
        escolhido = res[+el.dataset.i];
        input.value = label(escolhido);
        list.classList.add('hidden');
        opts.onPick && opts.onPick(escolhido);
      });
    }
    input.addEventListener('input', () => { escolhido = null; filtra(); });
    input.addEventListener('focus', filtra);
    document.addEventListener('click', e => { if (!container.contains(e.target)) list.classList.add('hidden'); });
    return { get: () => escolhido, clear: () => { input.value = ''; escolhido = null; } };
  }

  return { fmtBRL, fmtNum, esc, hoje, uid, montarHeader, setSync,
           syncOk, syncBusy, syncErr, toast, modal, fecharModal, opcoes, autocomplete };
})();
