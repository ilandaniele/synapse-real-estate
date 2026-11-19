/**
 * Security headers shared by the Next apps. `extraOrigins` lists third-party hosts the page fetches from
 * (map tiles). The API origin is allowed for data and media; an empty NEXT_PUBLIC_API_URL means same origin.
 * `googleSignIn` allows the Google Identity Services script, its button frame and its stylesheet.
 */
export function securityHeaders(extraOrigins = [], { googleSignIn = false } = {}) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  const api = apiUrl ? [new URL(apiUrl).origin] : [];
  const remote = [...api, ...extraOrigins].join(" ");
  const devEval = process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'";
  const gsi = googleSignIn ? " https://accounts.google.com/gsi/" : "";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${devEval}${gsi}`,
    `style-src 'self' 'unsafe-inline'${gsi}`,
    `img-src 'self' data: blob: ${remote}`,
    `connect-src 'self' data: blob: ${remote}${gsi}`,
    `frame-src 'self'${gsi}`,
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
