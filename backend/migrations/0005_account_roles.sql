-- Future administrative roles. They are inserted without being granted to any
-- account: role assignment is an explicit administrative decision.
INSERT INTO system_roles (id, key, name) VALUES
    ('8f14e45f-0a6b-4c2d-9e1f-6a7b8c9d0e03', 'moderator', 'Moderador'),
    ('8f14e45f-0a6b-4c2d-9e1f-6a7b8c9d0e04', 'read_only', 'Solo lectura')
ON CONFLICT (key) DO NOTHING;
