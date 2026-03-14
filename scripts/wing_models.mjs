#!/usr/bin/env node
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { parse as parseDotEnv } from "dotenv";
import { exec as execCallback } from "node:child_process";
import { promisify } from "node:util";
import OpenAI from "openai";

const exec = promisify(execCallback);

const DEFAULT_PROVIDER = "openai-compatible";
const DEFAULT_MODEL = "gpt-4o";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";

const PROFILE_SET_ENV_KEY = "WING_MODELS_PROFILE_SET";
const ALIAS_PATTERN = /^[\p{L}\p{N}._-]+$/u;

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.dirname(SCRIPT_DIR);
const WORKING_DIR = process.cwd();
const OUTPUT_DIR = WORKING_DIR;
const ENV_FILE = path.join(SKILL_ROOT, ".3rd.env");

function parseArgs(argv) {
  const positional = [];
  const parsed = {
    prompt: "",
    promptFile: "",
    attachments: [],
    alias: "",
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
    if (token === "--attachment" || token === "--image") {
      parsed.attachments.push(argv[i + 1] ?? "");
      i += 1;
      continue;
    }
    if (token === "--alias") {
      parsed.alias = argv[i + 1] ?? "";
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
    "Usage: node wing_models.mjs [--prompt \"<message>\" | --prompt-file <file>] [--attachment <path-or-url>] [--alias <alias>] [--list-aliases] [--save-env]"
  );
  console.log("Repeat --attachment to attach multiple files. If prompt is omitted and attachments are provided, attachment-only input is sent.");
  console.log("`--image` remains available as a deprecated alias of `--attachment`.");
  console.log("Credential setup uses required steps: alias -> baseurl -> apikey -> modelid; optional: note.");
}

function isValidAlias(alias) {
  return ALIAS_PATTERN.test(alias);
}

function parseProfileObject(rawObject, indexHint = "?") {
  if (!rawObject || typeof rawObject !== "object") {
    throw new Error(`Invalid profile object at index=${indexHint}.`);
  }

  const alias = String(rawObject.alias || "").trim();
  const apiKey = String(rawObject.apiKey || "").trim();
  const baseURL = String(rawObject.baseURL || "").trim() || DEFAULT_BASE_URL;
  const modelId = String(rawObject.modelId || "").trim();
  const note = String(rawObject.note || "").trim();

  if (!alias || !apiKey || !modelId) {
    throw new Error(`Invalid profile object at index=${indexHint}. alias/apiKey/modelId are required.`);
  }

  if (!isValidAlias(alias)) {
    throw new Error(`Invalid alias: ${alias}. Allowed characters: Unicode letters/numbers, dot, underscore, hyphen.`);
  }

  return { alias, apiKey, baseURL, modelId, note };
}

function parseProfileSet(rawProfileSet) {
  const source = normalizeProfileSetSource(rawProfileSet);
  const profileMap = new Map();

  if (!source) {
    return profileMap;
  }

  if (!source.startsWith("[") && !source.startsWith("{")) {
    throw new Error(
      `Invalid ${PROFILE_SET_ENV_KEY} format. Use JSON like WING_MODELS_PROFILE_SET=[{"alias":"default","apiKey":"<key>","baseURL":"https://api.openai.com/v1","modelId":"gpt-4o","note":""}]`
    );
  }

  const parsed = JSON.parse(source);
  const items = Array.isArray(parsed) ? parsed : [parsed];
  items.forEach((item, idx) => {
    const profile = parseProfileObject(item, idx);
    profileMap.set(profile.alias, profile);
  });
  return profileMap;
}

function stripOuterQuotes(value) {
  const source = String(value || "").trim();
  if (!source) {
    return source;
  }

  const hasDoubleQuotes = source.startsWith('"') && source.endsWith('"');
  const hasSingleQuotes = source.startsWith("'") && source.endsWith("'");
  if (hasDoubleQuotes || hasSingleQuotes) {
    return source.slice(1, -1).trim();
  }
  return source;
}

function normalizeProfileSetSource(rawProfileSet) {
  let source = String(rawProfileSet || "").trim();

  if (!source) {
    return source;
  }

  for (let i = 0; i < 4; i += 1) {
    const unquoted = stripOuterQuotes(source);
    if (unquoted !== source) {
      source = unquoted;
      continue;
    }

    if (!source.startsWith("[") && !source.startsWith("{")) {
      return source;
    }

    try {
      JSON.parse(source);
      return source;
    } catch {
      const decoded = source
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");

      if (decoded === source) {
        break;
      }
      source = decoded.trim();
    }
  }

  return source;
}

function serializeProfileSet(profileMap) {
  return JSON.stringify(Array.from(profileMap.values()));
}

async function askRequiredInput(rl, question, validateFn) {
  while (true) {
    const value = (await rl.question(question)).trim();
    if (!value) {
      console.log("This field is required.");
      continue;
    }
    if (typeof validateFn === "function") {
      try {
        validateFn(value);
      } catch (error) {
        console.log(`[WARN] ${error?.message || String(error)}`);
        continue;
      }
    }
    return value;
  }
}

function normalizeOptionalNoteInput(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return "";
  }

  const lowered = value.toLowerCase();
  if (lowered === "skip" || lowered === "none" || lowered === "n/a" || value === "-" || value === "跳过" || value === "无") {
    return "";
  }

  return value;
}

async function promptProfileSetFromUser() {
  if (!process.stdin.isTTY) {
    throw new Error(
      `${PROFILE_SET_ENV_KEY} is missing and interactive setup is unavailable. Initialize at least one profile in interactive mode first.`
    );
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const profileMap = new Map();

  try {
    while (true) {
      const alias = await askRequiredInput(rl, "Alias (required): ", (value) => {
        if (!isValidAlias(value)) {
          throw new Error("Alias can only contain Unicode letters/numbers, dot, underscore, hyphen.");
        }
      });
      const baseURLRaw = await rl.question(`Base URL (optional, press Enter for default: ${DEFAULT_BASE_URL}): `);
      const baseURL = baseURLRaw.trim() || DEFAULT_BASE_URL;
      const apiKey = await askRequiredInput(rl, "API key (required): ");
      const modelId = await askRequiredInput(rl, "Model id (required): ");
      const noteRaw = await rl.question("Note (optional, press Enter to skip; skip/跳过/- also accepted): ");
      const note = normalizeOptionalNoteInput(noteRaw);

      const parsed = parseProfileObject({ alias, apiKey, baseURL, modelId, note }, profileMap.size + 1);
      profileMap.set(parsed.alias, parsed);
      console.log(`Registered alias: ${parsed.alias}`);

      if (profileMap.size >= 1) {
        const addMore = (await rl.question("Add another profile? [y/N]: ")).trim().toLowerCase();
        if (addMore !== "y" && addMore !== "yes") {
          break;
        }
      }
    }

    return profileMap;
  } finally {
    rl.close();
  }
}

async function resolveSelectedAlias(argsAlias, profileMap) {
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

  throw new Error(
    `--alias is required. Available aliases: ${aliases.join(", ")}`
  );
}

function listAliases(profileMap) {
  const aliases = Array.from(profileMap.keys());
  if (aliases.length === 0) {
    console.log("No aliases configured.");
    return;
  }

  console.log("Configured aliases:");
  for (const alias of aliases) {
    const profile = profileMap.get(alias);
    const note = profile.note ? ` | note: ${profile.note}` : "";
    const baseUrl = profile.baseURL || DEFAULT_BASE_URL;
    console.log(`- ${alias} -> ${profile.modelId} @ ${baseUrl}${note}`);
  }
}

function guessMimeFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeByExtension = {
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".json": "application/json",
    ".csv": "text/csv",
    ".tsv": "text/tab-separated-values",
    ".xml": "application/xml",
    ".yaml": "application/yaml",
    ".yml": "application/yaml",
    ".html": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".cjs": "text/javascript",
    ".ts": "application/typescript",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".zip": "application/zip",
    ".gz": "application/gzip",
    ".tar": "application/x-tar",
    ".7z": "application/x-7z-compressed",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
    ".m4a": "audio/mp4",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".avi": "video/x-msvideo",
    ".mkv": "video/x-matroska",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".svg": "image/svg+xml",
  };
  if (mimeByExtension[ext]) {
    return mimeByExtension[ext];
  }
  return "application/octet-stream";
}

function normalizeAttachmentExtension(filePath, mime = "") {
  const fromPath = path.extname(String(filePath || "")).toLowerCase().replace(".", "");
  if (/^[a-z0-9]{1,12}$/.test(fromPath)) {
    return fromPath;
  }
  return attachmentExtFromMime(mime);
}

function dataUrlToBuffer(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Unsupported data URL format.");
  }
  return {
    mime: match[1],
    bytes: Buffer.from(match[2], "base64"),
  };
}

async function resolveAttachmentInput(attachmentInput, index, stamp) {
  const value = String(attachmentInput || "").trim();
  if (!value) {
    throw new Error("--attachment requires a non-empty value.");
  }

  const outputPrefix = path.join(OUTPUT_DIR, `${stamp}-input-attachment-${index + 1}`);

  if (value.startsWith("data:")) {
    const decoded = dataUrlToBuffer(value);
    const ext = normalizeAttachmentExtension("", decoded.mime);
    const filename = `attachment-${index + 1}.${ext}`;
    const savedPath = `${outputPrefix}.${ext}`;
    await writeFile(savedPath, decoded.bytes);
    return {
      requestPart: buildAttachmentRequestPart(value, decoded.mime, filename),
      savedPath,
    };
  }

  if (/^https?:\/\//i.test(value)) {
    const res = await fetch(value);
    if (!res.ok) {
      throw new Error(`Failed to download input attachment #${index + 1}: HTTP ${res.status}`);
    }
    const mime = String(res.headers.get("content-type") || "application/octet-stream").split(";")[0].trim();
    const bytes = Buffer.from(await res.arrayBuffer());
    const ext = normalizeAttachmentExtension(value, mime);
    const filename = resolveAttachmentFilename(value, index, ext);
    const savedPath = `${outputPrefix}.${ext}`;
    const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;

    await writeFile(savedPath, bytes);
    return {
      requestPart: buildAttachmentRequestPart(dataUrl, mime, filename),
      savedPath,
    };
  }

  const absolutePath = path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
  const bytes = await readFile(absolutePath);
  const mime = guessMimeFromPath(absolutePath);
  const ext = normalizeAttachmentExtension(absolutePath, mime);
  const filename = resolveAttachmentFilename(absolutePath, index, ext);
  const savedPath = `${outputPrefix}.${ext}`;
  const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;

  await writeFile(savedPath, bytes);
  return {
    requestPart: buildAttachmentRequestPart(dataUrl, mime, filename),
    savedPath,
  };
}

function resolveAttachmentFilename(rawInput, index, fallbackExt) {
  const fallback = `attachment-${index + 1}.${fallbackExt}`;

  if (!rawInput || String(rawInput).startsWith("data:")) {
    return fallback;
  }

  try {
    if (/^https?:\/\//i.test(rawInput)) {
      const fromUrl = path.basename(new URL(rawInput).pathname);
      if (fromUrl && fromUrl !== "/" && fromUrl !== ".") {
        return path.extname(fromUrl) ? fromUrl : `${fromUrl}.${fallbackExt}`;
      }
      return fallback;
    }
  } catch {
    // Ignore URL parse failures and fallback to basename/path logic.
  }

  const fromPath = path.basename(String(rawInput));
  if (!fromPath) {
    return fallback;
  }
  return path.extname(fromPath) ? fromPath : `${fromPath}.${fallbackExt}`;
}

function buildAttachmentRequestPart(dataUrl, mime, filename) {
  const normalizedMime = String(mime || "application/octet-stream").toLowerCase();

  if (normalizedMime.startsWith("image/")) {
    return {
      type: "image_url",
      imageUrl: { url: dataUrl },
    };
  }

  return {
    type: "file",
    file: {
      filename,
      mime_type: normalizedMime,
      file_data: dataUrl,
    },
  };
}

async function resolveAttachmentInputs(attachmentInputs, stamp) {
  const requestParts = [];
  const savedPaths = [];

  for (let i = 0; i < attachmentInputs.length; i += 1) {
    const result = await resolveAttachmentInput(attachmentInputs[i], i, stamp);
    requestParts.push(result.requestPart);
    savedPaths.push(result.savedPath);
  }

  return { requestParts, savedPaths };
}

function buildUserMessageContent(prompt, attachmentParts) {
  const trimmedPrompt = String(prompt || "").trim();

  if (attachmentParts.length === 0) {
    return trimmedPrompt;
  }

  const content = [];
  if (trimmedPrompt) {
    content.push({ type: "text", text: trimmedPrompt });
  }

  for (const part of attachmentParts) {
    content.push(part);
  }

  return content;
}

async function loadWorkspaceEnvFile() {
  try {
    const raw = await readFile(ENV_FILE, "utf8");
    const parsedEnv = parseDotEnv(raw);
    for (const [key, value] of Object.entries(parsedEnv)) {
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
    return true;
  } catch {
    // .3rd.env does not exist yet.
    return false;
  }
}

async function saveWorkspaceEnvFile(runtimeEnv) {
  const content = [
    "# Wing-Models runtime variables for current working directory",
    `${PROFILE_SET_ENV_KEY}=${runtimeEnv.profileSetRaw}`,
    "",
  ].join("\n");

  await writeFile(ENV_FILE, content, { encoding: "utf8", mode: 0o600 });
}

function stampNow() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function attachmentExtFromMime(mime) {
  const normalized = String(mime || "").toLowerCase().split(";")[0].trim();
  const mimeToExt = {
    "text/plain": "txt",
    "text/markdown": "md",
    "application/json": "json",
    "text/csv": "csv",
    "application/pdf": "pdf",
    "application/zip": "zip",
    "application/gzip": "gz",
    "application/x-tar": "tar",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/bmp": "bmp",
    "image/svg+xml": "svg",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/ogg": "ogg",
    "audio/flac": "flac",
    "audio/mp4": "m4a",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "video/x-msvideo": "avi",
    "video/x-matroska": "mkv",
  };
  if (mimeToExt[normalized]) {
    return mimeToExt[normalized];
  }

  if (normalized.startsWith("image/")) return normalized.split("/")[1].replace(/\+xml$/, "");
  if (normalized.startsWith("audio/")) return normalized.split("/")[1];
  if (normalized.startsWith("video/")) return normalized.split("/")[1];
  if (normalized.startsWith("text/")) return "txt";
  return "bin";
}

function attachmentExtFromUrl(rawUrl) {
  try {
    const ext = path.extname(new URL(rawUrl).pathname).toLowerCase().replace(".", "");
    if (/^[a-z0-9]{1,12}$/.test(ext)) {
      return ext;
    }
  } catch {
    // Ignore URL parsing errors.
  }
  return "bin";
}

function pickFirstString(candidates) {
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function normalizeAttachmentCandidate(raw, typeHint = "") {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const inferredMime =
    String(typeHint || "").includes("image") ? "image/*" :
    String(typeHint || "").includes("audio") ? "audio/*" :
    String(typeHint || "").includes("video") ? "video/*" : "";

  const mime = pickFirstString([
    raw.mime,
    raw.mimeType,
    raw.mime_type,
    raw.contentType,
    raw.content_type,
    inferredMime,
  ]);

  const name = pickFirstString([
    raw.filename,
    raw.fileName,
    raw.name,
    raw.title,
  ]);

  const directUrl = pickFirstString([raw.url, raw.uri, raw.href]);
  let dataUrlOrBase64 = pickFirstString([
    raw.dataUrl,
    raw.data_url,
    raw.fileData,
    raw.file_data,
    raw.base64,
    raw.b64,
  ]);

  if (dataUrlOrBase64 && !dataUrlOrBase64.startsWith("data:")) {
    const safeMime = mime || "application/octet-stream";
    dataUrlOrBase64 = `data:${safeMime};base64,${dataUrlOrBase64}`;
  }

  const source = dataUrlOrBase64 || directUrl;
  if (!source) {
    return null;
  }

  return { source, mime, name };
}

function extractTextAndAttachments(response) {
  const choice = response?.choices?.[0] ?? {};
  const message = choice?.message ?? {};

  const textParts = [];
  const attachmentMap = new Map();

  function addAttachment(candidate, typeHint = "") {
    const normalized = normalizeAttachmentCandidate(candidate, typeHint);
    if (!normalized) {
      return;
    }
    attachmentMap.set(normalized.source, normalized);
  }

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
        addAttachment({
          url: item.imageUrl?.url || item.image_url?.url,
          mime: "image/*",
        }, "image_url");
        continue;
      }

      addAttachment(item.file, item.type);
      addAttachment(item.fileUrl, item.type);
      addAttachment(item.file_url, item.type);
      addAttachment(item.audio, item.type);
      addAttachment(item.audioUrl, item.type);
      addAttachment(item.audio_url, item.type);
      addAttachment(item.video, item.type);
      addAttachment(item.videoUrl, item.type);
      addAttachment(item.video_url, item.type);
      addAttachment(item.attachment, item.type);
      addAttachment(item.attachmentUrl, item.type);
      addAttachment(item.attachment_url, item.type);
      addAttachment(item, item.type);
    }
  }

  if (Array.isArray(message.images)) {
    for (const image of message.images) {
      addAttachment({
        url: image?.imageUrl?.url || image?.image_url?.url,
        mime: "image/*",
      }, "image");
    }
  }

  if (Array.isArray(message.files)) {
    for (const file of message.files) {
      addAttachment(file, "file");
    }
  }

  return {
    text: textParts.join("\n\n").trim(),
    attachments: Array.from(attachmentMap.values()),
  };
}

function printRouteMarker(routeInfo) {
  const payload = {
    provider: routeInfo.provider,
    alias: routeInfo.alias,
    baseURL: routeInfo.baseURL,
    model: routeInfo.modelId,
    source: routeInfo.source,
  };

  console.log(`[ROUTE] ${JSON.stringify(payload)}`);
}

function formatAttachmentPathLines(paths) {
  if (!Array.isArray(paths) || paths.length === 0) {
    return ["- (none)"];
  }
  return paths.map((p) => `- \`${p}\``);
}

async function writeDialogueResult({
  stamp,
  modelId,
  alias,
  baseURL,
  promptText,
  answerText,
  inputAttachmentPaths,
  outputAttachmentPaths,
}) {
  const filePath = path.join(OUTPUT_DIR, `${stamp}-dialogue.md`);
  const safePrompt = String(promptText || "").trim() || "(attachment-only request)";
  const safeAnswer = String(answerText || "").trim() || "(no text response)";

  const markdown = [
    "# Wing-Models Dialogue",
    "",
    `- Alias: ${alias}`,
    `- Model: \`${modelId}\``,
    `- Base URL: \`${baseURL}\``,
    `- Time: ${new Date().toISOString()}`,
    "",
    "## Question",
    "",
    safePrompt,
    "",
    "## Input Attachments",
    "",
    ...formatAttachmentPathLines(inputAttachmentPaths),
    "",
    "## Answer",
    "",
    safeAnswer,
    "",
    "## Output Attachments",
    "",
    ...formatAttachmentPathLines(outputAttachmentPaths),
    "",
  ].join("\n");

  await writeFile(filePath, markdown, "utf8");

  console.log(`[TEXT_FILE] ${filePath}`);

  const printed = await readFile(filePath, "utf8");
  console.log("[TEXT_CONTENT_BEGIN]");
  console.log(printed);
  console.log("[TEXT_CONTENT_END]");

  return filePath;
}

async function materializeAttachment(attachment, index, stamp) {
  const source = String(attachment?.source || "").trim();
  if (!source) {
    throw new Error(`Attachment #${index + 1} has no source URL/data.`);
  }

  if (source.startsWith("data:")) {
    const match = source.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      throw new Error(`Unsupported data URL format for attachment #${index + 1}`);
    }

    const mime = match[1];
    const data = match[2];
    const ext = normalizeAttachmentExtension(attachment?.name || "", mime);
    const filePath = path.join(OUTPUT_DIR, `${stamp}-attachment-${index + 1}.${ext}`);

    await writeFile(filePath, Buffer.from(data, "base64"));
    return filePath;
  }

  const res = await fetch(source);
  if (!res.ok) {
    throw new Error(`Failed to download attachment #${index + 1}: HTTP ${res.status}`);
  }

  const mimeHeader = String(res.headers.get("content-type") || "").split(";")[0].trim();
  const ext = normalizeAttachmentExtension(
    attachment?.name || source,
    attachment?.mime || mimeHeader || attachmentExtFromUrl(source)
  );
  const filePath = path.join(OUTPUT_DIR, `${stamp}-attachment-${index + 1}.${ext}`);
  const bytes = Buffer.from(await res.arrayBuffer());

  await writeFile(filePath, bytes);
  return filePath;
}

async function writeAttachmentResults(attachments) {
  const paths = [];
  const stamp = stampNow();
  for (let i = 0; i < attachments.length; i += 1) {
    const filePath = await materializeAttachment(attachments[i], i, stamp);
    paths.push(filePath);
    console.log(`[ATTACHMENT_FILE] ${filePath}`);
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

  // Allow attachment-only requests without prompting for text.
  if (Array.isArray(parsedArgs.attachments) && parsedArgs.attachments.length > 0) {
    return "";
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question("Enter prompt to send: ")).trim();
  rl.close();

  if (!answer) {
    throw new Error("Prompt is required.");
  }

  return answer;
}

async function loadRuntimeState() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const envFileExists = await loadWorkspaceEnvFile();

  const envProfileSetRaw = String(process.env[PROFILE_SET_ENV_KEY] || "").trim();

  const profileMap = parseProfileSet(envProfileSetRaw);

  if (profileMap.size === 0) {
    const seededProfileMap = await promptProfileSetFromUser();
    return {
      profileMap: seededProfileMap,
      envFileExists,
      profileSeededInteractively: true,
    };
  }

  return {
    profileMap,
    envFileExists,
    profileSeededInteractively: false,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const runtime = await loadRuntimeState();

  if (args.listAliases) {
    listAliases(runtime.profileMap);
    return;
  }

  const selectedAlias = await resolveSelectedAlias(args.alias, runtime.profileMap);
  const selectedProfile = runtime.profileMap.get(selectedAlias.alias);

  const shouldSaveEnv =
    args.saveEnv ||
    runtime.profileSeededInteractively ||
    !process.env[PROFILE_SET_ENV_KEY];

  process.env[PROFILE_SET_ENV_KEY] = serializeProfileSet(runtime.profileMap);

  if (shouldSaveEnv) {
    await saveWorkspaceEnvFile({
      profileSetRaw: process.env[PROFILE_SET_ENV_KEY],
    });
  }

  const effectiveBaseURL = selectedProfile.baseURL || DEFAULT_BASE_URL;

  printRouteMarker({
    provider: DEFAULT_PROVIDER,
    alias: selectedAlias.alias,
    baseURL: effectiveBaseURL,
    modelId: selectedProfile.modelId,
    source: selectedAlias.source,
  });

  const dialogueStamp = stampNow();
  const prompt = await getPrompt(args);
  const inputAttachments = await resolveAttachmentInputs(args.attachments, dialogueStamp);
  const userContent = buildUserMessageContent(prompt, inputAttachments.requestParts);

  const client = new OpenAI({
    apiKey: selectedProfile.apiKey,
    baseURL: effectiveBaseURL,
  });

  const response = await client.chat.completions.create({
    model: selectedProfile.modelId || DEFAULT_MODEL,
    messages: [
      {
        role: "user",
        content: userContent,
      },
    ],
  });

  const parsed = extractTextAndAttachments(response);

  let outputAttachmentPaths = [];
  if (parsed.attachments.length > 0) {
    outputAttachmentPaths = await writeAttachmentResults(parsed.attachments);
  }

  await writeDialogueResult({
    stamp: dialogueStamp,
    modelId: selectedProfile.modelId || DEFAULT_MODEL,
    alias: selectedAlias.alias,
    baseURL: effectiveBaseURL,
    promptText: prompt,
    answerText: parsed.text,
    inputAttachmentPaths: inputAttachments.savedPaths,
    outputAttachmentPaths,
  });

  if (!parsed.text && parsed.attachments.length === 0) {
    const fallbackPath = path.join(OUTPUT_DIR, `${stampNow()}-raw-response.md`);
    const raw = [
      "# Wing-Models Raw Response",
      "",
      "No text/attachment blocks were detected. Raw JSON is preserved below.",
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