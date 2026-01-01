from fastapi import UploadFile
from pydantic import BaseModel, Field

# Using separate file to avoid circular imports if any
class JobSubmitRequest(BaseModel):
    user_id: str = Field(..., description="ID of the user submitting the job")
    # For file uploads, we usually rely on Form data, but if metadata is needed:
    script_filename: str = Field(..., description="Name of the main script file")
