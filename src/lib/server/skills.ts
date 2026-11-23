// Module F: Reusable Skills Ecosystem & Dynamic Skill Loader
// Loads Markdown skills from data/skills/, matches task intent dynamically,
// and injects proven methodologies into agent prompts.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DATA_DIR } from "./config";

export const SKILLS_DIR = resolve(join(DATA_DIR, "skills"));

export interface Skill {
  id: string;
  name: string;
  triggers: string[];
  requiredTools: string[];
  outputFormat: string;
  methodology: string;
  rawContent: string;
  path: string;
}

export class SkillLoader {
  readonly dir: string;

  constructor(dir: string = SKILLS_DIR) {
    this.dir = resolve(/*turbopackIgnore: true*/ dir);
    this.ensureDir();
  }

  private ensureDir(): void {
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true });
    }
  }

  /** Parses frontmatter metadata and body from a skill markdown file */
  private parseSkillFile(filename: string, content: string): Skill {
    const id = filename.replace(/\.md$/i, "");
    let name = id.replace(/-/g, " ");
    const triggers: string[] = [];
    const requiredTools: string[] = [];
    let outputFormat = "markdown";

    // Frontmatter parsing
    if (content.startsWith("---")) {
      const parts = content.split("---");
      if (parts.length >= 3) {
        const frontmatter = parts[1];
        const lines = frontmatter.split(/\r?\n/);
        let currentSection: "triggers" | "required_tools" | null = null;

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (trimmed.startsWith("name:")) {
            name = trimmed.replace("name:", "").trim();
            currentSection = null;
          } else if (trimmed.startsWith("output_format:")) {
            outputFormat = trimmed.replace("output_format:", "").trim();
            currentSection = null;
          } else if (trimmed.startsWith("triggers:")) {
            currentSection = "triggers";
          } else if (trimmed.startsWith("required_tools:")) {
            currentSection = "required_tools";
          } else if (trimmed.startsWith("-") && currentSection) {
            const val = trimmed.replace(/^-+\s*/, "").trim();
            if (currentSection === "triggers") triggers.push(val);
            else if (currentSection === "required_tools") requiredTools.push(val);
          }
        }
      }
    }

    // Extract methodology section if present
    const methodologyMatch = content.match(/##\s+Methodology([\s\S]*?)(?=##|$)/i);
    const methodology = methodologyMatch ? methodologyMatch[1].trim() : content;

    return {
      id,
      name,
      triggers,
      requiredTools,
      outputFormat,
      methodology,
      rawContent: content,
      path: join(this.dir, filename),
    };
  }

  listSkills(): Skill[] {
    this.ensureDir();
    const files = readdirSync(this.dir).filter((f) => f.endsWith(".md"));
    return files.map((f) => {
      const content = readFileSync(join(this.dir, f), "utf8");
      return this.parseSkillFile(f, content);
    });
  }

  getSkill(id: string): Skill | null {
    this.ensureDir();
    const cleanId = id.replace(/[^a-zA-Z0-9_-]/g, "");
    const filePath = join(this.dir, `${cleanId}.md`);
    if (!existsSync(filePath)) return null;
    const content = readFileSync(filePath, "utf8");
    return this.parseSkillFile(`${cleanId}.md`, content);
  }

  saveSkill(id: string, content: string): Skill {
    this.ensureDir();
    const cleanId = id.replace(/[^a-zA-Z0-9_-]/g, "");
    const filePath = join(this.dir, `${cleanId}.md`);
    writeFileSync(filePath, content, "utf8");
    return this.parseSkillFile(`${cleanId}.md`, content);
  }

  /**
   * Matches a task description to relevant skills based on triggers.
   */
  matchSkills(taskDescription: string): Skill[] {
    const all = this.listSkills();
    const lower = taskDescription.toLowerCase();
    const matched: Skill[] = [];

    for (const skill of all) {
      const hasMatch = skill.triggers.some((trigger) => {
        const tLower = trigger.toLowerCase();
        // Exact word or boundary match
        const regex = new RegExp(`\\b${tLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
        return regex.test(lower) || lower.includes(tLower);
      });

      if (hasMatch) {
        matched.push(skill);
      }
    }

    return matched;
  }

  /**
   * Enriches prompt instructions with relevant matched skills.
   */
  injectSkillPrompt(taskDescription: string, basePrompt: string = ""): string {
    const matched = this.matchSkills(taskDescription);
    if (matched.length === 0) return basePrompt;

    let skillContext = "\n\n### Specialized Skill Guidelines:";
    for (const s of matched) {
      skillContext += `\n\n#### Skill: ${s.name}\n##### Methodology:\n${s.methodology}\nRequired Tools: ${s.requiredTools.join(", ") || "none"}\nOutput Format: ${s.outputFormat}`;
    }

    return `${basePrompt}${skillContext}`;
  }
}

// Global singleton
export const skillLoader = new SkillLoader();
