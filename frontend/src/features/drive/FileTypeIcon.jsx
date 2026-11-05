import {
  Archive,
  ClipboardList,
  Code2,
  File,
  FileCode,
  FileSpreadsheet,
  FileText,
  Folder,
  Image,
  Link2,
  Music,
  PenTool,
  Presentation,
  Video,
} from 'lucide-react'
import { fileCategory } from './fileTypes'

const ICONS = {
  folder: Folder,
  shortcut: Link2,
  pdf: FileText,
  document: FileText,
  spreadsheet: FileSpreadsheet,
  presentation: Presentation,
  drawing: PenTool,
  form: ClipboardList,
  script: FileCode,
  image: Image,
  video: Video,
  audio: Music,
  archive: Archive,
  code: Code2,
  other: File,
}

export default function FileTypeIcon({ item, className = 'h-4 w-4' }) {
  const Icon = ICONS[fileCategory(item)] || File
  return <Icon className={className} aria-hidden="true" />
}
