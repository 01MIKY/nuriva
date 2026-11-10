# Publicar la versión de prueba (staging) en Render

Todo está definido en `render.yaml` (decisión en `docs/adr/0004-staging-on-render.md`). Coste aproximado: **$42 al mes**.

## 1. Lo que hace el propietario (una sola vez)
1. Crear una cuenta en **render.com** (plan *Hobby*) y añadir una tarjeta.
2. **New → Blueprint** y conectar GitHub con acceso **solo** al repositorio `01MIKY/nuriva`.
3. Elegir la rama `main`. Render lee `render.yaml` y muestra lo que va a crear: 3 servicios y 1 base de datos.
4. Cuando lo pida, pegar en `STRIPE_SECRET_KEY` la clave **de prueba** de Stripe (`sk_test_…`). Se encuentra en el panel de Stripe → Desarrolladores → Claves de API. Nunca la clave real (`sk_live_…`): la API se niega a arrancar con ella.
5. Pulsar **Apply** y esperar a que los 4 recursos estén en verde.
6. Guardar una copia de la clave de cifrado: servicio `nuriva-staging-api` → *Environment* → `NURIVA_DATA_KEY`. Va al gestor de contraseñas, nunca al chat ni a un documento compartido.
7. Para que Claude pueda revisar y corregir los despliegues: *Account settings* → *API keys* → crear una clave. Se entrega en el formulario seguro que Claude muestra, **nunca en el chat**.

## 2. Primer administrador
En `nuriva-staging-api` → **Shell**:

```bash
cd /app && node_modules/.bin/tsx apps/api/src/cli/create-staff.ts --email tu@correo.com --name "Tu Nombre" --roles superadmin
```

- La contraseña temporal se muestra **una sola vez**.
- Al entrar en el panel (`https://nuriva-staging-admin.onrender.com`), el sistema obliga a activar la verificación en dos pasos. Hace falta una app de autenticación: Google Authenticator, Microsoft Authenticator o 1Password.

## 3. Comprobaciones tras el primer despliegue (Claude)
- [ ] **URLs públicas.** Si Render añadió un sufijo a `nuriva-staging-web` o a `nuriva-staging-admin`, actualizar `APP_ORIGINS` y `WEB_ORIGIN` en la API.
- [ ] `GET /api/healthz` en las dos apps devuelve `{"ok":true,"ip":"<tu IP>"}`.
- [ ] **IP no falsificable.** `curl -H 'x-forwarded-for: 203.0.113.9' https://…/api/healthz` debe seguir mostrando la IP real, no `203.0.113.9`.
  - Si muestra una IP de Render en lugar de la del visitante, probar `CLIENT_IP_HEADER=cf-connecting-ip` en las dos apps y repetir la prueba, incluida la falsificación de ese mismo encabezado.
- [ ] **Límite de intentos.** 11 intentos de inicio de sesión fallidos desde la misma IP deben acabar en 429, aunque cada uno lleve un `x-forwarded-for` distinto.
- [ ] **Recorrido básico.** Registro de una familia, aviso "Versión de prueba" visible y `noindex` en las páginas.
- [ ] **Servicios.** Activar en el panel → Cumplimiento con la referencia `STAGING-PRUEBA`. Es solo para pruebas; en producción hace falta la aprobación documentada real.

## 4. Pagos (más adelante)
`PAYMENTS_ENABLED=false`: las reservas funcionan sin cobrar. Para probar cobros con tarjetas de prueba:
1. Crear en Stripe los dos destinos de eventos apuntando a `https://nuriva-staging-web.onrender.com/api/v1/webhooks/stripe` (ver `.env.example`).
2. Añadir `STRIPE_WEBHOOK_SECRET` a la API y poner `PAYMENTS_ENABLED=true`.

## Probar las imágenes en local
```bash
docker build -f apps/api/Dockerfile -t nuriva-api .
```
Lo mismo con `apps/web` y `apps/admin`. Las migraciones se aplican con `node_modules/.bin/tsx packages/db/src/migrate.ts` dentro de la imagen de la API.
