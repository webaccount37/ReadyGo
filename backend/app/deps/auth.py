"""
Authentication dependencies for protecting routes.
DEPRECATED: Use app.api.v1.middleware.require_authentication instead.
This file is kept for backward compatibility but will be removed in future versions.
"""

from app.api.v1.middleware import require_authentication

# Re-export the centralized authentication dependency
get_current_employee = require_authentication

# Removed get_current_employee_optional - authentication is now mandatory everywhere
