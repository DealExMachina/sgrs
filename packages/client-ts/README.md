# @sgrs/client-ts

TypeScript HTTP client for the SGRS REST API.

## Installation

```bash
npm install @sgrs/client-ts
# or
pnpm add @sgrs/client-ts
```

## Quick Start

```typescript
import { createClient } from '@sgrs/client-ts';

const client = createClient({
  baseUrl: 'http://localhost:3000',
  apiKey: 'optional-api-key',
});

// Get a scope
const result = await client.scopes.get('my-scope');
if (result.ok) {
  console.log('Scope:', result.data);
} else {
  console.error('Error:', result.error);
}
```

## Features

- **Type-safe**: Full TypeScript support with inferred types
- **Zod validation**: All types validated against Zod schemas from @sgrs/api-schema
- **Request/Response helpers**: Structured error handling and timeouts
- **Fetch API**: Uses standard `fetch` (customizable)
- **ESM-first**: Modern ES modules with proper tree-shaking support

## Configuration

```typescript
const client = createClient({
  baseUrl: 'http://localhost:3000',
  apiKey: 'your-api-key',
  timeout: 30000, // 30 seconds
  fetch: customFetch, // optional custom fetch implementation
});
```

## Scopes API

```typescript
// List all scopes
const result = await client.scopes.list();

// Get a scope
const result = await client.scopes.get('scope-id');

// Create a scope
const result = await client.scopes.create({
  name: 'My Scope',
  tag: 'tag',
  state: 'active',
  score: 0.5,
  cycles: 0,
});

// Update a scope
const result = await client.scopes.update('scope-id', {
  score: 0.75,
});

// Delete a scope
const result = await client.scopes.delete('scope-id');
```

## Models API

```typescript
// List connected models
const result = await client.models.list();

// Connect a model provider
const result = await client.models.connect({
  provider: 'openai',
  api_key: 'sk-...',
  model: 'gpt-4',
  label: 'Main GPT-4',
});

// Get a connected model
const result = await client.models.get('mh_xxx');

// Revoke a model
const result = await client.models.revoke('mh_xxx');
```

## Finality API

```typescript
// Get finality status
const result = await client.finality.status('scope-id');

// Get finality certificate
const result = await client.finality.certificate('scope-id', 1);

// Verify a certificate
const result = await client.finality.verify(certificate);
```

## Health Check

```typescript
const result = await client.health.check();
if (result.ok) {
  console.log('API is healthy:', result.data);
}
```

## Error Handling

All responses follow the `ApiResponse<T>` pattern:

```typescript
interface ApiResponse<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: ApiError;
}

interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
```

## Type Exports

The client re-exports all types from @sgrs/api-schema:

```typescript
import {
  Scope,
  ScopeId,
  ScopeState,
  ModelProvider,
  FinalityCertificate,
  // ... all other types
} from '@sgrs/client-ts';

// or from the schema export
import {
  Scope,
  FinalityStatus,
  // ...
} from '@sgrs/client-ts/schema';
```

## License

MIT - see LICENSE file
