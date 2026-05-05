import express from "express";
import u from "@/utils";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { error, success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import axios from "axios";
import fs from "fs";
import fsPromises from "fs/promises";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import ffmpeg from "fluent-ffmpeg";
import { getSafeVisualGuardrail, getSafeVisualStyle } from "@/utils/styleProfile";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

const router = express.Router();

type VideoMode = "single" | "startEnd" | "multi" | "multiTransition";
type AudioMode = "auto" | "dialogue" | "narration" | "silent";
type VideoFrameInput = string | { path: string; role?: string };
type NormalizedVideoFrame = { path: string; role?: string };
type SpeechPace = "slow" | "normal" | "fast";
type SpeechMode = "silent" | "narration" | "monologue" | "dialogue";
type SpeechSegment = {
  text: string;
  speaker?: string;
  pace?: SpeechPace;
};
type SpeechPlan = {
  speechMode: SpeechMode;
  subtitleText: string;
  voiceText: string;
  voiceStyle: string;
  deliveryHint: string;
  speakerHints: string[];
  subtitleSegments: SpeechSegment[];
};

const videoFrameInputSchema = z.union([
  z.string(),
  z.object({
    path: z.string(),
    role: z.string().optional(),
  }),
]);

const speechPlanSchema = {
  speechMode: z.enum(["silent", "narration", "monologue", "dialogue"]).describe("speech mode"),
  subtitleText: z.string().describe("single Chinese subtitle line"),
  voiceText: z.string().describe("spoken Chinese line used for native audio generation"),
  voiceStyle: z.string().describe("single English tone word such as calm, tense, firm, sad, warm"),
  deliveryHint: z.string().optional(),
  speakerHints: z.array(z.string()).optional(),
  subtitleSegments: z.array(z.object({
    text: z.string(),
    speaker: z.string().optional(),
    pace: z.enum(["slow", "normal", "fast"]).optional(),
  })).optional(),
};

const heldPropKeywords = ["雨伞", "伞", "手机", "箱包", "包", "刀", "剑", "枪", "书", "书册", "杯子", "茶杯", "酒杯", "灯笼", "玉碟", "信封", "证件", "钥匙", "花束"];
const heldPropActionMap: Record<string, string[]> = {
  "雨伞": ["撑伞", "打伞", "举伞", "握伞", "持伞"],
  "伞": ["撑伞", "打伞", "举伞", "握伞", "持伞"],
  "手机": ["拿手机", "看手机", "举起手机", "接电话", "握手机"],
  "箱包": ["提包", "拎包", "背包", "抓包"],
  "包": ["提包", "拎包", "背包", "抓包"],
  "刀": ["持刀", "握刀", "举刀"],
  "剑": ["持剑", "握剑", "举剑"],
  "枪": ["持枪", "握枪", "举枪", "指枪"],
  "书": ["拿书", "捧书", "翻书", "举书"],
  "书册": ["拿书册", "捧书册", "翻书册"],
  "杯子": ["拿杯", "端杯", "举杯", "捧杯"],
  "茶杯": ["拿茶杯", "端茶杯", "举茶杯"],
  "酒杯": ["拿酒杯", "端酒杯", "举酒杯"],
  "灯笼": ["提灯笼", "举灯笼", "拿灯笼"],
  "玉碟": ["拿起玉碟", "握住玉碟", "递玉碟", "捧玉碟"],
  "信封": ["拿信封", "递信封", "举信封"],
  "证件": ["拿证件", "出示证件", "递证件"],
  "钥匙": ["拿钥匙", "举钥匙", "握钥匙"],
  "花束": ["拿花束", "捧花束", "递花束"],
};

function getPathname(url: string) {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return new URL(url).pathname;
  }
  return url;
}

function buildMotionInstruction(mode: VideoMode) {
  return {
    single:
      "Motion mode: animate the single storyboard frame with subtle camera movement and natural subject motion. Keep composition and identities stable. Leave the lower subtitle-safe area readable. If anyone is speaking, make lip motion and breathing feel natural instead of exaggerated.",
    startEnd:
      "Motion mode: create a smooth A-to-B transition. The first image is the opening frame and the second image is the ending frame. Move naturally from A to B without abrupt cuts. If the two frames are different scenes, use the storyboard prompt's transition logic instead of forcing the same scene or props. Leave the lower subtitle-safe area readable, and if there is dialogue, keep mouth motion synced to the spoken beat.",
    multi:
      "Motion mode: create a short montage using the supplied images in order. Treat them as sequential beats, with rhythmic cuts or smooth transitions while preserving continuity. Keep a clean lower subtitle-safe area and preserve readable facial acting for any spoken moment.",
    multiTransition:
      "Motion mode: create a short montage using the supplied images in order, then land precisely on the final reference frame as the ending target. Treat the earlier images as current-clip beats and the final image as the mandatory ending frame that should match at the cut.",
  }[mode];
}

function normalizeVideoFrameInput(item: VideoFrameInput): NormalizedVideoFrame {
  if (typeof item === "string") return { path: item };
  return { path: item.path, role: item.role };
}

function inferFrameRole(mode: VideoMode, index: number, total: number) {
  if (mode === "startEnd") {
    if (index === 0) return "first_frame";
    if (index === total - 1) return "last_frame";
    return "reference_frame";
  }
  if (mode === "multiTransition") {
    if (index === 0) return "first_frame";
    if (index === total - 1) return "last_frame";
    return `montage_${index + 1}`;
  }
  if (mode === "multi") return `montage_${index + 1}`;
  return "current_frame";
}

function compactText(value: string, maxLength: number) {
  const cleaned = String(value || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/[鈥溾€?'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength).trim()}...` : cleaned;
}

function extractHeldPropsFromText(text: string) {
  return heldPropKeywords.filter((keyword) => text.includes(keyword));
}

function extractHeldPropActions(text: string, prop: string) {
  return (heldPropActionMap[prop] || []).filter((action) => text.includes(action));
}

function extractCharacterNames(text: string) {
  return Array.from(new Set(text.match(/[\u4e00-\u9fa5]{2,4}/g) || []))
    .filter((name) => !/镜头|分镜|画面|当前|场景|动作|情绪|角色|道具|过渡|结尾|首帧|提示词|连续性|参考|关键/.test(name));
}

function inferHeldPropHand(text: string) {
  if (/双手|两手/.test(text)) return "both hands";
  if (/右手|右臂/.test(text)) return "the right hand";
  if (/左手|左臂/.test(text)) return "the left hand";
  return "the hand";
}

function inferHeldPropHolder(text: string) {
  return extractCharacterNames(text)[0] || "";
}

function buildHeldPropSpecificBinding(prop: string, holder: string, hand: string, actions: string[]) {
  const holderText = holder ? `${holder}'s ${hand}` : hand;
  const actionText = actions.length
    ? `${prop} is involved in high-risk handheld actions (${actions.join(", ")}). `
    : "";

  if (prop === "雨伞" || prop === "伞") {
    return `${actionText}Keep the umbrella handle continuously locked in ${holderText}. The umbrella must travel with the character's walking, arm swing, turns, and pauses, and must never stay behind like a static background object.`;
  }

  if (["手机", "玉碟", "信封", "证件", "钥匙"].includes(prop)) {
    return `${actionText}Keep ${prop} firmly in ${holderText} as a continuously visible handheld item. When the character raises the hand, turns, offers it forward, or pulls it back, ${prop} must follow with no floating, drag, or old-position freeze.`;
  }

  if (["箱包", "包", "灯笼", "花束"].includes(prop)) {
    return `${actionText}Keep ${prop} continuously carried by ${holderText}. It must change position together with the arm, shoulder, and body movement, and must never reset into a static prop after the character moves away.`;
  }

  if (["刀", "剑", "枪"].includes(prop)) {
    return `${actionText}Keep ${prop} firmly controlled by ${holderText}. It must strictly follow the wrist, forearm, and body motion, with no sudden release, drift, duplicate ghosting, or staying behind while the character continues moving.`;
  }

  if (["书", "书册", "杯子", "茶杯", "酒杯"].includes(prop)) {
    return `${actionText}Keep ${prop} steadily supported in ${holderText}. Preserve continuous hand contact and believable weight, and never let it float, clip, or remain in the old place while the character keeps moving.`;
  }

  return `${actionText}Keep ${prop} continuously held by ${holderText}, with uninterrupted hand contact and full body-motion sync. Never let it stay behind, float, drift, duplicate, or clip through the body.`;
}

function buildHeldPropConstraintText(texts: Array<string | undefined>, mode?: VideoMode) {
  const text = texts.filter(Boolean).join("\n");
  const matchedProps = Array.from(new Set(extractHeldPropsFromText(text)));
  if (!matchedProps.length) return "";

  return matchedProps
    .map((prop) => {
      const matchedActions = extractHeldPropActions(text, prop);
      const holder = inferHeldPropHolder(text);
      const hand = inferHeldPropHand(text);
      const actionHint = buildHeldPropSpecificBinding(prop, holder, hand, matchedActions);
      const montageHint = mode === "multi" || mode === "multiTransition"
        ? `Across all montage beats, ${prop} must keep the same hand-held relationship and must never reset into a background object or stay behind in a previous position. `
        : "";
      return `${actionHint} ${prop} is the primary handheld prop in this clip. If a character is holding it, ${prop} must stay physically attached to the hand and move in sync with the hand, arm, shoulder, and body at all times. Never leave ${prop} behind in the old position, never let it float, drift, duplicate, lag, or pass through the body. Do not allow the character to keep moving while ${prop} remains fixed in place. ${montageHint}`.trim();
    })
    .join(" ");
}

function escapeDrawtextValue(text: string) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/,/g, "\\,")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/%/g, "\\%")
    .replace(/\n/g, "\\n");
}

function resolveSubtitleFontArg() {
  const candidates = [
    "C:/Windows/Fonts/msyh.ttc",
    "C:/Windows/Fonts/msyh.ttf",
    "C:/Windows/Fonts/simhei.ttf",
    "C:/Windows/Fonts/simsun.ttc",
  ];
  const existing = candidates.find((item) => fs.existsSync(item));
  if (!existing) return "font='Arial'";
  return `fontfile='${existing.replace(/:/g, "\\:")}'`;
}

function probeVideoHasAudio(videoPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return resolve(false);
      resolve(metadata.streams?.some((stream: any) => stream.codec_type === "audio") ?? false);
    });
  });
}

function probeVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return resolve(0);
      const duration = Number(metadata.format?.duration || 0);
      if (Number.isFinite(duration) && duration > 0) return resolve(duration);
      const streamDuration = metadata.streams
        ?.map((stream: any) => Number(stream.duration || 0))
        .find((item: number) => Number.isFinite(item) && item > 0);
      resolve(streamDuration || 0);
    });
  });
}

function normalizeSpeechMode(value: string | undefined, fallback: SpeechMode = "narration"): SpeechMode {
  return ["silent", "narration", "monologue", "dialogue"].includes(String(value || ""))
    ? value as SpeechMode
    : fallback;
}

function normalizeSpeechPace(value: string | undefined): SpeechPace {
  return value === "slow" || value === "fast" ? value : "normal";
}

function splitTextIntoSegments(text: string, maxChars = 16) {
  const normalized = compactText(text, 120)
    .replace(/[鈥溾€?'`]/g, "")
    .replace(/\s+/g, "")
    .trim();
  if (!normalized) return [];

  const sentenceParts = normalized
    .split(/[，。！!?；;、,.]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
  const parts = sentenceParts.length ? sentenceParts : [normalized];
  const segments: string[] = [];

  for (const part of parts) {
    if (part.length <= maxChars) {
      segments.push(part);
      continue;
    }
    for (let index = 0; index < part.length; index += maxChars) {
      const chunk = part.slice(index, index + maxChars).trim();
      if (chunk) segments.push(chunk);
    }
  }

  return segments.slice(0, 5);
}

function normalizeSpeechSegments(segments: SpeechSegment[] | undefined, fallbackText: string) {
  const normalized = (segments || [])
    .map((segment) => ({
      text: compactText(segment?.text || "", 22).replace(/[，。！!?；;]+$/g, "").trim(),
      speaker: compactText(segment?.speaker || "", 12),
      pace: normalizeSpeechPace(segment?.pace),
    }))
    .filter((segment) => segment.text);

  if (normalized.length) return normalized.slice(0, 5);

  return splitTextIntoSegments(fallbackText, 16).map((text) => ({
    text,
    pace: "normal" as SpeechPace,
  }));
}

function countSubtitleChars(text: string) {
  return text.replace(/\s+/g, "").length;
}

function buildSubtitleTimings(segments: SpeechSegment[], duration: number) {
  const safeDuration = duration > 0 ? duration : Math.max(segments.length * 2, 2);
  const paceFactorMap: Record<SpeechPace, number> = {
    slow: 1.2,
    normal: 1,
    fast: 0.82,
  };
  const weights = segments.map((segment) => {
    const chars = Math.max(countSubtitleChars(segment.text), 1);
    const paceFactor = paceFactorMap[normalizeSpeechPace(segment.pace)];
    return Math.max(chars * paceFactor, 1);
  });
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const durations = weights.map((weight) => (safeDuration * weight) / totalWeight);
  const minDuration = safeDuration >= segments.length * 0.75 ? 0.75 : safeDuration / Math.max(segments.length, 1);

  let extraNeeded = 0;
  const adjustedDurations = durations.map((item) => {
    if (item >= minDuration) return item;
    extraNeeded += minDuration - item;
    return minDuration;
  });

  if (extraNeeded > 0) {
    let adjustable = adjustedDurations
      .map((item, index) => ({ index, room: Math.max(item - minDuration, 0) }))
      .filter((item) => item.room > 0);

    while (extraNeeded > 0.001 && adjustable.length) {
      const totalRoom = adjustable.reduce((sum, item) => sum + item.room, 0);
      if (totalRoom <= 0) break;
      for (const item of adjustable) {
        const reduction = Math.min(item.room, extraNeeded * (item.room / totalRoom));
        adjustedDurations[item.index] -= reduction;
        item.room -= reduction;
      }
      extraNeeded = adjustedDurations.reduce((sum, item) => sum + item, 0) - safeDuration;
      adjustable = adjustable.filter((item) => item.room > 0.001);
    }
  }

  let cursor = 0;
  return adjustedDurations.map((item, index) => {
    const start = cursor;
    const end = index === adjustedDurations.length - 1 ? safeDuration + 0.25 : Math.min(safeDuration, cursor + item + 0.08);
    cursor += item;
    return { start, end };
  });
}

function buildTimedSubtitleFilters(input: {
  segments: SpeechSegment[];
  duration: number;
  videoLabel: string;
}) {
  const { segments, duration, videoLabel } = input;
  const timings = buildSubtitleTimings(segments, duration);
  const filterParts: string[] = [];
  let currentLabel = "0:v";

  segments.forEach((segment, index) => {
    const nextLabel = index === segments.length - 1 ? videoLabel : `subv${index}`;
    const timing = timings[index] || { start: 0, end: duration };
    const drawtext = [
      `drawtext=${resolveSubtitleFontArg()}`,
      `text='${escapeDrawtextValue(segment.text)}'`,
      "fontcolor=white",
      "fontsize=30",
      "borderw=2",
      "bordercolor=black",
      "box=1",
      "boxcolor=black@0.38",
      "boxborderw=12",
      "x=(w-text_w)/2",
      "y=h-text_h-42",
      `enable='between(t,${timing.start.toFixed(3)},${timing.end.toFixed(3)})'`,
    ].join(":");
    filterParts.push(`[${currentLabel}]${drawtext}[${nextLabel}]`);
    currentLabel = nextLabel;
  });

  return filterParts;
}

async function decorateVideoWithSubtitle(input: {
  videoRelPath: string;
  speechPlan: SpeechPlan;
}) {
  const { videoRelPath, speechPlan } = input;
  if (speechPlan.speechMode === "silent") return;
  if (!speechPlan.subtitleText.trim() && !speechPlan.voiceText.trim()) return;

  const videoAbsPath = await u.oss.getLocalPath(videoRelPath);
  const hasOriginalAudio = await probeVideoHasAudio(videoAbsPath);
  const videoDuration = await probeVideoDuration(videoAbsPath);
  const tempRelPath = videoRelPath.replace(/\.mp4$/i, `.${uuidv4()}.tmp.mp4`);
  const tempAbsPath = await u.oss.getLocalPath(tempRelPath);
  const videoLabel = "vout";
  const audioLabel = "aout";
  const subtitleSegments = normalizeSpeechSegments(
    speechPlan.subtitleSegments,
    speechPlan.voiceText || speechPlan.subtitleText,
  );

  if (!subtitleSegments.length) return;

  const filterParts = buildTimedSubtitleFilters({
    segments: subtitleSegments,
    duration: videoDuration,
    videoLabel,
  });
  if (hasOriginalAudio) {
    filterParts.push(`[0:a]aresample=44100,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[${audioLabel}]`);
  }

  await new Promise<void>((resolve, reject) => {
    const outputOptions = [
      `-map [${videoLabel}]`,
      "-c:v libx264",
      "-preset fast",
      "-crf 20",
      "-pix_fmt yuv420p",
      "-movflags +faststart",
      "-shortest",
    ];

    if (hasOriginalAudio) {
      outputOptions.splice(1, 0, `-map [${audioLabel}]`);
      outputOptions.push("-c:a aac", "-b:a 192k");
    } else {
      outputOptions.push("-an");
    }

    ffmpeg()
      .input(videoAbsPath)
      .complexFilter(filterParts.join(";"))
      .outputOptions(outputOptions)
      .on("error", reject)
      .on("end", resolve)
      .save(tempAbsPath);
  });

  await fsPromises.copyFile(tempAbsPath, videoAbsPath);
  await fsPromises.unlink(tempAbsPath).catch(() => {});
}

function fallbackSpeechPlan(storyboardName: string, storyboardPrompt: string, audioMode: AudioMode = "auto"): SpeechPlan {
  const cleanedName = compactText(storyboardName, 18);
  const cleanedPrompt = compactText(storyboardPrompt, 30);
  const subtitleText = cleanedName || compactText(cleanedPrompt, 18) || "剧情继续推进";
  const voiceBase = cleanedPrompt || cleanedName || subtitleText;
  const resolvedMode: SpeechMode = audioMode === "silent"
    ? "silent"
    : audioMode === "dialogue"
      ? "dialogue"
      : audioMode === "narration"
        ? "narration"
        : "monologue";

  const subtitleSegments = normalizeSpeechSegments(undefined, voiceBase);
  return {
    speechMode: resolvedMode,
    subtitleText,
    voiceText: resolvedMode === "silent" ? "" : voiceBase,
    voiceStyle: "calm",
    deliveryHint: resolvedMode === "dialogue" ? "natural dialogue, clear turn-taking" : "steady and natural delivery",
    speakerHints: [],
    subtitleSegments,
  };
}

async function generateSpeechPlan(input: {
  projectId: number;
  scriptId: number;
  shotId?: number;
  storyboardName?: string;
  storyboardPrompt?: string;
  videoPrompt: string;
  duration: number;
  preferredVoiceStyle?: string;
  audioMode?: AudioMode;
  voiceCharacterBible?: string;
  previousVoiceText?: string;
  nextVoiceText?: string;
  primarySpeakerHint?: string;
  previousSpeakerHint?: string;
  nextSpeakerHint?: string;
}) {
  const {
    projectId,
    scriptId,
    shotId,
    storyboardName = "",
    storyboardPrompt = "",
    videoPrompt,
    duration,
    preferredVoiceStyle = "",
    audioMode = "auto",
    voiceCharacterBible = "",
    previousVoiceText = "",
    nextVoiceText = "",
    primarySpeakerHint = "",
    previousSpeakerHint = "",
    nextSpeakerHint = "",
  } = input;

  if (audioMode === "silent") {
    return fallbackSpeechPlan(storyboardName, storyboardPrompt, "silent");
  }

  const scriptRow = await u.db("t_script").where("id", scriptId).select("content").first();
  const scriptText = scriptRow?.content || "";
  if (!scriptText && !storyboardPrompt && !videoPrompt) {
    return fallbackSpeechPlan(storyboardName, storyboardPrompt, audioMode);
  }

  const normalizedPreferredVoiceStyle = compactText(preferredVoiceStyle, 12).toLowerCase();
  const requestedAudioMode = audioMode === "dialogue" || audioMode === "narration" ? audioMode : "auto";

  const system = [
    "You are a short-form drama speech planner for a single video clip.",
    "Return one structured JSON object for native in-video speech and subtitle timing.",
    "Prefer character dialogue when the shot clearly contains face-to-face speaking, questioning, bargaining, or direct reaction.",
    "Use narration only when the shot is better served by an external voice or when no speaker is visually clear.",
    "Use monologue for one visible speaker speaking softly to self or thinking aloud.",
    "Keep one primary speaker per clip whenever possible. Do not switch voices mid-clip unless dialogue mode clearly requires it.",
    "If dialogue mode is used, limit it to at most two speakers and keep the first listed primary speaker as the dominant voice anchor.",
    "Never describe events that belong to later clips.",
    "subtitleText must be one concise Chinese subtitle line, 8-22 Chinese characters, easy to read.",
    "voiceText must be one concise spoken Chinese line, 10-32 Chinese characters, suitable for native audio generation.",
    "subtitleSegments must contain 1-4 short Chinese segments in speaking order. Each segment needs text and may include speaker and pace.",
    "pace must be one of slow, normal, fast.",
    "speakerHints should summarize likely speaker identities and tones, such as '沈砚: restrained young man'.",
    "deliveryHint should be a short English phrase for delivery direction, such as 'soft bargaining, clipped pauses'.",
    requestedAudioMode === "dialogue"
      ? "The user explicitly requests dialogue-first output. Prefer visible character speech over narration."
      : requestedAudioMode === "narration"
        ? "The user explicitly requests narration-first output. Prefer a narrator line unless visible dialogue is essential."
        : "Audio mode is auto. Choose the most natural speech mode for this clip.",
    normalizedPreferredVoiceStyle
      ? `voiceStyle must be exactly ${normalizedPreferredVoiceStyle}.`
      : "voiceStyle must be a single English tone word such as calm, tense, firm, sad, warm, cold.",
    "Return JSON only.",
  ].join("\n");

  const userContext = [
    `Clip duration: ${duration}s`,
    `Storyboard name: ${storyboardName || "None"}`,
    `Storyboard prompt: ${storyboardPrompt || "None"}`,
    `Video prompt: ${videoPrompt || "None"}`,
    `Episode voice bible: ${voiceCharacterBible || "None"}`,
    `Primary speaker hint: ${primarySpeakerHint || "None"}`,
    `Previous clip speaker hint: ${previousSpeakerHint || "None"}`,
    `Next clip speaker hint: ${nextSpeakerHint || "None"}`,
    `Previous clip speech: ${previousVoiceText || "None"}`,
    `Next clip speech hint: ${nextVoiceText || "None"}`,
    "Script context:",
    scriptText || "None",
  ].join("\n\n");

  try {
    const langConfig = await u.getConfig("language");
    const result = await u.ai.text.invoke(
      {
        system,
        messages: [{ role: "user", content: userContext }],
        output: speechPlanSchema,
        log: {
          stage: "stage6",
          action: "shot_audio_plan",
          targetId: shotId || `${projectId}-${scriptId}`,
          extra: {
            projectId,
            scriptId,
            shotId: shotId || null,
            duration,
          },
        },
      },
      langConfig,
    ) as SpeechPlan;

    const speechMode = normalizeSpeechMode(result?.speechMode, requestedAudioMode === "narration" ? "narration" : "monologue");
    const subtitleText = compactText(result?.subtitleText || "", 22);
    const voiceText = compactText(result?.voiceText || subtitleText, 32);
    const voiceStyle = normalizedPreferredVoiceStyle || compactText(result?.voiceStyle || "calm", 12).toLowerCase() || "calm";
    const deliveryHint = compactText(result?.deliveryHint || "", 48);
    const speakerHints = (result?.speakerHints || [])
      .map((item) => compactText(item || "", 32))
      .filter(Boolean)
      .slice(0, 4);
    const subtitleSegments = normalizeSpeechSegments(result?.subtitleSegments, voiceText || subtitleText);

    if (!subtitleText && !voiceText) {
      return fallbackSpeechPlan(storyboardName, storyboardPrompt, audioMode);
    }

    return {
      speechMode,
      subtitleText: subtitleText || compactText(voiceText, 18),
      voiceText: speechMode === "silent" ? "" : (voiceText || subtitleText),
      voiceStyle,
      deliveryHint,
      speakerHints,
      subtitleSegments,
    };
  } catch (err) {
    console.warn(`speech plan generation failed shotId=${shotId || "unknown"}:`, err);
    return fallbackSpeechPlan(storyboardName, storyboardPrompt || videoPrompt, audioMode);
  }
}

export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    scriptId: z.number(),
    configId: z.number().optional(),
    shotId: z.number().optional(),
    batchId: z.string().optional(),
    type: z.string().optional(),
    mode: z.enum(["single", "startEnd", "multi", "multiTransition"]).optional(),
    continuityHint: z.string().optional(),
    preferredVoiceStyle: z.string().optional(),
    audioMode: z.enum(["auto", "dialogue", "narration", "silent"]).optional(),
    voiceCharacterBible: z.string().optional(),
    previousVoiceText: z.string().optional(),
    nextVoiceText: z.string().optional(),
    primarySpeakerHint: z.string().optional(),
    previousSpeakerHint: z.string().optional(),
    nextSpeakerHint: z.string().optional(),
    resolution: z.string(),
    filePath: z.array(videoFrameInputSchema),
    duration: z.number(),
    prompt: z.string(),
    audio: z.boolean().optional(),
  }),
  async (req, res) => {
    const {
      type,
      mode = "single",
      scriptId,
      projectId,
      configId,
      shotId,
      batchId,
      resolution,
      filePath,
      duration,
      prompt,
      continuityHint = "",
      preferredVoiceStyle = "",
      audioMode = "auto",
      voiceCharacterBible = "",
      previousVoiceText = "",
      nextVoiceText = "",
      primarySpeakerHint = "",
      previousSpeakerHint = "",
      nextSpeakerHint = "",
      audio = true,
    } = req.body;

    if (type === "volcengine") {
      if (duration < 4 || duration > 12) {
        return res.status(400).send(error("视频时长需在 4-12 秒之间"));
      }
      if (!["480p", "720p", "1080p", "16:9", "9:16"].includes(resolution)) {
        return res.status(400).send(error("视频分辨率不正确"));
      }
    }

    if (type === "runninghub") {
      if (duration !== 10 && duration !== 15) {
        return res.status(400).send(error("视频时长只能是 10 秒或 15 秒"));
      }
      if (resolution !== "9:16" && resolution !== "16:9") {
        return res.status(400).send(error("视频分辨率不正确"));
      }
    }

    let frameRefs = filePath
      .map((item: VideoFrameInput) => normalizeVideoFrameInput(item))
      .filter((item: NormalizedVideoFrame) => item.path && item.path.trim() !== "");
    let fileUrl = frameRefs.map((item) => item.path);
    if (fileUrl.length === 0) {
      return res.status(400).send(error("请至少选择一张图片"));
    }

    frameRefs = await Promise.all(frameRefs.map(async (item) => {
      const match = item.path.match(/base64,([A-Za-z0-9+/=]+)/);
      if (!match || match.length < 2) return item;
      const imagePath = `/${projectId}/assets/${uuidv4()}.jpg`;
      const buffer = Buffer.from(match[1], "base64");
      await u.oss.writeFile(imagePath, buffer);
      return { ...item, path: await u.oss.getFileUrl(imagePath) };
    }));
    fileUrl = frameRefs.map((item) => item.path);

    const fileExistsResults = await Promise.all(
      fileUrl.map(async (url: string) => u.oss.fileExists(getPathname(url))),
    );

    if (!fileExistsResults.every(Boolean)) {
      return res.status(400).send(error("选择的分镜文件不存在"));
    }

    const firstFrame = getPathname(fileUrl[0]);
      const storyboardFrameRefs = frameRefs.map((item, index) => ({
        role: item.role === "continuity_landing_frame"
          ? "last_frame"
          : item.role || inferFrameRole(mode, index, frameRefs.length),
        path: getPathname(item.path),
      }));
    const storyboardImgs = storyboardFrameRefs.map((item) => item.path);
    const savePath = `/${projectId}/video/${uuidv4()}.mp4`;

    const [videoId] = await u.db("t_video").insert({
      scriptId,
      configId: configId || null,
      shotId: shotId || null,
      time: duration,
      resolution,
      prompt,
      firstFrame,
      batchId: batchId || null,
      storyboardImgs: JSON.stringify(storyboardImgs),
      filePath: savePath,
      state: 0,
    });

    const continuityTarget = continuityHint.match(/storyboard\s+#?(\d+)/i)?.[1] || null;

    console.info("[stage6][generateVideo][accepted]", {
      videoId,
      scriptId,
      projectId,
      shotId: shotId || null,
      configId: configId || null,
      batchId: batchId || null,
      mode,
      duration,
      resolution,
      type: type || null,
      storyboardIds: storyboardImgs,
      storyboardFrames: storyboardFrameRefs,
      continuity: {
        enabled: Boolean(continuityHint.trim()),
        targetStoryboard: continuityTarget,
        hintLength: continuityHint.length,
      },
      preferredVoiceStyle: preferredVoiceStyle || null,
      audioMode,
      primarySpeakerHint: primarySpeakerHint || null,
    });

    res.status(200).send(success({ id: videoId, configId: configId || null }));

    void generateVideoAsync(
      videoId,
      projectId,
      scriptId,
      shotId,
      fileUrl,
      storyboardFrameRefs,
      savePath,
      prompt,
      duration,
      resolution,
      type,
      mode,
      continuityHint,
      preferredVoiceStyle,
      audioMode,
      voiceCharacterBible,
      previousVoiceText,
      nextVoiceText,
      primarySpeakerHint,
      previousSpeakerHint,
      nextSpeakerHint,
      audio && audioMode !== "silent",
    );
  },
);

async function generateVideoAsync(
  videoId: number,
  projectId: number,
  scriptId: number,
  shotId: number | undefined,
  fileUrl: string[],
  storyboardFrameRefs: Array<{ role: string; path: string }>,
  savePath: string,
  prompt: string,
  duration: number,
  resolution: string,
  type?: string,
  mode: VideoMode = "single",
  continuityHint = "",
  preferredVoiceStyle = "",
  audioMode: AudioMode = "auto",
  voiceCharacterBible = "",
  previousVoiceText = "",
  nextVoiceText = "",
  primarySpeakerHint = "",
  previousSpeakerHint = "",
  nextSpeakerHint = "",
  audio = true,
) {
  try {
    const [projectData, shotRow] = await Promise.all([
      u.db("t_project").where("id", projectId).select("artStyle", "videoRatio").first(),
      shotId
        ? u.db("t_assets").where("id", shotId).select("name", "prompt", "videoPrompt").first()
        : Promise.resolve(null),
    ]);
    const aspectRatio = projectData?.videoRatio || "16:9";

    const speechPlan = await generateSpeechPlan({
      projectId,
      scriptId,
      shotId,
      storyboardName: shotRow?.name || "",
      storyboardPrompt: shotRow?.prompt || "",
      videoPrompt: prompt,
      duration,
      preferredVoiceStyle,
      audioMode,
      voiceCharacterBible,
      previousVoiceText,
      nextVoiceText,
      primarySpeakerHint,
      previousSpeakerHint,
      nextSpeakerHint,
    });

    const imageBase64 = await Promise.all(
      fileUrl.map((item: string) => u.oss.getImageBase64(getPathname(item))),
    );

    const safeStyle = getSafeVisualStyle(projectData?.artStyle || "CG", "stage6");
    const safeStyleGuardrail = getSafeVisualGuardrail(projectData?.artStyle || "CG", "stage6");
    const heldPropConstraint = buildHeldPropConstraintText([
      shotRow?.prompt || "",
      shotRow?.videoPrompt || "",
      prompt,
      continuityHint,
    ], mode);

    const inputPrompt = [
      "Please generate a video based on the following storyboard instructions:",
      prompt,
      buildMotionInstruction(mode),
      continuityHint ? `Continuity guidance: ${continuityHint}` : "",
      `Keep the overall visual style consistent with ${safeStyle}.`,
      safeStyleGuardrail,
      "Do not render any visible subtitles, captions, watermarks, UI text, Chinese characters, or written overlays inside the generated video.",
      heldPropConstraint ? `Critical handheld prop continuity: ${heldPropConstraint}` : "",
      `Speech mode for this clip: ${speechPlan.speechMode}.`,
      primarySpeakerHint ? `Primary speaker anchor: ${primarySpeakerHint}` : "",
      previousSpeakerHint ? `Previous clip speaker anchor: ${previousSpeakerHint}` : "",
      nextSpeakerHint ? `Next clip speaker anchor: ${nextSpeakerHint}` : "",
      speechPlan.speakerHints.length ? `Speaker hints: ${speechPlan.speakerHints.join(" | ")}` : "",
      speechPlan.deliveryHint ? `Delivery direction: ${speechPlan.deliveryHint}` : "",
      speechPlan.subtitleSegments.length
        ? `Speech beats in order: ${speechPlan.subtitleSegments.map((segment, index) => `${index + 1}. ${segment.speaker ? `${segment.speaker}: ` : ""}${segment.text} (${normalizeSpeechPace(segment.pace)})`).join(" | ")}`
        : "",
      `Spoken line or narration for timing and mouth motion: ${speechPlan.voiceText || "None"}`,
      audio
        ? `Generate native audio inside the video clip. Include clear spoken Chinese ${speechPlan.speechMode === "dialogue" ? "dialogue" : "speech"} with a ${speechPlan.voiceStyle} tone, natural lip sync, breathing, pauses, and light ambient sound. Keep the same role sounding consistent within this clip. Do not output a silent clip.`
        : "Keep this clip visually expressive and do not rely on spoken audio.",
      "Keep the lower subtitle-safe area readable and do not block it with important faces, props, or sudden camera pushes.",
      "Leave the lower subtitle-safe area clean because final subtitles will be added by post-processing after video generation.",
      "1. Preserve character identity, costume, scene design, color tone, and lighting across the full clip.",
      "2. Keep motion coherent from start to finish with no abrupt contradictions.",
      "3. Important subjects must remain visible and should not be cropped away or replaced.",
      "4. Avoid artifacts, blur, duplicate people, stray objects, text, logos, and watermarks.",
      "5. For any handheld prop, keep it attached to the correct hand throughout the clip unless the storyboard explicitly shows dropping, throwing, or setting it down.",
    ].join("\n");

    const generationResult = await u.ai.generateVideo(
      {
        imageBase64,
        imagePaths: storyboardFrameRefs,
        savePath,
        prompt: inputPrompt,
        duration: duration as any,
        aspectRatio: aspectRatio as any,
        audio,
        log: {
          stage: "stage6",
          action: "shot_video_generate",
          targetId: videoId,
          extra: {
            projectId,
            scriptId,
            shotId: shotId || null,
            videoId,
            mode,
            duration,
            resolution,
            aspectRatio,
            audio,
            audioMode,
            subtitleText: speechPlan.subtitleText,
            voiceText: speechPlan.voiceText,
            voiceStyle: speechPlan.voiceStyle,
            speechMode: speechPlan.speechMode,
            deliveryHint: speechPlan.deliveryHint,
            speakerHints: speechPlan.speakerHints,
            primarySpeakerHint: primarySpeakerHint || null,
            continuityEnabled: Boolean(continuityHint.trim()),
            continuityTarget: continuityHint.match(/storyboard\s+#?(\d+)/i)?.[1] || null,
          },
        },
      },
      type!,
    );

    const resolvedVideoPath = typeof generationResult === "string" ? generationResult : generationResult?.path;
    let savedLastFramePath: string | null = null;
    const lastFrameUrl = typeof generationResult === "object" ? generationResult?.lastFrameUrl : undefined;

    if (lastFrameUrl) {
      try {
        const extMatch = new URL(lastFrameUrl).pathname.match(/\.(png|jpe?g|webp|bmp)$/i);
        const ext = extMatch?.[0] || ".jpg";
        const lastFramePath = `/${projectId}/video/lastframe_${uuidv4()}${ext}`;
        const response = await axios.get(lastFrameUrl, { responseType: "arraybuffer" });
        await u.oss.writeFile(lastFramePath, Buffer.from(response.data));
        savedLastFramePath = lastFramePath;
      } catch (lastFrameErr) {
        console.warn(`瑙嗛灏惧抚淇濆瓨澶辫触 videoId=${videoId}:`, lastFrameErr);
      }
    }

    if (resolvedVideoPath) {
      try {
        await decorateVideoWithSubtitle({
          videoRelPath: resolvedVideoPath,
          speechPlan,
        });
      } catch (decorateErr) {
        console.warn(`瀛楀箷鍚堟垚澶辫触 videoId=${videoId}:`, decorateErr);
      }

      await u.db("t_video").where("id", videoId).update({
        filePath: resolvedVideoPath,
        lastFrame: savedLastFramePath,
        subtitleText: speechPlan.subtitleText,
        voiceText: speechPlan.voiceText,
        voicePath: null,
        state: 1,
      });
    } else {
      await u.db("t_video").where("id", videoId).update({
        subtitleText: speechPlan.subtitleText,
        voiceText: speechPlan.voiceText,
        voicePath: null,
        state: -1,
      });
    }
  } catch (err) {
    console.error(`瑙嗛鐢熸垚澶辫触 videoId=${videoId}:`, err);
    await u.db("t_video").where("id", videoId).update({ state: -1 });
  }
}
