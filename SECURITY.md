# Security Policy

## Supported Status

Cannae OS is currently a prototype doctrine and validation repository. It is not a production security product and does not provide formal compliance guarantees.

Security-sensitive areas include:

- release gates;
- approval scope;
- delegated authority;
- document access;
- context filtering;
- OPSEC and EEFI handling;
- CI and GitHub workflow permissions;
- any runner that claims to block unsafe execution or release.

## Reporting A Vulnerability

Do not open a public issue for sensitive vulnerabilities.

Preferred path:

1. Use GitHub private vulnerability reporting if enabled for this repository.
2. If that is unavailable, contact the repository owner through GitHub.
3. Include a minimal reproduction, affected files, expected impact, and any suggested fix.

Please do not include real secrets, private data, production credentials, or third-party confidential material in the report.

## Response Expectations

This is a small open-source project. Maintainers will make a best effort to:

- acknowledge credible reports;
- preserve reporter credit when appropriate;
- prioritize fixes that affect release, authority, context access, or CI integrity;
- document the mitigation path in a security advisory or release note when warranted.

## Secret Handling

Do not commit:

- API keys;
- OAuth tokens;
- private keys;
- `.env` files;
- real customer, user, operational, or confidential context;
- sensitive model outputs that should not be public.

The repository may contain deliberately fake fixture strings such as `password=example`. These are test data only.

## AI Safety Boundary

Do not submit changes intended to use this project to plan, enable, optimize, or conceal violence, surveillance, coercion, illegal activity, or unauthorized system access.
