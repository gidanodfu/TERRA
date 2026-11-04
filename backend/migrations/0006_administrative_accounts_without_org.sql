-- Administrative accounts are not workers: their area/position assignment is
-- invalid. Preserve the previous values in organization_history before clearing
-- them so the correction keeps full traceability.
INSERT INTO organization_history
    (user_id, area_id, position_id, previous_area_id, previous_position_id, actor_user_id)
SELECT u.id, NULL, NULL, u.area_id, u.position_id, NULL
FROM users u
WHERE EXISTS (
        SELECT 1 FROM user_roles ur JOIN system_roles r ON r.id = ur.role_id
        WHERE ur.user_id = u.id AND r.key IN ('admin', 'moderator', 'read_only'))
  AND (u.area_id IS NOT NULL OR u.position_id IS NOT NULL);

UPDATE users u
SET area_id = NULL, position_id = NULL, updated_at = now()
WHERE EXISTS (
        SELECT 1 FROM user_roles ur JOIN system_roles r ON r.id = ur.role_id
        WHERE ur.user_id = u.id AND r.key IN ('admin', 'moderator', 'read_only'))
  AND (u.area_id IS NOT NULL OR u.position_id IS NOT NULL);
