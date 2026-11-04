import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { LEGAL_LINKS } from '../features/legal/links'

export default function LegalLayout({ title, intro, sections, currentPath }) {
  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-[900px]">
        <header className="mb-6 text-center">
          <Link to="/" className="inline-block focus:rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600">
            <span className="block text-xl font-semibold tracking-tight text-slate-900">TERRA</span>
            <span className="mt-1 block text-sm text-slate-500">Gestión documental municipal</span>
          </Link>
        </header>

        <article className="rounded-[20px] border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <header className="border-b border-slate-200 pb-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Información legal</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">{intro}</p>
          </header>

          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Documento pendiente de aprobación institucional</p>
            <p className="mt-1 leading-relaxed">
              El contenido definitivo debe ser aprobado y publicado por la institución. Este texto no
              constituye una política oficial vigente.
            </p>
          </div>

          <div className="mt-8 space-y-8">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="text-base font-semibold text-slate-900">{section.title}</h2>
                <div className="mt-2 space-y-3 text-sm leading-7 text-slate-600">{section.body}</div>
              </section>
            ))}
          </div>

          <footer className="mt-10 border-t border-slate-200 pt-6">
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-lg text-sm font-semibold text-brand-800 hover:text-brand-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Volver al inicio de sesión
            </Link>

            <nav aria-label="Otras secciones legales" className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Otras secciones legales
              </p>
              <ul className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                {LEGAL_LINKS.map((link) => {
                  const current = link.to === currentPath
                  return (
                    <li key={link.to}>
                      <Link
                        to={link.to}
                        aria-current={current ? 'page' : undefined}
                        className={`rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
                          current
                            ? 'font-semibold text-slate-900'
                            : 'text-slate-500 hover:text-brand-800 hover:underline'
                        }`}
                      >
                        {link.title}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </nav>
          </footer>
        </article>

        <p className="mt-5 text-center text-xs text-slate-400">
          TERRA · Gestión documental municipal
        </p>
      </div>
    </div>
  )
}

export function PendingText() {
  return <p>Contenido pendiente de aprobación y publicación institucional.</p>
}
