/**
 * Security headers shared by the Next apps. `extraOrigins` lists third-party hosts the page fetches from
 * (map tiles); the API origin is always allowed for data and media.
 */
export function securityHeaders(extraOrigins = []) {
  const api = new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").origin;
  const remote = [api, ...extraOrigins].join(" ");
  const devEval = process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${devEval}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${remote}`,
    `connect-src 'self' data: blob: ${remote}`,
    `font-src 'self' data: ${remote}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  return [
    {
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    },
  ];
}
