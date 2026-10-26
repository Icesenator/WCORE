import { webHealth } from "@/lib/health";

// Read at request time: the build-info file only exists inside the deployed image.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(webHealth(), { headers: { "Cache-Control": "no-store" } });
}
