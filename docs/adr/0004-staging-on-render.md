# ADR 0004: Versión de prueba (staging) en Render

**Estado:** aprobado por el propietario el 10 nov 2026. Modifica D2 solo para staging.

## Decisión
- La versión de prueba se publica en **Render** (región Virginia, la más cercana a Miami), definida como código en `render.yaml`.
- Cuatro piezas:
  - la API como **servicio privado**, sin URL pública;
  - la app de familias y cuidadores;
  - el panel de administración;
  - PostgreSQL 16 accesible solo desde la red privada.
- Cada pieza es una imagen **Docker** (`apps/*/Dockerfile`). Las mismas imágenes funcionan en AWS u otro proveedor, así que la decisión de producción sigue abierta.
- Las migraciones se aplican en el paso previo a cada despliegue (`preDeployCommand`).
- Render solo despliega `main` cuando la CI de GitHub pasa entera (`autoDeployTrigger: checksPass`).

## Por qué
- **Coste fijo y conocido.** Unos $42 al mes (3 × $7 + $19 de PostgreSQL + disco), frente a unos $70–80 al mes en AWS con bastante más configuración. Precios de render.com/pricing, consultados el 10 nov 2026.
- **Base de datos gestionada.** Incluye recuperación a un punto en el tiempo (3 días en el plan Hobby) y red privada.
- **Menos piezas que mantener** mientras no hay clientes reales.

## Consecuencias
- **La API ya no es pública.** Las apps la alcanzan por la red privada (`API_ORIGIN` = `host:puerto`), y los avisos de Stripe llegan por el proxy de la app web (`/api/v1/webhooks/stripe`).
- **La IP del visitante.** Las apps la reducen a una sola dirección (`apps/*/src/lib/upstream.ts`) y la API confía en un único salto (`TRUSTED_PROXY_HOPS=1`).
  - Render no documenta con claridad cómo forma `X-Forwarded-For`.
  - Por eso hay que comprobarlo tras cada despliegue nuevo (ver `docs/DEPLOY.md`) y, si hace falta, ajustar `CLIENT_IP_HEADER` o `EDGE_PROXY_HOPS`.
- **Clave de cifrado.** Render la genera una sola vez (`NURIVA_DATA_KEY`). El propietario debe guardar una copia en su gestor de contraseñas; sin ella, los datos cifrados no se pueden leer.
- **Producción:** se decidirá antes del lanzamiento, Render (planes Pro) o AWS, con su propia revisión de costes, copias de seguridad, alta disponibilidad y seguridad.
