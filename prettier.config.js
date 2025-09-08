/** @type {import('prettier').Config} */
export default {
  // Print width - balance between readability and avoiding word wrap
  printWidth: 100,

  // Use 2 spaces for indentation (consistent with most modern projects)
  tabWidth: 2,
  useTabs: false,

  // Semicolons and quotes
  semi: true,
  singleQuote: true,
  quoteProps: 'as-needed',

  // Trailing commas help with git diffs and easier editing
  trailingComma: 'es5',

  // Bracket spacing and line endings
  bracketSpacing: true,
  bracketSameLine: false,

  // Arrow function parentheses
  arrowParens: 'avoid',

  // Line endings (consistent across platforms)
  endOfLine: 'lf',

  // File-specific overrides
  overrides: [
    {
      files: ['*.json', '*.jsonc'],
      options: {
        printWidth: 120,
        tabWidth: 2,
      },
    },
    {
      files: ['*.md', '*.mdx'],
      options: {
        printWidth: 80,
        proseWrap: 'always',
      },
    },
    {
      files: ['*.yml', '*.yaml'],
      options: {
        tabWidth: 2,
        printWidth: 120,
      },
    },
  ],
};
