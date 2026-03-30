# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT open a public GitHub issue**
2. Email: security@opendocuments.dev (or create a private security advisory on GitHub)
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will acknowledge receipt within 48 hours and aim to release a fix within 7 days for critical issues.

## Security Considerations

- API keys should be stored in `.env` files, never in config files
- In team mode, always use HTTPS in production
- Review PII redaction settings before indexing sensitive documents
- Widget embedding uses domain allowlisting - configure `widgetAllowedDomains` in production
