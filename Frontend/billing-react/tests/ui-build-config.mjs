import { fileURLToPath } from 'node:url';

// Match the browser bundler's ESM resolution for per-component UI imports.
// A Node CommonJS default wrapper is not a React component.
export const uiModuleAliases = {
  '@mui/icons-material': fileURLToPath(new URL('../node_modules/@mui/icons-material/esm', import.meta.url)),
};
