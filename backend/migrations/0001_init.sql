-- Esquema inicial de TERRA.
-- Los metadatos viven en PostgreSQL; los bytes de los documentos solo viven en el volumen privado.

CREATE TABLE areas (
    id          uuid PRIMARY KEY,
    name        text NOT NULL CHECK (length(btrim(name)) > 0),
    slug        text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT areas_slug_unique UNIQUE (slug)
);

CREATE TABLE positions (
    id               uuid PRIMARY KEY,
    area_id          uuid NOT NULL REFERENCES areas (id) ON DELETE RESTRICT,
    name             text NOT NULL CHECK (length(btrim(name)) > 0),
    slug             text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    normalized_name  text NOT NULL CHECK (length(btrim(normalized_name)) > 0),
    status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT positions_area_name_unique UNIQUE (area_id, normalized_name),
    -- Destino de la FK compuesta siguiente: garantiza que el cargo de un usuario pertenece a su área.
    CONSTRAINT positions_id_area_unique UNIQUE (id, area_id)
);

CREATE TABLE users (
    id             uuid PRIMARY KEY,
    first_name     text,
    last_name      text,
    display_name   text,
    email          text,
    area_id        uuid REFERENCES areas (id) ON DELETE RESTRICT,
    position_id    uuid,
    status         text NOT NULL DEFAULT 'pending_profile'
                   CHECK (status IN ('pending_profile', 'active', 'suspended', 'disabled')),
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    last_login_at  timestamptz,
    CONSTRAINT users_position_in_area
        FOREIGN KEY (position_id, area_id) REFERENCES positions (id, area_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX users_email_unique ON users (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX users_area_idx ON users (area_id);
CREATE INDEX users_position_idx ON users (position_id);
CREATE INDEX users_status_idx ON users (status);

CREATE TABLE auth_identities (
    id                uuid PRIMARY KEY,
    user_id           uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    provider          text NOT NULL CHECK (provider IN ('google')),
    provider_subject  text NOT NULL CHECK (length(provider_subject) > 0),
    created_at        timestamptz NOT NULL DEFAULT now(),
    last_used_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT auth_identities_provider_subject_unique UNIQUE (provider, provider_subject)
);
CREATE INDEX auth_identities_user_idx ON auth_identities (user_id);

CREATE TABLE local_credentials (
    user_id                uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    username               text NOT NULL CHECK (length(btrim(username)) > 0),
    password_hash          text NOT NULL,
    password_changed_at    timestamptz,
    must_rotate_password   boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX local_credentials_username_unique ON local_credentials (lower(username));

CREATE TABLE system_roles (
    id    uuid PRIMARY KEY,
    key   text NOT NULL UNIQUE CHECK (key ~ '^[a-z_]+$'),
    name  text NOT NULL
);

CREATE TABLE user_roles (
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role_id     uuid NOT NULL REFERENCES system_roles (id) ON DELETE RESTRICT,
    granted_by  uuid REFERENCES users (id) ON DELETE SET NULL,
    granted_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE sessions (
    id           uuid PRIMARY KEY,
    user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash   bytea NOT NULL UNIQUE,
    csrf_token   text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    expires_at   timestamptz NOT NULL,
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    user_agent   text,
    ip_hash      text
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

CREATE TABLE oauth_states (
    id             uuid PRIMARY KEY,
    state_hash     bytea NOT NULL UNIQUE,
    flow           text NOT NULL CHECK (flow IN ('login', 'drive_connect')),
    user_id        uuid REFERENCES users (id) ON DELETE CASCADE,
    code_verifier  text,
    nonce          text,
    redirect_after text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    expires_at     timestamptz NOT NULL,
    consumed_at    timestamptz
);
CREATE INDEX oauth_states_expires_idx ON oauth_states (expires_at);

CREATE TABLE policy_versions (
    id                   uuid PRIMARY KEY,
    version              text NOT NULL UNIQUE,
    content              text NOT NULL,
    created_by_user_id   uuid REFERENCES users (id) ON DELETE SET NULL,
    published_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE drive_connections (
    id                        uuid PRIMARY KEY,
    user_id                   uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    google_subject            text NOT NULL,
    google_email              text,
    refresh_token_ciphertext  bytea,
    scopes                    text NOT NULL DEFAULT '',
    status                    text NOT NULL DEFAULT 'connected'
                              CHECK (status IN ('connected', 'reauthorization_required', 'revoked', 'error')),
    connected_at              timestamptz NOT NULL DEFAULT now(),
    last_refreshed_at         timestamptz,
    last_error_code           text,
    policy_consent_version    text,
    policy_consent_at         timestamptz,
    policy_consent_by_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT drive_connections_user_unique UNIQUE (user_id),
    CONSTRAINT drive_connections_subject_unique UNIQUE (google_subject)
);

CREATE TABLE drive_nodes (
    id                   uuid PRIMARY KEY,
    drive_connection_id  uuid NOT NULL REFERENCES drive_connections (id) ON DELETE CASCADE,
    google_file_id       text NOT NULL,
    name                 text NOT NULL,
    mime_type            text NOT NULL,
    size_bytes           bigint,
    modified_time        timestamptz,
    md5_checksum         text,
    can_download         boolean NOT NULL DEFAULT false,
    trashed              boolean NOT NULL DEFAULT false,
    is_shortcut          boolean NOT NULL DEFAULT false,
    shortcut_target_id   text,
    last_seen_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT drive_nodes_connection_file_unique UNIQUE (drive_connection_id, google_file_id)
);
CREATE INDEX drive_nodes_connection_idx ON drive_nodes (drive_connection_id);

CREATE TABLE drive_node_parents (
    drive_node_id          uuid NOT NULL REFERENCES drive_nodes (id) ON DELETE CASCADE,
    parent_google_file_id  text NOT NULL,
    PRIMARY KEY (drive_node_id, parent_google_file_id)
);

CREATE TABLE download_jobs (
    id                    uuid PRIMARY KEY,
    requested_by_user_id  uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    drive_owner_user_id   uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    drive_connection_id   uuid NOT NULL REFERENCES drive_connections (id) ON DELETE RESTRICT,
    area_id_snapshot      uuid NOT NULL REFERENCES areas (id) ON DELETE RESTRICT,
    position_id_snapshot  uuid NOT NULL REFERENCES positions (id) ON DELETE RESTRICT,
    area_name_snapshot    text NOT NULL,
    position_name_snapshot text NOT NULL,
    scope_type            text NOT NULL CHECK (scope_type IN ('my_drive_full', 'selected_folders')),
    status                text NOT NULL DEFAULT 'queued' CHECK (status IN (
                              'queued', 'scanning', 'downloading', 'completed', 'partially_completed',
                              'failed', 'waiting_authorization', 'cancel_requested', 'cancelled')),
    total_items           integer NOT NULL DEFAULT 0 CHECK (total_items >= 0),
    completed_items       integer NOT NULL DEFAULT 0 CHECK (completed_items >= 0),
    skipped_items         integer NOT NULL DEFAULT 0 CHECK (skipped_items >= 0),
    failed_items          integer NOT NULL DEFAULT 0 CHECK (failed_items >= 0),
    total_bytes           bigint NOT NULL DEFAULT 0 CHECK (total_bytes >= 0),
    downloaded_bytes      bigint NOT NULL DEFAULT 0 CHECK (downloaded_bytes >= 0),
    idempotency_key       text,
    error_code            text,
    error_message         text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    started_at            timestamptz,
    finished_at           timestamptz,
    cancel_requested_at   timestamptz,
    worker_lease_owner    text,
    lease_expires_at      timestamptz,
    heartbeat_at          timestamptz,
    CONSTRAINT download_jobs_idempotency_unique UNIQUE (requested_by_user_id, idempotency_key)
);
CREATE INDEX download_jobs_status_idx ON download_jobs (status, created_at);
CREATE INDEX download_jobs_owner_idx ON download_jobs (drive_owner_user_id, created_at DESC);
CREATE INDEX download_jobs_requester_idx ON download_jobs (requested_by_user_id, created_at DESC);
CREATE INDEX download_jobs_lease_idx ON download_jobs (lease_expires_at);

CREATE TABLE download_job_roots (
    id                    uuid PRIMARY KEY,
    job_id                uuid NOT NULL REFERENCES download_jobs (id) ON DELETE CASCADE,
    google_folder_id      text NOT NULL,
    folder_name_snapshot  text NOT NULL,
    source_path_snapshot  text NOT NULL,
    created_at            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT download_job_roots_unique UNIQUE (job_id, google_folder_id)
);

CREATE TABLE download_items (
    id              uuid PRIMARY KEY,
    job_id          uuid NOT NULL REFERENCES download_jobs (id) ON DELETE CASCADE,
    drive_node_id   uuid NOT NULL REFERENCES drive_nodes (id) ON DELETE RESTRICT,
    status          text NOT NULL DEFAULT 'pending' CHECK (status IN (
                        'pending', 'downloading', 'completed', 'skipped', 'retrying', 'failed', 'cancelled')),
    attempt_count   integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    next_retry_at   timestamptz,
    relative_path   text NOT NULL,
    size_bytes      bigint,
    sha256          text,
    error_code      text,
    error_message   text,
    started_at      timestamptz,
    finished_at     timestamptz,
    CONSTRAINT download_items_job_node_unique UNIQUE (job_id, drive_node_id)
);
CREATE INDEX download_items_job_status_idx ON download_items (job_id, status);
CREATE INDEX download_items_retry_idx ON download_items (job_id, next_retry_at);

CREATE TABLE stored_files (
    id                    uuid PRIMARY KEY,
    drive_owner_user_id   uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    drive_node_id         uuid NOT NULL REFERENCES drive_nodes (id) ON DELETE RESTRICT,
    job_id                uuid NOT NULL REFERENCES download_jobs (id) ON DELETE RESTRICT,
    relative_path         text NOT NULL,
    source_modified_time  timestamptz,
    source_revision_id    text,
    export_mime_type      text,
    size_bytes            bigint NOT NULL CHECK (size_bytes >= 0),
    sha256                text NOT NULL,
    status                text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'missing')),
    created_at            timestamptz NOT NULL DEFAULT now(),
    verified_at           timestamptz,
    CONSTRAINT stored_files_path_unique UNIQUE (relative_path)
);
CREATE INDEX stored_files_owner_idx ON stored_files (drive_owner_user_id);
CREATE INDEX stored_files_job_idx ON stored_files (job_id);
CREATE INDEX stored_files_node_idx ON stored_files (drive_node_id);

CREATE TABLE job_events (
    id          bigserial PRIMARY KEY,
    job_id      uuid NOT NULL REFERENCES download_jobs (id) ON DELETE CASCADE,
    event_type  text NOT NULL,
    payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_events_job_idx ON job_events (job_id, id);

CREATE TABLE audit_events (
    id             bigserial PRIMARY KEY,
    actor_user_id  uuid REFERENCES users (id) ON DELETE SET NULL,
    action         text NOT NULL,
    target_type    text NOT NULL,
    target_id      text,
    metadata_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
    ip_hash        text,
    created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_created_idx ON audit_events (created_at DESC);
CREATE INDEX audit_events_actor_idx ON audit_events (actor_user_id, created_at DESC);

CREATE TABLE organization_history (
    id                   bigserial PRIMARY KEY,
    user_id              uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    area_id              uuid REFERENCES areas (id) ON DELETE RESTRICT,
    position_id          uuid REFERENCES positions (id) ON DELETE RESTRICT,
    previous_area_id     uuid REFERENCES areas (id) ON DELETE RESTRICT,
    previous_position_id uuid REFERENCES positions (id) ON DELETE RESTRICT,
    actor_user_id        uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX organization_history_user_idx ON organization_history (user_id, created_at DESC);

CREATE TABLE bootstrap_state (
    id           integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    completed_at timestamptz NOT NULL DEFAULT now(),
    details      jsonb NOT NULL DEFAULT '{}'::jsonb
);

INSERT INTO system_roles (id, key, name) VALUES
    ('8f14e45f-0a6b-4c2d-9e1f-6a7b8c9d0e01', 'admin', 'Administrador'),
    ('c9f0f895-0a6b-4c2d-9e1f-6a7b8c9d0e02', 'user', 'Trabajador');
