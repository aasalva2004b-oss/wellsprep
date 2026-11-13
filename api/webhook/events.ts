/** Retired alternate entry point. The authenticated Express server owns this API. */
export default function handler(_request: unknown, response: any) {
  return response.status(410).json({ error: 'Este endpoint antiguo está deshabilitado. Utiliza el servicio autenticado de Wells Prep.' });
}
