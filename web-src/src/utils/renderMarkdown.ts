import { marked } from 'marked'

marked.setOptions({ breaks: true, gfm: true })

/**
 * Strip <think>...</think> reasoning blocks from model output.
 * - Complete blocks are removed entirely.
 * - An unclosed <think> block (still streaming) is removed from that point onward.
 */
export function stripThink(text: string): string {
  // Remove complete <think>...</think> blocks (including multiline)
  let result = text.replace(/<think>[\s\S]*?<\/think>/gi, '')
  // Remove unclosed <think> block still being streamed
  result = result.replace(/<think>[\s\S]*/i, '')
  return result.trim()
}

/**
 * Strip think blocks and render markdown to HTML.
 */
export function renderMarkdown(text: string): string {
  if (!text) return ''
  const clean = stripThink(text)
  if (!clean) return ''
  return marked.parse(clean) as string
}

/**
 * Whether the text is currently inside a think block (not yet closed).
 */
export function isThinking(text: string): boolean {
  const lower = text.toLowerCase()
  const lastOpen = lower.lastIndexOf('<think>')
  if (lastOpen === -1) return false
  const lastClose = lower.indexOf('</think>', lastOpen)
  return lastClose === -1
}
