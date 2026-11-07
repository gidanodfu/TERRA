-- Unicidad organizativa canónica, responsabilidades y conservación del historial.
-- La normalización debe coincidir con validate.NormalizeName (Go): minúsculas,
-- espacios colapsados y NFC; los acentos siguen siendo significativos.

CREATE OR REPLACE FUNCTION terra_normalize_org_name(value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
    SELECT normalize(lower(btrim(regexp_replace(value, '[[:space:]]+', ' ', 'g'))), NFC)
$$;

ALTER TABLE areas ADD COLUMN normalized_name text;
UPDATE areas SET normalized_name = terra_normalize_org_name(name);
ALTER TABLE areas ALTER COLUMN normalized_name SET NOT NULL;
ALTER TABLE areas ADD COLUMN responsibilities text[] NOT NULL DEFAULT '{}'::text[];

CREATE OR REPLACE FUNCTION terra_set_area_normalized_name() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.normalized_name := terra_normalize_org_name(NEW.name);
    RETURN NEW;
END;
$$;
CREATE TRIGGER areas_normalize_name
    BEFORE INSERT OR UPDATE OF name ON areas
    FOR EACH ROW EXECUTE FUNCTION terra_set_area_normalized_name();

-- Los cargos deben seguir la misma normalización. Si ya existiera un conflicto
-- histórico dentro de un área, la migración falla antes de tocar los datos.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM positions
        GROUP BY area_id, terra_normalize_org_name(name)
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Existen cargos homónimos dentro de una misma área; resuelva el conflicto antes de migrar.';
    END IF;
END;
$$;
UPDATE positions SET normalized_name = terra_normalize_org_name(name);
ALTER TABLE positions ADD COLUMN responsibilities text[] NOT NULL DEFAULT '{}'::text[];

CREATE OR REPLACE FUNCTION terra_set_position_normalized_name() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.normalized_name := terra_normalize_org_name(NEW.name);
    RETURN NEW;
END;
$$;
CREATE TRIGGER positions_normalize_name
    BEFORE INSERT OR UPDATE OF name ON positions
    FOR EACH ROW EXECUTE FUNCTION terra_set_position_normalized_name();

-- Conserva los nombres históricos antes de remapear identificadores.
ALTER TABLE organization_history ADD COLUMN area_name_snapshot text NOT NULL DEFAULT '';
ALTER TABLE organization_history ADD COLUMN position_name_snapshot text NOT NULL DEFAULT '';
ALTER TABLE organization_history ADD COLUMN previous_area_name_snapshot text NOT NULL DEFAULT '';
ALTER TABLE organization_history ADD COLUMN previous_position_name_snapshot text NOT NULL DEFAULT '';
UPDATE organization_history h SET
    area_name_snapshot = COALESCE((SELECT name FROM areas a WHERE a.id = h.area_id), ''),
    position_name_snapshot = COALESCE((SELECT name FROM positions p WHERE p.id = h.position_id), ''),
    previous_area_name_snapshot = COALESCE((SELECT name FROM areas a WHERE a.id = h.previous_area_id), ''),
    previous_position_name_snapshot = COALESCE((SELECT name FROM positions p WHERE p.id = h.previous_position_id), '');

-- Consolida áreas duplicadas antes de crear la restricción única. La selección
-- de la canónica es determinista y todas las referencias se remapean.
DO $$
DECLARE
    dup record;
    canonical uuid;
    other uuid;
    target uuid;
    pos record;
    any_active boolean;
BEGIN
    FOR dup IN
        SELECT normalized_name AS norm FROM areas
        GROUP BY normalized_name HAVING count(*) > 1
    LOOP
        SELECT bool_or(status = 'active') INTO any_active
        FROM areas WHERE normalized_name = dup.norm;

        SELECT a.id INTO canonical
        FROM areas a
        WHERE a.normalized_name = dup.norm
        ORDER BY
            (a.status = 'active') DESC,
            ((SELECT count(*) FROM positions p WHERE p.area_id = a.id)
             + (SELECT count(*) FROM users u WHERE u.area_id = a.id)
             + (SELECT count(*) FROM download_jobs j WHERE j.area_id_snapshot = a.id)
             + (SELECT count(*) FROM organization_history h
                WHERE h.area_id = a.id OR h.previous_area_id = a.id)) DESC,
            a.created_at ASC,
            a.id ASC
        LIMIT 1;

        FOR other IN
            SELECT id FROM areas WHERE normalized_name = dup.norm AND id <> canonical
            ORDER BY created_at ASC, id ASC
        LOOP
            FOR pos IN SELECT * FROM positions WHERE area_id = other LOOP
                SELECT id INTO target FROM positions
                WHERE area_id = canonical AND normalized_name = pos.normalized_name
                LIMIT 1;

                IF target IS NOT NULL THEN
                    IF pos.responsibilities <> '{}'::text[]
                       AND (SELECT responsibilities FROM positions WHERE id = target) <> '{}'::text[]
                       AND pos.responsibilities <> (SELECT responsibilities FROM positions WHERE id = target) THEN
                        RAISE EXCEPTION 'Conflicto de responsabilidades entre cargos duplicados; revisión manual requerida.';
                    END IF;
                    IF pos.responsibilities <> '{}'::text[]
                       AND (SELECT responsibilities FROM positions WHERE id = target) = '{}'::text[] THEN
                        UPDATE positions SET responsibilities = pos.responsibilities WHERE id = target;
                    END IF;
                    UPDATE users SET area_id = canonical, position_id = target
                    WHERE position_id = pos.id;
                    UPDATE organization_history SET position_id = target WHERE position_id = pos.id;
                    UPDATE organization_history SET previous_position_id = target WHERE previous_position_id = pos.id;
                    UPDATE download_jobs SET area_id_snapshot = canonical, position_id_snapshot = target
                    WHERE position_id_snapshot = pos.id;
                    DELETE FROM positions WHERE id = pos.id;
                ELSE
                    UPDATE positions SET area_id = canonical WHERE id = pos.id;
                    UPDATE users SET area_id = canonical
                    WHERE area_id = other AND position_id = pos.id;
                    UPDATE download_jobs SET area_id_snapshot = canonical
                    WHERE position_id_snapshot = pos.id;
                END IF;
            END LOOP;

            UPDATE users SET area_id = canonical WHERE area_id = other;
            UPDATE download_jobs SET area_id_snapshot = canonical WHERE area_id_snapshot = other;
            UPDATE organization_history SET area_id = canonical WHERE area_id = other;
            UPDATE organization_history SET previous_area_id = canonical WHERE previous_area_id = other;
            DELETE FROM areas WHERE id = other;
        END LOOP;

        UPDATE areas SET status = CASE WHEN any_active THEN 'active' ELSE 'inactive' END
        WHERE id = canonical;
    END LOOP;
END;
$$;

ALTER TABLE areas ADD CONSTRAINT areas_normalized_name_unique UNIQUE (normalized_name);
