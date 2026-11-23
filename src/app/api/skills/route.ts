import { connection } from "next/server";
import { handle } from "@/lib/server/http";
import { skillLoader } from "@/lib/server/skills";

export async function GET() {
  await connection();
  return handle(async () => {
    const skills = skillLoader.listSkills();
    return { skills };
  });
}
