import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  // Edge Function tests run in the node environment, where there is no DOM.
  if (typeof window === 'undefined') return;
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
});
