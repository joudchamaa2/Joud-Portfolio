import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'

export function testQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })
}

/**
 * Renders `element` at `path` (pattern) inside a memory router and a fresh
 * QueryClient. Extra routes let tests assert on redirects.
 */
export function renderRoute(
  element: ReactNode,
  { path = '/', url = path, extraRoutes = [], wrapper }: { path?: string; url?: string; extraRoutes?: RouteObject[]; wrapper?: (children: ReactNode) => ReactNode } = {},
) {
  const router = createMemoryRouter([{ path, element }, ...extraRoutes], { initialEntries: [url] })
  const client = testQueryClient()
  const tree = <RouterProvider router={router} />
  const utils = render(<QueryClientProvider client={client}>{wrapper ? wrapper(tree) : tree}</QueryClientProvider>)
  return { ...utils, router, client }
}
