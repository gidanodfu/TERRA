-- Conserva la revisión de Drive observada cuando se descargó un documento.
ALTER TABLE drive_nodes ADD COLUMN source_revision_id text;
