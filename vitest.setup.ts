import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// React Testing Library only auto-registers its cleanup when vitest runs with
// `globals: true`. It doesn't here, so without this every test would render on
// top of the previous test's DOM and getByTestId would find duplicates.
afterEach(() => {
  cleanup();
});
