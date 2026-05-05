import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";

const router = express.Router();

function stringifyField(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (Array.isArray(value)) return value.map(stringifyField).filter(Boolean).join("、");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const preferred = record.name ?? record.title ?? record.label ?? record.value ?? record.description ?? record.desc;
    if (preferred !== undefined && preferred !== value) {
      const text = stringifyField(preferred);
      if (text) return text;
    }
    return Object.values(record).map(stringifyField).filter(Boolean).join("、");
  }
  return "";
}

const stringField = z.preprocess(stringifyField, z.string());
const nullableStringField = z.preprocess(
  (value) => (value == null ? value : stringifyField(value)),
  z.string().optional().nullable(),
);

export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    scriptId: z.number().optional().nullable(),
    name: stringField,
    intro: stringField,
    type: stringField,
    prompt: stringField,
    remark: nullableStringField,
    episode: nullableStringField,
  }),
  async (req, res) => {
    const { projectId, name, intro, type, prompt, remark, episode, scriptId } = req.body;

    await u.db("t_assets").insert({
      projectId,
      name,
      intro,
      type,
      prompt,
      remark,
      episode,
      scriptId,
    });

    res.status(200).send(success({ message: "新增资产成功" }));
  },
);
