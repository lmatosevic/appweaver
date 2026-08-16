/** Builds a JSON `Response` the way an OAuth2 provider's user info endpoint would. */
export const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });

/**
 * Replaces the global `fetch` with a mock resolving the given JSON bodies in order. A single body is returned for
 * every call, which keeps single-request providers simple.
 *
 * @param {...unknown} bodies - The JSON bodies to resolve, one per consecutive call.
 * @return {jest.SpyInstance} The installed `fetch` spy, for asserting on the requests made.
 */
export function mockUserInfoResponse(...bodies: unknown[]) {
  const fetchMock = jest.spyOn(globalThis, 'fetch');

  if (bodies.length === 1) {
    // A `Response` body can only be read once, so build a fresh one per call
    fetchMock.mockImplementation(async () => jsonResponse(bodies[0]));
  } else {
    for (const body of bodies) {
      fetchMock.mockResolvedValueOnce(jsonResponse(body));
    }
  }

  return fetchMock;
}
