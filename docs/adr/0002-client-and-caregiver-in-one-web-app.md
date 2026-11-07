# ADR 0002: Clientes y cuidadores en la misma app web; administración aparte

**Estado:** aceptado el 7 nov 2026. Reversible.

## Contexto
El blueprint preveía tres apps separadas (`apps/web`, `apps/caregiver`, `apps/admin`).

## Decisión
- `apps/web` sirve a clientes y cuidadores. Las pantallas dependen del tipo de cuenta: la sección de cuidadores está bajo `/[locale]/care/...` y la de clientes en `/[locale]/household`, entre otras.
- `apps/admin` es una app separada, en su propio subdominio, para aislar la seguridad del personal de NURIVA.

## Por qué
- Un solo inicio de sesión, cabecera, sistema de diseño y proxy hacia la API, sin duplicar código.
- Los permisos no dependen de la app: la API comprueba el rol en cada petición.
- El panel de admin maneja datos restringidos (antecedentes), así que conviene aislarlo: otro origen, otras cookies y, en el futuro, acceso por IP o SSO.

## Consecuencias
- `care.nuriva.com` puede apuntar a la misma app más adelante, o separarse en su propia app si el producto lo pide.
