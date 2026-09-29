export default {
  extends: ['@commitlint/config-conventional'],
  ignores: [(msg) => /^v?\d+\.\d+\.\d+/.test(msg)],
  rules: {
    'body-max-line-length': [0, 'always'],
    'footer-max-line-length': [0, 'always'],
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'perf', 'refactor', 'docs', 'test', 'build', 'ci', 'chore', 'revert', 'style'],
    ],
  },
};
