import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'

export default function NotFoundPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <div className="card max-w-md p-8 text-center">
        <Compass className="mx-auto h-10 w-10 text-slate-400" />
        <h1 className="mt-4 text-xl font-semibold text-slate-900">Página no encontrada</h1>
        <p className="mt-2 text-sm text-slate-500">
          La dirección solicitada no existe o ya no está disponible.
        </p>
        <Link to="/" className="btn-primary mt-5">
          Volver al inicio
        </Link>
      </div>
    </div>
  )
}
