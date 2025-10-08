awesome—let’s go deep. if you want a React-level experience for a blog without a SPA, htmx lets you build it “hypermedia-first”: the server renders HTML (full pages or fragments), and the client swaps them in with tiny, declarative attributes. you get interactivity, URL updates, and stateful flows—without a client state machine, bundlers, hydration, or API DTOs.

below is a practical, end-to-end blueprint tailored for a Python stack (Flask examples), plus patterns you can port to Django/FastAPI.

# why htmx vs React for a blog

* **mental model:** HTML is your API. Instead of JSON → client VM → virtual DOM, htmx requests server-rendered partials and swaps them into the DOM.
* **perf:** no hydration; first byte to interactive is fast. (great for SEO and Core Web Vitals)
* **complexity:** fewer moving parts (no router, state mgmt, build chain). Use your server framework, templates, and HTMX attributes.
* **progressive enhancement:** everything should work with plain links/forms; htmx makes it nicer.
* **tradeoffs:** no client-side global state lib (usually fine for a blog); complex offline needs or heavy client logic still point to a SPA or to “islands”/Web Components embedded into pages.

# htmx crash course (90 seconds)

Key attributes you’ll use a lot:

* `hx-get="/path"` / `hx-post="/path"` – fetch fragments
* `hx-target="#selector"` – where to insert response
* `hx-swap="innerHTML|outerHTML|beforeend|afterbegin|morph"` – how to insert
* `hx-trigger="click, changed, keyup delay:300ms, revealed"` – when to fire
* `hx-push-url="true|/new-url"` – updates the address bar + history
* `hx-boost="true"` – make normal links/forms load via AJAX automatically
* `hx-vals='{ "k":"v" }'` – send extra data
* `hx-headers='{"X-CSRFToken":"..."}'` – custom headers (CSRF)
* out-of-band swaps: mark a fragment with `hx-swap-oob="true"` so it updates somewhere else (e.g., a notification badge)
* events: listen for `htmx:afterSwap`,`htmx:responseError` on `document`

Optional: **hyperscript** gives you tiny inline behaviors (modal toggles, focus), but you can also stick with plain JS.

---

# architecture for a blog

**Server:** Flask (or Django/FastAPI) + Jinja2
**Templates:** full-page templates + partials (components)
**Data:** Posts, Tags, Comments, Users
**UX goals:** fast nav, instant pagination, live search, inline admin actions, comments with validation, CSRF, SEO-friendly routes.

### directory layout

```
blog/
  app.py
  models.py
  forms.py
  db.py
  requirements.txt
  templates/
    base.html
    posts/
      index.html          # full page
      _list.html          # partial list of posts
      _item.html          # single post item partial
      show.html           # full page for a post
      _comments.html      # comments list partial
      _comment_form.html  # comment form partial
      _paginator.html     # pagination controls partial
    admin/
      index.html
      _post_row.html
  static/
    css/ ...
    js/  (optional small sprinkles)
```

---

# minimal Flask setup

```python
# app.py
from flask import Flask, render_template, request, redirect, url_for, abort, make_response
from db import get_post, list_posts, create_comment, search_posts, page_of
from forms import CommentForm
from datetime import datetime

app = Flask(__name__)
app.secret_key = "replace-me"  # for CSRF if you use WTForms/Flask-WTF

def is_htmx():
    return request.headers.get("HX-Request") == "true"

@app.get("/")
def home():
    page = int(request.args.get("page", 1))
    posts, meta = list_posts(page=page, per_page=10)
    if is_htmx():
        return render_template("posts/_list.html", posts=posts, meta=meta)
    return render_template("posts/index.html", posts=posts, meta=meta)

@app.get("/posts/<slug>")
def show_post(slug):
    post = get_post(slug) or abort(404)
    if is_htmx():
        # return just the core content as a fragment
        return render_template("posts/_item.html", post=post)
    return render_template("posts/show.html", post=post)

@app.get("/search")
def search():
    q = request.args.get("q", "")
    page = int(request.args.get("page", 1))
    results, meta = search_posts(q, page=page, per_page=10)
    tmpl = "posts/_list.html" if is_htmx() else "posts/index.html"
    return render_template(tmpl, posts=results, meta=meta, q=q)

@app.post("/posts/<slug>/comments")
def add_comment(slug):
    form = CommentForm(request.form)
    if form.validate():
        create_comment(slug, form.name.data, form.body.data, datetime.utcnow())
        # respond with the updated comments fragment
        res = make_response(render_template("posts/_comments.html", slug=slug))
        # optional: out-of-band update a global flash area
        return res
    # invalid → return just the form with errors
    return render_template("posts/_comment_form.html", form=form, slug=slug), 400

if __name__ == "__main__":
    app.run(debug=True)
```

---

# base template + htmx wiring

```html
<!-- templates/base.html -->
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>{% block title %}My Blog{% endblock %}</title>
  <link rel="stylesheet" href="{{ url_for('static', filename='css/site.css') }}">
  <script src="https://unpkg.com/htmx.org@1.9.12" defer></script>
</head>
<body hx-boost="true">
  <header>
    <a href="{{ url_for('home') }}">My Blog</a>
    <form action="{{ url_for('search') }}" method="get"
          hx-get="{{ url_for('search') }}" hx-trigger="keyup changed delay:300ms"
          hx-target="#content" hx-push-url="true">
      <input type="search" name="q" placeholder="Search posts…" autocomplete="off">
    </form>
  </header>

  <main id="content">
    {% block content %}{% endblock %}
  </main>

  <div id="flash" aria-live="polite"></div>

  <script>
    // optional: focus management + error handling
    document.addEventListener('htmx:afterSwap', (e) => {
      const first = e.target.querySelector('[autofocus]');
      if (first) first.focus();
    });
    document.addEventListener('htmx:responseError', (e) => {
      console.error('htmx error', e.detail.xhr.status, e.detail.xhr.responseText);
    });
  </script>
</body>
</html>
```

---

# list page + partials

```html
<!-- templates/posts/index.html -->
{% extends "base.html" %}
{% block title %}My Blog{% endblock %}
{% block content %}
  <div id="post-list">
    {% include "posts/_list.html" %}
  </div>
{% endblock %}
```

```html
<!-- templates/posts/_list.html -->
<ul class="posts">
  {% for post in posts %}
    <li>
      <a href="{{ url_for('show_post', slug=post.slug) }}"
         hx-get="{{ url_for('show_post', slug=post.slug) }}"
         hx-target="#content" hx-push-url="true">
        {{ post.title }}
      </a>
      <small>{{ post.published_at.strftime('%b %d, %Y') }}</small>
    </li>
  {% endfor %}
</ul>

{% include "posts/_paginator.html" %}
```

```html
<!-- templates/posts/_paginator.html -->
<nav class="pager" aria-label="Pagination"
     hx-boost="true" hx-target="#content" hx-push-url="true">
  {% if meta.prev %}
    <a href="?page={{ meta.prev }}">← Newer</a>
  {% endif %}
  <span>Page {{ meta.page }} of {{ meta.pages }}</span>
  {% if meta.next %}
    <a href="?page={{ meta.next }}">Older →</a>
  {% endif %}
</nav>
```

---

# show post + comments (fragments)

```html
<!-- templates/posts/show.html -->
{% extends "base.html" %}
{% block title %}{{ post.title }} - My Blog{% endblock %}
{% block content %}
  {% include "posts/_item.html" %}
  {% include "posts/_comments.html" %}
{% endblock %}
```

```html
<!-- templates/posts/_item.html -->
<article>
  <h1>{{ post.title }}</h1>
  <p class="meta">
    {{ post.published_at.strftime('%B %d, %Y') }} · {{ post.reading_time }} min read
  </p>
  <div class="body">{{ post.html|safe }}</div>
  <p class="tags">
    {% for t in post.tags %}
      <a href="{{ url_for('search') }}?q=tag:{{ t }}"
         hx-get="{{ url_for('search') }}?q=tag:{{ t }}"
         hx-target="#content" hx-push-url="true">#{{ t }}</a>
    {% endfor %}
  </p>
</article>
```

```html
<!-- templates/posts/_comments.html -->
<section id="comments" aria-label="Comments"
         hx-get="{{ url_for('show_post', slug=slug) }}#comments"
         hx-trigger="revealed">  <!-- lazy load when visible -->
  <h2>Comments</h2>
  <div>
    {% for c in get_comments(slug) %}
      <div class="comment">
        <strong>{{ c.name }}</strong>
        <small>{{ c.created_at.strftime('%Y-%m-%d %H:%M') }}</small>
        <p>{{ c.body }}</p>
      </div>
    {% endfor %}
  </div>
  {% include "posts/_comment_form.html" %}
</section>
```

```html
<!-- templates/posts/_comment_form.html -->
<form hx-post="{{ url_for('add_comment', slug=slug) }}"
      hx-target="#comments" hx-swap="outerHTML">
  {{ form.csrf_token }}
  <label>Name {{ form.name }}</label>
  <label>Comment {{ form.body }}</label>
  <button type="submit">Add comment</button>
  {% if form.errors %}
    <ul class="errors">
      {% for field, errs in form.errors.items() %}
        {% for e in errs %}<li>{{ e }}</li>{% endfor %}
      {% endfor %}
    </ul>
  {% endif %}
</form>
```

> Note the form posts back a **fragment** that replaces the entire `#comments` block via `hx-swap="outerHTML"`—clean and optimistic.

---

# common patterns you’ll want

### 1) “Load more” infinite pagination

```html
<div id="post-list">
  {% include "posts/_list.html" %}
  {% if meta.next %}
    <button
      hx-get="?page={{ meta.next }}"
      hx-target="#post-list"
      hx-swap="beforeend"
      hx-select=".posts > li"  <!-- take only the new <li>s -->
      hx-indicator="#spinner">Load more</button>
  {% endif %}
</div>
<div id="spinner" class="htmx-indicator">Loading…</div>
```

### 2) Live search (already in header)

`hx-trigger="keyup delay:300ms"` debounces; `hx-push-url="true"` keeps it linkable/back-button-friendly.

### 3) Inline admin actions

```html
<tr id="post-{{ p.id }}">
  <td>{{ p.title }}</td>
  <td>
    <button hx-delete="/admin/posts/{{ p.id }}"
            hx-target="#post-{{ p.id }}" hx-swap="outerHTML">Delete</button>
  </td>
</tr>
```

### 4) OOB updates

Return in your response:

```html
<div id="flash" hx-swap-oob="true">Post deleted</div>
```

It updates `#flash` while also swapping the target elsewhere.

### 5) Modal pattern

* `hx-get="/posts/new" hx-target="#modal .content" hx-trigger="click"`.
* Server returns just the form; submit with `hx-post` and swap modal or close via small JS.

---

# server concerns (prod-grade)

### CSRF

* Use Flask-WTF or your framework’s CSRF. For htmx, include a header or hidden input:

  * Hidden input is automatic if your form is server-rendered.
  * Or set a header globally:

    ```js
    document.body.addEventListener('htmx:configRequest', (e) => {
      const token = getCsrfTokenFromCookie(); // your impl
      e.detail.headers['X-CSRFToken'] = token;
    });
    ```
* Validate on the server as usual.

### Caching + ETags

* Blog content is cache-friendly. Send `ETag`/`Last-Modified` on fragments too. If `If-None-Match` hits, return 304 and htmx won’t swap.
* Reverse proxy (nginx, Cloudflare) can cache HTML fragments if you make URLs stable (e.g., `/posts/_list?page=2`).

### Content negotiation for fragments

* We used `HX-Request` detection to return fragments when appropriate. You can also accept `HX-Boosted` to treat boosted links specially.

### SEO

* Full URLs render full HTML when JS is off ⇒ crawlers love it.
* Use canonical tags on list pages with pagination; render meta tags server-side.

### Accessibility

* Maintain `aria-live` regions for injected content (e.g., flash).
* Manage focus after swaps (example in base template).
* Ensure landmarks and headings don’t shift drastically with partial swaps.

### Security

* Validate IDs/slug exists; handle 404s with full pages and fragment fallbacks.
* Rate-limit comment POSTs; sanitize markdown on the server; use CSP.

---

# data model sketch

```sql
posts(id, slug unique, title, md_body, html_body, published_at, status, author_id)
tags(id, name unique)
post_tags(post_id, tag_id)
comments(id, post_id, name, body, created_at, is_approved)
users(id, email unique, password_hash, role)
```

* Render markdown to sanitized HTML at write-time for speed (store `html_body`).
* Add `reading_time` derived column or compute on render.

---

# testing

* **Server:** pytest your route handlers returning correct templates and partials. Check `HX-Request` variations.
* **Browser:** Playwright/Cypress smoke tests: pagination, show post, add comment. Assert DOM swaps occur and URL updates.

---

# performance tips

* Ship htmx (~14KB) + optional `hyperscript` (if you want tiny client behaviors).
* Avoid giant base template partial swaps—target small containers.
* Use `hx-select` to pick only the bits you need from a larger response.
* Preload critical CSS; defer everything else.

---

# migration from React

1. Keep routes + templates for the **index** and **post** pages; render initial full HTML.
2. Replace client routing with `<a hx-get … hx-push-url="true">`.
3. Convert API JSON endpoints into **HTML fragment endpoints** returning Jinja partials.
4. Peel off components gradually: comments, search, admin tables → htmx.
5. Remove hydration and client store; keep tiny sprinkles where needed.

---

# variants & extensions

* **Django:** Use `django-htmx` helper (adds `request.htmx`), Django’s CSRF is straightforward.
* **FastAPI/Starlette:** Render Jinja templates; same ideas. (Add CSRf via middleware or form token.)
* **Live updates:** Use Server-Sent Events or websockets adapters with htmx (`hx-ext="sse"`). A comments count badge can auto-update.
* **Islands when needed:** Drop a small React/Preact component for a truly dynamic widget inside a largely htmx site (no need for a router).

---

# quick checklist

* [ ] Full page routes render without JS
* [ ] Partials for lists/items/forms
* [ ] `hx-boost` globally, `hx-push-url` where appropriate
* [ ] CSRF integrated for POST/DELETE
* [ ] Paginator supports standard links + htmx swaps
* [ ] 404/500 templates work for both full and partial requests
* [ ] Basic Playwright tests

---

if you want, i can spin this into a runnable starter (Flask or Django) with a couple of sample posts, htmx wiring, tests, and a tiny admin—just say Flask or Django and any preferences (DB, auth, CSS).



---


---


Perfect—here’s a tight, production-grade FastAPI/Starlette recipe for an htmx-powered blog using **server-rendered Jinja templates**, **fragment vs full rendering**, and **CSRF** (double-submit cookie or session-backed). I’ll focus on patterns you can lift into your app, not just a toy snippet.

---

# Project layout

```
htmx_blog/
  app.py
  deps.py
  models.py
  views_posts.py
  views_comments.py
  templates/
    base.html
    posts/
      index.html
      _list.html
      _item.html
      show.html
      _paginator.html
      _comments.html
      _comment_form.html
  static/
    css/site.css
```

---

# App bootstrap (FastAPI + Starlette bits)

```python
# app.py
from datetime import datetime
from fastapi import FastAPI, Request, Response
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
from starlette.responses import HTMLResponse, PlainTextResponse
from starlette.templating import Jinja2Templates

from deps import is_htmx, get_csrf_token
from views_posts import router as posts_router
from views_comments import router as comments_router
from csrf import CSRFMiddleware  # shown below

app = FastAPI()

# Static & templates
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Session cookie (for CSRF option #2)
app.add_middleware(SessionMiddleware, secret_key="replace-me-with-32B-secret")

# CSRF – choose ONE:
# 1) Double-submit cookie (stateless) – simpler with htmx
from csrf import DoubleSubmitCSRFMiddleware
app.add_middleware(DoubleSubmitCSRFMiddleware, cookie_name="csrftoken", header_name="X-CSRFToken")

# 2) Or session-backed CSRF (comment out the one above and use this instead)
# app.add_middleware(CSRFMiddleware, session_key="csrf_token", header_name="X-CSRFToken")

# Routers
app.include_router(posts_router)
app.include_router(comments_router)

@app.get("/health", response_class=PlainTextResponse)
def health():
    return "ok"
```

---

# CSRF middleware (two approaches)

### Option A: **Double-submit cookie** (stateless; great with htmx)

* On **GET**, set a signed/random `csrftoken` cookie if missing.
* On **unsafe** methods (POST/PUT/PATCH/DELETE), require a matching header or form field: `X-CSRFToken` **equals** cookie value.
* Works across fragments and full loads; no server session required.

```python
# csrf.py
import secrets
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send
from starlette.responses import Response
from starlette.requests import Request

SAFE = {"GET", "HEAD", "OPTIONS"}

class DoubleSubmitCSRFMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp, cookie_name="csrftoken", header_name="X-CSRFToken", cookie_params=None):
        super().__init__(app)
        self.cookie_name = cookie_name
        self.header_name = header_name
        self.cookie_params = cookie_params or dict(
            path="/", httponly=False, samesite="lax", secure=False  # set secure=True in prod
        )

    async def dispatch(self, request: Request, call_next):
        # Ensure token cookie on safe methods
        token = request.cookies.get(self.cookie_name)
        if request.method in SAFE:
            if not token:
                token = secrets.token_urlsafe(32)
                response: Response = await call_next(request)
                response.set_cookie(self.cookie_name, token, **self.cookie_params)
                return response
            return await call_next(request)

        # Validate on unsafe methods
        cookie_token = token
        header_token = request.headers.get(self.header_name) or request.form().get(self.header_name) if request.headers.get("content-type", "").startswith("application/x-www-form-urlencoded") else None
        if not cookie_token or not header_token or cookie_token != header_token:
            return Response("CSRF validation failed", status_code=403)
        return await call_next(request)
```

### Option B: **Session-backed CSRF** (more traditional)

* On GET, generate token → store in `request.session["csrf_token"]` → also expose to templates.
* On unsafe methods, require header or form token equals session value.

```python
# csrf.py (second middleware)
class CSRFMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp, session_key="csrf_token", header_name="X-CSRFToken"):
        super().__init__(app)
        self.session_key = session_key
        self.header_name = header_name

    async def dispatch(self, request: Request, call_next):
        if request.method == "GET":
            if not request.session.get(self.session_key):
                import secrets
                request.session[self.session_key] = secrets.token_urlsafe(32)
            response: Response = await call_next(request)
            return response

        if request.method not in SAFE:
            sent = request.headers.get(self.header_name)
            sess = request.session.get(self.session_key)
            if not sent or not sess or sent != sess:
                return Response("CSRF validation failed", status_code=403)
        return await call_next(request)
```

---

# htmx helpers & DI

```python
# deps.py
from fastapi import Request

def is_htmx(request: Request) -> bool:
    return request.headers.get("HX-Request") == "true"

# Works with either CSRF approach:
def get_csrf_token(request: Request) -> str:
    # Double-submit: read cookie
    token = request.cookies.get("csrftoken")
    if token:
        return token
    # Session-backed: read from session
    return request.session.get("csrf_token", "")
```

Inject CSRF token into all templates:

```python
# app.py (add after templates = Jinja2Templates(...))
from fastapi import Request

def template_context_processor(request: Request):
    return {
        "csrf_token": request.cookies.get("csrftoken") or request.session.get("csrf_token", "")
    }

templates.env.globals.update(get_csrf_token=lambda request: template_context_processor(request)["csrf_token"])
```

---

# Posts controller (full pages vs fragments)

```python
# views_posts.py
from fastapi import APIRouter, Request, Query
from starlette.responses import HTMLResponse
from starlette.templating import Jinja2Templates
from deps import is_htmx
from typing import List, Dict

templates = Jinja2Templates(directory="templates")
router = APIRouter()

# Fake data layer; replace with SQLAlchemy/SQLModel
POSTS = [
    {
        "slug": "hello-htmx",
        "title": "Hello htmx",
        "published_at": "2025-01-10",
        "reading_time": 3,
        "tags": ["htmx", "fastapi"],
        "html": "<p>Welcome to htmx + FastAPI.</p>",
    },
    # ...
]

def paginate(items, page: int, per_page: int = 10):
    total = len(items)
    pages = max(1, (total + per_page - 1) // per_page)
    start = (page - 1) * per_page
    end = start + per_page
    meta = {
        "page": page,
        "pages": pages,
        "next": page + 1 if page < pages else None,
        "prev": page - 1 if page > 1 else None,
    }
    return items[start:end], meta

def find_post(slug: str):
    return next((p for p in POSTS if p["slug"] == slug), None)

@router.get("/", response_class=HTMLResponse)
def home(request: Request, page: int = Query(1, ge=1)):
    posts, meta = paginate(POSTS, page)
    if is_htmx(request):
        return templates.TemplateResponse(
            "posts/_list.html", {"request": request, "posts": posts, "meta": meta}
        )
    return templates.TemplateResponse(
        "posts/index.html", {"request": request, "posts": posts, "meta": meta}
    )

@router.get("/posts/{slug}", response_class=HTMLResponse)
def show_post(request: Request, slug: str):
    post = find_post(slug)
    if not post:
        return templates.TemplateResponse("404.html", {"request": request}, status_code=404)
    if is_htmx(request):
        return templates.TemplateResponse("posts/_item.html", {"request": request, "post": post})
    return templates.TemplateResponse("posts/show.html", {"request": request, "post": post})
```

---

# Comments controller (POST with CSRF, fragment swap)

```python
# views_comments.py
from fastapi import APIRouter, Request, Form
from starlette.responses import HTMLResponse
from starlette.templating import Jinja2Templates

templates = Jinja2Templates(directory="templates")
router = APIRouter()

# demo store
COMMENTS = {}  # slug -> list[{name, body, created_at}]

@router.post("/posts/{slug}/comments", response_class=HTMLResponse)
async def add_comment(request: Request, slug: str,
                      name: str = Form(...), body: str = Form(...),
                      X_CSRFToken: str = Form(None)):  # <— optional if you also send in header
    # CSRF already validated by middleware.
    COMMENTS.setdefault(slug, []).append({"name": name, "body": body})
    return templates.TemplateResponse(
        "posts/_comments.html", {"request": request, "slug": slug, "comments": COMMENTS.get(slug, [])}
    )
```

---

# Templates (Jinja + htmx wiring)

```html
<!-- templates/base.html -->
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>{% block title %}My Blog{% endblock %}</title>
  <link rel="stylesheet" href="{{ url_for('static', path='/css/site.css') }}">
  <script src="https://unpkg.com/htmx.org@1.9.12" defer></script>
</head>
<body hx-boost="true">
<header>
  <a href="{{ url_for('home') }}">My Blog</a>
  <form action="{{ url_for('home') }}" method="get"
        hx-get="{{ url_for('home') }}" hx-trigger="keyup changed delay:300ms"
        hx-target="#content" hx-push-url="true">
    <input type="search" name="q" placeholder="Search…" autocomplete="off">
  </form>
</header>

<main id="content">
  {% block content %}{% endblock %}
</main>

<div id="flash" aria-live="polite"></div>

<script>
  // Attach CSRF token automatically to htmx requests
  document.addEventListener('htmx:configRequest', (e) => {
    const token = (document.cookie.match(/(?:^|; )csrftoken=([^;]+)/) || [])[1];
    if (token) e.detail.headers['X-CSRFToken'] = decodeURIComponent(token);
  });
</script>
</body>
</html>
```

```html
<!-- templates/posts/index.html -->
{% extends "base.html" %}
{% block title %}My Blog{% endblock %}
{% block content %}
  <div id="post-list">
    {% include "posts/_list.html" %}
  </div>
{% endblock %}
```

```html
<!-- templates/posts/_list.html -->
<ul class="posts">
  {% for post in posts %}
    <li>
      <a href="{{ url_for('show_post', slug=post.slug) }}"
         hx-get="{{ url_for('show_post', slug=post.slug) }}"
         hx-target="#content" hx-push-url="true">
        {{ post.title }}
      </a>
      <small>{{ post.published_at }}</small>
    </li>
  {% endfor %}
</ul>
{% include "posts/_paginator.html" %}
```

```html
<!-- templates/posts/_paginator.html -->
<nav class="pager" aria-label="Pagination"
     hx-boost="true" hx-target="#content" hx-push-url="true">
  {% if meta.prev %}<a href="?page={{ meta.prev }}">← Newer</a>{% endif %}
  <span>Page {{ meta.page }} of {{ meta.pages }}</span>
  {% if meta.next %}<a href="?page={{ meta.next }}">Older →</a>{% endif %}
</nav>
```

```html
<!-- templates/posts/show.html -->
{% extends "base.html" %}
{% block title %}{{ post.title }} - My Blog{% endblock %}
{% block content %}
  {% include "posts/_item.html" %}
  {% include "posts/_comments.html" %}
{% endblock %}
```

```html
<!-- templates/posts/_item.html -->
<article>
  <h1>{{ post.title }}</h1>
  <p class="meta">{{ post.published_at }} · {{ post.reading_time }} min read</p>
  <div class="body">{{ post.html | safe }}</div>
  <p class="tags">
    {% for t in post.tags %}
      <a href="{{ url_for('home') }}?q=tag:{{ t }}"
         hx-get="{{ url_for('home') }}?q=tag:{{ t }}"
         hx-target="#content" hx-push-url="true">#{{ t }}</a>
    {% endfor %}
  </p>
</article>
```

```html
<!-- templates/posts/_comments.html -->
<section id="comments" aria-label="Comments">
  <h2>Comments</h2>
  <div>
    {% for c in comments or [] %}
      <div class="comment">
        <strong>{{ c.name }}</strong>
        <p>{{ c.body }}</p>
      </div>
    {% endfor %}
  </div>
  {% include "posts/_comment_form.html" %}
</section>
```

```html
<!-- templates/posts/_comment_form.html -->
<form hx-post="{{ url_for('add_comment', slug=post.slug if post else slug) }}"
      hx-target="#comments" hx-swap="outerHTML">
  <input type="hidden" name="X-CSRFToken" value="{{ get_csrf_token(request) }}">
  <label>
    Name
    <input name="name" required>
  </label>
  <label>
    Comment
    <textarea name="body" required></textarea>
  </label>
  <button type="submit">Add comment</button>
</form>
```

---

# HTMX patterns in FastAPI

* **Fragment vs full**: branch on `HX-Request` to return a partial (`_list.html`, `_item.html`) or the full page (`index.html`, `show.html`).
* **History/URL**: use `hx-push-url="true"` on links/forms targeting `#content`.
* **Selective swap**: use `hx-select` when your handler returns a larger template but you only want part of it injected.
* **OOB updates**: return a small fragment with `hx-swap-oob="true"` to update non-target regions (e.g., a global flash).

Example “Load more” (server returns `_list.html`; client appends just new `<li>` items):

```html
<button
  hx-get="?page={{ meta.next }}"
  hx-target="#post-list"
  hx-swap="beforeend"
  hx-select=".posts > li"
  hx-indicator="#spinner">Load more</button>
<div id="spinner" class="htmx-indicator">Loading…</div>
```

---

# Validation & errors

Use Pydantic models or simple form checks; on validation failure, return the **form partial** with errors and a `400`:

```python
# inside add_comment
if not name.strip() or not body.strip():
    return templates.TemplateResponse(
        "posts/_comment_form.html",
        {"request": request, "slug": slug, "errors": ["All fields required"]},
        status_code=400,
    )
```

```html
{% if errors %}
  <ul class="errors">
    {% for e in errors %}<li>{{ e }}</li>{% endfor %}
  </ul>
{% endif %}
```

htmx’s `hx-target="#comments" hx-swap="outerHTML"` will replace the whole comments section with either the updated list or the form with errors; no client state machine needed.

---

# Security & prod polish

* **CSRF**: Pick one middleware. If you use reverse proxies or multiple domains, prefer **SameSite=Lax** and `Secure` in prod.
* **CSP**: Add a CSP header; if using inline scripts, inject a nonce into templates.
* **Rate limits**: Protect comment POSTs (e.g., ip/slug window).
* **Caching**: Add `ETag`/`Last-Modified` for post pages and fragments; 304 responses play nicely with htmx.
* **SEO**: Full pages render without JS; keep canonical links and pagination rels (`rel="next"`, `rel="prev"`).
* **A11y**: Manage focus after swaps, expose `aria-live` regions for flash messages.

---

# Testing

* **Unit**: Starlette `TestClient` for handler branches with/without `HX-Request`.
* **E2E**: Playwright: navigate, paginate, post comment, verify DOM swaps + URL updates.

---

# Next steps you might want

* Swap the fake in-memory data for **SQLAlchemy/SQLModel** and a repository layer.
* Add **tags** and a **search** route that returns `_list.html` with filters.
* Add **admin actions** with `hx-delete` and OOB flash updates.
* Optional: **SSE** (`hx-ext="sse"`) to live-update comment counts.

If you want, I can generate a minimal runnable repo (FastAPI + SQLModel + alembic + this htmx wiring + tests). Just say the DB you prefer (SQLite/Postgres) and whether you want double-submit or session CSRF.

