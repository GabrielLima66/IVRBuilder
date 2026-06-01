import { createContext, useContext } from 'react';

/** True when the canvas is in post-import review mode (read-only inspection). */
export const ReviewModeContext = createContext(false);
export const useReviewMode = () => useContext(ReviewModeContext);
