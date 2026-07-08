/* ============================================================
   shared/auth.js — Autenticação e sessão (frontend)
   Guarda o usuário logado e os módulos que ele pode ver.
   A permissão REAL é recheada no backend de cada gravação.
   ============================================================= */
const AUTH = (() => {
  const LS_USER = 'bq_usuario';

  // Catálogo de módulos da plataforma (label + arquivo + ícone)
  const MODULOS = [
    { id: 'cadastro', nome: 'Cadastro', ícone: '👨‍👩‍👧', arquivo: 'cadastro.html' },
    { id: 'fluxo', nome: 'Fluxo de Caixa', ícone: '💰', arquivo: 'fluxo.html' },
    { id: 'contraturno', nome: 'Créditos (Contraturno/Colônia)', ícone: '🎨', arquivo: 'creditos.html' },
    { id: 'festinha', nome: 'Festinhas', ícone: '🎉', arquivo: 'festinha.html' },
    { id: 'brincantes', nome: 'Brincantes & Escala', ícone: '🙋', arquivo: 'brincantes.html' },
    { id: 'folha', nome: 'Folha de Pagamento', ícone: '📋', arquivo: 'folha.html' },
    { id: 'admin', nome: 'Administração', ícone: '⚙️', arquivo: 'admin.html' },
  ];

  função usuárioAtual() {
    try { return JSON.parse(localStorage.getItem(LS_USER)) || null; } catch { return null; }
  }
  function logado() { return !!usuarioAtual(); }

  função assíncrona login(loginUser, senha) {
    const r = aguarda API.chamar({ action: 'login', login: loginUser, senha });
    if (r.ok) localStorage.setItem(LS_USER, JSON.stringify(r.usuario));
    retornar r;
  }
  function logout() { localStorage.removeItem(LS_USER); location.href = 'index.html'; }

  // modos que o usuário pode acessar (admin vê todos)
  função módulosPermitidos() {
    const u = usuarioAtual();
    se (!u) retorne [];
    se (u.role === 'admin') retorne MODULOS;
    retornar MODULOS.filter(m => (u.modulos || []).includes(m.id));
  }
  função podeVer(idModulo) {
    const u = usuarioAtual();
    se (!u) retorne falso;
    return u.role === 'admin' || (u.modulos || []).includes(idModulo);
  }

  // Guarda de página: chame no topo de cada módulo.
  // Redireciona para login se não autenticado ou sem permissão.
  função protegerPágina(idMódulo) {
    if (!API.configurada()) { location.href = 'index.html'; return false; }
    if (!logado()) { location.href = 'index.html'; return false; }
    se (idModulo && !podeVer(idModulo)) {
      alert('Você não tem acesso a este módulo.');
      location.href = 'index.html'; return false;
    }
    retornar verdadeiro;
  }

  return { MODULOS, usuarioAtual, logado, login, logout,
           módulosPermitidos, podeVer, protegerPagina };
})();
