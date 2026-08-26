"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
}

export default function ApiKeysPage() {
  const { getToken, isSignedIn } = useAuth();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [name, setName] = useState("");
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const authHeaders = useCallback(async () => {
    const token = await getToken();
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }, [getToken]);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/keys", { headers: await authHeaders() });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { keys: ApiKeyRow[] };
      setKeys(data.keys);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load keys");
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    if (isSignedIn) void loadKeys();
  }, [isSignedIn, loadKeys]);

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreatedSecret(null);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ name: name.trim() || "Default key", env: "live" }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { secret: string };
      setCreatedSecret(data.secret);
      setName("");
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create key");
    }
  }

  async function revokeKey(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/keys/${id}`, {
        method: "DELETE",
        headers: await authHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke key");
    }
  }

  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return (
      <main className="mx-auto max-w-2xl p-8 text-white">
        <p>Clerk is not configured. Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.</p>
        <Link href="/" className="text-sky-400 underline">
          Back to Studio
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8 text-white">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">API keys</h1>
        <Link href="/" className="text-sm text-sky-400 hover:underline">
          Back to Studio
        </Link>
      </div>

      <p className="text-sm text-zinc-400">
        Use these keys with <code className="text-zinc-200">@sgrs/client-ts</code>{" "}
        or <code className="text-zinc-200">sgrs-client</code> against the public API.
      </p>

      {createdSecret && (
        <div className="rounded border border-amber-500/40 bg-amber-950/30 p-4 text-sm">
          <p className="font-medium text-amber-200">Copy your key now — it will not be shown again.</p>
          <code className="mt-2 block break-all text-amber-100">{createdSecret}</code>
        </div>
      )}

      {error && (
        <p className="rounded border border-red-500/40 bg-red-950/30 p-3 text-sm text-red-200">
          {error}
        </p>
      )}

      <form onSubmit={createKey} className="flex gap-2">
        <input
          className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
          placeholder="Key name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          type="submit"
          className="rounded bg-sky-600 px-4 py-2 text-sm font-medium hover:bg-sky-500"
        >
          Create key
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : (
        <ul className="divide-y divide-zinc-800 rounded border border-zinc-800">
          {keys.length === 0 && (
            <li className="p-4 text-sm text-zinc-500">No active keys yet.</li>
          )}
          {keys.map((k) => (
            <li key={k.id} className="flex items-center justify-between gap-4 p-4 text-sm">
              <div>
                <p className="font-medium">{k.name}</p>
                <p className="font-mono text-zinc-400">{k.key_prefix}…</p>
              </div>
              <button
                type="button"
                onClick={() => void revokeKey(k.id)}
                className="text-red-400 hover:text-red-300"
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
