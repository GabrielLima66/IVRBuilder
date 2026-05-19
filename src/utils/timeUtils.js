// Ordem canônica oficial do Asterisk
export const WEEKDAY_ORDER = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const MONTH_ORDER   = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const MAX_DAYS_PER_MONTH = {
  jan: 31, feb: 29, mar: 31, apr: 30, may: 31, jun: 30,
  jul: 31, aug: 31, sep: 30, oct: 31, nov: 30, dec: 31,
};

// Dias máximos do mês baseado nos meses selecionados (regra do menor denominador)
export function getMaxDay(selectedMonths) {
  if (!selectedMonths || selectedMonths.length === 0) return 31;
  return Math.min(...selectedMonths.map((m) => MAX_DAYS_PER_MONTH[m] || 31));
}

// Formata um array de seleções em range Asterisk (ex: ['mon','tue','wed','thu','fri'] → 'mon-fri')
// Detecta sequências consecutivas automaticamente; não-consecutivos usam '&'
export function formatDayRange(selected, order) {
  if (!selected || selected.length === 0) return '*';
  const sorted = selected.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const indices = sorted.map((d) => order.indexOf(d));
  const isConsecutive =
    sorted.length > 1 && indices.every((v, i) => i === 0 || v === indices[i - 1] + 1);
  return isConsecutive ? `${sorted[0]}-${sorted[sorted.length - 1]}` : sorted.join('&');
}

// Formata o par de horários HH:MM-HH:MM (vazio → *)
export function formatTimeRange(start, end) {
  if (!start && !end) return '*';
  if (!start || !end) return `${start || '00:00'}-${end || '23:59'}`;
  return `${start}-${end}`;
}

// Monta a string completa do GotoIfTime: times,weekdays,mdays,months
export function buildTimeExport(d) {
  // Compatibilidade com nós legados (formato antigo: d.hours, d.days, ...)
  if (!d.timeStart && !d.timeEnd && !d.weekdays && d.hours) {
    return `${d.hours || '*'},${d.days || '*'},${d.monthdays || '*'},${d.months || '*'}`;
  }
  const times    = formatTimeRange(d.timeStart, d.timeEnd);
  const weekdays = formatDayRange(d.weekdays || [], WEEKDAY_ORDER);
  const mdays    = d.mday !== undefined && d.mday !== '' ? String(d.mday) : '*';
  const months   = formatDayRange(d.months   || [], MONTH_ORDER);
  return `${times},${weekdays},${mdays},${months}`;
}
