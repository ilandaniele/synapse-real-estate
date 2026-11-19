"use client";

import { useEffect, useRef } from "react";

const GSI_SCRIPT = "https://accounts.google.com/gsi/client";

interface GoogleIdentity {
  accounts: {
    id: {
      initialize(options: { client_id: string; callback: (response: { credential: string }) => void }): void;
      renderButton(element: HTMLElement, options: Record<string, string | number>): void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

let scriptLoad: Promise<GoogleIdentity> | null = null;

function loadGoogleIdentity(): Promise<GoogleIdentity> {
  scriptLoad ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GSI_SCRIPT;
    script.async = true;
    script.onload = () => (window.google ? resolve(window.google) : reject(new Error("Google Identity Services missing")));
    script.onerror = () => {
      scriptLoad = null;
      reject(new Error("Could not load Google Identity Services"));
    };
    document.head.appendChild(script);
  });
  return scriptLoad;
}

/** Google's own "Sign in with Google" button; hands the ID token to `onCredential`. */
export function GoogleSignInButton({ clientId, onCredential, onError }: { clientId: string; onCredential: (credential: string) => void; onError: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onCredential, onError });
  useEffect(() => {
    handlers.current = { onCredential, onError };
  });

  useEffect(() => {
    let cancelled = false;
    loadGoogleIdentity()
      .then((google) => {
        if (cancelled || !container.current) return;
        google.accounts.id.initialize({ client_id: clientId, callback: ({ credential }) => handlers.current.onCredential(credential) });
        google.accounts.id.renderButton(container.current, { theme: "outline", size: "large", text: "signin_with", locale: "es", width: 320 });
      })
      .catch(() => !cancelled && handlers.current.onError());
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  return <div ref={container} className="flex min-h-10 justify-center" data-testid="login-google" />;
}
