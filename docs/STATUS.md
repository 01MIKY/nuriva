# Estado del proyecto

Última actualización: 7 nov 2026. Solo figura como "Hecho" lo que tiene tests automáticos en verde.

## Decisiones aprobadas por el propietario

| # | Decisión | Estado |
|---|---|---|
| D1 | Monorepo TypeScript, Next.js, API Fastify, PostgreSQL | Aprobado |
| D2 | AWS con desarrollo / staging / producción | Aprobado (infraestructura aún no creada) |
| D3 | PWA primero, apps nativas en fase 7 | Aprobado |
| D4 | Sandbox: Stripe Connect + Identity, Checkr, Twilio + Postmark | Aprobado. **Faltan las cuentas y claves de prueba** |
| D5 | Modelo legal | Recomendación: marketplace. **Pendiente de abogado** |
| D6 | Repositorio GitHub | Hecho: `01MIKY/nuriva` (privado) |

## Fase 1 — Cimientos

| Módulo | Estado | Tests |
|---|---|---|
| Monorepo pnpm, TypeScript estricto | Hecho | `pnpm typecheck` |
| Reglas de negocio (`packages/domain`): precios, cancelación, máquina de estados, selección, permisos | Hecho | 22 |
| Traducciones EN/ES con paridad obligatoria | Hecho (catálogo base) | 9 |
| Base de datos PostgreSQL + migraciones versionadas | Hecho | aplicadas en tests |
| Cifrado de campos AES-256-GCM con rotación de claves | Hecho | 5 |
| Registro inmutable de auditoría (trigger en BD) | Hecho | 1 |
| API: registro, login, logout, sesiones revocables, Argon2id, límites de intentos | Hecho | 9 |
| API: selección de cuidadores por admin, con evidencia obligatoria y antecedentes restringidos | Hecho | 8 |
| API: activación de servicios con referencia de cumplimiento | Hecho | 1 |
| CI (GitHub Actions con PostgreSQL + e2e) | Escrito; primera ejecución en GitHub sin revisar todavía | — |
| Bloque 5 · Verificación en dos pasos (TOTP + códigos de recuperación), obligatoria en staging y producción para cuidadores y staff; pantallas en la app y en el panel | Hecho | 4 RFC + 12 API + 2 e2e |
| `packages/ui`: sistema de diseño (tokens, logo, botones, campos, tarjetas, avisos, seguimiento de pasos) | Hecho | cubierto por e2e |
| `apps/web`: inicio público, registro (cliente y cuidador), login, mi cuenta, seguimiento de aprobación, EN/ES, instalable (PWA) | Hecho | 12 e2e (escritorio + móvil) |
| Rediseño aprobado (prototipo del 7 nov): tarjetas Niños/Mascotas ilustradas, iconos, tarjeta de confianza, barra de progreso de aprobación | Hecho en `apps/web` | 12 e2e |
| Bloque 2 · Mi hogar: hijos y mascotas (nombre/apodo y edad, alergias, medicación, indicaciones) y contacto de emergencia, todo cifrado; solo el dueño accede; auditoría sin texto sensible | Hecho | 10 API + 2 e2e |
| Bloque 3 · Perfil y solicitud del cuidador (divisiones, servicios, tarifa, idiomas, titular, bio, código postal), con lo que falta para completarla; no puede tocar su aprobación | Hecho (en `apps/web`, ver ADR 0002) | 6 API + 2 e2e |
| Bloque 4 · `apps/admin`: acceso solo para el equipo, lista de cuidadores con filtros, ficha con perfil, pasos de selección con evidencia obligatoria (antecedentes solo Trust & Safety), historial restringido y auditado, registro de cumplimiento (solo superadmin), auditoría; menú según permisos | Hecho | 7 API + 2 e2e |
| Herramienta `create-staff` (única forma de crear administradores; contraseña temporal de un solo uso) | Hecho | 2 |
| Infraestructura AWS (Terraform) | Pendiente: necesita cuenta AWS y aprobación de costes | — |

## Valores provisionales (requieren aprobación de negocio)

- Tasa de servicio al cliente: 10 %. Comisión al cuidador: 15 %.
- Cancelación gratuita con 24 h o más de antelación; si es más tarde, 50 % del subtotal.
- Tarifa mínima de $15/h (salario mínimo de Florida desde el 30 sep 2026). Confirmar si aplica al modelo elegido.
