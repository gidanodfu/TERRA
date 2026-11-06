import { Link } from 'react-router-dom'
import { ArrowLeft, Info } from 'lucide-react'
import { LEGAL_LINKS } from '../features/legal/links'

export default function LegalLayout({ title, intro, sections, currentPath }) {
  const otherLinks = LEGAL_LINKS.filter((link) => link.to !== currentPath)

  return (
    <div className="min-h-screen bg-shell px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-[880px]">
        <header
          data-testid="legal-navbar"
          className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm sm:px-6"
        >
          <Link
            to="/"
            className="flex min-w-0 items-center gap-3 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-700 text-base font-semibold text-white">
              T
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold tracking-tight text-slate-900">TERRA</span>
              <span className="block truncate text-xs text-slate-500">Gestión documental</span>
            </span>
          </Link>
          <Link
            to="/"
            className="inline-flex shrink-0 items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-muted hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Ir al inicio
          </Link>
        </header>

        <article
          data-testid="legal-document"
          className="mt-4 rounded-3xl border border-border bg-card p-5 shadow-sm sm:mt-6 sm:p-10"
        >
          <header className="border-b border-border pb-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Información legal</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-500">{intro}</p>
          </header>

          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-semibold">Documento pendiente de aprobación institucional</p>
              <p className="mt-1 leading-relaxed">
                Este texto es un borrador informativo adaptado a TERRA. No constituye una política
                oficial vigente hasta que la institución valide y publique su versión definitiva.
              </p>
            </div>
          </div>

          <div className="mt-8 space-y-8">
            {sections.map((section, index) => (
              <section
                key={section.title}
                className={index > 0 ? 'border-t border-border pt-6' : undefined}
              >
                <h2 className="text-base font-semibold text-slate-900">{section.title}</h2>
                <div className="mt-3 space-y-3 text-sm leading-7 text-slate-600">{section.body}</div>
              </section>
            ))}
          </div>

          <footer className="mt-10 border-t border-border pt-6">
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-lg text-sm font-semibold text-brand-800 hover:text-brand-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Volver al inicio
            </Link>

            <nav aria-label="También puede consultar" className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">También puede consultar</p>
              <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                {otherLinks.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="rounded text-slate-500 hover:text-brand-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                    >
                      {link.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </footer>
        </article>

        <footer
          data-testid="legal-footer"
          aria-label="Enlaces legales"
          className="@container mt-4 rounded-2xl border border-border bg-card px-4 py-4 shadow-sm sm:mt-6 sm:px-6"
        >
          <ul className="grid grid-cols-1 gap-x-6 gap-y-2 text-center text-xs text-slate-500 @[24rem]:grid-cols-2">
            {LEGAL_LINKS.map((link) => {
              const current = link.to === currentPath
              return (
                <li key={link.to} className="min-w-0">
                  <Link
                    to={link.to}
                    aria-current={current ? 'page' : undefined}
                    className={`inline-block max-w-full rounded px-1 py-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
                      current
                        ? 'font-semibold text-brand-800'
                        : 'hover:text-brand-800 hover:underline'
                    }`}
                  >
                    {link.title}
                  </Link>
                </li>
              )
            })}
          </ul>
        </footer>
      </div>
    </div>
  )
}

export function LegalP({ children }) {
  return <p>{children}</p>
}

export function LegalList({ items, ordered = false }) {
  const List = ordered ? 'ol' : 'ul'
  return (
    <List className={`${ordered ? 'list-decimal' : 'list-disc'} space-y-1 pl-5`}>
      {items.map((item) => <li key={item}>{item}</li>)}
    </List>
  )
}

export function LegalSubheading({ children }) {
  return <h3 className="mt-4 text-sm font-semibold text-slate-800">{children}</h3>
}

export function LegalNote({ title, children }) {
  return (
    <div className="rounded-xl border border-border bg-muted p-4 text-sm leading-relaxed text-slate-600">
      {title ? <p className="font-semibold text-slate-800">{title}</p> : null}
      <div className={title ? 'mt-1' : undefined}>{children}</div>
    </div>
  )
}

export function LegalTable({ head, rows }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>{head.map((cell) => <th key={cell}>{cell}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.join('|')}>
              {row.map((cell, index) => (
                <td key={`${index}-${cell}`} className="align-top text-sm text-slate-600">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function LegalLink({ href, children }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="rounded break-all font-medium text-brand-700 underline decoration-brand-300 underline-offset-4 hover:text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
    >
      {children}
    </a>
  )
}

export function PendingText() {
  return (
    <p>
      Este apartado queda pendiente de confirmación institucional. La institución debe validar
      el texto definitivo antes de la publicación de este documento.
    </p>
  )
}
