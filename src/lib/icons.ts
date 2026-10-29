import {
  Atom,
  Box,
  Braces,
  Code,
  Cpu,
  Database,
  FileCode,
  GitBranch,
  GitMerge,
  GitPullRequest,
  Globe,
  Key,
  Layers,
  Layout,
  Network,
  Package,
  Palette,
  Server,
  Shield,
  Smartphone,
  SquareCode,
  Terminal,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

/** Curated icon set selectable for skills. Keys are stored in skills.icon. */
export const SKILL_ICONS = {
  atom: Atom,
  box: Box,
  braces: Braces,
  code: Code,
  cpu: Cpu,
  database: Database,
  'file-code': FileCode,
  'git-branch': GitBranch,
  'git-merge': GitMerge,
  'git-pull-request': GitPullRequest,
  globe: Globe,
  key: Key,
  layers: Layers,
  layout: Layout,
  network: Network,
  package: Package,
  palette: Palette,
  server: Server,
  shield: Shield,
  smartphone: Smartphone,
  'square-code': SquareCode,
  terminal: Terminal,
  wrench: Wrench,
} satisfies Record<string, LucideIcon>

export type SkillIconKey = keyof typeof SKILL_ICONS
export const ICON_KEYS = Object.keys(SKILL_ICONS) as SkillIconKey[]

export function skillIcon(key: string | null | undefined): LucideIcon | null {
  return key && key in SKILL_ICONS ? SKILL_ICONS[key as SkillIconKey] : null
}
