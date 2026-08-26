"use client";

import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";

interface UserMenuProps {
  tenantId: string;
}

export function UserMenu({ tenantId }: UserMenuProps) {
  const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  if (!clerkEnabled) {
    return (
      <div
        className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-blue-deep to-blue text-[11px] font-semibold text-ink"
        title={tenantId}
      >
        JB
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <SignedIn>
        <Link
          href="/settings/keys"
          className="text-[11px] text-fog transition hover:text-white"
        >
          API keys
        </Link>
        <UserButton afterSignOutUrl="/sign-in" />
      </SignedIn>
      <SignedOut>
        <SignInButton mode="modal">
          <button
            type="button"
            className="rounded border border-white/15 px-2 py-1 text-[11px] text-fog hover:text-white"
          >
            Sign in
          </button>
        </SignInButton>
      </SignedOut>
    </div>
  );
}
