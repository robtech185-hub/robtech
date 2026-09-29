import "dotenv/config";
import express from "express";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import archiver from "archiver";
import OpenAI from "openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 3000);
const MODEL = process.env.ROBTECH_MODEL || "gpt-5.6-sol";
const WORKSPACE = path.join(__dirname, "workspace");
const MAX_STEPS = 24;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

await fs.mkdir(WORKSPACE, { recursive: true });

function safePath(relativePath) {
  if (!relativePath || typeof relativePath !== "string") {
    throw new Error("Invalid path");
  }
  const normalized = path.normalize(relativePath).replace(/^([/\\\\])+/, "");
  if (normalized.startsWith("..") || normalized.includes(`..${path.sep}`)) {
    throw new Error("Path traversal is not allowed");
  }
  return path.join(WORKSPACE, normalized);
}

async function writeFileTool({ file_path, content }) {
  const target = safePath(file_path);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
  return { ok: true, file_path, bytes: Buffer.byteLength(content, "utf8") };
}

async function readFileTool({ file_path }) {
  const target = safePath(file_path);
  const content = await fs.readFile(target, "utf8");
  return { ok: true, file_path, content };
}

async function listFilesTool() {
  const result = [];
  async function walk(dir, prefix = "") {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".gitkeep") continue;
      const rel = path.join(prefix, entry.name);
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), rel);
      else result.push(rel.replaceAll("\\\\", "/"));
    }
  }
  await walk(WORKSPACE);
  return { ok: true, files: result };
}

async function resetWorkspace() {
  const entries = await fs.readdir(WORKSPACE, { withFileTypes: true });
  for (const entry of entries) {
    await fs.rm(path.join(WORKSPACE, entry.name), { recursive: true, force: true });
  }
}

async function zipWorkspace() {
  const zipName = `RobTech-project-${Date.now()}.zip`;
  const output = path.join(__dirname, zipName);
  const archive = archiver("zip", { zlib: { level: 9 } });
  const stream = (await import("node:fs")).createWriteStream(output);
  const done = new Promise((resolve, reject) => {
    stream.on("close", resolve);
    archive.on("error", reject);
  });
  archive.pipe(stream);
  archive.directory(WORKSPACE, false);
  await archive.finalize();
  await done;
  return { ok: true, zip: `/${zipName}`, bytes: archive.pointer() };
}

function toolsDefinition() {
  return [
    {
      type: "function",
      name: "write_file",
      description: "Create or replace a project file. Use this to build the actual website files.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          file_path: { type: "string", description: "Relative path such as index.html or src/app.js" },
          content: { type: "string", description: "Complete file content" }
        },
        required: ["file_path", "content"],
        additionalProperties: false
      }
    },
    {
      type: "function",
      name: "read_file",
      description: "Read an existing project file before editing it.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          file_path: { type: "string" }
        },
        required: ["file_path"],
        additionalProperties: false
      }
    },
    {
      type: "function",
      name: "list_files",
      description: "List all files currently created in the project.",
      strict: true,
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false
      }
    },
    {
      type: "function",
      name: "create_zip",
      description: "Package the completed project into a ZIP file after the build is complete.",
      strict: true,
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false
      }
    }
  ];
}

const SYSTEM = `
You are RobTech, an AI software-building agent.
The user describes a website in Arabic or English. Your job is to actually create a runnable website inside the workspace using tools.

Rules:
1. Build a real, polished project, not a plan only.
2. Prefer a simple static HTML/CSS/JS project unless the user explicitly requests a framework.
3. Create index.html, styles.css and app.js when appropriate.
4. If images are requested but no image tool is available, use tasteful CSS/gradients/placeholders and clearly document where real assets should go.
5. Use Arabic RTL when the requested site is Arabic.
6. Make the design responsive.
7. Use write_file for every actual project file.
8. You may inspect files with read_file and list_files.
9. Before finishing, list the files and make sure the core files exist.
10. Finally call create_zip.
11. Never write files outside the workspace.
12. Do not put secrets or API keys into generated project files.
`;

async function runAgent(userPrompt, log) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY غير موجود. انسخ .env.example إلى .env وأضف مفتاح API.");
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  await resetWorkspace();

  const input = [{
    role: "user",
    content: [{ type: "input_text", text: userPrompt }]
  }];

  let zipResult = null;
  let response;

  for (let step = 1; step <= MAX_STEPS; step++) {
    log(`AI step ${step}: analyzing/building...`);

    response = await client.responses.create({
      model: MODEL,
      instructions: SYSTEM,
      input,
      tools: [
        ...toolsDefinition(),
        { type: "web_search" }
      ],
      tool_choice: "auto"
    });

    input.push(...response.output);

    const calls = response.output.filter(item => item.type === "function_call");
    if (!calls.length) break;

    for (const call of calls) {
      let args;
      try { args = JSON.parse(call.arguments || "{}"); }
      catch { args = {}; }

      let result;
      try {
        if (call.name === "write_file") {
          result = await writeFileTool(args);
          log(`✓ created ${args.file_path}`);
        } else if (call.name === "read_file") {
          result = await readFileTool(args);
          log(`✓ read ${args.file_path}`);
        } else if (call.name === "list_files") {
          result = await listFilesTool();
          log(`✓ listed project files`);
        } else if (call.name === "create_zip") {
          zipResult = await zipWorkspace();
          result = zipResult;
          log(`✓ ZIP created`);
        } else {
          result = { ok: false, error: "Unknown tool" };
        }
      } catch (err) {
        result = { ok: false, error: err.message };
        log(`✗ ${call.name}: ${err.message}`);
      }

      input.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result)
      });
    }
  }

  const listing = await listFilesTool();
  if (!zipResult && listing.files.length) {
    zipResult = await zipWorkspace();
    log("✓ ZIP created by server");
  }

  return {
    text: response?.output_text || "تم إنشاء المشروع.",
    files: listing.files,
    zip: zipResult?.zip || null
  };
}

app.post("/api/build", async (req, res) => {
  const prompt = String(req.body?.prompt || "").trim();
  if (!prompt) return res.status(400).json({ error: "اكتب وصف المشروع أولاً." });

  const logs = [];
  try {
    const result = await runAgent(prompt, msg => logs.push(msg));
    res.json({ ok: true, logs, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, logs, error: error.message });
  }
});

app.get("/api/files", async (_req, res) => {
  res.json(await listFilesTool());
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    platform: "RobTech",
    phase: 2,
    aiConfigured: Boolean(process.env.OPENAI_API_KEY)
  });
});

app.listen(PORT, () => {
  console.log(`RobTech Phase 2 running on http://localhost:${PORT}`);
});
