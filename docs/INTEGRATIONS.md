# Integraciones externas

Estado actual: **Stripe (modo de prueba) conectado** para las cuentas de cobro de los cuidadores (ver ADR 0003). El resto de proveedores aún no. Cada proveedor tendrá un adaptador en `packages/integrations/<proveedor>` con dos implementaciones: real (sandbox o producción) y simulada (tests). La simulada nunca se puede activar en producción.

| Proveedor | Para qué | Estado | Qué necesito del propietario |
|---|---|---|---|
| Stripe Connect (Accounts v2, panel Express, Managed Risk) | Cuentas de cobro de los cuidadores y cargos directos con la comisión de NURIVA | **Cuentas de cobro y cobro de reservas con reembolsos: hechos.** Probados con el proveedor simulado y, en las llamadas de cuenta y Checkout, contra Stripe en modo de prueba. Faltan los webhooks | Ya tenemos la clave `sk_test_`. Más adelante: secreto de webhook |
| Stripe Identity | Verificación de documento + selfie del cuidador | Disponible en la cuenta de prueba (comprobado). No integrado aún | Nada más |
| Checkr | Antecedentes conforme a FCRA | Aprobado, no integrado | Alta de empresa en Checkr y clave de staging. Checkr exige verificar la empresa incluso para pruebas |
| Twilio Verify | Códigos por SMS, verificación de teléfono | Aprobado, no integrado | Account SID, token y Verify Service SID |
| Postmark | Email transaccional EN/ES | Aprobado, no integrado | Server token y dominio de envío verificado |

## Reglas
- Las claves van en variables de entorno o en AWS Secrets Manager. Nunca en el repositorio.
- Los webhooks verifican la firma del proveedor y son idempotentes.
- Las respuestas de los proveedores (por ejemplo, el id de un informe de Checkr) se guardan cifradas como referencia de evidencia, no como copia del informe.
- Ningún estado de verificación se marca como "superado" sin una referencia real del proveedor o del staff.

## Stripe: cómo se prueba
- **Pruebas automáticas (CI):** usan un proveedor simulado (`createFakePaymentsProvider`). No necesitan red ni claves. El servidor lo rechaza en staging y producción.
- **Prueba real contra Stripe en modo de prueba:** `NODE_USE_ENV_PROXY=1 STRIPE_SANDBOX=1 pnpm --filter @nuriva/integrations test`. Crea una cuenta Express con Managed Risk, un enlace de alta y una sesión de Checkout con comisión, y después cierra la cuenta.
- **Comportamiento observado:** Stripe permite crear un Checkout antes de que el cuidador termine el alta, así que NURIVA comprueba ella misma que el estado de cobros sea `active`.
