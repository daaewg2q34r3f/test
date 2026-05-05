const REALISTIC_STYLE_HINTS = [
  "写实",
  "现实",
  "真实",
  "写实风格",
  "现实风格",
  "照片",
  "摄影",
  "photo",
  "photoreal",
  "photographic",
  "realistic",
  "live action",
];

type StyleStage = "stage4" | "stage5" | "stage6";

function hasRealisticHint(style: string) {
  const normalized = String(style || "").toLowerCase();
  return REALISTIC_STYLE_HINTS.some((hint) => normalized.includes(hint.toLowerCase()));
}

export function getSafeVisualStyle(rawStyle: string, stage: StyleStage) {
  const baseStyle = String(rawStyle || "").trim();
  if (!hasRealisticHint(baseStyle)) return baseStyle;

  const stageProfiles: Record<StyleStage, string> = {
    stage4:
      "cinematic realistic digital concept art, grounded material rendering, film-grade lighting, non-photographic, non-live-action human appearance",
    stage5:
      "cinematic realistic storyboard concept art, grounded visual design, filmic composition, non-photographic, non-live-action frame aesthetic",
    stage6:
      "cinematic realistic digital imagery, filmic motion language, grounded lighting and materials, non-photographic, non-live-action human appearance",
  };

  return `${baseStyle}; ${stageProfiles[stage]}`;
}

export function getSafeVisualGuardrail(rawStyle: string, stage: StyleStage) {
  if (!hasRealisticHint(rawStyle)) return "";

  const stageGuards: Record<StyleStage, string> = {
    stage4:
      "Keep the result in realistic digital concept art territory. Avoid live-action photography, celebrity likeness, DSLR portrait aesthetics, or documentary-photo facial rendering.",
    stage5:
      "Keep the frame as cinematic storyboard concept art. Avoid live-action still-photo aesthetics, actor headshot realism, or photo-like human skin rendering.",
    stage6:
      "Keep the video in cinematic digital realism. Avoid live-action footage aesthetics, photo-like facial rendering, or real-person documentary look.",
  };

  return stageGuards[stage];
}
