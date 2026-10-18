# CMS API

> Appweaver sample - Content Management System API with posts, pages, categories, tags and comments

The reference sample of the framework: a blog backend with authors writing posts in a category tree, tagged and
scheduled for publishing, static pages for the site menu, and comments open to guest readers.

## What it showcases

| Feature                                                                               | Where                                                                                    |
|---------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------|
| Auth model with sign-up assigning the `User` role, an avatar, and a virtual `byline`  | [`resources/user/`](src/resources/user/model.ts)                                         |
| Self-relation for the category tree, with the breadcrumb included in every post       | [`resources/category/model.ts`](src/resources/category/model.ts)                         |
| Many-to-many tags matched by slug, so an existing tag is reused instead of duplicated | [`resources/post/model.ts`](src/resources/post/model.ts)                                 |
| One-to-one pinned comment, comments with `cuid(2)` ids                                | [`resources/comment/model.ts`](src/resources/comment/model.ts)                           |
| Soft delete of posts and comments                                                     | `softDelete` on the post and comment models                                              |
| File uploads: public cover, gallery and hero images, resized on upload                | post, page, and user models and policies                                                 |
| Write restrictions assigning the signed-in author on create                           | [`resources/post/policy.ts`](src/resources/post/policy.ts)                               |
| Service hooks: publish date on publishing, view counter, self-parent check            | [`resources/post/service.ts`](src/resources/post/service.ts)                             |
| Text search over several fields of a resource                                         | `textSearch` of the services                                                             |
| Public routes, per-route roles, response caching, and rate limited guest comments     | [`resources/*/routes.ts`](src/resources/comment/routes.ts)                               |
| Bulk create, update, and delete routes for tags                                       | [`resources/tag/routes.ts`](src/resources/tag/routes.ts)                                 |
| CSV export with renamed, mapped, and excluded columns                                 | `export` of the post model                                                               |
| Custom route with its own response model                                              | [`features/publisher/publish-route.ts`](src/features/publisher/publish-route.ts)         |
| Scheduled job publishing the posts whose publish date has passed                      | [`features/publisher/publish-scheduler.ts`](src/features/publisher/publish-scheduler.ts) |
| Localized HTML page and an XML export for an external integration, from templates     | [`features/syndication/`](src/features/syndication/syndication-routes.ts)                |
| Localized email sent on demand, and the account email templates translated to Croatian | [`templates/emails/`](templates/emails), [`locales/hr.json`](locales/hr.json)            |
| Template preview route of the development environment (`/templates/<name>?<data>`)    | `template.preview` of the `dev` environment in [`appweaver.json`](appweaver.json)        |
| Translated default value stored by a service hook                                     | [`resources/category/service.ts`](src/resources/category/service.ts)                     |
| Fastify plugin logging every request                                                  | [`plugins/request-logger.ts`](src/plugins/request-logger.ts)                             |
| Basic, API key, Google OAuth2, and reCAPTCHA security, all in a single config file    | [`appweaver.json`](appweaver.json)                                                       |

## Getting started

Build the monorepo once from the repository root (`npm install && npm run build`), then in this directory:

```bash
cp .env.example .env      # NODE_ENV=dev, for the development configuration
docker compose up -d redis
npm run migrate           # create the SQLite database in ./data
npm run seed              # roles, the admin, and demo content
npm run dev               # http://localhost:5001, Swagger UI at http://localhost:5001/swagger
```

The seeder prints the generated admin password (`admin@appweaver.co`), unless `SYSTEM_ADMIN_INITIAL_PASSWORD` is set.

## Try it out

```bash
TOKEN=$(curl -s localhost:5001/auth/login -H 'content-type: application/json' \
  -d '{"username":"admin@appweaver.co","password":"<admin-password>"}' | jq -r .accessToken)

# Anyone can search the published posts, each with its category
curl -s localhost:5001/api/posts/query -H 'content-type: application/json' \
  -d '{"filter":{"status":{"_eq":"Published"},"searchText":"trail"}}' | jq '.items[] | {title, category: .category.name}'

# A signed-in author writes a dated draft, reusing the existing "hiking" tag and creating a new one
curl -s localhost:5001/api/posts -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"title":"Mountain huts","slug":"mountain-huts","publishedAt":"2026-01-01T00:00:00.000Z",
       "tags":[{"name":"Hiking","slug":"hiking"},{"name":"Huts","slug":"huts"}]}' \
  | jq '{id, status, author: .author.byline, tags: [.tags[] | {id, slug}]}'

# Publish the drafts whose date has passed, without waiting for the scheduled job
curl -s localhost:5001/api/publish-posts -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -H 'x-my-custom-header: demo' -d '{}' | jq .published

# The published post as an HTML page, in Croatian, and every published post as an XML document
curl -s 'localhost:5001/api/posts/<slug>/page?locale=hr'
curl -s localhost:5001/api/posts/export/xml -H "authorization: Bearer $TOKEN"

# Email a post to a reader, in Croatian, through the SMTP server of the mailer config
curl -s localhost:5001/api/posts/<slug>/share -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"email":"reader@example.com","locale":"hr"}'

# Guests can comment, five times a minute
curl -s localhost:5001/api/comments -H 'content-type: application/json' \
  -d '{"body":"Great read!","guestName":"Ana","post":1}' | jq '{id, status}'
```

## Tests

```bash
npm run test  # unit tests
npm run e2e   # end-to-end tests against a temporary SQLite database (build the sample first)
```

The end-to-end tests replace Redis, the queue, and the mailer by in-memory implementations (see the `test`
environment of [`appweaver.json`](appweaver.json)).

## License

UNLICENSED
