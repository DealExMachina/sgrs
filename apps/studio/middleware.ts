import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/api/health(.*)",
]);

const withClerk = clerkMiddleware(async (authFn, req) => {
  if (!isPublicRoute(req)) {
    await authFn.protect();
  }
});

export default function middleware(req: NextRequest) {
  if (!process.env.CLERK_SECRET_KEY) {
    return NextResponse.next();
  }
  return withClerk(req, {} as never);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
