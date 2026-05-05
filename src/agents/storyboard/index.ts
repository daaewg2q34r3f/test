import { EventEmitter } from "events";
import u from "@/utils";
import type { DB } from "@/types/database";
import generateFrameImage from "./generateImageTool";

type RefreshEvent = "storyline" | "outline" | "assets" | "storyboard";

interface ShotCell {
  src?: string;
  prompt?: string;
  id?: string;
  dbId?: number;
}

interface Shot {
  id: number;
  segmentId: number;
  title: string;
  x: number;
  y: number;
  cells: ShotCell[];
}

export default class Storyboard {
  private readonly projectId: number;
  private readonly scriptId: number;
  readonly emitter = new EventEmitter();
  history: Array<[string, string]> = [];
  novelChapters: DB["t_novel"][] = [];

  private shots: Shot[] = [];
  private generatingShots: Set<number> = new Set();

  modelName = "gpt-4.1";
  apiKey = "";
  baseURL = "";

  constructor(projectId: number, scriptId: number) {
    this.projectId = projectId;
    this.scriptId = scriptId;
  }

  get events() {
    return this.emitter;
  }

  public updatePreShots(segmentId: number, cellId: number, cell: ShotCell) {
    const shotIndex = this.shots.findIndex(item => item.segmentId === segmentId);
    if (shotIndex === -1) return `分镜 ${segmentId} 不存在`;

    const cellIndex = this.shots[shotIndex].cells.findIndex(item => item.id === cellId.toString());
    if (cellIndex === -1) return `镜头 ${cellId} 不存在`;

    this.shots[shotIndex].cells[cellIndex] = { ...this.shots[shotIndex].cells[cellIndex], ...cell };
    this.emitter.emit("shotsUpdated", this.shots);
    return "ok";
  }

  async executeShotImageGeneration(shotIds: number[]): Promise<void> {
    await this.loadShotsFromDB();
    const order = new Map(this.shots.map((shot, index) => [shot.id, index]));
    const orderedShotIds = [...shotIds].sort(
      (a, b) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER),
    );

    let previousRefPath = "";
    for (const shotId of orderedShotIds) {
      previousRefPath = await this.generateSingleShotImage(shotId, previousRefPath);
    }
  }

  private async generateSingleShotImage(shotId: number, initialPreviousRefPath = ""): Promise<string> {
    try {
      const shot = this.shots.find(item => item.id === shotId);
      if (!shot) return initialPreviousRefPath;

      const prompts = shot.cells.map(cell => cell.prompt).filter((prompt): prompt is string => Boolean(prompt));
      if (prompts.length === 0) {
        this.generatingShots.delete(shotId);
        return initialPreviousRefPath;
      }

      this.generatingShots.add(shotId);
      this.emitter.emit("shotImageGenerateProgress", {
        shotId,
        status: "generating",
        message: `正在逐帧生成 ${prompts.length} 张镜头图片`,
      });

      const timestamp = Date.now();
      const imagePaths: string[] = [];
      const fileNames: string[] = [];
      let previousRefPath = initialPreviousRefPath;

      for (let i = 0; i < shot.cells.length; i++) {
        const cell = shot.cells[i];
        const extraRefs = previousRefPath ? [{ name: "上一帧分镜", path: previousRefPath }] : undefined;
        const buffer = await generateFrameImage(
          {
            prompt: cell.prompt || "",
            id: cell.id,
            dbId: cell.dbId,
            segmentId: shot.segmentId,
            shotIndex: i + 1,
          },
          this.scriptId,
          this.projectId,
          undefined,
          extraRefs,
        );

        const fileName = `${this.projectId}/chat/${this.scriptId}/storyboard/shot_${shotId}_take_${i}_${timestamp}.png`;
        await u.oss.writeFile(fileName, buffer);
        const imageUrl = await u.oss.getFileUrl(fileName);
        imagePaths.push(imageUrl);
        fileNames.push(fileName);
        previousRefPath = fileName;

        this.emitter.emit("shotImageGenerateProgress", {
          shotId,
          status: "saving",
          message: `已保存 ${i + 1}/${shot.cells.length} 张镜头图片`,
          progress: Math.round(((i + 1) / shot.cells.length) * 100),
        });
      }

      shot.cells = shot.cells.map((cell, i) => ({
        id: cell.id ?? u.uuid(),
        ...cell,
        src: imagePaths[i] || cell.src,
      }));

      for (let i = 0; i < shot.cells.length; i++) {
        const cell = shot.cells[i];
        const filePath = fileNames[i];
        if (cell.dbId && filePath) {
          await u.db("t_assets").where("id", cell.dbId).update({ filePath });
        }
      }

      this.generatingShots.delete(shotId);
      this.emitter.emit("shotImageGenerateComplete", { shotId, shot, imagePaths });
      this.emitter.emit("shotsUpdated", this.shots);
      this.emitter.emit("refresh", "storyboard");
      return previousRefPath;
    } catch (err: any) {
      this.generatingShots.delete(shotId);
      this.emitter.emit("shotImageGenerateError", { shotId, error: err?.message || String(err) });
      return initialPreviousRefPath;
    }
  }

  private async loadShotsFromDB(): Promise<void> {
    const rows = await u.db("t_assets")
      .where({ scriptId: this.scriptId, type: "storyboard" })
      .orderBy("segmentId", "asc")
      .orderBy("shotIndex", "asc")
      .orderBy("id", "asc");

    this.shots = rows.map((row: any, index: number) => ({
      id: Number(row.id),
      segmentId: Number(row.segmentId ?? index),
      title: row.name || `分镜 ${index + 1}`,
      x: Number(row.x ?? 0),
      y: Number(row.y ?? 0),
      cells: [{
        id: String(row.id),
        dbId: Number(row.id),
        src: row.filePath || "",
        prompt: row.prompt || row.name || "",
      }],
    }));
  }

  public async call(msg: string): Promise<string> {
    this.history.push(["user", msg]);
    const response = "当前版本已保留分镜助手连接；批量分镜图片生成会按顺序串联上一帧参考。";
    this.history.push(["assistant", response]);
    this.emitter.emit("response", response);
    return response;
  }

  public async generateAll(): Promise<void> {
    try {
      this.emitter.emit("generateAllStart");
      await this.loadShotsFromDB();
      const shotIds = this.shots
        .filter(shot => shot.cells.some(cell => !cell.src))
        .map(shot => shot.id);

      this.emitter.emit("generateAllProgress", { current: 0, total: shotIds.length });
      let done = 0;
      let previousRefPath = "";
      for (const shotId of shotIds) {
        previousRefPath = await this.generateSingleShotImage(shotId, previousRefPath);
        done++;
        this.emitter.emit("generateAllProgress", { current: done, total: shotIds.length });
      }
      this.emitter.emit("generateAllComplete", { total: shotIds.length });
    } catch (err: any) {
      this.emitter.emit("generateAllError", { message: err?.message || String(err) });
    }
  }

  private refresh(type: RefreshEvent) {
    this.emitter.emit("refresh", type);
  }
}
