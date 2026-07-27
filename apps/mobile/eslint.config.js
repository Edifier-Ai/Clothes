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
];
