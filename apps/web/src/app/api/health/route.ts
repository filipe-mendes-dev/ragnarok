export async function GET() {
    return Response.json(
        {
            status: 'ok',
            service: 'web',
        },
        { status: 200 },
    );
}
