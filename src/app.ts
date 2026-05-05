import "./err";
import "./env";
import express, { Request, Response, NextFunction } from "express";
import expressWs from "express-ws";
import logger from "morgan";
import cors from "cors";
import buildRoute from "@/core";
import fs from "fs";
import router from "@/router";
import path from "path";
import u from "@/utils";
import jwt from "jsonwebtoken";
import { dbReady } from "@/utils/db";

const app = express();
let server: ReturnType<typeof app.listen> | null = null;
let isShuttingDown = false;

export default async function startServe() {
  if (process.env.NODE_ENV == "dev") await buildRoute();
  await dbReady;

  expressWs(app);

  app.use(logger("dev"));
  app.use(cors({ origin: "*" }));
  app.use(express.json({ limit: "100mb" }));
  app.use(express.urlencoded({ extended: true, limit: "100mb" }));

  let rootDir: string;
  if (typeof process.versions?.electron !== "undefined") {
    const { app } = require("electron");
    const userDataDir: string = app.getPath("userData");
    rootDir = path.join(userDataDir, "uploads");
  } else {
    rootDir = path.join(process.cwd(), "uploads");
  }
  // 确保 uploads 目录存在
  if (!fs.existsSync(rootDir)) {
    fs.mkdirSync(rootDir, { recursive: true });
  }
  console.log("上传目录:", rootDir);

  app.use(express.static(rootDir));

  // 前端静态文件服务（在token验证之前）
  const webDir = path.join(process.cwd(), "scripts", "web");
  app.use(express.static(webDir));

  // 兼容新前端：将 /api/* 请求重写为 /*
  app.use((req, _res, next) => {
    if (req.url.startsWith("/api/")) {
      req.url = req.url.slice(4); // 去掉 /api 前缀
    }
    next();
  });

  app.use(async (req, res, next) => {
    const setting = await u.db("t_setting").where("id", 1).select("tokenKey").first();
    if (!setting) return res.status(500).send({ message: "服务器未配置，请联系管理员" });
    const { tokenKey } = setting;
    // 从 header 或 query 参数获取 token
    const rawToken = req.headers.authorization || (req.query.token as string) || "";
    const token = rawToken.replace("Bearer ", "");
    // 白名单：登录接口
    if (req.path === "/other/login") return next();
    // 白名单：静态资源文件
    if (
      req.path === "/" ||
      req.path === "/index.html" ||
      req.path.startsWith("/assets/") ||
      req.path.endsWith(".js") ||
      req.path.endsWith(".css") ||
      req.path.endsWith(".ico") ||
      req.path.endsWith(".svg") ||
      req.path.endsWith(".png") ||
      req.path.endsWith(".jpg") ||
      req.path.endsWith(".jpeg") ||
      req.path.endsWith(".gif") ||
      req.path.endsWith(".webp")
    ) return next();
    // 白名单：SPA 前端路由（页面刷新时由 index.html 处理）
    if (
      req.method === "GET" &&
      !req.path.includes(".") &&
      (
        req.path === "/login" ||
        req.path === "/settings" ||
        req.path.startsWith("/creation") ||
        req.path.startsWith("/workflow") ||
        req.path.startsWith("/director") ||
        req.path.startsWith("/assets") ||
        req.path.startsWith("/project/")
      )
    ) return next();

    if (!token) return res.status(401).send({ message: "未提供token" });
    try {
      const decoded = jwt.verify(token, tokenKey as string);
      (req as any).user = decoded;
      next();
    } catch (err) {
      return res.status(401).send({ message: "无效的token" });
    }
  });

  await router(app);

  // SPA 回退：浏览器直接访问前端路由时返回 index.html
  app.use((req, res, next) => {
    if (req.accepts("html") && !req.path.includes(".")) {
      res.sendFile(path.join(webDir, "index.html"));
    } else {
      next();
    }
  });

  // 404 处理
  app.use((_: Request, res: Response, next: NextFunction) => {
    return res.status(404).send({ message: "Not Found" });
  });

  // 错误处理
  app.use((err: any, _: Request, res: Response, __: NextFunction) => {
    res.locals.message = err.message;
    res.locals.error = err;
    console.error(err);
    res.status(err.status || 500).send(err);
  });

  const port = parseInt(process.env.PORT || "60000");
  server = app.listen(port, async () => {
    const address = server?.address();
    const realPort = typeof address === "string" ? address : address?.port;
    console.log(`[服务启动成功]: http://localhost:${realPort}`);
  });
}

// 支持await关闭
export function closeServe(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (server) {
      server.close((err?: Error) => {
        if (err) return reject(err);
        console.log("[服务已关闭]");
        server = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

async function shutdownServe(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[服务关闭中]: ${signal}`);

  try {
    await closeServe();
    process.exit(0);
  } catch (error) {
    console.error("[服务关闭失败]:", error);
    process.exit(1);
  }
}

process.on("SIGINT", () => {
  void shutdownServe("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdownServe("SIGTERM");
});

const isElectron = typeof process.versions?.electron !== "undefined";
if (!isElectron) startServe();
