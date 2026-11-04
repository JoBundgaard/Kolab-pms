# Kolab PMS

Kolab Living's property management system, built with React, Vite and Firebase.

## Local development

```sh
npm ci
npm run dev
```

Firebase initialization lives in `src/firebase.js`. The normal development app connects to the configured Firebase project, so changes made through its forms affect that project's records.

## Checks

```sh
npm test
npm run build
npm run lint
```

The test suite covers booking dates, room transfers, housekeeping and CRM finance. Some existing lint findings remain; the structural refactor does not change their underlying behavior.

## Code organization

See [the architecture guide](docs/architecture.md) for module boundaries and guidance on adding features. [The CRM implementation notes](docs/crm-implementation.md) describe billing behavior and backend requirements.
