/**
 * ModeContext — contexto global do modo de interface PRO / AMIGÁVEL.
 *
 * PRO       → interface técnica completa: nomes de comandos Asterisk, badges,
 *              labels de campos técnicos. Comportamento original.
 * AMIGÁVEL  → interface humanizada: nomes descritivos, dicas contextuais,
 *              categorias renomeadas, badge de tipo oculto nos nós.
 *
 * O modo é persistido no localStorage com a chave 'orpen-ura-mode'.
 * O padrão inicial é 'pro'.
 */
import { createContext, useContext } from 'react';

export const ModeContext = createContext('pro');

/** Hook para consumir o modo ativo de qualquer componente descendente. */
export const useModeContext = () => useContext(ModeContext);
