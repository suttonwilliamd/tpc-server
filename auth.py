import hmac
import hashlib
from fastapi import HTTPException, Request, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, Dict
import os
import json
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import select
import logging
logger = logging.getLogger("tpc-server")

class SignatureAuth(HTTPBearer):
    """Signature-based authentication for AI agents"""
    
    def __init__(self):
        super().__init__()
        # Load agent secrets from environment or use default
        self.agent_secrets = self._load_agent_secrets()
    
    def _load_agent_secrets(self) -> Dict[str, str]:
        """Load agent secrets from environment variables"""
        secrets = {}
        # Look for AGENT_SECRET_* environment variables
        for key, value in os.environ.items():
            if key.startswith("AGENT_SECRET_"):
                agent_id = key[len("AGENT_SECRET_"):].lower()
                secrets[agent_id] = value
        return secrets
    
    async def __call__(self, request: Request) -> Optional[str]:
        """Verify request signature"""
        logger.info(f"Signature auth attempt for {request.method} {request.url.path}")
        credentials: HTTPAuthorizationCredentials = await super().__call__(request)
        
        if not credentials:
            logger.warning("Missing authentication credentials in signature auth")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing authentication credentials"
            )
        
        # Extract agent ID and signature from credentials
        try:
            agent_id, signature = credentials.credentials.split(':', 1)
            logger.info(f"Extracted agent_id: {agent_id}")
        except ValueError:
            logger.error(f"Invalid credential format: {credentials.credentials}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credential format. Expected 'agent_id:signature'"
            )
        
        # Verify agent exists
        if agent_id not in self.agent_secrets:
            logger.error(f"Unknown agent ID: {agent_id}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unknown agent ID"
            )
        
        # Verify signature
        secret_key = self.agent_secrets[agent_id]
        if not await self._verify_signature(request, agent_id, signature, secret_key):
            logger.error(f"Invalid signature for agent {agent_id}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid signature"
            )
        
        logger.info(f"Signature auth successful for agent: {agent_id}")
        return agent_id
    
    async def _verify_signature(self, request: Request, agent_id: str, signature: str, secret_key: str) -> bool:
        """Verify HMAC signature of the request"""
        # Get request method and path
        method = request.method
        path = request.url.path
        
        # Get request body if present
        body = b""
        if request.method in ["POST", "PUT", "PATCH"]:
            try:
                body = await request.body()
            except:
                body = b""
        
        # Create signature payload
        payload = f"{method}{path}{body.decode()}".encode()
        
        # Calculate expected signature
        expected_signature = hmac.new(
            secret_key.encode(),
            payload,
            hashlib.sha256
        ).hexdigest()
        
        return hmac.compare_digest(signature, expected_signature)

# Create auth instance
auth = SignatureAuth()

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT settings
SECRET_KEY = os.getenv("SECRET_KEY", "your-super-secret-key-that-should-be-changed-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

# Utility function to verify signatures for MCP tools
def verify_mcp_signature(agent_signature: str, content: str, agent_id: str) -> bool:
    """Verify signature for MCP tool operations"""
    # In a real implementation, you'd look up the agent's secret
    # For MVP, we'll use a simple approach - check if signature matches a pattern
    # This should be enhanced with proper secret management
    expected_pattern = f"{agent_id}:signature"
    return agent_signature.startswith(expected_pattern)

# Middleware for FastAPI authentication
async def authentication_middleware(request: Request, call_next):
    """Middleware to authenticate requests"""
    # Skip auth for GET requests and health checks
    if request.method == "GET" or request.url.path in ["/api/health", "/", "/thoughts", "/plans", "/changes"]:
        return await call_next(request)
    
    try:
        # Verify authentication
        agent_id = await auth(request)
        # Add agent ID to request state for use in endpoints
        request.state.agent_id = agent_id
    except HTTPException as e:
        return JSONResponse(
            status_code=e.status_code,
            content={"detail": e.detail}
        )
    
    return await call_next(request)

# Auth utils for JWT and API keys
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def create_refresh_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=7)
    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(token: str):
    logger.info(f"Verifying JWT token (length: {len(token)})")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        logger.info(f"JWT verified successfully, sub: {payload.get('sub') if payload else 'None'}")
        return payload
    except JWTError as e:
        logger.error(f"JWT decode failed: {str(e)} (token starts with: {token[:20]}...)")
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_db():
    from main import AsyncSessionLocal
    db = AsyncSessionLocal()
    try:
        yield db
    finally:
        await db.close()

async def get_user(db, username: str):
    from main import User
    from sqlalchemy import select
    result = await db.execute(select(User).where(User.username == username))
    return result.scalars().first()

async def authenticate_user(db, username: str, password: str):
    user = await get_user(db, username)
    if not user:
        return False
    if not verify_password(password, user.password_hash):
        return False
    return user

async def get_current_user(token: str = Depends(oauth2_scheme), db = Depends(get_db)):
    logger.info(f"Getting current user from token (length: {len(token)})")
    from main import User
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            logger.error("JWT payload missing 'sub' claim")
            raise credentials_exception
        token_data = TokenData(username=username)
        logger.info(f"Token payload valid, username: {username}")
    except JWTError as e:
        logger.error(f"JWT error in get_current_user: {str(e)}")
        raise credentials_exception
    user = await get_user(db, username=token_data.username)
    if user is None:
        logger.warning(f"User not found for username: {token_data.username}")
        raise credentials_exception
    logger.info(f"Current user retrieved: {user.username}, role: {user.role}")
    return user


def verify_jwt_and_role(required_roles: str = "user"):
    """Dependency to verify JWT and role permissions"""
    async def _verify(current_user = Depends(get_current_user)):
        allowed_roles = required_roles.split('|')
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions"
            )
        return current_user
    return _verify

async def validate_api_key(request: Request):
    logger.info(f"Validating API key for {request.method} {request.url.path}")
    from main import ApiKey, AsyncSessionLocal, User
    from sqlalchemy import select
    api_key_plain = request.headers.get("X-API-Key")
    if not api_key_plain:
        logger.warning("Missing X-API-Key header")
        raise HTTPException(status_code=401, detail="Missing API key")
    logger.info(f"API key provided (length: {len(api_key_plain)})")
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(ApiKey).where(ApiKey.revoked_at.is_(None)))
        for api_key_obj in result.scalars().all():
            if pwd_context.verify(api_key_plain, api_key_obj.key_hash):
                user = await db.get(User, api_key_obj.user_id)
                if user:
                    logger.info(f"API key validated for user: {user.username}, role: {api_key_obj.role}")
                    return user
        logger.error("Invalid API key provided")
        raise HTTPException(status_code=401, detail="Invalid API key")

async def get_current_user_hybrid(request: Request, db = Depends(get_db)):
    """Hybrid authentication: try signature first, then API key, then JWT"""
    logger.info(f"Hybrid auth attempt for {request.method} {request.url.path} from {request.client.host if request.client else 'unknown'}")
    
    # Check for signature auth (agent_id set by middleware)
    if hasattr(request.state, 'agent_id') and request.state.agent_id:
        logger.info(f"Hybrid auth successful via signature for agent: {request.state.agent_id}")
        # Create a mock user for agent
        class AgentUser:
            def __init__(self, agent_id):
                self.username = agent_id
                self.role = "agent"
                self.id = agent_id
        return AgentUser(request.state.agent_id)
    
    # For public paths, allow anonymous access
    public_paths = ["/", "/thoughts", "/plans", "/changes", "/api/health", "/api-keys"]
    if request.url.path in public_paths and request.method == "GET":
        logger.info(f"Public path detected, returning guest user for {request.url.path}")
        # Create a guest user object for public access
        class GuestUser:
            def __init__(self):
                self.username = "guest"
                self.role = "guest"
                self.id = "guest"
        return GuestUser()

    # Try API key first
    try:
        user = await validate_api_key(request)
        logger.info(f"Hybrid auth successful via API key for user: {user.username}")
        return user
    except HTTPException as e:
        logger.info(f"API key auth failed: {e.detail}")

    # Try JWT
    try:
        token = request.headers.get("Authorization")
        if token and token.startswith("Bearer "):
            token = token[7:]
            user = await get_current_user(token, db)
            logger.info(f"Hybrid auth successful via JWT for user: {user.username}")
            return user
        else:
            raise HTTPException(status_code=401, detail="Invalid token format")
    except HTTPException as e:
        logger.info(f"JWT auth failed: {e.detail}")
        # Try cookie fallback for web routes
        cookie_token = request.cookies.get("access_token")
        if cookie_token:
            try:
                user = await get_current_user(token=cookie_token, db=db)
                logger.info(f"Hybrid auth successful via cookie for user: {user.username}")
                return user
            except HTTPException as cookie_e:
                logger.info(f"Cookie auth failed: {cookie_e.detail}")
        raise HTTPException(status_code=401, detail="Authentication failed")

def verify_hybrid_and_role(required_roles: str = "user"):
    """Dependency to verify hybrid auth and role permissions"""
    async def _verify(request: Request, db = Depends(get_db)):
        user = await get_current_user_hybrid(request, db)
        allowed_roles = required_roles.split('|')
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions"
            )
        return user
    return _verify