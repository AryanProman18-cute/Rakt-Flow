from dataclasses import dataclass
from html import escape
from uuid import UUID

import httpx

from app.core.config import Settings


@dataclass(frozen=True, slots=True)
class EmailDelivery:
    status: str
    provider_id: str | None = None
    development_link: str | None = None


async def _send_email(*, recipient: str, subject: str, html: str, settings: Settings) -> EmailDelivery:
    if not settings.resend_api_key:
        return EmailDelivery(status="EMAIL_PROVIDER_NOT_CONFIGURED")
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json={
                "from": settings.email_from,
                "to": [recipient],
                "subject": subject,
                "html": html,
            },
        )
        response.raise_for_status()
        payload = response.json()
    return EmailDelivery(status="SENT", provider_id=payload.get("id"))


def _frame(title: str, body: str) -> str:
    return f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:auto;color:#0f172a;line-height:1.55">
      <div style="font-weight:850;font-size:23px;color:#e11d48">RaktFlow</div>
      <h1 style="font-size:24px;margin:20px 0 10px">{escape(title)}</h1>
      {body}
      <hr style="border:0;border-top:1px solid #e2e8f0;margin:26px 0">
      <p style="font-size:12px;color:#64748b">RaktFlow coordinates verified donation logistics. Eligibility, compatibility, collection and transfusion decisions remain with qualified clinical professionals.</p>
    </div>
    """


async def send_role_invitation(
    *, email: str, roles: list[str], invitation_id: UUID, settings: Settings
) -> EmailDelivery:
    link = f"{settings.public_app_url.rstrip('/')}?invite={invitation_id}"
    role_names = ", ".join(role.replace("ROLE_", "").replace("_", " ").title() for role in roles)
    body = f"""
      <p>An administrator invited <strong>{escape(email)}</strong> to the following workspace access:</p>
      <p style="padding:12px 14px;border-radius:10px;background:#fff1f2;color:#9f1239"><strong>{escape(role_names)}</strong></p>
      <p><a href="{escape(link)}" style="display:inline-block;background:#e11d48;color:white;text-decoration:none;padding:13px 18px;border-radius:10px;font-weight:750">Open RaktFlow invitation</a></p>
      <p style="font-size:12px;color:#64748b">Create an account or sign in using this exact email. Access is applied only after Firebase verifies the email and the RaktFlow API confirms the pending invitation. Forwarding this link does not transfer access.</p>
    """
    delivery = await _send_email(
        recipient=email,
        subject="Your RaktFlow workspace invitation",
        html=_frame("You have been invited", body),
        settings=settings,
    )
    if delivery.status != "SENT" and settings.app_env != "production":
        return EmailDelivery(status=delivery.status, development_link=link)
    return delivery


async def send_hospital_application_notification(
    *, application_id: UUID, facility_name: str, applicant_email: str, settings: Settings
) -> EmailDelivery:
    link = f"{settings.public_app_url.rstrip('/')}?workspace=admin&view=hospitals"
    body = f"""
      <p>A new hospital or blood-bank application is ready for Super Admin review.</p>
      <ul><li><strong>Facility:</strong> {escape(facility_name)}</li><li><strong>Applicant:</strong> {escape(applicant_email)}</li><li><strong>Reference:</strong> {escape(str(application_id))}</li></ul>
      <p><a href="{escape(link)}" style="display:inline-block;background:#e11d48;color:white;text-decoration:none;padding:13px 18px;border-radius:10px;font-weight:750">Review in Super Admin</a></p>
      <p style="font-size:12px;color:#64748b">No clinical document or patient information is included in this email. Make the decision only inside the authenticated dashboard.</p>
    """
    return await _send_email(
        recipient=settings.admin_notification_email,
        subject=f"RaktFlow facility application: {facility_name}",
        html=_frame("New facility application", body),
        settings=settings,
    )


async def send_campaign_share(
    *, recipient: str, campaign_title: str, drive_summary: str, link: str,
    personal_message: str, settings: Settings,
) -> EmailDelivery:
    message_html = f"<p>{escape(personal_message)}</p>" if personal_message.strip() else ""
    body = f"""
      {message_html}
      <p>You are invited to register for <strong>{escape(campaign_title)}</strong>.</p>
      <p style="padding:12px 14px;border-radius:10px;background:#f8fafc">{escape(drive_summary)}</p>
      <p><a href="{escape(link)}" style="display:inline-block;background:#e11d48;color:white;text-decoration:none;padding:13px 18px;border-radius:10px;font-weight:750">View drive and register</a></p>
      <p style="font-size:12px;color:#64748b">Registration requires a verified RaktFlow account. A registration does not establish medical eligibility.</p>
    """
    return await _send_email(
        recipient=recipient,
        subject=f"Blood drive invitation: {campaign_title}",
        html=_frame("Join a verified blood drive", body),
        settings=settings,
    )
