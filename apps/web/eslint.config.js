import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import rootConfig from '../../eslint.config.js';

export default [
  ...rootConfig,
  reactHooks.configs.flat.recommended,
  reactRefresh.configs.vite,
  {
    // shadcn-generated components export variants alongside components
    files: ['src/components/ui/**'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
];
