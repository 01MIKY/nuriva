# NURIVA

Plataforma de cuidado infantil (**NURIVA Kids**) y de mascotas (**NURIVA Pets**). Lanzamiento en Miami, Florida. Inglés y español.

> Estado: **Fase 1 en curso**. Qué funciona y qué falta: [`docs/STATUS.md`](docs/STATUS.md).

## Estructura

```
apps/api            API REST (Fastify + TypeScript)
apps/web            App de clientes (Next.js, /en y /es, instalable en el móvil)
packages/ui         Sistema de diseño NURIVA (tokens + componentes React)
packages/domain     Reglas de negocio puras: precios, reservas, selección de cuidadores, permisos
packages/i18n       Traducciones EN/ES con paridad verificada por tipos y tests
packages/db         Esquema PostgreSQL (Drizzle), migraciones, cifrado de campos
docs/               Arquitectura, seguridad, cumplimiento, integraciones, decisiones (ADR)
```

Pendiente: `apps/caregiver`, `apps/admin`, infraestructura Terraform. Plan completo en [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Puesta en marcha local

Requisitos: Node 22, pnpm 10, PostgreSQL 16.

```bash
pnpm install
createuser nuriva_dev -P            # contraseña local: nuriva_dev_local_only
createdb -O nuriva_dev nuriva_dev && createdb -O nuriva_dev nuriva_test
cp .env.example .env                # y genera NURIVA_DATA_KEYS
pnpm db:migrate
pnpm test
pnpm dev:api                        # http://localhost:4000/health
pnpm --filter @nuriva/web dev       # http://localhost:3000 (en otra terminal)
pnpm e2e                            # tests de navegador (EN/ES, escritorio y móvil)
```

## Entornos

| Entorno | Uso | Secretos | Datos |
|---|---|---|---|
| development | local | generados en `.env` | demo |
| test | CI | efímeros | se vacían en cada ejecución |
| staging | pruebas con proveedores en sandbox | AWS Secrets Manager | demo, marcados como tal |
| production | clientes reales | AWS Secrets Manager | reales |
