"""
Flask extension instances.

Initialized here, configured in the app factory (create_app).
"""

from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from flask_login import LoginManager
from flask_caching import Cache
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_cors import CORS
from flask_wtf.csrf import CSRFProtect
from flask_migrate import Migrate
from flask_compress import Compress

db = SQLAlchemy()
bcrypt = Bcrypt()
login_manager = LoginManager()
cache = Cache()
limiter = Limiter(key_func=get_remote_address, default_limits=["200 per minute"])
cors = CORS()
csrf = CSRFProtect()
migrate = Migrate()
compress = Compress()
