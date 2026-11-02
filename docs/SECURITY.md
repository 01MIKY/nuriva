# Seguridad

## Autenticación
- Contraseñas con **Argon2id** (19 MiB, 2 iteraciones, parámetros OWASP). Mínimo 12 caracteres.
- Sesiones **en servidor**: el navegador recibe un token aleatorio de 256 bits; la base de datos solo guarda su SHA-256. Se pueden revocar (logout, "cerrar sesión en todos los dispositivos").
- Cookie `httpOnly`, `SameSite=Lax`. En staging y producción: `Secure` y prefijo `__Host-`.
- Mismo error y tiempo de respuesta para "email desconocido" y "contraseña incorrecta", para no revelar qué cuentas existen.
- Límite de intentos: 10 por 15 minutos en registro y login; 300 por minuto en general.
- **Pendiente:** MFA (TOTP) obligatorio para cuidadores y admins. Hasta que exista, staging y producción deniegan todo acceso de admin.

## Autorización (mínimo privilegio)
- Tipos de cuenta: `client`, `caregiver`, `admin`. Nadie puede registrarse como admin.
- Roles de staff: `superadmin`, `operations`, `trust_safety`, `finance`, `support`. Los permisos de cada uno están en `packages/domain/src/roles.ts`.
- **Antecedentes:** solo `trust_safety` y `superadmin` pueden leer referencias o registrar decisiones. Cada lectura queda auditada.
- **Activar servicios:** solo `superadmin`, y con referencia de cumplimiento.

## Datos sensibles
- Cifrado por campo AES-256-GCM (columnas `*_enc`) para datos de menores y mascotas, teléfonos, contactos de emergencia y referencias de antecedentes.
- Formato con identificador de clave (`v1.<kid>...`), lo que permite rotar claves sin perder la lectura de datos antiguos.
- En producción las claves estarán en AWS Secrets Manager / KMS, nunca en el código.

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
