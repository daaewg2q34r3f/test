import db from "@/utils/db";
import oss from "@/utils/oss";
import { generateImage, generateVideo } from "@/utils/ai";
import editImage from "@/utils/editImage";
import number2Chinese from "@/utils/number2Chinese";
import deleteOutline from "@/utils/deleteOutline";
import getConfig from "./utils/getConfig";
import { v4 as uuid } from "uuid";

import AIText from "@/utils/ai/text";

export default {
  db,
  oss,
  ai: {
    text: AIText,
    generateImage,
    generateVideo,
  },
  editImage,
  number2Chinese,
  deleteOutline,
  getConfig,
  uuid,
};
