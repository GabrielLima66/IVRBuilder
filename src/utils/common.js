export const uid = () => Math.random().toString(36).slice(2, 9);

export const cls = (...a) => a.filter(Boolean).join(' ');

export const slugify = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'feriado';

export const DEFAULT_DIGITS = [
  { id: '1', label: 'Opcao 1' },
  { id: '2', label: 'Opcao 2' },
  { id: '3', label: 'Opcao 3' },
  { id: '4', label: 'Opcao 4' },
];