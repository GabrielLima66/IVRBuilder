import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import {
  Settings, LayoutList, Clock, FolderTree, Navigation,
  CornerDownRight, Undo2, Scissors,
  Terminal, Boxes, GitBranch, TimerReset, MessageSquare, Megaphone,
  Keyboard, ListOrdered, Hash, Disc, Square, Eye,
  PhoneCall, Timer, Play,
  Pen, GitFork, PhoneOutgoing, Volume2, Hourglass, Layers,
  Link2, Tag,
} from 'lucide-react';
import { NODE_TAGS } from '../../config/nodeTags';
import { useThemeContext } from '../../contexts/ThemeContext';
import { resolveNodeColor } from '../../utils/nodeColors';
import { useModeContext } from '../../contexts/ModeContext';
import { NODE_MODE_CONFIG, CATEGORY_LABELS_AMIGAVEL } from '../../config/nodeModeConfig';

// Chave no localStorage para persistir o estado colapsado das categorias
const STORAGE_KEY = 'orpen-sidebar-collapsed';

// ── Utilidade de normalização ────────────────────────────────────────────────
// Remove acentos e converte para minúsculo para comparação robusta.
// "validacao" bate com "validação", "audio" bate com "áudio", etc.
function normalize(str) {
  return String(str)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// ── Pontuação de relevância por item ─────────────────────────────────────────
// Retorna 0 (sem match) a 4 (match exato no título).
// Itens com score > 0 aparecem nos resultados, ordenados do maior para o menor.
function scoreItem(item, nq /* query já normalizada */) {
  const title = normalize(item.title);
  const desc  = normalize(item.desc);
  const type  = normalize(item.type);
  const tags  = (NODE_TAGS[item.type] || []).map(normalize);

  if (title === nq)                        return 4; // match exato no título
  if (title.includes(nq))                  return 3; // título contém o termo
  if (desc.includes(nq) || type.includes(nq)) return 2; // desc ou type contém
  if (tags.some((t) => t.includes(nq)))    return 1; // tag semântica contém
  return 0;
}

const CATEGORIES = [
  {
    label: 'CONTAINERS',
    items: [
      { type: 'context', title: 'CONTEXT BOX',    desc: '[contexto] · agrupa nós filhos',    accent: '#00ff41', Icon: FolderTree },
    ],
  },
  {
    label: 'ESTRUTURA',
    items: [
      { type: 'config',  title: 'CONFIG / START', desc: '__IVR · SOUND_PATH · AGI_PATH',          accent: '#00ff41', Icon: Settings },
      { type: 'menu',    title: 'MENU DTMF',      desc: 'Background + WaitExten + dígitos DTMF',  accent: '#00ff41', Icon: LayoutList },
      { type: 'time',    title: 'TIME COND',      desc: 'GotoIfTime · horário/dias/meses',         accent: '#ffcc00', Icon: Clock },
      { type: 'route',   title: 'DESTINO / ROTA', desc: 'Goto · Queue · Macro+Transfer',           accent: '#ff8c00', Icon: Navigation },
      { type: 'include', title: 'INCLUDE',        desc: 'include => contexto (diretiva final)',    accent: '#00d4ff', Icon: Link2 },
    ],
  },
  {
    label: 'CONTROLE DE FLUXO',
    items: [
      { type: 'gosub',  title: 'GOSUB',   desc: 'Gosub(ctx,ext,pri(args))',   accent: '#00d4ff', Icon: CornerDownRight },
      { type: 'return', title: 'RETURN',  desc: 'Return([value])',            accent: '#00d4ff', Icon: Undo2 },
      { type: 'hangup', title: 'HANGUP',  desc: 'Hangup([cause])',            accent: '#ff5050', Icon: Scissors },
      { type: 'gotoif', title: 'GOTOIF',  desc: 'GotoIf($[expr]?true:false)', accent: '#00d4ff', Icon: GitFork },
    ],
  },
  {
    label: 'EXECUÇÃO LÓGICA',
    items: [
      { type: 'integration', title: 'INTEGRAÇÃO',  desc: 'Set×N + AGI + destino · bloco composto', accent: '#a78bfa', Icon: Layers },
      { type: 'set',        title: 'SET',          desc: 'Set(VAR=valor) · define variável',  accent: '#a78bfa', Icon: Pen },
      { type: 'agi',        title: 'AGI',          desc: 'Agi(${AGI_PATH}/script,args)',       accent: '#a78bfa', Icon: Terminal },
      { type: 'macro',      title: 'MACRO',        desc: 'Macro(nome,param1,param2,...)',      accent: '#a78bfa', Icon: Boxes },
      { type: 'execif',     title: 'EXEC IF',      desc: 'ExecIf($[expr]?app)',               accent: '#a78bfa', Icon: GitBranch },
      { type: 'execiftime', title: 'EXEC IF TIME', desc: 'ExecIfTime(t,d,md,m?app)',          accent: '#a78bfa', Icon: TimerReset },
      { type: 'noop',       title: 'NOOP',         desc: 'Noop(texto debug)',                 accent: '#888888', Icon: MessageSquare },
      { type: 'verbose',    title: 'VERBOSE',      desc: 'Verbose(nivel,msg)',                accent: '#888888', Icon: Megaphone },
    ],
  },
  {
    label: 'INTERAÇÃO & MONITOR',
    items: [
      { type: 'dial',         title: 'DIAL',           desc: 'Dial(SIP/ramal,timeout,opts)',     accent: '#ff8c00', Icon: PhoneOutgoing },
      { type: 'sipaddheader', title: 'SIP ADD HEADER', desc: 'SIPAddHeader(Header: ${VAR})',     accent: '#00d4ff', Icon: Tag },
      { type: 'read',        title: 'READ DTMF',    desc: 'Read(var,audio,max,,timeout)',    accent: '#ffcc00', Icon: Keyboard },
      { type: 'saydigits',   title: 'SAY DIGITS',   desc: 'SayDigits(${VAR})',              accent: '#ffcc00', Icon: ListOrdered },
      { type: 'saynumber',   title: 'SAY NUMBER',   desc: 'SayNumber(${VAR},m|f)',          accent: '#ffcc00', Icon: Hash },
      { type: 'mixmonitor',  title: 'MIX MONITOR',  desc: 'MixMonitor(file.wav)',           accent: '#ff8c00', Icon: Disc },
      { type: 'stopmonitor', title: 'STOP MONITOR', desc: 'StopMonitor()',                  accent: '#ff8c00', Icon: Square },
      { type: 'chanspy',     title: 'CHAN SPY',      desc: 'ChanSpy(SIP/ramal,opts)',        accent: '#ff8c00', Icon: Eye },
    ],
  },
  {
    label: 'SISTEMA / ÁUDIO',
    items: [
      { type: 'answer',     title: 'ANSWER',      desc: 'Answer() · atende a chamada',             accent: '#00ff41', Icon: PhoneCall },
      { type: 'wait',       title: 'WAIT',         desc: 'Wait(seg) · pausa simples',              accent: '#00ff41', Icon: Timer },
      { type: 'waitexten',  title: 'WAIT EXTEN',   desc: 'WaitExten(seg) · aguarda DTMF',          accent: '#00ff41', Icon: Hourglass },
      { type: 'playback',   title: 'PLAYBACK',     desc: 'Playback(${SOUND_PATH}/arq) · bloqueia', accent: '#00ff41', Icon: Play },
      { type: 'background', title: 'BACKGROUND',   desc: 'Background(${SOUND_PATH}/arq) · DTMF OK',accent: '#00ff41', Icon: Volume2 },
    ],
  },
];

// memo: Sidebar não recebe props e lê apenas contextos estáveis (theme, mode).
// Não re-renderiza quando Canvas muda estado (nodes, edges, seleção, mouse, etc.).
const Sidebar = memo(function Sidebar() {
  const theme = useThemeContext();
  const mode  = useModeContext();

  // ── Pesquisa ──────────────────────────────────────────────────────────────
  const [query,         setQuery]         = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef(null);

  // ── Accordion — carregado do localStorage ─────────────────────────────────
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  });

  // Persiste o estado colapsado sempre que ele mudar
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(collapsed));
    } catch {}
  }, [collapsed]);

  const toggleCategory = useCallback((label) => {
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));
  }, []);

  // true quando todas as categorias estão expandidas
  const allExpanded = CATEGORIES.every((cat) => !collapsed[cat.label]);

  const toggleAll = useCallback(() => {
    if (allExpanded) {
      const next = {};
      CATEGORIES.forEach((cat) => { next[cat.label] = true; });
      setCollapsed(next);
    } else {
      setCollapsed({});
    }
  }, [allExpanded]);

  // ── Drag & Drop ───────────────────────────────────────────────────────────
  const onDragStart = (e, type) => {
    e.dataTransfer.setData('application/rcx-node', type);
    e.dataTransfer.effectAllowed = 'move';
  };

  // ── Filtragem com pontuação de relevância ─────────────────────────────────
  const q  = query.trim();
  const nq = normalize(q);          // query normalizada (sem acentos, minúscula)
  const isSearching = nq.length > 0;

  const visibleCategories = CATEGORIES.map((cat) => {
    if (!isSearching) return { ...cat, items: cat.items };

    // Pontua e filtra — só aparecem itens com score > 0, ordenados por relevância
    const scored = cat.items
      .map((it) => ({ it, score: scoreItem(it, nq) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score); // maior score primeiro

    return { ...cat, items: scored.map(({ it }) => it) };
  }).filter((cat) => cat.items.length > 0);

  // Mostra hint quando o campo está focado, vazio e não há pesquisa ativa
  const showHint = searchFocused && !query;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <aside style={{
      width: 260, height: '100%',
      background: 'var(--panel)',
      borderRight: '1px solid var(--line)',
      padding: '14px 12px',
      overflow: 'auto',
      boxSizing: 'border-box',
    }}>
      {/* Logotipo */}
      <div style={{ fontSize: 14, letterSpacing: 2 }} className="neon-text">
        ▌Orpen // URA<span className="blink">_</span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--neon-dim)', marginTop: 4, marginBottom: 12, letterSpacing: 1 }}>
        ASTERISK DIALPLAN BUILDER
      </div>

      {/* ── Caixa de pesquisa + botão toggle-all ─────────────────────────── */}
      <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginBottom: 0 }}>
        {/* wrapper interno para o campo + × */}
        <div style={{ position: 'relative', flex: 1 }}>
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="// buscar nó..."
            className="sidebar-search"
            style={{
              width: '100%',
              background: '#000',
              border: `1px solid ${isSearching ? 'var(--neon)' : 'var(--neon-dim)'}`,
              borderRadius: 2,
              padding: '6px 26px 6px 8px',
              color: 'var(--neon)',
              fontFamily: 'inherit',
              fontSize: 11,
              letterSpacing: 0.5,
              outline: 'none',
              boxSizing: 'border-box',
              transition: 'border-color 0.15s',
            }}
            onFocus={(e) => {
              setSearchFocused(true);
              e.target.style.borderColor = 'var(--neon)';
              e.target.style.boxShadow = '0 0 0 1px var(--neon), 0 0 5px var(--neon-glow-soft)';
            }}
            onBlur={(e) => {
              setSearchFocused(false);
              e.target.style.borderColor = isSearching ? 'var(--neon)' : 'var(--neon-dim)';
              e.target.style.boxShadow = 'none';
            }}
          />
          {/* Botão × para limpar */}
          {query && (
            <button
              aria-label="Limpar pesquisa"
              onClick={() => { setQuery(''); searchRef.current?.focus(); }}
              style={{
                position: 'absolute', right: 6, top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent', border: 'none',
                color: 'var(--neon-dim)', cursor: 'pointer',
                fontSize: 15, padding: 0, lineHeight: 1,
                transition: 'color 0.1s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--neon)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--neon-dim)'; }}
              title="Limpar pesquisa"
            >
              ×
            </button>
          )}
        </div>{/* fim wrapper campo */}

        {/* Botão expandir/colapsar tudo */}
        <button
          onClick={toggleAll}
          aria-label={allExpanded ? 'Colapsar tudo' : 'Expandir tudo'}
          title={allExpanded ? 'Colapsar tudo' : 'Expandir tudo'}
          style={{
            flexShrink: 0,
            width: 26, height: 26,
            background: 'transparent',
            border: '1px solid var(--line)',
            borderRadius: 2,
            color: 'var(--neon-dim)',
            fontFamily: 'inherit',
            fontSize: 11,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'border-color 0.1s, color 0.1s',
            lineHeight: 1,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--neon)';
            e.currentTarget.style.color = 'var(--neon)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--line)';
            e.currentTarget.style.color = 'var(--neon-dim)';
          }}
        >
          {allExpanded ? '▼' : '►'}
        </button>
      </div>{/* fim flex row pesquisa + toggle */}

      {/* ── Hint semântico — visível apenas com foco e campo vazio ─────────── */}
      <div style={{
        height: showHint ? 'auto' : 0,
        overflow: 'hidden',
        transition: 'height 0.15s ease',
        marginBottom: showHint ? 10 : 0,
        marginTop: 4,
      }}>
        {showHint && (
          <div style={{
            fontSize: 9,
            color: 'var(--neon)',
            opacity: 0.4,
            letterSpacing: 0.3,
            fontFamily: 'inherit',
            lineHeight: 1.5,
          }}>
            // ex: "audio", "validação", "fila", "script"
          </div>
        )}
      </div>

      {/* Margem entre search e categorias quando hint não está visível */}
      {!showHint && <div style={{ marginBottom: 14 }} />}

      {/* ── Nenhum resultado ─────────────────────────────────────────────── */}
      {isSearching && visibleCategories.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '24px 8px',
          fontSize: 11,
          color: 'var(--neon)',
          opacity: 0.4,
          letterSpacing: 1,
        }}>
          // nenhum resultado
        </div>
      )}

      {/* ── Categorias (accordion) ─────────────────────────────────────────── */}
      {visibleCategories.map((cat) => {
        // Com pesquisa ativa, sempre expande; senão respeita o estado salvo
        const isCollapsed = !isSearching && !!collapsed[cat.label];
        const catLabel = mode === 'amigavel'
          ? (CATEGORY_LABELS_AMIGAVEL[cat.label] || cat.label)
          : cat.label;

        return (
          <div key={cat.label} style={{ marginBottom: 10 }}>
            {/* Header clicável da categoria */}
            <button
              type="button"
              aria-expanded={!isCollapsed}
              onClick={() => !isSearching && toggleCategory(cat.label)}
              style={{
                fontSize: 10,
                color: 'var(--neon)',
                letterSpacing: mode === 'amigavel' ? 0.5 : 2,
                padding: '4px 6px',
                marginBottom: isCollapsed ? 0 : 6,
                border: 'none',
                borderLeft: '2px solid var(--neon)',
                background: 'var(--neon-glow-bg)',
                cursor: isSearching ? 'default' : 'pointer',
                display: 'flex',
                width: '100%',
                justifyContent: 'space-between',
                alignItems: 'center',
                userSelect: 'none',
                fontFamily: 'inherit',
                textAlign: 'left',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => { if (!isSearching) e.currentTarget.style.background = 'var(--neon-glow-faint)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--neon-glow-bg)'; }}
            >
              <span>▌ {catLabel}</span>
              {!isSearching && (
                <span style={{ fontSize: 9, opacity: 0.75, marginLeft: 4 }}>
                  {isCollapsed ? '►' : '▼'}
                </span>
              )}
            </button>

            {/* Conteúdo colapsável com animação */}
            <div style={{
              maxHeight: isCollapsed ? 0 : 2000,
              overflow: 'hidden',
              transition: 'max-height 0.22s ease',
            }}>
              {cat.items.map((it) => {
                const Icon = it.Icon;
                const accent = resolveNodeColor(it.accent, theme);
                const cfg    = NODE_MODE_CONFIG[it.type];
                const displayTitle = mode === 'amigavel' && cfg
                  ? cfg.labelAmigavel
                  : it.title;
                const displayDesc = mode === 'amigavel' && cfg
                  ? cfg.desc
                  : it.desc;

                return (
                  <div
                    key={it.type}
                    className="palette-item"
                    draggable
                    onDragStart={(e) => onDragStart(e, it.type)}
                    style={{
                      borderColor: accent + '55',
                      padding: mode === 'amigavel' ? '10px 10px' : '8px 10px',
                    }}
                  >
                    <div style={{
                      fontSize: 11, color: accent,
                      letterSpacing: mode === 'amigavel' ? 0.3 : 1,
                      fontWeight: 'bold',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <Icon size={13} /> {displayTitle}
                    </div>
                    <div style={{
                      fontSize: 10,
                      color: 'var(--sidebar-desc-color)',
                      marginTop: 3, marginLeft: 19,
                      lineHeight: mode === 'amigavel' ? 1.5 : 1.3,
                    }}>
                      {displayDesc}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* ── Dica (oculta durante pesquisa) ────────────────────────────────── */}
      {!isSearching && (
        <div style={{
          marginTop: 14, padding: 10,
          border: '1px dashed var(--line)', borderRadius: 3,
          fontSize: 10, color: 'var(--neon-dim)', lineHeight: 1.6,
        }}>
          <div style={{ color: 'var(--neon)', marginBottom: 4 }}>// DICA</div>
          Conecte os nós arrastando das saídas (●) para as entradas. Nós de ação (READ, AGI, NOOP…)
          podem ser encadeados em sequência antes de uma fila ou hangup.
        </div>
      )}
    </aside>
  );
});

export default Sidebar;
