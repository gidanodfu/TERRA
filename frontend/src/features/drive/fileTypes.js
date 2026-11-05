// Clasificación centralizada de archivos de Google Drive.
// El MIME type tiene prioridad; la extensión es solo un respaldo.

const GOOGLE = {
  FOLDER: 'application/vnd.google-apps.folder',
  SHORTCUT: 'application/vnd.google-apps.shortcut',
  DOCUMENT: 'application/vnd.google-apps.document',
  SPREADSHEET: 'application/vnd.google-apps.spreadsheet',
  PRESENTATION: 'application/vnd.google-apps.presentation',
  DRAWING: 'application/vnd.google-apps.drawing',
  FORM: 'application/vnd.google-apps.form',
  SCRIPT: 'application/vnd.google-apps.script',
  VIDS: 'application/vnd.google-apps.vid',
}

const EXPORTABLE_NATIVE = new Set([
  GOOGLE.DOCUMENT,
  GOOGLE.SPREADSHEET,
  GOOGLE.PRESENTATION,
  GOOGLE.DRAWING,
  GOOGLE.FORM,
  GOOGLE.SCRIPT,
])

const EXTENSION_CATEGORY = {
  pdf: 'pdf',
  doc: 'document', docx: 'document', odt: 'document', rtf: 'document', txt: 'document',
  epub: 'document', html: 'document', htm: 'document', md: 'document', markdown: 'document',
  xls: 'spreadsheet', xlsx: 'spreadsheet', csv: 'spreadsheet', ods: 'spreadsheet', tsv: 'spreadsheet',
  ppt: 'presentation', pptx: 'presentation', odp: 'presentation',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', svg: 'image', webp: 'image',
  dng: 'image', tif: 'image', tiff: 'image', bmp: 'image', heic: 'image',
  mp4: 'video', mov: 'video', avi: 'video', mkv: 'video', webm: 'video', m4v: 'video',
  mp3: 'audio', wav: 'audio', ogg: 'audio', flac: 'audio', aac: 'audio', m4a: 'audio',
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive',
  bz2: 'archive', xz: 'archive',
  js: 'code', mjs: 'code', cjs: 'code', ts: 'code', tsx: 'code', jsx: 'code', go: 'code',
  py: 'code', php: 'code', css: 'code', scss: 'code', json: 'code', xml: 'code', sql: 'code',
  yaml: 'code', yml: 'code', sh: 'code', bash: 'code', rb: 'code', java: 'code', c: 'code',
  h: 'code', cpp: 'code', rs: 'code',
}

const CATEGORY_LABEL = {
  folder: 'Carpeta',
  shortcut: 'Atajo',
  pdf: 'PDF',
  document: 'Documento',
  spreadsheet: 'Hoja de cálculo',
  presentation: 'Presentación',
  drawing: 'Dibujo',
  form: 'Formulario',
  script: 'Apps Script',
  image: 'Imagen',
  video: 'Vídeo',
  audio: 'Audio',
  archive: 'Archivo comprimido',
  code: 'Código',
  other: 'Archivo',
}

export function fileExtension(name = '') {
  const clean = name.trim().toLowerCase()
  const dot = clean.lastIndexOf('.')
  if (dot <= 0 || dot === clean.length - 1) return ''
  return clean.slice(dot + 1)
}

export function fileCategory(item = {}) {
  if (item.is_shortcut) return 'shortcut'
  const mime = item.mime_type || ''
  if (mime === GOOGLE.FOLDER || item.kind === 'folder') return 'folder'
  if (mime === GOOGLE.DOCUMENT) return 'document'
  if (mime === GOOGLE.SPREADSHEET) return 'spreadsheet'
  if (mime === GOOGLE.PRESENTATION) return 'presentation'
  if (mime === GOOGLE.DRAWING) return 'drawing'
  if (mime === GOOGLE.FORM) return 'form'
  if (mime === GOOGLE.SCRIPT) return 'script'
  if (mime === GOOGLE.VIDS) return 'video'
  if (mime === 'application/pdf') return 'pdf'
  if (mime.includes('wordprocessingml') || mime === 'application/msword' ||
      mime === 'application/vnd.oasis.opendocument.text' || mime === 'application/rtf' ||
      mime === 'application/epub+zip' || mime === 'text/markdown') return 'document'
  if (mime.includes('spreadsheetml') || mime === 'application/vnd.ms-excel' ||
      mime === 'application/vnd.oasis.opendocument.spreadsheet' || mime === 'text/csv' ||
      mime === 'text/tab-separated-values') return 'spreadsheet'
  if (mime.includes('presentationml') || mime === 'application/vnd.ms-powerpoint' ||
      mime === 'application/vnd.oasis.opendocument.presentation') return 'presentation'
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime === 'application/zip' || mime === 'application/x-rar-compressed' ||
      mime === 'application/x-7z-compressed' || mime === 'application/gzip' ||
      mime === 'application/x-tar' || mime === 'application/x-xz' ||
      mime === 'application/x-bzip2' || mime.includes('compressed')) return 'archive'
  if (mime.startsWith('text/') || mime.includes('json') || mime.includes('xml') ||
      mime.includes('javascript') || mime.includes('sql') || mime.includes('yaml')) return 'code'
  if (mime === 'application/msword') return 'document'
  const byExtension = EXTENSION_CATEGORY[fileExtension(item.name)]
  return byExtension || 'other'
}

export function fileTypeLabel(item = {}) {
  return CATEGORY_LABEL[fileCategory(item)] || CATEGORY_LABEL.other
}

export function fileHasCheckbox(item = {}) {
  if (item.kind === 'folder' || item.is_shortcut) return false
  if (typeof item.selectable === 'boolean') return item.selectable
  if (EXPORTABLE_NATIVE.has(item.mime_type)) return true
  if (String(item.mime_type || '').startsWith('application/vnd.google-apps.')) return false
  return Boolean(item.can_download)
}

export { GOOGLE, CATEGORY_LABEL }
