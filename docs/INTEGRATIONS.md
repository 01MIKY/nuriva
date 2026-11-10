# Integraciones externas

Estado actual: **Stripe (modo de prueba) conectado** para las cuentas de cobro de los cuidadores (ver ADR 0003). El resto de proveedores aún no. Cada proveedor tendrá un adaptador en `packages/integrations/<proveedor>` con dos implementaciones: real (sandbox o producción) y simulada (tests). La simulada nunca se puede activar en producción.

| Proveedor | Para qué | Estado | Qué necesito del propietario |
|---|---|---|---|
| Stripe Connect (Accounts v2, panel Express, Managed Risk) | Cuentas de cobro de los cuidadores y cargos directos con la comisión de NURIVA | **Cuentas de cobro y cobro de reservas con reembolsos: hechos.** Probados con el proveedor simulado y, en las llamadas de cuenta y Checkout, contra Stripe en modo de prueba. Webhooks hechos (firma verificada con la librería oficial `stripe`) | Ya tenemos la clave `sk_test_`. Más adelante: secreto de webhook |
| Stripe Identity | Verificación de documento + selfie en vivo del cuidador | **Hecho.** Probado con el proveedor simulado y contra Stripe en modo de prueba (crear, leer y cancelar una sesión). NURIVA guarda solo el ID de la sesión y el estado | Nada más |
| Checkr | Antecedentes conforme a FCRA | Aprobado, no integrado | Alta de empresa en Checkr y clave de staging. Checkr exige verificar la empresa incluso para pruebas |
| Twilio Verify | Códigos por SMS, verificación de teléfono | Aprobado, no integrado | Account SID, token y Verify Service SID |
| Postmark | Email transaccional EN/ES | Aprobado, no integrado | Server token y dominio de envío verificado |

## Reglas
- Las claves van en variables de entorno del proveedor de hosting (staging: Render). Nunca en el repositorio.
- Los webhooks verifican la firma del proveedor y son idempotentes.
- Las respuestas de los proveedores (por ejemplo, el id de un informe de Checkr) se guardan cifradas como referencia de evidencia, no como copia del informe.
- Ningún estado de verificación se marca como "superado" sin una referencia real del proveedor o del staff.

## Stripe: cómo se prueba
- **Pruebas automáticas (CI):** usan un proveedor simulado (`createFakePaymentsProvider`). No necesitan red ni claves. El servidor lo rechaza en staging y producción.
- **Prueba real contra Stripe en modo de prueba:** `NODE_USE_ENV_PROXY=1 STRIPE_SANDBOX=1 pnpm --filter @nuriva/integrations test`. Crea una cuenta Express con Managed Risk, un enlace de alta y una sesión de Checkout con comisión, y después cierra la cuenta.
- **Comportamiento observado:** Stripe permite crear un Checkout antes de que el cuidador termine el alta, así que NURIVA comprueba ella misma que el estado de cobros sea `active`.

## Stripe: webhooks (`POST /v1/webhooks/stripe`)
- **Firma:** se verifica con la librería oficial `stripe`. Los eventos ligeros (thin, v2) usan `parseEventNotification` y los de tipo snapshot usan `webhooks.constructEvent`. Tolerancia de 300 s. Hace falta el cuerpo crudo, así que la ruta tiene su propio parser.
- **Desconfianza:** el evento es solo un aviso. NURIVA vuelve a consultar a Stripe el estado de la cuenta o de la sesión de Checkout antes de cambiar nada.
- **Idempotencia:** los IDs de evento se guardan en `stripe_events`. Una reentrega no se aplica dos veces. Si el procesamiento falla, se borra el ID para que Stripe reintente.
- **Eventos usados:** `v2.core.account.*` (estado de cobros del cuidador) y `checkout.session.completed` / `checkout.session.async_payment_succeeded` (reserva pagada aunque la familia no vuelva a la app).
- **Sin cabecera Origin:** esta ruta está exenta de la comprobación de origen en staging y producción; la autentica la firma.
- **Pendiente (requiere infraestructura):** registrar los destinos en el panel de Stripe. Stripe solo puede enviar avisos a una URL pública. En staging será `https://nuriva-staging-web.onrender.com/api/v1/webhooks/stripe` (la API es privada; el proxy de la app web reenvía el cuerpo sin cambios). Hasta entonces, el estado se actualiza al volver de Stripe o al abrir la pantalla de Cobros.
- **Pregunta abierta:** si los dos destinos (thin y snapshot) tienen secretos distintos, habrá que aceptar varios secretos. Hoy se acepta uno.
