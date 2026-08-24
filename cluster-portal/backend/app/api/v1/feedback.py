from typing import Any
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from app.api import deps
from app.models.user import User
from app.schemas.feedback import FeedbackCreate, FeedbackResponse
from app.core.config import settings
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

router = APIRouter()

def send_feedback_email(feedback: FeedbackCreate, user_email: str, username: str, full_name: str = "Unknown Researcher"):
    if not settings.SMTP_HOST or not settings.SMTP_USER:
        print("SMTP settings not configured, skipping email.")
        return

    msg = MIMEMultipart('alternative')
    msg['From'] = f"{settings.EMAILS_FROM_NAME} <{settings.EMAILS_FROM_EMAIL}>"
    msg['To'] = settings.ADMIN_EMAIL
    msg['Reply-To'] = user_email
    msg['Subject'] = f"🚀 [{feedback.type.upper()}] {feedback.subject}"

    # Plain Text Version
    text_body = f"""
    STRATCH PORTAL - NEW FEEDBACK SIGNAL
    ------------------------------------
    User: {full_name} (@{username})
    Email: {user_email}
    Type: {feedback.type.upper()}
    Category: {feedback.category}
    Subject: {feedback.subject}

    DESCRIBE:
    {feedback.message}
    """

    # Modern HTML Version (Inspired by Google Security Alert Theme + Terminal Style)
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            .email-bg {{ background-color: white; padding: 40px 20px; font-family: 'Google Sans', Roboto, Arial, sans-serif; }}
            .container {{ max-width: 520px; margin: 0 auto; border: 1px solid #dadce0; border-radius: 8px; padding: 40px; text-align: center; }}
            .logo {{ font-size: 24px; font-weight: 500; color: #5f6368; margin-bottom: 30px; letter-spacing: -0.5px; }}
            .logo span {{ color: #4285f4; }}
            .title {{ font-size: 28px; line-height: 1.3; font-weight: 400; color: #202124; margin-bottom: 24px; }}
            
            /* User Info Table Styling */
            .user-info-table {{ margin: 0 auto 32px; border-collapse: collapse; }}
            .avatar {{ width: 32px; height: 32px; background-color: #7b1fa2; border-radius: 50%; color: white; text-align: center; line-height: 32px; font-weight: 500; font-size: 16px; display: block; }}
            .user-details {{ text-align: left; padding-left: 12px; }}
            .user-name {{ color: #202124; font-size: 15px; font-weight: 700; line-height: 1.2; }}
            .user-email {{ color: #70757a; font-size: 12px; font-weight: 400; line-height: 1.2; }}
            
            .divider {{ height: 1px; background-color: #dadce0; margin: 32px 0; width: 100%; }}
            .meta-block {{ text-align: left; margin-bottom: 24px; padding: 16px; background: #f8fafc; border-radius: 8px; }}
            .meta-label {{ font-size: 11px; text-transform: uppercase; color: #70757a; font-weight: 700; letter-spacing: 0.8px; margin-bottom: 4px; }}
            .meta-val {{ font-size: 14px; color: #202124; font-weight: 500; margin-bottom: 12px; }}
            .log-terminal {{ background-color: #0f172a; border-radius: 12px; padding: 20px; text-align: left; margin-top: 10px; border: 1px solid #1e293b; overflow: hidden; }}
            .log-header {{ margin-bottom: 12px; }}
            .dot {{ width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 4px; }}
            .log-content {{ font-family: 'IBM Plex Mono', 'Menlo', 'Monaco', 'Courier New', monospace; font-size: 13px; line-height: 1.6; color: #e2e8f0; margin: 0; white-space: pre-wrap; }}
        </style>
    </head>
    <body style="margin:0;padding:0;">
        <div class="email-bg">
            <div class="container">
                <div class="logo">Stratch<span>Portal</span></div>
                
                <h1 class="title">New feedback regarding {feedback.subject}</h1>
                
                <!-- Identity Module using Table for perfect alignment -->
                <table class="user-info-table">
                    <tr>
                        <td style="vertical-align: middle;">
                            <div class="avatar">{full_name[0].upper()}</div>
                        </td>
                        <td class="user-details" style="vertical-align: middle;">
                            <span class="user-name">{full_name}</span>
                            <span class="user-email">{user_email} • @{username}</span>
                        </td>
                    </tr>
                </table>

                <div class="divider"></div>

                <div class="meta-block">
                    <div class="meta-label">Technical Classification</div>
                    <div class="meta-val">{feedback.type.upper()} • {feedback.category}</div>
                    
                    <div class="meta-label">Describe (Researcher Logs)</div>
                    <div class="log-terminal">
                        <div class="log-header">
                            <span class="dot" style="background-color: #f87171;"></span>
                            <span class="dot" style="background-color: #fbbf24;"></span>
                            <span class="dot" style="background-color: #4ade80;"></span>
                        </div>
                        <pre class="log-content">{feedback.message}</pre>
                    </div>
                </div>
            </div>
        </div>
    </body>
    </html>
    """

    msg.attach(MIMEText(text_body, 'plain', 'utf-8'))
    msg.attach(MIMEText(html_body, 'html', 'utf-8'))

    try:
        print(f"Connecting to SMTP Host: {settings.SMTP_HOST}:{settings.SMTP_PORT}...")
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
            # server.set_debuglevel(1) # Uncomment for full protocol logging
            if settings.SMTP_TLS:
                print("Initiating STARTTLS...")
                server.starttls()
            
            print(f"Authenticating as {settings.SMTP_USER}...")
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            
            print(f"Relaying feedback signal to {settings.ADMIN_EMAIL}...")
            server.send_message(msg)
            print("Feedback email dispatched successfully and accepted by relay.")
    except smtplib.SMTPException as e:
        print(f"SMTP Error encountered during dispatch: {e}")
    except Exception as e:
        print(f"Critical failure in feedback telemetry engine: {e}")

@router.post("/", response_model=FeedbackResponse)
def submit_feedback(
    *,
    feedback: FeedbackCreate,
    current_user: User = Depends(deps.get_current_active_user),
    background_tasks: BackgroundTasks
) -> Any:
    """
    Submit user feedback and dispatch email notification.
    """
    # In a real app, you might also save this to a DB table
    # For now, we fulfill the requirement of sending an email via FastAPI
    
    background_tasks.add_task(
        send_feedback_email, 
        feedback, 
        current_user.email, 
        current_user.username,
        current_user.full_name
    )
    
    return {
        "status": "success",
        "message": "Feedback signal transmitted successfully to the administrative layer."
    }
