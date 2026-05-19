import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { cls } from '../../utils/common';
import { formatTimeRange, formatDayRange, WEEKDAY_ORDER, MONTH_ORDER } from '../../utils/timeUtils';

const TimeNode = memo(({ data, selected }) => {
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

  return (
    <div
      className={cls('rcx-node', selected && 'selected')}
      style={{ borderColor: isValid ? 'var(--neon)' : '#ff5050' }}
    >
      {/* Entradas: topo e esquerda */}
      <Handle type="target" position={Position.Top}  id="in"      />
      <Handle type="target" position={Position.Left} id="in-left" />

      {/* ▶ SE VERDADEIRO — saída direita (branch quando condição bate) */}
      <Handle
        type="source"
        position={Position.Right}
        id="true"
        style={{ background: '#ffcc00', width: 10, height: 10 }}
      />

      <div className="rcx-node-header">
        <span className="neon-text">▶ TIME COND</span>
        <span className="badge">GotoIfTime</span>
      </div>

      <div className="rcx-node-body">
        <div className="rcx-node-row"><span className="k">horário</span><span className="v">{timeStr}</span></div>
        <div className="rcx-node-row"><span className="k">dias</span><span className="v">{daysStr}</span></div>
        <div className="rcx-node-row"><span className="k">meses</span><span className="v">{monthStr}</span></div>
        <div className="rcx-node-row"><span className="k">dia mês</span><span className="v">{mdayStr}</span></div>

        {/* Destino quando condição é VERDADEIRA (branch direito) */}
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

        {/* Indicador de validação (Priority 4) */}
        <div style={{
          marginTop: 4,
          fontSize: 9,
          color: isValid ? 'var(--neon)' : '#ff5050',
          letterSpacing: 0.5,
        }}>
          {isValid ? '✓ vinculado' : '⚠ sem destino vinculado'}
        </div>

        {/* Fall-through quando condição é FALSA (saída bottom) */}
        <div style={{
          marginTop: 6,
          fontSize: 10,
          color: 'var(--neon)',
          textAlign: 'center',
        }}>
          ↓ Continua (falso)
        </div>
      </div>

      {/* Saída bottom: fall-through quando condição NÃO bate */}
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
