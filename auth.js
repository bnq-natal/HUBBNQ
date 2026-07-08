/* ============================================================
   shared/auth.js — Autenticação e sessão (frontend)
   Guarda o usuário logado e os módulos que ele pode ver.
   A permissão REAL é rechecada no backend a cada gravação.
   ============================================================ */
const AUTH = (() => {
  const LS_USER = 'bq_usuario';

  // Catálogo de módulos da plataforma (label + arquivo + ícone)
  const MODULOS = [
    { id: 'cadastro',    nome: 'Cadastro',                 icone: '👨‍👩‍👧', arquivo: 'cadastro.html' },
    { id: 'fluxo',       nome: 'Fluxo de Caixa',           icone: '💰', arquivo: 'fluxo.html' },
    { id: 'contraturno', nome: 'Créditos (Contraturno/Colônia)', icone: '🎨', arquivo: 'creditos.html' },
    { id: 'festinha',    nome: 'Festinhas',                icone: '🎉', arquivo: 'festinha.html' },
    { id: 'brincantes',  nome: 'Brincantes & Escala',      icone: '🙋', arquivo: 'brincantes.html' },
    { id: 'folha',       nome: 'Folha de Pagamento',       icone: '📋', arquivo: 'folha.html' },
    { id: 'admin',       nome: 'Administração',            icone: '⚙️', arquivo: 'admin.html' },
  ];

  function usuarioAtual() {
    try { return JSON.parse(localStorage.getItem(LS_USER)) || null; } catch { return null; }
  }
  function logado() { return !!usuarioAtual(); }

  async function login(loginUser, senha) {
    const r = await API.chamar({ action: 'login', login: loginUser, senha });
    if (r.ok) localStorage.setItem(LS_USER, JSON.stringify(r.usuario));
    return r;
  }
  function logout() { localStorage.removeItem(LS_USER); location.href = 'index.html'; }

  // módulos que o usuário pode acessar (admin vê todos)
  function modulosPermitidos() {
    const u = usuarioAtual();
    if (!u) return [];
    if (u.role === 'admin') return MODULOS;
    return MODULOS.filter(m => (u.modulos || []).includes(m.id));
  }
  function podeVer(idModulo) {
    const u = usuarioAtual();
    if (!u) return false;
    return u.role === 'admin' || (u.modulos || []).includes(idModulo);
  }

  // Guarda de página: chame no topo de cada módulo.
  // Redireciona para login se não autenticado ou sem permissão.
  function protegerPagina(idModulo) {
    if (!API.configurada()) { location.href = 'index.html'; return false; }
    if (!logado()) { location.href = 'index.html'; return false; }
    if (idModulo && !podeVer(idModulo)) {
      alert('Você não tem acesso a este módulo.');
      location.href = 'index.html'; return false;
    }
    return true;
  }

  return { MODULOS, usuarioAtual, logado, login, logout,
           modulosPermitidos, podeVer, protegerPagina };
})();
