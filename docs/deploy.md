# Deploying Squall

Squall is a fully static site: `npm run generate && npm run build` writes everything to `dist/`, including the generated data in `dist/data/`. Any static host works. It needs two things:

1. **A fallback to `index.html`** for app routes, so a deep link such as `/runs/g-injection?step=13` loads the app instead of a 404.
2. **The right base path** if the site is not served from the domain root. Set `BASE_PATH` at build time (for example `BASE_PATH=/squall/`). The router, the asset URLs and the data loader all follow it.

The generated data is deterministic, so building on the host gives byte-identical files to building locally.

## Vercel (recommended)

`vercel.json` holds the whole setup. Import the repository in Vercel and deploy; there is nothing to configure in the dashboard. The live preview runs this way at https://squall-zeta.vercel.app.

- Build command: `npm run generate && npm run build`. Output: `dist`.
- Every path except `/assets/*`, `/data/*`, the favicon and `robots.txt` falls back to `index.html`.
- Hashed files in `/assets/` are cached for a year (their names change when their content does). Data files are cached for an hour and revalidated, since their names stay the same across releases.

## GitHub Pages

`.github/workflows/pages.yml` builds with `BASE_PATH=/<repo-name>/` and copies `index.html` to `404.html`. Pages has no rewrite rules, so its 404 page doubles as the fallback. To use it:

1. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Run **Deploy to GitHub Pages** from the **Actions** tab.

To build the same thing locally:

```bash
npm run generate
```

```bash
BASE_PATH=/squall/ npm run build && cp dist/index.html dist/404.html
```

## Your own server (nginx)

Copy `dist/` to the server, for example to `/var/www/squall`, and use a server block like this:

```nginx
server {
    listen 80;
    server_name squall.example.com;
    root /var/www/squall;

    # Compress the JSON: runs.json is about 5 MB raw and about 220 KB gzipped.
    gzip on;
    gzip_types application/json application/javascript text/css image/svg+xml;

    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }

    location /data/ {
        add_header Cache-Control "public, max-age=3600, must-revalidate";
        try_files $uri =404;
    }

    # Everything else is an app route: serve the file if it exists, otherwise the app.
    location / {
        try_files $uri /index.html;
    }
}
```

Add TLS with your usual tool (for example certbot). To serve from a subpath instead of a subdomain, build with `BASE_PATH=/squall/` and put the same rules inside a `location /squall/` block with `alias` instead of `root`.

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and on pull requests: format check, typecheck, lint, the test suite, and the brief's acceptance check (`npm run generate && npm run build`). It uses Node 22; locally, Node 20.19 or newer works.
