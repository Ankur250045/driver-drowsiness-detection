"""Smartwatch vibration through phone notifications (ntfy).

Most smartwatches and fitness bands (Wear OS, Galaxy Watch, Apple Watch, Mi Band,
Amazfit, Noise, boAt, ...) vibrate whenever the paired phone shows a notification.
So instead of talking to each watch brand's private API, the server publishes an
*urgent* notification to the driver's private topic on ntfy (https://ntfy.sh, free,
no account needed). The ntfy app on the phone shows it and the watch mirrors it.

Setup for the driver: install the ntfy app, subscribe to the topic shown on the
Profile page, and allow ntfy notifications in the watch's companion app.
"""

import logging
from dataclasses import dataclass

import httpx

from app.utils.config import Settings

log = logging.getLogger(__name__)


@dataclass
class WatchResult:
    status: str  # "sent" | "failed" | "not_configured"
    message: str


class WatchNotifier:
    def __init__(self, settings: Settings, client: httpx.Client | None = None):
        self.server = settings.ntfy_server.rstrip("/")
        self.client = client or httpx.Client(timeout=8)

    def send(self, topic: str | None, reason: str, test: bool = False) -> WatchResult:
        if not topic:
            return WatchResult("not_configured", "No watch topic set on the profile page.")
        title = "Test alert" if test else "DRIVER SLEEPY - Stop and hydrate"
        try:
            res = self.client.post(
                f"{self.server}/{topic}",
                content=reason.encode("utf-8"),
                headers={
                    "Title": title,
                    # 5 = max/urgent: long vibration bursts, shown even in Do-Not-Disturb if allowed
                    "Priority": "3" if test else "5",
                    "Tags": "warning,rotating_light",
                },
            )
            res.raise_for_status()
        except httpx.HTTPError as e:
            log.warning("ntfy publish failed: %s", e)
            return WatchResult("failed", f"Could not reach the notification server: {e}")
        return WatchResult("sent", f"Notification sent to topic '{topic}'.")
