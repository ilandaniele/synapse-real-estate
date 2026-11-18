# Storage

The API, the asset worker and the render worker read and write files through one interface, `ObjectStorage`
in `packages/storage`. Two drivers implement it.

| Driver | `STORAGE_DRIVER` | Files live in | Public media served by |
| --- | --- | --- | --- |
| Local disk | `local` (default) | `STORAGE_DIR` | the API at `/media/` |
| S3-compatible bucket | `s3` | `S3_BUCKET` | a CDN or public domain in front of the bucket (`MEDIA_PUBLIC_URL`) |

The S3 driver works with AWS S3, Cloudflare R2 and self-hosted S3 servers. Local development uses
RustFS (Apache-2.0) from `docker-compose.yml`. MinIO no longer publishes images on Docker Hub.

## Key layout

| Prefix | Content | Public |
| --- | --- | --- |
| `uploads/<org>/<asset>` | raw uploads (CAD, unprocessed panoramas, GLB) | never |
| `processed/<org>/` | panorama outputs from the asset worker | yes |
| `published/<org>/` | GLB and images copied on approval or publication | yes |
| `demo/` | demo assets from `pnpm assets:generate` | yes |

Keys are relative, use `/`, and cannot contain `..`, `\` or a leading `/`. `assertSafeKey` enforces this
in both drivers.

## Upload flow

1. The admin calls `POST /api/v1/admin/assets/uploads` with name, size and content type.
2. The API answers with a ticket: `{ assetId, uploadUrl, expiresAt, requiresCompletion }`.
3. The admin sends the file with `PUT uploadUrl`.
4. If `requiresCompletion` is true, the admin calls `POST /api/v1/admin/assets/:id/complete`.

| | Local | S3 |
| --- | --- | --- |
| `uploadUrl` | the API's own `PUT /api/v1/uploads/:id?token=` (JWT, 10 min) | presigned bucket PUT (10 min) |
| Size limit | streamed; cut off past the declared size (413) | content length is signed; the bucket refuses another size (403) |
| Validation | at the end of the PUT | in `/complete` |
| `requiresCompletion` | `false` | `true` |

Both paths end in the same `finalizeUpload` (`apps/api/src/lib/uploads.ts`). It does these checks:

- The stored size must equal the declared size.
- The first 1024 bytes must match the extension (magic bytes).

On failure the asset becomes `REJECTED` and the object is deleted. `/complete` answers these errors:

- `409 UPLOAD_MISSING` before the file arrives.
- `409 UPLOAD_CLOSED` once the asset is no longer pending.
- `404` for another organisation's asset.

## Configure S3 or R2

Set these variables for the API and the workers:

```dotenv
STORAGE_DRIVER=s3
S3_BUCKET=synapse-media
S3_REGION=auto                 # R2: auto. AWS: the bucket region.
S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com   # empty for AWS S3
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=false      # true for RustFS/MinIO-style servers
MEDIA_PUBLIC_URL=https://media.example.com
```

Keep the keys in the server's environment or secret store, never in git. The API refuses to start with
`STORAGE_DRIVER=s3` and no `MEDIA_PUBLIC_URL`, because it does not serve bucket media itself.

### Bucket CORS

The browser PUTs straight to the bucket, so the bucket must allow the admin origin:

```json
[
  {
    "AllowedOrigins": ["https://admin.example.com"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

R2 sets this under the bucket's Settings, CORS policy. AWS sets it with `put-bucket-cors`.

### Public media and the CDN

`MEDIA_PUBLIC_URL` is the base of every media URL that the API returns. Serve only the public prefixes
through it:

- R2: connect a custom domain to the bucket and block `/uploads/*` with a WAF rule.
- AWS: put CloudFront in front of the bucket, with origin access control. Add behaviours only for
  `processed/*`, `published/*` and `demo/*`.

Send `Cache-Control: public, max-age=604800` from the CDN, as the local `/media/` route does.

### Demo assets

`pnpm assets:generate` writes to `STORAGE_DIR/demo`. Copy them to the bucket once, with any S3 client:

```bash
aws s3 sync storage/demo s3://synapse-media/demo --endpoint-url "$S3_ENDPOINT"
```

## Local S3 server

```bash
docker compose up -d s3
```

RustFS listens on `http://localhost:9000` (console on 9001) with `synapse` / `synapse-dev-only`. These are
local-only credentials. Run the storage and API tests against it:

```bash
S3_TEST_ENDPOINT=http://localhost:9000 pnpm --filter @synapse/storage test
```

```bash
S3_TEST_ENDPOINT=http://localhost:9000 pnpm --filter @synapse/api exec vitest run test/storage.test.ts
```

Without `S3_TEST_ENDPOINT` the S3 cases are skipped and only the local driver is tested.
