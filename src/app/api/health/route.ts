export const runtime = 'nodejs';
export async function GET() {
  return Response.json(
    { status: 'ok', version: '1.0.0', kind: 'liveness' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
