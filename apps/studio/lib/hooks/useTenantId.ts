"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { DEFAULT_TENANT_ID } from "@/lib/types";

const DEFAULT_PROJECT_ID =
  process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID || "deal-ex-machina-default";

/** Active organization slug (= X-Tenant-ID / org_id). */
export function useOrgId(): string {
  const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  const { isSignedIn, getToken } = useAuth();
  const [orgId, setOrgId] = useState(DEFAULT_TENANT_ID);

  useEffect(() => {
    if (!clerkEnabled || !isSignedIn) {
      setOrgId(DEFAULT_TENANT_ID);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch("/api/me", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return;
        const data = (await res.json()) as { org_id?: string; tenant_id?: string };
        const id = data.org_id ?? data.tenant_id;
        if (!cancelled && id) setOrgId(id);
      } catch {
        /* keep default */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clerkEnabled, isSignedIn, getToken]);

  return orgId;
}

/** @deprecated Use {@link useOrgId} */
export const useTenantId = useOrgId;

export function useProjectId(orgId: string): {
  projectId: string;
  projects: Array<{ id: string; name: string; slug: string }>;
  setProjectId: (id: string) => void;
} {
  const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  const { isSignedIn, getToken } = useAuth();
  const [projectId, setProjectId] = useState(DEFAULT_PROJECT_ID);
  const [projects, setProjects] = useState<
    Array<{ id: string; name: string; slug: string }>
  >([]);

  useEffect(() => {
    if (!clerkEnabled || !isSignedIn) {
      setProjectId(DEFAULT_PROJECT_ID);
      setProjects([{ id: DEFAULT_PROJECT_ID, name: "Default project", slug: "default" }]);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const meRes = await fetch("/api/me", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (meRes.ok) {
          const me = (await meRes.json()) as {
            projects?: Array<{ id: string; name: string; slug: string }>;
          };
          if (!cancelled && me.projects?.length) {
            setProjects(me.projects);
            setProjectId((prev) =>
              me.projects!.some((p) => p.id === prev) ? prev : me.projects![0]!.id,
            );
          }
        }
      } catch {
        /* keep defaults */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clerkEnabled, isSignedIn, getToken, orgId]);

  return { projectId, projects, setProjectId };
}
