# Integraciones externas

Estado actual: **ninguna integración real está conectada.** No hay claves de prueba todavía. Cada proveedor tendrá un adaptador en `packages/integrations/<proveedor>` con dos implementaciones: real (sandbox o producción) y simulada (tests). La simulada nunca se puede activar en producción.

| Proveedor | Para qué | Estado | Qué necesito del propietario |
|---|---|---|---|
| Stripe Connect | Cobro al cliente (captura manual), pago al cuidador | Aprobado, no integrado | Cuenta Stripe; claves `sk_test_` y secreto de webhook |
| Stripe Identity | Verificación de documento + selfie del cuidador | Aprobado, no integrado | La misma cuenta Stripe, con Identity activado |
| Checkr | Antecedentes conforme a FCRA | Aprobado, no integrado | Alta de empresa en Checkr y clave de staging. Checkr exige verificar la empresa incluso para pruebas |
| Twilio Verify | Códigos por SMS, verificación de teléfono | Aprobado, no integrado | Account SID, token y Verify Service SID |
| Postmark | Email transaccional EN/ES | Aprobado, no integrado | Server token y dominio de envío verificado |

## Reglas
- Las claves van en variables de entorno o en AWS Secrets Manager. Nunca en el repositorio.
- Los webhooks verifican la firma del proveedor y son idempotentes.
- Las respuestas de los proveedores (por ejemplo, el id de un informe de Checkr) se guardan cifradas como referencia de evidencia, no como copia del informe.
- Ningún estado de verificación se marca como "superado" sin una referencia real del proveedor o del staff.
