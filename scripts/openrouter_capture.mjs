#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const DEFAULT_MODEL = "openrouter/auto";
const DEFAULT_TASK = "general";
const DEFAULT_REGION = "auto";
const DEFAULT_AGENT_PROFILE = "github-copilot";

const OUTPUT_DIR = path.join(process.cwd(), "openrouter");
const ENV_FILE = path.join(OUTPUT_DIR, ".env");

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROUTING_CONFIG_FILE = path.join(SCRIPT_DIR, "gateway-routing.json");
const AGENT_PROFILES_FILE = path.join(SCRIPT_DIR, "agent-profiles.json");

const FALLBACK_ROUTING_CONFIG = {
  version: 1,
  defaultProvider: "openrouter",
  regions: {
    global: {
      blockedModelPatterns: [],
      tasks: {
        general: [DEFAULT_MODEL],
      },
    },
  },
};

const FALLBACK_AGENT_CONFIG = {
  default: DEFAULT_AGENT_PROFILE,
  profiles: {
    [DEFAULT_AGENT_PROFILE]: {
      inlineTextPreview: true,
      emitRouteMarker: true,
      description: "Default profile for GitHub Copilot.",
    },
    generic: {
      inlineTextPreview: true,
      emitRouteMarker: true,
      description: "Fallback profile for unknown agents.",
    },
  },
};

function parseArgs(argv) {
  const positional = [];
  const parsed = {
    prompt: "",
    promptFile: "",
    model: "",
    apiKey: "",
    images: [],
    task: "",
    region: DEFAULT_REGION,
    agentProfile: "",
    allowBlockedModels: false,
    listRoutes: false,
    saveEnv: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === "--help" || token === "-h") {
      parsed.help = true;
      continue;
    }
    if (token === "--prompt") {
      parsed.prompt = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (token === "--prompt-file") {
      parsed.promptFile = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (token === "--model") {
      parsed.model = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (token === "--api-key") {
      parsed.apiKey = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (token === "--image") {
      parsed.images.push(argv[i + 1] ?? "");
      i += 1;
      continue;
    }
    if (token === "--task") {
      parsed.task = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (token === "--region") {
      parsed.region = argv[i + 1] ?? DEFAULT_REGION;
      i += 1;
      continue;
    }
    if (token === "--agent") {
      parsed.agentProfile = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (token === "--allow-blocked-models") {
      parsed.allowBlockedModels = true;
      continue;
    }
    if (token === "--list-routes") {
      parsed.listRoutes = true;
      continue;
    }
    if (token === "--save-env") {
      parsed.saveEnv = true;
      continue;
    }

    positional.push(token);
  }

  if (!parsed.prompt && positional.length > 0) {
    parsed.prompt = positional.join(" ");
  }

  return parsed;
}

function printHelp() {
  console.log(
    "Usage: node openrouter_capture.mjs [--prompt \"<message>\" | --prompt-file <file>] [--image <path-or-url>] [--task <task>] [--region <global|cn-mainland|auto>] [--agent <profile>] [--model <model-id>] [--api-key <key>] [--allow-blocked-models] [--list-routes] [--save-env]"
  );
  console.log("Repeat --image to attach multiple images. If prompt is omitted and images are provided, image-only input is sent.");
  console.log("Use --prompt-file for long markdown/text input to avoid shell quoting issues.");
}

async function loadJsonConfig(filePath, fallbackValue) {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : fallbackValue;
  } catch {
    return fallbackValue;
  }
}

function compilePatterns(rawPatterns) {
  const patterns = [];
  for (const p of rawPatterns || []) {
    if (typeof p !== "string" || !p.trim()) {
      continue;
    }
    try {
      patterns.push(new RegExp(p, "i"));
    } catch {
      // Ignore malformed regex patterns.
    }
  }
  return patterns;
}

function isModelBlocked(modelId, compiledPatterns) {
  const target = String(modelId || "").trim();
  if (!target) {
    return false;
  }
  return compiledPatterns.some((rule) => rule.test(target));
}

function resolveRegion(regionArg) {
  const normalizedArg = String(regionArg || "").trim();
  if (normalizedArg && normalizedArg !== DEFAULT_REGION) {
    return normalizedArg;
  }

  const envRegion =
    (process.env.OPENCLAW_REGION || process.env.OPENROUTER_REGION || process.env.GATEWAY_REGION || "")
      .trim()
      .toLowerCase();

  if (envRegion && envRegion !== DEFAULT_REGION) {
    return envRegion;
  }

  return "global";
}

function resolveRoute({ args, envModelId, routingConfig }) {
  const regions = routingConfig?.regions || {};
  const resolvedRegion = resolveRegion(args.region);
  const regionPolicy = regions[resolvedRegion] || regions.global || FALLBACK_ROUTING_CONFIG.regions.global;

  const task = String(args.task || DEFAULT_TASK).trim().toLowerCase() || DEFAULT_TASK;
  const taskCandidates =
    regionPolicy?.tasks?.[task] || regionPolicy?.tasks?.[DEFAULT_TASK] || [DEFAULT_MODEL];

  const blockedPatterns = compilePatterns(regionPolicy?.blockedModelPatterns || []);
  const argModel = String(args.model || "").trim();
  const envModel = String(envModelId || "").trim();

  if (argModel) {
    const blocked = isModelBlocked(argModel, blockedPatterns);
    if (blocked && !args.allowBlockedModels) {
      throw new Error(
        `Model blocked by routing policy for region=${resolvedRegion}: ${argModel}. Use --allow-blocked-models to override explicitly.`
      );
    }

    return {
      provider: routingConfig?.defaultProvider || "openrouter",
      region: resolvedRegion,
      task,
      modelId: argModel,
      source: "arg",
      blockedByPolicy: blocked,
      usedFallback: false,
    };
  }

  if (envModel && (!isModelBlocked(envModel, blockedPatterns) || args.allowBlockedModels)) {
    return {
      provider: routingConfig?.defaultProvider || "openrouter",
      region: resolvedRegion,
      task,
      modelId: envModel,
      source: "env",
      blockedByPolicy: isModelBlocked(envModel, blockedPatterns),
      usedFallback: false,
    };
  }

  for (const candidate of taskCandidates) {
    if (!candidate) {
      continue;
    }
    if (!isModelBlocked(candidate, blockedPatterns)) {
      return {
        provider: routingConfig?.defaultProvider || "openrouter",
        region: resolvedRegion,
        task,
        modelId: candidate,
        source: "route",
        blockedByPolicy: false,
        usedFallback: candidate === DEFAULT_MODEL,
      };
    }
  }

  return {
    provider: routingConfig?.defaultProvider || "openrouter",
    region: resolvedRegion,
    task,
    modelId: DEFAULT_MODEL,
    source: "default",
    blockedByPolicy: false,
    usedFallback: true,
  };
}

function resolveAgentProfile(agentArg, agentConfig) {
  const profiles = agentConfig?.profiles || {};
  const requested = String(agentArg || "").trim() || agentConfig?.default || DEFAULT_AGENT_PROFILE;
  const profile = profiles[requested] || profiles.generic || FALLBACK_AGENT_CONFIG.profiles.generic;

  return {
    key: profiles[requested] ? requested : "generic",
    ...profile,
  };
}

function looksLikeRemoteImage(input) {
  return /^https?:\/\//i.test(input) || /^data:/i.test(input);
}

function guessMimeFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".bmp") return "image/bmp";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

async function resolveImageInputToUrl(imageInput) {
  const value = String(imageInput || "").trim();
  if (!value) {
    throw new Error("--image requires a non-empty value.");
  }

  if (looksLikeRemoteImage(value)) {
    return value;
  }

  const absolutePath = path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
  const bytes = await readFile(absolutePath);
  const mime = guessMimeFromPath(absolutePath);
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

async function resolveImageInputs(imageInputs) {
  const urls = [];
  for (const input of imageInputs) {
    urls.push(await resolveImageInputToUrl(input));
  }
  return urls;
}

function buildUserMessageContent(prompt, imageUrls) {
  const trimmedPrompt = String(prompt || "").trim();

  if (imageUrls.length === 0) {
    return trimmedPrompt;
  }

  const content = [];
  if (trimmedPrompt) {
    content.push({ type: "text", text: trimmedPrompt });
  }

  for (const url of imageUrls) {
    content.push({
      type: "image_url",
      imageUrl: { url },
    });
  }

  return content;
}

function parseEnvLine(line) {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (!match) {
    return null;
  }

  const key = match[1];
  let value = match[2] ?? "";
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return [key, value];
}

async function loadWorkspaceEnvFile() {
  try {
    const raw = await readFile(ENV_FILE, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const pair = parseEnvLine(trimmed);
      if (!pair) {
        continue;
      }
      const [key, value] = pair;
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env does not exist yet.
  }
}

function envQuote(value) {
  return `"${value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")}"`;
}

async function saveWorkspaceEnvFile(runtimeEnv) {
  const content = [
    "# OpenRouter/OpenClaw runtime variables for this workspace",
    `OPENROUTER_API_KEY=${envQuote(runtimeEnv.apiKey)}`,
    `OPENROUTER_MODEL_ID=${envQuote(runtimeEnv.modelId)}`,
    `OPENROUTER_REGION=${envQuote(runtimeEnv.region)}`,
    `OPENCLAW_AGENT_PROFILE=${envQuote(runtimeEnv.agentProfile)}`,
    "",
  ].join("\n");

  await writeFile(ENV_FILE, content, { encoding: "utf8", mode: 0o600 });
}

function stampNow() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function imageExtFromMime(mime) {
  const normalized = String(mime || "").toLowerCase();
  if (normalized.includes("png")) return "png";
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("gif")) return "gif";
  if (normalized.includes("bmp")) return "bmp";
  if (normalized.includes("svg")) return "svg";
  return "png";
}

function imageExtFromUrl(rawUrl) {
  try {
    const ext = path.extname(new URL(rawUrl).pathname).toLowerCase().replace(".", "");
    if (["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"].includes(ext)) {
      return ext === "jpeg" ? "jpg" : ext;
    }
  } catch {
    // Ignore URL parsing errors.
  }
  return "png";
}

function extractTextAndImages(response) {
  const choice = response?.choices?.[0] ?? {};
  const message = choice?.message ?? {};

  const textParts = [];
  const imageUrls = [];

  if (typeof message.content === "string" && message.content.trim()) {
    textParts.push(message.content.trim());
  }

  if (Array.isArray(message.content)) {
    for (const item of message.content) {
      if (!item || typeof item !== "object") {
        continue;
      }

      if (item.type === "text" && typeof item.text === "string" && item.text.trim()) {
        textParts.push(item.text.trim());
      }

      if (item.type === "image_url") {
        const url = item.imageUrl?.url || item.image_url?.url;
        if (typeof url === "string" && url.trim()) {
          imageUrls.push(url.trim());
        }
      }
    }
  }

  if (Array.isArray(message.images)) {
    for (const image of message.images) {
      const url = image?.imageUrl?.url || image?.image_url?.url;
      if (typeof url === "string" && url.trim()) {
        imageUrls.push(url.trim());
      }
    }
  }

  return {
    text: textParts.join("\n\n").trim(),
    imageUrls: [...new Set(imageUrls)],
  };
}

function printRouteMarker(routeInfo, agentProfile) {
  if (agentProfile?.emitRouteMarker === false) {
    return;
  }

  const payload = {
    provider: routeInfo.provider,
    region: routeInfo.region,
    task: routeInfo.task,
    model: routeInfo.modelId,
    source: routeInfo.source,
    fallback: routeInfo.usedFallback,
    agent: agentProfile.key,
  };

  console.log(`[ROUTE] ${JSON.stringify(payload)}`);
}

async function writeTextResult(modelId, text, routeInfo, agentProfile) {
  const filePath = path.join(OUTPUT_DIR, `${stampNow()}-response.md`);
  const markdown = [
    "# OpenRouter Response",
    "",
    `- Model: \`${modelId}\``,
    `- Time: ${new Date().toISOString()}`,
    `- Region: ${routeInfo.region}`,
    `- Task: ${routeInfo.task}`,
    `- Agent Profile: ${agentProfile.key}`,
    "",
    "---",
    "",
    text,
    "",
  ].join("\n");

  await writeFile(filePath, markdown, "utf8");

  console.log(`[TEXT_FILE] ${filePath}`);

  if (agentProfile.inlineTextPreview === false) {
    console.log(`[TEXT_PREVIEW_SKIPPED] agent=${agentProfile.key}`);
    return filePath;
  }

  const printed = await readFile(filePath, "utf8");
  console.log("[TEXT_CONTENT_BEGIN]");
  console.log(printed);
  console.log("[TEXT_CONTENT_END]");

  return filePath;
}

async function materializeImage(url, index) {
  const stamp = stampNow();

  if (url.startsWith("data:")) {
    const match = url.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      throw new Error(`Unsupported data URL format for image #${index + 1}`);
    }

    const mime = match[1];
    const data = match[2];
    const ext = imageExtFromMime(mime);
    const filePath = path.join(OUTPUT_DIR, `${stamp}-image-${index + 1}.${ext}`);

    await writeFile(filePath, Buffer.from(data, "base64"));
    return filePath;
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download image #${index + 1}: HTTP ${res.status}`);
  }

  const mime = res.headers.get("content-type") || "";
  const ext = mime ? imageExtFromMime(mime) : imageExtFromUrl(url);
  const filePath = path.join(OUTPUT_DIR, `${stamp}-image-${index + 1}.${ext}`);
  const bytes = Buffer.from(await res.arrayBuffer());

  await writeFile(filePath, bytes);
  return filePath;
}

async function writeImageResults(imageUrls) {
  const paths = [];
  for (let i = 0; i < imageUrls.length; i += 1) {
    const filePath = await materializeImage(imageUrls[i], i);
    paths.push(filePath);
    console.log(`[IMAGE_FILE] ${filePath}`);
  }
  return paths;
}

async function getPrompt(parsedArgs) {
  if (parsedArgs.prompt && parsedArgs.prompt.trim()) {
    return parsedArgs.prompt.trim();
  }

  if (parsedArgs.promptFile && parsedArgs.promptFile.trim()) {
    const resolved = path.isAbsolute(parsedArgs.promptFile)
      ? parsedArgs.promptFile
      : path.resolve(process.cwd(), parsedArgs.promptFile);

    try {
      const fromFile = await readFile(resolved, "utf8");
      if (fromFile.trim()) {
        return fromFile.trim();
      }
      throw new Error(`Prompt file is empty: ${resolved}`);
    } catch (error) {
      throw new Error(`Failed to read --prompt-file: ${resolved} (${error?.message || String(error)})`);
    }
  }

  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(String(chunk));
    }
    const fromStdin = chunks.join("").trim();
    if (fromStdin) {
      return fromStdin;
    }
  }

  // Allow image-only requests without prompting for text.
  if (Array.isArray(parsedArgs.images) && parsedArgs.images.length > 0) {
    return "";
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question("Enter prompt to send to OpenRouter: ")).trim();
  rl.close();

  if (!answer) {
    throw new Error("Prompt is required.");
  }

  return answer;
}

async function ensureRuntimeEnv(parsedArgs) {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await loadWorkspaceEnvFile();

  const envApiKey = (process.env.OPENROUTER_API_KEY || "").trim();
  const envModelId = (process.env.OPENROUTER_MODEL_ID || "").trim();
  const envRegion = (process.env.OPENROUTER_REGION || "").trim();
  const envAgentProfile = (process.env.OPENCLAW_AGENT_PROFILE || "").trim();
  const argApiKey = (parsedArgs.apiKey || "").trim();

  const apiKey = argApiKey || envApiKey;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is required. Provide it via --api-key, environment variable, or openrouter/.env."
    );
  }

  return {
    apiKey,
    argApiKey,
    envApiKey,
    envModelId,
    envRegion,
    envAgentProfile,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const routingConfig = await loadJsonConfig(ROUTING_CONFIG_FILE, FALLBACK_ROUTING_CONFIG);
  const agentConfig = await loadJsonConfig(AGENT_PROFILES_FILE, FALLBACK_AGENT_CONFIG);

  if (args.listRoutes) {
    console.log(JSON.stringify(routingConfig, null, 2));
    return;
  }

  const runtime = await ensureRuntimeEnv(args);
  const routeInfo = resolveRoute({
    args,
    envModelId: runtime.envModelId,
    routingConfig,
  });
  const agentProfile = resolveAgentProfile(args.agentProfile, agentConfig);

  const shouldSaveEnv =
    args.saveEnv ||
    !runtime.envApiKey ||
    !runtime.envModelId ||
    !runtime.envRegion ||
    !runtime.envAgentProfile;

  process.env.OPENROUTER_API_KEY = runtime.apiKey;
  process.env.OPENROUTER_MODEL_ID = routeInfo.modelId;
  process.env.OPENROUTER_REGION = routeInfo.region;
  process.env.OPENCLAW_AGENT_PROFILE = agentProfile.key;

  if (shouldSaveEnv) {
    await saveWorkspaceEnvFile({
      apiKey: runtime.apiKey,
      modelId: routeInfo.modelId,
      region: routeInfo.region,
      agentProfile: agentProfile.key,
    });
  }

  printRouteMarker(routeInfo, agentProfile);

  const prompt = await getPrompt(args);
  const imageUrls = await resolveImageInputs(args.images);
  const userContent = buildUserMessageContent(prompt, imageUrls);

  const { OpenRouter } = await import("@openrouter/sdk");
  const client = new OpenRouter({ apiKey: runtime.apiKey });

  const response = await client.chat.send({
    chatGenerationParams: {
      model: routeInfo.modelId || DEFAULT_MODEL,
      messages: [
        {
          role: "user",
          content: userContent,
        },
      ],
    },
  });

  const parsed = extractTextAndImages(response);

  if (parsed.text) {
    await writeTextResult(routeInfo.modelId || DEFAULT_MODEL, parsed.text, routeInfo, agentProfile);
  }

  if (parsed.imageUrls.length > 0) {
    await writeImageResults(parsed.imageUrls);
  }

  if (!parsed.text && parsed.imageUrls.length === 0) {
    const fallbackPath = path.join(OUTPUT_DIR, `${stampNow()}-raw-response.md`);
    const raw = [
      "# OpenRouter Raw Response",
      "",
      "No text/image blocks were detected. Raw JSON is preserved below.",
      "",
      "```json",
      JSON.stringify(response, null, 2),
      "```",
      "",
    ].join("\n");
    await writeFile(fallbackPath, raw, "utf8");
    console.log(`[RAW_FILE] ${fallbackPath}`);
  }
}

main().catch((error) => {
  console.error(`[ERROR] ${error?.message || String(error)}`);
  process.exitCode = 1;
});
