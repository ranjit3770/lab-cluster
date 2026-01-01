from fastapi import HTTPException, status

class JobExecutionError(Exception):
    """Base exception for Job Execution API"""
    pass

class ResourceQuotaExceededError(JobExecutionError):
    def __init__(self, message: str):
        self.message = message
        super().__init__(self.message)

class JobNotFoundError(JobExecutionError):
    def __init__(self, job_id: str):
        self.message = f"Job {job_id} not found."
        super().__init__(self.message)

class InvalidJobStateError(JobExecutionError):
    """Raised when an action is invalid for the current job state"""
    def __init__(self, current_status: str, action: str):
        self.message = f"Cannot perform '{action}' on job in state '{current_status}'"
        super().__init__(self.message)

class ConfigurationError(JobExecutionError):
    """Raised when system configuration is missing or invalid"""
    pass
