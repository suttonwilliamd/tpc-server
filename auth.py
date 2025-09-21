import hmac
import hashlib
from fastapi import HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, Dict
import os
import json

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
        credentials: HTTPAuthorizationCredentials = await super().__call__(request)
        
        if not credentials:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing authentication credentials"
            )
        
        # Extract agent ID and signature from credentials
        try:
            agent_id, signature = credentials.credentials.split(':', 1)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credential format. Expected 'agent_id:signature'"
            )
        
        # Verify agent exists
        if agent_id not in self.agent_secrets:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unknown agent ID"
            )
        
        # Verify signature
        secret_key = self.agent_secrets[agent_id]
        if not await self._verify_signature(request, agent_id, signature, secret_key):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid signature"
            )
        
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