/**
 * Organization, project, and membership helpers.
 */

import { and, eq, isNull } from "drizzle-orm";
import { TenantId } from "@sgrs/api-schema";
import {
  apiKeys,
  hashApiKey,
  orgMemberships,
  organizations,
  projectMemberships,
  projects,
  scopeGrants,
  type ApiKeyRow,
  type Db,
  type OrganizationRow,
  type ProjectRow,
} from "@sgrs/db";

export function clerkOrgIdToOrgSlug(clerkOrgId: string): string {
  let slug = clerkOrgId.toLowerCase().replace(/_/g, "-");
  if (!/^[a-z0-9]/.test(slug)) slug = `o-${slug}`;
  slug = slug.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  if (slug.length > 64) slug = slug.slice(0, 64).replace(/-+$/, "");
  const parsed = TenantId.safeParse(slug);
  if (parsed.success) return parsed.data;
  return TenantId.parse(`o-${hashApiKey(clerkOrgId).slice(0, 24)}`);
}

export function clerkUserIdToOrgSlug(clerkUserId: string): string {
  let slug = clerkUserId.toLowerCase().replace(/_/g, "-");
  if (!/^[a-z0-9]/.test(slug)) slug = `u-${slug}`;
  slug = slug.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  if (slug.length > 64) slug = slug.slice(0, 64).replace(/-+$/, "");
  const parsed = TenantId.safeParse(slug);
  if (parsed.success) return parsed.data;
  return TenantId.parse(`u-${hashApiKey(clerkUserId).slice(0, 24)}`);
}

export function projectSlug(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "project";
}

export async function findOrgByClerkOrgId(
  db: Db,
  clerkOrgId: string,
): Promise<OrganizationRow | undefined> {
  const rows = await db
    .select()
    .from(organizations)
    .where(eq(organizations.clerk_org_id, clerkOrgId))
    .limit(1);
  return rows[0];
}

export async function findOrgById(
  db: Db,
  orgId: string,
): Promise<OrganizationRow | undefined> {
  const rows = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return rows[0];
}

export async function ensureOrgMembership(
  db: Db,
  orgId: string,
  clerkUserId: string,
  role: "org_admin" | "org_member" = "org_member",
): Promise<void> {
  await db
    .insert(orgMemberships)
    .values({ org_id: orgId, clerk_user_id: clerkUserId, role })
    .onConflictDoNothing();
}

export async function ensureOrgForClerkOrg(
  db: Db,
  clerkOrgId: string,
  name: string,
  creatorUserId?: string,
): Promise<OrganizationRow> {
  const existing = await findOrgByClerkOrgId(db, clerkOrgId);
  if (existing) {
    if (creatorUserId) {
      await ensureOrgMembership(db, existing.id, creatorUserId, "org_admin");
    }
    return existing;
  }

  const id = clerkOrgIdToOrgSlug(clerkOrgId);
  const inserted = await db
    .insert(organizations)
    .values({ id, name, clerk_org_id: clerkOrgId })
    .onConflictDoNothing()
    .returning();

  const org =
    inserted[0] ??
    (await findOrgByClerkOrgId(db, clerkOrgId)) ??
    (await findOrgById(db, id));
  if (!org) {
    throw new Error(`[sgrs][orgs] failed to ensure org for ${clerkOrgId}`);
  }

  if (creatorUserId) {
    await ensureOrgMembership(db, org.id, creatorUserId, "org_admin");
  }

  await ensureDefaultProject(db, org.id, "Default project");
  return org;
}

/** Personal workspace when Clerk org context is absent (local dev). */
export async function ensurePersonalOrg(
  db: Db,
  clerkUserId: string,
  name: string,
): Promise<OrganizationRow> {
  const rows = await db
    .select()
    .from(organizations)
    .where(eq(organizations.clerk_user_id, clerkUserId))
    .limit(1);
  if (rows[0]) return rows[0];

  const id = clerkUserIdToOrgSlug(clerkUserId);
  const inserted = await db
    .insert(organizations)
    .values({ id, name, clerk_user_id: clerkUserId })
    .onConflictDoNothing()
    .returning();

  const org =
    inserted[0] ??
    rows[0] ??
    (await db.select().from(organizations).where(eq(organizations.id, id)).limit(1))[0];
  if (!org) {
    throw new Error(`[sgrs][orgs] failed personal org for ${clerkUserId}`);
  }

  await ensureOrgMembership(db, org.id, clerkUserId, "org_admin");
  await ensureDefaultProject(db, org.id, "Default project");
  return org;
}

export async function ensureDefaultProject(
  db: Db,
  orgId: string,
  name: string,
): Promise<ProjectRow> {
  const slug = projectSlug(name);
  const id = `${orgId}-${slug}`.slice(0, 120);
  const existing = await db
    .select()
    .from(projects)
    .where(and(eq(projects.org_id, orgId), eq(projects.slug, slug)))
    .limit(1);
  if (existing[0]) return existing[0];

  const inserted = await db
    .insert(projects)
    .values({ id, org_id: orgId, name, slug })
    .onConflictDoNothing()
    .returning();

  if (inserted[0]) return inserted[0];

  const again = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);
  if (again[0]) return again[0];

  throw new Error(`[sgrs][projects] failed default project for ${orgId}`);
}

export async function listProjectsForUser(
  db: Db,
  orgId: string,
  clerkUserId: string,
): Promise<ProjectRow[]> {
  const orgMember = await db
    .select()
    .from(orgMemberships)
    .where(
      and(
        eq(orgMemberships.org_id, orgId),
        eq(orgMemberships.clerk_user_id, clerkUserId),
      ),
    )
    .limit(1);

  if (orgMember[0]?.role === "org_admin") {
    return db.select().from(projects).where(eq(projects.org_id, orgId));
  }

  const memberProjects = await db
    .select({ project: projects })
    .from(projectMemberships)
    .innerJoin(projects, eq(projectMemberships.project_id, projects.id))
    .where(
      and(
        eq(projects.org_id, orgId),
        eq(projectMemberships.clerk_user_id, clerkUserId),
      ),
    );

  return memberProjects.map((r) => r.project);
}

export async function lookupApiKey(
  db: Db,
  plaintext: string,
): Promise<ApiKeyRow | null> {
  if (!plaintext.startsWith("sk_")) return null;

  let hash: string;
  try {
    hash = hashApiKey(plaintext);
  } catch {
    return null;
  }

  const rows = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.key_hash, hash), isNull(apiKeys.revoked_at)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  void db
    .update(apiKeys)
    .set({ last_used_at: new Date() })
    .where(eq(apiKeys.id, row.id));

  return row;
}

// Legacy aliases
export const clerkUserIdToTenantId = clerkUserIdToOrgSlug;
export const ensureTenantForClerkUser = ensurePersonalOrg;
export const findTenantByClerkUserId = async (db: Db, clerkUserId: string) => {
  const rows = await db
    .select()
    .from(organizations)
    .where(eq(organizations.clerk_user_id, clerkUserId))
    .limit(1);
  return rows[0];
};
