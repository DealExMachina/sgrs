# sgrs-client

Python HTTP client for the SGRS REST API.

## Installation

```bash
pip install sgrs-client
```

## Quick Start

### Async Usage

```python
import asyncio
from sgrs_client import create_client

async def main():
    client = create_client(base_url='http://localhost:3000')
    
    # Get a scope
    response = await client.get_scope('my-scope')
    if response.ok:
        print(f"Scope: {response.data}")
    else:
        print(f"Error: {response.error}")
    
    await client.close()

asyncio.run(main())
```

### Sync Usage

```python
from sgrs_client import create_client

client = create_client(base_url='http://localhost:3000')

# Get a scope
response = client.get_scope_sync('my-scope')
if response.ok:
    print(f"Scope: {response.data}")
else:
    print(f"Error: {response.error}")

client._sync_client.close()
```

### Context Manager

```python
import asyncio
from sgrs_client import create_client

async def main():
    async with create_client(base_url='http://localhost:3000') as client:
        response = await client.get_scope('my-scope')
        print(response.data if response.ok else response.error)

asyncio.run(main())
```

## Features

- **Type-safe**: All types validated with Pydantic models
- **Async-first**: Full async/await support with fallback to sync
- **Schema validation**: Runtime validation using models derived from Zod schemas
- **Error handling**: Structured error responses with detailed information
- **Timeouts**: Configurable request timeouts
- **SSL verification**: Configurable SSL certificate verification

## Scopes API

```python
# Get a scope
response = await client.get_scope('scope-id')

# Create a scope
response = await client.create_scope(
    name='My Scope',
    tag='tag',
    state='active',
    score=0.5,
    cycles=0
)

# Update a scope
response = await client.update_scope('scope-id', score=0.75)
```

## Models API

```python
from sgrs_client import ConnectModelRequest

# Connect a model provider
request = ConnectModelRequest(
    provider='openai',
    api_key='sk-...',
    model='gpt-4'
)
response = await client.connect_model(request)

# Get a connected model
response = await client.get_model('mh_xxx')
```

## Finality API

```python
# Get finality status
response = await client.get_finality_status('scope-id')

# Get finality certificate
response = await client.get_finality_certificate('scope-id', round=1)
```

## License

MIT - see LICENSE file
