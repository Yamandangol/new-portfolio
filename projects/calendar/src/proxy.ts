import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export default async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals and static assets. Keeping icons and the
     * manifest out matters: the PWA install prompt fetches them unauthenticated.
     */
    "/((?!_next/static|_next/image|favicon\\.ico|icons/|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
