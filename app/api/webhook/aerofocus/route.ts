/** This application runs Express, not a second Next.js webhook backend. */
const retired = () => Response.json({ error: 'Utiliza el servicio autenticado de Wells Prep.' }, { status: 410 });
export const GET = retired;
export const POST = retired;
export const OPTIONS = retired;
