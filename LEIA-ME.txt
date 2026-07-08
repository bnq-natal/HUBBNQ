BRINCAR NO QUINTAL — Plataforma de Gestão (casca + camada compartilhada)
========================================================================

ESTRUTURA (suba tudo mantendo as pastas no repositório):

  index.html            → login + configuração + menu de módulos
  shared/
    api.js              → comunicação com o backend (Apps Script)
    auth.js             → login, sessão, permissões de módulo
    ui.js               → helpers visuais (formatação, modal, toast)

COMO USAR:
1. Backend: crie uma planilha nova, cole o Code_v2.gs no Apps Script,
   troque o TOKEN, implante como App da Web (Executar como: Eu |
   Acesso: Qualquer pessoa). Rode a função criarAdminInicial uma vez.
2. GitHub: crie o repositório "brincar-quintal" (pode ser o mesmo
   padrão do folha-control) e suba index.html + a pasta shared/.
   Ative o GitHub Pages (branch main / root).
3. Acesse o site: na 1ª vez pede URL do Web App + token (ficam só no
   dispositivo). Depois faça login com o admin criado.

PRÓXIMOS MÓDULOS (a construir): cadastro.html, fluxo.html,
creditos.html (contraturno+colônia), festinha.html, brincantes.html,
admin.html, folha.html (migração do folha-control atual).

Cada módulo incluirá os 3 shared/ e chamará AUTH.protegerPagina('id')
no topo — quem não tem permissão é redirecionado para o index.
