import { createContext, useContext } from 'react';

export const MenuActionsContext = createContext(null);
export const useMenuActions = () => useContext(MenuActionsContext);
