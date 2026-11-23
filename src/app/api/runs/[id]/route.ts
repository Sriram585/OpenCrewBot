import { connection } from "next/server";
import { handle } from "@/lib/server/http";
import { getRunDetails } from "@/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();
  const { id } = await params;
  return handle(async () => {
    const details = await getRunDetails(id);
    if (!details) {
      throw new Error(`Run ${id} not found.`);
    }
    return details;
  });
}
