# ReadyGo Consulting Platform

A full-stack professional consulting platform scaffold with Next.js frontend and FastAPI backend.

## Architecture

### Frontend
- **Next.js 15** with App Router
- **TypeScript** for type safety
- **TailwindCSS** for styling
- **shadcn/ui** for UI components
- **TanStack React Query** for data fetching
- Custom fetch API wrapper (no Axios)

### Backend
- **Python 3.12** with **FastAPI**
- **Async SQLAlchemy 2.0** with PostgreSQL
- **Alembic** for database migrations
- **Dependency Injection** using `dependency-injector`
- **Layered Architecture**: API → Controllers → Services → Repositories → Models
- **Azure Integration** stubs (Blob Storage, Key Vault)
- **OpenTelemetry** for observability
- **Rate Limiting** with Redis + slowapi
- **pytest** for testing

## Project Structure

```
/frontend          # Next.js frontend application
/backend           # FastAPI backend application
/config            # Docker compose and configuration files
/tests             # Integration tests
/.github/workflows # CI/CD workflows
```

## Prerequisites

- Docker and Docker Compose
- Node.js 20+ (for local frontend development)
- Python 3.12+ (for local backend development)
- Poetry (for Python dependency management)

## Quick Start

### Using Docker Compose (Recommended)

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ReadyGo
   ```

2. **Set up environment variables**
   ```bash
   cp config/.env.example config/.env
   # Edit config/.env with your configuration
   ```

3. **Start all services**
   ```bash
   cd config
   docker-compose up -d
   ```

4. **Access the applications**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Documentation: http://localhost:8000/docs
   - Health Check: http://localhost:8000/api/v1/health

### Local Development

#### Backend

1. **Navigate to backend directory**
   ```bash
   cd backend
   ```

2. **Install dependencies**
   ```bash
   poetry install
   ```

3. **Set up environment variables**
   ```bash
   cp ../config/.env.example .env
   # Edit .env with your configuration
   ```

4. **Run database migrations** (when models are created)
   ```bash
   alembic upgrade head
   ```

5. **Start the development server**
   ```bash
   uvicorn app.main:app --reload
   ```

#### Frontend

1. **Navigate to frontend directory**
   ```bash
   cd frontend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp ../config/.env.example .env.local
   # Edit .env.local with NEXT_PUBLIC_API_URL=http://localhost:8000
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

## Development Commands

### Backend

```bash
# Run tests
poetry run pytest

# Lint code
poetry run ruff check .
poetry run black .

# Type check
poetry run mypy app/

# Run database migrations
alembic revision --autogenerate -m "description"
alembic upgrade head
```

### Frontend

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Lint code
npm run lint

# Format code
npx prettier --write .
```

## Testing

### Backend Tests

```bash
cd backend
poetry run pytest
```

### Frontend Tests

(Add test framework setup as needed)

## Code Quality

This project uses:

- **Pre-commit hooks** for automatic linting and formatting
- **Ruff** and **Black** for Python code quality
- **ESLint** and **Prettier** for TypeScript/JavaScript code quality
- **GitHub Actions** for CI/CD

Install pre-commit hooks:

```bash
pre-commit install
```

## Environment Variables

See `config/.env.example` for all available environment variables.

Key variables:
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `NEXT_PUBLIC_API_URL`: Backend API URL for frontend
- `SECRET_KEY`: Secret key for JWT tokens
- Azure credentials (placeholders)

## Observability

The scaffold includes OpenTelemetry integration for:
- Distributed tracing
- Metrics collection
- Log aggregation

Optional integrations:
- **Sentry** for error tracking
- **DataDog** for APM
- **Prometheus** for metrics
- **Jaeger** for tracing

See `app/core/integrations/observability.py` for configuration.

## Database Migrations

Migrations are managed using Alembic:

```bash
# Create a new migration
alembic revision --autogenerate -m "description"

# Apply migrations
alembic upgrade head

# Rollback migration
alembic downgrade -1
```

## Rate Limiting

Rate limiting is configured using Redis and slowapi. Default limits:
- Health endpoint: 10 requests/minute
- Other endpoints: Configurable via settings

## License

[Add your license here]

## Contributing

[Add contributing guidelines here]












