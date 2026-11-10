# Seguridad

## Autenticación
- Contraseñas con **Argon2id** (19 MiB, 2 iteraciones, parámetros OWASP). Mínimo 12 caracteres.
- Sesiones **en servidor**: el navegador recibe un token aleatorio de 256 bits; la base de datos solo guarda su SHA-256. Se pueden revocar (logout, "cerrar sesión en todos los dispositivos").
- Cookie `httpOnly`, `SameSite=Lax`. En staging y producción: `Secure` y prefijo `__Host-`.
- Mismo error y tiempo de respuesta para "email desconocido" y "contraseña incorrecta", para no revelar qué cuentas existen.
- Límite de intentos: 10 por 15 minutos en registro y login; 300 por minuto en general (`RATE_LIMIT_PER_MINUTE`). Cuentan **por visitante**. La API es privada y solo se llega a ella a través de las apps web y admin, que reducen la IP del visitante a una sola dirección (`apps/*/src/lib/upstream.ts`: la que vio el borde del proveedor, o `CLIENT_IP_HEADER`). Nunca reenvían una cadena `X-Forwarded-For` escrita por el cliente. La API confía en un único salto (`TRUSTED_PROXY_HOPS=1`). Tras cada despliegue nuevo se comprueba que la IP no se puede falsificar (`docs/DEPLOY.md`).
- **Verificación en dos pasos (TOTP, RFC 6238)**, compatible con Google Authenticator, 1Password, Authy y similares:
  - Alta con código QR. El secreto queda cifrado y pendiente hasta confirmarlo con un código válido.
  - 10 códigos de recuperación de un solo uso, mostrados una única vez. Solo se guarda su hash.
  - Inicio de sesión en dos pasos: el reto dura 5 minutos, es de un solo uso y admite como máximo 5 intentos. No se crea sesión hasta superarlo.
  - Protección contra reutilización: un código ya aceptado no vuelve a valer.
  - Al activarla se cierran las sesiones de los demás dispositivos.
  - **Obligatoria en staging y producción para cuidadores y staff.** Sin ella solo pueden usar `/auth/*` para activarla, y no pueden desactivarla. Los clientes pueden activarla y desactivarla, con contraseña y código.

## Autorización (mínimo privilegio)
- Tipos de cuenta: `client`, `caregiver`, `admin`. Nadie puede registrarse como admin.
- Roles de staff: `superadmin`, `operations`, `trust_safety`, `finance`, `support`. Los permisos de cada uno están en `packages/domain/src/roles.ts`.
- **Antecedentes:** solo `trust_safety` y `superadmin` pueden leer referencias o registrar decisiones. Cada lectura queda auditada.
- **Activar servicios:** solo `superadmin`, y con referencia de cumplimiento.

## Datos sensibles
- Cifrado por campo AES-256-GCM (columnas `*_enc`) para datos de menores y mascotas, teléfonos, contactos de emergencia y referencias de antecedentes.
- Formato con identificador de clave (`v1.<kid>...`), lo que permite rotar claves sin perder la lectura de datos antiguos.
- Staging: la clave la genera Render una sola vez (`NURIVA_DATA_KEY`) y el propietario guarda una copia. En producción se definirá un gestor de claves (KMS o equivalente) antes del lanzamiento. Nunca en el código.

## Integridad
- `audit_log` y `vetting_events` son de solo inserción: un trigger de PostgreSQL bloquea UPDATE y DELETE.
- Cada cambio sensible escribe la auditoría en la misma transacción.

## API
- Toda entrada se valida con esquemas zod `.strict()`: los campos desconocidos se rechazan.
- Solo se aceptan cuerpos JSON. Formularios y `text/plain` reciben 415, como defensa CSRF.
- En staging y producción, las peticiones que modifican datos deben venir de un origen permitido.
- Cabeceras de seguridad con helmet (CSP `default-src 'none'`, `nosniff`, etc.).
- Los logs ocultan cookies y cabeceras de autorización.
- Los errores internos no exponen detalles al cliente.
