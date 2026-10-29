import { Award, BookOpen, Briefcase, GraduationCap, type LucideIcon } from 'lucide-react'
import type { Enums } from './database.types'

export type TimelineKind = Enums<'timeline_kind'>

export const TIMELINE_META: Record<TimelineKind, { title: string; singular: string; icon: LucideIcon }> = {
  experience: { title: 'Experience', singular: 'Experience', icon: Briefcase },
  education: { title: 'Education', singular: 'Education', icon: GraduationCap },
  training: { title: 'Training', singular: 'Training', icon: BookOpen },
  certification: { title: 'Certifications', singular: 'Certification', icon: Award },
}

export const TIMELINE_ORDER: TimelineKind[] = ['experience', 'education', 'training', 'certification']
