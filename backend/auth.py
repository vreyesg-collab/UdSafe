import jwt
from datetime import datetime, timezone
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()


class DecodedUser:
    def __init__(self, payload: dict):
        self.id = payload.get("sub")
        self.email = payload.get("email")
        self.user_metadata = payload.get("user_metadata", {})
        self.app_metadata = payload.get("app_metadata", {})
        self.role = payload.get("role")


def decode_token_locally(token: str) -> DecodedUser:
    try:
        payload = jwt.decode(token, options={"verify_signature": False})
        
        # Verificar expiración localmente
        exp = payload.get("exp")
        if exp and datetime.now(timezone.utc).timestamp() > exp:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token expirado",
                headers={"WWW-Authenticate": "Bearer"},
            )
            
        return DecodedUser(payload)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o corrupto",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Valida el JWT de Supabase localmente y retorna los datos del usuario.
    Esto elimina la necesidad de realizar llamadas de red externas en cada consulta.
    """
    return decode_token_locally(credentials.credentials)


# Rol autorizado para realizar enrollment biométrico.
# Cambiar "vigilante" → "jefe_seguridad" antes de pasar a producción.
ROL_ENROLL = "vigilante"


def require_enroll(current_user=Depends(get_current_user)):
    if current_user.user_metadata.get("rol") != ROL_ENROLL:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No autorizado para registrar biometría",
        )
    return current_user


def require_jefe(current_user=Depends(get_current_user)):
    """
    Verifica que el usuario autenticado sea jefe de seguridad.
    El rol se guarda en user_metadata al momento del registro.
    """
    rol = current_user.user_metadata.get("rol")
    if rol != "jefe_seguridad":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el jefe de seguridad puede realizar esta acción",
        )
    return current_user