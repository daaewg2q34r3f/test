export interface PanelSection {
  label: string
  fullPrompt: string
}

// Panel section: starts with 【第N格...】
const PANEL_REGEX = /^【第\s*\d+\s*格/

// Shared sections to append to every panel prompt
const SHARED_KEYWORDS = ['基础设定', '技术参数', '补充说明', '角色设定']

type ShotType = 'head_closeup' | 'front_full' | 'side_full' | 'back_full' | 'default'

function detectShotType(label: string): ShotType {
  if (/头部|头像|特写|面部|脸部/.test(label)) return 'head_closeup'
  if (/正面|前视|front/.test(label)) return 'front_full'
  if (/侧面|侧视|side/.test(label)) return 'side_full'
  if (/背面|后视|back/.test(label)) return 'back_full'
  return 'default'
}

const SHOT_DIRECTIVES: Record<ShotType, string> = {
  head_closeup:
    '【构图强制要求】本图为头部特写（bust/portrait），画面仅包含人物头部至肩部，面部清晰可见，严禁出现全身、半身以下或多视角拼接布局。',
  front_full:
    '【构图强制要求】本图为正面全身视图，展示人物从头到脚的完整正面造型，单一视角，严禁多视图拼接。',
  side_full:
    '【构图强制要求】本图为侧面全身视图，展示人物从头到脚的完整侧面造型，单一视角，严禁多视图拼接。',
  back_full:
    '【构图强制要求】本图为背面全身视图，展示人物从头到脚的完整背面造型，单一视角，严禁多视图拼接。',
  default:
    '【构图强制要求】本图为单张独立图像，仅展示本视角所描述的内容，严禁多视图拼接或多格布局。',
}

/**
 * For head close-up panels, remove full-body / posture / clothing-length info
 * from 基础设定 so it doesn't override the close-up framing directive.
 */
function pruneBaseForShot(content: string, shot: ShotType): string {
  if (shot !== 'head_closeup') return content
  const PRUNE_PATTERNS = [
    /，?标准直立姿态[^\n，。]*/g,
    /，?双臂自然下垂[^\n，。]*/g,
    /，?双脚[^\n，。]*/g,
    /，?脊柱挺直[^\n，。]*/g,
    /，?全身[^\n，。]*/g,
    /，?从头[顶]?到脚[^\n，。]*/g,
  ]
  let result = content
  for (const p of PRUNE_PATTERNS) {
    result = result.replace(p, '')
  }
  return result.replace(/，{2,}/g, '，').replace(/^[，\s]+/, '').replace(/[，\s]+$/, '').trim()
}

/**
 * Strip multi-view layout instructions from 技术参数 content so the AI
 * doesn't generate a 4-panel character sheet for each individual panel image.
 *
 * Keeps: style, background, quality, no-text/no-props/no-shadow clauses.
 * Removes: 四视图排列, 人物设定表, view-layout descriptions.
 */
function filterTechParams(content: string, shot: ShotType): string {
  const MULTI_VIEW_PATTERNS = [
    /四视图排列[：:][^\n，。]*/g,
    /四视图/g,
    /头部特写[-—–\s]*正面全身[-—–\s]*[^\n，。]*/g,
    /[人角]物?设定表/g,
    /，?四视图[^，。\n]*/g,
    /[^\n，。]*视图排列[^\n，。]*/g,
  ]
  let result = content
  for (const p of MULTI_VIEW_PATTERNS) {
    result = result.replace(p, '')
  }

  // 头部特写格：额外过滤全身姿态指令，避免与头部特写构图冲突
  if (shot === 'head_closeup') {
    const FULL_BODY_PATTERNS = [
      /，?全身视图[^\n，。]*/g,
      /，?从头[顶]?到脚[^\n，。]*/g,
      /，?标准站姿[^\n，。]*/g,
      /，?脊柱挺直[^\n，。]*/g,
      /，?双臂自然下垂于身体两侧[^\n，。]*/g,
      /，?双脚[^\n，。]*/g,
    ]
    for (const p of FULL_BODY_PATTERNS) {
      result = result.replace(p, '')
    }
  }

  result = result.replace(/，{2,}/g, '，').replace(/^[，\s]+/, '').replace(/[，\s]+$/, '')
  return result.trim()
}

/**
 * Parse a multi-panel prompt (containing 【第N格...】 markers) into
 * individual panel prompts. Each panel's fullPrompt includes:
 *   1. Shot-specific framing directive (prevents wrong composition)
 *   2. The panel-specific content under a neutral header (avoids "第N格" trigger)
 *   3. 基础设定 pruned for head close-up (removes full-body posture conflicts)
 *   4. Filtered 技术参数 (style/quality only, multi-view layout stripped)
 *   5. Other shared sections (补充说明 etc.)
 *
 * Returns null if the prompt doesn't contain any panel markers.
 */
export function parseMultiPanelPrompt(prompt: string): PanelSection[] | null {
  if (!prompt || !prompt.includes('【第')) return null

  // Split text into labeled sections by 【...】 headers
  const sections: Array<{ header: string; content: string }> = []
  const parts = prompt.split(/(【[^】]+】)/)
  let header = ''
  let content = ''

  for (const part of parts) {
    if (/^【[^】]+】$/.test(part.trim())) {
      if (header || content.trim()) {
        sections.push({ header, content: content.trim() })
      }
      header = part.trim()
      content = ''
    } else {
      content += part
    }
  }
  if (header || content.trim()) {
    sections.push({ header, content: content.trim() })
  }

  const panelSections = sections.filter(s => PANEL_REGEX.test(s.header))
  if (panelSections.length === 0) return null

  // Collect shared sections
  const sharedSections = sections.filter(
    s => !PANEL_REGEX.test(s.header) && SHARED_KEYWORDS.some(k => s.header.includes(k))
  )

  // Build per-panel fullPrompt
  return panelSections.map(s => {
    const labelMatch = s.header.match(/【([^】]+)】/)
    const label = labelMatch ? labelMatch[1].trim() : s.header

    // Detect shot type from label to drive framing directive + filtering
    const shot = detectShotType(label)
    const shotDirective = SHOT_DIRECTIVES[shot]

    // Use a neutral header instead of 【第N格 - xxx】 to avoid triggering
    // the model's "多格设定表" mode when it sees "第N格" in the prompt.
    const panelText = `【当前视角内容】\n${s.content}`

    // Build shared text: prune 基础设定 for head close-up, filter 技术参数
    const sharedParts = sharedSections.map(sec => {
      if (sec.header.includes('技术参数')) {
        const body = filterTechParams(sec.content, shot)
        return body ? `${sec.header}\n${body}` : ''
      }
      if (sec.header.includes('基础设定') || sec.header.includes('角色设定')) {
        const body = pruneBaseForShot(sec.content, shot)
        return body ? `${sec.header}\n${body}` : ''
      }
      return sec.content ? `${sec.header}\n${sec.content}` : ''
    }).filter(Boolean)

    const fullPrompt = [shotDirective, panelText, ...sharedParts].join('\n\n')
    return { label, fullPrompt }
  })
}
