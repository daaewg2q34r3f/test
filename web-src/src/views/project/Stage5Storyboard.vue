<template>
  <div class="stage-page">
    <!-- Toolbar -->
    <div class="stage-toolbar">
      <h2 class="stage-title">分镜制作</h2>
      <div class="toolbar-actions">
        <span v-if="frames.length > 0" class="frame-stat">
          {{ frames.filter(f => f.imageUrl).length }} / {{ frames.length }} 镜已生成图片
        </span>

        <!-- AI Plan dropdown -->
        <el-dropdown split-button type="primary" size="default" @click="handlePlanShots(30)" @command="handlePlanShotCommand" :disabled="!selectedScriptId || planning">
          <span>{{ planning ? 'AI规划中...' : 'AI智能规划' }}</span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="20">最多20镜</el-dropdown-item>
              <el-dropdown-item command="30">最多30镜（默认）</el-dropdown-item>
              <el-dropdown-item command="40">最多40镜</el-dropdown-item>
              <el-dropdown-item command="60">最多60镜</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

        <!-- Batch generate -->
        <el-button
          :disabled="frames.length === 0 || batchGenerating"
          :loading="batchGenerating"
          @click="handleBatchGenerate"
        >
          {{ batchGenerating ? `批量生成中 ${batchProgress}/${frames.filter(f=>!f.imageUrl).length}` : '批量生成图片' }}
        </el-button>

        <!-- View toggle -->
        <el-button-group v-if="frames.length > 0">
          <el-button :type="viewMode === 'list' ? 'primary' : ''" size="default" @click="viewMode = 'list'" title="列表视图">☰</el-button>
          <el-button :type="viewMode === 'grid' ? 'primary' : ''" size="default" @click="viewMode = 'grid'" title="分镜板视图">▦</el-button>
        </el-button-group>

        <el-button
          type="success"
          :disabled="frames.length === 0"
          @click="completeStage"
        >
          完成 → 视频合成
        </el-button>
      </div>
    </div>

    <!-- Episode Tabs -->
    <div class="episode-tabs">
      <el-tabs v-model="selectedScriptId" @tab-change="onEpisodeChange">
        <el-tab-pane
          v-for="ep in episodes"
          :key="ep.scriptId"
          :label="`第${ep.episode}集`"
          :name="ep.scriptId"
        />
      </el-tabs>
    </div>

    <!-- Content area: left sidebar + shot list -->
    <div class="content-area">
      <!-- Left narrative sidebar -->
      <div class="narrative-sidebar" :class="{ collapsed: narrativeCollapsed }">
        <div class="sidebar-toggle" @click="narrativeCollapsed = !narrativeCollapsed" title="展开/收起">
          <span class="sidebar-toggle-icon">{{ narrativeCollapsed ? '▶' : '◀' }}</span>
          <span v-if="narrativeCollapsed" class="sidebar-title-vert">剧情参考</span>
          <span v-else class="sidebar-title-horiz">剧情参考</span>
        </div>
        <div v-show="!narrativeCollapsed" class="sidebar-tabs">
          <span class="sidebar-tab" :class="{ active: sidebarTab === 'narrative' }" @click="sidebarTab = 'narrative'">大纲</span>
          <span class="sidebar-tab" :class="{ active: sidebarTab === 'script' }" @click="sidebarTab = 'script'">剧本</span>
        </div>
        <div v-show="!narrativeCollapsed" class="sidebar-content">
          <!-- Tab: 大纲 -->
          <template v-if="sidebarTab === 'narrative'">
            <div v-if="!episodeNarrative.coreConflict && !episodeNarrative.emotionalCurve" class="sidebar-empty">暂无剧情参考</div>
            <template v-else>
              <div v-if="episodeNarrative.coreConflict" class="narrative-card conflict">
                <div class="nc-header"><span class="nc-dot conflict-dot"></span><span class="nc-label">核心冲突</span></div>
                <div class="nc-text">{{ episodeNarrative.coreConflict }}</div>
              </div>
              <div v-if="episodeNarrative.emotionalCurve" class="narrative-card emotion">
                <div class="nc-header"><span class="nc-dot emotion-dot"></span><span class="nc-label">情绪曲线</span></div>
                <div class="nc-text">{{ episodeNarrative.emotionalCurve }}</div>
              </div>
              <div v-if="episodeNarrative.openingHook" class="narrative-card hook">
                <div class="nc-header"><span class="nc-dot hook-dot"></span><span class="nc-label">开场钩子</span></div>
                <div class="nc-text">{{ episodeNarrative.openingHook }}</div>
              </div>
              <div v-if="episodeNarrative.endingHook" class="narrative-card hook">
                <div class="nc-header"><span class="nc-dot hook-dot"></span><span class="nc-label">结尾钩子</span></div>
                <div class="nc-text">{{ episodeNarrative.endingHook }}</div>
              </div>
              <div v-if="episodeNarrative.keyEvents && episodeNarrative.keyEvents.length" class="narrative-card events">
                <div class="nc-header"><span class="nc-dot events-dot"></span><span class="nc-label">关键事件</span></div>
                <div class="nc-events">
                  <span v-for="(ev, i) in episodeNarrative.keyEvents" :key="i" class="nc-event-item">
                    {{ ev }}<span v-if="i < episodeNarrative.keyEvents.length - 1" class="nc-arrow">→</span>
                  </span>
                </div>
              </div>
            </template>
          </template>
          <!-- Tab: 剧本原文 -->
          <template v-else>
            <div v-if="!scriptContent" class="sidebar-empty">暂无剧本内容</div>
            <pre v-else class="script-text">{{ scriptContent }}</pre>
          </template>
        </div>
      </div>

      <!-- Main scrollable area -->
      <div class="shot-list-container" v-loading="loading">

        <!-- Emotion rhythm bar -->
        <div v-if="frames.length > 0" class="emotion-bar">
          <div
            v-for="f in segmentGroups.flatMap(sg => sg.shots)"
            :key="f.id"
            class="emotion-block"
            :style="{ background: EMOTION_COLORS[f.emotion] || '#d1d5db', flex: f.duration }"
            :title="`${overallIndex(f.id)}. ${f.emotion || '无情绪'} · ${f.shotType}`"
            @click="scrollToShot(f.id)"
          ></div>
        </div>

        <!-- Empty state -->
        <div v-if="frames.length === 0 && !loading && !planning" class="empty-hint">
          <el-empty description="点击“AI智能规划”自动生成分镜，或手动添加镜头" />
        </div>

        <!-- Grid view -->
        <div v-else-if="viewMode === 'grid'" class="shot-grid">
          <template v-for="seg in segmentGroups" :key="seg.segmentId">
            <div class="grid-seg-header">第{{ seg.segmentId }}场 · {{ seg.shots.length }}镜</div>
            <div
              v-for="f in seg.shots"
              :key="f.id"
              class="grid-card"
              :id="`shot-${f.id}`"
            >
              <div class="grid-img-wrap" @click="f.imageUrl && (previewUrl = f.imageUrl)">
                <img v-if="f.imageUrl" :src="f.imageUrl" class="grid-img" @error="onImgError($event, f)" />
                <div v-else-if="generatingIds.has(f.id)" class="grid-generating"><div class="spin-sm"></div></div>
                <div v-else class="grid-empty">待生成</div>
                <span class="grid-index">{{ overallIndex(f.id) }}</span>
                <span class="grid-shot-label">S{{ f.segmentId }}-{{ String(f.shotIndex).padStart(2,'0') }}</span>
              </div>
              <div class="grid-meta">
                <span class="grid-emotion" :style="{ background: EMOTION_COLORS[f.emotion] || '#d1d5db' }">{{ f.emotion || '-' }}</span>
                <span class="grid-shot-type">{{ f.shotType }}</span>
                <span v-if="f.cameraMovement && f.cameraMovement !== '固定'" class="grid-movement">{{ f.cameraMovement }}</span>
              </div>
              <div class="grid-prompt">{{ f.prompt || '（无描述）' }}</div>
              <div class="grid-actions">
                <el-button size="small" :loading="generatingIds.has(f.id)" :disabled="batchGenerating" @click="generateShotImage(f)">
                  {{ f.imageUrl ? '重新生成' : '生成图片' }}
                </el-button>
                <el-button size="small" @click="openGridEdit(f)">编辑</el-button>
              </div>
            </div>
          </template>
        </div>

        <!-- List view -->
        <div v-else class="shot-list">
        <template v-for="seg in segmentGroups" :key="seg.segmentId">
          <!-- Segment header -->
          <div class="segment-header">
            <span class="segment-label">第{{ seg.segmentId }}场</span>
            <span class="segment-count">{{ seg.shots.length }} 个镜头</span>
          </div>

          <!-- Shot cards -->
          <div
            v-for="(frame, frameIdx) in seg.shots"
            :key="frame.id"
            :id="`shot-${frame.id}`"
            class="shot-card"
            :class="{ expanded: expandedId === frame.id }"
          >
            <!-- Collapsed row -->
            <div class="shot-row" @click="toggleExpand(frame)">
              <!-- Index badge -->
              <div class="shot-index-badge">{{ overallIndex(frame.id) }}</div>

              <!-- Segment / name tags -->
              <div class="shot-tags">
                <span class="tag tag-segment">S{{ frame.segmentId }}</span>
                <span v-if="frame.emotion" class="tag tag-emotion">{{ frame.emotion }}</span>
                <span v-if="frame.shotType" class="tag tag-shot-type">{{ frame.shotType }}</span>
              </div>

              <!-- Prompt preview -->
              <div class="shot-prompt-preview">{{ frame.prompt || '（无描述）' }}</div>

              <!-- Duration -->
              <div class="shot-duration">{{ frame.duration }}s</div>

              <!-- Image thumbnail -->
              <div class="shot-thumb">
                <img
                  v-if="frame.imageUrl"
                  :src="frame.imageUrl"
                  class="thumb-img"
                  @click.stop="previewUrl = frame.imageUrl"
                  @error="onImgError($event, frame)"
                />
                <div v-else-if="generatingIds.has(frame.id)" class="thumb-spin">
                  <div class="spin-sm"></div>
                </div>
                <div v-else class="thumb-empty">待生成</div>
              </div>

              <!-- Image status tag -->
              <el-tag
                v-if="frame.imageUrl"
                type="success"
                size="small"
                class="shot-gen-btn"
              >已生图</el-tag>
              <el-tag
                v-else-if="generatingIds.has(frame.id)"
                type="warning"
                size="small"
                class="shot-gen-btn"
              >生成中</el-tag>

              <!-- Expand toggle -->
              <div class="shot-expand-btn" @click.stop="toggleExpand(frame)">
                {{ expandedId === frame.id ? '▲收起' : '▼编辑' }}
              </div>
            </div>

            <!-- Expanded editing form -->
            <transition name="expand">
              <div v-if="expandedId === frame.id && editDraft[frame.id]" class="shot-form">
                <div class="form-left">
                  <!-- Characters -->
                  <div class="form-row">
                    <label class="form-label">角色</label>
                    <div class="form-field">
                      <el-checkbox-group v-model="editDraft[frame.id].characters" size="small">
                        <el-checkbox
                          v-for="ch in episodeChars"
                          :key="ch"
                          :label="ch"
                          :value="ch"
                          border
                        />
                      </el-checkbox-group>
                    </div>
                  </div>

                  <!-- Scene -->
                  <div class="form-row">
                    <label class="form-label">场景</label>
                    <div class="form-field">
                      <el-select v-model="editDraft[frame.id].scene" placeholder="选择场景" size="small" style="width: 200px">
                        <el-option v-for="sc in episodeScenes" :key="sc" :label="sc" :value="sc" />
                      </el-select>
                    </div>
                  </div>

                  <!-- Props -->
                  <div class="form-row">
                    <label class="form-label">道具</label>
                    <div class="form-field">
                      <el-checkbox-group v-model="editDraft[frame.id].props" size="small">
                        <el-checkbox
                          v-for="pr in episodeProps"
                          :key="pr"
                          :label="pr"
                          :value="pr"
                          border
                        />
                      </el-checkbox-group>
                    </div>
                  </div>

                  <!-- Emotion selector -->
                  <div class="form-row">
                    <label class="form-label">情绪</label>
                    <div class="form-field pill-group">
                      <span
                        v-for="em in EMOTIONS"
                        :key="em"
                        class="pill"
                        :class="{ active: editDraft[frame.id].emotion === em }"
                        @click="editDraft[frame.id].emotion = em"
                      >{{ em }}</span>
                    </div>
                  </div>

                  <!-- Shot type selector -->
                  <div class="form-row">
                    <label class="form-label">镜头</label>
                    <div class="form-field pill-group">
                      <span
                        v-for="st in SHOT_TYPES"
                        :key="st"
                        class="pill"
                        :class="{ active: editDraft[frame.id].shotType === st }"
                        @click="editDraft[frame.id].shotType = st"
                      >{{ st }}</span>
                    </div>
                  </div>

                  <!-- Camera movement selector -->
                  <div class="form-row">
                    <label class="form-label">运动</label>
                    <div class="form-field pill-group">
                      <span
                        v-for="cm in CAMERA_MOVEMENTS"
                        :key="cm"
                        class="pill"
                        :class="{ active: editDraft[frame.id].cameraMovement === cm }"
                        @click="editDraft[frame.id].cameraMovement = cm"
                      >{{ cm }}</span>
                    </div>
                  </div>

                  <!-- Duration slider -->
                  <div class="form-row">
                    <label class="form-label">时长</label>
                    <div class="form-field" style="flex: 1">
                      <el-slider v-model="editDraft[frame.id].duration" :min="2" :max="10" show-input size="small" />
                    </div>
                  </div>

                  <!-- Prompt textarea -->
                  <div class="form-row align-start">
                    <label class="form-label">描述</label>
                    <div class="form-field" style="flex: 1">
                      <el-input
                        v-model="editDraft[frame.id].prompt"
                        type="textarea"
                        :rows="4"
                        placeholder="画面描述..."
                      />
                    </div>
                  </div>

                  <!-- Video prompt textarea -->
                  <div class="form-row align-start">
                    <label class="form-label">视频提示</label>
                    <div class="form-field" style="flex: 1">
                      <el-input
                        v-model="editDraft[frame.id].videoPrompt"
                        type="textarea"
                        :rows="2"
                        placeholder="视频运动描述（可选）..."
                      />
                    </div>
                  </div>

                  <!-- Action buttons -->
                  <div class="form-actions">
                    <el-button size="small" type="primary" :loading="savingId === frame.id" @click="saveFrameDraft(frame.id)">保存</el-button>
                    <el-button size="small" :disabled="frameIdx === 0 && seg.segmentId === segmentGroups[0]?.segmentId" @click="moveFrameUp(frame)">上移</el-button>
                    <el-button size="small" :disabled="frameIdx === seg.shots.length - 1 && seg.segmentId === segmentGroups[segmentGroups.length - 1]?.segmentId" @click="moveFrameDown(frame)">下移</el-button>
                    <el-button size="small" type="danger" @click="deleteFrame(frame)">删除</el-button>
                  </div>
                </div>

                <!-- Right: ref image picker + image generation -->
                <div class="form-right">
                  <!-- Ref image picker -->
                  <div class="ref-images-section">
                    <div class="ref-images-title">
                      参考图
                      <span class="ref-images-hint">（可多选，包含角色 / 场景 / 道具资产图，以及上一场 / 同场分镜图；默认勾选上一场结尾）</span>
                    </div>
                    <div v-if="loadingRefImages[frame.id]" class="ref-loading">
                      <div class="spin-sm"></div> 加载中...
                    </div>
                    <div v-else-if="shotRefImages[frame.id]?.length" class="ref-images-wrap">
                      <template v-for="cat in refImageCategorized(frame.id)" :key="cat.type">
                        <div class="ref-cat-header" :class="`ref-cat-${cat.type}`">{{ cat.label }}</div>
                        <template v-for="grp in cat.groups" :key="grp.name">
                          <div v-if="cat.type !== '同场'" class="ref-asset-label">{{ grp.name }}</div>
                          <div class="ref-images-grid">
                            <div
                              v-for="img in grp.images"
                              :key="img.rawPath"
                              class="ref-img-item"
                              :class="{ selected: editDraft[frame.id]?.selectedRefPaths?.includes(img.rawPath) }"
                              @click="toggleRefImage(frame.id, img.rawPath)"
                              @dblclick.stop="previewUrl = img.url"
                            >
                              <img :src="img.url" :alt="img.assetName" @error="($event.target as HTMLImageElement).closest('.ref-img-item')?.remove()" />
                              <div v-if="editDraft[frame.id]?.selectedRefPaths?.includes(img.rawPath)" class="ref-img-check">✓</div>
                              <button v-if="img.assetId !== -1" class="ref-img-del" @click.stop="deleteRefImage(frame.id, img)" title="删除该参考图">×</button>
                            </div>
                          </div>
                        </template>
                      </template>
                    </div>
                    <div v-else class="ref-no-images">先选角色/场景，此处将显示对应图片</div>
                  </div>

                  <!-- Image generation -->
                  <div class="image-gen-section">
                    <el-button
                      type="primary"
                      style="width:100%"
                      :loading="generatingIds.has(frame.id)"
                      :disabled="batchGenerating"
                      @click="generateShotImage(frame)"
                    >
                      {{ generatingIds.has(frame.id) ? '生成中，请稍候...' : (editDraft[frame.id]?.imageUrl || frame.imageUrl ? '重新生成图片' : '生成分镜图片') }}
                    </el-button>
                  </div>

                  <!-- Image preview -->
                  <div class="expanded-img-wrap" v-if="editDraft[frame.id]?.imageUrl || frame.imageUrl">
                    <img
                      :src="editDraft[frame.id]?.imageUrl || frame.imageUrl"
                      class="expanded-img-preview"
                      @click="previewUrl = editDraft[frame.id]?.imageUrl || frame.imageUrl"
                    />
                    <button class="generated-img-del" @click="deleteGeneratedImage(frame)" title="删除生成图">× 删除图片</button>
                  </div>
                  <div v-else-if="generatingIds.has(frame.id)" class="expanded-thumb-spin">
                    <div class="spin-lg"></div>
                    <span>图片生成中，请稍候...</span>
                  </div>
                </div>
              </div>
            </transition>
          </div>
        </template>

        <!-- Add shot button -->
        <div class="add-shot-row" v-if="selectedScriptId">
          <el-button size="small" @click="handleAddShot">+ 添加空白镜头</el-button>
        </div>
      </div>
    </div>
    </div><!-- end content-area -->

    <!-- Planning overlay -->
    <Teleport to="body">
      <div v-if="planning" class="planning-overlay">
        <div class="planning-card">
          <div class="spin-lg"></div>
          <div class="planning-title">AI正在规划分镜...</div>
          <div class="planning-message">{{ planningMessage }}</div>
          <div class="planning-progress" v-if="planningFrameCount > 0">已生成 {{ planningFrameCount }} 个分镜</div>
        </div>
      </div>
    </Teleport>

    <!-- Grid Edit Dialog -->
    <Teleport to="body">
      <el-dialog
        v-if="gridEditFrame"
        v-model="gridEditVisible"
        :title="`第${gridEditFrame.segmentId}场 第${gridEditFrame.shotIndex}镜 · 编辑`"
        width="900px"
        :close-on-click-modal="false"
        destroy-on-close
        class="grid-edit-dialog"
      >
        <div v-if="editDraft[gridEditFrame.id]" class="shot-form">
          <div class="form-left">
            <div class="form-row">
              <label class="form-label">角色</label>
              <div class="form-field">
                <el-checkbox-group v-model="editDraft[gridEditFrame.id].characters" size="small">
                  <el-checkbox v-for="ch in episodeChars" :key="ch" :label="ch" :value="ch" border />
                </el-checkbox-group>
              </div>
            </div>
            <div class="form-row">
              <label class="form-label">场景</label>
              <div class="form-field">
                <el-select v-model="editDraft[gridEditFrame.id].scene" placeholder="选择场景" size="small" style="width: 200px">
                  <el-option v-for="sc in episodeScenes" :key="sc" :label="sc" :value="sc" />
                </el-select>
              </div>
            </div>
            <div class="form-row">
              <label class="form-label">道具</label>
              <div class="form-field">
                <el-checkbox-group v-model="editDraft[gridEditFrame.id].props" size="small">
                  <el-checkbox v-for="pr in episodeProps" :key="pr" :label="pr" :value="pr" border />
                </el-checkbox-group>
              </div>
            </div>
            <div class="form-row">
              <label class="form-label">情绪</label>
              <div class="form-field pill-group">
                <span v-for="em in EMOTIONS" :key="em" class="pill" :class="{ active: editDraft[gridEditFrame.id].emotion === em }" @click="editDraft[gridEditFrame.id].emotion = em">{{ em }}</span>
              </div>
            </div>
            <div class="form-row">
              <label class="form-label">镜头</label>
              <div class="form-field pill-group">
                <span v-for="st in SHOT_TYPES" :key="st" class="pill" :class="{ active: editDraft[gridEditFrame.id].shotType === st }" @click="editDraft[gridEditFrame.id].shotType = st">{{ st }}</span>
              </div>
            </div>
            <div class="form-row">
              <label class="form-label">运动</label>
              <div class="form-field pill-group">
                <span v-for="cm in CAMERA_MOVEMENTS" :key="cm" class="pill" :class="{ active: editDraft[gridEditFrame.id].cameraMovement === cm }" @click="editDraft[gridEditFrame.id].cameraMovement = cm">{{ cm }}</span>
              </div>
            </div>
            <div class="form-row">
              <label class="form-label">时长</label>
              <div class="form-field" style="flex:1">
                <el-slider v-model="editDraft[gridEditFrame.id].duration" :min="2" :max="10" show-input size="small" />
              </div>
            </div>
            <div class="form-row align-start">
              <label class="form-label">描述</label>
              <div class="form-field" style="flex:1">
                <el-input v-model="editDraft[gridEditFrame.id].prompt" type="textarea" :rows="4" placeholder="画面描述..." />
              </div>
            </div>
            <div class="form-row align-start">
              <label class="form-label">视频提示</label>
              <div class="form-field" style="flex:1">
                <el-input v-model="editDraft[gridEditFrame.id].videoPrompt" type="textarea" :rows="2" placeholder="视频运动描述（可选）..." />
              </div>
            </div>
            <div class="form-actions">
              <el-button size="small" type="primary" :loading="savingId === gridEditFrame.id" @click="saveFrameDraft(gridEditFrame.id)">保存</el-button>
              <el-button size="small" type="danger" @click="deleteFrame(gridEditFrame); gridEditVisible = false">删除</el-button>
            </div>
          </div>
          <div class="form-right">
            <div class="ref-images-section">
              <div class="ref-images-title">
                参考图
                  <span class="ref-images-hint">（可多选，包含角色 / 场景 / 道具资产图，以及上一场 / 同场分镜图；默认勾选上一场结尾）</span>
              </div>
              <div v-if="loadingRefImages[gridEditFrame.id]" class="ref-loading">
                <div class="spin-sm"></div> 加载中...
              </div>
              <div v-else-if="shotRefImages[gridEditFrame.id]?.length" class="ref-images-wrap">
                <template v-for="cat in refImageCategorized(gridEditFrame.id)" :key="cat.type">
                  <div class="ref-cat-header" :class="`ref-cat-${cat.type}`">{{ cat.label }}</div>
                  <template v-for="grp in cat.groups" :key="grp.name">
                    <div v-if="cat.type !== '同场'" class="ref-asset-label">{{ grp.name }}</div>
                    <div class="ref-images-grid">
                      <div
                        v-for="img in grp.images"
                        :key="img.rawPath"
                        class="ref-img-item"
                        :class="{ selected: editDraft[gridEditFrame.id]?.selectedRefPaths?.includes(img.rawPath) }"
                        @click="toggleRefImage(gridEditFrame.id, img.rawPath)"
                        @dblclick.stop="previewUrl = img.url"
                      >
                        <img :src="img.url" :alt="img.assetName" />
                        <div v-if="editDraft[gridEditFrame.id]?.selectedRefPaths?.includes(img.rawPath)" class="ref-img-check">✓</div>
                        <button v-if="img.assetId !== -1" class="ref-img-del" @click.stop="deleteRefImage(gridEditFrame.id, img)" title="删除该参考图">×</button>
                      </div>
                    </div>
                  </template>
                </template>
              </div>
              <div v-else class="ref-no-images">先选角色/场景，此处将显示对应图片</div>
            </div>
            <div class="image-gen-section">
              <el-button type="primary" style="width:100%" :loading="generatingIds.has(gridEditFrame.id)" :disabled="batchGenerating" @click="generateShotImage(gridEditFrame)">
                {{ generatingIds.has(gridEditFrame.id) ? '生成中，请稍候...' : (editDraft[gridEditFrame.id]?.imageUrl || gridEditFrame.imageUrl ? '重新生成图片' : '生成分镜图片') }}
              </el-button>
            </div>
            <div class="expanded-img-wrap" v-if="editDraft[gridEditFrame.id]?.imageUrl || gridEditFrame.imageUrl">
              <img :src="editDraft[gridEditFrame.id]?.imageUrl || gridEditFrame.imageUrl" class="expanded-img-preview" @click="previewUrl = editDraft[gridEditFrame.id]?.imageUrl || gridEditFrame.imageUrl" />
              <button class="generated-img-del" @click="deleteGeneratedImage(gridEditFrame)" title="删除生成图">× 删除图片</button>
            </div>
            <div v-else-if="generatingIds.has(gridEditFrame.id)" class="expanded-thumb-spin">
              <div class="spin-lg"></div>
              <span>图片生成中，请稍候...</span>
            </div>
          </div>
        </div>
      </el-dialog>
    </Teleport>

    <!-- Image Lightbox -->
    <Teleport to="body">
      <div v-if="previewUrl" class="lightbox" @click="previewUrl = ''">
        <img :src="previewUrl" class="lightbox-img" @click.stop />
        <button class="lightbox-close" @click="previewUrl = ''">×</button>
      </div>
    </Teleport>

    <!-- Video Lightbox -->
    <Teleport to="body">
      <div v-if="previewVideoUrl" class="lightbox" @click="previewVideoUrl = ''">
        <video
          :src="previewVideoUrl"
          controls
          autoplay
          class="lightbox-video"
          @click.stop
        />
        <button class="lightbox-close" @click="previewVideoUrl = ''">×</button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getOutline } from '@/api/outline'
import { getScript } from '@/api/script'
import {
  getStoryboard,
  getImagePromptTips,
  saveStoryboard,
  planShotsSSE,
  addShot,
  getShotRefImages,
  getShotVideo,
  generateShotVideoApi,
  regenFrameImage,
  deleteStoryboardImage,
  removeAssetRefImage,
} from '@/api/storyboard'
import { delAssets } from '@/api/assets'

const emit = defineEmits<{ stageComplete: [stage: number] }>()
const route = useRoute()
const router = useRouter()
const projectId = computed(() => parseInt(route.params.id as string))

const EMOTIONS = ['紧张', '悬疑', '冲突', '温馨', '轻松', '浪漫', '平静', '震惊', '悲伤', '激昂']
const SHOT_TYPES = ['远景', '全景', '中景', '近景', '特写', '俯拍', '仰拍']
const CAMERA_MOVEMENTS = ['固定', '推镜', '拉镜', '摇镜', '移镜', '跟镜', '升镜', '降镜']

const EMOTION_COLORS: Record<string, string> = {
  '紧张': '#ef4444', '悬疑': '#8b5cf6', '冲突': '#f97316', '温馨': '#ec4899',
  '轻松': '#22c55e', '浪漫': '#fb7185', '平静': '#60a5fa', '震惊': '#eab308',
  '悲伤': '#64748b', '激昂': '#f59e0b',
}

interface Episode {
  episode: number
  scriptId: number
  title: string
  outlineId: number
}

interface ShotRow {
  id: number
  segmentId: number
  shotIndex: number
  name: string
  prompt: string
  duration: number
  videoPrompt: string
  imageUrl: string
  characters: string[]
  scene: string
  props: string[]
  emotion: string
  shotType: string
  cameraMovement: string
  dirty: boolean
  // extras (only in editDraft)
  selectedRefPaths?: string[]
  refSelectionTouched?: boolean
  refDefaultsApplied?: boolean
  resolution?: string
}

interface EpisodeNarrative {
  coreConflict: string
  emotionalCurve: string
  openingHook: string
  endingHook: string
  keyEvents: string[]
}

// State
const episodes = ref<Episode[]>([])
const selectedScriptId = ref<number | null>(null)
const frames = ref<ShotRow[]>([])
const loading = ref(false)
const expandedId = ref<number | null>(null)
const editDraft = ref<Record<number, ShotRow>>({})
const generatingIds = ref<Set<number>>(new Set())
const savingId = ref<number | null>(null)
const previewUrl = ref('')
const previewVideoUrl = ref('')
const narrativeCollapsed = ref(false)
const sidebarTab = ref<'narrative' | 'script'>('narrative')
const scriptContent = ref('')
const viewMode = ref<'list' | 'grid'>('list')

// Emotion bar: shot id ref map for scrolling
const shotRefs = ref<Record<number, HTMLElement | null>>({})

// Video status per shot: 'generating' | 'done' | 'failed'
const videoStatusMap = ref<Record<number, string>>({})
// Video URL per shot (when done)
const videoUrlMap = ref<Record<number, string>>({})
// Reference images per shot
const shotRefImages = ref<Record<number, { url: string; rawPath: string; assetName: string; assetId: number; assetType?: string; defaultSelected?: boolean }[]>>({})
// Grid edit dialog
const gridEditVisible = ref(false)
const gridEditFrame = ref<ShotRow | null>(null)
// Loading state for ref images per shot
const loadingRefImages = ref<Record<number, boolean>>({})
// Polling timer
let pollTimer: ReturnType<typeof setInterval> | null = null
// Poll count per shot (to detect stuck generation)
const pollCountMap = ref<Record<number, number>>({})

// Narrative
const episodeChars = ref<string[]>([])
const episodeScenes = ref<string[]>([])
const episodeProps = ref<string[]>([])
const episodeNarrative = ref<EpisodeNarrative>({
  coreConflict: '',
  emotionalCurve: '',
  openingHook: '',
  endingHook: '',
  keyEvents: [],
})

// Planning
const planning = ref(false)
const planningMessage = ref('')
const planningFrameCount = ref(0)

// Batch generation
const batchGenerating = ref(false)
const batchProgress = ref(0)

// Computed: group frames by segmentId
const segmentGroups = computed(() => {
  const groups: Record<number, ShotRow[]> = {}
  for (const f of frames.value) {
    if (!groups[f.segmentId]) groups[f.segmentId] = []
    groups[f.segmentId].push(f)
  }
  return Object.keys(groups)
    .map(k => Number(k))
    .sort((a, b) => a - b)
    .map(segId => ({
      segmentId: segId,
      shots: groups[segId].sort((a, b) => a.shotIndex - b.shotIndex),
    }))
})

function orderedFrames() {
  return [...frames.value].sort((a, b) =>
    (a.segmentId ?? 0) - (b.segmentId ?? 0)
    || (a.shotIndex ?? 0) - (b.shotIndex ?? 0)
    || a.id - b.id,
  )
}

// Get overall index (1-based) of a frame
function overallIndex(id: number): number {
  const allFrames = segmentGroups.value.flatMap(sg => sg.shots)
  const idx = allFrames.findIndex(f => f.id === id)
  return idx + 1
}

// Open grid edit dialog
function openGridEdit(frame: ShotRow) {
  gridEditFrame.value = frame
  if (!editDraft.value[frame.id]) {
    editDraft.value[frame.id] = {
      ...frame,
      cameraMovement: frame.cameraMovement || '固定',
      selectedRefPaths: [],
      refSelectionTouched: false,
      refDefaultsApplied: false,
      resolution: '9:16',
    }
  }
  expandedId.value = frame.id
  gridEditVisible.value = true
  loadRefImages(frame)
}

// Toggle expand a shot card
function toggleExpand(frame: ShotRow) {
  if (expandedId.value === frame.id) {
    expandedId.value = null
  } else {
    expandedId.value = frame.id
    if (!editDraft.value[frame.id]) {
      editDraft.value[frame.id] = {
        ...frame,
        cameraMovement: frame.cameraMovement || '固定',
        selectedRefPaths: [],
        refSelectionTouched: false,
        refDefaultsApplied: false,
        resolution: '9:16',
      }
    }
    // Auto-load ref images when expanding
    loadRefImages(frame)
  }
}

// Load episodes
async function loadEpisodes() {
  try {
    const scriptsRes = await getScript(projectId.value) as any
    const scripts = scriptsRes.data || []
    const outlinesRes = await getOutline(projectId.value) as any
    const outlines = outlinesRes.data || []
    const outlineMap = new Map(outlines.map((o: any) => [o.id, o]))

    episodes.value = scripts.map((s: any) => {
      const outline = outlineMap.get(s.outlineId) as any
      return {
        episode: outline?.episode || 0,
        scriptId: s.id,
        title: outline?.title || '',
        outlineId: s.outlineId,
      }
    }).sort((a: Episode, b: Episode) => a.episode - b.episode)

    if (episodes.value.length > 0 && !selectedScriptId.value) {
      selectedScriptId.value = episodes.value[0].scriptId
    }
  } catch { /**/ }
}

// Load narrative and episode assets context
async function loadNarrative() {
  if (!selectedScriptId.value) return
  const ep = episodes.value.find(e => e.scriptId === selectedScriptId.value)
  if (!ep) return
  try {
    const res = await getOutline(projectId.value) as any
    const outlines = res.data || []
    const outline = outlines.find((o: any) => o.id === ep.outlineId)
    if (outline?.data) {
      const data = JSON.parse(outline.data)
      episodeNarrative.value = {
        coreConflict: data.coreConflict || '',
        emotionalCurve: data.emotionalCurve || '',
        openingHook: data.openingHook || '',
        endingHook: data.endingHook || '',
        keyEvents: data.keyEvents || [],
      }
      episodeChars.value = (data.characters || []).map((c: any) => c.name || String(c)).filter(Boolean)
      episodeScenes.value = (data.scenes || []).map((s: any) => s.name || String(s)).filter(Boolean)
      episodeProps.value = (data.props || []).map((p: any) => p.name || String(p)).filter(Boolean)
    }
  } catch { /**/ }
}

// Parse intro JSON for a frame
function parseIntro(intro: any): { characters: string[], scene: string, props: string[], emotion: string, shotType: string, cameraMovement: string } {
  try {
    if (typeof intro === 'string' && intro) {
      const parsed = JSON.parse(intro)
      return {
        characters: Array.isArray(parsed.characters) ? parsed.characters : [],
        scene: parsed.scene || '',
        props: Array.isArray(parsed.props) ? parsed.props : [],
        emotion: parsed.emotion || '',
        shotType: parsed.shotType || '全景',
        cameraMovement: parsed.cameraMovement || '固定',
      }
    }
  } catch { /**/ }
  return { characters: [], scene: '', props: [], emotion: '', shotType: '全景', cameraMovement: '固定' }
}

// Load frames
async function loadFrames() {
  if (!selectedScriptId.value) return
  loading.value = true
  expandedId.value = null
  editDraft.value = {}
  videoStatusMap.value = {}
  videoUrlMap.value = {}
  pollCountMap.value = {}
  stopPolling()
  try {
    const res = await getStoryboard({ projectId: projectId.value, scriptId: selectedScriptId.value }) as any
    frames.value = (res.data || []).map((f: any) => {
      const meta = parseIntro(f.intro)
      return {
        id: f.id,
        segmentId: Number(f.segmentId) || 1,
        shotIndex: Number(f.shotIndex) || 1,
        name: f.name || `S${f.segmentId}-${String(f.shotIndex).padStart(2, '0')}`,
        prompt: f.prompt || '',
        duration: Number(f.duration) || 4,
        videoPrompt: f.videoPrompt || '',
        imageUrl: f.filePath || '',
        characters: meta.characters,
        scene: meta.scene,
        props: meta.props,
        emotion: meta.emotion,
        shotType: meta.shotType,
        cameraMovement: meta.cameraMovement,
        dirty: false,
      } as ShotRow
    })
    // Restore video status for all loaded shots
    await restoreVideoStatus(frames.value.map(f => f.id))
  } finally {
    loading.value = false
  }
}

// AI Plan shots via SSE
function handlePlanShotCommand(command: string | number | object) {
  const count = Number(command)
  if (Number.isFinite(count) && count > 0) {
    handlePlanShots(count)
  }
}

async function handlePlanShots(targetCount: number) {
  if (!selectedScriptId.value) return
  const confirm = frames.value.length > 0
    ? await ElMessageBox.confirm(
        `将清除当前 ${frames.value.length} 个分镜并重新规划，确认继续？`,
        '重新规划',
        { type: 'warning', confirmButtonText: '确认规划', cancelButtonText: '取消' }
      ).then(() => true).catch(() => false)
    : true
  if (!confirm) return

  planning.value = true
  planningMessage.value = '正在获取图片模型专属提示词技巧...'
  planningFrameCount.value = 0
  frames.value = []
  expandedId.value = null
  editDraft.value = {}

  try {
    const tipsRes = await getImagePromptTips() as any
    const imageModelPromptTips = tipsRes.data?.tips || tipsRes.data?.data?.tips || ''
    const imageModelName = tipsRes.data?.model || tipsRes.data?.data?.model || ''
    planningMessage.value = imageModelName
      ? `已获取 ${imageModelName} 的图片提示词技巧，正在连接AI...`
      : '已获取图片提示词技巧，正在连接AI...'

    const resp = await planShotsSSE({
      projectId: projectId.value,
      scriptId: selectedScriptId.value!,
      targetCount,
      clearExisting: true,
      imageModelPromptTips,
    })

    if (!resp.ok || !resp.body) {
      throw new Error('璇锋眰澶辫触')
    }

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      let currentEvent = ''
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim()
        } else if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()
          if (!data) continue
          try {
            const parsed = JSON.parse(data)
            handlePlanEvent(currentEvent, parsed)
          } catch { /**/ }
          currentEvent = ''
        }
      }
    }

    planning.value = false
    if (frames.value.length > 0) {
      ElMessage.success(`分镜规划完成，共 ${frames.value.length} 个镜头`)
    }
  } catch (err: any) {
    planning.value = false
    ElMessage.error(err?.message || '规划失败，请重试')
  }
}

function handlePlanEvent(event: string, data: any) {
  switch (event) {
    case 'progress':
      planningMessage.value = data.message || ''
      break
    case 'shot': {
      const meta = {
        characters: data.characters || [],
        scene: data.scene || '',
        props: data.props || [],
        emotion: data.emotion || '',
        shotType: data.shotType || '全景',
        cameraMovement: data.cameraMovement || '固定',
      }
      frames.value.push({
        id: data.id,
        segmentId: data.segmentId || 1,
        shotIndex: data.shotIndex || 1,
        name: data.name || '',
        prompt: data.prompt || '',
        duration: data.duration || 4,
        videoPrompt: '',
        imageUrl: '',
        ...meta,
        dirty: false,
      })
      planningFrameCount.value = frames.value.length
      break
    }
    case 'complete':
      planningMessage.value = `规划完成，共 ${data.total} 个分镜`
      break
    case 'error':
      planning.value = false
      ElMessage.error(data.message || '规划失败')
      break
  }
}

// Generate image for single frame
async function generateSingleFrame(frame: ShotRow) {
  const newSet = new Set(generatingIds.value)
  newSet.add(frame.id)
  generatingIds.value = newSet

  try {
    const frameIndex = frames.value.findIndex(f => f.id === frame.id)
    if (frame.imageUrl && frameIndex !== -1) {
      frames.value[frameIndex] = { ...frames.value[frameIndex], imageUrl: '' }
      frame.imageUrl = ''
    }
    if (editDraft.value[frame.id]?.imageUrl) {
      editDraft.value[frame.id].imageUrl = ''
    }

    const selectedRefPaths = getValidSelectedRefPaths(frame.id)
    const res = await regenFrameImage({
      id: frame.id,
      selectedRefPaths: selectedRefPaths?.length ? selectedRefPaths : undefined,
    }) as any
    const url = res.data?.url || ''
    const idx = frames.value.findIndex(f => f.id === frame.id)
    if (idx !== -1) {
      frames.value[idx] = { ...frames.value[idx], imageUrl: url }
    }
    if (editDraft.value[frame.id]) {
      editDraft.value[frame.id].imageUrl = url
    }
    return url
  } catch (err: any) {
    const message = err?.code === 'ECONNABORTED'
      ? '图片生成超时，请稍后重试或减少参考图后重新生成当前分镜'
      : (err?.response?.data?.message || err?.message || '图片生成失败')
    ElMessage.error(message)
    return ''
  } finally {
    const next = new Set(generatingIds.value)
    next.delete(frame.id)
    generatingIds.value = next
  }
}

// Generate image from expanded form button
async function generateShotImage(frame: ShotRow) {
  const url = await generateSingleFrame(frame)
  if (url) ElMessage.success('图片生成成功')
}

// Batch generate all frames without images
async function handleBatchGenerate() {
  const toGenerate = orderedFrames()
    .filter(f => !f.imageUrl)
  if (toGenerate.length === 0) {
    ElMessage.info('所有分镜已有图片')
    return
  }
  batchGenerating.value = true
  batchProgress.value = 0

  for (const frame of toGenerate) {
    const url = await generateSingleFrame(frame)
    if (!url) {
      batchGenerating.value = false
      ElMessage.warning(`批量生成已暂停在 S${frame.segmentId}-${String(frame.shotIndex).padStart(2, '0')}，请修复该分镜后继续`)
      return
    }
    batchProgress.value++
  }

  batchGenerating.value = false
  ElMessage.success('批量生成完成')
}

// Save frame draft
async function saveFrameDraft(id: number) {
  const draft = editDraft.value[id]
  if (!draft) return
  savingId.value = id
  try {
    const meta = JSON.stringify({
      characters: draft.characters,
      scene: draft.scene,
      props: draft.props,
      emotion: draft.emotion,
      shotType: draft.shotType,
      cameraMovement: draft.cameraMovement,
    })
    await saveStoryboard({
      id,
      prompt: draft.prompt,
      duration: draft.duration,
      videoPrompt: draft.videoPrompt,
      name: draft.name,
      meta,
    })
    // Update main frames array
    const idx = frames.value.findIndex(f => f.id === id)
    if (idx !== -1) {
      frames.value[idx] = { ...frames.value[idx], ...draft, dirty: false }
    }
    ElMessage.success('已保存')
  } catch {
    ElMessage.error('保存失败')
  } finally {
    savingId.value = null
  }
}

// Move frame up
async function moveFrameUp(frame: ShotRow) {
  const allFrames = segmentGroups.value.flatMap(sg => sg.shots)
  const idx = allFrames.findIndex(f => f.id === frame.id)
  if (idx <= 0) return
  const prev = allFrames[idx - 1]
  await swapFrames(prev, frame)
}

// Move frame down
async function moveFrameDown(frame: ShotRow) {
  const allFrames = segmentGroups.value.flatMap(sg => sg.shots)
  const idx = allFrames.findIndex(f => f.id === frame.id)
  if (idx < 0 || idx >= allFrames.length - 1) return
  const next = allFrames[idx + 1]
  await swapFrames(frame, next)
}

// Swap two adjacent frames' positions in local state and save
async function swapFrames(a: ShotRow, b: ShotRow) {
  const idxA = frames.value.findIndex(f => f.id === a.id)
  const idxB = frames.value.findIndex(f => f.id === b.id)
  if (idxA === -1 || idxB === -1) return

  // Swap segmentId and shotIndex
  const tmpSegId = a.segmentId
  const tmpIdx = a.shotIndex
  frames.value[idxA] = { ...frames.value[idxA], segmentId: b.segmentId, shotIndex: b.shotIndex }
  frames.value[idxB] = { ...frames.value[idxB], segmentId: tmpSegId, shotIndex: tmpIdx }

  // Also update editDraft if open
  if (editDraft.value[a.id]) {
    editDraft.value[a.id] = { ...editDraft.value[a.id], segmentId: b.segmentId, shotIndex: b.shotIndex }
  }
  if (editDraft.value[b.id]) {
    editDraft.value[b.id] = { ...editDraft.value[b.id], segmentId: tmpSegId, shotIndex: tmpIdx }
  }

  // Save both
  try {
    await Promise.all([
      saveStoryboard({ id: a.id, meta: JSON.stringify({ characters: frames.value[idxA].characters, scene: frames.value[idxA].scene, props: frames.value[idxA].props, emotion: frames.value[idxA].emotion, shotType: frames.value[idxA].shotType }) }),
      saveStoryboard({ id: b.id, meta: JSON.stringify({ characters: frames.value[idxB].characters, scene: frames.value[idxB].scene, props: frames.value[idxB].props, emotion: frames.value[idxB].emotion, shotType: frames.value[idxB].shotType }) }),
    ])
  } catch { /**/ }
}

// Delete frame
async function deleteFrame(frame: ShotRow) {
  await ElMessageBox.confirm('确认删除该镜头？', '删除确认', { type: 'warning' })
  await delAssets(frame.id)
  frames.value = frames.value.filter(f => f.id !== frame.id)
  if (expandedId.value === frame.id) {
    expandedId.value = null
  }
  delete editDraft.value[frame.id]
  ElMessage.success('已删除')
}

// Load ref images for a shot (characters/scene/props assets + same-segment storyboard images)
async function loadRefImages(frame: ShotRow) {
  const draft = editDraft.value[frame.id] || frame
  const assetNames = [
    ...(draft.characters || []),
    ...(draft.scene ? [draft.scene] : []),
    ...(draft.props || []),
  ]
  loadingRefImages.value[frame.id] = true
  try {
    const res = await getShotRefImages({
      projectId: projectId.value,
      assetNames,
      scriptId: selectedScriptId.value ?? undefined,
      segmentId: frame.segmentId ?? undefined,
      currentShotId: frame.id,
    }) as any
    const list = res.data || []
    const imgs: { url: string; rawPath: string; assetName: string; assetId: number; assetType: string; defaultSelected?: boolean }[] = []
    for (const asset of list) {
      for (const img of (asset.images || [])) {
        imgs.push({
          url: img.url,
          rawPath: img.rawPath,
          assetName: asset.name,
          assetId: asset.id,
          assetType: asset.type,
          defaultSelected: !!img.defaultSelected,
        })
      }
    }
    shotRefImages.value[frame.id] = imgs
    if (editDraft.value[frame.id]) {
      const validPaths = new Set(imgs.map(img => img.rawPath))
      const currentSelected = editDraft.value[frame.id].selectedRefPaths || []
      const validSelected = currentSelected.filter(path => validPaths.has(path))
      editDraft.value[frame.id].selectedRefPaths = validSelected

      if (!editDraft.value[frame.id].refDefaultsApplied && !editDraft.value[frame.id].refSelectionTouched && validSelected.length === 0) {
        const defaultPaths = imgs
          .filter(img => img.defaultSelected)
          .map(img => img.rawPath)

        if (defaultPaths.length > 0) {
          editDraft.value[frame.id].selectedRefPaths = [...new Set(defaultPaths)]
        }
        editDraft.value[frame.id].refDefaultsApplied = true
      }
    }
  } catch {
    shotRefImages.value[frame.id] = []
  } finally {
    loadingRefImages.value[frame.id] = false
  }
}

function getValidSelectedRefPaths(frameId: number) {
  const selected = editDraft.value[frameId]?.selectedRefPaths || []
  if (selected.length === 0) return []
  const validPaths = new Set((shotRefImages.value[frameId] || []).map(img => img.rawPath))
  const validSelected = selected.filter(path => validPaths.has(path))
  if (editDraft.value[frameId] && validSelected.length !== selected.length) {
    editDraft.value[frameId].selectedRefPaths = validSelected
  }
  return validSelected
}

// Organize ref images into type categories, each containing named asset sub-groups
const CATEGORY_ORDER = ['角色', '场景', '道具', '上一场结尾', '上一场', '同场'] as const
const CATEGORY_LABELS: Record<string, string> = {
  '角色': '角色',
  '场景': '场景',
  '道具': '道具',
  '上一场结尾': '上一场结尾参考',
  '上一场': '上一场整场参考',
  '同场': '同场分镜参考',
}

function refImageCategorized(frameId: number) {
  const imgs = shotRefImages.value[frameId] || []
  // Build: type 鈫?name 鈫?images[]
  const byType = new Map<string, Map<string, typeof imgs>>()
  for (const img of imgs) {
    const t = img.assetType || '其他'
    if (!byType.has(t)) byType.set(t, new Map())
    const byName = byType.get(t)!
    if (!byName.has(img.assetName)) byName.set(img.assetName, [])
    byName.get(img.assetName)!.push(img)
  }
  // Return in fixed order, skip empty categories
  const result: { type: string; label: string; groups: { name: string; images: typeof imgs }[] }[] = []
  for (const type of CATEGORY_ORDER) {
    if (!byType.has(type)) continue
    const groups = Array.from(byType.get(type)!.entries()).map(([name, images]) => ({ name, images }))
    result.push({ type, label: CATEGORY_LABELS[type] || type, groups })
  }
  // Any unexpected types go last
  for (const [type, nameMap] of byType.entries()) {
    if (CATEGORY_ORDER.includes(type as any)) continue
    const groups = Array.from(nameMap.entries()).map(([name, images]) => ({ name, images }))
    result.push({ type, label: type, groups })
  }
  return result
}

// Toggle selection of a ref image for a shot
function toggleRefImage(frameId: number, rawPath: string) {
  const draft = editDraft.value[frameId]
  if (!draft) return
  if (!draft.selectedRefPaths) draft.selectedRefPaths = []
  draft.refSelectionTouched = true
  draft.refDefaultsApplied = true
  const idx = draft.selectedRefPaths.indexOf(rawPath)
  if (idx === -1) {
    draft.selectedRefPaths.push(rawPath)
  } else {
    draft.selectedRefPaths.splice(idx, 1)
  }
}

// Delete a reference image from the asset
async function deleteRefImage(frameId: number, img: { assetId: number; rawPath: string; url: string }) {
  await ElMessageBox.confirm('确认删除该参考图？此操作不可恢复。', '删除确认', { type: 'warning' })
  try {
    await removeAssetRefImage({ assetId: img.assetId, rawPath: img.rawPath })
    // Remove from local list
    if (shotRefImages.value[frameId]) {
      shotRefImages.value[frameId] = shotRefImages.value[frameId].filter(i => i.rawPath !== img.rawPath)
    }
    // Deselect if selected
    const draft = editDraft.value[frameId]
    if (draft?.selectedRefPaths) {
      draft.selectedRefPaths = draft.selectedRefPaths.filter(p => p !== img.rawPath)
      draft.refSelectionTouched = true
      draft.refDefaultsApplied = true
    }
    ElMessage.success('已删除')
  } catch { ElMessage.error('删除失败') }
}

// Delete the generated storyboard image
async function deleteGeneratedImage(frame: ShotRow) {
  await ElMessageBox.confirm('确认删除该分镜图片？', '删除确认', { type: 'warning' })
  try {
    await deleteStoryboardImage({ id: frame.id })
    const idx = frames.value.findIndex(f => f.id === frame.id)
    if (idx !== -1) frames.value[idx] = { ...frames.value[idx], imageUrl: '' }
    if (editDraft.value[frame.id]) editDraft.value[frame.id].imageUrl = ''
    ElMessage.success('已删除')
  } catch { ElMessage.error('删除失败') }
}

// Generate video for a single shot
async function generateShotVideo(frame: ShotRow) {
  const draft = editDraft.value[frame.id]
  if (!draft?.selectedRefPaths?.length) {
    ElMessage.warning('请先选择至少一张参考图')
    return
  }
  if (!selectedScriptId.value) return

  const videoType = (window as any).__videoType || undefined

  videoStatusMap.value[frame.id] = 'generating'
  pollCountMap.value[frame.id] = 0
  try {
    await generateShotVideoApi({
      projectId: projectId.value,
      scriptId: selectedScriptId.value,
      shotId: frame.id,
      resolution: draft.resolution || '9:16',
      filePath: draft.selectedRefPaths,
      duration: draft.duration || 4,
      prompt: draft.videoPrompt || draft.prompt || '',
      type: videoType,
    })
    ElMessage.success('视频生成已提交，请稍候...')
    startPolling()
  } catch (err: any) {
    videoStatusMap.value[frame.id] = 'failed'
    ElMessage.error(err?.response?.data?.message || '提交失败，请重试')
  }
}

// Poll video status for all shots that are generating
function startPolling() {
  if (pollTimer) return
  pollTimer = setInterval(pollVideoStatus, 5000)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

// Max polls before declaring timeout (~5 min at 5s interval)
const MAX_POLLS = 60

async function pollVideoStatus() {
  const generatingShotIds = frames.value
    .filter(f => videoStatusMap.value[f.id] === 'generating')
    .map(f => f.id)
  if (!generatingShotIds.length) {
    stopPolling()
    return
  }
  try {
    const res = await getShotVideo({ shotIds: generatingShotIds }) as any
    const list: { shotId: number; state: number; url: string }[] = res.data || []
    const respondedIds = new Set(list.map(i => i.shotId))

    for (const item of list) {
      if (item.state === 1) {
        videoStatusMap.value[item.shotId] = 'done'
        videoUrlMap.value[item.shotId] = item.url
        delete pollCountMap.value[item.shotId]
      } else if (item.state === -1) {
        videoStatusMap.value[item.shotId] = 'failed'
        ElMessage.error(`镜头 ${item.shotId} 视频生成失败`)
        delete pollCountMap.value[item.shotId]
      } else {
        // state === 0, still generating
        pollCountMap.value[item.shotId] = (pollCountMap.value[item.shotId] || 0) + 1
        if (pollCountMap.value[item.shotId] > MAX_POLLS) {
          videoStatusMap.value[item.shotId] = 'failed'
          ElMessage.warning('镜头视频生成超时，请重试')
          delete pollCountMap.value[item.shotId]
        }
      }
    }

    // Shots not found in DB (shotId column missing or no record): count toward timeout
    for (const shotId of generatingShotIds) {
      if (!respondedIds.has(shotId)) {
        pollCountMap.value[shotId] = (pollCountMap.value[shotId] || 0) + 1
        if (pollCountMap.value[shotId] > MAX_POLLS) {
          videoStatusMap.value[shotId] = 'failed'
          ElMessage.warning('镜头视频生成超时（未找到记录），请重启服务后重试')
          delete pollCountMap.value[shotId]
        }
      }
    }
  } catch { /**/ }
}

// Restore video status when loading frames
async function restoreVideoStatus(frameIds: number[]) {
  if (!frameIds.length) return
  try {
    const res = await getShotVideo({ shotIds: frameIds }) as any
    const list: { shotId: number; state: number; url: string }[] = res.data || []
    for (const item of list) {
      if (item.state === 1) {
        videoStatusMap.value[item.shotId] = 'done'
        videoUrlMap.value[item.shotId] = item.url
      } else if (item.state === -1) {
        videoStatusMap.value[item.shotId] = 'failed'
      } else if (item.state === 0) {
        videoStatusMap.value[item.shotId] = 'generating'
      }
    }
    // Resume polling if any still generating
    const anyGenerating = list.some(i => i.state === 0)
    if (anyGenerating) startPolling()
  } catch { /**/ }
}

// Add shot
async function handleAddShot() {
  if (!selectedScriptId.value) return
  const lastSegId = segmentGroups.value.length > 0
    ? segmentGroups.value[segmentGroups.value.length - 1].segmentId
    : 1
  const lastSeg = segmentGroups.value.find(sg => sg.segmentId === lastSegId)
  const lastIdx = lastSeg ? lastSeg.shots.length + 1 : 1

  try {
    const res = await addShot({
      projectId: projectId.value,
      scriptId: selectedScriptId.value,
      segmentId: lastSegId,
      shotIndex: lastIdx,
      name: `S${lastSegId}-${String(lastIdx).padStart(2, '0')}`,
    }) as any
    const newId = res.data?.id
    if (newId) {
      const newFrame: ShotRow = {
        id: newId,
        segmentId: lastSegId,
        shotIndex: lastIdx,
        name: `S${lastSegId}-${String(lastIdx).padStart(2, '0')}`,
        prompt: '',
        duration: 4,
        videoPrompt: '',
        imageUrl: '',
        characters: [],
        scene: '',
        props: [],
        emotion: '',
        shotType: '全景',
        cameraMovement: '固定',
        dirty: false,
        selectedRefPaths: [],
        refSelectionTouched: false,
        refDefaultsApplied: false,
      }
      frames.value.push(newFrame)
      expandedId.value = newId
      editDraft.value[newId] = { ...newFrame }
    }
  } catch {
    ElMessage.error('娣诲姞澶辫触')
  }
}

// Handle broken image: clear from local state and silently clean DB
function onImgError(event: Event, frame: ShotRow) {
  const img = event.target as HTMLImageElement
  img.style.display = 'none'
  // Clear from frames so the "待生成" placeholder shows.
  const idx = frames.value.findIndex(f => f.id === frame.id)
  if (idx !== -1) frames.value[idx] = { ...frames.value[idx], imageUrl: '' }
  if (editDraft.value[frame.id]) editDraft.value[frame.id].imageUrl = ''
  // Silently delete the stale record from backend
  deleteStoryboardImage({ id: frame.id }).catch(() => {})
}

function completeStage() {
  emit('stageComplete', 5)
  router.push(`/project/${projectId.value}/creation/stage6`)
}

// Load script plain text for current episode
async function loadScriptContent() {
  if (!selectedScriptId.value) return
  try {
    const res = await getScript(projectId.value) as any
    const scripts = res.data || []
    const current = scripts.find((s: any) => s.id === selectedScriptId.value)
    scriptContent.value = current?.content || ''
  } catch { scriptContent.value = '' }
}

// Scroll to a shot card by id
function scrollToShot(id: number) {
  const el = document.getElementById(`shot-${id}`)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function onEpisodeChange() {
  expandedId.value = null
  editDraft.value = {}
  loadFrames()
  loadNarrative()
  loadScriptContent()
}

onMounted(async () => {
  await loadEpisodes()
  await Promise.all([loadFrames(), loadNarrative(), loadScriptContent()])
})

onUnmounted(() => {
  stopPolling()
})

watch(selectedScriptId, () => {
  loadNarrative()
})

// Track prev asset names to reload ref images only when they change
const prevAssetKey = ref<Record<number, string>>({})

watch(editDraft, (newDraft) => {
  // Watch both list-expanded and grid-dialog
  const ids = new Set<number>()
  if (expandedId.value) ids.add(expandedId.value)
  if (gridEditFrame.value?.id) ids.add(gridEditFrame.value.id)
  for (const id of ids) {
    const frame = frames.value.find(f => f.id === id)
    if (!frame) continue
    const draft = newDraft[id]
    if (!draft) continue
    const key = [...(draft.characters || []), draft.scene || '', ...(draft.props || [])].join('|')
    if (prevAssetKey.value[id] !== key) {
      prevAssetKey.value[id] = key
      loadRefImages({ ...frame, ...draft })
    }
  }
}, { deep: true })
</script>

<style scoped>
.stage-page {
  height: calc(100vh - 64px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #f7f8fa;
}

/* Toolbar */
.stage-toolbar {
  background: white;
  padding: 12px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e8e8e8;
  flex-shrink: 0;
  gap: 12px;
}

.stage-title {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0;
  flex-shrink: 0;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.frame-stat {
  font-size: 12px;
  padding: 3px 10px;
  background: #f0f4ff;
  border-radius: 20px;
  color: #6366f1;
  font-weight: 500;
}

/* Episode Tabs */
.episode-tabs {
  background: white;
  padding: 0 20px;
  border-bottom: 1px solid #e8e8e8;
  flex-shrink: 0;
}

/* Content area */
.content-area {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* Left narrative sidebar */
.narrative-sidebar {
  width: 220px;
  min-width: 220px;
  background: white;
  border-right: 1px solid #e8e8e8;
  display: flex;
  flex-direction: column;
  transition: width 0.22s ease, min-width 0.22s ease;
  overflow: hidden;
  flex-shrink: 0;
}

.narrative-sidebar.collapsed {
  width: 32px;
  min-width: 32px;
}

.sidebar-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 8px;
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid #f0f0f0;
  flex-shrink: 0;
  white-space: nowrap;
}
.sidebar-toggle:hover { background: #f7f8fa; }

.sidebar-toggle-icon { font-size: 10px; color: #aaa; flex-shrink: 0; }

.sidebar-title-horiz { font-size: 12px; font-weight: 600; color: #555; }

.sidebar-title-vert {
  font-size: 11px;
  font-weight: 600;
  color: #888;
  writing-mode: vertical-rl;
  letter-spacing: 2px;
  margin-top: 4px;
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sidebar-empty { font-size: 12px; color: #bbb; text-align: center; padding: 20px 0; }

.narrative-card {
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 12px;
  border: 1px solid #eee;
  background: #fafafa;
}

.nc-header { display: flex; align-items: center; gap: 5px; margin-bottom: 4px; }
.nc-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.conflict-dot { background: #ef4444; }
.emotion-dot { background: #f59e0b; }
.hook-dot { background: #6366f1; }
.events-dot { background: #22c55e; }
.nc-label { font-size: 11px; font-weight: 600; color: #888; }
.nc-text { color: #444; line-height: 1.5; font-size: 12px; }
.nc-events { display: flex; flex-direction: column; gap: 3px; }
.nc-event-item { color: #555; font-size: 11px; line-height: 1.4; }
.nc-arrow { color: #aaa; margin: 0 3px; }

/* Sidebar tabs */
.sidebar-tabs {
  display: flex;
  border-bottom: 1px solid #f0f0f0;
  flex-shrink: 0;
}
.sidebar-tab {
  flex: 1;
  text-align: center;
  padding: 6px 0;
  font-size: 12px;
  color: #999;
  cursor: pointer;
  user-select: none;
  transition: all 0.15s;
}
.sidebar-tab:hover { color: #6366f1; }
.sidebar-tab.active { color: #6366f1; font-weight: 600; border-bottom: 2px solid #6366f1; }

/* Script plain text */
.script-text {
  font-size: 12px;
  color: #444;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
  font-family: inherit;
}

/* Emotion rhythm bar */
.emotion-bar {
  display: flex;
  height: 6px;
  border-radius: 3px;
  overflow: hidden;
  margin: 0 0 12px 0;
  cursor: pointer;
  gap: 1px;
}
.emotion-block {
  height: 100%;
  min-width: 4px;
  border-radius: 1px;
  transition: opacity 0.15s;
  opacity: 0.85;
}
.emotion-block:hover { opacity: 1; transform: scaleY(1.5); }

/* Grid view */
.shot-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  padding-bottom: 20px;
}
.grid-seg-header {
  grid-column: 1 / -1;
  font-size: 13px;
  font-weight: 700;
  color: #6366f1;
  padding: 8px 4px 4px;
  border-bottom: 2px solid #e0e7ff;
  margin-top: 4px;
}
.grid-card {
  background: white;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  overflow: hidden;
  transition: box-shadow 0.15s;
}
.grid-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
.grid-img-wrap {
  position: relative;
  aspect-ratio: 9/16;
  background: #f0f0f0;
  cursor: zoom-in;
  overflow: hidden;
}
.grid-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.grid-generating, .grid-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #bbb;
}
.grid-index {
  position: absolute;
  top: 4px;
  left: 4px;
  background: rgba(0,0,0,0.5);
  color: white;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
}
.grid-shot-label {
  position: absolute;
  bottom: 4px;
  right: 4px;
  background: rgba(99,102,241,0.75);
  color: white;
  font-size: 9px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 3px;
}
.grid-meta {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 4px 6px 0;
  flex-wrap: wrap;
}
.grid-emotion {
  font-size: 10px;
  color: white;
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: 500;
}
.grid-shot-type, .grid-movement {
  font-size: 10px;
  color: #888;
  background: #f0f0f0;
  padding: 1px 5px;
  border-radius: 3px;
}
.grid-prompt {
  font-size: 11px;
  color: #555;
  padding: 4px 6px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 32px;
}
.grid-actions {
  padding: 4px 6px 8px;
  display: flex;
  gap: 4px;
}

/* Shot list container */
.shot-list-container {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px;
}

.empty-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 400px;
}

.shot-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* Segment header */
.segment-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 0 6px;
}

.segment-label {
  font-size: 11px;
  font-weight: 700;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.segment-count {
  font-size: 11px;
  color: #bbb;
}

/* Shot card */
.shot-card {
  background: white;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  margin-bottom: 6px;
  overflow: hidden;
  transition: border-color 0.15s;
}

.shot-card:hover {
  border-color: #c7d2fe;
}

.shot-card.expanded {
  border-color: #6366f1;
  box-shadow: 0 2px 10px rgba(99, 102, 241, 0.1);
}

/* Shot collapsed row */
.shot-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  min-height: 52px;
}

.shot-index-badge {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: #777;
  flex-shrink: 0;
}

.shot-tags {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.tag {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
  white-space: nowrap;
}

.tag-segment {
  background: #ede9fe;
  color: #7c3aed;
}

.tag-emotion {
  background: #fef3c7;
  color: #92400e;
}

.tag-shot-type {
  background: #dbeafe;
  color: #1e40af;
}

.shot-prompt-preview {
  flex: 1;
  font-size: 12px;
  color: #555;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.shot-duration {
  font-size: 11px;
  color: #aaa;
  background: #f5f5f5;
  padding: 2px 6px;
  border-radius: 10px;
  flex-shrink: 0;
}

.shot-thumb {
  width: 80px;
  height: 45px;
  border-radius: 4px;
  overflow: hidden;
  background: #f0f0f0;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.shot-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  cursor: zoom-in;
}

.thumb-spin,
.thumb-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 10px;
  color: #bbb;
}

.shot-gen-btn {
  flex-shrink: 0;
}

.shot-expand-btn {
  font-size: 11px;
  color: #6366f1;
  cursor: pointer;
  flex-shrink: 0;
  white-space: nowrap;
  padding: 4px 6px;
  border-radius: 4px;
  transition: background 0.15s;
}

.shot-expand-btn:hover {
  background: #f0f0ff;
}

/* Expanded form */
.shot-form {
  display: flex;
  gap: 20px;
  padding: 16px;
  background: #f8f9ff;
  border-top: 1px solid #e8e8e8;
}

.form-left {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.form-right {
  flex-shrink: 0;
  width: 220px;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.form-row.align-start {
  align-items: flex-start;
}

.form-label {
  font-size: 12px;
  font-weight: 600;
  color: #666;
  width: 56px;
  flex-shrink: 0;
}

.form-field {
  flex: 1;
  min-width: 0;
}

/* Pill button group */
.pill-group {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.pill {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 20px;
  border: 1px solid #d1d5db;
  background: white;
  color: #555;
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
}

.pill:hover {
  border-color: #6366f1;
  color: #6366f1;
}

.pill.active {
  background: #6366f1;
  border-color: #6366f1;
  color: white;
}

/* Form actions */
.form-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  padding-top: 6px;
}

/* Expanded image preview */
.expanded-thumb {
  width: 220px;
  height: 124px;
  border-radius: 6px;
  background: #eee;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.expanded-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  cursor: zoom-in;
}

.expanded-thumb-spin,
.expanded-thumb-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 12px;
  color: #aaa;
  width: 100%;
  height: 100%;
}

/* Add shot row */
.add-shot-row {
  padding: 8px 0 16px;
  display: flex;
  justify-content: center;
}

/* Planning overlay */
.planning-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.planning-card {
  background: white;
  border-radius: 12px;
  padding: 40px 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  min-width: 300px;
}

.planning-title {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
}

.planning-message {
  font-size: 13px;
  color: #666;
}

.planning-progress {
  font-size: 13px;
  color: #6366f1;
  font-weight: 500;
}

/* Lightbox */
.lightbox {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.lightbox-img {
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  border-radius: 4px;
}

.lightbox-close {
  position: absolute;
  top: 20px;
  right: 24px;
  background: none;
  border: none;
  font-size: 24px;
  color: white;
  cursor: pointer;
  opacity: 0.8;
}

.lightbox-close:hover {
  opacity: 1;
}

/* Spinners */
.spin-sm {
  width: 14px;
  height: 14px;
  border: 2px solid #ddd;
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}

.spin-lg {
  width: 32px;
  height: 32px;
  border: 3px solid #ddd;
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Expand transition */
.expand-enter-active,
.expand-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
}

.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  max-height: 800px;
}

/* Image thumbnail in collapsed row */
.thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  cursor: zoom-in;
}

/* Right panel sections */
.ref-images-section {
  margin-bottom: 12px;
}

.ref-images-title {
  font-size: 12px;
  font-weight: 600;
  color: #444;
  margin-bottom: 8px;
}

.ref-images-hint {
  font-size: 11px;
  font-weight: 400;
  color: #999;
}

.ref-loading {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #999;
  padding: 8px 0;
}

.ref-images-wrap {
  max-height: 300px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ref-cat-header {
  font-size: 11px;
  font-weight: 700;
  padding: 5px 4px 3px;
  border-bottom: 2px solid #e8e8e8;
  color: #555;
  margin-top: 4px;
  letter-spacing: 0.5px;
}
.ref-cat-header:first-child { margin-top: 0; }
.ref-cat-角色 { color: #6366f1; border-bottom-color: #e0e7ff; }
.ref-cat-场景 { color: #16a34a; border-bottom-color: #dcfce7; }
.ref-cat-道具 { color: #d97706; border-bottom-color: #fef3c7; }
.ref-cat-上一场结尾 { color: #7c3aed; border-bottom-color: #ede9fe; }
.ref-cat-上一场 { color: #9333ea; border-bottom-color: #f3e8ff; }
.ref-cat-同场 { color: #0891b2; border-bottom-color: #cffafe; }
.ref-asset-label {
  font-size: 10px;
  color: #999;
  padding: 2px 2px 1px;
  font-weight: 500;
}
.ref-images-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px;
  margin-bottom: 2px;
}

.ref-img-item {
  position: relative;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  border: 2px solid transparent;
  transition: border-color 0.15s;
  aspect-ratio: 1;
  background: #f0f0f0;
}

.ref-img-item:hover {
  border-color: #6366f1;
}

.ref-img-item.selected {
  border-color: #6366f1;
}

.ref-img-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.ref-img-label {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0,0,0,0.55);
  color: white;
  font-size: 10px;
  padding: 2px 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ref-img-check {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #6366f1;
  color: white;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
}

/* Delete button on ref image (shows on hover) */
.ref-img-del {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(220, 38, 38, 0.85);
  color: white;
  font-size: 13px;
  font-weight: 700;
  border: none;
  cursor: pointer;
  display: none;
  align-items: center;
  justify-content: center;
  line-height: 1;
  padding: 0;
}
.ref-img-item:hover .ref-img-del { display: flex; }
.ref-img-del:hover { background: #dc2626; }

/* Delete button on generated image */
.expanded-img-wrap {
  position: relative;
}
.generated-img-del {
  position: absolute;
  bottom: 6px;
  right: 6px;
  background: rgba(220, 38, 38, 0.85);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 11px;
  padding: 3px 8px;
  cursor: pointer;
  display: none;
}
.expanded-img-wrap:hover .generated-img-del { display: block; }
.generated-img-del:hover { background: #dc2626; }

.ref-no-images {
  font-size: 11px;
  color: #bbb;
  padding: 6px 0;
}

.image-gen-section {
  border-top: 1px solid #eee;
  padding-top: 10px;
  margin-bottom: 10px;
}

.expanded-img-wrap {
  margin-top: 8px;
  border-radius: 6px;
  overflow: hidden;
  background: #f0f0f0;
}

.expanded-img-preview {
  width: 100%;
  display: block;
  cursor: zoom-in;
  border-radius: 6px;
}

.expanded-thumb-spin {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 20px 0;
  font-size: 12px;
  color: #999;
}

/* Video lightbox (kept for stage6 preview) */
.lightbox-video {
  max-width: 90vw;
  max-height: 90vh;
  border-radius: 4px;
  background: #000;
}

/* Grid edit dialog: ensure shot-form layout works inside dialog */
:deep(.grid-edit-dialog .el-dialog__body) {
  padding: 16px 20px;
  max-height: calc(90vh - 120px);
  overflow-y: auto;
}
</style>

