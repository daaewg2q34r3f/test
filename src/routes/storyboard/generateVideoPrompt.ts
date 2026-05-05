import express from "express";
import u from "@/utils";
import { error, success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { z } from "zod";

const router = express.Router();

const cellsResultSchema = z.object({
  time: z.number().describe("时长,镜头时长 1-15"),
  content: z.string().describe("提示词内容"),
  name: z.string().describe("分镜名称"),
});

const prompt = `
你是一名资深动画导演，擅长将静态分镜转化为简洁、专业、可执行的 Motion Prompt（视频生成动作提示）。你理解镜头语言、情绪节奏和图生视频模型限制。你的输出必须优先服务于首帧、尾帧和动作连续性。

## 任务
你将接收用户输入的：  
- **分镜图片**（单张）  
- **分镜提示词**（对应该镜头）  
- **剧本内容**  

你需输出**规范的 Motion Prompt JSON 对象**。

---

## 核心要求

### 1. 画面类型描述（必需，开头一句）
- 明确本分镜属于：**前景/近景/中景/远景/全景**
- 表述格式："中景。" / "近景。" / "远景。" / "全景。"

### 3. 细致动作叙述
清晰分别描述以下要素：
- **镜头运动**（1种，5-20字）：推拉摇移、跟随、固定等
- **角色核心动作**（1-2种，20-60字）：主体动作+情绪细节
- **环境动态**（0-1种，10-30字）：光影、物体、自然元素变化
- **速度节奏**（5-15字）：缓慢、急促、平稳等
- **氛围风格**（可选，10-20字）：情绪渲染、视觉基调

用"，" "并且" "同时"等词串联，使句子流畅连贯。

### 4. 长度优化
- **content 必须在 70-130 字之间**
- 若不足 70 字，补充：
  - 角色细微神态（眼神、呼吸、肌肉紧张度）
  - 动作过渡细节（转身、停顿、重心转移）
  - 环境反应（光影变化、物体晃动）
- 只保留必要静态锚点：主体是谁、关键道具状态、场景或转场落点。不要复述服装、背景细节和长篇美术描述。

### 5. 连续镜头差异化
- 延续上一镜的主体位置、情绪、道具状态和光影节奏，但不能复述上一镜已经完成的核心动作。
- 相邻镜头必须形成清晰的动作推进：准备、接触、反应、转场、落点、恢复等阶段只能各自聚焦一个阶段。
- 如果上一镜已经描述过同一动作或转场，本镜只能描述该动作之后的新状态、新反应或下一步变化。
- 不要连续多镜重复同一句式、同一镜头运动、同一环境动态或同一转场结果。

---

## 结构推荐

**标准结构：**  
画面类型。镜头运动，角色主动作+情绪表现+微动作细节，环境动态（如有），速度节奏，氛围渲染。

**参考示例：**  
- 中景。镜头缓慢推进，角色身体微微紧绷，神情凝重，缓缓转头注视门口，眉头微皱、唇角轻颤，光影在脸上拉出一缕阴影，衣角随动作轻晃，气氛变得紧张。
- 远景。镜头稳定，角色站立不动，但指尖不停地敲打桌面，目光游移不定，窗外树影摇曳，光线逐渐变暗，整体节奏平稳，渲染出迟疑与不安。

---

## 禁忌

❌ 不大段复述静态画面元素，只保留保证首尾帧一致的必要锚点  
❌ 不使用否定句、抽象形容词  
❌ 不超过 2 种主体动作、1 种镜头运动、1 种环境动态  
❌ 不分多场景，单个 content 不超过 200 字
❌ 不把同一个核心动作或同一次转场在相邻镜头中完整重复
❌ 不引入当前分镜、下一分镜或参考分镜之外的新剧情

---

## 输出格式

返回 **JSON 对象**，包含：

{
  "time": 数字（1-15，镜头时长秒数）,
  "name": "字符串（2-6字，概括镜头动态/情绪）",
  "content": "字符串（70-130字，首句为画面类型，充分描述动态细节）"
}

### 字段说明
- **time**：根据动作复杂度合理分配，简单动作 2-5 秒，复杂动作 6-10 秒
- **name**：精炼概括本镜头核心动态或情绪转折
- **content**：首句必须是画面类型，后续流畅衔接动态描述

---

## 处理流程

1. **分析输入的单张图片**
2. **生成对应的 JSON 对象**
3. **检查 content 字段：**
   - 首句是否为画面类型
   - 字数是否在 70-130 之间
   - 是否只保留必要静态锚点

---

现在请根据我提供的分镜内容，严格按照以上规则输出 Motion Prompt JSON 对象。

`;

// 生成单个分镜提示
async function generateSingleVideoPrompt({
  projectId,
  scriptId,
  storyboardId,
  scriptText,
  storyboardPrompt,
  mode,
  currentVideoPrompt,
  previousPrompt,
  nextPrompt,
  refPrompts,
  continuityLandingPrompt,
  modelPromptTips,
}: {
  projectId?: number;
  scriptId?: number | null;
  storyboardId?: string;
  scriptText: string;
  storyboardPrompt: string;
  mode?: string;
  currentVideoPrompt?: string;
  previousPrompt?: string;
  nextPrompt?: string;
  refPrompts?: string[];
  continuityLandingPrompt?: string;
  modelPromptTips?: string;
}): Promise<{ content: string; time: number; name: string }> {
  try {
    const langConfig = await u.getConfig("language");
      const modeTextMap: Record<string, string> = {
        single: "Static-to-motion: optimize this as one stable animated shot based on the current storyboard only.",
        startEnd: "A-to-B transition: optimize this as a continuous shot that starts from the current storyboard and naturally moves toward the next storyboard.",
        multi: "Multi-image montage: optimize this as an ordered montage that uses multiple consecutive storyboards with clear rhythm and transitions.",
        multiTransition: "Multi-image transition montage: optimize this as an ordered montage that uses multiple current-clip storyboards and must land precisely on the next clip first frame as the final beat.",
      };
    const userContext = `
Script:
${scriptText}

Current storyboard prompt:
${storyboardPrompt || ""}

Motion type:
${modeTextMap[mode || ""] || modeTextMap.single}

Target video model prompt-writing tips:
${modelPromptTips || "None"}

Existing draft video prompt (may be stale or wrong; use only when it clearly matches the current storyboard and reference frames):
${currentVideoPrompt || "None"}

Previous storyboard video prompt, used as continuity context:
${previousPrompt || "None"}

Next storyboard prompt:
${nextPrompt || "None"}

Reference storyboard prompts involved in this mode:
${(refPrompts || []).filter(Boolean).join("\n") || "None"}

Next-clip first-frame landing requirement:
${continuityLandingPrompt || "None"}

Rules:
- Except for the first storyboard, the content must explicitly continue from the previous storyboard video prompt, including at least two continuity details such as subject position, action state, gaze direction, prop state, lighting/color, camera movement, or emotional rhythm.
- Continuity means inheriting state, not repeating the same completed action. If the previous prompt already used a core action or transition result, this prompt must describe the next stage after it.
- Adjacent prompts must be differentiated. Choose a new dominant movement, reaction, camera change, or emotional beat that advances the story.
- If several nearby storyboard prompts mention the same prop/action/transition, split them into progressive phases instead of writing the full event every time. For example: approach -> contact -> light intensifies -> transition completes -> new scene reaction.
- If the motion type is A-to-B transition, the content must describe only the smooth process from the current frame toward the immediate next storyboard. Do not import later scene changes or repeat a transition that was already completed in the previous prompt.
- If the motion type is A-to-B transition, the beginning must continue from the previous video's ending state instead of resetting the subject, pose, gaze, prop state, lighting, or camera motion.
- If the motion type is A-to-B transition, the ending must settle cleanly on the next storyboard frame and hold a stable natural landing. Do not add rebound motion, reverse motion, extra actions, or a new event after reaching the next frame.
- For B-to-C after an A-to-B shot, treat B as the inherited starting state from the previous segment's ending. Continue from that state and advance to the next stage rather than replaying the A-to-B transition.
      - If the motion type is multi-image montage, the content must describe ordered multi-shot rhythm instead of only describing the first frame, and each referenced image should contribute a distinct beat.
      - If the motion type is multi-image transition montage, keep the montage rhythm for the current clip beats, but treat the final landing frame as a mandatory ending target that the clip must visually settle onto before the cut.
      - If the motion type is static-to-motion, the content must stay within the current storyboard and avoid introducing the next storyboard, unless a Next-clip first-frame landing requirement is provided.
- If Next-clip first-frame landing requirement is provided, the content must explicitly include the next clip first frame as the final reference frame / visual landing beat of the current clip.
- If a reference prompt is marked as 下一clip首帧/当前clip结尾落点, describe it as the final 0.5-1.0 second visual landing target, not as a normal full story beat.
- When a next-clip landing frame exists, the optimized content must include a final transition sentence that moves from the current clip's last storyboard toward that landing frame.
- The landing transition may describe composition, character posture, gaze direction, prop position, camera momentum, lighting/color, and emotional rhythm. It must not advance into the next clip's core action, dialogue, bargain, completed transaction, departure, or later event.
- Follow the target video model prompt-writing tips when they are provided.
- The current storyboard prompt and reference storyboard prompts are authoritative. If the existing draft video prompt conflicts with them, ignore the draft and rewrite from the storyboard prompts.
- Do not introduce story events that are not present in the current storyboard, the immediate next storyboard, or the ordered reference storyboard prompts.
- Avoid abrupt changes from the previous video prompt. If the scene changes, describe a natural transition rather than a sudden jump.
- Before returning JSON, compare the new content with the previous storyboard video prompt. If the main verb, prop behavior, camera movement, and transition phrase are nearly the same, rewrite it to focus on a different progression stage.
- Keep the visual target in cinematic digital realism rather than live-action photography.
- Avoid describing real-person footage, actor-photo facial detail, documentary look, or live-action portrait aesthetics.
`;
    const json = await u.ai.text.invoke({
      system: prompt,
      messages: [{ role: "user", content: userContext }],
      log: {
        stage: "stage6",
        action: "video_prompt_optimize",
        targetId: storyboardId,
        extra: {
          projectId,
          scriptId,
          storyboardId,
          mode: mode || "single",
          refPromptCount: (refPrompts || []).filter(Boolean).length,
          hasContinuityLanding: Boolean(continuityLandingPrompt),
        },
      },
      output: {
        time: z.number().describe("时长,镜头时长 1-15"),
        content: z.string().describe("提示词内容"),
        name: z.string().describe("分镜名称"),
      },
    }, langConfig) as any;

    if (!json.content || json.time === undefined || !json.name) {
      throw new Error("AI 返回格式错误");
    }

    return json as { content: string; time: number; name: string };
  } catch (err: any) {
    console.error("generateSingleVideoPrompt 调用失败:", err?.message || err);
    throw new Error(`生成视频提示词失败: ${err?.message || "未知错误"}`);
  }
}
// 主路由 - 单张图片处理
export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    scriptId: z.number().nullable(),
    id: z.string(),
    prompt: z.string().optional(),
    src: z.string(),
    mode: z.string().optional(),
    currentVideoPrompt: z.string().optional(),
    previousPrompt: z.string().optional(),
    nextPrompt: z.string().optional(),
    refPrompts: z.array(z.string()).optional(),
    continuityLandingPrompt: z.string().optional(),
    modelPromptTips: z.string().optional(),
  }),
  async (req, res) => {
    const {
      projectId,
      scriptId,
      id,
      prompt: imagePrompt,
      src,
      mode,
      currentVideoPrompt,
      previousPrompt,
      nextPrompt,
      refPrompts,
      continuityLandingPrompt,
      modelPromptTips,
    } = req.body;

    try {
      const scriptData = await u.db("t_script").where("id", scriptId).select("content").first();
      if (!scriptData) return res.status(500).send(error("剧本不存在"));

      const projectData = await u.db("t_project").where({ id: +projectId }).select("artStyle", "videoRatio").first();
      if (!projectData) return res.status(500).send(error("项目不存在"));

      const result = await generateSingleVideoPrompt({
        projectId,
        scriptId,
        storyboardId: id,
        scriptText: scriptData.content!,
        storyboardPrompt: imagePrompt || "",
        mode,
        currentVideoPrompt,
        previousPrompt,
        nextPrompt,
        refPrompts,
        continuityLandingPrompt,
        modelPromptTips,
      });

      res.status(200).send(
        success({
          id,
          videoPrompt: result.content || "",
          prompt: imagePrompt,
          duration: String(result.time || ""),
          projectId,
          type: "分镜",
          name: result.name || "",
          scriptId,
          src,
        }),
      );
    } catch (err: any) {
      console.error("生成视频提示词失败:", err?.message || err);
      res.status(500).send(error(err?.message || "生成视频提示词失败"));
    }
  },
);
