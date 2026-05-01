from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from database import supabase

security = HTTPBearer()


def get_current_user( credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Valida el JWT de Supabase y retorna los datos del usuario.
    Supabase verifica la firma, expiración y todo lo demás.
    """
    token = credentials.credentials
    try:
        response = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not response.user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No se pudo autenticar al usuario",
        )

    return response.user


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