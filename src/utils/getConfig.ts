import u from "@/utils";

interface resData {
  model: string;
  apiKey: string;
  baseURL: string;
  manufacturer: string;
  name?: string;
}

// 只包含 t_setting 表里实际存在的字段
const settingFields = {
  image: "imageModel",
  language: "languageModel",
} as const;

type SettingType = keyof typeof settingFields;

// 定义返回类型映射
type ReturnType<T extends string> = T extends "video" ? resData[] : resData;

// 主方法
export default async function getConfig<T extends SettingType | "video" | "text">(type: T, manufacturer?: string): Promise<ReturnType<T>> {
  if (type === "video") {
    // 查询 t_config 表，返回数组
    const query = u.db("t_config").where("type", "video");
    if (manufacturer) query.where("manufacturer", manufacturer);
    const configList = await query;

    return configList.map((i: any) => ({
      ...i,
      baseURL: i.baseUrl,
    })) as ReturnType<T>;
  }

  if (type === "text") {
    // text 类型兼容旧 t_config 查询（用于 text.ts 中的 getConfig("text")）
    const config = await u.db("t_config").where("type", "text").first();
    if (!config) throw new Error("文本模型配置不存在");
    return {
      model: config.model ?? "",
      apiKey: config.apiKey ?? "",
      baseURL: config.baseUrl ?? "",
      manufacturer: config.manufacturer ?? "",
    } as ReturnType<T>;
  }

  // image / language：从 t_setting 表读取 JSON 字段
  const fieldName = settingFields[type as SettingType];
  const data: Record<string, any> | undefined = await u.db("t_setting").where({ id: 1 }).select([fieldName]).first();

  if (!data) throw new Error("设置数据不存在");

  const parsed = (() => {
    try { return JSON.parse(data[fieldName] || "{}"); } catch { return {}; }
  })();

  if (type === "language" && (!parsed.model || !parsed.apiKey)) {
    throw new Error("语言模型未配置，请在设置中填写模型名称和API Key");
  }

  return parsed as ReturnType<T>;
}
