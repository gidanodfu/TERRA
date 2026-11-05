-- Metadatos adicionales observados durante la exploración interactiva de Drive.
ALTER TABLE drive_nodes ADD COLUMN created_time timestamptz;
ALTER TABLE drive_nodes ADD COLUMN web_view_link text;
ALTER TABLE drive_nodes ADD COLUMN description text;
ALTER TABLE drive_nodes ADD COLUMN starred boolean NOT NULL DEFAULT false;
ALTER TABLE drive_nodes ADD COLUMN shared boolean NOT NULL DEFAULT false;
ALTER TABLE drive_nodes ADD COLUMN shortcut_target_mime_type text;
