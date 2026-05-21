# opendocuments-parser-rst

## 0.1.0

### Minor Changes

- Initial release: reStructuredText (`.rst`) parser plugin
  - Parses headings (underlined and overlined styles) into heading hierarchy
  - Parses `.. code-block::` and `.. code::` directives with language detection
  - Parses literal blocks introduced by `::`
  - Skips non-code directives
