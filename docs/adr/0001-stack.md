# ADR 0001: Stack tecnológico

**Estado:** aprobado por el propietario el 2 nov 2026.

## Decisión
- Monorepo pnpm con TypeScript estricto.
- API: Fastify 5 + zod. PostgreSQL 16 con Drizzle ORM y migraciones SQL versionadas.
- Apps: Next.js para web y clientes, cuidadores y admin, en subdominios separados. PWA en la V1.
- Infraestructura: AWS (RDS, S3 + KMS, ECS Fargate, Secrets Manager) con Terraform. Entornos de desarrollo, staging y producción.

## Por qué
- Un único lenguaje en front, back y reglas compartidas. Las reglas de negocio (`packages/domain`) son funciones puras que usan tanto la API como las apps.
- Usar PostgreSQL directamente, y no un backend gestionado, mantiene los permisos y el cifrado en código propio y auditable.
- AWS facilita una futura auditoría SOC 2, el cifrado con KMS y elegir la región de los datos.

## Consecuencias
- Más trabajo inicial de infraestructura que con Supabase o Vercel.
- La API es independiente de las apps, así que las apps nativas de la fase 7 la reutilizan sin cambios.
