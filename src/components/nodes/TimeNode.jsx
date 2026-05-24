import React, { memo, useCallback } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import { cls } from '../../utils/common';
import { formatTimeRange, formatDayRange, WEEKDAY_ORDER, MONTH_ORDER } from '../../utils/timeUtils';
import { useActiveSelection } from '../../contexts/ActiveSelectionContext';
import { useModeContext } from '../../contexts/ModeContext';
import { getNodeLabel } from '../../config/nodeModeConfig';

const btnStyle = (color) => ({
  flex: 1,
  padding: '3px 0',
  fontSize: 8,
  letterSpacing: 1,
  background: 'transparent',
  border: `1px solid ${color}55`,
  color,
  cursor: 'pointer',
  fontFamily: 'inherit',
  borderRadius: 2,
});

const TimeNode = memo(({ id, data, selected }) => {
  const { setNodes, setEdges } = useReactFlow();
  const { activeNodeIds } = useActiveSelection();
  const isConnectedActive = activeNodeIds.has(id);
  const modeCtx = useModeContext();
  const displayTitle = getNodeLabel('time', modeCtx);

  const handleActivate = useCallback(() => {
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== id) return n;
        const { _commented, _origLine, ...rest } = n.data;
        return { ...n, data: rest };
      })
    );
  }, [id, setNodes]);

  const handleExclude = useCallback(() => {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
  }, [id, setNodes, setEdges]);

  const timeStr  = data.timeStart || data.timeEnd
    ? formatTimeRange(data.timeStart, data.timeEnd)
    : (data.hours || '*');
  const daysStr  = Array.isArray(data.weekdays)
    ? formatDayRange(data.weekdays, WEEKDAY_ORDER)
    : (data.days || '*');
  const monthStr = Array.isArray(data.months)
    ? formatDayRange(data.months, MONTH_ORDER)
    : (data.months || '*');
  const mdayStr  = data.mday !== undefined && data.mday !== ''
    ? String(data.mday)
    : (data.monthdays || '*');

  const trueCtx = (data.trueContext || '').trim();
  const isValid = Boolean(trueCtx);

  const borderColor = data._commented
    ? '#ffcc0044'
    : (isValid ? 'var(--neon)' : '#ff5050');

  return (
    <div
      className={cls('rcx-node', selected && 'selected', isConnectedActive && 'node-connected-active')}
      style={{
        borderColor,
        borderStyle: data._commented ? 'dashed' : 'solid',
        opacity: data._commented ? 0.6 : 1,
        ...(isConnectedActive && { '--node-active-color': '#ffcc00', '--node-active-glow': 'rgba(255,204,0,0.65)' }),
      }}
    >
      <Handle type="target" position={Position.Top}  id="in"      />
      <Handle type="target" position={Position.Left} id="in-left" />

      <Handle
        type="source"
        position={Position.Right}
        id="true"
        style={{ background: '#ffcc00', width: 10, height: 10 }}
      />

      <div className="rcx-node-header">
        <span className="neon-text">
          {data._commented ? `// ${displayTitle}` : `▶ ${displayTitle}`}
        </span>
        {data._commented
          ? <span className="badge" style={{ borderColor: '#ff505088', color: '#ff5050' }}>DESATIVADO</span>
          : modeCtx !== 'amigavel' && <span className="badge">GotoIfTime</span>
        }
      </div>

      <div className="rcx-node-body">
        <div className="rcx-node-row"><span className="k">horário</span><span className="v">{timeStr}</span></div>
        <div className="rcx-node-row"><span className="k">dias</span><span className="v">{daysStr}</span></div>
        <div className="rcx-node-row"><span className="k">meses</span><span className="v">{monthStr}</span></div>
        <div className="rcx-node-row"><span className="k">dia mês</span><span className="v">{mdayStr}</span></div>

        <div style={{
          marginTop: 6,
          padding: '4px 6px',
          borderTop: '1px dashed var(--line)',
          fontSize: 10,
        }}>
          <div style={{ color: '#ffcc00', fontSize: 9, letterSpacing: 1, marginBottom: 2 }}>
            → SE VERDADEIRO
          </div>
          <span style={{
            color: trueCtx ? '#ffcc00' : '#555',
            fontStyle: trueCtx ? 'normal' : 'italic',
          }}>
            {trueCtx || '(sem destino)'}
          </span>
        </div>

        {!data._commented && (
          <>
            <div style={{ marginTop: 4, fontSize: 9, color: isValid ? 'var(--neon)' : '#ff5050', letterSpacing: 0.5 }}>
              {isValid ? '✓ vinculado' : '⚠ sem destino vinculado'}
            </div>
            <div style={{ marginTop: 6, fontSize: 10, color: 'var(--neon)', textAlign: 'center' }}>
              ↓ Continua (falso)
            </div>
          </>
        )}

        {data._commented && (
          <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
            <button onMouseDown={(e) => e.stopPropagation()} onClick={handleActivate} style={btnStyle('var(--neon)')}>
              ATIVAR
            </button>
            <button onMouseDown={(e) => e.stopPropagation()} onClick={handleExclude} style={btnStyle('#ff5050')}>
              EXCLUIR
            </button>
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        id="closed"
        style={{ background: 'var(--neon)' }}
      />
    </div>
  );
});

TimeNode.displayName = 'TimeNode';
export default TimeNode;
