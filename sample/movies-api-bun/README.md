# Movies API Bun

> Appweaver sample - Movies database API running on Bun

A public movie catalogue in the spirit of IMDb or TMDB, running on the [Bun](https://bun.sh) runtime: movies with
their cast and crew, filmographies, member reviews keeping the movie ratings up to date, private watchlists, and a
nightly trending score. It also shows how a frontend consumes the API through a generated, fully typed client, and how
a movie page stays live: a chat of the viewers, the new reviews and the watchlist of a member pushed over a WebSocket or
Server-Sent Events.

## What it showcases

| Feature                                                                           | Where                                                                                      |
|-----------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------|
| Bun runtime: libsql SQLite adapter, `bun test`, seeders and tests run TypeScript  | [`package.json`](package.json), [`bunfig.toml`](bunfig.toml)                               |
| Short `nanoid()` string ids for movies                                            | [`resources/movie/model.ts`](src/resources/movie/model.ts)                                 |
| A join model carrying data (`Credit`: role, character, billing order)             | [`resources/credit/model.ts`](src/resources/credit/model.ts)                               |
| Nested relation output: a movie with its credits and people, a person with movies | movie and person models                                                                    |
| Many-to-many connect-or-create by a unique key (genres by slug)                   | [`resources/movie/model.ts`](src/resources/movie/model.ts)                                 |
| A read heavy public API: cached routes, rate limiting, public aggregates          | [`resources/movie/routes.ts`](src/resources/movie/routes.ts)                               |
| **Role** based access (Admin, Curator, Member)                                    | [`features/access/roles.ts`](src/features/access/roles.ts)                                 |
| Service hooks keeping a denormalized rating on the movie                          | [`resources/review/service.ts`](src/resources/review/service.ts)                           |
| Author privacy on public data (a display name snapshot, no account relation)      | [`resources/review/model.ts`](src/resources/review/model.ts)                               |
| Private per-user data through read and write restrictions                         | [`resources/watchlist-entry/policy.ts`](src/resources/watchlist-entry/policy.ts)           |
| Image processing of posters, stills (array files), and profile photos             | movie and person models                                                                    |
| Virtual fields (`year`, `runtime`, `age`)                                         | movie and person models                                                                    |
| A scheduled job and its on-demand route (trending scores)                         | [`features/trending/`](src/features/trending/trending-job.ts)                              |
| A custom public route returning resource models (similar movies)                  | [`features/catalog/similar-movies-route.ts`](src/features/catalog/similar-movies-route.ts) |
| OAuth2 sign-up (GitHub, Google) with `registrationData` and the provider avatar   | [`resources/user/service.ts`](src/resources/user/service.ts)                               |
| OpenAPI export and a generated typed client with an example script                | [`client/`](client/example.ts)                                                             |
| A live chat of a movie page: public channels, a member action with a result       | [`features/live-chat/`](src/features/live-chat/chat-actions.ts)                            |
| A fire-and-forget action (the typing indicator)                                   | [`features/live-chat/chat-actions.ts`](src/features/live-chat/chat-actions.ts)             |
| Public resource events with a subscription filter (the new reviews)               | [`resources/review/routes.ts`](src/resources/review/routes.ts)                             |
| Private resource events delivered by the policy (the watchlist of a member)       | [`resources/watchlist-entry/routes.ts`](src/resources/watchlist-entry/routes.ts)           |
| Realtime client: an anonymous visitor over SSE, a member over a WebSocket         | [`client/realtime-example.ts`](client/realtime-example.ts)                                 |
| Redis-free setup with no queue and no mailer                                      | [`appweaver.json`](appweaver.json)                                                         |

## Getting started

Build the monorepo once from the repository root (`npm install && npm run build`), then in this directory:

```bash
cp .env.example .env   # NODE_ENV=dev, for the development configuration
bun weaver migrate     # create the SQLite database in ./data
bun run seed         # roles, the admin, ten movies with their cast and crew, and three members
bun run dev          # http://localhost:5005, Swagger UI at http://localhost:5005/swagger
```

The seeder prints the generated admin password (`admin@appweaver.co`, an Admin and a Curator). The demo members
`cinephile42@movies.example.com`, `nightowl@movies.example.com`, and `popcorn.critic@movies.example.com` sign in with
`Passw0rd!`.

### Signing up with GitHub or Google

Members normally sign up through OAuth2. Register an OAuth app with the provider, using
`http://localhost:5005/auth/login/github/callback` as the callback URL, and set in `.env`:

```dotenv
SECURITY_OAUTH2_GITHUB_ENABLED=true
SECURITY_OAUTH2_GITHUB_CLIENT_ID=...
SECURITY_OAUTH2_GITHUB_CLIENT_SECRET=...
```

Then open `http://localhost:5005/auth/login/github?redirectToUrl=http://localhost:3000` in a browser. A new member
gets the `Member` role, their provider name as the display name, and their provider avatar.

## Try it out

```bash
# The catalog needs no account: the best rated science fiction since 2015
curl -s localhost:5005/api/movies/query -H 'content-type: application/json' -d '{
  "filter": { "genres": { "_some": { "slug": "science-fiction" } }, "releaseDate": { "_gte": "2015-01-01T00:00:00.000Z" } },
  "sort": "-rating", "size": 5
}' | jq '.items[] | {title, year, rating, runtime}'

# What is trending, and a text search
curl -s localhost:5005/api/movies/query -H 'content-type: application/json' -d '{"sort":"-trendingScore","size":3}' | jq '.items[].title'
curl -s localhost:5005/api/movies/query -H 'content-type: application/json' -d '{"filter":{"searchText":"dune"}}' | jq '.items[].title'

# A movie with its cast and crew, and the movies similar to it
curl -s localhost:5005/api/movies/<id> | jq '{title, credits: [.credits[] | {role, name: .person.name, character}]}'
curl -s "localhost:5005/api/movies/<id>/similar?limit=3" | jq '.items[].title'

# A member reviews a movie, and its rating follows
TOKEN=$(curl -s localhost:5005/auth/login -H 'content-type: application/json' \
  -d '{"username":"nightowl@movies.example.com","password":"Passw0rd!"}' | jq -r .accessToken)
curl -s localhost:5005/api/reviews -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"movie":"<id>","rating":9,"title":"Still thinking about it"}' | jq '{authorName, rating}'
curl -s localhost:5005/api/movies/<id> | jq '{rating, ratingCount}'
```

## The typed client

The [`client/`](client) directory holds a client generated from the OpenAPI document of this API, and an example using
it. With the API running:

```bash
bun run client:example
```

After changing a model or a route, export the document and generate the client again:

```bash
bun run openapi           # writes client/openapi.json
bun run client:generate   # writes client/generated/movies-client.ts
```

## Live updates

The [`@appweaver/realtime`](https://www.npmjs.com/package/@appweaver/realtime) module pushes events over a WebSocket or
Server-Sent Events, both at `/api/realtime`, and the generated client speaks them as `client.realtime`. A movie page
uses three kinds of them:

| What                       | Kind                                           | Who                                          |
|----------------------------|------------------------------------------------|----------------------------------------------|
| `movie.chat`               | Channel, by `movieId`                          | Anyone reads, signed-in members send         |
| `movie.typing`             | Channel, by `movieId`                          | Anyone reads, members emit (fire-and-forget) |
| `chat.send`, `chat.typing` | Actions                                        | Signed-in members                            |
| `resource:Review.create`   | Resource events, filtered i.e. by `rating`     | Anyone, like the reviews                     |
| `resource:WatchlistEntry`  | Resource events (`create`, `update`, `delete`) | The owner of the entry only, by its policy   |

The chat stores nothing: a viewer sees the messages sent while connected, like at a premiere screening. Visitors
without an account connect anonymously, allowed by `realtime.anonymousEnabled` in [`appweaver.json`](appweaver.json)
(at most 5 anonymous connections per IP), and only to the public parts. With the API running and seeded:

```bash
bun run client:realtime
```

```text
Visitor on the page of Arrival, over sse
Member connected over websocket
[member] Message 0a40df19-... sent at 2026-11-17T11:23:50.372Z
[visitor] nightowl is typing...
[visitor] nightowl: Rewatching it tonight, that score still gets me
[member] Not sent: Movie not found
[member] Watchlist update: Arrival (Watching)
```

Without the client, a ticket opens a connection of a user, as a browser cannot send the `Authorization` header with an
`EventSource` or a `WebSocket`:

```bash
# Follow the chat of a movie as a visitor, without a ticket
curl -N "localhost:5005/api/realtime/events?subscriptions=%5B%7B%22id%22%3A%22chat%22%2C%22channel%22%3A%22movie.chat%22%2C%22params%22%3A%7B%22movieId%22%3A%22<id>%22%7D%7D%5D"

# In another terminal, a member sends a message over HTTP
curl -s localhost:5005/api/realtime/actions/chat.send -H "authorization: Bearer $TOKEN"   -H 'content-type: application/json' -d '{"movieId":"<id>","text":"Hello from curl"}'

# A ticket for a connection of the member, valid 30 seconds and used once
curl -s -X POST localhost:5005/api/realtime/ticket -H "authorization: Bearer $TOKEN" | jq -r .ticket
```

## Tests

```bash
bun run test   # unit tests
bun run e2e    # end-to-end tests against a temporary SQLite database
```

Bun runs every test file in one process, and an application context is frozen once an application starts, so the
end-to-end files share one application ([`test/e2e/support/app.ts`](test/e2e/support/app.ts)) and keep their data
apart instead of resetting the database between files.

## License

UNLICENSED
