import tseslint from 'typescript-eslint';
export default tseslint.config({ ignores: ['out/**', 'release/**', 'test-results/**'] }, ...tseslint.configs.recommended);
