import { ADMIN_PERMISSIONS } from './permissions'

export const adminUser = {
  id: '11111111-1111-4111-8111-111111111111',
  first_name: 'Ada',
  last_name: 'Admin',
  display_name: 'Ada Admin',
  email: 'ada@example.test',
  area_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  area_name: 'Sistemas',
  position_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  position_name: 'Administradora',
  status: 'active',
  roles: ['admin'],
}

export const workerUser = {
  ...adminUser,
  id: '22222222-2222-4222-8222-222222222222',
  display_name: 'Trabajador Local',
  email: 'worker@example.test',
  roles: ['user'],
}

export const meResponse = {
  user: adminUser,
  permissions: ADMIN_PERMISSIONS,
  has_local_credentials: true,
  must_rotate_password: false,
  pending_profile: false,
}
