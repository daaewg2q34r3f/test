import isPathInside from "is-path-inside";
import fs from "node:fs/promises";
import path from "node:path";

function normalizeUserPath(userPath: string): string {
  const trimmedPath = userPath.replace(/^[/\\]+/, "");
  return trimmedPath.split("/").join(path.sep);
}

function resolveSafeLocalPath(userPath: string, rootDir: string): string {
  const safePath = normalizeUserPath(userPath);
  const absPath = path.join(rootDir, safePath);
  if (!isPathInside(absPath, rootDir)) {
    throw new Error(`${userPath} is outside the OSS root directory`);
  }
  return absPath;
}

class OSS {
  private rootDir: string;
  private initPromise: Promise<void>;

  constructor() {
    if (typeof process.versions?.electron !== "undefined") {
      const { app } = require("electron");
      const userDataDir: string = app.getPath("userData");
      this.rootDir = path.join(userDataDir, "uploads");
    } else {
      this.rootDir = path.join(process.cwd(), "uploads");
    }

    this.initPromise = fs.mkdir(this.rootDir, { recursive: true }).then(() => {});
  }

  private async ensureInit() {
    await this.initPromise;
  }

  private getInternalBaseUrl() {
    const port = process.env.PORT || "60000";
    const url = process.env.INTERNAL_OSSURL || `http://127.0.0.1:${port}/`;
    return url.endsWith("/") ? url : `${url}/`;
  }

  private getExternalBaseUrl() {
    const url = process.env.OSSURL || this.getInternalBaseUrl();
    return url.endsWith("/") ? url : `${url}/`;
  }

  private buildFileUrl(userRelPath: string, baseUrl: string) {
    const safePath = normalizeUserPath(userRelPath);
    return `${baseUrl}${safePath.split(path.sep).join("/")}`;
  }

  async getFileUrl(userRelPath: string): Promise<string> {
    await this.ensureInit();
    return this.buildFileUrl(userRelPath, this.getInternalBaseUrl());
  }

  async getExternalFileUrl(userRelPath: string): Promise<string> {
    await this.ensureInit();
    return this.buildFileUrl(userRelPath, this.getExternalBaseUrl());
  }

  async getLocalPath(userRelPath: string): Promise<string> {
    await this.ensureInit();
    return resolveSafeLocalPath(userRelPath, this.rootDir);
  }

  async getFile(userRelPath: string): Promise<Buffer> {
    await this.ensureInit();
    return fs.readFile(resolveSafeLocalPath(userRelPath, this.rootDir));
  }

  async getImageBase64(userRelPath: string): Promise<string> {
    await this.ensureInit();
    const absPath = resolveSafeLocalPath(userRelPath, this.rootDir);
    const stat = await fs.stat(absPath);
    if (!stat.isFile()) {
      throw new Error(`${userRelPath} is not a file`);
    }

    const ext = path.extname(userRelPath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".bmp": "image/bmp",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon",
      ".tiff": "image/tiff",
      ".tif": "image/tiff",
    };

    const mimeType = mimeTypes[ext];
    if (!mimeType) {
      throw new Error(`Unsupported image format: ${ext}`);
    }

    const data = await fs.readFile(absPath);
    return `data:${mimeType};base64,${data.toString("base64")}`;
  }

  async deleteFile(userRelPath: string): Promise<void> {
    await this.ensureInit();
    await fs.unlink(resolveSafeLocalPath(userRelPath, this.rootDir));
  }

  async deleteDirectory(userRelPath: string): Promise<void> {
    await this.ensureInit();
    const absPath = resolveSafeLocalPath(userRelPath, this.rootDir);
    const stat = await fs.stat(absPath);
    if (!stat.isDirectory()) {
      throw new Error(`${userRelPath} is not a directory`);
    }
    await fs.rm(absPath, { recursive: true, force: true });
  }

  async writeFile(userRelPath: string, data: Buffer | string): Promise<void> {
    await this.ensureInit();
    const absPath = resolveSafeLocalPath(userRelPath, this.rootDir);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, data);
  }

  async fileExists(userRelPath: string): Promise<boolean> {
    await this.ensureInit();
    try {
      const stat = await fs.stat(resolveSafeLocalPath(userRelPath, this.rootDir));
      return stat.isFile();
    } catch {
      return false;
    }
  }
}

export default new OSS();
