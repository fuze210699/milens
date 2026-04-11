# Project Guide

Welcome to the project. This guide explains how to get started.

## Getting Started

First, install the dependencies:

```bash
npm install
```

Then configure your environment.

## Architecture

The project has three main layers.

### Models

The data models are in [models.ts](../ts-project/src/models.ts).

See the `User` interface for the main entity.

### Authentication

The auth module is in [auth.ts](../ts-project/src/auth.ts).

```typescript
// Example usage — do NOT extract this heading:
# This is not a real heading
const auth = new AuthService();
```

## API Reference

### Endpoints

- `GET /users` — list all users
- `POST /auth/login` — authenticate

### Error Codes

See [external docs](https://example.com/errors) for details.

## Contributing

Please read the [guidelines](./CONTRIBUTING.md) before submitting.
