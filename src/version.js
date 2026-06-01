/**
 * version.js — fonte de verdade do versionamento semântico do Orpen URA Builder.
 *
 * Para incrementar a versão, use o script de conveniência:
 *   npm run version:patch "Descrição da correção"
 *   npm run version:minor "Descrição da feature"
 *   npm run version:major "Descrição da mudança arquitetural"
 *
 * Regras SemVer:
 *   MAJOR — mudança arquitetural incompatível (quebra projetos salvos, formato de dados)
 *   MINOR — nova funcionalidade sem quebrar o existente
 *   PATCH — correção de bug ou melhoria pequena
 */

export const VERSION = {
  major: 0,
  minor: 9,
  patch: 0,
  label: 'beta',
  buildDate: '2026-06-01',
  changelog: [
    {
      version: '0.9.0',
      date: '2026-06-01',
      changes: [
        '+ Canvas visual com React Flow — nós, edges e contextos',
        '+ Pipeline de importação de .conf em 5 fases (Lexer → Mapper → Resolver → Layout → Builder)',
        '+ Compilador com validação de round-trip e injeção inline de opções DTMF',
        '+ Suporte a MenuNode com regra seletiva inline vs ContextNode',
        '+ IntegrationBlock — bloco composto Set + AGI + destino',
        '+ Três temas: Hacking (matrix), Orpen e Dark',
        '+ Dois modos: PRO e Amigável',
        '+ Persistência via IndexedDB — projetos e layouts separados',
        '+ Auto-arranjo de ContextNodes com detecção de colisão',
        '+ Exportação de .conf e .layout.json separados',
        '+ Barra de contextos com navegação e filtro',
        '+ Painel de ordenação de exportação (exportOrder)',
        '+ Suporte a include =>, ExecIfTime, SIPAddHeader, Queue com opções',
        '+ Dropdown de códigos de causa SIP no NóHangup',
        '+ Background multi-arquivo com separador &',
        '+ Sistema de versionamento semântico com changelog',
      ],
    },
  ],
};

export const VERSION_STRING = `${VERSION.major}.${VERSION.minor}.${VERSION.patch}${VERSION.label ? '-' + VERSION.label : ''}`;
