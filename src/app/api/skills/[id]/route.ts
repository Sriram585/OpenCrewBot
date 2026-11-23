import { connection } from "next/server";
import { body, handle } from "@/lib/server/http";
import { skillLoader } from "@/lib/server/skills";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();
  const { id } = await params;
  return handle(async () => {
    const skill = skillLoader.getSkill(id);
    if (!skill) throw new Error(`Skill ${id} not found.`);
    return { skill };
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();
  const { id } = await params;
  return handle(async () => {
    const payload = await body<{ content: string }>(request);
    if (!payload.content?.trim()) throw new Error("Skill markdown content is required.");
    const skill = skillLoader.saveSkill(id, payload.content);
    return { ok: true, skill };
  });
}
