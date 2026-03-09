#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const DEFAULT_PROVIDER = "openrouter";
const DEFAULT_MODEL = "openrouter/auto";
const DEFAULT_AGENT_PROFILE = "github-copilot";

const PROFILE_SET_ENV_KEY = "OPENROUTER_PROFILE_SET";
const DEFAULT_ALIAS_ENV_KEY = "OPENROUTER_DEFAULT_ALIAS";
const AGENT_PROFILE_ENV_KEY = "OPENCLAW_AGENT_PROFILE";

const OUTPUT_DIR = path.join(process.cwd(), "openrouter");
const ENV_FILE = path.join(OUTPUT_DIR, ".env");

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const AGENT_PROFILES_FILE = path.join(SCRIPT_DIR, "agent-profiles.json");

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
    images: [],
    alias: "",
    defaultAlias: "",
    agentProfile: "",
    listAliases: false,
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
    if (token === "--image") {
      parsed.images.push(argv[i + 1] ?? "");
      i += 1;
      continue;
    }
    if (token === "--alias") {
      parsed.alias = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (token === "--default-alias") {
      parsed.defaultAlias = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (token === "--agent") {
      parsed.agentProfile = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (token === "--list-aliases") {
      parsed.listAliases = true;
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
    "Usage: node openrouter_capture.mjs [--prompt \"<message>\" | --prompt-file <file>] [--image <path-or-url>] [--alias <alias>] [--default-alias <alias>] [--agent <profile>] [--list-aliases] [--save-env]"
  );
  console.log("Repeat --image to attach multiple images. If prompt is omitted and images are provided, image-only input is sent.");
  console.log("Credential format in env setup: <alias>:<apikey>:<modelid> (at least one entry).");
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

function resolveAgentProfile(agentArg, agentConfig) {
  const profiles = agentConfig?.profiles || {};
  const requested = String(agentArg || "").trim() || agentConfig?.default || DEFAULT_AGENT_PROFILE;
  const profile = profiles[requested] || profiles.generic || FALLBACK_AGENT_CONFIG.profiles.generic;

  return {
    key: profiles[requested] ? requested : "generic",
    ...profile,
  };
}

function parseProfileEntry(rawEntry) {
  const value = String(rawEntry || "").trim();
  if (!value) {
    throw new Error("Profile entry is empty.");
  }

  const parts = value.split(":");
  if (parts.length < 3) {
    throw new Error(`Invalid profile entry: ${value}. Expected <alias>:<apikey>:<modelid>.`);
  }

  const alias = String(parts[0] || "").trim();
  const apiKey = String(parts[1] || "").trim();
  const modelId = String(parts.slice(2).join(":") || "").trim();

  if (!alias || !apiKey || !modelId) {
    throw new Error(`Invalid profile entry: ${value}. Expected <alias>:<apikey>:<modelid>.`);
  }

  if (!/^[A-Za-z0-9._-]+$/.test(alias)) {
    throw new Error(`Invalid alias: ${alias}. Allowed characters: letters, numbers, dot, underscore, hyphen.`);
  }

  return { alias, apiKey, modelId };
}

function parseProfileSet(rawProfileSet) {
  const source = String(rawProfileSet || "").trim();
  const profileMap = new Map();

  if (!source) {
    return profileMap;
  }

  for (const chunk of source.split(",")) {
    const item = chunk.trim();
    if (!item) {
      continue;
    }
    const parsed = parseProfileEntry(item);
    profileMap.set(parsed.alias, parsed);
  }

  return profileMap;
}

function serializeProfileSet(profileMap) {
  return Array.from(profileMap.values())
    .map((item) => `${item.alias}:${item.apiKey}:${item.modelId}`)
    .join(",");
}

async function promptProfileSetFromUser() {
  if (!process.stdin.isTTY) {
    throw new Error(
      `${PROFILE_SET_ENV_KEY} is missing and interactive setup is unavailable. Set ${PROFILE_SET_ENV_KEY} with at least one <alias>:<apikey>:<modelid> entry.`
    );
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const profileMap = new Map();

  try {
    while (true) {
      const hint =
        profileMap.size === 0
          ? "Enter profile <alias>:<apikey>:<modelid> (required): "
          : "Enter profile <alias>:<apikey>:<modelid> (blank to finish): ";
      const answer = (await rl.question(hint)).trim();

      if (!answer) {
        if (profileMap.size === 0) {
          console.log("At least one profile is required.");
          continue;
        }
        break;
      }

      try {
        const parsed = parseProfileEntry(answer);
        profileMap.set(parsed.alias, parsed);
        console.log(`Registered alias: ${parsed.alias}`);
      } catch (error) {
        console.log(`[WARN] ${error?.message || String(error)}`);
      }
    }

    const aliases = Array.from(profileMap.keys());
    const fallbackDefault = aliases[0];

    while (true) {
      const rawDefault = (await rl.question(`Default alias [${fallbackDefault}]: `)).trim();
      const selectedDefault = rawDefault || fallbackDefault;

      if (profileMap.has(selectedDefault)) {
        return { profileMap, defaultAlias: selectedDefault };
      }

      console.log(`Unknown alias: ${selectedDefault}. Available aliases: ${aliases.join(", ")}`);
    }
  } finally {
    rl.close();
  }
}

async function resolveSelectedAlias(argsAlias, defaultAlias, profileMap) {
  const aliases = Array.from(profileMap.keys());
  if (aliases.length === 0) {
    throw new Error("No profiles available. Provide at least one profile entry.");
  }

  if (argsAlias) {
    const normalized = String(argsAlias).trim();
    if (!profileMap.has(normalized)) {
      throw new Error(`Unknown alias: ${normalized}. Available aliases: ${aliases.join(", ")}`);
    }
    return { alias: normalized, source: "arg" };
  }

  const fallbackDefault = defaultAlias && profileMap.has(defaultAlias) ? defaultAlias : aliases[0];

  if (process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = (await rl.question(`Alias to use [${aliases.join("/")}] (default: ${fallbackDefault}): `)).trim();
      const selected = answer || fallbackDefault;
      if (!profileMap.has(selected)) {
        throw new Error(`Unknown alias: ${selected}. Available aliases: ${aliases.join(", ")}`);
      }
      return { alias: selected, source: answer ? "prompt" : "default" };
    } finally {
      rl.close();
    }
  }

  return { alias: fallbackDefault, source: "default" };
}

function listAliases(profileMap, defaultAlias) {
  const aliases = Array.from(profileMap.keys());
  if (aliases.length === 0) {
    console.log("No aliases configured.");
    return;
  }

  console.log("Configured aliases:");
  for (const alias of aliases) {
    const profile = profileMap.get(alias);
    const isDefault = alias === defaultAlias ? " (default)" : "";
    console.log(`- ${alias}${isDefault} -> ${profile.modelId}`);
  }
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
    `${PROFILE_SET_ENV_KEY}=${envQuote(runtimeEnv.profileSetRaw)}`,
    `${DEFAULT_ALIAS_ENV_KEY}=${envQuote(runtimeEnv.defaultAlias)}`,
    `${AGENT_PROFILE_ENV_KEY}=${envQuote(runtimeEnv.agentProfile)}`,
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
    alias: routeInfo.alias,
    model: routeInfo.modelId,
    source: routeInfo.source,
    agent: agentProfile.key,
  };

  console.log(`[ROUTE] ${JSON.stringify(payload)}`);
}

async function writeTextResult(modelId, alias, text, agentProfile) {
  const filePath = path.join(OUTPUT_DIR, `${stampNow()}-response.md`);
  const markdown = [
    "# OpenRouter Response",
    "",
    `- Alias: ${alias}`,
    `- Model: \`${modelId}\``,
    `- Time: ${new Date().toISOString()}`,
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

async function loadRuntimeState() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await loadWorkspaceEnvFile();

  const envProfileSetRaw = String(process.env[PROFILE_SET_ENV_KEY] || "").trim();
  const envDefaultAlias = String(process.env[DEFAULT_ALIAS_ENV_KEY] || "").trim();
  const envAgentProfile = String(process.env[AGENT_PROFILE_ENV_KEY] || "").trim();

  const profileMap = parseProfileSet(envProfileSetRaw);

  if (profileMap.size === 0) {
    const seeded = await promptProfileSetFromUser();
    return {
      profileMap: seeded.profileMap,
      defaultAlias: seeded.defaultAlias,
      envAgentProfile,
      profileSeededInteractively: true,
    };
  }

  const aliases = Array.from(profileMap.keys());
  const defaultAlias = profileMap.has(envDefaultAlias) ? envDefaultAlias : aliases[0];

  return {
    profileMap,
    defaultAlias,
    envAgentProfile,
    profileSeededInteractively: false,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const agentConfig = await loadJsonConfig(AGENT_PROFILES_FILE, FALLBACK_AGENT_CONFIG);
  const runtime = await loadRuntimeState();

  if (args.defaultAlias && !runtime.profileMap.has(args.defaultAlias)) {
    throw new Error(
      `Unknown --default-alias: ${args.defaultAlias}. Available aliases: ${Array.from(runtime.profileMap.keys()).join(", ")}`
    );
  }

  const configuredDefaultAlias = args.defaultAlias || runtime.defaultAlias;

  if (args.listAliases) {
    listAliases(runtime.profileMap, configuredDefaultAlias);
    return;
  }

  const agentProfile = resolveAgentProfile(args.agentProfile || runtime.envAgentProfile, agentConfig);
  const selectedAlias = await resolveSelectedAlias(args.alias, configuredDefaultAlias, runtime.profileMap);
  const selectedProfile = runtime.profileMap.get(selectedAlias.alias);

  const shouldSaveEnv =
    args.saveEnv ||
    runtime.profileSeededInteractively ||
    !process.env[PROFILE_SET_ENV_KEY] ||
    !process.env[DEFAULT_ALIAS_ENV_KEY] ||
    !process.env[AGENT_PROFILE_ENV_KEY];

  process.env[PROFILE_SET_ENV_KEY] = serializeProfileSet(runtime.profileMap);
  process.env[DEFAULT_ALIAS_ENV_KEY] = configuredDefaultAlias;
  process.env[AGENT_PROFILE_ENV_KEY] = agentProfile.key;

  if (shouldSaveEnv) {
    await saveWorkspaceEnvFile({
      profileSetRaw: process.env[PROFILE_SET_ENV_KEY],
      defaultAlias: process.env[DEFAULT_ALIAS_ENV_KEY],
      agentProfile: process.env[AGENT_PROFILE_ENV_KEY],
    });
  }

  printRouteMarker(
    {
      provider: DEFAULT_PROVIDER,
      alias: selectedAlias.alias,
      modelId: selectedProfile.modelId,
      source: selectedAlias.source,
    },
    agentProfile
  );

  const prompt = await getPrompt(args);
  const imageUrls = await resolveImageInputs(args.images);
  const userContent = buildUserMessageContent(prompt, imageUrls);

  const { OpenRouter } = await import("@openrouter/sdk");
  const client = new OpenRouter({ apiKey: selectedProfile.apiKey });

  const response = await client.chat.send({
    chatGenerationParams: {
      model: selectedProfile.modelId || DEFAULT_MODEL,
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
    await writeTextResult(selectedProfile.modelId || DEFAULT_MODEL, selectedAlias.alias, parsed.text, agentProfile);
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
