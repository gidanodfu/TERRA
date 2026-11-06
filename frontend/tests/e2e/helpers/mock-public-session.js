// Prepara una sesión anónima determinista para pruebas de rutas públicas.
// No intercepta otras APIs ni el flujo real de autenticación.
export async function mockPublicSession(context) {
  await context.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'unauthorized', message: 'No autenticado' } }),
    }),
  )

  // Evita depender de la red de Cloudflare en páginas públicas. El widget real
  // sigue utilizándose en la aplicación y en las pruebas de login.
  await context.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/javascript',
      body: `
        window.turnstile = {
          render(container, options) {
            window.__turnstileOptions = options;
            return 1;
          },
          reset() {},
          remove() {},
        };
      `,
    }),
  )
}
