-- Fija los slugs usados en la ruta física del snapshot para que los renombrados posteriores de un
-- área o cargo no cambien el lugar donde un trabajo en curso escribe sus archivos.
ALTER TABLE download_jobs ADD COLUMN area_slug_snapshot text NOT NULL DEFAULT '';
ALTER TABLE download_jobs ADD COLUMN position_slug_snapshot text NOT NULL DEFAULT '';

UPDATE download_jobs j
SET area_slug_snapshot = a.slug,
    position_slug_snapshot = p.slug
FROM areas a, positions p
WHERE a.id = j.area_id_snapshot AND p.id = j.position_id_snapshot;
