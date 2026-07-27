/**
 * ESLint flat config：基于 eslint-config-expo（SDK 57）。
 * 生成产物目录全部忽略；规则升级只能在此文件统一调整。
 */
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  {
    ignores: [
      'android/**',
      'ios/**',
      '.expo/**',
      'dist/**',
      'node_modules/**',
      'coverage/**',
    ],
  },
  ...expoConfig,
  {
    // Skia 修边画布需在读 ref 的渲染期合成蒙版叠加，属有意为之；关闭 react-hooks/refs 与 impure 规则。
    files: ['src/app/cutout-editor.tsx'],
    rules: {
      'react-hooks/refs': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/purity': 'off',
    },
  },
];
