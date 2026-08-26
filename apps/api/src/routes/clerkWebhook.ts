/**
 * Clerk webhook — ensure organization rows on org / user events.
 */

import { Hono } from "hono";
import { Webhook } from "svix";
import type { Db } from "@sgrs/db";
import {
  ensureOrgForClerkOrg,
  ensurePersonalOrg,
  ensureOrgMembership,
} from "../services/organizations.js";

type ClerkEvent =
  | {
      type: "user.created";
      data: {
        id: string;
        first_name?: string | null;
        last_name?: string | null;
        email_addresses?: Array<{ email_address: string }>;
      };
    }
  | {
      type: "organization.created";
      data: { id: string; name: string; created_by?: string };
    }
  | {
      type: "organizationMembership.created";
      data: {
        organization: { id: string; name?: string };
        public_user_data: { user_id: string };
        role: string;
      };
    };

export function createClerkWebhookRouter(db: Db) {
  const router = new Hono();

  router.post("/", async (c) => {
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) {
      return c.json({ error: "Webhook secret not configured." }, 503);
    }

    const payload = await c.req.text();
    const headers = {
      "svix-id": c.req.header("svix-id") ?? "",
      "svix-timestamp": c.req.header("svix-timestamp") ?? "",
      "svix-signature": c.req.header("svix-signature") ?? "",
    };

    let event: ClerkEvent;
    try {
      const wh = new Webhook(secret);
      event = wh.verify(payload, headers) as ClerkEvent;
    } catch (err) {
      console.error("[sgrs][clerk-webhook] verify failed:", err);
      return c.json({ error: "Invalid webhook signature." }, 400);
    }

    if (event.type === "user.created") {
      const first = event.data.first_name ?? "";
      const last = event.data.last_name ?? "";
      const email = event.data.email_addresses?.[0]?.email_address;
      const name = `${first} ${last}`.trim() || email || event.data.id;
      await ensurePersonalOrg(db, event.data.id, name);
    }

    if (event.type === "organization.created") {
      await ensureOrgForClerkOrg(
        db,
        event.data.id,
        event.data.name,
        event.data.created_by,
      );
    }

    if (event.type === "organizationMembership.created") {
      const org = await ensureOrgForClerkOrg(
        db,
        event.data.organization.id,
        event.data.organization.name ?? event.data.organization.id,
      );
      const role =
        event.data.role === "org:admin" ? "org_admin" : "org_member";
      await ensureOrgMembership(
        db,
        org.id,
        event.data.public_user_data.user_id,
        role,
      );
    }

    return c.json({ received: true });
  });

  return router;
}
