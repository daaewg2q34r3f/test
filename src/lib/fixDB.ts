import { Knex } from "knex";

export default async (knex: Knex): Promise<void> => {
  const videoHasTime = await knex.schema.hasColumn("t_video", "time");
  if (!videoHasTime) {
    await knex.schema.alterTable("t_video", (table) => {
      table.integer("time");
    });
  }

  const configHasIndex = await knex.schema.hasColumn("t_config", "index");
  if (configHasIndex) {
    await knex.schema.alterTable("t_config", (table) => {
      table.dropColumn("index");
    });
  }

  const imageHasCreateTime = await knex.schema.hasColumn("t_image", "createTime");
  if (!imageHasCreateTime) {
    await knex.schema.alterTable("t_image", (table) => {
      table.integer("createTime");
    });
  }

  const assetsHasArtStyle = await knex.schema.hasColumn("t_assets", "artStyle");
  if (!assetsHasArtStyle) {
    await knex.schema.alterTable("t_assets", (table) => {
      table.text("artStyle");
    });
  }

  const assetsHasSelectedImages = await knex.schema.hasColumn("t_assets", "selectedImages");
  if (!assetsHasSelectedImages) {
    await knex.schema.alterTable("t_assets", (table) => {
      table.text("selectedImages");
    });
  }

  const videoHasShotId = await knex.schema.hasColumn("t_video", "shotId");
  if (!videoHasShotId) {
    await knex.schema.alterTable("t_video", (table) => {
      table.integer("shotId");
    });
  }

  const videoHasSubtitleText = await knex.schema.hasColumn("t_video", "subtitleText");
  if (!videoHasSubtitleText) {
    await knex.schema.alterTable("t_video", (table) => {
      table.text("subtitleText");
    });
  }

  const videoHasBatchId = await knex.schema.hasColumn("t_video", "batchId");
  if (!videoHasBatchId) {
    await knex.schema.alterTable("t_video", (table) => {
      table.text("batchId");
    });
  }

  const videoHasVoiceText = await knex.schema.hasColumn("t_video", "voiceText");
  if (!videoHasVoiceText) {
    await knex.schema.alterTable("t_video", (table) => {
      table.text("voiceText");
    });
  }

  const videoHasVoicePath = await knex.schema.hasColumn("t_video", "voicePath");
  if (!videoHasVoicePath) {
    await knex.schema.alterTable("t_video", (table) => {
      table.text("voicePath");
    });
  }
};
