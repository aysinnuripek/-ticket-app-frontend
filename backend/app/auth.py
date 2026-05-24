import os
import requests
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User

security = HTTPBearer()

COGNITO_USER_POOL_ID = os.environ.get("COGNITO_USER_POOL_ID")
COGNITO_REGION = os.environ.get("COGNITO_REGION", "eu-central-1")
COGNITO_APP_CLIENT_ID = os.environ.get("COGNITO_APP_CLIENT_ID")

JWKS_URL = (
    f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}/.well-known/jwks.json"
    if COGNITO_USER_POOL_ID
    else None
)

# Local cache for JWKS keys
_cached_jwks = None


def get_jwks():
    global _cached_jwks
    if _cached_jwks is None and JWKS_URL:
        try:
            resp = requests.get(JWKS_URL, timeout=5)
            if resp.status_code == 200:
                _cached_jwks = resp.json()
        except Exception as e:
            print(f"[auth] Failed to fetch JWKS keys: {e}")
    return _cached_jwks


def verify_cognito_token(token: str) -> dict:
    jwks = get_jwks()
    if not jwks:
        raise HTTPException(status_code=500, detail="Cognito JWKS keys not available")

    # Get header of JWT to find the key ID (kid)
    try:
        headers = jwt.get_unverified_header(token)
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid token headers")

    kid = headers.get("kid")
    # Find matching public key in JWKS
    key = None
    for k in jwks.get("keys", []):
        if k.get("kid") == kid:
            key = k
            break

    if not key:
        raise HTTPException(status_code=401, detail="JWK not found for key ID")

    # Decode and verify the JWT token
    try:
        payload = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=COGNITO_APP_CLIENT_ID,
            options={"verify_at_hash": False},
        )
        return payload
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Token verification failed: {e}")


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security),
    db: Session = Depends(get_db),
) -> User:
    token = credentials.credentials

    # Support local mock tokens for E2E tests and easy testing
    if (
        not COGNITO_USER_POOL_ID
        or token == "temporary-demo-token"
        or token.startswith("test-token-")
        or token == "mock-token"
    ):
        # Default mock user (set to organizer for ease of local testing with cached tokens)
        email = "organizer@example.com"
        full_name = "Organizer Demo"
        role = "organizer"
        sub = "mock-sub-organizer"

        if token.startswith("test-token-"):
            # Format: test-token-email-role
            parts = token.split("-")
            if len(parts) >= 3:
                email = parts[2]
            if len(parts) >= 4:
                role = parts[3]
            full_name = email.split("@")[0].capitalize()
            sub = f"mock-sub-{email}"
        elif token == "mock-token":
            # Support basic test runner token
            email = "e2e@example.com"
            full_name = "E2E Tester"
            role = "customer"
            sub = "mock-sub-e2e"

        # Find or create user in database
        user = db.query(User).filter(User.email == email).first()
        if not user:
            user = User(cognito_sub=sub, email=email, full_name=full_name, role=role)
            db.add(user)
            db.commit()
            db.refresh(user)
        return user

    # Otherwise, validate with real Cognito
    payload = verify_cognito_token(token)
    sub = payload.get("sub")
    email = payload.get("email") or payload.get("username")
    full_name = payload.get("name", email.split("@")[0] if email else "User")

    if not sub:
        raise HTTPException(status_code=401, detail="Token payload missing sub claim")

    user = db.query(User).filter(User.cognito_sub == sub).first()
    if not user:
        # Check if user already exists by email
        if email:
            user = db.query(User).filter(User.email == email).first()
            if user:
                user.cognito_sub = sub
                db.commit()
                db.refresh(user)
                return user

        user = User(
            cognito_sub=sub,
            email=email or f"user_{sub}@example.com",
            full_name=full_name,
            role="customer",
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    return user


def require_role(roles: list[str]):
    def dependency(current_user: User = Depends(get_current_user)):
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to access this resource",
            )
        return current_user

    return dependency
