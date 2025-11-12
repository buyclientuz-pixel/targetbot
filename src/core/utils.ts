import { v4 as uuid } from 'uuid';

export async function parseJSON<T>(request: Request): Promise<T> {
  const text = await request.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Response('Invalid JSON body', { status: 400 });
  }
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    },
    ...init
  });
}

export function notFound(message = 'Not Found'): Response {
  return json({ error: message }, { status: 404 });
}

export function requireAdminKey(request: Request, adminKey?: string): void {
  if (!adminKey) {
    throw new Response('Admin key not configured', { status: 500 });
  }
  const url = new URL(request.url);
  const provided = request.headers.get('x-auth-key') ?? url.searchParams.get('key');
  if (provided !== adminKey) {
    throw new Response('Unauthorized', { status: 401 });
  }
}

export function generateId(prefix: string): string {
  return `${prefix}:${uuid()}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}
