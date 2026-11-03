-- Preserve the Drive revision observed when a document was downloaded.
ALTER TABLE drive_nodes ADD COLUMN source_revision_id text;
