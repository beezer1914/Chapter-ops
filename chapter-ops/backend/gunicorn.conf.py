"""
Gunicorn production config — auto-loaded when gunicorn is invoked from this directory.

Render start command should be `gunicorn wsgi:app` (no extra flags). Gunicorn
will pick this file up automatically as `./gunicorn.conf.py`.
"""

import os

# Worker recycling — kill and replace each worker after handling N requests.
# Defends against memory leaks in the app or its dependencies (a common
# problem in long-running Python processes). Jitter staggers worker recycling
# so the whole pool doesn't hit the recycle threshold at the same moment.
max_requests = int(os.environ.get("GUNICORN_MAX_REQUESTS", "1000"))
max_requests_jitter = int(os.environ.get("GUNICORN_MAX_REQUESTS_JITTER", "50"))
