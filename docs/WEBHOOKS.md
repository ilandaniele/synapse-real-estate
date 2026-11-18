# Webhooks de leads (integración CRM)

Un propietario (`OWNER`) registra en el admin, en **Integraciones**, una o varias URLs. Cada lead nuevo de su
organización se envía a todas ellas como un `POST` JSON firmado. Así un CRM (o un flujo de Zapier/Make/n8n) recibe
el contacto sin que nadie exporte CSV.

## Eventos

| Evento | Cuándo |
|---|---|
| `lead.created` | Un visitante envía el formulario público y el lead se guarda. Un envío descartado por el honeypot no genera evento. |

La entrega se encola en la misma transacción que el lead: si el lead no se guarda, no sale nada.

## Petición

```http
POST <tu URL>
Content-Type: application/json
User-Agent: Synapse-Webhooks/1
X-Synapse-Event: lead.created
X-Synapse-Delivery: <id de la entrega, distinto por URL>
X-Synapse-Signature: t=1763459200,v1=<hex>
```

```json
{
  "id": "7c1d…",
  "type": "lead.created",
  "createdAt": "2026-11-18T10:00:00.000Z",
  "data": {
    "leadId": "…",
    "development": { "id": "…", "slug": "lomas-del-faro" },
    "unit": { "id": "…", "code": "V6" },
    "name": "Lucía",
    "email": "lucia@example.com",
    "phone": "600000000",
    "message": "Hola",
    "createdAt": "2026-11-18T10:00:00.000Z"
  }
}
```

`unit` es `null` cuando el lead no indica villa. `id` es el id del evento: es el mismo en todos los reintentos y en
todas las URLs, así que el receptor puede usarlo para descartar duplicados.

## Verificar la firma

`v1` es el HMAC-SHA256 en hex de `<t>.<cuerpo crudo>` con el secreto `whsec_…` del webhook. Verificalo sobre el
cuerpo tal como llegó, antes de parsear el JSON, y rechazá timestamps viejos para limitar repeticiones.

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export function verify(secret: string, header: string, rawBody: string, toleranceSeconds = 300): boolean {
  const match = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header);
  if (!match) return false;
  const [, timestamp, signature] = match;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature!));
}
```

## Respuesta y reintentos

- Solo una respuesta `2xx` cuenta como entregada. Las redirecciones no se siguen y cuentan como error.
- Cada intento tiene 5 s de timeout.
- Hasta 6 intentos. Tras un fallo se espera 1 min, 5 min, 30 min, 2 h y 12 h. Después del sexto fallo la entrega
  queda `FAILED` y no se reintenta.
- El admin muestra las últimas 50 entregas de cada URL con estado, intentos y el último código o error.

El worker corre dentro del proceso del API y toma entregas con `FOR UPDATE SKIP LOCKED`, así que varias instancias
no envían la misma entrega a la vez. Al tomarla, la entrega cuenta el intento y queda reservada 60 s; si el proceso
cae en medio del envío, otro worker la reintenta al vencer la reserva. El receptor debe tolerar duplicados (ver `id`).

## Secreto

El secreto (`whsec_` + 48 hex) se genera en el servidor y se muestra **una sola vez**, al crear el webhook. No se
devuelve en ningún listado. Para rotarlo, creá un webhook nuevo, actualizá el CRM y borrá el viejo. Borrar un webhook
borra también su historial de entregas. Crear y borrar quedan en la auditoría (`webhook.create`, `webhook.delete`).

## Límites de destino (SSRF)

Con `NODE_ENV=production` la URL debe ser `https` y su host debe resolver solo a direcciones públicas. Se rechazan
loopback, redes privadas (10/8, 172.16/12, 192.168/16), CGNAT 100.64/10, link-local 169.254/16 (metadatos de la
nube), multicast, `fc00::/7`, `fe80::/10` y direcciones IPv4 mapeadas en IPv6. Se comprueba al crear y otra vez
antes de cada envío.

Límite conocido: la comprobación resuelve el DNS y `fetch` vuelve a resolverlo al conectar. Un DNS hostil podría
responder una IP pública a la comprobación y una privada a la conexión (DNS rebinding). Cerrar ese hueco exige fijar
la IP en el socket o salir por un proxy de egreso; para un MVP con webhooks creados solo por propietarios se acepta
y queda anotado en [SECURITY.md](SECURITY.md).

Fuera de producción se aceptan `http` y `localhost` para probar con un receptor local.

## API

Ver [API.md](API.md): `GET/POST /admin/webhooks`, `DELETE /admin/webhooks/:id` y
`GET /admin/webhooks/:id/deliveries`, todos con el permiso `integration:manage`.
