export interface ApiResponse<T = unknown> {
  data: T;
  status: number;
  headers: Headers;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const detail = typeof data === 'object' && data && 'error' in data
      ? String((data as { error?: unknown }).error || response.statusText)
      : response.statusText || `HTTP ${response.status}`;
    throw new Error(detail);
  }

  return {
    data: data as T,
    status: response.status,
    headers: response.headers,
  };
}

export const api = {
  get<T = unknown>(path: string): Promise<ApiResponse<T>> {
    return request<T>('GET', path);
  },
  post<T = unknown>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return request<T>('POST', path, body);
  },
  put<T = unknown>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return request<T>('PUT', path, body);
  },
  delete<T = unknown>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return request<T>('DELETE', path, body);
  },
};
